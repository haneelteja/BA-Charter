"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { EMPTY_CONTENT, type FlowDiagramContent, type FlowDiagramEdge, type FlowDiagramNode } from "./types";

type Supa = Awaited<ReturnType<typeof getSupabaseServerClient>>;

async function requireUser(supabase: Supa) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

export async function createBlankDiagram(projectId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || "Untitled diagram";
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: diagram, error } = await supabase
    .from("flow_diagram")
    .insert({ project_id: projectId, title, created_by: user.id, content: EMPTY_CONTENT })
    .select("diagram_id")
    .single();
  if (error) {
    throw new Error(`Failed to create diagram: ${error.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Created",
    targetObjectType: "FlowDiagram",
    targetObjectId: diagram.diagram_id,
    newValue: { title, seeded: false },
  });

  redirect(`/projects/${projectId}/flow/${diagram.diagram_id}`);
}

const EPIC_COLUMN_X = 80;
const LINKED_COLUMN_X = 460;
const ROW_HEIGHT = 140;
const ROW_START_Y = 80;

/**
 * "Seed from project data": one rectangle per Epic, one circle per Decision
 * or square per Knowledge node it's trace_link-connected to, laid out as a
 * simple two-column grid (epics left, linked objects right) with an edge per
 * trace_link labeled by its link_type. Not a generic graph-layout engine —
 * just enough structure to give the user a real starting point they then
 * rearrange and extend freely on the canvas.
 */
export async function createSeededDiagram(projectId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || "Untitled diagram";
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: epics, error: epicsError } = await supabase
    .from("epic")
    .select("epic_id, title")
    .eq("project_id", projectId);
  if (epicsError) {
    throw new Error(`Failed to load epics: ${epicsError.message}`);
  }

  const nodes: FlowDiagramNode[] = [];
  const edges: FlowDiagramEdge[] = [];
  const epicIds = (epics ?? []).map((e) => e.epic_id);

  (epics ?? []).forEach((epic, i) => {
    nodes.push({
      id: `epic-${epic.epic_id}`,
      type: "shape",
      position: { x: EPIC_COLUMN_X, y: ROW_START_Y + i * ROW_HEIGHT },
      data: { shape: "rectangle", label: epic.title },
    });
  });

  if (epicIds.length > 0) {
    const { data: traceLinks, error: traceLinksError } = await supabase
      .from("trace_link")
      .select("trace_link_id, from_object_type, from_object_id, to_object_type, to_object_id, link_type")
      .eq("project_id", projectId);
    if (traceLinksError) {
      throw new Error(`Failed to load trace links: ${traceLinksError.message}`);
    }

    const epicIdSet = new Set(epicIds);
    const relevantLinks = (traceLinks ?? []).filter(
      (l) =>
        (l.from_object_type === "Epic" && epicIdSet.has(l.from_object_id)) ||
        (l.to_object_type === "Epic" && epicIdSet.has(l.to_object_id))
    );

    const decisionIds = new Set<string>();
    const knowledgeNodeIds = new Set<string>();
    for (const link of relevantLinks) {
      const [otherType, otherId] =
        link.from_object_type === "Epic" ? [link.to_object_type, link.to_object_id] : [link.from_object_type, link.from_object_id];
      if (otherType === "Decision") decisionIds.add(otherId);
      else if (otherType === "KnowledgeNode") knowledgeNodeIds.add(otherId);
    }

    const [{ data: decisions }, { data: knowledgeNodes }] = await Promise.all([
      decisionIds.size > 0
        ? supabase.from("decision").select("decision_id, statement").in("decision_id", [...decisionIds])
        : Promise.resolve({ data: [] }),
      knowledgeNodeIds.size > 0
        ? supabase.from("knowledge_node").select("knowledge_node_id, title").in("knowledge_node_id", [...knowledgeNodeIds])
        : Promise.resolve({ data: [] }),
    ]);

    const linkedNodeIdByObjectId = new Map<string, string>();
    let linkedRow = 0;
    for (const decision of decisions ?? []) {
      const nodeId = `decision-${decision.decision_id}`;
      linkedNodeIdByObjectId.set(decision.decision_id, nodeId);
      nodes.push({
        id: nodeId,
        type: "shape",
        position: { x: LINKED_COLUMN_X, y: ROW_START_Y + linkedRow * ROW_HEIGHT },
        data: { shape: "circle", label: decision.statement.slice(0, 120) },
      });
      linkedRow += 1;
    }
    for (const node of knowledgeNodes ?? []) {
      const nodeId = `knowledge-${node.knowledge_node_id}`;
      linkedNodeIdByObjectId.set(node.knowledge_node_id, nodeId);
      nodes.push({
        id: nodeId,
        type: "shape",
        position: { x: LINKED_COLUMN_X, y: ROW_START_Y + linkedRow * ROW_HEIGHT },
        data: { shape: "square", label: node.title },
      });
      linkedRow += 1;
    }

    for (const link of relevantLinks) {
      const epicId = link.from_object_type === "Epic" ? link.from_object_id : link.to_object_id;
      const otherId = link.from_object_type === "Epic" ? link.to_object_id : link.from_object_id;
      const linkedNodeId = linkedNodeIdByObjectId.get(otherId);
      if (!linkedNodeId) continue;

      edges.push({
        id: `trace-${link.trace_link_id}`,
        source: `epic-${epicId}`,
        target: linkedNodeId,
        label: link.link_type,
        data: { lineStyle: "solid", startArrow: false, endArrow: true },
      });
    }
  }

  const content: FlowDiagramContent = { nodes, edges };

  const { data: diagram, error } = await supabase
    .from("flow_diagram")
    .insert({ project_id: projectId, title, created_by: user.id, content })
    .select("diagram_id")
    .single();
  if (error) {
    throw new Error(`Failed to create diagram: ${error.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Created",
    targetObjectType: "FlowDiagram",
    targetObjectId: diagram.diagram_id,
    newValue: { title, seeded: true, node_count: nodes.length, edge_count: edges.length },
  });

  redirect(`/projects/${projectId}/flow/${diagram.diagram_id}`);
}

export interface SaveDiagramResult {
  ok: boolean;
  error?: string;
}

export async function saveDiagram(
  projectId: string,
  diagramId: string,
  title: string,
  content: FlowDiagramContent
): Promise<SaveDiagramResult> {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, error: "Not signed in." };
  }

  const { error } = await supabase
    .from("flow_diagram")
    .update({ title: title.trim() || "Untitled diagram", content, updated_at: new Date().toISOString() })
    .eq("diagram_id", diagramId);
  if (error) {
    return { ok: false, error: error.message };
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: auth.user.id,
    eventType: "Updated",
    targetObjectType: "FlowDiagram",
    targetObjectId: diagramId,
    newValue: { title, node_count: content.nodes.length, edge_count: content.edges.length },
  });

  return { ok: true };
}

export async function deleteDiagram(projectId: string, diagramId: string) {
  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { error } = await supabase.from("flow_diagram").delete().eq("diagram_id", diagramId);
  if (error) {
    throw new Error(`Failed to delete diagram: ${error.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Deleted",
    targetObjectType: "FlowDiagram",
    targetObjectId: diagramId,
    newValue: {},
  });

  revalidatePath(`/projects/${projectId}/flow`);
}

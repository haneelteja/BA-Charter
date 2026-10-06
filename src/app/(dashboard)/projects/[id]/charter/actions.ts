"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";
import { getProjectRole, isLead } from "@/lib/projects/role";
import { enqueueEmbedding } from "@/lib/ai/embeddingTrigger";

const LAYERS = ["SystemOverview", "FunctionalArea", "CapabilityRule", "ImplementationNote"] as const;
export type CharterLayer = (typeof LAYERS)[number];

async function requireUser(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("Not signed in.");
  }
  return auth.user;
}

/**
 * §3.8 rule: only confirmed content may be written to the model. For this
 * directly-authored Charter Update case type (as opposed to the automatic
 * decision -> charter write in Meeting Ingestion, EPIC 5, not yet built),
 * "confirmed" means a human BA is deliberately authoring it here — there is
 * no separate draft state for knowledge_node itself in the schema.
 */
export async function createKnowledgeNode(projectId: string, formData: FormData) {
  const layer = String(formData.get("layer") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const parentNodeId = String(formData.get("parent_node_id") ?? "") || null;

  if (!LAYERS.includes(layer as CharterLayer)) {
    throw new Error(`Invalid layer: ${layer}`);
  }
  if (!title) {
    throw new Error("Title is required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: node, error } = await supabase
    .from("knowledge_node")
    .insert({
      project_id: projectId,
      layer,
      title,
      body: body || null,
      parent_node_id: parentNodeId,
      status: "Active",
      last_confirmed_by: user.id,
      last_confirmed_at: new Date().toISOString(),
    })
    .select("knowledge_node_id")
    .single();

  if (error) {
    throw new Error(`Failed to create charter entry: ${error.message}`);
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Created",
    targetObjectType: "KnowledgeNode",
    targetObjectId: node.knowledge_node_id,
    newValue: { layer, title, body },
  });

  await enqueueEmbedding(supabase, projectId, "KnowledgeNode", node.knowledge_node_id, user.id);

  revalidatePath(`/projects/${projectId}/charter`);
}

/**
 * Versioning (§3.8: "every node is versioned with author, timestamp and
 * source reference" / "not overwritten in place"): the live row is updated
 * in place with version_no incremented, but the full prior state is
 * preserved permanently in audit_event.prior_value — nothing is lost, it's
 * just not a second live copy of the node.
 */
/**
 * §7 optimistic concurrency (EXECUTION_PLAN.md EPIC 16): the form round-trips
 * the version_no it was rendered with; the update only applies if that
 * still matches the current row. A zero-row result means someone else
 * saved a newer version in between — surfaced as a real conflict error
 * instead of silently overwriting their edit (last-write-wins).
 */
export async function updateKnowledgeNode(
  projectId: string,
  nodeId: string,
  formData: FormData
) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const expectedVersionNo = Number(formData.get("expected_version_no") ?? "");

  if (!title) {
    throw new Error("Title is required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { data: prior, error: fetchError } = await supabase
    .from("knowledge_node")
    .select("*")
    .eq("knowledge_node_id", nodeId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to load charter entry: ${fetchError.message}`);
  }

  const { data: updated, error: updateError } = await supabase
    .from("knowledge_node")
    .update({
      title,
      body: body || null,
      version_no: prior.version_no + 1,
      last_confirmed_by: user.id,
      last_confirmed_at: new Date().toISOString(),
    })
    .eq("knowledge_node_id", nodeId)
    .eq("version_no", expectedVersionNo)
    .select("knowledge_node_id");

  if (updateError) {
    throw new Error(`Failed to update charter entry: ${updateError.message}`);
  }
  if (!updated || updated.length === 0) {
    throw new Error(
      "This charter entry was edited by someone else since you loaded it. Reload the page and reapply your changes."
    );
  }

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "ModelUpdated",
    targetObjectType: "KnowledgeNode",
    targetObjectId: nodeId,
    priorValue: { title: prior.title, body: prior.body, version_no: prior.version_no },
    newValue: { title, body, version_no: prior.version_no + 1 },
  });

  await enqueueEmbedding(supabase, projectId, "KnowledgeNode", nodeId, user.id);

  revalidatePath(`/projects/${projectId}/charter`);
}

/**
 * Manual conflict flagging for this phase — automatic contradiction
 * detection arrives with the extraction service (EPIC 4) writing decisions
 * into the charter. A BA can flag two entries as conflicting by hand today;
 * EPIC 5 will raise these programmatically the same way.
 */
export async function flagConflict(projectId: string, formData: FormData) {
  const knowledgeNodeId = String(formData.get("knowledge_node_id") ?? "");
  const description = String(formData.get("description") ?? "").trim();

  if (!knowledgeNodeId || !description) {
    throw new Error("Node and description are required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const { error } = await supabase.from("knowledge_conflict").insert({
    project_id: projectId,
    knowledge_node_id: knowledgeNodeId,
    description,
    status: "Open",
  });

  if (error) {
    throw new Error(`Failed to flag conflict: ${error.message}`);
  }

  await supabase
    .from("knowledge_node")
    .update({ status: "InConflict" })
    .eq("knowledge_node_id", knowledgeNodeId);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "Updated",
    targetObjectType: "KnowledgeNode",
    targetObjectId: knowledgeNodeId,
    newValue: { status: "InConflict", conflict_description: description },
  });

  revalidatePath(`/projects/${projectId}/charter`);
}

/** §3.8: "Only the Lead Business Analyst may resolve a conflict." */
export async function resolveConflict(projectId: string, formData: FormData) {
  const conflictId = String(formData.get("conflict_id") ?? "");
  const resolutionNote = String(formData.get("resolution_note") ?? "").trim();

  if (!conflictId || !resolutionNote) {
    throw new Error("Resolution note is required.");
  }

  const supabase = await getSupabaseServerClient();
  const user = await requireUser(supabase);

  const role = await getProjectRole(supabase, projectId, user.id);
  if (!isLead(role)) {
    throw new Error("Only a Lead Business Analyst can resolve a conflict.");
  }

  const { data: conflict, error: fetchError } = await supabase
    .from("knowledge_conflict")
    .select("knowledge_node_id")
    .eq("conflict_id", conflictId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to load conflict: ${fetchError.message}`);
  }

  const { error: resolveError } = await supabase
    .from("knowledge_conflict")
    .update({
      status: "Resolved",
      resolved_by: user.id,
      resolution_note: resolutionNote,
      resolved_at: new Date().toISOString(),
    })
    .eq("conflict_id", conflictId);

  if (resolveError) {
    throw new Error(`Failed to resolve conflict: ${resolveError.message}`);
  }

  await supabase
    .from("knowledge_node")
    .update({ status: "Active" })
    .eq("knowledge_node_id", conflict.knowledge_node_id);

  await logAuditEvent(supabase, {
    projectId,
    actorUserId: user.id,
    eventType: "ConflictResolved",
    targetObjectType: "KnowledgeConflict",
    targetObjectId: conflictId,
    newValue: { resolution_note: resolutionNote },
  });

  revalidatePath(`/projects/${projectId}/charter`);
}

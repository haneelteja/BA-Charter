import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isFlowDiagramContent, EMPTY_CONTENT } from "../types";
import { FlowEditor } from "./FlowEditor";

export const dynamic = "force-dynamic";

export default async function FlowDiagramEditorPage({
  params,
}: {
  params: Promise<{ id: string; diagramId: string }>;
}) {
  const { id: projectId, diagramId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: diagram } = await supabase
    .from("flow_diagram")
    .select("diagram_id, title, content")
    .eq("diagram_id", diagramId)
    .maybeSingle();

  if (!diagram) {
    notFound();
  }

  const content = isFlowDiagramContent(diagram.content) ? diagram.content : EMPTY_CONTENT;

  return (
    <FlowEditor
      projectId={projectId}
      diagramId={diagram.diagram_id}
      initialTitle={diagram.title}
      initialContent={content}
    />
  );
}

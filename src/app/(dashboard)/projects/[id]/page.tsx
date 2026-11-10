import { getSupabaseServerClient } from "@/lib/supabase/server";
import { dbRowsToUIMessages } from "@/lib/ai/projectChat";
import { ChatPanel } from "./ChatPanel";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 60;

export default async function ProjectChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: project } = await supabase
    .from("project")
    .select("embedding_provider, embedding_model")
    .eq("project_id", projectId)
    .single();

  const { data: historyRows, error } = await supabase
    .from("project_chat_message")
    .select("chat_message_id, role, parts")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);
  if (error) {
    throw new Error(`Failed to load chat history: ${error.message}`);
  }

  const initialMessages = dbRowsToUIMessages(historyRows ?? []);

  return (
    <ChatPanel
      projectId={projectId}
      initialMessages={initialMessages}
      embeddingConfigured={Boolean(project?.embedding_provider)}
    />
  );
}

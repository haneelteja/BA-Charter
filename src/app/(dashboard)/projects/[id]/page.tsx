import Link from "next/link";
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
    <>
      {!project?.embedding_provider && (
        <div className="mx-auto max-w-3xl px-6 pt-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            No embedding model configured for this project yet — chat can&apos;t see any project content
            until a Lead BA sets one in{" "}
            <Link href={`/projects/${projectId}/settings`} className="font-medium underline">
              Settings
            </Link>
            .
          </p>
        </div>
      )}
      <ChatPanel projectId={projectId} initialMessages={initialMessages} />
    </>
  );
}

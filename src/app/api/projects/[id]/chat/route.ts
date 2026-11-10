import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream } from "ai";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getProjectRole } from "@/lib/projects/role";
import { resolveUserLanguageModel } from "@/lib/ai/userModel";
import { searchProject, ALL_SCOPES } from "@/lib/ai/search";
import { buildRagInstructions, extractMessageText, type ChatUIMessage } from "@/lib/ai/projectChat";

export const runtime = "nodejs";

/**
 * Project-wide RAG chat. The client (`useChat` + `DefaultChatTransport`,
 * see ChatPanel.tsx) posts the FULL running conversation on every turn —
 * seeded from `project_chat_message` at page load, then grown client-side
 * exactly like any ChatGPT-style UI — so this handler trusts `messages` as
 * the current turn sequence rather than re-reading history from the
 * database itself; the database read only happens once, server-side, when
 * the Chat page is first rendered.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const { messages } = (await request.json()) as { messages: ChatUIMessage[] };

  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return new Response("Not signed in.", { status: 401 });
  }

  const role = await getProjectRole(supabase, projectId, auth.user.id);
  if (!role) {
    return new Response("Not a member of this project.", { status: 403 });
  }

  const latestMessage = messages.at(-1);
  if (!latestMessage || latestMessage.role !== "user") {
    return new Response("Expected the latest message to be from the user.", { status: 400 });
  }

  const { error: insertError } = await supabase.from("project_chat_message").insert({
    project_id: projectId,
    role: "user",
    author_id: auth.user.id,
    parts: latestMessage.parts,
  });
  if (insertError) {
    return new Response(`Failed to save message: ${insertError.message}`, { status: 500 });
  }

  const { data: project } = await supabase
    .from("project")
    .select("embedding_provider, embedding_model")
    .eq("project_id", projectId)
    .single();

  const queryText = extractMessageText(latestMessage);
  const retrieval =
    project?.embedding_provider && project?.embedding_model && queryText
      ? await searchProject(supabase, projectId, auth.user.id, queryText, [...ALL_SCOPES], 12)
      : [];

  const instructions = buildRagInstructions(retrieval);
  const modelMessages = await convertToModelMessages(messages);
  const model = await resolveUserLanguageModel(auth.user.id);

  const result = streamText({ model, instructions, messages: modelMessages });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onEnd: async ({ responseMessage, isAborted }) => {
        if (isAborted) return;
        await supabase.from("project_chat_message").insert({
          project_id: projectId,
          role: "assistant",
          author_id: null,
          parts: responseMessage.parts,
        });
      },
    }),
  });
}

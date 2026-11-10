import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream } from "ai";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getProjectRole } from "@/lib/projects/role";
import { resolveUserLanguageModel } from "@/lib/ai/userModel";
import { searchProject, ALL_SCOPES } from "@/lib/ai/search";
import { buildRagInstructions, extractMessageText, type ChatUIMessage } from "@/lib/ai/projectChat";

export const runtime = "nodejs";

/**
 * Retrieval only needs enough of the message to find the right context, not
 * the whole thing — a very long paste (e.g. a copied chat transcript) still
 * goes to the model in full via `modelMessages`, but embedding it unbounded
 * risked tripping the embedding provider's own input-length limit and
 * failing the whole turn.
 */
const MAX_RETRIEVAL_QUERY_CHARS = 4000;

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

  // Everything here either calls out to the user's own BYOK provider or
  // reads project config — both can fail for very ordinary reasons (no key
  // configured yet, a provider mismatch, an over-long retrieval query). It
  // all throws well-written Error messages already; the only thing missing
  // was catching them before they became an unhandled rejection that Next.js
  // (and then the AI SDK transport) flattens into an opaque failure.
  let instructions: string;
  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  let model: Awaited<ReturnType<typeof resolveUserLanguageModel>>;
  try {
    const { data: project } = await supabase
      .from("project")
      .select("embedding_provider, embedding_model")
      .eq("project_id", projectId)
      .single();

    const queryText = extractMessageText(latestMessage).slice(0, MAX_RETRIEVAL_QUERY_CHARS);
    const retrieval =
      project?.embedding_provider && project?.embedding_model && queryText
        ? await searchProject(supabase, projectId, auth.user.id, queryText, [...ALL_SCOPES], 12)
        : [];

    instructions = buildRagInstructions(retrieval);
    modelMessages = await convertToModelMessages(messages);
    model = await resolveUserLanguageModel(auth.user.id);
  } catch (err) {
    console.error("[project chat] failed preparing a response:", err);
    const message = err instanceof Error ? err.message : "Failed to prepare a response.";
    return new Response(message, { status: 500 });
  }

  const result = streamText({ model, instructions, messages: modelMessages });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: (err) => {
        console.error("[project chat] streaming error:", err);
        return err instanceof Error ? err.message : "The assistant couldn't finish generating a response. Please try again.";
      },
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

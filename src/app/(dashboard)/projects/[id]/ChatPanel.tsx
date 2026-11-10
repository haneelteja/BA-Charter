"use client";

import { useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button, Card, SubmitButton, Textarea } from "@/components/ui";
import { uploadDocument, type UploadDocumentResult } from "./documents-actions";
import { SUPPORTED_EXTENSIONS } from "@/lib/documents/supportedExtensions";
import type { ChatTextPart, ChatUIMessage } from "@/lib/ai/projectChat";

function messageText(message: ChatUIMessage): string {
  return message.parts
    .filter((p): p is ChatTextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export function ChatPanel({
  projectId,
  initialMessages,
  embeddingConfigured,
}: {
  projectId: string;
  initialMessages: ChatUIMessage[];
  embeddingConfigured: boolean;
}) {
  const { messages, sendMessage, status, error } = useChat<ChatUIMessage>({
    id: `project-${projectId}`,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: `/api/projects/${projectId}/chat` }),
  });

  const [input, setInput] = useState("");
  const isBusy = status === "submitted" || status === "streaming";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    setInput("");
    sendMessage({ text });
  }

  const [uploadState, uploadFormAction] = useActionState<UploadDocumentResult | null, FormData>(
    (_previous, formData) => uploadDocument(projectId, formData),
    null
  );

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-6">
      {!embeddingConfigured && (
        <p className="mb-4 shrink-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          No embedding model configured for this project yet — chat can&apos;t see any project content
          until a Lead BA sets one in{" "}
          <Link href={`/projects/${projectId}/settings`} className="font-medium underline">
            Settings
          </Link>
          .
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted">
            Ask anything about this project — the charter, interactions, epics, stories,
            clarifications, change requests, guardrails, and anything you upload below.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m) => (
              <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <Card
                  className={
                    m.role === "user"
                      ? "max-w-[80%] border-indigo-600 bg-indigo-600 text-white"
                      : "max-w-[80%]"
                  }
                >
                  <p className="whitespace-pre-wrap text-sm">{messageText(m)}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {status === "submitted" && <p className="mt-3 text-sm text-muted">Thinking…</p>}
        {error && <p className="mt-3 text-sm text-red-700 dark:text-red-400">{error.message}</p>}
      </div>

      <div className="mt-4 shrink-0 border-t border-surface-border pt-4">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask about this project…"
            rows={2}
            className="flex-1"
          />
          <Button type="submit" variant="primary" disabled={isBusy || !input.trim()}>
            {isBusy ? "Sending…" : "Send"}
          </Button>
        </form>

        <form action={uploadFormAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            aria-label="Upload a document to add to this project's knowledge base"
            accept={SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(",")}
            className="text-xs text-muted"
            required
          />
          <SubmitButton type="submit" variant="secondary" size="sm" pendingLabel="Uploading…">
            Attach file
          </SubmitButton>
          {uploadState &&
            (uploadState.ok ? (
              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                Uploaded &quot;{uploadState.fileName}&quot; — indexing for search and chat.
              </span>
            ) : (
              <span className="text-xs text-red-700 dark:text-red-400">{uploadState.error}</span>
            ))}
        </form>
      </div>
    </div>
  );
}

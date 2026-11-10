"use client";

import { useActionState, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Card } from "@/components/ui";
import { uploadDocument, type UploadDocumentResult } from "./documents-actions";
import { SUPPORTED_EXTENSIONS } from "@/lib/documents/supportedExtensions";
import type { ChatTextPart, ChatUIMessage } from "@/lib/ai/projectChat";

function messageText(message: ChatUIMessage): string {
  return message.parts
    .filter((p): p is ChatTextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function PlusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4 animate-spin"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
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

  const [uploadState, uploadFormAction, isUploading] = useActionState<UploadDocumentResult | null, FormData>(
    (_previous, formData) => uploadDocument(projectId, formData),
    null
  );
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
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

      <div className="mt-4 shrink-0">
        {(isUploading || uploadState) && (
          <p className="mb-2 flex items-center gap-1.5 text-xs">
            {isUploading ? (
              <span className="flex items-center gap-1.5 text-muted">
                <Spinner /> Uploading…
              </span>
            ) : uploadState!.ok ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                Uploaded &quot;{uploadState!.fileName}&quot; — indexing for search and chat.
              </span>
            ) : (
              <span className="text-red-700 dark:text-red-400">{uploadState!.error}</span>
            )}
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-1.5 rounded-3xl border border-surface-border bg-surface p-1.5 shadow-sm transition-colors focus-within:border-indigo-300 dark:focus-within:border-indigo-800"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach a document to this project's knowledge base"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
          >
            <PlusIcon />
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask about this project…"
            rows={1}
            className="flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-foreground placeholder:text-muted/70 focus:outline-none"
          />

          <button
            type="submit"
            disabled={isBusy || !input.trim()}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-surface-border disabled:text-muted"
          >
            {isBusy ? <Spinner /> : <ArrowUpIcon />}
          </button>
        </form>

        <form ref={uploadFormRef} action={uploadFormAction}>
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            aria-label="Upload a document to add to this project's knowledge base"
            accept={SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(",")}
            className="hidden"
            onChange={() => uploadFormRef.current?.requestSubmit()}
          />
        </form>
      </div>
    </div>
  );
}

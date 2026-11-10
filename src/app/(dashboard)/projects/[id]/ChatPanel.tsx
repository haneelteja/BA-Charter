"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Card } from "@/components/ui";
import { uploadDocument, type UploadDocumentResult } from "./documents-actions";
import { SUPPORTED_EXTENSIONS } from "@/lib/documents/supportedExtensions";
import type { ChatTextPart, ChatUIMessage } from "@/lib/ai/projectChat";

/**
 * A folder's relative path, as the browser reports it on each selected
 * File (`webkitRelativePath`) — not in React's own InputHTMLAttributes,
 * so the `webkitdirectory`/`directory` props below are passed via a
 * spread rather than typed JSX attributes.
 */
interface FileWithRelativePath extends File {
  webkitRelativePath: string;
}

interface FolderUploadState {
  total: number;
  completed: number;
  succeeded: string[];
  failed: { name: string; error: string }[];
}

/** Skips noise a casual "pick a folder" selection commonly drags in — hidden files and common non-content directories — rather than attempting (and failing on) every one of them. */
function isIgnorableFolderEntry(relativePath: string): boolean {
  const segments = relativePath.split("/");
  return segments.some((s) => s.startsWith(".") || s === "node_modules");
}

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

function FileIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
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
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [isAttachMenuOpen, setAttachMenuOpen] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAttachMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setAttachMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isAttachMenuOpen]);

  const [folderUpload, setFolderUpload] = useState<FolderUploadState | null>(null);

  /**
   * Folder selection has no server-side equivalent to the single-file
   * form's useActionState — there's a whole FileList to get through, not
   * one submission — so this calls the uploadDocument Server Action
   * directly in a loop (a plain async function call with a FormData we
   * build ourselves; Server Actions support this independent of a real
   * <form> submission) with limited concurrency, tracking per-file
   * progress as it goes.
   */
  async function handleFolderSelected(fileList: FileList) {
    const files = Array.from(fileList) as FileWithRelativePath[];
    const toUpload = files.filter((f) => !isIgnorableFolderEntry(f.webkitRelativePath || f.name));

    setFolderUpload({ total: toUpload.length, completed: 0, succeeded: [], failed: [] });

    const concurrency = 3;
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < toUpload.length) {
        const file = toUpload[nextIndex++];
        const relativePath = file.webkitRelativePath || file.name;
        const formData = new FormData();
        formData.append("file", file, relativePath);

        const result = await uploadDocument(projectId, formData);

        setFolderUpload((prev) => {
          if (!prev) return prev;
          return result.ok
            ? { ...prev, completed: prev.completed + 1, succeeded: [...prev.succeeded, relativePath] }
            : {
                ...prev,
                completed: prev.completed + 1,
                failed: [...prev.failed, { name: relativePath, error: result.error }],
              };
        });
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, toUpload.length) }, worker));
  }

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

        {folderUpload && (
          <p className="mb-2 flex items-center gap-1.5 text-xs">
            {folderUpload.completed < folderUpload.total ? (
              <span className="flex items-center gap-1.5 text-muted">
                <Spinner /> Uploading folder… ({folderUpload.completed}/{folderUpload.total})
              </span>
            ) : folderUpload.failed.length === 0 ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                Folder uploaded — {folderUpload.succeeded.length} file
                {folderUpload.succeeded.length === 1 ? "" : "s"} added and indexing for search and chat.
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                Folder uploaded — {folderUpload.succeeded.length} added, {folderUpload.failed.length} skipped (
                {folderUpload.failed.map((f) => f.name).join(", ")}).
              </span>
            )}
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-1.5 rounded-3xl border border-surface-border bg-surface p-1.5 shadow-sm transition-colors focus-within:border-indigo-300 dark:focus-within:border-indigo-800"
        >
          <div ref={attachMenuRef} className="relative shrink-0">
            {isAttachMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-44 rounded-xl border border-surface-border bg-surface py-1 shadow-md">
                <button
                  type="button"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <FileIcon /> Upload file
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    folderInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <FolderIcon /> Upload folder
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setAttachMenuOpen((open) => !open)}
              aria-label="Attach a file or folder to this project's knowledge base"
              aria-expanded={isAttachMenuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
            >
              <PlusIcon />
            </button>
          </div>

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

        <input
          ref={folderInputRef}
          type="file"
          aria-label="Upload a folder of documents to add to this project's knowledge base"
          className="hidden"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) void handleFolderSelected(files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

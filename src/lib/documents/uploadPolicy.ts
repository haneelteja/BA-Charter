import { SUPPORTED_EXTENSIONS } from "./supportedExtensions";

/** Largest file accepted into the knowledge base. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Extracted text beyond this is cut off before storage and embedding. */
export const MAX_EXTRACTED_CHARS = 2_000_000;

/**
 * A storage-safe file name: no path separators or traversal, no control
 * characters, a bounded length, and the original extension kept so text
 * extraction still dispatches correctly. The display name stored in
 * project_document.file_name can stay as the user typed it.
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  const stem = (dot > 0 ? cleaned.slice(0, dot) : cleaned).slice(0, 120) || "document";
  return `${stem}${ext.slice(0, 10)}`;
}

function extensionOf(name: string): string | undefined {
  return name.includes(".") ? name.split(".").pop()?.toLowerCase() : undefined;
}

/**
 * Checks a file before any parser touches it: size, a supported extension,
 * and leading bytes that match that extension, so a renamed binary can't
 * be fed to the PDF or DOCX parser.
 */
export async function validateUpload(file: Blob, fileName: string): Promise<string | null> {
  if (file.size === 0) return "Choose a file to upload.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Files can be at most ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`;
  }
  const ext = extensionOf(fileName);
  if (!ext || !(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `Unsupported file type. Supported types: ${SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(", ")}.`;
  }
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const startsWith = (bytes: number[]) => bytes.every((b, i) => head[i] === b);
  if (ext === "pdf" && !startsWith([0x25, 0x50, 0x44, 0x46])) return "That file is not a valid PDF.";
  if (ext === "docx" && !startsWith([0x50, 0x4b, 0x03, 0x04])) return "That file is not a valid Word document.";
  if ((ext === "txt" || ext === "md") && head.includes(0)) return "That file does not look like plain text.";
  return null;
}

/** Rejects if `work` takes longer than `ms`, so a pathological file can't tie up the request. */
export async function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

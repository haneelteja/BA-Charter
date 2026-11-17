"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/projects/access";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { enqueueEmbedding } from "@/lib/ai/embeddingTrigger";
import { extractText } from "@/lib/documents/extractText";
import { MAX_EXTRACTED_CHARS, sanitizeFileName, validateUpload, withTimeout } from "@/lib/documents/uploadPolicy";


export type UploadDocumentResult =
  | { ok: true; documentId: string; fileName: string }
  | { ok: false; error: string };

/**
 * Uploads a file into the project's shared knowledge base: stores the raw
 * file in Supabase Storage (bucket `project-documents`, path
 * `{project_id}/{document_id}/{file_name}` — see migration
 * 0022_project_chat_and_documents.sql for the matching storage policies),
 * extracts its text synchronously (so an unsupported file type or a
 * corrupt PDF/DOCX fails loudly here rather than silently in a background
 * job), then enqueues the same embedding pipeline every other embeddable
 * object type already uses.
 *
 * Returns a result object instead of throwing for expected failure modes
 * (bad file type, empty selection, storage error) so the calling
 * useActionState-driven UI can show a friendly inline message rather than
 * bubbling to an error boundary.
 */
export async function uploadDocument(projectId: string, formData: FormData): Promise<UploadDocumentResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }

  // Authorise before doing any work on the file: parsing a PDF or DOCX is
  // expensive, and server actions can be called directly.
  const supabase = await getSupabaseServerClient();
  let user: Awaited<ReturnType<typeof requireProjectAccess>>["user"];
  try {
    ({ user } = await requireProjectAccess(supabase, projectId, "author"));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Not allowed." };
  }

  const problem = await validateUpload(file, file.name);
  if (problem) {
    return { ok: false, error: problem };
  }

  let text: string;
  try {
    text = await withTimeout(extractText(file, file.name), 30_000, "Reading that file took too long. Try a smaller file.");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to read that file." };
  }
  if (text.length > MAX_EXTRACTED_CHARS) {
    text = text.slice(0, MAX_EXTRACTED_CHARS);
  }

  const documentId = crypto.randomUUID();
  const storagePath = `${projectId}/${documentId}/${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("project-documents")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) {
    return { ok: false, error: `Failed to upload file: ${uploadError.message}` };
  }

  const { error: insertError } = await supabase.from("project_document").insert({
    document_id: documentId,
    project_id: projectId,
    uploaded_by: user.id,
    file_name: file.name.slice(0, 300),
    storage_path: storagePath,
    mime_type: file.type || null,
    extracted_text: text,
  });
  if (insertError) {
    return { ok: false, error: `Failed to save document: ${insertError.message}` };
  }

  await enqueueEmbedding(supabase, projectId, "Document", documentId, user.id);

  revalidatePath(`/projects/${projectId}`);

  return { ok: true, documentId, fileName: file.name };
}

import { z } from "zod";

/**
 * The only request shape the project chat endpoint accepts. The client
 * sends the whole running conversation, so every field is untrusted:
 * - only text and pasted-image parts (what ChatPanel produces);
 * - images only as inline data: URLs of common image types, so the AI SDK
 *   never fetches a caller-supplied URL from the server (SSRF);
 * - bounded counts and sizes, so one request can't exhaust memory or the
 *   user's model budget.
 */
export const MAX_CHAT_TEXT_CHARS = 100_000;
export const MAX_CHAT_IMAGE_DATA_URL_CHARS = 7_000_000; // about 5 MB of image
const MAX_PARTS = 20;
const MAX_MESSAGES = 200;

const textPart = z.object({
  type: z.literal("text"),
  text: z.string().max(MAX_CHAT_TEXT_CHARS),
});

const imagePart = z.object({
  type: z.literal("file"),
  mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  filename: z.string().max(300).optional(),
  url: z
    .string()
    .max(MAX_CHAT_IMAGE_DATA_URL_CHARS)
    .regex(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/, "Images must be attached inline."),
});

const message = z.object({
  id: z.string().max(200),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.discriminatedUnion("type", [textPart, imagePart])).max(MAX_PARTS),
});

export const chatRequestSchema = z.object({
  messages: z.array(message).min(1).max(MAX_MESSAGES),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export function parseChatRequest(body: unknown): { ok: true; data: ChatRequest } | { ok: false; error: string } {
  const result = chatRequestSchema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `Invalid chat request: ${issue?.message ?? "unexpected shape"}` };
  }
  return { ok: true, data: result.data };
}

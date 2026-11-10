/**
 * Split out from extractText.ts (which pulls in pdf-parse/mammoth — Node-only,
 * not safe to bundle into client code) so a client component can reference
 * the supported-extensions list, e.g. for a file input's `accept` attribute,
 * without dragging those libraries into the browser bundle.
 */
export const SUPPORTED_EXTENSIONS = ["txt", "md", "pdf", "docx"] as const;

import { SUPPORTED_EXTENSIONS } from "./supportedExtensions";

export { SUPPORTED_EXTENSIONS };

/**
 * Extracts plain text from an uploaded document so it can be embedded into
 * the project's searchable knowledge base. Dispatches on the file's
 * extension rather than its reported MIME type — browsers are inconsistent
 * about what MIME type they attach to a given file (especially .md, which
 * commonly comes through with no type at all), while the extension the
 * user picked is unambiguous.
 *
 * pdf-parse/mammoth are imported dynamically (lazily), inside their own
 * case, rather than statically at the top of this file: a static import
 * pulls pdf-parse's pdfjs-dist dependency into every bundle that imports
 * this module at all, and loading it unconditionally crashed every upload
 * — not just PDFs — with "ReferenceError: DOMMatrix is not defined"
 * (pdfjs-dist needs a canvas polyfill that isn't present in Vercel's Node
 * runtime; its optional @napi-rs/canvas dependency didn't install there).
 * Scoping the import means .txt/.md/.docx uploads never touch pdfjs-dist
 * at all.
 */
export async function extractText(file: Blob, fileName: string): Promise<string> {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;

  switch (extension) {
    case "txt":
    case "md":
      return await file.text();

    case "pdf": {
      const { PDFParse } = await import("pdf-parse");
      const data = new Uint8Array(await file.arrayBuffer());
      const parser = new PDFParse({ data });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }

    case "docx": {
      const { default: mammoth } = await import("mammoth");
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    default:
      throw new Error(
        `Unsupported file type${extension ? ` ".${extension}"` : ""}. Supported types: ${SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(", ")}.`
      );
  }
}

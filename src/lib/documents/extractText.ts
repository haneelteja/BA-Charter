import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { SUPPORTED_EXTENSIONS } from "./supportedExtensions";

export { SUPPORTED_EXTENSIONS };

/**
 * Extracts plain text from an uploaded document so it can be embedded into
 * the project's searchable knowledge base. Dispatches on the file's
 * extension rather than its reported MIME type — browsers are inconsistent
 * about what MIME type they attach to a given file (especially .md, which
 * commonly comes through with no type at all), while the extension the
 * user picked is unambiguous.
 */
export async function extractText(file: Blob, fileName: string): Promise<string> {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;

  switch (extension) {
    case "txt":
    case "md":
      return await file.text();

    case "pdf": {
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

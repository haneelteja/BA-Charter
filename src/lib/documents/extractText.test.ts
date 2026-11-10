import { describe, expect, it, vi } from "vitest";

const getText = vi.fn().mockResolvedValue({ text: "pdf body text" });
const destroy = vi.fn().mockResolvedValue(undefined);
const PDFParseMock = vi.fn().mockImplementation(function PDFParse(this: unknown) {
  return { getText, destroy };
});
vi.mock("pdf-parse", () => ({ PDFParse: PDFParseMock }));

const extractRawText = vi.fn().mockResolvedValue({ value: "docx body text", messages: [] });
vi.mock("mammoth", () => ({ default: { extractRawText } }));

const { extractText } = await import("./extractText");

function fileOf(text: string, name: string): Blob & { name: string } {
  const blob = new Blob([text], { type: "text/plain" }) as Blob & { name: string };
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

describe("extractText", () => {
  it("reads .txt files as plain UTF-8 text", async () => {
    const text = await extractText(fileOf("hello world", "notes.txt"), "notes.txt");
    expect(text).toBe("hello world");
  });

  it("reads .md files as plain UTF-8 text", async () => {
    const text = await extractText(fileOf("# heading", "notes.md"), "notes.md");
    expect(text).toBe("# heading");
  });

  it("extracts .pdf files via pdf-parse and always destroys the parser", async () => {
    const text = await extractText(fileOf("", "spec.pdf"), "spec.pdf");
    expect(text).toBe("pdf body text");
    expect(PDFParseMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Uint8Array) }));
    expect(destroy).toHaveBeenCalled();
  });

  it("destroys the pdf parser even when getText throws", async () => {
    getText.mockRejectedValueOnce(new Error("corrupt pdf"));
    await expect(extractText(fileOf("", "bad.pdf"), "bad.pdf")).rejects.toThrow("corrupt pdf");
    expect(destroy).toHaveBeenCalled();
  });

  it("extracts .docx files via mammoth", async () => {
    const text = await extractText(fileOf("", "spec.docx"), "spec.docx");
    expect(text).toBe("docx body text");
  });

  it("throws a clear error for an unsupported extension", async () => {
    await expect(extractText(fileOf("", "image.png"), "image.png")).rejects.toThrow(/Unsupported file type ".png"/);
  });

  it("throws a clear error for a file with no extension", async () => {
    await expect(extractText(fileOf("", "README"), "README")).rejects.toThrow(/Unsupported file type\./);
  });
});

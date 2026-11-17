import { describe, expect, it } from "vitest";
import { parseDiagramContent } from "./schema";

const node = { id: "n1", type: "shape", position: { x: 10, y: 20 }, data: { shape: "rectangle", label: "Start" } };
const edge = { id: "e1", source: "n1", target: "n1", data: { lineStyle: "solid", startArrow: false, endArrow: true } };

describe("parseDiagramContent", () => {
  it("accepts a valid diagram and drops unknown keys", () => {
    const parsed = parseDiagramContent({ nodes: [{ ...node, extra: "x" }], edges: [edge], junk: 1 });
    expect(parsed?.nodes[0]).not.toHaveProperty("extra");
    expect(parsed).not.toHaveProperty("junk");
  });

  it("rejects unknown shapes, non-finite positions and oversized labels", () => {
    expect(parseDiagramContent({ nodes: [{ ...node, data: { shape: "script", label: "x" } }], edges: [] })).toBeNull();
    expect(parseDiagramContent({ nodes: [{ ...node, position: { x: Infinity, y: 0 } }], edges: [] })).toBeNull();
    expect(parseDiagramContent({ nodes: [{ ...node, data: { shape: "circle", label: "x".repeat(501) } }], edges: [] })).toBeNull();
  });

  it("rejects too many nodes", () => {
    const nodes = Array.from({ length: 501 }, (_, i) => ({ ...node, id: `n${i}` }));
    expect(parseDiagramContent({ nodes, edges: [] })).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parseDiagramContent("x")).toBeNull();
    expect(parseDiagramContent(null)).toBeNull();
  });
});

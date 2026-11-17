import { z } from "zod";
import type { FlowDiagramContent } from "./types";

/**
 * Server-side shape check for a saved diagram. The editor sends the whole
 * canvas on every save, so without this a direct call to saveDiagram could
 * store arbitrary JSON of any size in flow_diagram.content.
 */
const MAX_NODES = 500;
const MAX_EDGES = 1000;
const id = z.string().min(1).max(100);
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);

const node = z.object({
  id,
  type: z.literal("shape"),
  position: z.object({ x: coordinate, y: coordinate }),
  data: z.object({
    shape: z.enum(["circle", "square", "rectangle", "triangle"]),
    label: z.string().max(500),
  }),
});

const edge = z.object({
  id,
  source: id,
  target: id,
  sourceHandle: z.string().max(100).nullish(),
  targetHandle: z.string().max(100).nullish(),
  label: z.string().max(500).optional(),
  data: z.object({
    lineStyle: z.enum(["solid", "dashed", "dotted"]),
    startArrow: z.boolean(),
    endArrow: z.boolean(),
  }),
});

const content = z.object({
  nodes: z.array(node).max(MAX_NODES),
  edges: z.array(edge).max(MAX_EDGES),
});

export function parseDiagramContent(value: unknown): FlowDiagramContent | null {
  const result = content.safeParse(value);
  if (!result.success) return null;
  // Normalise null handles to undefined, the shape the editor uses.
  return {
    nodes: result.data.nodes,
    edges: result.data.edges.map((e) => ({
      ...e,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  };
}

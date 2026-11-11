export type ShapeKind = "circle" | "square" | "rectangle" | "triangle";
export type LineStyle = "solid" | "dashed" | "dotted";

/**
 * Index signatures are required by React Flow's `Node<T>`/`Edge<T>` generics
 * (`T extends Record<string, unknown>`) — without one, a concrete object
 * type isn't assignable to that constraint.
 */
export interface ShapeNodeData {
  shape: ShapeKind;
  label: string;
  [key: string]: unknown;
}

export interface StyledEdgeData {
  lineStyle: LineStyle;
  startArrow: boolean;
  endArrow: boolean;
  [key: string]: unknown;
}

export interface FlowDiagramNode {
  id: string;
  type: "shape";
  position: { x: number; y: number };
  data: ShapeNodeData;
}

export interface FlowDiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  data: StyledEdgeData;
}

export interface FlowDiagramContent {
  nodes: FlowDiagramNode[];
  edges: FlowDiagramEdge[];
}

export const EMPTY_CONTENT: FlowDiagramContent = { nodes: [], edges: [] };

export function isFlowDiagramContent(value: unknown): value is FlowDiagramContent {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as FlowDiagramContent).nodes) &&
    Array.isArray((value as FlowDiagramContent).edges)
  );
}

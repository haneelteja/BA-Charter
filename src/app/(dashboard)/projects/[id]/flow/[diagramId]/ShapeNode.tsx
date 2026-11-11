"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import type { ShapeNodeData } from "../types";

export type ShapeFlowNode = Node<ShapeNodeData, "shape">;

const SHAPE_SIZE_CLASS: Record<ShapeNodeData["shape"], string> = {
  rectangle: "h-20 w-40 rounded-lg",
  square: "h-28 w-28 rounded-lg",
  circle: "h-28 w-28 rounded-full",
  triangle: "h-28 w-32",
};

/** One Handle per side, every one a source — ReactFlow's `connectionMode="loose"` (set on the canvas) lets any handle both start and complete a connection, so a shape can be wired to or from any side. */
const HANDLE_POSITIONS = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

export function ShapeNode({ id, data, selected }: NodeProps<ShapeFlowNode>) {
  const { updateNodeData } = useReactFlow();
  const { shape, label } = data;

  const textarea = (
    <textarea
      className="nodrag nowheel h-full w-full resize-none border-none bg-transparent px-2 text-center text-xs font-medium text-foreground outline-none placeholder:text-muted/60"
      value={label}
      placeholder="Label…"
      onChange={(e) => updateNodeData(id, { label: e.target.value })}
    />
  );

  return (
    <div className="group relative">
      {HANDLE_POSITIONS.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={h.position}
          className="!h-2.5 !w-2.5 !border-2 !border-surface !bg-indigo-500 opacity-0 transition-opacity group-hover:opacity-100"
        />
      ))}

      {shape === "triangle" ? (
        <div className={`relative flex items-center justify-center ${SHAPE_SIZE_CLASS.triangle}`}>
          <div
            className={`absolute inset-0 border-2 bg-surface ${
              selected ? "border-indigo-500" : "border-surface-border"
            }`}
            style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
          />
          <div className="relative mt-6 h-12 w-24">{textarea}</div>
        </div>
      ) : (
        <div
          className={`flex items-center justify-center border-2 bg-surface shadow-sm ${SHAPE_SIZE_CLASS[shape]} ${
            selected ? "border-indigo-500 ring-2 ring-indigo-500/30" : "border-surface-border"
          }`}
        >
          {textarea}
        </div>
      )}
    </div>
  );
}

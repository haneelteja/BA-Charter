"use client";

import { useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  MarkerType,
  type Connection,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BackLink, Button, Input } from "@/components/ui";
import { ShapeNode, type ShapeFlowNode } from "./ShapeNode";
import { saveDiagram } from "../actions";
import type { FlowDiagramContent, LineStyle, ShapeKind, StyledEdgeData } from "../types";

const nodeTypes: NodeTypes = { shape: ShapeNode };

const SHAPE_OPTIONS: { kind: ShapeKind; label: string; iconClassName: string }[] = [
  { kind: "rectangle", label: "Rectangle", iconClassName: "h-2.5 w-4 rounded-[2px]" },
  { kind: "square", label: "Square", iconClassName: "h-3 w-3 rounded-[2px]" },
  { kind: "circle", label: "Circle", iconClassName: "h-3 w-3 rounded-full" },
  { kind: "triangle", label: "Triangle", iconClassName: "h-3 w-3" },
];

const LINE_STYLE_OPTIONS: { kind: LineStyle; label: string }[] = [
  { kind: "solid", label: "Solid" },
  { kind: "dashed", label: "Dashed" },
  { kind: "dotted", label: "Dotted" },
];

function edgeVisualProps(data: StyledEdgeData) {
  const strokeDasharray = data.lineStyle === "dashed" ? "10 6" : data.lineStyle === "dotted" ? "1 6" : undefined;
  return {
    style: { strokeDasharray, strokeWidth: 2 },
    markerStart: data.startArrow ? { type: MarkerType.ArrowClosed } : undefined,
    markerEnd: data.endArrow ? { type: MarkerType.ArrowClosed } : undefined,
  };
}

function toRfNodes(content: FlowDiagramContent): ShapeFlowNode[] {
  return content.nodes.map((n) => ({ id: n.id, type: "shape", position: n.position, data: n.data }));
}

function toRfEdges(content: FlowDiagramContent): Edge<StyledEdgeData>[] {
  return content.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: e.label,
    data: e.data,
    ...edgeVisualProps(e.data),
  }));
}

function FlowEditorInner({
  projectId,
  diagramId,
  initialTitle,
  initialContent,
}: {
  projectId: string;
  diagramId: string;
  initialTitle: string;
  initialContent: FlowDiagramContent;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [nodes, setNodes, onNodesChange] = useNodesState<ShapeFlowNode>(toRfNodes(initialContent));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<StyledEdgeData>>(toRfEdges(initialContent));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const nodeCounter = useRef(initialContent.nodes.length);

  const selectedEdge = edges.find((e) => e.selected);

  const addShape = useCallback(
    (shape: ShapeKind) => {
      const index = nodeCounter.current++;
      const newNode: ShapeFlowNode = {
        id: `shape-${Date.now()}-${index}`,
        type: "shape",
        position: { x: 120 + (index % 5) * 180, y: 100 + Math.floor(index / 5) * 140 },
        data: { shape, label: "" },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const data: StyledEdgeData = { lineStyle: "solid", startArrow: false, endArrow: true };
      setEdges((eds) => addEdge({ ...connection, type: "default", data, ...edgeVisualProps(data) }, eds));
    },
    [setEdges]
  );

  function updateSelectedEdge(update: Partial<StyledEdgeData>) {
    if (!selectedEdge) return;
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id !== selectedEdge.id) return e;
        const data = { ...e.data!, ...update };
        return { ...e, data, ...edgeVisualProps(data) };
      })
    );
  }

  function deleteSelectedEdge() {
    if (!selectedEdge) return;
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
  }

  async function handleSave() {
    setSaveState("saving");
    setSaveError(null);
    const content: FlowDiagramContent = {
      nodes: nodes.map((n) => ({ id: n.id, type: "shape", position: n.position, data: n.data })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        label: typeof e.label === "string" ? e.label : undefined,
        data: e.data!,
      })),
    };
    const result = await saveDiagram(projectId, diagramId, title, content);
    setSaveState(result.ok ? "saved" : "error");
    if (!result.ok) setSaveError(result.error ?? "Failed to save.");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-surface-border bg-surface px-4 py-2">
        <BackLink href={`/projects/${projectId}/flow`}>Back to diagrams</BackLink>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaveState("idle");
          }}
          aria-label="Diagram title"
          className="max-w-xs text-sm font-medium"
        />
        <div className="ml-auto flex items-center gap-2">
          {saveState === "saved" && <span className="text-xs text-emerald-700 dark:text-emerald-400">Saved</span>}
          {saveState === "error" && (
            <span className="text-xs text-red-700 dark:text-red-400">{saveError}</span>
          )}
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls />
          <MiniMap pannable zoomable className="!bg-surface" />

          <Panel position="top-left">
            <div className="flex flex-col gap-1 rounded-xl border border-surface-border bg-surface p-2 shadow-sm">
              <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted">Add shape</p>
              {SHAPE_OPTIONS.map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => addShape(opt.kind)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                >
                  {opt.kind === "triangle" ? (
                    <span
                      className={`shrink-0 border-indigo-500 bg-indigo-500 ${opt.iconClassName}`}
                      style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
                    />
                  ) : (
                    <span className={`shrink-0 bg-indigo-500 ${opt.iconClassName}`} />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
          </Panel>

          {selectedEdge && (
            <Panel position="top-center">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-border bg-surface px-3 py-2 shadow-md">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Line</span>
                {LINE_STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.kind}
                    type="button"
                    onClick={() => updateSelectedEdge({ lineStyle: opt.kind })}
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                      selectedEdge.data?.lineStyle === opt.kind
                        ? "bg-indigo-600 text-white"
                        : "text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-surface-border" />
                <button
                  type="button"
                  onClick={() => updateSelectedEdge({ startArrow: !selectedEdge.data?.startArrow })}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    selectedEdge.data?.startArrow
                      ? "bg-indigo-600 text-white"
                      : "text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  ← Start arrow
                </button>
                <button
                  type="button"
                  onClick={() => updateSelectedEdge({ endArrow: !selectedEdge.data?.endArrow })}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    selectedEdge.data?.endArrow
                      ? "bg-indigo-600 text-white"
                      : "text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  End arrow →
                </button>
                <span className="mx-1 h-4 w-px bg-surface-border" />
                <button
                  type="button"
                  onClick={deleteSelectedEdge}
                  className="rounded-full px-2.5 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Delete
                </button>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

export function FlowEditor(props: {
  projectId: string;
  diagramId: string;
  initialTitle: string;
  initialContent: FlowDiagramContent;
}) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}

"use client";

import { useMemo } from "react";
import { Background, Controls, ReactFlow } from "@xyflow/react";
import { nodeTypes, edgeTypes } from "@/components/canvas/node-types";
import { buildEdge, buildNode } from "@/lib/canvas-store";
import type { CanvasEdgeSeed, CanvasNodeSeed } from "@/lib/types";

export interface CanvasSnapshotLike {
  nodes?: CanvasNodeSeed[];
  edges?: CanvasEdgeSeed[];
}

interface ReadOnlyCanvasProps {
  snapshot: CanvasSnapshotLike | null;
  /** 右侧附加面板（如分享页留言区）；不传则画布占满宽度 */
  children?: React.ReactNode;
}

/** 分享页与公开发布页共用的只读画布渲染 */
export function ReadOnlyCanvas({ snapshot, children }: ReadOnlyCanvasProps) {
  const flowNodes = useMemo(() => {
    const seeds = Array.isArray(snapshot?.nodes) ? snapshot!.nodes! : [];
    return seeds.map((seed) => ({
      ...buildNode(seed),
      draggable: false,
      connectable: false,
      selectable: false,
      style: { pointerEvents: "none" as const },
    }));
  }, [snapshot]);

  const flowEdges = useMemo(() => {
    const seeds = Array.isArray(snapshot?.edges) ? snapshot!.edges! : [];
    return seeds.map((seed) => buildEdge(seed, "bezier"));
  }, [snapshot]);

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          minZoom={0.2}
          maxZoom={1.4}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#d7d0c1" gap={22} size={1.2} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {children ? (
        <aside
          style={{
            width: 300,
            borderLeft: "1px solid #e5e1d8",
            background: "#fffdf9",
            padding: 16,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {children}
        </aside>
      ) : null}
    </div>
  );
}

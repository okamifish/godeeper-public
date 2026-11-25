"use client";

import type { NodeProps } from "@xyflow/react";
import { ImageOff } from "lucide-react";
import { NodeShell } from "./node-shell";
import { useT } from "@/lib/i18n";
import type { GoDeeperFlowNode } from "@/lib/types";

export function ImageNode({ id, data, selected }: NodeProps<GoDeeperFlowNode>) {
  const t = useT();
  return (
    <NodeShell id={id} kind="image" selected={selected}>
      <div className="node-inner image-node-inner">
        <div className="image-node-frame">
          {data.thumbnailUrl ? (
            <img
              className="image-node-img"
              src={data.thumbnailUrl}
              alt={data.title || t("imageNodeKind")}
              draggable={false}
            />
          ) : (
            <div className="image-node-empty">
              <ImageOff size={18} />
              <span>{t("imageEmpty")}</span>
            </div>
          )}
        </div>
        {data.title ? <div className="image-node-caption" title={data.title}>{data.title}</div> : null}
        <div className="node-footer">
          <span>{data.metaLeft}</span>
          <span>{data.metaRight}</span>
        </div>
      </div>
    </NodeShell>
  );
}

"use client";

import type { NodeProps } from "@xyflow/react";
import type { GoDeeperFlowNode } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { NodeShell } from "./node-shell";
import { CatalogList } from "./catalog-list";

/**
 * 结果目录卡的节点外壳：内容交给统一的 CatalogList 渲染，
 * 这样以后引导模式的目录卡可以复用同一套折叠/编辑/物化逻辑。
 */
export function ResultCatalogNode({ id, data, selected }: NodeProps<GoDeeperFlowNode>) {
  const t = useT();
  const catalog = data.catalog ?? { mode: "answers" as const, items: [], collapsed: false };
  const label = data.title?.trim() || t("resultCatalogTitle");

  return (
    <NodeShell id={id} kind={data.kind} selected={selected}>
      <div className="node-inner">
        <CatalogList nodeId={id} catalog={catalog} label={label} />
        <div className="node-footer">
          <span>{data.metaLeft}</span>
          <span>{data.metaRight}</span>
        </div>
      </div>
    </NodeShell>
  );
}

"use client";

import type { NodeProps } from "@xyflow/react";
import type { GoDeeperFlowNode } from "@/lib/types";
import { ContentNode } from "./content-node";
import { ResultCatalogNode } from "./result-catalog-node";
import { useT } from "@/lib/i18n";

export function ResultNode(props: NodeProps<GoDeeperFlowNode>) {
  const t = useT();
  // 一次运行的多条答案收进目录卡；旧画布仍是每张卡一条答案。
  if (props.data.catalog?.items.length) {
    return <ResultCatalogNode {...props} />;
  }
  return <ContentNode {...props} label={t("resultNode")} />;
}

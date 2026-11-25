"use client";

import type { NodeProps } from "@xyflow/react";
import type { GoDeeperFlowNode } from "@/lib/types";
import { ContentNode } from "./content-node";
import { useT } from "@/lib/i18n";

export function TextNode(props: NodeProps<GoDeeperFlowNode>) {
  const t = useT();
  return <ContentNode {...props} label={t("textNode")} />;
}

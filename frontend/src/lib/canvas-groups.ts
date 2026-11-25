import type { Node } from "@xyflow/react";
import type { CanvasGroup, GoDeeperFlowNode, GoDeeperNodeData } from "@/lib/types";
import { BASE_NODE_WIDTH } from "@/data/node-defaults";
import { NODE_HEIGHT_BY_KIND } from "@/data/layout-constants";

export interface GroupFrameData extends GoDeeperNodeData {
  groupId: string;
  groupTitle: string;
  groupColor: string;
  groupNodeIds: string[];
}

export type GroupFrameNode = Node<GroupFrameData, "groupFrame">;

/** 区域框在成员包围盒外留出的间距；顶部多留一点给标题栏 */
const GROUP_PADDING = { left: 18, right: 18, bottom: 18, top: 44 };

function nodeSize(node: GoDeeperFlowNode) {
  return {
    width: node.measured?.width ?? node.data.width ?? BASE_NODE_WIDTH,
    height: node.measured?.height ?? NODE_HEIGHT_BY_KIND[node.data.kind] ?? 200,
  };
}

/**
 * 把分组元数据转成画布上的区域框节点。
 * 区域框只是视觉层：拖不动、选不中、不参与碰撞；store 里不保存这些派生节点。
 */
export function buildGroupFrames(
  groups: CanvasGroup[],
  nodes: GoDeeperFlowNode[],
): GroupFrameNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const frames: GroupFrameNode[] = [];

  for (const group of groups) {
    const members = group.nodeIds
      .map((id) => byId.get(id))
      .filter((node): node is GoDeeperFlowNode => Boolean(node));
    if (members.length === 0) continue;

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const member of members) {
      const size = nodeSize(member);
      left = Math.min(left, member.position.x);
      top = Math.min(top, member.position.y);
      right = Math.max(right, member.position.x + size.width);
      bottom = Math.max(bottom, member.position.y + size.height);
    }

    const x = left - GROUP_PADDING.left;
    const y = top - GROUP_PADDING.top;
    const width = right - left + GROUP_PADDING.left + GROUP_PADDING.right;
    const height = bottom - top + GROUP_PADDING.top + GROUP_PADDING.bottom;

    frames.push({
      id: `group-frame-${group.id}`,
      type: "groupFrame",
      position: { x, y },
      data: {
        kind: "text",
        title: group.title,
        body: "",
        width,
        groupId: group.id,
        groupTitle: group.title,
        groupColor: group.color,
        groupNodeIds: [...group.nodeIds],
      },
      style: { width, height },
      // 分组框是派生节点：尺寸变化不会写回 store，必须直接提供 measured，
      // 否则 React Flow 会把未测量的节点设为 visibility:hidden（表现为“Ctrl+G 没反应”）。
      measured: { width, height },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      // 与普通节点同为 0，但派生数组排在最前面，因此绘制在卡片下层。
      zIndex: 0,
    });
  }

  return frames;
}

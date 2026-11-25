import { LinkNode } from "@/components/nodes/link-node";
import { TaskNode } from "@/components/nodes/task-node";
import { TextNode } from "@/components/nodes/text-node";
import { ResultNode } from "@/components/nodes/result-node";
import { FreeNode } from "@/components/nodes/free-node";
import { InspireNode } from "@/components/nodes/inspire-node";
import { NoteNode } from "@/components/nodes/note-node";
import { FlowEdge } from "@/components/edges/flow-edge";

/**
 * 主画布与分享观看页共用同一套节点/连线渲染。
 * 分享页通过「节点 pointer-events: none」实现只读，避免两套视觉实现。
 */
export const nodeTypes = {
  linkNode: LinkNode,
  taskNode: TaskNode,
  textNode: TextNode,
  resultNode: ResultNode,
  freeNode: FreeNode,
  inspireNode: InspireNode,
  noteNode: NoteNode,
};

export const edgeTypes = {
  flow: FlowEdge,
};

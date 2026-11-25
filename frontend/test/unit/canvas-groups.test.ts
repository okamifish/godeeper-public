import { describe, expect, it } from "vitest";
import { buildNode } from "@/lib/canvas-store";
import { buildGroupFrames, type GroupFrameNode } from "@/lib/canvas-groups";
import { DEFAULT_GROUP_COLOR, normalizeGroups, pruneGroups } from "@/lib/group-model";

function node(id: string, x: number, y: number, width = 340) {
  return buildNode({ id, kind: "text", title: id, body: "", x, y, width });
}

describe("buildGroupFrames", () => {
  it("wraps members with padding without moving nodes", () => {
    const nodes = [
      node("a", 0, 0),
      node("b", 400, 120),
      node("outside", 900, 0),
    ];
    const frames = buildGroupFrames(
      [{ id: "g1", title: "Group", color: DEFAULT_GROUP_COLOR, nodeIds: ["a", "b"] }],
      nodes,
    );

    expect(frames).toHaveLength(1);
    const frame = frames[0] as GroupFrameNode;
    // 左 0 - 18；上 0 - 44；右 400 + 340 + 18；下 120 + 260（文本卡估算高度）+ 18
    expect(frame.position).toEqual({ x: -18, y: -44 });
    expect(frame.style?.width).toBe(400 + 340 + 18 + 18);
    expect(frame.style?.height).toBe(120 + 260 + 44 + 18);
    expect(frame.draggable).toBe(false);
    expect(frame.selectable).toBe(false);
    // 派生节点必须自带 measured，否则 React Flow 会把它设为 visibility:hidden
    expect(frame.measured).toEqual({
      width: 400 + 340 + 18 + 18,
      height: 120 + 260 + 44 + 18,
    });
    // 原节点坐标不变
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("skips groups whose members no longer exist", () => {
    const frames = buildGroupFrames(
      [{ id: "g1", title: "Group", color: DEFAULT_GROUP_COLOR, nodeIds: ["missing"] }],
      [],
    );
    expect(frames).toHaveLength(0);
  });
});

describe("normalizeGroups / pruneGroups", () => {
  it("drops invalid groups and keeps valid ones", () => {
    const groups = normalizeGroups([
      { id: "g1", title: "A", nodeIds: ["n1"] },
      { id: "", title: "bad", nodeIds: ["n2"] },
      { id: "g3", nodeIds: [] },
      "not-an-object",
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "g1", title: "A", nodeIds: ["n1"] });
  });

  it("removes stale members and empty groups", () => {
    const result = pruneGroups(
      [
        { id: "g1", title: "A", color: "blue", nodeIds: ["n1", "gone"] },
        { id: "g2", title: "B", color: "blue", nodeIds: ["gone"] },
      ],
      new Set(["n1"]),
    );

    expect(result).toEqual([
      { id: "g1", title: "A", color: "blue", nodeIds: ["n1"] },
    ]);
  });
});

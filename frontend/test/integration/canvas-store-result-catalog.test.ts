import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNode, toCanvasNodeSeed, useCanvasStore } from "@/lib/canvas-store";

vi.mock("zustand", async () => {
  return await vi.importActual<typeof import("zustand")>("zustand");
});

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  applyEdgeChanges: (_changes: unknown, edges: unknown) => edges,
  addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
  MarkerType: { ArrowClosed: "arrowClosed" },
}));

describe("mergeResultNodes", () => {
  beforeEach(() => {
    const task = buildNode({ id: "task-1", kind: "task", title: "问题", body: "问题", x: 0, y: 0 });
    const first = buildNode({ id: "r1", kind: "result", title: "答案 A", body: "正文 A", x: 400, y: 120 });
    const second = buildNode({ id: "r2", kind: "result", title: "答案 B", body: "正文 B", x: 400, y: 460 });

    useCanvasStore.setState({
      nodes: [task, first, second],
      edges: [
        { id: "e1", source: "task-1", target: "r1" },
        { id: "e2", source: "task-1", target: "r2" },
      ],
      selectedNodeId: "r1",
      selectedNodeIds: ["r1", "r2"],
    });
  });

  it("merges result cards into one catalog node with items and body", () => {
    useCanvasStore.getState().mergeResultNodes(["r1", "r2"]);

    const state = useCanvasStore.getState();
    const catalogs = state.nodes.filter((node) => node.data.catalog?.items.length);
    expect(catalogs).toHaveLength(1);
    expect(state.nodes.filter((node) => node.data.kind === "result")).toHaveLength(1);

    const catalog = catalogs[0];
    expect(catalog.data.catalog?.mode).toBe("answers");
    expect(catalog.data.catalog?.items.map((item) => item.title)).toEqual(["答案 A", "答案 B"]);
    expect(catalog.data.body).toContain("正文 A");
    expect(catalog.data.body).toContain("正文 B");
    expect(catalog.position.x).toBe(400);
    // 目录卡特宽，会与左侧任务卡重叠，因此向下避让
    expect(catalog.position.y).toBeGreaterThan(120);

    // 快照与导出都依赖 toCanvasNodeSeed，目录数据必须一起保存
    const seed = toCanvasNodeSeed(catalog);
    expect(seed.catalog?.items).toHaveLength(2);
    expect(seed.body).toContain("正文 B");
  });

  it("keeps the source edge and removes the old result edges", () => {
    useCanvasStore.getState().mergeResultNodes(["r1", "r2"]);

    const state = useCanvasStore.getState();
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0].source).toBe("task-1");
    const catalog = state.nodes.find((node) => node.data.catalog?.items.length);
    expect(state.edges[0].target).toBe(catalog?.id);
  });

  it("ignores a selection with fewer than two result nodes", () => {
    useCanvasStore.getState().mergeResultNodes(["r1"]);

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(3);
    expect(state.edges).toHaveLength(2);
  });

  it("materializes one answer into a task node and focuses it on repeat", () => {
    const task = buildNode({ id: "task-1", kind: "task", title: "问题", body: "问题", x: 0, y: 0 });
    const catalog = buildNode({
      id: "catalog-1",
      kind: "result",
      title: "结果目录",
      body: "答案 A\n正文 A\n\n答案 B\n正文 B",
      x: 400,
      y: 100,
      width: 820,
      catalog: {
        mode: "answers",
        items: [
          { id: "item-a", title: "答案 A", body: "正文 A" },
          { id: "item-b", title: "答案 B", body: "正文 B" },
        ],
        collapsed: false,
      },
    });
    useCanvasStore.setState({
      nodes: [task, catalog],
      edges: [{ id: "e1", source: "task-1", target: "catalog-1" }],
      selectedNodeId: "catalog-1",
      selectedNodeIds: ["catalog-1"],
    });

    const childId = useCanvasStore.getState().materializeCatalogItem("catalog-1", "item-a");
    expect(childId).toBeTruthy();

    const state = useCanvasStore.getState();
    const child = state.nodes.find((node) => node.id === childId);
    expect(child?.data.kind).toBe("task");
    expect(child?.data.title).toBe("答案 A");
    expect(child?.data.body).toContain("可执行步骤");
    expect(child?.data.body).toContain("正文 A");
    expect(child?.data.sourceCatalogKind).toBe("result");
    expect(child?.data.sourceCatalogId).toBe("catalog-1");
    expect(child?.data.sourceCatalogItemId).toBe("item-a");
    // 子任务只带这一条答案，目录卡被排除出上下文
    expect(child?.data.contextExcludedIds).toEqual(["catalog-1"]);
    expect(state.edges.some((edge) => edge.source === "catalog-1" && edge.target === childId)).toBe(true);

    const secondId = useCanvasStore.getState().materializeCatalogItem("catalog-1", "item-a");
    expect(secondId).toBe(childId);
    expect(useCanvasStore.getState().nodes.filter((node) => node.data.sourceCatalogItemId === "item-a")).toHaveLength(1);
  });

  it("collapses and restores a single extended item", () => {
    const task = buildNode({ id: "task-1", kind: "task", title: "问题", body: "问题", x: 0, y: 0 });
    const catalog = buildNode({
      id: "catalog-1",
      kind: "result",
      title: "结果",
      body: "答案 A\n正文 A",
      x: 0,
      y: 100,
      width: 820,
      catalog: {
        mode: "answers",
        items: [{ id: "item-a", title: "答案 A", body: "正文 A" }],
        collapsed: false,
      },
    });
    useCanvasStore.setState({
      nodes: [task, catalog],
      edges: [{ id: "e1", source: "task-1", target: "catalog-1" }],
      selectedNodeId: "catalog-1",
      selectedNodeIds: ["catalog-1"],
    });

    const childId = useCanvasStore.getState().materializeCatalogItem("catalog-1", "item-a");
    expect(childId).toBeTruthy();

    useCanvasStore.getState().toggleCatalogChild("catalog-1", "item-a");
    let state = useCanvasStore.getState();
    const collapsed = state.nodes.find((node) => node.id === childId);
    expect(collapsed?.data.catalogHidden).toBe(true);
    expect(collapsed?.hidden).toBe(true);
    expect(state.edges.find((edge) => edge.target === childId)?.hidden).toBe(true);

    useCanvasStore.getState().toggleCatalogChild("catalog-1", "item-a");
    state = useCanvasStore.getState();
    const restored = state.nodes.find((node) => node.id === childId);
    expect(restored?.data.catalogHidden).toBe(false);
    expect(restored?.hidden).toBe(false);
    expect(state.edges.find((edge) => edge.target === childId)?.hidden).toBe(false);
  });

  it("normalizes legacy resultItems into the unified catalog", () => {
    const legacy = buildNode({
      id: "legacy-catalog",
      kind: "result",
      title: "旧目录",
      body: "旧答案\n旧正文",
      x: 0,
      y: 0,
      resultItems: [{ id: "old-1", title: "旧答案", body: "旧正文" }],
      catalogCollapsed: true,
    });

    expect(legacy.data.catalog?.mode).toBe("answers");
    expect(legacy.data.catalog?.items).toHaveLength(1);
    expect(legacy.data.catalog?.collapsed).toBe(true);
  });
});

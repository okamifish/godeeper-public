import { normalizeNodeCatalog } from "@/lib/node-body";
import { createCanvasExport, parseCanvasExport } from "@/lib/canvas-export";
import type { CanvasNodeSeed } from "@/lib/types";

const anchor: CanvasNodeSeed = {
  id: "anchor-1",
  kind: "task",
  title: "什么是 RAG？",
  body: "什么是 RAG？",
  x: 0,
  y: 0,
  catalog: {
    mode: "directions",
    collapsed: false,
    summary: "RAG 是先检索再生成。",
    items: [
      {
        id: "d1",
        title: "RAG 解决了什么问题？",
        body: "RAG 解决了什么问题？",
        why: "先理解它存在的理由。",
        role: "foundation",
        recommended: true,
        dependsOn: [],
        source: "ai",
      },
    ],
  },
};

const child: CanvasNodeSeed = {
  id: "child-1",
  kind: "task",
  title: "RAG 解决了什么问题？",
  body: "RAG 解决了什么问题？",
  x: 900,
  y: 0,
  author: "ai",
  sourceCatalogId: "anchor-1",
  sourceCatalogItemId: "d1",
  catalogBackfill: "补上了主问题的动机层。",
};

describe("catalog directions", () => {
  it("keeps direction fields and summary", () => {
    const catalog = normalizeNodeCatalog({
      catalog: {
        mode: "directions",
        summary: "短答",
        collapsed: false,
        items: [
          {
            id: "d1",
            title: "问题一",
            body: "问题一正文",
            why: "为什么",
            role: "foundation",
            recommended: true,
            dependsOn: ["d0"],
            source: "ai",
          },
          {
            id: "d2",
            title: "问题二",
            body: "问题二正文",
            role: "compare",
            source: "user",
          },
          { id: "d3", title: "非法角色", body: "", role: "unknown" },
        ],
      },
    });

    expect(catalog?.mode).toBe("directions");
    expect(catalog?.summary).toBe("短答");
    expect(catalog?.items).toHaveLength(3);
    expect(catalog?.items[0]).toMatchObject({
      role: "foundation",
      recommended: true,
      dependsOn: ["d0"],
      source: "ai",
    });
    expect(catalog?.items[1]).toMatchObject({ role: "compare", source: "user" });
    expect(catalog?.items[2].role).toBeUndefined();
  });

  it("keeps answers mode unchanged", () => {
    const catalog = normalizeNodeCatalog({
      catalog: {
        mode: "answers",
        collapsed: true,
        items: [{ id: "a1", title: "答案", body: "内容", role: "foundation" }],
      },
    });

    expect(catalog?.mode).toBe("answers");
    expect(catalog?.collapsed).toBe(true);
    expect(catalog?.items[0].title).toBe("答案");
  });

  it("round-trips guideMode, directions and backfill through export", () => {
    const file = createCanvasExport({
      canvasName: "Guide",
      nodes: [anchor, child],
      edges: [],
      guideMode: true,
    });

    expect(file.guideMode).toBe(true);

    const parsed = parseCanvasExport(JSON.stringify(file));
    expect(parsed.guideMode).toBe(true);
    expect(parsed.nodes[0].catalog?.mode).toBe("directions");
    expect(parsed.nodes[0].catalog?.summary).toBe("RAG 是先检索再生成。");
    expect(parsed.nodes[0].catalog?.items[0].role).toBe("foundation");
    expect(parsed.nodes[1].catalogBackfill).toBe("补上了主问题的动机层。");
    expect(parsed.nodes[1].sourceCatalogItemId).toBe("d1");
  });

  it("deep clones catalog items during export", () => {
    const file = createCanvasExport({
      canvasName: "Guide",
      nodes: [anchor],
      edges: [],
      guideMode: true,
    });

    file.nodes[0].catalog!.items[0].title = "changed";
    expect(anchor.catalog!.items[0].title).toBe("RAG 解决了什么问题？");
  });
});

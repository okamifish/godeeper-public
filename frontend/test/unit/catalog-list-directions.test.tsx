import { render, screen, fireEvent } from "@testing-library/react";
import { TaskNode } from "@/components/nodes/task-node";
import { mockCanvasStore, mockTaskNode } from "../setup/test-utils";

vi.mock("@/lib/canvas-store", () => ({
  useCanvasStore: vi.fn((selector) => {
    const state = mockCanvasStore;
    return selector ? selector(state) : state;
  }),
}));

const guideData = {
  ...mockTaskNode.data,
  title: "什么是 RAG？",
  body: "什么是 RAG？",
  catalog: {
    mode: "directions" as const,
    collapsed: false,
    summary: "RAG 是先检索再生成。",
    items: [
      {
        id: "d1",
        title: "RAG 解决了什么问题？",
        body: "RAG 解决了什么问题？",
        why: "先理解它存在的理由。",
        role: "foundation" as const,
        recommended: true,
        source: "ai" as const,
      },
      {
        id: "d2",
        title: "它和微调有什么区别？",
        body: "它和模型微调有什么区别？",
        why: "两种改造模型的边界。",
        role: "compare" as const,
        dependsOn: ["d1"],
        source: "ai" as const,
      },
      {
        id: "d3",
        title: "什么情况下不该用？",
        body: "什么情况下不应该使用 RAG？",
        role: "judgement" as const,
        source: "ai" as const,
      },
    ],
  },
};

describe("guidance catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the short answer, directions and cognitive tags", () => {
    const { container } = render(<TaskNode id="guide-1" data={guideData} selected={false} />);

    expect(screen.getByText("RAG 是先检索再生成。")).toBeInTheDocument();
    expect(screen.getByText("3 directions")).toBeInTheDocument();
    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(screen.getByText("Compare")).toBeInTheDocument();
    expect(screen.getByText("Judge")).toBeInTheDocument();
    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(container.querySelector(".guide-prereq")?.textContent).toContain("01");
    // 引导锚点已生成路径时不再显示普通运行按钮
    expect(screen.getByText("Path ready")).toBeInTheDocument();
    expect(screen.queryByText("RUN TASK")).not.toBeInTheDocument();
  });

  it("materializes a direction when its row is clicked", () => {
    const { container } = render(<TaskNode id="guide-1" data={guideData} selected={false} />);

    const firstItem = container.querySelector(".result-catalog-item");
    expect(firstItem).not.toBeNull();
    fireEvent.click(firstItem!);

    expect(mockCanvasStore.materializeCatalogItem).toHaveBeenCalledWith("guide-1", "d1");
  });

  it("adds a user direction without overwriting the question", () => {
    render(<TaskNode id="guide-1" data={guideData} selected={false} />);

    fireEvent.click(screen.getByText(/Add your own direction/));
    const input = screen.getByPlaceholderText("Type a question to explore");
    fireEvent.change(input, { target: { value: "我该先学什么？" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockCanvasStore.updateNodeData).toHaveBeenCalled();
    const patch = mockCanvasStore.updateNodeData.mock.calls[0][1] as {
      catalog?: { items: Array<{ title: string; source?: string }> };
      body?: string;
    };
    expect(patch.catalog?.items).toHaveLength(4);
    expect(patch.catalog?.items[3]).toMatchObject({ title: "我该先学什么？", source: "user" });
    expect(patch).not.toHaveProperty("body");
  });

  it("shows the backfill and returns to the anchor from a guide child", () => {
    render(
      <TaskNode
        id="child-1"
        data={{
          ...mockTaskNode.data,
          author: "ai",
          body: "RAG 解决了什么问题？",
          sourceCatalogId: "anchor-1",
          sourceCatalogItemId: "d1",
          catalogBackfill: "补上了主问题的动机层。",
        }}
        selected={false}
      />,
    );

    expect(screen.getByText("补上了主问题的动机层。")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to index"));

    expect(mockCanvasStore.selectNode).toHaveBeenCalledWith("anchor-1");
    expect(mockCanvasStore.focusNode).toHaveBeenCalledWith("anchor-1");
  });

  it("keeps the user's question visible and editable", () => {
    render(<TaskNode id="guide-1" data={guideData} selected={false} />);

    expect(screen.getByText("Question")).toBeInTheDocument();
    expect(screen.getAllByText("什么是 RAG？").length).toBeGreaterThan(0);
  });
});

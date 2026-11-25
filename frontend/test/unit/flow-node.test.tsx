import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextNode } from "@/components/nodes/text-node";
import { TaskNode } from "@/components/nodes/task-node";
import { LinkNode } from "@/components/nodes/link-node";
import { ResultNode } from "@/components/nodes/result-node";
import { FreeNode } from "@/components/nodes/free-node";
import { NoteNode } from "@/components/nodes/note-node";
import { mockNode, mockTaskNode, mockLinkNode, mockCanvasStore } from "../setup/test-utils";

vi.mock("@/lib/canvas-store", () => ({
  useCanvasStore: vi.fn((selector) => {
    const state = mockCanvasStore;
    return selector ? selector(state) : state;
  }),
}));

describe("FlowNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Text Node", () => {
    it("renders text node with correct content", () => {
      render(<TextNode id={mockNode.id} data={mockNode.data} selected={false} />);

      expect(screen.getByText("Test Node Title")).toBeInTheDocument();
      expect(screen.getByText("Test node body content")).toBeInTheDocument();
      expect(screen.getByText("TEXT NODE")).toBeInTheDocument();
    });

    it("shows metadata correctly", () => {
      render(<TextNode id={mockNode.id} data={mockNode.data} selected={false} />);

      expect(screen.getByText("created now")).toBeInTheDocument();
      expect(screen.getByText("connected x1")).toBeInTheDocument();
    });

    it("calls selectNode on click", () => {
      render(<TextNode id={mockNode.id} data={mockNode.data} selected={false} />);

      const node = screen.getByText("Test Node Title").closest("div");
      if (node) {
        fireEvent.click(node);
        expect(mockCanvasStore.selectNode).toHaveBeenCalledWith(mockNode.id);
      }
    });

    it("applies selected class when selected", () => {
      const { container } = render(
        <TextNode id={mockNode.id} data={mockNode.data} selected={true} />
      );

      expect(container.querySelector(".selected")).toBeInTheDocument();
    });

    it("renders Markdown in the title and body", () => {
      const { container } = render(
        <TextNode
          id={mockNode.id}
          data={{
            ...mockNode.data,
            title: "**Bold** title",
            body: "- one\n- two",
          }}
          selected={false}
        />,
      );

      expect(container.querySelector(".node-title strong")).toHaveTextContent("Bold");
      expect(container.querySelectorAll(".node-body li")).toHaveLength(2);
    });

    it("keeps rendered text selectable so it can be dragged into the concept panel", () => {
      const { container } = render(
        <TextNode id={mockNode.id} data={mockNode.data} selected={false} />,
      );

      expect(container.querySelector(".node-markdown")).toHaveClass("nodrag");
    });

    it("does not show modifier hints while a dialog is open", () => {
      render(<TextNode id={mockNode.id} data={mockNode.data} selected={false} />);

      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      document.body.appendChild(dialog);

      fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
      expect(screen.queryByText(/Ctrl\/Alt|Ctrl\+Shift/)).not.toBeInTheDocument();

      dialog.remove();
    });
  });

  describe("Note Node", () => {
    it("renders the current page image and its Markdown", () => {
      render(
        <NoteNode
          id="note-1"
          data={{
            kind: "note",
            title: "笔记",
            body: "",
            width: 760,
            notePages: [
              {
                id: "page-1",
                imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
                width: 800,
                height: 600,
                ocrMarkdown: "# 第一页\n\n- 识别出一条内容",
                status: "done",
              },
            ],
            noteActivePage: 0,
          }}
          selected={false}
        />,
      );

      expect(screen.getByText("NOTE CARD")).toBeInTheDocument();
      expect(screen.getByText("第一页")).toBeInTheDocument();
      expect(screen.getByText("识别出一条内容")).toBeInTheDocument();
    });
  });

  describe("Task Node", () => {
    it("renders task node with correct content", () => {
      render(<TaskNode id={mockTaskNode.id} data={mockTaskNode.data} selected={false} />);

      expect(screen.getByText("Test Task")).toBeInTheDocument();
      expect(screen.getByText("Test task prompt content")).toBeInTheDocument();
      expect(screen.getByText("TASK NODE")).toBeInTheDocument();
    });

    it("renders a result-extension task as a normal task, not a guide task", () => {
      const data = {
        ...mockTaskNode.data,
        author: "ai" as const,
        sourceCatalogId: "catalog-1",
        sourceCatalogKind: "result" as const,
        body: "请基于下面这条要点，输出可执行步骤。",
      };
      render(<TaskNode id="extended-task" data={data} selected={false} />);

      expect(screen.getByText("TASK NODE")).toBeInTheDocument();
      expect(screen.queryByText("GUIDE TASK")).not.toBeInTheDocument();
    });

    it("shows context chips", () => {
      render(<TaskNode id={mockTaskNode.id} data={mockTaskNode.data} selected={false} />);

      expect(screen.getByText("context 1")).toBeInTheDocument();
      expect(screen.getByText("context 2")).toBeInTheDocument();
    });

    it("does not show task type or provenance chips", () => {
      render(<TaskNode id={mockTaskNode.id} data={mockTaskNode.data} selected={false} />);

      expect(screen.queryByText("Question")).not.toBeInTheDocument();
      expect(screen.queryByText("You asked")).not.toBeInTheDocument();
      expect(screen.queryByText("AI suggested")).not.toBeInTheDocument();
    });

    it("does not render the old AI ask or challenge buttons", () => {
      render(<TaskNode id={mockTaskNode.id} data={mockTaskNode.data} selected={false} />);

      expect(screen.queryByText("Ask AI")).not.toBeInTheDocument();
      expect(screen.queryByText("Challenge")).not.toBeInTheDocument();
    });

    it("renders AI inspiration tasks with the pink inspire theme", () => {
      const { container } = render(
        <TaskNode
          id="ai-task"
          data={{ ...mockTaskNode.data, id: "ai-task", author: "ai", inspireAction: "challenge" }}
          selected={false}
        />,
      );

      expect(screen.getByText("Challenge")).toBeInTheDocument();
      expect(container.querySelector(".flow-node-inspire")).toBeInTheDocument();
    });

    it("keeps the legacy inspire reason visible on the unified task card", () => {
      render(
        <TaskNode
          id="legacy-inspire"
          data={{
            ...mockTaskNode.data,
            id: "legacy-inspire",
            author: "ai",
            legacyKind: "inspire",
            inspireReason: "Because it changes the baseline.",
            inspirePrerequisites: ["Know the baseline"],
          }}
          selected={false}
        />,
      );

      expect(screen.getByText("Because it changes the baseline.")).toBeInTheDocument();
      expect(screen.getByText("Know the baseline")).toBeInTheDocument();
    });

    it("shows only the prompt editor when a task has no title", () => {
      const { container } = render(
        <TaskNode
          id="untitled-task"
          data={{ ...mockTaskNode.data, title: "", body: "输入问题" }}
          selected={false}
        />,
      );

      expect(container.querySelector(".node-title")).not.toBeInTheDocument();
      expect(container.querySelector(".prompt-edit-textarea")).toBeInTheDocument();
    });

    it("renders Markdown in the task prompt", () => {
      const { container } = render(
        <TaskNode
          id="md-task"
          data={{ ...mockTaskNode.data, body: "**Important** prompt" }}
          selected={false}
        />,
      );

      expect(container.querySelector(".prompt-box strong")).toHaveTextContent("Important");
    });

    it("shows model pill", () => {
      render(<TaskNode id={mockTaskNode.id} data={mockTaskNode.data} selected={false} />);

      expect(screen.getByText("GPT-5")).toBeInTheDocument();
    });

    it("shows run button", () => {
      render(<TaskNode id={mockTaskNode.id} data={mockTaskNode.data} selected={false} />);

      expect(screen.getByText("RUN TASK")).toBeInTheDocument();
    });

    it("calls runTask when run button clicked", () => {
      render(<TaskNode id={mockTaskNode.id} data={mockTaskNode.data} selected={false} />);

      const runButton = screen.getByText("RUN TASK");
      fireEvent.click(runButton);

      expect(mockCanvasStore.runTask).toHaveBeenCalledWith(mockTaskNode.id);
    });

    it("shows running status when task is running", () => {
      const runningTask = {
        ...mockTaskNode,
        data: { ...mockTaskNode.data, taskStatus: "running" as const, metaRight: "RUNNING" },
      };

      render(<TaskNode id={runningTask.id} data={runningTask.data} selected={false} />);

      expect(screen.getByText("STOP")).toBeInTheDocument();
    });
  });

  describe("Link Node", () => {
    it("renders link node with preview", () => {
      render(<LinkNode id={mockLinkNode.id} data={mockLinkNode.data} selected={false} />);

      expect(screen.getByText("Test Source")).toBeInTheDocument();
      expect(screen.getByText("https://example.com/article")).toBeInTheDocument();
      expect(screen.getByText("SOURCE NODE")).toBeInTheDocument();
    });

    it("shows preview badge", () => {
      render(<LinkNode id={mockLinkNode.id} data={mockLinkNode.data} selected={false} />);

      expect(screen.getByText("Analyzing")).toBeInTheDocument();
    });

    it("shows source metadata", () => {
      render(<LinkNode id={mockLinkNode.id} data={mockLinkNode.data} selected={false} />);

      expect(screen.getByText("web source")).toBeInTheDocument();
      expect(screen.getByText("parsed")).toBeInTheDocument();
    });
  });

  describe("Result Node", () => {
    it("renders result node correctly", () => {
      const resultNode = {
        id: "result-1",
        data: {
          kind: "result" as const,
          title: "Result Title",
          body: "Result Body",
          metaLeft: "generated",
          metaRight: "streaming",
        },
      };

      render(<ResultNode id={resultNode.id} data={resultNode.data} selected={false} />);

      expect(screen.getByText("Result Title")).toBeInTheDocument();
      expect(screen.getByText("RESULT NODE")).toBeInTheDocument();
    });
  });

  describe("Free Node", () => {
    it("renders free node correctly", () => {
      const freeNode = {
        id: "free-1",
        data: {
          kind: "free" as const,
          title: "Floating Thought",
          body: "Random idea",
          metaLeft: "floating thought",
          metaRight: "unconnected",
        },
      };

      render(<FreeNode id={freeNode.id} data={freeNode.data} selected={false} />);

      expect(screen.getByText("Floating Thought")).toBeInTheDocument();
      expect(screen.getByText("FREE NODE")).toBeInTheDocument();
    });
  });
});

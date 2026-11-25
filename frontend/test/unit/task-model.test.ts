import { describe, it, expect } from "vitest";
import type { CanvasNodeSeed } from "@/lib/types";
import {
  buildAiQuestionSeed,
  buildTaskInquiryContext,
  collectAiQuestionTexts,
  detectTaskType,
  getTaskAuthor,
  getTaskType,
  normalizeQuestionText,
  normalizeTaskNodeFields,
  summarizeTaskProvenance,
} from "@/lib/task-model";

function taskNode(overrides: Partial<CanvasNodeSeed> = {}): CanvasNodeSeed {
  return {
    id: "task-1",
    kind: "task",
    title: "What should I read first?",
    body: "What should I read first?",
    x: 0,
    y: 0,
    ...overrides,
  };
}

function legacyInspireNode(overrides: Partial<CanvasNodeSeed> = {}): CanvasNodeSeed {
  return {
    id: "inspire-1",
    kind: "inspire",
    title: "Why does this paper matter?",
    body: "Because it changes the baseline.",
    x: 0,
    y: 0,
    inspireQuestion: "Why does this paper matter?",
    inspireReason: "Because it changes the baseline.",
    inspirePrerequisites: ["Know the baseline"],
    ...overrides,
  };
}

describe("task model", () => {
  describe("normalizeTaskNodeFields", () => {
    it("maps a legacy inspire node to a question task without losing its legacy fields", () => {
      const legacy = legacyInspireNode();
      const normalized = normalizeTaskNodeFields(legacy);

      expect(normalized.kind).toBe("inspire");
      expect(normalized.taskType).toBe("question");
      expect(normalized.author).toBe("ai");
      expect(normalized.adopted).toBe(true);
      expect(normalized.legacyKind).toBe("inspire");
      expect(normalized.body).toBe("Why does this paper matter?");
      expect(normalized.summary).toBe("Because it changes the baseline.");
      expect(normalized.inspireQuestion).toBe("Why does this paper matter?");
      expect(normalized.inspireReason).toBe("Because it changes the baseline.");
      expect(normalized.inspirePrerequisites).toEqual(["Know the baseline"]);
    });

    it("does not mutate the input node", () => {
      const legacy = legacyInspireNode();
      normalizeTaskNodeFields(legacy);

      expect(legacy.body).toBe("Because it changes the baseline.");
      expect(legacy.taskType).toBeUndefined();
    });

    it("defaults a task to a user-authored question", () => {
      const normalized = normalizeTaskNodeFields(taskNode());

      expect(normalized.taskType).toBe("question");
      expect(normalized.author).toBe("user");
      expect(normalized.adopted).toBe(true);
      expect(normalized.body).toBe("What should I read first?");
    });

    it("keeps an explicit AI task provenance", () => {
      const normalized = normalizeTaskNodeFields(
        taskNode({
          taskType: "verify",
          author: "ai",
          adopted: true,
          editedByUser: true,
        }),
      );

      expect(normalized.taskType).toBe("verify");
      expect(normalized.author).toBe("ai");
      expect(normalized.editedByUser).toBe(true);
    });
  });

  describe("detectTaskType", () => {
    it("detects Chinese task intents from the prompt", () => {
      expect(detectTaskType("请总结这些节点")).toBe("summary");
      expect(detectTaskType("找出这个观点中的漏洞")).toBe("critique");
      expect(detectTaskType("比较 A 和 B 的优劣")).toBe("compare");
      expect(detectTaskType("核实这条信息是否真实")).toBe("verify");
      expect(detectTaskType("分析一下原因")).toBe("analysis");
      expect(detectTaskType("围绕这个主题做调研")).toBe("research");
      expect(detectTaskType("推导出下一步结论")).toBe("derive");
      expect(detectTaskType("写成一份报告")).toBe("report");
    });

    it("detects English task intents from the prompt", () => {
      expect(detectTaskType("summarize the discussion")).toBe("summary");
      expect(detectTaskType("find the flaws in this claim")).toBe("critique");
      expect(detectTaskType("compare A and B")).toBe("compare");
      expect(detectTaskType("verify this fact")).toBe("verify");
    });

    it("falls back to question when nothing specific is found", () => {
      expect(detectTaskType("为什么会这样")).toBe("question");
      expect(detectTaskType("")).toBe("question");
    });
  });

  describe("getTaskType / getTaskAuthor", () => {
    it("prefers the type detected from the prompt over the stored type", () => {
      expect(getTaskType({ kind: "task", title: "", body: "请总结一下", taskType: "question" })).toBe("summary");
    });

    it("returns a valid explicit task type", () => {
      expect(getTaskType({ kind: "task", title: "", body: "", taskType: "critique" })).toBe("critique");
    });

    it("falls back to question for legacy inspire nodes", () => {
      expect(getTaskType({ kind: "inspire", title: "", body: "" })).toBe("question");
    });

    it("infers AI authorship from a legacy inspire node", () => {
      expect(getTaskAuthor({ kind: "inspire", title: "", body: "" })).toBe("ai");
    });

    it("defaults ordinary tasks to user authorship", () => {
      expect(getTaskAuthor({ kind: "task", title: "", body: "" })).toBe("user");
    });

    it("respects explicit AI authorship", () => {
      expect(getTaskAuthor({ kind: "task", title: "", body: "", author: "ai" })).toBe("ai");
    });
  });

  describe("collectAiQuestionTexts", () => {
    it("collects legacy and AI-authored question texts, ignoring user tasks", () => {
      const nodes: CanvasNodeSeed[] = [
        legacyInspireNode(),
        taskNode({
          id: "ai-task",
          title: "What is the counterargument?",
          body: "What is the counterargument?",
          author: "ai",
        }),
        taskNode({ id: "user-task", title: "My question", body: "My question" }),
      ];

      expect(collectAiQuestionTexts(nodes)).toEqual([
        "Why does this paper matter?",
        "What is the counterargument?",
      ]);
    });

    it("deduplicates questions that differ only by punctuation, space and case", () => {
      const nodes: CanvasNodeSeed[] = [
        legacyInspireNode({ inspireQuestion: "Why does this matter?" }),
        taskNode({ id: "ai-2", title: "why does this matter", body: "why does this matter", author: "ai" }),
      ];

      expect(collectAiQuestionTexts(nodes)).toEqual(["Why does this matter?"]);
    });
  });

  describe("normalizeQuestionText", () => {
    it("removes whitespace, punctuation and case differences", () => {
      const normalized = normalizeQuestionText(" Why does this matter?! ");
      expect(normalized).toBe(normalizeQuestionText("why does this matter"));
      expect(normalizeQuestionText("WHY DOES THIS MATTER")).toBe(
        normalizeQuestionText("why does this matter?"),
      );
    });
  });

  describe("buildTaskInquiryContext", () => {
    it("includes the current question, ancestors and existing AI questions", () => {
      const context = buildTaskInquiryContext(
        taskNode({ title: "What is the gap?", body: "What is the gap?" }),
        [taskNode({ id: "root", title: "What is the field?", body: "What is the field?" })],
        ["Why does this matter?"],
        "Do not repeat existing questions.",
      );

      expect(context).toContain('Current node: "What is the gap?"');
      expect(context).toContain("What is the field?");
      expect(context).toContain("- Why does this matter?");
      expect(context).toContain("Do not repeat existing questions.");
    });
  });

  describe("summarizeTaskProvenance", () => {
    it("counts user questions, AI questions, edited AI questions and AI results", () => {
      const summary = summarizeTaskProvenance([
        taskNode({ id: "user-task", author: "user" }),
        taskNode({ id: "ai-task", author: "ai" }),
        taskNode({ id: "ai-edited", author: "ai", editedByUser: true }),
        legacyInspireNode(),
        { id: "result", kind: "result", title: "AI result", body: "" },
        { id: "text", kind: "text", title: "Note", body: "" },
      ]);

      expect(summary.userQuestions).toBe(1);
      expect(summary.aiQuestions).toBe(3);
      expect(summary.aiEditedQuestions).toBe(1);
      expect(summary.aiResults).toBe(1);
    });
  });

  describe("buildAiQuestionSeed", () => {
    it("creates a real question task with AI provenance and no candidate state", () => {
      const seed = buildAiQuestionSeed({
        id: "ai-task-1",
        question: "What assumption is this argument hiding?",
        reason: "It exposes the unstated premise.",
        prerequisites: ["List the premises"],
        modelName: "GPT-5",
        metaRight: "RUN TASK",
        x: 500,
        y: 100,
        width: 380,
        now: "2026-10-30T12:00:00.000Z",
      });

      expect(seed.id).toBe("ai-task-1");
      expect(seed.kind).toBe("task");
      expect(seed.taskType).toBe("question");
      expect(seed.author).toBe("ai");
      expect(seed.adopted).toBe(true);
      expect(seed.adoptedAt).toBe("2026-10-30T12:00:00.000Z");
      expect(seed.editedByUser).toBe(false);
      expect(seed.inspireAction).toBe("inspire");
      expect(seed.title).toBe("What assumption is this argument hiding?");
      expect(seed.body).toBe("What assumption is this argument hiding?");
      expect(seed.summary).toBe("It exposes the unstated premise.");
      expect(seed.inspireQuestion).toBe("What assumption is this argument hiding?");
      expect(seed.inspireReason).toBe("It exposes the unstated premise.");
      expect(seed.inspirePrerequisites).toEqual(["List the premises"]);
      expect(seed.taskStatus).toBe("idle");
      expect(seed.x).toBe(500);
      expect(seed.y).toBe(100);
      expect(seed.width).toBe(380);
    });
  });
});

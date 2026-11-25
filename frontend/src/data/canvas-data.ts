import { CanvasState } from "@/lib/types";

export const initialCanvas: CanvasState = {
  selectedNodeId: "n-welcome",
  nodes: [
    {
      id: "n-welcome",
      kind: "text",
      title: "欢迎使用 GoDeeper",
      body:
        "这是一个空间推理画布。每个节点代表一个想法——把它们连起来构建思维图谱。双击节点可编辑，从右侧小圆点拖出连线。",
      x: 60,
      y: 140,
      metaLeft: "文本节点",
      metaRight: "从这里开始",
      isSelected: true
    },
    {
      id: "n-task-demo",
      kind: "task",
      title: "运行 AI 推理任务",
      body:
        "任务节点会将你的问题发送给 AI。点击提示词区域编辑问题，然后点击运行按钮。结果会作为新的分支节点出现。",
      x: 460,
      y: 80,
      width: 380,
      metaLeft: "",
      metaRight: "运行任务",
      chips: ["点击编辑提示词", "结果会自动分支"],
      taskStatus: "idle"
    },
    {
      id: "n-link-demo",
      kind: "link",
      title: "GoDeeper 产品文档",
      body:
        "链接节点可以导入网页或文本内容。粘贴一个 URL 到导入框中，AI 会自动提取关键信息并生成节点。",
      x: 460,
      y: 540,
      width: 380,
      metaLeft: "来源",
      metaRight: "已导入",
      url: "https://example.com/docs/spatial-reasoning",
      sourceLabel: "example.com/docs",
      thumbnailUrl: "https://placehold.co/380x120/e8e6e3/666?text=GoDeeper+Docs",
      summary: "空间推理画布的核心概念：节点、连线、AI 分支推理、思维图谱构建方法。",
      keyPoints: [
        { text: "每个节点代表一个独立观点", body: "", expanded: false },
        { text: "AI 生成的结果会形成平行分支", body: "", expanded: false },
        { text: "支持 Ctrl+点击追踪完整推理路径", body: "", expanded: false },
      ],
    },
    {
      id: "n-result-demo",
      kind: "result",
      title: "AI 生成的结果",
      body:
        "结果节点由 AI 自动创建。每次运行任务都会生成新的结果节点，形成平行分支，方便对比不同的推理路径。",
      x: 980,
      y: 80,
      width: 340,
      metaLeft: "结果",
      metaRight: "自动生成",
    },
    {
      id: "n-free-demo",
      kind: "free",
      title: "自由想法",
      body:
        "在画布空白处双击即可创建自由节点。适用于随手记录灵感，不一定需要连接到其他节点。",
      x: 60,
      y: 640,
      width: 300,
      metaLeft: "自由想法",
      metaRight: "未连接"
    },
    {
      id: "n-inspire-demo",
      kind: "inspire",
      title: "如果把「节点」换成「问题」会怎样？",
      body:
        "启发节点只记录值得继续追问的方向，不重复画布上已有的问题。选中任意节点后点右上角灯泡，AI 会生成一个新的提问方向。",
      x: 980,
      y: 540,
      width: 340,
      metaLeft: "启发",
      metaRight: "AI 生成",
      inspireQuestion: "如果把这张图里的「节点」全部换成「问题」，图会变成什么形状？",
      inspireReason:
        "现在每个节点记录的是一个结论。把结论换成问题，能立刻看出哪些分支其实还没有真正想过。",
      inspirePrerequisites: ["先列出 3 个已有结论", "给每个结论写一句反问"],
    },
  ],
  edges: [
    { id: "e-welcome-task", source: "n-welcome", target: "n-task-demo", active: true },
    { id: "e-welcome-link", source: "n-welcome", target: "n-link-demo", active: true },
    { id: "e-task-result", source: "n-task-demo", target: "n-result-demo", active: true },
  ],
  timeline: []
};

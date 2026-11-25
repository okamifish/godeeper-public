import type { Metadata } from "next";
import { FileText, Lightbulb, Link2, PenLine, Sparkles, StickyNote } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "节点卡片预览 · 类型图标版",
};

interface CardSpec {
  kind: string;
  label: string;
  icon: LucideIcon;
  title: string;
  body: string;
  metaLeft: string;
  metaRight: string;
  note: string;
}

const CARDS: CardSpec[] = [
  {
    kind: "text",
    label: "TEXT NODE",
    icon: PenLine,
    title: "把「多方案」写成可比较的决策卡",
    body:
      "每个方案都记录它解决什么、代价是什么、什么条件下该选它。复盘时能直接看到当时的取舍，" +
      "而不是只看到最后留下来的那一条。",
    metaLeft: "刚刚",
    metaRight: "3 个分支",
    note: "文本节点 · 笔尖：写下的是想法本身，不是任务，也不是结论",
  },
  {
    kind: "task",
    label: "TASK NODE",
    icon: Sparkles,
    title: "对比三个方案的成本与迁移代价",
    body:
      "让 AI 从成本、维护性、迁移代价三个维度给每个方案打分，并标出不可逆的动作。",
    metaLeft: "排队中",
    metaRight: "3 个模型",
    note: "任务节点 · 星芒：交给 AI 去做的事，还没产出结果",
  },
  {
    kind: "link",
    label: "LINK NODE",
    icon: Link2,
    title: "参考：便签卡排版拆解",
    body:
      "从参考图里量出白边、圆角、标题字号与行高，作为这次卡片皮肤的依据。",
    metaLeft: "链接",
    metaRight: "已解析",
    note: "链接节点 · 链条：从外部带进来的一条来源",
  },
  {
    kind: "result",
    label: "RESULT NODE",
    icon: FileText,
    title: "结论：方案 A 更适合当前阶段",
    body:
      "方案 A 改动最小、可回滚，代价是短期内要多维护一套解析逻辑。",
    metaLeft: "生成于 2 分钟前",
    metaRight: "已保存",
    note: "结果节点 · 文稿：已经落地的输出，可以引用、可以复制",
  },
  {
    kind: "free",
    label: "FREE NODE",
    icon: StickyNote,
    title: "一个还没拆完的想法：卡片即笔记",
    body:
      "如果每张卡片都能自己长出分支，那笔记和画布就不用分成两个产品。",
    metaLeft: "刚刚",
    metaRight: "未分类",
    note: "自由节点 · 便签纸：随手贴上的碎片，还没决定它属于哪一类",
  },
  {
    kind: "inspire",
    label: "INSPIRE",
    icon: Lightbulb,
    title: "让卡片按内容自动换一种便签色？",
    body:
      "颜色如果能跟着语义走，扫一眼画布就能分出哪些是任务、哪些是结论。",
    metaLeft: "启发",
    metaRight: "点击展开",
    note: "启发节点 · 灯泡：系统抛回来的一句话，等你决定要不要接",
  },
];

/**
 * 只读预览页：把 globals.css 里的 `.flow-node--note` 皮肤套在各类节点卡上。
 * 不接 store、不写数据，只用来肉眼验收样式；确认后再决定是否接到画布节点。
 */
function NoteCard({ spec }: { spec: CardSpec }) {
  const Icon = spec.icon;
  return (
    <div
      className={`flow-node flow-node--note flow-node-${spec.kind}`}
      style={{ width: 340 }}
    >
      <span className="node-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={2.1} />
      </span>
      <div className="node-inner">
        <span className="node-chip">{spec.label}</span>
        <h2 className="node-title">{spec.title}</h2>
        <p className="node-body">{spec.body}</p>
        <div className="node-footer">
          <span>{spec.metaLeft}</span>
          <span>{spec.metaRight}</span>
        </div>
      </div>
    </div>
  );
}

const pageCss = `
  .ncp-page {
    min-height: 100vh;
    padding: 96px 32px 120px;
    background-color: #f4f4f4;
    background-image:
      repeating-linear-gradient(0deg, rgba(0,0,0,.016) 0 1px, transparent 1px 72px),
      repeating-linear-gradient(90deg, rgba(0,0,0,.016) 0 1px, transparent 1px 72px);
    font-family: var(--font-body), system-ui, sans-serif;
  }
  .ncp-head {
    max-width: 1180px;
    margin: 0 auto 80px;
  }
  .ncp-eyebrow {
    margin-bottom: 10px;
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: #8a6410;
  }
  .ncp-title {
    margin: 0;
    font-family: var(--font-display), sans-serif;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -.02em;
    color: #1f1f1f;
  }
  .ncp-sub {
    margin: 10px 0 0;
    max-width: 680px;
    font-size: 14.5px;
    line-height: 1.6;
    color: #5f5f5f;
  }
  .ncp-stage {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 76px 40px;
    max-width: 1180px;
    margin: 0 auto;
    align-items: start;
  }
  .ncp-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 0;
  }
  /* 仅预览页用：把六张卡拉成等高，方便横向比较图标与配色
     （真实画布里的高度仍由内容决定） */
  .ncp-item .flow-node {
    display: flex;
    flex-direction: column;
    min-height: 300px;
  }
  .ncp-item .flow-node .node-inner {
    flex: 1 1 auto;
  }
  .ncp-caption {
    margin-top: 34px;
    text-align: center;
    max-width: 320px;
  }
  .ncp-caption b {
    display: block;
    font-family: var(--font-mono), monospace;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: #3d3d3d;
  }
  .ncp-caption span {
    display: block;
    margin-top: 6px;
    font-size: 12.5px;
    line-height: 1.6;
    color: #8a8a8a;
  }
  .ncp-foot {
    max-width: 1180px;
    margin: 96px auto 0;
    padding-top: 20px;
    border-top: 1px solid rgba(0,0,0,.08);
    font-size: 12.5px;
    line-height: 1.65;
    color: #7a7a7a;
  }
  .ncp-foot code {
    font-family: var(--font-mono), monospace;
    font-size: 11.5px;
    color: #444;
  }
  @media (max-width: 760px) {
    .ncp-page { padding: 64px 16px 96px; }
    .ncp-stage { gap: 64px; grid-template-columns: 1fr; }
  }
`;

export default function NodeCardPreviewPage() {
  return (
    <main className="ncp-page">
      <style>{pageCss}</style>

      <header className="ncp-head">
        <p className="ncp-eyebrow">GoDeeper · Node card skin</p>
        <h1 className="ncp-title">六类节点 · 右上角类型图标</h1>
        <p className="ncp-sub">
          原来放图钉的位置，改成一枚 42px 的圆角图标徽章，放在卡片右上角、只向卡外探出约 1/3：
          底色取该节点的强调色，图标用线性符号表达这一类节点是干什么的。
          文字、留白、投影完全一致，只有图标和色系不同。
        </p>
      </header>

      <section className="ncp-stage">
        {CARDS.map((spec) => (
          <figure className="ncp-item" key={spec.kind}>
            <NoteCard spec={spec} />
            <figcaption className="ncp-caption">
              <b>
                {spec.kind} · {spec.label}
              </b>
              <span>{spec.note}</span>
            </figcaption>
          </figure>
        ))}
      </section>

      <p className="ncp-foot">
        实现：<code>frontend/src/app/globals.css</code> 中的 <code>.flow-node--note</code> +
        <code> .node-icon</code>（全部 opt-in，旧节点不受影响）。图标来自项目已装的
        <code> lucide-react</code>：文本 PenLine / 任务 Sparkles / 链接 Link2 / 结果 FileText /
        自由 StickyNote / 启发 Lightbulb。hover 抬升 4px，选中态用强调色描边并给图标加一圈光环。
      </p>
    </main>
  );
}

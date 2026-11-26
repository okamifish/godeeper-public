"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { StarReward } from "@/components/nodes/star-reward";

type Variant = "pop" | "bounce" | "current";

const pageCss = `
  .srp-page {
    min-height: 100vh;
    padding: 88px 32px 120px;
    background-color: #f4f4f4;
    background-image:
      repeating-linear-gradient(0deg, rgba(0,0,0,.016) 0 1px, transparent 1px 72px),
      repeating-linear-gradient(90deg, rgba(0,0,0,.016) 0 1px, transparent 1px 72px);
    font-family: var(--font-body), system-ui, sans-serif;
    --pop-dur: 450ms;
    --halo-dur: 420ms;
    --part-dur: 400ms;
    --bounce-dur: 700ms;
  }
  .srp-slow {
    --pop-dur: 1350ms;
    --halo-dur: 1260ms;
    --part-dur: 1200ms;
    --bounce-dur: 2200ms;
  }
  .srp-head, .srp-stage, .srp-controls {
    max-width: 1180px;
    margin-left: auto;
    margin-right: auto;
  }
  .srp-eyebrow {
    margin-bottom: 10px;
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: #8a6410;
  }
  .srp-title {
    margin: 0;
    font-family: var(--font-display), sans-serif;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -.02em;
    color: #1f1f1f;
  }
  .srp-sub {
    margin: 10px 0 0;
    max-width: 720px;
    font-size: 14.5px;
    line-height: 1.6;
    color: #5f5f5f;
  }
  .srp-controls {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 36px;
    margin-bottom: 56px;
    padding: 16px 20px;
    border: 1px solid rgba(0,0,0,.08);
    border-radius: 14px;
    background: #fffdfa;
  }
  .srp-button {
    appearance: none;
    border: 1px solid #d8d2c6;
    border-radius: 999px;
    background: #f1ede6;
    color: #1f1f1f;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .srp-button:hover { background: #e8e1d3; }
  .srp-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #4f4f4f;
    cursor: pointer;
  }
  .srp-count {
    margin-left: auto;
    font-family: var(--font-mono), monospace;
    font-size: 11px;
    letter-spacing: .08em;
    color: #8a8a8a;
  }
  .srp-stage {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 64px 36px;
    align-items: start;
  }
  .srp-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .srp-item .flow-node { width: 340px; }
  .srp-caption {
    margin-top: 30px;
    text-align: center;
    max-width: 330px;
  }
  .srp-caption b {
    display: block;
    font-family: var(--font-mono), monospace;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: #3d3d3d;
  }
  .srp-caption span {
    display: block;
    margin-top: 6px;
    font-size: 12.5px;
    line-height: 1.6;
    color: #8a8a8a;
  }
  .srp-foot {
    max-width: 1180px;
    margin: 88px auto 0;
    padding-top: 20px;
    border-top: 1px solid rgba(0,0,0,.08);
    font-size: 12.5px;
    line-height: 1.65;
    color: #7a7a7a;
  }
  .srp-foot code {
    font-family: var(--font-mono), monospace;
    font-size: 11.5px;
    color: #444;
  }

  /* ---------- 历史版本演示（仅预览页使用） ---------- */
  .demo-star {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
  }
  .demo-star .star-icon {
    display: block;
    width: 18px;
    height: 18px;
    color: #c18b28;
    fill: #e3b341;
    filter: drop-shadow(0 0 3px rgba(227, 179, 65, 0.45));
  }
  .demo-halo {
    position: absolute;
    inset: -3px;
    border-radius: 999px;
    border: 1px solid rgba(227, 179, 65, 0.65);
    opacity: 0;
    pointer-events: none;
  }
  .demo-particle {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 3px;
    height: 3px;
    margin: -1.5px 0 0 -1.5px;
    border-radius: 999px;
    background: #e3b341;
    opacity: 0;
    pointer-events: none;
  }
  .demo-particle-1 { --dx: -8px; --dy: -9px; }
  .demo-particle-2 { --dx: 9px; --dy: -7px; }
  .demo-particle-3 { --dx: -7px; --dy: 9px; }
  .demo-particle-4 { --dx: 8px; --dy: 8px; }

  /* 第 1 版：星星在徽章左侧，缩放弹出 + 光环 + 小星星 */
  .demo-star--pop { margin-right: 46px; }
  .demo-star--pop .star-icon { animation: demo-pop var(--pop-dur) cubic-bezier(0.22, 1.2, 0.36, 1) both; }
  .demo-star--pop .demo-halo { animation: demo-halo var(--halo-dur) ease-out both; }
  .demo-star--pop .demo-particle { animation: demo-particle var(--part-dur) ease-out both; }
  .demo-star--pop .demo-particle-2 { animation-delay: calc(var(--pop-dur) * 0.06); }
  .demo-star--pop .demo-particle-3 { animation-delay: calc(var(--pop-dur) * 0.1); }
  .demo-star--pop .demo-particle-4 { animation-delay: calc(var(--pop-dur) * 0.03); }

  /* 第 2 版：星星在徽章正下方，弹跳 + 光环 & 小星星跟随 */
  .demo-star--bounce {
    position: absolute;
    top: 20px;
    right: 11px;
    z-index: 3;
    animation: star-reward-bounce var(--bounce-dur) cubic-bezier(0.28, 0.9, 0.36, 1) both;
  }
  .demo-star--bounce .star-icon { animation: star-reward-flash var(--bounce-dur) ease-in-out both; }
  .demo-star--bounce .demo-halo { animation: demo-halo-sync var(--bounce-dur) ease-out both; }
  .demo-star--bounce .demo-particle { animation: demo-particle-sync var(--bounce-dur) ease-out both; }

  /* 当前版：星星在徽章正下方，只有弹跳 + 闪烁 */
  .demo-star--current {
    position: absolute;
    top: 20px;
    right: 11px;
    z-index: 3;
  }

  @keyframes demo-pop {
    0% { transform: scale(0.2); opacity: 0; }
    60% { transform: scale(1.15); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes demo-halo {
    0% { transform: scale(0.5); opacity: 0.8; }
    100% { transform: scale(1.5); opacity: 0; }
  }
  @keyframes demo-particle {
    0% { transform: translate(0, 0); opacity: 1; }
    100% { transform: translate(var(--dx), var(--dy)); opacity: 0; }
  }
  @keyframes demo-halo-sync {
    0%, 29% { transform: scale(0.35); opacity: 0; }
    34% { transform: scale(0.75); opacity: 0.85; }
    55% { transform: scale(1.5); opacity: 0.55; }
    75% { transform: scale(1.9); opacity: 0.12; }
    100% { transform: scale(2.1); opacity: 0; }
  }
  @keyframes demo-particle-sync {
    0%, 28% { transform: translate(0, 0) scale(0.3); opacity: 0; }
    30% { transform: translate(calc(var(--dx) * 0.4), calc(var(--dy) * 0.4)) scale(1); opacity: 1; }
    72% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 1; }
    100% { transform: translate(calc(var(--dx) * 1.15), calc(var(--dy) * 1.15)) scale(0.8); opacity: 0; }
  }

  @media (max-width: 900px) {
    .srp-page { padding: 64px 16px 96px; }
    .srp-stage { grid-template-columns: 1fr; }
  }
`;

function DemoStar({ variant, playKey }: { variant: "pop" | "bounce"; playKey: number }) {
  return (
    <span key={playKey} className={`demo-star demo-star--${variant}`}>
      <span className="demo-halo" />
      <span className="demo-particle demo-particle-1" />
      <span className="demo-particle demo-particle-2" />
      <span className="demo-particle demo-particle-3" />
      <span className="demo-particle demo-particle-4" />
      <svg className="star-icon" viewBox="0 0 24 24" width={18} height={18} focusable="false">
        <path d="M12 2.6l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 17.7 6.1 20.9l1.2-6.6L2.4 9.6l6.7-.9z" />
      </svg>
    </span>
  );
}

function PreviewCard({
  variant,
  playKey,
  durationMs,
}: {
  variant: Variant;
  playKey: number;
  durationMs: number;
}) {
  return (
    <div className="flow-node flow-node--note flow-node-task">
      <span className="node-icon" aria-hidden="true">
        <Sparkles size={20} strokeWidth={2.1} />
      </span>
      <div className="node-inner">
        <div className="task-header">
          <span className="node-chip">任务节点</span>
          {variant === "pop" && <DemoStar variant="pop" playKey={playKey} />}
          {variant === "bounce" && <DemoStar variant="bounce" playKey={playKey} />}
          {variant === "current" && (
            <StarReward key={playKey} animate durationMs={durationMs} />
          )}
        </div>
        <h2 className="node-title">AI 基础概念及解决的问题</h2>
        <p className="node-body">
          AI 有哪些基础概念，详细且准确的描述概念并说明它解决的是什么问题。
          注意，我需要的是概念定义与解释，定义需要精准，解释时不需要使用比喻。
        </p>
        <div className="task-footer">
          <span className="model-pill">deepseek-flash</span>
          <div className="task-footer-actions">
            <span className="status-dot complete" />
            <button className="run-button" type="button">再次运行</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const VARIANTS: Array<{ id: Variant; title: string; note: string }> = [
  {
    id: "pop",
    title: "第 1 版 · 缩放弹出",
    note: "星星在徽章左侧，原地放大弹出；带圆圈扩散和 4 颗小星星。",
  },
  {
    id: "bounce",
    title: "第 2 版 · 弹跳 + 光环",
    note: "星星移到徽章正下方，纵向弹跳 + 闪烁；圆圈和小星星跟着星星一起跳。",
  },
  {
    id: "current",
    title: "最终版 · 弹跳 + 闪烁（已确认）",
    note: "删掉圆圈和小星星，只留下星星本体的纵向弹跳与跳起闪烁。",
  },
];

export default function StarRewardPreviewPage() {
  const [playKey, setPlayKey] = useState(0);
  const [auto, setAuto] = useState(true);
  const [slow, setSlow] = useState(false);
  const durationMs = slow ? 2200 : 700;

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(
      () => setPlayKey((value) => value + 1),
      slow ? 3000 : 1600,
    );
    return () => window.clearInterval(timer);
  }, [auto, slow]);

  return (
    // layout.tsx 已提供全站唯一的 main landmark，这里改用 section 避免嵌套
    <section className={`srp-page${slow ? " srp-slow" : ""}`}>
      <style>{pageCss}</style>

      <header className="srp-head">
        <p className="srp-eyebrow">GoDeeper · Star reward</p>
        <h1 className="srp-title">问题星星 · 三个版本对比</h1>
        <p className="srp-sub">
          三次改动的效果并排放在同一张任务卡上。默认自动循环，可勾选“慢动作（3×）”细看；
          当前版是真实画布使用的最终效果。
        </p>
      </header>

      <section className="srp-controls">
        <button
          className="srp-button"
          type="button"
          onClick={() => setPlayKey((value) => value + 1)}
        >
          全部重播
        </button>
        <label className="srp-toggle">
          <input
            type="checkbox"
            checked={auto}
            onChange={(event) => setAuto(event.target.checked)}
          />
          自动循环
        </label>
        <label className="srp-toggle">
          <input
            type="checkbox"
            checked={slow}
            onChange={(event) => setSlow(event.target.checked)}
          />
          慢动作（3×）
        </label>
        <span className="srp-count">已播放 {playKey} 次</span>
      </section>

      <section className="srp-stage">
        {VARIANTS.map((item) => (
          <figure className="srp-item" key={item.id}>
            <PreviewCard variant={item.id} playKey={playKey} durationMs={durationMs} />
            <figcaption className="srp-caption">
              <b>{item.title}</b>
              <span>{item.note}</span>
            </figcaption>
          </figure>
        ))}
      </section>

      <p className="srp-foot">
        真实组件：<code>frontend/src/components/nodes/star-reward.tsx</code>（只保留五角星本体）；
        正式样式：<code>frontend/src/app/globals.css</code> 中的
        <code>.star-reward</code> 弹跳 + 闪烁。历史版本的光环与小星星只在预览页内复刻，
        不进入正式组件。
      </p>
    </section>
  );
}

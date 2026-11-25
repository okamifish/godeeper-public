"use client";

import { useEffect, useState } from "react";

interface StarRewardProps {
  /** 只在“从无星变有星”时传 true；刷新已有星星时不播放 */
  animate?: boolean;
  /** 动画时长，默认 700ms，与 globals.css 保持一致 */
  durationMs?: number;
}

export function StarReward({ animate = false, durationMs = 700 }: StarRewardProps) {
  const [playing, setPlaying] = useState(animate);

  useEffect(() => {
    if (!animate) return;
    setPlaying(true);
    // prefers-reduced-motion 下 animationend 不会触发，用定时器兜底
    const timer = window.setTimeout(() => setPlaying(false), durationMs + 40);
    return () => window.clearTimeout(timer);
  }, [animate, durationMs]);

  return (
    <span
      className={`star-reward${playing ? " star-reward--playing" : ""}`}
      aria-hidden="true"
    >
      <svg
        className="star-icon"
        viewBox="0 0 24 24"
        width={18}
        height={18}
        focusable="false"
      >
        <path d="M12 2.6l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 17.7 6.1 20.9l1.2-6.6L2.4 9.6l6.7-.9z" />
      </svg>
    </span>
  );
}

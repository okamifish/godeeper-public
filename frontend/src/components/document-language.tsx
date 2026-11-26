"use client";

import { useEffect } from "react";
import { useCanvasStore } from "@/lib/canvas-store";

/**
 * 把工作区语言状态同步到 document.documentElement.lang。
 * 依据：accessibility.md §4 Language（3.1.1 Language of Page）。
 * canvas-store 不由本任务修改，因此只订阅 language，不改动任何交互逻辑。
 */
export function DocumentLanguage() {
  const language = useCanvasStore((s) => s.language);

  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  }, [language]);

  return null;
}

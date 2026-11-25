"use client";

import { useEffect } from "react";
import { startSessionSync } from "@/lib/auth";

/**
 * 启动时恢复/刷新 Supabase 会话，把可用令牌回写到本地。
 * 不渲染任何内容，只负责会话生命周期。
 */
export function SessionBootstrap() {
  useEffect(() => {
    void startSessionSync();
  }, []);

  return null;
}

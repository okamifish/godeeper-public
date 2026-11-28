import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { SessionBootstrap } from "@/components/auth/session-bootstrap";
import { DocumentLanguage } from "@/components/document-language";

export const metadata: Metadata = {
  title: "GoDeeper",
  description: "深度推理工作台 - A spatial reasoning workspace for deep thinking and branching exploration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 语言切换后同步 <html lang>，供读屏与浏览器翻译按正确语言处理。
            依据：accessibility.md（lang 必须反映实际内容语言）。 */}
        <DocumentLanguage />
        <SessionBootstrap />
        <ErrorBoundary>
          {/* 全站唯一的 main landmark：页面内容全部落在其中。
              依据：accessibility.md §1 Landmarks（单个 main / 所有内容位于 landmark 内）。 */}
          <main id="main-content">{children}</main>
        </ErrorBoundary>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}

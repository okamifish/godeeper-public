import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { SessionBootstrap } from "@/components/auth/session-bootstrap";

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
        <SessionBootstrap />
        <ErrorBoundary>{children}</ErrorBoundary>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}

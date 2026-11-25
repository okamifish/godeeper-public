import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { SessionBootstrap } from "@/components/auth/session-bootstrap";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-body",
});

const geistDisplay = Geist({
  subsets: ["latin"],
  variable: "--font-display",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

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
      <body className={`${geist.variable} ${geistDisplay.variable} ${geistMono.variable}`}>
        <SessionBootstrap />
        <ErrorBoundary>{children}</ErrorBoundary>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}

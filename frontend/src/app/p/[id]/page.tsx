import type { Metadata } from "next";
import { PublicCanvasClient } from "./public-canvas-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface PublicCanvasMeta {
  title?: string;
  snapshot?: {
    nodes?: Array<{ body?: unknown; title?: unknown }>;
  } | null;
}

async function fetchPublicCanvas(id: string): Promise<PublicCanvasMeta | null> {
  try {
    const res = await fetch(`${API_BASE}/public/canvas/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as PublicCanvasMeta;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const canvas = await fetchPublicCanvas(id);
  const title = canvas?.title || "GoDeeper Canvas";
  const nodes = Array.isArray(canvas?.snapshot?.nodes) ? canvas!.snapshot!.nodes! : [];
  const body = nodes.find((node) => typeof node.body === "string" && node.body.trim());
  const description = typeof body?.body === "string"
    ? body.body.trim().slice(0, 120)
    : "在 GoDeeper 查看这张思考画布";

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "article",
    },
  };
}

export default async function PublicCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicCanvasClient id={id} />;
}

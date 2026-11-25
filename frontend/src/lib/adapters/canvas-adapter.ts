import { api } from "@/lib/api";
import type { CanvasData } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { buildNode, buildEdge } from "@/lib/canvas-store";
import type { CanvasNodeSeed, CanvasEdgeSeed } from "@/lib/types";

export interface CanvasAdapter {
  getCanvas(id: string): Promise<CanvasData | null>;
  saveCanvas(data: CanvasData): Promise<void>;
  createCanvas(name: string): Promise<CanvasData>;
  deleteCanvas(id: string): Promise<void>;
}

function toCanvasData(row: any): CanvasData {
  const snapshot = row.snapshot ?? { nodes: [], edges: [] };
  const nodes = (snapshot.nodes ?? []).map((n: CanvasNodeSeed) => buildNode(n));
  const edges = (snapshot.edges ?? []).map((e: CanvasEdgeSeed) => buildEdge(e));
  return {
    id: row.id,
    name: row.title ?? "Untitled",
    nodes,
    edges,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

class MockCanvasAdapter implements CanvasAdapter {
  async getCanvas(_id: string): Promise<CanvasData | null> {
    return null;
  }

  async saveCanvas(_data: CanvasData): Promise<void> {}

  async createCanvas(name: string): Promise<CanvasData> {
    return {
      id: `canvas-${Date.now()}`,
      name,
      nodes: [],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async deleteCanvas(_id: string): Promise<void> {}
}

class RealCanvasAdapter implements CanvasAdapter {
  async getCanvas(id: string): Promise<CanvasData | null> {
    const row = await api.getCanvas(id);
    return toCanvasData(row);
  }

  async saveCanvas(data: CanvasData): Promise<void> {
    const seeds = {
      nodes: data.nodes.map((n) => ({
        id: n.id,
        kind: n.data.kind,
        title: n.data.title,
        body: n.data.body ?? "",
        x: n.position.x,
        y: n.position.y,
        width: n.data.width,
        metaLeft: n.data.metaLeft,
        metaRight: n.data.metaRight,
        sourceLabel: n.data.sourceLabel,
        chips: n.data.chips,
        taskStatus: n.data.taskStatus,
        taskType: n.data.taskType,
        previewLabel: n.data.previewLabel,
        notePages: n.data.notePages,
        noteActivePage: n.data.noteActivePage,
      })),
      edges: data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        active: e.animated,
      })),
    };
    await api.saveSnapshot(data.id, seeds);

    const upserts = seeds.nodes.map((n) => ({
      id: n.id, kind: n.kind, title: n.title, body: n.body,
    }));
    if (upserts.length > 0) {
      await api.syncNodes(data.id, upserts, []).catch((err) => {
        console.warn("Node sync failed:", err instanceof Error ? err.message : err);
      });
    }
  }

  async createCanvas(name: string): Promise<CanvasData> {
    const row = await api.createCanvas(name);
    return toCanvasData(row);
  }

  async deleteCanvas(id: string): Promise<void> {
    await api.deleteCanvas(id);
  }
}

const _mock = new MockCanvasAdapter();
const _real = new RealCanvasAdapter();
function _useMock() {
  return !process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" && !isAuthenticated());
}
export const canvasAdapter: CanvasAdapter = {
  getCanvas: (id) => _useMock() ? _mock.getCanvas(id) : _real.getCanvas(id),
  saveCanvas: (data) => _useMock() ? _mock.saveCanvas(data) : _real.saveCanvas(data),
  createCanvas: (name) => _useMock() ? _mock.createCanvas(name) : _real.createCanvas(name),
  deleteCanvas: (id) => _useMock() ? _mock.deleteCanvas(id) : _real.deleteCanvas(id),
};

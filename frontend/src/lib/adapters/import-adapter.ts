import { api } from "@/lib/api";
import type { DecomposeResult } from "@/lib/api";

export interface ImportAdapter {
  importUrl(url: string, fragmentCount: number): Promise<DecomposeResult>;
  importText(text: string, fragmentCount: number): Promise<DecomposeResult>;
  importFile(file: File, fragmentCount: number): Promise<DecomposeResult>;
}

/** 后端 /import/* 可能返回已拆解结构，也可能返回扁平结构，这里统一收口 */
interface BackendImportResponse {
  sourceNode?: { title?: string; body?: string; sourceMeta?: string };
  fragmentNodes?: Array<{ title?: string; body?: string }>;
  taskNode?: { title?: string; body?: string; chips?: string[] };
  resultNodes?: Array<{ title?: string; body?: string }>;
  title?: string;
  summary?: string;
  sourceMeta?: string;
  fragments?: Array<{ title?: string; body?: string }>;
}

/**
 * 真实导入适配器：只调用后端 /import 接口，不做本地 mock。
 * 未登录或接口不可用时由调用方决定降级方式（例如只保存文件名）。
 */
class RealImportAdapter implements ImportAdapter {
  async importUrl(url: string, fragmentCount: number): Promise<DecomposeResult> {
    const res = await api.importUrl(url, fragmentCount);
    return this.fromBackendResponse(res, url);
  }

  async importText(text: string, fragmentCount: number): Promise<DecomposeResult> {
    const res = await api.importText(text, fragmentCount);
    return this.fromBackendResponse(res, text.slice(0, 100));
  }

  async importFile(file: File, fragmentCount: number): Promise<DecomposeResult> {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const res = await api.importFile(file, fragmentCount);
      return this.fromBackendResponse(res, file.name);
    }

    const text = await file.text();
    const res = await api.importText(text, fragmentCount);
    return this.fromBackendResponse(res, file.name);
  }

  private fromBackendResponse(res: BackendImportResponse, source: string): DecomposeResult {
    if (res.sourceNode && res.fragmentNodes && res.taskNode) {
      return {
        sourceNode: {
          title: res.sourceNode.title ?? source,
          body: res.sourceNode.body ?? "",
          sourceMeta: res.sourceNode.sourceMeta ?? "",
        },
        fragmentNodes: res.fragmentNodes.map((fragment) => ({
          title: fragment.title ?? "",
          body: fragment.body ?? "",
        })),
        taskNode: {
          title: res.taskNode.title ?? "",
          body: res.taskNode.body ?? "",
          chips: res.taskNode.chips ?? [],
        },
        resultNodes: (res.resultNodes ?? []).map((node) => ({
          title: node.title ?? "",
          body: node.body ?? "",
        })),
      };
    }

    const fragments = res.fragments ?? [];
    return {
      sourceNode: { title: res.title ?? source, body: res.summary ?? "", sourceMeta: res.sourceMeta ?? "" },
      fragmentNodes: fragments.map((fragment) => ({
        title: fragment.title ?? "",
        body: fragment.body ?? "",
      })),
      taskNode: { title: "继续深入分析", body: "基于导入来源继续提取可推理的问题。", chips: ["analysis"] },
      resultNodes: [],
    };
  }
}

export const importAdapter: ImportAdapter = new RealImportAdapter();

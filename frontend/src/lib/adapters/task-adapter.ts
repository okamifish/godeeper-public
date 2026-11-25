import { api } from "@/lib/api";
import type { TaskResult } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";

export interface TaskAdapter {
  runTask(taskId: string, prompt: string, context: string[], model?: string): Promise<TaskResult>;
  cancelTask(taskId: string): void;
}

class MockTaskAdapter implements TaskAdapter {
  private controllers = new Map<string, AbortController>();

  async runTask(taskId: string, prompt: string, context: string[], _model?: string): Promise<TaskResult> {
    const controller = new AbortController();
    this.controllers.set(taskId, controller);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (controller.signal.aborted) return;
        this.controllers.delete(taskId);
        resolve({
          taskId,
          results: [
            { title: "Mock analysis result", body: `Based on context: ${context.join(", ")}. Prompt: ${prompt}` },
            { title: "Mock alternative view", body: "This is a simulated parallel branch for testing." },
          ],
        });
      }, 2000);

      controller.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        this.controllers.delete(taskId);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }

  cancelTask(taskId: string): void {
    this.controllers.get(taskId)?.abort();
    this.controllers.delete(taskId);
  }
}

class RealTaskAdapter implements TaskAdapter {
  private controllers = new Map<string, AbortController>();

  async runTask(taskId: string, prompt: string, context: string[], model?: string): Promise<TaskResult> {
    const controller = new AbortController();
    this.controllers.set(taskId, controller);

    try {
      const result = await api.runTask(taskId, prompt, context, model);
      this.controllers.delete(taskId);
      return result;
    } catch (err) {
      this.controllers.delete(taskId);
      throw err;
    }
  }

  cancelTask(taskId: string): void {
    this.controllers.get(taskId)?.abort();
    this.controllers.delete(taskId);
  }
}

const _mock = new MockTaskAdapter();
const _real = new RealTaskAdapter();
function _useMock() {
  return !process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" && !isAuthenticated());
}
export const taskAdapter: TaskAdapter = {
  runTask: (taskId, prompt, ctx, model) => _useMock() ? _mock.runTask(taskId, prompt, ctx, model) : _real.runTask(taskId, prompt, ctx, model),
  cancelTask: (taskId) => _useMock() ? _mock.cancelTask(taskId) : _real.cancelTask(taskId),
};

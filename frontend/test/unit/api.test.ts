import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "@/lib/api";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("APIService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  });

  describe("listCanvases", () => {
    it("fetches canvas list", async () => {
      const mockCanvases = [
        { id: "c-1", title: "Canvas 1" },
        { id: "c-2", title: "Canvas 2" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCanvases),
      });

      const result = await api.listCanvases();

      expect(mockFetch).toHaveBeenCalledWith(
        "/canvas",
        expect.objectContaining({
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
        })
      );
      expect(result).toEqual(mockCanvases);
    });
  });

  describe("createCanvas", () => {
    it("creates a new canvas", async () => {
      const mockCanvas = { id: "new-1", title: "Test" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCanvas),
      });

      const result = await api.createCanvas("Test");

      expect(mockFetch).toHaveBeenCalledWith(
        "/canvas",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "Test" }),
        })
      );
      expect(result.title).toBe("Test");
    });
  });

  describe("getCanvas", () => {
    it("fetches canvas by id", async () => {
      const mockCanvas = { id: "c-1", title: "My Canvas" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCanvas),
      });

      const result = await api.getCanvas("c-1");

      expect(mockFetch).toHaveBeenCalledWith(
        "/canvas/c-1",
        expect.objectContaining({
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
        })
      );
      expect(result.id).toBe("c-1");
    });

    it("throws on failed request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Not found" }),
      });

      await expect(api.getCanvas("bad")).rejects.toThrow("Not found");
    });
  });

  describe("syncNodes", () => {
    it("syncs nodes to backend", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const result = await api.syncNodes("c-1", [{ id: "n-1" }], ["n-2"]);

      expect(mockFetch).toHaveBeenCalledWith(
        "/node/sync",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            canvasId: "c-1",
            upserts: [{ id: "n-1" }],
            deletes: ["n-2"],
          }),
        })
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe("runTask", () => {
    it("runs a task with prompt and context", async () => {
      const mockResult = { taskId: "t-1", results: [{ title: "R1", body: "B1" }] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await api.runTask("t-1", "Analyze this", ["ctx-1"], "gpt-5");

      expect(mockFetch).toHaveBeenCalledWith(
        "/task/t-1/run",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ prompt: "Analyze this", context: ["ctx-1"], model: "gpt-5" }),
        })
      );
      expect(result.taskId).toBe("t-1");
    });
  });

  describe("importUrl", () => {
    it("imports a URL", async () => {
      const mockResult = { source: { title: "Article" } };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await api.importUrl("https://example.com", 4);

      expect(mockFetch).toHaveBeenCalledWith(
        "/import/url",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ url: "https://example.com", fragmentCount: 4 }),
        })
      );
      expect(result.source.title).toBe("Article");
    });
  });
});

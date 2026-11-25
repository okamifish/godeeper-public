import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OcrInvalidResponseError,
  OcrNotConfiguredError,
  OcrRequestError,
  normalizeOxrPayload,
  parseImageWithOxr,
} from "../../src/services/ocr.service";

const FIXTURE = {
  code: 0,
  message: "任务成功",
  data: {
    result: {
      outputs: {
        markdown: "# 会议笔记\n\n1. OXR 文档解析评估\n\n| 项目 | 结论 |\n| --- | --- |\n| OCR | 待测试 |",
        json: {
          pages: [
            {
              page_num: 0,
              page_size: { w: 900, h: 700 },
              blocks: [
                { idx: 0, type: "Title", bbox: [44, 37, 423, 76], content: "会议笔记", format: "text" },
                { idx: 1, type: "Table", bbox: [40, 250, 540, 450], content: "| 项目 | 结论 |", format: "markdown" },
              ],
            },
          ],
        },
      },
    },
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("normalizeOxrPayload", () => {
  it("keeps per-page markdown, blocks and page size", () => {
    const page = normalizeOxrPayload(FIXTURE);
    expect(page.pageIndex).toBe(0);
    expect(page.markdown).toContain("# 会议笔记");
    expect(page.blocks).toHaveLength(2);
    expect(page.blocks[1].bbox).toEqual([40, 250, 540, 450]);
    expect(page.width).toBe(900);
    expect(page.height).toBe(700);
  });

  it("rejects a response without outputs", () => {
    expect(() => normalizeOxrPayload({ code: 0, data: {} })).toThrow(OcrInvalidResponseError);
  });

  it("turns non-zero OXR codes into readable request errors", () => {
    expect(() => normalizeOxrPayload({ code: 1133, message: "参数错误" })).toThrow(OcrRequestError);
  });
});

describe("parseImageWithOxr", () => {
  it("does not upload anything when OXR is not configured", async () => {
    vi.stubEnv("OXR_BASE_URL", "");
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "note.png", { type: "image/png" });
    await expect(parseImageWithOxr(file)).rejects.toBeInstanceOf(OcrNotConfiguredError);
  });

  it("posts the image as multipart to /parse/sync and normalizes the result", async () => {
    vi.stubEnv("OXR_BASE_URL", "http://127.0.0.1:8000/v1");
    vi.stubEnv("OXR_API_KEY", "dummy");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "note.png", { type: "image/png" });
    const page = await parseImageWithOxr(file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/v1/parse/sync");
    expect(page.markdown).toContain("会议笔记");
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_NOTE_PAGES,
  appendNotePage,
  clampNotePageIndex,
  createNotePage,
  dataUrlByteSize,
  normalizeNotePages,
  notePageMarkdown,
  notePagesToBody,
  removeNotePage,
  updateNotePage,
} from "@/lib/note-pages";
import { createCanvasExport, parseCanvasExport } from "@/lib/canvas-export";

const IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";

function page(index: number, markdown = `# Page ${index}`) {
  return createNotePage({
    id: `p-${index}`,
    imageDataUrl: IMAGE,
    width: 800,
    height: 600,
    ocrMarkdown: markdown,
    status: "done",
  });
}

describe("note pages", () => {
  it("clamps page index and add/remove/update keep page data intact", () => {
    const pages = [page(1), page(2)];
    expect(clampNotePageIndex(5, pages.length)).toBe(1);
    expect(clampNotePageIndex(-1, pages.length)).toBe(0);
    expect(clampNotePageIndex(undefined, 0)).toBe(0);

    const added = appendNotePage(pages, page(3));
    expect(added).toHaveLength(3);

    const updated = updateNotePage(added, "p-2", { editedMarkdown: "# Fixed" });
    expect(updated[1].editedMarkdown).toBe("# Fixed");

    const removed = removeNotePage(updated, "p-1", 0);
    expect(removed.pages).toHaveLength(2);
    expect(removed.activePage).toBe(0);
  });

  it("uses edited markdown first and falls back to OCR markdown", () => {
    const original = page(1, "# OCR");
    expect(notePageMarkdown(original)).toBe("# OCR");
    expect(notePageMarkdown({ ...original, editedMarkdown: "  " })).toBe("# OCR");
    expect(notePageMarkdown({ ...original, editedMarkdown: "# Edited" })).toBe("# Edited");
  });

  it("caps imported pages at eight and drops non-image entries", () => {
    const input = Array.from({ length: MAX_NOTE_PAGES + 2 }, () => ({ imageDataUrl: IMAGE, width: 1, height: 1 }));
    input.splice(1, 0, { imageDataUrl: "https://example.com/a.png" });
    const pages = normalizeNotePages(input)!;
    expect(pages).toHaveLength(MAX_NOTE_PAGES);
    expect(pages.every((item) => item.imageDataUrl.startsWith("data:image/"))).toBe(true);
  });

  it("estimates data URL bytes and builds searchable body text", () => {
    expect(dataUrlByteSize(IMAGE)).toBeGreaterThan(0);
    const body = notePagesToBody([page(1, "# One"), page(2, "# Two")]);
    expect(body).toContain("# One");
    expect(body).toContain("# Two");
  });

  it("survives canvas JSON export and import", () => {
    const note = {
      id: "note-1",
      kind: "note" as const,
      title: "Note",
      body: "# Page 1",
      x: 10,
      y: 20,
      width: 760,
      notePages: [page(1)],
      noteActivePage: 0,
    };
    const file = createCanvasExport({ canvasName: "Note canvas", nodes: [note], edges: [] });
    const parsed = parseCanvasExport(JSON.stringify(file));
    expect(parsed.nodes[0].kind).toBe("note");
    expect(parsed.nodes[0].notePages).toHaveLength(1);
    expect(parsed.nodes[0].notePages?.[0].imageDataUrl).toBe(IMAGE);
    expect(parsed.nodes[0].noteActivePage).toBe(0);
  });
});

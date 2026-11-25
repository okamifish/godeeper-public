import { beforeEach, describe, expect, it, vi } from "vitest";

type ShortcutModule = typeof import("@/lib/shortcut-settings");

async function loadModule(): Promise<ShortcutModule> {
  vi.resetModules();
  return await import("@/lib/shortcut-settings");
}

describe("shortcut defaults", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps browser-native copy/paste combos free", async () => {
    const { DEFAULT_SHORTCUTS } = await loadModule();
    const combos = Object.values(DEFAULT_SHORTCUTS);
    expect(combos).not.toContain("Ctrl+C");
    expect(combos).not.toContain("Ctrl+V");
  });

  it("does not use Ctrl+D, which bookmarks the page in Edge/Chrome", async () => {
    const { DEFAULT_SHORTCUTS } = await loadModule();
    expect(DEFAULT_SHORTCUTS.duplicateNode).toBe("Ctrl+Shift+D");
    expect(Object.values(DEFAULT_SHORTCUTS)).not.toContain("Ctrl+D");
  });

  it("migrates a persisted legacy Ctrl+D duplicate shortcut", async () => {
    const { DEFAULT_SHORTCUTS, getShortcuts } = await loadModule();
    window.localStorage.setItem(
      "godeeper-shortcuts-v1",
      JSON.stringify({ ...DEFAULT_SHORTCUTS, duplicateNode: "Ctrl+D" }),
    );

    expect(getShortcuts().duplicateNode).toBe("Ctrl+Shift+D");
    expect(JSON.parse(window.localStorage.getItem("godeeper-shortcuts-v1") ?? "{}").duplicateNode)
      .toBe("Ctrl+Shift+D");
  });
});

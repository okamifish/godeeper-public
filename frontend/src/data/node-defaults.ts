import { t as i18nT } from "@/lib/i18n";

export { BASE_NODE_WIDTH, WIDTH_BY_KIND } from "@/data/layout-constants";

type Lang = "zh" | "en";

export function defaultNodeTitle(key: "canvas" | "idea" | "subIdea" | "thought", lang: Lang) {
  const map = {
    canvas: "newCanvasTitle" as const,
    idea: "newIdea" as const,
    subIdea: "newSubIdea" as const,
    thought: "newThought" as const,
  };
  return i18nT(map[key], lang);
}

export function metaString(key: "justCreated" | "editing" | "duplicated" | "autoDecomposed" | "generatedNow" | "streamingBranch" | "parallelBranch" | "streaming" | "queued" | "parsing", lang: Lang) {
  return i18nT(key, lang);
}

export function statusLabel(key: "running" | "runTask" | "runAgain", lang: Lang) {
  return i18nT(key, lang);
}

export const POSITION_OFFSETS = {
  sibling: { x: 420, y: 0 },
  child: { x: 300, y: 200 },
  duplicate: { x: 60, y: 60 },
  taskFromSelection: { xOffset: 420, yOffset: 180 },
  resultFromSelection: { xOffset: 860, yOffset: 120 },
  runResult: { xBase: 1620, xStep: 220, yBase: 180, yStep: 340 },
} as const;

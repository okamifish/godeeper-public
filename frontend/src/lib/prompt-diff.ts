export type DiffLineType = "same" | "add" | "remove";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface DiffStats {
  added: number;
  removed: number;
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}

/** 行级 LCS diff：oldText 是修改前，newText 是修改后。 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const before = splitLines(oldText);
  const after = splitLines(newText);

  if (before.length === 0 && after.length === 0) return [];
  if (before.length === 0) return after.map((text) => ({ type: "add", text }));
  if (after.length === 0) return before.map((text) => ({ type: "remove", text }));

  const rows = before.length;
  const cols = after.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      result.push({ type: "same", text: before[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push({ type: "remove", text: before[i] });
      i += 1;
    } else {
      result.push({ type: "add", text: after[j] });
      j += 1;
    }
  }

  while (i < rows) {
    result.push({ type: "remove", text: before[i] });
    i += 1;
  }
  while (j < cols) {
    result.push({ type: "add", text: after[j] });
    j += 1;
  }

  return result;
}

export function diffStats(lines: DiffLine[]): DiffStats {
  return {
    added: lines.filter((line) => line.type === "add").length,
    removed: lines.filter((line) => line.type === "remove").length,
  };
}

/** 前端保存前预检：必填变量保留、无未知变量。 */
export function checkTemplateVariables(
  content: string,
  required: string[],
): { missing: string[]; unknown: string[] } {
  const actual = Array.from(new Set(Array.from(content.matchAll(/\{\{(\w+)\}\}/g), (match) => match[1])));
  return {
    missing: required.filter((name) => !actual.includes(name)),
    unknown: actual.filter((name) => !required.includes(name)),
  };
}

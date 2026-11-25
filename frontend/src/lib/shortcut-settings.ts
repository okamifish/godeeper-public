"use client";

export type ShortcutAction =
  | "addSibling"
  | "addChild"
  | "deleteNode"
  | "duplicateNode"
  | "autoLayout"
  | "undo"
  | "redo"
  | "selectAll"
  | "search"
  | "inspire"
  | "branchPoint"
  | "groupNodes";

export type ShortcutMap = Record<ShortcutAction, string>;

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  "addSibling",
  "addChild",
  "deleteNode",
  "duplicateNode",
  "autoLayout",
  "undo",
  "redo",
  "selectAll",
  "search",
  "inspire",
  "branchPoint",
  "groupNodes",
];

/**
 * 默认值参考主流思维导图与浏览器习惯：
 * Enter 同级、Tab 子级、Delete 删除、Ctrl+Z 撤销；
 * 复制粘贴保留 Ctrl+C / Ctrl+V，复制节点改用 Ctrl+Shift+D，避免和 Edge 的 Ctrl+D 收藏冲突。
 */
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  addSibling: "Enter",
  addChild: "Tab",
  deleteNode: "Delete",
  duplicateNode: "Ctrl+Shift+D",
  autoLayout: "L",
  undo: "Ctrl+Z",
  redo: "Ctrl+Shift+Z",
  selectAll: "Ctrl+A",
  search: "/",
  inspire: "I",
  branchPoint: "B",
  groupNodes: "Ctrl+G",
};

const STORAGE_KEY = "godeeper-shortcuts-v1";
const CHANGE_EVENT = "godeeper-shortcuts-changed";

export const SHORTCUT_LABELS: Record<ShortcutAction, { zh: string; en: string }> = {
  addSibling: { zh: "添加同级节点", en: "Add sibling" },
  addChild: { zh: "添加子级节点", en: "Add child" },
  deleteNode: { zh: "删除选中节点", en: "Delete node" },
  duplicateNode: { zh: "复制节点", en: "Duplicate node" },
  autoLayout: { zh: "自动整理布局", en: "Auto layout" },
  undo: { zh: "撤销", en: "Undo" },
  redo: { zh: "重做", en: "Redo" },
  selectAll: { zh: "全选节点", en: "Select all" },
  search: { zh: "搜索节点", en: "Search" },
  inspire: { zh: "生成启发问题", en: "Inspire" },
  branchPoint: { zh: "回到分支点", en: "Back to branch" },
  groupNodes: { zh: "创建/取消分组", en: "Create/ungroup" },
};

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "CapsLock"]);

export function normalizeCombo(raw: string): string {
  return raw
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "ctrl" || lower === "control" || lower === "meta" || lower === "cmd") return "Ctrl";
      if (lower === "alt" || lower === "option") return "Alt";
      if (lower === "shift") return "Shift";
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("+");
}

/** 把键盘事件转成用于比较的组合串；只按下修饰键时返回 null。 */
export function eventToCombo(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  let key = event.key;
  if (key === " ") key = "Space";
  if (key === "+") key = "Plus";
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

function sanitize(raw: unknown): ShortcutMap {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const result = { ...DEFAULT_SHORTCUTS };
  for (const action of SHORTCUT_ACTIONS) {
    const value = source[action];
    if (typeof value === "string" && value.trim()) {
      result[action] = normalizeCombo(value);
    }
  }
  return result;
}

let cache: ShortcutMap | null = null;

/**
 * 旧版本默认「复制节点」是 Ctrl+D，和浏览器收藏冲突。
 * 只迁移仍然是旧默认值的用户，避免覆盖用户自己改过的快捷键。
 */
function migrateShortcuts(map: ShortcutMap): ShortcutMap {
  if (map.duplicateNode === "Ctrl+D") {
    return { ...map, duplicateNode: DEFAULT_SHORTCUTS.duplicateNode };
  }
  return map;
}

export function getShortcuts(): ShortcutMap {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = { ...DEFAULT_SHORTCUTS };
    return cache;
  }
  let map: ShortcutMap;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    map = raw ? sanitize(JSON.parse(raw)) : { ...DEFAULT_SHORTCUTS };
  } catch {
    map = { ...DEFAULT_SHORTCUTS };
  }
  const migrated = migrateShortcuts(map);
  if (migrated !== map) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    } catch {
      /* 隐私模式下写入失败时保持内存值即可 */
    }
  }
  cache = migrated;
  return cache;
}

function persist(map: ShortcutMap) {
  cache = map;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function findDuplicate(map: ShortcutMap, combo: string, except?: ShortcutAction): ShortcutAction | null {
  const normalized = normalizeCombo(combo);
  return SHORTCUT_ACTIONS.find((action) => action !== except && map[action] === normalized) ?? null;
}

/** 返回错误信息；空字符串表示保存成功。 */
export function updateShortcut(action: ShortcutAction, combo: string): string {
  const normalized = normalizeCombo(combo);
  if (!normalized) return "快捷键不能为空";
  const duplicate = findDuplicate(getShortcuts(), normalized, action);
  if (duplicate) {
    return `与「${SHORTCUT_LABELS[duplicate].zh}」重复`;
  }
  persist({ ...getShortcuts(), [action]: normalized });
  return "";
}

export function resetShortcuts() {
  persist({ ...DEFAULT_SHORTCUTS });
}

export function subscribeShortcuts(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export function actionForCombo(combo: string | null): ShortcutAction | null {
  if (!combo) return null;
  const map = getShortcuts();
  return SHORTCUT_ACTIONS.find((action) => map[action] === combo) ?? null;
}

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

function pad(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}-${MONTHS[date.getMonth()]}-${pad(date.getDate())}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 只取时分，用于「数据更新于 HH:mm」这类说明。 */
export function formatClock(value?: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatNumber(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("zh-CN");
}

/**
 * USD 金额：常规金额两位小数；不足 1 美元时保留四位，避免成本被显示成 $0.00。
 */
export function formatUsd(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "$0.00";
  return Math.abs(num) >= 1 ? `$${num.toFixed(2)}` : `$${num.toFixed(4)}`;
}

export function formatDuration(ms?: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** 长耗时的中文写法（活动时间线用）：2 分 14 秒 / 48 秒 / 1 小时 5 分。 */
export function formatDurationHuman(ms?: number | null): string {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

/** 最近活跃相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前。 */
export function formatRelative(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  if (diff < 0) return formatDateTime(value);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return formatDate(value);
}

export function initials(email?: string | null, name?: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
  return source.slice(0, 2);
}

const AVATAR_TONES = ["", "violet", "blue", "amber", "green"] as const;

export function avatarTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

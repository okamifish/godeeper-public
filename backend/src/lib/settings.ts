import { db } from "../db";
import { systemSettings } from "../db/schema";
import { eq } from "drizzle-orm";

export interface RiskConfig {
  /** 每分钟允许的 AI 调用数 */
  burstPerMinute: number;
  /** 失败率阈值（0–1） */
  failureRateThreshold: number;
  /** 计算失败率所需的最少样本数 */
  failureMinSamples: number;
  /** 免费用户单日调用观察阈值（只记录风控事件，不拦截） */
  dailyWatchLimitFree: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  burstPerMinute: 10,
  failureRateThreshold: 0.5,
  failureMinSamples: 5,
  dailyWatchLimitFree: 50,
};

const SETTINGS_ID = "global";
const CACHE_TTL_MS = 60_000;

let cache: { value: RiskConfig; at: number } | null = null;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeRiskConfig(raw: unknown): RiskConfig {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    burstPerMinute: Math.round(clampNumber(record.burstPerMinute, 1, 10_000, DEFAULT_RISK_CONFIG.burstPerMinute)),
    failureRateThreshold: clampNumber(record.failureRateThreshold, 0.05, 1, DEFAULT_RISK_CONFIG.failureRateThreshold),
    failureMinSamples: Math.round(clampNumber(record.failureMinSamples, 1, 100, DEFAULT_RISK_CONFIG.failureMinSamples)),
    dailyWatchLimitFree: Math.round(clampNumber(record.dailyWatchLimitFree, 1, 10_000, DEFAULT_RISK_CONFIG.dailyWatchLimitFree)),
  };
}

export async function getRiskConfig(): Promise<RiskConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  try {
    const [row] = await db.select().from(systemSettings)
      .where(eq(systemSettings.id, SETTINGS_ID))
      .limit(1);
    const value = normalizeRiskConfig(row?.value);
    cache = { value, at: Date.now() };
    return value;
  } catch (err) {
    console.warn("[settings] Failed to read risk config, using defaults:", err);
    return DEFAULT_RISK_CONFIG;
  }
}

export async function updateRiskConfig(patch: Partial<RiskConfig>): Promise<RiskConfig> {
  const current = await getRiskConfig();
  const value = normalizeRiskConfig({ ...current, ...patch });

  await db.insert(systemSettings)
    .values({ id: SETTINGS_ID, value })
    .onConflictDoUpdate({
      target: systemSettings.id,
      set: { value, updatedAt: new Date() },
    });

  cache = { value, at: Date.now() };
  return value;
}

export function invalidateSettingsCache() {
  cache = null;
}

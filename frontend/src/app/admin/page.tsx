"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { MOCK_STATS, MOCK_ENHANCED, MOCK_TREND, MOCK_USERS } from "@/lib/admin-mock";
import { Icons } from "@/components/icons";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Avatar,
  KpiCard,
  KpiTone,
  MembershipChip,
  PageHeader,
  SectionCard,
  SkeletonGrid,
  StatusChip,
} from "@/components/admin/ui";
import { avatarTone, formatClock, formatDate, formatNumber, formatUsd, initials } from "@/components/admin/format";
import { downloadCsv } from "@/components/admin/download";

interface Stats {
  users: number;
  canvases: number;
  nodes: number;
  todayAiCalls: number;
  todayNewUsers: number;
}

interface EnhancedStats {
  dau: number;
  depthScore: number;
  todayCostUsd: string;
  heavyUsers: number;
  failedTasks: number;
  riskAlerts: number;
}

interface TrendPoint {
  date: string;
  new_users: number;
  new_canvases: number;
  ai_calls: number;
}

interface RecentUser {
  id: string;
  email: string;
  displayName: string | null;
  membership: string;
  createdAt: string;
}

interface QuotaStats {
  freeUsers: number;
  hitLimit: number;
  hitRate: string;
}

interface SystemStatus {
  apiOk: boolean;
  dbOk: boolean;
  modelsEnabled: number;
  modelsTotal: number;
  syncedAt: string | null;
}

interface KpiSpec {
  label: string;
  value: string;
  icon: typeof Icons.user;
  tone: KpiTone;
  delta: number | null;
  compare: string;
}

const trendConfig = {
  new_users: { label: "新增用户", color: "var(--gd-accent-2)" },
  ai_calls: { label: "AI 调用", color: "var(--gd-accent)" },
} satisfies ChartConfig;

const DEMO_QUOTA: QuotaStats = { freeUsers: 892, hitLimit: 23, hitRate: "2.6%" };
const DEMO_MODEL_COUNT = 5;
/** 演示模式使用固定的环比，避免随机 mock 趋势算出夸张百分比。 */
const DEMO_DELTA = { users: 3.2, canvases: 5.1, calls: -2.6, newUsers: 15.0 };

function percentDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** 用「当前总量 - 区间新增」反推区间起点总量，避免编造历史数据。 */
function growthDelta(total: number, additions: number): number | null {
  const before = total - additions;
  if (before <= 0) return null;
  return (additions / before) * 100;
}

function deltaNode(delta: number | null, compare: string) {
  if (delta === null) return <span>{compare}</span>;
  const rounded = Math.abs(delta).toFixed(1);
  const tone = delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat";
  const arrow = tone === "up" ? "↑" : tone === "down" ? "↓" : "→";
  return (
    <>
      <span className={`gd-delta ${tone}`}>{`${arrow} ${rounded}%`}</span>
      <span>{compare}</span>
    </>
  );
}

export default function AdminDashboard() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const rawRange = Number(searchParams.get("range") ?? "30");
  const range = Number.isFinite(rawRange) ? Math.min(90, Math.max(7, rawRange)) : 30;

  const [stats, setStats] = useState<Stats | null>(null);
  const [enhanced, setEnhanced] = useState<EnhancedStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [quota, setQuota] = useState<QuotaStats | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setError(null);

      if (isDemo) {
        const now = new Date();
        setStats(MOCK_STATS);
        setEnhanced(MOCK_ENHANCED);
        setTrend(MOCK_TREND.slice(-range));
        setRecentUsers(MOCK_USERS.slice(0, 3));
        setQuota(DEMO_QUOTA);
        setSystem({
          apiOk: true,
          dbOk: true,
          modelsEnabled: DEMO_MODEL_COUNT,
          modelsTotal: DEMO_MODEL_COUNT,
          syncedAt: now.toISOString(),
        });
        setUpdatedAt(now);
        setLoading(false);
        return;
      }

      try {
        const [s, t, e] = await Promise.all([
          api.getAdminStats(),
          api.getAdminStatsTrend(range),
          api.getAdminStatsEnhanced(),
        ]);
        if (!active) return;
        setStats(s);
        setTrend(Array.isArray(t) ? t : []);
        setEnhanced(e);
        const [recent, quotaStats, health, models] = await Promise.all([
          api.getAdminRecentUsers().catch(() => [] as RecentUser[]),
          api.getAdminAiUsageQuotaHit().catch(() => null),
          api.getHealth().catch(() => null),
          api.getAdminModels().catch(() => [] as Array<{ enabled?: boolean }>),
        ]);
        if (!active) return;
        const modelRows = Array.isArray(models) ? models : [];
        setRecentUsers(Array.isArray(recent) ? recent.slice(0, 3) : []);
        setQuota(quotaStats);
        setSystem({
          apiOk: health?.status === "ok",
          dbOk: true,
          modelsEnabled: modelRows.filter((item) => item.enabled).length,
          modelsTotal: modelRows.length,
          syncedAt: health?.timestamp ?? null,
        });
        setUpdatedAt(new Date());
      } catch {
        if (!active) return;
        setStats(null);
        setEnhanced(null);
        setTrend([]);
        setRecentUsers([]);
        setQuota(null);
        setSystem(null);
        setError("数据加载失败，请确认后端服务已启动且当前账号具备管理员权限。");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [isDemo, range, reloadKey]);

  const suffixParams = new URLSearchParams();
  if (isDemo) suffixParams.set("demo", "1");
  suffixParams.set("range", String(range));
  const suffix = `?${suffixParams.toString()}`;

  const newUsersSum = trend.reduce((sum, point) => sum + Number(point.new_users ?? 0), 0);
  const newCanvasesSum = trend.reduce((sum, point) => sum + Number(point.new_canvases ?? 0), 0);
  const yesterday = trend.length >= 2 ? trend[trend.length - 2] : null;
  const compareLabel = `较 ${range} 天前`;

  const cards: KpiSpec[] = stats
    ? [
        {
          label: "总用户数",
          value: formatNumber(stats.users),
          icon: Icons.user,
          tone: "",
          delta: isDemo ? DEMO_DELTA.users : growthDelta(stats.users, newUsersSum),
          compare: compareLabel,
        },
        {
          label: "总画布数",
          value: formatNumber(stats.canvases),
          icon: Icons.workspace,
          tone: "violet",
          delta: isDemo ? DEMO_DELTA.canvases : growthDelta(stats.canvases, newCanvasesSum),
          compare: compareLabel,
        },
        {
          label: "总节点数",
          value: formatNumber(stats.nodes),
          icon: Icons.code,
          tone: "blue",
          delta: null,
          compare: "全站累计",
        },
        {
          label: "今日 AI 调用",
          value: formatNumber(stats.todayAiCalls),
          icon: Icons.sparkles,
          tone: "green",
          delta: isDemo
            ? DEMO_DELTA.calls
            : yesterday
              ? percentDelta(stats.todayAiCalls, Number(yesterday.ai_calls))
              : null,
          compare: "较昨日",
        },
        {
          label: "今日新用户",
          value: formatNumber(stats.todayNewUsers),
          icon: Icons.userPlus,
          tone: "amber",
          delta: isDemo
            ? DEMO_DELTA.newUsers
            : yesterday
              ? percentDelta(stats.todayNewUsers, Number(yesterday.new_users))
              : null,
          compare: "较昨日",
        },
        ...(enhanced
          ? [
              {
                label: "今日 AI 成本",
                value: formatUsd(enhanced.todayCostUsd),
                icon: Icons.creditCard,
                tone: "red" as KpiTone,
                delta: null,
                compare: "按 token 计费",
              },
            ]
          : []),
      ]
    : [];

  const quotaRate = quota ? Number.parseFloat(quota.hitRate.replace("%", "")) : 0;
  const quotaWidth = Number.isFinite(quotaRate) ? Math.min(100, Math.max(0, quotaRate)) : 0;
  const allHealthy = Boolean(system?.apiOk && system.dbOk);
  const trendTickInterval = Math.max(0, Math.ceil(trend.length / 7) - 1);

  const handleRefresh = () => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  const handleExport = () => {
    if (!stats) return;
    const rows: Array<Array<string | number>> = [
      ["GoDeeper 运营报表", `${new Date().toISOString().slice(0, 10)} · 近 ${range} 天`],
      [],
      ["指标", "数值"],
      ...cards.map((card) => [card.label, card.value] as Array<string | number>),
      [],
      ["日期", "新增用户", "新增画布", "AI 调用"],
      ...trend.map((point) => [point.date, point.new_users, point.new_canvases, point.ai_calls]),
    ];
    downloadCsv("godeeper-dashboard", rows);
  };

  if (error) {
    return (
      <div className="gd-stack">
        <PageHeader
          title="仪表盘"
          description={`GoDeeper 运营概览 · 近 ${range} 天`}
          actions={
            <button className="gd-btn ghost" onClick={handleRefresh}>
              <Icons.refresh />
              重试
            </button>
          }
        />
        <SectionCard title="数据加载失败">
          <p className="gd-muted" style={{ marginTop: 0 }}>
            {error}
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="gd-stack">
      <PageHeader
        title="仪表盘"
        description={`GoDeeper 运营概览 · 近 ${range} 天${
          updatedAt ? ` · 数据更新于 ${formatClock(updatedAt)}` : ""
        }`}
        actions={
          <>
            <button className="gd-btn ghost" onClick={handleRefresh} disabled={loading}>
              <Icons.refresh />
              刷新
            </button>
            <button className="gd-btn" onClick={handleExport} disabled={!stats || loading}>
              <Icons.download />
              导出报表
            </button>
          </>
        }
      />

      {stats ? (
        <div className="gd-kpi-grid">
          {cards.map((card) => (
            <KpiCard
              key={card.label}
              label={card.label}
              value={card.value}
              icon={card.icon}
              tone={card.tone}
              hint={deltaNode(card.delta, card.compare)}
            />
          ))}
        </div>
      ) : (
        <SkeletonGrid count={6} />
      )}

      <div className="gd-grid chart-split">
        <SectionCard
          title={`${range} 天趋势`}
          description={`每日 AI 调用量与新用户数（近 ${range} 天）`}
          actions={
            <div className="gd-legend">
              <span className="gd-key">
                <span className="gd-swatch" />
                AI 调用（次）
              </span>
              <span className="gd-key">
                <span className="gd-swatch violet" />
                新增用户（人）
              </span>
            </div>
          }
        >
          {trend.length > 0 ? (
            <ChartContainer config={trendConfig} className="gd-chart">
              <BarChart data={trend} barGap={2}>
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={trendTickInterval}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={42} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="ai_calls" fill="var(--color-ai_calls)" radius={3} maxBarSize={14} />
                <Bar dataKey="new_users" fill="var(--color-new_users)" radius={3} maxBarSize={14} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="gd-empty" style={{ padding: "60px 20px" }}>
              <h4>暂无趋势数据</h4>
              <p>接口返回后会自动显示最近 {range} 天的变化。</p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="今日快照"
          description={updatedAt ? `截至 ${formatClock(updatedAt)} · 实时指标` : "实时指标"}
          actions={
            <StatusChip tone={allHealthy ? "ok" : "warn"} dot>
              {allHealthy ? "实时" : "部分异常"}
            </StatusChip>
          }
        >
          {enhanced ? (
            <>
              <div className="gd-statlist">
                <div className="gd-statrow">
                  <span className="gd-label">日活用户</span>
                  <span className="gd-val gd-num">{formatNumber(enhanced.dau)}</span>
                </div>
                <div className="gd-statrow">
                  <span className="gd-label">平均深度分</span>
                  <span className="gd-val gd-num">{formatNumber(enhanced.depthScore)}</span>
                </div>
                <div className="gd-statrow">
                  <span className="gd-label">失败任务</span>
                  <span className="gd-val gd-num">{formatNumber(enhanced.failedTasks)}</span>
                  {enhanced.failedTasks > 0 ? <StatusChip tone="warn">待排查</StatusChip> : null}
                </div>
                <div className="gd-statrow">
                  <span className="gd-label">风控告警</span>
                  <span className="gd-val gd-num">{formatNumber(enhanced.riskAlerts)}</span>
                  {enhanced.riskAlerts > 0 ? <StatusChip tone="danger">需处理</StatusChip> : null}
                </div>
              </div>
              <div className="gd-divider" />
              <div className="gd-quota-row">
                <span>免费配额命中率</span>
                <strong>{quota ? quota.hitRate : "—"}</strong>
              </div>
              <div className="gd-progress">
                <i style={{ width: `${quotaWidth}%` }} />
              </div>
              <div className="gd-mini-note gd-quota-note">
                {quota ? `${formatNumber(quota.hitLimit)} / ${formatNumber(quota.freeUsers)} 名免费用户达到每日上限` : "配额统计暂不可用"}
              </div>
              <div className="gd-divider" />
              <div className="gd-mini-note">
                <span className={`gd-status-dot${system?.apiOk ? "" : " red"}`} />
                数据管道{system?.apiOk ? "正常" : "异常"}
                {system?.syncedAt ? ` · 最近同步 ${formatClock(new Date(system.syncedAt))}` : ""}
              </div>
            </>
          ) : (
            <p className="gd-muted" style={{ fontSize: 12.5, margin: 0 }}>
              增强指标暂不可用，稍后刷新重试。
            </p>
          )}
        </SectionCard>
      </div>

      <div className="gd-grid dash-lower">
        <SectionCard
          title="最近注册用户"
          actions={
            <Link className="gd-link" href={`/admin/users${suffix}`}>
              查看全部 →
            </Link>
          }
          flush
        >
          <div className="gd-table-wrap">
            <table className="gd-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>套餐</th>
                  <th className="gd-right">注册时间</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <Link className="gd-cell-user" href={`/admin/users/${user.id}${suffix}`}>
                        <Avatar label={initials(user.email, user.displayName)} tone={avatarTone(user.email)} />
                        <div>
                          <div className="gd-name">{user.displayName || user.email.split("@")[0]}</div>
                          <div className="gd-mail">{user.email}</div>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <MembershipChip membership={user.membership} />
                    </td>
                    <td className="gd-right gd-num gd-muted">{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
                {recentUsers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="gd-muted">
                      暂无注册用户数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="系统状态"
          actions={
            <StatusChip tone={allHealthy ? "ok" : "warn"} dot>
              {allHealthy ? "服务正常" : "需要关注"}
            </StatusChip>
          }
        >
          <div className="gd-statlist">
            <div className="gd-statrow">
              <span className="gd-label">API 服务</span>
              <span className="gd-val gd-text-val">{system?.apiOk ? "正常" : "异常"}</span>
              <span className={`gd-status-dot${system?.apiOk ? "" : " red"}`} />
            </div>
            <div className="gd-statrow">
              <span className="gd-label">数据库</span>
              <span className="gd-val gd-text-val">{system?.dbOk ? "已连接" : "不可用"}</span>
              <span className={`gd-status-dot${system?.dbOk ? "" : " red"}`} />
            </div>
            <div className="gd-statrow">
              <span className="gd-label">模型供应商</span>
              <span className="gd-val gd-text-val">
                {system && system.modelsTotal > 0
                  ? `${system.modelsEnabled} / ${system.modelsTotal} 可用`
                  : "未配置"}
              </span>
              <span
                className={`gd-status-dot${
                  system && system.modelsTotal > 0 && system.modelsEnabled < system.modelsTotal ? " amber" : ""
                }`}
              />
            </div>
            <div className="gd-statrow">
              <span className="gd-label">待处理风控</span>
              <span className="gd-val gd-text-val">{formatNumber(enhanced?.riskAlerts ?? 0)} 个</span>
              <span className={`gd-status-dot${(enhanced?.riskAlerts ?? 0) > 0 ? " red" : ""}`} />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

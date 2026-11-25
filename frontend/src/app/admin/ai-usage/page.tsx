"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, XAxis, YAxis, Pie, PieChart, Cell } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Icons } from "@/components/icons";
import { api } from "@/lib/api";
import {
  MOCK_AI_OVERVIEW,
  MOCK_AI_TREND,
  MOCK_AI_RANKING,
  MOCK_QUOTA_HIT,
  MOCK_FEATURE_COST,
  MOCK_MODEL_COST,
} from "@/lib/admin-mock";
import {
  EmptyState,
  KpiCard,
  MembershipChip,
  PageHeader,
  SearchInput,
  SectionCard,
  SkeletonBlock,
  SkeletonGrid,
} from "@/components/admin/ui";
import { formatNumber, formatUsd } from "@/components/admin/format";

interface Overview {
  totalCalls: number;
  todayCalls: number;
  activeUsersToday: number;
  avgPerUser: number;
}

interface TrendPoint {
  date: string;
  calls: number;
}

interface RankedUser {
  email: string;
  membership: string;
  todayCalls: number;
  totalCalls: number;
}

interface QuotaHit {
  freeUsers: number;
  hitLimit: number;
  hitRate: string;
}

interface FeatureRow {
  feature: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
}

interface ModelRow {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
}

const trendConfig = {
  calls: { label: "AI 调用", color: "var(--gd-accent)" },
} satisfies ChartConfig;

const FEATURE_COLORS = ["var(--gd-accent)", "var(--gd-accent-2)", "#1d5fbf", "#a96400"];
const MODEL_COLORS = ["var(--gd-accent)", "var(--gd-accent-2)", "#1d5fbf", "#107c58", "#a96400"];

const FEATURE_LABELS: Record<string, string> = {
  task: "任务推理",
  inspire: "灵感启发",
  source: "来源分析",
  expand: "观点展开",
  summary: "摘要",
};

const featureChartConfig = {
  task: { label: "任务推理", color: "var(--gd-accent)" },
  inspire: { label: "灵感启发", color: "var(--gd-accent-2)" },
  source: { label: "来源分析", color: "#1d5fbf" },
  summary: { label: "摘要", color: "#a96400" },
} satisfies ChartConfig;

const modelChartConfig = {
  calls: { label: "调用次数" },
} satisfies ChartConfig;

export default function AdminAiUsage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [ranking, setRanking] = useState<RankedUser[]>([]);
  const [quotaHit, setQuotaHit] = useState<QuotaHit | null>(null);
  const [byFeature, setByFeature] = useState<FeatureRow[]>([]);
  const [byModel, setByModel] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([
      api.getAdminAiUsageOverview(),
      api.getAdminAiUsageTrend(),
      api.getAdminAiUsageRanking({ limit: 20 }),
      api.getAdminAiUsageQuotaHit(),
      api.getAdminAiUsageByFeature(30),
      api.getAdminAiUsageByModel(30),
    ])
      .then(([ov, tr, rk, qh, bf, bm]) => {
        setOverview(ov);
        setTrend(tr);
        setRanking(rk);
        setQuotaHit(qh);
        setByFeature(bf);
        setByModel(bm);
      })
      .catch(() => {
        setOverview(MOCK_AI_OVERVIEW);
        setTrend(MOCK_AI_TREND);
        setRanking(MOCK_AI_RANKING);
        setQuotaHit(MOCK_QUOTA_HIT);
        setByFeature(MOCK_FEATURE_COST);
        setByModel(MOCK_MODEL_COST);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalCost = byFeature.reduce((sum, row) => sum + Number(row.costUsd || 0), 0);
  const totalTokens = byFeature.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0);

  const filteredRanking = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranking;
    return ranking.filter((user) => user.email.toLowerCase().includes(q));
  }, [ranking, query]);

  const cards = overview
    ? [
        { label: "AI 总调用", value: formatNumber(overview.totalCalls), icon: Icons.sparkles, tone: "" as const },
        { label: "今日调用", value: formatNumber(overview.todayCalls), icon: Icons.activity, tone: "violet" as const },
        { label: "AI 活跃用户", value: formatNumber(overview.activeUsersToday), icon: Icons.user, tone: "" as const },
        { label: "人均调用", value: formatNumber(overview.avgPerUser), icon: Icons.barChart, tone: "amber" as const },
        { label: "30 天成本", value: formatUsd(totalCost), icon: Icons.creditCard, tone: "green" as const },
        { label: "30 天 Token", value: formatNumber(totalTokens), icon: Icons.database, tone: "violet" as const },
      ]
    : [];

  if (loading && !overview) {
    return (
      <div className="gd-stack">
        <PageHeader title="AI 用量" description="正在加载调用量、成本与配额数据…" />
        <SkeletonGrid count={6} />
        <SkeletonBlock height={300} />
      </div>
    );
  }

  return (
    <div className="gd-stack">
      <PageHeader
        title="AI 用量"
        description="追踪 AI 功能使用量、成本与免费用户配额命中情况。"
      />

      <div className="gd-kpi-grid">
        {cards.map((card) => (
          <KpiCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone={card.tone} />
        ))}
      </div>

      <div className="gd-grid chart-split">
        <SectionCard
          title="AI 调用趋势"
          description="最近 30 天，按天统计"
          actions={
            <div className="gd-legend">
              <span className="gd-key">
                <span className="gd-swatch" />
                调用次数（次）
              </span>
            </div>
          }
        >
          {trend.length > 0 ? (
            <ChartContainer config={trendConfig} className="gd-chart">
              <BarChart data={trend}>
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={4}
                  tickFormatter={(value: string) => value.slice(5)}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={42} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="calls" fill="var(--color-calls)" radius={3} maxBarSize={16} />
              </BarChart>
            </ChartContainer>
          ) : (
            <EmptyState title="暂无调用趋势" description="接口返回后会自动显示最近 30 天数据。" />
          )}
        </SectionCard>

        <SectionCard title="免费用户配额命中" description="触及每日上限的免费用户比例">
          {quotaHit ? (
            <>
              <div className="gd-kpi-value" style={{ fontSize: 40, color: "var(--gd-accent)" }}>
                {quotaHit.hitRate}
              </div>
              <p className="gd-hint" style={{ fontSize: 12 }}>
                {formatNumber(quotaHit.hitLimit)} / {formatNumber(quotaHit.freeUsers)} 名免费用户触及每日限额
              </p>
              <div className="gd-divider" />
              <div className="gd-mini-note gd-muted">
                <Icons.info />
                命中率越高，说明 AI 调用是付费转化的关键触发点。
              </div>
            </>
          ) : (
            <p className="gd-muted" style={{ fontSize: 12.5 }}>
              配额数据暂不可用。
            </p>
          )}
        </SectionCard>
      </div>

      <div className="gd-grid two">
        <SectionCard title="按功能成本分布" description="最近 30 天">
          {byFeature.length > 0 ? (
            <div className="gd-split-figure">
              <ChartContainer config={featureChartConfig} className="gd-donut">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={byFeature.map((row) => ({
                      feature: row.feature,
                      value: Number(row.costUsd || 0),
                    }))}
                    dataKey="value"
                    nameKey="feature"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {byFeature.map((row, index) => (
                      <Cell key={row.feature} fill={FEATURE_COLORS[index % FEATURE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="gd-figure-legend">
                {byFeature.map((row, index) => {
                  const cost = Number(row.costUsd || 0);
                  const percent = totalCost > 0 ? (cost / totalCost) * 100 : 0;
                  return (
                    <div className="gd-legend-row" key={row.feature}>
                      <span
                        className="gd-swatch"
                        style={{ background: FEATURE_COLORS[index % FEATURE_COLORS.length] }}
                      />
                      <span className="gd-legend-name">{FEATURE_LABELS[row.feature] ?? row.feature}</span>
                      <span className="gd-legend-value gd-num">
                        {formatUsd(cost)} · {percent.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState title="暂无成本数据" description="统计任务运行后会自动汇总。" />
          )}
        </SectionCard>

        <SectionCard title="按模型成本分布" description="最近 30 天">
          {byModel.length > 0 ? (
            <div className="gd-split-figure">
              <ChartContainer config={modelChartConfig} className="gd-donut">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={byModel.map((row) => ({
                      model: row.model || "未知",
                      value: Number(row.costUsd || 0),
                    }))}
                    dataKey="value"
                    nameKey="model"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {byModel.map((row, index) => (
                      <Cell key={row.model} fill={MODEL_COLORS[index % MODEL_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="gd-figure-legend">
                {byModel.map((row, index) => {
                  const cost = Number(row.costUsd || 0);
                  const modelTotal = byModel.reduce((sum, item) => sum + Number(item.costUsd || 0), 0);
                  const percent = modelTotal > 0 ? (cost / modelTotal) * 100 : 0;
                  return (
                    <div className="gd-legend-row" key={row.model}>
                      <span
                        className="gd-swatch"
                        style={{ background: MODEL_COLORS[index % MODEL_COLORS.length] }}
                      />
                      <span className="gd-legend-name">{row.model || "未知"}</span>
                      <span className="gd-legend-value gd-num">
                        {formatUsd(cost)} · {percent.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState title="暂无模型数据" description="模型调用产生成本后会自动汇总。" />
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="用户 AI 调用排行"
        description="按累计调用排序，展示今日用量与配额状态"
        actions={<SearchInput value={query} onChange={setQuery} placeholder="搜索邮箱…" />}
        flush
      >
        <div className="gd-table-wrap">
          <table className="gd-table">
            <thead>
              <tr>
                <th style={{ width: 42 }}>#</th>
                <th>用户</th>
                <th className="gd-right">今日调用</th>
                <th className="gd-right">累计调用</th>
                <th>套餐</th>
                <th>配额状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredRanking.map((user, index) => {
                const isPro = user.membership === "pro" || user.membership === "team";
                const atLimit = !isPro && user.todayCalls >= 10;
                return (
                  <tr key={user.email}>
                    <td className="gd-muted gd-num">{index + 1}</td>
                    <td className="gd-strong">{user.email}</td>
                    <td className="gd-right gd-num">{formatNumber(user.todayCalls)}</td>
                    <td className="gd-right gd-num">{formatNumber(user.totalCalls)}</td>
                    <td>
                      <MembershipChip membership={user.membership} />
                    </td>
                    <td>
                      {isPro ? (
                        <span className="gd-muted">无限</span>
                      ) : atLimit ? (
                        <span className="gd-chip warn">
                          <span className="gd-dot" />
                          {user.todayCalls}/10 已达上限
                        </span>
                      ) : (
                        <span className="gd-muted gd-num">{user.todayCalls}/10</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredRanking.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Icons.user}
                      title="没有匹配的用户"
                      description="试试清空邮箱关键词。"
                      action={
                        query ? (
                          <button className="gd-btn sm" onClick={() => setQuery("")}>
                            清空搜索
                          </button>
                        ) : null
                      }
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

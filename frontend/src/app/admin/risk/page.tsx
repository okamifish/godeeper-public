"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { MOCK_RISK_EVENTS } from "@/lib/admin-mock";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import {
  EmptyState,
  KpiCard,
  PageHeader,
  SearchInput,
  SectionCard,
  SkeletonBlock,
  StatusChip,
  Toolbar,
} from "@/components/admin/ui";
import { formatClock, formatDateTime, formatNumber } from "@/components/admin/format";

interface RiskEvent {
  id: string;
  userId?: string | null;
  email?: string | null;
  eventType: string;
  detail: string | null;
  status: string;
  createdAt: string;
}

type Severity = "high" | "medium" | "low";

/**
 * 事件级别没有独立字段，按风控规则的类型归类：
 * 频率突增视为高危，失败率异常为中危，超限类为低危（观察）。
 */
const EVENT_META: Record<string, { label: string; severity: Severity }> = {
  burst: { label: "请求频率突增", severity: "high" },
  high_fail_rate: { label: "失败率异常", severity: "medium" },
  failure_rate: { label: "失败率异常", severity: "medium" },
  daily_exceed: { label: "免费额度超限", severity: "low" },
  daily_abuse: { label: "日调用超限", severity: "low" },
};

const SEVERITY_META: Record<Severity, { label: string; tone: "danger" | "warn" | "muted" }> = {
  high: { label: "高", tone: "danger" },
  medium: { label: "中", tone: "warn" },
  low: { label: "低", tone: "muted" },
};

const STATUS_OPTIONS = [
  { value: "open", label: "状态：待处理" },
  { value: "resolved", label: "已处理" },
  { value: "", label: "全部" },
];

const SEVERITY_OPTIONS = [
  { value: "", label: "严重程度：全部" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

const PERIOD_OPTIONS = [
  { value: "24", label: "时间：近 24 小时" },
  { value: "168", label: "近 7 天" },
  { value: "720", label: "近 30 天" },
];

const PAGE_SIZE = 10;

function eventLabel(type: string) {
  return EVENT_META[type]?.label ?? type;
}

function eventSeverity(type: string): Severity {
  return EVENT_META[type]?.severity ?? "low";
}

export default function RiskPage() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("");
  const [period, setPeriod] = useState("168");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setLoadError(null);

      if (isDemo) {
        setEvents(MOCK_RISK_EVENTS as unknown as RiskEvent[]);
        setUpdatedAt(new Date());
        setLoading(false);
        return;
      }

      try {
        const rows = await api.getRiskEvents();
        if (!active) return;
        setEvents(Array.isArray(rows) ? (rows as RiskEvent[]) : []);
        setUpdatedAt(new Date());
      } catch {
        if (!active) return;
        setEvents([]);
        setLoadError("风控事件加载失败，请确认后端服务已启动且当前账号具备管理员权限。");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [isDemo, reloadKey]);

  const suffix = isDemo ? "?demo=1" : "";

  const filtered = useMemo(() => {
    const now = updatedAt?.getTime();
    const keyword = query.trim().toLowerCase();
    return events.filter((event) => {
      if (status && event.status !== status) return false;
      if (severity && eventSeverity(event.eventType) !== severity) return false;
      if (period && now) {
        const span = now - new Date(event.createdAt).getTime();
        if (Number.isNaN(span) || span > Number(period) * 3600000) return false;
      }
      if (keyword) {
        const haystack = `${eventLabel(event.eventType)} ${event.email ?? ""} ${event.detail ?? ""}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  }, [events, status, severity, period, query, updatedAt]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const current = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openEvents = useMemo(() => events.filter((event) => event.status === "open"), [events]);
  const openCounts = useMemo(
    () => ({
      high: openEvents.filter((event) => eventSeverity(event.eventType) === "high").length,
      medium: openEvents.filter((event) => eventSeverity(event.eventType) === "medium").length,
      low: openEvents.filter((event) => eventSeverity(event.eventType) === "low").length,
    }),
    [openEvents],
  );

  const avgAgeText = useMemo(() => {
    if (!openEvents.length || !updatedAt) return null;
    const total = openEvents.reduce(
      (sum, event) => sum + Math.max(0, updatedAt.getTime() - new Date(event.createdAt).getTime()),
      0,
    );
    const avgMs = total / openEvents.length;
    if (avgMs < 60_000) return "刚刚";
    if (avgMs < 3_600_000) return `${Math.round(avgMs / 60_000)} 分钟`;
    return `${(avgMs / 3_600_000).toFixed(1)} 小时`;
  }, [openEvents, updatedAt]);

  const resolvedRecent = useMemo(() => {
    const now = updatedAt?.getTime();
    return events
      .filter((event) => event.status === "resolved")
      .filter((event) => (now ? now - new Date(event.createdAt).getTime() <= 7 * 86400000 : true))
      .slice(0, 5);
  }, [events, updatedAt]);

  const resetFilters = () => {
    setStatus("open");
    setSeverity("");
    setPeriod("168");
    setQuery("");
    setPage(1);
  };

  const resolveEvent = async (id: string) => {
    try {
      if (!isDemo) await api.resolveRiskEvent(id);
      setEvents((prev) =>
        prev.map((event) => (event.id === id ? { ...event, status: "resolved" } : event)),
      );
      toast.success(isDemo ? "演示模式：已标记为已处理（未写入数据库）" : "已标记为已处理");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败，请稍后重试");
    }
  };

  const rowsText = filtered.length
    ? `显示 ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} 条，共 ${filtered.length} 条`
    : "没有匹配的事件";

  return (
    <div className="gd-stack">
      <PageHeader
        title="风控中心"
        description={`监控异常行为信号，处理风控事件${updatedAt ? ` · 数据同步于 ${formatClock(updatedAt)}` : ""}`}
        actions={
          <button
            className="gd-btn ghost"
            onClick={() => {
              setLoading(true);
              setReloadKey((key) => key + 1);
            }}
            disabled={loading}
          >
            <Icons.refresh />
            刷新
          </button>
        }
      />

      <div className="gd-kpi-grid four">
        <KpiCard
          label="高危告警"
          value={formatNumber(openCounts.high)}
          icon={Icons.alertCircle}
          tone="red"
          hint={<span>频率突增 · 待处理</span>}
        />
        <KpiCard
          label="中危告警"
          value={formatNumber(openCounts.medium)}
          icon={Icons.alertCircle}
          tone="amber"
          hint={<span>失败率异常 · 待处理</span>}
        />
        <KpiCard
          label="低危告警"
          value={formatNumber(openCounts.low)}
          icon={Icons.info}
          hint={<span>额度超限 · 观察</span>}
        />
        <KpiCard
          label="待处理事件"
          value={formatNumber(openEvents.length)}
          icon={Icons.activity}
          tone="violet"
          hint={
            avgAgeText ? (
              <>
                <span className="gd-delta down">需处理</span>
                <span>平均停留 {avgAgeText}</span>
              </>
            ) : (
              <span>全部已处理</span>
            )
          }
        />
      </div>

      <SectionCard flush>
        <Toolbar
          note={loading ? "正在加载…" : `${filtered.length} 条事件 · 待处理 ${openEvents.length} 条`}
        >
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="搜索事件类型、用户或详情…"
          />
          <select
            className="gd-select"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="按状态筛选"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="gd-select"
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value);
              setPage(1);
            }}
            aria-label="按严重程度筛选"
          >
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="gd-select"
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              setPage(1);
            }}
            aria-label="按时间范围筛选"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="gd-btn ghost sm" onClick={resetFilters}>
            重置
          </button>
        </Toolbar>

        {loading ? (
          <div style={{ padding: 18 }}>
            <SkeletonBlock height={220} />
          </div>
        ) : loadError ? (
          <div style={{ padding: "10px 0" }}>
            <EmptyState
              icon={Icons.toastError}
              title="风控事件加载失败"
              description={loadError}
              action={
                <button
                  className="gd-btn sm"
                  onClick={() => {
                    setLoading(true);
                    setReloadKey((key) => key + 1);
                  }}
                >
                  重试
                </button>
              }
            />
          </div>
        ) : (
          <>
            <div className="gd-table-wrap">
              <table className="gd-table">
                <thead>
                  <tr>
                    <th style={{ width: 74 }} className="gd-nowrap">
                      级别
                    </th>
                    <th style={{ width: 170 }} className="gd-nowrap">
                      事件
                    </th>
                    <th className="gd-nowrap">用户</th>
                    <th>详情</th>
                    <th style={{ width: 92 }} className="gd-nowrap">
                      状态
                    </th>
                    <th style={{ width: 132 }} className="gd-nowrap">
                      时间
                    </th>
                    <th className="gd-right gd-nowrap" style={{ width: 120 }}>
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((event) => {
                    const meta = SEVERITY_META[eventSeverity(event.eventType)];
                    return (
                      <tr key={event.id}>
                        <td className="gd-nowrap">
                          <StatusChip tone={meta.tone} dot>
                            {meta.label}
                          </StatusChip>
                        </td>
                        <td className="gd-nowrap">
                          <div className="gd-strong">{eventLabel(event.eventType)}</div>
                          <div className="gd-mail gd-mono">{event.id.slice(0, 8)}</div>
                        </td>
                        <td className="gd-nowrap">
                          {event.email ? (
                            event.userId ? (
                              <Link href={`/admin/users/${event.userId}${suffix}`} className="gd-link">
                                {event.email}
                              </Link>
                            ) : (
                              <span>{event.email}</span>
                            )
                          ) : (
                            <span className="gd-muted">—</span>
                          )}
                        </td>
                        <td className="gd-muted" style={{ maxWidth: 320 }}>
                          <span className="gd-cell-clamp">{event.detail ?? "—"}</span>
                        </td>
                        <td className="gd-nowrap">
                          {event.status === "resolved" ? (
                            <StatusChip tone="ok" dot>
                              已处理
                            </StatusChip>
                          ) : (
                            <StatusChip tone="warn" dot>
                              待处理
                            </StatusChip>
                          )}
                        </td>
                        <td className="gd-muted gd-nowrap gd-num">{formatDateTime(event.createdAt)}</td>
                        <td>
                          <div className="gd-row-actions gd-nowrap">
                            {event.status !== "resolved" ? (
                              <button className="gd-btn sm" onClick={() => resolveEvent(event.id)}>
                                标记已处理
                              </button>
                            ) : (
                              <span className="gd-muted" style={{ fontSize: 11.5 }}>
                                —
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {current.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon={Icons.circleCheck}
                          title={status === "open" ? "没有待处理事件" : "没有匹配的事件"}
                          description={
                            status === "open"
                              ? "当前信号都已处理，系统继续监控中。"
                              : "试试清空关键词或切换状态、严重程度、时间范围。"
                          }
                          action={
                            <button className="gd-btn sm" onClick={resetFilters}>
                              重置筛选
                            </button>
                          }
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="gd-table-foot">
              <span>{rowsText}</span>
              <div className="gd-pager">
                <button
                  className="gd-pg"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                  aria-label="上一页"
                >
                  <Icons.chevronLeft />
                </button>
                {Array.from({ length: totalPages }).slice(0, 7).map((_, index) => {
                  const pageNumber = index + 1;
                  return (
                    <button
                      key={pageNumber}
                      className={`gd-pg${pageNumber === safePage ? " active" : ""}`}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
                <button
                  className="gd-pg"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                  aria-label="下一页"
                >
                  <Icons.chevronRight />
                </button>
              </div>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard
        title="已处理事件"
        description="近 7 天 · 处理记录可用于复盘与规则调优"
        actions={
          <StatusChip tone={resolvedRecent.length ? "ok" : "muted"} dot>
            {resolvedRecent.length} 条
          </StatusChip>
        }
        flush
      >
        {resolvedRecent.length === 0 ? (
          <EmptyState
            icon={Icons.circleCheck}
            title="最近 7 天没有已处理的事件"
            description={`当前待处理事件为 ${openEvents.length} 条。处理完成后，记录会出现在这里。`}
          />
        ) : (
          <div className="gd-table-wrap">
            <table className="gd-table">
              <thead>
                <tr>
                  <th style={{ width: 74 }} className="gd-nowrap">
                    级别
                  </th>
                  <th className="gd-nowrap">事件</th>
                  <th className="gd-nowrap">用户</th>
                  <th style={{ width: 132 }} className="gd-nowrap">
                    时间
                  </th>
                </tr>
              </thead>
              <tbody>
                {resolvedRecent.map((event) => (
                  <tr key={event.id}>
                    <td className="gd-nowrap">
                      <StatusChip tone={SEVERITY_META[eventSeverity(event.eventType)].tone} dot>
                        {SEVERITY_META[eventSeverity(event.eventType)].label}
                      </StatusChip>
                    </td>
                    <td className="gd-strong gd-nowrap">{eventLabel(event.eventType)}</td>
                    <td className="gd-muted gd-nowrap">{event.email ?? "—"}</td>
                    <td className="gd-muted gd-nowrap gd-num">{formatDateTime(event.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

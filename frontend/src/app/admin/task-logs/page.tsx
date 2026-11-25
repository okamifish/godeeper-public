"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { MOCK_TASK_RUNS } from "@/lib/admin-mock";
import { Icons } from "@/components/icons";
import {
  EmptyState,
  PageHeader,
  SearchInput,
  SectionCard,
  SkeletonBlock,
  StatusChip,
  Toolbar,
} from "@/components/admin/ui";
import { formatDateTime, formatDuration, formatNumber } from "@/components/admin/format";

interface TaskRun {
  id: string;
  taskId: string;
  email: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  status: string;
  errorMsg: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  success: { label: "成功", tone: "ok" },
  failed: { label: "失败", tone: "danger" },
  running: { label: "运行中", tone: "warn" },
  timeout: { label: "超时", tone: "warn" },
};

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "success", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "running", label: "运行中" },
  { value: "timeout", label: "超时" },
];

export default function AdminTaskLogs() {
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    api
      .getAdminTaskRuns({ status: statusFilter || undefined, limit: 100 })
      .then((data) => setRuns(data))
      .catch(() => setRuns(MOCK_TASK_RUNS as unknown as TaskRun[]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const refresh = () => {
    setLoading(true);
    load();
  };

  const changeStatusFilter = (value: string) => {
    setStatusFilter(value);
    setLoading(true);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter(
      (run) => run.taskId.toLowerCase().includes(q) || run.email.toLowerCase().includes(q),
    );
  }, [runs, query]);

  return (
    <div className="gd-stack">
      <PageHeader
        title="任务日志"
        description="监控 AI 任务执行记录、Token 消耗与失败原因。"
        actions={
          <button className="gd-btn sm" onClick={refresh} disabled={loading}>
            <Icons.activity />
            刷新
          </button>
        }
      />

      <SectionCard flush>
        <Toolbar
          note={
            loading ? "正在加载…" : `共 ${filtered.length} 条记录${query ? ` · 搜索「${query}」` : ""}`
          }
        >
          <SearchInput value={query} onChange={setQuery} placeholder="搜索任务 ID 或用户邮箱…" />
          <select
            className="gd-select"
            value={statusFilter}
            onChange={(event) => changeStatusFilter(event.target.value)}
            aria-label="按状态筛选"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Toolbar>

        {loading ? (
          <div style={{ padding: 18 }}>
            <SkeletonBlock height={240} />
          </div>
        ) : (
          <div className="gd-table-wrap">
            <table className="gd-table">
              <thead>
                <tr>
                  <th>任务 ID</th>
                  <th>用户</th>
                  <th>模型</th>
                  <th className="gd-right">Token</th>
                  <th className="gd-right">耗时</th>
                  <th>状态</th>
                  <th>错误信息</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((run) => (
                  <tr key={run.id}>
                    <td className="gd-mono" title={run.taskId}>
                      {run.taskId.slice(0, 10)}
                    </td>
                    <td>{run.email}</td>
                    <td className="gd-muted">{run.model ?? "—"}</td>
                    <td className="gd-right gd-num">
                      {formatNumber((run.inputTokens ?? 0) + (run.outputTokens ?? 0))}
                    </td>
                    <td className="gd-right gd-num">{formatDuration(run.durationMs)}</td>
                    <td>
                      <StatusChip tone={STATUS_META[run.status]?.tone ?? "muted"}>
                        {STATUS_META[run.status]?.label ?? run.status}
                      </StatusChip>
                    </td>
                    <td
                      className="gd-muted"
                      style={{ maxWidth: 260 }}
                      title={run.errorMsg ?? undefined}
                    >
                      <span className="gd-cell-clamp" style={{ color: run.errorMsg ? "var(--gd-red)" : undefined }}>
                        {run.errorMsg ?? "—"}
                      </span>
                    </td>
                    <td className="gd-muted gd-nowrap">{formatDateTime(run.createdAt)}</td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        icon={Icons.activity}
                        title={runs.length === 0 ? "暂无任务记录" : "没有匹配的任务"}
                        description={
                          runs.length === 0
                            ? "AI 任务执行后，这里会显示调用与失败详情。"
                            : "试试清空关键词或切换状态筛选。"
                        }
                        action={
                          query || statusFilter ? (
                            <button
                              className="gd-btn sm"
                              onClick={() => {
                                setQuery("");
                                setStatusFilter("");
                              }}
                            >
                              清空筛选
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
        )}
      </SectionCard>
    </div>
  );
}

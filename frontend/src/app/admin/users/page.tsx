"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { MOCK_USERS } from "@/lib/admin-mock";
import { Icons } from "@/components/icons";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Avatar,
  EmptyState,
  MembershipChip,
  PageHeader,
  SearchInput,
  SectionCard,
  SkeletonBlock,
  Toolbar,
  membershipLabel,
} from "@/components/admin/ui";
import { avatarTone, formatClock, formatDate, formatDateTime, formatNumber, formatRelative, initials } from "@/components/admin/format";
import { downloadCsv } from "@/components/admin/download";

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  membership: string;
  createdAt: string;
  canvasCount?: number;
  nodeCount?: number;
  todayAiCalls?: number;
  lastActiveAt?: string | null;
}

const MEMBERSHIPS = ["free", "pro", "team"] as const;

const PAGE_SIZES = [10, 20, 50];

const PERIOD_OPTIONS = [
  { value: "all", label: "注册时间：全部" },
  { value: "7", label: "近 7 天" },
  { value: "30", label: "近 30 天" },
  { value: "90", label: "近 90 天" },
];

export default function AdminUsers() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const initialQuery = searchParams.get("q") ?? "";

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [membership, setMembership] = useState("");
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setLoadError(null);

      if (isDemo) {
        setUsers(MOCK_USERS as AdminUser[]);
        setUpdatedAt(new Date());
        setLoading(false);
        return;
      }

      try {
        const data = await api.getAdminUsers();
        if (!active) return;
        setUsers(Array.isArray(data) ? (data as AdminUser[]) : []);
        setUpdatedAt(new Date());
      } catch {
        if (!active) return;
        setUsers([]);
        setLoadError("用户列表加载失败，请确认后端服务已启动且当前账号具备管理员权限。");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [isDemo, reloadKey]);

  const suffixParams = new URLSearchParams();
  if (isDemo) suffixParams.set("demo", "1");
  const suffix = `?${suffixParams.toString()}`;

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const handleMembershipChange = (value: string) => {
    setMembership(value);
    setPage(1);
  };

  const handlePeriodChange = (value: string) => {
    setPeriod(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };

  const resetFilters = () => {
    setQuery("");
    setMembership("");
    setPeriod("all");
    setPage(1);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery =
        !q ||
        user.email.toLowerCase().includes(q) ||
        (user.displayName ?? "").toLowerCase().includes(q) ||
        user.id.toLowerCase().includes(q);
      const matchesMembership = !membership || user.membership === membership;
      const matchesPeriod =
        period === "all" ||
        (() => {
          if (!updatedAt) return false;
          const created = new Date(user.createdAt).getTime();
          if (Number.isNaN(created)) return false;
          const days = Number(period);
          return updatedAt.getTime() - created <= days * 86400000;
        })();
      return matchesQuery && matchesMembership && matchesPeriod;
    });
  }, [users, query, membership, period, updatedAt]);

  const monthNew = useMemo(() => {
    if (!updatedAt) return 0;
    return users.filter((user) => {
      const created = new Date(user.createdAt);
      return created.getFullYear() === updatedAt.getFullYear() && created.getMonth() === updatedAt.getMonth();
    }).length;
  }, [users, updatedAt]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const current = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const allOnPageSelected =
    current.length > 0 && current.every((user) => selected.includes(user.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAllOnPage = () => {
    const ids = current.map((user) => user.id);
    setSelected((prev) =>
      allOnPageSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids])),
    );
  };

  const applyMembership = async (ids: string[], nextMembership: string) => {
    if (!ids.length) return;
    if (isDemo) {
      setUsers((prev) =>
        prev.map((user) => (ids.includes(user.id) ? { ...user, membership: nextMembership } : user)),
      );
      toast.success(`演示模式：已将 ${ids.length} 位用户设为${membershipLabel(nextMembership)}`);
      setSelected([]);
      return;
    }
    const results = await Promise.allSettled(
      ids.map((id) => api.updateUserMembership(id, nextMembership)),
    );
    const okIds = ids.filter((_, index) => results[index].status === "fulfilled");
    if (okIds.length) {
      setUsers((prev) =>
        prev.map((user) => (okIds.includes(user.id) ? { ...user, membership: nextMembership } : user)),
      );
      toast.success(`已将 ${okIds.length} 位用户设为${membershipLabel(nextMembership)}`);
    }
    if (okIds.length < ids.length) {
      toast.error("部分用户更新失败，请稍后重试");
    }
    setSelected([]);
  };

  const handleExport = () => {
    if (!filtered.length) return;
    const rows: Array<Array<string | number>> = [
      ["用户 ID", "邮箱", "昵称", "套餐", "画布数", "节点数", "今日调用", "最近活跃", "注册时间"],
      ...filtered.map((user) => [
        user.id,
        user.email,
        user.displayName ?? "",
        membershipLabel(user.membership),
        user.canvasCount ?? 0,
        user.nodeCount ?? 0,
        user.todayAiCalls ?? 0,
        user.lastActiveAt ? formatDateTime(user.lastActiveAt) : "",
        formatDate(user.createdAt),
      ]),
    ];
    downloadCsv("godeeper-users", rows);
  };

  const handleRetry = () => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  return (
    <div className="gd-stack">
      <PageHeader
        title="用户管理"
        description={`管理账户、套餐与访问权限${updatedAt ? ` · 数据同步于 ${formatClock(updatedAt)}` : ""}`}
        actions={
          <button className="gd-btn" onClick={handleExport} disabled={loading || filtered.length === 0}>
            <Icons.download />
            导出 CSV
          </button>
        }
      />

      <SectionCard flush>
        <Toolbar
          note={
            loading
              ? "正在加载…"
              : `共 ${filtered.length} 位用户 · 本月新增 ${monthNew} 位${
                  selected.length ? ` · 已选 ${selected.length}` : ""
                }`
          }
        >
          <SearchInput
            value={query}
            onChange={handleQueryChange}
            placeholder="搜索邮箱、昵称或用户 ID…"
          />
          <select
            className="gd-select"
            value={membership}
            onChange={(event) => handleMembershipChange(event.target.value)}
            aria-label="按套餐筛选"
          >
            <option value="">全部套餐</option>
            {MEMBERSHIPS.map((m) => (
              <option key={m} value={m}>
                {membershipLabel(m)}
              </option>
            ))}
          </select>
          <select
            className="gd-select"
            value={period}
            onChange={(event) => handlePeriodChange(event.target.value)}
            aria-label="按注册时间筛选"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {selected.length > 0 ? (
            <select
              className="gd-select"
              value=""
              onChange={(event) => {
                if (event.target.value) applyMembership(selected, event.target.value);
              }}
              aria-label="批量设置套餐"
            >
              <option value="">批量设为…</option>
              {MEMBERSHIPS.map((m) => (
                <option key={m} value={m}>
                  {membershipLabel(m)}
                </option>
              ))}
            </select>
          ) : null}
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
              title="用户列表加载失败"
              description={loadError}
              action={
                <button className="gd-btn sm" onClick={handleRetry}>
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
                    <th style={{ width: 40 }}>
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={toggleAllOnPage}
                        aria-label="全选当前页"
                      />
                    </th>
                    <th>用户</th>
                    <th>套餐</th>
                    <th className="gd-right">画布数</th>
                    <th>最近活跃</th>
                    <th>注册时间</th>
                    <th style={{ width: 148 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <Checkbox
                          checked={selected.includes(user.id)}
                          onCheckedChange={() => toggleOne(user.id)}
                          aria-label={`选择 ${user.email}`}
                        />
                      </td>
                      <td>
                        <div className="gd-cell-user">
                          <Avatar
                            label={initials(user.email, user.displayName)}
                            tone={avatarTone(user.email)}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div className="gd-name">{user.displayName || user.email.split("@")[0]}</div>
                            <div className="gd-mail">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <MembershipChip membership={user.membership} />
                      </td>
                      <td className="gd-right gd-num">{formatNumber(user.canvasCount ?? 0)}</td>
                      <td>
                        {user.lastActiveAt ? (
                          <>
                            <div className="gd-nowrap">{formatRelative(user.lastActiveAt)}</div>
                            <div className="gd-mail">{formatDateTime(user.lastActiveAt)}</div>
                          </>
                        ) : (
                          <span className="gd-muted">—</span>
                        )}
                      </td>
                      <td className="gd-muted gd-nowrap gd-num">{formatDate(user.createdAt)}</td>
                      <td>
                        <div className="gd-row-actions">
                          <Link href={`/admin/users/${user.id}${suffix}`} className="gd-btn sm">
                            查看
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="gd-btn ghost sm" aria-label="更多操作">
                                <Icons.moreHorizontal />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>修改套餐</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {MEMBERSHIPS.map((m) => (
                                <DropdownMenuItem
                                  key={m}
                                  disabled={user.membership === m}
                                  onClick={() => applyMembership([user.id], m)}
                                >
                                  设为{membershipLabel(m)}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {current.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon={Icons.user}
                          title={users.length === 0 ? "还没有用户" : "没有匹配的用户"}
                          description={
                            users.length === 0
                              ? "用户注册后会出现在这里。"
                              : "试试清空关键词或切换套餐、注册时间筛选。"
                          }
                          action={
                            query || membership || period !== "all" ? (
                              <button className="gd-btn sm" onClick={resetFilters}>
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

            <div className="gd-table-foot">
              <span>
                第 {safePage} / {totalPages} 页 · 共 {filtered.length} 条
              </span>
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
              <label className="gd-pagesize">
                每页
                <select
                  className="gd-select"
                  style={{ height: 29, padding: "0 26px 0 8px" }}
                  value={pageSize}
                  onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                条
              </label>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

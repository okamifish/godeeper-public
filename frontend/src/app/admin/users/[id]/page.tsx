"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { MOCK_PLANS, MOCK_USER_DETAIL, MOCK_USER_ACTIVITY } from "@/lib/admin-mock";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import {
  Avatar,
  EmptyState,
  KpiCard,
  MembershipChip,
  SectionCard,
  SkeletonBlock,
  SkeletonGrid,
  StatusChip,
  membershipLabel,
} from "@/components/admin/ui";
import {
  avatarTone,
  formatDate,
  formatDateTime,
  formatDurationHuman,
  formatNumber,
  formatRelative,
  formatUsd,
  initials,
} from "@/components/admin/format";

interface UserStats {
  canvases: number;
  canvasesRecent30?: number;
  nodes: number;
  aiTotal: number;
  aiToday: number;
  totalCostUsd: string;
  monthCostUsd?: string;
}

interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  membership: string;
  apiProvider: string | null;
  createdAt: string;
  lastActiveAt?: string | null;
  stats: UserStats;
}

interface Activity {
  type: string;
  detail: string;
  createdAt: string;
  status?: string | null;
  model?: string | null;
  costUsd?: string | null;
  durationMs?: number | null;
  errorMsg?: string | null;
}

interface Plan {
  id: string;
  name: string;
  priceCents: number;
}

const TYPE_LABELS: Record<string, string> = {
  canvas_created: "创建画布",
  ai_call: "AI 调用",
  task_run: "执行任务",
};

const TYPE_DOTS: Record<string, string> = {
  canvas_created: "",
  ai_call: "violet",
  task_run: "amber",
};

const RUN_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  success: { label: "完成", tone: "ok" },
  failed: { label: "失败", tone: "danger" },
  timeout: { label: "超时", tone: "warn" },
  running: { label: "运行中", tone: "muted" },
};

const MEMBERSHIPS = ["free", "pro", "team"] as const;

const PROVIDER_LABELS: Record<string, string> = {
  siliconflow: "SiliconFlow",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

/** 近 7 天内有活跃记录才显示「活跃」，其余显示「近期无活动」。 */
const ACTIVE_WINDOW = 7 * 24 * 60 * 60 * 1000;

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  const [user, setUser] = useState<UserProfile | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setLoadError(null);

      if (isDemo) {
        setUser(MOCK_USER_DETAIL as unknown as UserProfile);
        setActivity(MOCK_USER_ACTIVITY as unknown as Activity[]);
        setPlans(MOCK_PLANS as unknown as Plan[]);
        setFetchedAt(new Date());
        setLoading(false);
        return;
      }

      try {
        const [profile, items, planRows] = await Promise.all([
          api.getAdminUser(id),
          api.getAdminUserActivity(id),
          api.getAdminPlans().catch(() => []),
        ]);
        if (!active) return;
        setUser(profile as UserProfile);
        setActivity(Array.isArray(items) ? (items as Activity[]) : []);
        setPlans(Array.isArray(planRows) ? (planRows as Plan[]) : []);
        setFetchedAt(new Date());
      } catch {
        if (!active) return;
        setUser(null);
        setLoadError("用户详情加载失败，请确认后端服务已启动且当前账号具备管理员权限。");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [id, isDemo, reloadKey]);

  const suffix = isDemo ? "?demo=1" : "";

  const changeMembership = async (next: string) => {
    if (!user || user.membership === next) return;
    setSaving(true);
    try {
      if (isDemo) {
        setUser({ ...user, membership: next });
        toast.success(`演示模式：已切换为${membershipLabel(next)}（未写入数据库）`);
        return;
      }
      await api.updateUserMembership(user.id, next);
      setUser({ ...user, membership: next });
      toast.success(`已设为${membershipLabel(next)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const focusMembership = () => {
    document.getElementById("membership")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (loading) {
    return (
      <div className="gd-stack">
        <SkeletonBlock height={76} />
        <SkeletonGrid count={4} />
        <SkeletonBlock height={220} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="gd-stack">
        <SectionCard>
          <EmptyState
            icon={Icons.user}
            title="无法加载该用户"
            description={loadError ?? "用户不存在或已被删除。"}
            action={
              <>
                <button className="gd-btn sm" onClick={() => router.push(`/admin/users${suffix}`)}>
                  返回用户列表
                </button>
                <button className="gd-btn sm" onClick={() => setReloadKey((key) => key + 1)}>
                  <Icons.refresh />
                  重试
                </button>
              </>
            }
          />
        </SectionCard>
      </div>
    );
  }

  const stats = user.stats;
  const displayName = user.displayName || user.email;
  const provider = user.apiProvider ? PROVIDER_LABELS[user.apiProvider] ?? user.apiProvider : "—";
  const isActive =
    user.lastActiveAt && fetchedAt
      ? fetchedAt.getTime() - new Date(user.lastActiveAt).getTime() <= ACTIVE_WINDOW
      : false;
  const avgNodes = stats.canvases > 0 ? Math.round(stats.nodes / stats.canvases) : null;
  const plan = plans.find((item) => item.name === user.membership);
  const priceText = plan ? (plan.priceCents === 0 ? "免费" : `每月 ${formatUsd(plan.priceCents / 100)}`) : null;

  return (
    <div className="gd-stack">
      <header className="gd-page-head">
        <div className="gd-user-head">
          <button
            className="gd-btn ghost sm"
            onClick={() => router.push(`/admin/users${suffix}`)}
            style={{ marginLeft: -8 }}
          >
            <Icons.chevronLeft />
            返回
          </button>
          <Avatar label={initials(user.email, user.displayName)} tone={avatarTone(user.email)} size="xl" />
          <div className="gd-user-head-text">
            <div className="gd-user-name">
              <h1 className="gd-page-title">{displayName}</h1>
              <MembershipChip membership={user.membership} />
              {isActive ? (
                <StatusChip tone="ok" dot>
                  活跃
                </StatusChip>
              ) : (
                <StatusChip tone="muted" dot>
                  近期无活动
                </StatusChip>
              )}
            </div>
            <p className="gd-page-sub">
              {user.email} · 注册于 {formatDate(user.createdAt)} · 最近活跃{" "}
              {user.lastActiveAt ? formatRelative(user.lastActiveAt) : "无记录"}
            </p>
          </div>
        </div>
        <div className="gd-page-actions">
          <a className="gd-btn sm" href={`mailto:${user.email}`}>
            <Icons.send />
            发送邮件
          </a>
          <button className="gd-btn primary sm" onClick={focusMembership}>
            调整套餐
          </button>
        </div>
      </header>

      <div className="gd-kpi-grid four">
        <KpiCard
          label="画布数"
          value={formatNumber(stats.canvases)}
          icon={Icons.workspace}
          hint={
            stats.canvasesRecent30 ? (
              <>
                <span className="gd-delta up">↑ {formatNumber(stats.canvasesRecent30)}</span>
                <span>近 30 天新增</span>
              </>
            ) : (
              <span>近 30 天无新增</span>
            )
          }
        />
        <KpiCard
          label="节点数"
          value={formatNumber(stats.nodes)}
          icon={Icons.code}
          tone="violet"
          hint={avgNodes ? <span>平均每画布 {avgNodes} 个</span> : <span>暂无画布</span>}
        />
        <KpiCard
          label="AI 总调用"
          value={formatNumber(stats.aiTotal)}
          icon={Icons.sparkles}
          tone="green"
          hint={<span>今日 {formatNumber(stats.aiToday)} 次</span>}
        />
        <KpiCard
          label="累计成本"
          value={formatUsd(stats.totalCostUsd)}
          icon={Icons.creditCard}
          tone="amber"
          hint={
            <>
              {stats.monthCostUsd ? <span>本月 {formatUsd(stats.monthCostUsd)}</span> : null}
              <span>按模型定价累计</span>
            </>
          }
        />
      </div>

      <div className="gd-grid user-detail">
        <div className="gd-stack">
          <SectionCard
            title="账户信息"
            actions={
              <span className="gd-chip muted">只读</span>
            }
          >
            <div className="gd-form-grid two">
              <div className="gd-field">
                <label>昵称</label>
                <div className="gd-strong">{user.displayName || "—"}</div>
              </div>
              <div className="gd-field">
                <label>用户 ID</label>
                <div className="gd-strong gd-mono">{user.id}</div>
              </div>
              <div className="gd-field">
                <label>邮箱</label>
                <div className="gd-strong">{user.email}</div>
              </div>
              <div className="gd-field">
                <label>API 提供商</label>
                <div className="gd-strong">{provider}</div>
              </div>
              <div className="gd-field">
                <label>注册时间</label>
                <div className="gd-strong gd-num">{formatDateTime(user.createdAt)}</div>
              </div>
              <div className="gd-field">
                <label>最近活跃</label>
                <div className="gd-strong gd-num">
                  {formatDateTime(user.lastActiveAt)}
                  {user.lastActiveAt ? (
                    <span className="gd-muted">（{formatRelative(user.lastActiveAt)}）</span>
                  ) : null}
                </div>
              </div>
            </div>
          </SectionCard>

          <div id="membership">
            <SectionCard
              title="会员等级"
              description="变更立即生效，下个计费周期按新套餐结算"
              actions={<StatusChip tone="ok">{saving ? "保存中…" : "当前生效"}</StatusChip>}
              footer={
                <div className="gd-risk-note">
                  <span className="gd-mini-note">风险操作：停用账户后将立即失去访问权限</span>
                  <button
                    className="gd-btn danger sm"
                    disabled
                    title="后台暂未提供停用账户接口，此按钮不会执行任何操作"
                  >
                    停用账户
                  </button>
                </div>
              }
            >
              <div className="gd-segmented" role="group" aria-label="会员等级">
                {MEMBERSHIPS.map((item) => (
                  <button
                    key={item}
                    className={user.membership === item ? "on" : ""}
                    disabled={saving || user.membership === item}
                    onClick={() => changeMembership(item)}
                    aria-pressed={user.membership === item}
                  >
                    {membershipLabel(item)}
                  </button>
                ))}
              </div>
              <div className="gd-divider" />
              <div className="gd-membership-row">
                <div>
                  <div className="gd-membership-plan">
                    {membershipLabel(user.membership)}
                    {priceText ? ` · ${priceText}` : ""}
                  </div>
                  <div className="gd-hint">
                    价格读取自后台套餐配置；计费周期与账单明细暂未接入。
                  </div>
                </div>
                <Link className="gd-btn sm" href={`/admin/billing${suffix}`}>
                  查看套餐
                </Link>
              </div>
            </SectionCard>
          </div>
        </div>

        <SectionCard
          title="最近活动"
          description={`共 ${activity.length} 条 · 按时间倒序`}
          className="gd-user-activity"
        >
          {activity.length === 0 ? (
            <EmptyState
              icon={Icons.activity}
              title="暂无活动记录"
              description="用户创建画布或调用 AI 后，这里会显示时间线。"
            />
          ) : (
            <div className="gd-timeline">
              {activity.map((item, index) => {
                const run = item.type === "task_run" ? RUN_STATUS[item.status ?? ""] : undefined;
                const meta =
                  item.type === "ai_call"
                    ? [item.model, item.costUsd ? formatUsd(item.costUsd) : null].filter(Boolean).join(" · ")
                    : item.type === "task_run"
                      ? [
                          item.durationMs ? `耗时 ${formatDurationHuman(item.durationMs)}` : null,
                          item.model,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "";
                return (
                  <div className="gd-tl-item" key={`${item.type}-${item.createdAt}-${index}`}>
                    <span className={`gd-tl-dot ${TYPE_DOTS[item.type] ?? ""}`} />
                    <div className="gd-tl-head">
                      <span className="gd-tl-title">{TYPE_LABELS[item.type] ?? item.type}</span>
                      {run ? <StatusChip tone={run.tone}>{run.label}</StatusChip> : null}
                      <span className="gd-tl-time">{formatDateTime(item.createdAt)}</span>
                    </div>
                    <div className="gd-tl-body">{item.detail}</div>
                    {meta ? <div className="gd-tl-meta">{meta}</div> : null}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

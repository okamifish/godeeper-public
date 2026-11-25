"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { MOCK_PLANS } from "@/lib/admin-mock";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import {
  Avatar,
  MembershipChip,
  PageHeader,
  SectionCard,
  StatusChip,
} from "@/components/admin/ui";
import { avatarTone, formatClock, initials } from "@/components/admin/format";

interface Health {
  status: string;
  version?: string;
  uptimeSeconds?: number;
  dbOk?: boolean;
}

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  canvasesLimit: number;
  nodesPerCanvas: number;
  aiTasksPerDay: number;
}

type QuotaField = "canvases" | "nodes" | "aiDaily";

interface QuotaValues {
  canvases: number;
  nodes: number;
  aiDaily: number;
}

type Quotas = Record<"free" | "pro" | "team", QuotaValues>;

interface SiteInfo {
  name: string;
  timezone: string;
  locale: string;
  supportEmail: string;
}

const SITE_DEFAULTS: SiteInfo = {
  name: "GoDeeper",
  timezone: "Asia/Shanghai (UTC+8)",
  locale: "简体中文",
  supportEmail: "support@godeeper.app",
};

const EMPTY_QUOTAS: Quotas = {
  free: { canvases: 0, nodes: 0, aiDaily: 0 },
  pro: { canvases: -1, nodes: -1, aiDaily: -1 },
  team: { canvases: -1, nodes: -1, aiDaily: -1 },
};

const TIERS: Array<{ key: keyof Quotas; label: string }> = [
  { key: "free", label: "免费版" },
  { key: "pro", label: "专业版" },
  { key: "team", label: "团队版" },
];

const DEMO_HEALTH: Health = {
  status: "ok",
  version: "0.1.0",
  uptimeSeconds: 3 * 86400 + 14 * 3600 + 22 * 60,
  dbOk: true,
};

function cloneQuotas(source: Quotas): Quotas {
  return {
    free: { ...source.free },
    pro: { ...source.pro },
    team: { ...source.team },
  };
}

/** 用后台套餐配置初始化三个等级的配额，避免把示例数字当成真实配置。 */
function quotasFromPlans(plans: Plan[]): Quotas {
  const next = cloneQuotas(EMPTY_QUOTAS);
  plans.forEach((plan) => {
    if (plan.name !== "free" && plan.name !== "pro" && plan.name !== "team") return;
    next[plan.name] = {
      canvases: plan.canvasesLimit,
      nodes: plan.nodesPerCanvas,
      aiDaily: plan.aiTasksPerDay,
    };
  });
  return next;
}

function formatUptime(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分`;
}

function planPrice(plan?: Plan): string | null {
  if (!plan) return null;
  if (plan.priceCents === 0) return "免费";
  return `$${(plan.priceCents / 100).toFixed(2)} / 月`;
}

function quotaDelta(current: Quotas, saved: Quotas): number {
  return TIERS.reduce((sum, tier) => {
    const a = current[tier.key];
    const b = saved[tier.key];
    return sum + (["canvases", "nodes", "aiDaily"] as QuotaField[]).filter((field) => a[field] !== b[field]).length;
  }, 0);
}

export default function AdminSettings() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  const [site, setSite] = useState<SiteInfo>(SITE_DEFAULTS);
  const [savedSite, setSavedSite] = useState<SiteInfo>(SITE_DEFAULTS);
  const [quotas, setQuotas] = useState<Quotas>(cloneQuotas(EMPTY_QUOTAS));
  const [savedQuotas, setSavedQuotas] = useState<Quotas>(cloneQuotas(EMPTY_QUOTAS));
  const [plans, setPlans] = useState<Plan[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      setPlansError(false);

      if (isDemo) {
        setHealth(DEMO_HEALTH);
        setAdminEmail("demo@godeeper.app");
        setPlans(MOCK_PLANS as unknown as Plan[]);
        const seeded = quotasFromPlans(MOCK_PLANS as unknown as Plan[]);
        setQuotas(cloneQuotas(seeded));
        setSavedQuotas(cloneQuotas(seeded));
        setLoading(false);
        return;
      }

      const [healthRes, me, planRows] = await Promise.all([
        api.getHealth().catch(() => null),
        api.getMe().catch(() => null),
        api.getAdminPlans().catch(() => null),
      ]);
      if (!active) return;

      if (healthRes) setHealth(healthRes);
      if (me) setAdminEmail(me.email);
      if (Array.isArray(planRows)) {
        setPlans(planRows as Plan[]);
        const seeded = quotasFromPlans(planRows as Plan[]);
        setQuotas(cloneQuotas(seeded));
        setSavedQuotas(cloneQuotas(seeded));
      } else {
        setPlansError(true);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isDemo]);

  const changedCount = useMemo(() => {
    const siteChanges = (Object.keys(site) as Array<keyof SiteInfo>).filter(
      (key) => site[key] !== savedSite[key],
    ).length;
    return siteChanges + quotaDelta(quotas, savedQuotas);
  }, [site, savedSite, quotas, savedQuotas]);

  const dirty = changedCount > 0;

  const updateSite = (key: keyof SiteInfo, value: string) => {
    setSite((prev) => ({ ...prev, [key]: value }));
  };

  const updateQuota = (tier: keyof Quotas, field: QuotaField, raw: string) => {
    const parsed = raw === "" ? 0 : Number(raw);
    const value = Number.isNaN(parsed) ? -1 : parsed;
    setQuotas((prev) => ({ ...prev, [tier]: { ...prev[tier], [field]: value } }));
  };

  const handleSave = () => {
    setSavedSite(site);
    setSavedQuotas(cloneQuotas(quotas));
    setSavedAt(new Date());
    toast.success("已更新当前页面配置（后端保存接口暂未接入，刷新后恢复）");
  };

  const handleReset = () => {
    setSite(savedSite);
    setQuotas(cloneQuotas(savedQuotas));
  };

  const healthOk = health?.status === "ok";
  const planOf = (name: keyof Quotas) => plans.find((plan) => plan.name === name);

  return (
    <div className="gd-stack">
      <PageHeader
        title="系统设置"
        description="配置站点信息、管理员访问与会员配额 · 仅主管理员可修改"
        actions={
          loading ? (
            <StatusChip tone="muted">检测中…</StatusChip>
          ) : healthOk ? (
            <StatusChip tone="ok" dot>
              运行正常
            </StatusChip>
          ) : (
            <StatusChip tone="danger" dot>
              无法连接
            </StatusChip>
          )
        }
      />

      <div className={`gd-notice${isDemo ? "" : " info"}`}>
        <Icons.info />
        <span>
          {isDemo ? (
            <>
              <strong>演示数据：</strong>站点信息、管理员账号与套餐配额均为示例值，保存只影响当前页面。
            </>
          ) : (
            <>
              <strong>尚未接入保存接口：</strong>基本信息与配额修改只在本页生效，刷新后恢复；管理员访问由环境变量
              <code> ADMIN_EMAILS </code>控制，不在此页面增删。
            </>
          )}
        </span>
      </div>

      <SectionCard
        title="基本信息"
        description="这些信息会出现在登录页与导出文件中（当前仅本地生效）"
      >
        <div className="gd-form-grid">
          <div className="gd-field">
            <label htmlFor="site-name">站点名称</label>
            <input
              id="site-name"
              className="gd-input"
              value={site.name}
              onChange={(event) => updateSite("name", event.target.value)}
            />
            <div className="gd-hint">建议不超过 20 个字符</div>
          </div>
          <div className="gd-field">
            <label htmlFor="site-env">运行环境</label>
            <input
              id="site-env"
              className="gd-input"
              value={process.env.NODE_ENV === "development" ? "本地开发（local）" : "生产（production）"}
              disabled
            />
            <div className="gd-hint">由部署配置决定，不可在此修改</div>
          </div>
          <div className="gd-field">
            <label htmlFor="site-version">版本</label>
            <input
              id="site-version"
              className="gd-input"
              value={health ? `${health.version ?? "—"} · ${formatUptime(health.uptimeSeconds)}` : "—"}
              disabled
            />
            <div className="gd-hint">
              {health ? (health.dbOk ? "数据库连接正常" : "数据库连接异常") : "读取 /health 实时状态"}
            </div>
          </div>
          <div className="gd-field">
            <label htmlFor="site-tz">时区</label>
            <select
              id="site-tz"
              className="gd-input"
              value={site.timezone}
              onChange={(event) => updateSite("timezone", event.target.value)}
            >
              <option value="Asia/Shanghai (UTC+8)">Asia/Shanghai (UTC+8)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
          <div className="gd-field">
            <label htmlFor="site-locale">默认语言</label>
            <select
              id="site-locale"
              className="gd-input"
              value={site.locale}
              onChange={(event) => updateSite("locale", event.target.value)}
            >
              <option value="简体中文">简体中文</option>
              <option value="English">English</option>
            </select>
          </div>
          <div className="gd-field">
            <label htmlFor="site-support">支持邮箱</label>
            <input
              id="site-support"
              className="gd-input"
              value={site.supportEmail}
              onChange={(event) => updateSite("supportEmail", event.target.value)}
            />
            <div className="gd-hint">用于用户反馈与账单问题</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="管理员访问"
        description="仅白名单内的邮箱可以登录管理后台"
        actions={<StatusChip tone="muted">{adminEmail ? "1 位管理员" : "—"}</StatusChip>}
      >
        {adminEmail ? (
          <div className="gd-mailrow">
            <Avatar label={initials(adminEmail)} tone={avatarTone(adminEmail)} />
            <div>
              <div className="gd-addr">{adminEmail}</div>
              <div className="gd-hint">当前登录账号 · 白名单由环境变量 ADMIN_EMAILS 控制</div>
            </div>
            <span className="gd-role">
              <StatusChip tone="pro" dot>
                管理员
              </StatusChip>
            </span>
          </div>
        ) : (
          <div className="gd-hint warn">
            无法获取当前管理员账号（可能未登录或接口不可用）。
          </div>
        )}
        <div className="gd-divider" />
        <p className="gd-hint">
          管理员增删、分级角色与邮件邀请暂未接入后台接口，请通过 <code>ADMIN_EMAILS</code> 环境变量调整。
        </p>
      </SectionCard>

      <SectionCard
        title="会员配额"
        description="限制每个等级的资源使用上限，超出后需升级套餐"
        actions={
          <>
            {plansError ? <StatusChip tone="danger">配额加载失败</StatusChip> : null}
            <StatusChip tone="muted">-1 = 不限</StatusChip>
          </>
        }
      >
        <div className="gd-grid three">
          {TIERS.map((tier) => {
            const plan = planOf(tier.key);
            const price = planPrice(plan);
            return (
              <div className="gd-quota-card" key={tier.key}>
                <div className="gd-quota-head">
                  <MembershipChip membership={tier.key} />
                  <span className="gd-quota-price">
                    {price ?? (tier.key === "free" ? "默认" : "价格未配置")}
                  </span>
                </div>
                <div className="gd-field">
                  <label htmlFor={`${tier.key}-canvases`}>最大画布数</label>
                  <div className="gd-input-unit">
                    <input
                      id={`${tier.key}-canvases`}
                      className="gd-input"
                      type="number"
                      min={-1}
                      value={quotas[tier.key].canvases}
                      onChange={(event) => updateQuota(tier.key, "canvases", event.target.value)}
                    />
                    <span className="gd-unit">{quotas[tier.key].canvases === -1 ? "不限" : "个"}</span>
                  </div>
                </div>
                <div className="gd-field">
                  <label htmlFor={`${tier.key}-nodes`}>最大节点数 / 画布</label>
                  <div className="gd-input-unit">
                    <input
                      id={`${tier.key}-nodes`}
                      className="gd-input"
                      type="number"
                      min={-1}
                      value={quotas[tier.key].nodes}
                      onChange={(event) => updateQuota(tier.key, "nodes", event.target.value)}
                    />
                    <span className="gd-unit">{quotas[tier.key].nodes === -1 ? "不限" : "个"}</span>
                  </div>
                </div>
                <div className="gd-field">
                  <label htmlFor={`${tier.key}-ai`}>AI 调用 / 天</label>
                  <div className="gd-input-unit">
                    <input
                      id={`${tier.key}-ai`}
                      className="gd-input"
                      type="number"
                      min={-1}
                      value={quotas[tier.key].aiDaily}
                      onChange={(event) => updateQuota(tier.key, "aiDaily", event.target.value)}
                    />
                    <span className="gd-unit">{quotas[tier.key].aiDaily === -1 ? "不限" : "次"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="gd-hint" style={{ marginTop: 12 }}>
          {loading
            ? "正在读取后台套餐配置…"
            : plansError
              ? "套餐配置读取失败，当前数值为空白默认值，请确认后端服务。"
              : "数值读取自后台套餐配置；保存只更新本页，未写入数据库。"}
        </div>
      </SectionCard>

      <div className="gd-savebar">
        <span className="gd-state">
          {dirty ? <span className="gd-dot" /> : null}
          {dirty ? `有 ${changedCount} 项未保存的更改` : "没有未保存的更改"}
        </span>
        <span className="gd-saved">
          {savedAt ? `上次保存：${formatClock(savedAt)} · 仅本页` : "尚未保存"}
        </span>
        <span className="gd-grow" />
        <button className="gd-btn ghost sm" onClick={handleReset} disabled={!dirty}>
          放弃更改
        </button>
        <button className="gd-btn primary sm" onClick={handleSave} disabled={!dirty}>
          保存更改
        </button>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icons } from "@/components/icons";
import { avatarTone, initials } from "@/components/admin/format";
import { isAuthenticated, getUser, refreshUser, clearToken } from "@/lib/auth";
import { api } from "@/lib/api";
import "./admin.css";

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

const NAV_GROUPS = [
  {
    label: "概览",
    items: [{ href: "/admin", label: "仪表盘", icon: Icons.dashboard }],
  },
  {
    label: "运营",
    items: [
      { href: "/admin/users", label: "用户管理", icon: Icons.user },
      { href: "/admin/canvases", label: "画布管理", icon: Icons.workspace },
      { href: "/admin/ai-usage", label: "AI 用量", icon: Icons.sparkles },
      { href: "/admin/task-logs", label: "任务日志", icon: Icons.activity },
    ],
  },
  {
    label: "配置",
    items: [
      { href: "/admin/models", label: "模型配置", icon: Icons.code },
      { href: "/admin/prompts", label: "Prompt 管理", icon: Icons.post },
      { href: "/admin/billing", label: "会员计费", icon: Icons.creditCard },
    ],
  },
  {
    label: "安全与系统",
    items: [
      { href: "/admin/risk", label: "风控中心", icon: Icons.lock },
      { href: "/admin/risk-config", label: "风控配置", icon: Icons.lock },
      { href: "/admin/settings", label: "系统设置", icon: Icons.settings },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

const RANGE_OPTIONS = [
  { value: "7", label: "近 7 天" },
  { value: "30", label: "近 30 天" },
  { value: "90", label: "近 90 天" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function RailNav({
  pathname,
  suffix,
  riskCount,
  onNavigate,
}: {
  pathname: string;
  suffix: string;
  riskCount: number;
  onNavigate?: () => void;
}) {
  return (
    <nav className="gd-rail-nav" aria-label="管理后台导航">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="gd-nav-label">{group.label}</div>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const showBadge = item.href === "/admin/risk" && riskCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href + suffix}
                className={`gd-nav-item${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
              >
                <item.icon />
                <span>{item.label}</span>
                {showBadge ? <span className="gd-nav-count">{riskCount}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const range = searchParams.get("range") ?? "30";
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [riskCount, setRiskCount] = useState(0);
  const [globalQuery, setGlobalQuery] = useState("");

  useEffect(() => {
    if (isDemo) return;

    if (!isAuthenticated()) {
      router.replace("/");
      return;
    }

    refreshUser()
      .then((user) => {
        if (!user) {
          clearToken();
          router.replace("/");
          return;
        }
        const email = user.email?.toLowerCase() ?? "";
        if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) {
          setError("权限不足，您的邮箱不在管理员列表中。");
          setReady(true);
          return;
        }
        setAllowed(true);
        setReady(true);
      })
      .catch(() => {
        clearToken();
        router.replace("/");
      });
  }, [router, isDemo]);

  useEffect(() => {
    if (isDemo) return;
    if (!ready) return;
    let active = true;
    api
      .getRiskEvents("open")
      .then((events) => {
        if (active) setRiskCount(Array.isArray(events) ? events.length : 0);
      })
      .catch(() => {
        if (active) setRiskCount(0);
      });
    return () => {
      active = false;
    };
  }, [isDemo, ready]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const bootReady = isDemo || ready;
  const effectiveRiskCount = isDemo ? 2 : riskCount;

  if (!bootReady) {
    return (
      <div className="admin-shell gd-boot">
        <div className="gd-boot-card">
          <p className="gd-boot-title">正在验证管理员权限…</p>
          <p className="gd-boot-text">请稍候，正在读取登录状态。</p>
          <Icons.spinner className="gd-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-shell gd-boot">
        <div className="gd-boot-card">
          <p className="gd-boot-title">无法进入管理后台</p>
          <p className="gd-boot-text">{error}</p>
          <button className="gd-btn primary" onClick={() => router.replace("/")}>
            返回应用
          </button>
        </div>
      </div>
    );
  }

  if (!allowed && !isDemo) return null;

  const user = getUser();
  const linkParams = new URLSearchParams();
  if (isDemo) linkParams.set("demo", "1");
  linkParams.set("range", range);
  const linkSuffix = `?${linkParams.toString()}`;
  const userEmail = user?.email ?? "";
  const displayEmail = isDemo ? "demo@godeeper.app" : userEmail || "admin";

  const handleRangeChange = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", value);
    router.replace(`${pathname}?${next.toString()}`);
  };

  const submitGlobalSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = globalQuery.trim();
    if (!query) return;
    const next = new URLSearchParams();
    if (isDemo) next.set("demo", "1");
    next.set("q", query);
    router.push(`/admin/users?${next.toString()}`);
  };
  const activeItem =
    NAV_ITEMS.filter((item) => isActive(pathname, item.href)).sort(
      (a, b) => b.href.length - a.href.length,
    )[0] ?? NAV_ITEMS[0];
  const isUserDetail = pathname.startsWith("/admin/users/") && pathname !== "/admin/users";
  const isDashboard = pathname === "/admin";

  const railFoot = (
    <div className="gd-rail-foot">
      <span className={`gd-avatar ${avatarTone(isDemo ? "demo" : userEmail || "admin")}`}>
        {isDemo ? "D" : initials(userEmail)}
      </span>
      <div className="gd-who">
        <div className="gd-who-name">{isDemo ? "Demo 模式" : "管理员"}</div>
        <div className="gd-who-sub">{displayEmail}</div>
      </div>
      <Link href="/" className="gd-btn ghost sm" aria-label="返回应用">
        <Icons.chevronLeft />
      </Link>
    </div>
  );

  return (
    <div className="admin-shell">
      <aside className="gd-rail">
        <div className="gd-brand">
          <span className="gd-brand-mark">GD</span>
          <div>
            <div className="gd-brand-name">GoDeeper</div>
            <div className="gd-brand-sub">OPERATIONS CONSOLE</div>
          </div>
        </div>
        <RailNav pathname={pathname} suffix={linkSuffix} riskCount={effectiveRiskCount} />
        {railFoot}
      </aside>

      {drawerOpen ? (
        <>
          <div className="gd-drawer-overlay" onClick={() => setDrawerOpen(false)} />
          <div className="gd-drawer" role="dialog" aria-label="导航菜单">
            <div className="gd-brand">
              <span className="gd-brand-mark">GD</span>
              <div>
                <div className="gd-brand-name">GoDeeper</div>
                <div className="gd-brand-sub">OPERATIONS CONSOLE</div>
              </div>
              <button
                className="gd-menu-btn"
                style={{ marginLeft: "auto" }}
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭菜单"
              >
                <Icons.close />
              </button>
            </div>
            <RailNav pathname={pathname} suffix={linkSuffix} riskCount={effectiveRiskCount} onNavigate={() => setDrawerOpen(false)} />
            {railFoot}
          </div>
        </>
      ) : null}

      <div className="gd-main">
        <header className="gd-topbar">
          <button
            className="gd-menu-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="打开导航菜单"
          >
            <Icons.panelLeft />
          </button>
          <div className="gd-crumbs">
            <span className="gd-crumb-root">管理后台</span>
            <span className="gd-sep gd-crumb-root">/</span>
            <span className="gd-now">{activeItem.label}</span>
            {isUserDetail ? (
              <>
                <span className="gd-sep">/</span>
                <span className="gd-now">用户详情</span>
              </>
            ) : null}
          </div>
          <div className="gd-top-actions">
            {isDemo ? (
              <span className="gd-demo-chip gd-hide-mobile">
                <span className="gd-dot" />
                Demo 数据
              </span>
            ) : null}
            <form className="gd-top-search" role="search" onSubmit={submitGlobalSearch}>
              <Icons.search />
              <input
                type="search"
                aria-label="搜索用户"
                placeholder="搜索用户"
                value={globalQuery}
                onChange={(event) => setGlobalQuery(event.target.value)}
              />
            </form>
            {isDashboard ? (
              <select
                className="gd-top-range"
                aria-label="统计周期"
                value={range}
                onChange={(event) => handleRangeChange(event.target.value)}
              >
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : null}
            <Link
              href={`/admin/risk${linkSuffix}`}
              className="gd-icon-btn gd-hide-mobile"
              aria-label={effectiveRiskCount > 0 ? `通知，${effectiveRiskCount} 个待处理风控事件` : "通知"}
              title={effectiveRiskCount > 0 ? `${effectiveRiskCount} 个待处理风控事件` : "通知"}
            >
              <Icons.notification />
              {effectiveRiskCount > 0 ? <span className="gd-ping" aria-hidden /> : null}
            </Link>
            <Link
              href={`/admin/settings${linkSuffix}`}
              className={`gd-avatar gd-avatar-btn ${avatarTone(isDemo ? "demo" : userEmail || "admin")}`}
              aria-label="系统设置"
              title={displayEmail}
            >
              {isDemo ? "M" : initials(userEmail)}
            </Link>
            {isDemo ? (
              <a href="/admin" className="gd-btn ghost sm gd-hide-mobile">
                退出 demo
              </a>
            ) : (
              <Link href="/" className="gd-btn ghost sm gd-hide-mobile">
                返回应用
              </Link>
            )}
          </div>
        </header>
        <div className="gd-content">{children}</div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="admin-shell gd-boot">
          <Icons.spinner className="gd-spin" />
        </div>
      }
    >
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </Suspense>
  );
}

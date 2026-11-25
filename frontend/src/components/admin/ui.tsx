import type { ComponentType, ReactNode } from "react";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string }>;

export type KpiTone = "" | "violet" | "green" | "amber" | "red" | "blue";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="gd-page-head">
      <div>
        <h1 className="gd-page-title">{title}</h1>
        {description ? <p className="gd-page-sub">{description}</p> : null}
      </div>
      {actions ? <div className="gd-page-actions">{actions}</div> : null}
    </header>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  icon: Icon,
  tone = "",
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: IconComponent;
  tone?: KpiTone;
  hint?: ReactNode;
}) {
  return (
    <div className="gd-kpi">
      <div className="gd-kpi-top">
        <span className="gd-kpi-label">{label}</span>
        {Icon ? (
          <span className={cn("gd-kpi-ic", tone)}>
            <Icon />
          </span>
        ) : null}
      </div>
      <div className="gd-kpi-value">
        {value}
        {unit ? <span className="gd-unit">{unit}</span> : null}
      </div>
      {hint ? <div className="gd-kpi-foot">{hint}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  footer,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("gd-card", className)}>
      {title || actions ? (
        <div className="gd-card-head">
          <div>
            {title ? <div className="gd-card-title">{title}</div> : null}
            {description ? <div className="gd-card-desc">{description}</div> : null}
          </div>
          {actions ? <div className="gd-card-head-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("gd-card-body", flush && "flush", bodyClassName)}>{children}</div>
      {footer ? <div className="gd-card-foot">{footer}</div> : null}
    </section>
  );
}

export function EmptyState({
  icon: Icon = Icons.search,
  title,
  description,
  action,
}: {
  icon?: IconComponent;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="gd-empty">
      <div className="gd-empty-ic">
        <Icon />
      </div>
      <h4>{title}</h4>
      {description ? <p>{description}</p> : null}
      {action ? <div className="gd-empty-actions">{action}</div> : null}
    </div>
  );
}

const MEMBERSHIP_META: Record<string, { label: string; tone: string }> = {
  free: { label: "免费版", tone: "free" },
  pro: { label: "专业版", tone: "pro" },
  team: { label: "团队版", tone: "team" },
};

export function membershipLabel(membership: string): string {
  return MEMBERSHIP_META[membership]?.label ?? membership;
}

export function MembershipChip({ membership }: { membership: string }) {
  const meta = MEMBERSHIP_META[membership];
  return <span className={cn("gd-chip", meta?.tone ?? "muted")}>{meta?.label ?? membership}</span>;
}

export function StatusChip({
  tone = "muted",
  dot = false,
  children,
}: {
  tone?: "ok" | "warn" | "danger" | "muted" | "free" | "pro" | "team";
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cn("gd-chip", tone)}>
      {dot ? <span className="gd-dot" /> : null}
      {children}
    </span>
  );
}

export function Toolbar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="gd-toolbar">
      {children}
      {note ? <span className="gd-note">{note}</span> : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "搜索…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("gd-search", className)}>
      <Icons.search />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

export function Avatar({
  label,
  tone = "",
  size = "",
}: {
  label: string;
  tone?: string;
  size?: "" | "lg" | "xl";
}) {
  return <span className={cn("gd-avatar", tone, size)}>{label}</span>;
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="gd-kpi-grid">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="gd-skeleton gd-skeleton-kpi" />
      ))}
    </div>
  );
}

export function SkeletonBlock({ height = 180 }: { height?: number }) {
  return <div className="gd-skeleton" style={{ height }} />;
}

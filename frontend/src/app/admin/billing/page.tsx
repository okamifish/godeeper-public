"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MOCK_PLANS } from "@/lib/admin-mock";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  SkeletonBlock,
  Toolbar,
} from "@/components/admin/ui";

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  canvasesLimit: number;
  nodesPerCanvas: number;
  aiTasksPerDay: number;
  isUnlimited?: boolean;
  stripePriceId: string | null;
}

const DEFAULT_PLAN = {
  name: "",
  priceCents: 0,
  canvasesLimit: 3,
  nodesPerCanvas: 50,
  aiTasksPerDay: 10,
  isUnlimited: false,
};

const PLAN_LABELS: Record<string, string> = { free: "免费版", pro: "专业版", team: "团队版" };

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState(DEFAULT_PLAN);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api
      .getAdminPlans()
      .then(setPlans)
      .catch(() => setPlans(MOCK_PLANS as unknown as Plan[]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.updateAdminPlan(editing, form);
        toast.success("套餐已更新");
      } else {
        await api.createAdminPlan(form);
        toast.success("套餐已创建");
      }
      setForm(DEFAULT_PLAN);
      setEditing(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (plan: Plan) => {
    setEditing(plan.id);
    setForm({
      name: plan.name,
      priceCents: plan.priceCents,
      canvasesLimit: plan.canvasesLimit,
      nodesPerCanvas: plan.nodesPerCanvas,
      aiTasksPerDay: plan.aiTasksPerDay,
      isUnlimited: plan.isUnlimited ?? false,
    });
  };

  const setField = (field: keyof typeof DEFAULT_PLAN, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: field === "name" ? value : Number(value),
    }));
  };

  return (
    <div className="gd-stack">
      <PageHeader
        title="会员计费"
        description="管理套餐价格与配额限制。Stripe 集成尚未接入。"
      />

      <div className="gd-notice">
        <Icons.alertCircle />
        <span>
          <strong>Stripe 集成待办：</strong>
          需要通过环境变量 <code>STRIPE_SECRET_KEY</code> 连接账号，配置 webhook（checkout.session.completed、
          customer.subscription.updated、invoice.payment_failed），并用 <code>stripePriceId</code> 关联套餐价格。
          客户门户负责升级、降级与取消。
        </span>
      </div>

      <SectionCard
        title={editing ? "编辑套餐" : "添加套餐"}
        description="价格为人民币，填写单位为分；画布数 / 节点数填 -1 表示不限，AI 次数填 0 表示不限；勾选「无限额度」会同时放开三项。"
      >
        <div className="gd-form-grid">
          <div className="gd-field">
            <label htmlFor="plan-name">套餐名称</label>
            <input
              id="plan-name"
              className="gd-input"
              placeholder="free / pro / team"
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
            />
          </div>
          <div className="gd-field">
            <label htmlFor="plan-price">价格</label>
            <div className="gd-input-unit">
              <input
                id="plan-price"
                className="gd-input"
                type="number"
                min={0}
                value={form.priceCents}
                onChange={(event) => setField("priceCents", event.target.value)}
              />
              <span className="gd-unit">分</span>
            </div>
          </div>
          <div className="gd-field">
            <label htmlFor="plan-canvases">画布数上限</label>
            <div className="gd-input-unit">
              <input
                id="plan-canvases"
                className="gd-input"
                type="number"
                min={-1}
                value={form.canvasesLimit}
                onChange={(event) => setField("canvasesLimit", event.target.value)}
              />
              <span className="gd-unit">个</span>
            </div>
          </div>
          <div className="gd-field">
            <label htmlFor="plan-nodes">每画布节点上限</label>
            <div className="gd-input-unit">
              <input
                id="plan-nodes"
                className="gd-input"
                type="number"
                min={-1}
                value={form.nodesPerCanvas}
                onChange={(event) => setField("nodesPerCanvas", event.target.value)}
              />
              <span className="gd-unit">个</span>
            </div>
          </div>
          <div className="gd-field">
            <label htmlFor="plan-ai">AI 任务 / 天</label>
            <div className="gd-input-unit">
              <input
                id="plan-ai"
                className="gd-input"
                type="number"
                min={0}
                value={form.aiTasksPerDay}
                onChange={(event) => setField("aiTasksPerDay", event.target.value)}
              />
              <span className="gd-unit">次</span>
            </div>
          </div>
          <div className="gd-field">
            <label htmlFor="plan-unlimited">无限额度</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 38 }}>
              <input
                id="plan-unlimited"
                type="checkbox"
                checked={form.isUnlimited}
                onChange={(event) => setForm((prev) => ({ ...prev, isUnlimited: event.target.checked }))}
              />
              <span className="gd-muted">勾选后不再限制以上三项</span>
            </label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            className="gd-btn primary"
            onClick={handleSubmit}
            disabled={saving || !form.name}
          >
            {saving ? "保存中…" : editing ? "更新套餐" : "创建套餐"}
          </button>
          {editing ? (
            <button
              className="gd-btn"
              onClick={() => {
                setEditing(null);
                setForm(DEFAULT_PLAN);
              }}
            >
              取消编辑
            </button>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard flush>
        <Toolbar note={`共 ${plans.length} 个套餐`}>
          <span className="gd-card-title">套餐列表</span>
        </Toolbar>
        {loading ? (
          <div style={{ padding: 18 }}>
            <SkeletonBlock height={180} />
          </div>
        ) : (
          <div className="gd-table-wrap">
            <table className="gd-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th className="gd-right">价格</th>
                  <th className="gd-right">画布数</th>
                  <th className="gd-right">节点 / 画布</th>
                  <th className="gd-right">AI / 天</th>
                  <th>Stripe Price</th>
                  <th style={{ width: 60 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td className="gd-strong">{PLAN_LABELS[plan.name] ?? plan.name}</td>
                    <td className="gd-right gd-num">¥{(plan.priceCents / 100).toFixed(2)}</td>
                    <td className="gd-right gd-num">{plan.isUnlimited ? "∞" : plan.canvasesLimit === -1 ? "∞" : plan.canvasesLimit}</td>
                    <td className="gd-right gd-num">{plan.isUnlimited ? "∞" : plan.nodesPerCanvas === -1 ? "∞" : plan.nodesPerCanvas}</td>
                    <td className="gd-right gd-num">{plan.isUnlimited ? "∞" : plan.aiTasksPerDay === 0 ? "∞" : plan.aiTasksPerDay}</td>
                    <td className="gd-mono gd-muted">{plan.stripePriceId ?? "—"}</td>
                    <td>
                      <button className="gd-link" onClick={() => startEdit(plan)}>
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
                {plans.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={Icons.creditCard}
                        title="暂未配置套餐"
                        description="至少创建一个免费版套餐，用户注册后才能正常使用。"
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

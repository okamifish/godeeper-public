"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MOCK_MODELS } from "@/lib/admin-mock";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusChip,
  Toolbar,
} from "@/components/admin/ui";

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  modelName: string;
  inputPricePer1k: string | null;
  outputPricePer1k: string | null;
  enabled: boolean | null;
  allowedPlans: string | null;
}

const EMPTY = {
  name: "",
  provider: "openrouter",
  modelName: "",
  inputPricePer1k: "0",
  outputPricePer1k: "0",
  allowedPlans: "free,pro,team",
};

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

const PLAN_LABELS: Record<string, string> = { free: "免费版", pro: "专业版", team: "团队版" };

export default function AdminModels() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api
      .getAdminModels()
      .then(setModels)
      .catch(() => setModels(MOCK_MODELS as unknown as ModelConfig[]));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.createAdminModel(form);
      setForm(EMPTY);
      setShowForm(false);
      toast.success("模型已添加");
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加失败");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (model: ModelConfig) => {
    try {
      await api.updateAdminModel(model.id, { enabled: !model.enabled });
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态更新失败");
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteAdminModel(id);
      toast.success("模型已删除");
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  return (
    <div className="gd-stack">
      <PageHeader
        title="模型配置"
        description="MVP 阶段仅作为「预设模板」：给用户推荐常见服务商与模型名，不参与实际调用与计费。"
        actions={
          <button className="gd-btn primary" onClick={() => setShowForm((prev) => !prev)}>
            <Icons.add />
            {showForm ? "取消添加" : "添加模型"}
          </button>
        }
      />

      <div className="gd-notice">
        <Icons.info />
        <span>
          MVP 采用 BYOK：用户在自己的「设置 → 模型配置」里填 Base URL、模型名和 Key。这里维护的模型只用于推荐展示，
          不会改变用户实际使用的模型，也不产生平台成本。
        </span>
      </div>

      {showForm ? (
        <SectionCard title="添加模型" description="价格单位为美元 / 1k tokens">
          <div className="gd-form-grid">
            <div className="gd-field">
              <label htmlFor="model-name">名称</label>
              <input
                id="model-name"
                className="gd-input"
                placeholder="如 DeepSeek V4"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="gd-field">
              <label htmlFor="model-provider">提供商</label>
              <select
                id="model-provider"
                className="gd-select"
                style={{ width: "100%" }}
                value={form.provider}
                onChange={(event) => setForm({ ...form, provider: event.target.value })}
              >
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div className="gd-field">
              <label htmlFor="model-id">模型 ID</label>
              <input
                id="model-id"
                className="gd-input"
                placeholder="如 gpt-4o"
                value={form.modelName}
                onChange={(event) => setForm({ ...form, modelName: event.target.value })}
              />
            </div>
            <div className="gd-field">
              <label htmlFor="model-input-price">输入价格</label>
              <div className="gd-input-unit">
                <input
                  id="model-input-price"
                  className="gd-input"
                  value={form.inputPricePer1k}
                  onChange={(event) => setForm({ ...form, inputPricePer1k: event.target.value })}
                />
                <span className="gd-unit">$/1k</span>
              </div>
            </div>
            <div className="gd-field">
              <label htmlFor="model-output-price">输出价格</label>
              <div className="gd-input-unit">
                <input
                  id="model-output-price"
                  className="gd-input"
                  value={form.outputPricePer1k}
                  onChange={(event) => setForm({ ...form, outputPricePer1k: event.target.value })}
                />
                <span className="gd-unit">$/1k</span>
              </div>
            </div>
            <div className="gd-field">
              <label htmlFor="model-plans">允许套餐</label>
              <input
                id="model-plans"
                className="gd-input"
                placeholder="free,pro,team"
                value={form.allowedPlans}
                onChange={(event) => setForm({ ...form, allowedPlans: event.target.value })}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              className="gd-btn primary"
              onClick={save}
              disabled={saving || !form.name || !form.modelName}
            >
              {saving ? "保存中…" : "保存模型"}
            </button>
            <button className="gd-btn" onClick={() => setForm(EMPTY)}>
              重置
            </button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard flush>
        <Toolbar note={`共 ${models.length} 个模型`}>
          <span className="gd-card-title">全部模型</span>
        </Toolbar>
        <div className="gd-table-wrap">
          <table className="gd-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>提供商</th>
                <th>模型</th>
                <th className="gd-right">输入 $/1k</th>
                <th className="gd-right">输出 $/1k</th>
                <th>状态</th>
                <th>套餐</th>
                <th style={{ width: 64 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id}>
                  <td className="gd-strong">{model.name}</td>
                  <td className="gd-muted">{PROVIDER_LABELS[model.provider] ?? model.provider}</td>
                  <td className="gd-mono">{model.modelName}</td>
                  <td className="gd-right gd-num">{model.inputPricePer1k ?? "0"}</td>
                  <td className="gd-right gd-num">{model.outputPricePer1k ?? "0"}</td>
                  <td>
                    <button
                      className="gd-link"
                      onClick={() => toggle(model)}
                      title="点击切换启用状态"
                    >
                      {model.enabled ? (
                        <StatusChip tone="ok" dot>
                          已启用
                        </StatusChip>
                      ) : (
                        <StatusChip tone="muted">已禁用</StatusChip>
                      )}
                    </button>
                  </td>
                  <td>
                    <span className="gd-muted" style={{ fontSize: 11.5 }}>
                      {(model.allowedPlans ?? "")
                        .split(",")
                        .filter(Boolean)
                        .map((plan) => PLAN_LABELS[plan] ?? plan)
                        .join(" / ") || "—"}
                    </span>
                  </td>
                  <td>
                    <button className="gd-btn ghost sm" onClick={() => remove(model.id)} title="删除模型">
                      <Icons.trash />
                    </button>
                  </td>
                </tr>
              ))}
              {models.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={Icons.code}
                      title="还没有配置模型"
                      description="添加至少一个模型后，AI 功能才可用。"
                      action={
                        <button className="gd-btn primary sm" onClick={() => setShowForm(true)}>
                          添加模型
                        </button>
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

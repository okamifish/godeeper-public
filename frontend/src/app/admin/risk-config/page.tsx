"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import {
  PageHeader,
  SectionCard,
  SkeletonBlock,
} from "@/components/admin/ui";

interface RiskConfigForm {
  burstPerMinute: number;
  failureRateThreshold: number;
  failureMinSamples: number;
  dailyWatchLimitFree: number;
}

const DEFAULTS: RiskConfigForm = {
  burstPerMinute: 10,
  failureRateThreshold: 0.5,
  failureMinSamples: 5,
  dailyWatchLimitFree: 50,
};

export default function RiskConfigPage() {
  const [form, setForm] = useState<RiskConfigForm>(DEFAULTS);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getAdminRiskConfig()
      .then((result) => {
        setForm(result.config);
        setUpdatedAt(result.updatedAt);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "读取风控配置失败"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await api.updateAdminRiskConfig(form);
      setForm(result.config as unknown as RiskConfigForm);
      toast.success("风控配置已保存，立即生效");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const setNumber = (field: keyof RiskConfigForm, value: string, scale = 1) => {
    setForm((prev) => ({ ...prev, [field]: Number(value) / scale }));
  };

  if (loading) {
    return (
      <div className="gd-stack">
        <PageHeader title="风控配置" description="正在读取当前阈值…" />
        <SkeletonBlock height={260} />
      </div>
    );
  }

  return (
    <div className="gd-stack">
      <PageHeader
        title="风控配置"
        description="调整 AI 调用频率与失败率阈值，保存后立即生效（后端缓存最多 60 秒刷新）。"
      />

      <div className="gd-notice">
        <Icons.info />
        <span>
          这些阈值用于拦截滥用：一分钟内超过上限直接返回 429；近一小时失败率达到阈值时也会被暂时拦截。
          阈值改小会更严格，改大会更宽松。
        </span>
      </div>

      <SectionCard
        title="阈值"
        description={updatedAt ? `上次更新：${new Date(updatedAt).toLocaleString()}` : "尚未保存过，当前使用默认值。"}
      >
        <div className="gd-form-grid">
          <div className="gd-field">
            <label htmlFor="risk-burst">每分钟最多 AI 请求</label>
            <div className="gd-input-unit">
              <input
                id="risk-burst"
                className="gd-input"
                type="number"
                min={1}
                max={10000}
                value={form.burstPerMinute}
                onChange={(event) => setNumber("burstPerMinute", event.target.value)}
              />
              <span className="gd-unit">次</span>
            </div>
          </div>
          <div className="gd-field">
            <label htmlFor="risk-rate">失败率阈值</label>
            <div className="gd-input-unit">
              <input
                id="risk-rate"
                className="gd-input"
                type="number"
                min={5}
                max={100}
                value={Math.round(form.failureRateThreshold * 100)}
                onChange={(event) => setNumber("failureRateThreshold", event.target.value, 100)}
              />
              <span className="gd-unit">%</span>
            </div>
          </div>
          <div className="gd-field">
            <label htmlFor="risk-samples">失败率最少样本数</label>
            <div className="gd-input-unit">
              <input
                id="risk-samples"
                className="gd-input"
                type="number"
                min={1}
                max={100}
                value={form.failureMinSamples}
                onChange={(event) => setNumber("failureMinSamples", event.target.value)}
              />
              <span className="gd-unit">次</span>
            </div>
          </div>
          <div className="gd-field">
            <label htmlFor="risk-daily">免费账号单日观察阈值</label>
            <div className="gd-input-unit">
              <input
                id="risk-daily"
                className="gd-input"
                type="number"
                min={1}
                max={10000}
                value={form.dailyWatchLimitFree}
                onChange={(event) => setNumber("dailyWatchLimitFree", event.target.value)}
              />
              <span className="gd-unit">次</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="gd-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "保存配置"}
          </button>
          <button className="gd-btn" onClick={() => setForm(DEFAULTS)} disabled={saving}>
            恢复默认值
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

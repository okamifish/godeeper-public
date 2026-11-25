"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusChip,
  Toolbar,
} from "@/components/admin/ui";
import { formatDate } from "@/components/admin/format";
import { checkTemplateVariables, diffLines, diffStats } from "@/lib/prompt-diff";

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  feature: string;
  version: number;
  enabled: boolean | null;
  updatedAt: string;
}

interface PromptCatalogItem {
  id: string;
  name: string;
  purpose: string;
  scope: "system" | "system-fragment" | "user";
  usedBy: string[];
  variables: string[];
  output: string;
  params?: { temperature?: number; maxTokens?: number };
  editable: boolean;
  seed: boolean;
  content: string;
}

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  modelName: string;
  enabled?: boolean;
}

interface RunSide {
  raw: string;
  parsed: unknown | null;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  error?: string;
}

interface CompareResult {
  id: string;
  taskType: string;
  systemA: string;
  systemB: string;
  userMessage: string;
  a: RunSide;
  b: RunSide;
}

interface PreviewResult {
  id: string;
  scope: string;
  content: string;
  source: "database" | "default";
  version: number;
  requiredVariables: string[];
  systemPrompt: string;
  userMessage: string;
}

interface Suggestion {
  issues: string[];
  revisedPrompt: string;
  raw: string;
  parseError?: string;
}

const SCOPE_META: Record<PromptCatalogItem["scope"], { label: string; tone: "pro" | "team" | "muted" }> = {
  system: { label: "系统提示词", tone: "pro" },
  "system-fragment": { label: "系统片段", tone: "team" },
  user: { label: "用户消息模板", tone: "muted" },
};

const TASK_TYPES = [
  "question",
  "verify",
  "research",
  "summary",
  "report",
  "analysis",
  "compare",
  "derive",
  "critique",
];

function taskTypeOf(id: string): string {
  return id.startsWith("task:") && id !== "task:output-contract" ? id.slice(5) : "question";
}

function DiffView({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const stats = diffStats(lines);

  if (before === after) {
    return <div className="gd-muted">无差异</div>;
  }

  return (
    <div className="gd-diff-wrap">
      <div className="gd-diff-head">
        <span className="gd-muted">修改前后差异</span>
        <span className="gd-diff-stats">
          <span className="add">+{stats.added}</span>
          <span className="remove">-{stats.removed}</span>
        </span>
      </div>
      <div className="gd-diff">
        {lines.map((line, index) => (
          <div key={`${index}-${line.type}`} className={`gd-diff-line ${line.type}`}>
            <span className="gd-diff-sign">{line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}</span>
            <span>{line.text || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunPanel({ title, side }: { title: string; side: RunSide }) {
  return (
    <div className="gd-result-panel">
      <div className="gd-result-head">
        <span className="gd-card-title">{title}</span>
        <span className="gd-result-meta">
          {side.durationMs}ms · {side.usage.inputTokens + side.usage.outputTokens} token
        </span>
      </div>
      {side.error ? (
        <div className="gd-error-box">{side.error}</div>
      ) : (
        <>
          <pre className="gd-prompt">{side.raw || "（空输出）"}</pre>
          {side.parsed ? (
            <pre className="gd-prompt gd-result-parsed">{JSON.stringify(side.parsed, null, 2)}</pre>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function AdminPrompts() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [catalog, setCatalog] = useState<PromptCatalogItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [models, setModels] = useState<ModelConfig[]>([]);

  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [testId, setTestId] = useState("task");
  const [taskType, setTaskType] = useState("question");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<"compare" | "preview" | "suggest" | null>(null);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  const catalogById = useMemo(
    () => Object.fromEntries(catalog.map((item) => [item.id, item])) as Record<string, PromptCatalogItem>,
    [catalog],
  );

  const rowsByFeature = useMemo(() => {
    const map: Record<string, PromptTemplate> = {};
    for (const row of prompts) {
      const current = map[row.feature];
      if (!current || new Date(row.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
        map[row.feature] = row;
      }
    }
    return map;
  }, [prompts]);

  const load = () => {
    setLoadError(null);
    Promise.all([api.getAdminPrompts(), api.getAdminPromptsCatalog()])
      .then(([rows, items]) => {
        setPrompts(rows);
        setCatalog(items);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "加载提示词失败");
      });
  };

  useEffect(load, []);

  useEffect(() => {
    api.getAdminModels().then(setModels).catch(() => setModels([]));
  }, []);

  useEffect(() => {
    setVariables({});
    setCompare(null);
    setPreview(null);
    setSuggestion(null);
    setTaskType(taskTypeOf(testId));
  }, [testId]);

  const editorItem = editorId ? catalogById[editorId] : undefined;
  const editorRow = editorId ? rowsByFeature[editorId] : undefined;
  const editorEffective = editorItem
    ? (editorRow?.enabled ? editorRow.content : editorItem.content)
    : "";

  const variableCheck = editorItem
    ? checkTemplateVariables(draft, editorItem.variables)
    : { missing: [], unknown: [] };
  const variableValid = variableCheck.missing.length === 0 && variableCheck.unknown.length === 0;

  const testItem = catalogById[testId];
  const testRow = rowsByFeature[testId];
  const testEffective = testItem ? (testRow?.enabled ? testRow.content : testItem.content) : "";
  const testDraft = editorId === testId ? draft : testEffective;
  const runnable = testItem ? testItem.scope !== "user" : false;

  const openEditor = (item: PromptCatalogItem) => {
    const row = rowsByFeature[item.id];
    setEditorId(item.id);
    setEditorName(row?.name ?? item.name);
    setDraft(row?.content ?? item.content);
  };

  const save = async () => {
    if (!editorItem || !variableValid) return;
    setSaving(true);
    try {
      if (editorRow) {
        await api.updateAdminPrompt(editorRow.id, { name: editorName, content: draft });
        toast.success("提示词已更新，版本号已自增");
      } else {
        await api.createAdminPrompt({ feature: editorItem.id, name: editorName, content: draft });
        toast.success("提示词覆盖已创建");
      }
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const restoreDefault = async () => {
    if (!editorItem || !editorRow) return;
    try {
      await api.deleteAdminPrompt(editorRow.id);
      setDraft(editorItem.content);
      setEditorName(editorItem.name);
      toast.success("已恢复代码默认");
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复失败");
    }
  };

  const toggle = async (row: PromptTemplate) => {
    try {
      await api.updateAdminPrompt(row.id, { enabled: !row.enabled });
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态更新失败");
    }
  };

  const runCompare = async () => {
    if (!testItem || !runnable) return;
    setRunning("compare");
    setCompare(null);
    try {
      const result = await api.testAdminPrompt({
        id: testItem.id,
        contentA: testEffective,
        contentB: testDraft,
        input,
        context: context.split("\n").map((line) => line.trim()).filter(Boolean),
        taskType: testItem.id.startsWith("task:") ? taskType : undefined,
        model: model || undefined,
      }) as CompareResult;
      setCompare(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "对比运行失败");
    } finally {
      setRunning(null);
    }
  };

  const runPreview = async () => {
    if (!testItem) return;
    setRunning("preview");
    setPreview(null);
    try {
      const result = await api.previewAdminPrompt({
        id: testItem.id,
        content: testDraft,
        input,
        context: context.split("\n").map((line) => line.trim()).filter(Boolean),
        variables,
        taskType: testItem.id.startsWith("task:") ? taskType : undefined,
      }) as PreviewResult;
      setPreview(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "预览失败");
    } finally {
      setRunning(null);
    }
  };

  const runSuggest = async () => {
    if (!testItem || !runnable) return;
    setRunning("suggest");
    setSuggestion(null);
    try {
      const result = await api.suggestAdminPrompt({
        id: testItem.id,
        content: testDraft,
        input,
        taskType: testItem.id.startsWith("task:") ? taskType : undefined,
        model: model || undefined,
        resultA: compare?.a.raw,
        resultB: compare?.b.raw,
      }) as Suggestion;
      setSuggestion(result);
      if (result.parseError) {
        toast.warning("AI 没有返回可解析的 JSON，请重试");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 建议失败");
    } finally {
      setRunning(null);
    }
  };

  const adoptSuggestion = () => {
    if (!suggestion?.revisedPrompt) return;
    setEditorId(testId);
    setDraft(suggestion.revisedPrompt);
    toast.success("建议已填入草稿，确认后请手动保存");
  };

  const renderCatalogRows = (items: PromptCatalogItem[]) =>
    items.map((item, index) => {
      const row = rowsByFeature[item.id];
      const effective = row?.enabled ? row.content : item.content;
      return (
        <div
          key={item.id}
          className="gd-prompt-row"
          style={{ borderBottom: index === items.length - 1 ? 0 : "1px solid var(--gd-line-2)" }}
        >
          <div className="gd-prompt-row-head">
            <span className="gd-card-title">{item.name}</span>
            <StatusChip tone={SCOPE_META[item.scope].tone}>{SCOPE_META[item.scope].label}</StatusChip>
            {row ? (
              <StatusChip tone={row.enabled ? "ok" : "muted"} dot={Boolean(row.enabled)}>
                {row.enabled ? `后台覆盖 v${row.version}` : "已禁用"}
              </StatusChip>
            ) : (
              <StatusChip tone="muted">代码默认</StatusChip>
            )}
            <span className="gd-muted gd-prompt-id">{item.id}</span>
            <div className="gd-prompt-actions">
              <button className="gd-btn sm" onClick={() => openEditor(item)}>
                <Icons.edit />
                编辑
              </button>
              <button
                className="gd-btn ghost sm"
                onClick={() => {
                  setTestId(item.id);
                  if (item.scope === "user") setVariables({});
                }}
              >
                测试
              </button>
              {row ? (
                <button className="gd-btn ghost sm" onClick={() => toggle(row)}>
                  {row.enabled ? "禁用" : "启用"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="gd-prompt-meta">
            <div>用途：{item.purpose}</div>
            <div>调用位置：{item.usedBy.join("；")}</div>
            <div>
              输入变量：{item.variables.length > 0 ? item.variables.map((name) => `{{${name}}}`).join("、") : "无"}
            </div>
            <div>输出要求：{item.output}</div>
            {row?.updatedAt ? <div>最近更新：{formatDate(row.updatedAt)}</div> : null}
          </div>
          <pre className="gd-prompt">{effective}</pre>
        </div>
      );
    });

  return (
    <div className="gd-stack">
      <PageHeader
        title="Prompt 管理"
        description="全部提示词都能在后台修改、对比和测试；保存后立即生效。"
      />

      {loadError ? (
        <SectionCard>
          <div className="gd-error-box">{loadError}</div>
          <button className="gd-btn sm" style={{ marginTop: 12 }} onClick={load}>
            重试
          </button>
        </SectionCard>
      ) : null}

      {editorItem ? (
        <SectionCard
          title={`编辑 · ${editorItem.name}`}
          description={`来源：${editorRow?.enabled ? `后台覆盖 v${editorRow.version}` : "代码默认"}；保存后立即生效。`}
        >
          <div className="gd-field">
            <label htmlFor="prompt-name">后台显示名</label>
            <input
              id="prompt-name"
              className="gd-input"
              value={editorName}
              onChange={(event) => setEditorName(event.target.value)}
            />
          </div>

          <div className="gd-field" style={{ marginTop: 12 }}>
            <label htmlFor="prompt-content">提示词正文</label>
            <textarea
              id="prompt-content"
              className="gd-textarea gd-mono"
              rows={10}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>

          {editorItem.variables.length > 0 ? (
            <div className="gd-muted" style={{ fontSize: 12, marginTop: 6 }}>
              必填变量：{editorItem.variables.map((name) => `{{${name}}}`).join("、")}
            </div>
          ) : null}

          {variableCheck.missing.length > 0 || variableCheck.unknown.length > 0 ? (
            <div className="gd-variable-warn">
              {variableCheck.missing.length > 0
                ? `缺少必填变量：${variableCheck.missing.map((name) => `{{${name}}}`).join("、")}`
                : null}
              {variableCheck.missing.length > 0 && variableCheck.unknown.length > 0 ? "；" : null}
              {variableCheck.unknown.length > 0
                ? `出现未声明变量：${variableCheck.unknown.map((name) => `{{${name}}}`).join("、")}`
                : null}
            </div>
          ) : null}

          <div className="gd-diff-grid">
            <div>
              <div className="gd-diff-title">草稿 vs 当前生效</div>
              <DiffView before={editorEffective} after={draft} />
            </div>
            {editorRow?.enabled ? (
              <div>
                <div className="gd-diff-title">当前生效 vs 代码默认</div>
                <DiffView before={editorItem.content} after={editorRow.content} />
              </div>
            ) : null}
          </div>

          <div className="gd-prompt-actions" style={{ marginTop: 14 }}>
            <button className="gd-btn primary" onClick={save} disabled={saving || !variableValid}>
              {saving ? "保存中…" : "保存并生效"}
            </button>
            <button className="gd-btn" onClick={() => setEditorId(null)}>
              关闭
            </button>
            {editorRow ? (
              <button className="gd-btn ghost" onClick={restoreDefault}>
                恢复代码默认
              </button>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="提示词测试台"
        description="A 路使用已保存版本，B 路使用编辑草稿；两路并排运行，便于判断修改是否更好。"
      >
        <div className="gd-grid two">
          <div className="gd-field">
            <label htmlFor="test-prompt">测试对象</label>
            <select
              id="test-prompt"
              className="gd-select"
              style={{ width: "100%" }}
              value={testId}
              onChange={(event) => setTestId(event.target.value)}
            >
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {SCOPE_META[item.scope].label} · {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="gd-field">
            <label htmlFor="test-model">模型</label>
            <input
              id="test-model"
              className="gd-input"
              style={{ width: "100%" }}
              list="test-model-options"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="留空跟随管理员默认，可直接输入模型名"
            />
            <datalist id="test-model-options">
              {models
                .filter((item) => item.enabled !== false)
                .map((item) => (
                  <option key={item.id} value={item.modelName}>
                    {item.name}
                  </option>
                ))}
            </datalist>
          </div>
        </div>

        {testItem?.id.startsWith("task:") ? (
          <div className="gd-field" style={{ marginTop: 12 }}>
            <label htmlFor="test-task-type">任务类型</label>
            <select
              id="test-task-type"
              className="gd-select"
              style={{ width: "100%" }}
              value={taskType}
              onChange={(event) => setTaskType(event.target.value)}
              disabled={testItem.id !== "task"}
            >
              {TASK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="gd-field" style={{ marginTop: 12 }}>
          <label htmlFor="test-input">测试内容</label>
          <textarea
            id="test-input"
            className="gd-textarea"
            rows={4}
            placeholder="输入一段真实用户内容，例如：递归是什么？"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>

        {testItem?.scope !== "user" ? (
          <div className="gd-field" style={{ marginTop: 12 }}>
            <label htmlFor="test-context">上下文节点（每行一条，可留空）</label>
            <textarea
              id="test-context"
              className="gd-textarea"
              rows={3}
              value={context}
              onChange={(event) => setContext(event.target.value)}
            />
          </div>
        ) : (
          <div className="gd-grid two" style={{ marginTop: 12 }}>
            {(testItem?.variables ?? []).map((name) => (
              <div className="gd-field" key={name}>
                <label htmlFor={`test-var-${name}`}>{`{{${name}}}`}</label>
                <input
                  id={`test-var-${name}`}
                  className="gd-input"
                  value={variables[name] ?? ""}
                  onChange={(event) => setVariables({ ...variables, [name]: event.target.value })}
                />
              </div>
            ))}
          </div>
        )}

        <div className="gd-prompt-actions" style={{ marginTop: 14 }}>
          {runnable ? (
            <button className="gd-btn primary" onClick={runCompare} disabled={running !== null || !input.trim()}>
              {running === "compare" ? "运行中…" : "对比运行 A / B"}
            </button>
          ) : null}
          <button className="gd-btn" onClick={runPreview} disabled={running !== null}>
            {running === "preview" ? "预览中…" : "预览最终提示词"}
          </button>
          {runnable ? (
            <button className="gd-btn" onClick={runSuggest} disabled={running !== null || !testDraft.trim()}>
              {running === "suggest" ? "分析中…" : "AI 优化建议"}
            </button>
          ) : null}
          {testItem?.scope === "user" ? (
            <span className="gd-muted" style={{ fontSize: 12 }}>
              用户消息模板只支持变量预览，不单独调用模型。
            </span>
          ) : null}
        </div>

        {compare ? (
          <div className="gd-result-grid">
            <RunPanel title="A · 已保存版本" side={compare.a} />
            <RunPanel title="B · 编辑草稿" side={compare.b} />
          </div>
        ) : null}

        {preview ? (
          <div className="gd-preview-box">
            {preview.systemPrompt ? (
              <>
                <div className="gd-diff-title">最终系统提示词</div>
                <pre className="gd-prompt">{preview.systemPrompt}</pre>
              </>
            ) : null}
            <div className="gd-diff-title" style={{ marginTop: 10 }}>
              最终用户消息
            </div>
            <pre className="gd-prompt">{preview.userMessage || "（空）"}</pre>
          </div>
        ) : null}

        {suggestion ? (
          <div className="gd-suggestion-box">
            <div className="gd-result-head">
              <span className="gd-card-title">AI 修改建议</span>
              {suggestion.revisedPrompt ? (
                <button className="gd-btn sm" onClick={adoptSuggestion}>
                  采纳到草稿
                </button>
              ) : null}
            </div>
            {suggestion.parseError ? (
              <div className="gd-error-box">AI 返回格式异常：{suggestion.parseError}</div>
            ) : null}
            {suggestion.issues.length > 0 ? (
              <ul className="gd-issue-list">
                {suggestion.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            ) : null}
            {suggestion.revisedPrompt ? (
              <DiffView before={testDraft} after={suggestion.revisedPrompt} />
            ) : (
              <pre className="gd-prompt">{suggestion.raw}</pre>
            )}
          </div>
        ) : null}
      </SectionCard>

      {(["system", "system-fragment", "user"] as const).map((scope) => {
        const items = catalog.filter((item) => item.scope === scope);
        return (
          <SectionCard key={scope} flush>
            <Toolbar note={`共 ${items.length} 条`}>
              <span className="gd-card-title">{SCOPE_META[scope].label}</span>
            </Toolbar>
            {items.length === 0 ? (
              <EmptyState
                icon={Icons.post}
                title="未获取到提示词"
                description="请确认后端 /admin/prompts/catalog 可用。"
              />
            ) : (
              renderCatalogRows(items)
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

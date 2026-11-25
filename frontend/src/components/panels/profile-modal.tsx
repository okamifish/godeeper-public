"use client";

import { useState, useEffect } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import { api } from "@/lib/api";
import type { MyPlanSnapshot } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { formatPlanLimit, formatPlanUsage, formatCredits } from "@/lib/plan-format";
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  getShortcuts,
  updateShortcut,
  resetShortcuts,
  subscribeShortcuts,
  eventToCombo,
  type ShortcutAction,
} from "@/lib/shortcut-settings";

export function ProfileModal() {
  const {
    profileOpen, setProfileOpen, nodes,
    canvasDensity, setCanvasDensity,
    defaultModel, setDefaultModel,
    edgeStyle, setEdgeStyle,
    apiKey, setApiKey,
    baseUrl, setBaseUrl,
    modelName, setModelName,
    validatedModels, apiTestStatus, apiTestError,
    testAndSaveApi, clearApiConfig,
    userName, setUserName,
    userEmail, setUserEmail,
    language, setLanguage,
    theme, setTheme,
  } = useCanvasStore();

  const [tab, setTab] = useState<"profile" | "settings">("profile");
  const [shortcutMap, setShortcutMap] = useState(getShortcuts);
  const [listening, setListening] = useState<ShortcutAction | null>(null);
  const [shortcutError, setShortcutError] = useState("");
  const [plan, setPlan] = useState<MyPlanSnapshot | null>(null);
  const [planState, setPlanState] = useState<"idle" | "loading" | "error">("idle");
  const authed = isAuthenticated();
  const t = useT();

  useEffect(() => {
    if (!profileOpen || !authed) {
      setPlanState("idle");
      return;
    }
    let cancelled = false;
    setPlanState("loading");
    api.getMyPlan()
      .then((snapshot) => {
        if (cancelled) return;
        setPlan(snapshot);
        setPlanState("idle");
      })
      .catch(() => {
        if (!cancelled) setPlanState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [profileOpen, authed]);

  useEffect(() => subscribeShortcuts(() => setShortcutMap(getShortcuts())), []);

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setListening(null);
        setShortcutError("");
        return;
      }
      const combo = eventToCombo(event);
      if (!combo) return;
      const error = updateShortcut(listening, combo);
      if (error) {
        setShortcutError(error);
        return;
      }
      setShortcutError("");
      setListening(null);
      setShortcutMap(getShortcuts());
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!profileOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [profileOpen, setProfileOpen]);

  const taskCount = nodes.filter((n) => n.data.kind === "task").length;
  const resultCount = nodes.filter((n) => n.data.kind === "result").length;
  const userInitial = (userName || "U").charAt(0).toUpperCase();

  if (!profileOpen) return null;

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "").split(",").map((e: string) => e.trim()).filter(Boolean);
  const isAdmin = adminEmails.length > 0 && adminEmails.includes(userEmail);
  const canTest = baseUrl.trim() && apiKey.trim() && modelName.trim();

  return (
    <div
      className="modal-shell"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setProfileOpen(false);
      }}
    >
      <section
        className="modal-panel glass-panel profile"
        role="dialog"
        aria-modal="true"
        aria-label={tab === "profile" ? t("profile") : t("settings")}
      >
        <div className="profile-tabs">
          <button className={`profile-tab ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>{t("profile")}</button>
          <button className={`profile-tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>{t("settings")}</button>
          <div style={{ flex: 1 }} />
          <button className="ghost-button" onClick={() => setProfileOpen(false)}>{t("close")}</button>
        </div>

        {tab === "profile" ? (
          <>
            <div className="profile-header">
              <div className="avatar">{userInitial}</div>
              <div className="profile-headline">
                <h2>{userName || "User"}</h2>
                <p>{nodes.length} {t("nodesLabel")} · {taskCount} {t("tasksLabel")} · {resultCount} {t("resultsLabel")}</p>
              </div>
            </div>
            {authed && (
              <section className="profile-card plan-card">
                <h3>{t("planAndUsage")}</h3>
                {planState === "loading" && <p className="trace-body">{t("planLoading")}</p>}
                {planState === "error" && <p className="trace-body">{t("planLoadFailed")}</p>}
                {plan && planState === "idle" && (
                  <>
                    <div className="metric-row">
                      <span>{t("planMembership")}</span>
                      <strong>
                        {plan.membership === "free"
                          ? t("planFree")
                          : plan.membership === "team"
                            ? t("planTeam")
                            : plan.membership === "pro"
                              ? t("planPro")
                              : plan.membership}
                      </strong>
                    </div>
                    <div className="metric-row">
                      <span>{t("planCloudCanvas")}</span>
                      <strong>{formatPlanUsage(plan.usage.canvases, plan.limits.canvases, t("planUnlimited"))}</strong>
                    </div>
                    <div className="metric-row">
                      <span>{t("planNodes")}</span>
                      <strong>{formatPlanLimit(plan.limits.nodesPerCanvas, t("planUnlimited"))}</strong>
                    </div>
                    <div className="metric-row">
                      <span>{t("planDailyAi")}</span>
                      <strong>
                        {plan.byok.dailyAiUnlimited
                          ? t("planUnlimited")
                          : formatPlanUsage(plan.usage.aiTasksToday, plan.limits.aiTasksPerDay, t("planUnlimited"))}
                      </strong>
                    </div>
                    <div className="metric-row">
                      <span>{t("planCredits")}</span>
                      <strong>{formatCredits(plan.credits)}</strong>
                    </div>
                    <div className="metric-row">
                      <span>{t("planByok")}</span>
                      <strong>{plan.byok.configured ? t("planByokConfigured") : t("planByokMissing")}</strong>
                    </div>
                    <p className="trace-body">{t("planHostedHint")}</p>
                  </>
                )}
              </section>
            )}
            <div className="profile-edit-section">
              <div className="setting-row stacked">
                <span className="setting-label">{t("displayName")}</span>
                <input
                  className="setting-input full"
                  type="text"
                  placeholder="Your name"
                  aria-label={t("displayName")}
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>
              <div className="setting-row stacked">
                <span className="setting-label">{t("email")}</span>
                <input
                  className="setting-input full"
                  type="email"
                  placeholder="your@email.com"
                  aria-label={t("email")}
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="profile-grid">
              <section className="profile-card">
                <h3>{t("canvasActivity")}</h3>
                <div className="metric-row"><span>{t("totalNodes")}</span><strong>{nodes.length}</strong></div>
                <div className="metric-row"><span>{t("activeTasks")}</span><strong>{taskCount}</strong></div>
                <div className="metric-row"><span>{t("genResults")}</span><strong>{resultCount}</strong></div>
              </section>
              <section className="profile-card">
                <h3>{t("recentInsights")}</h3>
                <div className="metric-stack">
                  {nodes.filter((n) => n.data.kind === "result").slice(-3).map((n) => (
                    <div key={n.id}>
                      <strong>{n.data.title.slice(0, 40)}</strong>
                      <p>{n.data.metaLeft ?? t("generated")}</p>
                    </div>
                  ))}
                  {resultCount === 0 && <p className="trace-body">{t("noResults")}</p>}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="settings-body">
            {isAdmin && (
              <section className="settings-section" style={{ marginBottom: "0" }}>
                <a
                  href="/admin"
                  className="primary-button full-width"
                  style={{ display: "block", textAlign: "center", textDecoration: "none" }}
                >
                  {t("adminPanel")}
                </a>
              </section>
            )}

            <section className="settings-section">
              <h3 className="settings-section-title">{t("appearance")}</h3>
              <div className="setting-row">
                <span>{t("language")}</span>
                <div className="segment-group">
                  <button className={`segment ${language === "zh" ? "active" : ""}`} onClick={() => setLanguage("zh")}>中文</button>
                  <button className={`segment ${language === "en" ? "active" : ""}`} onClick={() => setLanguage("en")}>English</button>
                </div>
              </div>
              <div className="setting-row">
                <span>{t("theme")}</span>
                <div className="segment-group">
                  <button className={`segment ${theme === "light" ? "active" : ""}`} onClick={() => setTheme("light")}>{t("light")}</button>
                  <button className={`segment ${theme === "dark" ? "active" : ""}`} onClick={() => setTheme("dark")}>{t("dark")}</button>
                </div>
              </div>
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">{t("general")}</h3>
              <div className="setting-row">
                <span>{t("edgeStyle")}</span>
                <div className="segment-group">
                  <button className={`segment ${edgeStyle === "smoothstep" ? "active" : ""}`} onClick={() => setEdgeStyle("smoothstep")}>{t("smooth")}</button>
                  <button className={`segment ${edgeStyle === "bezier" ? "active" : ""}`} onClick={() => setEdgeStyle("bezier")}>{t("bezier")}</button>
                  <button className={`segment ${edgeStyle === "straight" ? "active" : ""}`} onClick={() => setEdgeStyle("straight")}>{t("straight")}</button>
                </div>
              </div>
              <div className="setting-row">
                <span>{t("canvasDensity")}</span>
                <div className="segment-group">
                  <button className={`segment ${canvasDensity === "compact" ? "active" : ""}`} onClick={() => setCanvasDensity("compact")}>{t("compact")}</button>
                  <button className={`segment ${canvasDensity === "comfortable" ? "active" : ""}`} onClick={() => setCanvasDensity("comfortable")}>{t("comfortable")}</button>
                </div>
              </div>
            </section>

            <section className="settings-section">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <h3 className="settings-section-title" style={{ margin: 0 }}>
                  {language === "zh" ? "快捷键" : "Keyboard shortcuts"}
                </h3>
                <button
                  className="ghost-button small"
                  onClick={() => {
                    resetShortcuts();
                    setShortcutMap(getShortcuts());
                    setListening(null);
                    setShortcutError("");
                  }}
                >
                  {language === "zh" ? "恢复默认" : "Reset"}
                </button>
              </div>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "6px 0 10px" }}>
                {language === "zh"
                  ? "默认参考主流思维导图：Enter 同级、Tab 子级。点「修改」后按下新组合键，Esc 取消。"
                  : "Defaults follow mainstream mind maps: Enter sibling, Tab child. Click Change, press a combo, Esc cancels."}
              </p>
              {listening ? (
                <div style={{ border: "1px solid #ccd5ee", background: "#e7ebf7", borderRadius: 6, padding: "8px 10px", fontSize: 12, marginBottom: 8 }}>
                  {language === "zh" ? "请按下新的快捷键组合…（Esc 取消）" : "Press a new shortcut… (Esc cancels)"}
                </div>
              ) : null}
              {shortcutError ? (
                <div style={{ color: "#ba1a1a", fontSize: 12, marginBottom: 8 }}>{shortcutError}</div>
              ) : null}
              <div>
                {SHORTCUT_ACTIONS.map((action) => (
                  <div
                    key={action}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 0",
                      borderBottom: "1px solid #efede6",
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 13 }}>
                      {language === "zh" ? SHORTCUT_LABELS[action].zh : SHORTCUT_LABELS[action].en}
                    </span>
                    <kbd
                      style={{
                        fontFamily: "monospace",
                        fontSize: 12,
                        padding: "2px 8px",
                        border: "1px solid #d9d6cc",
                        borderRadius: 4,
                        background: "#f6f5f1",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {shortcutMap[action]}
                    </kbd>
                    <button
                      className="ghost-button small"
                      onClick={() => {
                        setShortcutError("");
                        setListening(listening === action ? null : action);
                      }}
                    >
                      {listening === action
                        ? (language === "zh" ? "按下…" : "Press…")
                        : (language === "zh" ? "修改" : "Change")}
                    </button>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 0",
                    borderBottom: "1px solid #efede6",
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13 }}>{t("focusMode")}</span>
                  <kbd
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      padding: "2px 8px",
                      border: "1px solid #d9d6cc",
                      borderRadius: 4,
                      background: "#f6f5f1",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Ctrl+Shift+Click
                  </kbd>
                </div>
              </div>
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">{t("brain")}</h3>

              {validatedModels.length > 0 && (
                <div className="validated-models-list">
                  {validatedModels.map((m) => (
                    <div key={m} className="validated-model-row">
                      <span className={`model-status-dot ${defaultModel === m ? "active" : ""}`} />
                      <span className="validated-model-name">{m}</span>
                      <button className="ghost-button small" onClick={() => setDefaultModel(m)}>{t("use")}</button>
                      <button className="ghost-button small danger-text" onClick={() => clearApiConfig(m)}>{t("remove")}</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="api-config-card">
                <div className="setting-row stacked">
                  <span className="setting-label">{t("baseUrlLabel")}</span>
                  <input
                    className="setting-input full"
                    type="url"
                    placeholder="https://api.siliconflow.cn/v1"
                    aria-label={t("baseUrlLabel")}
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                  />
                </div>
                <div className="setting-row stacked">
                  <span className="setting-label">{t("modelNameLabel")}</span>
                  <input
                    className="setting-input full"
                    type="text"
                    placeholder="deepseek-ai/DeepSeek-V4-Flash"
                    aria-label={t("modelNameLabel")}
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                  />
                </div>
                <div className="setting-row stacked">
                  <span className="setting-label">{t("apiKeyLabel")}</span>
                  <input
                    className="setting-input full"
                    type="password"
                    placeholder="sk-..."
                    aria-label={t("apiKeyLabel")}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <button
                  className="primary-button full-width"
                  disabled={!canTest || apiTestStatus === "testing"}
                  onClick={testAndSaveApi}
                >
                  {apiTestStatus === "testing" ? t("testing") : t("saveVerify")}
                </button>
                {apiTestStatus === "success" && (
                  <p className="api-status-msg success">{t("verified")}</p>
                )}
                {apiTestStatus === "error" && (
                  <p className="api-status-msg error">{apiTestError}</p>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

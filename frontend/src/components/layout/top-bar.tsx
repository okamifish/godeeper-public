"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import { isAuthenticated, getUser, logout, AUTH_CHANGED_EVENT } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { ShareDialog } from "@/components/panels/share-dialog";
import { UpgradeDialog } from "@/components/panels/upgrade-dialog";
import { UnifiedSearchResults } from "@/components/search/unified-search-results";
import {
  ChevronDown,
  Compass,
  Download,
  HelpCircle,
  LogIn,
  LogOut,
  Menu,
  Search,
  Settings,
  Share2,
  User,
  UserPlus,
} from "lucide-react";

const subscribeToClient = () => () => {};

const saveStateKey = {
  Saved: "saved",
  Saving: "saving",
  Unsaved: "unsaved",
  Streaming: "streaming",
  Importing: "importing",
  Error: "saveError",
} as const;

interface TopBarProps {
  onHelp?: () => void;
}

export function TopBar({ onHelp }: TopBarProps) {
  const {
    search,
    setSearch,
    setProfileOpen,
    exportReport,
    nodes,
    edges,
    focusNode,
    mobileMenuOpen,
    setMobileMenuOpen,
    canvasName,
    renameCanvas,
    saveState,
    defaultModel,
    modelName,
    validatedModels,
    userName,
    guideMode,
    setGuideMode,
  } = useCanvasStore();
  const t = useT();
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);

  const [authOpen, setAuthOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(canvasName);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncAuthState = () => setLoggedIn(isAuthenticated());
    syncAuthState();
    window.addEventListener(AUTH_CHANGED_EVENT, syncAuthState);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncAuthState);
  }, []);

  useEffect(() => {
    if (renaming) nameInputRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    if (!searchPanelOpen) return;
    const onDown = (event: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target as Node)) {
        setSearchPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searchPanelOpen]);

  const displayName = (() => {
    const authUser = getUser();
    return authUser?.displayName || userName || "User";
  })();

  const initial = displayName.trim().charAt(0).toUpperCase() || "U";

  const handleLogout = async () => {
    await useCanvasStore.getState().saveCurrentCanvas().catch(() => {});
    await logout();
    useCanvasStore.getState().resetForAuthChange();
    setLoggedIn(false);
    setMenuOpen(false);
  };

  const handleSwitchAccount = async () => {
    await useCanvasStore.getState().saveCurrentCanvas().catch(() => {});
    await logout();
    useCanvasStore.getState().resetForAuthChange();
    setLoggedIn(false);
    setMenuOpen(false);
    setAuthOpen(true);
  };

  const runSearch = () => {
    if (!search.trim()) return;
    const q = search.toLowerCase();
    const matches = nodes.filter(
      (n) => n.data.title.toLowerCase().includes(q) || n.data.body.toLowerCase().includes(q),
    );
    if (matches.length === 0) return;
    const idx = searchIndex % matches.length;
    focusNode(matches[idx].id);
    setSearchIndex(idx + 1);
  };

  const commitRename = () => {
    const next = draftName.trim();
    if (next && next !== canvasName) void renameCanvas(next);
    setRenaming(false);
  };

  const toggleGuideMode = (value: boolean) => {
    setGuideMode(value);
    toast.info(value ? t("guideModeOn") : t("guideModeOff"));
  };

  const canUseGuide = hasCapability(getUser(), "ai.guided");
  const setGuideModeSafe = (value: boolean) => {
    if (value && !canUseGuide) {
      toast.error(t("guideProRequired"));
      return;
    }
    toggleGuideMode(value);
  };

  const currentModel = defaultModel || modelName;
  const activeModel = mounted && validatedModels.includes(currentModel) ? currentModel : "";
  const modelReady = mounted && Boolean(activeModel);
  const saveLabel = t(saveStateKey[saveState as keyof typeof saveStateKey] ?? "unsaved");
  const counts = `${nodes.length} ${t("nodes")} · ${edges.length} ${t("links")}`;

  const avatar = loggedIn ? (
    <div className="avatar-wrapper">
      <button className="avatar-btn top-avatar" onClick={() => setMenuOpen(!menuOpen)} title={displayName}>
        <span className="avatar-circle">{initial}</span>
      </button>
      {menuOpen && (
        <>
          <div className="avatar-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="avatar-dropdown">
            <button
              className="avatar-dropdown-item"
              onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
            >
              <Settings size={14} />
              {t("authProfileSettings")}
            </button>
            <button className="avatar-dropdown-item" onClick={handleSwitchAccount}>
              <UserPlus size={14} />
              {t("authSwitchAccount")}
            </button>
            <button className="avatar-dropdown-item avatar-dropdown-logout" onClick={handleLogout}>
              <LogOut size={14} />
              {t("authSignOut")}
            </button>
          </div>
        </>
      )}
    </div>
  ) : (
    <button className="signin-btn" onClick={() => setAuthOpen(true)}>
      <LogIn size={14} />
      {t("authSignIn")}
    </button>
  );

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="logo">GD</div>
        </div>

        <div className="canvas-title">
          {renaming ? (
            <input
              ref={nameInputRef}
              className="canvas-title-input"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") {
                  setDraftName(canvasName);
                  setRenaming(false);
                }
              }}
            />
          ) : (
            <button
              className="canvas-title-btn"
              onClick={() => { setDraftName(canvasName); setRenaming(true); }}
              title={t("canvas")}
            >
              {canvasName}
              <ChevronDown size={13} className="caret" />
            </button>
          )}
        </div>

        <span className={`savechip${saveState === "Error" ? " error" : ""}`}>
          <i className={`dot${saveState === "Error" ? " error" : ""}`} />
          {saveLabel} · {counts}
        </span>

        <span className="top-sep" />

        <div className="guide-mode-toggle" role="group" aria-label={t("guideMode")}>
          <button
            type="button"
            className={guideMode ? "" : "active"}
            aria-pressed={!guideMode}
            onClick={() => setGuideModeSafe(false)}
          >
            {t("guideModeFree")}
          </button>
          <button
            type="button"
            className={guideMode ? "active" : ""}
            aria-pressed={guideMode}
            onClick={() => setGuideModeSafe(true)}
          >
            {t("guideMode")}
          </button>
        </div>
        {guideMode ? <span className="guide-mode-state">{t("guideModeActiveChip")}</span> : null}

        {modelReady ? (
          <span className="model-chip">{activeModel || t("apiConnected")}</span>
        ) : (
          <button className="warn-chip" onClick={() => setProfileOpen(true)}>
            {t("noModel")} · {t("goConfigure")} →
          </button>
        )}

        <div className="search-wrap" ref={searchWrapRef}>
          <label className="searchbar">
            <Search size={15} className="search-icon" />
            <input
              aria-label={t("searchPlaceholder")}
              value={search}
              onFocus={() => setSearchPanelOpen(true)}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchIndex(0);
                setSearchPanelOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                  setSearchPanelOpen(false);
                }
                if (event.key === "Escape") setSearchPanelOpen(false);
              }}
              placeholder={t("searchPlaceholder")}
            />
            <kbd>Ctrl K</kbd>
          </label>
          <UnifiedSearchResults
            open={searchPanelOpen}
            query={search}
            onClose={() => setSearchPanelOpen(false)}
            onRequireUpgrade={() => {
              setSearchPanelOpen(false);
              setUpgradeOpen(true);
            }}
          />
        </div>

        <div className="topbar-actions">
          <button className="icon-btn" onClick={onHelp} title={t("help")} aria-label={t("help")}>
            <HelpCircle size={15} />
          </button>
          {loggedIn && (
            <button
              className="icon-btn"
              onClick={() => setShareOpen(true)}
              title="发布"
              aria-label="发布"
            >
              <Share2 size={15} />
            </button>
          )}
          <button className="btn primary" onClick={exportReport} title={t("export")}>
            <Download size={14} />
            {t("export")}
          </button>
          {avatar}
        </div>

        <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
        <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />

        <AuthDialog
          open={authOpen}
          onOpenChange={setAuthOpen}
          onSuccess={() => setLoggedIn(true)}
        />
      </header>

      <header className="mobile-top">
        <button
          className="icon-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={t("canvases")}
        >
          <Menu size={18} />
        </button>
        <div className="mobile-title">
          <div className="t">{canvasName}</div>
          <div className="s">
            <span className="dot" />
            {saveLabel} · {counts}
          </div>
        </div>
        <button
          className={`icon-btn guide-mode-mobile${guideMode ? " active" : ""}`}
          onClick={() => setGuideModeSafe(!guideMode)}
          aria-label={t("guideMode")}
          title={t("guideMode")}
        >
          <Compass size={18} />
        </button>
        <button
          className="icon-btn"
          onClick={() => setMobileSearchOpen(true)}
          aria-label={t("search")}
        >
          <Search size={18} />
        </button>
        {loggedIn ? (
          <span className="avatar-circle small">{initial}</span>
        ) : (
          <button className="icon-btn" onClick={() => setAuthOpen(true)} aria-label={t("authSignIn")}>
            <User size={16} />
          </button>
        )}
      </header>

      {mobileSearchOpen && (
        <div className="mobile-search-overlay" onClick={() => setMobileSearchOpen(false)}>
          <div className="mobile-search-panel" onClick={(event) => event.stopPropagation()}>
            <input
              autoFocus
              className="mobile-search-input"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setSearchIndex(0); }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runSearch();
                  setMobileSearchOpen(false);
                }
                if (event.key === "Escape") setMobileSearchOpen(false);
              }}
              placeholder={t("searchPlaceholder")}
            />
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import {
  Download,
  LayoutDashboard,
  LayoutGrid,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";

interface MobileBarProps {
  onHelp?: () => void;
}

export function MobileBar({ onHelp }: MobileBarProps) {
  const {
    autoLayout,
    generateSummary,
    selectedNodeIds,
    summaryLoading,
    setMobileMenuOpen,
    mobileMenuOpen,
    createTaskFromSelection,
    returnToBranchPoint,
    exportReport,
    panelCollapsed,
    togglePanel,
  } = useCanvasStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const t = useT();

  const handleSummary = () => {
    if (selectedNodeIds.length < 2) {
      toast(t("summaryDisabledHint"));
      return;
    }
    if (!summaryLoading) generateSummary(selectedNodeIds);
  };

  return (
    <>
      {sheetOpen && (
        <div className="mobile-sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="mobile-sheet" onClick={(event) => event.stopPropagation()}>
            <button
              className="sheet-row"
              onClick={() => { setSheetOpen(false); exportReport(); }}
            >
              <Download size={16} />
              {t("exportJsonRoundTrip")}
            </button>
            <button
              className="sheet-row"
              disabled={selectedNodeIds.length === 0}
              onClick={() => { setSheetOpen(false); createTaskFromSelection(); }}
            >
              <Plus size={16} />
              {t("taskFromSelection")} ({selectedNodeIds.length})
            </button>
            <button className="sheet-row" onClick={() => { setSheetOpen(false); returnToBranchPoint(); }}>
              <PanelLeft size={16} />
              {t("returnToParent")}
            </button>
            <button className="sheet-row" onClick={() => { setSheetOpen(false); togglePanel(); }}>
              <Sparkles size={16} />
              {panelCollapsed ? t("expandPanel") : t("reasoningTrace")}
            </button>
            <button className="sheet-row" onClick={() => { setSheetOpen(false); onHelp?.(); }}>
              {t("keyboardShortcuts")}
            </button>
          </div>
        </div>
      )}

      <nav className="mobile-bar" aria-label={t("canvas")}>
        <button
          className="mbar"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-pressed={mobileMenuOpen}
        >
          <LayoutDashboard size={18} />
          {t("canvas")}
        </button>
        <button className="mbar" onClick={autoLayout}>
          <LayoutGrid size={18} />
          {t("layout")}
        </button>
        <button className="mbar primary" onClick={handleSummary}>
          <span className="ic"><Sparkles size={18} /></span>
          {t("genSummary")}
        </button>
        <button className="mbar" onClick={() => setSheetOpen(true)}>
          <MoreHorizontal size={18} />
          {t("moreActions")}
        </button>
      </nav>
    </>
  );
}

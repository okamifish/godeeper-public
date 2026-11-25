"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT, type S } from "@/lib/i18n";
import { MAX_SOCRATIC_ROUNDS } from "@/lib/socratic";
import type { SocraticDimension } from "@/lib/types";

const DIMENSION_KEY: Record<SocraticDimension, S> = {
  definition: "socraticDimensionDefinition",
  evidence: "socraticDimensionEvidence",
  assumption: "socraticDimensionAssumption",
  counterexample: "socraticDimensionCounterexample",
  consequence: "socraticDimensionConsequence",
};

export function SocraticPanel() {
  const {
    socraticSession,
    socraticCurrentQuestion,
    socraticCurrentDimension,
    socraticLoading,
    socraticError,
    submitSocraticAnswer,
    finishSocratic,
    discardSocratic,
    closeSocratic,
  } = useCanvasStore();
  const t = useT();
  const [answer, setAnswer] = useState("");

  const roundCount = socraticSession?.rounds.length ?? 0;

  // 只有成功推进一轮后才清空输入；失败时保留，便于直接重试。
  useEffect(() => {
    setAnswer("");
  }, [roundCount]);

  if (!socraticSession) return null;

  const hasQuestion = Boolean(socraticCurrentQuestion);
  const currentRound = Math.min(roundCount + (hasQuestion ? 1 : 0), MAX_SOCRATIC_ROUNDS);
  const canSubmit = hasQuestion && answer.trim().length > 0 && !socraticLoading;

  const handleSubmit = () => {
    if (!canSubmit) return;
    void submitSocraticAnswer(answer);
  };

  return (
    <aside className="socratic-panel" aria-label={t("socraticMode")}>
      <header className="socratic-head">
        <div className="socratic-head-text">
          <h2>{t("socraticMode")}</h2>
          <div className="sub">{socraticSession.sourceTitle}</div>
        </div>
        <button
          className="icon-btn"
          onClick={closeSocratic}
          title={t("socraticClose")}
          aria-label={t("socraticClose")}
        >
          <X size={15} />
        </button>
      </header>

      <div className="socratic-meta">
        <span>
          {t("socraticRound")} {currentRound} / {MAX_SOCRATIC_ROUNDS}
        </span>
        <span>{t("socraticCost")}</span>
      </div>

      {socraticLoading ? (
        <div className="socratic-thinking">
          <Loader2 size={16} className="socratic-spin" />
          <span>{t("socraticThinking")}</span>
        </div>
      ) : hasQuestion ? (
        <div className="socratic-question">
          {socraticCurrentDimension && (
            <span className="socratic-dim">{t(DIMENSION_KEY[socraticCurrentDimension])}</span>
          )}
          <p>{socraticCurrentQuestion}</p>
        </div>
      ) : (
        <div className="socratic-empty">{t("socraticEmpty")}</div>
      )}

      {socraticError && !socraticLoading && (
        <div className="socratic-error" role="alert">
          {socraticError}
        </div>
      )}

      <textarea
        className="socratic-answer nodrag nowheel"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder={t("socraticAnswerPlaceholder")}
        rows={5}
        disabled={socraticLoading || !hasQuestion}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            handleSubmit();
          }
        }}
      />

      <div className="socratic-actions">
        <button className="run-button" disabled={!canSubmit} onClick={handleSubmit}>
          {t("socraticSubmit")}
        </button>
        <button
          className="ghost-button"
          disabled={socraticLoading || roundCount === 0}
          onClick={() => void finishSocratic()}
        >
          {t("socraticFinish")}
        </button>
      </div>

      <div className="socratic-foot">
        <button
          className="socratic-discard"
          onClick={() => {
            if (typeof window !== "undefined" && window.confirm(t("socraticDiscardConfirm"))) {
              discardSocratic();
            }
          }}
        >
          {t("socraticDiscard")}
        </button>
        <span>{t("socraticMaxRounds")}</span>
      </div>
    </aside>
  );
}

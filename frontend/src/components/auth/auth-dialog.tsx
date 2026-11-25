"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import * as auth from "@/lib/auth";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AuthDialog({ open, onOpenChange, onSuccess }: AuthDialogProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const t = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (mode === "register") {
        await auth.register(email, password, displayName || undefined);
        setInfo(t("authVerifyHint"));
        setMode("login");
      } else {
        await auth.login(email, password);
        const user = auth.getUser();
        if (user?.displayName) {
          useCanvasStore.getState().setUserName(user.displayName);
        }
        onSuccess?.();
        onOpenChange(false);
        resetForm();
      }
    } catch (err: any) {
      const msg = err.message || "Authentication failed";
      if (msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many")) {
        setError(t("authRateLimited"));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setError("");
    setInfo("");
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError("");
    setInfo("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="auth-dialog-content" showCloseButton>
        <DialogHeader>
          <DialogTitle className="auth-dialog-title">{t("authTitle")}</DialogTitle>
          <DialogDescription className="auth-dialog-desc">
            {t("authSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="auth-form" autoComplete="off">
          {/* Honeypot to absorb browser autofill */}
          <input type="text" style={{ display: "none" }} tabIndex={-1} autoComplete="username" />
          <input type="password" style={{ display: "none" }} tabIndex={-1} autoComplete="current-password" />
          {mode === "register" && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-display-name">{t("authDisplayName")}</label>
              <input
                id="auth-display-name"
                className="auth-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
              />
            </div>
          )}
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">{t("authEmail")}</label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">{t("authPassword")}</label>
            <input
              id="auth-password"
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}
          {info && <p className="auth-info">{info}</p>}

          <Button
            type="submit"
            disabled={loading}
            className="auth-submit-btn"
          >
            {loading ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Icons.spinner className="spinner" style={{ width: 16, height: 16 }} />
                {t("authSignIn")}...
              </span>
            ) : mode === "login" ? t("authSignIn") : t("authSignUp")}
          </Button>

          <button
            type="button"
            className="auth-switch"
            onClick={switchMode}
          >
            {mode === "login"
              ? <>{t("authNoAccount")} <span className="auth-switch-link">{t("authGoSignUp")}</span></>
              : <>{t("authHasAccount")} <span className="auth-switch-link">{t("authGoSignIn")}</span></>
            }
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

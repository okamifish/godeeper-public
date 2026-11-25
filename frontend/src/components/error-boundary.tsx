"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            background: "var(--bg-deep, #0f0f1a)",
            color: "var(--text-primary, #e0e0e0)",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: "1.5rem",
              marginBottom: "0.75rem",
              color: "var(--text-accent, #f97316)",
            }}
          >
            出了点问题
          </h2>
          <p
            style={{
              color: "var(--text-secondary, #888)",
              marginBottom: "1.5rem",
              maxWidth: "400px",
            }}
          >
            页面遇到了意外错误。请尝试刷新页面，如果问题持续，请联系我们。
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: "0.5rem 1.5rem",
              borderRadius: "8px",
              border: "none",
              background: "var(--accent, #f97316)",
              color: "#fff",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

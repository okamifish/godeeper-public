import "./env";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { errorHandler } from "./middleware/error";
import auth from "./routes/auth";
import canvas from "./routes/canvas";
import node from "./routes/node";
import task from "./routes/task";
import importRoute from "./routes/import";
import ocrRoute from "./routes/ocr";
import share from "./routes/share";
import publicRoute from "./routes/public";
import comment from "./routes/comment";
import knowledge from "./routes/knowledge";
import admin from "./routes/admin";
import aiRoutes from "./routes/ai";
import qualityRoute from "./routes/quality";
import { authMiddleware } from "./middleware/auth";
import { requireCapability } from "./middleware/capability";
import { isUuid } from "./lib/params";
import { registerProBackend } from "./pro/register";
import { runSystemPrompt, getPromptForPro } from "./services/ai.service";
import { backlinkSnippet } from "./lib/backlink";
import { purgeExpiredCanvases } from "./services/canvas.service";
import { resolvePrompt } from "./prompts/resolver";
import { getPromptOverride } from "./prompts/override";
import type { ProBackendDeps, ProRouteHost, ProRouter } from "@godeeper/pro-contract";

/**
 * 单一 app 工厂：运行入口（src/index.ts）与测试入口（src/app.ts）都从这里取 app，
 * 避免两套路由接线导致「测试通过、真机 404」。
 */
export function createApp() {
  const app = new Hono();

  const devOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowedOrigins = process.env.NODE_ENV === "development"
    ? (configuredOrigins.length > 0 ? configuredOrigins : devOrigins)
    : configuredOrigins;

  if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
    console.warn("CORS_ORIGINS is empty: browser requests from the frontend will be blocked.");
  }

  if (process.env.NODE_ENV !== "test") {
    app.use("*", logger());
  }
  app.use("*", cors({
    origin: allowedOrigins,
    credentials: true,
  }));

  app.onError(errorHandler);

  // Pro 路由必须先于核心的 /canvas 路由注册，否则 /canvas/trash 会被 /canvas/:id 捕获。
  // 社区版安装的是 packages/pro-stub，只保留路由形状并统一返回 403。
  const proRuntime = registerProBackend(app as unknown as ProRouteHost, {
    createRouter: () => new Hono() as unknown as ProRouter,
    authMiddleware: authMiddleware as unknown as ProBackendDeps["authMiddleware"],
    requireCapability: requireCapability as unknown as ProBackendDeps["requireCapability"],
    db: db as unknown as ProBackendDeps["db"],
    sql: sql as unknown as ProBackendDeps["sql"],
    isUuid,
    backlinkSnippet,
    purgeExpiredCanvases,
    runSystemPrompt,
    getPrompt: getPromptForPro,
    getPromptOverride,
    resolvePrompt,
  });
  const proEdition = proRuntime.edition;

  app.get("/health", async (c) => {
    let dbOk = false;
    try {
      await db.execute(sql`select 1`);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return c.json({
      status: "ok",
      edition: proEdition,
      version: process.env.npm_package_version ?? "0.1.0",
      uptimeSeconds: Math.floor(process.uptime()),
      dbOk,
      timestamp: new Date().toISOString(),
    });
  });

  app.route("/auth", auth);
  app.route("/canvas", canvas);
  app.route("/node", node);
  app.route("/task", task);
  app.route("/import", importRoute);
  app.route("/ocr", ocrRoute);
  app.route("/share", share);
  app.route("/public", publicRoute);
  app.route("/comment", comment);
  // 知识图谱为实验功能：MVP 默认关闭（接口代码保留，打开后即可访问）
  if (process.env.EXPERIMENTAL_ROUTES === "true") {
    app.route("/knowledge", knowledge);
  }
  app.route("/admin", admin);
  app.route("/ai", aiRoutes);
  app.route("/quality", qualityRoute);

  return app;
}

export const app = createApp();

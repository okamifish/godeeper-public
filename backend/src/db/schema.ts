import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, numeric, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  membership: text("membership").notNull().default("free"),
  apiKeyEnc: text("api_key_enc"),
  apiProvider: text("api_provider").default("openrouter"),
  apiBaseUrl: text("api_base_url"),
  modelName: text("model_name"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const canvases = pgTable("canvases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Canvas"),
  snapshot: jsonb("snapshot").notNull().default({}),
  nodeCount: integer("node_count").default(0),
  isPublic: boolean("is_public").default(false),
  allowPublicComments: boolean("allow_public_comments").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const nodes = pgTable("nodes", {
  id: text("id").primaryKey(),
  canvasId: uuid("canvas_id").notNull().references(() => canvases.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull().default(""),
  body: text("body").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const nodeLinks = pgTable("node_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceNodeId: text("source_node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  targetNodeId: text("target_node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  linkType: text("link_type").notNull().default("reference"),
  isAuto: boolean("is_auto").default(false),
  canvasId: uuid("canvas_id").notNull().references(() => canvases.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sourceTargetCanvasUnique: uniqueIndex("node_links_source_target_canvas_unique")
    .on(table.sourceNodeId, table.targetNodeId, table.canvasId),
}));

export const canvasShares = pgTable("canvas_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  canvasId: uuid("canvas_id").notNull().references(() => canvases.id, { onDelete: "cascade" }),
  shareToken: text("share_token").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  allowComment: boolean("allow_comment").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  canvasId: uuid("canvas_id").notNull().references(() => canvases.id, { onDelete: "cascade" }),
  nodeId: text("node_id").references(() => nodes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  feature: text("feature").notNull().default("task"),
  model: text("model"),
  status: text("status").notNull().default("success"),
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const taskRuns = pgTable("task_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: text("task_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  canvasId: uuid("canvas_id"),
  model: text("model"),
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  durationMs: integer("duration_ms").default(0),
  status: text("status").notNull().default("running"),
  errorMsg: text("error_msg"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const modelConfigs = pgTable("model_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("openrouter"),
  modelName: text("model_name").notNull(),
  inputPricePer1k: numeric("input_price_per_1k", { precision: 10, scale: 6 }).default("0"),
  outputPricePer1k: numeric("output_price_per_1k", { precision: 10, scale: 6 }).default("0"),
  enabled: boolean("enabled").default(true),
  allowedPlans: text("allowed_plans").default("free,pro,team"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const promptTemplates = pgTable("prompt_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  feature: text("feature").notNull().default("task"),
  version: integer("version").notNull().default(1),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  canvasesLimit: integer("canvases_limit").notNull().default(3),
  nodesPerCanvas: integer("nodes_per_canvas").notNull().default(50),
  aiTasksPerDay: integer("ai_tasks_per_day").notNull().default(10),
  isUnlimited: boolean("is_unlimited").notNull().default(false),
  stripePriceId: text("stripe_price_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nameUnique: uniqueIndex("plans_name_unique").on(table.name),
}));

export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey().default("global"),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const credits = pgTable("credits", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).primaryKey(),
  taskRun: integer("task_run").notNull().default(0),
  inspire: integer("inspire").notNull().default(0),
  summary: integer("summary").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const riskEvents = pgTable("risk_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  detail: text("detail"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

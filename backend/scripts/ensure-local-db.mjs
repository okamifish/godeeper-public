import dotenv from "dotenv";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.join(scriptDir, "..", ".env.local"), path.join(scriptDir, "..", ".env")],
});

const CORE_TABLES = [
  "users",
  "canvases",
  "nodes",
  "node_links",
  "canvas_shares",
  "comments",
  "ai_usage",
  "task_runs",
  "model_configs",
  "prompt_templates",
  "plans",
  "credits",
  "credit_transactions",
  "risk_events",
];

if (!process.env.DATABASE_URL) {
  console.error("DB_CHECK_FAILED DATABASE_URL is missing");
  process.exit(4);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 8 });

try {
  const rows = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `;
  const existing = new Set(rows.map((row) => row.table_name));
  const missing = CORE_TABLES.filter((name) => !existing.has(name));

  if (missing.length > 0) {
    console.log(`SCHEMA_MISSING ${missing.join(",")}`);
    process.exitCode = 3;
  } else {
    console.log(`SCHEMA_OK ${CORE_TABLES.length} tables`);
  }
} catch (error) {
  console.error(`DB_CHECK_FAILED ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 4;
} finally {
  await sql.end();
}

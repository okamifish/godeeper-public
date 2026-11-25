import dotenv from "dotenv";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.join(scriptDir, "..", ".env.local"), path.join(scriptDir, "..", ".env")],
});

const [email, daysRaw] = process.argv.slice(2);
if (!email || !daysRaw) {
  console.error("usage: node scripts/set-user-deleted-at.mjs <email> <daysAgo>");
  process.exit(1);
}

const days = Number(daysRaw);
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const rows = await sql`
    update users
    set deleted_at = now() - make_interval(days => ${days}), updated_at = now()
    where email = ${email}
    returning id, email, deleted_at
  `;
  console.log(JSON.stringify(rows[0] ?? null));
} catch (err) {
  console.error("error", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}

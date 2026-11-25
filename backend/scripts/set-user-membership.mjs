import dotenv from "dotenv";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.join(scriptDir, "..", ".env.local"), path.join(scriptDir, "..", ".env")],
});

const [email, membership] = process.argv.slice(2);
if (!email || !membership) {
  console.error("usage: node scripts/set-user-membership.mjs <email> <free|pro|team>");
  process.exit(1);
}
if (!["free", "pro", "team"].includes(membership)) {
  console.error("membership must be free, pro or team");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const rows = await sql`
  update users
  set membership = ${membership}, updated_at = now()
  where email = ${email}
  returning email, membership
`;
await sql.end();

if (!rows[0]) {
  console.error("user not found");
  process.exit(1);
}
console.log(JSON.stringify(rows[0]));

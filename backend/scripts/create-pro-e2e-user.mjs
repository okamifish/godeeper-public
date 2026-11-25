import dotenv from "dotenv";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.join(scriptDir, "..", ".env.local"), path.join(scriptDir, "..", ".env")],
});

const email = process.argv[2] ?? `phase4c-e2e-${Date.now()}@example.com`;
const password = process.argv[3] ?? "Phase4CTest!123";
const apiBase = process.env.E2E_API_BASE ?? "http://localhost:3001";

const register = await fetch(`${apiBase}/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, displayName: "Phase4C Pro" }),
});

if (![200, 201].includes(register.status) && register.status !== 409) {
  console.error("register failed", register.status, await register.text());
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const rows = await sql`
  update users
  set membership = 'pro', updated_at = now()
  where email = ${email}
  returning email, membership
`;
await sql.end();

if (!rows[0]) {
  console.error("user not found after register");
  process.exit(1);
}

console.log(JSON.stringify({ email, password, membership: rows[0].membership }));

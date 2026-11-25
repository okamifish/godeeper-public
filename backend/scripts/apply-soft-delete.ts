import "../src/env";

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

await sql`ALTER TABLE canvases ADD COLUMN IF NOT EXISTS deleted_at timestamptz`;
await sql`CREATE INDEX IF NOT EXISTS canvases_user_deleted_idx ON canvases (user_id, deleted_at)`;
console.log("deleted_at column ready");
await sql.end();
process.exit(0);

import "../src/env";

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

await sql`ALTER TABLE canvases ADD COLUMN IF NOT EXISTS allow_public_comments boolean NOT NULL DEFAULT true`;
console.log("allow_public_comments applied");
await sql.end();

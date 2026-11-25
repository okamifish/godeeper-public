import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: [".env.local", ".env"] });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const PLANS = [
  {
    name: "free",
    priceCents: 0,
    canvasesLimit: 1,
    nodesPerCanvas: -1,
    aiTasksPerDay: 10,
    isUnlimited: false,
  },
  {
    name: "pro",
    priceCents: 0,
    canvasesLimit: 20,
    nodesPerCanvas: 500,
    aiTasksPerDay: 100,
    isUnlimited: true,
  },
  {
    name: "team",
    priceCents: 0,
    canvasesLimit: 50,
    nodesPerCanvas: 1000,
    aiTasksPerDay: 500,
    isUnlimited: true,
  },
];

try {
  for (const plan of PLANS) {
    await sql`
      insert into "plans" ("name", "price_cents", "canvases_limit", "nodes_per_canvas", "ai_tasks_per_day", "is_unlimited")
      values (${plan.name}, ${plan.priceCents}, ${plan.canvasesLimit}, ${plan.nodesPerCanvas}, ${plan.aiTasksPerDay}, ${plan.isUnlimited})
      on conflict ("name") do update set
        "canvases_limit" = excluded."canvases_limit",
        "nodes_per_canvas" = excluded."nodes_per_canvas",
        "ai_tasks_per_day" = excluded."ai_tasks_per_day",
        "is_unlimited" = excluded."is_unlimited",
        "updated_at" = now()
    `;
    console.log(`plan upserted: ${plan.name}`);
  }
  console.log("plans seeded");
} catch (err) {
  console.error("seed-error", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}

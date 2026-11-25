// Test Supabase connectivity
// Usage: node test-supabase.js

const { resolve: resolvePath } = require("path");
require("dotenv").config({ path: resolvePath(__dirname, ".env") });

const https = require("https");

const tests = [];

// 1. Supabase REST API
tests.push({
  name: "Supabase REST API",
  run: () => new Promise((resolve) => {
    const url = new URL("/rest/v1/", process.env.SUPABASE_URL);
    const req = https.get(url, { headers: { apikey: process.env.SUPABASE_SECRET_KEY } }, (res) => {
      let body = "";
      res.on("data", (d) => body += d);
      res.on("end", () => {
        resolve(res.statusCode === 200
          ? { ok: true, msg: `Status ${res.statusCode}` }
          : { ok: false, msg: `Status ${res.statusCode}: ${body.slice(0, 100)}` });
      });
    });
    req.on("error", (e) => resolve({ ok: false, msg: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, msg: "Timeout" }); });
  }),
});

// 2. Database TCP connection
tests.push({
  name: "Database TCP",
  run: () => new Promise((resolve) => {
    const url = new URL(process.env.DATABASE_URL);
    const net = require("net");
    const s = net.createConnection(parseInt(url.port), url.hostname, () => {
      resolve({ ok: true, msg: `Connected to ${url.hostname}:${url.port}` });
      s.end();
    });
    s.setTimeout(10000);
    s.on("timeout", () => { s.destroy(); resolve({ ok: false, msg: `Timeout: ${url.hostname}:${url.port}` }); });
    s.on("error", (e) => resolve({ ok: false, msg: `${e.code || e.message}: ${url.hostname}:${url.port}` }));
  }),
});

// 3. Database auth (postgres.js)
tests.push({
  name: "Database Auth (postgres.js)",
  run: () => new Promise((resolve) => {
    const postgres = require("postgres");
    const sql = postgres(process.env.DATABASE_URL, {
      ssl: "require",
      connect_timeout: 15,
    });
    sql`SELECT 1 AS test`.then((r) => {
      resolve({ ok: true, msg: `Query OK: ${JSON.stringify(r[0])}` });
      sql.end();
    }).catch((e) => {
      resolve({ ok: false, msg: e.message });
      sql.end();
    });
  }),
});

// 4. Drizzle ORM
tests.push({
  name: "Drizzle ORM",
  run: () => new Promise(async (resolve) => {
    try {
      const { drizzle } = require("drizzle-orm/postgres-js");
      const postgres = require("postgres");
      const client = postgres(process.env.DATABASE_URL, { ssl: "require", connect_timeout: 15 });
      const db = drizzle(client);
      const result = await db.execute(require("drizzle-orm").sql`SELECT current_database(), current_user`);
      resolve({ ok: true, msg: `DB: ${result[0].current_database}, User: ${result[0].current_user}` });
      client.end();
    } catch (e) {
      resolve({ ok: false, msg: e.message });
    }
  }),
});

(async () => {
  console.log("=== GoDeeper Supabase Connection Test ===\n");
  console.log(`SUPABASE_URL:        ${process.env.SUPABASE_URL ?? "(not set)"}`);
  console.log(`SUPABASE_SECRET_KEY: ${process.env.SUPABASE_SECRET_KEY ? "***" + process.env.SUPABASE_SECRET_KEY.slice(-6) : "(not set)"}`);
  console.log(`DATABASE_URL:        ${process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname + ":" + new URL(process.env.DATABASE_URL).port : "(not set)"}\n`);

  for (const t of tests) {
    process.stdout.write(`  ${t.name} ... `);
    const result = await t.run();
    const icon = result.ok ? "OK" : "FAIL";
    console.log(`[${icon}] ${result.msg}`);
  }

  console.log("\n=== Done ===");
  process.exit(0);
})();

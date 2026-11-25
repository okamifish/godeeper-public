import "./env";
import { serve } from "@hono/node-server";
import { app } from "./app";

export { app };

const port = parseInt(process.env.PORT ?? "3001");

if (process.env.NODE_ENV !== "test") {
  console.log(`GoDeeper API running on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

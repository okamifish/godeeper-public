import type { Context, Next } from "hono";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);

export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get("user");
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
}

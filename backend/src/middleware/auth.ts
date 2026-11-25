import type { Context, Next } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { AuthUser } from "../types";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const dbUser = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const row = dbUser[0];

  if (row?.deletedAt) {
    return c.json({ error: "Account has been disabled" }, 403);
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? "",
    display_name: user.user_metadata?.display_name ?? null,
    membership: (row?.membership as "free" | "pro" | "team") ?? "free",
    api_key_enc: row?.apiKeyEnc ?? null,
    api_provider: row?.apiProvider ?? null,
  };

  c.set("user", authUser);
  await next();
}

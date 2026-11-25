import { createClient } from "@supabase/supabase-js";
import { db } from "../db";
import { users } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";

function getSupabase() {
  // 后端只做签发与校验，不持有用户会话。
  // 关闭自动刷新/持久化，避免后台定时刷新与浏览器 SDK 争抢同一个 refresh token
  // （轮换机制下会导致其中一方被踢下线）。
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function register(email: string, password: string, displayName?: string) {
  const [existing] = await db.select({ id: users.id, deletedAt: users.deletedAt })
    .from(users).where(eq(users.email, email)).limit(1);
  if (existing?.deletedAt) throw new Error("ACCOUNT_DELETED");

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);

  await db.insert(users).values({
    id: data.user!.id,
    email,
    displayName: displayName ?? null,
  }).onConflictDoNothing();

  return { id: data.user!.id, email };
}

export async function login(email: string, password: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  const [row] = await db.select({ deletedAt: users.deletedAt })
    .from(users).where(eq(users.id, data.user.id)).limit(1);
  if (row?.deletedAt) throw new Error("ACCOUNT_DELETED");

  // refreshToken 交给前端 Supabase SDK 做静默续期；access token 仍保持 1 小时短效。
  return {
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: data.user,
  };
}

/**
 * 对外返回的用户信息：只包含前端需要的字段。
 * 不返回 apiKeyEnc（加密后的 Key）等敏感列。
 */
export async function getUser(userId: string) {
  const rows = await db.select({
    id: users.id,
    email: users.email,
    displayName: users.displayName,
    avatarUrl: users.avatarUrl,
    membership: users.membership,
    apiProvider: users.apiProvider,
    apiBaseUrl: users.apiBaseUrl,
    modelName: users.modelName,
    hasApiKey: sql<boolean>`(${users.apiKeyEnc} is not null)`,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function updateApiKey(
  userId: string,
  apiKey: string,
  provider: string,
  baseUrl?: string,
  modelName?: string,
) {
  const encrypted = encrypt(apiKey);
  await db.update(users)
    .set({
      apiKeyEnc: encrypted,
      apiProvider: provider,
      apiBaseUrl: baseUrl ?? null,
      ...(modelName ? { modelName } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function getDecryptedApiKey(userId: string): Promise<{
  apiKey: string;
  provider: string;
  baseUrl: string | null;
  modelName: string | null;
} | null> {
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = result[0];
  if (!user?.apiKeyEnc) return null;
  return {
    apiKey: decrypt(user.apiKeyEnc),
    provider: user.apiProvider ?? "openrouter",
    baseUrl: user.apiBaseUrl ?? null,
    modelName: user.modelName ?? null,
  };
}

/** 30 天清理时同时删除 Supabase Auth 账号，避免同邮箱永久无法再注册 */
export async function deleteAuthUser(userId: string) {
  const supabase = getSupabase();
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}

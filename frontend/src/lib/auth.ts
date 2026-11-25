import type { SupabaseClient } from "@supabase/supabase-js";

const TOKEN_KEY = "godeeper-auth-token";
const USER_KEY = "godeeper-auth-user";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export const AUTH_CHANGED_EVENT = "godeeper:auth-changed";

function notifyAuthChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string | null;
  membership: string;
  /** 服务端返回的能力列表；旧缓存可能没有该字段 */
  capabilities?: string[];
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, notify = true) {
  localStorage.setItem(TOKEN_KEY, token);
  if (notify) notifyAuthChanged();
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  if (!localStorage.getItem(TOKEN_KEY)) return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return false; // no exp claim = never expires
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired(token)) {
    clearToken();
    return false;
  }
  return true;
}

/**
 * 浏览器端 Supabase 客户端单例。
 * 只用它管理会话（刷新令牌、跨标签加锁、持久化），业务请求仍走自己的后端。
 * 环境变量缺失时返回 null，调用方退回原有行为。
 */
let sessionClient: SupabaseClient | null = null;
let sessionClientPromise: Promise<SupabaseClient | null> | null = null;
let refreshPromise: Promise<string | null> | null = null;

async function getSessionClient(): Promise<SupabaseClient | null> {
  if (typeof window === "undefined") return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }
  if (sessionClient) return sessionClient;
  if (!sessionClientPromise) {
    sessionClientPromise = import("@/utils/supabase/client")
      .then(({ createClient }) => {
        const client = createClient();
        client.auth.onAuthStateChange((event, session) => {
          // 刷新发生在后台：只更新镜像令牌，不广播，避免每小时触发侧栏重载。
          if (session?.access_token) {
            setToken(session.access_token, false);
            return;
          }
          if (event === "SIGNED_OUT") {
            clearToken();
            notifyAuthChanged();
          }
        });
        sessionClient = client;
        return client;
      })
      .catch(() => null);
  }
  return sessionClientPromise;
}

/**
 * 应用启动时恢复会话：刷新页面后即使本地令牌被清掉，
 * 只要 Supabase 会话仍在，就能换回可用令牌。
 */
export async function startSessionSync(): Promise<void> {
  const supabase = await getSessionClient();
  if (!supabase) return;

  const previous = getToken();
  const { data } = await supabase.auth.getSession();
  const next = data.session?.access_token ?? null;
  if (!next) return;

  if (next !== previous) {
    setToken(next, false);
    notifyAuthChanged();
  }

  // 过期清理会一并删掉用户信息；会话恢复后补回来，避免顶栏显示成空账号。
  if (!localStorage.getItem(USER_KEY)) {
    try {
      const user = await authRequest("/auth/me", {
        headers: { Authorization: `Bearer ${next}` },
      });
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      notifyAuthChanged();
    } catch {
      // 用户信息补拉失败不影响令牌恢复
    }
  }
}

/** 用刷新令牌换一个可用的 access token；并发调用共享同一个请求。 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const supabase = await getSessionClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) return null;
    setToken(data.session.access_token, false);
    return data.session.access_token;
  })()
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function authRequest(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function register(email: string, password: string, displayName?: string) {
  await authRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
  return login(email, password);
}

export async function login(email: string, password: string) {
  const result = await authRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const token: string = result.token;
  const refreshToken: string | null = result.refreshToken ?? null;
  // 先拿到新账号的用户信息，再广播认证变化，避免侧栏用旧账号身份加载画布
  setToken(token, false);

  if (refreshToken) {
    const supabase = await getSessionClient();
    // 交给 SDK 托管续期；失败时保留本次 access token，不阻断登录。
    await supabase?.auth
      .setSession({ access_token: token, refresh_token: refreshToken })
      .catch(() => {});
  }

  const user = await authRequest("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notifyAuthChanged();
  return { token, user: user as AuthUser };
}

export async function logout() {
  // 先记下旧令牌：SDK 登出会清掉会话，后端撤销仍需要这个令牌。
  const token = getToken();

  const supabase = await getSessionClient();
  await supabase?.auth.signOut().catch(() => {});

  if (token && API_BASE) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearToken();
  notifyAuthChanged();
}

export async function refreshUser(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token || !API_BASE) return null;
  const user = await authRequest("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user as AuthUser;
}

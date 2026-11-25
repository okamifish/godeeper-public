export interface Env {
  DATABASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  ENCRYPTION_KEY: string;
  PORT: string;
  NODE_ENV: string;
}

export interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  membership: "free" | "pro" | "team";
  api_key_enc: string | null;
  api_provider: string | null;
}

export interface Variables {
  user: AuthUser;
  aiModel: string | null;
}

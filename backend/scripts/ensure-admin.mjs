import dotenv from "dotenv";
import postgres from "postgres";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(scriptDir, "..");
const rootDir = path.join(backendDir, "..");

dotenv.config({
  path: [path.join(backendDir, ".env.local"), path.join(backendDir, ".env")],
});

function parseArgs(argv) {
  const options = { email: "admin@godeeper.local", password: "", resetPassword: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email" && argv[i + 1]) {
      options.email = argv[i + 1];
      i += 1;
    } else if (arg === "--password" && argv[i + 1]) {
      options.password = argv[i + 1];
      i += 1;
    } else if (arg === "--reset-password") {
      options.resetPassword = true;
    }
  }
  return options;
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generatePassword() {
  return `GD-${crypto.randomBytes(12).toString("base64url")}`;
}

/** 只追加管理员邮箱，保留其它行和原有换行风格。 */
function addEmailToEnvFile(filePath, key, email) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`缺少环境变量文件：${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const pattern = new RegExp(`^${key}=(.*)$`, "m");
  const match = content.match(pattern);

  let nextContent;
  if (match) {
    const values = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (values.some((item) => item.toLowerCase() === email)) {
      return false;
    }
    values.push(email);
    nextContent = content.replace(pattern, `${key}=${values.join(",")}`);
  } else {
    const suffix = content.endsWith("\n") ? "" : eol;
    nextContent = `${content}${suffix}${key}=${email}${eol}`;
  }

  fs.writeFileSync(filePath, nextContent, "utf8");
  return true;
}

const options = parseArgs(process.argv.slice(2));
const email = normalizeEmail(options.email);

if (!isValidEmail(email)) {
  console.error(`无效邮箱：${options.email}`);
  process.exit(1);
}
if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error("缺少 DATABASE_URL / SUPABASE_URL / SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 8 });

async function findAuthUser() {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`读取 Supabase 用户失败：${error.message}`);
    const found = data.users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const [existingRow] = await sql`
    select id, membership, deleted_at from users where lower(email) = ${email} limit 1
  `;

  let authUser = null;
  let created = false;
  let passwordSet = false;
  let generatedPassword = "";

  if (existingRow) {
    const { data, error } = await supabase.auth.admin.getUserById(existingRow.id);
    if (error || !data?.user) {
      throw new Error(`数据库中有用户但 Supabase Auth 中不存在：${email}`);
    }
    authUser = data.user;

    if (options.resetPassword) {
      if (!options.password) {
        throw new Error("使用 --reset-password 时必须同时提供 --password");
      }
      if (options.password.length < 8) {
        throw new Error("管理员密码至少 8 位");
      }
      const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: options.password,
      });
      if (updateError) throw new Error(`重置密码失败：${updateError.message}`);
      passwordSet = true;
    }
  } else {
    authUser = await findAuthUser();
    if (authUser) {
      // Auth 中有记录但 public.users 缺失：补回业务用户行，不重建 Auth 账号。
      created = false;
    } else {
      const password = options.password || generatePassword();
      if (password.length < 8) {
        throw new Error("管理员密码至少 8 位");
      }
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "管理员" },
      });
      if (error) throw new Error(`创建管理员 Auth 账号失败：${error.message}`);
      authUser = data.user;
      created = true;
      passwordSet = true;
      if (!options.password) generatedPassword = password;
    }
  }

  await sql`
    insert into users (id, email, display_name, membership, deleted_at)
    values (${authUser.id}, ${email}, ${"管理员"}, ${"pro"}, ${null})
    on conflict (id) do update set
      email = excluded.email,
      membership = ${"pro"},
      deleted_at = null,
      updated_at = now()
  `;

  const envChangedBackend = addEmailToEnvFile(
    path.join(backendDir, ".env.local"),
    "ADMIN_EMAILS",
    email,
  );
  const envChangedFrontend = addEmailToEnvFile(
    path.join(rootDir, "frontend", ".env.local"),
    "NEXT_PUBLIC_ADMIN_EMAILS",
    email,
  );

  console.log(JSON.stringify({
    email,
    userId: authUser.id,
    created,
    passwordSet,
    generatedPassword,
    membership: "pro",
    envChanged: envChangedBackend || envChangedFrontend,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendEnvFiles = [
  path.join(root, "backend", ".env.local"),
  path.join(root, "backend", ".env"),
];
const frontendEnvFiles = [path.join(root, "frontend", ".env.local")];

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return null;
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadEnv(files) {
  const result = {};
  for (const file of files) {
    const values = parseEnvFile(file);
    if (!values) continue;
    for (const [key, value] of Object.entries(values)) {
      if (result[key] === undefined) result[key] = value;
    }
  }
  return result;
}

function isPresent(env, key) {
  return typeof env[key] === "string" && env[key].trim() !== "";
}

function isLocalUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
}

const backend = loadEnv(backendEnvFiles);
const frontend = loadEnv(frontendEnvFiles);
const lines = [];
let failures = 0;
let warnings = 0;

function pass(label) {
  lines.push(`[PASS] ${label}`);
}
function warn(label) {
  warnings += 1;
  lines.push(`[WARN] ${label}`);
}
function fail(label) {
  failures += 1;
  lines.push(`[FAIL] ${label}`);
}

lines.push("GoDeeper launch environment self-check");
lines.push("（只读检查；不会输出任何环境变量的值）");
lines.push("");

for (const file of backendEnvFiles) {
  if (fs.existsSync(file)) pass(`backend env file exists: ${path.relative(root, file)}`);
  else warn(`backend env file missing: ${path.relative(root, file)}`);
}
for (const file of frontendEnvFiles) {
  if (fs.existsSync(file)) pass(`frontend env file exists: ${path.relative(root, file)}`);
  else warn(`frontend env file missing: ${path.relative(root, file)}`);
}
lines.push("");

const requiredBackend = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "ENCRYPTION_KEY", "ADMIN_EMAILS"];
for (const key of requiredBackend) {
  if (isPresent(backend, key)) pass(`backend variable present: ${key}`);
  else fail(`backend variable missing: ${key}`);
}

const desiredBackend = ["CORS_ORIGINS", "PORT"];
for (const key of desiredBackend) {
  if (isPresent(backend, key)) pass(`backend variable present: ${key}`);
  else warn(`backend variable missing (check deployment config): ${key}`);
}

for (const key of ["DATABASE_URL", "SUPABASE_URL"]) {
  if (!isPresent(backend, key)) continue;
  if (isLocalUrl(backend[key])) {
    warn(`${key} points to localhost/127.0.0.1; confirm this is intentional for local only`);
  } else {
    pass(`${key} is not a localhost URL`);
  }
}

const hostedKeys = ["HOSTED_AI_API_KEY", "HOSTED_AI_BASE_URL", "HOSTED_AI_PROVIDER", "HOSTED_AI_MODEL"];
const hostedConfigured = hostedKeys.filter((key) => isPresent(backend, key));
if (hostedConfigured.length === 0) {
  lines.push("[INFO] hosted AI not configured; users must use BYOK");
} else if (hostedConfigured.length < hostedKeys.length) {
  warn(`hosted AI partially configured (${hostedConfigured.length}/${hostedKeys.length} variables)`);
} else {
  pass("hosted AI variables configured");
}

if (isPresent(backend, "CORS_ORIGINS")) {
  const count = backend.CORS_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean).length;
  if (count === 0) warn("CORS_ORIGINS is present but empty");
  else pass(`CORS_ORIGINS configured with ${count} origin(s)`);
}

if (isPresent(frontend, "NEXT_PUBLIC_API_URL")) {
  pass("frontend variable present: NEXT_PUBLIC_API_URL");
  if (isLocalUrl(frontend.NEXT_PUBLIC_API_URL)) {
    warn("NEXT_PUBLIC_API_URL points to localhost/127.0.0.1; confirm this is intentional for local only");
  } else {
    pass("NEXT_PUBLIC_API_URL is not a localhost URL");
  }
} else {
  fail("frontend variable missing: NEXT_PUBLIC_API_URL");
}

lines.push("");

try {
  const tracked = git(["ls-files"]);
  const forbidden = tracked.filter((file) => {
    if (file.startsWith("info/")) return true;
    const base = path.basename(file);
    return base.startsWith(".env") && base !== ".env.example";
  });
  if (forbidden.length === 0) {
    pass("no tracked .env / info files");
  } else {
    fail(`tracked secret-bearing files: ${forbidden.join(", ")}`);
  }
} catch (error) {
  warn(`unable to list tracked files: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const matches = git(["grep", "-l", "-I", "-E", "sb_secret_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}"]);
  if (matches.length === 0) {
    pass("no long secret-like values in tracked files");
  } else {
    fail(`tracked files with secret-like values: ${matches.join(", ")}`);
  }
} catch (error) {
  if (error && typeof error === "object" && "status" in error && error.status === 1) {
    pass("no long secret-like values in tracked files");
  } else {
    warn(`unable to scan tracked files: ${error instanceof Error ? error.message : String(error)}`);
  }
}

lines.push("");
lines.push(`Summary: ${failures} failure(s), ${warnings} warning(s)`);
lines.push("Note: this script only checks local files; it cannot prove production configuration.");

console.log(lines.join("\n"));
process.exit(failures > 0 ? 1 : 0);

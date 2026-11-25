#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_FILES = ["frontend/package.json", "backend/package.json"];
const CHANGELOG_FILE = "CHANGELOG.md";
const CHANGELOG_HEADER =
  "# 更新日志\n\n本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。本文件只记录用户能感知的变化，内部重构不写入。\n\n";

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function usage() {
  console.log(
    `
用法：
  node scripts/release.mjs <patch|minor|breaking> [选项]

选项：
  --add "内容"        新增（可重复）
  --improve "内容"    改进（可重复）
  --fix "内容"        修复（可重复）
  --breaking "内容"   破坏性变更（可重复）
  --no-commit         只改文件，不提交、不打 tag
  --dry-run           只打印将要发生的变化

示例：
  node scripts/release.mjs minor --add "画布支持软分组" --fix "修复自动布局后节点飞出视野"

说明：
  - 版本号以 frontend/package.json 为准，前后端必须一致。
  - 0.x 阶段的 breaking 升 MINOR；1.0.0 之后升 MAJOR。
`.trim(),
  );
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(args.length === 0 ? 1 : 0);
}

const notes = { breaking: [], add: [], improve: [], fix: [] };
const types = { patch: false, minor: false, breaking: false };
let noCommit = false;
let dryRun = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--add" || arg === "--improve" || arg === "--fix" || arg === "--breaking") {
    const value = args[index + 1];
    if (!value) fail(`${arg} 需要一个内容参数`);
    notes[arg.slice(2)].push(value);
    index += 1;
    continue;
  }

  if (arg === "--no-commit") {
    noCommit = true;
    continue;
  }

  if (arg === "--dry-run") {
    dryRun = true;
    continue;
  }

  if (arg === "patch" || arg === "minor" || arg === "breaking" || arg === "major") {
    types[arg === "major" ? "breaking" : arg] = true;
    continue;
  }

  console.error(`未知参数：${arg}`);
  usage();
  process.exit(1);
}

const selectedTypes = Object.keys(types).filter((key) => types[key]);
if (selectedTypes.length !== 1) fail("请指定且只指定一个版本类型：patch、minor 或 breaking");
const type = selectedTypes[0];

const totalNotes = Object.values(notes).reduce((sum, list) => sum + list.length, 0);
if (totalNotes === 0) fail("至少提供一条更新内容：--add / --improve / --fix / --breaking");

const versions = PKG_FILES.map((file) => {
  const pkg = JSON.parse(readFileSync(join(root, file), "utf8"));
  return { file, version: pkg.version };
});
const [frontend, backend] = versions;

if (!frontend.version || !backend.version) fail("package.json 缺少 version 字段");
if (frontend.version !== backend.version) {
  fail(`前后端版本不一致：${frontend.version} / ${backend.version}，请先手动统一`);
}

function nextVersion(current, bumpType) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (bumpType === "patch") return `${major}.${minor}.${patch + 1}`;
  if (bumpType === "minor") return `${major}.${minor + 1}.0`;
  if (major === 0) return `0.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}

function tagExists(tag) {
  try {
    execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}`], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const version = nextVersion(frontend.version, type);
const tag = `v${version}`;

if (!dryRun && tagExists(tag)) fail(`tag ${tag} 已存在，请检查版本号`);

const date = new Date().toLocaleDateString("sv-SE");
const sections = [
  ["breaking", "破坏性变更"],
  ["add", "新增"],
  ["improve", "改进"],
  ["fix", "修复"],
];
let section = `## [${version}] - ${date}\n\n`;
for (const [key, title] of sections) {
  if (notes[key].length === 0) continue;
  section += `### ${title}\n\n${notes[key].map((note) => `- ${note}`).join("\n")}\n\n`;
}

const changelogPath = join(root, CHANGELOG_FILE);
const existing = existsSync(changelogPath)
  ? readFileSync(changelogPath, "utf8")
  : CHANGELOG_HEADER;
const insertAt = existing.indexOf("\n## ");
const updatedChangelog =
  insertAt === -1
    ? `${existing.trimEnd()}\n\n${section}`.trimEnd() + "\n"
    : `${existing.slice(0, insertAt + 1)}${section}${existing.slice(insertAt + 1)}`;

console.log(`\n版本：${frontend.version} → ${version}`);
console.log(`tag：${tag}`);
console.log(`更新内容：${totalNotes} 条`);

if (dryRun) {
  console.log("\n[dry-run] 未写入任何文件。\n");
  process.exit(0);
}

for (const { file } of versions) {
  const fullPath = join(root, file);
  const raw = readFileSync(fullPath, "utf8");
  const next = raw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
  if (next === raw) fail(`${file} 中未找到 version 字段`);
  writeFileSync(fullPath, next, "utf8");
}
writeFileSync(changelogPath, updatedChangelog, "utf8");

if (noCommit) {
  console.log("\n已更新文件（未提交）。手动提交：");
  console.log(`  git add ${[...PKG_FILES, CHANGELOG_FILE].join(" ")}`);
  console.log(`  git commit -m "chore(release): ${tag}"`);
  console.log(`  git tag -a ${tag} -m ${tag}\n`);
  process.exit(0);
}

function run(command, commandArgs) {
  execFileSync(command, commandArgs, { cwd: root, stdio: "inherit" });
}

run("git", ["add", CHANGELOG_FILE, ...PKG_FILES]);
run("git", ["commit", "-m", `chore(release): ${tag}`]);
run("git", ["tag", "-a", tag, "-m", tag]);

console.log(`\n✔ 已发布 ${tag}（本地）。记得部署；有远程仓库时再执行 git push --tags。\n`);

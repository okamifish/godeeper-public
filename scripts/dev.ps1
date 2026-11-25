#requires -Version 5.1
<#
.SYNOPSIS
  Start the GoDeeper community edition locally.

.DESCRIPTION
  Checks Node.js, creates env files from the examples when missing, installs
  dependencies when node_modules is absent, and opens the backend and frontend
  dev servers in separate windows. It never writes credentials.

.PARAMETER SkipInstall
  Do not run npm install even when node_modules is missing.

.EXAMPLE
  powershell -File scripts\dev.ps1
#>
[CmdletBinding()]
param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Test-Node() {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $node) {
    throw "找不到 node。请先安装 Node.js 20 或更高版本：https://nodejs.org/"
  }
  $version = (& node -v).Trim()
  $major = [int](($version -replace '^v', '') -split '\.')[0]
  if ($major -lt 20) {
    throw "Node.js 版本过低：$version。需要 20 或更高版本。"
  }
  Write-Host "Node.js $version"
}

function Ensure-Env([string]$Directory, [string]$Example, [string]$Target, [string]$Hint) {
  $examplePath = Join-Path $Directory $Example
  $targetPath = Join-Path $Directory $Target
  if (-not (Test-Path -LiteralPath $targetPath)) {
    Copy-Item -LiteralPath $examplePath -Destination $targetPath
    Write-Host "已创建 $Target，请填写：$Hint" -ForegroundColor Yellow
  }
}

function Ensure-Deps([string]$Directory, [string]$Name) {
  if ($SkipInstall) { return }
  if (Test-Path -LiteralPath (Join-Path $Directory "node_modules")) { return }
  Write-Step "安装 $Name 依赖"
  Push-Location -LiteralPath $Directory
  try {
    & npm install
    if ($LASTEXITCODE -ne 0) { throw "$Name npm install 失败" }
  } finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host "GoDeeper community edition" -ForegroundColor White
Write-Host "仓库：$Root" -ForegroundColor DarkGray

Write-Step "1/4 检查环境"
Test-Node

Write-Step "2/4 检查环境变量"
Ensure-Env $Backend ".env.example" ".env" "DATABASE_URL / SUPABASE_URL / SUPABASE_SECRET_KEY / ENCRYPTION_KEY"
Ensure-Env $Frontend ".env.example" ".env.local" "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"

Write-Step "3/4 检查依赖"
Ensure-Deps $Backend "backend"
Ensure-Deps $Frontend "frontend"

Write-Step "4/4 启动服务"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -WorkingDirectory $Backend
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -WorkingDirectory $Frontend

Write-Host ""
Write-Host "后端：http://localhost:3001 (GET /health)" -ForegroundColor Green
Write-Host "前端：http://localhost:3000" -ForegroundColor Green
Write-Host "首次运行请先执行数据库迁移：cd backend; npm run db:migrate; npm run db:seed" -ForegroundColor Yellow
Write-Host "关闭对应的命令行窗口即可停止服务。" -ForegroundColor DarkGray

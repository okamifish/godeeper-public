#requires -Version 5.1
<#
.SYNOPSIS
  Start the GoDeeper community edition locally.

.DESCRIPTION
  Checks Node.js, prepares env files from the examples, installs dependencies
  when needed, optionally runs migrations and seed, starts the backend and
  frontend dev servers in separate windows, waits for both to respond, and
  opens the browser. It never writes credentials.

.PARAMETER Install
  Force npm install in backend and frontend.

.PARAMETER SkipInstall
  Do not install dependencies even when node_modules is missing.

.PARAMETER Setup
  Shortcut for -Install -Migrate -Seed. Use it on a fresh database.

.PARAMETER Migrate
  Run npm run db:migrate in backend before starting.

.PARAMETER Seed
  Run npm run db:seed in backend before starting.

.PARAMETER BackendOnly
  Start only the backend.

.PARAMETER FrontendOnly
  Start only the frontend.

.PARAMETER NoOpen
  Do not open the browser after startup.

.PARAMETER SkipPortCheck
  Start even when port 3000 or 3001 is already in use.

.EXAMPLE
  powershell -File scripts\dev.ps1

.EXAMPLE
  powershell -File scripts\dev.ps1 -Setup

.EXAMPLE
  start-godeeper.cmd -Setup
#>
[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$SkipInstall,
  [switch]$Setup,
  [switch]$Migrate,
  [switch]$Seed,
  [switch]$BackendOnly,
  [switch]$FrontendOnly,
  [switch]$NoOpen,
  [switch]$SkipPortCheck
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$BackendUrl = "http://localhost:3001"
$FrontendUrl = "http://localhost:3000"
$envPlaceholder = $false

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Write-Ok([string]$Text) { Write-Host "OK   $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "WARN $Text" -ForegroundColor Yellow }
function Fail([string]$Text) { throw $Text }

function Test-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $node) {
    Fail "找不到 node。请先安装 Node.js 20 或更高版本：https://nodejs.org/"
  }
  $version = (& node -v).Trim()
  $majorText = (($version -replace '^v', '') -split '\.')[0]
  $major = 0
  [void][int]::TryParse($majorText, [ref]$major)
  if ($major -lt 20) {
    Fail "Node.js 版本过低：$version。需要 20 或更高版本。"
  }
  Write-Ok "Node.js $version"
}

function Test-EnvPlaceholders([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $text = Get-Content -LiteralPath $Path -Raw
  if ($null -eq $text) { return }
  $patterns = @(
    'your-supabase-service-role-key',
    'your-32-byte-hex-key',
    'your-local-publishable-key',
    'postgres:password@',
    'ci-placeholder'
  )
  foreach ($pattern in $patterns) {
    if ($text -match [regex]::Escape($pattern)) {
      $script:envPlaceholder = $true
      Write-Warn "检测到占位值：$([System.IO.Path]::GetFileName($Path)) 里的 $pattern"
    }
  }
}

function Ensure-BackendEnv {
  $local = Join-Path $Backend ".env.local"
  $plain = Join-Path $Backend ".env"
  if (Test-Path -LiteralPath $local) {
    Write-Ok "使用 backend/.env.local"
    Test-EnvPlaceholders $local
    return
  }
  if (Test-Path -LiteralPath $plain) {
    Write-Ok "使用 backend/.env"
    Test-EnvPlaceholders $plain
    return
  }
  Copy-Item -LiteralPath (Join-Path $Backend ".env.example") -Destination $plain
  $script:envPlaceholder = $true
  Write-Warn "已创建 backend/.env，请填写 DATABASE_URL / SUPABASE_URL / SUPABASE_SECRET_KEY / ENCRYPTION_KEY"
  Test-EnvPlaceholders $plain
}

function Ensure-FrontendEnv {
  $local = Join-Path $Frontend ".env.local"
  if (Test-Path -LiteralPath $local) {
    Write-Ok "使用 frontend/.env.local"
    Test-EnvPlaceholders $local
    return
  }
  Copy-Item -LiteralPath (Join-Path $Frontend ".env.example") -Destination $local
  $script:envPlaceholder = $true
  Write-Warn "已创建 frontend/.env.local，请填写 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  Test-EnvPlaceholders $local
}

function Test-Port([int]$Port, [string]$Name) {
  if ($SkipPortCheck) { return }
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $listener) {
    Fail "$Name 端口 $Port 已被占用（PID $($listener.OwningProcess)）。`n请先关闭已有服务，或加 -SkipPortCheck 跳过检查。"
  }
  Write-Ok "$Name 端口 $Port 可用"
}

function Get-DatabaseTarget {
  $candidates = @(
    (Join-Path $Backend ".env.local"),
    (Join-Path $Backend ".env")
  )
  foreach ($path in $candidates) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $line = Get-Content -LiteralPath $path | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
    if ($null -eq $line) { continue }
    $value = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim()
    try {
      $uri = [System.Uri]$value
      return [pscustomobject]@{ Host = $uri.Host; Port = $uri.Port }
    } catch {
      return $null
    }
  }
  return $null
}

function Test-Tcp([string]$TargetHost, [int]$TargetPort) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $result = $client.BeginConnect($TargetHost, $TargetPort, $null, $null)
    if (-not $result.AsyncWaitHandle.WaitOne(2000)) { return $false }
    $client.EndConnect($result)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Invoke-Npm([string]$Directory, [string[]]$Arguments, [string]$Name) {
  Write-Step "$Name：npm $($Arguments -join ' ')"
  Push-Location -LiteralPath $Directory
  try {
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) { Fail "$Name 执行失败：npm $($Arguments -join ' ')" }
  } finally {
    Pop-Location
  }
}

function Install-Deps([string]$Directory, [string]$Name) {
  if ($SkipInstall) {
    Write-Warn "已跳过 $Name 依赖安装（-SkipInstall）"
    return
  }
  $modules = Join-Path $Directory "node_modules"
  if ((-not $Install) -and (Test-Path -LiteralPath $modules)) {
    Write-Ok "$Name 依赖已存在"
    return
  }
  Invoke-Npm $Directory @("install") "$Name 安装依赖"
}

function Start-DevWindow([string]$Directory, [string]$Name) {
  $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "npm run dev" -WorkingDirectory $Directory -PassThru
  Write-Ok "$Name 启动窗口 PID $($process.Id)"
}

function Wait-Http([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      return Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  return $null
}

if ($Install -and $SkipInstall) { Fail "-Install 和 -SkipInstall 不能同时使用。" }
if ($Setup) { $Install = $true; $Migrate = $true; $Seed = $true }
if ($BackendOnly -and $FrontendOnly) { Fail "-BackendOnly 和 -FrontendOnly 不能同时使用。" }

Write-Host ""
Write-Host "GoDeeper community edition" -ForegroundColor White
Write-Host "仓库：$Root" -ForegroundColor DarkGray

Write-Step "1/7 检查 Node.js"
Test-Node

Write-Step "2/7 检查环境变量"
if (-not $FrontendOnly) { Ensure-BackendEnv }
if (-not $BackendOnly) { Ensure-FrontendEnv }
if ($envPlaceholder -and ($Setup -or $Migrate -or $Seed)) {
  Fail "环境变量里仍有占位值，无法执行迁移或 seed。请先填写 backend 的 DATABASE_URL / SUPABASE_* / ENCRYPTION_KEY。"
}
if ($envPlaceholder) {
  Write-Warn "环境变量里仍有占位值。服务可以启动，但登录、数据库和 AI 调用会失败。"
}

Write-Step "3/7 检查数据库"
if (-not $FrontendOnly) {
  $db = Get-DatabaseTarget
  if ($null -eq $db) {
    Write-Warn "未能从 backend/.env.local 或 backend/.env 解析 DATABASE_URL。"
  } elseif (Test-Tcp $db.Host $db.Port) {
    Write-Ok "数据库可连接：$($db.Host):$($db.Port)"
  } else {
    Write-Warn "数据库不可连接：$($db.Host):$($db.Port)"
    Write-Warn "本地 Supabase 请先运行 npx supabase start；其他数据库请先启动 Postgres。"
    if ($Setup -or $Migrate -or $Seed) {
      Fail "数据库未启动，无法执行迁移或 seed。"
    }
  }
}

Write-Step "4/7 检查端口"
if (-not $FrontendOnly) { Test-Port 3001 "后端" }
if (-not $BackendOnly) { Test-Port 3000 "前端" }

Write-Step "5/7 安装依赖"
if (-not $FrontendOnly) { Install-Deps $Backend "后端" }
if (-not $BackendOnly) { Install-Deps $Frontend "前端" }

Write-Step "6/7 数据库"
if ($Migrate) { Invoke-Npm $Backend @("run", "db:migrate") "数据库迁移" }
if ($Seed) { Invoke-Npm $Backend @("run", "db:seed") "写入 plans" }
if (-not $Migrate -and -not $Seed) { Write-Ok "跳过迁移与 seed（需要时加 -Migrate / -Seed / -Setup）" }

Write-Step "7/7 启动服务"
if (-not $FrontendOnly) { Start-DevWindow $Backend "后端" }
if (-not $BackendOnly) { Start-DevWindow $Frontend "前端" }

if (-not $BackendOnly) {
  Write-Host ""
  Write-Host "等待前端启动（最多 180 秒）..." -ForegroundColor DarkGray
  $front = Wait-Http $FrontendUrl 180
  if ($null -ne $front) {
    Write-Ok "前端已响应：$FrontendUrl (HTTP $($front.StatusCode))"
  } else {
    Write-Warn "前端 180 秒内没有响应，请查看前端窗口的日志。"
  }
}

if (-not $FrontendOnly) {
  Write-Host ""
  Write-Host "等待后端启动（最多 60 秒）..." -ForegroundColor DarkGray
  $health = Wait-Http "$BackendUrl/health" 60
  if ($null -ne $health) {
    try {
      $data = $health.Content | ConvertFrom-Json
      Write-Ok "后端已响应：edition=$($data.edition) dbOk=$($data.dbOk) version=$($data.version)"
      if ($data.dbOk -ne $true) {
        Write-Warn "dbOk=false，请检查 DATABASE_URL 和数据库状态。"
      }
    } catch {
      Write-Warn "后端已响应，但 /health 不是 JSON：$($health.Content)"
    }
  } else {
    Write-Warn "后端 60 秒内没有响应，请查看后端窗口的日志。"
  }
}

Write-Host ""
Write-Host "后端：$BackendUrl/health" -ForegroundColor Green
Write-Host "前端：$FrontendUrl" -ForegroundColor Green
Write-Host "停止：关闭对应的命令行窗口。" -ForegroundColor DarkGray
Write-Host "第一次使用：start-godeeper.cmd -Setup" -ForegroundColor DarkGray

if (-not $NoOpen -and -not $BackendOnly) {
  Start-Process $FrontendUrl
}

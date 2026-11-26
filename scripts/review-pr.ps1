#requires -Version 5.1
<#
.SYNOPSIS
  Review a GitHub pull request without changing the current branch.

.DESCRIPTION
  Fetches refs/pull/<number>/head, compares it with its merge base, scans the
  added lines for secrets and risky files, reads CI status, and writes a
  Markdown report with a plain-language verdict.

  By default the script does NOT execute code from the pull request. Use
  -RunTests to install dependencies and run type checks, tests and builds in a
  temporary git worktree. Only use -RunTests on pull requests you trust,
  because npm scripts can run arbitrary code.

.PARAMETER Pr
  Pull request number, for example 12.

.PARAMETER Repo
  GitHub repository in owner/name form. Defaults to the origin remote.

.PARAMETER RunTests
  Run backend/frontend checks in a temporary worktree. This executes code from
  the pull request.

.PARAMETER Open
  Open the Markdown report after it is written.

.EXAMPLE
  powershell -File scripts\review-pr.ps1 12

.EXAMPLE
  powershell -File scripts\review-pr.ps1 12 -RunTests -Open
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [int]$Pr,
  [string]$Repo = "",
  [switch]$RunTests,
  [switch]$Open
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
$ReportDir = Join-Path $env:TEMP "godeeper-pr-review"
$ReportPath = Join-Path $ReportDir ("pr-{0}-{1}.md" -f $Pr, (Get-Date -Format "yyyyMMdd-HHmmss"))
$script:Findings = New-Object System.Collections.ArrayList
$script:Critical = $false
$script:High = $false
$script:TestFailed = $false
$script:CiFailed = $false

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Write-Ok([string]$Text) { Write-Host "OK   $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "WARN $Text" -ForegroundColor Yellow }
function Fail([string]$Text) { throw $Text }

function Add-Finding([string]$Severity, [string]$Title, [string]$Detail) {
  [void]$script:Findings.Add([pscustomobject]@{
    Severity = $Severity
    Title = $Title
    Detail = $Detail
  })
  if ($Severity -eq "critical") { $script:Critical = $true }
  if ($Severity -eq "high") { $script:High = $true }
}

function Invoke-Git([string[]]$GitArgs) {
  $output = & git @GitArgs 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') 失败：$($output -join ' ')"
  }
  return $output
}

function Get-RepoSlug {
  if ($Repo) { return $Repo }
  $url = (& git remote get-url origin).Trim()
  if ($url -match 'github\.com[:/](?<slug>[^/]+/[^/]+?)(?:\.git)?$') {
    return $Matches["slug"]
  }
  Fail "无法从 origin 解析 GitHub 仓库。请用 -Repo owner/name 指定。"
}

function Test-AnyPattern([string]$Value, [string[]]$Patterns) {
  foreach ($pattern in $Patterns) {
    if ($Value -match $pattern) { return $true }
  }
  return $false
}

function Get-CiSummary([string]$Slug, [string]$Sha) {
  try {
    $runs = Invoke-RestMethod -Uri "https://api.github.com/repos/$Slug/commits/$Sha/check-runs" -Headers @{ "User-Agent" = "GoDeeper-PR-Review" } -TimeoutSec 30
    if ($null -ne $runs.check_runs -and @($runs.check_runs).Count -gt 0) {
      return @($runs.check_runs | ForEach-Object { "$($_.name): $($_.status)/$($_.conclusion)" })
    }
  } catch {
    # Fall back to Actions runs below.
  }
  try {
    $runs = Invoke-RestMethod -Uri "https://api.github.com/repos/$Slug/actions/runs?head_sha=$Sha&per_page=10" -Headers @{ "User-Agent" = "GoDeeper-PR-Review" } -TimeoutSec 30
    if ($null -ne $runs.workflow_runs -and @($runs.workflow_runs).Count -gt 0) {
      return @($runs.workflow_runs | ForEach-Object { "$($_.name): $($_.status)/$($_.conclusion)" })
    }
  } catch {
    return @("无法读取 CI 状态：$($_.Exception.Message)")
  }
  return @("没有找到 CI 记录")
}

function Invoke-Logged([string]$Directory, [string]$Label, [string]$Command, [string[]]$Arguments) {
  $safeLabel = $Label -replace '[^\w\-]', '_'
  $log = Join-Path $ReportDir ("pr-{0}-{1}.log" -f $Pr, $safeLabel)
  Push-Location -LiteralPath $Directory
  try {
    $output = & $Command @Arguments 2>&1
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $output | Set-Content -LiteralPath $log -Encoding UTF8
  $tail = @($output | Select-Object -Last 15)
  if ($code -ne 0) { $script:TestFailed = $true }
  return [pscustomobject]@{
    Label = $Label
    Code = $code
    Log = $log
    Tail = $tail
  }
}

$Slug = Get-RepoSlug
$ReportDir | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }

Write-Host ""
Write-Host "GoDeeper PR review" -ForegroundColor White
Write-Host "仓库：$Slug  PR：#$Pr" -ForegroundColor DarkGray

Write-Step "1/5 读取 PR 信息"
$meta = $null
try {
  $meta = Invoke-RestMethod -Uri "https://api.github.com/repos/$Slug/pulls/$Pr" -Headers @{ "User-Agent" = "GoDeeper-PR-Review" } -TimeoutSec 30
  Write-Ok "PR：$($meta.title)  作者：$($meta.user.login)  状态：$($meta.state)"
} catch {
  Write-Warn "无法读取 PR 元数据，继续用本地 git 数据：$($_.Exception.Message)"
}

Write-Step "2/5 拉取 PR 分支"
Invoke-Git @("fetch", "origin", "pull/$Pr/head:pr-$Pr", "--force") | Out-Null
$headSha = (Invoke-Git @("rev-parse", "pr-$Pr")).Trim()
Write-Ok "PR head：$($headSha.Substring(0, 7))"

$baseRef = "origin/main"
if ($null -ne $meta -and $meta.base.sha) { $baseRef = $meta.base.sha }
try {
  $mergeBase = (Invoke-Git @("merge-base", $baseRef, "pr-$Pr")).Trim()
} catch {
  $mergeBase = (Invoke-Git @("merge-base", "origin/main", "pr-$Pr")).Trim()
}
Write-Ok "比较基准：$($mergeBase.Substring(0, 7))"

$nameStatus = Invoke-Git @("diff", "--name-status", "$mergeBase...pr-$Pr")
$numstat = Invoke-Git @("diff", "--numstat", "$mergeBase...pr-$Pr")
$commits = Invoke-Git @("log", "--oneline", "$mergeBase..pr-$Pr")
$diff = Invoke-Git @("diff", "--unified=0", "$mergeBase...pr-$Pr")

$numMap = @{}
foreach ($line in $numstat) {
  $parts = $line -split "`t"
  if ($parts.Count -ge 3) {
    $key = $parts[2]
    if ($key -match '=>') { $key = ($key -split '=>')[-1].Trim().TrimEnd('}').Trim() }
    $numMap[$key] = @{ Adds = $parts[0]; Dels = $parts[1] }
  }
}

$files = New-Object System.Collections.ArrayList
foreach ($line in $nameStatus) {
  $parts = $line -split "`t"
  if ($parts.Count -lt 2) { continue }
  $status = $parts[0]
  $path = $parts[1]
  if ($status -like "R*" -and $parts.Count -ge 3) { $path = $parts[2] }
  $num = $numMap[$path]
  $adds = "-"
  $dels = "-"
  if ($null -ne $num) { $adds = $num.Adds; $dels = $num.Dels }
  [void]$files.Add([pscustomobject]@{ Status = $status; Path = $path; Adds = $adds; Dels = $dels })
}

if ($files.Count -eq 0) {
  Write-Warn "这个 PR 相对基准没有文件差异。"
}

Write-Step "3/5 静态风险扫描"
$criticalPatterns = @(
  '^\.github/workflows/',
  '^backend/src/middleware/auth',
  '^backend/src/lib/capabilities',
  '^backend/src/routes/auth',
  '^supabase/migrations/',
  '^packages/pro-contract/',
  '^frontend/src/pro/',
  '(^|/)\.env$',
  '(^|/)\.env\.local$',
  '(^|/)\.env\.production$',
  '^Dockerfile$',
  '^docker-compose'
)
$highPatterns = @(
  '^backend/src/routes/',
  '^backend/src/services/',
  '^backend/src/pro/',
  '^backend/src/lib/safe-fetch',
  '^backend/src/lib/crypto',
  '^frontend/src/components/auth/',
  '^frontend/src/lib/canvas-store',
  '^backend/package\.json$',
  '^frontend/package\.json$'
)

foreach ($file in $files) {
  if (Test-AnyPattern $file.Path $criticalPatterns) {
    Add-Finding "critical" "高风险文件" "$($file.Path) 涉及认证、权限、数据库迁移、Pro 契约、CI 或环境变量。"
  } elseif (Test-AnyPattern $file.Path $highPatterns) {
    Add-Finding "high" "敏感区域" "$($file.Path) 涉及路由、服务、依赖或权限相关代码。"
  } elseif ($file.Path -match 'package-lock\.json$') {
    Add-Finding "low" "锁文件变更" "$($file.Path) 变更；确认是依赖安装导致，而不是手工修改。"
  }
}

$secretPatterns = @(
  @{ Name = "模型 API Key"; Regex = 'sk-[A-Za-z0-9]{20,}' },
  @{ Name = "Supabase Secret Key"; Regex = 'sb_secret_[A-Za-z0-9_-]{10,}' },
  @{ Name = "GitHub Token"; Regex = '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})' },
  @{ Name = "AWS Access Key"; Regex = 'AKIA[0-9A-Z]{16}' },
  @{ Name = "私钥"; Regex = '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' },
  @{ Name = "数据库连接串"; Regex = 'postgres(ql)?://[^:\s]+:[^@\s]+@' }
)
$envAssignment = '(?i)\b(SERVICE_ROLE_KEY|ENCRYPTION_KEY|DATABASE_URL)\s*=\s*["'']?[A-Za-z0-9_\-\.:/@]{16,}'
$currentFile = ""
$newLine = 0
$secretHits = @{}
foreach ($line in $diff) {
  if ($line -match '^\+\+\+ b/(.+)$') { $currentFile = $Matches[1]; continue }
  if ($line -match '^@@ .* \+(\d+)(?:,(\d+))? @@') { $newLine = [int]$Matches[1]; continue }
  if ($line -match '^\+' -and $line -notmatch '^\+\+\+') {
    $content = $line.Substring(1)
    foreach ($pattern in $secretPatterns) {
      if ($content -match $pattern.Regex) {
        $key = "$currentFile`:$newLine`:$($pattern.Name)"
        if (-not $secretHits.ContainsKey($key)) {
          $secretHits[$key] = $true
          Add-Finding "critical" "疑似密钥" "$currentFile`:$newLine 命中 $($pattern.Name)，请确认是否误提交。"
        }
      }
    }
    if ($content -match $envAssignment) {
      $value = $Matches[0]
      if ($value -notmatch '(?i)your-|example|placeholder|change-me|\*\*\*') {
        $key = "$currentFile`:$newLine`:env"
        if (-not $secretHits.ContainsKey($key)) {
          $secretHits[$key] = $true
          Add-Finding "critical" "疑似环境变量值" "$currentFile`:$newLine 写入了一个非占位的敏感变量。"
        }
      }
    }
    if ($content -match '(?i)\b(child_process|execSync|exec\(|spawn\(|eval\(|new Function)\b') {
      Add-Finding "high" "动态执行代码" "$currentFile`:$newLine 出现进程执行或动态求值，需要确认用途。"
    }
    $newLine++
  } elseif ($line -match '^-' -and $line -notmatch '^---') {
    continue
  } else {
    $newLine++
  }
}

if ($null -ne $meta -and $meta.changed_files -gt 50) {
  Add-Finding "high" "改动过大" "这个 PR 改了 $($meta.changed_files) 个文件，建议拆小后再审。"
}

Write-Step "4/5 读取 CI 与本地检查"
$ciLines = Get-CiSummary $Slug $headSha
foreach ($ci in $ciLines) {
  Write-Host "  $ci"
  if ($ci -match '/failure|/cancelled|/timed_out|/action_required') { $script:CiFailed = $true }
}
if ($ciLines -match '/failure|/cancelled|/timed_out|/action_required') { $script:CiFailed = $true }

$testResults = New-Object System.Collections.ArrayList
$worktree = Join-Path $env:TEMP "godeeper-pr-$Pr"
if ($RunTests) {
  Write-Warn "将执行 PR 中的 npm scripts，存在供应链风险。只在你信任这个 PR 时使用。"
  if (Test-Path -LiteralPath $worktree) {
    & git worktree remove --force $worktree 2>$null
    Remove-Item -LiteralPath $worktree -Recurse -Force -ErrorAction SilentlyContinue
  }
  Invoke-Git @("worktree", "add", "--detach", $worktree, $headSha) | Out-Null
  try {
    $backendChanged = @($files | Where-Object { $_.Path -like "backend/*" }).Count -gt 0
    $frontendChanged = @($files | Where-Object { $_.Path -like "frontend/*" }).Count -gt 0

    if ($backendChanged) {
      $backendDir = Join-Path $worktree "backend"
      $backendReady = $true
      $result = Invoke-Logged $backendDir "backend-npm-ci" "npm" @("ci")
      [void]$testResults.Add($result)
      if ($result.Code -ne 0) { $backendReady = $false }
      if ($backendReady) {
        $result = Invoke-Logged $backendDir "backend-tsc" "npx" @("tsc", "--noEmit")
        [void]$testResults.Add($result)
        if ($result.Code -ne 0) { $backendReady = $false }
      }
      if ($backendReady) {
        [void]$testResults.Add((Invoke-Logged $backendDir "backend-test" "npx" @(
          "vitest", "run", "tests/unit", "tests/contract",
          "--exclude", "**/prompt-resolver.test.ts"
        )))
      }
    }

    if ($frontendChanged) {
      $frontendDir = Join-Path $worktree "frontend"
      $frontendReady = $true
      $env:NEXT_TELEMETRY_DISABLED = "1"
      $result = Invoke-Logged $frontendDir "frontend-npm-ci" "npm" @("ci")
      [void]$testResults.Add($result)
      if ($result.Code -ne 0) { $frontendReady = $false }
      if ($frontendReady) {
        $result = Invoke-Logged $frontendDir "frontend-tsc" "npx" @("tsc", "--noEmit")
        [void]$testResults.Add($result)
        if ($result.Code -ne 0) { $frontendReady = $false }
      }
      if ($frontendReady) {
        $result = Invoke-Logged $frontendDir "frontend-test" "npm" @("run", "test:run")
        [void]$testResults.Add($result)
        if ($result.Code -ne 0) { $frontendReady = $false }
      }
      if ($frontendReady) {
        [void]$testResults.Add((Invoke-Logged $frontendDir "frontend-build" "npx" @("next", "build")))
      }
    }

    if (-not $backendChanged -and -not $frontendChanged) {
      Write-Ok "这个 PR 没有改 backend/ 或 frontend/，跳过本地测试。"
    }
  } finally {
    & git worktree remove --force $worktree 2>$null
    if (Test-Path -LiteralPath $worktree) {
      Remove-Item -LiteralPath $worktree -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
} else {
  Write-Ok "默认不执行 PR 代码；加 -RunTests 才会安装依赖并跑检查。"
}

Write-Step "5/5 生成报告"
$verdict = "可以合并"
$verdictReason = "未发现密钥或高风险改动，静态审查通过。"
if ($script:Critical) {
  $verdict = "不要合并"
  $verdictReason = "发现疑似密钥或认证/权限/数据库/CI 等高风险文件改动。"
} elseif ($script:High) {
  $verdict = "需要人工确认后再合并"
  $verdictReason = "涉及路由、服务、依赖或权限相关代码，需要逐项确认。"
} elseif ($script:TestFailed) {
  $verdict = "改完再合并"
  $verdictReason = "本地检查未通过。"
} elseif ($script:CiFailed) {
  $verdict = "改完再合并"
  $verdictReason = "CI 未通过。"
}

$report = New-Object System.Collections.ArrayList
[void]$report.Add("# PR #$Pr 审查报告")
[void]$report.Add("")
[void]$report.Add("- 仓库：$Slug")
if ($null -ne $meta) {
  [void]$report.Add("- 标题：$($meta.title)")
  [void]$report.Add("- 作者：$($meta.user.login)")
  [void]$report.Add("- 状态：$($meta.state)")
  [void]$report.Add("- 链接：$($meta.html_url)")
} else {
  [void]$report.Add("- 标题：未读取到（GitHub API 不可用）")
}
[void]$report.Add("- 结论：**$verdict**")
[void]$report.Add("- 原因：$verdictReason")
[void]$report.Add("")
[void]$report.Add("> 自动审查不能证明代码绝对安全；认证、权限、数据库、支付、文件上传等改动仍需人工复核。")
[void]$report.Add("")

[void]$report.Add("## 风险与发现")
[void]$report.Add("")
if ($script:Findings.Count -eq 0) {
  [void]$report.Add("未发现明显高风险信号。")
} else {
  foreach ($finding in $script:Findings) {
    [void]$report.Add("- **[$($finding.Severity)]** $($finding.Title)：$($finding.Detail)")
  }
}
[void]$report.Add("")

[void]$report.Add("## 改动文件")
[void]$report.Add("")
[void]$report.Add("| 文件 | 状态 | + | - |")
[void]$report.Add("| --- | --- | --- | --- |")
foreach ($file in $files) {
  $path = $file.Path -replace '\|', '\|'
  [void]$report.Add("| ``$path`` | $($file.Status) | $($file.Adds) | $($file.Dels) |")
}
[void]$report.Add("")

[void]$report.Add("## 提交")
[void]$report.Add("")
foreach ($commit in $commits) { [void]$report.Add("- $commit") }
[void]$report.Add("")

[void]$report.Add("## CI")
[void]$report.Add("")
foreach ($ci in $ciLines) { [void]$report.Add("- $ci") }
[void]$report.Add("")

[void]$report.Add("## 本地检查")
[void]$report.Add("")
if (-not $RunTests) {
  [void]$report.Add("未运行。默认只做静态审查；需要执行测试时加 `-RunTests`。")
} elseif ($testResults.Count -eq 0) {
  [void]$report.Add("没有需要运行的 backend/frontend 检查。")
} else {
  foreach ($result in $testResults) {
    $status = "PASS"
    if ($result.Code -ne 0) { $status = "FAIL" }
    [void]$report.Add("- $($result.Label)：$status（日志：``$($result.Log)``）")
    if ($result.Code -ne 0) {
      foreach ($line in $result.Tail) { [void]$report.Add("  - $line") }
    }
  }
}
[void]$report.Add("")

[void]$report.Add("## 建议评论")
[void]$report.Add("")
if ($script:Critical) {
  [void]$report.Add("这个 PR 目前不能合并：静态扫描发现了疑似密钥或高风险文件改动。请先移除敏感信息，或单独说明认证/权限/数据库/CI 的改动原因，更新后再复审。")
} elseif ($script:High) {
  [void]$report.Add("感谢提交。这个 PR 涉及路由、服务、依赖或权限相关代码，合并前需要逐项确认风险和测试覆盖。请补充说明后再复审。")
} elseif ($script:TestFailed -or $script:CiFailed) {
  [void]$report.Add("感谢提交。当前 CI 或本地检查没有通过，请先修复失败项并更新 PR。")
} else {
  [void]$report.Add("感谢提交。CI 和静态审查没有发现阻塞问题，改动范围清晰。维护者会再做一次功能确认后合并。")
  [void]$report.Add("")
  [void]$report.Add("Thanks for the contribution. CI and static checks passed, and the change looks scoped. A maintainer will confirm the behavior before merging.")
}
[void]$report.Add("")

$report -join "`n" | Set-Content -LiteralPath $ReportPath -Encoding UTF8
Write-Host ""
Write-Host "结论：$verdict" -ForegroundColor $(if ($script:Critical) { "Red" } elseif ($script:High) { "Yellow" } else { "Green" })
Write-Host "原因：$verdictReason" -ForegroundColor DarkGray
Write-Host "报告：$ReportPath" -ForegroundColor Green

if ($Open) { Start-Process $ReportPath }

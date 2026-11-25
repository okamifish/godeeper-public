# 在 Windows 上启动本地 Supabase（使用 50060/50061 端口）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/start-supabase-local.ps1

$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root "supabase/config.toml"
$local = Join-Path $root "supabase/config.local.toml"

if (-not (Test-Path $local)) {
  throw "缺少 supabase/config.local.toml。请复制 supabase/config.toml 并把 API 端口改为 50060、DB 端口改为 50061。"
}

$original = Get-Content $config -Raw
Copy-Item $local $config -Force
try {
  Push-Location $root
  npx supabase start
} finally {
  Pop-Location
  Set-Content -Path $config -Value $original -NoNewline -Encoding utf8
}

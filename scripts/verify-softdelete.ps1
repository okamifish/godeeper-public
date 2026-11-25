$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$base = 'http://localhost:3001'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$tempEmail = "e2e-softdelete-$stamp@godeeper.local"
$tempPassword = "Test-$stamp-Pass1"

$cred = Get-Content 'f:\project\godeeper\info\test-admin-credentials.enc.json' -Raw | ConvertFrom-Json
$pwdBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
  [Convert]::FromBase64String($cred.cipher), $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
$adminPassword = [System.Text.Encoding]::UTF8.GetString($pwdBytes)

function Call($method, $path, $body, $headers) {
  $params = @{
    Uri = "$base$path"
    Method = $method
    SkipHttpErrorCheck = $true
    TimeoutSec = 25
    Headers = $headers
  }
  if ($null -ne $body) {
    $params.Body = $body
    $params.ContentType = 'application/json'
  }
  return Invoke-WebRequest @params
}

$adminLogin = Call 'POST' '/auth/login' (ConvertTo-Json @{ email = $cred.email; password = $adminPassword }) $null
if ($adminLogin.StatusCode -ne 200) { Write-Output 'ADMIN_LOGIN_FAILED'; exit 1 }
$adminToken = ($adminLogin.Content | ConvertFrom-Json).token
$adminHeaders = @{ Authorization = "Bearer $adminToken" }

$register = Call 'POST' '/auth/register' (ConvertTo-Json @{ email = $tempEmail; password = $tempPassword; displayName = 'e2e-softdelete' }) $null
Write-Output "register=$($register.StatusCode)"
if ($register.StatusCode -ne 201) { Write-Output $register.Content; exit 1 }
$tempId = ($register.Content | ConvertFrom-Json).id

$tempLogin = Call 'POST' '/auth/login' (ConvertTo-Json @{ email = $tempEmail; password = $tempPassword }) $null
Write-Output "login_before=$($tempLogin.StatusCode)"
$tempToken = ($tempLogin.Content | ConvertFrom-Json).token
$tempHeaders = @{ Authorization = "Bearer $tempToken" }

$disable = Call 'DELETE' "/admin/users/$tempId" $null $adminHeaders
Write-Output "disable=$($disable.StatusCode)"

$loginDisabled = Call 'POST' '/auth/login' (ConvertTo-Json @{ email = $tempEmail; password = $tempPassword }) $null
Write-Output "login_disabled=$($loginDisabled.StatusCode)"
$meDisabled = Call 'GET' '/auth/me' $null $tempHeaders
Write-Output "me_disabled=$($meDisabled.StatusCode)"

$listActive = Call 'GET' '/admin/users' $null $adminHeaders
$activeHas = ($listActive.Content | ConvertFrom-Json | Where-Object { $_.id -eq $tempId }).Count
Write-Output "list_active_contains=$activeHas"
$listDeleted = Call 'GET' '/admin/users?deleted=1' $null $adminHeaders
$deletedHas = ($listDeleted.Content | ConvertFrom-Json | Where-Object { $_.id -eq $tempId }).Count
Write-Output "list_trash_contains=$deletedHas"

$restore = Call 'POST' "/admin/users/$tempId/restore" $null $adminHeaders
Write-Output "restore=$($restore.StatusCode)"
$loginRestored = Call 'POST' '/auth/login' (ConvertTo-Json @{ email = $tempEmail; password = $tempPassword }) $null
Write-Output "login_restored=$($loginRestored.StatusCode)"

$disable2 = Call 'DELETE' "/admin/users/$tempId" $null $adminHeaders
Write-Output "disable_again=$($disable2.StatusCode)"

$backdate = & node 'f:\project\godeeper\backend\scripts\set-user-deleted-at.mjs' $tempEmail 40 2>&1
Write-Output "backdate=$backdate"

$purge = Call 'POST' '/admin/maintenance/purge-deleted' $null $adminHeaders
$purgeJson = $purge.Content | ConvertFrom-Json
Write-Output "purge=$($purge.StatusCode) purged=$($purgeJson.purged) failed=$($purgeJson.failed.Count)"

$loginPurged = Call 'POST' '/auth/login' (ConvertTo-Json @{ email = $tempEmail; password = $tempPassword }) $null
Write-Output "login_purged=$($loginPurged.StatusCode)"

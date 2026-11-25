$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$base = 'http://localhost:3001'
$cred = Get-Content 'f:\project\godeeper\info\test-admin-credentials.enc.json' -Raw | ConvertFrom-Json
$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
try {
  $pwdBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
    [Convert]::FromBase64String($cred.cipher), $null, $scope)
  $password = [System.Text.Encoding]::UTF8.GetString($pwdBytes)
} catch {
  Write-Output 'DECRYPT_FAILED'
  exit 1
}

function Call($method, $path, $body, $headers) {
  $params = @{
    Uri = "$base$path"
    Method = $method
    SkipHttpErrorCheck = $true
    TimeoutSec = 20
    Headers = $headers
  }
  if ($null -ne $body) {
    $params.Body = $body
    $params.ContentType = 'application/json'
  }
  return Invoke-WebRequest @params
}

$login = Call 'POST' '/auth/login' (ConvertTo-Json @{ email = $cred.email; password = $password }) $null
Write-Output "login=$($login.StatusCode)"
if ($login.StatusCode -ne 200) { Write-Output 'LOGIN_FAILED'; exit 1 }
$token = ($login.Content | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }

$me = Call 'GET' '/auth/me' $null $headers
$meJson = $me.Content | ConvertFrom-Json
$keys = ($meJson.PSObject.Properties.Name) -join ','
Write-Output "me_status=$($me.StatusCode)"
Write-Output "me_has_apiKeyEnc=$($keys -match 'apiKeyEnc')"
Write-Output "me_keys=$keys"
Write-Output "me_hasApiKey=$($meJson.hasApiKey)"
Write-Output "me_modelName_empty=$([string]::IsNullOrEmpty($meJson.modelName))"
$userId = $meJson.id
Write-Output "me_membership=$($meJson.membership)"

if ($meJson.membership -ne 'pro' -and $meJson.membership -ne 'team') {
  $promote = Call 'PUT' "/admin/users/$userId/membership" '{"membership":"pro"}' $headers
  Write-Output "test_account_promote=$($promote.StatusCode)"
  $me2 = Call 'GET' '/auth/me' $null $headers
  Write-Output "me_membership_after=$(($me2.Content | ConvertFrom-Json).membership)"
}

$c1 = Call 'POST' '/canvas' '{"title":"verify-ownership-A"}' $headers
$c1id = ($c1.Content | ConvertFrom-Json).id
Write-Output "canvas_create=$($c1.StatusCode)"
$c2 = Call 'POST' '/canvas' '{"title":"verify-ownership-B"}' $headers
$c2id = ($c2.Content | ConvertFrom-Json).id
Write-Output "canvas_create_2=$($c2.StatusCode)"

$sync1 = Call 'POST' '/node/sync' (ConvertTo-Json @{ canvasId = $c1id; upserts = @(@{ id = 'verify-node-1'; kind = 'text'; title = 't'; body = 'b' }) }) $headers
Write-Output "node_sync_own=$($sync1.StatusCode)"
$sync2 = Call 'POST' '/node/sync' (ConvertTo-Json @{ canvasId = $c2id; upserts = @(@{ id = 'verify-node-1'; kind = 'text'; title = 't2'; body = 'b2' }) }) $headers
Write-Output "node_sync_cross_canvas=$($sync2.StatusCode)"

$randomCanvas = '00000000-0000-4000-8000-000000000000'
$commentOther = Call 'GET' "/comment/$randomCanvas" $null $headers
Write-Output "comment_foreign=$($commentOther.StatusCode)"
$commentMissingNode = Call 'POST' "/comment/$c1id" (ConvertTo-Json @{ content = 'x'; nodeId = 'nope-node' }) $headers
Write-Output "comment_missing_node=$($commentMissingNode.StatusCode)"
$kb = Call 'GET' '/knowledge/backlinks/verify-node-1' $null $headers
Write-Output "knowledge_backlinks_own=$($kb.StatusCode)"

$snapNull = Call 'PUT' "/canvas/$c1id/snapshot" 'null' $headers
Write-Output "snapshot_null=$($snapNull.StatusCode)"
$snapArray = Call 'PUT' "/canvas/$c1id/snapshot" '[]' $headers
Write-Output "snapshot_array=$($snapArray.StatusCode)"
$snapBad = Call 'PUT' "/canvas/$c1id/snapshot" '{"nodes":"not-array"}' $headers
Write-Output "snapshot_bad_nodes=$($snapBad.StatusCode)"
$snapOk = Call 'PUT' "/canvas/$c1id/snapshot" '{"nodes":[],"edges":[]}' $headers
Write-Output "snapshot_ok=$($snapOk.StatusCode)"

$badCanvas = Call 'GET' '/canvas/not-a-uuid' $null $headers
Write-Output "canvas_bad_uuid=$($badCanvas.StatusCode)"

$share = Call 'POST' "/share/$c1id" '{"expiresInHours":24}' $headers
Write-Output "share_create=$($share.StatusCode)"
$shareBad = Call 'POST' '/share/not-a-uuid' '{}' $headers
Write-Output "share_bad_uuid=$($shareBad.StatusCode)"

$adminUser = Call 'GET' "/admin/users/$userId" $null $headers
Write-Output "admin_user_detail=$($adminUser.StatusCode)"
$riskGet = Call 'GET' '/admin/risk-config' $null $headers
Write-Output "risk_config_get=$($riskGet.StatusCode)"
$riskPut = Call 'PUT' '/admin/risk-config' '{"burstPerMinute":10,"failureRateThreshold":0.5,"failureMinSamples":5,"dailyWatchLimitFree":50}' $headers
Write-Output "risk_config_put=$($riskPut.StatusCode)"
$plans = Call 'GET' '/admin/plans' $null $headers
$planRows = $plans.Content | ConvertFrom-Json
Write-Output "plans_status=$($plans.StatusCode)"
Write-Output "plans_count=$($planRows.Count)"
Write-Output "plans_unlimited=$(($planRows | Where-Object { $_.isUnlimited }).Count)"

$del1 = Call 'DELETE' "/canvas/$c1id" $null $headers
$del2 = Call 'DELETE' "/canvas/$c2id" $null $headers
Write-Output "cleanup=$($del1.StatusCode)/$($del2.StatusCode)"

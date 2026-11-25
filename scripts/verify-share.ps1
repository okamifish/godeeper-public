$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$base = 'http://localhost:3001'
$cred = Get-Content 'f:\project\godeeper\info\test-admin-credentials.enc.json' -Raw | ConvertFrom-Json
$pwdBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
  [Convert]::FromBase64String($cred.cipher), $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
$password = [System.Text.Encoding]::UTF8.GetString($pwdBytes)

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
if ($login.StatusCode -ne 200) { Write-Output 'LOGIN_FAILED'; exit 1 }
$token = ($login.Content | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }

$canvas = Call 'POST' '/canvas' '{"title":"verify-share"}' $headers
$canvasId = ($canvas.Content | ConvertFrom-Json).id
Write-Output "canvas=$($canvas.StatusCode)"

$snapshot = Call 'PUT' "/canvas/$canvasId/snapshot" (@{ nodes = @(@{ id = 'share-node-1'; kind = 'text'; title = '分享测试'; body = '内容'; x = 0; y = 0; metaLeft = '文本' }); edges = @() } | ConvertTo-Json -Depth 5) $headers
Write-Output "snapshot=$($snapshot.StatusCode)"
$sync = Call 'POST' '/node/sync' (@{ canvasId = $canvasId; upserts = @(@{ id = 'share-node-1'; kind = 'text'; title = '分享测试'; body = '内容' }) } | ConvertTo-Json -Depth 5) $headers
Write-Output "sync=$($sync.StatusCode)"

# 1) 不允许留言的分享
$share1 = Call 'POST' "/share/$canvasId" '{"allowComment":false}' $headers
$share1Json = $share1.Content | ConvertFrom-Json
$token1 = $share1Json.shareToken
Write-Output "share_no_comment=$($share1.StatusCode) allowComment=$($share1Json.allowComment) tokenLen=$($token1.Length)"

$viewAuth = Call 'GET' "/share/view/$token1" $null $headers
$viewJson = $viewAuth.Content | ConvertFrom-Json
Write-Output "view_auth=$($viewAuth.StatusCode) allowComment=$($viewJson.allowComment) nodeCount=$($viewJson.canvasSnapshot.nodes.Count)"
$viewAnon = Call 'GET' "/share/view/$token1" $null $null
Write-Output "view_anon=$($viewAnon.StatusCode)"

$comments1 = Call 'GET' "/share/view/$token1/comments" $null $headers
$comments1Json = $comments1.Content | ConvertFrom-Json
Write-Output "comments_no_comment=$($comments1.StatusCode) allowComment=$($comments1Json.allowComment) count=$($comments1Json.comments.Count)"
$postDenied = Call 'POST' "/share/view/$token1/comments" '{"content":"should fail"}' $headers
Write-Output "comment_post_denied=$($postDenied.StatusCode)"

$list = Call 'GET' "/share/$canvasId" $null $headers
$listJson = $list.Content | ConvertFrom-Json
Write-Output "list_shares=$($list.StatusCode) count=$($listJson.Count) allowComment=$($listJson[0].allowComment)"

$revoke = Call 'DELETE' "/share/$($share1Json.id)" $null $headers
Write-Output "revoke=$($revoke.StatusCode)"
$viewRevoked = Call 'GET' "/share/view/$token1" $null $headers
Write-Output "view_revoked=$($viewRevoked.StatusCode)"

# 2) 允许留言的分享
$share2 = Call 'POST' "/share/$canvasId" '{"allowComment":true}' $headers
$share2Json = $share2.Content | ConvertFrom-Json
$token2 = $share2Json.shareToken
Write-Output "share_with_comment=$($share2.StatusCode) allowComment=$($share2Json.allowComment)"

$posted = Call 'POST' "/share/view/$token2/comments" '{"content":"留言测试","nodeId":"share-node-1"}' $headers
Write-Output "comment_post_allowed=$($posted.StatusCode)"
$postedJson = $posted.Content | ConvertFrom-Json
$comments2 = Call 'GET' "/share/view/$token2/comments" $null $headers
$comments2Json = $comments2.Content | ConvertFrom-Json
Write-Output "comments_after=$($comments2.StatusCode) count=$($comments2Json.comments.Count) allowComment=$($comments2Json.allowComment)"

$delComment = Call 'DELETE' "/comment/$($postedJson.id)" $null $headers
Write-Output "comment_delete=$($delComment.StatusCode)"

$cleanup = Call 'DELETE' "/canvas/$canvasId" $null $headers
Write-Output "cleanup=$($cleanup.StatusCode)"

param(
  [string]$BaseUrl = $(if ($env:BACKEND_URL) { $env:BACKEND_URL } else { 'http://localhost:5000' }),
  [string]$AdminEmail = $(if ($env:MARKETPLACE_ADMIN_EMAIL) { $env:MARKETPLACE_ADMIN_EMAIL } else { 'admin@example.com' }),
  [string]$AdminPassword = $(if ($env:MARKETPLACE_ADMIN_PASSWORD) { $env:MARKETPLACE_ADMIN_PASSWORD } else { 'AdminPass123!' })
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) {
  Write-Host "[smoke-marketplace] $msg"
}

function Invoke-Json($method, $uri, $body = $null, $headers = $null, $timeoutSec = 20) {
  $params = @{ Method = $method; Uri = $uri; TimeoutSec = $timeoutSec }
  if ($headers) { $params.Headers = $headers }
  if ($null -ne $body) {
    $params.ContentType = 'application/json'
    $params.Body = ($body | ConvertTo-Json -Depth 20)
  }
  return Invoke-RestMethod @params
}

function Get-MeProfile($token) {
  return Invoke-Json 'GET' "$BaseUrl/api/profile/me" $null @{ Authorization = "Bearer $token" }
}

function Get-ActivityMe($token, $types = $null, [int]$limit = 200) {
  $url = "$BaseUrl/api/activity/me?limit=$limit"
  if ($types -and $types.Count -gt 0) {
    $typeParam = [System.String]::Join(',', $types)
    $url += "&type=$([System.Uri]::EscapeDataString($typeParam))"
  }
  return Invoke-Json 'GET' $url $null @{ Authorization = "Bearer $token" }
}

function Get-NotificationsMe($token, [int]$limit = 200) {
  $url = "$BaseUrl/api/notifications/me?limit=$limit"
  return Invoke-Json 'GET' $url $null @{ Authorization = "Bearer $token" }
}

function Get-JwtPayload($token) {
  $parts = $token.Split('.')
  if ($parts.Length -lt 2) { return $null }
  $b64 = $parts[1].Replace('-', '+').Replace('_', '/')
  switch ($b64.Length % 4) {
    2 { $b64 += '==' }
    3 { $b64 += '=' }
    0 { }
    default { }
  }
  try {
    $bytes = [System.Convert]::FromBase64String($b64)
    $json = [System.Text.Encoding]::UTF8.GetString($bytes)
    return ($json | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Assert-HasActivityForJob($token, [string]$type, [string]$jobId) {
  $feed = Get-ActivityMe $token @($type) 200
  $hits = @($feed.items | Where-Object { $_.type -eq $type -and $_.metadata.jobId -eq $jobId })
  if ($hits.Count -lt 1) {
    throw "Expected activity type '$type' for jobId=$jobId but none found"
  }
}

function Assert-HasNotificationForJob($token, [string]$type, [string]$jobId) {
  $feed = Get-NotificationsMe $token 200
  $hits = @($feed.items | Where-Object { $_.activity -and $_.activity.type -eq $type -and $_.activity.metadata.jobId -eq $jobId })
  if ($hits.Count -lt 1) {
    throw "Expected notification activity type '$type' for jobId=$jobId but none found"
  }
}

function Assert-HasActivityForApplication($token, [string]$type, [string]$applicationId) {
  $feed = Get-ActivityMe $token @($type) 200
  $hits = @($feed.items | Where-Object { $_.type -eq $type -and $_.metadata.applicationId -eq $applicationId })
  if ($hits.Count -lt 1) {
    throw "Expected activity type '$type' for applicationId=$applicationId but none found"
  }
}

function Assert-HasNotificationForApplication($token, [string]$type, [string]$applicationId) {
  $feed = Get-NotificationsMe $token 200
  $hits = @($feed.items | Where-Object { $_.activity -and $_.activity.type -eq $type -and $_.activity.metadata.applicationId -eq $applicationId })
  if ($hits.Count -lt 1) {
    throw "Expected notification activity type '$type' for applicationId=$applicationId but none found"
  }
}

function Get-AuditRows($backendDir, $nodeParams) {
  Push-Location $backendDir
  try {
    $json = node .\scripts\list-audit.mjs $nodeParams
    return ($json | ConvertFrom-Json)
  } finally {
    Pop-Location
  }
}

function Assert-AuditHas($backendDir, $nodeParams, $message) {
  $res = Get-AuditRows $backendDir $nodeParams
  if (-not $res -or -not $res.items -or $res.items.Count -lt 1) {
    throw $message
  }
}

function Read-ErrorBody($err) {
  try {
    $sr = New-Object System.IO.StreamReader($err.Exception.Response.GetResponseStream())
    return $sr.ReadToEnd()
  } catch {
    return $null
  }
}

function Assert-HttpStatus($scriptBlock, [int]$expectedStatus) {
  try {
    & $scriptBlock | Out-Null
    throw "Expected HTTP $expectedStatus but request succeeded"
  } catch {
    $actual = $null
    try { $actual = $_.Exception.Response.StatusCode.Value__ } catch {}
    if ($actual -ne $expectedStatus) {
      $body = Read-ErrorBody $_
      throw "Expected HTTP $expectedStatus but got ${actual}. Body: ${body}"
    }
  }
}

function Get-RetryAfterSeconds($err) {
  try {
    $h = $err.Exception.Response.Headers['Retry-After']
    if (-not $h) { return 3 }
    $n = [int]$h
    if ($n -lt 1) { return 1 }
    return $n
  } catch {
    return 3
  }
}

function Invoke-WithRetry429($label, $scriptBlock, [int]$maxAttempts = 10) {
  for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
      return & $scriptBlock
    } catch {
      $code = $null
      try { $code = $_.Exception.Response.StatusCode.Value__ } catch {}
      if ($code -eq 429 -and $i -lt $maxAttempts) {
        $sleep = Get-RetryAfterSeconds $_
        Write-Step "$label hit 429; sleeping ${sleep}s (attempt $i/$maxAttempts)"
        Start-Sleep -Seconds $sleep
        continue
      }
      throw
    }
  }
  throw "$label failed after $maxAttempts attempts"
}

function New-RandomEmail([string]$prefix) {
  $r = Get-Random
  return "${prefix}+${r}@example.com"
}

function Wait-BackendReady([int]$maxSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($maxSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $ready = Invoke-Json 'GET' "$BaseUrl/api/ready"
      if ($ready.status -eq 'ready') { return }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  throw "Backend not ready at $BaseUrl/api/ready"
}

Write-Step "BaseUrl=$BaseUrl"
Wait-BackendReady -maxSeconds 45

# Bootstrap admin in SQLite so /api/auth/login/admin can succeed.
Write-Step 'Bootstrapping admin user (SQLite)'
$backendDir = Join-Path $PSScriptRoot '..\backend'
Push-Location $backendDir
try {
  node .\scripts\bootstrap-admin.mjs --email $AdminEmail --password $AdminPassword --name 'Marketplace Admin' | Out-Null
} finally {
  Pop-Location
}

Write-Step 'Admin login'
$adminLogin = Invoke-WithRetry429 'Admin login' { Invoke-Json 'POST' "$BaseUrl/api/auth/login/admin" @{ email = $AdminEmail; password = $AdminPassword } }
if (-not $adminLogin.token) { throw 'Admin login did not return token' }
$adminToken = $adminLogin.token

$adminJwt = Get-JwtPayload $adminToken
$tenantId = $null
if ($adminJwt) {
  if ($adminJwt.tenantId) { $tenantId = [string]$adminJwt.tenantId }
  elseif ($adminJwt.tenant_id) { $tenantId = [string]$adminJwt.tenant_id }
}

$adminProfile = Get-MeProfile $adminToken
$adminUserId = $adminProfile.profile.userId

Write-Step 'Create Student A'
$studentAEmail = New-RandomEmail 'studentA'
$studentAPass = 'StudentPass123!'
Invoke-WithRetry429 'Student A signup' { Invoke-Json 'POST' "$BaseUrl/api/auth/signup" @{ name = 'Student A'; email = $studentAEmail; password = $studentAPass } | Out-Null }
$studentAToken = (Invoke-WithRetry429 'Student A login' { Invoke-Json 'POST' "$BaseUrl/api/auth/login" @{ email = $studentAEmail; password = $studentAPass } }).token
$studentAProfile = Get-MeProfile $studentAToken
$studentAUserId = $studentAProfile.profile.userId

Write-Step 'Create Student B'
$studentBEmail = New-RandomEmail 'studentB'
$studentBPass = 'StudentPass123!'
Invoke-WithRetry429 'Student B signup' { Invoke-Json 'POST' "$BaseUrl/api/auth/signup" @{ name = 'Student B'; email = $studentBEmail; password = $studentBPass } | Out-Null }
$studentBToken = (Invoke-WithRetry429 'Student B login' { Invoke-Json 'POST' "$BaseUrl/api/auth/login" @{ email = $studentBEmail; password = $studentBPass } }).token
$studentBProfile = Get-MeProfile $studentBToken
$studentBUserId = $studentBProfile.profile.userId

Write-Step 'Admin creates job'
$job = Invoke-Json 'POST' "$BaseUrl/api/admin/jobs" @{ 
  title = 'Marketplace Smoke Job'
  company = 'Acme Corp'
  location = 'Remote'
  job_type = 'INTERN'
  experience_min = 0
  experience_max = 0
  skills = @('Node.js')
  is_active = $true
} @{ Authorization = "Bearer $adminToken" }

$jobId = $job.id
if (-not $jobId) { throw 'Job creation did not return id' }

Write-Step 'Assert side-effects: admin JOB_CREATE audit/activity/notification'
Assert-AuditHas $backendDir @('--tenantId',"$tenantId",'--action','JOB_CREATE','--targetType','job','--targetId',"$jobId",'--limit','20') "Expected audit log JOB_CREATE for jobId=$jobId"
Assert-HasActivityForJob $adminToken 'JOB_LIFECYCLE_CHANGED' $jobId
Assert-HasNotificationForJob $adminToken 'JOB_LIFECYCLE_CHANGED' $jobId

Write-Step "Set deadline in future (jobId=$jobId)"
$future = (Get-Date).ToUniversalTime().AddHours(2).ToString('o')
Invoke-Json 'PATCH' "$BaseUrl/api/admin/jobs/$jobId" @{ deadlineAt = $future } @{ Authorization = "Bearer $adminToken" } | Out-Null

Write-Step 'Assert side-effects: admin JOB_DEADLINE_CHANGED activity/notification + JOB_UPDATE audit'
Assert-AuditHas $backendDir @('--tenantId',"$tenantId",'--action','JOB_UPDATE','--targetType','job','--targetId',"$jobId",'--limit','50') "Expected audit log JOB_UPDATE for jobId=$jobId"
Assert-HasActivityForJob $adminToken 'JOB_DEADLINE_CHANGED' $jobId
Assert-HasNotificationForJob $adminToken 'JOB_DEADLINE_CHANGED' $jobId

Write-Step 'Student A applies (should succeed)'
$appA = Invoke-Json 'POST' "$BaseUrl/api/applications" @{ jobId = $jobId; resumeVersion = 'latest' } @{ Authorization = "Bearer $studentAToken" }
if ($appA.status -ne 'APPLIED') { throw "Expected APPLIED but got $($appA.status)" }

Write-Step 'Assert side-effects: student JOB_APPLY audit + JOB_APPLIED activity/notification'
Assert-AuditHas $backendDir @('--tenantId',"$tenantId",'--action','JOB_APPLY','--targetType','job','--targetId',"$jobId",'--actorUserId',"$studentAUserId",'--limit','50') "Expected audit log JOB_APPLY for student=$studentAUserId jobId=$jobId"
Assert-HasActivityForJob $studentAToken 'JOB_APPLIED' $jobId
Assert-HasNotificationForJob $studentAToken 'JOB_APPLIED' $jobId

Write-Step 'Student A duplicate apply (should 409)'
Assert-HttpStatus { Invoke-Json 'POST' "$BaseUrl/api/applications" @{ jobId = $jobId; resumeVersion = 'latest' } @{ Authorization = "Bearer $studentAToken" } } 409

Write-Step 'Admin closes job'
Invoke-Json 'PATCH' "$BaseUrl/api/admin/jobs/$jobId" @{ status = 'CLOSED' } @{ Authorization = "Bearer $adminToken" } | Out-Null

Write-Step 'Student B apply when CLOSED (should 409)'
Assert-HttpStatus { Invoke-Json 'POST' "$BaseUrl/api/applications" @{ jobId = $jobId; resumeVersion = 'latest' } @{ Authorization = "Bearer $studentBToken" } } 409

Write-Step 'Admin re-opens and sets deadline in the past'
Invoke-Json 'PATCH' "$BaseUrl/api/admin/jobs/$jobId" @{ status = 'OPEN' } @{ Authorization = "Bearer $adminToken" } | Out-Null
$past = (Get-Date).ToUniversalTime().AddHours(-1).ToString('o')
Invoke-Json 'PATCH' "$BaseUrl/api/admin/jobs/$jobId" @{ deadlineAt = $past } @{ Authorization = "Bearer $adminToken" } | Out-Null

Write-Step 'Student B apply after deadline (should 409)'
Assert-HttpStatus { Invoke-Json 'POST' "$BaseUrl/api/applications" @{ jobId = $jobId; resumeVersion = 'latest' } @{ Authorization = "Bearer $studentBToken" } } 409

Write-Step 'Student A lists applications to trigger auto-reject'
$appsA = Invoke-Json 'GET' "$BaseUrl/api/applications" $null @{ Authorization = "Bearer $studentAToken" }
$appForJob = $appsA.items | Where-Object { $_.jobId -eq $jobId } | Select-Object -First 1
if (-not $appForJob) { throw 'Expected to find Student A application for job in list' }
if ($appForJob.status -ne 'REJECTED') { throw "Expected auto-rejected status REJECTED but got $($appForJob.status)" }

$applicationId = $appForJob.id
if (-not $applicationId) { throw 'Expected application id in list payload' }

Write-Step 'Assert side-effects: auto-reject audit + APPLICATION_STATUS_CHANGED activity/notification'
Assert-AuditHas $backendDir @('--tenantId',"$tenantId",'--action','APPLICATION_AUTO_REJECT_DEADLINE','--targetType','application','--targetId',"$applicationId",'--limit','50') "Expected audit log APPLICATION_AUTO_REJECT_DEADLINE for applicationId=$applicationId"
Assert-HasActivityForApplication $studentAToken 'APPLICATION_STATUS_CHANGED' $applicationId
Assert-HasNotificationForApplication $studentAToken 'APPLICATION_STATUS_CHANGED' $applicationId

Write-Host ''
Write-Host 'OK: marketplace smoke test passed'
Write-Host ( @{ jobId = $jobId; applicationId = $applicationId; adminUserId = $adminUserId; studentAUserId = $studentAUserId; studentBUserId = $studentBUserId; studentA = $studentAEmail; studentB = $studentBEmail } | ConvertTo-Json )

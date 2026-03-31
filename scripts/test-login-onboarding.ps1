#!/usr/bin/env pwsh
<#
.SYNOPSIS
End-to-end test for login -> onboarding -> app workflow
#>

param([string]$Backend = "http://localhost:5000")

$ErrorActionPreference = "Stop"
$testEmail = "e2e-test-$(Get-Date -Format 'yyyyMMddHHmmss')-$((New-Guid).ToString().Substring(0,8))@test.local"
$testPassword = "TestPassword123!"

function Test-Endpoint {
  param([string]$Name, [string]$Url, [string]$Method = "GET", [object]$Body, [string]$Token)
  
  Write-Host "`n→ Testing: $Name" -ForegroundColor Cyan
  try {
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    
    $params = @{
      Uri = $Url
      Method = $Method
      Headers = $headers
      ErrorAction = "Stop"
    }
    if ($Body) { $params["Body"] = ($Body | ConvertTo-Json -Depth 10) }
    
    $response = Invoke-RestMethod @params
    Write-Host "  ✓ Success" -ForegroundColor Green
    return $response
  } catch {
    Write-Host "  ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    throw
  }
}

try {
  Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Yellow
  Write-Host "║  Authentication Flow E2E Test         ║" -ForegroundColor Yellow
  Write-Host "║  Login → Onboarding → App             ║" -ForegroundColor Yellow
  Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Yellow
  
  Write-Host "`nTest User: $testEmail" -ForegroundColor Gray
  
  # 1. Health Check
  Write-Host "`n[1/6] Health Check" -ForegroundColor Yellow
  $health = Test-Endpoint "Health" "$Backend/api/health"
  
  # 2. Signup
  Write-Host "`n[2/6] Signup" -ForegroundColor Yellow
  $signup = Test-Endpoint "Signup" "$Backend/api/auth/signup" "POST" @{
    name = "E2E Test User"
    email = $testEmail
    password = $testPassword
  }
  $token = $signup.data.token
  $userId = $signup.data.user.id
  
  if (-not $signup.data.profile) {
    throw "Signup response missing profile"
  }
  Write-Host "  Profile onboarded before: $($signup.data.profile.onboarded)" -ForegroundColor Gray
  if ($signup.data.profile.onboarded -ne $false) {
    throw "Profile should start with onboarded = false"
  }
  
  # 3. Verify Profile (before onboarding)
  Write-Host "`n[3/6] Verify Profile (before onboarding)" -ForegroundColor Yellow
  $profile1 = Test-Endpoint "Get Profile" "$Backend/api/profile/me" "GET" $null $token
  if ($profile1.data.profile.onboarded -ne $false) {
    throw "Profile onboarded should be false, got: $($profile1.data.profile.onboarded)"
  }
  Write-Host "  Onboarded: $($profile1.data.profile.onboarded) ✓" -ForegroundColor Gray
  
  # 4. Update Profile (Onboarding)
  Write-Host "`n[4/6] Complete Onboarding" -ForegroundColor Yellow
  $onboard = Test-Endpoint "Update Profile" "$Backend/api/profile/me" "POST" @{
    college = "Test University"
    branch = "Computer Science"
    graduationYear = "2026"
    careerGoal = "Software Engineer"
    onboarded = $true
  } $token
  
  if ($onboard.data.profile.onboarded -ne $true) {
    throw "Profile onboarded should be true after update, got: $($onboard.data.profile.onboarded)"
  }
  Write-Host "  Onboarded: $($onboard.data.profile.onboarded) ✓" -ForegroundColor Gray
  
  # 5. Verify Profile (after onboarding)
  Write-Host "`n[5/6] Verify Profile Persistence" -ForegroundColor Yellow
  $profile2 = Test-Endpoint "Get Profile (after onboarding)" "$Backend/api/profile/me" "GET" $null $token
  if ($profile2.data.profile.onboarded -ne $true) {
    throw "Profile onboarded not persisted: $($profile2.data.profile.onboarded)"
  }
  Write-Host "  Onboarded: $($profile2.data.profile.onboarded) ✓ PERSISTED" -ForegroundColor Green
  
  # 6. Test Login (verify persistence)
  Write-Host "`n[6/6] Login Verification" -ForegroundColor Yellow
  $login = Test-Endpoint "Login" "$Backend/api/auth/login" "POST" @{
    email = $testEmail
    password = $testPassword
  }
  
  if ($login.data.profile.onboarded -ne $true) {
    throw "Login response shows onboarded = false, persistence failed!"
  }
  Write-Host "  Onboarded on login: $($login.data.profile.onboarded) ✓" -ForegroundColor Green
  
  Write-Host "`n╔════════════════════════════════════════╗" -ForegroundColor Green
  Write-Host "║  ✓ ALL TESTS PASSED!                  ║" -ForegroundColor Green
  Write-Host "║  Login→Onboarding→App flow is FIXED   ║" -ForegroundColor Green
  Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Green
  
  Write-Host "`nExpected behavior verified:" -ForegroundColor Green
  Write-Host "  • Signup creates profile with onboarded = false" -ForegroundColor Green
  Write-Host "  • Onboarding updates profile with onboarded = true" -ForegroundColor Green
  Write-Host "  • Database persists onboarded = true" -ForegroundColor Green
  Write-Host "  • Login returns persisted onboarded = true" -ForegroundColor Green
  Write-Host "  • Frontend should NOT redirect to login after onboarding" -ForegroundColor Green

} catch {
  Write-Host "`n✗ TEST FAILED" -ForegroundColor Red
  Write-Host "Error: $_" -ForegroundColor Red
  exit 1
}

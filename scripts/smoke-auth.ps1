$ErrorActionPreference = 'Stop'

$email = "test+$([int](Get-Random))@example.com"
$signupBody = @{ name = 'Test User'; email = $email; password = 'Password123!' } | ConvertTo-Json

$resp = Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/signup -Body $signupBody -ContentType 'application/json'
Write-Host "Signed up:" $resp.user.email

$token = $resp.token
if (-not $token) { throw 'Signup did not return a token.' }

$headers = @{ Authorization = "Bearer $token" }

$me = Invoke-RestMethod -Method Get -Uri http://localhost:5000/api/auth/me -Headers $headers
Write-Host "Me:" $me.user.email

$profile = Invoke-RestMethod -Method Get -Uri http://localhost:5000/api/profile/me -Headers $headers
Write-Host "Onboarded:" $profile.profile.onboarded

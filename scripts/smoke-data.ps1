$ErrorActionPreference = 'Stop'

$email = "test+$([int](Get-Random))@example.com"
$signupBody = @{ name = 'Test User'; email = $email; password = 'Password123!' } | ConvertTo-Json
$resp = Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/signup -Body $signupBody -ContentType 'application/json'

$token = $resp.token
$userId = $resp.user.id
if (-not $token) { throw 'Signup did not return a token.' }
if (-not $userId) { throw 'Signup did not return a user id.' }

$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }

function Assert-Forbidden($scriptBlock, $label) {
	try {
		& $scriptBlock | Out-Null
		throw "Expected 403 Forbidden: $label"
	} catch {
		$resp = $_.Exception.Response
		if (-not $resp) { throw }
		$code = [int]$resp.StatusCode
		if ($code -ne 403) {
			throw "Expected 403 Forbidden for $label but got $code"
		}
		Write-Host "Forbidden as expected:" $label
	}
}

# Academics (student safe)
Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/academics/$userId/career-goal" -Headers $headers -Body (@{ goal = 'SDE Intern' } | ConvertTo-Json) | Out-Null
$academics = Invoke-RestMethod -Method Get -Uri "http://localhost:5000/api/academics/$userId/academics" -Headers $headers
Write-Host "Academics read OK. Subjects:" $academics.subjects.Count

# Academics (operator-only writes should be forbidden for student)
Assert-Forbidden { Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/academics/$userId/attendance" -Headers $headers -Body (@{ attendance = 75 } | ConvertTo-Json) } "academics attendance write"
Assert-Forbidden { Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/academics/$userId/academics" -Headers $headers -Body (@{ subject = 'Math'; score = 92; grade = 'A' } | ConvertTo-Json) } "academics subject write"

# Tasks: assignments (student can read; operator authors tasks)
$assignments = Invoke-RestMethod -Method Get -Uri "http://localhost:5000/api/tasks/$userId/assignments" -Headers $headers
Write-Host "Assignments read OK. Items:" $assignments.items.Count
Assert-Forbidden { Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/tasks/$userId/assignments" -Headers $headers -Body (@{ title = 'HW1'; dueDate = '2026-01-31'; status = 'pending' } | ConvertTo-Json) } "assignment create"

# Resume
$resumeBody = @{ summary = 'I build reliable software.'; education = @(@{ school='ABC'; degree='B.Tech'; year='2027' }); skills = @('JavaScript','React'); projects=@(); experience=@() } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/resume/$userId" -Headers $headers -Body $resumeBody | Out-Null
$resume = Invoke-RestMethod -Method Get -Uri "http://localhost:5000/api/resume/$userId" -Headers $headers
Write-Host "Resume skills:" $resume.skills.Count

$analysis = Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/resume/$userId/analyze" -Headers @{ Authorization = "Bearer $token" } 
Write-Host "ATS score:" $analysis.atsScore

Write-Host 'Smoke data APIs: OK'

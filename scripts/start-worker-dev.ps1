$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..\backend')
$env:NODE_ENV = 'development'

if ($null -eq $env:PG_DISABLED) {
	$env:PG_DISABLED = '1'
}

# Requires Redis env vars (e.g. REDIS_URL=redis://localhost:6379)
npm run worker:dev

$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..\backend')
$env:NODE_ENV = 'development'
if ($null -eq $env:PG_DISABLED) {
	$env:PG_DISABLED = '1'
}
npm run dev

$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..\frontend')
npm audit

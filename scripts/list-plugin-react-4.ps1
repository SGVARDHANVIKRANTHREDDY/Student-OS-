$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..\frontend')
$versions = npm view @vitejs/plugin-react versions --json | ConvertFrom-Json
$versions | Where-Object { $_ -like '4.*' } | Select-Object -Last 15

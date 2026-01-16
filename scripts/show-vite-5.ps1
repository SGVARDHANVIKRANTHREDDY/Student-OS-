$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..\frontend')
$versions = npm view vite versions --json | ConvertFrom-Json
$versions | Where-Object { $_ -like '5.*' } | Select-Object -Last 15

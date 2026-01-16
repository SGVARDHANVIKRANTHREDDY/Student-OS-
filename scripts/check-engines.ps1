$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..\frontend')
Write-Host 'plugin-react engines:'
npm view @vitejs/plugin-react@4.7.0 engines --json
Write-Host 'vite engines:'
npm view vite@5.4.21 engines --json

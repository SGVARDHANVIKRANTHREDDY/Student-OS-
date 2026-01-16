$ErrorActionPreference = 'Stop'
Set-Location -Path (Join-Path $PSScriptRoot '..\frontend')
$ver = (npm view @vitejs/plugin-react dist-tags --json | ConvertFrom-Json).latest
Write-Host "plugin-react latest:" $ver
npm view @vitejs/plugin-react@$ver peerDependencies --json

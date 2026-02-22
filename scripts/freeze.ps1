Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

.\.venv\Scripts\Activate.ps1
python -m pip freeze > requirements-lock.txt
Write-Host "✅ wrote requirements-lock.txt"
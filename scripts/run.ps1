# run.ps1
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

.\.venv\Scripts\Activate.ps1
python -m src.main

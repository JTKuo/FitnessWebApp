# setup.ps1
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (!(Test-Path ".\.venv")) {
  py -3.14 -m venv .venv
}

.\.venv\Scripts\Activate.ps1

python -m pip install -U pip
python -m pip install -r requirements.txt
python -m pip install -r requirements-dev.txt

python -c "import sys; print('Using:', sys.executable)"
Write-Host "✅ venv ready"
---
description: Project initinal
---

# Workflows

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

## 1) Create/refresh venv
- Run: scripts/setup.ps1

## 2) Run app
- Run: scripts/run.ps1

## 3) Add dependency
- Activate venv
- python -m pip install <pkg>
- Add to requirements.txt
- Run tests
- Commit
---
description: Project initinal
---

# Workflows

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

## 1) Create/refresh venv
- Run: scripts/setup.ps1

## 2) Setup Environment
- Copy `.env.example` to `.env`
- Customize `.env` values

## 3) Run app
- Run: scripts/run.ps1

## 4) Add dependency
- Activate venv
- python -m pip install <pkg>
- Add to requirements.txt
## 5) Create & Update README.md
- Create `README.md` if not exists
- Define Project Name, Description, and Features
- List Installation and Usage steps
- Run update script: `python scripts/update_readme_info.py`

## 6) Finalize
- Run tests
- Commit and Push
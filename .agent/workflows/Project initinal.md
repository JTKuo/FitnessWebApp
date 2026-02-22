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
## 4) Create & Update README.md
- Create `README.md` if not exists
- Define Project Name, Description, and Features
- List Installation and Usage steps
- Run update script: `python scripts/update_readme_info.py`

## 5) Finalize
- Run tests
- Commit and Push
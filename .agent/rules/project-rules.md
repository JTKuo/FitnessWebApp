---
trigger: always_on
---

# Python Environment Rule (.venv)

When executing ANY Python command, ALWAYS use the project virtual environment.

- Windows interpreter: `.\.venv\Scripts\python.exe`
- macOS/Linux interpreter: `./.venv/bin/python`

Rules:
1) Never run global `python` / `pip` from PATH.
2) Always run pip as: `<venv_python> -m pip ...`
3) Before installing or running scripts, verify interpreter:
   - `<venv_python> -c "import sys; print(sys.executable)"`

If `.venv` does not exist, run the workspace workflow "setup-venv" first.

# W-STRUCTURE：目錄結構固定
.venv/：專案虛擬環境（不進 Git）。
src/：存放核心程式碼。
tests/：存放測試文件，系統最少需保留 Smoke Test。
docs/：其他各式參考資料，確保 AI 工具與人類開發者邏輯一致。

# W-DEPENDENCIES：依賴管理
requirements.txt：存放 Runtime 執行時所需的依賴。
requirements-dev.txt：存放測試與開發所需的依賴（建議保留以區隔開發環境）。
更新原則：更新任何依賴後，必須同步更新上述檔案並提交 commit。

# W-RUN：執行方式
環境建立：一律使用 scripts/setup.ps1 建立或更新開發環境。
程式執行：一律使用 scripts/run.ps1 執行主程式。
持續整合 (CI)：必須執行 python -m unittest（或指定的測試入口點）進行自動化驗證。

# W-AI：AI 工具使用方式
行為定義：於 docs/AI_GUIDE.md 明確定義允許 AI 執行的操作範圍（例如：允許修改 src，但嚴禁修改或讀取金鑰資訊）。
變更驗證：所有由 Codex 或 Gemini 生成的 Patch（修補程式），必須通過至少一個測試（Smoke Test）驗證後方可採用。
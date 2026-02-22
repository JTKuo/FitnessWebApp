# Fitness WebApp

這是一個基於 FastAPI 的健身應用程式後端。

## 🚀 快速開始

### 環境需求
- Python 3.9+
- PowerShell (Windows)

### 安裝步驟
1. 執行初始化腳本：
   ```powershell
   ./scripts/setup.ps1
   ```

2. 設定環境變數：
   ```powershell
   cp .env.example .env
   # 然後編輯 .env 檔案填入您的設定
   ```

3. 啟動開發伺服器：
   ```powershell
   ./scripts/run.ps1
   ```

### 專案結構
- `src/`: 核心程式碼
- `scripts/`: 維運與啟動腳本
- `.agent/`: AI Agent 工作流配置
- `requirements.txt`: 專案依賴

## 🔧 核心技術
<!-- TECH_START -->
- **Fastapi**: 現代、高效的 Web 框架。
- **Uvicorn**: ASGI 伺服器。
- **Pandas**: 資料處理。
- **Requests**: HTTP 請求。
<!-- TECH_END -->

## 🤖 AI 自動化
本專案整合了 Antigravity AI Agent，並支援：
- **README 自動更新**: 透過 GitHub Actions 自動更新專案說明。
- **工作流自動化**: 定義在 `.agent/workflows` 中。

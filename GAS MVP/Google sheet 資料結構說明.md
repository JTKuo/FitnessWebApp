1. 專案概述

本試算表旨在建立一個完整的個人健身管理系統，涵蓋了基本資料管理、動作庫定義、訓練計畫範本、每日訓練記錄、以及體態與肌力進度追蹤。

2. 資料表結構 (Schema)

2.1 使用者檔案表 (Profile)
用途：紀錄使用者基本生理資訊、體格數據及訓練目標。
關鍵欄位：
name, age, gender, height, weight, bodyfat: 基本生理數據。
smm (骨骼肌重), bfm (體脂肪量), bmi, vfl (內臟脂肪等級), inbody_score: InBody 檢測數據。
static_assessment, dynamic_assessment: 靜態與動態體態評估記錄。
training_direction: 核心訓練目標與方向。

2.2 動作大師表 (ExerciseMaster)
用途：定義系統內所有的訓練動作及其分類。
欄位：
Motion: 動作名稱（唯一鍵）。
Category: 動作分類（如：推、拉、腿部、核心等）。

2.3 訓練範本表 (Templates)
用途：儲存預設的訓練計畫結構。
欄位：
TemplateName: 範本名稱（如：推日、拉日）。
ExerciseName: 動作名稱。
Order: 動作執行的先後順序。

2.4 訓練記錄表 (WorkoutLog 及 各月份分頁)
分頁：WorkoutLog (總表), 2025-08, 2025-09, 2025-10 等。
用途：紀錄每日實際訓練內容。
關鍵欄位：
訓練日期: 訓練發生的日期。
動作(Motion): 執行的動作名稱。
組數(set), 次數(reps), 重量(kg): 核心訓練數據。
重量(lbs): 自動換算之英制重量。
容量(Volume): 計算公式 重量(kg) * 組數 * 次數。
備註(Notes), 指導建議: 訓練細節與教練回饋。

2.5 個人紀錄與最佳表現 (PRs, Bests, PR_Log)
用途：追蹤各動作的最高重量與預估最大肌力 (1RM)。
關鍵欄位：
MaxWeight: 紀錄的最大重量。
Est1RM: 根據次數與重量計算的預估最大肌力。
HeaviestWeight, BestEst1RM: 各項指標的歷史最高值。

2.6 體態相簿 (BodyPhotos)
用途：管理體態變化照片的 ID。
欄位：日期, photo_front_id, photo_side_id, photo_back_id。

3. 資料關聯設計 (Relationships)
動作名稱 (Motion) 為核心關聯鍵：
ExerciseMaster -> Templates: 提供範本可用的動作選單。
ExerciseMaster -> WorkoutLog: 確保每日記錄的動作名稱一致。
WorkoutLog -> PRs: 每日訓練數據會彙整計算出 PR 指標。
日期 (Date) 關聯：
WorkoutLog, BodyPhotos, Profile 皆以日期作為時間軸，同步對比訓練強度、體重變化與視覺體態。

4. 計算邏輯說明
訓練容量 (Volume) = 重量 (kg) × 組數 × 次數。
預估最大肌力 (Est1RM) = 通常基於布瑞吉基 (Brzycki) 或溫德勒 (Wendler) 公式計算（依試算表內置公式而定）。
單位換算：重量(lbs) = 重量(kg) × 2.20462。
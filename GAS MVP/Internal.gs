// =======================================================
// 內部服務函式 (Internal Service Functions)
// =======================================================
/**
 * 確保 Profile 工作表包含所有必要的欄位標頭。
 * 如果缺少任何標頭，會將其附加到最後一欄。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} profileSheet - Profile 工作表物件。
 */
function _ensureProfileHeaders(profileSheet) {
  // 定義所有應存在的標準欄位
  const canonicalHeaders = [
    '更新日期', 'name', 'age', 'gender', 'height', 'weight', 'bodyfat', 
    'frequency', 'diet_plan', 'experience', 'lifestyle', 'history', 
    'static_assessment', 'dynamic_assessment', 'cid', 'inbody_score', 
    'smm', 'bfm', 'bmi', 'vfl', 'training_direction'
  ];

  const currentHeaders = profileSheet.getRange(1, 1, 1, profileSheet.getLastColumn()).getValues()[0];
  const missingHeaders = [];

  canonicalHeaders.forEach(header => {
    if (!currentHeaders.includes(header)) {
      missingHeaders.push(header);
    }
  });

  if (missingHeaders.length > 0) {
    Logger.log(`在 Profile 中發現缺少的欄位，正在自動新增: ${missingHeaders.join(', ')}`);
    const lastColumn = profileSheet.getLastColumn();
    // 將所有缺少的欄位一次性寫入到表頭的末尾
    profileSheet.getRange(1, lastColumn + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    SpreadsheetApp.flush(); // 確保寫入完成
  }
}

function _getUserSheet(email, createIfNotExist = false) {
  try {
    const dataFolder = DriveApp.getFolderById(CONFIG.DATA_FOLDER_ID);
    const files = dataFolder.getFilesByName(email);
    
    if (files.hasNext()) {
      return SpreadsheetApp.open(files.next());
    } else if (createIfNotExist) {
      const newSheet = SpreadsheetApp.create(email);
      const newFile = DriveApp.getFileById(newSheet.getId());
      dataFolder.addFile(newFile);
      DriveApp.getRootFolder().removeFile(newFile);
      _getOrCreateSheet(newSheet, 'Profile');
      return newSheet;
    } else {
      return null;
    }
  } catch (e) {
    Logger.log(`CRITICAL ERROR in _getUserSheet: ${e.toString()}`);
    throw new Error(`無法存取資料夾，請確認 DATA_FOLDER_ID ('${CONFIG.DATA_FOLDER_ID}') 是否正確且您有權限存取。`);
  }
}

function _getOrCreateSheet(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    if (sheetName === CONSTANTS.SHEETS.WORKOUT_LOG) {
      const headers = [
        '訓練日期', // CONSTANTS.HEADERS.UPDATE_DATE.replace('更新', '訓練')
        CONSTANTS.HEADERS.MOTION, 
        CONSTANTS.HEADERS.SETS,
        CONSTANTS.HEADERS.REPS, 
        CONSTANTS.HEADERS.WEIGHT_KG, 
        CONSTANTS.HEADERS.WEIGHT_LBS, 
        CONSTANTS.HEADERS.VOLUME, 
        CONSTANTS.HEADERS.NOTES,
        CONSTANTS.HEADERS.ADMIN_COMMENT
      ];
      sheet.appendRow(headers);
      sheet.getRange("A1:I1").setFontWeight("bold");
      sheet.setFrozenRows(1);
    } else if (sheetName === CONSTANTS.SHEETS.TEMPLATES) {
      const headers = ['TemplateName', 'ExerciseName', 'Order'];
      sheet.appendRow(headers); [cite_start]
      sheet.getRange("A1:C1").setFontWeight("bold");
      sheet.setFrozenRows(1);
    } else if (sheetName === CONSTANTS.SHEETS.PROFILE) {
      const canonicalHeaders = [
        CONSTANTS.HEADERS.UPDATE_DATE,
        CONSTANTS.HEADERS.NAME,
        CONSTANTS.HEADERS.AGE,
        CONSTANTS.HEADERS.GENDER, 
        CONSTANTS.HEADERS.HEIGHT,
        CONSTANTS.HEADERS.WEIGHT,
        CONSTANTS.HEADERS.BODYFAT,
        'frequency',
        'diet_plan',
        'experience',
        'lifestyle',
        'history',
        'static_assessment',
        'dynamic_assessment',
        'cid',
        CONSTANTS.HEADERS.INBODY_SCORE,
        CONSTANTS.HEADERS.SMM,
        CONSTANTS.HEADERS.BFM,
        CONSTANTS.HEADERS.BMI,
        CONSTANTS.HEADERS.VFL,
        'training_direction'
      ];
      sheet.appendRow(canonicalHeaders); [cite_start]
      sheet.getRange(1, 1, 1, canonicalHeaders.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    } else if (sheetName === 'BodyPhotos') {
        const headers = ['日期', 'photo_front_id', 'photo_side_id', 'photo_back_id'];
        sheet.appendRow(headers);
        sheet.getRange("A1:D1").setFontWeight("bold");
        sheet.setFrozenRows(1);
    } else if (sheetName === 'PRs') {
        const headers = ['Motion', 'Reps', 'MaxWeight', 'Date', 'Est1RM'];
        sheet.appendRow(headers);
        sheet.getRange("A1:E1").setFontWeight("bold");
        sheet.setFrozenRows(1);
    } else if (sheetName === 'Bests') {
        const headers = ['Motion', 'HeaviestWeight', 'BestEst1RM', 'DateHeaviest', 'DateBestEst1RM'];
        sheet.appendRow(headers);
        sheet.getRange("A1:E1").setFontWeight("bold");
        sheet.setFrozenRows(1);
    } else if (sheetName === 'ExerciseMaster') {
        const headers = ['Motion', 'Category'];
        sheet.appendRow(headers);
        sheet.getRange("A1:B1").setFontWeight("bold");
        sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * 讀取 ExerciseMaster 工作表，並回傳一個 動作名稱 -> 分類 的 Map。
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - 使用者的 Google Sheet 物件。
 * @returns {Map<string, string>} - 一個 Map 物件。
 */
function _getExerciseCategoryMap(spreadsheet) { // 
  // 【新增】快取邏輯
  const cache = CacheService.getUserCache();
  const cacheKey = `category_map_${spreadsheet.getId()}`;
  const cached = cache.get(cacheKey);
  
  if (cached) {
    Logger.log('從快取載入 ExerciseCategoryMap');
    // 從快取還原 Map
    const parsedObject = JSON.parse(cached);
    return new Map(Object.entries(parsedObject));
  }
  
  Logger.log('重新建立 ExerciseCategoryMap');
  const categoryMap = new Map();
  const sheet = spreadsheet.getSheetByName('ExerciseMaster'); // 
  
  if (!sheet || sheet.getLastRow() < 2) { // [cite: 43]
    return categoryMap;
  }
  
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues(); // [cite: 44]
  data.forEach(row => { // [cite: 44]
    const exerciseName = row[0];
    const category = row[1];
    if (exerciseName && category) {
      categoryMap.set(exerciseName.trim(), category.trim());
    }
  });

  // 【新增】存入快取前，先轉成可序列化的 Object
  // 快取 1 小時 (3600 秒)
  const serializableObject = Object.fromEntries(categoryMap);
  cache.put(cacheKey, JSON.stringify(serializableObject), 3600); 

  return categoryMap; // [cite: 45]
}

function _getLatestProfileData(spreadsheet) {
  const profileSheet = spreadsheet.getSheetByName(CONSTANTS.SHEETS.PROFILE);
  // 如果工作表不存在，或只有標頭，就回傳空物件
  if (!profileSheet || profileSheet.getLastRow() < 2) {
    return {};
  }

  // ⭐ [修改] 直接讀取固定的第 2 行，因為排序後最新的永遠在這裡
  const headers = profileSheet.getRange(1, 1, 1, profileSheet.getLastColumn()).getValues()[0];
  const latestData = profileSheet.getRange(2, 1, 1, profileSheet.getLastColumn()).getValues()[0];

  const profile = {};
  headers.forEach((header, index) => {
    if (header) { 
      profile[header] = latestData[index];
    }
  });
  return profile;
}

function _getLatestPhotos(spreadsheet) {
    const sheet = spreadsheet.getSheetByName('BodyPhotos');
    if (!sheet || sheet.getLastRow() < 2) {
        return null;
    }

    // ⭐ [修改] 直接讀取第 2 行的資料 (在陣列中是第 0 個)
    const data = sheet.getRange(2, 1, 1, 4).getValues()[0];

    // 確保第一格是有效的日期
    if (data[0] instanceof Date) {
        return {
            date: data[0],
            photo_front_id: data[1],
            photo_side_id: data[2],
            photo_back_id: data[3]
        };
    }

    return null; // 如果找不到有效資料則回傳 null
}


function _checkPhotoReminder(spreadsheet) {
  // 獲取 BodyPhotos 工作表
  const sheet = spreadsheet.getSheetByName('BodyPhotos');

  // 如果工作表不存在，或只有標頭行，代表從未記錄過，應提醒。
  if (!sheet || sheet.getLastRow() < 2) {
    return true;
  }

  // 假設最新的一筆在最頂部 (因為儲存時有排序)
  // 我們直接讀取第二行第一列的日期
  const lastDate = sheet.getRange(2, 1).getValue(); 

  if (lastDate instanceof Date) {
    const today = new Date();
    // 計算 30 天的毫秒數
    const thirtyDaysInMillis = 30 * 24 * 60 * 60 * 1000;

    // 如果今天距離上次紀錄的日期，已經超過 30 天
    if ((today.getTime() - lastDate.getTime()) > thirtyDaysInMillis) {
      return true; // 回傳 true，前端將會顯示提醒橫幅
    }
  }

  // 預設情況下，不顯示提醒
  return false;
}

/**
 * (V2 - 升級版) 清除當日日誌，但會先回傳舊的管理員評論。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 目標工作表。
 * @param {Date} date - 目標日期。
 * @returns {Map<string, string>} - 一個 Map，key 是動作名稱，value 是該動作的管理員評論。
 */
function _clearTodaysLog(sheet, date) {
  const adminComments = new Map();
  const data = sheet.getDataRange().getValues();
  const targetDate = new Date(date).setHours(0, 0, 0, 0);
  let startRowIndex = -1;
  let rowCount = 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] instanceof Date && (new Date(data[i][0]).setHours(0, 0, 0, 0) === targetDate)) {
      startRowIndex = i;
      rowCount = 1;
      
      // 遍歷當天的所有記錄
      for (let j = i; j < data.length; j++) {
        const rowDate = data[j][0];
        // 如果遇到下一個不同日期，就停止
        if (rowDate instanceof Date && (new Date(rowDate).setHours(0,0,0,0) !== targetDate) && rowDate !== '') {
          break;
        }
        
        const motion = data[j][1];
        const adminComment = data[j][8]; // 第 9 欄 (索引 8) 是指導建議

        // 如果有動作名稱和評論，就存起來
        if (motion && adminComment) {
          adminComments.set(motion, adminComment);
        }

        // 如果這是當天的最後一筆紀錄，也要正確計算 rowCount
        if (j + 1 >= data.length || (data[j+1][0] instanceof Date && data[j+1][0] !== '')) {
           rowCount = j - i + 1;
           break;
        }
      }
      break;
    }
  }

  if (startRowIndex !== -1) {
    Logger.log(`正在為日期 ${new Date(date).toLocaleDateString()} 從第 ${startRowIndex + 1} 行開始刪除 ${rowCount} 行`);
    sheet.deleteRows(startRowIndex + 1, rowCount);
  }
  
  Logger.log('保留的管理員評論:', adminComments);
  return adminComments; // 回傳儲存的評論
}

/**
 * (V3 - 高性能批次寫入，可保留評論)
 * 將當日的完整訓練日誌一次性寫入工作表。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 目標工作表。
 * @param {Date} date - 日期。
 * @param {Array} workoutData - 訓練資料。
 * @param {Map<string, string>} savedAdminComments - 從 _clearTodaysLog 傳來的舊評論。
 */
function _writeNewLog(sheet, date, workoutData, savedAdminComments) {
  const KG_TO_LB = 2.20462262;
  const allRowsToWrite = [];
  const exercises = {};
  
  workoutData.forEach(set => {
      if (!exercises[set.motion]) {
        exercises[set.motion] = [];
      }
      exercises[set.motion].push(set);
  });
  
  // ⭐ [修改] 欄位數增加到 9
  allRowsToWrite.push([date, '', '', '', '', '', '', '', '']); // 日期列

  let dailyTotalVolume = 0;
  for (const motionName in exercises) {
    const sets = exercises[motionName];
    let exerciseTotalVolume = 0;
    
    // ⭐ [修改] 取得這個動作的管理員評論
    const adminCommentForMotion = savedAdminComments.get(motionName) || '';

    sets.forEach((set, index) => {
      const weight_kg = set.weight_in_kg;
      const weight_lbs = (set.unit === '磅') ? set.weight : parseFloat((set.weight * KG_TO_LB).toFixed(2));
      const volume = weight_kg * set.reps;
      exerciseTotalVolume += volume;
      
      const note = (index === 0) ? set.note : '';
      // ⭐ [修改] 只有在第一組時，寫入管理員評論
      const adminComment = (index === 0) ? adminCommentForMotion : '';

      const rowData = ['', motionName, index + 1, set.reps, weight_kg, weight_lbs, volume, note, adminComment];
      allRowsToWrite.push(rowData);
    });
    
    allRowsToWrite.push(['', '', '', '', '', '動作總結', exerciseTotalVolume, '', '']);
    dailyTotalVolume += exerciseTotalVolume;
  }

  allRowsToWrite.push(['', '', '', '', '', '本日總結', dailyTotalVolume, '', '']);
  
  if (allRowsToWrite.length > 0) {
    const numRows = allRowsToWrite.length;
    const numCols = allRowsToWrite[0].length;

    // 【修改】
    // 1. 找到正確的插入列號
    const insertionRow = _findInsertionRow(sheet, date);
    
    // 2. 在該位置插入 N 個空白列
    sheet.insertRows(insertionRow, numRows);
    
    // 3. 將資料寫入到剛剛建立的空白列中
    sheet.getRange(insertionRow, 1, numRows, numCols).setValues(allRowsToWrite);
  }
}

/**
 * (V3 - Final Fix)
 * 更新 BodyPhotos 工作表。如果當天已有記錄，則先將舊照片移至垃圾桶再更新記錄；否則新增一筆。
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - 使用者的 Google Sheet 物件。
 * @param {Date} date - 包含正確時間的日期物件。
 * @param {object} photoIds - 包含新照片 File ID 的物件。
 */
function _updateBodyPhotosSheet(spreadsheet, date, photoIds) {
    const sheet = _getOrCreateSheet(spreadsheet, 'BodyPhotos');
    // ⭐️ 關鍵修正 1：比對時，只比對 "年-月-日"，忽略時間 ⭐️
    const dateStringForComparison = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const data = sheet.getDataRange().getValues();
    let rowToUpdate = -1;

    // 從第二行開始遍歷，尋找匹配的日期
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] instanceof Date) {
            const rowDateString = Utilities.formatDate(data[i][0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
            if (rowDateString === dateStringForComparison) {
                rowToUpdate = i + 1; // Apps Script 的行號是從 1 開始
                break;
            }
        }
    }

    if (rowToUpdate !== -1) {
        // --- 找到匹配日期的行，執行更新邏輯 ---
        Logger.log('找到匹配日期，位於第 ' + rowToUpdate + ' 行，執行更新模式。');

        // ⭐️ 關鍵修正 2：確保刪除舊檔案的邏輯存在且完整 ⭐️
        const oldIds = sheet.getRange(rowToUpdate, 2, 1, 3).getValues()[0];
        
        const trashOldFile = (fileId) => {
            if (fileId && typeof fileId === 'string' && fileId.trim() !== '') {
                try {
                    DriveApp.getFileById(fileId).setTrashed(true);
                    Logger.log('成功將舊檔案移至垃圾桶: ' + fileId);
                } catch (e) {
                    Logger.log('無法刪除檔案 ' + fileId + ' (可能已被手動移除)。錯誤: ' + e.message);
                }
            }
        };

        // 根據新上傳的照片，刪除對應位置的舊照片
        if (photoIds.photo_front_id) trashOldFile(oldIds[0]); // oldIds[0] 是 B 欄的 photo_front_id
        if (photoIds.photo_side_id)  trashOldFile(oldIds[1]); // oldIds[1] 是 C 欄的 photo_side_id
        if (photoIds.photo_back_id)  trashOldFile(oldIds[2]); // oldIds[2] 是 D 欄的 photo_back_id

        // --- 更新 Sheet 中的 File ID ---
        if (photoIds.photo_front_id) sheet.getRange(rowToUpdate, 2).setValue(photoIds.photo_front_id);
        if (photoIds.photo_side_id)  sheet.getRange(rowToUpdate, 3).setValue(photoIds.photo_side_id);
        if (photoIds.photo_back_id)  sheet.getRange(rowToUpdate, 4).setValue(photoIds.photo_back_id);
        
        // ⭐️ 關鍵修正 3：用包含最新時間的 date 物件，更新日期欄位 ⭐️
        sheet.getRange(rowToUpdate, 1).setValue(date);
        Logger.log('Sheet 中的 File ID 與時間戳已更新。');

    } else {
        // --- 未找到匹配日期，執行新增邏輯 ---
        Logger.log('未找到匹配日期，執行新增模式。');
        sheet.appendRow([
            date,
            photoIds.photo_front_id || '',
            photoIds.photo_side_id || '',
            photoIds.photo_back_id || ''
        ]);
        // 新增後重新排序，確保最新的在最上面         
    }
    sheet.sort(1, false);
}


/**
 * (新函式) 尋找新日誌的正確插入位置。
 * 我們的目標是讓工作表保持日期降序 (最新在最上面)。
 * 此函式會尋找第一個日期「早於」新日期的列，並回傳其列號。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - WorkoutLog 工作表。
 * @param {Date} newDate - 準備寫入的新日期。
 * @returns {number} - 應該插入的列號 (1-based)。
 */
function _findInsertionRow(sheet, newDate) {
  const lastRow = sheet.getLastRow();
  // 如果工作表是空的 (只有標頭)，則從第 2 列開始插入
  if (lastRow < 2) {
    return 2; 
  }
  
  // 只讀取 A 欄 (日期欄)，從第 2 列開始讀取 (跳過標頭)
  const datesColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  
  for (let i = 0; i < datesColumn.length; i++) {
    const rowDate = datesColumn[i][0];
    
    // 檢查 A 欄是否為一個有效的日期 (因為很多列是空的)
    if (rowDate instanceof Date) {
      // 找到了！發現一個比我「新日期」更「早」的日期
      // 我們應該插入在「它」的前面
      if (new Date(rowDate) < newDate) {
        // i 是 0-based 陣列索引
        // i + 2 轉換為 1-based 的工作表列號 (因為我們跳過了標頭)
        return i + 2; 
      }
    }
  }
  
  // 如果迴圈跑完了，都沒找到比我更早的日期 (代表新日期是目前最舊的)
  // 則附加到工作表的最後
  return lastRow + 1;
}

/**
 * 根據工作表標頭，建立一個 標頭名稱 -> 欄位索引 的 Map。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 目標工作表。
 * @returns {object} - e.g. { '動作(Motion)': 1, '次數(reps)': 3 }
 */
function _getHeaderIndices(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const indices = {};
  headers.forEach((header, index) => {
    indices[header] = index; // index 是 0-based
  });
  return indices;
}
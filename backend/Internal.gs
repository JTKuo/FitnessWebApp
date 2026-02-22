// =======================================================
// 內部服務函式 (Internal Service Functions) - 重構版
// 完整保留原始 GAS MVP 的所有資料處理邏輯
// =======================================================

/**
 * 確保 Profile 工作表包含所有必要的欄位標頭。
 */
function _ensureProfileHeaders(profileSheet) {
  const canonicalHeaders = [
    '更新日期', 'name', 'age', 'gender', 'height', 'weight', 'bodyfat',
    'frequency', 'diet_plan', 'experience', 'lifestyle', 'history',
    'static_assessment', 'dynamic_assessment', 'cid', 'inbody_score',
    'smm', 'bfm', 'bmi', 'vfl', 'training_direction'
  ];
  const currentHeaders = profileSheet.getRange(1, 1, 1, profileSheet.getLastColumn()).getValues()[0];
  const missingHeaders = canonicalHeaders.filter(h => !currentHeaders.includes(h));
  if (missingHeaders.length > 0) {
    Logger.log(`Profile 缺少欄位，自動新增: ${missingHeaders.join(', ')}`);
    profileSheet.getRange(1, profileSheet.getLastColumn() + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    SpreadsheetApp.flush();
  }
}

/**
 * 取得使用者的個人試算表。
 */
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
    }
    return null;
  } catch (e) {
    Logger.log(`_getUserSheet 錯誤: ${e.toString()}`);
    throw new Error(`無法存取資料夾，請確認設定。`);
  }
}

/**
 * 取得或建立工作表，並自動建立標頭。
 */
function _getOrCreateSheet(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    const headerMap = {
      [CONSTANTS.SHEETS.WORKOUT_LOG]: {
        headers: ['訓練日期', CONSTANTS.HEADERS.MOTION, CONSTANTS.HEADERS.SETS, CONSTANTS.HEADERS.REPS,
          CONSTANTS.HEADERS.WEIGHT_KG, CONSTANTS.HEADERS.WEIGHT_LBS, CONSTANTS.HEADERS.VOLUME,
          CONSTANTS.HEADERS.NOTES, CONSTANTS.HEADERS.ADMIN_COMMENT],
        range: "A1:I1"
      },
      [CONSTANTS.SHEETS.TEMPLATES]: { headers: ['TemplateName', 'ExerciseName', 'Order'], range: "A1:C1" },
      [CONSTANTS.SHEETS.PROFILE]: {
        headers: [CONSTANTS.HEADERS.UPDATE_DATE, CONSTANTS.HEADERS.NAME, CONSTANTS.HEADERS.AGE,
          CONSTANTS.HEADERS.GENDER, CONSTANTS.HEADERS.HEIGHT, CONSTANTS.HEADERS.WEIGHT,
          CONSTANTS.HEADERS.BODYFAT, 'frequency', 'diet_plan', 'experience', 'lifestyle',
          'history', 'static_assessment', 'dynamic_assessment', 'cid',
          CONSTANTS.HEADERS.INBODY_SCORE, CONSTANTS.HEADERS.SMM, CONSTANTS.HEADERS.BFM,
          CONSTANTS.HEADERS.BMI, CONSTANTS.HEADERS.VFL, 'training_direction'],
        range: null
      },
      'BodyPhotos': { headers: ['日期', 'photo_front_id', 'photo_side_id', 'photo_back_id'], range: "A1:D1" },
      'PRs': { headers: ['Motion', 'Reps', 'MaxWeight', 'Date', 'Est1RM'], range: "A1:E1" },
      'Bests': { headers: ['Motion', 'HeaviestWeight', 'BestEst1RM', 'DateHeaviest', 'DateBestEst1RM'], range: "A1:E1" },
      'ExerciseMaster': { headers: ['Motion', 'Category'], range: "A1:B1" }
    };
    const config = headerMap[sheetName];
    if (config) {
      sheet.appendRow(config.headers);
      if (config.range) {
        sheet.getRange(config.range).setFontWeight("bold");
      } else {
        sheet.getRange(1, 1, 1, config.headers.length).setFontWeight("bold");
      }
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * 讀取 ExerciseMaster，回傳動作名稱 -> 分類的 Map（含快取）。
 */
function _getExerciseCategoryMap(spreadsheet) {
  const cache = CacheService.getUserCache();
  const cacheKey = `category_map_${spreadsheet.getId()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return new Map(Object.entries(JSON.parse(cached)));
  }
  const categoryMap = new Map();
  const sheet = spreadsheet.getSheetByName('ExerciseMaster');
  if (!sheet || sheet.getLastRow() < 2) return categoryMap;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  data.forEach(row => {
    if (row[0] && row[1]) categoryMap.set(row[0].trim(), row[1].trim());
  });
  cache.put(cacheKey, JSON.stringify(Object.fromEntries(categoryMap)), 3600);
  return categoryMap;
}

/**
 * 讀取最新的 Profile 資料。
 */
function _getLatestProfileData(spreadsheet) {
  const profileSheet = spreadsheet.getSheetByName(CONSTANTS.SHEETS.PROFILE);
  if (!profileSheet || profileSheet.getLastRow() < 2) return {};
  const headers = profileSheet.getRange(1, 1, 1, profileSheet.getLastColumn()).getValues()[0];
  const latestData = profileSheet.getRange(2, 1, 1, profileSheet.getLastColumn()).getValues()[0];
  const profile = {};
  headers.forEach((header, index) => { if (header) profile[header] = latestData[index]; });
  return profile;
}

/**
 * 讀取最新的體態照片記錄。
 */
function _getLatestPhotos(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('BodyPhotos');
  if (!sheet || sheet.getLastRow() < 2) return null;
  const data = sheet.getRange(2, 1, 1, 4).getValues()[0];
  if (data[0] instanceof Date) {
    return { date: data[0], photo_front_id: data[1], photo_side_id: data[2], photo_back_id: data[3] };
  }
  return null;
}

/**
 * 檢查是否需要提醒拍照。
 */
function _checkPhotoReminder(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('BodyPhotos');
  if (!sheet || sheet.getLastRow() < 2) return true;
  const lastDate = sheet.getRange(2, 1).getValue();
  if (lastDate instanceof Date) {
    return (Date.now() - lastDate.getTime()) > (30 * 24 * 60 * 60 * 1000);
  }
  return false;
}

/**
 * 清除當日日誌並保留管理員評論。
 */
function _clearTodaysLog(sheet, date) {
  const adminComments = new Map();
  const data = sheet.getDataRange().getValues();
  const targetDate = new Date(date).setHours(0, 0, 0, 0);
  let startRowIndex = -1, rowCount = 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] instanceof Date && new Date(data[i][0]).setHours(0, 0, 0, 0) === targetDate) {
      startRowIndex = i;
      for (let j = i; j < data.length; j++) {
        const rowDate = data[j][0];
        if (rowDate instanceof Date && new Date(rowDate).setHours(0, 0, 0, 0) !== targetDate && rowDate !== '') break;
        if (data[j][1] && data[j][8]) adminComments.set(data[j][1], data[j][8]);
        if (j + 1 >= data.length || (data[j + 1][0] instanceof Date && data[j + 1][0] !== '')) {
          rowCount = j - i + 1; break;
        }
      }
      break;
    }
  }
  if (startRowIndex !== -1) sheet.deleteRows(startRowIndex + 1, rowCount);
  return adminComments;
}

/**
 * 批次寫入當日訓練日誌。
 */
function _writeNewLog(sheet, date, workoutData, savedAdminComments) {
  const KG_TO_LB = 2.20462262;
  const allRowsToWrite = [];
  const exercises = {};
  workoutData.forEach(set => {
    if (!exercises[set.motion]) exercises[set.motion] = [];
    exercises[set.motion].push(set);
  });
  allRowsToWrite.push([date, '', '', '', '', '', '', '', '']);
  let dailyTotalVolume = 0;
  for (const motionName in exercises) {
    const sets = exercises[motionName];
    let exerciseTotalVolume = 0;
    const adminCommentForMotion = savedAdminComments.get(motionName) || '';
    sets.forEach((set, index) => {
      const weight_kg = set.weight_in_kg;
      const weight_lbs = (set.unit === '磅') ? set.weight : parseFloat((set.weight * KG_TO_LB).toFixed(2));
      const volume = weight_kg * set.reps;
      exerciseTotalVolume += volume;
      const note = (index === 0) ? set.note : '';
      const adminComment = (index === 0) ? adminCommentForMotion : '';
      allRowsToWrite.push(['', motionName, index + 1, set.reps, weight_kg, weight_lbs, volume, note, adminComment]);
    });
    allRowsToWrite.push(['', '', '', '', '', '動作總結', exerciseTotalVolume, '', '']);
    dailyTotalVolume += exerciseTotalVolume;
  }
  allRowsToWrite.push(['', '', '', '', '', '本日總結', dailyTotalVolume, '', '']);
  if (allRowsToWrite.length > 0) {
    const insertionRow = _findInsertionRow(sheet, date);
    sheet.insertRows(insertionRow, allRowsToWrite.length);
    sheet.getRange(insertionRow, 1, allRowsToWrite.length, allRowsToWrite[0].length).setValues(allRowsToWrite);
  }
}

/**
 * 尋找新日誌的正確插入位置（保持日期降序）。
 */
function _findInsertionRow(sheet, newDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;
  const datesColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < datesColumn.length; i++) {
    if (datesColumn[i][0] instanceof Date && new Date(datesColumn[i][0]) < newDate) {
      return i + 2;
    }
  }
  return lastRow + 1;
}

/**
 * 更新 BodyPhotos 工作表（含舊照片自動移除）。
 */
function _updateBodyPhotosSheet(spreadsheet, date, photoIds) {
  const sheet = _getOrCreateSheet(spreadsheet, 'BodyPhotos');
  const dateStringForComparison = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const data = sheet.getDataRange().getValues();
  let rowToUpdate = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] instanceof Date) {
      const rowDateString = Utilities.formatDate(data[i][0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (rowDateString === dateStringForComparison) { rowToUpdate = i + 1; break; }
    }
  }
  if (rowToUpdate !== -1) {
    const oldIds = sheet.getRange(rowToUpdate, 2, 1, 3).getValues()[0];
    const trashOldFile = (fileId) => {
      if (fileId && typeof fileId === 'string' && fileId.trim() !== '') {
        try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* 忽略 */ }
      }
    };
    if (photoIds.photo_front_id) trashOldFile(oldIds[0]);
    if (photoIds.photo_side_id) trashOldFile(oldIds[1]);
    if (photoIds.photo_back_id) trashOldFile(oldIds[2]);
    if (photoIds.photo_front_id) sheet.getRange(rowToUpdate, 2).setValue(photoIds.photo_front_id);
    if (photoIds.photo_side_id) sheet.getRange(rowToUpdate, 3).setValue(photoIds.photo_side_id);
    if (photoIds.photo_back_id) sheet.getRange(rowToUpdate, 4).setValue(photoIds.photo_back_id);
    sheet.getRange(rowToUpdate, 1).setValue(date);
  } else {
    sheet.appendRow([date, photoIds.photo_front_id || '', photoIds.photo_side_id || '', photoIds.photo_back_id || '']);
  }
  sheet.sort(1, false);
}

/**
 * 根據工作表標頭，建立標頭名稱 -> 欄位索引的 Map。
 */
function _getHeaderIndices(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const indices = {};
  headers.forEach((header, index) => { indices[header] = index; });
  return indices;
}

/**
 * 決定目標 Email（支援管理員切換）。
 */
function _resolveTargetEmail(authResult, requestedEmail) {
  if (authResult.isAdmin && requestedEmail && requestedEmail !== authResult.email) {
    return requestedEmail;
  }
  return authResult.email;
}

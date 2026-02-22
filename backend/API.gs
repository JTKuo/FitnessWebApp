// =======================================================
// 主 API 路由器 (Main API Router) - 重構版
// 所有請求透過 doGet/doPost 進入，統一驗證後分發給對應函式
// =======================================================

/**
 * 處理 GET 請求 (用於讀取資料)。
 * 前端透過 URL 參數傳送 action 和 token。
 * 
 * @param {object} e - 事件物件，包含 e.parameter。
 * @returns {TextOutput} - JSON 格式的回應。
 */
function doGet(e) {
  const action = e.parameter.action;
  const token = e.parameter.token;

  // 身份驗證
  const auth = _authenticate(token);
  if (!auth.authorized) {
    return _createErrorResponse(auth.error);
  }

  try {
    switch (action) {
      case 'getInitialData':
        return _createJsonResponse(_handleGetInitialData(auth, e.parameter));

      case 'getAnalysisData':
        return _createJsonResponse(_handleGetAnalysisData(auth, e.parameter));

      case 'getLatestPerformance':
        return _createJsonResponse(_handleGetLatestPerformance(auth, e.parameter));

      case 'getUniqueExerciseNames':
        return _createJsonResponse(_handleGetUniqueExerciseNames(auth, e.parameter));

      case 'getWorkoutTemplates':
        return _createJsonResponse(_handleGetWorkoutTemplates(auth, e.parameter));

      case 'getAllPRs':
        return _createJsonResponse(_handleGetAllPRs(auth, e.parameter));

      case 'getAllPhotoRecords':
        return _createJsonResponse(_handleGetAllPhotoRecords(auth, e.parameter));

      default:
        return _createErrorResponse('未知的 API 動作: ' + action);
    }
  } catch (err) {
    Logger.log(`doGet 錯誤 [${action}]: ${err.toString()}\n${err.stack}`);
    return _createErrorResponse('伺服器內部錯誤: ' + err.message);
  }
}

/**
 * 處理 POST 請求 (用於寫入/修改資料)。
 * 前端透過 JSON body 傳送 action, token 和 data。
 *
 * @param {object} e - 事件物件，包含 e.postData。
 * @returns {TextOutput} - JSON 格式的回應。
 */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return _createErrorResponse('無效的請求格式。');
  }

  const action = body.action;
  const token = body.token;

  // 身份驗證
  const auth = _authenticate(token);
  if (!auth.authorized) {
    return _createErrorResponse(auth.error);
  }

  try {
    switch (action) {
      case 'saveProfileData':
        return _createJsonResponse(_handleSaveProfileData(auth, body.data));

      case 'saveWorkoutData':
        return _createJsonResponse(_handleSaveWorkoutData(auth, body.data));

      case 'saveBodyPhotos':
        return _createJsonResponse(_handleSaveBodyPhotos(auth, body.data));

      case 'saveWorkoutTemplate':
        return _createJsonResponse(_handleSaveWorkoutTemplate(auth, body.data));

      case 'deleteWorkoutTemplate':
        return _createJsonResponse(_handleDeleteWorkoutTemplate(auth, body.data));

      case 'processWorkoutForPRs':
        return _createJsonResponse(_handleProcessWorkoutForPRs(auth, body.data));

      case 'saveAdminComment':
        return _createJsonResponse(_handleSaveAdminComment(auth, body.data));

      case 'updateExerciseCategories':
        return _createJsonResponse(_handleUpdateExerciseCategories(auth, body.data));

      default:
        return _createErrorResponse('未知的 API 動作: ' + action);
    }
  } catch (err) {
    Logger.log(`doPost 錯誤 [${action}]: ${err.toString()}\n${err.stack}`);
    return _createErrorResponse('伺服器內部錯誤: ' + err.message);
  }
}


// =======================================================
// GET 處理函式 (Read Operations)
// =======================================================

function _handleGetInitialData(auth, params) {
  const targetEmail = _resolveTargetEmail(auth, params.userEmail);
  const userSheet = _getUserSheet(targetEmail, true);
  if (!userSheet) throw new Error(`無法獲取使用者 ${targetEmail} 的資料表。`);

  const profileSheet = _getOrCreateSheet(userSheet, CONSTANTS.SHEETS.PROFILE);
  _ensureProfileHeaders(profileSheet);
  let profileData = _getLatestProfileData(userSheet);
  if (profileData && profileData[CONSTANTS.HEADERS.UPDATE_DATE] instanceof Date) {
    profileData[CONSTANTS.HEADERS.UPDATE_DATE] = profileData[CONSTANTS.HEADERS.UPDATE_DATE].toISOString();
  }
  let latestPhotos = _getLatestPhotos(userSheet);
  if (latestPhotos && latestPhotos.date instanceof Date) {
    latestPhotos.date = latestPhotos.date.toISOString();
  }

  const profile = {
    email: targetEmail,
    name: profileData.name || targetEmail.split('@')[0],
    isAdmin: auth.isAdmin,
    profileData: profileData,
    shouldShowReminder: _checkPhotoReminder(userSheet),
    latestPhotos: latestPhotos
  };

  // 使用者列表 (僅 Admin)
  let allUsers = [];
  if (auth.isAdmin) {
    const dataFolder = DriveApp.getFolderById(CONFIG.DATA_FOLDER_ID);
    const files = dataFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    while (files.hasNext()) {
      const file = files.next();
      allUsers.push({ email: file.getName(), name: file.getName().split('@')[0] });
    }
  }

  // 訓練範本
  const templates = {};
  const templateSheet = _getOrCreateSheet(userSheet, CONSTANTS.SHEETS.TEMPLATES);
  if (templateSheet.getLastRow() > 1) {
    const templateData = templateSheet.getRange(2, 1, templateSheet.getLastRow() - 1, 3).getValues();
    templateData.forEach(row => {
      const tName = row[0].toString().trim();
      const eName = row[1].toString().trim();
      if (tName && eName) {
        if (!templates[tName]) templates[tName] = [];
        templates[tName].push({ name: eName, order: row[2] });
      }
    });
    for (const t in templates) templates[t].sort((a, b) => a.order - b.order);
  }

  // 動作名稱
  const exerciseNames = new Set();
  const logSheet = userSheet.getSheetByName(CONSTANTS.SHEETS.WORKOUT_LOG);
  if (logSheet && logSheet.getLastRow() > 1) {
    const motionData = logSheet.getRange(2, 2, logSheet.getLastRow() - 1, 1).getValues();
    motionData.forEach(row => {
      if (row[0] && typeof row[0] === 'string' && row[0].trim() !== '' && row[0] !== '動作總結' && row[0] !== '本日總結') {
        exerciseNames.add(row[0].trim());
      }
    });
  }

  return {
    status: 'success',
    profile: profile,
    allUsers: allUsers,
    templates: templates,
    exerciseNames: Array.from(exerciseNames)
  };
}

function _handleGetAnalysisData(auth, params) {
  const targetEmail = _resolveTargetEmail(auth, params.userEmail);
  const cache = CacheService.getUserCache();
  const cacheKey = `analysis_data_${targetEmail}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return JSON.parse(cachedData);

  const userSheet = _getUserSheet(targetEmail, true);
  if (!userSheet) throw new Error(`無法獲取使用者 ${targetEmail} 的資料表。`);

  // 體態歷史
  const weightHistory = [], bodyfatHistory = [];
  const profileSheet = userSheet.getSheetByName(CONSTANTS.SHEETS.PROFILE);
  if (profileSheet && profileSheet.getLastRow() > 1) {
    const data = profileSheet.getRange(2, 1, profileSheet.getLastRow() - 1, profileSheet.getLastColumn()).getValues();
    const headers = profileSheet.getRange(1, 1, 1, profileSheet.getLastColumn()).getValues()[0];
    const dateIdx = headers.indexOf(CONSTANTS.HEADERS.UPDATE_DATE);
    const weightIdx = headers.indexOf(CONSTANTS.HEADERS.WEIGHT);
    const bfIdx = headers.indexOf(CONSTANTS.HEADERS.BODYFAT);
    data.forEach(row => {
      if (row[dateIdx] instanceof Date) {
        const iso = row[dateIdx].toISOString();
        if (row[weightIdx]) weightHistory.push({ x: iso, y: parseFloat(row[weightIdx]) });
        if (row[bfIdx]) bodyfatHistory.push({ x: iso, y: parseFloat(row[bfIdx]) });
      }
    });
  }

  // 訓練數據
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - (ANALYSIS_CONSTANTS.DAYS_FOR_HISTORY * ANALYSIS_CONSTANTS.ONE_DAY_MS));
  const thirtyDaysAgo = new Date(now.getTime() - (ANALYSIS_CONSTANTS.DAYS_FOR_DISTRIBUTION * ANALYSIS_CONSTANTS.ONE_DAY_MS));
  const categoryMap = _getExerciseCategoryMap(userSheet);
  const volumeHistory = [], volumeHistoryByCategory = {}, singleExerciseProgress = {};
  const dailyWorkouts = {};
  const logSheet = userSheet.getSheetByName(CONSTANTS.SHEETS.WORKOUT_LOG);
  if (logSheet && logSheet.getLastRow() > 1) {
    const indices = _getHeaderIndices(logSheet);
    const logData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 9).getValues();
    let currentDate = null;
    logData.forEach(row => {
      if (row[0] instanceof Date) currentDate = row[0];
      const motion = row[indices[CONSTANTS.HEADERS.MOTION]];
      const reps = row[indices[CONSTANTS.HEADERS.REPS]];
      const weightKg = row[indices[CONSTANTS.HEADERS.WEIGHT_KG]];
      const note = row[indices[CONSTANTS.HEADERS.NOTES]];
      const adminNote = row[indices[CONSTANTS.HEADERS.ADMIN_COMMENT]];
      if (currentDate && motion && reps && weightKg && motion !== '本日總結' && motion !== '動作總結') {
        const dateString = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
        if (!dailyWorkouts[dateString]) dailyWorkouts[dateString] = [];
        dailyWorkouts[dateString].push({
          motion, reps: parseFloat(reps), weight: parseFloat(weightKg),
          volume: parseFloat(reps) * parseFloat(weightKg),
          note: note || '', adminNote: adminNote || ''
        });
      }
    });
  }

  const allSortedDates = Object.keys(dailyWorkouts).sort();
  allSortedDates.forEach(dateStr => {
    const workouts = dailyWorkouts[dateStr];
    let dailyTotalVolume = 0, dailyCategoryVolume = {}, dailyMotionStats = {};
    workouts.forEach(set => {
      dailyTotalVolume += set.volume;
      const category = categoryMap.get(set.motion) || '其他';
      dailyCategoryVolume[category] = (dailyCategoryVolume[category] || 0) + set.volume;
      if (!dailyMotionStats[set.motion]) dailyMotionStats[set.motion] = { maxWeight: 0, bestE1RM: 0, totalVolume: 0, note: '', adminNote: '' };
      if (!dailyMotionStats[set.motion].note && set.note) dailyMotionStats[set.motion].note = set.note;
      if (!dailyMotionStats[set.motion].adminNote && set.adminNote) dailyMotionStats[set.motion].adminNote = set.adminNote;
      const stats = dailyMotionStats[set.motion];
      stats.totalVolume += set.volume;
      if (set.weight > stats.maxWeight) stats.maxWeight = set.weight;
      const est1RM = set.reps === 1 ? set.weight : set.weight * 36 / (37 - set.reps);
      if (est1RM > stats.bestE1RM) stats.bestE1RM = est1RM;
    });
    const isoDate = new Date(dateStr).toISOString();
    volumeHistory.push({ x: isoDate, y: dailyTotalVolume });
    volumeHistoryByCategory[dateStr] = dailyCategoryVolume;
    for (const motion in dailyMotionStats) {
      if (!singleExerciseProgress[motion]) singleExerciseProgress[motion] = [];
      const stats = dailyMotionStats[motion];
      singleExerciseProgress[motion].push({
        x: isoDate, maxWeight: stats.maxWeight,
        bestE1RM: parseFloat(stats.bestE1RM.toFixed(2)),
        totalVolume: parseFloat(stats.totalVolume.toFixed(2)),
        note: stats.note, adminNote: stats.adminNote
      });
    }
  });

  const finalVolumeHistory = volumeHistory.filter(d => new Date(d.x) >= ninetyDaysAgo);
  for (const motion in singleExerciseProgress) {
    singleExerciseProgress[motion] = singleExerciseProgress[motion].filter(d => new Date(d.x) >= ninetyDaysAgo);
  }
  const categoryVolumeDistribution = {};
  allSortedDates.filter(d => new Date(d) >= thirtyDaysAgo).forEach(dateStr => {
    const dv = volumeHistoryByCategory[dateStr];
    if (dv) for (const cat in dv) categoryVolumeDistribution[cat] = (categoryVolumeDistribution[cat] || 0) + dv[cat];
  });

  const sortByDate = (a, b) => new Date(a.x) - new Date(b.x);
  weightHistory.sort(sortByDate);
  bodyfatHistory.sort(sortByDate);

  const result = {
    status: 'success',
    weightHistory, bodyfatHistory, volumeHistory: finalVolumeHistory,
    volumeHistoryByCategory, singleExerciseProgress,
    workoutFrequency: allSortedDates, categoryVolumeDistribution
  };
  cache.put(cacheKey, JSON.stringify(result), 7200);
  return result;
}

function _handleGetLatestPerformance(auth, params) {
  const KG_TO_LB = 2.20462262;
  const targetEmail = _resolveTargetEmail(auth, params.userEmail);
  const exerciseName = params.exerciseName;
  if (!exerciseName) return { status: 'success', data: null };
  const userSheet = _getUserSheet(targetEmail);
  if (!userSheet) return { status: 'success', data: null };
  const logSheet = userSheet.getSheetByName(CONSTANTS.SHEETS.WORKOUT_LOG);
  if (!logSheet || logSheet.getLastRow() < 2) return { status: 'success', data: null };
  const indices = _getHeaderIndices(logSheet);
  const data = logSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][indices[CONSTANTS.HEADERS.MOTION]] === exerciseName && data[i][indices[CONSTANTS.HEADERS.REPS]] && data[i][indices[CONSTANTS.HEADERS.WEIGHT_KG]]) {
      const wkg = data[i][indices[CONSTANTS.HEADERS.WEIGHT_KG]];
      return { status: 'success', data: { weight_kg: wkg, weight_lbs: parseFloat((wkg * KG_TO_LB).toFixed(2)), reps: data[i][indices[CONSTANTS.HEADERS.REPS]] } };
    }
  }
  return { status: 'success', data: null };
}

function _handleGetUniqueExerciseNames(auth, params) {
  const targetEmail = _resolveTargetEmail(auth, params.userEmail);
  const userSheet = _getUserSheet(targetEmail);
  if (!userSheet) return { status: 'success', data: [] };
  const names = new Set();
  const logSheet = userSheet.getSheetByName(CONSTANTS.SHEETS.WORKOUT_LOG);
  if (logSheet && logSheet.getLastRow() > 1) {
    logSheet.getRange(2, 2, logSheet.getLastRow() - 1, 1).getValues().forEach(row => {
      if (row[0] && typeof row[0] === 'string' && row[0].trim() !== '' && row[0] !== '動作總結' && row[0] !== '本日總結') names.add(row[0].trim());
    });
  }
  return { status: 'success', data: Array.from(names) };
}

function _handleGetWorkoutTemplates(auth, params) {
  const targetEmail = _resolveTargetEmail(auth, params.userEmail);
  const userSheet = _getUserSheet(targetEmail, true);
  if (!userSheet) return { status: 'success', data: {} };
  const templateSheet = _getOrCreateSheet(userSheet, CONSTANTS.SHEETS.TEMPLATES);
  if (templateSheet.getLastRow() < 2) return { status: 'success', data: {} };
  const data = templateSheet.getRange(2, 1, templateSheet.getLastRow() - 1, 3).getValues();
  const templates = {};
  data.forEach(row => {
    const tName = row[0].toString().trim();
    const eName = row[1];
    if (!tName || !eName) return;
    if (!templates[tName]) templates[tName] = [];
    templates[tName].push({ name: eName, order: row[2] });
  });
  for (const t in templates) templates[t].sort((a, b) => a.order - b.order);
  return { status: 'success', data: templates };
}

function _handleGetAllPRs(auth, params) {
  const targetEmail = _resolveTargetEmail(auth, params.userEmail);
  const userSheet = _getUserSheet(targetEmail);
  if (!userSheet) return { status: 'success', bests: [], repPRs: [] };
  const categoryMap = _getExerciseCategoryMap(userSheet);
  const bests = [], repPRs = [];
  const bestsSheet = userSheet.getSheetByName('Bests');
  if (bestsSheet && bestsSheet.getLastRow() > 1) {
    bestsSheet.getRange(2, 1, bestsSheet.getLastRow() - 1, 5).getValues().forEach(row => {
      bests.push({
        motion: row[0], heaviestWeight: row[1],
        bestEst1RM: row[2] ? parseFloat(row[2]).toFixed(1) : 0,
        heaviestDate: row[3] instanceof Date ? row[3].toLocaleDateString() : 'N/A',
        e1rmDate: row[4] instanceof Date ? row[4].toLocaleDateString() : 'N/A',
        category: categoryMap.get(row[0]) || '其他'
      });
    });
  }
  const prsSheet = userSheet.getSheetByName('PRs');
  if (prsSheet && prsSheet.getLastRow() > 1) {
    prsSheet.getRange(2, 1, prsSheet.getLastRow() - 1, 4).getValues().forEach(row => {
      repPRs.push({
        motion: row[0], rmCategory: row[1], weight: row[2],
        date: row[3] instanceof Date ? row[3].toLocaleDateString() : 'N/A',
        category: categoryMap.get(row[0]) || '其他'
      });
    });
  }
  return { status: 'success', bests, repPRs };
}

function _handleGetAllPhotoRecords(auth, params) {
  const targetEmail = _resolveTargetEmail(auth, params.userEmail);
  const userSheet = _getUserSheet(targetEmail);
  if (!userSheet) return { status: 'success', data: [] };
  const sheet = userSheet.getSheetByName(CONSTANTS.SHEETS.BODY_PHOTOS);
  if (!sheet || sheet.getLastRow() < 2) return { status: 'success', data: [] };
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const records = data.map(row => ({
    date: row[0] instanceof Date ? row[0].toISOString() : null,
    photo_front_id: row[1], photo_side_id: row[2], photo_back_id: row[3]
  })).filter(r => r.date);
  records.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { status: 'success', data: records };
}


// =======================================================
// POST 處理函式 (Write Operations)
// =======================================================

function _handleSaveProfileData(auth, data) {
  if (!data || typeof data !== 'object') throw new Error('無效的個人資料格式。');
  const userSheet = _getUserSheet(auth.email, true);
  if (!userSheet) throw new Error('找不到您的資料檔案。');
  const profileSheet = _getOrCreateSheet(userSheet, 'Profile');
  _ensureProfileHeaders(profileSheet);
  const latestData = _getLatestProfileData(userSheet);
  const mergedData = { ...latestData, ...data };
  const headers = profileSheet.getRange(1, 1, 1, profileSheet.getLastColumn()).getValues()[0];
  const newRowData = headers.map(h => h === '更新日期' ? new Date() : (mergedData[h] !== undefined && mergedData[h] !== null ? mergedData[h] : ''));
  profileSheet.appendRow(newRowData);
  profileSheet.sort(1, false);
  return { status: 'success', message: '個人資料已成功更新！' };
}

function _handleSaveWorkoutData(auth, data) {
  if (!data || !Array.isArray(data.workoutData) || data.workoutData.length === 0) throw new Error('無效的訓練資料。');
  const cache = CacheService.getUserCache();
  cache.remove(`analysis_data_${auth.email}`);
  const userSheet = _getUserSheet(auth.email, true);
  if (!userSheet) throw new Error('找不到您的資料檔案。');
  const date = new Date(data.workoutData[0].date);
  const logSheet = _getOrCreateSheet(userSheet, CONSTANTS.SHEETS.WORKOUT_LOG);
  const savedAdminComments = _clearTodaysLog(logSheet, date);
  _writeNewLog(logSheet, date, data.workoutData, savedAdminComments);
  return { status: 'success', message: '訓練日誌已成功儲存！' };
}

function _handleSaveBodyPhotos(auth, data) {
  if (!data || !data.date) throw new Error('缺少日期。');
  const cache = CacheService.getUserCache();
  if (data.weight || data.bodyfat) cache.remove(`analysis_data_${auth.email}`);
  const userSheet = _getUserSheet(auth.email, true);
  if (!userSheet) throw new Error('找不到您的資料檔案。');
  const dateParts = data.date.split('-');
  const recordDate = new Date();
  recordDate.setFullYear(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));

  let hasNewPhotos = false;
  if (data.front || data.side || data.back) {
    const photosFolder = DriveApp.getFolderById(CONFIG.PHOTOS_FOLDER_ID);
    let userPhotoFolder;
    const folders = photosFolder.getFoldersByName(auth.email);
    userPhotoFolder = folders.hasNext() ? folders.next() : photosFolder.createFolder(auth.email);
    const dateString = Utilities.formatDate(recordDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const photoIds = {};
    ['front', 'side', 'back'].forEach(type => {
      if (data[type]) {
        const fileData = data[type];
        const mimeType = fileData.substring(5, fileData.indexOf(';'));
        const bytes = Utilities.base64Decode(fileData.substring(fileData.indexOf('base64,') + 7));
        const blob = Utilities.newBlob(bytes, mimeType, `${dateString}-${type}.jpg`);
        photoIds[`photo_${type}_id`] = userPhotoFolder.createFile(blob).getId();
      }
    });
    if (Object.keys(photoIds).length > 0) {
      _updateBodyPhotosSheet(userSheet, recordDate, photoIds);
      hasNewPhotos = true;
    }
  }

  let updatedProfileData = null;
  const profileUpdateData = {};
  if (data.weight && data.weight !== '') profileUpdateData.weight = data.weight;
  if (data.bodyfat && data.bodyfat !== '') profileUpdateData.bodyfat = data.bodyfat;
  if (Object.keys(profileUpdateData).length > 0) {
    const profileSheet = _getOrCreateSheet(userSheet, 'Profile');
    const latestData = _getLatestProfileData(userSheet);
    const mergedData = { ...latestData, ...profileUpdateData, '更新日期': recordDate };
    const headers = profileSheet.getRange(1, 1, 1, profileSheet.getLastColumn()).getValues()[0];
    profileSheet.appendRow(headers.map(h => mergedData[h] !== undefined ? mergedData[h] : ''));
    profileSheet.sort(1, false);
    updatedProfileData = _getLatestProfileData(userSheet);
    if (updatedProfileData && updatedProfileData['更新日期'] instanceof Date) updatedProfileData['更新日期'] = updatedProfileData['更新日期'].toISOString();
  }

  const latestPhotos = _getLatestPhotos(userSheet);
  if (latestPhotos && latestPhotos.date instanceof Date) latestPhotos.date = latestPhotos.date.toISOString();
  if (!hasNewPhotos && !updatedProfileData) return { status: 'warning', message: '沒有提供任何新的照片或數據。' };
  return { status: 'success', message: '資料已成功儲存！', latestPhotos, updatedProfileData };
}

function _handleSaveWorkoutTemplate(auth, data) {
  if (!data || !data.templateName || !data.exercises || data.exercises.length === 0) throw new Error('範本名稱和動作不可為空。');
  const userSheet = _getUserSheet(auth.email, true);
  if (!userSheet) throw new Error('找不到您的資料檔案。');
  const templateSheet = _getOrCreateSheet(userSheet, 'Templates');
  const cleanName = data.templateName.trim();
  if (templateSheet.getLastRow() > 1) {
    const sheetData = templateSheet.getDataRange().getValues();
    sheetData.shift();
    const filtered = sheetData.filter(r => r[0].toString().trim() !== cleanName);
    if (templateSheet.getLastRow() > 1) templateSheet.getRange(2, 1, templateSheet.getLastRow() - 1, templateSheet.getLastColumn()).clearContents();
    if (filtered.length > 0) templateSheet.getRange(2, 1, filtered.length, filtered[0].length).setValues(filtered);
  }
  const newRows = data.exercises.map((ex, i) => [cleanName, ex, i + 1]);
  if (newRows.length > 0) templateSheet.getRange(templateSheet.getLastRow() + 1, 1, newRows.length, 3).setValues(newRows);
  return { status: 'success', message: `範本「${cleanName}」已成功儲存！` };
}

function _handleDeleteWorkoutTemplate(auth, data) {
  if (!data || !data.templateName) throw new Error('範本名稱不可為空。');
  const userSheet = _getUserSheet(auth.email, false);
  if (!userSheet) throw new Error('找不到您的資料檔案。');
  const templateSheet = userSheet.getSheetByName('Templates');
  if (!templateSheet || templateSheet.getLastRow() < 2) return { status: 'success', message: '範本不存在。' };
  const sheetData = templateSheet.getDataRange().getValues();
  sheetData.shift();
  const newData = sheetData.filter(r => r[0].toString().trim() !== data.templateName);
  if (newData.length === sheetData.length) return { status: 'warning', message: `找不到「${data.templateName}」。` };
  if (templateSheet.getLastRow() > 1) templateSheet.getRange(2, 1, templateSheet.getLastRow() - 1, templateSheet.getLastColumn()).clearContents();
  if (newData.length > 0) templateSheet.getRange(2, 1, newData.length, newData[0].length).setValues(newData);
  return { status: 'success', message: `範本「${data.templateName}」已刪除！` };
}

function _handleProcessWorkoutForPRs(auth, data) {
  if (!data || !data.workoutData || data.workoutData.length === 0) return { status: 'error', message: '無效的訓練資料。' };
  const userSheet = _getUserSheet(auth.email, true);
  const prsSheet = _getOrCreateSheet(userSheet, 'PRs');
  const bestsSheet = _getOrCreateSheet(userSheet, 'Bests');
  // 簡化版本：清理當日 + 處理 PR
  const workoutDate = new Date(data.workoutData[0].date);
  const workoutDateString = workoutDate.toLocaleDateString();
  // 清理當日 PR 記錄
  let prsValues;
  if (prsSheet.getLastRow() > 1) {
    prsValues = prsSheet.getDataRange().getValues();
    const filtered = prsValues.filter((row, i) => i === 0 || new Date(row[3]).toLocaleDateString() !== workoutDateString);
    prsSheet.clearContents();
    if (filtered.length > 0) prsSheet.getRange(1, 1, filtered.length, filtered[0].length).setValues(filtered);
    prsValues = filtered;
  } else {
    prsValues = prsSheet.getDataRange().getValues();
  }

  const bestsValues = bestsSheet.getDataRange().getValues();
  const prsMap = new Map(prsValues.slice(1).map((r, i) => [`${r[0]}-${r[1]}`, { maxWeight: r[2], rowIndex: i + 2 }]));
  const bestsMap = new Map(bestsValues.slice(1).map((r, i) => [r[0], { heaviest: r[1], bestE1RM: r[2], rowIndex: i + 2 }]));
  const sessionBestPRs = new Map();
  const newPrsRows = [], newBestsRows = [];

  data.workoutData.forEach(setData => {
    const motion = setData.motion;
    const reps = parseInt(setData.reps);
    const weight = parseFloat(setData.weight_in_kg);
    const date = new Date(setData.date);
    if (!motion || !reps || !weight || reps <= 0 || weight <= 0) return;
    let rmCategory;
    if (reps <= 2) rmCategory = 1; else if (reps <= 4) rmCategory = 3; else if (reps <= 7) rmCategory = 5; else if (reps <= 9) rmCategory = 8; else rmCategory = 10;
    const est1RM = reps === 1 ? weight : weight * 36 / (37 - reps);
    const prsKey = `${motion}-${rmCategory}`;
    const existingRepPR = prsMap.get(prsKey);
    if (!existingRepPR || weight > existingRepPR.maxWeight) {
      if (!existingRepPR) { newPrsRows.push([motion, rmCategory, weight, date, est1RM]); prsMap.set(prsKey, { maxWeight: weight }); }
      const sk = `rep-${motion}-${rmCategory}`;
      const cb = sessionBestPRs.get(sk);
      if (!cb || weight > cb.weight) sessionBestPRs.set(sk, { type: 'Rep', motion, rmCategory, weight, reps });
    }
    const existingBests = bestsMap.get(motion);
    if (!existingBests) {
      newBestsRows.push([motion, weight, est1RM, date, date]);
      bestsMap.set(motion, { heaviest: weight, bestE1RM: est1RM });
      sessionBestPRs.set(`best-heaviest-${motion}`, { type: 'Heaviest', motion, weight, reps });
      sessionBestPRs.set(`best-e1rm-${motion}`, { type: 'E1RM', motion, est1RM, weight, reps });
    } else {
      if (weight > existingBests.heaviest) {
        existingBests.heaviest = weight;
        const sk = `best-heaviest-${motion}`;
        const cb = sessionBestPRs.get(sk);
        if (!cb || weight > cb.weight) sessionBestPRs.set(sk, { type: 'Heaviest', motion, weight, reps });
      }
      if (est1RM > existingBests.bestE1RM) {
        existingBests.bestE1RM = est1RM;
        const sk = `best-e1rm-${motion}`;
        const cb = sessionBestPRs.get(sk);
        if (!cb || est1RM > cb.est1RM) sessionBestPRs.set(sk, { type: 'E1RM', motion, est1RM, weight, reps });
      }
    }
  });

  if (newPrsRows.length > 0) prsSheet.getRange(prsSheet.getLastRow() + 1, 1, newPrsRows.length, 5).setValues(newPrsRows);
  if (newBestsRows.length > 0) bestsSheet.getRange(bestsSheet.getLastRow() + 1, 1, newBestsRows.length, 5).setValues(newBestsRows);

  const finalPRMessages = [];
  for (const pr of sessionBestPRs.values()) {
    switch (pr.type) {
      case 'Rep': finalPRMessages.push(`🎉 重量 PR！（${pr.rmCategory}RM 新高）: ${pr.motion} (${pr.weight}kg x ${pr.reps}次)`); break;
      case 'Heaviest': finalPRMessages.push(`🚀 重量 PR！（史上最重）: ${pr.motion} (${pr.weight}kg x ${pr.reps}次)`); break;
      case 'E1RM': finalPRMessages.push(`🔥 推估力量 PR！（E1RM 新高）: ${pr.motion} (推估 ${Math.round(pr.est1RM)}kg)`); break;
    }
  }
  return { status: 'success', newPRs: finalPRMessages };
}

function _handleSaveAdminComment(auth, data) {
  if (!auth.isAdmin) return { status: 'error', message: '權限不足。' };
  if (!data || !data.userEmail || !data.dateString || !data.motion) throw new Error('缺少必要參數。');
  const targetUserSheet = _getUserSheet(data.userEmail, false);
  if (!targetUserSheet) throw new Error(`找不到使用者 ${data.userEmail} 的資料檔案。`);
  const logSheet = targetUserSheet.getSheetByName(CONSTANTS.SHEETS.WORKOUT_LOG);
  if (!logSheet || logSheet.getLastRow() < 2) throw new Error('無訓練記錄。');
  const indices = _getHeaderIndices(logSheet);
  const lastRow = logSheet.getLastRow();
  const dateColumn = logSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const motionColumn = logSheet.getRange(2, indices[CONSTANTS.HEADERS.MOTION] + 1, lastRow - 1, 1).getValues();
  let rowToUpdate = -1, startIdx = -1;
  for (let i = 0; i < dateColumn.length; i++) {
    if (dateColumn[i][0] instanceof Date) {
      try {
        if (Utilities.formatDate(dateColumn[i][0], "Asia/Taipei", "yyyy-MM-dd") === data.dateString) { startIdx = i; break; }
      } catch (e) { /* skip */ }
    }
  }
  if (startIdx === -1) throw new Error(`找不到日期 ${data.dateString} 的紀錄。`);
  const cleanStr = s => (typeof s === 'string') ? s.replace(/\s/g, '') : '';
  const cleanedMotion = cleanStr(data.motion);
  for (let j = startIdx; j < dateColumn.length; j++) {
    if (j > startIdx && dateColumn[j][0] instanceof Date) break;
    if (motionColumn[j][0] && cleanStr(motionColumn[j][0].toString()) === cleanedMotion) { rowToUpdate = j + 2; break; }
  }
  if (rowToUpdate === -1) throw new Error(`找不到動作 ${data.motion}。`);
  logSheet.getRange(rowToUpdate, indices[CONSTANTS.HEADERS.ADMIN_COMMENT] + 1).setValue(data.comment);
  CacheService.getUserCache().remove(`analysis_data_${data.userEmail}`);
  return { status: 'success', message: '指導建議已成功儲存！' };
}

function _handleUpdateExerciseCategories(auth, data) {
  if (!data || !data.changes || data.changes.length === 0) return { status: 'warning', message: '沒有需要更新的分類。' };
  const userSheet = _getUserSheet(auth.email, true);
  const exerciseSheet = _getOrCreateSheet(userSheet, 'ExerciseMaster');
  const range = exerciseSheet.getDataRange();
  const values = range.getValues();
  const motionMap = new Map();
  for (let i = 1; i < values.length; i++) motionMap.set(values[i][0].toString().trim(), i);
  const newRows = [];
  data.changes.forEach(change => {
    if (motionMap.has(change.motion.trim())) {
      values[motionMap.get(change.motion.trim())][1] = change.category;
    } else {
      newRows.push([change.motion, change.category]);
    }
  });
  range.setValues(values);
  if (newRows.length > 0) exerciseSheet.getRange(exerciseSheet.getLastRow() + 1, 1, newRows.length, 2).setValues(newRows);
  SpreadsheetApp.flush();
  const cache = CacheService.getUserCache();
  cache.remove(`category_map_${userSheet.getId()}`);
  return { status: 'success', message: '已成功儲存所有分類變更！' };
}

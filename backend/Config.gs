// =======================================================
// 全域設定 (Global Configuration)
// =======================================================

/**
 * 從 Script Properties 中讀取設定，並提供給整個後端使用。
 * 在 GAS 編輯器 -> 專案設定 -> 指令碼屬性 中配置以下值：
 *   - ADMIN_EMAIL
 *   - DATA_FOLDER_ID
 *   - PHOTOS_FOLDER_ID
 *   - CONFIG_SHEET_ID (白名單所在的試算表 ID)
 *   - GOOGLE_CLIENT_ID (Google Cloud Console OAuth2 Client ID)
 */
function _getScriptProperties() {
  try {
    const properties = PropertiesService.getScriptProperties();
    return {
      ADMIN_EMAIL: properties.getProperty('ADMIN_EMAIL'),
      DATA_FOLDER_ID: properties.getProperty('DATA_FOLDER_ID'),
      PHOTOS_FOLDER_ID: properties.getProperty('PHOTOS_FOLDER_ID'),
      CONFIG_SHEET_ID: properties.getProperty('CONFIG_SHEET_ID'),
      GOOGLE_CLIENT_ID: properties.getProperty('GOOGLE_CLIENT_ID')
    };
  } catch (e) {
    Logger.log("嚴重錯誤：無法讀取指令碼屬性。" + e.toString());
    return {
      ADMIN_EMAIL: null,
      DATA_FOLDER_ID: null,
      PHOTOS_FOLDER_ID: null,
      CONFIG_SHEET_ID: null,
      GOOGLE_CLIENT_ID: null
    };
  }
}

// =======================================================
// 全域常數 (Global Constants)
// =======================================================
const CONFIG = _getScriptProperties();

const ANALYSIS_CONSTANTS = {
  DAYS_FOR_HISTORY: 90,
  DAYS_FOR_DISTRIBUTION: 30,
  DAYS_FOR_PHOTO_REMINDER: 30,
  ONE_DAY_MS: 24 * 60 * 60 * 1000
};

const CONSTANTS = {
  SHEETS: {
    PROFILE: 'Profile',
    BODY_PHOTOS: 'BodyPhotos',
    PRS: 'PRs',
    BESTS: 'Bests',
    EXERCISE_MASTER: 'ExerciseMaster',
    TEMPLATES: 'Templates',
    WORKOUT_LOG: 'WorkoutLog'
  },
  HEADERS: {
    UPDATE_DATE: '更新日期',
    MOTION: '動作(Motion)',
    SETS: '組數(set)',
    REPS: '次數(reps)',
    WEIGHT_KG: '重量(kg)',
    WEIGHT_LBS: '重量(lbs)',
    VOLUME: '容量(Volume)',
    NOTES: '備註(Notes)',
    ADMIN_COMMENT: '指導建議',
    CATEGORY: 'Category',
    NAME: 'name',
    AGE: 'age',
    GENDER: 'gender',
    HEIGHT: 'height',
    WEIGHT: 'weight',
    BODYFAT: 'bodyfat',
    INBODY_SCORE: 'inbody_score',
    SMM: 'smm',
    BFM: 'bfm',
    BMI: 'bmi',
    VFL: 'vfl'
  }
};

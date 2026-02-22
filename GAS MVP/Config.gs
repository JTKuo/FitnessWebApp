
// =======================================================
// 全域設定 (Global Configuration)
// =======================================================

/**
 * 從 Script Properties 中讀取設定，並提供給整個後端使用。
 * @returns {object} 包含所有設定的物件。
 */
function _getScriptProperties() {
  try {
    const properties = PropertiesService.getScriptProperties();
    return {
      ADMIN_EMAIL: properties.getProperty('ADMIN_EMAIL'),
      DATA_FOLDER_ID: properties.getProperty('DATA_FOLDER_ID'),
      PHOTOS_FOLDER_ID: properties.getProperty('PHOTOS_FOLDER_ID')
    };
  } catch (e) {
    Logger.log("嚴重錯誤：無法讀取指令碼屬性。請檢查專案設定。 " + e.toString());
    // 如果讀取失敗，返回 null 或拋出錯誤，讓其他函式知道設定無效
    return {
      ADMIN_EMAIL: null,
      DATA_FOLDER_ID: null,
      PHOTOS_FOLDER_ID: null
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
    VFL: 'vfl',
    // ...未來可以繼續增加其他欄位
  }
};

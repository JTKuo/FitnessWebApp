// =======================================================
// 安全驗證模組 (Security Module)
// =======================================================

/**
 * 驗證前端傳來的 Google ID Token。
 * 使用 Google 的 tokeninfo 端點來驗證 Token 的有效性。
 *
 * @param {string} idToken - 前端透過 Google Identity Services 取得的 ID Token。
 * @returns {object|null} - 驗證成功則回傳包含 email 的 payload，失敗則回傳 null。
 */
function _verifyGoogleToken(idToken) {
  if (!idToken) return null;
  try {
    const response = UrlFetchApp.fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );
    const payload = JSON.parse(response.getContentText());

    // 驗證 Audience (aud) 是否與我們的 Client ID 一致
    if (payload.aud !== CONFIG.GOOGLE_CLIENT_ID) {
      Logger.log(`Token 驗證失敗：aud 不匹配。預期 ${CONFIG.GOOGLE_CLIENT_ID}，實際 ${payload.aud}`);
      return null;
    }
    // 驗證 Token 是否過期
    if (payload.exp && parseInt(payload.exp) * 1000 < Date.now()) {
      Logger.log('Token 驗證失敗：Token 已過期。');
      return null;
    }
    return payload; // 包含 email, name, picture 等欄位
  } catch (e) {
    Logger.log('Token 驗證失敗：' + e.toString());
    return null;
  }
}

/**
 * 檢查指定的 Email 是否在白名單試算表中，且狀態為 Active。
 *
 * 白名單試算表結構 (Whitelist 工作表)：
 *   A 欄: Email
 *   B 欄: Role (Admin / User)
 *   C 欄: Status (Active / Inactive)
 *
 * @param {string} email - 要檢查的 Email。
 * @returns {object|null} - 如果在白名單中且 Active，回傳 {email, role, status}；否則回傳 null。
 */
function _checkWhitelist(email) {
  if (!email || !CONFIG.CONFIG_SHEET_ID) return null;
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = `whitelist_${email.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed.status === 'Active' ? parsed : null;
    }

    const ss = SpreadsheetApp.openById(CONFIG.CONFIG_SHEET_ID);
    const sheet = ss.getSheetByName('Whitelist');
    if (!sheet || sheet.getLastRow() < 2) return null;

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
        const entry = {
          email: data[i][0].toString().trim(),
          role: data[i][1].toString().trim(),
          status: data[i][2].toString().trim()
        };
        // 將結果快取 10 分鐘
        cache.put(cacheKey, JSON.stringify(entry), 600);
        return entry.status === 'Active' ? entry : null;
      }
    }
    return null;
  } catch (e) {
    Logger.log('白名單檢查失敗：' + e.toString());
    return null;
  }
}

/**
 * 統一的身份驗證函式。前端每個 API 請求都必須經過此函式。
 * 
 * @param {string} idToken - 前端傳來的 Google ID Token。
 * @returns {object} - { authorized: true, email, role, isAdmin } 或 { authorized: false, error }
 */
function _authenticate(idToken) {
  // 步驟 1: 驗證 Google Token
  const tokenPayload = _verifyGoogleToken(idToken);
  if (!tokenPayload || !tokenPayload.email) {
    return { authorized: false, error: '身份驗證失敗：無效的 Google Token。' };
  }

  // 步驟 2: 檢查白名單
  const whitelistEntry = _checkWhitelist(tokenPayload.email);
  if (!whitelistEntry) {
    return { authorized: false, error: '存取遭拒：您的帳號尚未獲得授權，請聯繫管理員。' };
  }

  // 步驟 3: 回傳驗證結果
  return {
    authorized: true,
    email: tokenPayload.email,
    name: tokenPayload.name || tokenPayload.email.split('@')[0],
    picture: tokenPayload.picture || '',
    role: whitelistEntry.role,
    isAdmin: whitelistEntry.role === 'Admin'
  };
}

/**
 * 產生 JSON 格式的回應。
 * @param {object} data - 要回傳的資料物件。
 * @returns {TextOutput} - ContentService 的 JSON 回應。
 */
function _createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 產生錯誤的 JSON 回應。
 * @param {string} message - 錯誤訊息。
 * @returns {TextOutput} - ContentService 的 JSON 錯誤回應。
 */
function _createErrorResponse(message) {
  return _createJsonResponse({ status: 'error', error: message });
}

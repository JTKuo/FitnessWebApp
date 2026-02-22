/**
 * apiService.js - 前端與 GAS 後端 API 的溝通層
 * 
 * 所有對後端的請求都會自動帶入 Google ID Token 進行身份驗證。
 * 處理了 GAS Web App 特有的 Redirect 問題（需要 follow redirect）。
 */

const API_SERVICE = (() => {
    // ⚠️ 部署 GAS Web App 後，將此 URL 替換為您的 GAS Web App URL
    const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz_cV2QMA0sTBScOAivlJItvJ_0U9f8tGFma3ah47tRJp-WPSgeNrJR_ZZ5sxB7nbzi/exec';

    let _idToken = null;

    /**
     * 設定當前的 ID Token（登入後由 Google Identity Services 提供）。
     */
    function setToken(token) {
        _idToken = token;
    }

    /**
     * 取得當前的 ID Token。
     */
    function getToken() {
        return _idToken;
    }

    /**
     * 清除 Token（登出時使用）。
     */
    function clearToken() {
        _idToken = null;
    }

    /**
     * 發送 GET 請求到 GAS 後端。
     * @param {string} action - API 動作名稱。
     * @param {object} params - 額外的 URL 參數。
     * @returns {Promise<object>} - 後端回傳的 JSON 資料。
     */
    async function get(action, params = {}) {
        if (!_idToken) throw new Error('尚未登入，請先登入 Google 帳號。');

        const url = new URL(GAS_WEB_APP_URL);
        url.searchParams.set('action', action);
        url.searchParams.set('token', _idToken);
        for (const key in params) {
            if (params[key] !== null && params[key] !== undefined) {
                url.searchParams.set(key, params[key]);
            }
        }

        try {
            // GAS Web App 會先回傳 302 redirect，fetch 需要追蹤
            const response = await fetch(url.toString(), {
                method: 'GET',
                redirect: 'follow'
            });

            if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            return data;
        } catch (error) {
            console.error(`API GET [${action}] 失敗:`, error);
            throw error;
        }
    }

    /**
     * 發送 POST 請求到 GAS 後端。
     * @param {string} action - API 動作名稱。
     * @param {object} data - 要傳送的資料。
     * @returns {Promise<object>} - 後端回傳的 JSON 資料。
     */
    async function post(action, data = {}) {
        if (!_idToken) throw new Error('尚未登入，請先登入 Google 帳號。');

        const body = {
            action: action,
            token: _idToken,
            data: data
        };

        try {
            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain' }, // GAS 對 POST 的 CORS 限制
                body: JSON.stringify(body)
            });

            if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);
            const result = await response.json();
            if (result.error) throw new Error(result.error);
            return result;
        } catch (error) {
            console.error(`API POST [${action}] 失敗:`, error);
            throw error;
        }
    }

    // === 封裝的 API 方法 ===

    return {
        setToken,
        getToken,
        clearToken,

        // GET 操作
        getInitialData: (userEmail) => get('getInitialData', { userEmail }),
        getAnalysisData: (userEmail) => get('getAnalysisData', { userEmail }),
        getLatestPerformance: (exerciseName, userEmail) => get('getLatestPerformance', { exerciseName, userEmail }),
        getUniqueExerciseNames: (userEmail) => get('getUniqueExerciseNames', { userEmail }),
        getWorkoutTemplates: (userEmail) => get('getWorkoutTemplates', { userEmail }),
        getAllPRs: (userEmail) => get('getAllPRs', { userEmail }),
        getAllPhotoRecords: (userEmail) => get('getAllPhotoRecords', { userEmail }),

        // POST 操作
        saveProfileData: (profileData) => post('saveProfileData', profileData),
        saveWorkoutData: (workoutData) => post('saveWorkoutData', { workoutData }),
        saveBodyPhotos: (photoData) => post('saveBodyPhotos', photoData),
        saveWorkoutTemplate: (templateName, exercises) => post('saveWorkoutTemplate', { templateName, exercises }),
        deleteWorkoutTemplate: (templateName) => post('deleteWorkoutTemplate', { templateName }),
        processWorkoutForPRs: (workoutData) => post('processWorkoutForPRs', { workoutData }),
        saveAdminComment: (userEmail, dateString, motion, comment) => post('saveAdminComment', { userEmail, dateString, motion, comment }),
        updateExerciseCategories: (changes) => post('updateExerciseCategories', { changes })
    };
})();

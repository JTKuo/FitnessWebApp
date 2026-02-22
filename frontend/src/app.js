/**
 * app.js - 主應用程式邏輯
 * 控制 Google 登入流程、頁面導覽、資料初始化
 */

const App = (() => {
    let _currentUser = null;
    let _initialData = null;

    /**
     * Google 登入成功的 Callback。
     */
    function handleGoogleLogin(response) {
        const idToken = response.credential;
        API_SERVICE.setToken(idToken);

        // 解碼 JWT 取得使用者基本資訊，顯示在 UI 上
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        _currentUser = {
            email: payload.email,
            name: payload.name,
            picture: payload.picture
        };

        // 顯示載入中畫面
        showLoading(true);
        hideLogin();

        // 從後端載入初始資料
        loadInitialData();
    }

    /**
     * 從 GAS 後端載入初始資料。
     */
    async function loadInitialData() {
        try {
            const result = await API_SERVICE.getInitialData();

            if (result.error) {
                showError(result.error);
                showLogin();
                return;
            }

            _initialData = result;

            // 更新使用者介面
            updateUserInfo(result.profile);
            showMainApp();
            showLoading(false);

            // 如果是管理員，顯示使用者切換
            if (result.profile.isAdmin && result.allUsers.length > 0) {
                showAdminPanel(result.allUsers);
            }

            // 顯示體態照片提醒
            if (result.profile.shouldShowReminder) {
                showPhotoReminder();
            }

        } catch (error) {
            showError('無法載入初始資料: ' + error.message);
            showLogin();
            showLoading(false);
        }
    }

    /**
     * 登出。
     */
    function logout() {
        API_SERVICE.clearToken();
        _currentUser = null;
        _initialData = null;
        hideMainApp();
        showLogin();
        // 重置 Google 登入狀態
        google.accounts.id.disableAutoSelect();
    }


    // =======================================================
    // UI 操作函式
    // =======================================================

    function showLogin() {
        document.getElementById('login-section').classList.remove('hidden');
    }

    function hideLogin() {
        document.getElementById('login-section').classList.add('hidden');
    }

    function showMainApp() {
        document.getElementById('main-app').classList.remove('hidden');
    }

    function hideMainApp() {
        document.getElementById('main-app').classList.add('hidden');
    }

    function showLoading(show) {
        const el = document.getElementById('loading-overlay');
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }

    function showError(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast toast-error show';
        setTimeout(() => toast.classList.remove('show'), 5000);
    }

    function showSuccess(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast toast-success show';
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function updateUserInfo(profile) {
        const el = document.getElementById('user-name');
        if (el) el.textContent = profile.name || profile.email;
        const avatarEl = document.getElementById('user-avatar');
        if (avatarEl && _currentUser.picture) {
            avatarEl.src = _currentUser.picture;
            avatarEl.classList.remove('hidden');
        }
    }

    function showAdminPanel(users) {
        const adminPanel = document.getElementById('admin-panel');
        if (!adminPanel) return;
        adminPanel.classList.remove('hidden');
        const select = document.getElementById('user-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- 選擇使用者 --</option>';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.email;
            opt.textContent = `${u.name} (${u.email})`;
            select.appendChild(opt);
        });
    }

    function showPhotoReminder() {
        const reminder = document.getElementById('photo-reminder');
        if (reminder) reminder.classList.remove('hidden');
    }


    // =======================================================
    // 頁面導覽
    // =======================================================

    function navigateTo(page) {
        document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`page-${page}`);
        if (target) target.classList.remove('hidden');

        // 更新導覽列的 active 狀態
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.querySelector(`[data-page="${page}"]`);
        if (activeNav) activeNav.classList.add('active');
    }


    // =======================================================
    // Public API
    // =======================================================

    return {
        handleGoogleLogin,
        logout,
        navigateTo,
        showLoading,
        showError,
        showSuccess,
        getInitialData: () => _initialData,
        getCurrentUser: () => _currentUser
    };
})();


// =======================================================
// DOM Ready - 初始化事件綁定
// =======================================================

document.addEventListener('DOMContentLoaded', () => {
    // 導覽列
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            App.navigateTo(item.dataset.page);
        });
    });

    // 登出按鈕
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', App.logout);

    // 管理員使用者切換
    const userSelect = document.getElementById('user-select');
    if (userSelect) {
        userSelect.addEventListener('change', async (e) => {
            const email = e.target.value;
            if (email) {
                App.showLoading(true);
                try {
                    const data = await API_SERVICE.getInitialData(email);
                    // 重新載入該使用者的資料
                    location.reload(); // 簡化版：重新載入頁面
                } catch (err) {
                    App.showError(err.message);
                }
                App.showLoading(false);
            }
        });
    }
});

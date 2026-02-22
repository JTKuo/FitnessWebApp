/**
 * app.js - 主應用程式邏輯
 * 處理 Google 登入、頁面導覽、管理員面板、通知系統。
 * 依照原始 GAS MVP 的工業風格重新設計。
 */

// --- Google Login Callback ---
function handleGoogleLogin(response) {
    if (response.credential) {
        API_SERVICE.setToken(response.credential);

        // Decode JWT to get user info
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        APP.currentUser = {
            email: payload.email,
            name: payload.name || payload.email.split('@')[0],
            picture: payload.picture || ''
        };

        // Hide login, show app
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');

        loadInitialData();
    }
}

// --- App Core ---
const APP = {
    currentUser: null,
    currentPage: 'dashboard',
    isAdmin: false,
    profileData: null,

    // Toast notification
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast-notification');
        const toastMsg = document.getElementById('toast-message');
        toastMsg.textContent = message;
        toast.className = `toast toast-${type} show`;
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.className = 'toast hidden', 500);
        }, 3000);
    },

    // Page navigation
    navigateTo(pageId) {
        this.currentPage = pageId;
        // Hide all pages
        document.querySelectorAll('.page').forEach(p => {
            p.classList.add('hidden');
            p.classList.remove('active');
        });
        // Show target page
        const targetPage = document.getElementById(`page-${pageId}`);
        if (targetPage) {
            targetPage.classList.remove('hidden');
            targetPage.classList.add('active');
        }
        // Update nav
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === pageId);
        });
    },

    // Show/hide loading overlay
    setLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }
};

// --- Load Initial Data ---
async function loadInitialData() {
    try {
        const data = await API_SERVICE.getInitialData();

        // Update welcome message
        const welcomeEl = document.getElementById('welcome-message');
        if (data.profile && data.profile.name) {
            welcomeEl.textContent = `歡迎回來，${data.profile.name}`;
        } else if (APP.currentUser) {
            welcomeEl.textContent = `歡迎回來，${APP.currentUser.name}`;
        }

        // Check admin status
        if (data.isAdmin) {
            APP.isAdmin = true;
            document.getElementById('admin-bar').classList.remove('hidden');
        }

        // Store profile data
        APP.profileData = data.profile || {};

        // Populate profile view
        populateProfile(APP.profileData);

        // Check photo reminder
        if (data.photoReminder) {
            document.getElementById('reminder-banner').classList.remove('hidden');
        }

        // Hide loading
        APP.setLoading(false);
    } catch (error) {
        APP.showToast('無法載入初始資料: ' + error.message, 'error');
        APP.setLoading(false);
    }
}

// --- Populate Profile View ---
function populateProfile(profile) {
    if (!profile) return;

    document.querySelectorAll('.view-mode').forEach(el => {
        const input = el.nextElementSibling;
        if (input && input.dataset && input.dataset.key) {
            const key = input.dataset.key;
            const value = profile[key];
            if (value !== undefined && value !== null && value !== '') {
                el.textContent = value;
                if (input.tagName === 'SELECT') {
                    // Set select value
                    for (let i = 0; i < input.options.length; i++) {
                        if (input.options[i].value === String(value) || input.options[i].text === String(value)) {
                            input.selectedIndex = i;
                            break;
                        }
                    }
                } else {
                    input.value = value;
                }
            } else {
                el.textContent = el.dataset.placeholder || '未設定';
            }
        }
    });

    // Update BMR, TDEE, Water
    if (profile.bmr) document.getElementById('bmr-display').textContent = Math.round(profile.bmr);
    if (profile.tdee) document.getElementById('tdee-display').textContent = Math.round(profile.tdee);
    if (profile.water) document.getElementById('water-display').textContent = Math.round(profile.water);
}

// --- Profile Edit Mode ---
function toggleProfileEdit(editMode) {
    document.querySelectorAll('.view-mode').forEach(el => el.classList.toggle('hidden', editMode));
    document.querySelectorAll('.edit-mode').forEach(el => el.classList.toggle('hidden', !editMode));
    document.getElementById('edit-profile-btn').classList.toggle('hidden', editMode);
    document.getElementById('edit-profile-actions').classList.toggle('hidden', !editMode);
}

// --- Save Profile ---
async function saveProfile() {
    const profileData = {};
    document.querySelectorAll('.profile-input').forEach(input => {
        if (input.dataset.key) {
            profileData[input.dataset.key] = input.value;
        }
    });

    try {
        APP.setLoading(true);
        const result = await API_SERVICE.saveProfileData(profileData);
        if (result.status === 'success') {
            APP.showToast('個人資料已儲存！', 'success');
            toggleProfileEdit(false);
            // Reload to refresh view
            loadInitialData();
        } else {
            APP.showToast(result.error || '儲存失敗', 'error');
        }
    } catch (error) {
        APP.showToast('儲存失敗: ' + error.message, 'error');
    } finally {
        APP.setLoading(false);
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.page) APP.navigateTo(btn.dataset.page);
        });
    });

    // Profile edit buttons
    document.getElementById('edit-profile-btn')?.addEventListener('click', () => toggleProfileEdit(true));
    document.getElementById('cancel-profile-btn')?.addEventListener('click', () => toggleProfileEdit(false));
    document.getElementById('save-profile-btn')?.addEventListener('click', saveProfile);

    // Set today's date for workout
    const dateInput = document.getElementById('workout-date-input');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }

    // Set today's date for photo
    const photoDateInput = document.getElementById('photo-date-input');
    if (photoDateInput) {
        photoDateInput.valueAsDate = new Date();
    }
});

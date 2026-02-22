/**
 * app.js - 完整應用程式邏輯
 * 從原始 GAS MVP 移植，適配 GitHub Pages + GAS Web App 架構
 */

// --- Google Login Callback ---
function handleGoogleLogin(response) {
    if (response.credential) {
        API_SERVICE.setToken(response.credential);
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        APP.state.user.currentUser = payload.email;
        APP.state.user.name = payload.name || payload.email.split('@')[0];

        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        APP.setLoading(true);
        APP.init();
    }
}

// --- App Core ---
const APP = {
    state: {
        user: { currentUser: null, name: '', isAdmin: false, profileData: null },
        ui: { currentView: 'dashboard', isPREditMode: false },
        cache: { workoutTemplates: {}, exerciseNameList: [], analysisData: null, prData: null, photoHistory: [] },
        modal: { promptCallback: null, confirmCallback: null, elementToDelete: null },
        charts: { bodyStats: null, volume: null, categoryDistribution: null, exerciseProgress: null },
        timer: { interval: null, secondsLeft: 0, toastTimer: null },
        pr: { categoryChanges: new Map() }
    },

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast-notification');
        const toastMsg = document.getElementById('toast-message');
        if (!toast || !toastMsg) return;
        if (this.state.timer.toastTimer) clearTimeout(this.state.timer.toastTimer);
        toastMsg.innerHTML = message;
        toast.className = `toast toast-${type} show`;
        this.state.timer.toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.className = 'toast hidden', 500);
        }, 3000);
    },

    setLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.toggle('hidden', !show);
    },

    navigateTo(pageId) {
        if (this.state.ui.currentView === pageId) return;
        this.state.ui.currentView = pageId;
        document.querySelectorAll('.page').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
        const target = document.getElementById(`page-${pageId}`);
        if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === pageId));
        if (pageId === 'history') this.loadHistoryData();
        if (pageId === 'prs') this.loadPRData();
    },

    // --- Initialization ---
    async init() {
        try {
            const data = await API_SERVICE.getInitialData();
            const profile = data.profile || {};
            const profileData = profile.profileData || {};

            this.state.user.isAdmin = profile.isAdmin;
            this.state.user.profileData = profileData;
            this.state.cache.workoutTemplates = data.templates || {};
            this.state.cache.exerciseNameList = data.exerciseNames || [];

            this.populateProfile(profileData);
            this.calculateRecommendations();
            this.populateLatestPhotos(profile.latestPhotos);

            const displayName = profileData.name || profile.name || this.state.user.name;
            document.getElementById('welcome-message').textContent = `歡迎回來，${displayName}`;

            if (this.state.user.isAdmin) {
                document.getElementById('admin-bar').classList.remove('hidden');
                if (data.allUsers) this.populateUserSwitcher(data.allUsers);
            }
            if (profile.shouldShowReminder) {
                document.getElementById('reminder-banner').classList.remove('hidden');
            }

            this.setLoading(false);
        } catch (error) {
            this.showToast('無法載入初始資料: ' + error.message, 'error');
            this.setLoading(false);
        }
    },

    // --- Profile ---
    populateProfile(profileData) {
        if (!profileData) return;
        document.querySelectorAll('.view-mode').forEach(el => {
            const input = el.nextElementSibling;
            if (!input || !input.dataset || !input.dataset.key) return;
            const value = profileData[input.dataset.key];
            const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
            if (input.tagName === 'SELECT') {
                const match = hasValue ? [...input.options].find(opt => opt.value == value || opt.text == value) : null;
                el.textContent = match ? match.text : (el.dataset.placeholder || '未設定');
                if (match) input.value = match.value;
            } else {
                el.textContent = hasValue ? value : (el.dataset.placeholder || '未設定');
                if (hasValue) input.value = value;
            }
        });
    },

    toggleProfileEdit(isEditing) {
        document.querySelectorAll('.view-mode').forEach(el => el.classList.toggle('hidden', isEditing));
        document.querySelectorAll('.edit-mode').forEach(el => el.classList.toggle('hidden', !isEditing));
        document.getElementById('edit-profile-btn')?.classList.toggle('hidden', isEditing);
        document.getElementById('edit-profile-actions')?.classList.toggle('hidden', !isEditing);
    },

    async saveProfile() {
        const profileData = {};
        document.querySelectorAll('.profile-input').forEach(input => {
            if (input.dataset.key && input.offsetParent !== null) profileData[input.dataset.key] = input.value;
        });
        try {
            this.setLoading(true);
            const result = await API_SERVICE.saveProfileData(profileData);
            if (result.status === 'error') throw new Error(result.message);
            this.showToast(result.message || '個人資料已儲存！');
            this.state.user.profileData = { ...this.state.user.profileData, ...profileData };
            this.populateProfile(this.state.user.profileData);
            this.calculateRecommendations();
            this.toggleProfileEdit(false);
            this.state.cache.analysisData = null;
        } catch (error) {
            this.showToast('儲存失敗: ' + error.message, 'error');
        } finally {
            this.setLoading(false);
        }
    },

    calculateRecommendations() {
        const pd = this.state.user.profileData;
        if (!pd) return;
        const weight = parseFloat(pd.weight), height = parseFloat(pd.height), age = parseInt(pd.age), gender = pd.gender, freq = parseFloat(pd.frequency);
        const display = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = (val && !isNaN(val)) ? Math.round(val) : '--'; };
        if (!weight || !height || !age || !gender || !freq) { display('bmr-display', null); display('tdee-display', null); display('water-display', null); return; }
        const bmr = (gender === 'male') ? (10 * weight + 6.25 * height - 5 * age + 5) : (10 * weight + 6.25 * height - 5 * age - 161);
        display('bmr-display', bmr);
        display('tdee-display', bmr * freq);
        display('water-display', weight * 35);
    },

    // --- Photos ---
    populateLatestPhotos(photoData) {
        const dateEl = document.getElementById('prev-photo-date');
        const containers = { front: document.getElementById('prev-photo-front-container'), side: document.getElementById('prev-photo-side-container'), back: document.getElementById('prev-photo-back-container') };
        if (!dateEl) return;
        if (!photoData || (!photoData.photo_front_id && !photoData.photo_side_id && !photoData.photo_back_id)) {
            dateEl.textContent = 'N/A';
            Object.values(containers).forEach(c => { if (c) c.innerHTML = '<span style="color: var(--color-text-muted)">尚無記錄</span>'; });
            return;
        }
        dateEl.textContent = new Date(photoData.date).toLocaleDateString();
        for (const type in containers) {
            const c = containers[type], photoId = photoData[`photo_${type}_id`];
            if (c && photoId) {
                const thumb = 'https://drive.google.com/thumbnail?id=' + photoId;
                const full = `https://lh3.googleusercontent.com/d/${photoId}`;
                c.innerHTML = `<img src="${thumb}" data-fullsize-url="${full}" style="width:100%;height:100%;object-fit:cover;border-radius:0.375rem;cursor:pointer;" alt="${type}">`;
            } else if (c) {
                c.innerHTML = '<span style="color: var(--color-text-muted)">無照片</span>';
            }
        }
    },

    async saveBodyPhotos() {
        const dateInput = document.getElementById('photo-date-input');
        const weightInput = document.getElementById('photo-weight-input');
        const bodyfatInput = document.getElementById('photo-bodyfat-input');
        const files = { front: document.getElementById('photo-front-upload')?.files[0], side: document.getElementById('photo-side-upload')?.files[0], back: document.getElementById('photo-back-upload')?.files[0] };
        if (!files.front && !files.side && !files.back && !weightInput.value && !bodyfatInput.value) {
            this.showToast('請至少上傳一張照片或填寫一項身體數據。', 'error'); return;
        }
        this.setLoading(true);
        const photoData = { date: dateInput.value, weight: weightInput.value, bodyfat: bodyfatInput.value };
        try {
            for (const type of ['front', 'side', 'back']) {
                if (files[type]) photoData[type] = await this._readFileAsBase64(files[type]);
            }
            const response = await API_SERVICE.saveBodyPhotos(photoData);
            if (response.status === 'error') throw new Error(response.message);
            this.showToast(response.message);
            this.state.cache.analysisData = null;
            this.state.cache.photoHistory = [];
            if (response.latestPhotos) this.populateLatestPhotos(response.latestPhotos);
            // Clear inputs
            ['photo-front-upload', 'photo-side-upload', 'photo-back-upload'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            weightInput.value = ''; bodyfatInput.value = '';
            ['photo-front-preview', 'photo-side-preview', 'photo-back-preview'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<span style="color:var(--color-text-muted)">預覽</span>'; });
        } catch (error) {
            this.showToast('照片上傳失敗: ' + error.message, 'error');
        } finally {
            this.setLoading(false);
        }
    },

    _readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    },

    // --- Photo Compare ---
    async openCompareModal() {
        document.getElementById('compare-photos-modal')?.classList.remove('hidden');
        if (this.state.cache.photoHistory.length === 0 || this.state.cache.photoHistory._user !== this.state.user.currentUser) {
            try {
                this.setLoading(true);
                const response = await API_SERVICE.getAllPhotoRecords(this.state.user.currentUser);
                if (response.error) throw new Error(response.error);
                this.state.cache.photoHistory = response.data || response || [];
                this.state.cache.photoHistory._user = this.state.user.currentUser;
            } catch (e) {
                this.showToast('無法載入照片歷史: ' + e.message, 'error');
            } finally {
                this.setLoading(false);
            }
        }
        // Populate selects
        ['compare-select-before', 'compare-select-after'].forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            const label = id.includes('before') ? '之前' : '之後';
            select.innerHTML = `<option value="">選擇對比日期 (${label})</option>`;
            this.state.cache.photoHistory.forEach(record => {
                const date = new Date(record.date).toLocaleDateString();
                select.innerHTML += `<option value="${record.date}">${date}</option>`;
            });
        });
    },

    updateCompareImage(position, dateISO) {
        const record = this.state.cache.photoHistory.find(r => r.date === dateISO);
        ['front', 'side', 'back'].forEach(type => {
            const container = document.getElementById(`compare-${type}-${position}`);
            if (!container) return;
            if (!record) { container.innerHTML = `<span style="color:var(--color-text-muted)">${type === 'front' ? '正面' : (type === 'side' ? '側面' : '背面')}</span>`; return; }
            const photoId = record[`photo_${type}_id`];
            if (photoId) {
                const thumb = 'https://drive.google.com/thumbnail?id=' + photoId;
                const full = `https://lh3.googleusercontent.com/d/${photoId}`;
                container.innerHTML = `<img src="${thumb}" data-fullsize-url="${full}" style="width:100%;height:100%;object-fit:cover;border-radius:0.375rem;cursor:pointer;" alt="歷史照片">`;
            } else {
                container.innerHTML = '<span style="color:var(--color-text-muted)">無照片</span>';
            }
        });
    },

    // --- User Switcher ---
    populateUserSwitcher(users) {
        const switcher = document.getElementById('user-switcher');
        if (!switcher) return;
        switcher.innerHTML = '';
        users.forEach(user => {
            const opt = document.createElement('option');
            opt.value = user.email;
            opt.textContent = user.name || user.email;
            switcher.appendChild(opt);
        });
    },

    async switchUser(email) {
        this.setLoading(true);
        this.state.cache.analysisData = null;
        this.state.cache.prData = null;
        this.state.cache.photoHistory = [];
        document.getElementById('workout-list').innerHTML = '';
        try {
            const data = await API_SERVICE.getInitialData(email);
            const profile = data.profile || {};
            const profileData = profile.profileData || {};
            this.state.user.currentUser = profile.email;
            this.state.user.profileData = profileData;
            this.state.cache.workoutTemplates = data.templates || {};
            this.state.cache.exerciseNameList = data.exerciseNames || [];
            this.populateProfile(profileData);
            this.calculateRecommendations();
            this.populateLatestPhotos(profile.latestPhotos);
            document.getElementById('welcome-message').textContent = `歡迎回來，${profileData.name || profile.name || ''}`;
            if (profile.shouldShowReminder) document.getElementById('reminder-banner')?.classList.remove('hidden');
            else document.getElementById('reminder-banner')?.classList.add('hidden');
            this.navigateTo('dashboard');
        } catch (error) {
            this.showToast('切換使用者失敗: ' + error.message, 'error');
        } finally {
            this.setLoading(false);
        }
    },

    // === WORKOUT ===
    createSetElement(setNumber) {
        const template = document.getElementById('set-row-template');
        const newSet = document.importNode(template.content, true);
        newSet.querySelector('.js-set-number').textContent = `SET ${setNumber}`;
        return newSet;
    },

    addExercise(name) {
        const workoutList = document.getElementById('workout-list');
        if (!workoutList) return;
        const template = document.getElementById('exercise-card-template');
        const fragment = document.importNode(template.content, true);
        const card = fragment.querySelector('.card');
        card.id = 'exercise-' + Date.now();
        card.querySelector('h3').textContent = name;
        const setsContainer = card.querySelector('.js-sets-container');
        setsContainer.appendChild(this.createSetElement(1));
        workoutList.appendChild(fragment);

        const perfEl = card.querySelector('.js-last-performance');
        API_SERVICE.getLatestPerformance(name, this.state.user.currentUser).then(response => {
            const perf = response?.data || response;
            if (perf && perf.weight_kg != null) {
                perfEl.innerHTML = `上次: <strong>${perf.weight_kg} kg x ${perf.reps} 次</strong>`;
            } else {
                perfEl.textContent = '無歷史紀錄';
            }
        }).catch(() => { perfEl.textContent = '查詢失敗'; });
        this.updateDailyTotalVolume();
    },

    addSet(exerciseCard) {
        const setsContainer = exerciseCard.querySelector('.js-sets-container');
        const allSets = setsContainer.querySelectorAll('.js-set-row');
        let lastWeight = '', lastUnit = '公斤';
        if (allSets.length > 0) {
            const last = allSets[allSets.length - 1];
            lastWeight = last.querySelector('.js-weight-input').value;
            lastUnit = last.querySelector('.js-unit-select').value;
        }
        const newSet = this.createSetElement(allSets.length + 1);
        newSet.querySelector('.js-weight-input').value = lastWeight;
        newSet.querySelector('.js-unit-select').value = lastUnit;
        setsContainer.appendChild(newSet);
        const newReps = setsContainer.querySelector('.js-set-row:last-child .js-reps-input');
        if (newReps) newReps.focus();
        this.calculateVolume(exerciseCard);
        this.updateDailyTotalVolume();
    },

    copyLastSet(exerciseCard) {
        const setsContainer = exerciseCard.querySelector('.js-sets-container');
        const lastSet = setsContainer.querySelector('.js-set-row:last-child');
        if (!lastSet) { this.addSet(exerciseCard); return; }
        const lw = lastSet.querySelector('.js-weight-input').value;
        const lr = lastSet.querySelector('.js-reps-input').value;
        const lu = lastSet.querySelector('.js-unit-select').value;
        this.addSet(exerciseCard);
        const newSet = setsContainer.querySelector('.js-set-row:last-child');
        if (newSet) {
            newSet.querySelector('.js-weight-input').value = lw;
            newSet.querySelector('.js-reps-input').value = lr;
            newSet.querySelector('.js-unit-select').value = lu;
        }
        this.calculateVolume(exerciseCard);
        this.updateDailyTotalVolume();
    },

    deleteSet(setRow) {
        const card = setRow.closest('.card');
        const container = setRow.parentElement;
        setRow.remove();
        const remaining = container.querySelectorAll('.js-set-row');
        if (remaining.length === 0) { card.remove(); }
        else { remaining.forEach((s, i) => { const n = s.querySelector('.js-set-number'); if (n) n.textContent = `SET ${i + 1}`; }); if (card) this.calculateVolume(card); }
        this.updateDailyTotalVolume();
    },

    deleteExercise(card) {
        const name = card.querySelector('h3').textContent;
        this.state.modal.elementToDelete = card;
        this.state.modal.confirmCallback = () => { if (this.state.modal.elementToDelete) { this.state.modal.elementToDelete.remove(); this.updateDailyTotalVolume(); } };
        this.showConfirmDeleteModal(true, `您確定要刪除「${name}」這個動作嗎？`);
    },

    calculateVolume(exerciseCard) {
        const LB_TO_KG = 0.45359237;
        let total = 0;
        exerciseCard.querySelectorAll('.js-set-row').forEach(set => {
            let w = parseFloat(set.querySelector('.js-weight-input').value) || 0;
            const r = parseInt(set.querySelector('.js-reps-input').value) || 0;
            if (set.querySelector('.js-unit-select').value === '磅') w *= LB_TO_KG;
            total += w * r;
        });
        const display = exerciseCard.querySelector('.js-volume-display');
        if (display) display.textContent = `${parseFloat(total.toFixed(2))} 公斤`;
    },

    updateDailyTotalVolume() {
        const LB_TO_KG = 0.45359237;
        let total = 0;
        document.querySelectorAll('#workout-list .card').forEach(card => {
            card.querySelectorAll('.js-set-row').forEach(set => {
                let w = parseFloat(set.querySelector('.js-weight-input')?.value) || 0;
                const r = parseInt(set.querySelector('.js-reps-input')?.value) || 0;
                if (set.querySelector('.js-unit-select')?.value === '磅') w *= LB_TO_KG;
                total += w * r;
            });
        });
        const el = document.getElementById('daily-total-volume-display');
        if (el) el.textContent = `${parseFloat(total.toFixed(2))} 公斤`;
    },

    collectWorkoutData() {
        const LB_TO_KG = 0.45359237;
        const data = [];
        const dateStr = document.getElementById('workout-date-input').value;
        const now = new Date();
        const finalDate = new Date(dateStr);
        finalDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
        const dateISO = finalDate.toISOString();

        document.querySelectorAll('#workout-list .card').forEach(card => {
            const name = card.querySelector('h3').textContent;
            const note = card.querySelector('.js-exercise-note')?.value || '';
            card.querySelectorAll('.js-set-row').forEach((set, i) => {
                const weight = parseFloat(set.querySelector('.js-weight-input').value) || 0;
                const reps = parseInt(set.querySelector('.js-reps-input').value) || 0;
                const unit = set.querySelector('.js-unit-select').value;
                let wkg = weight;
                if (unit === '磅') wkg = parseFloat((weight * LB_TO_KG).toFixed(2));
                if (weight > 0 || reps > 0) {
                    data.push({ date: dateISO, motion: name, set: i + 1, weight, unit, reps, weight_in_kg: wkg, note });
                }
            });
        });
        return data;
    },

    async handleSaveWorkout() {
        const workoutData = this.collectWorkoutData();
        if (workoutData.length === 0) { this.showToast('沒有任何訓練資料可以儲存。'); return; }
        this.setLoading(true);
        try {
            const response = await API_SERVICE.saveWorkoutData(workoutData);
            this.showToast(response.message);
            this.state.cache.analysisData = null;
            this.state.cache.prData = null;
            const prResponse = await API_SERVICE.processWorkoutForPRs(workoutData);
            if (prResponse && prResponse.status === 'success' && prResponse.newPRs && prResponse.newPRs.length > 0) {
                this.showToast('<strong>恭喜達成新紀錄！</strong><br>' + prResponse.newPRs.join('<br>'));
            }
        } catch (error) {
            this.showToast('儲存失敗: ' + error.message, 'error');
        } finally {
            this.setLoading(false);
        }
    },

    // --- Templates ---
    handleAddExerciseClick() {
        this.showAutocompleteModal(true, (name) => {
            if (name && name.trim()) { this.addExercise(name.trim()); this.showAutocompleteModal(false); }
            else this.showToast('請輸入動作名稱！');
        });
    },

    handleSaveAsTemplate() {
        const cards = document.querySelectorAll('#workout-list .card');
        if (cards.length === 0) { this.showToast('日誌中沒有任何動作。'); return; }
        this.showPromptModal(true, '另存為範本', '請輸入範本名稱...', async (name) => {
            if (!name) { this.showToast('請輸入範本名稱！'); return; }
            const exercises = [...cards].map(c => c.querySelector('h3').textContent);
            this.setLoading(true);
            try {
                const resp = await API_SERVICE.saveWorkoutTemplate(name, exercises);
                this.showToast(resp.message);
                const tplResp = await API_SERVICE.getWorkoutTemplates(this.state.user.currentUser);
                this.state.cache.workoutTemplates = tplResp.data || tplResp || {};
            } catch (e) { this.showToast('儲存範本失敗: ' + e.message, 'error'); }
            finally { this.showPromptModal(false); this.setLoading(false); }
        });
    },

    handleLoadTemplate(templateName) {
        const template = this.state.cache.workoutTemplates[templateName];
        if (template && confirm(`確定要載入範本「${templateName}」嗎？`)) {
            document.getElementById('workout-list').innerHTML = '';
            this.updateDailyTotalVolume();
            template.forEach(ex => this.addExercise(ex.name));
            document.getElementById('load-template-modal')?.classList.add('hidden');
        }
    },

    async handleDeleteTemplate(templateName) {
        this.state.modal.confirmCallback = async () => {
            this.setLoading(true);
            try {
                const resp = await API_SERVICE.deleteWorkoutTemplate(templateName);
                if (resp.status === 'error') throw new Error(resp.message);
                this.showToast(resp.message);
                const tplResp2 = await API_SERVICE.getWorkoutTemplates(this.state.user.currentUser);
                this.state.cache.workoutTemplates = tplResp2.data || tplResp2 || {};
                this.populateTemplateList(this.state.cache.workoutTemplates);
            } catch (e) { this.showToast('刪除範本失敗: ' + e.message, 'error'); }
            finally { this.setLoading(false); }
        };
        this.showConfirmDeleteModal(true, `您確定要刪除範本「${templateName}」嗎？`);
    },

    handleClearWorkout() {
        const cards = document.querySelectorAll('#workout-list .card');
        if (cards.length === 0) { this.showToast('日誌已經是空的。'); return; }
        this.state.modal.confirmCallback = () => { document.getElementById('workout-list').innerHTML = ''; this.updateDailyTotalVolume(); };
        this.showConfirmDeleteModal(true, '您確定要清空所有訓練動作嗎？');
    },

    populateTemplateList(templates) {
        const container = document.getElementById('template-list');
        if (!container) return;
        container.innerHTML = '';
        if (Object.keys(templates).length === 0) {
            container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">尚未建立任何範本。</p>';
            return;
        }
        for (const name in templates) {
            const item = document.createElement('div');
            item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;background:rgba(0,0,0,0.3);border-radius:0.375rem;';
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary js-load-template';
            btn.style.cssText = 'flex-grow:1;text-align:left;';
            btn.textContent = name;
            btn.dataset.templateName = name;
            const del = document.createElement('button');
            del.style.cssText = 'padding:0.5rem;background:none;border:none;color:#ef4444;cursor:pointer;';
            del.innerHTML = '<ion-icon name="close-circle-outline" style="font-size:1.5rem;pointer-events:none;"></ion-icon>';
            del.className = 'js-delete-template';
            del.dataset.templateName = name;
            item.appendChild(btn);
            item.appendChild(del);
            container.appendChild(item);
        }
    },

    // --- Timer ---
    startTimer(seconds) {
        if (this.state.timer.interval) clearInterval(this.state.timer.interval);
        this.state.timer.secondsLeft = seconds;
        this.updateTimerDisplay();
        document.getElementById('rest-timer-bar')?.classList.remove('hidden');
        this.state.timer.interval = setInterval(() => {
            this.state.timer.secondsLeft--;
            this.updateTimerDisplay();
            if (this.state.timer.secondsLeft <= 0) { this.resetTimer(); this.showToast('休息結束！'); }
        }, 1000);
    },
    updateTimerDisplay() {
        const el = document.getElementById('timer-display');
        if (el) { const m = Math.floor(this.state.timer.secondsLeft / 60).toString().padStart(2, '0'); const s = (this.state.timer.secondsLeft % 60).toString().padStart(2, '0'); el.textContent = `${m}:${s}`; }
    },
    addTimerTime(sec) { if (this.state.timer.interval) { this.state.timer.secondsLeft = Math.max(0, this.state.timer.secondsLeft + sec); this.updateTimerDisplay(); } },
    resetTimer() { if (this.state.timer.interval) { clearInterval(this.state.timer.interval); this.state.timer.interval = null; } document.getElementById('rest-timer-bar')?.classList.add('hidden'); },

    // === ANALYSIS ===
    async loadHistoryData() {
        this.showHistoryState('loading');
        try {
            if (!this.state.cache.analysisData || this.state.cache.analysisData._user !== this.state.user.currentUser) {
                this.state.cache.analysisData = await API_SERVICE.getAnalysisData(this.state.user.currentUser);
                if (this.state.cache.analysisData) this.state.cache.analysisData._user = this.state.user.currentUser;
            }
            const data = this.state.cache.analysisData;
            if (data.error) throw new Error(data.error);
            const hasData = (data.weightHistory?.length > 0) || (data.volumeHistory?.length > 0) || (data.workoutFrequency?.length > 0);
            if (hasData) { this.renderHistoryCharts(data); this.showHistoryState('content'); }
            else this.showHistoryState('empty');
        } catch (error) {
            this.showToast('無法載入歷史數據: ' + error.message, 'error');
            this.showHistoryState('empty');
        }
    },

    showHistoryState(state) {
        const map = { 'history-loading': 'loading', 'history-content': 'content', 'history-empty': 'empty' };
        Object.entries(map).forEach(([id, s]) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('hidden', s !== state);
        });
    },

    renderHistoryCharts(data) {
        // Destroy old charts
        Object.keys(this.state.charts).forEach(k => { if (this.state.charts[k] && typeof this.state.charts[k].destroy === 'function') { try { this.state.charts[k].destroy(); } catch (e) { } } });
        const chartOpts = { responsive: true, aspectRatio: 1.6 };

        // Body Stats Chart
        const bsCtx = document.getElementById('body-stats-chart')?.getContext('2d');
        if (bsCtx) {
            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            const filteredWeight = (data.weightHistory || []).filter(d => new Date(d.x) >= ninetyDaysAgo);
            const filteredBF = (data.bodyfatHistory || []).filter(d => new Date(d.x) >= ninetyDaysAgo);
            this.state.charts.bodyStats = new Chart(bsCtx, {
                type: 'line',
                data: {
                    datasets: [
                        { label: '體重 (kg)', data: filteredWeight, borderColor: '#ffc300', backgroundColor: 'rgba(255,195,0,0.2)', yAxisID: 'y', tension: 0.1, fill: true },
                        { label: '體脂率 (%)', data: filteredBF, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.2)', yAxisID: 'y1', tension: 0.1, fill: true }
                    ]
                },
                options: {
                    ...chartOpts, interaction: { mode: 'index', intersect: false }, scales: {
                        x: { type: 'time', time: { unit: 'week', displayFormats: { week: 'MMM d' } }, min: ninetyDaysAgo.toISOString(), max: new Date().toISOString(), grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af', maxRotation: 45 } },
                        y: { type: 'linear', position: 'left', title: { display: true, text: '體重 (kg)', color: '#ffc300' }, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#ffc300' } },
                        y1: { type: 'linear', position: 'right', title: { display: true, text: '體脂率 (%)', color: '#38bdf8' }, grid: { drawOnChartArea: false }, ticks: { color: '#38bdf8' } }
                    }, plugins: { legend: { labels: { color: '#e5e7eb' } } }
                }
            });
        }

        // Volume Chart
        const vCtx = document.getElementById('volume-chart')?.getContext('2d');
        if (vCtx && data.volumeHistory) {
            const volNinetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            this.state.charts.volume = new Chart(vCtx, {
                type: 'line',
                data: { datasets: [{ label: '總訓練容量 (kg)', data: data.volumeHistory, borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.2)', fill: true, tension: 0.1, pointRadius: 4, pointHoverRadius: 8 }] },
                options: {
                    ...chartOpts, plugins: { legend: { display: false } }, scales: {
                        x: { type: 'time', time: { unit: 'week', displayFormats: { week: 'MMM d' } }, min: volNinetyDaysAgo.toISOString(), max: new Date().toISOString(), grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af', maxRotation: 45 } },
                        y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#e5e7eb' }, beginAtZero: true, title: { display: true, text: '訓練容量 (kg)', color: '#e5e7eb' } }
                    }
                }
            });
        }

        // Category Distribution Chart
        const cCtx = document.getElementById('category-distribution-chart')?.getContext('2d');
        const legendContainer = document.getElementById('category-legend-container');
        if (cCtx && legendContainer && data.categoryVolumeDistribution && Object.keys(data.categoryVolumeDistribution).length > 0) {
            const fixedOrder = ['胸', '肩', '背', '臀', '腿', '手', '其他'];
            const origLabels = Object.keys(data.categoryVolumeDistribution);
            const sorted = fixedOrder.filter(l => origLabels.includes(l));
            origLabels.forEach(l => { if (!sorted.includes(l)) sorted.push(l); });
            const sortedData = sorted.map(l => data.categoryVolumeDistribution[l]);
            const colors = { '胸': 'rgba(239,68,68,0.8)', '背': 'rgba(59,130,246,0.8)', '腿': 'rgba(34,197,94,0.8)', '臀': 'rgba(249,115,22,0.8)', '肩': 'rgba(168,85,247,0.8)', '手': 'rgba(234,179,8,0.8)', '其他': 'rgba(156,163,175,0.8)' };
            const bgColors = sorted.map(l => colors[l] || colors['其他']);
            this.state.charts.categoryDistribution = new Chart(cCtx, {
                type: 'doughnut',
                data: { labels: sorted, datasets: [{ data: sortedData, backgroundColor: bgColors, borderColor: '#2d2a27', borderWidth: 2 }] },
                options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.raw?.toLocaleString() + ' kg' } } } }
            });
            legendContainer.innerHTML = '';
            sorted.forEach((label, i) => { legendContainer.innerHTML += `<div style="display:flex;align-items:center;"><span style="width:12px;height:12px;border-radius:2px;margin-right:0.5rem;background:${bgColors[i]}"></span><span style="color:#d1d5db;font-size:0.875rem;">${label}</span></div>`; });
        }

        // Exercise Progress Select
        this._populateExerciseSelect(data.singleExerciseProgress);
        const exerciseSelect = document.getElementById('exercise-progress-select');
        if (exerciseSelect) {
            exerciseSelect.onchange = (e) => this._renderExerciseProgressChart(e.target.value, data.singleExerciseProgress);
        }
    },

    _populateExerciseSelect(progressData) {
        const selectEl = document.getElementById('exercise-progress-select');
        if (!selectEl || !progressData) return;
        selectEl.innerHTML = '<option value="">請選擇一個動作來分析</option>';
        Object.keys(progressData).sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            selectEl.appendChild(opt);
        });
    },

    _renderExerciseProgressChart(exerciseName, allProgressData) {
        const ctx = document.getElementById('exercise-progress-chart')?.getContext('2d');
        if (!ctx) return;
        if (this.state.charts.exerciseProgress) { try { this.state.charts.exerciseProgress.destroy(); } catch (e) { } }
        if (!exerciseName) return;
        const exerciseData = allProgressData[exerciseName];
        if (!exerciseData) return;

        this.state.charts.exerciseProgress = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    { label: '最大重量 (kg)', data: exerciseData.map(d => ({ x: d.x, y: d.maxWeight })), borderColor: '#ffc300', yAxisID: 'y_weight', tension: 0.1 },
                    { label: '推估 1RM (kg)', data: exerciseData.map(d => ({ x: d.x, y: d.bestE1RM })), borderColor: '#f87171', borderDash: [5, 5], yAxisID: 'y_weight', tension: 0.1 },
                    { label: '總訓練量 (kg)', data: exerciseData.map(d => ({ x: d.x, y: d.totalVolume })), borderColor: '#38bdf8', yAxisID: 'y_volume', tension: 0.1 }
                ]
            },
            options: {
                responsive: true, aspectRatio: 1.6, interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'MMM d' } }, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } },
                    y_weight: { type: 'linear', position: 'left', title: { display: true, text: '重量 (kg)', color: '#ffc300' }, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#ffc300' } },
                    y_volume: { type: 'linear', position: 'right', title: { display: true, text: '訓練量 (kg)', color: '#38bdf8' }, grid: { drawOnChartArea: false }, ticks: { color: '#38bdf8' } }
                },
                plugins: { legend: { labels: { color: '#e5e7eb' } } }
            }
        });
    },

    // === PRs ===
    async loadPRData() {
        this.showPRsState('loading');
        try {
            if (!this.state.cache.prData || this.state.cache.prData._user !== this.state.user.currentUser) {
                this.state.cache.prData = await API_SERVICE.getAllPRs(this.state.user.currentUser);
                if (this.state.cache.prData) this.state.cache.prData._user = this.state.user.currentUser;
            }
            const data = this.state.cache.prData;
            if (data.error) throw new Error(data.error);
            const hasData = (data.bests?.length > 0) || (data.repPRs?.length > 0);
            if (hasData) { this.renderPRs(data); this.showPRsState('content'); }
            else this.showPRsState('empty');
        } catch (e) {
            this.showToast('無法載入個人紀錄: ' + e.message, 'error');
            this.showPRsState('empty');
        }
    },

    showPRsState(state) {
        const map = { 'prs-loading': 'loading', 'prs-content': 'content', 'prs-empty': 'empty' };
        Object.entries(map).forEach(([id, s]) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('hidden', s !== state);
        });
    },

    renderPRs(data) {
        const bestsContainer = document.getElementById('bests-container');
        const repPRsContainer = document.getElementById('rep-prs-container');
        if (!bestsContainer || !repPRsContainer) return;
        bestsContainer.innerHTML = '';
        repPRsContainer.innerHTML = '';
        const categories = ['胸', '肩', '背', '臀', '腿', '手', '其他'];
        const todayStr = new Date().toDateString();

        // Bests
        const groupedBests = {};
        (data.bests || []).forEach(b => { if (!groupedBests[b.category]) groupedBests[b.category] = []; groupedBests[b.category].push(b); });
        categories.forEach(cat => {
            const title = document.createElement('h4');
            title.style.cssText = 'font-size:1.125rem;font-weight:600;color:var(--color-yellow);margin-top:1.5rem;margin-bottom:0.75rem;';
            title.textContent = cat;
            bestsContainer.appendChild(title);
            const items = groupedBests[cat];
            if (items && items.length > 0) {
                items.forEach(b => {
                    const isNew = (b.heaviestDateISO && new Date(b.heaviestDateISO).toDateString() === todayStr);
                    const div = document.createElement('div');
                    div.className = 'card';
                    div.style.cssText = 'padding:0.75rem;margin-bottom:0.5rem;' + (isNew ? 'border-color:#ffc300;' : '');
                    div.innerHTML = `<p style="font-weight:600;color:var(--color-yellow);margin-bottom:0.25rem;">${b.motion}</p>
                        <div style="display:flex;justify-content:space-between;font-size:0.875rem;"><span style="color:var(--color-text-muted)">最重:</span><span><strong>${b.heaviestWeight} kg</strong> <small style="color:var(--color-text-muted)">(${b.heaviestDate})</small></span></div>
                        <div style="display:flex;justify-content:space-between;font-size:0.875rem;"><span style="color:var(--color-text-muted)">E1RM:</span><span><strong>${b.bestEst1RM} kg</strong> <small style="color:var(--color-text-muted)">(${b.e1rmDate})</small></span></div>`;
                    bestsContainer.appendChild(div);
                });
            } else {
                const p = document.createElement('p');
                p.style.cssText = 'color:var(--color-text-muted);font-size:0.875rem;padding-left:1rem;';
                p.textContent = '尚無紀錄。';
                bestsContainer.appendChild(p);
            }
        });

        // Rep PRs
        const groupedRep = {};
        (data.repPRs || []).forEach(pr => {
            if (!groupedRep[pr.category]) groupedRep[pr.category] = {};
            if (!groupedRep[pr.category][pr.motion]) groupedRep[pr.category][pr.motion] = [];
            groupedRep[pr.category][pr.motion].push(pr);
        });
        categories.forEach(cat => {
            const title = document.createElement('h4');
            title.style.cssText = 'font-size:1.125rem;font-weight:600;color:var(--color-yellow);margin-top:2rem;margin-bottom:0.75rem;';
            title.textContent = cat;
            repPRsContainer.appendChild(title);
            if (groupedRep[cat] && Object.keys(groupedRep[cat]).length > 0) {
                for (const motion in groupedRep[cat]) {
                    const prs = groupedRep[cat][motion].sort((a, b) => a.rmCategory - b.rmCategory);
                    const div = document.createElement('div');
                    div.className = 'card';
                    div.style.cssText = 'padding:0.75rem;margin-bottom:0.5rem;';
                    let html = `<p style="font-weight:600;margin-bottom:0.5rem;">${motion}</p>`;
                    prs.forEach(pr => {
                        html += `<div style="display:flex;justify-content:space-between;font-size:0.875rem;background:rgba(0,0,0,0.3);padding:0.25rem 0.5rem;border-radius:0.25rem;margin-bottom:0.25rem;">
                            <span style="color:var(--color-yellow);width:3rem;">${pr.rmCategory}RM</span><span style="flex-grow:1">${pr.weight} kg</span><small style="color:var(--color-text-muted)">${pr.date}</small></div>`;
                    });
                    div.innerHTML = html;
                    repPRsContainer.appendChild(div);
                }
            } else {
                const p = document.createElement('p');
                p.style.cssText = 'color:var(--color-text-muted);font-size:0.875rem;padding-left:1rem;';
                p.textContent = '尚無紀錄。';
                repPRsContainer.appendChild(p);
            }
        });
    },

    // === MODALS ===
    showAutocompleteModal(show, callback = null) {
        const modal = document.getElementById('autocomplete-modal');
        if (!modal) return;
        if (show) {
            const input = document.getElementById('autocomplete-input');
            input.value = '';
            document.getElementById('suggestions-list').innerHTML = '';
            this.state.modal.promptCallback = callback;
            modal.classList.remove('hidden');
            input.focus();
        } else { modal.classList.add('hidden'); this.state.modal.promptCallback = null; }
    },

    updateAutocompleteSuggestions(query) {
        const list = document.getElementById('suggestions-list');
        list.innerHTML = '';
        if (!query.trim()) return;
        const filtered = this.state.cache.exerciseNameList.filter(n => n.toLowerCase().includes(query.toLowerCase()));
        filtered.slice(0, 5).forEach(name => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary js-suggestion-item';
            btn.style.cssText = 'text-align:left;width:100%;';
            btn.textContent = name;
            list.appendChild(btn);
        });
    },

    showPromptModal(show, title = '', placeholder = '', callback = null) {
        const modal = document.getElementById('prompt-modal');
        if (!modal) return;
        if (show) {
            document.getElementById('prompt-title').textContent = title;
            const input = document.getElementById('prompt-input');
            input.placeholder = placeholder; input.value = '';
            this.state.modal.promptCallback = callback;
            modal.classList.remove('hidden'); input.focus();
        } else { modal.classList.add('hidden'); this.state.modal.promptCallback = null; }
    },

    showConfirmDeleteModal(show, message = '您確定要刪除嗎？') {
        const modal = document.getElementById('confirm-delete-modal');
        if (!modal) return;
        if (show) {
            document.getElementById('delete-confirm-message').textContent = message;
            modal.classList.remove('hidden');
        } else { modal.classList.add('hidden'); this.state.modal.elementToDelete = null; this.state.modal.confirmCallback = null; }
    },

    // Image modal
    openImageModal(url) {
        const modal = document.getElementById('image-modal');
        const img = document.getElementById('modal-image');
        if (modal && img) { img.src = url; modal.classList.remove('hidden'); }
    },
    closeImageModal() {
        const modal = document.getElementById('image-modal');
        const img = document.getElementById('modal-image');
        if (modal && img) { modal.classList.add('hidden'); img.src = ''; }
    },

    // === DRAG AND DROP REORDERING ===
    _dragState: { el: null, placeholder: null, startY: 0, offsetY: 0, container: null },

    initDragAndDrop(container) {
        if (!container) return;
        container.addEventListener('mousedown', (e) => this._onDragStart(e, container));
        container.addEventListener('touchstart', (e) => this._onDragStart(e, container), { passive: false });
    },

    _onDragStart(e, container) {
        const handle = e.target.closest('.js-drag-handle');
        if (!handle) return;
        const card = handle.closest('.card');
        if (!card || card.parentElement !== container) return;
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        const rect = card.getBoundingClientRect();
        this._dragState.el = card;
        this._dragState.container = container;
        this._dragState.offsetY = touch.clientY - rect.top;
        this._dragState.startY = touch.clientY;

        // Create placeholder
        const ph = document.createElement('div');
        ph.className = 'drag-placeholder';
        ph.style.cssText = `height:${rect.height}px;border:2px dashed var(--color-yellow);border-radius:0.75rem;margin-bottom:0.75rem;opacity:0.5;`;
        this._dragState.placeholder = ph;
        card.parentElement.insertBefore(ph, card);

        card.style.position = 'fixed';
        card.style.zIndex = '1000';
        card.style.width = rect.width + 'px';
        card.style.left = rect.left + 'px';
        card.style.top = rect.top + 'px';
        card.style.opacity = '0.9';
        card.style.pointerEvents = 'none';
        card.classList.add('dragging');

        const moveHandler = (ev) => this._onDragMove(ev);
        const endHandler = (ev) => { this._onDragEnd(ev); document.removeEventListener('mousemove', moveHandler); document.removeEventListener('mouseup', endHandler); document.removeEventListener('touchmove', moveHandler); document.removeEventListener('touchend', endHandler); };
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', endHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
    },

    _onDragMove(e) {
        if (!this._dragState.el) return;
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        const el = this._dragState.el;
        el.style.top = (touch.clientY - this._dragState.offsetY) + 'px';

        // Find insertion point
        const container = this._dragState.container;
        const cards = [...container.querySelectorAll('.card:not(.dragging)')];
        let closestCard = null, closestDist = Infinity;
        cards.forEach(c => {
            const r = c.getBoundingClientRect();
            const mid = r.top + r.height / 2;
            const dist = touch.clientY - mid;
            if (dist > 0 && dist < closestDist) { closestDist = dist; closestCard = c; }
        });
        const ph = this._dragState.placeholder;
        if (closestCard) closestCard.after(ph);
        else if (cards.length > 0) container.insertBefore(ph, cards[0]);
    },

    _onDragEnd(e) {
        const { el, placeholder, container } = this._dragState;
        if (!el || !placeholder) return;
        el.style.position = ''; el.style.zIndex = ''; el.style.width = ''; el.style.left = ''; el.style.top = ''; el.style.opacity = ''; el.style.pointerEvents = '';
        el.classList.remove('dragging');
        container.insertBefore(el, placeholder);
        placeholder.remove();
        this._dragState.el = null; this._dragState.placeholder = null; this._dragState.container = null;
        this.updateDailyTotalVolume();
    }
};

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => { if (btn.dataset.page) APP.navigateTo(btn.dataset.page); });
    });

    // Profile
    document.getElementById('edit-profile-btn')?.addEventListener('click', () => APP.toggleProfileEdit(true));
    document.getElementById('cancel-profile-btn')?.addEventListener('click', () => APP.toggleProfileEdit(false));
    document.getElementById('save-profile-btn')?.addEventListener('click', () => APP.saveProfile());

    // Set dates
    const workoutDate = document.getElementById('workout-date-input');
    if (workoutDate) workoutDate.value = new Date().toLocaleDateString('sv');
    const photoDate = document.getElementById('photo-date-input');
    if (photoDate) photoDate.value = new Date().toLocaleDateString('sv');

    // Workout page - event delegation
    const workoutPage = document.getElementById('page-workout');
    if (workoutPage) {
        workoutPage.addEventListener('click', (e) => {
            const t = e.target;
            if (t.id === 'add-exercise-btn' || t.closest('#add-exercise-btn')) APP.handleAddExerciseClick();
            if (t.id === 'save-workout-btn' || t.closest('#save-workout-btn')) APP.handleSaveWorkout();
            if (t.id === 'load-template-btn' || t.closest('#load-template-btn')) { APP.populateTemplateList(APP.state.cache.workoutTemplates); document.getElementById('load-template-modal')?.classList.remove('hidden'); }
            if (t.id === 'save-as-template-btn' || t.closest('#save-as-template-btn')) APP.handleSaveAsTemplate();
            if (t.id === 'clear-workout-btn' || t.closest('#clear-workout-btn')) APP.handleClearWorkout();

            const card = t.closest('.card');
            if (!card) return;
            if (t.closest('.js-add-set')) APP.addSet(card);
            if (t.closest('.js-delete-set')) APP.deleteSet(t.closest('.js-set-row'));
            if (t.closest('.js-delete-exercise')) APP.deleteExercise(card);
            if (t.closest('.js-copy-set')) APP.copyLastSet(card);
            if (t.closest('.js-start-timer')) APP.startTimer(90);
        });

        const workoutList = document.getElementById('workout-list');
        if (workoutList) {
            workoutList.addEventListener('input', (e) => {
                if (e.target.matches('.js-weight-input, .js-reps-input, .js-unit-select')) {
                    const card = e.target.closest('.card');
                    if (card) { APP.calculateVolume(card); APP.updateDailyTotalVolume(); }
                }
            });
            workoutList.addEventListener('change', (e) => {
                if (e.target.matches('.js-unit-select')) {
                    const card = e.target.closest('.card');
                    if (card) { APP.calculateVolume(card); APP.updateDailyTotalVolume(); }
                }
            });
            // Initialize drag-and-drop for workout cards
            APP.initDragAndDrop(workoutList);
        }
    }

    // Photo uploads preview
    ['photo-front-upload', 'photo-side-upload', 'photo-back-upload'].forEach(inputId => {
        const input = document.getElementById(inputId);
        const previewId = inputId.replace('upload', 'preview');
        const preview = document.getElementById(previewId);
        if (input && preview) {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const url = URL.createObjectURL(file);
                    preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:0.375rem;" alt="預覽">`;
                } else {
                    preview.innerHTML = '<span style="color:var(--color-text-muted)">預覽</span>';
                }
            });
        }
    });

    // Save photos
    document.getElementById('save-photos-btn')?.addEventListener('click', () => APP.saveBodyPhotos());

    // Compare photos
    document.getElementById('open-compare-modal-btn')?.addEventListener('click', () => APP.openCompareModal());
    document.getElementById('compare-modal-close')?.addEventListener('click', () => document.getElementById('compare-photos-modal')?.classList.add('hidden'));
    document.getElementById('compare-select-before')?.addEventListener('change', (e) => APP.updateCompareImage('before', e.target.value));
    document.getElementById('compare-select-after')?.addEventListener('change', (e) => APP.updateCompareImage('after', e.target.value));

    // Analysis refresh
    document.getElementById('refresh-analysis-btn')?.addEventListener('click', () => {
        APP.state.cache.analysisData = null;
        APP.showToast('正在重新載入分析數據...');
        APP.loadHistoryData();
    });

    // User switcher
    document.getElementById('user-switcher')?.addEventListener('change', (e) => APP.switchUser(e.target.value));

    // Autocomplete modal
    document.getElementById('autocomplete-cancel')?.addEventListener('click', () => APP.showAutocompleteModal(false));
    document.getElementById('autocomplete-confirm')?.addEventListener('click', () => {
        if (APP.state.modal.promptCallback) APP.state.modal.promptCallback(document.getElementById('autocomplete-input').value);
    });
    document.getElementById('autocomplete-input')?.addEventListener('input', (e) => APP.updateAutocompleteSuggestions(e.target.value));
    document.getElementById('suggestions-list')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('js-suggestion-item')) {
            if (APP.state.modal.promptCallback) APP.state.modal.promptCallback(e.target.textContent);
        }
    });
    document.querySelector('#autocomplete-modal .modal-backdrop')?.addEventListener('click', () => APP.showAutocompleteModal(false));

    // Prompt modal
    document.getElementById('prompt-cancel')?.addEventListener('click', () => APP.showPromptModal(false));
    document.getElementById('prompt-confirm')?.addEventListener('click', () => {
        if (APP.state.modal.promptCallback) APP.state.modal.promptCallback(document.getElementById('prompt-input').value);
    });
    document.querySelector('#prompt-modal .modal-backdrop')?.addEventListener('click', () => APP.showPromptModal(false));

    // Confirm delete modal
    document.getElementById('cancel-delete')?.addEventListener('click', () => APP.showConfirmDeleteModal(false));
    document.getElementById('confirm-delete')?.addEventListener('click', () => {
        if (APP.state.modal.confirmCallback) APP.state.modal.confirmCallback();
        APP.showConfirmDeleteModal(false);
    });
    document.querySelector('#confirm-delete-modal .modal-backdrop')?.addEventListener('click', () => APP.showConfirmDeleteModal(false));

    // Load template modal
    document.getElementById('load-template-cancel')?.addEventListener('click', () => document.getElementById('load-template-modal')?.classList.add('hidden'));
    document.querySelector('#load-template-modal .modal-backdrop')?.addEventListener('click', () => document.getElementById('load-template-modal')?.classList.add('hidden'));
    document.getElementById('template-list')?.addEventListener('click', (e) => {
        const loadBtn = e.target.closest('.js-load-template');
        if (loadBtn) APP.handleLoadTemplate(loadBtn.dataset.templateName);
        const deleteBtn = e.target.closest('.js-delete-template');
        if (deleteBtn) APP.handleDeleteTemplate(deleteBtn.dataset.templateName);
    });

    // Compare photos modal backdrop
    document.querySelector('#compare-photos-modal .modal-backdrop')?.addEventListener('click', () => document.getElementById('compare-photos-modal')?.classList.add('hidden'));

    // Image modal
    document.getElementById('image-modal-close')?.addEventListener('click', () => APP.closeImageModal());
    document.getElementById('image-modal-backdrop')?.addEventListener('click', () => APP.closeImageModal());

    // Global image click (for photo enlargement)
    document.body.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG' && e.target.dataset.fullsizeUrl) APP.openImageModal(e.target.dataset.fullsizeUrl);
    });

    // Timer
    document.getElementById('timer-plus-15')?.addEventListener('click', () => APP.addTimerTime(15));
    document.getElementById('timer-minus-15')?.addEventListener('click', () => APP.addTimerTime(-15));
    document.getElementById('timer-reset')?.addEventListener('click', () => APP.resetTimer());
});

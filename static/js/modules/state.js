// =========================================
// 状态管理模块 (State Management Module)
// =========================================
// 职责: 管理应用全局状态、localStorage/sessionStorage 持久化

// === 状态持久化配置 ===

// 1. 偏好设置 (存入 LocalStorage，长期保留)
const PERSISTENT_SETTINGS_IDS = [
    'providerSelector',
    'editAspectRatioSelector',
    'generateAspectRatioSelector',
    'editResolutionSelector',
    'generateResolutionSelector',
    'editCountInput',
    'imageCountInput',
    'temperatureSlider',        // 编辑模式温度
    'generateTemperatureSlider' // 生成模式温度
];

// 2. 任务内容 (存入 SessionStorage，关闭标签页即清除)
const PERSISTENT_TEXT_IDS = [
    'instructionInput',
    'descriptionInput'
];

// === 应用状态变量 ===

// 用于存储每个服务商上次选择的模型
let providerModelPreferences = JSON.parse(localStorage.getItem('provider_model_preferences') || '{}');

// 核心状态变量
let selectedFile = null;
let downloadUrl = null;  // 已废弃但保留
let downloadUrls = [];
let editDownloadUrls = [];
let currentMode = 'edit';
let apiKey = null;
let currentProvider = 'google';
let appConfig = null;

// === Getter/Setter 函数 ===

export function getApiKey() { return apiKey; }
export function setApiKey(key) { apiKey = key; }

export function getCurrentProvider() { return currentProvider; }
export function setCurrentProvider(provider) { currentProvider = provider; }

export function getAppConfig() { return appConfig; }
export function setAppConfig(config) { appConfig = config; }

export function getSelectedFile() { return selectedFile; }
export function setSelectedFile(file) { selectedFile = file; }

export function getCurrentMode() { return currentMode; }
export function setCurrentMode(mode) { currentMode = mode; }

export function getEditDownloadUrls() { return editDownloadUrls; }
export function setEditDownloadUrls(urls) { editDownloadUrls = urls; }

export function getDownloadUrls() { return downloadUrls; }
export function setDownloadUrls(urls) { downloadUrls = urls; }

export function getDownloadUrl() { return downloadUrl; }
export function setDownloadUrl(url) { downloadUrl = url; }

export function getProviderModelPreferences() { return providerModelPreferences; }

// === 状态持久化函数 ===

/**
 * 保存当前应用状态到本地存储
 */
export function saveAppState() {
    // 保存偏好设置
    const settings = {};
    PERSISTENT_SETTINGS_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) settings[id] = el.value;
    });
    localStorage.setItem('image_chat_settings', JSON.stringify(settings));

    // 保存文本内容
    const texts = {};
    PERSISTENT_TEXT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) texts[id] = el.value;
    });
    sessionStorage.setItem('image_chat_texts', JSON.stringify(texts));
}

/**
 * 恢复保存的用户状态
 * @returns {Object} 恢复的状态信息 { provider, settings, needsUIUpdate }
 */
export function restoreAppState() {
    console.log('[State] 开始恢复用户状态...');

    let settings = null;
    let restoredProvider = currentProvider;

    try {
        settings = JSON.parse(localStorage.getItem('image_chat_settings'));
    } catch (e) {
        console.error('[State] 读取设置失败:', e);
    }

    if (settings) {
        // 1. 优先恢复 Provider
        if (settings['providerSelector']) {
            const providerEl = document.getElementById('providerSelector');
            if (providerEl) {
                providerEl.value = settings['providerSelector'];
                currentProvider = settings['providerSelector'];
                restoredProvider = settings['providerSelector'];
            }
        }

        // 2. 恢复其他控件
        PERSISTENT_SETTINGS_IDS.forEach(id => {
            if (id === 'providerSelector') return; // 跳过，已处理

            const el = document.getElementById(id);
            if (el && settings[id] !== undefined) {
                el.value = settings[id];

                // 如果是滑块，手动更新对应的数字显示
                if (id === 'temperatureSlider') {
                    const valSpan = document.getElementById('temperatureValue');
                    if (valSpan) valSpan.textContent = settings[id];
                }
                if (id === 'generateTemperatureSlider') {
                    const valSpan = document.getElementById('generateTemperatureValue');
                    if (valSpan) valSpan.textContent = settings[id];
                }
            }
        });
    }

    // 3. 恢复文本内容
    try {
        const texts = JSON.parse(sessionStorage.getItem('image_chat_texts'));
        if (texts) {
            PERSISTENT_TEXT_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el && texts[id] !== undefined) {
                    el.value = texts[id];
                }
            });
        }
    } catch (e) {
        console.error('[State] 恢复文本失败:', e);
    }

    // 4. 加载对应服务商的 API Key
    const storageKey = `api_key_${currentProvider}`;
    const savedApiKey = localStorage.getItem(storageKey);
    if (savedApiKey) {
        apiKey = savedApiKey;
    }

    console.log('[State] 用户状态恢复完成');

    // 返回恢复的状态信息，由 main.js 决定如何更新 UI
    return {
        provider: restoredProvider,
        apiKey: savedApiKey,
        settings: settings,
        needsUIUpdate: true,
        needsResolutionCheck: currentProvider === 'google'
    };
}

/**
 * 初始化自动保存监听器
 */
export function initAutoSave() {
    const allIds = [...PERSISTENT_SETTINGS_IDS, ...PERSISTENT_TEXT_IDS];
    allIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // 对输入框使用 input 事件 (实时保存)，对下拉框使用 change 事件
            const eventType = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? 'input' : 'change';
            el.addEventListener(eventType, saveAppState);
        }
    });
    console.log('[State] 自动保存监听已启动');
}

/**
 * 保存服务商的模型偏好
 * @param {string} provider - 服务商名称
 * @param {string} model - 模型名称
 */
export function saveProviderModelPreference(provider, model) {
    providerModelPreferences[provider] = model;
    localStorage.setItem('provider_model_preferences', JSON.stringify(providerModelPreferences));
}

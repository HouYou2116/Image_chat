// ==========================================
// 应用入口文件 (Main Entry Point)
// ==========================================
// 职责: 编排所有模块，实现具体业务逻辑，绑定事件监听器

// === 导入所有模块 ===
import * as State from './modules/state.js';
import * as Config from './modules/config.js';
import * as API from './modules/api.js';
import * as UI from './modules/ui.js';
import * as Workflow from './modules/workflow.js';
import * as Utils from './modules/utils.js';
import * as DOM from './modules/ui/dom_map.js';

// === 挂载到 window（为了让动态生成的 HTML 中的事件委托能访问） ===
window.downloadSingleImage = Utils.downloadSingleImage;

// === 应用初始化函数 ===
async function initApp() {
    console.log('[Init] 开始初始化应用');

    // 1. 重置 UI 状态
    UI.showLoading(false);
    UI.showGenerateLoading(false);
    UI.hideError();

    // 2. 加载后端配置
    UI.showConfigLoading('正在加载配置...');
    try {
        const result = await Config.loadConfiguration();
        if (result.success) {
            State.setAppConfig(result.config);
            State.setCurrentProvider(result.config.defaultProvider);

            // 初始化 Google 图像参数选项
            if (result.config.providers.google && result.config.providers.google.imageOptions) {
                Config.initGoogleImageOptions(result.config);
            }

            if (result.usingFallback) {
                UI.showError('配置加载失败，使用默认配置');
            }
        } else {
            throw new Error(result.error || '配置加载失败');
        }
    } catch (error) {
        console.error('[Init] 配置加载错误:', error);
        UI.showError('配置加载失败');
    } finally {
        UI.hideConfigLoading();
    }

    // 3. 恢复用户状态
    const restoredState = State.restoreAppState();

    // 4. 更新 UI
    const currentProvider = State.getCurrentProvider();
    const appConfig = State.getAppConfig();
    const apiKey = restoredState.apiKey;

    UI.updateUIForProvider(currentProvider, appConfig, apiKey);
    UI.updateModelSelectors(currentProvider, appConfig, State.getProviderModelPreferences());

    // 5. 如果需要，刷新分辨率控件状态
    if (restoredState.needsResolutionCheck) {
        const editModelSelector = DOM.getElementById(DOM.EDIT.MODEL_SELECT);
        const genModelSelector = DOM.getElementById(DOM.GENERATE.MODEL_SELECT);

        if (editModelSelector) {
            UI.updateResolutionAvailability('edit', editModelSelector.value, currentProvider, appConfig);
        }
        if (genModelSelector) {
            UI.updateResolutionAvailability('generate', genModelSelector.value, currentProvider, appConfig);
        }
    }

    // 6. 更新 API Key 状态显示
    if (apiKey) {
        UI.updateApiKeyStatus('API Key已加载', 'success');
    }

    // 7. 初始化自动保存
    State.initAutoSave();

    console.log('[Init] 应用初始化完成');
}

// === 温度滑块初始化 ===
function initTemperatureSliders() {
    // 编辑模式温度滑块
    const temperatureSlider = DOM.getElementById(DOM.EDIT.TEMPERATURE_SLIDER);
    const temperatureValue = DOM.getElementById(DOM.EDIT.TEMPERATURE_VALUE);

    if (temperatureSlider && temperatureValue) {
        temperatureSlider.addEventListener('input', function() {
            temperatureValue.textContent = this.value;
        });
    }

    // 生成模式温度滑块
    const generateTemperatureSlider = DOM.getElementById(DOM.GENERATE.TEMPERATURE_SLIDER);
    const generateTemperatureValue = DOM.getElementById(DOM.GENERATE.TEMPERATURE_VALUE);

    if (generateTemperatureSlider && generateTemperatureValue) {
        generateTemperatureSlider.addEventListener('input', function() {
            generateTemperatureValue.textContent = this.value;
        });
    }
}

// === 事件处理函数 ===

// API Key 管理
async function handleSaveApiKey() {
    const appConfig = State.getAppConfig();
    if (!appConfig) {
        UI.updateApiKeyStatus('配置未加载', 'error');
        return;
    }

    const apiKeyInput = DOM.getElementById(DOM.API_KEY.INPUT);
    const key = apiKeyInput.value.trim();

    if (!key) {
        UI.updateApiKeyStatus('请输入 API Key', 'error');
        return;
    }

    const currentProvider = State.getCurrentProvider();
    const expectedPrefix = appConfig.providers[currentProvider].apiKeyPrefix;
    if (!key.startsWith(expectedPrefix)) {
        UI.updateApiKeyStatus(`API Key 格式不正确（应以 ${expectedPrefix} 开头）`, 'error');
        return;
    }

    const storageKey = `api_key_${currentProvider}`;
    localStorage.setItem(storageKey, key);
    State.setApiKey(key);
    UI.updateApiKeyStatus('API Key已保存', 'success');
}

function handleDeleteApiKey() {
    const currentProvider = State.getCurrentProvider();
    const storageKey = `api_key_${currentProvider}`;
    localStorage.removeItem(storageKey);

    DOM.getElementById(DOM.API_KEY.INPUT).value = '';
    State.setApiKey(null);
    UI.updateApiKeyStatus('API Key已清除', 'success');
}

// 模式切换
function handleSwitchMode(mode) {
    // 1. 更新状态
    State.setCurrentMode(mode);

    // 2. 调用 UI 模块切换显示
    if (mode === 'edit') {
        UI.switchToEditMode();
    } else {
        UI.switchToGenerateMode();
    }

    // 3. 如果 AUTO 模式开启，同步切换 AUTO 面板
    if (State.isAutoEnabled()) {
        UI.toggleAutoModeUI(true, mode);
    }

    UI.hideError();
}

// 图片编辑
async function handleEditImage() {
    // ===== 前置验证（AUTO和普通模式共用）=====
    try {
        // 调用验证函数（不执行实际请求）
        UI.getTaskParams('edit');
    } catch (error) {
        UI.showError(error.message);  // 显示验证错误
        return;  // 不进入后续流程
    }

    // 检查是否为 AUTO 模式
    if (State.isAutoEnabled()) {
        // ===== AUTO 模式：禁用按钮并启动循环 =====
        const editBtn = document.getElementById(DOM.EDIT.SUBMIT_BUTTON);
        if (editBtn) {
            editBtn.disabled = true;
            editBtn.textContent = '处理中...';  // 修改按钮文字
        }

        try {
            await Workflow.startAutoLoop('edit');
        } finally {
            // 循环结束后恢复按钮状态
            if (editBtn) {
                editBtn.disabled = false;
                editBtn.textContent = '开始编辑';
            }
        }
        return;
    }

    // === 普通模式：单次执行（使用流式 API）===
    try {
        UI.showLoading(true);
        UI.hideError();
        UI.clearEditResults();

        const result = await Workflow.runTaskOnce('edit', { useStream: true });

        if (result.success) {
            console.log(`[Edit] 流式接收完成，共 ${result.totalReceived} 张图片`);
            // 流式模式下，图片已在回调中逐张渲染
            // 只需更新批量下载按钮和状态
            if (result.images && result.images.length > 0) {
                const downloadUrls = result.images.map(img => img.download_url);
                State.setEditDownloadUrls(downloadUrls);
            }
        } else {
            UI.showError(result.error || '编辑失败');
            UI.resetEditResults();
        }
    } catch (error) {
        UI.showError(error.message || '网络错误');
        UI.resetEditResults();
    } finally {
        UI.showLoading(false);
    }
}

// 图片生成
async function handleGenerateImage() {
    // ===== 前置验证（AUTO和普通模式共用）=====
    try {
        // 调用验证函数（不执行实际请求）
        UI.getTaskParams('generate');
    } catch (error) {
        UI.showError(error.message);  // 显示验证错误
        return;  // 不进入后续流程
    }

    // 检查是否为 AUTO 模式
    if (State.isAutoEnabled()) {
        // ===== AUTO 模式：禁用按钮并启动循环 =====
        const generateBtn = document.getElementById(DOM.GENERATE.SUBMIT_BUTTON);
        if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.textContent = '处理中...';  // 修改按钮文字
        }

        try {
            await Workflow.startAutoLoop('generate');
        } finally {
            // 循环结束后恢复按钮状态
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = '开始生成';
            }
        }
        return;
    }

    // === 普通模式：单次执行（使用流式 API）===
    try {
        UI.showGenerateLoading(true);
        UI.hideError();
        UI.clearGenerateResults();

        const result = await Workflow.runTaskOnce('generate', { useStream: true });

        if (result.success) {
            console.log(`[Generate] 流式接收完成，共 ${result.totalReceived} 张图片`);
            // 流式模式下，图片已在回调中逐张渲染
            // 只需更新批量下载按钮和状态
            if (result.images && result.images.length > 0) {
                const downloadUrls = result.images.map(img => img.download_url);
                State.setDownloadUrls(downloadUrls);
            }
        } else {
            UI.showError(result.error || '生成失败');
            UI.resetGenerateResults();
        }
    } catch (error) {
        UI.showError(error.message || '网络错误');
        UI.resetGenerateResults();
    } finally {
        UI.showGenerateLoading(false);
    }
}

// === AUTO 模式核心函数 ===
// 注意：核心业务逻辑已迁移到 modules/workflow.js
// - runTaskOnce() → Workflow.runTaskOnce()
// - runAutoLoop() → Workflow.startAutoLoop()
// - stopAutoLoop() → Workflow.stopAutoLoop()

// 批量下载
function handleDownloadEditImages() {
    const urls = State.getEditDownloadUrls();
    Utils.downloadAllImages(urls, 'edited_image');
}

function handleDownloadAllImages() {
    const urls = State.getDownloadUrls();
    Utils.downloadAllImages(urls, 'generated_image');
}

// === DOMContentLoaded 事件 ===
document.addEventListener('DOMContentLoaded', async () => {
    // 1. 执行统一初始化流程
    await initApp();

    // 2. Provider 选择器变化
    const providerSelector = DOM.getElementById(DOM.API_KEY.PROVIDER_SELECT);
    if (providerSelector) {
        providerSelector.addEventListener('change', function() {
            const provider = this.value;

            // 1. 更新状态
            State.setCurrentProvider(provider);

            // 2. 更新 localStorage
            const storageKey = `api_key_${provider}`;
            const savedApiKey = localStorage.getItem(storageKey);
            State.setApiKey(savedApiKey);

            // 3. 更新 UI
            const appConfig = State.getAppConfig();
            UI.updateUIForProvider(provider, appConfig, savedApiKey);
            UI.updateModelSelectors(provider, appConfig, State.getProviderModelPreferences());

            // 4. Google 专用：更新分辨率可用性
            if (provider === 'google') {
                const editModelSelector = DOM.getElementById(DOM.EDIT.MODEL_SELECT);
                const genModelSelector = DOM.getElementById(DOM.GENERATE.MODEL_SELECT);

                if (editModelSelector) {
                    UI.updateResolutionAvailability('edit', editModelSelector.value, provider, appConfig);
                }
                if (genModelSelector) {
                    UI.updateResolutionAvailability('generate', genModelSelector.value, provider, appConfig);
                }
            }

            // 5. 统一刷新并发设置
            Workflow.refreshAllAutoConcurrencyUI();
        });
    }

    // 3. 模型选择器变化（编辑模式）
    const editModelSelector = DOM.getElementById(DOM.EDIT.MODEL_SELECT);
    if (editModelSelector) {
        editModelSelector.addEventListener('change', function() {
            const provider = State.getCurrentProvider();
            const appConfig = State.getAppConfig();

            // 1. 更新分辨率可用性
            UI.updateResolutionAvailability('edit', this.value, provider, appConfig);

            // 2. 保存模型偏好
            State.saveProviderModelPreference(provider, this.value);

            // 3. 刷新编辑模式的并发设置
            Workflow.refreshAutoConcurrencyUI('edit');
        });
    }

    // 4. 模型选择器变化（生成模式）
    const genModelSelector = DOM.getElementById(DOM.GENERATE.MODEL_SELECT);
    if (genModelSelector) {
        genModelSelector.addEventListener('change', function() {
            const provider = State.getCurrentProvider();
            const appConfig = State.getAppConfig();

            // 1. 更新分辨率可用性
            UI.updateResolutionAvailability('generate', this.value, provider, appConfig);

            // 2. 保存模型偏好
            State.saveProviderModelPreference(provider + '_generate', this.value);

            // 3. 刷新生成模式的并发设置
            Workflow.refreshAutoConcurrencyUI('generate');
        });
    }

    // 5. 初始化温度滑块
    initTemperatureSliders();

    // 6. 初始化 AUTO 模式并发滑块
    const autoConcurrencySliderEdit = DOM.getElementById(DOM.AUTO.CONCURRENCY_SLIDER_EDIT);
    const autoConcurrencySliderGenerate = DOM.getElementById(DOM.AUTO.CONCURRENCY_SLIDER_GENERATE);

    // 编辑模式滑块 - 实时更新显示数字
    if (autoConcurrencySliderEdit) {
        autoConcurrencySliderEdit.addEventListener('input', (e) => {
            const valueEl = DOM.getElementById(DOM.AUTO.CONCURRENCY_VALUE_EDIT);
            if (valueEl) {
                valueEl.textContent = e.target.value;
            }
        });
    }

    // 生成模式滑块 - 实时更新显示数字
    if (autoConcurrencySliderGenerate) {
        autoConcurrencySliderGenerate.addEventListener('input', (e) => {
            const valueEl = DOM.getElementById(DOM.AUTO.CONCURRENCY_VALUE_GENERATE);
            if (valueEl) {
                valueEl.textContent = e.target.value;
            }
        });
    }

    // 初始化时调用一次，设置默认值
    try {
        Workflow.refreshAllAutoConcurrencyUI();
    } catch (error) {
        console.error('[Init] AUTO 设置初始化失败:', error);
        // 失败不影响后续事件绑定
    }

    // === 事件绑定 ===

    // API Key 管理
    document.querySelector('.js-save-api-key')?.addEventListener('click', handleSaveApiKey);
    document.querySelector('.js-delete-api-key')?.addEventListener('click', handleDeleteApiKey);

    // 模式切换
    document.querySelector('.js-mode-edit')?.addEventListener('click', () => handleSwitchMode('edit'));
    document.querySelector('.js-mode-generate')?.addEventListener('click', () => handleSwitchMode('generate'));

    // 图像编辑和生成
    document.querySelector('.js-edit-btn')?.addEventListener('click', handleEditImage);
    document.querySelector('.js-generate-btn')?.addEventListener('click', handleGenerateImage);

    // 批量下载
    document.querySelector('.js-download-edit-btn')?.addEventListener('click', handleDownloadEditImages);
    document.querySelector('.js-download-all-btn')?.addEventListener('click', handleDownloadAllImages);

    // AUTO 模式切换
    DOM.getElementById(DOM.AUTO.TOGGLE_BUTTON)?.addEventListener('click', () => {
        const currentMode = State.getCurrentMode();
        const currentAutoState = State.isAutoEnabled();

        if (currentAutoState) {
            // ===== 关闭 AUTO：统一调用 stopAutoLoop() =====
            Workflow.stopAutoLoop();  // 使用统一的停止逻辑
            console.log('[AUTO] 已关闭（通过AUTO按钮）');
        } else {
            // 开启 AUTO
            State.setAutoEnabled(true);
            State.setAutoMode(currentMode);
            UI.toggleAutoModeUI(true, currentMode);
            console.log(`[AUTO] 已开启 (${currentMode} 模式)`);
        }
    });

    // 模态框关闭
    document.querySelector('.js-modal-close')?.addEventListener('click', UI.closeImageModal);

    console.log('[Init] 事件绑定完成');
});

// === 其他事件监听器 ===

// 停止 AUTO 按钮事件委托（两个面板都有stopAutoBtn）
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('stop-auto-btn') || e.target.id === DOM.AUTO.STOP_BUTTON) {
        console.log('[Workflow] 用户点击停止按钮');
        Workflow.stopAutoLoop();  // 统一处理所有停止逻辑
    }
});

// 文件选择监听器
DOM.getElementById(DOM.EDIT.IMAGE_INPUT).addEventListener('change', function(e) {
    const files = e.target.files;

    if (files.length > 0) {
        State.setSelectedFile(files);

        // 重置编辑结果区域
        const editedImagesDiv = DOM.getElementById(DOM.EDIT.RESULTS_IMAGES);
        editedImagesDiv.innerHTML = '<p>编辑完成后显示</p>';

        // 隐藏批量下载按钮
        const downloadEditBtn = DOM.getElementById(DOM.EDIT.DOWNLOAD_BUTTON);
        downloadEditBtn.style.display = 'none';

        // 清空下载 URL 数组
        State.setEditDownloadUrls([]);

        // 渲染文件预览（使用封装函数）
        UI.renderFilePreviews(files);
    }
});

// 模态框背景点击关闭
document.addEventListener('click', function(e) {
    const modal = DOM.getElementById(DOM.COMMON.IMAGE_MODAL);
    if (e.target === modal) {
        UI.closeImageModal();
    }
});

// ESC 键关闭模态框
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = DOM.getElementById(DOM.COMMON.IMAGE_MODAL);
        if (modal.style.display === 'block') {
            UI.closeImageModal();
        }
    }
});

// 图片点击事件委托
document.addEventListener('click', function(e) {
    if (e.target.tagName === 'IMG' && e.target.closest('.image-preview, .generated-item')) {
        const imgSrc = e.target.src;
        if (imgSrc && !imgSrc.includes('data:image/svg')) {
            UI.openImageModal(imgSrc);
        }
    }
});

// 单张图片下载事件委托
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('js-download-single')) {
        const url = e.target.dataset.url;
        const filename = e.target.dataset.filename;
        Utils.downloadSingleImage(url, filename);
    }
});

// Ctrl+Enter 快捷键
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') {
        const currentMode = State.getCurrentMode();
        if (currentMode === 'edit') {
            handleEditImage();
        } else {
            handleGenerateImage();
        }
    }
});

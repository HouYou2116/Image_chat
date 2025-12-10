// ==========================================
// 应用入口文件 (Main Entry Point)
// ==========================================
// 职责: 编排所有模块，实现具体业务逻辑，绑定事件监听器

// === 导入所有模块 ===
import * as State from './modules/state.js';
import * as Config from './modules/config.js';
import { getConcurrencyRule } from './modules/config.js';
import * as API from './modules/api.js';
import * as UI from './modules/ui.js';
import * as Workflow from './modules/workflow.js';
import * as Utils from './modules/utils.js';

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
        const editModelSelector = document.getElementById('modelSelector');
        const genModelSelector = document.getElementById('generateModelSelector');

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
    const temperatureSlider = document.getElementById('temperatureSlider');
    const temperatureValue = document.getElementById('temperatureValue');

    if (temperatureSlider && temperatureValue) {
        temperatureSlider.addEventListener('input', function() {
            temperatureValue.textContent = this.value;
        });
    }

    // 生成模式温度滑块
    const generateTemperatureSlider = document.getElementById('generateTemperatureSlider');
    const generateTemperatureValue = document.getElementById('generateTemperatureValue');

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

    const apiKeyInput = document.getElementById('apiKeyInput');
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

    document.getElementById('apiKeyInput').value = '';
    State.setApiKey(null);
    UI.updateApiKeyStatus('API Key已清除', 'success');
}

// 模式切换
function handleSwitchMode(mode) {
    State.setCurrentMode(mode);

    // 更新 Tab 按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    if (mode === 'edit') {
        document.querySelector('.js-mode-edit').classList.add('active');
        document.getElementById('editMode').style.display = 'block';
        document.getElementById('generateMode').style.display = 'none';
        document.getElementById('editResults').style.display = 'grid';
        document.getElementById('generateResults').style.display = 'none';
    } else {
        document.querySelector('.js-mode-generate').classList.add('active');
        document.getElementById('editMode').style.display = 'none';
        document.getElementById('generateMode').style.display = 'block';
        document.getElementById('editResults').style.display = 'none';
        document.getElementById('generateResults').style.display = 'block';
    }

    UI.hideError();
}

// 图片编辑
async function handleEditImage() {
    // 检查是否为 AUTO 模式
    if (State.isAutoEnabled()) {
        // AUTO 模式：启动循环
        await Workflow.startAutoLoop('edit');
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
    // 检查是否为 AUTO 模式
    if (State.isAutoEnabled()) {
        // AUTO 模式：启动循环
        await Workflow.startAutoLoop('generate');
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
    const providerSelector = document.getElementById('providerSelector');
    if (providerSelector) {
        providerSelector.addEventListener('change', function() {
            State.setCurrentProvider(this.value);
            const appConfig = State.getAppConfig();

            // 加载对应服务商的 API Key
            const storageKey = `api_key_${this.value}`;
            const savedApiKey = localStorage.getItem(storageKey);
            State.setApiKey(savedApiKey);

            UI.updateUIForProvider(this.value, appConfig, savedApiKey);
            UI.updateModelSelectors(this.value, appConfig, State.getProviderModelPreferences());

            // 刷新分辨率控件状态
            if (this.value === 'google') {
                const editModelSelector = document.getElementById('modelSelector');
                const genModelSelector = document.getElementById('generateModelSelector');

                if (editModelSelector) {
                    UI.updateResolutionAvailability('edit', editModelSelector.value, this.value, appConfig);
                }
                if (genModelSelector) {
                    UI.updateResolutionAvailability('generate', genModelSelector.value, this.value, appConfig);
                }
            }

            // 更新 AUTO 模式并发设置
            const editModel = document.getElementById('modelSelector')?.value;
            const genModel = document.getElementById('generateModelSelector')?.value;
            const editRule = getConcurrencyRule(this.value, editModel);
            const genRule = getConcurrencyRule(this.value, genModel);
            UI.updateAutoConcurrencySettings('edit', editRule);
            UI.updateAutoConcurrencySettings('generate', genRule);
        });
    }

    // 3. 模型选择器变化（编辑模式）
    const editModelSelector = document.getElementById('modelSelector');
    if (editModelSelector) {
        editModelSelector.addEventListener('change', function() {
            const provider = State.getCurrentProvider();
            const appConfig = State.getAppConfig();
            UI.updateResolutionAvailability('edit', this.value, provider, appConfig);
            State.saveProviderModelPreference(provider, this.value);

            // 更新 AUTO 模式并发设置
            const rule = getConcurrencyRule(provider, this.value);
            UI.updateAutoConcurrencySettings('edit', rule);
        });
    }

    // 4. 模型选择器变化（生成模式）
    const genModelSelector = document.getElementById('generateModelSelector');
    if (genModelSelector) {
        genModelSelector.addEventListener('change', function() {
            const provider = State.getCurrentProvider();
            const appConfig = State.getAppConfig();
            UI.updateResolutionAvailability('generate', this.value, provider, appConfig);
            State.saveProviderModelPreference(provider + '_generate', this.value);

            // 更新 AUTO 模式并发设置
            const rule = getConcurrencyRule(provider, this.value);
            UI.updateAutoConcurrencySettings('generate', rule);
        });
    }

    // 5. 初始化温度滑块
    initTemperatureSliders();

    // 6. 初始化 AUTO 模式并发滑块
    const autoConcurrencySliderEdit = document.getElementById('autoConcurrencySliderEdit');
    const autoConcurrencySliderGenerate = document.getElementById('autoConcurrencySliderGenerate');

    // 编辑模式滑块 - 实时更新显示数字
    if (autoConcurrencySliderEdit) {
        autoConcurrencySliderEdit.addEventListener('input', (e) => {
            const valueEl = document.getElementById('autoConcurrencyValueEdit');
            if (valueEl) {
                valueEl.textContent = e.target.value;
            }
        });
    }

    // 生成模式滑块 - 实时更新显示数字
    if (autoConcurrencySliderGenerate) {
        autoConcurrencySliderGenerate.addEventListener('input', (e) => {
            const valueEl = document.getElementById('autoConcurrencyValueGenerate');
            if (valueEl) {
                valueEl.textContent = e.target.value;
            }
        });
    }

    // 初始化时调用一次，设置默认值
    try {
        const provider = State.getCurrentProvider();
        const editModel = document.getElementById('modelSelector')?.value;
        const genModel = document.getElementById('generateModelSelector')?.value;

        const editRule = getConcurrencyRule(provider, editModel);
        const genRule = getConcurrencyRule(provider, genModel);

        UI.updateAutoConcurrencySettings('edit', editRule);
        UI.updateAutoConcurrencySettings('generate', genRule);
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
    document.getElementById('autoModeToggle')?.addEventListener('click', () => {
        const currentMode = State.getCurrentMode();
        const currentAutoState = State.isAutoEnabled();

        if (currentAutoState) {
            // 关闭 AUTO
            State.resetAutoState(); // 替换原有的 setAutoEnabled/Running/Mode
            UI.updateAutoStatsUI(State.getAutoStats()); // 新增：立即清零 UI

            UI.toggleAutoModeUI(false);
            console.log('[AUTO] 已关闭');
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
    if (e.target.classList.contains('stop-auto-btn') || e.target.id === 'stopAutoBtn') {
        console.log('[Workflow] 用户点击停止按钮');
        Workflow.stopAutoLoop();  // 统一处理所有停止逻辑
    }
});

// 文件选择监听器
document.getElementById('imageInput').addEventListener('change', function(e) {
    const files = e.target.files;

    if (files.length > 0) {
        State.setSelectedFile(files);

        // 重置编辑结果区域
        const editedImagesDiv = document.getElementById('editedImages');
        editedImagesDiv.innerHTML = '<p>编辑完成后显示</p>';

        // 隐藏批量下载按钮
        const downloadEditBtn = document.getElementById('downloadEditBtn');
        downloadEditBtn.style.display = 'none';

        // 清空下载 URL 数组
        State.setEditDownloadUrls([]);

        // 渲染文件预览（使用封装函数）
        UI.renderFilePreviews(files);
    }
});

// 模态框背景点击关闭
document.addEventListener('click', function(e) {
    const modal = document.getElementById('imageModal');
    if (e.target === modal) {
        UI.closeImageModal();
    }
});

// ESC 键关闭模态框
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('imageModal');
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

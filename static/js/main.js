// ==========================================
// 应用入口文件 (Main Entry Point)
// ==========================================
// 职责: 编排所有模块，实现具体业务逻辑，绑定事件监听器

// === 导入所有模块 ===
import * as State from './modules/state.js';
import * as Config from './modules/config.js';
import * as API from './modules/api.js';
import * as UI from './modules/ui.js';
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
        await runAutoLoop('edit');
        return;
    }

    // === 普通模式：单次执行 ===
    try {
        UI.showLoading(true);
        UI.hideError();
        UI.clearEditResults();

        const result = await runTaskOnce('edit');

        if (result.success) {
            const downloadUrls = UI.renderEditResults(result.images, false);  // isAutoMode = false
            State.setEditDownloadUrls(downloadUrls);
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
        await runAutoLoop('generate');
        return;
    }

    // === 普通模式：单次执行 ===
    try {
        UI.showGenerateLoading(true);
        UI.hideError();
        UI.clearGenerateResults();

        const result = await runTaskOnce('generate');

        if (result.success) {
            const downloadUrls = UI.renderGenerateResults(result.images, false);  // isAutoMode = false
            State.setDownloadUrls(downloadUrls);
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

/**
 * 执行一次图片处理任务（编辑或生成）
 * @param {string} mode - 'edit' 或 'generate'
 * @param {Object} options - 可选参数 { forceImageCount: 1 }
 * @returns {Promise<Object>} { success: boolean, images?: Array, error?: string }
 */
async function runTaskOnce(mode, options = {}) {
    const apiKey = State.getApiKey();

    if (mode === 'edit') {
        // 编辑模式验证
        const selectedFile = State.getSelectedFile();
        const instruction = document.getElementById('instructionInput').value.trim();

        if (!selectedFile) {
            throw new Error('请先选择图片');
        }
        if (!instruction) {
            throw new Error('请输入编辑指令');
        }
        if (!apiKey) {
            throw new Error('请先设置API Key');
        }

        // 准备 FormData
        const formData = new FormData();
        if (selectedFile instanceof FileList) {
            for (let i = 0; i < selectedFile.length; i++) {
                formData.append('image', selectedFile[i]);
            }
        } else {
            formData.append('image', selectedFile);
        }

        formData.append('instruction', instruction);
        // AUTO 模式强制设为 1，否则使用表单值
        const imageCount = options.forceImageCount || document.getElementById('editCountInput').value;
        formData.append('image_count', imageCount);
        formData.append('api_key', apiKey);
        formData.append('provider', State.getCurrentProvider());
        formData.append('model', document.getElementById('modelSelector').value);
        formData.append('temperature', document.getElementById('temperatureSlider').value);

        // Google 专用参数
        if (State.getCurrentProvider() === 'google') {
            const aspectRatio = document.getElementById('editAspectRatioSelector').value;
            const resolution = document.getElementById('editResolutionSelector').value;
            if (aspectRatio) formData.append('aspect_ratio', aspectRatio);
            if (resolution && !document.getElementById('editResolutionSelector').disabled) {
                formData.append('resolution', resolution);
            }
        }

        // 调用 API
        return await API.editImage(formData);

    } else if (mode === 'generate') {
        // 生成模式验证
        const description = document.getElementById('descriptionInput').value.trim();

        if (!description) {
            throw new Error('请输入图像描述');
        }
        if (!apiKey) {
            throw new Error('请先设置API Key');
        }

        // 准备 FormData
        const formData = new FormData();
        formData.append('description', description);
        // AUTO 模式强制设为 1，否则使用表单值
        const imageCount = options.forceImageCount || document.getElementById('imageCountInput').value;
        formData.append('image_count', imageCount);
        formData.append('api_key', apiKey);
        formData.append('provider', State.getCurrentProvider());
        formData.append('model', document.getElementById('generateModelSelector').value);
        formData.append('temperature', document.getElementById('generateTemperatureSlider').value);

        // Google 专用参数
        if (State.getCurrentProvider() === 'google') {
            const aspectRatio = document.getElementById('generateAspectRatioSelector').value;
            const resolution = document.getElementById('generateResolutionSelector').value;
            if (aspectRatio) formData.append('aspect_ratio', aspectRatio);
            if (resolution && !document.getElementById('generateResolutionSelector').disabled) {
                formData.append('resolution', resolution);
            }
        }

        // 调用 API
        return await API.generateImage(formData);
    }

    throw new Error('无效的模式: ' + mode);
}

/**
 * AUTO 模式循环执行
 * @param {string} mode - 'edit' 或 'generate'
 */
async function runAutoLoop(mode) {
    console.log(`[AUTO] 开始循环 (${mode} 模式)`);

    // 1. 初始化状态
    State.setAutoRunning(true);
    State.resetAutoStats();

    // 2. 更新 UI：显示统计面板
    UI.updateAutoStatsUI(State.getAutoStats());

    // 3. 主循环
    while (State.isAutoRunning()) {
        UI.hideError();
        try {
            // 更新统计：total++
            State.incrementAutoTotal();
            UI.updateAutoStatsUI(State.getAutoStats());

            console.log(`[AUTO] 第 ${State.getAutoStats().total} 次请求...`);

            // 执行一次任务（强制 image_count = 1）
            const result = await runTaskOnce(mode, { forceImageCount: 1 });

            if (result.success) {
                // 成功：success++，渲染结果（AUTO 模式）
                State.incrementAutoSuccess();
                UI.updateAutoStatsUI(State.getAutoStats());

                if (mode === 'edit') {
                    UI.renderEditResults(result.images, true);  // isAutoMode = true
                } else {
                    UI.renderGenerateResults(result.images, true);  // isAutoMode = true
                }

                // 记录下载链接到 sessionImages（可选，用于批量下载）
                result.images.forEach(img => {
                    State.addSessionImage(img.download_url);
                });

                console.log(`[AUTO] 第 ${State.getAutoStats().total} 次成功`);
            } else {
                // API 返回失败（但不抛异常）
                State.incrementAutoFail();
                UI.updateAutoStatsUI(State.getAutoStats());
                console.warn(`[AUTO] 第 ${State.getAutoStats().total} 次失败: ${result.error}`);
            }

        } catch (error) {
            // 捕获异常（验证错误、网络错误等），记录失败但不中断循环
            State.incrementAutoFail();
            UI.updateAutoStatsUI(State.getAutoStats());
            console.error(`[AUTO] 第 ${State.getAutoStats().total} 次异常:`, error.message);
        }

        // 4. 延时防封（1 秒间隔）
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('[AUTO] 循环已停止');
}

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
        });
    }

    // 5. 初始化温度滑块
    initTemperatureSliders();

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
            State.setAutoEnabled(false);
            State.setAutoRunning(false);  // 停止循环
            State.setAutoMode(null);
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
        console.log('[AUTO] 用户点击停止按钮');

        // 1. 立即切断所有状态
        State.setAutoEnabled(false);    // 关闭 AUTO 模式
        State.setAutoRunning(false);    // 停止循环
        State.setAutoMode(null);        // 清除模式记录

        // 2. 立即还原 UI（隐藏统计面板，显示普通控件）
        UI.toggleAutoModeUI(false);

        console.log('[AUTO] 已通过停止按钮关闭');
    }
});

// 文件选择监听器
document.getElementById('imageInput').addEventListener('change', function(e) {
    const files = e.target.files;
    const previewsDiv = document.getElementById('editPreviews');

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

        // 清空预览
        previewsDiv.innerHTML = '';

        // 显示多图预览
        if (files.length === 1) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const originalPreview = document.getElementById('originalPreview');
                const originalImageSrc = e.target.result;
                originalPreview.innerHTML = `<img src="${originalImageSrc}" alt="原图" class="js-clickable-image" style="cursor: pointer;">`;
                previewsDiv.innerHTML = '<p>已选择1张图片</p>';
            };
            reader.readAsDataURL(files[0]);
        } else {
            // 多图片预览
            let previewsHtml = `<div class="image-gallery"><p>已选择${files.length}张图片：</p>`;

            for (let i = 0; i < Math.min(files.length, 5); i++) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    previewsHtml += `<img src="${e.target.result}" alt="图片${i + 1}" style="max-width: 100px; margin: 5px;">`;
                    if (i === Math.min(files.length, 5) - 1) {
                        previewsHtml += '</div>';
                        if (files.length > 5) {
                            previewsHtml += `<p>...等${files.length}张图片</p>`;
                        }
                        previewsDiv.innerHTML = previewsHtml;
                    }
                };
                reader.readAsDataURL(files[i]);
            }

            // 清空单图预览区域
            document.getElementById('originalPreview').innerHTML = '<p>多图片编辑模式</p>';
        }
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

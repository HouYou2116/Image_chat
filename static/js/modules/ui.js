// ========================================
// UI 更新模块 (UI Module)
// ========================================
// 职责: DOM 操作、视觉更新、HTML 渲染

// === 加载状态管理 ===

/**
 * 显示/隐藏编辑模式加载状态
 * @param {boolean} show - 是否显示加载状态
 */
export function showLoading(show) {
    const loading = document.getElementById('loading');
    const editBtn = document.getElementById('editBtn');

    if (show) {
        loading.style.display = 'block';
        loading.innerHTML = '<p>正在编辑图片，请稍候...</p>';
        editBtn.disabled = true;
        editBtn.textContent = '处理中...';
    } else {
        loading.style.display = 'none';
        editBtn.disabled = false;
        editBtn.textContent = '开始编辑';
    }
}

/**
 * 显示/隐藏生成模式加载状态
 * @param {boolean} show - 是否显示加载状态
 */
export function showGenerateLoading(show) {
    const loading = document.getElementById('loading');
    const generateBtn = document.getElementById('generateBtn');

    if (show) {
        loading.style.display = 'block';
        loading.innerHTML = '<p>正在生成图片，请稍候...</p>';
        generateBtn.disabled = true;
        generateBtn.textContent = '生成中...';
    } else {
        loading.style.display = 'none';
        generateBtn.disabled = false;
        generateBtn.textContent = '开始生成';
    }
}

// === 错误信息管理 ===

/**
 * 显示错误信息
 * @param {string} message - 错误消息
 */
export function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

/**
 * 隐藏错误信息
 */
export function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';
}

// === 配置加载提示 ===

/**
 * 显示配置加载提示
 * @param {string} message - 提示消息
 */
export function showConfigLoading(message) {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'config-loading';
    loadingDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#4CAF50;color:white;padding:10px;text-align:center;z-index:9999';
    loadingDiv.textContent = message;
    document.body.prepend(loadingDiv);
}

/**
 * 隐藏配置加载提示
 */
export function hideConfigLoading() {
    const loadingDiv = document.getElementById('config-loading');
    if (loadingDiv) loadingDiv.remove();
}

// === 图片模态框 ===

/**
 * 打开图片模态框
 * @param {string} imageSrc - 图片 URL
 */
export function openImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');

    modal.style.display = 'block';
    modalImg.src = imageSrc;

    // 防止页面滚动
    document.body.style.overflow = 'hidden';
}

/**
 * 关闭图片模态框
 */
export function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.style.display = 'none';

    // 恢复页面滚动
    document.body.style.overflow = 'auto';
}

// === Provider UI 更新 ===

/**
 * 根据选择的服务商更新 UI
 * @param {string} provider - 服务商名称
 * @param {Object} appConfig - 应用配置对象
 * @param {string|null} apiKey - API Key
 */
export function updateUIForProvider(provider, appConfig, apiKey) {
    if (!appConfig) {
        console.error('[UI] updateUIForProvider: 配置未加载');
        return;
    }

    const providerConfig = appConfig.providers[provider];

    if (!providerConfig) {
        console.error('[UI] 未找到 provider 配置:', provider);
        return;
    }

    // 更新 API Key 标签和占位符
    const apiKeyLabel = document.getElementById('apiKeyLabel');
    const apiKeyInput = document.getElementById('apiKeyInput');

    if (apiKeyLabel) {
        apiKeyLabel.textContent = providerConfig.name + ' API Key：';
    }
    if (apiKeyInput) {
        apiKeyInput.placeholder = providerConfig.apiKeyPlaceholder;
        apiKeyInput.value = apiKey || '';
    }

    // 显示/隐藏 Google 专用控件
    toggleGoogleImageControls(provider === 'google');

    console.log(`[UI] Provider UI 已更新为: ${provider}`);
}

/**
 * 更新模型选择器选项
 * @param {string} provider - 服务商名称
 * @param {Object} appConfig - 应用配置对象
 * @param {Object} providerModelPreferences - 模型偏好记录
 */
export function updateModelSelectors(provider, appConfig, providerModelPreferences) {
    if (!appConfig) {
        console.warn('[UI] updateModelSelectors: appConfig 未定义');
        return;
    }

    const providerConfig = appConfig.providers[provider];
    if (!providerConfig) {
        console.warn('[UI] updateModelSelectors: 未找到 provider 配置:', provider);
        return;
    }

    const models = providerConfig.models;

    // 更新编辑模式模型选择器
    const modelSelector = document.getElementById('modelSelector');
    if (modelSelector) {
        modelSelector.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.value;
            option.textContent = model.text;
            modelSelector.appendChild(option);
        });

        // 优先使用用户在该服务商的历史选择，否则使用默认值
        const savedModel = providerModelPreferences[provider];
        const isValidSaved = savedModel && models.some(m => m.value === savedModel);

        modelSelector.value = isValidSaved ? savedModel : providerConfig.defaultModel;
    }

    // 更新生成模式模型选择器
    const generateModelSelector = document.getElementById('generateModelSelector');
    if (generateModelSelector) {
        generateModelSelector.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.value;
            option.textContent = model.text;
            generateModelSelector.appendChild(option);
        });

        // 使用带后缀的 key 区分编辑和生成模式
        const savedGenModel = providerModelPreferences[provider + '_generate'];
        const isValidSavedGen = savedGenModel && models.some(m => m.value === savedGenModel);

        generateModelSelector.value = isValidSavedGen ? savedGenModel : providerConfig.defaultModel;
    }

    console.log(`[UI] 模型选择器已更新`);
}

/**
 * 显示或隐藏 Google 图像参数控件
 * @param {boolean} show - 是否显示
 */
export function toggleGoogleImageControls(show) {
    const displayStyle = show ? 'block' : 'none';

    const controlGroups = [
        'editAspectRatioGroup',
        'editResolutionGroup',
        'generateAspectRatioGroup',
        'generateResolutionGroup'
    ];

    controlGroups.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = displayStyle;
    });

    console.log(`[UI] Google 图像控件${show ? '显示' : '隐藏'}`);
}

/**
 * 根据选择的模型更新分辨率选择器的可用状态
 * @param {string} mode - 模式 ('edit' 或 'generate')
 * @param {string} selectedModel - 选中的模型
 * @param {string} provider - 当前服务商
 * @param {Object} appConfig - 应用配置对象
 */
export function updateResolutionAvailability(mode, selectedModel, provider, appConfig) {
    if (provider !== 'google') return;
    if (!appConfig) return;

    const googleConfig = appConfig.providers.google;
    if (!googleConfig || !googleConfig.imageOptions) return;

    const modelSupport = googleConfig.imageOptions.model_support || {};
    const modelConfig = modelSupport[selectedModel] || {};
    const supportsResolution = modelConfig.resolution || false;

    const resolutionSelector = document.getElementById(
        mode === 'edit' ? 'editResolutionSelector' : 'generateResolutionSelector'
    );

    const resolutionHint = document.getElementById(
        mode === 'edit' ? 'editResolutionHint' : 'generateResolutionHint'
    );

    if (resolutionSelector) {
        resolutionSelector.disabled = !supportsResolution;
        if (!supportsResolution) resolutionSelector.value = '';
    }

    if (resolutionHint) {
        resolutionHint.style.display = supportsResolution ? 'none' : 'inline';
    }

    console.log(`[UI] ${mode} 分辨率控件: ${supportsResolution ? '启用' : '禁用'}`);
}

// === API Key 状态显示 ===

/**
 * 更新 API Key 状态显示
 * @param {string} message - 状态消息
 * @param {string} type - 状态类型 ('success', 'error', 等)
 */
export function updateApiKeyStatus(message, type) {
    const statusElement = document.getElementById('apiKeyStatus');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status-text ${type}`;
    }
}

// === AUTO 模式 UI 控制 ===

/**
 * 切换 AUTO 模式的 UI 显示
 * @param {boolean} isEnabled - 是否启用 AUTO 模式
 * @param {string} mode - 模式 ('edit' 或 'generate')
 */
export function toggleAutoModeUI(isEnabled, mode) {
    const autoBtn = document.getElementById('autoModeToggle');
    const editCountGroup = document.getElementById('editCountGroup');
    const generateCountGroup = document.getElementById('generateCountGroup');
    const autoPanelEdit = document.getElementById('autoPanelEdit');
    const autoPanelGenerate = document.getElementById('autoPanelGenerate');
    const editCountInput = document.getElementById('editCountInput');
    const imageCountInput = document.getElementById('imageCountInput');

    if (isEnabled) {
        // 1. 高亮 AUTO 按钮
        if (autoBtn) autoBtn.classList.add('auto-mode-active');

        // 2. 根据模式显示/隐藏对应的控件
        if (mode === 'edit') {
            if (editCountGroup) editCountGroup.style.display = 'none';
            if (autoPanelEdit) autoPanelEdit.style.display = 'block';
            if (editCountInput) editCountInput.disabled = true;
        } else if (mode === 'generate') {
            if (generateCountGroup) generateCountGroup.style.display = 'none';
            if (autoPanelGenerate) autoPanelGenerate.style.display = 'block';
            if (imageCountInput) imageCountInput.disabled = true;
        }

        console.log(`[UI] AUTO 模式已启用 (${mode})`);
    } else {
        // 恢复原状
        if (autoBtn) autoBtn.classList.remove('auto-mode-active');
        if (editCountGroup) editCountGroup.style.display = 'block';
        if (generateCountGroup) generateCountGroup.style.display = 'block';
        if (autoPanelEdit) autoPanelEdit.style.display = 'none';
        if (autoPanelGenerate) autoPanelGenerate.style.display = 'none';
        if (editCountInput) editCountInput.disabled = false;
        if (imageCountInput) imageCountInput.disabled = false;

        console.log('[UI] AUTO 模式已禁用');
    }
}

/**
 * 更新 AUTO 模式统计数据显示
 * @param {Object} stats - 统计对象 { total, success, fail }
 */
export function updateAutoStatsUI(stats) {
    // 获取当前激活的面板（根据可见性判断）
    const autoPanelEdit = document.getElementById('autoPanelEdit');
    const autoPanelGenerate = document.getElementById('autoPanelGenerate');

    let activePanel = null;
    if (autoPanelEdit && autoPanelEdit.style.display !== 'none') {
        activePanel = autoPanelEdit;
    } else if (autoPanelGenerate && autoPanelGenerate.style.display !== 'none') {
        activePanel = autoPanelGenerate;
    }

    if (!activePanel) {
        console.warn('[UI] updateAutoStatsUI: 没有激活的统计面板');
        return;
    }

    // 更新统计数据
    const totalSpan = activePanel.querySelector('.stat-total');
    const successSpan = activePanel.querySelector('.stat-success');
    const failSpan = activePanel.querySelector('.stat-fail');

    if (totalSpan) totalSpan.textContent = stats.total;
    if (successSpan) successSpan.textContent = stats.success;
    if (failSpan) failSpan.textContent = stats.fail;

    console.log(`[UI] 统计数据已更新: total=${stats.total}, success=${stats.success}, fail=${stats.fail}`);
}

// === 结果渲染函数 ===

/**
 * 渲染编辑结果
 * @param {Array} images - 图片数组
 * @param {boolean} isAutoMode - 是否为 AUTO 模式
 * @returns {Array<string>} 返回下载 URLs 数组
 */
export function renderEditResults(images, isAutoMode = false) {
    const editedImagesDiv = document.getElementById('editedImages');
    if (!editedImagesDiv) {
        console.error('[UI] renderEditResults: editedImages 容器未找到');
        return [];
    }

    if (isAutoMode) {
        // AUTO 模式：追加渲染 + FIFO 队列
        let gallery = editedImagesDiv.querySelector('.image-gallery');
        if (!gallery) {
            gallery = document.createElement('div');
            gallery.className = 'image-gallery';
            editedImagesDiv.innerHTML = '';
            editedImagesDiv.appendChild(gallery);
        }

        // 渲染新图片
        images.forEach((img, index) => {
            const imageData = `data:image/png;base64,${img.image_data}`;
            const itemDiv = document.createElement('div');
            itemDiv.className = 'generated-item';
            itemDiv.innerHTML = `
                <img src="${imageData}" alt="编辑结果" class="js-clickable-image">
                <button class="js-download-single" data-url="${img.download_url}" data-filename="${img.filename}">下载</button>
            `;
            gallery.appendChild(itemDiv);
        });

        // FIFO 队列控制：保留最新 20 张
        const items = gallery.querySelectorAll('.generated-item');
        const MAX_IMAGES = 20;
        if (items.length > MAX_IMAGES) {
            const removeCount = items.length - MAX_IMAGES;
            for (let i = 0; i < removeCount; i++) {
                items[i].remove();
            }
            console.log(`[UI] FIFO 队列：移除了 ${removeCount} 张旧图片`);
        }

        // 滚动到底部
        editedImagesDiv.scrollTop = editedImagesDiv.scrollHeight;

        console.log(`[UI] AUTO 模式追加了 ${images.length} 张图片，当前队列长度: ${gallery.querySelectorAll('.generated-item').length}`);
    } else {
        // 普通模式：完全替换
        let imagesHtml = '<div class="image-gallery">';
        images.forEach((img, index) => {
            const imageData = `data:image/png;base64,${img.image_data}`;
            imagesHtml += `
                <div class="generated-item">
                    <img src="${imageData}" alt="编辑结果 ${index + 1}" class="js-clickable-image">
                    <button class="js-download-single" data-url="${img.download_url}" data-filename="${img.filename}">下载</button>
                </div>
            `;
        });
        imagesHtml += '</div>';
        editedImagesDiv.innerHTML = imagesHtml;

        console.log(`[UI] 渲染了 ${images.length} 张编辑结果图片`);
    }

    // 显示/隐藏批量下载按钮（AUTO 模式不显示）
    const downloadEditBtn = document.getElementById('downloadEditBtn');
    if (downloadEditBtn) {
        downloadEditBtn.style.display = (images.length > 1 && !isAutoMode) ? 'block' : 'none';
    }

    // 返回下载URLs供状态管理
    return images.map(img => img.download_url);
}

/**
 * 渲染生成结果
 * @param {Array} images - 图片数组
 * @param {boolean} isAutoMode - 是否为 AUTO 模式
 * @returns {Array<string>} 返回下载 URLs 数组
 */
export function renderGenerateResults(images, isAutoMode = false) {
    const generatedImages = document.getElementById('generatedImages');
    if (!generatedImages) {
        console.error('[UI] renderGenerateResults: generatedImages 容器未找到');
        return [];
    }

    if (isAutoMode) {
        // AUTO 模式：追加渲染 + FIFO 队列
        let gallery = generatedImages.querySelector('.image-gallery');
        if (!gallery) {
            gallery = document.createElement('div');
            gallery.className = 'image-gallery';
            generatedImages.innerHTML = '';
            generatedImages.appendChild(gallery);
        }

        // 渲染新图片
        images.forEach((img, index) => {
            const imageData = `data:image/png;base64,${img.image_data}`;
            const itemDiv = document.createElement('div');
            itemDiv.className = 'generated-item';
            itemDiv.innerHTML = `
                <img src="${imageData}" alt="生成结果" class="js-clickable-image">
                <button class="js-download-single" data-url="${img.download_url}" data-filename="${img.filename}">下载</button>
            `;
            gallery.appendChild(itemDiv);
        });

        // FIFO 队列控制：保留最新 20 张
        const items = gallery.querySelectorAll('.generated-item');
        const MAX_IMAGES = 20;
        if (items.length > MAX_IMAGES) {
            const removeCount = items.length - MAX_IMAGES;
            for (let i = 0; i < removeCount; i++) {
                items[i].remove();
            }
            console.log(`[UI] FIFO 队列：移除了 ${removeCount} 张旧图片`);
        }

        // 滚动到底部
        generatedImages.scrollTop = generatedImages.scrollHeight;

        console.log(`[UI] AUTO 模式追加了 ${images.length} 张图片，当前队列长度: ${gallery.querySelectorAll('.generated-item').length}`);
    } else {
        // 普通模式：完全替换
        let imagesHtml = '<div class="image-gallery">';
        images.forEach((img, index) => {
            const imageData = `data:image/png;base64,${img.image_data}`;
            imagesHtml += `
                <div class="generated-item">
                    <img src="${imageData}" alt="生成结果 ${index + 1}" class="js-clickable-image">
                    <button class="js-download-single" data-url="${img.download_url}" data-filename="${img.filename}">下载</button>
                </div>
            `;
        });
        imagesHtml += '</div>';
        generatedImages.innerHTML = imagesHtml;

        console.log(`[UI] 渲染了 ${images.length} 张生成结果图片`);
    }

    // 显示/隐藏批量下载按钮（AUTO 模式不显示）
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    if (downloadAllBtn) {
        downloadAllBtn.style.display = (images.length > 1 && !isAutoMode) ? 'inline-block' : 'none';
    }

    // 返回下载URLs供状态管理
    return images.map(img => img.download_url);
}

// === 结果清空函数 ===

/**
 * 清空编辑结果区域
 * 在开始新的手动编辑任务时调用
 */
export function clearEditResults() {
    const editedImagesDiv = document.getElementById('editedImages');
    const downloadBtn = document.getElementById('downloadEditBtn');

    if (editedImagesDiv) {
        editedImagesDiv.innerHTML = '<p>处理中...</p>';
    }
    if (downloadBtn) {
        downloadBtn.style.display = 'none';
    }
}

/**
 * 清空生成结果区域
 * 在开始新的手动生成任务时调用
 */
export function clearGenerateResults() {
    const generatedImages = document.getElementById('generatedImages');
    const downloadBtn = document.getElementById('downloadAllBtn');

    if (generatedImages) {
        generatedImages.innerHTML = '<p>生成中...</p>';
    }
    if (downloadBtn) {
        downloadBtn.style.display = 'none';
    }
}

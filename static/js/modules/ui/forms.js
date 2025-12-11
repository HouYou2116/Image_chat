// ==========================================
// 表单 UI 模块 (Forms UI Module)
// ==========================================
// 职责: 表单相关的 UI 操作（Provider 切换、模型选择、参数获取等）

import * as DOM from './dom_map.js';
import * as State from '../state.js';
import { updateApiKeyStatus } from './base.js';

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
    const apiKeyLabel = document.getElementById(DOM.API_KEY.LABEL);
    const apiKeyInput = document.getElementById(DOM.API_KEY.INPUT);

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
    const modelSelector = document.getElementById(DOM.EDIT.MODEL_SELECT);
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
    const generateModelSelector = document.getElementById(DOM.GENERATE.MODEL_SELECT);
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
        DOM.EDIT.ASPECT_RATIO_GROUP,
        DOM.EDIT.RESOLUTION_GROUP,
        DOM.GENERATE.ASPECT_RATIO_GROUP,
        DOM.GENERATE.RESOLUTION_GROUP
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
        mode === 'edit' ? DOM.EDIT.RESOLUTION_SELECT : DOM.GENERATE.RESOLUTION_SELECT
    );

    const resolutionHint = document.getElementById(
        mode === 'edit' ? DOM.EDIT.RESOLUTION_HINT : DOM.GENERATE.RESOLUTION_HINT
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

// ==========================================
// 任务参数获取 (Task Parameters)
// ==========================================

/**
 * 获取任务参数（编辑或生成模式）
 * @param {string} mode - 'edit' 或 'generate'
 * @returns {Object} 参数对象
 * @throws {Error} 验证失败时抛出错误
 */
export function getTaskParams(mode) {
    if (mode === 'edit') {
        // 编辑模式参数
        const selectedFile = State.getSelectedFile();
        const instruction = document.getElementById(DOM.EDIT.INSTRUCTION_INPUT).value.trim();
        const imageCount = document.getElementById(DOM.EDIT.COUNT_INPUT).value;
        const apiKey = State.getApiKey();
        const provider = State.getCurrentProvider();
        const model = document.getElementById(DOM.EDIT.MODEL_SELECT).value;
        const temperature = document.getElementById(DOM.EDIT.TEMPERATURE_SLIDER).value;

        // 基本验证
        if (!selectedFile) {
            throw new Error('请先选择图片');
        }
        if (!instruction) {
            throw new Error('请输入编辑指令');
        }
        if (!apiKey) {
            throw new Error('请先设置API Key');
        }

        // 基础参数对象
        const params = {
            selectedFile,
            instruction,
            imageCount,
            apiKey,
            provider,
            model,
            temperature
        };

        // Google 专用参数
        if (provider === 'google') {
            const aspectRatio = document.getElementById(DOM.EDIT.ASPECT_RATIO_SELECT).value;
            const resolutionSelector = document.getElementById(DOM.EDIT.RESOLUTION_SELECT);
            const resolution = resolutionSelector.value;
            const isDisabled = resolutionSelector.disabled;

            params.aspectRatio = aspectRatio || null;
            params.resolution = (resolution && !isDisabled) ? resolution : null;
        }

        return params;

    } else if (mode === 'generate') {
        // 生成模式参数
        const description = document.getElementById(DOM.GENERATE.DESCRIPTION_INPUT).value.trim();
        const imageCount = document.getElementById(DOM.GENERATE.COUNT_INPUT).value;
        const apiKey = State.getApiKey();
        const provider = State.getCurrentProvider();
        const model = document.getElementById(DOM.GENERATE.MODEL_SELECT).value;
        const temperature = document.getElementById(DOM.GENERATE.TEMPERATURE_SLIDER).value;

        // 基本验证
        if (!description) {
            throw new Error('请输入图像描述');
        }
        if (!apiKey) {
            throw new Error('请先设置API Key');
        }

        // 基础参数对象
        const params = {
            description,
            imageCount,
            apiKey,
            provider,
            model,
            temperature
        };

        // Google 专用参数
        if (provider === 'google') {
            const aspectRatio = document.getElementById(DOM.GENERATE.ASPECT_RATIO_SELECT).value;
            const resolutionSelector = document.getElementById(DOM.GENERATE.RESOLUTION_SELECT);
            const resolution = resolutionSelector.value;
            const isDisabled = resolutionSelector.disabled;

            params.aspectRatio = aspectRatio || null;
            params.resolution = (resolution && !isDisabled) ? resolution : null;
        }

        return params;

    } else {
        throw new Error(`未知的模式: ${mode}`);
    }
}

// ==========================================
// API Key 业务逻辑 (API Key Business Logic)
// ==========================================

/**
 * 处理 API Key 保存逻辑
 * @param {Object} appConfig - 应用配置对象
 */
export function handleApiKeySaveLogic(appConfig) {
    if (!appConfig) {
        updateApiKeyStatus('配置未加载', 'error');
        return;
    }

    const apiKeyInput = DOM.getElementById(DOM.API_KEY.INPUT);
    const key = apiKeyInput.value.trim();

    if (!key) {
        updateApiKeyStatus('请输入 API Key', 'error');
        return;
    }

    const currentProvider = State.getCurrentProvider();
    const providerConfig = appConfig.providers[currentProvider];
    const expectedPrefix = providerConfig ? providerConfig.apiKeyPrefix : '';

    if (expectedPrefix && !key.startsWith(expectedPrefix)) {
        updateApiKeyStatus(`API Key 格式不正确（应以 ${expectedPrefix} 开头）`, 'error');
        return;
    }

    // 调用 State 模块进行持久化
    State.persistApiKey(currentProvider, key);
    updateApiKeyStatus('API Key已保存', 'success');
}

/**
 * 处理 API Key 删除逻辑
 */
export function handleApiKeyDeleteLogic() {
    const currentProvider = State.getCurrentProvider();

    // 调用 State 模块清除数据
    State.removePersistedApiKey(currentProvider);

    // 更新 UI
    const inputEl = DOM.getElementById(DOM.API_KEY.INPUT);
    if(inputEl) inputEl.value = '';

    updateApiKeyStatus('API Key已清除', 'success');
}

// ==========================================
// 温度滑块初始化 (Temperature Sliders)
// ==========================================

/**
 * 初始化温度滑块的监听器
 * 实时更新数值显示
 */
export function initTemperatureSliders() {
    // 编辑模式
    const editSlider = DOM.getElementById(DOM.EDIT.TEMPERATURE_SLIDER);
    const editValue = DOM.getElementById(DOM.EDIT.TEMPERATURE_VALUE);

    if (editSlider && editValue) {
        editSlider.addEventListener('input', (e) => {
            editValue.textContent = e.target.value;
        });
    }

    // 生成模式
    const genSlider = DOM.getElementById(DOM.GENERATE.TEMPERATURE_SLIDER);
    const genValue = DOM.getElementById(DOM.GENERATE.TEMPERATURE_VALUE);

    if (genSlider && genValue) {
        genSlider.addEventListener('input', (e) => {
            genValue.textContent = e.target.value;
        });
    }

    console.log('[UI] 温度滑块初始化完成');
}

// ==========================================
// 依赖导入 (Imports)
// ==========================================
import * as DOM from './ui/dom_map.js';

// ==========================================
// 配置管理模块 (Configuration Module)
// ==========================================
// 职责: 从后端加载配置，初始化 Google 图像选项

/**
 * 从后端加载应用配置
 * @returns {Promise<{success: boolean, config?: Object, error?: string}>}
 */
export async function loadConfiguration() {
    try {
        const response = await fetch('/api/config');
        const result = await response.json();

        if (result.success) {
            console.log('[Config] 配置加载成功:', result.config);
            return {
                success: true,
                config: result.config
            };
        } else {
            throw new Error(result.error || '配置加载失败');
        }
    } catch (error) {
        console.error('[Config] 配置加载错误:', error);

        // 降级方案：返回硬编码默认配置
        const fallbackConfig = {
            defaultProvider: 'google',
            defaultTemperature: {
                edit: 0.7,
                generate: 0.8
            },
            providers: {
                google: {
                    name: 'Google Gemini',
                    apiKeyPlaceholder: '输入您的 Google Gemini API Key',
                    apiKeyPrefix: 'AIza',
                    defaultModel: 'gemini-2.5-flash-image-preview',
                    models: [
                        {value: 'gemini-2.5-flash-image-preview', text: 'Gemini 2.5 Flash'}
                    ]
                },
                openrouter: {
                    name: 'OpenRouter',
                    apiKeyPlaceholder: '输入您的 OpenRouter API Key',
                    apiKeyPrefix: 'sk-or-',
                    defaultModel: 'google/gemini-2.5-flash-image-preview:free',
                    models: [
                        {value: 'google/gemini-2.5-flash-image-preview:free', text: 'OpenRouter - Gemini Flash'}
                    ]
                },
                tuzi: {
                    name: '兔子API',
                    apiKeyPlaceholder: '输入您的兔子 API Key',
                    apiKeyPrefix: 'sk-',
                    defaultModel: 'gemini-2.5-flash-image',
                    models: [
                        {value: 'gemini-2.5-flash-image', text: '兔子 - Gemini 2.5 Flash'}
                    ]
                }
            }
        };

        console.warn('[Config] 使用降级默认配置');

        return {
            success: true,  // 视为成功，允许应用继续运行
            config: fallbackConfig,
            usingFallback: true
        };
    }
}

/**
 * 初始化 Google 图像参数选项
 * @param {Object} appConfig - 应用配置对象
 */
export function initGoogleImageOptions(appConfig) {
    if (!appConfig) {
        console.warn('[Config] initGoogleImageOptions: appConfig 未定义');
        return;
    }

    const googleConfig = appConfig.providers.google;
    if (!googleConfig || !googleConfig.imageOptions) {
        console.log('[Config] Google 图像参数选项未配置，跳过初始化');
        return;
    }

    const options = googleConfig.imageOptions;

    // 填充宽高比选项（编辑模式）
    populateSelectOptions(
        document.getElementById(DOM.EDIT.ASPECT_RATIO_SELECT),
        options.aspect_ratios,
        true  // includeDefault
    );

    // 填充宽高比选项（生成模式）
    populateSelectOptions(
        document.getElementById(DOM.GENERATE.ASPECT_RATIO_SELECT),
        options.aspect_ratios,
        true
    );

    // 填充分辨率选项（编辑模式）
    populateSelectOptions(
        document.getElementById(DOM.EDIT.RESOLUTION_SELECT),
        options.resolutions,
        true
    );

    // 填充分辨率选项（生成模式）
    populateSelectOptions(
        document.getElementById(DOM.GENERATE.RESOLUTION_SELECT),
        options.resolutions,
        true
    );

    console.log('[Config] Google 图像参数选项已初始化');
}

/**
 * 通用选择器选项填充函数
 * @param {HTMLSelectElement} selectElement - 下拉框元素
 * @param {Array} options - 选项数组
 * @param {boolean} includeDefault - 是否包含"默认"选项
 */
export function populateSelectOptions(selectElement, options, includeDefault = false) {
    if (!selectElement) {
        console.warn('[Config] populateSelectOptions: selectElement 未找到');
        return;
    }

    selectElement.innerHTML = '';

    if (includeDefault) {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '默认';
        selectElement.appendChild(defaultOption);
    }

    if (!options || !Array.isArray(options)) {
        console.warn('[Config] populateSelectOptions: options 无效');
        return;
    }

    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        selectElement.appendChild(optionElement);
    });
}

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

// ==========================================
// 并发策略配置 (Concurrency Strategy)
// ==========================================

/**
 * 并发规则配置
 * - Google Provider: 根据具体 model 匹配（如 'google/gemini-2.5-flash-image'）
 * - 其他 Provider: 根据 provider 名称匹配（如 'tuzi', 'openrouter'）
 * - 未匹配: 使用 'default' 规则
 */
export const CONCURRENCY_RULES = {
    // Google Provider - 按模型区分
    'google/gemini-2.5-flash-image': {
        recommended: 4,    // 推荐并发数（默认值）
        max: 5,            // 最大并发数（滑块上限）
        delay: 1000,       // 基础延迟（毫秒）- 500 RPM = 120ms 理论值，保守设置 1000ms
        hint: '推荐: 4 张 (Flash 高速模型)'
    },
    'google/gemini-3-pro-image-preview': {
        recommended: 1,
        max: 1,            // 严格限制为 1（20 RPM = 每 3 秒）
        delay: 3500,       // 3.5 秒延迟（20 RPM）
        hint: '限制: 1 张 (Pro 模型速率严格)'
    },

    // TuZi Provider - 无速率限制
    'tuzi': {
        recommended: 5,
        max: 5,
        delay: 500,        // 无限制，保守延迟
        hint: '推荐: 5 张 (无速率限制)'
    },

    // OpenRouter Provider - 无固定限制，建议保守
    'openrouter': {
        recommended: 3,
        max: 4,
        delay: 1000,       // 默认 1 秒，429 时需指数退避
        hint: '推荐: 3 张 (动态限制)'
    },

    // 默认规则（未匹配到具体模型时使用）
    'default': {
        recommended: 2,
        max: 3,
        delay: 1500,
        hint: '推荐: 2 张 (默认设置)'
    }
};

/**
 * 获取并发规则
 * @param {string} provider - Provider 名称 (google, tuzi, openrouter)
 * @param {string} model - 模型标识符 (完整的 model value，如 'google/gemini-2.5-flash-image')
 * @returns {Object} 并发规则对象 {recommended, max, delay, hint}
 */
export function getConcurrencyRule(provider, model) {
    let rule;

    if (provider === 'google') {
        // Google Provider - 根据具体模型匹配
        rule = CONCURRENCY_RULES[model] || CONCURRENCY_RULES['default'];
    } else {
        // 其他 Provider - 根据 provider 名称匹配
        rule = CONCURRENCY_RULES[provider] || CONCURRENCY_RULES['default'];
    }

    return rule;
}

// ==========================================
// DOM 选择器常量映射表 (DOM Map)
// ==========================================
// 职责: 集中管理所有 DOM ID 和类选择器，防止硬编码

/**
 * DOM ID 常量映射表
 * 命名规范: 按功能分组，使用大写 SNAKE_CASE
 * 结构: 嵌套对象，按功能模块分组
 */

// ===== API Key 管理 =====
export const API_KEY = {
    PROVIDER_SELECT: 'providerSelector',
    INPUT: 'apiKeyInput',
    LABEL: 'apiKeyLabel',
    STATUS: 'apiKeyStatus'
};

// ===== 编辑模式 (Edit Mode) =====
export const EDIT = {
    // 容器和输入
    CONTAINER: 'editMode',
    IMAGE_INPUT: 'imageInput',
    INSTRUCTION_INPUT: 'instructionInput',
    PREVIEWS: 'editPreviews',
    ORIGINAL_PREVIEW: 'originalPreview',

    // 模型和参数
    MODEL_SELECT: 'modelSelector',
    TEMPERATURE_SLIDER: 'temperatureSlider',
    TEMPERATURE_VALUE: 'temperatureValue',

    // Google 专用参数
    ASPECT_RATIO_GROUP: 'editAspectRatioGroup',
    ASPECT_RATIO_SELECT: 'editAspectRatioSelector',
    RESOLUTION_GROUP: 'editResolutionGroup',
    RESOLUTION_SELECT: 'editResolutionSelector',
    RESOLUTION_HINT: 'editResolutionHint',

    // 数量控制和按钮
    COUNT_GROUP: 'editCountGroup',
    COUNT_INPUT: 'editCountInput',
    SUBMIT_BUTTON: 'editBtn',

    // 结果显示
    RESULTS_CONTAINER: 'editResults',
    RESULTS_IMAGES: 'editedImages',
    DOWNLOAD_BUTTON: 'downloadEditBtn'
};

// ===== 生成模式 (Generate Mode) =====
export const GENERATE = {
    // 容器和输入
    CONTAINER: 'generateMode',
    DESCRIPTION_INPUT: 'descriptionInput',

    // 模型和参数
    MODEL_SELECT: 'generateModelSelector',
    TEMPERATURE_SLIDER: 'generateTemperatureSlider',
    TEMPERATURE_VALUE: 'generateTemperatureValue',

    // Google 专用参数
    ASPECT_RATIO_GROUP: 'generateAspectRatioGroup',
    ASPECT_RATIO_SELECT: 'generateAspectRatioSelector',
    RESOLUTION_GROUP: 'generateResolutionGroup',
    RESOLUTION_SELECT: 'generateResolutionSelector',
    RESOLUTION_HINT: 'generateResolutionHint',

    // 数量控制和按钮
    COUNT_GROUP: 'generateCountGroup',
    COUNT_INPUT: 'imageCountInput',
    SUBMIT_BUTTON: 'generateBtn',

    // 结果显示
    RESULTS_CONTAINER: 'generateResults',
    RESULTS_IMAGES: 'generatedImages',
    DOWNLOAD_BUTTON: 'downloadAllBtn'
};

// ===== AUTO 模式 =====
export const AUTO = {
    // 切换和面板
    TOGGLE_BUTTON: 'autoModeToggle',
    PANEL_EDIT: 'autoPanelEdit',
    PANEL_GENERATE: 'autoPanelGenerate',

    // 编辑模式并发控制
    CONCURRENCY_SLIDER_EDIT: 'autoConcurrencySliderEdit',
    CONCURRENCY_VALUE_EDIT: 'autoConcurrencyValueEdit',
    LIMIT_HINT_EDIT: 'autoLimitHintEdit',

    // 生成模式并发控制
    CONCURRENCY_SLIDER_GENERATE: 'autoConcurrencySliderGenerate',
    CONCURRENCY_VALUE_GENERATE: 'autoConcurrencyValueGenerate',
    LIMIT_HINT_GENERATE: 'autoLimitHintGenerate',

    // 停止按钮
    STOP_BUTTON: 'stopAutoBtn'
};

// ===== 通用 UI =====
export const COMMON = {
    LOADING: 'loading',
    ERROR_MESSAGE: 'errorMessage',
    IMAGE_MODAL: 'imageModal',
    MODAL_IMAGE: 'modalImage'
};

// ===== 类选择器常量 =====
export const SELECTORS = {
    // API Key 操作
    SAVE_API_KEY: '.js-save-api-key',
    DELETE_API_KEY: '.js-delete-api-key',

    // 模式切换
    MODE_EDIT: '.js-mode-edit',
    MODE_GENERATE: '.js-mode-generate',

    // 操作按钮
    EDIT_BTN: '.js-edit-btn',
    GENERATE_BTN: '.js-generate-btn',
    DOWNLOAD_EDIT_BTN: '.js-download-edit-btn',
    DOWNLOAD_ALL_BTN: '.js-download-all-btn',

    // 模态框
    MODAL_CLOSE: '.js-modal-close',

    // 动态内容（事件委托使用）
    DOWNLOAD_SINGLE: '.js-download-single',
    CLICKABLE_IMAGE: '.js-clickable-image',
    STOP_AUTO_BTN: '.stop-auto-btn'
};

// ===== 工具函数：安全获取 DOM 元素 =====

/**
 * 根据 ID 常量安全获取 DOM 元素
 * @param {string} elementId - DOM ID
 * @returns {HTMLElement|null} DOM 元素或 null
 */
export function getElementById(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`[DOM Map] 未找到元素: #${elementId}`);
    }
    return element;
}

/**
 * 根据类选择器常量安全获取 DOM 元素
 * @param {string} selector - 类选择器
 * @returns {HTMLElement|null} DOM 元素或 null
 */
export function querySelector(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        console.warn(`[DOM Map] 未找到元素: ${selector}`);
    }
    return element;
}

/**
 * 根据类选择器常量安全获取 DOM 元素列表
 * @param {string} selector - 类选择器
 * @returns {NodeList} DOM 元素列表
 */
export function querySelectorAll(selector) {
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) {
        console.warn(`[DOM Map] 未找到元素: ${selector}`);
    }
    return elements;
}

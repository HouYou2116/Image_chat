// ==========================================
// 基础 UI 模块 (Base UI Module)
// ==========================================
// 职责: 通用 UI 操作（加载状态、错误提示、模态框等）

import * as DOM from './dom_map.js';

// === 加载状态管理 ===

/**
 * 显示/隐藏编辑模式加载状态
 * @param {boolean} show - 是否显示加载状态
 */
export function showLoading(show) {
    const loading = document.getElementById(DOM.COMMON.LOADING);
    const editBtn = document.getElementById(DOM.EDIT.SUBMIT_BUTTON);

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
    const loading = document.getElementById(DOM.COMMON.LOADING);
    const generateBtn = document.getElementById(DOM.GENERATE.SUBMIT_BUTTON);

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
    const errorDiv = document.getElementById(DOM.COMMON.ERROR_MESSAGE);
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

/**
 * 隐藏错误信息
 */
export function hideError() {
    const errorDiv = document.getElementById(DOM.COMMON.ERROR_MESSAGE);
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
    const modal = document.getElementById(DOM.COMMON.IMAGE_MODAL);
    const modalImg = document.getElementById(DOM.COMMON.MODAL_IMAGE);

    modal.style.display = 'block';
    modalImg.src = imageSrc;

    // 防止页面滚动
    document.body.style.overflow = 'hidden';
}

/**
 * 关闭图片模态框
 */
export function closeImageModal() {
    const modal = document.getElementById(DOM.COMMON.IMAGE_MODAL);
    modal.style.display = 'none';

    // 恢复页面滚动
    document.body.style.overflow = 'auto';
}

// === API Key 状态显示 ===

/**
 * 更新 API Key 状态显示
 * @param {string} message - 状态消息
 * @param {string} type - 状态类型 ('success', 'error', 等)
 */
export function updateApiKeyStatus(message, type) {
    const statusElement = document.getElementById(DOM.API_KEY.STATUS);
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status-text ${type}`;
    }
}

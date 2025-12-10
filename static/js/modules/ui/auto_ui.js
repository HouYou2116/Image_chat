// ==========================================
// AUTO 模式 UI 模块 (AUTO Mode UI Module)
// ==========================================
// 职责: AUTO 模式相关的 UI 控制、统计显示、并发设置、模式切换

import * as DOM from './dom_map.js';

// === AUTO 模式 UI 控制 ===

/**
 * 切换 AUTO 模式的 UI 显示
 * @param {boolean} isEnabled - 是否启用 AUTO 模式
 * @param {string} mode - 模式 ('edit' 或 'generate')
 */
export function toggleAutoModeUI(isEnabled, mode) {
    const autoBtn = document.getElementById(DOM.AUTO.TOGGLE_BUTTON);
    const editCountGroup = document.getElementById(DOM.EDIT.COUNT_GROUP);
    const generateCountGroup = document.getElementById(DOM.GENERATE.COUNT_GROUP);
    const autoPanelEdit = document.getElementById(DOM.AUTO.PANEL_EDIT);
    const autoPanelGenerate = document.getElementById(DOM.AUTO.PANEL_GENERATE);
    const editCountInput = document.getElementById(DOM.EDIT.COUNT_INPUT);
    const imageCountInput = document.getElementById(DOM.GENERATE.COUNT_INPUT);

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
    const autoPanelEdit = document.getElementById(DOM.AUTO.PANEL_EDIT);
    const autoPanelGenerate = document.getElementById(DOM.AUTO.PANEL_GENERATE);

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

/**
 * 更新 AUTO 模式并发设置 UI
 * @param {string} mode - 'edit' 或 'generate'
 * @param {Object} rule - 并发规则对象 { max, recommended, hint, delay }
 */
export function updateAutoConcurrencySettings(mode, rule) {
    const sliderId = mode === 'edit' ? DOM.AUTO.CONCURRENCY_SLIDER_EDIT : DOM.AUTO.CONCURRENCY_SLIDER_GENERATE;
    const valueId = mode === 'edit' ? DOM.AUTO.CONCURRENCY_VALUE_EDIT : DOM.AUTO.CONCURRENCY_VALUE_GENERATE;
    const suffix = mode.charAt(0).toUpperCase() + mode.slice(1);  // 'Edit' 或 'Generate'

    const sliderEl = document.getElementById(sliderId);
    const valueEl = document.getElementById(valueId);
    const hintEl = document.getElementById(`autoLimitHint${suffix}`);

    if (!sliderEl || !valueEl || !hintEl) {
        console.warn(`[UI] updateAutoConcurrencySettings: 未找到并发设置 UI 元素 (mode: ${mode})`);
        return;
    }

    // 更新滑块属性
    sliderEl.max = rule.max;
    sliderEl.value = rule.recommended;

    // 更新显示文本
    valueEl.textContent = rule.recommended;
    hintEl.textContent = rule.hint;

    console.log(`[UI] 并发设置已更新 (${mode}): 推荐 ${rule.recommended}, 最大 ${rule.max}`);
}

/**
 * 获取 AUTO 模式并发数量
 * @param {string} mode - 'edit' 或 'generate'
 * @returns {number} 并发数量，默认 1
 */
export function getAutoConcurrencyValue(mode) {
    const sliderId = mode === 'edit' ? DOM.AUTO.CONCURRENCY_SLIDER_EDIT : DOM.AUTO.CONCURRENCY_SLIDER_GENERATE;
    const sliderEl = document.getElementById(sliderId);

    return sliderEl ? parseInt(sliderEl.value) : 1;
}

// ==========================================
// 模式切换函数 (Mode Switching)
// ==========================================

/**
 * 切换到编辑模式
 * 显示编辑面板，隐藏生成面板
 */
export function switchToEditMode() {
    // 更新模式按钮状态
    document.querySelector('.js-mode-edit')?.classList.add('active');
    document.querySelector('.js-mode-generate')?.classList.remove('active');

    // 显示/隐藏面板
    const editMode = document.getElementById(DOM.EDIT.CONTAINER);
    const generateMode = document.getElementById(DOM.GENERATE.CONTAINER);
    if (editMode) editMode.style.display = 'block';
    if (generateMode) generateMode.style.display = 'none';

    // 显示/隐藏结果区域
    const editResults = document.getElementById(DOM.EDIT.RESULTS_CONTAINER);
    const generateResults = document.getElementById(DOM.GENERATE.RESULTS_CONTAINER);
    if (editResults) editResults.style.display = 'grid';
    if (generateResults) generateResults.style.display = 'none';

    console.log('[UI] 已切换到编辑模式');
}

/**
 * 切换到生成模式
 * 显示生成面板，隐藏编辑面板
 */
export function switchToGenerateMode() {
    // 更新模式按钮状态
    document.querySelector('.js-mode-edit')?.classList.remove('active');
    document.querySelector('.js-mode-generate')?.classList.add('active');

    // 显示/隐藏面板
    const editMode = document.getElementById(DOM.EDIT.CONTAINER);
    const generateMode = document.getElementById(DOM.GENERATE.CONTAINER);
    if (editMode) editMode.style.display = 'none';
    if (generateMode) generateMode.style.display = 'block';

    // 显示/隐藏结果区域
    const editResults = document.getElementById(DOM.EDIT.RESULTS_CONTAINER);
    const generateResults = document.getElementById(DOM.GENERATE.RESULTS_CONTAINER);
    if (editResults) editResults.style.display = 'none';
    if (generateResults) generateResults.style.display = 'block';

    console.log('[UI] 已切换到生成模式');
}

// ==========================================
// 工作流模块 (Workflow Module)
// ==========================================
// 职责: 核心业务逻辑编排、任务调度、并发控制

import * as State from './state.js';
import * as API from './api.js';
import * as UI from './ui.js';
import { getConcurrencyRule } from './config.js';
import * as DOM from './ui/dom_map.js';

// 模块内部状态（用于循环控制）
let autoLoopController = {
    isRunning: false
};

// ==========================================
// 核心业务逻辑函数
// ==========================================

/**
 * 执行一次图片处理任务（编辑或生成）
 * @param {string} mode - 'edit' 或 'generate'
 * @param {Object} options - 可选参数配置
 *   - useStream {boolean} - 是否使用流式 API（默认 true）
 *   - forceImageCount {number} - 强制设置并发数（AUTO 模式用）
 * @returns {Promise<Object>}
 *   成功: { success: true, images: Array, totalReceived: number }
 *   失败: { success: false, error: string }
 * @throws {Error} 验证失败时抛出异常
 */
export async function runTaskOnce(mode, options = {}) {
    const useStream = options.useStream !== false;  // 默认启用流式

    if (mode === 'edit') {
        // 获取参数（使用封装函数，包含验证）
        const params = UI.getTaskParams('edit');

        // AUTO 模式强制设置并发数（覆盖 UI 表单值）
        if (options.forceImageCount !== undefined) {
            params.imageCount = options.forceImageCount;
        }

        // 准备 FormData
        const formData = new FormData();
        if (params.selectedFile instanceof FileList) {
            for (let i = 0; i < params.selectedFile.length; i++) {
                formData.append('image', params.selectedFile[i]);
            }
        } else {
            formData.append('image', params.selectedFile);
        }

        formData.append('instruction', params.instruction);
        formData.append('image_count', params.imageCount);
        formData.append('api_key', params.apiKey);
        formData.append('provider', params.provider);
        formData.append('model', params.model);
        formData.append('temperature', params.temperature);

        // Google 专用参数
        if (params.aspectRatio) {
            formData.append('aspect_ratio', params.aspectRatio);
        }
        if (params.resolution) {
            formData.append('resolution', params.resolution);
        }

        // 调用 API
        if (useStream) {
            // 流式模式
            const receivedImages = [];
            const result = await API.editImageStream(formData, (image) => {
                // 每收到一张图片，立即追加渲染
                receivedImages.push(image);
                UI.renderEditResults([image], true);  // isAutoMode = true（追加模式）
            });
            return {
                success: result.success,
                images: receivedImages,
                totalReceived: result.totalReceived,
                error: result.error
            };
        } else {
            // 非流式模式（向后兼容）
            return await API.editImage(formData);
        }

    } else if (mode === 'generate') {
        // 获取参数（使用封装函数，包含验证）
        const params = UI.getTaskParams('generate');

        // AUTO 模式强制设置并发数（覆盖 UI 表单值）
        if (options.forceImageCount !== undefined) {
            params.imageCount = options.forceImageCount;
        }

        // 准备 FormData
        const formData = new FormData();
        formData.append('description', params.description);
        formData.append('image_count', params.imageCount);
        formData.append('api_key', params.apiKey);
        formData.append('provider', params.provider);
        formData.append('model', params.model);
        formData.append('temperature', params.temperature);

        // Google 专用参数
        if (params.aspectRatio) {
            formData.append('aspect_ratio', params.aspectRatio);
        }
        if (params.resolution) {
            formData.append('resolution', params.resolution);
        }

        // 调用 API
        if (useStream) {
            // 流式模式
            const receivedImages = [];
            const result = await API.generateImageStream(formData, (image) => {
                // 每收到一张图片，立即追加渲染
                receivedImages.push(image);
                UI.renderGenerateResults([image], true);  // isAutoMode = true（追加模式）
            });
            return {
                success: result.success,
                images: receivedImages,
                totalReceived: result.totalReceived,
                error: result.error
            };
        } else {
            // 非流式模式（向后兼容）
            return await API.generateImage(formData);
        }
    }

    throw new Error('无效的模式: ' + mode);
}

/**
 * 启动 AUTO 模式循环执行
 * 持续执行任务，直到用户停止或发生不可恢复的错误
 * @param {string} mode - 'edit' 或 'generate'
 * @throws {Error} 验证失败时抛出异常
 */
export async function startAutoLoop(mode) {
    console.log(`[Workflow] 启动 AUTO 循环 (${mode} 模式)`);

    // 1. 初始化状态
    State.setAutoRunning(true);
    State.resetAutoStats();
    UI.updateAutoStatsUI(State.getAutoStats());
    autoLoopController.isRunning = true;

    // 2. 主循环
    while (State.isAutoRunning() && autoLoopController.isRunning) {
        UI.hideError();

        // ===== 先获取并发数（用于后续统计）=====
        const imageCount = UI.getAutoConcurrencyValue(mode);

        try {
            // ===== 预增加 total 统计（按并发数）=====
            State.incrementAutoTotalBy(imageCount);
            UI.updateAutoStatsUI(State.getAutoStats());

            const currentTotal = State.getAutoStats().total;
            console.log(`[Workflow] 当前请求 ${imageCount} 张图片 (总计: ${currentTotal})...`);

            // ===== 调用单次任务 =====
            const result = await runTaskOnce(mode, {
                forceImageCount: imageCount,  // 使用滑块当前值
                useStream: true               // 启用流式
            });

            if (result.success) {
                // ===== 根据实际生成的图片数量增加 success =====
                const actualCount = result.images.length;
                State.incrementAutoSuccessBy(actualCount);
                UI.updateAutoStatsUI(State.getAutoStats());

                // 保存图片下载链接到会话队列（用于批量下载）
                result.images.forEach(img => {
                    State.addSessionImage(img.download_url);
                });

                console.log(
                    `[Workflow] 成功生成 ${actualCount} 张图片，` +
                    `总计: ${State.getAutoStats().success} 成功 / ${State.getAutoStats().total} 执行`
                );
            } else {
                // ===== API 返回失败时，按请求的数量增加 fail =====
                State.incrementAutoFailBy(imageCount);
                UI.updateAutoStatsUI(State.getAutoStats());
                console.warn(
                    `[Workflow] 请求失败 (请求了 ${imageCount} 张): ${result.error} ` +
                    `(总计: ${State.getAutoStats().fail} 失败 / ${State.getAutoStats().total} 执行)`
                );
            }

        } catch (error) {
            // ===== 捕获异常时，按请求的数量增加 fail =====
            State.incrementAutoFailBy(imageCount);
            UI.updateAutoStatsUI(State.getAutoStats());
            console.error(
                `[Workflow] 请求异常 (请求了 ${imageCount} 张): ${error.message} ` +
                `(总计: ${State.getAutoStats().fail} 失败 / ${State.getAutoStats().total} 执行)`
            );

            // 可选：重大错误时自动停止循环
            if (error.message.includes('API Key') || error.message.includes('配置')) {
                console.error('[Workflow] 检测到不可恢复的错误，停止循环');
                break;
            }
        }

        // ===== 关键 3: 动态延迟计算 =====
        const provider = State.getCurrentProvider();
        const modelValue = mode === 'edit'
            ? DOM.getElementById(DOM.EDIT.MODEL_SELECT)?.value
            : DOM.getElementById(DOM.GENERATE.MODEL_SELECT)?.value;

        if (!modelValue) {
            console.error('[Workflow] 无法读取当前模型，停止循环');
            break;
        }

        // 获取当前模型的并发规则
        const rule = getConcurrencyRule(provider, modelValue);
        const currentImageCount = UI.getAutoConcurrencyValue(mode);

        // 延迟公式：基础延迟 * (当前并发/推荐并发)
        // - 等于推荐值时系数为 1.0（延迟 = 基础延迟）
        // - 超过推荐值时系数 > 1.0（延迟增加以避免限流）
        // - 低于推荐值时系数 < 1.0（可更快请求）
        const delayMs = rule.delay * Math.max(1, currentImageCount / rule.recommended);

        console.log(
            `[Workflow] 规则: ${rule.hint}, 等待 ${delayMs.toFixed(0)}ms 后继续...`
        );

        // 延迟等待
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // 循环结束
    console.log('[Workflow] AUTO 循环已停止');
    autoLoopController.isRunning = false;
}

/**
 * 停止 AUTO 循环，清理状态，更新 UI
 * 由用户点击"停止"按钮或主动切换模式时调用
 * 设计为同步函数，立即生效
 */
export function stopAutoLoop() {
    console.log('[Workflow] 停止 AUTO 循环');

    // 1. 立即切断循环控制（循环会在下次迭代时察觉）
    State.setAutoRunning(false);
    autoLoopController.isRunning = false;

    // 2. 完全重置 AUTO 状态
    State.resetAutoState();  // 重置 enabled、running、mode 和统计数据
    State.clearSessionImages();  // 清空会话图片队列

    // 3. 立即更新 UI：清零统计显示
    UI.updateAutoStatsUI(State.getAutoStats());

    // 4. 还原普通 UI：隐藏统计面板，显示普通控件
    UI.toggleAutoModeUI(false);  // 传入 false 会隐藏 AUTO 面板

    console.log('[Workflow] AUTO 循环已完全停止');
}

/**
 * 刷新 AUTO 模式并发 UI（单模式版）
 * 当服务商或模型变更时，调用此函数更新并发滑块规则
 * @param {string} mode - 'edit' 或 'generate'
 */
export function refreshAutoConcurrencyUI(mode) {
    try {
        // 1. 获取当前服务商和模型
        const provider = State.getCurrentProvider();

        const modelSelectorId = mode === 'edit'
            ? DOM.EDIT.MODEL_SELECT
            : DOM.GENERATE.MODEL_SELECT;
        const modelSelector = DOM.getElementById(modelSelectorId);
        const model = modelSelector?.value;

        if (!model) {
            console.warn(`[Workflow] refreshAutoConcurrencyUI: 未找到 ${mode} 模式的模型`);
            return;
        }

        // 2. 查询该模型的并发规则
        const rule = getConcurrencyRule(provider, model);

        // 3. 更新 UI
        UI.updateAutoConcurrencySettings(mode, rule);

        console.log(`[Workflow] 并发 UI 已刷新 (${mode}): 规则=${rule.hint}`);

    } catch (error) {
        console.error(`[Workflow] 刷新并发 UI 失败:`, error);
        // 失败不中断流程
    }
}

/**
 * 刷新 AUTO 模式并发 UI（批量版）
 * 同时更新编辑和生成两种模式的并发设置
 * 用于：初始化、Provider 切换时
 */
export function refreshAllAutoConcurrencyUI() {
    try {
        const provider = State.getCurrentProvider();
        const editModel = DOM.getElementById(DOM.EDIT.MODEL_SELECT)?.value;
        const genModel = DOM.getElementById(DOM.GENERATE.MODEL_SELECT)?.value;

        if (editModel) {
            const editRule = getConcurrencyRule(provider, editModel);
            UI.updateAutoConcurrencySettings('edit', editRule);
        }

        if (genModel) {
            const genRule = getConcurrencyRule(provider, genModel);
            UI.updateAutoConcurrencySettings('generate', genRule);
        }

        console.log('[Workflow] 并发 UI 批量刷新完成');
    } catch (error) {
        console.error('[Workflow] 批量刷新并发 UI 失败:', error);
        // 失败不中断流程
    }
}

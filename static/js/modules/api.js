// ====================================
// API 通信模块 (API Module)
// ====================================
// 职责: 纯 API 调用，不读取 DOM，不更新 UI

/**
 * 调用图片编辑 API
 * @param {FormData} formData - 包含图片、指令、参数的表单数据
 * @returns {Promise<{success: boolean, images?: Array, error?: string}>}
 */
export async function editImage(formData) {
    console.log('[API] 发送图片编辑请求');

    try {
        const response = await fetch('/api/edit-image', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            console.log(`[API] 图片编辑成功，返回 ${result.images?.length || 0} 张图片`);
        } else {
            console.error('[API] 图片编辑失败:', result.error);
        }

        return result;
    } catch (error) {
        console.error('[API] 图片编辑请求异常:', error);
        throw error;
    }
}

/**
 * 调用图片生成 API
 * @param {FormData} formData - 包含描述、参数的表单数据
 * @returns {Promise<{success: boolean, images?: Array, error?: string}>}
 */
export async function generateImage(formData) {
    console.log('[API] 发送图片生成请求');

    try {
        const response = await fetch('/api/generate-image', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            console.log(`[API] 图片生成成功，返回 ${result.images?.length || 0} 张图片`);
        } else {
            console.error('[API] 图片生成失败:', result.error);
        }

        return result;
    } catch (error) {
        console.error('[API] 图片生成请求异常:', error);
        throw error;
    }
}

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

/**
 * 调用图片编辑 API（流式版本）
 * @param {FormData} formData - 包含图片、指令、参数的表单数据
 * @param {Function} onProgressCallback - 每收到一张图片时的回调 (image) => void
 * @returns {Promise<{success: boolean, totalReceived: number, error?: string}>}
 */
export async function editImageStream(formData, onProgressCallback) {
    console.log('[API] 发送图片编辑流式请求');

    try {
        const response = await fetch('/api/edit-image-stream', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';  // 缓冲区，处理跨边界的 JSON
        let totalReceived = 0;
        let hasError = false;
        let errorMessage = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                console.log('[API] 流式读取完成');
                break;
            }

            // 解码分块数据
            buffer += decoder.decode(value, { stream: true });

            // 按行分割
            const lines = buffer.split('\n');

            // 保留最后一个不完整的行到缓冲区
            buffer = lines.pop();

            for (const line of lines) {
                // 跳过空行
                if (!line.trim()) continue;

                // 解析 SSE 格式：data: <JSON>
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);  // 去掉 "data: " 前缀

                    // 检查完成信号
                    if (data === '[DONE]') {
                        console.log('[API] 收到完成信号');
                        continue;
                    }

                    try {
                        const imageData = JSON.parse(data);

                        // 检查是否为错误消息
                        if (imageData.error) {
                            hasError = true;
                            errorMessage = imageData.error;
                            console.error('[API] 收到错误:', imageData.error);
                            continue;
                        }

                        // 正常图片数据
                        totalReceived++;
                        console.log(`[API] 收到第 ${imageData.index} 张图片: ${imageData.filename}`);

                        // 调用回调
                        if (onProgressCallback) {
                            onProgressCallback(imageData);
                        }
                    } catch (parseError) {
                        console.warn('[API] JSON 解析失败:', data, parseError);
                    }
                }
            }
        }

        if (hasError) {
            return { success: false, error: errorMessage, totalReceived };
        }

        if (totalReceived === 0) {
            return { success: false, error: '未收到任何图片', totalReceived: 0 };
        }

        return { success: true, totalReceived };

    } catch (error) {
        console.error('[API] 图片编辑流式请求异常:', error);
        throw error;
    }
}

/**
 * 调用图片生成 API（流式版本）
 * @param {FormData} formData - 包含描述、参数的表单数据
 * @param {Function} onProgressCallback - 每收到一张图片时的回调 (image) => void
 * @returns {Promise<{success: boolean, totalReceived: number, error?: string}>}
 */
export async function generateImageStream(formData, onProgressCallback) {
    console.log('[API] 发送图片生成流式请求');

    try {
        const response = await fetch('/api/generate-image-stream', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';  // 缓冲区，处理跨边界的 JSON
        let totalReceived = 0;
        let hasError = false;
        let errorMessage = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                console.log('[API] 流式读取完成');
                break;
            }

            // 解码分块数据
            buffer += decoder.decode(value, { stream: true });

            // 按行分割
            const lines = buffer.split('\n');

            // 保留最后一个不完整的行到缓冲区
            buffer = lines.pop();

            for (const line of lines) {
                // 跳过空行
                if (!line.trim()) continue;

                // 解析 SSE 格式：data: <JSON>
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);  // 去掉 "data: " 前缀

                    // 检查完成信号
                    if (data === '[DONE]') {
                        console.log('[API] 收到完成信号');
                        continue;
                    }

                    try {
                        const imageData = JSON.parse(data);

                        // 检查是否为错误消息
                        if (imageData.error) {
                            hasError = true;
                            errorMessage = imageData.error;
                            console.error('[API] 收到错误:', imageData.error);
                            continue;
                        }

                        // 正常图片数据
                        totalReceived++;
                        console.log(`[API] 收到第 ${imageData.index} 张图片: ${imageData.filename}`);

                        // 调用回调
                        if (onProgressCallback) {
                            onProgressCallback(imageData);
                        }
                    } catch (parseError) {
                        console.warn('[API] JSON 解析失败:', data, parseError);
                    }
                }
            }
        }

        if (hasError) {
            return { success: false, error: errorMessage, totalReceived };
        }

        if (totalReceived === 0) {
            return { success: false, error: '未收到任何图片', totalReceived: 0 };
        }

        return { success: true, totalReceived };

    } catch (error) {
        console.error('[API] 图片生成流式请求异常:', error);
        throw error;
    }
}

// ==========================================
// 图片展示模块 (Gallery Module)
// ==========================================
// 职责: 图片结果渲染、文件预览、结果区域管理

import * as DOM from './dom_map.js';

// === 结果渲染函数 ===

/**
 * 渲染编辑结果
 * @param {Array} images - 图片数组
 * @param {boolean} isAutoMode - 是否为 AUTO 模式
 * @returns {Array<string>} 返回下载 URLs 数组
 */
export function renderEditResults(images, isAutoMode = false) {
    const editedImagesDiv = document.getElementById(DOM.EDIT.RESULTS_IMAGES);
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
    const downloadEditBtn = document.getElementById(DOM.EDIT.DOWNLOAD_BUTTON);
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
    const generatedImages = document.getElementById(DOM.GENERATE.RESULTS_IMAGES);
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
    const downloadAllBtn = document.getElementById(DOM.GENERATE.DOWNLOAD_BUTTON);
    if (downloadAllBtn) {
        downloadAllBtn.style.display = (images.length > 1 && !isAutoMode) ? 'inline-block' : 'none';
    }

    // 返回下载URLs供状态管理
    return images.map(img => img.download_url);
}

// === 文件预览渲染 ===

/**
 * 渲染文件预览（单图或多图）
 * @param {FileList} files - 文件列表
 */
export function renderFilePreviews(files) {
    const previewsDiv = document.getElementById(DOM.EDIT.PREVIEWS);
    const originalPreview = document.getElementById(DOM.EDIT.ORIGINAL_PREVIEW);

    if (!files || files.length === 0) {
        previewsDiv.innerHTML = '<p>请选择1张或多张图片进行编辑</p>';
        originalPreview.innerHTML = '';
        return;
    }

    if (files.length === 1) {
        // 单图预览
        const reader = new FileReader();
        reader.onload = function(e) {
            originalPreview.innerHTML = `
                <img src="${e.target.result}"
                     alt="原图"
                     class="js-clickable-image"
                     style="cursor: pointer;">
            `;
            previewsDiv.innerHTML = '<p>已选择1张图片</p>';
        };
        reader.readAsDataURL(files[0]);
    } else {
        // 多图预览（竞态安全版）
        const maxFiles = Math.min(files.length, 5);
        let loadedCount = 0;
        const imageHtmlArray = new Array(maxFiles);  // 预分配数组，保证顺序

        previewsDiv.innerHTML = '<p style="color:#888;">正在加载预览...</p>';

        for (let i = 0; i < maxFiles; i++) {
            const reader = new FileReader();

            reader.onload = function(e) {
                // 按索引存储，保证顺序
                imageHtmlArray[i] = `
                    <div class="upload-thumbnail">
                        <img src="${e.target.result}" alt="预览">
                    </div>
                `;

                loadedCount++;

                // 所有图片加载完成后，一次性更新 DOM
                if (loadedCount === maxFiles) {
                    let finalHtml = `
                        <p style="margin-bottom: 10px; color: var(--text-secondary);">
                            已选择 ${files.length} 张图片：
                        </p>
                    `;

                    finalHtml += '<div class="upload-gallery">';
                    finalHtml += imageHtmlArray.join('');
                    finalHtml += '</div>';

                    if (files.length > 5) {
                        finalHtml += `
                            <p style="margin-top: 10px; color: var(--text-secondary);">
                                ...等 ${files.length} 张图片
                            </p>
                        `;
                    }

                    previewsDiv.innerHTML = finalHtml;
                }
            };

            reader.readAsDataURL(files[i]);
        }

        // 多图模式：清空单图预览区域
        originalPreview.innerHTML = '<p>多图片编辑模式</p>';
    }

    console.log(`[UI] 已渲染 ${files.length} 个文件预览`);
}

// === 结果清空函数 ===

/**
 * 清空编辑结果区域
 * 在开始新的手动编辑任务时调用
 */
export function clearEditResults() {
    const editedImagesDiv = document.getElementById(DOM.EDIT.RESULTS_IMAGES);
    const downloadBtn = document.getElementById(DOM.EDIT.DOWNLOAD_BUTTON);

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
    const generatedImages = document.getElementById(DOM.GENERATE.RESULTS_IMAGES);
    const downloadBtn = document.getElementById(DOM.GENERATE.DOWNLOAD_BUTTON);

    if (generatedImages) {
        generatedImages.innerHTML = '<p>生成中...</p>';
    }
    if (downloadBtn) {
        downloadBtn.style.display = 'none';
    }
}

// === 结果重置函数 ===

/**
 * 重置编辑结果区域到初始状态
 * 在任务失败时调用，清除"处理中..."提示
 */
export function resetEditResults() {
    const editedImagesDiv = document.getElementById(DOM.EDIT.RESULTS_IMAGES);
    if (editedImagesDiv) {
        editedImagesDiv.innerHTML = '<p>编辑完成后显示</p>';
    }
}

/**
 * 重置生成结果区域到初始状态
 * 在任务失败时调用，清除"生成中..."提示
 */
export function resetGenerateResults() {
    const generatedImages = document.getElementById(DOM.GENERATE.RESULTS_IMAGES);
    if (generatedImages) {
        generatedImages.innerHTML = '<p>生成完成后显示</p>';
    }
}

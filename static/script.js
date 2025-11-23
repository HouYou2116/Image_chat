let selectedFile = null;
let downloadUrl = null;
let downloadUrls = [];
let editDownloadUrls = [];
let currentMode = 'edit';
let apiKey = null;
let currentProvider = 'google';

// 定义服务商模型映射
const modelsByProvider = {
    'google': [
        { value: 'google/gemini-native', text: 'Google - Gemini 2.5 Flash (原生)' }
    ],
    'openrouter': [
        { value: 'google/gemini-2.5-flash-image-preview:free', text: 'OpenRouter - Gemini Flash (免费)' },
        { value: 'google/gemini-2.5-flash-image-preview', text: 'OpenRouter - Gemini Flash (标准)' }
    ],
    'tuzi': [
        { value: 'gemini-3-pro-image-preview', text: '兔子 - Gemini 3 Pro Image Preview' },
        { value: 'gemini-3-pro-image-preview-2k', text: '兔子 - Gemini 3 Pro Image Preview 2k' },
        { value: 'gemini-3-pro-image-preview-4k', text: '兔子 - Gemini 3 Pro Image Preview 4k' },
        { value: 'gemini-2.5-flash-image-vip', text: '兔子 - Gemini 2.5 Flash Image VIP' },
        { value: 'gemini-2.5-flash-image', text: '兔子 - Gemini 2.5 Flash Image' }
    ]
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化服务商选择器事件监听
    const providerSelector = document.getElementById('providerSelector');
    if (providerSelector) {
        providerSelector.addEventListener('change', function() {
            currentProvider = this.value;
            updateUIForProvider();
        });
    }
    
    // 初始化UI
    updateUIForProvider();
});

// 核心UI更新函数
function updateUIForProvider() {
    const provider = currentProvider;
    
    // 更新API Key标签和占位符
    const apiKeyLabel = document.getElementById('apiKeyLabel');
    const apiKeyInput = document.getElementById('apiKeyInput');
    
    if (provider === 'google') {
        apiKeyLabel.textContent = 'Google API Key：';
        apiKeyInput.placeholder = '输入您的 Google Gemini API Key';
    } else if (provider === 'openrouter') {
        apiKeyLabel.textContent = 'OpenRouter API Key：';
        apiKeyInput.placeholder = '输入您的 OpenRouter API Key';
    } else if (provider === 'tuzi') {
        apiKeyLabel.textContent = '兔子 API Key：';
        apiKeyInput.placeholder = '输入您的兔子 API Key (sk-开头)';
    }
    
    // 更新模型选项
    updateModelSelectors();
    
    // 加载对应的API Key
    loadApiKeyForProvider();
}

// 更新模型选择器选项
function updateModelSelectors() {
    const models = modelsByProvider[currentProvider] || [];
    
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
    }
}

// 加载对应服务商的API Key
function loadApiKeyForProvider() {
    const storageKey = `api_key_${currentProvider}`;
    const savedApiKey = localStorage.getItem(storageKey);
    const apiKeyInput = document.getElementById('apiKeyInput');
    
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
        apiKey = savedApiKey;
        updateApiKeyStatus('API Key已加载', 'success');
    } else {
        apiKeyInput.value = '';
        apiKey = null;
        updateApiKeyStatus('', '');
    }
}

// 监听文件选择（多文件）
document.getElementById('imageInput').addEventListener('change', function(e) {
    const files = e.target.files;
    const previewsDiv = document.getElementById('editPreviews');
    
    if (files.length > 0) {
        selectedFile = files;
        
        // 清空预览
        previewsDiv.innerHTML = '';
        
        // 显示多图预览
        if (files.length === 1) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const originalPreview = document.getElementById('originalPreview');
                const originalImageSrc = e.target.result;
                originalPreview.innerHTML = `<img src="${originalImageSrc}" alt="原图" onclick="openImageModal('${originalImageSrc}')" style="cursor: pointer;">`;
                previewsDiv.innerHTML = '<p>已选择1张图片</p>';
            };
            reader.readAsDataURL(files[0]);
        } else {
            // 多图片预览
            let previewsHtml = `<div class="image-gallery"><p>已选择${files.length}张图片：</p>`;
            
            for (let i = 0; i < Math.min(files.length, 5); i++) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    previewsHtml += `<img src="${e.target.result}" alt="图片${i + 1}" style="max-width: 100px; margin: 5px;">`;
                    if (i === Math.min(files.length, 5) - 1) {
                        previewsHtml += '</div>';
                        if (files.length > 5) {
                            previewsHtml += `<p>...等${files.length}张图片</p>`;
                        }
                        previewsDiv.innerHTML = previewsHtml;
                    }
                };
                reader.readAsDataURL(files[i]);
            }
            
            // 清空单图预览区域
            document.getElementById('originalPreview').innerHTML = '<p>多图片编辑模式</p>';
        }
    }
});

// 编辑图片
async function editImage() {
    const instruction = document.getElementById('instructionInput').value.trim();
    const imageCount = document.getElementById('editCountInput').value;
    
    // 验证输入
    if (!selectedFile) {
        showError('请先选择图片');
        return;
    }
    
    if (!instruction) {
        showError('请输入编辑指令');
        return;
    }
    
    // 显示加载状态
    showLoading(true);
    hideError();
    
    // 验证API Key
    if (!apiKey) {
        showError('请先设置API Key');
        showLoading(false);
        return;
    }
    
    // 准备表单数据
    const formData = new FormData();
    
    // 处理单个或多个文件
    if (selectedFile instanceof FileList) {
        // 多个文件
        for (let i = 0; i < selectedFile.length; i++) {
            formData.append('image', selectedFile[i]);
        }
    } else {
        // 单个文件
        formData.append('image', selectedFile);
    }
    
    formData.append('instruction', instruction);
    formData.append('image_count', imageCount);
    formData.append('api_key', apiKey);
    formData.append('provider', currentProvider);
    formData.append('model', document.getElementById('modelSelector').value);
    formData.append('temperature', document.getElementById('temperatureSlider').value);
    
    try {
        // 发送请求到后端
        const response = await fetch('/api/edit-image', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 显示编辑结果
            const editedImagesDiv = document.getElementById('editedImages');
            editDownloadUrls = result.images.map(img => img.download_url);
            
            let imagesHtml = '<div class="image-gallery">';
            result.images.forEach((img, index) => {
                const imageData = `data:image/png;base64,${img.image_data}`;
                imagesHtml += `
                    <div class="generated-item">
                        <img src="${imageData}" alt="编辑结果 ${index + 1}" onclick="openImageModal('${imageData}')">
                        <button onclick="downloadSingleImage('${img.download_url}', '${img.filename}')">下载</button>
                    </div>
                `;
            });
            imagesHtml += '</div>';
            
            editedImagesDiv.innerHTML = imagesHtml;
            
            // 显示批量下载按钮
            if (result.images.length > 1) {
                document.getElementById('downloadEditBtn').style.display = 'block';
            } else {
                document.getElementById('downloadEditBtn').style.display = 'none';
            }
            
        } else {
            showError(result.error || '编辑失败');
        }
        
    } catch (error) {
        showError('网络错误：' + error.message);
    } finally {
        showLoading(false);
    }
}

// 切换模式
function switchMode(mode) {
    currentMode = mode;
    
    // 更新tab按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (mode === 'edit') {
        document.querySelector('.tab-btn:first-child').classList.add('active');
        document.getElementById('editMode').style.display = 'block';
        document.getElementById('generateMode').style.display = 'none';
        document.getElementById('editResults').style.display = 'grid';
        document.getElementById('generateResults').style.display = 'none';
    } else {
        document.querySelector('.tab-btn:last-child').classList.add('active');
        document.getElementById('editMode').style.display = 'none';
        document.getElementById('generateMode').style.display = 'block';
        document.getElementById('editResults').style.display = 'none';
        document.getElementById('generateResults').style.display = 'block';
    }
    
    // 清理结果
    hideError();
}

// 生成图像
async function generateImage() {
    const description = document.getElementById('descriptionInput').value.trim();
    const imageCount = document.getElementById('imageCountInput').value;
    
    // 验证输入
    if (!description) {
        showError('请输入图像描述');
        return;
    }
    
    // 显示加载状态
    showGenerateLoading(true);
    hideError();
    
    // 验证API Key
    if (!apiKey) {
        showError('请先设置API Key');
        showGenerateLoading(false);
        return;
    }
    
    // 准备表单数据
    const formData = new FormData();
    formData.append('description', description);
    formData.append('image_count', imageCount);
    formData.append('api_key', apiKey);
    formData.append('provider', currentProvider);
    formData.append('model', document.getElementById('generateModelSelector').value);
    formData.append('temperature', document.getElementById('generateTemperatureSlider').value);
    
    try {
        // 发送请求到后端
        const response = await fetch('/api/generate-image', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 显示生成结果
            const generatedImages = document.getElementById('generatedImages');
            downloadUrls = result.images.map(img => img.download_url);
            
            let imagesHtml = '<div class="image-gallery">';
            result.images.forEach((img, index) => {
                const imageData = `data:image/png;base64,${img.image_data}`;
                imagesHtml += `
                    <div class="generated-item">
                        <img src="${imageData}" alt="生成结果 ${index + 1}" onclick="openImageModal('${imageData}')">
                        <button onclick="downloadSingleImage('${img.download_url}', '${img.filename}')">下载</button>
                    </div>
                `;
            });
            imagesHtml += '</div>';
            
            generatedImages.innerHTML = imagesHtml;
            
            // 显示批量下载按钮
            if (result.images.length > 1) {
                document.getElementById('downloadAllBtn').style.display = 'inline-block';
            }
            
        } else {
            showError(result.error || '生成失败');
        }
        
    } catch (error) {
        showError('网络错误：' + error.message);
    } finally {
        showGenerateLoading(false);
    }
}

// 下载单张图片
function downloadSingleImage(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 下载所有生成图片
function downloadAllImages() {
    downloadUrls.forEach((url, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = url;
            link.download = `generated_image_${index + 1}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 200); // 延迟下载避免浏览器拦截
    });
}

// 保存API Key
function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const key = apiKeyInput.value.trim();
    
    if (!key) {
        updateApiKeyStatus('请输入API Key', 'error');
        return;
    }
    
    // 根据不同服务商验证API Key格式
    let isValidFormat = false;
    if (currentProvider === 'google' && key.startsWith('AIza')) {
        isValidFormat = true;
    } else if (currentProvider === 'openrouter' && key.startsWith('sk-or-')) {
        isValidFormat = true;
    } else if (currentProvider === 'openrouter' && key.length > 10) {
        // OpenRouter API Key可能有不同的格式，这里放宽验证
        isValidFormat = true;
    } else if (currentProvider === 'tuzi' && key.startsWith('sk-')) {
        isValidFormat = true;
    }

    if (!isValidFormat) {
        let errorMsg = 'API Key格式不正确';
        if (currentProvider === 'google') {
            errorMsg += '（应以AIza开头）';
        } else if (currentProvider === 'tuzi') {
            errorMsg += '（应以sk-开头）';
        } else if (currentProvider === 'openrouter') {
            errorMsg += '（应以sk-or-开头）';
        }
        updateApiKeyStatus(errorMsg, 'error');
        return;
    }
    
    // 保存到localStorage（使用服务商特定的key）
    const storageKey = `api_key_${currentProvider}`;
    localStorage.setItem(storageKey, key);
    apiKey = key;
    updateApiKeyStatus('API Key已保存', 'success');
}

// 清除API Key
function deleteApiKey() {
    // 从浏览器的本地存储中删除当前服务商的API Key
    const storageKey = `api_key_${currentProvider}`;
    localStorage.removeItem(storageKey);
    
    // 清空输入框的显示
    document.getElementById('apiKeyInput').value = '';
    
    // 重置全局变量
    apiKey = null;
    
    // 显示成功消息
    updateApiKeyStatus('API Key已清除', 'success');
}

// 更新API Key状态显示
function updateApiKeyStatus(message, type) {
    const statusElement = document.getElementById('apiKeyStatus');
    statusElement.textContent = message;
    statusElement.className = `status-text ${type}`;
}


// 下载所有编辑图片
function downloadEditedImages() {
    editDownloadUrls.forEach((url, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = url;
            link.download = `edited_image_${index + 1}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 200); // 延迟下载避免浏览器拦截
    });
}

// 下载图片（编辑模式）
function downloadImage() {
    if (downloadUrl) {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'edited_image.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// 显示/隐藏加载状态（编辑模式）
function showLoading(show) {
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

// 显示/隐藏加载状态（生成模式）
function showGenerateLoading(show) {
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

// 显示错误信息
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// 隐藏错误信息
function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';
}

// 图片模态框功能
function openImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');

    modal.style.display = 'block';
    modalImg.src = imageSrc;

    // 防止页面滚动
    document.body.style.overflow = 'hidden';
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.style.display = 'none';

    // 恢复页面滚动
    document.body.style.overflow = 'auto';
}

// 点击模态框背景关闭模态框
document.addEventListener('click', function(e) {
    const modal = document.getElementById('imageModal');
    if (e.target === modal) {
        closeImageModal();
    }
});

// ESC键关闭模态框
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('imageModal');
        if (modal.style.display === 'block') {
            closeImageModal();
        }
    }
});

// 为动态加载的图片添加点击事件委托
document.addEventListener('click', function(e) {
    // 检查点击的元素是否是图片
    if (e.target.tagName === 'IMG' && e.target.closest('.image-preview, .generated-item')) {
        // 获取图片的src
        const imgSrc = e.target.src;
        if (imgSrc && !imgSrc.includes('data:image/svg')) { // 排除一些可能的图标
            openImageModal(imgSrc);
        }
    }
});

// 键盘快捷键支持
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') {
        if (currentMode === 'edit') {
            editImage();
        } else {
            generateImage();
        }
    }
});

// 温度滑块值显示逻辑
document.addEventListener('DOMContentLoaded', function() {
    // 编辑模式温度滑块
    const temperatureSlider = document.getElementById('temperatureSlider');
    const temperatureValue = document.getElementById('temperatureValue');
    
    if (temperatureSlider && temperatureValue) {
        temperatureSlider.addEventListener('input', function() {
            temperatureValue.textContent = this.value;
        });
    }
    
    // 生成模式温度滑块
    const generateTemperatureSlider = document.getElementById('generateTemperatureSlider');
    const generateTemperatureValue = document.getElementById('generateTemperatureValue');
    
    if (generateTemperatureSlider && generateTemperatureValue) {
        generateTemperatureSlider.addEventListener('input', function() {
            generateTemperatureValue.textContent = this.value;
        });
    }
});
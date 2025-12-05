// === 状态持久化配置 ===

// 1. 偏好设置 (存入 LocalStorage，长期保留)
const PERSISTENT_SETTINGS_IDS = [
    'providerSelector',
    // modelSelector 和 generateModelSelector 已移除
    // 模型选择由 providerModelPreferences 独立管理
    'editAspectRatioSelector',
    'generateAspectRatioSelector',
    'editResolutionSelector',
    'generateResolutionSelector',
    'editCountInput',
    'imageCountInput',
    'temperatureSlider',        // 编辑模式温度
    'generateTemperatureSlider' // 生成模式温度
];

// 2. 任务内容 (存入 SessionStorage，关闭标签页即清除)
const PERSISTENT_TEXT_IDS = [
    'instructionInput',
    'descriptionInput'
];

// 保存当前状态
function saveAppState() {
    // 保存偏好设置
    const settings = {};
    PERSISTENT_SETTINGS_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) settings[id] = el.value;
    });
    localStorage.setItem('image_chat_settings', JSON.stringify(settings));

    // 保存文本内容
    const texts = {};
    PERSISTENT_TEXT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) texts[id] = el.value;
    });
    sessionStorage.setItem('image_chat_texts', JSON.stringify(texts));
}

// 恢复保存的状态
function restoreAppState() {
    console.log('[State] 开始恢复用户状态...');

    let settings = null;
    try {
        settings = JSON.parse(localStorage.getItem('image_chat_settings'));
    } catch (e) {
        console.error('读取设置失败:', e);
    }

    if (settings) {
        // 1. 优先恢复 Provider
        if (settings['providerSelector']) {
            const providerEl = document.getElementById('providerSelector');
            if (providerEl) {
                providerEl.value = settings['providerSelector'];
                currentProvider = settings['providerSelector'];
                // 这会调用 updateModelSelectors，进而应用我们在步骤2写的"模型记忆"逻辑
                updateUIForProvider();
            }
        }

        // 2. 恢复其他控件
        PERSISTENT_SETTINGS_IDS.forEach(id => {
            if (id === 'providerSelector') return; // 跳过，已处理

            const el = document.getElementById(id);
            if (el && settings[id] !== undefined) {
                el.value = settings[id];

                // [修复问题1]：如果是滑块，手动更新对应的数字显示
                if (id === 'temperatureSlider') {
                    const valSpan = document.getElementById('temperatureValue');
                    if (valSpan) valSpan.textContent = settings[id];
                }
                if (id === 'generateTemperatureSlider') {
                    const valSpan = document.getElementById('generateTemperatureValue');
                    if (valSpan) valSpan.textContent = settings[id];
                }
            }
        });

        // [修复问题2]：强制运行一次分辨率可用性检查
        // 必须在模型值被恢复之后执行
        if (currentProvider === 'google') {
            const editModel = document.getElementById('modelSelector');
            if (editModel) updateResolutionAvailability('edit', editModel.value);

            const genModel = document.getElementById('generateModelSelector');
            if (genModel) updateResolutionAvailability('generate', genModel.value);
        }
    }

    // 3. 恢复文本内容 (逻辑不变)
    try {
        const texts = JSON.parse(sessionStorage.getItem('image_chat_texts'));
        if (texts) {
            PERSISTENT_TEXT_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el && texts[id] !== undefined) {
                    el.value = texts[id];
                }
            });
        }
    } catch (e) {
        console.error('恢复文本失败:', e);
    }

    console.log('[State] 用户状态恢复完成');
}

// 初始化自动保存监听
function initAutoSave() {
    const allIds = [...PERSISTENT_SETTINGS_IDS, ...PERSISTENT_TEXT_IDS];
    allIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // 对输入框使用 input 事件 (实时保存)，对下拉框使用 change 事件
            const eventType = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? 'input' : 'change';
            el.addEventListener(eventType, saveAppState);
        }
    });
    console.log('[State] 自动保存监听已启动');
}

// [新增] 用于存储每个服务商上次选择的模型
let providerModelPreferences = JSON.parse(localStorage.getItem('provider_model_preferences') || '{}');

// [辅助函数] 保存服务商模型偏好
function saveProviderModelPreference(provider, model) {
    providerModelPreferences[provider] = model;
    localStorage.setItem('provider_model_preferences', JSON.stringify(providerModelPreferences));
}

let selectedFile = null;
let downloadUrl = null;
let downloadUrls = [];
let editDownloadUrls = [];
let currentMode = 'edit';
let apiKey = null;
let currentProvider = 'google';
let appConfig = null;  // 存储从后端加载的配置

// 应用初始化函数
async function initApp() {
    // === 步骤 A：强制重置 UI 状态（关键） ===
    console.log('[Init] 开始重置 UI 状态');

    // 1. 重置编辑按钮状态
    showLoading(false);

    // 2. 重置生成按钮状态
    showGenerateLoading(false);

    // 3. 隐藏所有错误信息
    hideError();

    console.log('[Init] UI 状态重置完成');

    // === 步骤 B：加载并同步后端配置 ===
    console.log('[Init] 开始加载后端配置');
    await loadConfiguration();

    // === 步骤 C：强制更新 Provider 下拉框 ===
    const providerSelector = document.getElementById('providerSelector');
    if (providerSelector && appConfig) {
        // 强制设置下拉框值
        providerSelector.value = appConfig.defaultProvider;
        // 同步全局变量
        currentProvider = appConfig.defaultProvider;
        console.log('[Init] Provider 下拉框已更新为:', currentProvider);
    }

    // === 步骤 D：更新温度滑块 ===
    if (appConfig) {
        // 编辑模式温度滑块
        const editSlider = document.getElementById('temperatureSlider');
        const editValue = document.getElementById('temperatureValue');
        if (editSlider && editValue) {
            const defaultEditTemp = appConfig.defaultTemperature.edit;
            editSlider.value = defaultEditTemp.toString();
            editValue.textContent = defaultEditTemp.toFixed(1);
            console.log('[Init] 编辑温度已更新为:', defaultEditTemp);
        }

        // 生成模式温度滑块
        const genSlider = document.getElementById('generateTemperatureSlider');
        const genValue = document.getElementById('generateTemperatureValue');
        if (genSlider && genValue) {
            const defaultGenTemp = appConfig.defaultTemperature.generate;
            genSlider.value = defaultGenTemp.toString();
            genValue.textContent = defaultGenTemp.toFixed(1);
            console.log('[Init] 生成温度已更新为:', defaultGenTemp);
        }
    }

    // === 步骤 E：刷新模型列表 ===
    updateUIForProvider();

    // === 新增：覆盖默认值，恢复用户上次的状态 ===
    restoreAppState();

    // === 新增：启动状态监听 ===
    initAutoSave();

    console.log('[Init] 应用初始化完成 (已集成状态恢复)');
}

// 初始化温度滑块监听器
function initTemperatureSliders() {
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
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async function() {
    // 1. 执行统一初始化流程
    await initApp();

    // 2. 注册 Provider 选择器事件监听
    const providerSelector = document.getElementById('providerSelector');
    if (providerSelector) {
        providerSelector.addEventListener('change', function() {
            currentProvider = this.value;
            updateUIForProvider();
        });
    }

    // 3. 新增：注册模型选择器事件监听（编辑模式）
    const editModelSelector = document.getElementById('modelSelector');
    if (editModelSelector) {
        editModelSelector.addEventListener('change', function() {
            updateResolutionAvailability('edit', this.value);
            // [新增] 保存该服务商的模型偏好
            saveProviderModelPreference(currentProvider, this.value);
        });
    }

    // 4. 新增：注册模型选择器事件监听（生成模式）
    const genModelSelector = document.getElementById('generateModelSelector');
    if (genModelSelector) {
        genModelSelector.addEventListener('change', function() {
            updateResolutionAvailability('generate', this.value);
            // [新增] 保存偏好（加后缀区分编辑/生成模式）
            saveProviderModelPreference(currentProvider + '_generate', this.value);
        });
    }

    // 5. 初始化温度滑块监听器
    initTemperatureSliders();
});

// 新增：配置加载函数
async function loadConfiguration() {
    try {
        showConfigLoading('正在加载配置...');
        const response = await fetch('/api/config');
        const result = await response.json();

        if (result.success) {
            appConfig = result.config;
            currentProvider = appConfig.defaultProvider;
            console.log('配置加载成功:', appConfig);

            // 新增：初始化 Google 图像参数选项
            if (appConfig.providers.google && appConfig.providers.google.imageOptions) {
                initGoogleImageOptions();
            }
        } else {
            throw new Error(result.error || '配置加载失败');
        }
    } catch (error) {
        console.error('配置加载错误:', error);
        showError('配置加载失败，将使用默认配置');

        // 降级方案：使用硬编码默认配置
        appConfig = {
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
        currentProvider = appConfig.defaultProvider;

        // 不再抛出错误，允许应用继续运行
    } finally {
        hideConfigLoading();
    }
}

// 新增：初始化 Google 图像参数选项
function initGoogleImageOptions() {
    const googleConfig = appConfig.providers.google;
    if (!googleConfig || !googleConfig.imageOptions) return;

    const options = googleConfig.imageOptions;

    // 填充宽高比选项（编辑模式）
    populateSelectOptions(
        document.getElementById('editAspectRatioSelector'),
        options.aspect_ratios,
        true  // includeDefault
    );

    // 填充宽高比选项（生成模式）
    populateSelectOptions(
        document.getElementById('generateAspectRatioSelector'),
        options.aspect_ratios,
        true
    );

    // 填充分辨率选项（编辑模式）
    populateSelectOptions(
        document.getElementById('editResolutionSelector'),
        options.resolutions,
        true
    );

    // 填充分辨率选项（生成模式）
    populateSelectOptions(
        document.getElementById('generateResolutionSelector'),
        options.resolutions,
        true
    );

    console.log('Google 图像参数选项已初始化');
}

// 新增：通用选择器选项填充函数
function populateSelectOptions(selectElement, options, includeDefault = false) {
    if (!selectElement) return;

    selectElement.innerHTML = '';

    if (includeDefault) {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '默认';
        selectElement.appendChild(defaultOption);
    }

    if (!options || !Array.isArray(options)) return;

    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        selectElement.appendChild(optionElement);
    });
}

// 辅助函数：显示配置加载提示
function showConfigLoading(message) {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'config-loading';
    loadingDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#4CAF50;color:white;padding:10px;text-align:center;z-index:9999';
    loadingDiv.textContent = message;
    document.body.prepend(loadingDiv);
}

function hideConfigLoading() {
    const loadingDiv = document.getElementById('config-loading');
    if (loadingDiv) loadingDiv.remove();
}

// 核心UI更新函数
function updateUIForProvider() {
    if (!appConfig) {
        console.error('配置未加载');
        return;
    }

    const provider = currentProvider;
    const providerConfig = appConfig.providers[provider];

    if (!providerConfig) {
        console.error('未找到 provider 配置:', provider);
        return;
    }

    // 更新 API Key 标签和占位符（使用配置中的值）
    const apiKeyLabel = document.getElementById('apiKeyLabel');
    const apiKeyInput = document.getElementById('apiKeyInput');

    apiKeyLabel.textContent = providerConfig.name + ' API Key：';
    apiKeyInput.placeholder = providerConfig.apiKeyPlaceholder;

    // 更新模型选项
    updateModelSelectors();

    // 新增：显示/隐藏 Google 专用控件
    toggleGoogleImageControls(provider === 'google');

    // === 修复开始：切换 Provider 后立即刷新分辨率控件状态 ===
    if (provider === 'google') {
        const editModelSelector = document.getElementById('modelSelector');
        const genModelSelector = document.getElementById('generateModelSelector');

        if (editModelSelector) {
            updateResolutionAvailability('edit', editModelSelector.value);
        }
        if (genModelSelector) {
            updateResolutionAvailability('generate', genModelSelector.value);
        }
    }
    // === 修复结束 ===

    // 加载对应的 API Key
    loadApiKeyForProvider();
}

// 更新模型选择器选项
function updateModelSelectors() {
    if (!appConfig) return;

    const providerConfig = appConfig.providers[currentProvider];
    const models = providerConfig.models;

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

        // [核心修复] 优先使用用户在该服务商的历史选择，否则使用默认值
        const savedModel = providerModelPreferences[currentProvider];
        // 检查保存的模型是否依然在当前列表中（防止配置变更导致错误）
        const isValidSaved = savedModel && models.some(m => m.value === savedModel);

        modelSelector.value = isValidSaved ? savedModel : providerConfig.defaultModel;
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

        // 同上逻辑（使用带后缀的 key 区分编辑和生成模式）
        const savedGenModel = providerModelPreferences[currentProvider + '_generate'];
        const isValidSavedGen = savedGenModel && models.some(m => m.value === savedGenModel);

        generateModelSelector.value = isValidSavedGen ? savedGenModel : providerConfig.defaultModel;
    }
}

// 新增：显示或隐藏 Google 图像参数控件
function toggleGoogleImageControls(show) {
    const displayStyle = show ? 'block' : 'none';

    const editGroups = [
        'editAspectRatioGroup',
        'editResolutionGroup'
    ];

    const genGroups = [
        'generateAspectRatioGroup',
        'generateResolutionGroup'
    ];

    [...editGroups, ...genGroups].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = displayStyle;
    });

    console.log(`Google 图像控件${show ? '显示' : '隐藏'}`);
}

// 新增：根据选择的模型更新分辨率选择器的可用状态
function updateResolutionAvailability(mode, selectedModel) {
    if (currentProvider !== 'google') return;

    const googleConfig = appConfig.providers.google;
    if (!googleConfig || !googleConfig.imageOptions) return;

    const modelSupport = googleConfig.imageOptions.model_support || {};
    const modelConfig = modelSupport[selectedModel] || {};
    const supportsResolution = modelConfig.resolution || false;

    const resolutionSelector = document.getElementById(
        mode === 'edit' ? 'editResolutionSelector' : 'generateResolutionSelector'
    );

    const resolutionHint = document.getElementById(
        mode === 'edit' ? 'editResolutionHint' : 'generateResolutionHint'
    );

    if (resolutionSelector) {
        resolutionSelector.disabled = !supportsResolution;
        if (!supportsResolution) resolutionSelector.value = '';
    }

    if (resolutionHint) {
        resolutionHint.style.display = supportsResolution ? 'none' : 'inline';
    }

    console.log(`${mode} 分辨率控件: ${supportsResolution ? '启用' : '禁用'}`);
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

        // 重置编辑结果区域（清除上一次的编辑结果）
        const editedImagesDiv = document.getElementById('editedImages');
        editedImagesDiv.innerHTML = '<p>编辑完成后显示</p>';

        // 隐藏批量下载按钮
        const downloadEditBtn = document.getElementById('downloadEditBtn');
        downloadEditBtn.style.display = 'none';

        // 清空下载 URL 数组
        editDownloadUrls = [];

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

    // 新增：Google 专用参数
    if (currentProvider === 'google') {
        const aspectRatio = document.getElementById('editAspectRatioSelector').value;
        const resolution = document.getElementById('editResolutionSelector').value;

        if (aspectRatio) {
            formData.append('aspect_ratio', aspectRatio);
            console.log('设置宽高比:', aspectRatio);
        }

        if (resolution && !document.getElementById('editResolutionSelector').disabled) {
            formData.append('resolution', resolution);
            console.log('设置分辨率:', resolution);
        }
    }

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

    // 新增：Google 专用参数
    if (currentProvider === 'google') {
        const aspectRatio = document.getElementById('generateAspectRatioSelector').value;
        const resolution = document.getElementById('generateResolutionSelector').value;

        if (aspectRatio) {
            formData.append('aspect_ratio', aspectRatio);
            console.log('设置宽高比:', aspectRatio);
        }

        if (resolution && !document.getElementById('generateResolutionSelector').disabled) {
            formData.append('resolution', resolution);
            console.log('设置分辨率:', resolution);
        }
    }

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
    if (!appConfig) {
        updateApiKeyStatus('配置未加载', 'error');
        return;
    }

    const apiKeyInput = document.getElementById('apiKeyInput');
    const key = apiKeyInput.value.trim();

    if (!key) {
        updateApiKeyStatus('请输入 API Key', 'error');
        return;
    }

    // 使用配置中的 prefix 验证
    const expectedPrefix = appConfig.providers[currentProvider].apiKeyPrefix;
    if (!key.startsWith(expectedPrefix)) {
        updateApiKeyStatus(`API Key 格式不正确（应以 ${expectedPrefix} 开头）`, 'error');
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
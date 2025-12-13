// ===========================
// A) 状态管理
// ===========================
let currentEditingId = null;
let targetInputId = null;
let currentSort = "used";
let selectedTags = new Set();
let currentQuery = "";

// ===========================
// B) API 封装（对接 Phase 1）
// ===========================

/**
 * 获取提示词列表
 * @param {Object} params - { q, tags, sort, tag_mode }
 * @returns {Promise<Array>} 提示词列表
 */
async function fetchPrompts({ q = "", tags = [], sort = "used", tag_mode = "all" } = {}) {
    try {
        const params = new URLSearchParams();
        if (q) params.append("q", q);
        if (tags && tags.length > 0) {
            tags.forEach(tag => params.append("tags", tag));
        }
        if (sort) params.append("sort", sort);
        if (tag_mode) params.append("tag_mode", tag_mode);

        const url = `/api/prompts?${params.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`获取提示词列表失败: ${response.status}`);
        }

        const data = await response.json();
        return data.prompts || [];
    } catch (error) {
        console.error("fetchPrompts error:", error);
        alert(`获取提示词列表失败: ${error.message}`);
        return [];
    }
}

/**
 * 获取标签列表
 * @returns {Promise<Array>} 标签列表
 */
async function fetchTags() {
    try {
        const response = await fetch("/api/tags");

        if (!response.ok) {
            throw new Error(`获取标签列表失败: ${response.status}`);
        }

        const data = await response.json();
        return data.tags || [];
    } catch (error) {
        console.error("fetchTags error:", error);
        return [];
    }
}

/**
 * 保存新提示词
 * @param {Object} params - { label, content, tags, meta }
 * @returns {Promise<Object>} 保存的提示词对象
 */
async function savePrompt({ label, content, tags = [], meta = {} }) {
    try {
        const response = await fetch("/api/prompts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ label, content, tags, meta })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `保存失败: ${response.status}`);
        }

        const data = await response.json();
        return data.prompt;
    } catch (error) {
        console.error("savePrompt error:", error);
        alert(`保存提示词失败: ${error.message}`);
        throw error;
    }
}

/**
 * 更新提示词
 * @param {number} id - 提示词 ID
 * @param {Object} updates - { label?, content?, tags?, meta? }
 * @returns {Promise<Object>} 更新后的提示词对象
 */
async function updatePrompt(id, updates) {
    try {
        const response = await fetch(`/api/prompts/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(updates)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `更新失败: ${response.status}`);
        }

        const data = await response.json();
        return data.prompt;
    } catch (error) {
        console.error("updatePrompt error:", error);
        alert(`更新提示词失败: ${error.message}`);
        throw error;
    }
}

/**
 * 删除提示词
 * @param {number} id - 提示词 ID
 * @returns {Promise<void>}
 */
async function deletePrompt(id) {
    try {
        const response = await fetch(`/api/prompts/${id}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `删除失败: ${response.status}`);
        }
    } catch (error) {
        console.error("deletePrompt error:", error);
        alert(`删除提示词失败: ${error.message}`);
        throw error;
    }
}

/**
 * 标记提示词已使用
 * @param {number} id - 提示词 ID
 * @returns {Promise<void>}
 */
async function markPromptUsed(id) {
    try {
        const response = await fetch(`/api/prompts/${id}/use`, {
            method: "POST"
        });

        if (!response.ok) {
            console.warn(`标记使用失败: ${response.status}`);
        }
    } catch (error) {
        console.error("markPromptUsed error:", error);
        // 不阻断用户操作，仅记录日志
    }
}

// ===========================
// C) 工具函数
// ===========================

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 */
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                alert("已复制到剪贴板！");
            })
            .catch(err => {
                console.error("复制失败:", err);
                fallbackCopy(text);
            });
    } else {
        fallbackCopy(text);
    }
}

/**
 * 备用复制方法（兼容旧浏览器）
 * @param {string} text - 要复制的文本
 */
function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand("copy");
        alert("已复制到剪贴板！");
    } catch (err) {
        console.error("复制失败:", err);
        alert("复制失败，请手动复制");
    }
    document.body.removeChild(textarea);
}

/**
 * 获取内容预览（替换换行为空格，截取前 20 字）
 * @param {string} content - 完整内容
 * @returns {string} 预览文本
 */
function getPreview(content) {
    if (!content) return "";

    // 替换换行符为空格
    const normalized = content.replace(/[\r\n]+/g, " ");

    // 截取前 20 字
    if (normalized.length <= 20) {
        return normalized;
    }

    return normalized.substring(0, 20) + "...";
}

/**
 * 解析标签文本（支持逗号/空格/回车分隔）
 * @param {string} text - 标签文本
 * @returns {Array<string>} 标签数组
 */
function parseTags(text) {
    if (!text) return [];

    // 分隔符：逗号、空格、回车
    const tags = text.split(/[,\s\n\r]+/)
        .map(tag => normalizeTag(tag))
        .filter(tag => tag.length > 0);

    // 去重
    return [...new Set(tags)];
}

/**
 * 标准化标签（trim 去空）
 * @param {string} tag - 原始标签
 * @returns {string} 标准化后的标签
 */
function normalizeTag(tag) {
    return tag.trim();
}

/**
 * 提取标签名称（支持字符串或对象格式）
 * @param {string|Object} tag - 标签（可能是字符串或对象）
 * @returns {string} 标签名称
 */
function getTagName(tag) {
    if (typeof tag === 'string') {
        return tag;
    }
    if (typeof tag === 'object' && tag !== null) {
        return tag.name || tag.tag || tag.label || String(tag);
    }
    return String(tag);
}

// ===========================
// D) 交互核心（供 Phase 3 绑定）
// ===========================

/**
 * 打开提示词库弹窗
 * @param {string} inputId - 目标输入框的 DOM ID
 */
function openPromptModal(inputId) {
    targetInputId = inputId;
    const modal = document.getElementById("prompt-modal");

    if (!modal) {
        console.error("找不到 #prompt-modal 元素");
        return;
    }

    modal.style.display = "block";

    // 重置状态
    currentEditingId = null;
    currentQuery = "";
    selectedTags.clear();

    // 刷新列表
    refreshList();
}

/**
 * 关闭提示词库弹窗
 */
function closePromptModal() {
    const modal = document.getElementById("prompt-modal");

    if (modal) {
        modal.style.display = "none";
    }

    // 重置状态
    targetInputId = null;
    currentEditingId = null;
}

/**
 * 刷新提示词列表
 */
async function refreshList() {
    try {
        // 获取提示词列表
        const prompts = await fetchPrompts({
            q: currentQuery,
            tags: Array.from(selectedTags),
            sort: currentSort,
            tag_mode: selectedTags.size > 0 ? "all" : "all"
        });

        // 渲染列表
        renderPromptList(prompts);

        // 更新标签筛选区（如果需要）
        await refreshTagFilters();
    } catch (error) {
        console.error("refreshList error:", error);
    }
}

/**
 * 刷新标签筛选区
 */
async function refreshTagFilters() {
    try {
        const tags = await fetchTags();
        const container = document.getElementById("tag-filter-container");

        if (!container) return;

        container.innerHTML = "";

        tags.forEach(tag => {
            const tagName = getTagName(tag); // 提取标签名称
            const chip = document.createElement("span");
            chip.className = "tag-chip";
            chip.textContent = tagName;
            chip.dataset.tag = tagName;

            if (selectedTags.has(tagName)) {
                chip.classList.add("selected");
            }

            chip.addEventListener("click", () => {
                if (selectedTags.has(tagName)) {
                    selectedTags.delete(tagName);
                    chip.classList.remove("selected");
                } else {
                    selectedTags.add(tagName);
                    chip.classList.add("selected");
                }
                refreshList();
            });

            container.appendChild(chip);
        });
    } catch (error) {
        console.error("refreshTagFilters error:", error);
    }
}

/**
 * 渲染提示词列表
 * @param {Array} prompts - 提示词数组
 */
function renderPromptList(prompts) {
    const listContainer = document.getElementById("prompt-list");

    if (!listContainer) {
        console.error("找不到 #prompt-list 元素");
        return;
    }

    // 清空列表
    listContainer.innerHTML = "";

    if (prompts.length === 0) {
        listContainer.innerHTML = '<div class="empty-state">暂无提示词</div>';
        return;
    }

    // 渲染每个提示词
    prompts.forEach(prompt => {
        const item = document.createElement("div");
        item.className = "prompt-item";
        item.dataset.id = prompt.id;

        // 标签
        const label = document.createElement("div");
        label.className = "prompt-label";
        label.textContent = prompt.label;

        // 预览
        const preview = document.createElement("div");
        preview.className = "prompt-preview";
        preview.textContent = getPreview(prompt.content);

        // 标签 chips
        const tagsContainer = document.createElement("div");
        tagsContainer.className = "prompt-tags";

        if (prompt.tags && prompt.tags.length > 0) {
            prompt.tags.forEach(tag => {
                const tagName = getTagName(tag); // 提取标签名称
                const tagChip = document.createElement("span");
                tagChip.className = "tag-chip small";
                tagChip.textContent = tagName;
                tagsContainer.appendChild(tagChip);
            });
        }

        // 操作按钮
        const actions = document.createElement("div");
        actions.className = "prompt-actions";

        // 使用按钮
        const useBtn = document.createElement("button");
        useBtn.className = "btn-use";
        useBtn.textContent = "使用";
        useBtn.addEventListener("click", () => {
            applyPromptToInput(prompt, "replace");
        });

        // 复制按钮
        const copyBtn = document.createElement("button");
        copyBtn.className = "btn-copy";
        copyBtn.textContent = "复制";
        copyBtn.addEventListener("click", () => {
            copyToClipboard(prompt.content);
        });

        // 编辑按钮
        const editBtn = document.createElement("button");
        editBtn.className = "btn-edit";
        editBtn.textContent = "编辑";
        editBtn.addEventListener("click", () => {
            enableEditMode(prompt);
        });

        // 删除按钮
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn-delete";
        deleteBtn.textContent = "删除";
        deleteBtn.addEventListener("click", async () => {
            if (confirm(`确定删除提示词「${prompt.label}」吗？`)) {
                try {
                    await deletePrompt(prompt.id);
                    refreshList();
                } catch (error) {
                    // 错误已在 deletePrompt 中处理
                }
            }
        });

        actions.appendChild(useBtn);
        actions.appendChild(copyBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        // 组装
        item.appendChild(label);
        item.appendChild(preview);
        item.appendChild(tagsContainer);
        item.appendChild(actions);

        listContainer.appendChild(item);
    });
}

/**
 * 启用创建模式
 * @param {string} prefillContent - 预填充内容
 */
function enableCreateMode(prefillContent = "") {
    currentEditingId = null;

    // 切换到编辑视图
    showEditView();

    // 默认 label 取 content 前 N 字
    const defaultLabel = prefillContent ? getPreview(prefillContent) : "";

    // 填充表单
    const labelInput = document.getElementById("edit-label");
    const contentInput = document.getElementById("edit-content");
    const tagsInput = document.getElementById("edit-tags");

    if (labelInput) labelInput.value = defaultLabel;
    if (contentInput) contentInput.value = prefillContent;
    if (tagsInput) tagsInput.value = "";
}

/**
 * 启用编辑模式
 * @param {Object} prompt - 提示词对象
 */
function enableEditMode(prompt) {
    currentEditingId = prompt.id;

    // 切换到编辑视图
    showEditView();

    // 填充表单
    const labelInput = document.getElementById("edit-label");
    const contentInput = document.getElementById("edit-content");
    const tagsInput = document.getElementById("edit-tags");

    if (labelInput) labelInput.value = prompt.label || "";
    if (contentInput) contentInput.value = prompt.content || "";
    if (tagsInput) tagsInput.value = prompt.tags ? prompt.tags.join(", ") : "";
}

/**
 * 显示编辑视图
 */
function showEditView() {
    const listView = document.getElementById("prompt-list-view");
    const editView = document.getElementById("prompt-edit-view");

    if (listView) listView.style.display = "none";
    if (editView) editView.style.display = "block";
}

/**
 * 显示列表视图
 */
function showListView() {
    const listView = document.getElementById("prompt-list-view");
    const editView = document.getElementById("prompt-edit-view");

    if (listView) listView.style.display = "block";
    if (editView) editView.style.display = "none";
}

/**
 * 取消编辑（返回列表视图）
 */
function cancelEdit() {
    currentEditingId = null;
    showListView();
}

/**
 * 应用提示词到输入框
 * @param {Object} prompt - 提示词对象
 * @param {string} mode - 应用模式（"replace" 或 "append"）
 */
async function applyPromptToInput(prompt, mode = "replace") {
    if (!targetInputId) {
        console.warn("目标输入框 ID 未设置");
        return;
    }

    const inputElement = document.getElementById(targetInputId);

    if (!inputElement) {
        console.error(`找不到输入框 #${targetInputId}`);
        return;
    }

    // 写入内容
    if (mode === "replace") {
        inputElement.value = prompt.content;
    } else if (mode === "append") {
        inputElement.value += (inputElement.value ? "\n" : "") + prompt.content;
    }

    // 标记已使用
    await markPromptUsed(prompt.id);

    // 刷新列表（让"最近使用/次数"立即更新）
    await refreshList();

    // 关闭弹窗
    closePromptModal();
}

// ===========================
// E) 事件绑定
// ===========================

/**
 * 绑定所有提示词相关事件
 */
function bindPromptEvents() {
    // === 生成模式按钮 ===

    // #btn-save-prompt：进入创建模式（预填生成模式输入框）
    const btnSavePrompt = document.getElementById("btn-save-prompt");
    if (btnSavePrompt) {
        btnSavePrompt.addEventListener("click", () => {
            const descInput = document.getElementById("descriptionInput");
            const prefillContent = descInput ? descInput.value : "";

            openPromptModal("descriptionInput");
            enableCreateMode(prefillContent);
        });
    }

    // #btn-open-library：打开提示词库（生成模式）
    const btnOpenLibrary = document.getElementById("btn-open-library");
    if (btnOpenLibrary) {
        btnOpenLibrary.addEventListener("click", () => {
            openPromptModal("descriptionInput");
        });
    }

    // === 编辑模式按钮 ===

    // #btn-save-prompt-edit：进入创建模式（预填编辑模式输入框）
    const btnSavePromptEdit = document.getElementById("btn-save-prompt-edit");
    if (btnSavePromptEdit) {
        btnSavePromptEdit.addEventListener("click", () => {
            const instrInput = document.getElementById("instructionInput");
            const prefillContent = instrInput ? instrInput.value : "";

            openPromptModal("instructionInput");
            enableCreateMode(prefillContent);
        });
    }

    // #btn-open-library-edit：打开提示词库（编辑模式）
    const btnOpenLibraryEdit = document.getElementById("btn-open-library-edit");
    if (btnOpenLibraryEdit) {
        btnOpenLibraryEdit.addEventListener("click", () => {
            openPromptModal("instructionInput");
        });
    }

    // #prompt-search：搜索框（防抖 300ms）
    const promptSearch = document.getElementById("prompt-search");
    if (promptSearch) {
        let searchTimeout = null;
        promptSearch.addEventListener("input", (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentQuery = e.target.value.trim();
                refreshList();
            }, 300);
        });
    }

    // #prompt-sort：排序切换
    const promptSort = document.getElementById("prompt-sort");
    if (promptSort) {
        promptSort.addEventListener("change", (e) => {
            currentSort = e.target.value;
            refreshList();
        });
    }

    // 编辑视图按钮：保存
    const btnSaveEdit = document.getElementById("btn-save-edit");
    if (btnSaveEdit) {
        btnSaveEdit.addEventListener("click", async () => {
            const labelInput = document.getElementById("edit-label");
            const contentInput = document.getElementById("edit-content");
            const tagsInput = document.getElementById("edit-tags");

            const label = labelInput ? labelInput.value.trim() : "";
            const content = contentInput ? contentInput.value.trim() : "";
            const tagsText = tagsInput ? tagsInput.value.trim() : "";
            const tags = parseTags(tagsText);

            if (!label) {
                alert("请输入提示词标题");
                return;
            }

            if (!content) {
                alert("请输入提示词内容");
                return;
            }

            try {
                if (currentEditingId) {
                    // 更新
                    await updatePrompt(currentEditingId, { label, content, tags });
                } else {
                    // 新建
                    await savePrompt({ label, content, tags });
                }

                // 返回列表视图
                cancelEdit();

                // 刷新列表
                await refreshList();
            } catch (error) {
                // 错误已在 savePrompt/updatePrompt 中处理
            }
        });
    }

    // 编辑视图按钮：取消
    const btnCancelEdit = document.getElementById("btn-cancel-edit");
    if (btnCancelEdit) {
        btnCancelEdit.addEventListener("click", () => {
            cancelEdit();
        });
    }

    // 编辑视图按钮：关闭
    const btnCloseEdit = document.getElementById("btn-close-edit");
    if (btnCloseEdit) {
        btnCloseEdit.addEventListener("click", () => {
            cancelEdit();
            closePromptModal();
        });
    }

    // 弹窗关闭按钮
    const btnCloseModal = document.getElementById("btn-close-prompt-modal");
    if (btnCloseModal) {
        btnCloseModal.addEventListener("click", () => {
            closePromptModal();
        });
    }

    // 点击弹窗背景关闭
    const modal = document.getElementById("prompt-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                closePromptModal();
            }
        });
    }
}

// ===========================
// 导出接口
// ===========================

export {
    bindPromptEvents,
    openPromptModal,
    closePromptModal,
    refreshList
};

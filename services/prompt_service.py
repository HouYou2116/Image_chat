"""
提示词库服务层

封装提示词的增删改查业务逻辑，包括：
- JSON 文件持久化存储（使用临时文件 + 原子替换确保数据安全）
- 提示词的 CRUD 操作
- 标签筛选、关键词搜索、多种排序
- 使用统计跟踪
"""

import os
import json
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Any
from services.logging_config import log_error, api_logger


# ============================================================================
# 常量定义
# ============================================================================

DATA_DIR = 'data'
PROMPTS_FILE = os.path.join(DATA_DIR, 'prompts.json')
PROMPTS_TEMP_FILE = os.path.join(DATA_DIR, 'prompts.json.tmp')


# ============================================================================
# 数据模型和默认值
# ============================================================================

def _create_prompt_defaults() -> Dict[str, Any]:
    """
    返回 prompt 对象的默认字段值

    Returns:
        Dict: 包含所有必需字段的默认值字典
    """
    now = datetime.now().isoformat()
    return {
        'id': str(uuid.uuid4()),
        'label': '',
        'content': '',
        'tags': [],
        'meta': {},
        'created_at': now,
        'updated_at': now,
        'usage_count': 0,
        'last_used_at': None
    }


def _normalize_prompt(prompt: Dict[str, Any]) -> Dict[str, Any]:
    """
    规范化 prompt 对象，确保所有必需字段存在（兼容旧数据）

    Args:
        prompt: 原始 prompt 对象

    Returns:
        Dict: 规范化后的 prompt 对象（包含所有必需字段）
    """
    defaults = _create_prompt_defaults()

    # 保留原有的 id（如果存在），否则生成新的
    if 'id' in prompt:
        defaults['id'] = prompt['id']

    # 保留原有的 created_at（如果存在），否则使用当前时间
    if 'created_at' in prompt:
        defaults['created_at'] = prompt['created_at']

    # 合并原始数据，优先使用原始数据中的值
    for key in ['label', 'content', 'tags', 'meta', 'updated_at', 'usage_count', 'last_used_at']:
        if key in prompt:
            defaults[key] = prompt[key]

    # 确保 tags 是列表
    if not isinstance(defaults['tags'], list):
        defaults['tags'] = []

    # 确保 meta 是字典
    if not isinstance(defaults['meta'], dict):
        defaults['meta'] = {}

    # 确保 usage_count 是整数
    if not isinstance(defaults['usage_count'], int):
        defaults['usage_count'] = 0

    return defaults


# ============================================================================
# JSON 文件读写函数（安全写入）
# ============================================================================

def _ensure_data_dir() -> None:
    """确保 data 目录存在"""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        api_logger.info(f"创建 data 目录: {DATA_DIR}")


def _read_prompts_file() -> List[Dict[str, Any]]:
    """
    从 JSON 文件读取所有 prompts（自动兼容旧数据）

    Returns:
        List[Dict]: prompts 列表（已规范化）
    """
    _ensure_data_dir()

    # 如果文件不存在，返回空列表
    if not os.path.exists(PROMPTS_FILE):
        api_logger.info(f"prompts.json 文件不存在，返回空列表")
        return []

    try:
        with open(PROMPTS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # 确保 data 是列表
        if not isinstance(data, list):
            log_error("数据格式错误", "prompts.json 不是列表", str(type(data)))
            return []

        # 规范化每个 prompt（兼容旧数据）
        normalized = [_normalize_prompt(p) for p in data]

        api_logger.info(f"成功读取 {len(normalized)} 条 prompts")
        return normalized

    except json.JSONDecodeError as e:
        log_error("JSON 解析失败", "prompts.json 格式错误", str(e))
        return []
    except Exception as e:
        log_error("读取 prompts 失败", str(e), PROMPTS_FILE)
        return []


def _write_prompts_file(prompts: List[Dict[str, Any]]) -> None:
    """
    安全写入 prompts 到 JSON 文件
    使用临时文件 + 原子替换，避免中途崩溃导致数据损坏

    Args:
        prompts: prompts 列表

    Raises:
        Exception: 写入失败时抛出异常
    """
    _ensure_data_dir()

    try:
        # 1. 写入临时文件
        with open(PROMPTS_TEMP_FILE, 'w', encoding='utf-8') as f:
            json.dump(prompts, f, ensure_ascii=False, indent=2)

        # 2. 原子替换（Windows 下需要先删除目标文件）
        if os.path.exists(PROMPTS_FILE):
            os.remove(PROMPTS_FILE)
        os.rename(PROMPTS_TEMP_FILE, PROMPTS_FILE)

        api_logger.info(f"成功写入 {len(prompts)} 条 prompts 到文件")

    except Exception as e:
        log_error("写入 prompts 失败", str(e), PROMPTS_FILE)
        # 清理临时文件
        if os.path.exists(PROMPTS_TEMP_FILE):
            try:
                os.remove(PROMPTS_TEMP_FILE)
            except:
                pass
        raise


# ============================================================================
# 辅助函数：查找、排序、筛选
# ============================================================================

def _find_prompt_by_id(prompts: List[Dict[str, Any]], prompt_id: str) -> Optional[Dict[str, Any]]:
    """
    根据 ID 查找 prompt

    Args:
        prompts: prompts 列表
        prompt_id: prompt ID

    Returns:
        Dict 或 None: 找到的 prompt 对象，未找到返回 None
    """
    for p in prompts:
        if p['id'] == prompt_id:
            return p
    return None


def _match_keyword(prompt: Dict[str, Any], keyword: str) -> bool:
    """
    检查 prompt 是否匹配关键词（模糊匹配 label/content/tags）

    Args:
        prompt: prompt 对象
        keyword: 搜索关键词

    Returns:
        bool: 是否匹配
    """
    keyword_lower = keyword.lower()

    # 匹配 label
    if keyword_lower in prompt['label'].lower():
        return True

    # 匹配 content
    if keyword_lower in prompt['content'].lower():
        return True

    # 匹配 tags
    for tag in prompt['tags']:
        if keyword_lower in tag.lower():
            return True

    return False


def _match_tags(prompt: Dict[str, Any], tags: List[str], tag_mode: str) -> bool:
    """
    检查 prompt 是否匹配标签筛选条件

    Args:
        prompt: prompt 对象
        tags: 标签列表
        tag_mode: 标签匹配模式（"AND" 或 "OR"）

    Returns:
        bool: 是否匹配
    """
    if not tags:
        return True

    prompt_tags_lower = [t.lower() for t in prompt['tags']]
    search_tags_lower = [t.lower() for t in tags]

    if tag_mode == 'AND':
        # AND 模式：所有标签都必须存在
        return all(tag in prompt_tags_lower for tag in search_tags_lower)
    else:
        # OR 模式：至少一个标签存在
        return any(tag in prompt_tags_lower for tag in search_tags_lower)


def _sort_prompts(prompts: List[Dict[str, Any]], sort: str) -> List[Dict[str, Any]]:
    """
    对 prompts 列表排序

    Args:
        prompts: prompts 列表
        sort: 排序方式（"updated" / "used" / "freq"）

    Returns:
        List[Dict]: 排序后的 prompts 列表
    """
    if sort == 'updated':
        # 按 updated_at 倒序（最新修改的在前）
        return sorted(prompts, key=lambda p: p['updated_at'], reverse=True)

    elif sort == 'used':
        # 按 last_used_at 倒序（最近使用的在前，None 排最后）
        def used_key(p):
            if p['last_used_at'] is None:
                return ''  # 空字符串排在最后
            return p['last_used_at']
        return sorted(prompts, key=used_key, reverse=True)

    elif sort == 'freq':
        # 按 usage_count 倒序，其次 updated_at 倒序
        return sorted(prompts, key=lambda p: (p['usage_count'], p['updated_at']), reverse=True)

    else:
        # 默认按 updated_at 倒序
        return sorted(prompts, key=lambda p: p['updated_at'], reverse=True)


# ============================================================================
# 公开 API 函数
# ============================================================================

def get_all_prompts(
    sort: str = 'updated',
    q: Optional[str] = None,
    tags: Optional[List[str]] = None,
    tag_mode: str = 'AND'
) -> List[Dict[str, Any]]:
    """
    获取所有 prompts（支持排序、搜索、标签筛选）

    Args:
        sort: 排序方式（"updated" / "used" / "freq"）
            - updated: 按 updated_at 倒序
            - used: 按 last_used_at 倒序（None 排最后）
            - freq: 按 usage_count 倒序，其次 updated_at 倒序
        q: 关键词搜索（模糊匹配 label/content/tags）
        tags: 标签筛选列表
        tag_mode: 标签匹配模式（"AND" 或 "OR"）

    Returns:
        List[Dict]: prompts 列表
    """
    # 1. 读取所有 prompts
    prompts = _read_prompts_file()

    # 2. 关键词筛选
    if q:
        prompts = [p for p in prompts if _match_keyword(p, q)]

    # 3. 标签筛选
    if tags:
        prompts = [p for p in prompts if _match_tags(p, tags, tag_mode)]

    # 4. 排序
    prompts = _sort_prompts(prompts, sort)

    api_logger.info(f"查询 prompts: sort={sort}, q={q}, tags={tags}, 结果数={len(prompts)}")

    return prompts


def save_prompt(
    label: str,
    content: str,
    tags: Optional[List[str]] = None,
    meta: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    保存新 prompt

    Args:
        label: 标签名称
        content: 提示词内容
        tags: 标签列表（可选）
        meta: 元数据字典（可选）

    Returns:
        Dict: 新创建的 prompt 对象

    Raises:
        ValueError: 参数验证失败
        Exception: 写入失败
    """
    # 参数验证
    if not label or not label.strip():
        raise ValueError('label 不能为空')

    if not content or not content.strip():
        raise ValueError('content 不能为空')

    # 创建新 prompt 对象
    new_prompt = _create_prompt_defaults()
    new_prompt['label'] = label.strip()
    new_prompt['content'] = content.strip()

    if tags is not None:
        new_prompt['tags'] = tags if isinstance(tags, list) else []

    if meta is not None:
        new_prompt['meta'] = meta if isinstance(meta, dict) else {}

    # 读取现有 prompts
    prompts = _read_prompts_file()

    # 添加新 prompt
    prompts.append(new_prompt)

    # 写入文件
    _write_prompts_file(prompts)

    api_logger.info(f"新增 prompt: id={new_prompt['id']}, label={label}")

    return new_prompt


def update_prompt(
    prompt_id: str,
    label: Optional[str] = None,
    content: Optional[str] = None,
    tags: Optional[List[str]] = None,
    meta: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    更新 prompt（只更新传入字段，不覆盖其他字段）

    Args:
        prompt_id: prompt ID
        label: 新标签名称（可选）
        content: 新提示词内容（可选）
        tags: 新标签列表（可选）
        meta: 新元数据字典（可选）

    Returns:
        Dict: 更新后的 prompt 对象

    Raises:
        ValueError: prompt 不存在
        Exception: 写入失败
    """
    # 读取所有 prompts
    prompts = _read_prompts_file()

    # 查找目标 prompt
    prompt = _find_prompt_by_id(prompts, prompt_id)

    if prompt is None:
        raise ValueError(f'prompt 不存在: {prompt_id}')

    # 只更新传入的字段
    if label is not None:
        prompt['label'] = label.strip()

    if content is not None:
        prompt['content'] = content.strip()

    if tags is not None:
        prompt['tags'] = tags if isinstance(tags, list) else []

    if meta is not None:
        prompt['meta'] = meta if isinstance(meta, dict) else {}

    # 更新 updated_at
    prompt['updated_at'] = datetime.now().isoformat()

    # 写入文件
    _write_prompts_file(prompts)

    api_logger.info(f"更新 prompt: id={prompt_id}")

    return prompt


def delete_prompt(prompt_id: str) -> None:
    """
    删除 prompt

    Args:
        prompt_id: prompt ID

    Raises:
        ValueError: prompt 不存在
        Exception: 写入失败
    """
    # 读取所有 prompts
    prompts = _read_prompts_file()

    # 查找目标 prompt
    prompt = _find_prompt_by_id(prompts, prompt_id)

    if prompt is None:
        raise ValueError(f'prompt 不存在: {prompt_id}')

    # 删除 prompt
    prompts = [p for p in prompts if p['id'] != prompt_id]

    # 写入文件
    _write_prompts_file(prompts)

    api_logger.info(f"删除 prompt: id={prompt_id}")


def mark_prompt_used(prompt_id: str) -> Dict[str, Any]:
    """
    标记 prompt 已使用（更新使用统计）

    Args:
        prompt_id: prompt ID

    Returns:
        Dict: 更新后的 prompt 对象

    Raises:
        ValueError: prompt 不存在
        Exception: 写入失败
    """
    # 读取所有 prompts
    prompts = _read_prompts_file()

    # 查找目标 prompt
    prompt = _find_prompt_by_id(prompts, prompt_id)

    if prompt is None:
        raise ValueError(f'prompt 不存在: {prompt_id}')

    # 更新使用统计
    prompt['usage_count'] += 1
    prompt['last_used_at'] = datetime.now().isoformat()
    prompt['updated_at'] = datetime.now().isoformat()  # 同步更新 updated_at 以反映活跃度

    # 写入文件
    _write_prompts_file(prompts)

    api_logger.info(f"标记 prompt 已使用: id={prompt_id}, usage_count={prompt['usage_count']}")

    return prompt


def get_all_tags() -> List[Dict[str, Any]]:
    """
    获取所有标签及其使用次数（从 prompts 聚合）

    Returns:
        List[Dict]: 标签统计列表 [{"tag": "标签名", "count": 使用次数}, ...]
    """
    # 读取所有 prompts
    prompts = _read_prompts_file()

    # 统计标签
    tag_counts = {}
    for prompt in prompts:
        for tag in prompt['tags']:
            if tag in tag_counts:
                tag_counts[tag] += 1
            else:
                tag_counts[tag] = 1

    # 转换为列表并按使用次数倒序排序
    tags_list = [{'tag': tag, 'count': count} for tag, count in tag_counts.items()]
    tags_list.sort(key=lambda x: x['count'], reverse=True)

    api_logger.info(f"获取所有标签: {len(tags_list)} 个标签")

    return tags_list

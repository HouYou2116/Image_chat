"""
提示词库 API 路由
"""

from flask import request, jsonify

from services import prompt_service
from services.logging_config import log_error, api_logger

# 从当前包导入 api_bp
from . import api_bp


@api_bp.route('/prompts', methods=['GET'])
def get_prompts():
    """
    获取所有提示词（支持排序、搜索、标签筛选）

    Query 参数：
        - q: 关键词搜索（可选）
        - tags: 标签筛选（逗号分隔，可选）
        - sort: 排序方式（updated/used/freq，默认 updated）
        - tag_mode: 标签匹配模式（AND/OR，默认 AND）
    """
    api_logger.info("开始处理获取提示词列表请求")

    try:
        # 提取查询参数
        q = request.args.get('q', None)
        tags_str = request.args.get('tags', None)
        sort = request.args.get('sort', 'updated')
        tag_mode = request.args.get('tag_mode', 'AND')

        # 解析 tags（逗号分隔）
        tags = None
        if tags_str:
            tags = [t.strip() for t in tags_str.split(',') if t.strip()]

        api_logger.info(f"查询参数: q={q}, tags={tags}, sort={sort}, tag_mode={tag_mode}")

        # 调用服务层
        prompts = prompt_service.get_all_prompts(
            sort=sort,
            q=q,
            tags=tags,
            tag_mode=tag_mode
        )

        return jsonify({
            'success': True,
            'prompts': prompts,
            'count': len(prompts)
        })

    except Exception as e:
        log_error("获取提示词列表失败", str(e), "")
        return jsonify({'success': False, 'error': str(e)}), 500


@api_bp.route('/prompts', methods=['POST'])
def create_prompt():
    """
    创建新提示词

    Body (JSON):
        - label: 标签名称（必需）
        - content: 提示词内容（必需）
        - tags: 标签列表（可选）
        - meta: 元数据字典（可选）
    """
    api_logger.info("开始处理创建提示词请求")

    try:
        # 提取请求体
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': '请求体不能为空'}), 400

        label = data.get('label')
        content = data.get('content')
        tags = data.get('tags', None)
        meta = data.get('meta', None)

        api_logger.info(f"创建提示词: label={label}")

        # 调用服务层
        new_prompt = prompt_service.save_prompt(
            label=label,
            content=content,
            tags=tags,
            meta=meta
        )

        return jsonify({
            'success': True,
            'prompt': new_prompt
        }), 201

    except ValueError as e:
        # 参数验证错误
        return jsonify({'success': False, 'error': str(e)}), 400

    except Exception as e:
        log_error("创建提示词失败", str(e), "")
        return jsonify({'success': False, 'error': str(e)}), 500


@api_bp.route('/prompts/<prompt_id>', methods=['PUT'])
def update_prompt(prompt_id):
    """
    更新提示词（只更新传入字段）

    Path 参数：
        - prompt_id: 提示词 ID

    Body (JSON):
        - label: 新标签名称（可选）
        - content: 新提示词内容（可选）
        - tags: 新标签列表（可选）
        - meta: 新元数据字典（可选）
    """
    api_logger.info(f"开始处理更新提示词请求: id={prompt_id}")

    try:
        # 提取请求体
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': '请求体不能为空'}), 400

        label = data.get('label', None)
        content = data.get('content', None)
        tags = data.get('tags', None)
        meta = data.get('meta', None)

        # 调用服务层
        updated_prompt = prompt_service.update_prompt(
            prompt_id=prompt_id,
            label=label,
            content=content,
            tags=tags,
            meta=meta
        )

        return jsonify({
            'success': True,
            'prompt': updated_prompt
        })

    except ValueError as e:
        # prompt 不存在
        return jsonify({'success': False, 'error': str(e)}), 404

    except Exception as e:
        log_error("更新提示词失败", str(e), f"prompt_id={prompt_id}")
        return jsonify({'success': False, 'error': str(e)}), 500


@api_bp.route('/prompts/<prompt_id>', methods=['DELETE'])
def delete_prompt(prompt_id):
    """
    删除提示词

    Path 参数：
        - prompt_id: 提示词 ID
    """
    api_logger.info(f"开始处理删除提示词请求: id={prompt_id}")

    try:
        # 调用服务层
        prompt_service.delete_prompt(prompt_id)

        return jsonify({
            'success': True,
            'message': '提示词已删除'
        })

    except ValueError as e:
        # prompt 不存在
        return jsonify({'success': False, 'error': str(e)}), 404

    except Exception as e:
        log_error("删除提示词失败", str(e), f"prompt_id={prompt_id}")
        return jsonify({'success': False, 'error': str(e)}), 500


@api_bp.route('/prompts/<prompt_id>/use', methods=['POST'])
def use_prompt(prompt_id):
    """
    标记提示词已使用（更新使用统计）

    Path 参数：
        - prompt_id: 提示词 ID
    """
    api_logger.info(f"开始处理标记提示词使用请求: id={prompt_id}")

    try:
        # 调用服务层
        updated_prompt = prompt_service.mark_prompt_used(prompt_id)

        return jsonify({
            'success': True,
            'prompt': updated_prompt
        })

    except ValueError as e:
        # prompt 不存在
        return jsonify({'success': False, 'error': str(e)}), 404

    except Exception as e:
        log_error("标记提示词使用失败", str(e), f"prompt_id={prompt_id}")
        return jsonify({'success': False, 'error': str(e)}), 500


@api_bp.route('/tags', methods=['GET'])
def get_tags():
    """
    获取所有标签及其使用次数（从 prompts 聚合）
    """
    api_logger.info("开始处理获取标签列表请求")

    try:
        # 调用服务层
        tags = prompt_service.get_all_tags()

        return jsonify({
            'success': True,
            'tags': tags,
            'count': len(tags)
        })

    except Exception as e:
        log_error("获取标签列表失败", str(e), "")
        return jsonify({'success': False, 'error': str(e)}), 500

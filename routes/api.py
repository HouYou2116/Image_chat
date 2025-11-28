from flask import Blueprint, request, jsonify
from datetime import datetime
from services.image_service import process_image_edit, process_image_generation
from services.logging_config import log_error, api_logger

api_bp = Blueprint('api', __name__, url_prefix='/api')

@api_bp.route('/edit-image', methods=['POST'])
def edit_image():
    """图像编辑功能 - 基于已有图像进行编辑，支持多图合成"""
    start_time = datetime.now()
    api_logger.info("开始处理图像编辑请求")

    try:
        # 1. 提取HTTP参数
        api_key = request.form.get('api_key')
        provider = request.form.get('provider', 'google')
        model = request.form.get('model', 'gemini-2.5-flash-image-preview')
        temperature = float(request.form.get('temperature', 0.7))
        instruction = request.form.get('instruction', '')
        image_count = int(request.form.get('image_count', 1))
        uploaded_files = request.files.getlist('image')

        api_logger.info(f"请求参数: provider={provider}, model={model}, temperature={temperature}")

        # 2. 基础验证：API Key存在性
        if not api_key:
            log_error("参数验证", "缺少API Key", "图像编辑请求缺少api_key参数")
            return jsonify({'error': '请提供API Key'}), 400

        # 3. 调用服务层处理业务逻辑
        result_images = process_image_edit(
            provider_name=provider,
            api_key=api_key,
            model=model,
            temperature=temperature,
            image_count=image_count,
            instruction=instruction,
            uploaded_files=uploaded_files
        )

        # 4. 构建成功响应
        total_duration = (datetime.now() - start_time).total_seconds()
        api_logger.info(f"图像编辑成功完成: 生成{len(result_images)}张图片, 总耗时: {total_duration:.2f}秒")

        return jsonify({
            'success': True,
            'images': result_images,
            'count': len(result_images)
        })

    except ValueError as e:
        # 参数验证错误 (400)
        return jsonify({'error': str(e)}), 400

    except Exception as e:
        # 服务器内部错误 (500)
        total_duration = (datetime.now() - start_time).total_seconds()
        log_error("图像编辑异常", str(e), f"处理耗时: {total_duration:.2f}秒")
        return jsonify({'error': str(e)}), 500

@api_bp.route('/generate-image', methods=['POST'])
def generate_image():
    """图像生成功能 - 根据文本描述生成新图像"""
    start_time = datetime.now()
    api_logger.info("开始处理图像生成请求")

    try:
        # 1. 提取HTTP参数
        api_key = request.form.get('api_key')
        provider = request.form.get('provider', 'google')
        model = request.form.get('model', 'gemini-2.5-flash-image-preview')
        temperature = float(request.form.get('temperature', 0.8))  # 生成模式默认0.8
        description = request.form.get('description', '')
        image_count = int(request.form.get('image_count', 1))

        api_logger.info(f"请求参数: provider={provider}, model={model}, temperature={temperature}")

        # 2. 基础验证：API Key存在性
        if not api_key:
            log_error("参数验证", "缺少API Key", "图像生成请求缺少api_key参数")
            return jsonify({'error': '请提供API Key'}), 400

        # 3. 调用服务层处理业务逻辑
        result_images = process_image_generation(
            provider_name=provider,
            api_key=api_key,
            model=model,
            temperature=temperature,
            image_count=image_count,
            description=description
        )

        # 4. 构建成功响应
        total_duration = (datetime.now() - start_time).total_seconds()
        api_logger.info(f"图像生成成功完成: 生成{len(result_images)}张图片, 总耗时: {total_duration:.2f}秒")

        return jsonify({
            'success': True,
            'images': result_images,
            'count': len(result_images)
        })

    except ValueError as e:
        # 参数验证错误 (400)
        return jsonify({'error': str(e)}), 400

    except Exception as e:
        # 服务器内部错误 (500)
        total_duration = (datetime.now() - start_time).total_seconds()
        log_error("图像生成异常", str(e), f"处理耗时: {total_duration:.2f}秒")
        return jsonify({'error': str(e)}), 500
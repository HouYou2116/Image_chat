from flask import Blueprint, request, jsonify, Response, stream_with_context
from datetime import datetime
import json
from services.image_service import (
    process_image_edit,
    process_image_generation,
    process_image_edit_stream,
    process_image_generation_stream
)
from services.logging_config import log_error, api_logger
from services.config import get_frontend_config, get_default_provider, get_default_model, get_default_temperature

api_bp = Blueprint('api', __name__, url_prefix='/api')

@api_bp.route('/edit-image', methods=['POST'])
def edit_image():
    """图像编辑功能 - 基于已有图像进行编辑，支持多图合成"""
    start_time = datetime.now()
    api_logger.info("开始处理图像编辑请求")

    try:
        # 1. 提取HTTP参数（使用配置中心的默认值）
        api_key = request.form.get('api_key')
        default_provider = get_default_provider()
        provider = request.form.get('provider', default_provider)
        model = request.form.get('model', get_default_model(provider))
        temperature = float(request.form.get('temperature', get_default_temperature('edit')))
        instruction = request.form.get('instruction', '')
        image_count = int(request.form.get('image_count', 1))
        uploaded_files = request.files.getlist('image')

        api_logger.info(f"请求参数: provider={provider}, model={model}, temperature={temperature}")

        # 2. 提取 Google 专用参数
        extra_params = {}
        if provider == 'google':
            aspect_ratio = request.form.get('aspect_ratio')
            resolution = request.form.get('resolution')

            if aspect_ratio:
                extra_params['aspect_ratio'] = aspect_ratio
            if resolution:
                extra_params['resolution'] = resolution

            api_logger.info(f"Google 图像参数: aspect_ratio={aspect_ratio}, resolution={resolution}")

        # 3. 基础验证：API Key存在性
        if not api_key:
            log_error("参数验证", "缺少API Key", "图像编辑请求缺少api_key参数")
            return jsonify({'error': '请提供API Key'}), 400

        # 4. 调用服务层处理业务逻辑
        result_images = process_image_edit(
            provider_name=provider,
            api_key=api_key,
            model=model,
            temperature=temperature,
            image_count=image_count,
            instruction=instruction,
            uploaded_files=uploaded_files,
            **extra_params
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
        return jsonify({'success': False, 'error': str(e)}), 400

    except Exception as e:
        # 服务器内部错误 (500)
        total_duration = (datetime.now() - start_time).total_seconds()
        log_error("图像编辑异常", str(e), f"处理耗时: {total_duration:.2f}秒")
        return jsonify({'success': False, 'error': str(e)}), 500

@api_bp.route('/generate-image', methods=['POST'])
def generate_image():
    """图像生成功能 - 根据文本描述生成新图像"""
    start_time = datetime.now()
    api_logger.info("开始处理图像生成请求")

    try:
        # 1. 提取HTTP参数（使用配置中心的默认值）
        api_key = request.form.get('api_key')
        default_provider = get_default_provider()
        provider = request.form.get('provider', default_provider)
        model = request.form.get('model', get_default_model(provider))
        temperature = float(request.form.get('temperature', get_default_temperature('generate')))
        description = request.form.get('description', '')
        image_count = int(request.form.get('image_count', 1))

        api_logger.info(f"请求参数: provider={provider}, model={model}, temperature={temperature}")

        # 2. 提取 Google 专用参数
        extra_params = {}
        if provider == 'google':
            aspect_ratio = request.form.get('aspect_ratio')
            resolution = request.form.get('resolution')

            if aspect_ratio:
                extra_params['aspect_ratio'] = aspect_ratio
            if resolution:
                extra_params['resolution'] = resolution

            api_logger.info(f"Google 图像参数: aspect_ratio={aspect_ratio}, resolution={resolution}")

        # 3. 基础验证：API Key存在性
        if not api_key:
            log_error("参数验证", "缺少API Key", "图像生成请求缺少api_key参数")
            return jsonify({'error': '请提供API Key'}), 400

        # 4. 调用服务层处理业务逻辑
        result_images = process_image_generation(
            provider_name=provider,
            api_key=api_key,
            model=model,
            temperature=temperature,
            image_count=image_count,
            description=description,
            **extra_params
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
        return jsonify({'success': False, 'error': str(e)}), 400

    except Exception as e:
        # 服务器内部错误 (500)
        total_duration = (datetime.now() - start_time).total_seconds()
        log_error("图像生成异常", str(e), f"处理耗时: {total_duration:.2f}秒")
        return jsonify({'success': False, 'error': str(e)}), 500

@api_bp.route('/config', methods=['GET'])
def get_config():
    """获取前端配置"""
    try:
        config = get_frontend_config()
        return jsonify({'success': True, 'config': config})
    except Exception as e:
        log_error("配置获取失败", str(e), "")
        return jsonify({'success': False, 'error': '配置加载失败'}), 500


@api_bp.route('/edit-image-stream', methods=['POST'])
def edit_image_stream():
    """图像编辑功能 - SSE 流式版本"""
    api_logger.info("开始处理图像编辑流式请求")

    def generate():
        try:
            # 1. 提取HTTP参数（与非流式路由相同）
            api_key = request.form.get('api_key')
            default_provider = get_default_provider()
            provider = request.form.get('provider', default_provider)
            model = request.form.get('model', get_default_model(provider))
            temperature = float(request.form.get('temperature', get_default_temperature('edit')))
            instruction = request.form.get('instruction', '')
            image_count = int(request.form.get('image_count', 1))
            uploaded_files = request.files.getlist('image')

            api_logger.info(f"流式请求参数: provider={provider}, model={model}, temperature={temperature}, image_count={image_count}")

            # 2. 提取 Google 专用参数
            extra_params = {}
            if provider == 'google':
                aspect_ratio = request.form.get('aspect_ratio')
                resolution = request.form.get('resolution')

                if aspect_ratio:
                    extra_params['aspect_ratio'] = aspect_ratio
                if resolution:
                    extra_params['resolution'] = resolution

                api_logger.info(f"Google 图像参数: aspect_ratio={aspect_ratio}, resolution={resolution}")

            # 3. 基础验证：API Key存在性
            if not api_key:
                log_error("参数验证", "缺少API Key", "图像编辑流式请求缺少api_key参数")
                error_data = {'error': '请提供API Key', 'status': 400}
                yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"
                return

            # 4. 调用流式服务层
            for image_dict in process_image_edit_stream(
                provider_name=provider,
                api_key=api_key,
                model=model,
                temperature=temperature,
                image_count=image_count,
                instruction=instruction,
                uploaded_files=uploaded_files,
                **extra_params
            ):
                # 每完成一张图片就发送
                yield f"data: {json.dumps(image_dict, ensure_ascii=False)}\n\n"
                api_logger.info(f"流式发送图片: index={image_dict['index']}, filename={image_dict['filename']}")

            # 5. 发送完成信号
            yield "data: [DONE]\n\n"
            api_logger.info("图像编辑流式请求完成")

        except ValueError as e:
            # 参数验证错误
            api_logger.warning(f"图像编辑流式参数验证失败: {str(e)}")
            error_data = {'error': str(e), 'status': 400}
            yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            # 服务器内部错误
            log_error("图像编辑流式异常", str(e), "")
            error_data = {'error': str(e), 'status': 500}
            yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )


@api_bp.route('/generate-image-stream', methods=['POST'])
def generate_image_stream():
    """图像生成功能 - SSE 流式版本"""
    api_logger.info("开始处理图像生成流式请求")

    def generate():
        try:
            # 1. 提取HTTP参数（与非流式路由相同）
            api_key = request.form.get('api_key')
            default_provider = get_default_provider()
            provider = request.form.get('provider', default_provider)
            model = request.form.get('model', get_default_model(provider))
            temperature = float(request.form.get('temperature', get_default_temperature('generate')))
            description = request.form.get('description', '')
            image_count = int(request.form.get('image_count', 1))

            api_logger.info(f"流式请求参数: provider={provider}, model={model}, temperature={temperature}, image_count={image_count}")

            # 2. 提取 Google 专用参数
            extra_params = {}
            if provider == 'google':
                aspect_ratio = request.form.get('aspect_ratio')
                resolution = request.form.get('resolution')

                if aspect_ratio:
                    extra_params['aspect_ratio'] = aspect_ratio
                if resolution:
                    extra_params['resolution'] = resolution

                api_logger.info(f"Google 图像参数: aspect_ratio={aspect_ratio}, resolution={resolution}")

            # 3. 基础验证：API Key存在性
            if not api_key:
                log_error("参数验证", "缺少API Key", "图像生成流式请求缺少api_key参数")
                error_data = {'error': '请提供API Key', 'status': 400}
                yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"
                return

            # 4. 调用流式服务层
            for image_dict in process_image_generation_stream(
                provider_name=provider,
                api_key=api_key,
                model=model,
                temperature=temperature,
                image_count=image_count,
                description=description,
                **extra_params
            ):
                # 每完成一张图片就发送
                yield f"data: {json.dumps(image_dict, ensure_ascii=False)}\n\n"
                api_logger.info(f"流式发送图片: index={image_dict['index']}, filename={image_dict['filename']}")

            # 5. 发送完成信号
            yield "data: [DONE]\n\n"
            api_logger.info("图像生成流式请求完成")

        except ValueError as e:
            # 参数验证错误
            api_logger.warning(f"图像生成流式参数验证失败: {str(e)}")
            error_data = {'error': str(e), 'status': 400}
            yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            # 服务器内部错误
            log_error("图像生成流式异常", str(e), "")
            error_data = {'error': str(e), 'status': 500}
            yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )
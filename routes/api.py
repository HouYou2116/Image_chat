from flask import Blueprint, request, jsonify
import os
import base64
from datetime import datetime
from services.providers import get_provider
from services.logging_config import (
    log_api_call, log_image_operation, log_error,
    api_logger, image_logger, error_logger
)

api_bp = Blueprint('api', __name__, url_prefix='/api')

@api_bp.route('/edit-image', methods=['POST'])
def edit_image():
    """图像编辑功能 - 基于已有图像进行编辑，支持多图合成"""
    start_time = datetime.now()
    api_logger.info("开始处理图像编辑请求")

    try:
        # 从前端获取所有参数
        api_key = request.form.get('api_key')
        provider = request.form.get('provider', 'google')
        model = request.form.get('model', 'gemini-2.5-flash-image-preview')
        temperature = float(request.form.get('temperature', 0.7))

        api_logger.info(f"请求参数: provider={provider}, model={model}, temperature={temperature}")

        if not api_key:
            log_error("参数验证", "缺少API Key", "图像编辑请求缺少api_key参数")
            return jsonify({'error': '请提供API Key'}), 400

        # 获取上传的文件、指令和生成数量
        files = request.files.getlist('image')
        if not files or len(files) == 0:
            log_error("参数验证", "没有上传图片", "图像编辑请求缺少image文件")
            return jsonify({'error': '没有上传图片'}), 400

        instruction = request.form.get('instruction', '')
        image_count = int(request.form.get('image_count', 1))

        api_logger.info(f"编辑指令长度: {len(instruction)}字符, 生成数量: {image_count}")

        # 验证文件
        valid_files = [f for f in files if f.filename != '']
        if len(valid_files) == 0:
            log_error("文件验证", "没有选择有效文件", "上传的文件列表为空")
            return jsonify({'error': '没有选择有效文件'}), 400

        if not instruction:
            log_error("参数验证", "请输入编辑指令", "instruction参数为空")
            return jsonify({'error': '请输入编辑指令'}), 400

        if image_count < 1 or image_count > 4:
            log_error("参数验证", "图像数量超出范围", f"image_count={image_count}, 允许范围1-4")
            return jsonify({'error': '图像数量必须在1-4之间'}), 400

        # 读取所有图片为二进制数据
        image_bytes_list = []
        total_size = 0
        for file in valid_files:
            image_data = file.read()
            image_bytes_list.append(image_data)
            total_size += len(image_data)
            log_image_operation(f"上传图片", f"文件名: {file.filename}, 大小: {len(image_data)}字节")

        api_logger.info(f"成功读取{len(image_bytes_list)}张图片, 总大小: {total_size}字节")

        # 构造提示
        if len(image_bytes_list) == 1:
            prompt = f"""请根据以下指令编辑这张图片：{instruction}

请直接返回编辑后的图片，不需要任何文字说明。"""
        else:
            prompt = f"""请根据以下指令将这{len(image_bytes_list)}张图片进行编辑或合成：{instruction}

请直接返回编辑/合成后的图片，不需要任何文字说明。"""

        api_logger.info(f"构造编辑提示完成, prompt长度: {len(prompt)}字符")

        # 获取服务商实例并生成图片
        log_api_call(provider, "开始图像编辑", f"模型: {model}, 图片数量: {len(image_bytes_list)}, 生成数量: {image_count}")
        provider_instance = get_provider(provider, api_key)

        api_call_start = datetime.now()
        generated_images = provider_instance.generate(
            prompt=prompt,
            images=image_bytes_list,
            temperature=temperature,
            model=model,
            image_count=image_count
        )
        api_call_duration = (datetime.now() - api_call_start).total_seconds()

        log_api_call(provider, "图像编辑完成", f"生成图片数量: {len(generated_images)}, 耗时: {api_call_duration:.2f}秒")

        # 处理生成的图片
        edited_images = []
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        for i, image_bytes in enumerate(generated_images):
            if image_bytes:
                # 保存图片到本地
                filename = f"edited_{timestamp}_{i+1}.png"
                filepath = os.path.join('output', filename)

                with open(filepath, 'wb') as f:
                    f.write(image_bytes)

                log_image_operation("保存编辑图片", f"文件名: {filename}, 大小: {len(image_bytes)}字节")

                # 转换为base64用于前端显示
                image_data_b64 = base64.b64encode(image_bytes).decode('utf-8')

                edited_images.append({
                    'filename': filename,
                    'download_url': f'/download/{filename}',
                    'image_data': image_data_b64
                })

        total_duration = (datetime.now() - start_time).total_seconds()

        if edited_images:
            api_logger.info(f"图像编辑成功完成: 生成{len(edited_images)}张图片, 总耗时: {total_duration:.2f}秒")
            return jsonify({
                'success': True,
                'images': edited_images,
                'count': len(edited_images)
            })
        else:
            log_error("图像编辑", "生成结果为空", f"API调用完成但未返回有效图片")
            return jsonify({
                'success': False,
                'error': '无法生成编辑后的图片'
            })

    except Exception as e:
        total_duration = (datetime.now() - start_time).total_seconds()
        log_error("图像编辑异常", str(e), f"处理耗时: {total_duration:.2f}秒")
        return jsonify({'error': str(e)}), 500

@api_bp.route('/generate-image', methods=['POST'])
def generate_image():
    """图像生成功能 - 根据文本描述生成新图像"""
    start_time = datetime.now()
    api_logger.info("开始处理图像生成请求")

    try:
        # 从前端获取所有参数
        api_key = request.form.get('api_key')
        provider = request.form.get('provider', 'google')
        model = request.form.get('model', 'gemini-2.5-flash-image-preview')
        temperature = float(request.form.get('temperature', 0.8))

        api_logger.info(f"请求参数: provider={provider}, model={model}, temperature={temperature}")

        if not api_key:
            log_error("参数验证", "缺少API Key", "图像生成请求缺少api_key参数")
            return jsonify({'error': '请提供API Key'}), 400

        # 获取文本描述和生成数量
        description = request.form.get('description', '')
        image_count = int(request.form.get('image_count', 1))

        api_logger.info(f"生成描述长度: {len(description)}字符, 生成数量: {image_count}")

        if not description:
            log_error("参数验证", "请输入图像描述", "description参数为空")
            return jsonify({'error': '请输入图像描述'}), 400

        if image_count < 1 or image_count > 4:
            log_error("参数验证", "图像数量超出范围", f"image_count={image_count}, 允许范围1-4")
            return jsonify({'error': '图像数量必须在1-4之间'}), 400

        # 获取服务商实例并生成图片
        log_api_call(provider, "开始图像生成", f"模型: {model}, 生成数量: {image_count}")
        provider_instance = get_provider(provider, api_key)

        api_call_start = datetime.now()
        generated_images = provider_instance.generate(
            prompt=description,
            images=[],  # 没有上传图片
            temperature=temperature,
            model=model,
            image_count=image_count
        )
        api_call_duration = (datetime.now() - api_call_start).total_seconds()

        log_api_call(provider, "图像生成完成", f"生成图片数量: {len(generated_images)}, 耗时: {api_call_duration:.2f}秒")

        # 处理生成的图片
        result_images = []
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        for i, image_bytes in enumerate(generated_images):
            if image_bytes:
                # 保存图片到本地
                filename = f"generated_{timestamp}_{i+1}.png"
                filepath = os.path.join('output', filename)

                with open(filepath, 'wb') as f:
                    f.write(image_bytes)

                log_image_operation("保存生成图片", f"文件名: {filename}, 大小: {len(image_bytes)}字节")

                # 转换为base64用于前端显示
                image_data_b64 = base64.b64encode(image_bytes).decode('utf-8')

                result_images.append({
                    'filename': filename,
                    'download_url': f'/download/{filename}',
                    'image_data': image_data_b64
                })

        total_duration = (datetime.now() - start_time).total_seconds()

        if result_images:
            api_logger.info(f"图像生成成功完成: 生成{len(result_images)}张图片, 总耗时: {total_duration:.2f}秒")
            return jsonify({
                'success': True,
                'images': result_images,
                'count': len(result_images)
            })
        else:
            log_error("图像生成", "生成结果为空", f"API调用完成但未返回有效图片")
            return jsonify({
                'success': False,
                'error': '无法生成图像'
            })

    except Exception as e:
        total_duration = (datetime.now() - start_time).total_seconds()
        log_error("图像生成异常", str(e), f"处理耗时: {total_duration:.2f}秒")
        return jsonify({'error': str(e)}), 500
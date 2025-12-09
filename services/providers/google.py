from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
from typing import Optional
from .base import ImageProvider
from ..retry_utils import common_retry_strategy
from ..logging_config import log_provider_message, log_api_call, log_error, log_image_operation

class GoogleProvider(ImageProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)

        # 模型能力配置
        self.model_capabilities = {
            'gemini-3-pro-image-preview': {
                'supports_aspect_ratio': True,
                'supports_resolution': True
            },
            'gemini-2.5-flash-image': {
                'supports_aspect_ratio': True,
                'supports_resolution': False
            }
        }

    def generate(self, prompt: str, images: list, temperature: float, model: str, image_count: int, **kwargs) -> list[bytes]:
        """使用Google Gemini生成图像（批量，兼容旧接口）"""
        log_provider_message(
            'google',
            f"开始批量生成: prompt长度={len(prompt)}, 输入图片数量={len(images)}, "
            f"生成数量={image_count}, temperature={temperature}"
        )

        generated_images = []

        for i in range(image_count):
            log_provider_message('google', f"生成第 {i+1}/{image_count} 张图片")

            try:
                image_bytes = self.generate_single(
                    prompt=prompt,
                    images=images,
                    temperature=temperature,
                    model=model,
                    **kwargs
                )
                generated_images.append(image_bytes)
                log_image_operation("图片生成成功", f"第{i+1}张: {len(image_bytes)}字节")

            except Exception as e:
                log_error('单张图片生成失败', str(e), f"第{i+1}张图片")
                continue  # 跳过失败，继续下一张

        # 检查是否所有图片都失败
        if not generated_images:
            error_msg = f"所有 {image_count} 张图片生成均失败，请检查日志"
            log_error('批量生成完全失败', error_msg, f"model={model}")
            raise RuntimeError(error_msg)

        log_provider_message('google', f"批量生成完成: 成功生成 {len(generated_images)} 张图片")
        return generated_images

    @common_retry_strategy
    def generate_single(self, prompt: str, images: list, temperature: float, model: str, image: Optional[bytes] = None, **kwargs) -> bytes:
        """
        生成单张图像（带重试保护）

        Args:
            prompt: 用户指令
            images: 输入图片字节列表
            temperature: 温度参数
            model: 模型名称
            image: 未使用（保留兼容性）
            **kwargs: 支持 aspect_ratio, resolution

        Returns:
            bytes: 单张图片的字节数据

        Raises:
            RuntimeError: 生成失败
        """
        # 提取扩展参数
        aspect_ratio = kwargs.get('aspect_ratio')
        resolution = kwargs.get('resolution')

        log_provider_message(
            'google',
            f"generate_single: model={model}, temperature={temperature}, "
            f"aspect_ratio={aspect_ratio}, resolution={resolution}, 输入图片={len(images)}"
        )

        # 检测模型能力（去掉 "google/" 前缀）
        model_name = model.split('/')[-1] if '/' in model else model
        capabilities = self._get_model_capabilities(model_name)

        # 过滤不支持的参数
        filtered_aspect_ratio = aspect_ratio if capabilities['supports_aspect_ratio'] else None
        filtered_resolution = resolution if capabilities['supports_resolution'] else None

        if aspect_ratio and not filtered_aspect_ratio:
            log_provider_message('google', f"警告: 模型 {model_name} 不支持 aspect_ratio 参数", "WARNING")
        if resolution and not filtered_resolution:
            log_provider_message('google', f"警告: 模型 {model_name} 不支持 resolution 参数", "WARNING")

        # 将二进制图片数据转换为PIL Image对象
        pil_images = []
        for i, img_bytes in enumerate(images):
            if isinstance(img_bytes, bytes):
                pil_image = Image.open(BytesIO(img_bytes))
                pil_images.append(pil_image)
                log_image_operation(f"转换输入图片", f"第{i+1}张: {len(img_bytes)}字节 -> PIL Image")

        # 根据官方示例构建contents参数
        contents = [prompt]

        # 如果有上传的图片，添加到contents中
        for pil_image in pil_images:
            contents.append(pil_image)

        # 构建配置
        config = self._build_generation_config(
            temperature=temperature,
            aspect_ratio=filtered_aspect_ratio,
            resolution=filtered_resolution
        )

        # 调用Google Gemini API（会自动重试）
        log_api_call('google', 'generate_single API调用', f"模型: {model_name}")

        try:
            response = self.client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config
            )
            log_api_call('google', 'API调用成功', f"响应类型: {type(response)}")
        except Exception as e:
            log_error('Google Gemini API错误', str(e), f"模型: {model_name}")
            raise  # 重新抛出，让重试装饰器处理

        # 检查安全拦截（finish_reason）
        if hasattr(response, 'candidates') and response.candidates:
            for candidate in response.candidates:
                # 检查 finish_reason
                if hasattr(candidate, 'finish_reason'):
                    finish_reason = str(candidate.finish_reason)

                    # 定义不可重试的 finish_reason
                    safety_reasons = [
                        'SAFETY',           # 安全过滤
                        'BLOCKLIST',        # 黑名单
                        'PROHIBITED_CONTENT',  # 禁止内容
                        'RECITATION',       # 版权内容
                        'HARMFUL_CATEGORY'  # 有害内容
                    ]

                    if any(reason in finish_reason.upper() for reason in safety_reasons):
                        error_msg = f"内容被安全机制拦截: {finish_reason}"
                        log_error('安全拦截', finish_reason, f"模型: {model_name}")
                        raise ValueError(error_msg)

        # 提取图片数据
        if hasattr(response, 'candidates') and response.candidates:
            for candidate in response.candidates:
                if hasattr(candidate, 'content') and candidate.content.parts:
                    for part in candidate.content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data is not None:
                            image_bytes = part.inline_data.data
                            log_image_operation("生成图片成功", f"{len(image_bytes)}字节")
                            return image_bytes

        # 未找到图片数据（有响应但无图片，通常是内容问题）
        error_msg = "响应中未找到图片数据"
        log_error('图片提取失败', error_msg, f"响应: {response}")
        raise ValueError(error_msg)

    def _get_model_capabilities(self, model_name: str) -> dict:
        """获取模型能力配置"""
        # 移除可能的版本号后缀
        base_model = model_name.split(':')[0]

        # 默认能力（Flash 模型）
        default_capabilities = {
            'supports_aspect_ratio': True,
            'supports_resolution': False
        }

        return self.model_capabilities.get(base_model, default_capabilities)

    def _build_generation_config(self, temperature: float,
                                  aspect_ratio: str = None,
                                  resolution: str = None) -> types.GenerateContentConfig:
        """
        构建生成配置

        Args:
            temperature: 温度参数
            aspect_ratio: 宽高比（可选）
            resolution: 分辨率（可选）

        Returns:
            GenerateContentConfig 对象
        """
        # 基础配置
        config_params = {'temperature': temperature}

        # 构建 image_config（仅在有参数时）
        if aspect_ratio or resolution:
            image_config_params = {}

            if aspect_ratio:
                image_config_params['aspect_ratio'] = aspect_ratio
                log_provider_message('google', f"设置宽高比: {aspect_ratio}")

            if resolution:
                # 注意：API 参数名是 image_size，不是 resolution
                image_config_params['image_size'] = resolution
                log_provider_message('google', f"设置分辨率: {resolution}")

            config_params['image_config'] = types.ImageConfig(**image_config_params)

        return types.GenerateContentConfig(**config_params)

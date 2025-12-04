from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
from .base import ImageProvider
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
        """使用Google Gemini生成图像"""
        generated_images = []

        # 提取扩展参数
        aspect_ratio = kwargs.get('aspect_ratio')
        resolution = kwargs.get('resolution')

        log_provider_message('google', f"开始图像生成任务: prompt长度={len(prompt)}, 输入图片数量={len(images)}, 生成数量={image_count}, temperature={temperature}, aspect_ratio={aspect_ratio}, resolution={resolution}")

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

        for i in range(image_count):
            log_provider_message('google', f"生成第 {i+1}/{image_count} 张图片")

            # 根据官方示例构建contents参数
            contents = [prompt]

            # 如果有上传的图片，添加到contents中
            for pil_image in pil_images:
                contents.append(pil_image)

            # 调用Google Gemini API（按照官方示例）
            # 使用处理过的前缀去除后的 model_name
            gemini_model = model_name
            log_provider_message('google', f"使用Google Gemini模型: {gemini_model}")

            try:
                log_api_call('google', 'API调用开始', f"模型: {gemini_model}, 内容长度: {len(str(contents))}")

                # 构建配置
                config = self._build_generation_config(
                    temperature=temperature,
                    aspect_ratio=filtered_aspect_ratio,
                    resolution=filtered_resolution
                )

                response = self.client.models.generate_content(
                    model=gemini_model,
                    contents=contents,
                    config=config
                )
                log_api_call('google', 'API调用成功', f"响应类型: {type(response)}")
            except Exception as e:
                log_error('Google Gemini API错误', str(e), f"模型: {gemini_model}, 内容类型: {[type(item) for item in contents]}")
                raise

            if hasattr(response, 'candidates') and response.candidates:
                log_provider_message('google', f"响应包含 {len(response.candidates)} 个候选结果")
                for j, candidate in enumerate(response.candidates):
                    if hasattr(candidate, 'content') and candidate.content.parts:
                        log_provider_message('google', f"候选结果 {j+1} 包含 {len(candidate.content.parts)} 个内容部分")
                        for k, part in enumerate(candidate.content.parts):
                            if hasattr(part, 'inline_data') and part.inline_data is not None:
                                image_bytes = part.inline_data.data
                                generated_images.append(image_bytes)
                                log_image_operation("生成图片成功", f"第{i+1}张图片: {len(image_bytes)}字节")
                                break
                            else:
                                log_provider_message('google', f"内容部分 {k+1} 不包含图片数据")
                    else:
                        log_provider_message('google', f"候选结果 {j+1} 不包含有效内容")
            else:
                log_provider_message('google', "响应不包含候选结果", "WARNING")

        log_provider_message('google', f"Google Gemini生成完成: 成功生成 {len(generated_images)} 张图片")
        return generated_images

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

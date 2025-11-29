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

    def generate(self, prompt: str, images: list, temperature: float, model: str, image_count: int) -> list[bytes]:
        """使用Google Gemini生成图像"""
        generated_images = []

        log_provider_message('google', f"开始图像生成任务: prompt长度={len(prompt)}, 输入图片数量={len(images)}, 生成数量={image_count}, temperature={temperature}")

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
            # 使用传入的 model 参数
            gemini_model = model
            log_provider_message('google', f"使用Google Gemini模型: {gemini_model}")

            try:
                log_api_call('google', 'API调用开始', f"模型: {gemini_model}, 内容长度: {len(str(contents))}")
                response = self.client.models.generate_content(
                    model=gemini_model,
                    contents=contents,
                    config=types.GenerateContentConfig(temperature=temperature)
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
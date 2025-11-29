import base64
import json
import re
import requests
from openai import OpenAI
from PIL import Image
from io import BytesIO
from .base import ImageProvider
from ..logging_config import log_provider_message, log_api_call, log_error, log_image_operation
from ..config import get_provider_base_url

class TuziProvider(ImageProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = get_provider_base_url('tuzi')
        self.client = OpenAI(
            api_key=api_key,
            base_url=self.base_url
        )

    def generate(self, prompt: str, images: list, temperature: float, model: str, image_count: int) -> list[bytes]:
        """使用兔子API生成图像"""
        generated_images = []

        log_provider_message('tuzi', f"开始图像生成任务: prompt长度={len(prompt)}, 输入图片数量={len(images)}, 生成数量={image_count}, temperature={temperature}")

        for i in range(image_count):
            log_provider_message('tuzi', f"生成第 {i+1}/{image_count} 张图片")
            try:
                # 优先使用chat completions方式，因为images API不支持temperature参数
                log_api_call('tuzi', '尝试chat completions方式', f"支持temperature参数: {temperature}")
                image_bytes = self._try_chat_completions(prompt, images, temperature, model)
                if image_bytes:
                    generated_images.append(image_bytes)
                    log_image_operation("TuZi生成图片", f"第{i+1}张图片成功生成: {len(image_bytes)}字节")
                else:
                    raise Exception("生成的图片数据为空")

            except Exception as e:
                log_error('TuZi API调用错误', str(e), f"第{i+1}张图片生成失败")
                # 如果chat completions失败，尝试使用简化的images API（无temperature）
                try:
                    log_api_call('tuzi', '尝试备用images API', "不支持temperature参数")
                    image_bytes = self._try_images_api(prompt, images, model)
                    if image_bytes:
                        generated_images.append(image_bytes)
                        log_image_operation("TuZi备用API生成图片", f"第{i+1}张图片成功生成: {len(image_bytes)}字节")
                    else:
                        raise e  # 重新抛出原始错误
                except Exception as e2:
                    log_error('TuZi备用API也失败', str(e2), f"第{i+1}张图片备用API也失败")
                    raise e

        log_provider_message('tuzi', f"TuZi生成完成: 成功生成 {len(generated_images)} 张图片")
        return generated_images

    def _try_images_api(self, prompt: str, images: list, model: str) -> bytes:
        """使用OpenAI Images API生成图像（无temperature参数）"""
        try:
            if images:  # 编辑模式
                log_provider_message('tuzi', f"使用Images API编辑模式", f"编辑图片数量: {len(images)}")
                # 将第一张图片作为主图进行编辑
                image_bytes = images[0]

                # 将二进制数据转换为BytesIO对象
                image_buffer = BytesIO(image_bytes)
                log_image_operation("准备编辑图片", f"转换为BytesIO: {len(image_bytes)}字节")

                # OpenAI Images API需要BytesIO或文件路径，不能直接使用PIL Image
                log_api_call('tuzi', '调用images.edit API', f"模型: {model}")
                result = self.client.images.edit(
                    model=model,
                    image=image_buffer,  # 使用BytesIO而不是PIL Image
                    prompt=prompt,
                    n=1,
                    response_format="b64_json"
                )
            else:  # 生成模式
                log_provider_message('tuzi', "使用Images API生成模式", "从文本生成新图片")
                log_api_call('tuzi', '调用images.generate API', f"模型: {model}")
                result = self.client.images.generate(
                    model=model,
                    prompt=prompt,
                    n=1,
                    response_format="b64_json"
                )

            # 提取base64图片数据
            if result.data and len(result.data) > 0 and result.data[0].b64_json:
                decoded_image = base64.b64decode(result.data[0].b64_json)
                log_image_operation("Images API成功", f"从base64解码图片: {len(decoded_image)}字节")
                return decoded_image
            elif result.data and len(result.data) > 0 and result.data[0].url:
                # 如果返回的是URL，下载图片
                image_url = result.data[0].url
                log_provider_message('tuzi', f"Images API返回URL，开始下载: {image_url[:50]}...")
                response = requests.get(image_url)
                if response.status_code == 200:
                    log_image_operation("URL下载成功", f"从URL下载图片: {len(response.content)}字节")
                    return response.content

            return None

        except Exception as e:
            log_error('Images API调用失败', str(e), f"模型: {model}")
            return None

    def _try_chat_completions(self, prompt: str, images: list, temperature: float, model: str) -> bytes:
        """使用chat completions方式生成图像（改进版）"""
        log_provider_message('tuzi', f"开始chat completions方式", f"模型: {model}, temperature: {temperature}, 输入图片: {len(images)}")

        # 构建消息内容
        content = [{"type": "text", "text": prompt}]

        # 如果有图片，添加到内容中
        for i, img_data in enumerate(images):
            if isinstance(img_data, bytes):
                img_b64 = base64.b64encode(img_data).decode('utf-8')
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
                })
                log_image_operation("添加输入图片", f"第{i+1}张: {len(img_data)}字节 -> base64")

        try:
            # 首先尝试非流式响应
            log_api_call('tuzi', '调用chat completions (非流式)', f"模型: {model}")
            response = self.client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": content}],
                temperature=temperature
            )

            full_content = ""
            if response.choices and len(response.choices) > 0:
                message = response.choices[0].message
                if message.content:
                    full_content = message.content
                    log_provider_message('tuzi', f"非流式响应获取成功", f"内容长度: {len(full_content)}字符")

            # 如果非流式没有获取到内容，尝试流式响应
            if not full_content:
                log_provider_message('tuzi', "非流式响应为空，尝试流式响应", "WARNING")
                log_api_call('tuzi', '调用chat completions (流式)', f"模型: {model}")
                response = self.client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": content}],
                    temperature=temperature,
                    stream=True
                )

                # 处理流式响应
                chunk_count = 0
                for chunk in response:
                    if chunk.choices and len(chunk.choices) > 0:
                        delta = chunk.choices[0].delta
                        if delta.content:
                            full_content += delta.content
                            chunk_count += 1

                log_provider_message('tuzi', f"流式响应处理完成", f"接收了{chunk_count}个chunk，总长度: {len(full_content)}字符")

            # 改进的图片数据提取逻辑
            return self._extract_image_data(full_content)

        except Exception as e:
            log_error('Chat completions调用失败', str(e), f"模型: {model}, temperature: {temperature}")
            raise

    def _extract_and_download_urls(self, content: str) -> bytes:
        """统一的URL提取和下载函数"""

        # 添加调试信息 - 这个格式匹配problems.md中的日志
        log_provider_message('tuzi', "正在检测图片URL...")
        log_provider_message('tuzi', f"分析响应内容: {content[:200]}...")

        # 1. Markdown模式（最可靠）
        markdown_pattern = r'!\[.*?\]\((https?://[^\s)]+)\)'
        markdown_matches = re.findall(markdown_pattern, content)

        # 2. 改进的HTTP模式 - 更宽松的匹配
        http_pattern = r'https?://[^\s)]*\.(?:jpg|jpeg|png|gif|webp)(?:[^\s)]*)'
        http_matches = re.findall(http_pattern, content, re.IGNORECASE)

        # 合并所有URL，去重并保持顺序
        seen = set()
        all_urls = []
        for url in markdown_matches + http_matches:
            if url not in seen:
                seen.add(url)
                all_urls.append(url)

        # 这个格式完全匹配problems.md中的日志格式
        log_provider_message('tuzi', f"找到 {len(all_urls)} 个图片URL: {[url[:50] + '...' for url in all_urls]}")
        log_provider_message('tuzi', f"Markdown模式: {len(markdown_matches)} 个, HTTP模式: {len(http_matches)} 个")

        for url in all_urls:
            try:
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    log_provider_message('tuzi', f"成功下载图片: {url[:50]}...")
                    log_image_operation("URL图片下载", f"从URL成功下载: {len(response.content)}字节")
                    return response.content
                else:
                    log_error("HTTP错误", f"状态码 {response.status_code}", f"URL: {url[:50]}...")
            except Exception as e:
                log_error('下载图片失败', str(e), f"URL: {url[:50]}...")
                continue

        return None

    def _extract_image_data(self, content: str) -> bytes:
        """从响应内容中提取图片数据（改进版）"""
        if not content:
            raise ValueError("响应内容为空")

        log_provider_message('tuzi', f"分析响应内容: {content[:200]}...")

        def safe_base64_decode(data_str):
            """安全的base64解码，处理padding和无效字符"""
            try:
                data_str = data_str.strip()
                missing_padding = len(data_str) % 4
                if missing_padding:
                    data_str += '=' * (4 - missing_padding)
                return base64.b64decode(data_str)
            except Exception as e:
                log_error('base64解码错误', str(e), f"数据前50字符: {data_str[:50]}")
                return None

        # 1. 尝试直接解析JSON格式的响应
        try:
            content_data = json.loads(content)
            log_provider_message('tuzi', f"解析后的JSON内容类型: {type(content_data)}")

            # 处理不同的JSON结构
            if isinstance(content_data, list):
                for item in content_data:
                    if isinstance(item, dict):
                        if 'type' in item and item['type'] == 'image' and 'data' in item:
                            image_bytes = safe_base64_decode(item['data'])
                            if image_bytes:
                                log_image_operation("JSON提取图片", f"从JSON列表成功提取: {len(image_bytes)}字节")
                                return image_bytes
            elif isinstance(content_data, dict):
                if 'image' in content_data:
                    image_bytes = safe_base64_decode(content_data['image'])
                    if image_bytes:
                        log_image_operation("JSON提取图片", f"从JSON字典image字段成功提取: {len(image_bytes)}字节")
                        return image_bytes
                elif 'data' in content_data:
                    image_bytes = safe_base64_decode(content_data['data'])
                    if image_bytes:
                        log_image_operation("JSON提取图片", f"从JSON字典data字段成功提取: {len(image_bytes)}字节")
                        return image_bytes
        except json.JSONDecodeError:
            log_provider_message('tuzi', "不是有效的JSON格式，尝试其他解析方式", "WARNING")

        # 2. 统一的URL检测和下载
        image_bytes = self._extract_and_download_urls(content)
        if image_bytes:
            return image_bytes

        # 3. 检查是否是data URL格式
        data_url_pattern = r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)'
        match = re.search(data_url_pattern, content)
        if match:
            image_bytes = safe_base64_decode(match.group(1))
            if image_bytes:
                return image_bytes

        # 3. 查找各种可能的base64图片格式
        patterns = [
            r'"data":\s*"([A-Za-z0-9+/=]+)"',  # JSON中的data字段
            r'"image":\s*"([A-Za-z0-9+/=]+)"',  # JSON中的image字段
            r'```\s*([A-Za-z0-9+/=\s]+)\s*```',  # 代码块中的base64
            r'([A-Za-z0-9+/]{100,}={0,2})',  # 长的base64字符串
        ]

        for pattern in patterns:
            matches = re.findall(pattern, content, re.DOTALL)
            for match in matches:
                clean_match = re.sub(r'\s+', '', match)
                if len(clean_match) > 100:
                    image_bytes = safe_base64_decode(clean_match)
                    if image_bytes:
                        return image_bytes

        raise ValueError("无法从响应中提取图片数据")
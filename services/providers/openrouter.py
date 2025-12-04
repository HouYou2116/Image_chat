import os
import base64
import json
import requests
import re
import time
from openai import OpenAI
from .base import ImageProvider
from ..logging_config import log_provider_message, log_api_call, log_error, log_image_operation


class OpenRouterProvider(ImageProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        # Headers 支持环境变量配置
        referer = os.getenv('OPENROUTER_REFERER', 'http://localhost:5000')
        title = os.getenv('OPENROUTER_TITLE', 'Image CHAT')

        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            default_headers={
                "HTTP-Referer": referer,
                "X-Title": title
            }
        )

    def generate(self, prompt: str, images: list, temperature: float, model: str, image_count: int, **kwargs) -> list[bytes]:
        """使用OpenRouter生成图像（忽略 kwargs 中的额外参数）"""
        generated_images = []

        log_provider_message('openrouter', f"开始图像生成任务: prompt长度={len(prompt)}, 输入图片数量={len(images)}, 生成数量={image_count}, temperature={temperature}")

        # OpenRouter的单次API调用只能生成一张图片，需要多次调用
        for i in range(image_count):
            log_provider_message('openrouter', f"生成第 {i+1}/{image_count} 张图片...")

            # 构建消息内容
            content = [{"type": "text", "text": prompt}]

            # 如果有上传的图片，添加到消息中
            if images:
                for j, img_data in enumerate(images):
                    if isinstance(img_data, bytes):
                        # 将二进制图片数据转换为base64
                        img_b64 = base64.b64encode(img_data).decode('utf-8')
                        content.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
                        })
                        log_image_operation("转换输入图片", f"第{j+1}张: {len(img_data)}字节 -> base64")

            try:
                # 调用 OpenAI SDK
                log_api_call('openrouter', 'API调用开始', f"模型: {model}")
                response = self.client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": content}],
                    temperature=temperature,
                    extra_body={"modalities": ["image", "text"]}  # 关键参数
                )
                log_api_call('openrouter', 'API调用成功', f"响应类型: {type(response)}")

                # ✅ 智能日志：输出响应（自动截断超长字符串）
                log_provider_message('openrouter', f"OpenRouter Response: {self._truncate_logs(response.model_dump())}")

                # 提取图片数据
                if response.choices and len(response.choices) > 0:
                    message = response.choices[0].message

                    try:
                        # ✅ 使用新的统一提取方法（支持所有字段）
                        image_bytes = self._extract_image_data_from_message(message)

                        if image_bytes:
                            generated_images.append(image_bytes)
                            log_provider_message('openrouter', f"第 {i+1} 张图片生成成功: {len(image_bytes)}字节")
                        else:
                            log_error('图片提取失败', '所有提取方法均失败',
                                     f"message 完整信息: {message.model_dump_json()[:500]}")
                    except ValueError as e:
                        # 模型拒绝生成（来自 refusal 检查）
                        log_error('模型拒绝生成', str(e), f"第{i+1}张图片")
                        raise  # 重新抛出，让上层处理
                else:
                    log_provider_message('openrouter', "响应不包含有效选择", "WARNING")

            except Exception as e:
                log_error('OpenRouter API调用失败', str(e), f"模型: {model}, 第{i+1}张图片")
                raise

            # 如果不是最后一次请求，稍微延迟避免频率限制
            if i < image_count - 1:
                log_provider_message('openrouter', "延迟0.5秒避免频率限制")
                time.sleep(0.5)

        log_provider_message('openrouter', f"OpenRouter生成完成: 成功生成 {len(generated_images)} 张图片")
        return generated_images

    def _truncate_logs(self, data):
        """
        递归截断字典中的长字符串，避免日志刷屏

        Args:
            data: 任意类型的数据（字典/列表/字符串等）

        Returns:
            处理后的数据（超过500字符的字符串被截断）
        """
        if isinstance(data, dict):
            return {key: self._truncate_logs(value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self._truncate_logs(item) for item in data]
        elif isinstance(data, str):
            if len(data) > 500:
                return f"<Long string (len={len(data)})...truncated>"
            return data
        else:
            return data

    def _extract_image_data_from_message(self, message) -> bytes:
        """
        从 ChatCompletionMessage 对象中提取图像数据（全格式兼容）

        检查顺序（优先级递减）：
        0. Deep Search - 递归暴力搜索（新增）
        1. message.refusal - 检查是否被拒绝
        2. message.images - OpenRouter 扩展字段（最常见）
        3. message.tool_calls - 工具调用附件
        4. message.content - Markdown/URL/Base64

        Returns:
            bytes: 图像二进制数据

        Raises:
            ValueError: 模型拒绝生成
        """

        # ========== 最高优先级: Deep Search 暴力提取 ==========
        log_provider_message('openrouter', "开始 Deep Search 递归搜索...")
        image_bytes = self._find_image_in_payload(message.model_dump())
        if image_bytes:
            log_provider_message('openrouter', f"Deep Search 成功提取图片: {len(image_bytes)}字节")
            return image_bytes
        log_provider_message('openrouter', "Deep Search 未找到图片，使用 fallback 逻辑")

        # ========== 情况 D: Refusal 检查 ==========
        if hasattr(message, 'refusal') and message.refusal:
            error_msg = f"模型拒绝生成: {message.refusal}"
            log_error('模型拒绝', message.refusal, "OpenRouter 模型明确拒绝此请求")
            raise ValueError(error_msg)

        # ========== 情况 A: message.images 字段（OpenRouter 官方格式） ==========
        if hasattr(message, 'images') and message.images:
            log_provider_message('openrouter', f"检测到 message.images 字段: {len(message.images)} 张图片")

            for idx, image_item in enumerate(message.images):
                # OpenRouter 格式: "data:image/png;base64,iVBOR..."
                if isinstance(image_item, str) and image_item.startswith('data:image/'):
                    log_provider_message('openrouter', f"解析第 {idx+1} 张图片 (data URL 格式)")

                    # 提取 base64 部分
                    data_url_pattern = r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)'
                    match = re.search(data_url_pattern, image_item)
                    if match:
                        image_bytes = self._safe_base64_decode(match.group(1))
                        if image_bytes:
                            log_image_operation("message.images 提取成功",
                                              f"{len(image_bytes)}字节 (data URL)")
                            return image_bytes

                # 备选：直接 base64 字符串
                elif isinstance(image_item, str):
                    image_bytes = self._safe_base64_decode(image_item)
                    if image_bytes:
                        log_image_operation("message.images 提取成功",
                                          f"{len(image_bytes)}字节 (纯 base64)")
                        return image_bytes

        # ========== 情况 C: message.tool_calls 检查 ==========
        if hasattr(message, 'tool_calls') and message.tool_calls:
            log_provider_message('openrouter', f"检测到 message.tool_calls: {len(message.tool_calls)} 个调用")

            for tool_call in message.tool_calls:
                # 检查工具调用的参数
                if hasattr(tool_call, 'function') and hasattr(tool_call.function, 'arguments'):
                    try:
                        args = json.loads(tool_call.function.arguments)

                        # 尝试从常见字段提取图像
                        for key in ['image', 'data', 'b64_json', 'image_data']:
                            if key in args and args[key]:
                                image_bytes = self._safe_base64_decode(args[key])
                                if image_bytes:
                                    log_image_operation("tool_calls 提取成功",
                                                      f"{len(image_bytes)}字节 (工具调用)")
                                    return image_bytes
                    except json.JSONDecodeError:
                        continue

        # ========== 情况 B: message.content 检查（现有逻辑） ==========
        if hasattr(message, 'content') and message.content:
            log_provider_message('openrouter', f"检查 message.content 字段: {len(message.content)}字符")
            return self._extract_image_data_from_content(message.content)

        # 所有方法都失败，抛出异常
        truncated_response = self._truncate_logs(message.model_dump())
        log_error('图像提取完全失败', '所有提取方法均失败', f"响应: {truncated_response}")
        raise RuntimeError(f"无法从响应中提取图片数据。响应摘要: {str(truncated_response)[:300]}")

    def _extract_image_data_from_content(self, content: str) -> bytes:
        """从 message.content 字符串中提取图片数据（瀑布流式提取）"""
        if not content:
            log_provider_message('openrouter', "响应内容为空", "WARNING")
            return None

        log_provider_message('openrouter', f"开始提取图片数据: {content[:200]}...")

        # Step 1: Markdown 图片链接
        markdown_pattern = r'!\[.*?\]\((https?://[^\s)]+)\)'
        markdown_matches = re.findall(markdown_pattern, content)
        if markdown_matches:
            log_provider_message('openrouter', f"找到 Markdown 图片链接: {len(markdown_matches)} 个")
            for url in markdown_matches:
                image_bytes = self._download_image(url)
                if image_bytes:
                    return image_bytes

        # Step 2: Plain URL
        url_pattern = r'https?://[^\s]*\.(png|jpg|jpeg|webp|gif)(?:\?[^\s]*)?'
        url_matches = re.findall(url_pattern, content, re.IGNORECASE)
        if url_matches:
            log_provider_message('openrouter', f"找到纯图片 URL: {len(url_matches)} 个")
            for match in url_matches:
                # match 是 tuple (url, extension)，需要重构完整URL
                url = re.search(url_pattern, content, re.IGNORECASE).group(0)
                image_bytes = self._download_image(url)
                if image_bytes:
                    return image_bytes

        # Step 3: JSON/Base64
        try:
            content_data = json.loads(content)
            log_provider_message('openrouter', "检测到 JSON 格式内容")

            # 处理字典格式
            if isinstance(content_data, dict):
                for key in ['image', 'data', 'b64_json']:
                    if key in content_data and content_data[key]:
                        image_bytes = self._safe_base64_decode(content_data[key])
                        if image_bytes:
                            log_image_operation("JSON提取图片", f"从JSON字典{key}字段成功提取: {len(image_bytes)}字节")
                            return image_bytes

            # 处理列表格式
            elif isinstance(content_data, list):
                for item in content_data:
                    if isinstance(item, dict):
                        if item.get('type') == 'image' and 'data' in item:
                            image_bytes = self._safe_base64_decode(item['data'])
                            if image_bytes:
                                log_image_operation("JSON提取图片", f"从JSON列表成功提取: {len(image_bytes)}字节")
                                return image_bytes

        except json.JSONDecodeError:
            log_provider_message('openrouter', "不是有效的JSON格式，继续尝试其他方式", "WARNING")

        # Step 4: data URL 格式
        data_url_pattern = r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)'
        data_url_match = re.search(data_url_pattern, content)
        if data_url_match:
            log_provider_message('openrouter', "找到 data URL 格式")
            image_bytes = self._safe_base64_decode(data_url_match.group(1))
            if image_bytes:
                log_image_operation("data URL提取图片", f"成功提取: {len(image_bytes)}字节")
                return image_bytes

        log_error('图片数据提取失败', '所有提取方法均失败', f"内容前200字符: {content[:200]}")
        return None

    def _find_image_in_payload(self, data) -> bytes:
        """
        递归搜索响应数据中的图片（暴力提取）

        Args:
            data: 任意类型的数据（字典/列表/字符串等）

        Returns:
            bytes: 图片二进制数据，未找到返回 None
        """
        # 快速路径：优先检查常见的结构化图片字段
        if isinstance(data, dict):
            # Priority 0: 检查 images 字段（最常见）
            if 'images' in data and data['images']:
                log_provider_message('openrouter', "Deep Search: 找到 'images' 字段，优先检查")
                result = self._find_image_in_payload(data['images'])
                if result:
                    return result

            # Priority 1: 检查 tool_calls
            if 'tool_calls' in data and data['tool_calls']:
                log_provider_message('openrouter', "Deep Search: 找到 'tool_calls' 字段，优先检查")
                result = self._find_image_in_payload(data['tool_calls'])
                if result:
                    return result

            # Priority 2: 检查 b64_json
            if 'b64_json' in data and isinstance(data['b64_json'], str):
                log_provider_message('openrouter', "Deep Search: 找到 'b64_json' 字段")
                image_bytes = self._safe_base64_decode(data['b64_json'])
                if image_bytes and self._is_valid_image(image_bytes):
                    return image_bytes

        # 处理字典
        if isinstance(data, dict):
            # 优先检查特定的 url 字段（Target 3）
            if 'url' in data and isinstance(data['url'], str):
                url = data['url']
                if url.startswith('http') and re.search(r'\.(png|jpg|jpeg|webp|gif)($|\?)', url, re.IGNORECASE):
                    log_provider_message('openrouter', f"Deep Search: 找到图片 URL: {url[:80]}")
                    image_bytes = self._download_image(url)
                    if image_bytes:
                        return image_bytes

            # 递归检查所有值（跳过黑名单字段）
            # 黑名单：跳过非图片数据字段
            BLACKLIST_KEYS = {
                'reasoning', 'reasoning_details',
                'usage', 'prompt_tokens_details',
                'annotations'
            }

            for key, value in data.items():
                if key in BLACKLIST_KEYS:
                    log_provider_message('openrouter', f"Deep Search: 跳过黑名单字段 '{key}'")
                    continue
                result = self._find_image_in_payload(value)
                if result:
                    return result

        # 处理列表
        elif isinstance(data, list):
            for item in data:
                result = self._find_image_in_payload(item)
                if result:
                    return result

        # 处理字符串
        elif isinstance(data, str):
            # Target 1: data:image 开头的 Data URL
            if data.startswith('data:image'):
                log_provider_message('openrouter', "Deep Search: 找到 data:image URL")
                match = re.search(r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)', data)
                if match:
                    image_bytes = self._safe_base64_decode(match.group(1))
                    if image_bytes:
                        return image_bytes

            # Target 2: 疑似 Raw Base64（长度 >5000 且不含空格）
            elif len(data) > 5000 and ' ' not in data:
                log_provider_message('openrouter', f"Deep Search: 检测到疑似 Raw Base64 (len={len(data)})")
                image_bytes = self._safe_base64_decode(data)
                # 验证解码结果是否为有效图片（文件头魔数校验）
                if image_bytes and self._is_valid_image(image_bytes):
                    log_provider_message('openrouter', f"Deep Search: Raw Base64 解码并验证成功: {len(image_bytes)}字节")
                    return image_bytes
                else:
                    log_provider_message('openrouter', "Deep Search: Raw Base64 解码后文件头验证失败，跳过", "WARNING")

        return None

    def _is_valid_image(self, data: bytes) -> bool:
        """
        验证字节数据是否为有效图片（通过文件头魔数）

        Args:
            data: 解码后的二进制数据

        Returns:
            bool: 是否为有效图片格式
        """
        if not data or len(data) < 8:
            return False

        # 检查常见图片格式的魔数（文件头）
        # PNG: \x89PNG
        if data[:4] == b'\x89PNG':
            log_provider_message('openrouter', "文件头验证: PNG 格式")
            return True

        # JPEG: \xff\xd8\xff
        if data[:3] == b'\xff\xd8\xff':
            log_provider_message('openrouter', "文件头验证: JPEG 格式")
            return True

        # WEBP: RIFF....WEBP
        if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            log_provider_message('openrouter', "文件头验证: WEBP 格式")
            return True

        # GIF: GIF87a 或 GIF89a
        if data[:6] in (b'GIF87a', b'GIF89a'):
            log_provider_message('openrouter', "文件头验证: GIF 格式")
            return True

        log_provider_message('openrouter', f"文件头验证失败: 前8字节 = {data[:8]}", "WARNING")
        return False

    def _download_image(self, url: str) -> bytes:
        """从 URL 下载图片"""
        try:
            log_provider_message('openrouter', f"开始下载图片: {url[:80]}...")
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                log_image_operation("URL下载成功", f"从URL成功下载: {len(response.content)}字节")
                return response.content
            else:
                log_error('HTTP错误', f"状态码 {response.status_code}", f"URL: {url[:80]}")
        except Exception as e:
            log_error('下载图片失败', str(e), f"URL: {url[:80]}")
        return None

    def _safe_base64_decode(self, data_str: str) -> bytes:
        """安全的base64解码，处理padding和无效字符"""
        try:
            data_str = data_str.strip()
            # 确保正确的padding
            missing_padding = len(data_str) % 4
            if missing_padding:
                data_str += '=' * (4 - missing_padding)
            decoded = base64.b64decode(data_str)
            return decoded
        except Exception as e:
            log_error('base64解码错误', str(e), f"数据前50字符: {data_str[:50]}")
            return None

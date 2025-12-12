"""
Tuzi API Provider for Image Generation and Editing

This provider uses OpenAI-compatible Chat Completions API with
advanced Deep Search parsing for robust image data extraction.

Key Features:
- Chat Completions API only (no Images API backup)
- Deep Search recursive payload parsing
- File header validation (magic number check)
- Markdown/URL/Base64 format support
- Content moderation refusal detection
- Streaming and non-streaming support

Author: Image Chat Team
Last Updated: 2025-11-30
"""

import base64
import json
import re
import time
import requests
from typing import Optional
from openai import OpenAI
from .base import ImageProvider
from ..retry_utils import common_retry_strategy
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

    def generate(self, prompt: str, images: list, temperature: float,
                 model: str, image_count: int, **kwargs) -> list[bytes]:
        """
        使用 Tuzi API 生成图像（批量，兼容旧接口）

        Args:
            prompt: 用户指令
            images: 输入图片字节列表
            temperature: 0-1 的浮点数
            model: 模型 ID
            image_count: 生成图片数量（1-4）

        Returns:
            list[bytes]: 图片二进制数据列表

        Raises:
            RuntimeError: 所有图片生成均失败
        """
        log_provider_message('tuzi',
            f"开始批量生成: prompt长度={len(prompt)}, 输入图片={len(images)}, "
            f"数量={image_count}, temperature={temperature}")

        generated_images = []

        for i in range(image_count):
            log_provider_message('tuzi', f"生成第 {i+1}/{image_count} 张图片")

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
                log_error('Tuzi生成失败', str(e), f"第{i+1}张图片")
                continue  # 跳过失败，继续下一张

            # 速率限制
            if i < image_count - 1:
                time.sleep(0.5)

        # 检查是否所有图片都失败
        if not generated_images:
            error_msg = f"所有 {image_count} 张图片生成均失败，请检查日志"
            log_error('批量生成完全失败', error_msg, f"model={model}")
            raise RuntimeError(error_msg)

        log_provider_message('tuzi',
            f"生成完成: 成功生成 {len(generated_images)} 张图片")
        return generated_images

    @common_retry_strategy
    def generate_single(self, prompt: str, images: list, temperature: float,
                       model: str, image: Optional[bytes] = None, **kwargs) -> bytes:
        """
        生成单张图像（带重试保护）

        Args:
            prompt: 用户指令
            images: 输入图片字节列表
            temperature: 温度参数
            model: 模型名称
            image: 未使用（保留兼容性）
            **kwargs: 额外参数

        Returns:
            bytes: 单张图片的字节数据

        Raises:
            ValueError: 内容审核拒绝（不可重试）
            RuntimeError: 网络/解析失败（可重试）
        """
        log_provider_message(
            'tuzi',
            f"generate_single: model={model}, temperature={temperature}, 输入图片={len(images)}"
        )

        # 直接使用流式请求，不再尝试非流式（消除双重请求）
        return self._generate_with_stream(prompt, images, temperature, model)

    def _generate_with_stream(self, prompt: str, images: list,
                             temperature: float, model: str) -> bytes:
        """
        使用流式 Chat Completions API 生成图像（单一路径，消除双重请求）

        Args:
            prompt: 用户指令
            images: 输入图片字节列表
            temperature: 温度参数
            model: 模型 ID

        Returns:
            bytes: 图片二进制数据

        Raises:
            ValueError: 内容审核拒绝（不可重试）
            RuntimeError: 网络/解析失败（可重试）
        """
        log_provider_message('tuzi',
            f"Chat Completions (流式): model={model}, temperature={temperature}, "
            f"输入图片={len(images)}")

        # 构建消息内容
        content = [{"type": "text", "text": prompt}]

        for i, img_data in enumerate(images):
            if isinstance(img_data, bytes):
                img_b64 = base64.b64encode(img_data).decode('utf-8')
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}
                })
                log_image_operation("添加输入图片",
                                  f"第{i+1}张: {len(img_data)}字节")

        # 直接使用流式请求（不再尝试非流式）
        log_api_call('tuzi', '调用流式 Chat Completions', f"model={model}")

        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": content}],
                temperature=temperature,
                stream=True  # 固定使用流式
            )
        except Exception as e:
            # 不捕获，直接让异常向上传播给重试装饰器
            log_error('流式请求失败', str(e), f"model={model}")
            raise RuntimeError(f"API 调用失败: {str(e)}")

        # 收集流式响应（支持 content 和 multi_mod_content）
        full_content = ""
        multi_mod_content = None

        for chunk in response:
            # 检查 choices 是否为空（最后一个 usage chunk 的 choices 为空数组）
            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta

            # 收集 content 字段
            if delta.content:
                full_content += delta.content

            # 收集 multi_mod_content 字段（通常在第一个 chunk）
            if hasattr(delta, 'multi_mod_content') and delta.multi_mod_content:
                multi_mod_content = delta.multi_mod_content
                log_provider_message('tuzi',
                    f"流式响应中检测到 multi_mod_content: {len(delta.multi_mod_content)} 项")

        log_provider_message('tuzi',
            f"流式响应完成: content长度={len(full_content)}, "
            f"multi_mod_content={'有' if multi_mod_content else '无'}")

        # 构造伪消息对象用于提取（包含 multi_mod_content）
        class StreamMessage:
            def __init__(self, content, multi_mod_content=None):
                self.content = content
                self.refusal = None
                self._multi_mod_content = multi_mod_content

            def model_dump(self):
                result = {"content": self.content}
                if self._multi_mod_content:
                    result["multi_mod_content"] = self._multi_mod_content
                return result

        return self._extract_image_data_from_message(
            StreamMessage(full_content, multi_mod_content))

    def _extract_image_data_from_message(self, message) -> bytes:
        """
        从消息对象提取图片数据

        Args:
            message: ChatCompletionMessage 对象

        Returns:
            bytes: 图片二进制数据

        Raises:
            ValueError: 内容审核拒绝
            RuntimeError: 图片提取失败
        """
        message_dict = message.model_dump()

        # Step 0: 优先检查 multi_mod_content 字段（tuzi 非标准扩展）
        # 某些 API Key 会返回此格式，包含 inline_data Base64 图片
        if 'multi_mod_content' in message_dict:
            log_provider_message('tuzi', "检测到 multi_mod_content 字段")
            mmc = message_dict['multi_mod_content']

            if isinstance(mmc, list) and len(mmc) > 0:
                for i, item in enumerate(mmc):
                    if isinstance(item, dict) and 'inline_data' in item:
                        inline_data = item['inline_data']
                        data_b64 = inline_data.get('data', '')
                        mime_type = inline_data.get('mime_type', 'unknown')

                        if data_b64:
                            try:
                                import base64
                                img_bytes = base64.b64decode(data_b64)

                                if self._is_valid_image(img_bytes):
                                    log_provider_message('tuzi',
                                        f"multi_mod_content[{i}].inline_data 提取成功: "
                                        f"{len(img_bytes)}字节, {mime_type}")
                                    return img_bytes
                                else:
                                    log_provider_message('tuzi',
                                        f"multi_mod_content[{i}] 数据无效", "WARNING")

                            except Exception as e:
                                log_provider_message('tuzi',
                                    f"multi_mod_content[{i}] Base64 解码失败: {e}", "WARNING")

        # Step 1: Deep Search（次优先级，用于处理旧格式）
        log_provider_message('tuzi', "开始 Deep Search 递归搜索...")
        image_bytes = self._find_image_in_payload(message_dict)
        if image_bytes and self._is_valid_image(image_bytes):
            log_provider_message('tuzi', f"Deep Search 成功: {len(image_bytes)}字节")
            return image_bytes

        # Step 2: 检查内容审核拒绝
        if hasattr(message, 'refusal') and message.refusal:
            log_error('内容审核拒绝', message.refusal,
                     f"完整信息: {message.refusal}")
            raise ValueError(f"模型拒绝生成: {message.refusal}")

        # Step 3: 检查 content 字段中的拒绝关键词
        if hasattr(message, 'content') and message.content:
            self._check_content_refusal(message.content)

        # Step 4: 检查是否有内容但提取失败（软拒绝检测）
        if hasattr(message, 'content') and message.content:
            content_lower = message.content.lower()
            soft_refusal_keywords = [
                "sorry", "cannot", "can't", "unable to",
                "don't", "won't", "inappropriate",
                "against", "policy", "guidelines"
            ]

            for keyword in soft_refusal_keywords:
                if keyword in content_lower:
                    log_error('隐式内容拒绝', keyword,
                             f"内容前200字符: {message.content[:200]}")
                    raise ValueError(f"模型隐式拒绝（包含关键词'{keyword}'）: {message.content[:100]}")

        # Step 5: 所有方法失败（响应有内容但无图片，通常是内容问题）
        log_error('图片提取失败', '所有提取方法均失败',
                 f"message完整信息: {self._truncate_logs(message.model_dump())}")
        raise ValueError("无法从响应中提取图片数据，可能是内容不符合要求")

    def _check_content_refusal(self, content: str) -> None:
        """
        检查内容是否被审核拒绝

        Args:
            content: 响应内容

        Raises:
            ValueError: 检测到内容审核拒绝
        """
        refusal_keywords = [
            # 英文关键词（通用）
            "sorry", "cannot", "can't", "unable to",
            "don't", "won't", "inappropriate",
            "against our policy", "violates", "prohibited",

            # 平台特定关键词
            "blocked by Google Gemini",
            "PROHIBITED_CONTENT",
            "SAFETY",
            "blocked by policy",
            "content is prohibited",
            "violates our content policy",

            # 中文关键词
            "抱歉", "无法", "不能", "不符合",
            "违反", "禁止", "政策"
        ]

        content_lower = content.lower()
        for keyword in refusal_keywords:
            if keyword.lower() in content_lower:
                log_error('内容审核拒绝', keyword,
                         f"内容前200字符: {content[:200]}")
                raise ValueError(f"内容审核拒绝: {keyword}")

    def _find_image_in_payload(self, data) -> bytes:
        """
        Deep Search: 递归搜索响应数据中的图片数据

        支持格式：
        - Markdown: ![alt](https://...)
        - data URL: data:image/png;base64,...
        - Raw Base64: 长字符串（>5000字符 + 魔数验证）
        - HTTP URL: https://.../*.png

        Args:
            data: API 响应数据（dict/list/str）

        Returns:
            bytes: 图片二进制数据，未找到返回 None
        """
        # 快速路径：优先检查常见的结构化图片字段
        if isinstance(data, dict):
            # Priority 1: 检查 b64_json
            if 'b64_json' in data and isinstance(data['b64_json'], str):
                log_provider_message('tuzi', "Deep Search: 找到 'b64_json' 字段")
                image_bytes = self._safe_base64_decode(data['b64_json'])
                if image_bytes and self._is_valid_image(image_bytes):
                    return image_bytes

            # Priority 2: 检查 tool_calls
            if 'tool_calls' in data and data['tool_calls']:
                log_provider_message('tuzi', "Deep Search: 找到 'tool_calls' 字段")
                result = self._find_image_in_payload(data['tool_calls'])
                if result:
                    return result

            # Priority 3: 检查 url 字段（HTTP 下载）
            if 'url' in data and isinstance(data['url'], str):
                url = data['url']
                if url.startswith('http') and re.search(r'\.(png|jpg|jpeg|webp|gif)($|\?)', url, re.IGNORECASE):
                    log_provider_message('tuzi', f"Deep Search: 找到图片 URL: {url[:80]}")
                    image_bytes = self._download_image(url)
                    if image_bytes:
                        return image_bytes

        # 处理字典：递归遍历（跳过黑名单）
        if isinstance(data, dict):
            BLACKLIST_KEYS = {
                'reasoning', 'reasoning_details',
                'usage', 'prompt_tokens_details',
                'annotations'
            }

            for key, value in data.items():
                if key in BLACKLIST_KEYS:
                    log_provider_message('tuzi', f"Deep Search: 跳过黑名单字段 '{key}'")
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
            # Target 1: Markdown 图片链接（Tuzi 特色，最高优先级）
            # 支持两种格式：
            # - ![alt](https://example.com/image.png)  ← Default分组
            # - ![alt](data:image/jpeg;base64,...)     ← Gemini原价分组
            markdown_pattern = r'!\[.*?\]\(([^)]+)\)'  # 捕获括号内所有内容
            match = re.search(markdown_pattern, data)
            if match:
                url = match.group(1).strip()  # 提取括号内容并去除空格

                # 情况1：HTTP/HTTPS URL（下载）
                if url.startswith('http://') or url.startswith('https://'):
                    log_provider_message('tuzi', f"Deep Search: 找到 Markdown HTTP 链接: {url[:80]}")
                    image_bytes = self._download_image(url)
                    if image_bytes:
                        return image_bytes

                # 情况2：Data URL（Base64解码）
                elif url.startswith('data:image'):
                    log_provider_message('tuzi', f"Deep Search: 找到 Markdown Data URL (len={len(url)})")
                    # 提取 base64 数据部分：data:image/jpeg;base64,<data>
                    data_url_match = re.search(r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)', url)
                    if data_url_match:
                        base64_data = data_url_match.group(1)
                        image_bytes = self._safe_base64_decode(base64_data)
                        if image_bytes and self._is_valid_image(image_bytes):
                            log_provider_message('tuzi', f"Deep Search: Markdown Data URL 解码成功: {len(image_bytes)}字节")
                            return image_bytes
                        else:
                            log_provider_message('tuzi', "Deep Search: Markdown Data URL 解码后验证失败", "WARNING")

            # Target 2: data:image 开头的 Data URL
            if data.startswith('data:image'):
                log_provider_message('tuzi', "Deep Search: 找到 data:image URL")
                match = re.search(r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)', data)
                if match:
                    image_bytes = self._safe_base64_decode(match.group(1))
                    if image_bytes:
                        return image_bytes

            # Target 3: 疑似 Raw Base64（长度 >5000 且不含空格）
            elif len(data) > 5000 and ' ' not in data:
                log_provider_message('tuzi', f"Deep Search: 检测到疑似 Raw Base64 (len={len(data)})")
                image_bytes = self._safe_base64_decode(data)
                # 验证解码结果是否为有效图片（文件头魔数校验）
                if image_bytes and self._is_valid_image(image_bytes):
                    log_provider_message('tuzi', f"Deep Search: Raw Base64 解码并验证成功: {len(image_bytes)}字节")
                    return image_bytes
                else:
                    log_provider_message('tuzi', "Deep Search: Raw Base64 解码后文件头验证失败，跳过", "WARNING")

        return None

    # ==================== 辅助方法（从 OpenRouter 移植）====================

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
            log_provider_message('tuzi', "文件头验证: PNG 格式")
            return True

        # JPEG: \xff\xd8\xff
        if data[:3] == b'\xff\xd8\xff':
            log_provider_message('tuzi', "文件头验证: JPEG 格式")
            return True

        # WEBP: RIFF....WEBP
        if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            log_provider_message('tuzi', "文件头验证: WEBP 格式")
            return True

        # GIF: GIF87a 或 GIF89a
        if data[:6] in (b'GIF87a', b'GIF89a'):
            log_provider_message('tuzi', "文件头验证: GIF 格式")
            return True

        log_provider_message('tuzi', f"文件头验证失败: 前8字节 = {data[:8]}", "WARNING")
        return False

    def _download_image(self, url: str) -> bytes:
        """
        从 URL 下载图片

        Args:
            url: 图片 URL

        Returns:
            bytes: 图片二进制数据，失败返回 None
        """
        try:
            log_provider_message('tuzi', f"开始下载图片: {url[:80]}...")
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
        """
        安全的base64解码，处理padding和无效字符

        Args:
            data_str: Base64 编码的字符串

        Returns:
            bytes: 解码后的二进制数据，失败返回 None
        """
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

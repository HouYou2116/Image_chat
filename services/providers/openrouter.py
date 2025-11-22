import base64
import json
import requests
import re
import time
from .base import ImageProvider
from ..logging_config import log_provider_message, log_api_call, log_error, log_image_operation

class OpenRouterProvider(ImageProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    def generate(self, prompt: str, images: list, temperature: float, model: str, image_count: int) -> list[bytes]:
        """使用OpenRouter生成图像"""
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

            # 构建请求数据
            data = {
                "model": model,
                "messages": [{"role": "user", "content": content}],
                "temperature": temperature
            }

            # 为Gemini模型添加特殊参数
            if 'gemini' in model.lower():
                data.update({
                    "max_tokens": 4000,
                    "stream": False,
                })
                log_provider_message('openrouter', f"为Gemini模型添加特殊参数: max_tokens=4000, stream=False")

            # 发送请求到OpenRouter
            log_provider_message('openrouter', f"发送OpenRouter请求 {i+1}")
            log_provider_message('openrouter', f"请求数据: {json.dumps(data, indent=2, ensure_ascii=False)}")

            response = self._make_openrouter_request(data)
            if response:
                generated_images.extend(response)
                log_provider_message('openrouter', f"第 {i+1} 张图片生成成功")

            # 如果不是最后一次请求，稍微延迟避免频率限制
            if i < image_count - 1:
                log_provider_message('openrouter', "延迟0.5秒避免频率限制")
                time.sleep(0.5)

        log_provider_message('openrouter', f"OpenRouter生成完成: 成功生成 {len(generated_images)} 张图片")
        return generated_images

    def _make_openrouter_request(self, data) -> list[bytes]:
        """发送单次OpenRouter请求并解析响应"""
        current_images = []

        response = requests.post(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:5000",
                "X-Title": "Image CHAT"
            },
            data=json.dumps(data)
        )

        if response.status_code == 200:
            result = response.json()
            log_provider_message('openrouter', f"OpenRouter响应接收成功")
            log_provider_message('openrouter', f"响应数据: {json.dumps(result, indent=2, ensure_ascii=False)}")

            # 解析OpenRouter响应，提取图片数据
            if 'choices' in result and result['choices']:
                choice = result['choices'][0]
                if 'message' in choice and 'content' in choice['message']:
                    message_content = choice['message']['content']
                    log_provider_message('openrouter', f"消息内容类型: {type(message_content)}")
                    log_provider_message('openrouter', f"消息内容: {message_content}")

                    # 改进的响应解析逻辑，专门处理Gemini模型
                    def safe_base64_decode(data_str):
                        """安全的base64解码，处理padding和无效字符"""
                        try:
                            # 清理字符串，移除可能的空白字符
                            data_str = data_str.strip()
                            # 确保正确的padding
                            missing_padding = len(data_str) % 4
                            if missing_padding:
                                data_str += '=' * (4 - missing_padding)
                            return base64.b64decode(data_str)
                        except Exception as e:
                            log_error('base64解码错误', str(e), f"数据前50字符: {data_str[:50]}")
                            return None

                    # 首先检查 Gemini 特有的 images 数组格式
                    if 'images' in choice['message'] and choice['message']['images']:
                        log_provider_message('openrouter', "在message.images数组中找到图片数据")
                        for image_info in choice['message']['images']:
                            if 'image_url' in image_info and 'url' in image_info['image_url']:
                                image_url = image_info['image_url']['url']
                                log_provider_message('openrouter', f"找到图片URL: {image_url[:100]}...")

                                # 处理base64格式的图片数据
                                if image_url.startswith('data:image/'):
                                    try:
                                        base64_data = image_url.split(',')[1]
                                        image_bytes = safe_base64_decode(base64_data)
                                        if image_bytes:
                                            current_images.append(image_bytes)
                                            log_image_operation("提取base64图片", f"从message.images成功提取: {len(image_bytes)}字节")
                                    except Exception as e:
                                        log_error('解析data URL失败', str(e), f"URL类型: data URL")
                                # 处理普通URL格式（需要下载）
                                elif image_url.startswith('http'):
                                    try:
                                        img_response = requests.get(image_url)
                                        if img_response.status_code == 200:
                                            current_images.append(img_response.content)
                                            log_image_operation("下载远程图片", f"从URL成功下载: {len(img_response.content)}字节")
                                    except Exception as e:
                                        log_error('下载图片失败', str(e), f"URL: {image_url[:50]}...")

                    # 如果没有在images数组中找到图片，继续检查content字段
                    if not current_images and 'content' in choice['message']:
                        message_content = choice['message']['content']
                        log_provider_message('openrouter', f"检查content字段 - 类型: {type(message_content)}")

                        if isinstance(message_content, str):
                            # 1. 尝试直接解析JSON格式的响应
                            try:
                                content_data = json.loads(message_content)
                                log_provider_message('openrouter', f"解析后的JSON内容类型: {type(content_data)}")

                                # 处理不同的JSON结构
                                if isinstance(content_data, list):
                                    # 列表格式
                                    for item in content_data:
                                        if isinstance(item, dict):
                                            if 'type' in item and item['type'] == 'image' and 'data' in item:
                                                image_bytes = safe_base64_decode(item['data'])
                                                if image_bytes:
                                                    current_images.append(image_bytes)
                                                    log_image_operation("提取JSON图片", f"从JSON列表成功提取: {len(image_bytes)}字节")
                                elif isinstance(content_data, dict):
                                    # 字典格式
                                    if 'image' in content_data:
                                        image_bytes = safe_base64_decode(content_data['image'])
                                        if image_bytes:
                                            current_images.append(image_bytes)
                                            log_image_operation("提取JSON图片", f"从JSON字典image字段成功提取: {len(image_bytes)}字节")
                                    elif 'data' in content_data:
                                        image_bytes = safe_base64_decode(content_data['data'])
                                        if image_bytes:
                                            current_images.append(image_bytes)
                                            log_image_operation("提取JSON图片", f"从JSON字典data字段成功提取: {len(image_bytes)}字节")
                            except json.JSONDecodeError:
                                log_provider_message('openrouter', "不是有效的JSON格式，尝试其他解析方式", "WARNING")

                            # 2. 检查是否是data URL格式
                            if not current_images and message_content.startswith('data:image/'):
                                try:
                                    base64_data = message_content.split(',')[1]
                                    image_bytes = safe_base64_decode(base64_data)
                                    if image_bytes:
                                        current_images.append(image_bytes)
                                        log_image_operation("提取data URL图片", f"成功提取: {len(image_bytes)}字节")
                                except Exception as e:
                                    log_error('data URL解析失败', str(e), "格式: data:image/")

                            # 3. 使用正则表达式查找base64图片数据
                            if not current_images:
                                log_provider_message('openrouter', "使用正则表达式查找base64图片数据")
                                # 查找各种可能的base64图片格式
                                patterns = [
                                    r'data:image/[^;]+;base64,([A-Za-z0-9+/=]+)',  # 标准data URL
                                    r'"data":\s*"([A-Za-z0-9+/=]+)"',  # JSON中的data字段
                                    r'"image":\s*"([A-Za-z0-9+/=]+)"',  # JSON中的image字段
                                    r'```\s*([A-Za-z0-9+/=\s]+)\s*```',  # 代码块中的base64
                                    r'([A-Za-z0-9+/]{100,}={0,2})',  # 长的base64字符串
                                ]

                                for pattern in patterns:
                                    matches = re.findall(pattern, message_content, re.DOTALL)
                                    for match in matches:
                                        # 清理匹配的数据
                                        clean_match = re.sub(r'\s+', '', match)  # 移除空白字符
                                        if len(clean_match) > 100:  # 确保是合理长度的图片数据
                                            image_bytes = safe_base64_decode(clean_match)
                                            if image_bytes:
                                                current_images.append(image_bytes)
                                                log_provider_message('openrouter', f"通过正则表达式提取图片数据，模式: {pattern}")
                                                log_image_operation("正则提取图片", f"成功提取: {len(image_bytes)}字节")
                                                break
                                    if current_images:
                                        break

                            # 4. 如果仍然没有找到图片，检查原始响应的其他字段
                            if not current_images:
                                log_provider_message('openrouter', "在message content中未找到图片数据，检查响应的其他字段...", "WARNING")
                                def search_for_images(obj, path=""):
                                    """递归搜索对象中的图片数据"""
                                    if isinstance(obj, dict):
                                        for key, value in obj.items():
                                            current_path = f"{path}.{key}" if path else key
                                            if isinstance(value, str):
                                                if 'data:image/' in value or (len(value) > 100 and re.match(r'^[A-Za-z0-9+/=]+$', value)):
                                                    if 'data:image/' in value:
                                                        try:
                                                            base64_data = value.split(',')[1]
                                                            image_bytes = safe_base64_decode(base64_data)
                                                        except:
                                                            image_bytes = safe_base64_decode(value)
                                                    else:
                                                        image_bytes = safe_base64_decode(value)

                                                    if image_bytes:
                                                        current_images.append(image_bytes)
                                                        log_provider_message('openrouter', f"在路径 {current_path} 找到图片数据")
                                                        log_image_operation("递归查找图片", f"成功提取: {len(image_bytes)}字节")
                                                        return True
                                            else:
                                                if search_for_images(value, current_path):
                                                    return True
                                    elif isinstance(obj, list):
                                        for i, item in enumerate(obj):
                                            if search_for_images(item, f"{path}[{i}]"):
                                                return True
                                    return False

                                search_for_images(result)
        elif response.status_code >= 400:
            try:
                error_data = response.json()
                error_msg = error_data.get('error', {}).get('message', f'HTTP {response.status_code} 错误')
            except:
                error_msg = f'HTTP {response.status_code} 错误: {response.text}'
            log_error('OpenRouter API错误', error_msg, f"状态码: {response.status_code}")
            raise Exception(f"OpenRouter API错误: {error_msg}")
        else:
            log_error('OpenRouter API异常状态码', f"状态码: {response.status_code}", f"响应内容: {response.text[:200]}...")
            raise Exception(f"OpenRouter API异常状态码: {response.status_code}")

        return current_images
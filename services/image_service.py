"""
图像处理服务层

封装图像编辑和生成的核心业务逻辑，包括：
- 参数验证
- 文件读取与处理
- Prompt构建
- Provider调用
- 文件保存与Base64编码
"""

import os
import base64
from datetime import datetime
from typing import List, Dict, Generator, Any
from werkzeug.datastructures import FileStorage
from concurrent.futures import ThreadPoolExecutor, as_completed

from services.providers import get_provider
from services.logging_config import (
    log_api_call, log_image_operation, log_error,
    api_logger, image_logger
)


# ============================================================================
# 参数验证函数
# ============================================================================

def _validate_image_count(image_count: int) -> None:
    """
    验证图片数量范围

    Args:
        image_count: 需要生成的图片数量

    Raises:
        ValueError: 如果数量不在1-5之间
    """
    if image_count < 1 or image_count > 5:
        raise ValueError('图像数量必须在1-5之间')


def _validate_instruction(instruction: str) -> None:
    """
    验证编辑指令非空

    Args:
        instruction: 编辑指令文本

    Raises:
        ValueError: 如果指令为空
    """
    if not instruction:
        raise ValueError('请输入编辑指令')


def _validate_description(description: str) -> None:
    """
    验证图像描述非空

    Args:
        description: 图像描述文本

    Raises:
        ValueError: 如果描述为空
    """
    if not description:
        raise ValueError('请输入图像描述')


# ============================================================================
# Prompt构建函数
# ============================================================================

def _build_edit_prompt(instruction: str, image_count: int) -> str:
    """
    构建编辑模式的Prompt

    根据图片数量构建不同的提示词模板：
    - 单图：强调对单张图片的编辑
    - 多图：强调图片的编辑或合成

    Args:
        instruction: 用户的编辑指令
        image_count: 输入图片数量

    Returns:
        str: 构建好的Prompt字符串
    """
    if image_count == 1:
        return f"""请根据以下指令编辑这张图片：{instruction}

请直接返回编辑后的图片，不需要任何文字说明。"""
    else:
        return f"""请根据以下指令将这{image_count}张图片进行编辑或合成：{instruction}

请直接返回编辑/合成后的图片，不需要任何文字说明。"""


# ============================================================================
# 文件处理函数
# ============================================================================

def _read_uploaded_files(files: List[FileStorage]) -> List[bytes]:
    """
    读取上传的文件并转换为字节列表

    Args:
        files: Flask上传的文件列表

    Returns:
        List[bytes]: 图片二进制数据列表

    Raises:
        ValueError: 如果文件列表为空
    """
    if not files:
        raise ValueError('请上传至少一张图片')

    # 过滤空文件名的文件
    valid_files = [f for f in files if f and f.filename]
    if not valid_files:
        raise ValueError('请上传有效的图片文件')

    image_bytes_list = []
    total_size = 0

    for file in valid_files:
        # 读取文件数据到内存
        image_data = file.read()
        image_bytes_list.append(image_data)
        total_size += len(image_data)

        # 记录上传日志
        log_image_operation(
            "上传图片",
            f"文件名: {file.filename}, 大小: {len(image_data)}字节"
        )

    image_logger.info(f"成功读取 {len(image_bytes_list)} 张图片，总大小: {total_size}字节")

    return image_bytes_list


def _save_and_encode_images(image_bytes_list: List[bytes], prefix: str) -> List[Dict[str, str]]:
    """
    保存图片到文件系统并转换为Base64编码

    Args:
        image_bytes_list: 图片字节数据列表
        prefix: 文件名前缀（"edited" 或 "generated"）

    Returns:
        List[Dict]: 包含filename, download_url, image_data的字典列表

    Raises:
        RuntimeError: 如果没有图片可保存
    """
    if not image_bytes_list:
        raise RuntimeError(f'无法生成{prefix}后的图片')

    result_images = []
    # 统一生成一次timestamp，确保同批次图片使用相同时间戳
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for i, image_bytes in enumerate(image_bytes_list):
        if not image_bytes:
            continue

        # 构建文件名和路径
        filename = f"{prefix}_{timestamp}_{i+1}.png"
        filepath = os.path.join('output', filename)

        # 保存到文件系统
        with open(filepath, 'wb') as f:
            f.write(image_bytes)

        # 记录保存日志
        log_image_operation(
            f"保存{prefix}图片",
            f"文件名: {filename}, 大小: {len(image_bytes)}字节"
        )

        # 转换为Base64编码
        image_data_b64 = base64.b64encode(image_bytes).decode('utf-8')

        # 构建返回字典
        result_images.append({
            'filename': filename,
            'download_url': f'/download/{filename}',
            'image_data': image_data_b64
        })

    if not result_images:
        raise RuntimeError(f'无法生成{prefix}后的图片')

    image_logger.info(f"成功保存 {len(result_images)} 张{prefix}图片")

    return result_images


# ============================================================================
# 核心服务函数
# ============================================================================

def process_image_edit(
    provider_name: str,
    api_key: str,
    model: str,
    temperature: float,
    image_count: int,
    instruction: str,
    uploaded_files: List[FileStorage],
    **extra_params
) -> List[Dict[str, str]]:
    """
    处理图像编辑请求

    Args:
        provider_name: 服务商名称 (google/openrouter/tuzi)
        api_key: API密钥
        model: 模型名称
        temperature: 温度参数
        image_count: 生成图片数量 (1-4)
        instruction: 编辑指令
        uploaded_files: 上传的图片文件列表
        **extra_params: 额外参数（如 aspect_ratio, resolution）

    Returns:
        List[Dict]: 包含 filename, download_url, image_data 的字典列表

    Raises:
        ValueError: 参数验证失败 (映射为400错误)
        RuntimeError: 图片生成失败 (映射为500错误)
    """
    # 1. 参数验证
    _validate_image_count(image_count)
    _validate_instruction(instruction)

    # 2. 读取上传的文件
    image_bytes_list = _read_uploaded_files(uploaded_files)

    # 3. 构建编辑Prompt
    prompt = _build_edit_prompt(instruction, len(image_bytes_list))

    # 4. 记录API调用开始
    log_api_call(
        provider_name,
        "开始图像编辑",
        f"模型: {model}, 图片数量: {len(image_bytes_list)}, 生成数量: {image_count}"
    )

    # 5. 获取Provider实例并调用生成方法
    provider_instance = get_provider(provider_name, api_key)

    api_call_start = datetime.now()
    generated_images = provider_instance.generate(
        prompt=prompt,
        images=image_bytes_list,
        temperature=temperature,
        model=model,
        image_count=image_count,
        **extra_params
    )
    api_call_duration = (datetime.now() - api_call_start).total_seconds()

    # 检查是否部分成功
    if len(generated_images) < image_count and len(generated_images) > 0:
        image_logger.warning(
            f"部分生成失败: 请求{image_count}张，成功{len(generated_images)}张"
        )

    # 6. 记录API调用完成
    log_api_call(
        provider_name,
        "图像编辑完成",
        f"生成图片数量: {len(generated_images)}, 耗时: {api_call_duration:.2f}秒"
    )

    # 7. 保存图片并编码为Base64
    result_images = _save_and_encode_images(generated_images, "edited")

    return result_images


def process_image_generation(
    provider_name: str,
    api_key: str,
    model: str,
    temperature: float,
    image_count: int,
    description: str,
    **extra_params
) -> List[Dict[str, str]]:
    """
    处理图像生成请求

    Args:
        provider_name: 服务商名称 (google/openrouter/tuzi)
        api_key: API密钥
        model: 模型名称
        temperature: 温度参数
        image_count: 生成图片数量 (1-4)
        description: 图像描述

    Returns:
        List[Dict]: 包含 filename, download_url, image_data 的字典列表

    Raises:
        ValueError: 参数验证失败 (映射为400错误)
        RuntimeError: 图片生成失败 (映射为500错误)
    """
    # 1. 参数验证
    _validate_image_count(image_count)
    _validate_description(description)

    # 2. 生成模式直接使用description作为prompt
    prompt = description

    # 3. 记录API调用开始
    log_api_call(
        provider_name,
        "开始图像生成",
        f"模型: {model}, 生成数量: {image_count}"
    )

    # 4. 获取Provider实例并调用生成方法（无输入图片）
    provider_instance = get_provider(provider_name, api_key)

    api_call_start = datetime.now()
    generated_images = provider_instance.generate(
        prompt=prompt,
        images=[],  # 生成模式不需要输入图片
        temperature=temperature,
        model=model,
        image_count=image_count,
        **extra_params
    )
    api_call_duration = (datetime.now() - api_call_start).total_seconds()

    # 检查是否部分成功
    if len(generated_images) < image_count and len(generated_images) > 0:
        image_logger.warning(
            f"部分生成失败: 请求{image_count}张，成功{len(generated_images)}张"
        )

    # 5. 记录API调用完成
    log_api_call(
        provider_name,
        "图像生成完成",
        f"生成图片数量: {len(generated_images)}, 耗时: {api_call_duration:.2f}秒"
    )

    # 6. 保存图片并编码为Base64
    result_images = _save_and_encode_images(generated_images, "generated")

    return result_images


# ============================================================================
# 流式并发服务函数（新增）
# ============================================================================

def process_image_edit_stream(
    provider_name: str,
    api_key: str,
    model: str,
    temperature: float,
    image_count: int,
    instruction: str,
    uploaded_files: List[FileStorage],
    **extra_params
) -> Generator[Dict[str, Any], None, None]:
    """
    处理图像编辑请求（流式并发版本）

    使用 ThreadPoolExecutor 并发生成多张图片，逐张返回结果
    每完成一张图片就 yield 一次，前端可以实时显示

    Args:
        provider_name: 服务商名称 (google/openrouter/tuzi)
        api_key: API密钥
        model: 模型名称
        temperature: 温度参数
        image_count: 生成图片数量 (1-4)
        instruction: 编辑指令
        uploaded_files: 上传的图片文件列表
        **extra_params: 额外参数（如 aspect_ratio, resolution）

    Yields:
        Dict: 每完成一张图片就 yield 一个字典
            {
                'index': int,          # 图片索引（1-based）
                'filename': str,       # 文件名
                'download_url': str,   # 下载URL
                'image_data': str      # Base64编码的图片数据
            }

    Raises:
        ValueError: 参数验证失败
        RuntimeError: 所有图片生成均失败
    """
    # 1. 参数验证
    _validate_image_count(image_count)
    _validate_instruction(instruction)

    # 2. 读取上传的文件
    image_bytes_list = _read_uploaded_files(uploaded_files)

    # 3. 构建编辑Prompt
    prompt = _build_edit_prompt(instruction, len(image_bytes_list))

    # 4. 记录API调用开始
    log_api_call(
        provider_name,
        "开始并发图像编辑",
        f"模型: {model}, 图片数量: {len(image_bytes_list)}, 生成数量: {image_count}"
    )

    # 5. 获取Provider实例
    provider_instance = get_provider(provider_name, api_key)

    # 6. 并发生成图片
    api_call_start = datetime.now()
    success_count = 0
    failed_count = 0

    # 使用 ThreadPoolExecutor 并发提交任务
    with ThreadPoolExecutor(max_workers=image_count) as executor:
        # 提交所有任务
        future_to_index = {}
        for i in range(image_count):
            future = executor.submit(
                provider_instance.generate_single,
                prompt=prompt,
                images=image_bytes_list,
                temperature=temperature,
                model=model,
                **extra_params
            )
            future_to_index[future] = i + 1  # 索引从 1 开始

        # 逐个获取完成的任务结果
        for future in as_completed(future_to_index):
            index = future_to_index[future]

            try:
                # 获取生成的图片
                image_bytes = future.result()
                success_count += 1

                # 保存图片并编码
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"edited_{timestamp}_{index}.png"
                filepath = os.path.join('output', filename)

                # 保存到文件
                with open(filepath, 'wb') as f:
                    f.write(image_bytes)

                # Base64 编码
                img_b64 = base64.b64encode(image_bytes).decode('utf-8')

                log_image_operation(
                    "图片编辑成功",
                    f"第{index}张: {filename}, {len(image_bytes)}字节"
                )

                # 逐张返回结果
                yield {
                    'index': index,
                    'filename': filename,
                    'download_url': f'/download/{filename}',
                    'image_data': img_b64
                }

            except Exception as e:
                failed_count += 1
                log_error(
                    '并发生成失败',
                    f"第{index}张图片生成失败",
                    str(e)
                )
                # 注意：这里不 yield 失败的图片，只返回成功的
                continue

    # 7. 记录最终统计
    api_call_duration = (datetime.now() - api_call_start).total_seconds()
    log_api_call(
        provider_name,
        "并发图像编辑完成",
        f"成功: {success_count}/{image_count}, 失败: {failed_count}, 耗时: {api_call_duration:.2f}秒"
    )

    # 8. 检查是否所有图片都失败
    if success_count == 0:
        error_msg = f"所有 {image_count} 张图片生成均失败，请检查日志"
        log_error('批量生成完全失败', error_msg, f"model={model}")
        raise RuntimeError(error_msg)


def process_image_generation_stream(
    provider_name: str,
    api_key: str,
    model: str,
    temperature: float,
    image_count: int,
    description: str,
    **extra_params
) -> Generator[Dict[str, Any], None, None]:
    """
    处理图像生成请求（流式并发版本）

    使用 ThreadPoolExecutor 并发生成多张图片，逐张返回结果
    每完成一张图片就 yield 一次，前端可以实时显示

    Args:
        provider_name: 服务商名称 (google/openrouter/tuzi)
        api_key: API密钥
        model: 模型名称
        temperature: 温度参数
        image_count: 生成图片数量 (1-4)
        description: 图像描述
        **extra_params: 额外参数

    Yields:
        Dict: 每完成一张图片就 yield 一个字典
            {
                'index': int,          # 图片索引（1-based）
                'filename': str,       # 文件名
                'download_url': str,   # 下载URL
                'image_data': str      # Base64编码的图片数据
            }

    Raises:
        ValueError: 参数验证失败
        RuntimeError: 所有图片生成均失败
    """
    # 1. 参数验证
    _validate_image_count(image_count)
    _validate_description(description)

    # 2. 生成模式直接使用description作为prompt
    prompt = description

    # 3. 记录API调用开始
    log_api_call(
        provider_name,
        "开始并发图像生成",
        f"模型: {model}, 生成数量: {image_count}"
    )

    # 4. 获取Provider实例
    provider_instance = get_provider(provider_name, api_key)

    # 5. 并发生成图片
    api_call_start = datetime.now()
    success_count = 0
    failed_count = 0

    # 使用 ThreadPoolExecutor 并发提交任务
    with ThreadPoolExecutor(max_workers=image_count) as executor:
        # 提交所有任务
        future_to_index = {}
        for i in range(image_count):
            future = executor.submit(
                provider_instance.generate_single,
                prompt=prompt,
                images=[],  # 生成模式不需要输入图片
                temperature=temperature,
                model=model,
                **extra_params
            )
            future_to_index[future] = i + 1  # 索引从 1 开始

        # 逐个获取完成的任务结果
        for future in as_completed(future_to_index):
            index = future_to_index[future]

            try:
                # 获取生成的图片
                image_bytes = future.result()
                success_count += 1

                # 保存图片并编码
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"generated_{timestamp}_{index}.png"
                filepath = os.path.join('output', filename)

                # 保存到文件
                with open(filepath, 'wb') as f:
                    f.write(image_bytes)

                # Base64 编码
                img_b64 = base64.b64encode(image_bytes).decode('utf-8')

                log_image_operation(
                    "图片生成成功",
                    f"第{index}张: {filename}, {len(image_bytes)}字节"
                )

                # 逐张返回结果
                yield {
                    'index': index,
                    'filename': filename,
                    'download_url': f'/download/{filename}',
                    'image_data': img_b64
                }

            except Exception as e:
                failed_count += 1
                log_error(
                    '并发生成失败',
                    f"第{index}张图片生成失败",
                    str(e)
                )
                # 注意：这里不 yield 失败的图片，只返回成功的
                continue

    # 6. 记录最终统计
    api_call_duration = (datetime.now() - api_call_start).total_seconds()
    log_api_call(
        provider_name,
        "并发图像生成完成",
        f"成功: {success_count}/{image_count}, 失败: {failed_count}, 耗时: {api_call_duration:.2f}秒"
    )

    # 7. 检查是否所有图片都失败
    if success_count == 0:
        error_msg = f"所有 {image_count} 张图片生成均失败，请检查日志"
        log_error('批量生成完全失败', error_msg, f"model={model}")
        raise RuntimeError(error_msg)

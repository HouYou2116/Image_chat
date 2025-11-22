"""
统一日志配置模块
提供标准化的日志格式和配置，匹配problems.md中的日志格式
支持控制台和文件双输出模式
"""

import logging
import sys
import os
from datetime import datetime
from typing import Optional
from logging.handlers import TimedRotatingFileHandler

class ImageChatFormatter(logging.Formatter):
    """自定义格式化器，生成类似problems.md的日志格式"""

    def format(self, record):
        # 获取当前时间并格式化为类似Flask的格式
        timestamp = datetime.now().strftime("%d/%b/%Y %H:%M:%S")

        # 根据日志级别设置不同的前缀
        level_prefix = {
            'INFO': '',
            'WARNING': '[WARNING] ',
            'ERROR': '[ERROR] ',
            'DEBUG': '[DEBUG] '
        }.get(record.levelname, '')

        # 构建日志消息
        if hasattr(record, 'http_format') and record.http_format:
            # HTTP请求格式，如: 127.0.0.1 - - [22/Nov/2025 13:38:08] "POST /api/edit-image HTTP/1.1" 200 -
            return f"{record.remote_addr} - - [{timestamp}] \"{record.method} {record.path} HTTP/1.1\" {record.status_code} -"
        else:
            # 普通日志格式
            return f"{timestamp} - {level_prefix}{record.getMessage()}"

def setup_logger(name: str, level: int = logging.INFO, http_format: bool = False,
                log_to_file: bool = True, log_dir: str = "logs") -> logging.Logger:
    """设置并返回一个配置好的日志记录器"""
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # 避免重复添加处理器
    if not logger.handlers:
        # 设置自定义格式化器
        formatter = ImageChatFormatter()

        # 创建控制台处理器
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        # 创建文件处理器（如果启用）
        if log_to_file:
            try:
                # 确保日志目录存在
                os.makedirs(log_dir, exist_ok=True)

                # 按日期轮转的文件处理器
                file_handler = TimedRotatingFileHandler(
                    filename=os.path.join(log_dir, 'app.log'),
                    when='midnight',  # 每天午夜轮转
                    interval=1,
                    backupCount=0,    # 永久保留所有历史日志
                    encoding='utf-8',
                    delay=True        # 延迟文件创建直到第一次写入
                )
                file_handler.setLevel(level)
                file_handler.setFormatter(formatter)
                file_handler.suffix = "%Y-%m-%d"  # 轮转文件的后缀格式
                logger.addHandler(file_handler)

            except Exception as e:
                # 如果文件处理器创建失败，输出警告但不影响程序运行
                console_handler.emit(
                    logging.LogRecord(
                        name=name,
                        level=logging.WARNING,
                        pathname='',
                        lineno=0,
                        msg=f"无法创建文件日志处理器: {e}，仅使用控制台输出",
                        args=(),
                        exc_info=None
                    )
                )

        # 标记此日志记录器是否使用HTTP格式
        logger.http_format = http_format

    return logger

# 不同类型的日志记录器
flask_logger = setup_logger('flask_app', logging.INFO, http_format=True)
api_logger = setup_logger('api_calls', logging.INFO)
google_logger = setup_logger('google_provider', logging.INFO)
openrouter_logger = setup_logger('openrouter_provider', logging.INFO)
tuzi_logger = setup_logger('tuzi_provider', logging.INFO)
image_logger = setup_logger('image_processing', logging.INFO)
error_logger = setup_logger('error_handler', logging.ERROR)

def log_http_request(remote_addr: str, method: str, path: str, status_code: int):
    """记录HTTP请求日志，格式与problems.md一致"""
    record = logging.LogRecord(
        name='flask_app',
        level=logging.INFO,
        pathname='',
        lineno=0,
        msg='',
        args=(),
        exc_info=None
    )
    record.remote_addr = remote_addr
    record.method = method
    record.path = path
    record.status_code = status_code
    record.http_format = True

    flask_logger.handle(record)

def log_api_call(provider: str, operation: str, details: str = ""):
    """记录API调用日志"""
    message = f"{provider} API调用 - {operation}"
    if details:
        message += f": {details}"
    api_logger.info(message)

def log_image_operation(operation: str, details: str = ""):
    """记录图片操作日志"""
    message = f"图片{operation}"
    if details:
        message += f": {details}"
    image_logger.info(message)

def log_provider_message(provider: str, message: str, level: str = "INFO"):
    """记录Provider特定的消息"""
    logger_map = {
        'google': google_logger,
        'openrouter': openrouter_logger,
        'tuzi': tuzi_logger
    }

    logger = logger_map.get(provider.lower(), api_logger)
    log_method = getattr(logger, level.lower(), logger.info)
    log_method(message)

def log_error(error_type: str, message: str, details: str = ""):
    """记录错误日志"""
    error_message = f"{error_type}: {message}"
    if details:
        error_message += f" - {details}"
    error_logger.error(error_message)
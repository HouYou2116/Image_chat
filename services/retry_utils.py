"""
重试工具模块

使用 tenacity 库实现智能重试机制，专门处理 API 调用失败场景
支持指数退避、错误分类、详细日志记录
"""

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception,
    before_sleep_log,
    after_log
)
import logging
from typing import Callable

# 导入现有日志系统
from .logging_config import log_provider_message, log_error


# ============================================================================
# 错误检测函数
# ============================================================================

def is_retryable_error(exception: Exception) -> bool:
    """
    判断异常是否应该重试

    可重试的错误类型：
    1. Rate Limit 错误 (HTTP 429, "too many requests")
    2. 网络超时 (timeout, connection error)
    3. 临时服务故障 (HTTP 502, 503, 504)
    4. API 临时不可用 ("service unavailable")

    不可重试的错误：
    1. 认证错误 (401, 403)
    2. 参数错误 (400)
    3. 内容审核拒绝 (ValueError with "refusal")
    4. 资源不存在 (404)

    Args:
        exception: 捕获的异常对象

    Returns:
        bool: True 表示应该重试，False 表示立即失败
    """
    error_str = str(exception).lower()
    error_type = type(exception).__name__

    # 1. Rate Limit 错误（最高优先级）
    rate_limit_indicators = [
        '429',  # HTTP 状态码
        'too many requests',
        'rate limit',
        'rate_limit_exceeded',
        'quota exceeded',
        'throttled',
        'resource exhausted'
    ]

    for indicator in rate_limit_indicators:
        if indicator in error_str:
            log_provider_message(
                'retry_utils',
                f"检测到 Rate Limit 错误: {error_type} - {str(exception)[:200]}",
                "WARNING"
            )
            return True

    # 2. 网络超时/连接错误
    network_errors = [
        'timeout',
        'timed out',
        'connection error',
        'connection refused',
        'network error',
        'temporary failure'
    ]

    for error_keyword in network_errors:
        if error_keyword in error_str:
            log_provider_message(
                'retry_utils',
                f"检测到网络错误: {error_type} - {str(exception)[:200]}",
                "WARNING"
            )
            return True

    # 3. 临时服务故障 (HTTP 502/503/504)
    temporary_errors = [
        '502',
        '503',
        '504',
        'bad gateway',
        'service unavailable',
        'gateway timeout',
        'internal server error'  # 某些情况下 500 也可能是临时的
    ]

    for error_keyword in temporary_errors:
        if error_keyword in error_str:
            log_provider_message(
                'retry_utils',
                f"检测到临时服务故障: {error_type} - {str(exception)[:200]}",
                "WARNING"
            )
            return True

    # 4a. 明确排除 ValueError 类型（内容/参数错误，永不重试）
    if isinstance(exception, ValueError):
        log_provider_message(
            'retry_utils',
            f"检测到 ValueError (内容/参数错误)，不可重试: {str(exception)[:200]}",
            "ERROR"
        )
        return False

    # 4b. 不可重试的错误（明确排除字符串关键词）
    non_retryable_indicators = [
        '400',  # Bad Request
        '401',  # Unauthorized
        '403',  # Forbidden
        '404',  # Not Found
        'invalid api key',
        'authentication failed',
        'refusal',  # 内容审核拒绝
        'prohibited',
        'blocked by policy',
        'invalid request'
    ]

    for indicator in non_retryable_indicators:
        if indicator in error_str:
            log_provider_message(
                'retry_utils',
                f"检测到不可重试错误: {error_type} - {str(exception)[:200]}",
                "ERROR"
            )
            return False

    # 5. 默认策略：未知错误不重试（保守策略）
    log_provider_message(
        'retry_utils',
        f"未知错误类型，不重试: {error_type} - {str(exception)[:200]}",
        "WARNING"
    )
    return False


# ============================================================================
# 重试装饰器
# ============================================================================

def common_retry_strategy(func: Callable) -> Callable:
    """
    通用重试策略装饰器

    重试配置：
    - 最大重试次数: 5 次
    - 退避策略: 指数退避 (2^n 秒，最小 2 秒，最大 60 秒)
    - 重试条件: 仅重试可重试的错误 (is_retryable_error)
    - 最终行为: 重新抛出异常 (reraise=True)

    退避时间示例：
    - 第 1 次重试: 等待 2 秒
    - 第 2 次重试: 等待 4 秒
    - 第 3 次重试: 等待 8 秒
    - 第 4 次重试: 等待 16 秒
    - 第 5 次重试: 等待 32 秒

    Args:
        func: 被装饰的函数

    Returns:
        Callable: 装饰后的函数

    Example:
        @common_retry_strategy
        def generate_single(self, prompt, image, ...):
            # API 调用逻辑
            pass
    """
    # 创建一个 logger 用于 tenacity 的日志回调
    retry_logger = logging.getLogger('retry_strategy')

    @retry(
        # 重试条件：仅重试可重试的错误
        retry=retry_if_exception(is_retryable_error),

        # 停止条件：最多 5 次重试
        stop=stop_after_attempt(5),

        # 等待策略：指数退避
        wait=wait_exponential(multiplier=1, min=2, max=60),

        # 重新抛出最后的异常
        reraise=True,

        # 重试前回调：记录日志
        before_sleep=before_sleep_log(retry_logger, logging.WARNING),

        # 重试后回调：记录日志
        after=after_log(retry_logger, logging.INFO)
    )
    def wrapper(*args, **kwargs):
        # 记录函数调用
        func_name = func.__name__
        log_provider_message(
            'retry_utils',
            f"执行 {func_name}，已启用重试保护",
            "INFO"
        )

        try:
            result = func(*args, **kwargs)
            return result
        except Exception as e:
            # 记录最终失败
            log_error(
                '重试全部失败',
                f"{func_name} 在 5 次重试后仍然失败",
                f"错误: {str(e)[:200]}"
            )
            raise

    return wrapper


# ============================================================================
# 辅助函数：手动重试逻辑（备用）
# ============================================================================

def retry_with_backoff(
    func: Callable,
    max_attempts: int = 5,
    initial_delay: float = 2.0,
    max_delay: float = 60.0,
    backoff_factor: float = 2.0
) -> Callable:
    """
    手动实现的重试装饰器（不依赖 tenacity）

    这是一个备用实现，用于特殊场景或调试
    推荐使用 common_retry_strategy 装饰器

    Args:
        func: 被装饰的函数
        max_attempts: 最大尝试次数（包括第一次）
        initial_delay: 初始延迟（秒）
        max_delay: 最大延迟（秒）
        backoff_factor: 退避倍数

    Returns:
        Callable: 装饰后的函数
    """
    import time

    def wrapper(*args, **kwargs):
        attempt = 0
        delay = initial_delay

        while attempt < max_attempts:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                attempt += 1

                # 检查是否应该重试
                if not is_retryable_error(e):
                    raise

                # 达到最大重试次数
                if attempt >= max_attempts:
                    log_error(
                        '手动重试失败',
                        f"{func.__name__} 在 {max_attempts} 次尝试后失败",
                        str(e)
                    )
                    raise

                # 计算延迟时间
                current_delay = min(delay, max_delay)
                log_provider_message(
                    'retry_utils',
                    f"第 {attempt} 次重试失败，等待 {current_delay:.1f} 秒后重试...",
                    "WARNING"
                )

                time.sleep(current_delay)
                delay *= backoff_factor

        # 理论上不会到达这里
        raise RuntimeError(f"{func.__name__} 重试逻辑异常")

    return wrapper

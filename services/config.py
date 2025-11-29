"""配置中心 - 统一管理所有硬编码配置

此模块提供应用程序的集中配置管理，支持环境变量覆盖。
所有前后端配置从这里统一维护，确保配置一致性。
"""

import os
from typing import Dict, List, Any


class AppConfig:
    """应用配置中心 - 支持环境变量覆盖"""

    # === 全局默认值（支持环境变量覆盖）===
    DEFAULT_PROVIDER = os.getenv('DEFAULT_PROVIDER', 'google')
    DEFAULT_TEMPERATURE_EDIT = float(os.getenv('DEFAULT_TEMPERATURE_EDIT', '0.7'))
    DEFAULT_TEMPERATURE_GENERATE = float(os.getenv('DEFAULT_TEMPERATURE_GENERATE', '0.8'))

    # === Provider 配置字典 ===
    PROVIDERS = {
        'google': {
            'name': 'Google Gemini',
            'default_model': 'google/gemini-3-pro-image-preview',
            'api_key_prefix': 'AIza',
            'api_key_label': 'Google API Key',
            'api_key_placeholder': '输入您的 Google Gemini API Key',
            'models': [
                {'value': 'google/gemini-2.5-flash-image', 'text': 'gemini-2.5-flash-image'},
                {'value': 'google/gemini-3-pro-image-preview', 'text': 'gemini-3-pro-image-preview'}
            ]
        },
        'openrouter': {
            'name': 'OpenRouter',
            'default_model': 'google/gemini-2.5-flash-image-preview:free',
            'api_key_prefix': 'sk-or-',
            'api_key_label': 'OpenRouter API Key',
            'api_key_placeholder': '输入您的 OpenRouter API Key',
            'base_url': 'https://openrouter.ai/api/v1/chat/completions',
            'models': [
                {'value': 'google/gemini-2.5-flash-image-preview:free', 'text': 'OpenRouter - Gemini Flash (免费)'},
                {'value': 'google/gemini-2.5-flash-image-preview', 'text': 'OpenRouter - Gemini Flash (标准)'}
            ],
            # 模型特定参数配置
            'model_params': {
                'gemini': {'max_tokens': 4000, 'stream': False}
            }
        },
        'tuzi': {
            'name': '兔子API',
            'default_model': 'gemini-3-pro-image-preview-2k',
            'api_key_prefix': 'sk-',
            'api_key_label': '兔子 API Key',
            'api_key_placeholder': '输入您的兔子 API Key (sk-开头)',
            'base_url': os.getenv('TUZI_BASE_URL', 'https://api.tu-zi.com/v1'),
            'models': [
                {'value': 'gemini-3-pro-image-preview', 'text': '兔子 - Gemini 3 Pro Image Preview'},
                {'value': 'gemini-3-pro-image-preview-2k', 'text': '兔子 - Gemini 3 Pro Image Preview 2k'},
                {'value': 'gemini-3-pro-image-preview-4k', 'text': '兔子 - Gemini 3 Pro Image Preview 4k'},
                {'value': 'gemini-2.5-flash-image-vip', 'text': '兔子 - Gemini 2.5 Flash Image VIP'},
                {'value': 'gemini-2.5-flash-image', 'text': '兔子 - Gemini 2.5 Flash Image'}
            ]
        }
    }


# === 配置访问函数 ===

def get_default_provider() -> str:
    """获取默认服务商"""
    return AppConfig.DEFAULT_PROVIDER


def get_default_temperature(mode: str = 'edit') -> float:
    """获取默认温度值

    Args:
        mode: 'edit' 或 'generate'，编辑模式或生成模式

    Returns:
        float: 对应模式的默认温度值
    """
    if mode == 'generate':
        return AppConfig.DEFAULT_TEMPERATURE_GENERATE
    return AppConfig.DEFAULT_TEMPERATURE_EDIT


def get_provider_config(provider_name: str) -> Dict[str, Any]:
    """获取指定服务商的配置

    Args:
        provider_name: 服务商名称（google, openrouter, tuzi）

    Returns:
        Dict: 服务商配置字典

    Raises:
        ValueError: 如果服务商名称不存在
    """
    if provider_name not in AppConfig.PROVIDERS:
        raise ValueError(f"未知的provider: {provider_name}")
    return AppConfig.PROVIDERS[provider_name]


def get_default_model(provider_name: str) -> str:
    """获取指定服务商的默认模型

    Args:
        provider_name: 服务商名称

    Returns:
        str: 默认模型名称
    """
    return get_provider_config(provider_name)['default_model']


def get_provider_base_url(provider_name: str) -> str:
    """获取指定服务商的 Base URL

    Args:
        provider_name: 服务商名称

    Returns:
        str: Base URL，如果不存在返回空字符串
    """
    return get_provider_config(provider_name).get('base_url', '')


def get_model_params(provider_name: str, model_name: str) -> Dict[str, Any]:
    """获取特定模型的参数配置

    用于获取特定模型的额外参数，如 OpenRouter 的 Gemini 模型特殊参数。

    Args:
        provider_name: 服务商名称
        model_name: 模型名称

    Returns:
        Dict: 模型参数字典，如果没有特殊参数返回空字典
    """
    config = get_provider_config(provider_name)
    model_params = config.get('model_params', {})

    # 查找匹配的模型参数配置
    for key, params in model_params.items():
        if key.lower() in model_name.lower():
            return params

    return {}


def get_frontend_config() -> Dict[str, Any]:
    """返回前端需要的完整配置

    此函数将后端配置转换为前端需要的格式，通过 /api/config 接口提供给前端。

    Returns:
        Dict: 包含所有前端需要的配置信息
    """
    frontend_providers = {}

    for provider_name, config in AppConfig.PROVIDERS.items():
        frontend_providers[provider_name] = {
            'name': config['name'],
            'apiKeyLabel': config['api_key_label'],
            'apiKeyPlaceholder': config['api_key_placeholder'],
            'apiKeyPrefix': config['api_key_prefix'],
            'defaultModel': config['default_model'],
            'models': config['models']
        }

    return {
        'defaultProvider': get_default_provider(),
        'defaultTemperature': {
            'edit': get_default_temperature('edit'),
            'generate': get_default_temperature('generate')
        },
        'providers': frontend_providers
    }

from .google import GoogleProvider
from .openrouter import OpenRouterProvider
from .tuzi import TuziProvider

def get_provider(provider_name: str, api_key: str):
    """根据服务商名称获取对应的服务商实例"""
    if provider_name == 'google':
        return GoogleProvider(api_key)
    elif provider_name == 'openrouter':
        return OpenRouterProvider(api_key)
    elif provider_name == 'tuzi':
        return TuziProvider(api_key)
    else:
        raise ValueError(f"未知的服务商: {provider_name}")
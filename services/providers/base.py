from abc import ABC, abstractmethod
from typing import Optional

class ImageProvider(ABC):
    @abstractmethod
    def generate(self, prompt: str, images: list, temperature: float, model: str, image_count: int, **kwargs) -> list[bytes]:
        """
        生成图像方法，所有子类必须实现

        Args:
            prompt: 用户指令
            images: 输入图片字节列表
            temperature: 温度参数 (0-1)
            model: 模型名称
            image_count: 生成图片数量
            **kwargs: 额外参数，例如：
                - aspect_ratio: 宽高比 (Google 专用)
                - resolution: 分辨率 (Google Pro 专用)

        Returns:
            list[bytes]: 生成的图片字节列表
        """
        pass

    @abstractmethod
    def generate_single(self, prompt: str, images: list, temperature: float, model: str, image: Optional[bytes] = None, **kwargs) -> bytes:
        """
        生成单张图像（新增抽象方法）

        此方法用于并发场景，每次调用生成一张图片
        子类必须实现此方法并应用重试装饰器

        Args:
            prompt: 用户指令
            images: 输入图片字节列表（编辑模式）
            temperature: 温度参数 (0-1)
            model: 模型名称
            image: 单张图片字节（保留参数，某些 Provider 可能用到）
            **kwargs: 额外参数

        Returns:
            bytes: 单张图片的字节数据

        Raises:
            RuntimeError: 生成失败
            ValueError: 参数错误或内容审核拒绝
        """
        pass
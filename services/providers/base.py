from abc import ABC, abstractmethod

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
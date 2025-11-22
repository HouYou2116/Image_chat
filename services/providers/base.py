from abc import ABC, abstractmethod

class ImageProvider(ABC):
    @abstractmethod
    def generate(self, prompt: str, images: list, temperature: float, model: str, image_count: int) -> list[bytes]:
        """生成图像方法，所有子类必须实现"""
        pass
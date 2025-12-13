"""
API 蓝图模块

将原 routes/api.py 拆分为多个子模块：
- images.py: 图像编辑和生成相关路由
- prompts.py: 提示词库相关路由

所有子模块共享同一个 Blueprint (api_bp)，保持 URL 路径不变
"""

from flask import Blueprint

# 创建 API Blueprint
api_bp = Blueprint('api', __name__, url_prefix='/api')

# 导入子模块以注册路由
# 注意：必须在创建 api_bp 之后导入，避免循环依赖
from . import images
from . import prompts

# 导出 api_bp 供 app.py 使用
__all__ = ['api_bp']

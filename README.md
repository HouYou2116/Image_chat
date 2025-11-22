# Image Chat - 模块化AI图像编辑与生成系统

基于多AI提供商的智能图像编辑和生成工具，采用现代化模块化架构，支持自然语言指令进行图像编辑和生成。

## 🌟 功能特性

- 🖼️ **双模式操作**：图像编辑模式和图像生成模式
- 🤖 **多AI提供商支持**：Google Gemini、OpenRouter、TuZi
- 🏗️ **模块化架构**：基于Flask Blueprint和Provider模式的现代架构
- 💬 **自然语言指令**：支持自然语言描述进行图像编辑和生成
- 📱 **响应式界面**：现代化Web界面，支持桌面和移动设备
- 🔢 **批量生成**：支持一次生成1-4张图像变体
- 🔐 **前端API Key管理**：提供商特定的API密钥存储
- ⬇️ **一键下载**：自动保存到本地output目录
- 🌡️ **温度控制**：编辑模式0.7，生成模式0.8
- 🧩 **可扩展设计**：易于添加新的AI提供商

## 🏗️ 架构概览

本项目采用现代化的模块化架构，将功能清晰地分离为不同的层次：

### 架构设计原则

- **关注点分离**：路由、业务逻辑和提供商实现完全分离
- **可扩展性**：基于抽象基类的Provider模式，易于扩展新提供商
- **模块化路由**：使用Flask Blueprint组织路由
- **工厂模式**：动态提供商选择和管理

### 核心组件

- **服务层（Services）**：业务逻辑和AI提供商实现
- **路由层（Routes）**：API端点和页面路由
- **入口层（app.py）**：应用工厂和配置管理

## 📁 项目结构

```
Image_chat/
├── app.py                      # 应用入口文件，包含应用工厂
├── routes/                     # Flask蓝图模块
│   ├── __init__.py            # 路由模块初始化
│   ├── main.py                # 主要路由（首页、下载）
│   └── api.py                 # API路由（图像操作）
├── services/                   # 业务逻辑层
│   ├── __init__.py            # 服务模块初始化
│   └── providers/             # AI提供商实现
│       ├── __init__.py        # 提供商工厂函数
│       ├── base.py            # 抽象基类 ImageProvider
│       ├── google.py          # Google提供商实现
│       ├── openrouter.py      # OpenRouter提供商实现
│       └── tuzi.py            # TuZi提供商实现
├── templates/                  # 前端模板
│   └── index.html             # 主界面模板
├── static/                     # 静态资源
│   ├── style.css              # 响应式样式
│   └── script.js              # 前端交互逻辑
├── output/                     # 生成/编辑结果保存目录
├── requirements.txt            # Python依赖
├── README.md                   # 项目文档
└── CLAUDE.md                   # Claude Code指导文档
```

## 🚀 安装和使用

### 1. 环境准备

```bash
# 克隆或下载项目
cd Image_chat

# 创建虚拟环境（推荐）
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 启动应用

```bash
# 启动 Flask 开发服务器
python app.py

# 启用调试模式运行
python app.py --debug

# 在指定端口运行
python app.py --port 8080
```

应用将在 http://127.0.0.1:5000 启动

### 3. 测试和验证

```bash
# 运行基本语法和导入检查
python -m py_compile app.py

# 检查常见问题
python -m flake8 app.py routes/ services/ --max-line-length=120

# 验证模块化架构正确导入
python -c "import app; from services.providers import get_provider; print('模块化架构导入成功')"
```

## 📖 使用方法

### 图像编辑模式
1. 打开浏览器访问 http://127.0.0.1:5000
2. 选择AI提供商（Google Gemini、OpenRouter或TuZi）
3. 输入对应的API Key并点击"保存"
4. 选择"图像编辑"模式
5. 点击"选择图片"上传单张或多张图片
6. 在文本框输入编辑指令（例如："把背景变成海滩"、"将人物和风景合成一张图片"）
7. 选择生成变体数量（1-4张）
8. 点击"开始编辑"等待处理完成
9. 点击"下载图片"保存编辑结果

### 图像生成模式
1. 选择"图像生成"模式
2. 在文本框输入生成描述（例如："一只可爱的猫咪在花园里玩耍"）
3. 选择生成变体数量（1-4张）
4. 点击"开始生成"等待处理完成
5. 点击"下载图片"保存生成的图片

## 🔧 API文档

### 主要端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/` | GET | 主页面，提供Web界面 |
| `/api/edit-image` | POST | 图像编辑接口 |
| `/api/generate-image` | POST | 图像生成接口 |
| `/download/<filename>` | GET | 图像下载接口 |

### API请求格式

#### 图像编辑 API (`POST /api/edit-image`)

**表单参数：**
- `api_key`: API密钥
- `provider`: 提供商名称 (`google`/`openrouter`/`tuzi`)
- `model`: 模型名称（默认：`gemini-2.5-flash-image-preview`）
- `temperature`: 温度参数（默认：0.7）
- `instruction`: 编辑指令
- `image`: 上传的图片文件（支持多张）
- `image_count`: 生成图片数量（1-4）

**响应示例：**
```json
{
  "success": true,
  "images": [
    {
      "filename": "edited_20241121_143022_1.png",
      "download_url": "/download/edited_20241121_143022_1.png",
      "image_data": "base64编码的图片数据"
    }
  ],
  "count": 1
}
```

#### 图像生成 API (`POST /api/generate-image`)

**表单参数：**
- `api_key`: API密钥
- `provider`: 提供商名称
- `model`: 模型名称
- `temperature`: 温度参数（默认：0.8）
- `description`: 图像描述
- `image_count`: 生成图片数量（1-4）

**响应示例：**
```json
{
  "success": true,
  "images": [
    {
      "filename": "generated_20241121_143022_1.png",
      "download_url": "/download/generated_20241121_143022_1.png",
      "image_data": "base64编码的图片数据"
    }
  ],
  "count": 1
}
```

## 🔗 提供商配置

### Google Gemini 配置
- **模型**: `gemini-2.5-flash-image-preview`
- **API密钥格式**: 必须以 "AIza" 开头（从Google Cloud Console获取）
- **集成方式**: 使用 google-genai 库直接集成
- **数据处理**: 通过 PIL Image 对象处理，支持 inline_data 提取

### OpenRouter 配置
- **支持模型**: 多种图像生成模型变体
- **API密钥格式**: 必须以 "sk-or-" 开头（从OpenRouter平台获取）
- **响应解析**: 支持JSON、Base64、Markdown等多种格式
- **特殊配置**: 需要设置HTTP-Referer和X-Title请求头
- **速率限制**: 内置0.5秒延迟避免频率限制

### TuZi 提供商配置
- **基础URL**: `https://api.tu-zi.com/v1`
- **客户端**: 使用OpenAI兼容客户端
- **双重API**: 支持chat completions和images API两种方式
- **回退机制**: 主API失败时自动使用备用API
- **URL下载**: 支持从Markdown和HTTP链接下载图片

## 🛠️ 开发指南

### 添加新的AI提供商

1. **创建提供商类**：
   在 `services/providers/` 目录下创建新文件，继承 `ImageProvider` 基类

```python
from .base import ImageProvider

class NewProvider(ImageProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key
        # 初始化客户端

    def generate(self, prompt: str, images: list, temperature: float, model: str, image_count: int) -> list[bytes]:
        # 实现图像生成逻辑
        pass
```

2. **更新工厂函数**：
   在 `services/providers/__init__.py` 中添加新的提供商：

```python
def get_provider(provider_name: str, api_key: str):
    if provider_name == 'google':
        return GoogleProvider(api_key)
    elif provider_name == 'openrouter':
        return OpenRouterProvider(api_key)
    elif provider_name == 'tuzi':
        return TuziProvider(api_key)
    elif provider_name == 'new_provider':
        return NewProvider(api_key)
    else:
        raise ValueError(f"未知的服务商: {provider_name}")
```

### 扩展应用功能

1. **添加新路由**：
   - 在 `routes/` 目录下创建新的蓝图文件
   - 在 `app.py` 中注册新蓝图

2. **添加新服务**：
   - 在 `services/` 目录下创建新的服务模块
   - 通过依赖注入使用服务

### 代码组织模式

- **路由层**：只处理HTTP请求和响应，不包含业务逻辑
- **服务层**：包含业务逻辑，通过工厂模式获取提供商
- **提供商层**：实现具体的AI服务集成，遵循统一的接口

### 测试方法

```bash
# 测试模块导入
python -c "from routes.main import main_bp; from routes.api import api_bp; print('路由模块导入成功')"

# 测试提供商工厂
python -c "from services.providers import get_provider; print('提供商工厂测试成功')"

# 测试应用创建
python -c "from app import create_app; app = create_app(); print('应用工厂测试成功')"
```

## ⚡ 技术特性

### Provider模式优势

- **统一接口**: 所有提供商遵循相同的 `generate()` 方法签名
- **动态选择**: 运行时根据参数选择不同的提供商
- **易于扩展**: 添加新提供商只需实现抽象基类
- **独立维护**: 每个提供商的实现完全独立

### 响应处理能力

- **多格式支持**: JSON、Base64、Markdown、HTTP链接等
- **智能解析**: 自动检测和解析不同格式的响应
- **错误恢复**: 丰富的错误处理和回退机制
- **数据验证**: 全面的数据验证和异常处理

### 文件管理

- **自动保存**: 所有生成的图像自动保存到本地
- **时间戳命名**: 使用时间戳避免文件名冲突
- **格式转换**: 统一转换为PNG格式
- **内存优化**: 高效的内存使用和垃圾回收

## ⚠️ 注意事项

- **网络要求**: 确保网络连接正常，能够访问相应的AI服务API
- **文件大小**: 图片文件大小建议小于 20MB
- **处理时间**: API调用可能需要几秒到几十秒时间
- **存储空间**: 生成的图片会自动保存到 `output` 目录
- **API密钥安全**: API Key 仅存储在浏览器本地，按提供商分别管理
- **质量差异**: 不同提供商的响应时间和质量可能有差异

## 🔧 故障排除

### 常见问题

1. **模块导入错误**
   ```bash
   # 检查模块化架构是否正确
   python -c "import app; print('应用导入成功')"
   ```

2. **API Key 错误**
   - Google Gemini：确认 API Key 有效且有足够配额
   - OpenRouter：确认账户余额充足，API Key 权限正确
   - TuZi：确认 API Key 格式正确且有效

3. **图片上传失败**
   - 检查图片格式是否支持（JPG、PNG、WEBP等）
   - 确认文件大小不超过 20MB 限制
   - 检查 `output` 目录是否有写入权限

4. **处理失败**
   - 尝试更详细或更简洁的指令描述
   - 检查网络连接稳定性
   - 切换不同的AI提供商尝试

## 📋 技术要求

- **Python**: 3.7+
- **Web框架**: Flask 3.1.2
- **AI集成**:
  - google-genai 1.32.0 (Google Gemini)
  - requests 2.32.3 (OpenRouter & TuZi)
  - openai (TuZi provider)
- **图像处理**: Pillow 11.3.0
- **网络**: 稳定的网络连接
- **浏览器**: 支持的现代浏览器（Chrome、Firefox、Safari、Edge）
- **存储**: 足够的磁盘空间存储生成图片

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request 来改进这个项目。在提交代码时，请确保：

1. 遵循现有的代码风格和架构模式
2. 添加适当的错误处理和日志记录
3. 更新相关文档
4. 测试新功能的兼容性

## 📄 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。
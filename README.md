# Image Chat

基于 Flask 的 Web 应用，支持通过自然语言指令编辑图片或生成新图片。集成 Google Gemini、OpenRouter 和兔子 API 三大服务商，提供灵活的模型选择。

## ✨ 功能特性

### 🎨 双模式操作
- **图像编辑**：上传 1 张或多张图片，用自然语言描述修改需求
- **图像生成**：输入文字描述，一次生成 1-4 张图片

### 🌐 多服务商支持
- **Google Gemini**：官方 API，高质量图像处理
- **OpenRouter**：多模型接入(Gemini&GPT&FLUX)
- **兔子 API**：国内服务商，访问稳定

### ⚙️ 灵活配置
- 环境变量自定义默认设置
- 前端动态切换服务商和模型
- 独立的 API Key 管理

### 📦 其他特性
- 本地保存所有生成图片
- 批量下载功能
- 完整的操作日志记录

## 🚀 快速开始

### 环境要求
- Python 3.7 或更高版本

### 安装步骤

#### 方式一：使用 uv（推荐）

1. **安装 uv**

   - **Windows**:
     ```powershell
     powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
     ```

   - **macOS/Linux**:
     ```bash
     curl -LsSf https://astral.sh/uv/install.sh | sh
     ```

2. **克隆项目**
   ```bash
   git clone <repository-url>
   cd Image_chat
   ```

3. **安装依赖**
   ```bash
   uv sync
   ```

4. **启动应用**
   ```bash
   uv run python app.py
   ```

5. **打开浏览器访问**
   ```
   http://127.0.0.1:5000
   ```

#### 方式二：使用传统 pip/venv

如果不想使用 uv，也可以使用传统的 pip 和 venv：

1. 克隆项目（或下载代码）
   ```bash
   git clone <repository-url>
   cd Image_chat
   ```

2. 创建虚拟环境
   ```bash
   python -m venv venv
   ```

3. 激活虚拟环境
   - Windows:
     ```bash
     venv\Scripts\activate
     ```
   - macOS/Linux:
     ```bash
     source venv/bin/activate
     ```

4. 安装依赖
   ```bash
   pip install -r requirements.txt
   ```

5. 启动应用
   ```bash
   python app.py
   ```

6. 打开浏览器访问
   ```
   http://127.0.0.1:5000
   ```

## 📖 使用指南

### 配置 API Key

首次使用需要配置至少一个服务商的 API Key。

#### 获取 API Key
- **Google Gemini**：访问 [Google AI Studio](https://makersuite.google.com/app/apikey) 申请（需要 Google 账号）
- **OpenRouter**：访问 [OpenRouter](https://openrouter.ai/) 注册并获取密钥
- **兔子 API**：访问[Tuzi](https://api.tu-zi.com/)平台注册获取

#### 在界面中配置
1. 在页面顶部选择服务商（Google / OpenRouter / 兔子）
2. 输入对应的 API Key
3. 点击"保存 API Key"按钮
4. 看到"API Key 已保存"提示即成功

> 💡 API Key 保存在浏览器本地，不会上传到服务器

### 图像编辑模式

1. 点击"选择图片"按钮上传图片
   - 支持单张图片编辑
   - 支持多张图片同时上传（用于合成、对比等）

2. 在"编辑指令"框中输入修改需求，例如：
   - "把背景改成星空"
   - "增加一只猫在前景"
   - "转换成油画风格"

3. （可选）调整参数：
   - 选择模型
   - 调整温度值（0-1）
   - 设置生成数量（1-4 张）

4. 点击"开始编辑"按钮

5. 等待处理完成，查看结果
   - 点击图片可放大查看
   - 单张下载或批量下载

### 图像生成模式

1. 切换到"生成模式"标签页

2. 在"图像描述"框中输入详细描述，例如：
   - "一只猫坐在月球上看地球"
   - "赛博朋克风格的城市夜景"
   - "梵高风格的向日葵"

3. （可选）调整参数：
   - 选择模型
   - 调整温度值
   - 设置生成数量（1-4 张）

4. 点击"开始生成"按钮

5. 查看和下载生成的图片

## ⚙️ 配置说明（可选）

### 环境变量配置

如果需要自定义默认设置，可以使用环境变量：

1. 复制示例文件
   ```bash
   cp .env.example .env
   ```

2. 编辑 `.env` 文件，可配置项：
   ```bash
   # 默认服务商（google / openrouter / tuzi）
   DEFAULT_PROVIDER=google
   
   # 默认温度值
   DEFAULT_TEMPERATURE_EDIT=0.7
   DEFAULT_TEMPERATURE_GENERATE=0.8
   
   # 兔子 API 地址（可选，用于自定义）
   TUZI_BASE_URL=https://api.tu-zi.com/v1
   
   # OpenRouter Headers（可选，用于生产环境）
   OPENROUTER_REFERER=http://localhost:5000
   OPENROUTER_TITLE=Image CHAT
   ```

3. 重启应用使配置生效

> 💡 环境变量是可选的，不配置也能正常使用
> 💡 OpenRouter Headers 为可选配置，用于满足 OpenRouter API 的要求。开发环境使用默认值即可，生产环境建议设置为实际域名。

## 🎯 支持的模型

### Google Gemini
- `gemini-2.5-flash-image` - Gemini 2.5 Flash Image
- `gemini-3-pro-image-preview` - Gemini 3 Pro Image Preview

### OpenRouter
- `google/gemini-2.5-flash-image` - Gemini 2.5 Flash 
- `google/gemini-3-pro-image-preview` - Gemini 3 Pro Image
- `openai/gpt-5-image-mini` - GPT-5 Image Mini
- `openai/gpt-5-image` - GPT-5 Image
- `black-forest-labs/flux.2-flex` - Flux 2 Flex
- `black-forest-labs/flux.2-pro` - Flux 2 Pro

### 兔子 API
- `gemini-2.5-flash-image` - Gemini 2.5 Flash
- `gemini-2.5-flash-image-vip` - Gemini 2.5 Flash VIP
- `gemini-3-pro-image-preview` - Gemini 3 Pro
- `gemini-3-pro-image-preview-2k` - Gemini 3 Pro 2K
- `gemini-3-pro-image-preview-4k` - Gemini 3 Pro 4K

## 📁 项目结构

```
Image_chat/
├── app.py                          # 应用入口
├── requirements.txt                # 依赖清单
├── README.md                       # 项目文档
├── .env.example                    # 环境变量示例
│
├── routes/                         # 路由层
│   ├── main.py                     # 主页和下载
│   └── api.py                      # API 接口
│
├── services/                       # 业务逻辑
│   ├── config.py                   # 配置管理
│   ├── image_service.py            # 图像处理
│   ├── logging_config.py           # 日志配置
│   └── providers/                  # AI 服务商实现
│       ├── google.py               # Google Gemini
│       ├── openrouter.py           # OpenRouter
│       └── tuzi.py                 # 兔子 API
│
├── templates/                      # HTML 模板
│   └── index.html                  # 主界面
│
├── static/                         # 静态资源
│   ├── style.css                   # 样式
│   └── script.js                   # 前端逻辑
│
├── logs/                           # 日志目录（自动创建）
└── output/                         # 生成图片存储（自动创建）
```

## ❓ 常见问题

### API Key 格式错误？

每个服务商的 API Key 格式不同：
- **Google Gemini**：以 `AIza` 开头
- **OpenRouter**：以 `sk-or-` 开头
- **兔子 API**：以 `sk-` 开头

请检查是否复制完整，前后是否有多余空格。

### 图片上传失败？

- 确保图片文件大小不超过 20MB
- 支持的格式：JPG、PNG、WEBP
- 检查浏览器控制台是否有错误提示

### 如何查看日志？

应用日志保存在 `logs/app.log` 文件中。

- **Windows**：
  ```bash
  Get-Content logs\app.log -Wait
  ```

- **macOS/Linux**：
  ```bash
  tail -f logs/app.log
  ```

## 📦 依赖说明

主要依赖库：

- **Flask** (3.1.2) - Web 框架
- **google-genai** (1.53.0) - Google Gemini API 客户端
- **openai** (>=1.0.0) - OpenAI 兼容接口（用于兔子 API）
- **requests** (2.32.3) - HTTP 请求库
- **Pillow** (11.3.0) - 图像处理库

## 🛠️ 开发说明

### 运行测试

```bash
# 语法检查
python -m py_compile app.py routes/*.py services/providers/*.py

# 代码检查
python -m flake8 . --max-line-length=120 --exclude=venv,__pycache__

# 测试导入
python -c "from app import create_app; print('All imports successful')"
```

### uv 包管理常用命令

如果使用 uv 进行包管理，以下是常用命令：

```bash
# 安装/同步依赖
uv sync

# 运行应用
uv run python app.py

# 添加新依赖包
uv add <package-name>

# 移除依赖包
uv remove <package-name>

# 更新依赖到最新版本
uv lock --upgrade

# 导出 requirements.txt
uv export --format requirements-txt --no-hashes > requirements.txt

# 查看依赖树
uv tree
```

### 查看日志

```bash
# 实时查看日志
tail -f logs/app.log  # Unix
Get-Content logs\app.log -Wait  # Windows

# 过滤特定服务商日志
grep "google_provider" logs/app.log
```


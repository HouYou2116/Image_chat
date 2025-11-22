from flask import Flask, request
import os
import logging
from datetime import datetime
from routes.main import main_bp
from routes.api import api_bp
from services.logging_config import log_http_request, flask_logger

def create_app():
    app = Flask(__name__)

    # 确保输出目录存在
    os.makedirs('output', exist_ok=True)

    # 添加请求日志中间件
    @app.before_request
    def before_request():
        flask_logger.info(f"开始处理请求: {request.method} {request.path}")

    @app.after_request
    def after_request(response):
        # 记录HTTP请求日志，格式与problems.md一致
        log_http_request(
            remote_addr=request.remote_addr or '127.0.0.1',
            method=request.method,
            path=request.path,
            status_code=response.status_code
        )

        # 记录响应详情
        if response.status_code >= 400:
            flask_logger.warning(f"HTTP错误响应 {response.status_code}: {request.method} {request.path}")

        return response

    # 添加应用启动日志
    flask_logger.info("Image Chat应用启动")
    flask_logger.info(f"输出目录: {os.path.abspath('output')}")
    flask_logger.info(f"已注册蓝图: main, api")

    # 注册蓝图
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp)

    return app

if __name__ == '__main__':
    # 记录应用启动信息
    flask_logger.info("启动Flask开发服务器...")
    flask_logger.info("调试模式: 启用")
    flask_logger.info("服务器地址: http://127.0.0.1:5000")
    flask_logger.info("按 CTRL+C 退出")

    app = create_app()
    app.run(debug=True, host='127.0.0.1', port=5000)
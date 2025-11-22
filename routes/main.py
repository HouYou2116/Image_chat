from flask import Blueprint, render_template, send_from_directory

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    return render_template('index.html')

@main_bp.route('/download/<filename>')
def download_file(filename):
    return send_from_directory('output', filename)
"""
消耗品管理システム - メインアプリケーション
"""
from __future__ import annotations

from pathlib import Path

from flask import Flask, render_template, send_from_directory, make_response, jsonify
from flask_cors import CORS

import config
from routes.inventory import inventory_bp
from routes.orders import orders_bp
from routes.consumables import consumables_bp
from routes.suppliers import suppliers_bp
from routes.employees import employees_bp
from routes.history import history_bp

# Flaskアプリケーション初期化
app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False  # 日本語をそのまま出力
CORS(app)

# アップロード設定
app.config["UPLOAD_FOLDER"] = str(config.UPLOAD_FOLDER)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB max

# 必要なディレクトリを作成
config.IMAGES_FOLDER.mkdir(parents=True, exist_ok=True)
config.PDF_FOLDER.mkdir(parents=True, exist_ok=True)

# Blueprintを登録
app.register_blueprint(inventory_bp)
app.register_blueprint(orders_bp)
app.register_blueprint(consumables_bp)
app.register_blueprint(suppliers_bp)
app.register_blueprint(employees_bp)
app.register_blueprint(history_bp)


@app.route("/")
def index():
    """メインページ"""
    return render_template("index.html")


@app.route("/download/consumables-template")
def download_consumables_template():
    """CSVテンプレートをダウンロード"""
    template_path = config.SAMPLES_FOLDER / config.CSV_TEMPLATE_NAME
    if not template_path.exists():
        return jsonify({"success": False, "error": "テンプレートが見つかりません"}), 404

    content = template_path.read_text(encoding="utf-8")
    response = make_response(content.encode("utf-8-sig"))
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers[
        "Content-Disposition"
    ] = f"attachment; filename*=UTF-8''{config.CSV_TEMPLATE_NAME}"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    """アップロードファイルを配信"""
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


if __name__ == "__main__":
    # HTTPS対応（証明書を使用）
    cert_file = Path(__file__).parent / ".streamlit" / "cert.pem"
    key_file = Path(__file__).parent / ".streamlit" / "key.pem"

    if cert_file.exists() and key_file.exists():
        app.run(
            host="0.0.0.0",
            port=8504,
            debug=True,
            ssl_context=(str(cert_file), str(key_file)),
        )
    else:
        print("証明書が見つかりません。HTTPで起動します。")
        app.run(host="0.0.0.0", port=8504, debug=True)

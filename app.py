"""
消耗品管理システム - メインアプリケーション
"""
from __future__ import annotations

from pathlib import Path
import os

# 環境変数の読み込み
from dotenv import load_dotenv
load_dotenv()  # .envファイルから環境変数を読み込む

from flask import Flask, render_template, send_from_directory, make_response, jsonify, session, redirect, url_for
from flask_cors import CORS
from datetime import timedelta

import config
from routes.inventory import inventory_bp
from routes.orders import orders_bp
from routes.consumables import consumables_bp
from routes.suppliers import suppliers_bp
from routes.employees import employees_bp
from routes.history import history_bp
from routes.users import users_bp
from routes.dispatch import dispatch_bp

# Flaskアプリケーション初期化
app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False  # 日本語をそのまま出力
app.config['SECRET_KEY'] = 'your-secret-key-change-this-in-production'  # セッション用の秘密鍵
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)  # セッション有効期限
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
app.register_blueprint(users_bp)
app.register_blueprint(dispatch_bp)


@app.route("/")
def index():
    """メインページ（認証が必要）"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template("index.html")


@app.route("/login")
def login():
    """ログインページ"""
    # 既にログイン済みの場合はメインページへ
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template("login.html")


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


@app.route("/download/suppliers-template")
def download_suppliers_template():
    """購入先CSVテンプレートをダウンロード"""
    template_path = config.SAMPLES_FOLDER / config.SUPPLIERS_TEMPLATE_NAME
    if not template_path.exists():
        return jsonify({"success": False, "error": "テンプレートが見つかりません"}), 404

    content = template_path.read_text(encoding="utf-8")
    response = make_response(content.encode("utf-8-sig"))
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers[
        "Content-Disposition"
    ] = f"attachment; filename*=UTF-8''{config.SUPPLIERS_TEMPLATE_NAME}"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/manual")
def manual():
    """操作マニュアルをHTMLで表示"""
    import markdown as md
    manual_path = Path(__file__).parent / "docs" / "MANUAL.md"
    text = manual_path.read_text(encoding="utf-8")
    body = md.markdown(text, extensions=["tables", "toc", "fenced_code"])
    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>操作マニュアル - 消耗品管理システム</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         max-width: 900px; margin: 40px auto; padding: 0 24px; color: #333; line-height: 1.7; }}
  h1 {{ color: #00796B; border-bottom: 3px solid #009688; padding-bottom: 12px; }}
  h2 {{ color: #00796B; border-bottom: 1px solid #b2dfdb; padding-bottom: 6px; margin-top: 40px; }}
  h3 {{ color: #00897B; margin-top: 24px; }}
  table {{ border-collapse: collapse; width: 100%; margin: 16px 0; }}
  th {{ background: #009688; color: white; padding: 10px 14px; text-align: left; }}
  td {{ padding: 9px 14px; border: 1px solid #ddd; }}
  tr:nth-child(even) {{ background: #f5f5f5; }}
  code {{ background: #e8f5e9; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
  pre {{ background: #263238; color: #cfd8dc; padding: 16px; border-radius: 6px; overflow-x: auto; }}
  pre code {{ background: none; color: inherit; padding: 0; }}
  blockquote {{ border-left: 4px solid #009688; margin: 0; padding: 8px 16px; background: #e0f2f1; }}
  .toc {{ background: #f9f9f9; border: 1px solid #ddd; padding: 16px 24px; border-radius: 6px; margin-bottom: 32px; }}
  .toc ul {{ margin: 0; }}
  a {{ color: #00796B; }}
  @media print {{ body {{ margin: 20px; }} }}
</style>
</head>
<body>
{body}
</body>
</html>"""
    return html


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
            ssl_context=(str(cert_file), str(key_file)),
        )
    else:
        print("証明書が見つかりません。HTTPで起動します。")
        app.run(host="0.0.0.0", port=8504)

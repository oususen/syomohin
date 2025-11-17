"""
消耗品管理システム設定ファイル
"""
from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# ベースディレクトリ
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=False)

# アップロード設定
UPLOAD_FOLDER = BASE_DIR / "uploads"
IMAGES_FOLDER = UPLOAD_FOLDER / "images"
PDF_FOLDER = UPLOAD_FOLDER / "pdfs"
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif"}
ALLOWED_PDF_EXTENSIONS = {"pdf"}
SAMPLES_FOLDER = BASE_DIR / "static" / "samples"
CSV_TEMPLATE_NAME = "consumables_template.csv"
SUPPLIERS_TEMPLATE_NAME = "suppliers_template.csv"

# Flaskアプリ設定
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max

# SMTP設定
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in {"1", "true", "yes"}
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USER

# SQL文
CONSUMABLE_INSERT_SQL = """
    INSERT INTO consumables (
        code, order_code, name, category, unit,
        stock_quantity, safety_stock, unit_price, order_unit,
        supplier_id, storage_location, image_path, note,
        order_status, shortage_status
    ) VALUES (
        :code, :order_code, :name, :category, :unit,
        :stock_quantity, :safety_stock, :unit_price, :order_unit,
        :supplier_id, :storage_location, :image_path, :note,
        :order_status, :shortage_status
    )
"""

# CSVフィールドマッピング
CSV_FIELD_ALIASES = {
    "code": "code",
    "コード": "code",
    "品目コード": "code",
    "order_code": "order_code",
    "注文コード": "order_code",
    "name": "name",
    "品名": "name",
    "category": "category",
    "カテゴリ": "category",
    "unit": "unit",
    "単位": "unit",
    "stock_quantity": "stock_quantity",
    "在庫数": "stock_quantity",
    "safety_stock": "safety_stock",
    "安全在庫": "safety_stock",
    "unit_price": "unit_price",
    "単価": "unit_price",
    "order_unit": "order_unit",
    "発注単位": "order_unit",
    "supplier_id": "supplier_id",
    "supplier": "supplier_name",
    "supplier_name": "supplier_name",
    "仕入先": "supplier_name",
    "storage_location": "storage_location",
    "保管場所": "storage_location",
    "note": "note",
    "備考": "note",
    "image_path": "image_path",
    "画像パス": "image_path",
    "order_status": "order_status",
    "注文状態": "order_status",
    "shortage_status": "shortage_status",
    "欠品状態": "shortage_status",
}

# Unicode文字も含めて追加
CSV_FIELD_ALIASES.update({
    "\u30b3\u30fc\u30c9": "code",
    "\u54c1\u76ee\u30b3\u30fc\u30c9": "code",
    "\u6ce8\u6587\u30b3\u30fc\u30c9": "order_code",
    "\u54c1\u540d": "name",
    "\u30ab\u30c6\u30b4\u30ea": "category",
    "\u5358\u4f4d": "unit",
    "\u5728\u5eab\u6570": "stock_quantity",
    "\u5b89\u5168\u5728\u5eab": "safety_stock",
    "\u5358\u4fa1": "unit_price",
    "\u767a\u6ce8\u5358\u4f4d": "order_unit",
    "\u4ed5\u5165\u5148": "supplier_name",
    "\u4fdd\u7ba1\u5834\u6240": "storage_location",
    "\u5099\u8003": "note",
    "\u753b\u50cfURL": "image_path",
    "\u753b\u50cf\u30d1\u30b9": "image_path",
    "\u6ce8\u6587\u72b6\u614b": "order_status",
    "\u6b20\u54c1\u72b6\u614b": "shortage_status",
})

CSV_REQUIRED_FIELDS = {"code", "name"}


def init_directories():
    """必要なディレクトリを作成"""
    IMAGES_FOLDER.mkdir(parents=True, exist_ok=True)
    PDF_FOLDER.mkdir(parents=True, exist_ok=True)

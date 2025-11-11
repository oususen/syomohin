from __future__ import annotations

import base64
from datetime import datetime
from io import BytesIO, TextIOWrapper
from pathlib import Path

import csv
import cv2
import numpy as np
from database_manager import get_db_manager
from flask import Flask, jsonify, render_template, request, send_from_directory, make_response
from flask_cors import CORS
from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

# アップロード設定
UPLOAD_FOLDER = Path(__file__).parent / "uploads"
IMAGES_FOLDER = UPLOAD_FOLDER / "images"
PDF_FOLDER = UPLOAD_FOLDER / "pdfs"
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif"}
ALLOWED_PDF_EXTENSIONS = {"pdf"}
SAMPLES_FOLDER = Path(__file__).parent / "static" / "samples"
CSV_TEMPLATE_NAME = "consumables_template.csv"

# ディレクトリ作成
IMAGES_FOLDER.mkdir(parents=True, exist_ok=True)
PDF_FOLDER.mkdir(parents=True, exist_ok=True)

app.config["UPLOAD_FOLDER"] = str(UPLOAD_FOLDER)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB max


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
    "shortage_status": "shortage_status",
}

CSV_REQUIRED_FIELDS = {"code", "name"}


def resolve_csv_field(field_name: str | None) -> str | None:
    if not field_name:
        return None

    key = field_name.strip()
    lower_key = key.lower()
    return CSV_FIELD_ALIASES.get(key) or CSV_FIELD_ALIASES.get(lower_key) or lower_key


def normalize_csv_row(row: dict[str, str | None]) -> dict[str, str | None]:
    normalized: dict[str, str | None] = {}
    for raw_key, raw_value in row.items():
        target_key = resolve_csv_field(raw_key)
        if not target_key:
            continue
        if isinstance(raw_value, str):
            normalized[target_key] = raw_value.strip()
        else:
            normalized[target_key] = raw_value
    return normalized


def parse_int(value: str | int | float | None, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    cleaned = value.strip().replace(",", "")
    if cleaned == "":
        return default
    try:
        return int(float(cleaned))
    except (ValueError, TypeError):
        return default


def parse_float(value: str | int | float | None, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = value.strip().replace(",", "")
    if cleaned == "":
        return default
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return default


def resolve_supplier_id(db, row: dict[str, str | None], cache: dict[str, int | None]) -> int | None:
    supplier_id_value = row.get("supplier_id")
    if supplier_id_value not in (None, ""):
        try:
            parsed = int(float(str(supplier_id_value)))
            if parsed > 0:
                return parsed
        except (ValueError, TypeError):
            pass

    supplier_name = row.get("supplier_name")
    if not supplier_name:
        return None

    supplier_name = supplier_name.strip()
    if not supplier_name:
        return None

    if supplier_name not in cache:
        result = db.execute_query(
            "SELECT id FROM suppliers WHERE name = :name",
            {"name": supplier_name},
        )
        cache[supplier_name] = int(result.iloc[0]["id"]) if not result.empty else None

    return cache[supplier_name]


def allowed_file(filename: str, allowed_extensions: set) -> bool:
    """ファイル拡張子のチェック"""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_extensions


def decode_qr_from_image(image_bytes: bytes) -> str | None:
    """画像からQRコードを読み取る"""
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        rgb_array = np.array(image)
        bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
        detector = cv2.QRCodeDetector()
        data, points, _ = detector.detectAndDecode(bgr_array)
        return data or None
    except Exception:
        return None


@app.route("/")
def index():
    """メインページ"""
    return render_template("index.html")


@app.route("/download/consumables-template")
def download_consumables_template():
    """CSVテンプレートをダウンロード"""
    template_path = SAMPLES_FOLDER / CSV_TEMPLATE_NAME
    if not template_path.exists():
        return jsonify({"success": False, "error": "テンプレートが見つかりません"}), 404

    content = template_path.read_text(encoding="utf-8")
    response = make_response(content.encode("utf-8-sig"))
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers[
        "Content-Disposition"
    ] = f"attachment; filename*=UTF-8''{CSV_TEMPLATE_NAME}"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/api/inventory")
def get_inventory():
    """在庫データを取得するAPI"""
    try:
        db = get_db_manager()

        # クエリパラメータからフィルター条件を取得
        qr_code = request.args.get("qr_code", "").strip()
        search_text = request.args.get("search_text", "").strip()
        order_status = request.args.get("order_status", "").strip()
        shortage_status = request.args.get("shortage_status", "").strip()

        # ベースクエリ
        query = """
            SELECT
                c.id,
                c.code AS コード,
                c.order_code AS 発注コード,
                c.name AS 品名,
                c.category AS カテゴリ,
                c.unit AS 単位,
                c.stock_quantity AS 在庫数,
                c.safety_stock AS 安全在庫,
                c.order_status AS 注文状態,
                c.shortage_status AS 欠品状態,
                s.name AS 購入先,
                c.image_path AS 画像URL,
                c.note AS 備考
            FROM consumables c
            LEFT JOIN suppliers s ON c.supplier_id = s.id
            WHERE 1=1
        """
        params = {}

        # フィルター条件を追加
        if qr_code:
            query += " AND LOWER(c.code) = LOWER(:qr_code)"
            params["qr_code"] = qr_code

        if search_text:
            query += " AND c.name LIKE :search_text"
            params["search_text"] = f"%{search_text}%"

        if order_status and order_status != "すべて":
            query += " AND c.order_status = :order_status"
            params["order_status"] = order_status

        if shortage_status and shortage_status != "すべて":
            query += " AND c.shortage_status = :shortage_status"
            params["shortage_status"] = shortage_status

        query += " ORDER BY c.code"

        # データ取得
        df = db.execute_query(query, params)

        # 全件数取得
        total_df = db.execute_query("SELECT COUNT(*) as total FROM consumables")
        total = int(total_df.iloc[0]["total"]) if not total_df.empty else 0

        # JSON形式で返す
        return jsonify(
            {
                "success": True,
                "data": df.to_dict(orient="records"),
                "total": total,
                "filtered": len(df),
            }
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/decode-qr", methods=["POST"])
def decode_qr():
    """QRコードを解析するAPI"""
    try:
        data = request.get_json()
        if not data or "image" not in data:
            return jsonify({"success": False, "error": "画像データがありません"}), 400

        # base64画像をデコード
        image_data = data["image"].split(",")[1]
        image_bytes = base64.b64decode(image_data)

        # QRコード読み取り
        decoded_value = decode_qr_from_image(image_bytes)

        if decoded_value:
            return jsonify({"success": True, "data": decoded_value})
        else:
            return jsonify({"success": False, "error": "QRコードを認識できませんでした"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/filter-options")
def get_filter_options():
    """フィルターの選択肢を取得するAPI"""
    try:
        db = get_db_manager()

        # 注文状態の選択肢
        order_status_df = db.execute_query(
            "SELECT DISTINCT order_status FROM consumables WHERE order_status IS NOT NULL ORDER BY order_status"
        )
        order_status_list = ["すべて"] + order_status_df["order_status"].tolist()

        # 欠品状態の選択肢
        shortage_status_df = db.execute_query(
            "SELECT DISTINCT shortage_status FROM consumables WHERE shortage_status IS NOT NULL ORDER BY shortage_status"
        )
        shortage_status_list = ["すべて"] + shortage_status_df["shortage_status"].tolist()

        return jsonify(
            {
                "success": True,
                "order_status": order_status_list,
                "shortage_status": shortage_status_list,
            }
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/outbound", methods=["POST"])
def create_outbound():
    """出庫を記録するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        # 必須パラメータチェック
        code = data.get("code")
        quantity = data.get("quantity")
        person = data.get("person")

        if not all([code, quantity, person]):
            return jsonify({"success": False, "error": "必須パラメータが不足しています"}), 400

        # 消耗品情報を取得
        item_df = db.execute_query(
            "SELECT id, name, stock_quantity, unit_price FROM consumables WHERE code = :code",
            {"code": code},
        )

        if item_df.empty:
            return jsonify({"success": False, "error": "商品が見つかりません"}), 404

        item = item_df.iloc[0]
        consumable_id = int(item["id"])
        current_stock = int(item["stock_quantity"])
        unit_price = float(item["unit_price"]) if item["unit_price"] else 0

        # 在庫チェック
        if current_stock < quantity:
            return jsonify({"success": False, "error": "在庫が不足しています"}), 400

        # 出庫履歴を登録
        total_amount = quantity * unit_price
        db.execute_update(
            """
            INSERT INTO outbound_history (
                consumable_id, code, name, quantity, employee_name,
                unit_price, total_amount, note, outbound_date
            ) VALUES (
                :consumable_id, :code, :name, :quantity, :employee_name,
                :unit_price, :total_amount, :note, NOW()
            )
            """,
            {
                "consumable_id": consumable_id,
                "code": code,
                "name": item["name"],
                "quantity": quantity,
                "employee_name": person,
                "unit_price": unit_price,
                "total_amount": total_amount,
                "note": data.get("note", ""),
            },
        )

        # 在庫数を減らす
        new_stock = current_stock - quantity
        db.execute_update(
            "UPDATE consumables SET stock_quantity = :stock WHERE id = :id",
            {"stock": new_stock, "id": consumable_id},
        )

        return jsonify({"success": True, "message": "出庫を記録しました", "new_stock": new_stock})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/inbound", methods=["POST"])
def create_inbound():
    """入庫を記録するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        # 必須パラメータチェック
        code = data.get("code")
        quantity = data.get("quantity")
        person = data.get("person")

        if not all([code, quantity, person]):
            return jsonify({"success": False, "error": "必須パラメータが不足しています"}), 400

        # 消耗品情報を取得
        item_df = db.execute_query(
            "SELECT id, name, stock_quantity, unit_price FROM consumables WHERE code = :code",
            {"code": code},
        )

        if item_df.empty:
            return jsonify({"success": False, "error": "商品が見つかりません"}), 404

        item = item_df.iloc[0]
        consumable_id = int(item["id"])
        current_stock = int(item["stock_quantity"])
        unit_price = float(item["unit_price"]) if item["unit_price"] else 0

        # 入庫履歴を登録
        total_amount = quantity * unit_price
        db.execute_update(
            """
            INSERT INTO inbound_history (
                consumable_id, code, name, quantity, employee_name,
                unit_price, total_amount, note, inbound_type, inbound_date
            ) VALUES (
                :consumable_id, :code, :name, :quantity, :employee_name,
                :unit_price, :total_amount, :note, :inbound_type, NOW()
            )
            """,
            {
                "consumable_id": consumable_id,
                "code": code,
                "name": item["name"],
                "quantity": quantity,
                "employee_name": person,
                "unit_price": unit_price,
                "total_amount": total_amount,
                "note": data.get("note", ""),
                "inbound_type": data.get("inbound_type", "手動"),
            },
        )

        # 在庫数を増やす
        new_stock = current_stock + quantity
        db.execute_update(
            "UPDATE consumables SET stock_quantity = :stock WHERE id = :id",
            {"stock": new_stock, "id": consumable_id},
        )

        return jsonify({"success": True, "message": "入庫を記録しました", "new_stock": new_stock})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/order", methods=["POST"])
def create_order():
    """注文依頼を記録するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        # 必須パラメータチェック
        code = data.get("code")
        quantity = data.get("quantity")
        requester = data.get("requester")

        if not all([code, quantity, requester]):
            return jsonify({"success": False, "error": "必須パラメータが不足しています"}), 400

        # 消耗品情報を取得
        item_df = db.execute_query(
            """
            SELECT c.id, c.name, c.unit, c.unit_price, c.supplier_id
            FROM consumables c
            WHERE c.code = :code
            """,
            {"code": code},
        )

        if item_df.empty:
            return jsonify({"success": False, "error": "商品が見つかりません"}), 404

        item = item_df.iloc[0]
        consumable_id = int(item["id"])
        unit_price = float(item["unit_price"]) if item["unit_price"] else 0
        total_amount = quantity * unit_price

        # 注文依頼を登録
        db.execute_update(
            """
            INSERT INTO orders (
                consumable_id, code, name, quantity, unit, unit_price, total_amount,
                deadline, requester_name, supplier_id, note,
                status, order_type, requested_date
            ) VALUES (
                :consumable_id, :code, :name, :quantity, :unit, :unit_price, :total_amount,
                :deadline, :requester_name, :supplier_id, :note,
                :status, :order_type, NOW()
            )
            """,
            {
                "consumable_id": consumable_id,
                "code": code,
                "name": item["name"],
                "quantity": quantity,
                "unit": item["unit"],
                "unit_price": unit_price,
                "total_amount": total_amount,
                "deadline": data.get("deadline", "通常"),
                "requester_name": requester,
                "supplier_id": item["supplier_id"],
                "note": data.get("note", ""),
                "status": "依頼中",
                "order_type": data.get("order_type", "手動"),
            },
        )

        return jsonify({"success": True, "message": "注文依頼を記録しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/orders")
def get_orders():
    """注文依頼一覧を取得するAPI（フィルタリング・ソート対応）"""
    try:
        db = get_db_manager()

        # クエリパラメータからフィルター条件を取得
        order_type = request.args.get("order_type", "")
        status = request.args.get("status", "")
        supplier_id = request.args.get("supplier_id", "")
        requester = request.args.get("requester", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        sort_by = request.args.get("sort_by", "requested_date")
        sort_order = request.args.get("sort_order", "DESC")

        # ベースクエリ
        query = """
            SELECT
                o.id,
                o.code,
                o.name,
                o.quantity,
                o.unit,
                o.unit_price,
                o.total_amount,
                o.deadline,
                o.requester_name,
                o.supplier_id,
                s.name AS supplier_name,
                o.status,
                o.order_type,
                o.requested_date,
                o.note
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE 1=1
        """
        params = {}

        # フィルター条件を追加
        if order_type:
            query += " AND o.order_type = :order_type"
            params["order_type"] = order_type

        if status:
            query += " AND o.status = :status"
            params["status"] = status

        if supplier_id:
            query += " AND o.supplier_id = :supplier_id"
            params["supplier_id"] = int(supplier_id)

        if requester:
            query += " AND o.requester_name LIKE :requester"
            params["requester"] = f"%{requester}%"

        if date_from:
            query += " AND DATE(o.requested_date) >= :date_from"
            params["date_from"] = date_from

        if date_to:
            query += " AND DATE(o.requested_date) <= :date_to"
            params["date_to"] = date_to

        # ソート（SQLインジェクション対策のため許可リストを使用）
        allowed_sort_columns = ["requested_date", "status", "supplier_name", "requester_name", "total_amount"]
        if sort_by in allowed_sort_columns:
            sort_order_safe = "DESC" if sort_order.upper() == "DESC" else "ASC"
            query += f" ORDER BY o.{sort_by} {sort_order_safe}"
        else:
            query += " ORDER BY o.requested_date DESC"

        df = db.execute_query(query, params)

        return jsonify({
            "success": True,
            "data": df.to_dict(orient="records"),
            "count": len(df)
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/orders/<int:order_id>", methods=["GET"])
def get_order_detail(order_id):
    """注文依頼の詳細を取得するAPI"""
    try:
        db = get_db_manager()

        query = """
            SELECT
                o.id,
                o.consumable_id,
                o.code,
                o.name,
                o.quantity,
                o.unit,
                o.unit_price,
                o.total_amount,
                o.deadline,
                o.requester_name,
                o.supplier_id,
                s.name AS supplier_name,
                s.contact AS supplier_contact,
                s.phone AS supplier_phone,
                s.email AS supplier_email,
                o.status,
                o.order_type,
                o.requested_date,
                o.note
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.id = :order_id
        """

        df = db.execute_query(query, {"order_id": order_id})

        if df.empty:
            return jsonify({"success": False, "error": "注文依頼が見つかりません"}), 404

        return jsonify({
            "success": True,
            "data": df.iloc[0].to_dict()
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/orders/<int:order_id>", methods=["PUT"])
def update_order_status(order_id):
    """注文依頼のステータスを更新するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        # 存在チェック
        existing = db.execute_query(
            "SELECT id, consumable_id FROM orders WHERE id = :id",
            {"id": order_id},
        )
        if existing.empty:
            return jsonify({"success": False, "error": "注文依頼が見つかりません"}), 404

        # ステータス更新
        new_status = data.get("status")
        if not new_status:
            return jsonify({"success": False, "error": "statusが指定されていません"}), 400

        db.execute_update(
            "UPDATE orders SET status = :status WHERE id = :id",
            {"status": new_status, "id": order_id},
        )

        # 消耗品テーブルの注文状態も更新
        consumable_id = int(existing.iloc[0]["consumable_id"])
        if new_status == "発注済":
            db.execute_update(
                "UPDATE consumables SET order_status = '発注済' WHERE id = :id",
                {"id": consumable_id},
            )
        elif new_status == "完了":
            db.execute_update(
                "UPDATE consumables SET order_status = '未発注' WHERE id = :id",
                {"id": consumable_id},
            )

        return jsonify({"success": True, "message": "ステータスを更新しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/orders/<int:order_id>", methods=["DELETE"])
def delete_order(order_id):
    """注文依頼を削除するAPI"""
    try:
        db = get_db_manager()

        # 存在チェック
        existing = db.execute_query(
            "SELECT id, consumable_id FROM orders WHERE id = :id",
            {"id": order_id},
        )
        if existing.empty:
            return jsonify({"success": False, "error": "注文依頼が見つかりません"}), 404

        # 注文依頼を削除
        db.execute_update(
            "DELETE FROM orders WHERE id = :id",
            {"id": order_id},
        )

        # 消耗品テーブルの注文状態をリセット
        consumable_id = int(existing.iloc[0]["consumable_id"])
        db.execute_update(
            "UPDATE consumables SET order_status = '未発注' WHERE id = :id",
            {"id": consumable_id},
        )

        return jsonify({"success": True, "message": "注文依頼を削除しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/consumables/import-csv", methods=["POST"])
def import_consumables_csv():
    """CSV���񂩂̓��Օi�ЂV�K�o�^"""
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "error": "CSVファイルが見つかりません"}), 400

        file = request.files["file"]
        if not file or file.filename == "":
            return jsonify({"success": False, "error": "CSVファイルを選択してください"}), 400

        rows = []
        fieldnames: list[str] = []
        text_stream: TextIOWrapper | None = None

        try:
            text_stream = TextIOWrapper(file.stream, encoding="utf-8-sig")
            reader = csv.DictReader(text_stream)
            rows = list(reader)
            fieldnames = reader.fieldnames or []
        except UnicodeDecodeError:
            file.stream.seek(0)
            text_stream = TextIOWrapper(file.stream, encoding="cp932")
            reader = csv.DictReader(text_stream)
            rows = list(reader)
            fieldnames = reader.fieldnames or []
        finally:
            if text_stream is not None:
                try:
                    text_stream.detach()
                except Exception:
                    pass

        if not rows:
            return jsonify({"success": False, "error": "CSVにデータがありません"}), 400

        normalized_headers = {
            resolve_csv_field(name) for name in fieldnames if resolve_csv_field(name)
        }
        missing_headers = CSV_REQUIRED_FIELDS - normalized_headers
        if missing_headers:
            missing = ", ".join(sorted(missing_headers))
            return jsonify({"success": False, "error": f"必須列が不足しています: {missing}"}), 400

        db = get_db_manager()
        supplier_cache: dict[str, int | None] = {}
        inserted = 0
        skipped: list[dict[str, str | int]] = []
        row_errors: list[dict[str, str | int]] = []

        for idx, raw_row in enumerate(rows, start=2):
            normalized = normalize_csv_row(raw_row)
            code = (normalized.get("code") or "").strip()
            name = (normalized.get("name") or "").strip()

            if not code or not name:
                row_errors.append(
                    {"row": idx, "code": code, "error": "必須項目(コード/品名)が空です"}
                )
                continue

            existing = db.execute_query(
                "SELECT id FROM consumables WHERE code = :code",
                {"code": code},
            )
            if not existing.empty:
                skipped.append({"row": idx, "code": code, "reason": "すでに登録済み"})
                continue

            stock_quantity = parse_int(normalized.get("stock_quantity"), 0)
            safety_stock = parse_int(normalized.get("safety_stock"), 0)
            unit_price = parse_float(normalized.get("unit_price"), 0.0)
            order_unit = parse_int(normalized.get("order_unit"), 1)
            supplier_id = resolve_supplier_id(db, normalized, supplier_cache)

            order_status = normalized.get("order_status") or "未発注"
            shortage_status = normalized.get("shortage_status")
            if not shortage_status:
                shortage_status = "在庫あり" if stock_quantity >= safety_stock else "要注意"

            params = {
                "code": code,
                "order_code": normalized.get("order_code") or "",
                "name": name,
                "category": normalized.get("category") or "",
                "unit": normalized.get("unit") or "箱",
                "stock_quantity": stock_quantity,
                "safety_stock": safety_stock,
                "unit_price": unit_price,
                "order_unit": order_unit if order_unit > 0 else 1,
                "supplier_id": supplier_id,
                "storage_location": normalized.get("storage_location") or "",
                "image_path": normalized.get("image_path") or "",
                "note": normalized.get("note") or "",
                "order_status": order_status,
                "shortage_status": shortage_status,
            }

            db.execute_update(CONSUMABLE_INSERT_SQL, params)
            inserted += 1

        return jsonify(
            {
                "success": True,
                "message": f"CSVから{inserted}件取り込みました",
                "summary": {
                    "inserted": inserted,
                    "skipped": skipped,
                    "errors": row_errors,
                },
            }
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/consumables", methods=["POST"])
def create_consumable():
    """消耗品を新規登録するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        # 必須パラメータチェック
        code = data.get("code")
        name = data.get("name")

        if not all([code, name]):
            return jsonify({"success": False, "error": "コードと品名は必須です"}), 400

        # コードの重複チェック
        existing = db.execute_query(
            "SELECT id FROM consumables WHERE code = :code",
            {"code": code},
        )
        if not existing.empty:
            return jsonify({"success": False, "error": "このコードは既に登録されています"}), 400

        # 消耗品を登録
        db.execute_update(
            CONSUMABLE_INSERT_SQL,
            {
                "code": code,
                "order_code": data.get("order_code", ""),
                "name": name,
                "category": data.get("category", ""),
                "unit": data.get("unit", "個"),
                "stock_quantity": data.get("stock_quantity", 0),
                "safety_stock": data.get("safety_stock", 0),
                "unit_price": data.get("unit_price", 0),
                "order_unit": data.get("order_unit", 1),
                "supplier_id": data.get("supplier_id"),
                "storage_location": data.get("storage_location", ""),
                "image_path": data.get("image_path", ""),
                "note": data.get("note", ""),
                "order_status": "未発注",
                "shortage_status": "在庫あり",
            },
        )

        return jsonify({"success": True, "message": "消耗品を登録しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/consumables/<int:consumable_id>", methods=["PUT"])
def update_consumable(consumable_id):
    """消耗品情報を更新するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        # 存在チェック
        existing = db.execute_query(
            "SELECT id FROM consumables WHERE id = :id",
            {"id": consumable_id},
        )
        if existing.empty:
            return jsonify({"success": False, "error": "消耗品が見つかりません"}), 404

        # 更新可能なフィールドのみ更新
        update_fields = []
        params = {"id": consumable_id}

        if "name" in data:
            update_fields.append("name = :name")
            params["name"] = data["name"]
        if "category" in data:
            update_fields.append("category = :category")
            params["category"] = data["category"]
        if "unit" in data:
            update_fields.append("unit = :unit")
            params["unit"] = data["unit"]
        if "safety_stock" in data:
            update_fields.append("safety_stock = :safety_stock")
            params["safety_stock"] = data["safety_stock"]
        if "unit_price" in data:
            update_fields.append("unit_price = :unit_price")
            params["unit_price"] = data["unit_price"]
        if "order_unit" in data:
            update_fields.append("order_unit = :order_unit")
            params["order_unit"] = data["order_unit"]
        if "supplier_id" in data:
            update_fields.append("supplier_id = :supplier_id")
            params["supplier_id"] = data["supplier_id"]
        if "storage_location" in data:
            update_fields.append("storage_location = :storage_location")
            params["storage_location"] = data["storage_location"]
        if "note" in data:
            update_fields.append("note = :note")
            params["note"] = data["note"]

        if not update_fields:
            return jsonify({"success": False, "error": "更新する項目がありません"}), 400

        query = f"UPDATE consumables SET {', '.join(update_fields)} WHERE id = :id"
        db.execute_update(query, params)

        return jsonify({"success": True, "message": "消耗品情報を更新しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/consumables/<int:consumable_id>", methods=["DELETE"])
def delete_consumable(consumable_id):
    """消耗品を削除するAPI"""
    try:
        db = get_db_manager()

        # 存在チェック
        existing = db.execute_query(
            "SELECT id FROM consumables WHERE id = :id",
            {"id": consumable_id},
        )
        if existing.empty:
            return jsonify({"success": False, "error": "消耗品が見つかりません"}), 404

        # 削除（実際は論理削除が望ましいが、ここでは物理削除）
        db.execute_update(
            "DELETE FROM consumables WHERE id = :id",
            {"id": consumable_id},
        )

        return jsonify({"success": True, "message": "消耗品を削除しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/suppliers")
def get_suppliers():
    """購入先一覧を取得するAPI"""
    try:
        db = get_db_manager()
        df = db.execute_query("SELECT id, name, contact, phone, email FROM suppliers ORDER BY name")
        return jsonify({"success": True, "data": df.to_dict(orient="records")})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/check-low-stock")
def check_low_stock():
    """安全在庫を下回る商品をチェックするAPI"""
    try:
        db = get_db_manager()

        query = """
            SELECT
                id,
                code,
                name,
                stock_quantity,
                safety_stock,
                unit,
                order_unit,
                supplier_id
            FROM consumables
            WHERE stock_quantity <= safety_stock
            AND order_status != '発注済'
            ORDER BY (stock_quantity - safety_stock) ASC
        """

        df = db.execute_query(query)

        return jsonify({
            "success": True,
            "data": df.to_dict(orient="records"),
            "count": len(df)
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/auto-create-orders", methods=["POST"])
def auto_create_orders():
    """安全在庫を下回る商品に対して自動で注文依頼を作成するAPI"""
    try:
        data = request.get_json()
        requester = data.get("requester", "システム自動")

        db = get_db_manager()

        # 安全在庫を下回る商品を取得
        query = """
            SELECT
                c.id,
                c.code,
                c.name,
                c.stock_quantity,
                c.safety_stock,
                c.unit,
                c.unit_price,
                c.order_unit,
                c.supplier_id
            FROM consumables c
            WHERE c.stock_quantity <= c.safety_stock
            AND c.order_status != '発注済'
        """

        df = db.execute_query(query)

        if df.empty:
            return jsonify({"success": True, "message": "発注が必要な商品はありません", "count": 0})

        created_count = 0
        for _, item in df.iterrows():
            # 発注数量を計算（安全在庫の2倍 - 現在庫）
            order_quantity = max(
                int(item["order_unit"]),
                int((item["safety_stock"] * 2 - item["stock_quantity"]) / item["order_unit"] + 1) * int(item["order_unit"])
            )
            total_amount = order_quantity * float(item["unit_price"]) if item["unit_price"] else 0

            # 注文依頼を作成
            db.execute_update(
                """
                INSERT INTO orders (
                    consumable_id, code, name, quantity, unit, unit_price, total_amount,
                    deadline, requester_name, supplier_id, note,
                    status, order_type, requested_date
                ) VALUES (
                    :consumable_id, :code, :name, :quantity, :unit, :unit_price, :total_amount,
                    :deadline, :requester_name, :supplier_id, :note,
                    :status, :order_type, NOW()
                )
                """,
                {
                    "consumable_id": int(item["id"]),
                    "code": item["code"],
                    "name": item["name"],
                    "quantity": order_quantity,
                    "unit": item["unit"],
                    "unit_price": float(item["unit_price"]) if item["unit_price"] else 0,
                    "total_amount": total_amount,
                    "deadline": "通常",
                    "requester_name": requester,
                    "supplier_id": item["supplier_id"],
                    "note": f"自動発注依頼（在庫: {item['stock_quantity']}, 安全在庫: {item['safety_stock']}）",
                    "status": "依頼中",
                    "order_type": "自動",
                },
            )

            # 注文状態を更新
            db.execute_update(
                "UPDATE consumables SET order_status = '依頼中' WHERE id = :id",
                {"id": int(item["id"])},
            )

            created_count += 1

        return jsonify({
            "success": True,
            "message": f"{created_count}件の自動発注依頼を作成しました",
            "count": created_count
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/generate-order-pdf", methods=["GET", "POST"])
def generate_order_pdf():
    """注文書PDFを生成するAPI（ReportLab使用）"""
    try:
        db = get_db_manager()

        # order_ids をクエリパラメータまたはPOSTボディから取得
        if request.method == "POST":
            data = request.get_json()
            order_ids = data.get("order_ids", [])
            order_number = data.get("order_number", "")
            notes = data.get("notes", "")
        else:
            order_ids_str = request.args.get("order_ids", "")
            order_ids = [int(id.strip()) for id in order_ids_str.split(",") if id.strip()]
            order_number = request.args.get("order_number", "")
            notes = request.args.get("notes", "")

        if not order_ids:
            return jsonify({"success": False, "error": "order_idsが指定されていません"}), 400

        # 注文データを取得
        placeholders = ",".join([f":id{i}" for i in range(len(order_ids))])
        params = {f"id{i}": order_id for i, order_id in enumerate(order_ids)}

        query = f"""
            SELECT
                o.id,
                o.code,
                o.name,
                o.quantity,
                o.unit,
                o.unit_price,
                o.total_amount,
                o.deadline,
                o.requester_name,
                s.name AS supplier_name,
                o.requested_date,
                o.note
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.id IN ({placeholders})
            ORDER BY o.id
        """

        df = db.execute_query(query, params)

        if df.empty:
            return jsonify({"success": False, "error": "注文データが見つかりません"}), 404

        # 購入先（最初の行から取得）
        supplier_name = df.iloc[0]["supplier_name"] if df.iloc[0]["supplier_name"] else "未指定"
        requester = df.iloc[0]["requester_name"]
        deadline = df.iloc[0]["deadline"]
        order_date = datetime.now().strftime("%Y年%m月%d日")

        # 注文番号を生成（指定がなければ自動生成）
        if not order_number:
            order_number = f"ORD-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

        # 合計金額を計算
        total_amount = df["total_amount"].sum()

        # PDFを生成
        pdf_buffer = BytesIO()
        doc = SimpleDocTemplate(
            pdf_buffer,
            pagesize=landscape(A4),
            rightMargin=15*mm,
            leftMargin=15*mm,
            topMargin=15*mm,
            bottomMargin=15*mm,
        )

        # ストーリー（PDF内容）を構築
        story = []

        # タイトル
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'Title',
            parent=styles['Title'],
            fontSize=20,
            alignment=1,  # 中央揃え
        )
        story.append(Paragraph("注 文 書", title_style))
        story.append(Spacer(1, 15))

        # 注文情報
        info_data = [
            ["注文書番号:", order_number, "購入先:", supplier_name],
            ["注文日:", order_date, "依頼者:", requester],
            ["納期:", deadline, "", ""],
        ]
        info_table = Table(info_data, colWidths=[25*mm, 60*mm, 25*mm, 60*mm])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 15))

        # 明細テーブル
        table_data = [["No.", "Code", "Name", "Qty", "Unit", "Price", "Amount"]]

        for idx, row in df.iterrows():
            table_data.append([
                str(idx + 1),
                row["code"],
                row["name"],
                f"{int(row['quantity']):,}",
                row["unit"],
                f"¥{int(row['unit_price']):,}",
                f"¥{int(row['total_amount']):,}",
            ])

        # 合計行
        table_data.append(["", "", "", "", "", "Total", f"¥{int(total_amount):,}"])

        detail_table = Table(table_data, colWidths=[15*mm, 35*mm, 80*mm, 20*mm, 15*mm, 25*mm, 35*mm])
        detail_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('ALIGN', (0, 1), (0, -1), 'CENTER'),
            ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -2), 1, colors.black),
            ('LINEABOVE', (0, -1), (-1, -1), 2, colors.black),
            ('BACKGROUND', (0, -1), (-1, -1), colors.lightgrey),
        ]))
        story.append(detail_table)
        story.append(Spacer(1, 15))

        # 備考
        if notes:
            story.append(Paragraph(f"<b>Notes:</b> {notes}", styles['Normal']))
            story.append(Spacer(1, 10))

        # フッター
        story.append(Paragraph("The above order is confirmed. Thank you.", styles['Normal']))

        # PDFを構築
        doc.build(story)

        # PDFファイルを保存
        pdf_filename = f"order_{order_number}.pdf"
        pdf_path = PDF_FOLDER / pdf_filename
        pdf_buffer.seek(0)

        with open(pdf_path, "wb") as f:
            f.write(pdf_buffer.getvalue())

        # PDFをレスポンスとして返す
        pdf_buffer.seek(0)
        response = make_response(pdf_buffer.getvalue())
        response.headers["Content-Type"] = "application/pdf"
        response.headers["Content-Disposition"] = f'attachment; filename="{pdf_filename}"'

        return response

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


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
            port=8501,
            debug=True,
            ssl_context=(str(cert_file), str(key_file)),
        )
    else:
        print("証明書が見つかりません。HTTPで起動します。")
        app.run(host="0.0.0.0", port=8501, debug=True)

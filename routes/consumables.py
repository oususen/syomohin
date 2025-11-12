"""
消耗品管理APIルート
"""
from __future__ import annotations

import csv
from io import TextIOWrapper
from uuid import uuid4

from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

from config import (
    CONSUMABLE_INSERT_SQL,
    CSV_REQUIRED_FIELDS,
    IMAGES_FOLDER,
    ALLOWED_IMAGE_EXTENSIONS,
)
from database_manager import get_db_manager
from utils.csv_utils import resolve_csv_field, normalize_csv_row, parse_int, parse_float, resolve_supplier_id
from utils.stock_utils import calculate_shortage_status

consumables_bp = Blueprint("consumables", __name__)


def _build_image_url(image_path: str | None) -> str | None:
    if not image_path:
        return None
    path_str = str(image_path).strip()
    if not path_str:
        return None
    if path_str.startswith(("http://", "https://")):
        return path_str
    normalized = path_str.lstrip("/")
    if normalized.startswith("uploads/"):
        normalized = normalized[len("uploads/") :]
    return f"/uploads/{normalized}"


def _is_allowed_image(filename: str) -> bool:
    return (
        bool(filename)
        and "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS
    )


@consumables_bp.route("/api/consumables/import-csv", methods=["POST"])
def import_consumables_csv():
    """CSVファイルから消耗品を新規登録"""
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
                shortage_status = calculate_shortage_status(stock_quantity, safety_stock)

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


@consumables_bp.route("/api/consumables/<int:consumable_id>", methods=["GET"])
def get_consumable_detail(consumable_id: int):
    """�w�肳�ꂽ消耗品の詳細を取得"""
    try:
        db = get_db_manager()
        query = """
            SELECT
                id,
                code,
                order_code,
                name,
                category,
                unit,
                stock_quantity,
                safety_stock,
                unit_price,
                order_unit,
                supplier_id,
                storage_location,
                image_path,
                note,
                order_status,
                shortage_status
            FROM consumables
            WHERE id = :id
        """
        df = db.execute_query(query, {"id": consumable_id})
        if df.empty:
            return jsonify({"success": False, "error": "�消耗品����܂���"}), 404

        data = df.iloc[0].to_dict()
        data["image_url"] = _build_image_url(data.get("image_path"))
        return jsonify({"success": True, "data": data})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@consumables_bp.route("/api/consumables", methods=["POST"])
def create_consumable():
    """消耗品を新規登録するAPI"""
    try:
        # FormDataまたはJSONからデータを取得
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()

        db = get_db_manager()

        code = data.get("code")
        name = data.get("name")

        if not all([code, name]):
            return jsonify({"success": False, "error": "コードと品名は必須です"}), 400

        existing = db.execute_query(
            "SELECT id FROM consumables WHERE code = :code",
            {"code": code},
        )
        if not existing.empty:
            return jsonify({"success": False, "error": "このコードは既に登録されています"}), 400

        # 画像ファイルの処理
        image_path = ""
        if "image" in request.files:
            file = request.files["image"]
            if file and file.filename != "" and _is_allowed_image(file.filename):
                extension = file.filename.rsplit(".", 1)[1].lower()
                filename = f"{uuid4().hex}.{extension}"
                safe_filename = secure_filename(filename)
                save_path = IMAGES_FOLDER / safe_filename
                file.save(str(save_path))
                image_path = f"images/{safe_filename}"

        stock_quantity = parse_int(data.get("stock_quantity"), 0)
        safety_stock = parse_int(data.get("safety_stock"), 0)
        shortage_status = calculate_shortage_status(stock_quantity, safety_stock)

        db.execute_update(
            CONSUMABLE_INSERT_SQL,
            {
                "code": code,
                "order_code": data.get("order_code", ""),
                "name": name,
                "category": data.get("category", ""),
                "unit": data.get("unit", "個"),
                "stock_quantity": stock_quantity,
                "safety_stock": safety_stock,
                "unit_price": float(data.get("unit_price", 0)),
                "order_unit": int(data.get("order_unit", 1)),
                "supplier_id": int(data["supplier_id"]) if data.get("supplier_id") else None,
                "storage_location": data.get("storage_location", ""),
                "image_path": image_path,
                "note": data.get("note", ""),
                "order_status": "未発注",
                "shortage_status": shortage_status,
            },
        )
        return jsonify({"success": True, "message": "消耗品を登録しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@consumables_bp.route("/api/consumables/<int:consumable_id>", methods=["PUT"])
def update_consumable(consumable_id):
    """消耗品情報を更新するAPI"""
    try:
        # FormDataまたはJSONからデータを取得
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()

        db = get_db_manager()

        existing = db.execute_query(
            "SELECT id, stock_quantity, safety_stock FROM consumables WHERE id = :id",
            {"id": consumable_id},
        )
        if existing.empty:
            return jsonify({"success": False, "error": "消耗品が見つかりません"}), 404

        record = existing.iloc[0]
        current_stock = parse_int(record.get("stock_quantity"), 0)
        current_safety_stock = parse_int(record.get("safety_stock"), 0)

        update_fields = []
        params = {"id": consumable_id}
        stock_updated = False
        safety_updated = False

        if "order_code" in data:
            update_fields.append("order_code = :order_code")
            params["order_code"] = data["order_code"]
        if "name" in data:
            update_fields.append("name = :name")
            params["name"] = data["name"]
        if "category" in data:
            update_fields.append("category = :category")
            params["category"] = data["category"]
        if "unit" in data:
            update_fields.append("unit = :unit")
            params["unit"] = data["unit"]
        if "stock_quantity" in data:
            update_fields.append("stock_quantity = :stock_quantity")
            params["stock_quantity"] = parse_int(data["stock_quantity"], current_stock)
            stock_updated = True
        if "safety_stock" in data:
            update_fields.append("safety_stock = :safety_stock")
            params["safety_stock"] = parse_int(data["safety_stock"], current_safety_stock)
            safety_updated = True
        if "unit_price" in data:
            update_fields.append("unit_price = :unit_price")
            params["unit_price"] = float(data["unit_price"])
        if "order_unit" in data:
            update_fields.append("order_unit = :order_unit")
            params["order_unit"] = int(data["order_unit"])
        if "supplier_id" in data:
            update_fields.append("supplier_id = :supplier_id")
            params["supplier_id"] = int(data["supplier_id"]) if data["supplier_id"] else None
        if "storage_location" in data:
            update_fields.append("storage_location = :storage_location")
            params["storage_location"] = data["storage_location"]
        if "note" in data:
            update_fields.append("note = :note")
            params["note"] = data["note"]
        if "shortage_status" in data:
            shortage_value = data["shortage_status"]
            if isinstance(shortage_value, str):
                shortage_value = shortage_value.strip()
            update_fields.append("shortage_status = :shortage_status")
            params["shortage_status"] = shortage_value
        elif stock_updated or safety_updated:
            new_stock_value = params.get("stock_quantity", current_stock)
            new_safety_value = params.get("safety_stock", current_safety_stock)
            auto_status = calculate_shortage_status(new_stock_value, new_safety_value)
            update_fields.append("shortage_status = :shortage_status")
            params["shortage_status"] = auto_status

        # 画像ファイルの処理
        if "image" in request.files:
            file = request.files["image"]
            if file and file.filename != "" and _is_allowed_image(file.filename):
                extension = file.filename.rsplit(".", 1)[1].lower()
                filename = f"{uuid4().hex}.{extension}"
                safe_filename = secure_filename(filename)
                save_path = IMAGES_FOLDER / safe_filename
                file.save(str(save_path))
                update_fields.append("image_path = :image_path")
                params["image_path"] = f"images/{safe_filename}"

        if not update_fields:
            return jsonify({"success": False, "error": "更新する項目がありません"}), 400

        query = f"UPDATE consumables SET {', '.join(update_fields)} WHERE id = :id"
        db.execute_update(query, params)

        return jsonify({"success": True, "message": "消耗品情報を更新しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@consumables_bp.route("/api/consumables/<int:consumable_id>", methods=["DELETE"])
def delete_consumable(consumable_id):
    """消耗品を削除するAPI"""
    try:
        db = get_db_manager()

        existing = db.execute_query(
            "SELECT id FROM consumables WHERE id = :id",
            {"id": consumable_id},
        )
        if existing.empty:
            return jsonify({"success": False, "error": "消耗品が見つかりません"}), 404

        db.execute_update(
            "DELETE FROM consumables WHERE id = :id",
            {"id": consumable_id},
        )

        return jsonify({"success": True, "message": "消耗品を削除しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@consumables_bp.route("/api/uploads/images", methods=["POST"])
def upload_consumable_image():
    """�消耗品画像アップロードAPI"""
    try:
        if "image" not in request.files:
            return jsonify({"success": False, "error": "画像ファイルが見つかりません"}), 400

        file = request.files["image"]
        if not file or file.filename == "":
            return jsonify({"success": False, "error": "画像ファイルを選択してください"}), 400

        if not _is_allowed_image(file.filename):
            return jsonify({"success": False, "error": "対応していない画像形式です"}), 400

        extension = file.filename.rsplit(".", 1)[1].lower()
        filename = f"{uuid4().hex}.{extension}"
        safe_filename = secure_filename(filename)
        save_path = IMAGES_FOLDER / safe_filename
        save_path.parent.mkdir(parents=True, exist_ok=True)
        file.save(save_path)

        relative_path = f"images/{safe_filename}"
        return jsonify({"success": True, "path": relative_path, "url": _build_image_url(relative_path)})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

"""
消耗品管理APIルート
"""
from __future__ import annotations

import csv
from io import TextIOWrapper

from flask import Blueprint, jsonify, request

from config import CONSUMABLE_INSERT_SQL, CSV_REQUIRED_FIELDS
from database_manager import get_db_manager
from utils.csv_utils import resolve_csv_field, normalize_csv_row, parse_int, parse_float, resolve_supplier_id

consumables_bp = Blueprint("consumables", __name__)


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


@consumables_bp.route("/api/consumables", methods=["POST"])
def create_consumable():
    """消耗品を新規登録するAPI"""
    try:
        data = request.get_json()
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


@consumables_bp.route("/api/consumables/<int:consumable_id>", methods=["PUT"])
def update_consumable(consumable_id):
    """消耗品情報を更新するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        existing = db.execute_query(
            "SELECT id FROM consumables WHERE id = :id",
            {"id": consumable_id},
        )
        if existing.empty:
            return jsonify({"success": False, "error": "消耗品が見つかりません"}), 404

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

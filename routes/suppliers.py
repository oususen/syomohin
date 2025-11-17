"""
仕入先管理APIルート
"""
from __future__ import annotations

import io

import pandas as pd
from flask import Blueprint, jsonify, request

from database_manager import get_db_manager

suppliers_bp = Blueprint("suppliers", __name__)

SUPPLIER_CSV_ALIAS_MAP = {
    "name": "name",
    "supplier_name": "name",
    "purchase_name": "name",
    "購入先名": "name",
    "仕入先": "name",
    "仕入先名": "name",
    "サプライヤー名": "name",
    "contact_person": "contact_person",
    "担当者": "contact_person",
    "担当者名": "contact_person",
    "contact": "phone",
    "連絡先": "phone",
    "phone": "phone",
    "tel": "phone",
    "電話番号": "phone",
    "email": "email",
    "mail": "email",
    "メール": "email",
    "メールアドレス": "email",
    "address": "address",
    "住所": "address",
    "所在地": "address",
    "note": "note",
    "備考": "note",
    "メモ": "note",
}


def _resolve_supplier_field(header: str) -> str | None:
    normalized = (header or "").strip()
    lower = normalized.lower()
    return SUPPLIER_CSV_ALIAS_MAP.get(lower) or SUPPLIER_CSV_ALIAS_MAP.get(normalized)


def _normalize_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    if isinstance(value, str):
        return value.strip()
    if pd.isna(value):
        return ""
    return str(value).strip()


@suppliers_bp.route("/api/suppliers")
def get_suppliers():
    """購入先一覧を取得するAPI"""
    try:
        db = get_db_manager()
        df = db.execute_query("SELECT id, name, contact_person, phone, email, address, note FROM suppliers ORDER BY name")
        return jsonify({"success": True, "data": df.to_dict(orient="records")})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@suppliers_bp.route("/api/suppliers/<int:supplier_id>", methods=["GET"])
def get_supplier(supplier_id):
    """特定の購入先を取得するAPI"""
    try:
        db = get_db_manager()
        df = db.execute_query(
            "SELECT id, name, contact_person, phone, email, address, note FROM suppliers WHERE id = %s",
            (supplier_id,)
        )
        if df.empty:
            return jsonify({"success": False, "error": "購入先が見つかりません"}), 404

        data = df.to_dict(orient="records")[0]
        # NaNをNoneに変換
        for key in data:
            if data[key] is None or (isinstance(data[key], float) and str(data[key]) == 'nan'):
                data[key] = None

        return jsonify({"success": True, "data": data})
    except Exception as e:
        import traceback
        try:
            error_msg = f"Error: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)
        except:
            pass  # Ignore encoding errors
        return jsonify({"success": False, "error": "データの取得に失敗しました"}), 500


@suppliers_bp.route("/api/suppliers", methods=["POST"])
def add_supplier():
    """購入先を追加するAPI"""
    try:
        data = request.get_json()
        name = data.get("name", "").strip()

        if not name:
            return jsonify({"success": False, "error": "購入先名は必須です"}), 400

        db = get_db_manager()
        db.execute_update(
            """INSERT INTO suppliers (name, contact_person, phone, email, address, note)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                name,
                data.get("contact_person", ""),
                data.get("phone", ""),
                data.get("email", ""),
                data.get("address", ""),
                data.get("note", "")
            )
        )

        return jsonify({"success": True, "message": "購入先を登録しました"})
    except Exception as e:
        import traceback
        try:
            print(f"Add supplier error: {str(e)}\n{traceback.format_exc()}")
        except:
            pass
        return jsonify({"success": False, "error": "登録に失敗しました"}), 500


@suppliers_bp.route("/api/suppliers/<int:supplier_id>", methods=["PUT"])
def update_supplier(supplier_id):
    """購入先を更新するAPI"""
    try:
        data = request.get_json()
        name = data.get("name", "").strip()

        if not name:
            return jsonify({"success": False, "error": "購入先名は必須です"}), 400

        db = get_db_manager()

        # 購入先が存在するか確認
        df = db.execute_query("SELECT id FROM suppliers WHERE id = %s", (supplier_id,))
        if df.empty:
            return jsonify({"success": False, "error": "購入先が見つかりません"}), 404

        # 更新実行
        db.execute_update(
            """UPDATE suppliers
               SET name = %s, contact_person = %s, phone = %s, email = %s, address = %s, note = %s
               WHERE id = %s""",
            (
                name,
                data.get("contact_person", ""),
                data.get("phone", ""),
                data.get("email", ""),
                data.get("address", ""),
                data.get("note", ""),
                supplier_id
            )
        )

        return jsonify({"success": True, "message": "購入先を更新しました"})
    except Exception as e:
        import traceback
        try:
            print(f"Update error: {str(e)}\n{traceback.format_exc()}")
        except:
            pass
        return jsonify({"success": False, "error": "更新に失敗しました"}), 500


@suppliers_bp.route("/api/suppliers/<int:supplier_id>", methods=["DELETE"])
def delete_supplier(supplier_id):
    """購入先を削除するAPI"""
    try:
        db = get_db_manager()

        # 使用中かチェック
        check_df = db.execute_query(
            "SELECT COUNT(*) as count FROM consumables WHERE supplier_id = %s",
            (supplier_id,)
        )
        if check_df.iloc[0]["count"] > 0:
            return jsonify({
                "success": False,
                "error": "この購入先を使用している消耗品があるため削除できません"
            }), 400

        # 削除実行
        db.execute_update("DELETE FROM suppliers WHERE id = %s", (supplier_id,))

        return jsonify({"success": True, "message": "購入先を削除しました"})
    except Exception as e:
        import traceback
        try:
            print(f"Delete error: {str(e)}\n{traceback.format_exc()}")
        except:
            pass
        return jsonify({"success": False, "error": "削除に失敗しました"}), 500


@suppliers_bp.route("/api/suppliers/import-csv", methods=["POST"])
def import_suppliers_csv():
    """CSVから購入先を一括登録するAPI"""
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "error": "CSVファイルが見つかりません"}), 400

        file = request.files["file"]
        if not file or file.filename == "":
            return jsonify({"success": False, "error": "CSVファイルを選択してください"}), 400

        raw_bytes = file.read()
        if not raw_bytes:
            return jsonify({"success": False, "error": "CSVにデータがありません"}), 400

        try:
            decoded = raw_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            decoded = raw_bytes.decode("cp932")

        try:
            df = pd.read_csv(io.StringIO(decoded))
        except Exception as e:
            return jsonify({"success": False, "error": f"CSVの読み込みに失敗しました: {str(e)}"}), 400

        if df.empty:
            return jsonify({"success": False, "error": "CSVにデータがありません"}), 400

        resolved_columns = {}
        for column in df.columns:
            resolved = _resolve_supplier_field(column)
            if resolved:
                resolved_columns[column] = resolved
        if resolved_columns:
            df = df.rename(columns=resolved_columns)

        if "name" not in df.columns:
            return jsonify({"success": False, "error": "必須列「購入先名」が見つかりません"}), 400

        db = get_db_manager()
        inserted = 0
        skipped = 0
        row_errors: list[str] = []

        for index, row in df.iterrows():
            try:
                name = _normalize_cell(row.get("name"))
                if not name:
                    row_errors.append(f"行{index + 2}: 購入先名が空です")
                    skipped += 1
                    continue

                existing = db.execute_query(
                    "SELECT id FROM suppliers WHERE name = %s",
                    (name,),
                )
                if not existing.empty:
                    row_errors.append(f"行{index + 2}: 「{name}」は既に登録済みのためスキップしました")
                    skipped += 1
                    continue

                db.execute_update(
                    """
                    INSERT INTO suppliers (name, contact_person, phone, email, address, note)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        name,
                        _normalize_cell(row.get("contact_person")),
                        _normalize_cell(row.get("phone")),
                        _normalize_cell(row.get("email")),
                        _normalize_cell(row.get("address")),
                        _normalize_cell(row.get("note")),
                    ),
                )
                inserted += 1
            except Exception as exc:
                row_errors.append(f"行{index + 2}: {str(exc)}")
                skipped += 1

        return jsonify(
            {
                "success": True,
                "message": f"CSVから{inserted}件の購入先を登録しました",
                "summary": {
                    "inserted": inserted,
                    "skipped": skipped,
                    "errors": row_errors,
                },
            }
        )
    except Exception as e:
        import traceback
        try:
            print(f"Import suppliers CSV error: {str(e)}\n{traceback.format_exc()}")
        except:
            pass
        return jsonify({"success": False, "error": "CSVの取り込みに失敗しました"}), 500

"""
仕入先管理APIルート
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from database_manager import get_db_manager

suppliers_bp = Blueprint("suppliers", __name__)


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

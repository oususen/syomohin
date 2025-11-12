"""
従業員管理APIルート
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from database_manager import get_db_manager

employees_bp = Blueprint("employees", __name__)


@employees_bp.route("/api/employees", methods=["GET"])
def get_employees():
    """従業員一覧を取得するAPI"""
    try:
        db = get_db_manager()
        df = db.execute_query(
            "SELECT id, code, name, department, email, role, created_at FROM employees ORDER BY code"
        )
        return jsonify({"success": True, "data": df.to_dict(orient="records")})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@employees_bp.route("/api/employees/<int:employee_id>", methods=["GET"])
def get_employee(employee_id):
    """特定の従業員を取得するAPI"""
    try:
        db = get_db_manager()
        df = db.execute_query(
            "SELECT id, code, name, department, email, role FROM employees WHERE id = :id",
            {"id": employee_id},
        )
        if df.empty:
            return jsonify({"success": False, "error": "従業員が見つかりません"}), 404

        data = df.to_dict(orient="records")[0]
        return jsonify({"success": True, "data": data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@employees_bp.route("/api/employees", methods=["POST"])
def add_employee():
    """従業員を追加するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        # 必須フィールドチェック
        code = data.get("code", "").strip()
        name = data.get("name", "").strip()

        if not code or not name:
            return jsonify({"success": False, "error": "コードと氏名は必須です"}), 400

        # コードの重複チェック
        existing = db.execute_query("SELECT id FROM employees WHERE code = :code", {"code": code})
        if not existing.empty:
            return jsonify({"success": False, "error": "このコードは既に使用されています"}), 400

        # パスワードのハッシュ化
        password = data.get("password", "").strip()
        password_hash = generate_password_hash(password) if password else None

        # 従業員を登録
        db.execute_update(
            """
            INSERT INTO employees (code, name, department, email, password, role)
            VALUES (:code, :name, :department, :email, :password, :role)
            """,
            {
                "code": code,
                "name": name,
                "department": data.get("department", ""),
                "email": data.get("email", ""),
                "password": password_hash,
                "role": data.get("role", "一般"),
            },
        )

        return jsonify({"success": True, "message": "従業員を登録しました"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@employees_bp.route("/api/employees/<int:employee_id>", methods=["PUT"])
def update_employee(employee_id):
    """従業員を更新するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        # 従業員が存在するか確認
        existing = db.execute_query("SELECT id FROM employees WHERE id = :id", {"id": employee_id})
        if existing.empty:
            return jsonify({"success": False, "error": "従業員が見つかりません"}), 404

        # 更新するフィールドを準備
        update_fields = []
        params = {"id": employee_id}

        if "name" in data:
            update_fields.append("name = :name")
            params["name"] = data["name"]

        if "department" in data:
            update_fields.append("department = :department")
            params["department"] = data["department"]

        if "email" in data:
            update_fields.append("email = :email")
            params["email"] = data["email"]

        if "role" in data:
            update_fields.append("role = :role")
            params["role"] = data["role"]

        # パスワードが指定されている場合のみ更新
        if "password" in data and data["password"].strip():
            password_hash = generate_password_hash(data["password"])
            update_fields.append("password = :password")
            params["password"] = password_hash

        if not update_fields:
            return jsonify({"success": False, "error": "更新する項目がありません"}), 400

        # 更新実行
        query = f"UPDATE employees SET {', '.join(update_fields)} WHERE id = :id"
        db.execute_update(query, params)

        return jsonify({"success": True, "message": "従業員情報を更新しました"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@employees_bp.route("/api/employees/<int:employee_id>", methods=["DELETE"])
def delete_employee(employee_id):
    """従業員を削除するAPI"""
    try:
        db = get_db_manager()

        # 従業員が存在するか確認
        existing = db.execute_query("SELECT id FROM employees WHERE id = :id", {"id": employee_id})
        if existing.empty:
            return jsonify({"success": False, "error": "従業員が見つかりません"}), 404

        # 削除実行
        db.execute_update("DELETE FROM employees WHERE id = :id", {"id": employee_id})

        return jsonify({"success": True, "message": "従業員を削除しました"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

"""
従業員管理APIルート
"""
from __future__ import annotations

import io
import pandas as pd
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


@employees_bp.route("/api/employees/by-code/<string:employee_code>", methods=["GET"])
def get_employee_by_code(employee_code):
    """従業員コードで従業員を取得するAPI"""
    try:
        db = get_db_manager()
        df = db.execute_query(
            "SELECT id, code, name, department, email, role FROM employees WHERE code = :code",
            {"code": employee_code},
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


@employees_bp.route("/api/employees/import-csv", methods=["POST"])
def import_employees_csv():
    """従業員CSVをインポートするAPI"""
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "error": "ファイルがアップロードされていません"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"success": False, "error": "ファイルが選択されていません"}), 400

        # CSVを読み込む
        try:
            content = file.read().decode("utf-8-sig")
            df = pd.read_csv(io.StringIO(content))
        except Exception as e:
            return jsonify({"success": False, "error": f"CSVの読み込みに失敗しました: {str(e)}"}), 400

        # 必須カラムのチェック
        required_columns = ["コード", "氏名"]
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            return jsonify(
                {"success": False, "error": f"必須カラムが不足しています: {', '.join(missing_columns)}"}
            ), 400

        db = get_db_manager()
        inserted = 0
        skipped = 0
        row_errors = []

        for index, row in df.iterrows():
            try:
                code = str(row.get("コード", "")).strip()
                name = str(row.get("氏名", "")).strip()

                if not code or not name:
                    row_errors.append(f"行{index + 2}: コードと氏名は必須です")
                    skipped += 1
                    continue

                # コードの重複チェック
                existing = db.execute_query(
                    "SELECT id FROM employees WHERE code = :code", {"code": code}
                )
                if not existing.empty:
                    row_errors.append(f"行{index + 2}: コード '{code}' は既に使用されています")
                    skipped += 1
                    continue

                # パスワードのハッシュ化
                password = str(row.get("パスワード", "")).strip()
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
                        "department": str(row.get("部署", "")).strip(),
                        "email": str(row.get("メールアドレス", "")).strip(),
                        "password": password_hash,
                        "role": str(row.get("役職", "一般")).strip() or "一般",
                    },
                )
                inserted += 1

            except Exception as e:
                row_errors.append(f"行{index + 2}: {str(e)}")
                skipped += 1
                continue

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

"""
ユーザー管理APIルート
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from database_manager import get_db_manager

users_bp = Blueprint("users", __name__)


@users_bp.route("/api/users", methods=["GET"])
def list_users():
    """ユーザー一覧を取得"""
    try:
        db = get_db_manager()
        query = """
            SELECT
                u.id,
                u.username,
                u.full_name,
                u.email,
                u.is_active,
                u.created_at,
                u.last_login,
                GROUP_CONCAT(r.role_name ORDER BY r.role_name SEPARATOR ', ') as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            GROUP BY u.id, u.username, u.full_name, u.email, u.is_active, u.created_at, u.last_login
            ORDER BY u.username
        """
        df = db.execute_query(query)
        return jsonify({"success": True, "data": df.to_dict(orient="records")})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@users_bp.route("/api/users/<int:user_id>", methods=["GET"])
def get_user(user_id: int):
    """ユーザー詳細を取得"""
    try:
        db = get_db_manager()
        user_df = db.execute_query(
            """
            SELECT id, username, full_name, email, is_active
            FROM users
            WHERE id = :id
            """,
            {"id": user_id},
        )
        if user_df.empty:
            return jsonify({"success": False, "error": "ユーザーが見つかりません"}), 404

        # ユーザーのロールを取得
        roles_df = db.execute_query(
            """
            SELECT r.id, r.role_name
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = :user_id
            """,
            {"user_id": user_id},
        )

        user_data = user_df.to_dict(orient="records")[0]
        user_data["roles"] = roles_df.to_dict(orient="records") if not roles_df.empty else []

        return jsonify({"success": True, "data": user_data})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@users_bp.route("/api/users", methods=["POST"])
def create_user():
    """ユーザーの新規登録"""
    try:
        data = request.get_json() or {}
        username = (data.get("username") or "").strip()
        full_name = (data.get("full_name") or "").strip()
        password = (data.get("password") or "").strip()

        if not username or not full_name or not password:
            return jsonify(
                {"success": False, "error": "ユーザー名・氏名・パスワードは必須です"}
            ), 400
        if len(password) < 6:
            return jsonify({"success": False, "error": "パスワードは6文字以上です"}), 400

        db = get_db_manager()
        existing = db.execute_query(
            "SELECT id FROM users WHERE username = :username",
            {"username": username},
        )
        if not existing.empty:
            return jsonify({"success": False, "error": "このユーザー名は使用されています"}), 400

        # ユーザーを登録
        db.execute_update(
            """
            INSERT INTO users (username, password_hash, full_name, email, is_active)
            VALUES (:username, :password_hash, :full_name, :email, :is_active)
            """,
            {
                "username": username,
                "password_hash": generate_password_hash(password),
                "full_name": full_name,
                "email": (data.get("email") or "").strip(),
                "is_active": 1 if data.get("is_active", True) else 0,
            },
        )

        # 新規作成したユーザーのIDを取得
        user_id_df = db.execute_query(
            "SELECT id FROM users WHERE username = :username",
            {"username": username},
        )
        user_id = user_id_df.iloc[0]["id"]

        # ロールを割り当て（role_idsが配列で渡される）
        role_ids = data.get("role_ids", [])
        if not role_ids:
            # デフォルトで「一般」ロールを割り当て
            role_df = db.execute_query("SELECT id FROM roles WHERE role_name = '一般'")
            if not role_df.empty:
                role_ids = [role_df.iloc[0]["id"]]

        for role_id in role_ids:
            db.execute_update(
                "INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)",
                {"user_id": user_id, "role_id": role_id},
            )

        return jsonify({"success": True, "message": "ユーザーを登録しました"})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@users_bp.route("/api/users/<int:user_id>", methods=["PUT"])
def update_user(user_id: int):
    """ユーザー情報を更新"""
    try:
        data = request.get_json() or {}
        db = get_db_manager()

        existing = db.execute_query("SELECT id FROM users WHERE id = :id", {"id": user_id})
        if existing.empty:
            return jsonify({"success": False, "error": "ユーザーが見つかりません"}), 404

        update_fields = []
        params = {"id": user_id}

        if "username" in data and data["username"]:
            new_username = data["username"].strip()
            duplicate = db.execute_query(
                "SELECT id FROM users WHERE username = :username AND id != :id",
                {"username": new_username, "id": user_id},
            )
            if not duplicate.empty:
                return jsonify({"success": False, "error": "同じユーザー名が既に存在します"}), 400
            update_fields.append("username = :username")
            params["username"] = new_username

        if "full_name" in data:
            update_fields.append("full_name = :full_name")
            params["full_name"] = (data["full_name"] or "").strip()

        if "email" in data:
            update_fields.append("email = :email")
            params["email"] = (data["email"] or "").strip()

        if "is_active" in data:
            update_fields.append("is_active = :is_active")
            params["is_active"] = 1 if data["is_active"] else 0

        password = (data.get("password") or "").strip()
        if password:
            if len(password) < 6:
                return jsonify({"success": False, "error": "パスワードは6文字以上です"}), 400
            update_fields.append("password_hash = :password_hash")
            params["password_hash"] = generate_password_hash(password)

        if update_fields:
            query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = :id"
            db.execute_update(query, params)

        # ロールの更新
        if "role_ids" in data:
            # 既存のロールを削除
            db.execute_update("DELETE FROM user_roles WHERE user_id = :user_id", {"user_id": user_id})

            # 新しいロールを割り当て
            role_ids = data["role_ids"]
            for role_id in role_ids:
                db.execute_update(
                    "INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)",
                    {"user_id": user_id, "role_id": role_id},
                )

        return jsonify({"success": True, "message": "ユーザー情報を更新しました"})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@users_bp.route("/api/users/<int:user_id>", methods=["DELETE"])
def delete_user(user_id: int):
    """ユーザー削除"""
    try:
        db = get_db_manager()
        existing = db.execute_query("SELECT id FROM users WHERE id = :id", {"id": user_id})
        if existing.empty:
            return jsonify({"success": False, "error": "ユーザーが見つかりません"}), 404

        db.execute_update("DELETE FROM users WHERE id = :id", {"id": user_id})
        return jsonify({"success": True, "message": "ユーザーを削除しました"})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@users_bp.route("/api/roles", methods=["GET"])
def list_roles():
    """ロール一覧を取得"""
    try:
        db = get_db_manager()
        df = db.execute_query(
            """
            SELECT id, role_name, description, created_at
            FROM roles
            ORDER BY
                CASE role_name
                    WHEN '部長' THEN 1
                    WHEN '課長' THEN 2
                    WHEN '係長' THEN 3
                    WHEN '班長' THEN 4
                    WHEN 'リーダ' THEN 5
                    WHEN '一般' THEN 6
                    ELSE 99
                END
            """
        )
        return jsonify({"success": True, "data": df.to_dict(orient="records")})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@users_bp.route("/api/users/<int:user_id>/roles", methods=["POST"])
def assign_role_to_user(user_id: int):
    """ユーザーにロールを割り当て（既存のロールに追加）"""
    try:
        data = request.get_json() or {}
        role_id = data.get("role_id")

        if not role_id:
            return jsonify({"success": False, "error": "ロールIDが必要です"}), 400

        db = get_db_manager()

        # ユーザーの存在確認
        user_df = db.execute_query("SELECT id FROM users WHERE id = :id", {"id": user_id})
        if user_df.empty:
            return jsonify({"success": False, "error": "ユーザーが見つかりません"}), 404

        # ロールの存在確認
        role_df = db.execute_query("SELECT id FROM roles WHERE id = :id", {"id": role_id})
        if role_df.empty:
            return jsonify({"success": False, "error": "ロールが見つかりません"}), 404

        # 既に割り当て済みかチェック
        existing_df = db.execute_query(
            "SELECT * FROM user_roles WHERE user_id = :user_id AND role_id = :role_id",
            {"user_id": user_id, "role_id": role_id},
        )

        if not existing_df.empty:
            return jsonify({"success": False, "error": "このロールは既に割り当てられています"}), 400

        # ロールを割り当て
        db.execute_update(
            "INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)",
            {"user_id": user_id, "role_id": role_id},
        )

        return jsonify({"success": True, "message": "ロールを割り当てました"})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@users_bp.route("/api/permissions/<int:role_id>", methods=["GET"])
def get_permissions(role_id: int):
    """ロールの権限を取得"""
    try:
        db = get_db_manager()

        # ロールの存在確認
        role_df = db.execute_query("SELECT id FROM roles WHERE id = :id", {"id": role_id})
        if role_df.empty:
            return jsonify({"success": False, "error": "ロールが見つかりません"}), 404

        # ページ権限を取得
        page_perms_df = db.execute_query(
            """
            SELECT page_name, can_view, can_edit
            FROM page_permissions
            WHERE role_id = :role_id
            ORDER BY page_name
            """,
            {"role_id": role_id},
        )

        # タブ権限を取得
        tab_perms_df = db.execute_query(
            """
            SELECT tab_name, can_view, can_edit
            FROM tab_permissions
            WHERE role_id = :role_id
            ORDER BY tab_name
            """,
            {"role_id": role_id},
        )

        return jsonify(
            {
                "success": True,
                "page_permissions": page_perms_df.to_dict(orient="records"),
                "tab_permissions": tab_perms_df.to_dict(orient="records"),
            }
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@users_bp.route("/api/permissions/<int:role_id>", methods=["PUT"])
def update_permissions(role_id: int):
    """ロールの権限を更新"""
    try:
        data = request.get_json() or {}
        page_permissions = data.get("page_permissions", [])
        tab_permissions = data.get("tab_permissions", [])

        db = get_db_manager()

        # ロールの存在確認
        role_df = db.execute_query("SELECT id FROM roles WHERE id = :id", {"id": role_id})
        if role_df.empty:
            return jsonify({"success": False, "error": "ロールが見つかりません"}), 404

        # ページ権限を更新
        for perm in page_permissions:
            page_name = perm.get("page_name")
            can_view = perm.get("can_view", 0)
            can_edit = perm.get("can_edit", 0)

            # 既存の権限をチェック
            existing_df = db.execute_query(
                "SELECT id FROM page_permissions WHERE role_id = :role_id AND page_name = :page_name",
                {"role_id": role_id, "page_name": page_name},
            )

            if existing_df.empty:
                # 新規追加
                db.execute_update(
                    """
                    INSERT INTO page_permissions (role_id, page_name, can_view, can_edit)
                    VALUES (:role_id, :page_name, :can_view, :can_edit)
                    """,
                    {
                        "role_id": role_id,
                        "page_name": page_name,
                        "can_view": can_view,
                        "can_edit": can_edit,
                    },
                )
            else:
                # 更新
                db.execute_update(
                    """
                    UPDATE page_permissions
                    SET can_view = :can_view, can_edit = :can_edit
                    WHERE role_id = :role_id AND page_name = :page_name
                    """,
                    {
                        "role_id": role_id,
                        "page_name": page_name,
                        "can_view": can_view,
                        "can_edit": can_edit,
                    },
                )

        # タブ権限を更新
        for perm in tab_permissions:
            tab_name = perm.get("tab_name")
            can_view = perm.get("can_view", 0)
            can_edit = perm.get("can_edit", 0)

            # 既存の権限をチェック
            existing_df = db.execute_query(
                "SELECT id FROM tab_permissions WHERE role_id = :role_id AND tab_name = :tab_name",
                {"role_id": role_id, "tab_name": tab_name},
            )

            if existing_df.empty:
                # 新規追加
                db.execute_update(
                    """
                    INSERT INTO tab_permissions (role_id, tab_name, can_view, can_edit)
                    VALUES (:role_id, :tab_name, :can_view, :can_edit)
                    """,
                    {
                        "role_id": role_id,
                        "tab_name": tab_name,
                        "can_view": can_view,
                        "can_edit": can_edit,
                    },
                )
            else:
                # 更新
                db.execute_update(
                    """
                    UPDATE tab_permissions
                    SET can_view = :can_view, can_edit = :can_edit
                    WHERE role_id = :role_id AND tab_name = :tab_name
                    """,
                    {
                        "role_id": role_id,
                        "tab_name": tab_name,
                        "can_view": can_view,
                        "can_edit": can_edit,
                    },
                )

        return jsonify({"success": True, "message": "権限を更新しました"})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

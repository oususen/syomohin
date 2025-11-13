"""
権限チェック用ユーティリティ
"""
from __future__ import annotations

from functools import wraps
from typing import Literal

from flask import jsonify, session

from database_manager import get_db_manager

PermissionAction = Literal["view", "edit"]


def _fetch_page_permission(user_id: int, page_name: str) -> dict:
    db = get_db_manager()
    df = db.execute_query(
        """
        SELECT
            MAX(pp.can_view) AS can_view,
            MAX(pp.can_edit) AS can_edit
        FROM user_roles ur
        JOIN page_permissions pp ON ur.role_id = pp.role_id
        WHERE ur.user_id = :user_id
          AND pp.page_name = :page_name
        """,
        {"user_id": user_id, "page_name": page_name},
    )

    if df.empty:
        return {"can_view": 0, "can_edit": 0}

    record = df.iloc[0].to_dict()
    return {
        "can_view": int(record.get("can_view") or 0),
        "can_edit": int(record.get("can_edit") or 0),
    }


def has_page_permission(page_name: str, action: PermissionAction = "view") -> bool:
    if "user_id" not in session:
        return False

    user_id = session["user_id"]
    permission = _fetch_page_permission(user_id, page_name)

    if action == "edit":
        return bool(permission.get("can_edit"))
    return bool(permission.get("can_view"))


def require_page_permission(page_name: str, action: PermissionAction = "view"):
    """
    ビュー関数に適用してページ権限を強制するデコレータ
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not has_page_permission(page_name, action):
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": "権限がありません（{}:{}）".format(page_name, action),
                        }
                    ),
                    403,
                )
            return func(*args, **kwargs)

        return wrapper

    return decorator

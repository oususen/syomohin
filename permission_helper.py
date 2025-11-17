"""
発注ワークフロー向けの権限ヘルパー
"""
from __future__ import annotations

from typing import Iterable

from database_manager import get_db_manager

# ロールと優先度の対応表（大きいほど権限が強い）
ROLE_PRIORITY = {
    "一般": 1,
    "リーダ": 2,
    "班長": 3,
    "係長": 4,
    "課長": 5,
    "部長": 6,
    "システム管理者": 7,
}


def _fetch_user_roles(user_id: int) -> Iterable[str]:
    """ユーザーに紐づくロール名を取得"""
    if not user_id:
        return []
    db = get_db_manager()
    df = db.execute_query(
        """
        SELECT r.role_name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = :user_id
        """,
        {"user_id": user_id},
    )
    if df.empty:
        return []
    return [str(row["role_name"]) for _, row in df.iterrows()]


def _get_max_role_priority(user_id: int) -> int:
    """ユーザーのロール優先度（最大値）を返す"""
    if not user_id:
        return 0
    roles = _fetch_user_roles(user_id)
    priorities = [ROLE_PRIORITY.get(role, 0) for role in roles]
    return max(priorities) if priorities else 0


def can_create_dispatch_order(user_id: int) -> bool:
    """注文書作成可否（班長以上）"""
    return _get_max_role_priority(user_id) >= ROLE_PRIORITY.get("班長", 0)


def can_review_dispatch_order(user_id: int) -> bool:
    """注文書確認可否（係長以上）"""
    return _get_max_role_priority(user_id) >= ROLE_PRIORITY.get("係長", 0)


def can_approve_dispatch_order(user_id: int, username: str | None = None) -> bool:
    """
    注文書承認可否（課長以上、または特例のatsumi係長）
    """
    max_priority = _get_max_role_priority(user_id)
    if max_priority >= ROLE_PRIORITY.get("課長", 0):
        return True

    if username and username.lower() == "atsumi":
        # atsumi係長は特例で承認可能
        return max_priority >= ROLE_PRIORITY.get("係長", 0)

    return False


def get_approval_name(user_id: int, username: str | None, full_name: str) -> str:
    """
    承認者表示名を取得。atsumi係長の場合は「(代)」を付与する。
    """
    if username and username.lower() == "atsumi":
        return f"{full_name} (代)"
    return full_name

"""
権限チェックのヘルパー関数
"""
from database_manager import get_db_manager

def get_user_roles(user_id):
    """ユーザーの役職を取得"""
    db = get_db_manager()
    roles_df = db.execute_query(
        """
        SELECT r.role_name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = :user_id
        """,
        {"user_id": user_id}
    )
    if roles_df.empty:
        return []
    return [row['role_name'] for _, row in roles_df.iterrows()]

def can_create_dispatch_order(user_id):
    """注文書作成権限チェック（班長以上）"""
    roles = get_user_roles(user_id)
    allowed_roles = ['班長', '係長', '課長', '部長', 'システム管理者']
    return any(role in allowed_roles for role in roles)

def can_review_dispatch_order(user_id):
    """注文書確認権限チェック（係長以上）"""
    roles = get_user_roles(user_id)
    allowed_roles = ['係長', '課長', '部長', 'システム管理者']
    return any(role in allowed_roles for role in roles)

def can_approve_dispatch_order(user_id, username=None):
    """注文書承認権限チェック（課長以上、またはatsumi係長）"""
    roles = get_user_roles(user_id)
    allowed_roles = ['課長', '部長', 'システム管理者']

    # 課長以上の権限がある場合
    if any(role in allowed_roles for role in roles):
        return True

    # atsumi係長の特別ケース
    if username == 'atsumi' and '係長' in roles:
        return True

    return False

def get_approval_name(user_id, username, full_name):
    """承認者名を取得（atsumi係長の場合は「代」を追加）"""
    roles = get_user_roles(user_id)

    # atsumi係長の特別ケース
    if username == 'atsumi' and '係長' in roles:
        return f"{full_name}（代）"

    return full_name

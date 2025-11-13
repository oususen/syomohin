"""
ページ権限の初期データを投入するスクリプト
"""
from database_manager import get_db_manager

def insert_page_permissions():
    db = get_db_manager()

    # ロールIDを取得
    roles = db.execute_query("SELECT id, role_name FROM roles")
    role_map = {row['role_name']: row['id'] for _, row in roles.iterrows()}

    print(f"Found {len(role_map)} roles")

    # 一般ユーザーの権限
    general_permissions = [
        ('在庫一覧', 1, 0),
        ('出庫', 1, 1),
        ('入庫', 1, 1),
        ('注文依頼', 1, 1),
        ('履歴', 1, 0)
    ]

    # リーダの権限
    leader_permissions = [
        ('在庫一覧', 1, 1),
        ('出庫', 1, 1),
        ('入庫', 1, 1),
        ('注文依頼', 1, 1),
        ('発注状態', 1, 1),
        ('履歴', 1, 0)
    ]

    # 班長の権限
    hancho_permissions = [
        ('在庫一覧', 1, 1),
        ('消耗品管理', 1, 1),
        ('出庫', 1, 1),
        ('入庫', 1, 1),
        ('注文依頼', 1, 1),
        ('発注状態', 1, 1),
        ('発注', 1, 1),
        ('履歴', 1, 0)
    ]

    # 係長の権限
    kakarich_permissions = [
        ('在庫一覧', 1, 1),
        ('消耗品管理', 1, 1),
        ('出庫', 1, 1),
        ('入庫', 1, 1),
        ('注文依頼', 1, 1),
        ('発注状態', 1, 1),
        ('発注', 1, 1),
        ('購入先管理', 1, 1),
        ('履歴', 1, 1)
    ]

    # 課長の権限
    kacho_permissions = [
        ('在庫一覧', 1, 1),
        ('消耗品管理', 1, 1),
        ('出庫', 1, 1),
        ('入庫', 1, 1),
        ('注文依頼', 1, 1),
        ('発注状態', 1, 1),
        ('発注', 1, 1),
        ('購入先管理', 1, 1),
        ('従業員管理', 1, 1),
        ('履歴', 1, 1)
    ]

    # 部長の権限（すべて）
    bucho_permissions = [
        ('在庫一覧', 1, 1),
        ('消耗品管理', 1, 1),
        ('出庫', 1, 1),
        ('入庫', 1, 1),
        ('注文依頼', 1, 1),
        ('発注状態', 1, 1),
        ('発注', 1, 1),
        ('購入先管理', 1, 1),
        ('従業員管理', 1, 1),
        ('ユーザー管理', 1, 1),
        ('履歴', 1, 1)
    ]

    permissions_map = {
        '一般': general_permissions,
        'リーダ': leader_permissions,
        '班長': hancho_permissions,
        '係長': kakarich_permissions,
        '課長': kacho_permissions,
        '部長': bucho_permissions
    }

    total_inserted = 0

    for role_name, permissions in permissions_map.items():
        if role_name not in role_map:
            print(f"Role not found: {role_name}")
            continue

        role_id = role_map[role_name]
        print(f"Inserting permissions for {role_name} (ID={role_id})")

        for page_name, can_view, can_edit in permissions:
            try:
                # 既存チェック
                check = db.execute_query(
                    "SELECT id FROM page_permissions WHERE role_id = :role_id AND page_name = :page_name",
                    {"role_id": role_id, "page_name": page_name}
                )

                if check.empty:
                    db.execute_update(
                        "INSERT INTO page_permissions (role_id, page_name, can_view, can_edit) VALUES (:role_id, :page_name, :can_view, :can_edit)",
                        {"role_id": role_id, "page_name": page_name, "can_view": can_view, "can_edit": can_edit}
                    )
                    total_inserted += 1
                    print(f"  Added: {page_name}")
                else:
                    print(f"  Skipped: {page_name} (exists)")
            except Exception as e:
                print(f"  Error: {page_name} - {e}")

    print(f"\nCompleted. Inserted {total_inserted} permissions")

if __name__ == "__main__":
    insert_page_permissions()

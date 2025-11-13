"""
ロールの初期データを直接投入するスクリプト
"""
from database_manager import get_db_manager

def insert_roles():
    """ロールの初期データを投入"""
    db = get_db_manager()

    # Check existing roles
    existing = db.execute_query("SELECT * FROM roles")
    print(f"Existing roles count: {len(existing)}")

    # ロールを投入
    roles = [
        ("一般", "一般社員。基本的な操作が可能"),
        ("リーダ", "チームリーダ。チーム内の調整・指示が可能"),
        ("班長", "班の責任者。班の管理・承認が可能"),
        ("係長", "係の責任者。係の管理・予算管理が可能"),
        ("課長", "課の責任者。課の管理・人事権限あり"),
        ("部長", "部の責任者。部の管理・すべての権限あり")
    ]

    for role_name, description in roles:
        try:
            # 既存チェック
            check = db.execute_query(
                "SELECT id FROM roles WHERE role_name = :role_name",
                {"role_name": role_name}
            )

            if check.empty:
                db.execute_update(
                    "INSERT INTO roles (role_name, description) VALUES (:role_name, :description)",
                    {"role_name": role_name, "description": description}
                )
                print(f"Added: {role_name}")
            else:
                print(f"Skipped: {role_name} (already exists)")
        except Exception as e:
            print(f"Error: {role_name} - {e}")

    # Final check
    result = db.execute_query("SELECT * FROM roles ORDER BY id")
    print(f"\nCompleted. Total {len(result)} roles")
    for _, row in result.iterrows():
        print(f"  ID={row['id']}, {row['role_name']}: {row['description']}")

if __name__ == "__main__":
    insert_roles()

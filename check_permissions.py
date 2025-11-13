"""
page_permissionsテーブルの重複をチェック
"""
from database_manager import get_db_manager

def check_permissions():
    db = get_db_manager()

    # すべてのpage_permissionsを取得
    query = """
        SELECT pp.id, r.role_name, pp.page_name, pp.can_view, pp.can_edit
        FROM page_permissions pp
        JOIN roles r ON pp.role_id = r.id
        ORDER BY r.role_name, pp.page_name
    """
    result = db.execute_query(query)

    print(f"Total permissions: {len(result)}")
    print("\nAll permissions:")
    for _, row in result.iterrows():
        print(f"  ID={row['id']}, Role={row['role_name']}, Page={row['page_name']}, View={row['can_view']}, Edit={row['can_edit']}")

    # 重複チェック
    duplicates_query = """
        SELECT role_id, page_name, COUNT(*) as count
        FROM page_permissions
        GROUP BY role_id, page_name
        HAVING COUNT(*) > 1
    """
    duplicates = db.execute_query(duplicates_query)

    if not duplicates.empty:
        print(f"\nDuplicates found: {len(duplicates)}")
        for _, row in duplicates.iterrows():
            print(f"  Role ID={row['role_id']}, Page={row['page_name']}, Count={row['count']}")
    else:
        print("\nNo duplicates found")

if __name__ == "__main__":
    check_permissions()

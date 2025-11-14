"""
dispatch_order_itemsテーブルにorder_codeカラムを追加し、既存データを更新
"""
from database_manager import get_db_manager

def add_order_code_column():
    db = get_db_manager()

    try:
        # order_codeカラムを追加
        print("order_codeカラムを追加中...")
        db.execute_update("""
            ALTER TABLE dispatch_order_items
            ADD COLUMN order_code VARCHAR(50) COMMENT '発注コード' AFTER code
        """)
        print("OK - order_codeカラムを追加しました")

        # 既存データのorder_codeを更新（consumablesテーブルから取得）
        print("\n既存データのorder_codeを更新中...")
        db.execute_update("""
            UPDATE dispatch_order_items doi
            INNER JOIN consumables c ON doi.consumable_id = c.id
            SET doi.order_code = c.order_code
            WHERE doi.consumable_id IS NOT NULL
        """)
        print("OK - 既存データを更新しました")

        # 確認
        result = db.execute_query("""
            SELECT id, code, order_code, name
            FROM dispatch_order_items
            LIMIT 10
        """)
        print("\n更新後のサンプルデータ:")
        print("=" * 80)
        for _, row in result.iterrows():
            print(f"  ID: {row['id']}, 製品コード: {row['code']}, 発注コード: {row['order_code']}, 商品名: {row['name']}")

    except Exception as e:
        print(f"ERROR - {e}")

if __name__ == "__main__":
    add_order_code_column()

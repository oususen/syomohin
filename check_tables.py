"""
データベース内のテーブルを確認
"""
from database_manager import get_db_manager

def check_tables():
    db = get_db_manager()

    # すべてのテーブルを表示
    result = db.execute_query("SHOW TABLES")
    print("データベース内のテーブル一覧:")
    print("=" * 50)
    for _, row in result.iterrows():
        print(f"  - {row.iloc[0]}")

    # dispatch_ordersテーブルの存在確認
    print("\n" + "=" * 50)
    try:
        result = db.execute_query("DESCRIBE dispatch_orders")
        print("dispatch_ordersテーブルの構造:")
        for _, row in result.iterrows():
            print(f"  {row['Field']}: {row['Type']}")
    except Exception as e:
        print(f"dispatch_ordersテーブルが見つかりません: {e}")

    # dispatch_order_itemsテーブルの存在確認
    print("\n" + "=" * 50)
    try:
        result = db.execute_query("DESCRIBE dispatch_order_items")
        print("dispatch_order_itemsテーブルの構造:")
        for _, row in result.iterrows():
            print(f"  {row['Field']}: {row['Type']}")
    except Exception as e:
        print(f"dispatch_order_itemsテーブルが見つかりません: {e}")

if __name__ == "__main__":
    check_tables()

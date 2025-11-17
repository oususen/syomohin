"""
dispatch_ordersテーブルに確認・承認カラムを追加するスクリプト
"""
from database_manager import get_db_manager

def add_approval_columns():
    db = get_db_manager()

    print("=" * 60)
    print("dispatch_ordersテーブルに確認・承認カラムを追加")
    print("=" * 60)

    columns_to_add = [
        ("reviewed_by", "INT NULL COMMENT '確認者のユーザーID'"),
        ("reviewed_by_name", "VARCHAR(100) NULL COMMENT '確認者の名前'"),
        ("reviewed_at", "TIMESTAMP NULL COMMENT '確認日時'"),
        ("approved_by", "INT NULL COMMENT '承認者のユーザーID'"),
        ("approved_by_name", "VARCHAR(100) NULL COMMENT '承認者の名前'"),
        ("approved_at", "TIMESTAMP NULL COMMENT '承認日時'"),
    ]

    for column_name, column_def in columns_to_add:
        try:
            print(f"\n{column_name}カラムを追加中...")
            db.execute_update(f"""
                ALTER TABLE dispatch_orders
                ADD COLUMN {column_name} {column_def}
            """)
            print(f"OK - {column_name}カラムを追加しました")
        except Exception as e:
            if "Duplicate column" in str(e):
                print(f"[INFO] {column_name} カラムは既に存在します")
            else:
                print(f"ERROR - {column_name}: {e}")
                raise

    # テーブル構造を確認
    print("\n" + "=" * 60)
    print("更新後のdispatch_ordersテーブル構造:")
    print("=" * 60)
    result = db.execute_query("DESCRIBE dispatch_orders")
    for _, row in result.iterrows():
        print(f"  {row['Field']}: {row['Type']} ({row['Null']})")

    print("\n" + "=" * 60)
    print("カラム追加が完了しました")
    print("=" * 60)

if __name__ == "__main__":
    add_approval_columns()

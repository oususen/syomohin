"""
dispatch_ordersテーブルにpdf_pathカラムを追加
"""
from database_manager import get_db_manager

def add_pdf_path_column():
    db = get_db_manager()

    try:
        # pdf_pathカラムを追加
        db.execute_update("""
            ALTER TABLE dispatch_orders
            ADD COLUMN pdf_path VARCHAR(500) COMMENT 'PDFファイルパス'
        """)
        print("OK - pdf_pathカラムを追加しました")

        # テーブル構造を確認
        result = db.execute_query("DESCRIBE dispatch_orders")
        print("\n更新後のdispatch_ordersテーブル構造:")
        print("=" * 80)
        for _, row in result.iterrows():
            print(f"  {row['Field']}: {row['Type']}")

    except Exception as e:
        print(f"ERROR - {e}")

if __name__ == "__main__":
    add_pdf_path_column()

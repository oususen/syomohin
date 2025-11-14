"""
既存のPDFパスをリセットして再生成を促す
"""
from database_manager import get_db_manager

def reset_pdf_paths():
    db = get_db_manager()

    try:
        # すべての注文書のpdf_pathをNULLに設定
        db.execute_update("UPDATE dispatch_orders SET pdf_path = NULL")
        print("OK - すべての注文書のPDFパスをリセットしました")

        # 確認
        result = db.execute_query("SELECT id, order_number, pdf_path FROM dispatch_orders")
        print("\n更新後の状態:")
        print("=" * 60)
        for _, row in result.iterrows():
            print(f"  ID: {row['id']}, 注文書番号: {row['order_number']}, PDFパス: {row['pdf_path']}")

    except Exception as e:
        print(f"ERROR - {e}")

if __name__ == "__main__":
    reset_pdf_paths()

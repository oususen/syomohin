"""
発注機能用テーブルを作成
"""
from database_manager import get_db_manager

def apply_dispatch_tables():
    db = get_db_manager()

    with open('init_dispatch.sql', 'r', encoding='utf-8') as f:
        sql_content = f.read()

    # SQLを実行（複数のステートメントを分割）
    statements = sql_content.split(';')

    for statement in statements:
        statement = statement.strip()
        if statement and not statement.startswith('--'):
            try:
                db.execute_update(statement)
                print(f"OK - Executed: {statement[:50]}...")
            except Exception as e:
                print(f"ERROR: {e}")
                print(f"  SQL: {statement[:100]}...")

    print("\nDispatch tables creation completed.")

if __name__ == "__main__":
    apply_dispatch_tables()

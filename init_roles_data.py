"""
役職の初期データを投入するスクリプト
"""
from database_manager import get_db_manager

def init_roles():
    """役職の初期データを投入"""
    db = get_db_manager()

    # SQLファイルを読み込んで実行
    with open('init_roles.sql', 'r', encoding='utf-8') as f:
        sql_statements = f.read().split(';')

        for statement in sql_statements:
            statement = statement.strip()
            if statement and not statement.startswith('--'):
                try:
                    db.execute_update(statement)
                    print(f"✓ Executed: {statement[:50]}...")
                except Exception as e:
                    print(f"✗ Error: {e}")
                    print(f"  Statement: {statement[:100]}...")

    print("\n役職データの投入が完了しました。")

if __name__ == "__main__":
    init_roles()

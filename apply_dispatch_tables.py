"""
発注機能用テーブルを作成
"""
from database_manager import get_db_manager

def apply_dispatch_tables():
    db = get_db_manager()

    with open('init_dispatch.sql', 'r', encoding='utf-8') as f:
        sql_content = f.read()

    print(f"SQL file content length: {len(sql_content)} characters")

    # SQLを実行（複数のステートメントを分割）
    statements = sql_content.split(';')
    print(f"Total statements after split: {len(statements)}")

    success_count = 0
    error_count = 0
    skipped_count = 0

    for idx, statement in enumerate(statements, 1):
        original_statement = statement
        statement = statement.strip()

        # コメント行を削除
        lines = statement.split('\n')
        cleaned_lines = [line for line in lines if not line.strip().startswith('--')]
        statement = '\n'.join(cleaned_lines).strip()

        if statement:
            print(f"\n[{idx}] Executing SQL...")
            print(f"  First 150 chars: {statement[:150]}")
            try:
                db.execute_update(statement)
                print(f"  [OK] SUCCESS")
                success_count += 1
            except Exception as e:
                print(f"  [ERROR] {e}")
                print(f"  Full SQL:\n{statement}")
                error_count += 1
        else:
            skipped_count += 1
            print(f"[{idx}] Skipped (empty or comment-only)")

    print("\n" + "=" * 60)
    print(f"Dispatch tables creation completed.")
    print(f"  Success: {success_count}")
    print(f"  Errors: {error_count}")
    print(f"  Skipped: {skipped_count}")
    print(f"  Errors: {error_count}")
    print("=" * 60)

if __name__ == "__main__":
    apply_dispatch_tables()

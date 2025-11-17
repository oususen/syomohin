"""
Fix tab_permissions table schema to make page_name nullable
"""
from database_manager import get_db_manager

def fix_tab_permissions():
    db = get_db_manager()

    try:
        # Make page_name nullable with a default value
        db.execute_update("""
            ALTER TABLE tab_permissions
            MODIFY COLUMN page_name VARCHAR(255) NULL DEFAULT NULL
        """)
        print("OK - Successfully modified tab_permissions table - page_name is now nullable")

        # Show the updated schema
        result = db.execute_query("DESCRIBE tab_permissions")
        print("\nUpdated tab_permissions schema:")
        print("=" * 80)
        for _, row in result.iterrows():
            print(f"Field: {row['Field']}, Type: {row['Type']}, Null: {row['Null']}, Default: {row['Default']}")

    except Exception as e:
        print(f"ERROR - Error modifying table: {e}")

if __name__ == "__main__":
    fix_tab_permissions()

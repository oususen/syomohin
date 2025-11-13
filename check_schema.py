from database_manager import get_db_manager

db = get_db_manager()
result = db.execute_query("DESCRIBE tab_permissions")
print("\ntab_permissions table schema:")
print("=" * 80)
for _, row in result.iterrows():
    print(f"Field: {row['Field']}, Type: {row['Type']}, Null: {row['Null']}, Key: {row['Key']}, Default: {row['Default']}")

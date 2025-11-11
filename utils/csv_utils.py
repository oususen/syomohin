"""
CSV処理ユーティリティ
"""
from __future__ import annotations

from config import CSV_FIELD_ALIASES


def resolve_csv_field(field_name: str | None) -> str | None:
    """CSVフィールド名を正規化"""
    if not field_name:
        return None

    key = field_name.strip()
    lower_key = key.lower()
    return CSV_FIELD_ALIASES.get(key) or CSV_FIELD_ALIASES.get(lower_key) or lower_key


def normalize_csv_row(row: dict[str, str | None]) -> dict[str, str | None]:
    """CSV行のフィールド名を正規化"""
    normalized: dict[str, str | None] = {}
    for raw_key, raw_value in row.items():
        target_key = resolve_csv_field(raw_key)
        if not target_key:
            continue
        if isinstance(raw_value, str):
            normalized[target_key] = raw_value.strip()
        else:
            normalized[target_key] = raw_value
    return normalized


def parse_int(value: str | int | float | None, default: int = 0) -> int:
    """文字列を整数に変換"""
    if value is None:
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    cleaned = value.strip().replace(",", "")
    if cleaned == "":
        return default
    try:
        return int(float(cleaned))
    except (ValueError, TypeError):
        return default


def parse_float(value: str | int | float | None, default: float = 0.0) -> float:
    """文字列を浮動小数点数に変換"""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = value.strip().replace(",", "")
    if cleaned == "":
        return default
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return default


def resolve_supplier_id(db, row: dict[str, str | None], cache: dict[str, int | None]) -> int | None:
    """仕入先IDを解決（キャッシュ付き）"""
    supplier_id_value = row.get("supplier_id")
    if supplier_id_value not in (None, ""):
        try:
            parsed = int(float(str(supplier_id_value)))
            if parsed > 0:
                return parsed
        except (ValueError, TypeError):
            pass

    supplier_name = row.get("supplier_name")
    if not supplier_name:
        return None

    supplier_name = supplier_name.strip()
    if not supplier_name:
        return None

    if supplier_name not in cache:
        result = db.execute_query(
            "SELECT id FROM suppliers WHERE name = :name",
            {"name": supplier_name},
        )
        cache[supplier_name] = int(result.iloc[0]["id"]) if not result.empty else None

    return cache[supplier_name]

"""
バリデーションユーティリティ
"""
from __future__ import annotations

from datetime import datetime


def allowed_file(filename: str, allowed_extensions: set) -> bool:
    """ファイル拡張子のチェック"""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_extensions


def sanitize_filename(value: str) -> str:
    """ファイル名を安全な文字列に変換"""
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in value)
    safe = safe.strip("_")
    return safe or f"order_{datetime.now().strftime('%Y%m%d%H%M%S')}"


def normalize_recipient_list(value) -> list[str]:
    """メール受信者リストを正規化"""
    if not value:
        return []
    if isinstance(value, str):
        value = value.replace(";", ",")
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, list):
        cleaned = []
        for item in value:
            if not item:
                continue
            cleaned_value = str(item).strip()
            if cleaned_value:
                cleaned.append(cleaned_value)
        return cleaned
    return []

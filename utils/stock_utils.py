"""在庫数量に応じて欠品状態を算出するユーティリティ."""

from __future__ import annotations


def _to_int(value) -> int:
    """数値っぽい値を安全にintへ変換."""
    if value is None:
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    try:
        text = str(value).strip()
        return int(float(text)) if text else 0
    except (ValueError, TypeError):
        return 0


def calculate_shortage_status(stock_quantity, safety_stock) -> str:
    """
    欠品状態を計算する.

    0以下: 欠品
    安全在庫（safety_stock）以下: 要注意
    安全在庫を超える: 在庫あり
    """
    stock = _to_int(stock_quantity)
    safety = _to_int(safety_stock)

    if stock <= 0:
        return "欠品"
    if stock <= safety:
        return "要注意"
    return "在庫あり"

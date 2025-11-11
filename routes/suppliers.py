"""
仕入先管理APIルート
"""
from __future__ import annotations

from flask import Blueprint, jsonify

from database_manager import get_db_manager

suppliers_bp = Blueprint("suppliers", __name__)


@suppliers_bp.route("/api/suppliers")
def get_suppliers():
    """購入先一覧を取得するAPI"""
    try:
        db = get_db_manager()
        df = db.execute_query("SELECT id, name, contact, phone, email FROM suppliers ORDER BY name")
        return jsonify({"success": True, "data": df.to_dict(orient="records")})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

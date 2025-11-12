"""
入出庫履歴APIルート
"""
from __future__ import annotations

import pandas as pd
from flask import Blueprint, jsonify, request

from database_manager import get_db_manager

history_bp = Blueprint("history", __name__)


@history_bp.route("/api/history", methods=["GET"])
def get_history():
    """入出庫履歴を統合して取得するAPI"""
    try:
        db = get_db_manager()

        # クエリパラメータから検索条件を取得
        history_type = request.args.get("type", "all")  # all, outbound, inbound
        start_date = request.args.get("start_date", "")
        end_date = request.args.get("end_date", "")
        search_text = request.args.get("search_text", "")
        department = request.args.get("department", "")

        results = []

        # 出庫履歴を取得
        if history_type in ["all", "outbound"]:
            outbound_query = """
                SELECT
                    '出庫' AS type,
                    code,
                    name,
                    quantity,
                    employee_name,
                    employee_department,
                    unit_price,
                    total_amount,
                    note,
                    outbound_date AS date
                FROM outbound_history
                WHERE 1=1
            """
            outbound_params = {}

            if start_date:
                outbound_query += " AND DATE(outbound_date) >= :start_date"
                outbound_params["start_date"] = start_date

            if end_date:
                outbound_query += " AND DATE(outbound_date) <= :end_date"
                outbound_params["end_date"] = end_date

            if search_text:
                outbound_query += " AND (name LIKE :search_text OR employee_name LIKE :search_text)"
                outbound_params["search_text"] = f"%{search_text}%"

            if department:
                outbound_query += " AND employee_department = :department"
                outbound_params["department"] = department

            outbound_df = db.execute_query(outbound_query, outbound_params)
            if not outbound_df.empty:
                results.append(outbound_df)

        # 入庫履歴を取得
        if history_type in ["all", "inbound"]:
            inbound_query = """
                SELECT
                    '入庫' AS type,
                    code,
                    name,
                    quantity,
                    employee_name,
                    employee_department,
                    unit_price,
                    total_amount,
                    note,
                    inbound_date AS date
                FROM inbound_history
                WHERE 1=1
            """
            inbound_params = {}

            if start_date:
                inbound_query += " AND DATE(inbound_date) >= :start_date"
                inbound_params["start_date"] = start_date

            if end_date:
                inbound_query += " AND DATE(inbound_date) <= :end_date"
                inbound_params["end_date"] = end_date

            if search_text:
                inbound_query += " AND (name LIKE :search_text OR employee_name LIKE :search_text)"
                inbound_params["search_text"] = f"%{search_text}%"

            if department:
                inbound_query += " AND employee_department = :department"
                inbound_params["department"] = department

            inbound_df = db.execute_query(inbound_query, inbound_params)
            if not inbound_df.empty:
                results.append(inbound_df)

        # 結果を結合してソート
        if results:
            combined_df = pd.concat(results, ignore_index=True)
            combined_df = combined_df.sort_values(by="date", ascending=False)
            combined_df = combined_df.head(1000)  # 最大1000件
        else:
            combined_df = pd.DataFrame()

        return jsonify({
            "success": True,
            "data": combined_df.to_dict(orient="records"),
            "count": len(combined_df)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@history_bp.route("/api/history/departments", methods=["GET"])
def get_departments():
    """履歴から部署の一覧を取得するAPI"""
    try:
        db = get_db_manager()

        # 出庫履歴から部署を取得
        outbound_query = """
            SELECT DISTINCT employee_department
            FROM outbound_history
            WHERE employee_department IS NOT NULL AND employee_department != ''
        """
        outbound_df = db.execute_query(outbound_query)

        # 入庫履歴から部署を取得
        inbound_query = """
            SELECT DISTINCT employee_department
            FROM inbound_history
            WHERE employee_department IS NOT NULL AND employee_department != ''
        """
        inbound_df = db.execute_query(inbound_query)

        # 結合してユニークな部署リストを作成
        departments = set()
        if not outbound_df.empty:
            departments.update(outbound_df["employee_department"].tolist())
        if not inbound_df.empty:
            departments.update(inbound_df["employee_department"].tolist())

        return jsonify({
            "success": True,
            "departments": sorted(list(departments))
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

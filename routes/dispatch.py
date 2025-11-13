"""
発注管理APIルート
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request, session
from datetime import datetime
import pandas as pd

from database_manager import get_db_manager

dispatch_bp = Blueprint("dispatch", __name__)


# ========================================
# 1. 依頼管理API
# ========================================

@dispatch_bp.route("/api/orders/pending", methods=["GET"])
def get_pending_orders():
    """発注待ちの依頼一覧を取得"""
    try:
        db = get_db_manager()

        # 依頼中と発注準備のものを取得
        query = """
            SELECT
                o.id,
                o.code,
                o.name,
                o.quantity,
                o.unit,
                o.unit_price,
                o.total_amount,
                o.deadline,
                o.requester_name,
                o.supplier_id,
                s.name as supplier_name,
                o.note,
                o.status,
                o.requested_date,
                o.order_type
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.status IN ('依頼中', '発注準備')
            ORDER BY o.requested_date DESC
        """
        df = db.execute_query(query)

        # Timestamp列を文字列に変換
        if "requested_date" in df.columns:
            df["requested_date"] = df["requested_date"].dt.strftime("%Y-%m-%d %H:%M:%S")

        # NaTをNoneに変換
        df = df.where(df.notna(), None)

        return jsonify({"success": True, "data": df.to_dict(orient="records")})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@dispatch_bp.route("/api/orders/<int:order_id>/status", methods=["PUT"])
def update_order_status(order_id: int):
    """依頼のステータスを更新（却下/発注準備）"""
    try:
        data = request.get_json() or {}
        new_status = data.get("status", "").strip()

        if new_status not in ["却下", "発注準備", "依頼中"]:
            return jsonify({"success": False, "error": "無効なステータスです"}), 400

        db = get_db_manager()

        # ステータスを更新
        db.execute_update(
            "UPDATE orders SET status = :status WHERE id = :id",
            {"status": new_status, "id": order_id}
        )

        return jsonify({"success": True, "message": f"ステータスを「{new_status}」に更新しました"})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@dispatch_bp.route("/api/orders/add-to-dispatch", methods=["POST"])
def add_order_to_dispatch():
    """消耗品一覧から直接発注準備に追加"""
    try:
        data = request.get_json() or {}
        consumable_id = data.get("consumable_id")
        quantity = data.get("quantity", 1)
        deadline = data.get("deadline", "通常")
        note = data.get("note", "")

        if not consumable_id:
            return jsonify({"success": False, "error": "商品IDが必要です"}), 400

        db = get_db_manager()

        # 消耗品情報を取得
        consumable_df = db.execute_query(
            """
            SELECT
                c.id,
                c.code,
                c.name,
                c.unit,
                c.unit_price,
                c.supplier_id,
                s.name as supplier_name
            FROM consumables c
            LEFT JOIN suppliers s ON c.supplier_id = s.id
            WHERE c.id = :id
            """,
            {"id": consumable_id}
        )

        if consumable_df.empty:
            return jsonify({"success": False, "error": "商品が見つかりません"}), 404

        consumable = consumable_df.iloc[0]

        # 現在のユーザー情報を取得
        requester_name = session.get("full_name", session.get("username", "システム"))

        # ordersテーブルに追加（ステータス: 発注準備）
        total_amount = float(consumable["unit_price"] or 0) * int(quantity)

        db.execute_update(
            """
            INSERT INTO orders (
                consumable_id, code, name, quantity, unit, unit_price, total_amount,
                deadline, requester_name, supplier_id, note, status, order_type, requested_date
            ) VALUES (
                :consumable_id, :code, :name, :quantity, :unit, :unit_price, :total_amount,
                :deadline, :requester_name, :supplier_id, :note, :status, :order_type, :requested_date
            )
            """,
            {
                "consumable_id": consumable_id,
                "code": consumable["code"],
                "name": consumable["name"],
                "quantity": quantity,
                "unit": consumable["unit"],
                "unit_price": consumable["unit_price"],
                "total_amount": total_amount,
                "deadline": deadline,
                "requester_name": requester_name,
                "supplier_id": consumable["supplier_id"],
                "note": note,
                "status": "発注準備",
                "order_type": "直接追加",
                "requested_date": datetime.now()
            }
        )

        return jsonify({"success": True, "message": "発注準備に追加しました"})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ========================================
# 2. 注文書作成API
# ========================================

@dispatch_bp.route("/api/dispatch/items", methods=["GET"])
def get_dispatch_items():
    """発注準備中のアイテムを購入先別に取得"""
    try:
        db = get_db_manager()

        query = """
            SELECT
                o.id,
                o.consumable_id,
                o.code,
                o.name,
                o.quantity,
                o.unit,
                o.unit_price,
                o.total_amount,
                o.deadline,
                o.note,
                o.supplier_id,
                s.name as supplier_name,
                s.email as supplier_email
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.status = '発注準備'
            ORDER BY s.name, o.name
        """
        df = db.execute_query(query)

        # NaTをNoneに変換
        df = df.where(df.notna(), None)

        # 購入先別にグループ化
        items = df.to_dict(orient="records")
        grouped = {}
        for item in items:
            supplier_id = item["supplier_id"]
            if supplier_id not in grouped:
                grouped[supplier_id] = {
                    "supplier_id": supplier_id,
                    "supplier_name": item["supplier_name"],
                    "supplier_email": item["supplier_email"],
                    "items": []
                }
            grouped[supplier_id]["items"].append(item)

        return jsonify({"success": True, "data": list(grouped.values())})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@dispatch_bp.route("/api/dispatch/items/<int:item_id>", methods=["PUT"])
def update_dispatch_item(item_id: int):
    """発注準備アイテムの数量・納期を編集"""
    try:
        data = request.get_json() or {}
        quantity = data.get("quantity")
        deadline = data.get("deadline")
        note = data.get("note")

        db = get_db_manager()

        # 現在の単価を取得
        order_df = db.execute_query(
            "SELECT unit_price FROM orders WHERE id = :id",
            {"id": item_id}
        )

        if order_df.empty:
            return jsonify({"success": False, "error": "アイテムが見つかりません"}), 404

        unit_price = float(order_df.iloc[0]["unit_price"] or 0)

        # 更新パラメータを準備
        updates = []
        params = {"id": item_id}

        if quantity is not None:
            updates.append("quantity = :quantity")
            updates.append("total_amount = :total_amount")
            params["quantity"] = quantity
            params["total_amount"] = unit_price * int(quantity)

        if deadline is not None:
            updates.append("deadline = :deadline")
            params["deadline"] = deadline

        if note is not None:
            updates.append("note = :note")
            params["note"] = note

        if not updates:
            return jsonify({"success": False, "error": "更新する項目がありません"}), 400

        # 更新実行
        update_sql = f"UPDATE orders SET {', '.join(updates)} WHERE id = :id"
        db.execute_update(update_sql, params)

        return jsonify({"success": True, "message": "アイテムを更新しました"})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@dispatch_bp.route("/api/dispatch/orders", methods=["POST"])
def create_dispatch_order():
    """注文書を作成して保存"""
    try:
        data = request.get_json() or {}
        supplier_id = data.get("supplier_id")
        item_ids = data.get("item_ids", [])
        note = data.get("note", "")

        if not supplier_id or not item_ids:
            return jsonify({"success": False, "error": "購入先IDとアイテムIDが必要です"}), 400

        db = get_db_manager()

        # 購入先情報を取得
        supplier_df = db.execute_query(
            "SELECT name FROM suppliers WHERE id = :id",
            {"id": supplier_id}
        )

        if supplier_df.empty:
            return jsonify({"success": False, "error": "購入先が見つかりません"}), 404

        supplier_name = supplier_df.iloc[0]["name"]

        # 注文書番号を生成
        today = datetime.now().strftime("%Y%m%d")
        count_df = db.execute_query(
            "SELECT COUNT(*) as count FROM dispatch_orders WHERE order_number LIKE :pattern",
            {"pattern": f"PO-{today}-%"}
        )
        count = count_df.iloc[0]["count"] + 1
        order_number = f"PO-{today}-{count:03d}"

        # 対象アイテムを取得
        placeholders = ','.join([':id' + str(i) for i in range(len(item_ids))])
        item_params = {f'id{i}': item_id for i, item_id in enumerate(item_ids)}

        items_df = db.execute_query(
            f"""
            SELECT
                id, consumable_id, code, name, quantity, unit,
                unit_price, total_amount, deadline, note
            FROM orders
            WHERE id IN ({placeholders}) AND status = '発注準備' AND supplier_id = :supplier_id
            """,
            {**item_params, "supplier_id": supplier_id}
        )

        if items_df.empty:
            return jsonify({"success": False, "error": "有効なアイテムが見つかりません"}), 404

        # 合計計算
        total_items = len(items_df)
        total_amount = items_df["total_amount"].sum()

        # 現在のユーザー
        created_by = session.get("full_name", session.get("username", "システム"))

        # dispatch_ordersテーブルに注文書を作成
        db.execute_update(
            """
            INSERT INTO dispatch_orders (
                order_number, supplier_id, supplier_name, total_items, total_amount,
                status, created_by, note, created_at
            ) VALUES (
                :order_number, :supplier_id, :supplier_name, :total_items, :total_amount,
                :status, :created_by, :note, :created_at
            )
            """,
            {
                "order_number": order_number,
                "supplier_id": supplier_id,
                "supplier_name": supplier_name,
                "total_items": total_items,
                "total_amount": float(total_amount),
                "status": "未送信",
                "created_by": created_by,
                "note": note,
                "created_at": datetime.now()
            }
        )

        # 作成した注文書のIDを取得
        order_id_df = db.execute_query(
            "SELECT id FROM dispatch_orders WHERE order_number = :order_number",
            {"order_number": order_number}
        )
        dispatch_order_id = order_id_df.iloc[0]["id"]

        # dispatch_order_itemsテーブルに明細を追加
        for _, item in items_df.iterrows():
            db.execute_update(
                """
                INSERT INTO dispatch_order_items (
                    dispatch_order_id, consumable_id, code, name, quantity, unit,
                    unit_price, total_amount, deadline, note, original_order_id
                ) VALUES (
                    :dispatch_order_id, :consumable_id, :code, :name, :quantity, :unit,
                    :unit_price, :total_amount, :deadline, :note, :original_order_id
                )
                """,
                {
                    "dispatch_order_id": dispatch_order_id,
                    "consumable_id": item["consumable_id"],
                    "code": item["code"],
                    "name": item["name"],
                    "quantity": item["quantity"],
                    "unit": item["unit"],
                    "unit_price": item["unit_price"],
                    "total_amount": item["total_amount"],
                    "deadline": item["deadline"],
                    "note": item["note"],
                    "original_order_id": item["id"]
                }
            )

        # 元のordersのステータスを「発注済」に更新
        for item_id in item_ids:
            db.execute_update(
                "UPDATE orders SET status = '発注済', ordered_date = :ordered_date WHERE id = :id",
                {"ordered_date": datetime.now(), "id": item_id}
            )

        return jsonify({
            "success": True,
            "message": "注文書を作成しました",
            "order_number": order_number,
            "dispatch_order_id": dispatch_order_id
        })
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ========================================
# 3. 注文書送信API
# ========================================

@dispatch_bp.route("/api/dispatch/orders", methods=["GET"])
def get_dispatch_orders():
    """保存済み注文書の一覧を取得"""
    try:
        db = get_db_manager()

        query = """
            SELECT
                id,
                order_number,
                supplier_id,
                supplier_name,
                total_items,
                total_amount,
                status,
                created_by,
                created_at,
                sent_at,
                sent_email,
                note
            FROM dispatch_orders
            ORDER BY created_at DESC
        """
        df = db.execute_query(query)

        # Timestamp列を文字列に変換
        if "created_at" in df.columns:
            df["created_at"] = df["created_at"].dt.strftime("%Y-%m-%d %H:%M:%S")
        if "sent_at" in df.columns:
            df["sent_at"] = df["sent_at"].dt.strftime("%Y-%m-%d %H:%M:%S")

        # NaTをNoneに変換
        df = df.where(df.notna(), None)

        return jsonify({"success": True, "data": df.to_dict(orient="records")})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@dispatch_bp.route("/api/dispatch/orders/<int:order_id>", methods=["GET"])
def get_dispatch_order_detail(order_id: int):
    """注文書の詳細を取得"""
    try:
        db = get_db_manager()

        # 注文書マスター情報
        order_df = db.execute_query(
            """
            SELECT
                id, order_number, supplier_id, supplier_name, total_items, total_amount,
                status, created_by, created_at, sent_at, sent_email, note
            FROM dispatch_orders
            WHERE id = :id
            """,
            {"id": order_id}
        )

        if order_df.empty:
            return jsonify({"success": False, "error": "注文書が見つかりません"}), 404

        # Timestamp列を文字列に変換
        if "created_at" in order_df.columns:
            order_df["created_at"] = order_df["created_at"].dt.strftime("%Y-%m-%d %H:%M:%S")
        if "sent_at" in order_df.columns:
            order_df["sent_at"] = order_df["sent_at"].dt.strftime("%Y-%m-%d %H:%M:%S")

        order_df = order_df.where(order_df.notna(), None)
        order_data = order_df.iloc[0].to_dict()

        # 注文書明細
        items_df = db.execute_query(
            """
            SELECT
                id, consumable_id, code, name, quantity, unit,
                unit_price, total_amount, deadline, note
            FROM dispatch_order_items
            WHERE dispatch_order_id = :dispatch_order_id
            ORDER BY name
            """,
            {"dispatch_order_id": order_id}
        )

        items_df = items_df.where(items_df.notna(), None)
        order_data["items"] = items_df.to_dict(orient="records")

        return jsonify({"success": True, "data": order_data})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@dispatch_bp.route("/api/dispatch/orders/<int:order_id>/send", methods=["POST"])
def send_dispatch_order(order_id: int):
    """注文書をメール送信"""
    try:
        data = request.get_json() or {}
        email = data.get("email", "").strip()

        if not email:
            return jsonify({"success": False, "error": "送信先メールアドレスが必要です"}), 400

        db = get_db_manager()

        # 注文書の存在確認
        order_df = db.execute_query(
            "SELECT id, status FROM dispatch_orders WHERE id = :id",
            {"id": order_id}
        )

        if order_df.empty:
            return jsonify({"success": False, "error": "注文書が見つかりません"}), 404

        # TODO: ここで実際のPDF生成とメール送信処理を実装
        # 現在はダミー実装

        # ステータスを「送信済」に更新
        db.execute_update(
            """
            UPDATE dispatch_orders
            SET status = '送信済', sent_at = :sent_at, sent_email = :sent_email
            WHERE id = :id
            """,
            {
                "sent_at": datetime.now(),
                "sent_email": email,
                "id": order_id
            }
        )

        return jsonify({
            "success": True,
            "message": f"注文書を {email} に送信しました"
        })
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500

"""
在庫管理APIルート
"""
from __future__ import annotations

import base64

import cv2
import numpy as np
import pandas as pd
from flask import Blueprint, jsonify, request
from PIL import Image
from io import BytesIO

from database_manager import get_db_manager
from utils.stock_utils import calculate_shortage_status

inventory_bp = Blueprint("inventory", __name__)


def decode_qr_from_image(image_bytes: bytes) -> str | None:
    """画像からQRコードを読み取る"""
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        rgb_array = np.array(image)
        bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
        detector = cv2.QRCodeDetector()
        data, points, _ = detector.detectAndDecode(bgr_array)
        return data or None
    except Exception:
        return None


@inventory_bp.route("/api/inventory")
def get_inventory():
    """在庫データを取得するAPI"""
    try:
        db = get_db_manager()

        # クエリパラメータからフィルター条件を取得
        qr_code = request.args.get("qr_code", "").strip()
        search_text = request.args.get("search_text", "").strip()
        order_status = request.args.get("order_status", "").strip()
        shortage_status = request.args.get("shortage_status", "").strip()

        # ベースクエリ
        query = """
            SELECT
                c.id,
                c.code AS コード,
                c.order_code AS 発注コード,
                c.name AS 品名,
                c.category AS カテゴリ,
                c.unit AS 単位,
                c.stock_quantity AS 在庫数,
                c.safety_stock AS 安全在庫,
                c.unit_price AS 単価,
                c.unit_price AS unit_price,
                c.order_status AS 注文状態,
                c.shortage_status AS 欠品状態,
                s.name AS 購入先,
                c.image_path AS 画像URL,
                c.note AS 備考
            FROM consumables c
            LEFT JOIN suppliers s ON c.supplier_id = s.id
            WHERE 1=1
        """
        params = {}

        # フィルター条件を追加
        if qr_code:
            query += " AND LOWER(c.code) = LOWER(:qr_code)"
            params["qr_code"] = qr_code

        if search_text:
            query += " AND c.name LIKE :search_text"
            params["search_text"] = f"%{search_text}%"

        if order_status and order_status != "すべて":
            query += " AND c.order_status = :order_status"
            params["order_status"] = order_status

        if shortage_status and shortage_status != "すべて":
            query += " AND c.shortage_status = :shortage_status"
            params["shortage_status"] = shortage_status

        query += " ORDER BY c.code"

        # データ取得
        df = db.execute_query(query, params)

        # 全件数取得
        total_df = db.execute_query("SELECT COUNT(*) as total FROM consumables")
        total = int(total_df.iloc[0]["total"]) if not total_df.empty else 0

        # 各商品の依頼中の注文情報を取得
        if not df.empty:
            try:
                consumable_ids = df['id'].tolist()
                placeholders = ','.join([f':id{i}' for i in range(len(consumable_ids))])
                order_params = {f'id{i}': cid for i, cid in enumerate(consumable_ids)}

                orders_query = f"""
                    SELECT
                        o.consumable_id,
                        o.requested_date AS 依頼日,
                        o.requester_name AS 依頼者,
                        o.quantity AS 依頼数量,
                        o.deadline AS 納期,
                        o.ordered_date AS 注文日
                    FROM orders o
                    WHERE o.consumable_id IN ({placeholders})
                    AND o.status = '依頼中'
                    ORDER BY o.requested_date DESC
                """

                orders_df = db.execute_query(orders_query, order_params)

                # 商品ごとに注文情報をグループ化
                orders_dict = {}
                if not orders_df.empty:
                    for _, order in orders_df.iterrows():
                        consumable_id = int(order['consumable_id'])
                        if consumable_id not in orders_dict:
                            orders_dict[consumable_id] = []
                        orders_dict[consumable_id].append({
                            '依頼日': order['依頼日'].strftime('%Y-%m-%d') if pd.notna(order['依頼日']) else None,
                            '依頼者': str(order['依頼者']) if pd.notna(order['依頼者']) else None,
                            '依頼数量': int(order['依頼数量']) if pd.notna(order['依頼数量']) else 0,
                            '納期': str(order['納期']) if pd.notna(order['納期']) else None,
                            '注文日': order['注文日'].strftime('%Y-%m-%d') if pd.notna(order['注文日']) else None
                        })

                # データフレームに注文情報を追加
                df['依頼中注文'] = df['id'].apply(lambda x: orders_dict.get(int(x), []))
            except Exception as e:
                print(f"Error fetching pending orders: {e}")
                # エラーが発生しても、空の配列を設定
                df['依頼中注文'] = [[] for _ in range(len(df))]
        else:
            # データフレームが空の場合も、カラムを追加
            df['依頼中注文'] = []

        # JSON形式で返す
        return jsonify(
            {
                "success": True,
                "data": df.to_dict(orient="records"),
                "total": total,
                "filtered": len(df),
            }
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@inventory_bp.route("/api/decode-qr", methods=["POST"])
def decode_qr():
    """QRコードを解析するAPI"""
    try:
        data = request.get_json()
        if not data or "image" not in data:
            return jsonify({"success": False, "error": "画像データがありません"}), 400

        # base64画像をデコード
        image_data = data["image"].split(",")[1]
        image_bytes = base64.b64decode(image_data)

        # QRコード読み取り
        decoded_value = decode_qr_from_image(image_bytes)

        if decoded_value:
            return jsonify({"success": True, "data": decoded_value})
        else:
            return jsonify({"success": False, "error": "QRコードを認識できませんでした"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@inventory_bp.route("/api/filter-options")
def get_filter_options():
    """フィルターの選択肢を取得するAPI"""
    try:
        db = get_db_manager()

        # 注文状態の選択肢
        order_status_df = db.execute_query(
            "SELECT DISTINCT order_status FROM consumables WHERE order_status IS NOT NULL ORDER BY order_status"
        )
        order_status_list = ["すべて"] + order_status_df["order_status"].tolist()

        # 欠品状態の選択肢（固定リスト）
        shortage_status_list = ["すべて", "在庫あり", "要注意", "欠品"]

        return jsonify(
            {
                "success": True,
                "order_status": order_status_list,
                "shortage_status": shortage_status_list,
            }
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@inventory_bp.route("/api/outbound", methods=["POST"])
def create_outbound():
    """出庫を記録するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        # 必須パラメータチェック
        code = data.get("code")
        quantity = data.get("quantity")
        person = data.get("person")

        if not all([code, quantity, person]):
            return jsonify({"success": False, "error": "必須パラメータが不足しています"}), 400

        # 消耗品情報を取得
        item_df = db.execute_query(
            "SELECT id, name, stock_quantity, safety_stock, unit_price FROM consumables WHERE code = :code",
            {"code": code},
        )

        if item_df.empty:
            return jsonify({"success": False, "error": "商品が見つかりません"}), 404

        item = item_df.iloc[0]
        consumable_id = int(item["id"])
        current_stock = int(item["stock_quantity"])
        safety_stock = int(item["safety_stock"]) if item["safety_stock"] is not None else 0
        unit_price = float(item["unit_price"]) if item["unit_price"] else 0

        # 在庫チェック
        if current_stock < quantity:
            return jsonify({"success": False, "error": "在庫が不足しています"}), 400

        # 出庫履歴を登録
        total_amount = quantity * unit_price
        db.execute_update(
            """
            INSERT INTO outbound_history (
                consumable_id, code, name, quantity, employee_name, employee_department,
                unit_price, total_amount, note, outbound_date
            ) VALUES (
                :consumable_id, :code, :name, :quantity, :employee_name, :employee_department,
                :unit_price, :total_amount, :note, NOW()
            )
            """,
            {
                "consumable_id": consumable_id,
                "code": code,
                "name": item["name"],
                "quantity": quantity,
                "employee_name": person,
                "employee_department": data.get("department", ""),
                "unit_price": unit_price,
                "total_amount": total_amount,
                "note": data.get("note", ""),
            },
        )

        # 在庫数を減らす
        new_stock = current_stock - quantity
        new_status = calculate_shortage_status(new_stock, safety_stock)
        db.execute_update(
            "UPDATE consumables SET stock_quantity = :stock, shortage_status = :status WHERE id = :id",
            {"stock": new_stock, "status": new_status, "id": consumable_id},
        )

        return jsonify({"success": True, "message": "出庫を記録しました", "new_stock": new_stock})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@inventory_bp.route("/api/inbound", methods=["POST"])
def create_inbound():
    """入庫を記録するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        # 必須パラメータチェック
        code = data.get("code")
        quantity = data.get("quantity")
        person = data.get("person")

        if not all([code, quantity, person]):
            return jsonify({"success": False, "error": "必須パラメータが不足しています"}), 400

        # 消耗品情報を取得
        item_df = db.execute_query(
            "SELECT id, name, stock_quantity, safety_stock, unit_price FROM consumables WHERE code = :code",
            {"code": code},
        )

        if item_df.empty:
            return jsonify({"success": False, "error": "商品が見つかりません"}), 404

        item = item_df.iloc[0]
        consumable_id = int(item["id"])
        current_stock = int(item["stock_quantity"])
        safety_stock = int(item["safety_stock"]) if item["safety_stock"] is not None else 0
        unit_price = float(item["unit_price"]) if item["unit_price"] else 0

        # 入庫履歴を登録
        total_amount = quantity * unit_price
        db.execute_update(
            """
            INSERT INTO inbound_history (
                consumable_id, code, name, quantity, employee_name, employee_department,
                unit_price, total_amount, note, inbound_type, inbound_date
            ) VALUES (
                :consumable_id, :code, :name, :quantity, :employee_name, :employee_department,
                :unit_price, :total_amount, :note, :inbound_type, NOW()
            )
            """,
            {
                "consumable_id": consumable_id,
                "code": code,
                "name": item["name"],
                "quantity": quantity,
                "employee_name": person,
                "employee_department": data.get("department", ""),
                "unit_price": unit_price,
                "total_amount": total_amount,
                "note": data.get("note", ""),
                "inbound_type": data.get("inbound_type", "手動"),
            },
        )

        # 在庫数を増やす
        new_stock = current_stock + quantity
        new_status = calculate_shortage_status(new_stock, safety_stock)
        db.execute_update(
            "UPDATE consumables SET stock_quantity = :stock, shortage_status = :status WHERE id = :id",
            {"stock": new_stock, "status": new_status, "id": consumable_id},
        )

        return jsonify({"success": True, "message": "入庫を記録しました", "new_stock": new_stock})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

"""
注文管理APIルート
"""
from __future__ import annotations

import base64

from flask import Blueprint, jsonify, request, make_response

from database_manager import get_db_manager
from utils.pdf_utils import fetch_orders_for_pdf, render_order_pdf, persist_order_pdf
from utils.email_utils import send_order_email

orders_bp = Blueprint("orders", __name__)


@orders_bp.route("/api/order", methods=["POST"])
def create_order():
    """注文依頼を記録するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        code = data.get("code")
        try:
            quantity = int(data.get("quantity"))
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "数量は数値で指定してください"}), 400
        requester = data.get("requester")

        if not all([code, requester]):
            return jsonify({"success": False, "error": "必須パラメータが不足しています"}), 400

        if quantity <= 0:
            return jsonify({"success": False, "error": "数量は1以上を入力してください"}), 400

        item_df = db.execute_query(
            """
            SELECT c.id, c.name, c.unit, c.unit_price, c.supplier_id
            FROM consumables c
            WHERE c.code = :code
            """,
            {"code": code},
        )

        if item_df.empty:
            return jsonify({"success": False, "error": "品目が見つかりません"}), 404

        item = item_df.iloc[0]
        consumable_id = int(item["id"])
        unit_price = float(item["unit_price"]) if item["unit_price"] else 0
        total_amount = quantity * unit_price
        supplier_id = data.get("supplier_id") or item["supplier_id"]
        if supplier_id is None:
            return jsonify({"success": False, "error": "購入先が設定されていません"}), 400
        supplier_id = int(supplier_id)

        db.execute_update(
            """
            INSERT INTO orders (
                consumable_id, code, name, quantity, unit, unit_price, total_amount,
                deadline, requester_name, supplier_id, note,
                status, order_type, requested_date
            ) VALUES (
                :consumable_id, :code, :name, :quantity, :unit, :unit_price, :total_amount,
                :deadline, :requester_name, :supplier_id, :note,
                :status, :order_type, NOW()
            )
            """,
            {
                "consumable_id": consumable_id,
                "code": code,
                "name": item["name"],
                "quantity": quantity,
                "unit": item["unit"],
                "unit_price": unit_price,
                "total_amount": total_amount,
                "deadline": data.get("deadline", "通常"),
                "requester_name": requester,
                "supplier_id": supplier_id,
                "note": data.get("note", ""),
                "status": "依頼中",
                "order_type": data.get("order_type", "手動"),
            },
        )

        db.execute_update(
            "UPDATE consumables SET order_status = :status WHERE id = :cid",
            {"status": "依頼中", "cid": consumable_id},
        )

        return jsonify({"success": True, "message": "注文依頼を記録しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@orders_bp.route("/api/orders")
def get_orders():
    """注文依頼一覧を取得するAPI（フィルタリング・ソート対応）"""
    try:
        db = get_db_manager()

        order_type = request.args.get("order_type", "")
        status = request.args.get("status", "")
        supplier_id = request.args.get("supplier_id", "")
        requester = request.args.get("requester", "")
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        sort_by = request.args.get("sort_by", "requested_date")
        sort_order = request.args.get("sort_order", "DESC")

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
                s.name AS supplier_name,
                o.status,
                o.order_type,
                o.requested_date,
                o.note
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE 1=1
        """
        params = {}

        if order_type:
            query += " AND o.order_type = :order_type"
            params["order_type"] = order_type

        if status:
            query += " AND o.status = :status"
            params["status"] = status

        if supplier_id:
            query += " AND o.supplier_id = :supplier_id"
            params["supplier_id"] = int(supplier_id)

        if requester:
            query += " AND o.requester_name LIKE :requester"
            params["requester"] = f"%{requester}%"

        if date_from:
            query += " AND DATE(o.requested_date) >= :date_from"
            params["date_from"] = date_from

        if date_to:
            query += " AND DATE(o.requested_date) <= :date_to"
            params["date_to"] = date_to

        allowed_sort_columns = ["requested_date", "status", "supplier_name", "requester_name", "total_amount"]
        if sort_by in allowed_sort_columns:
            sort_order_safe = "DESC" if sort_order.upper() == "DESC" else "ASC"
            query += f" ORDER BY o.{sort_by} {sort_order_safe}"
        else:
            query += " ORDER BY o.requested_date DESC"

        df = db.execute_query(query, params)

        return jsonify({
            "success": True,
            "data": df.to_dict(orient="records"),
            "count": len(df)
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@orders_bp.route("/api/orders/<int:order_id>", methods=["GET"])
def get_order_detail(order_id):
    """注文依頼の詳細を取得するAPI"""
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
                o.requester_name,
                o.supplier_id,
                s.name AS supplier_name,
                s.contact AS supplier_contact,
                s.phone AS supplier_phone,
                s.email AS supplier_email,
                o.status,
                o.order_type,
                o.requested_date,
                o.note
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.id = :order_id
        """

        df = db.execute_query(query, {"order_id": order_id})

        if df.empty:
            return jsonify({"success": False, "error": "注文依頼が見つかりません"}), 404

        return jsonify({
            "success": True,
            "data": df.iloc[0].to_dict()
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@orders_bp.route("/api/orders/<int:order_id>", methods=["PUT"])
def update_order_status(order_id):
    """注文依頼のステータスを更新するAPI"""
    try:
        data = request.get_json()
        db = get_db_manager()

        existing = db.execute_query(
            "SELECT id, consumable_id FROM orders WHERE id = :id",
            {"id": order_id},
        )
        if existing.empty:
            return jsonify({"success": False, "error": "注文依頼が見つかりません"}), 404

        new_status = data.get("status")
        if not new_status:
            return jsonify({"success": False, "error": "statusが指定されていません"}), 400

        db.execute_update(
            "UPDATE orders SET status = :status WHERE id = :id",
            {"status": new_status, "id": order_id},
        )

        consumable_id = int(existing.iloc[0]["consumable_id"])
        if new_status == "発注済":
            db.execute_update(
                "UPDATE consumables SET order_status = '発注済' WHERE id = :id",
                {"id": consumable_id},
            )
        elif new_status == "完了":
            db.execute_update(
                "UPDATE consumables SET order_status = '未発注' WHERE id = :id",
                {"id": consumable_id},
            )

        return jsonify({"success": True, "message": "ステータスを更新しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@orders_bp.route("/api/orders/<int:order_id>", methods=["DELETE"])
def delete_order(order_id):
    """注文依頼を削除するAPI"""
    try:
        db = get_db_manager()

        existing = db.execute_query(
            "SELECT id, consumable_id FROM orders WHERE id = :id",
            {"id": order_id},
        )
        if existing.empty:
            return jsonify({"success": False, "error": "注文依頼が見つかりません"}), 404

        db.execute_update(
            "DELETE FROM orders WHERE id = :id",
            {"id": order_id},
        )

        consumable_id = int(existing.iloc[0]["consumable_id"])
        db.execute_update(
            "UPDATE consumables SET order_status = '未発注' WHERE id = :id",
            {"id": consumable_id},
        )

        return jsonify({"success": True, "message": "注文依頼を削除しました"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@orders_bp.route("/api/check-low-stock")
def check_low_stock():
    """安全在庫を下回る商品をチェックするAPI"""
    try:
        db = get_db_manager()

        query = """
            SELECT
                id,
                code,
                name,
                stock_quantity,
                safety_stock,
                unit,
                order_unit,
                supplier_id
            FROM consumables
            WHERE stock_quantity <= safety_stock
            AND order_status != '発注済'
            ORDER BY (stock_quantity - safety_stock) ASC
        """

        df = db.execute_query(query)

        return jsonify({
            "success": True,
            "data": df.to_dict(orient="records"),
            "count": len(df)
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@orders_bp.route("/api/auto-create-orders", methods=["POST"])
def auto_create_orders():
    """安全在庫を下回る商品に対して自動で注文依頼を作成するAPI"""
    try:
        data = request.get_json()
        requester = data.get("requester", "システム自動")

        db = get_db_manager()

        query = """
            SELECT
                c.id,
                c.code,
                c.name,
                c.stock_quantity,
                c.safety_stock,
                c.unit,
                c.unit_price,
                c.order_unit,
                c.supplier_id
            FROM consumables c
            WHERE c.stock_quantity <= c.safety_stock
            AND c.order_status != '発注済'
        """

        df = db.execute_query(query)

        if df.empty:
            return jsonify({"success": True, "message": "発注が必要な商品はありません", "count": 0})

        created_count = 0
        for _, item in df.iterrows():
            order_quantity = max(
                int(item["order_unit"]),
                int((item["safety_stock"] * 2 - item["stock_quantity"]) / item["order_unit"] + 1) * int(item["order_unit"])
            )
            total_amount = order_quantity * float(item["unit_price"]) if item["unit_price"] else 0

            db.execute_update(
                """
                INSERT INTO orders (
                    consumable_id, code, name, quantity, unit, unit_price, total_amount,
                    deadline, requester_name, supplier_id, note,
                    status, order_type, requested_date
                ) VALUES (
                    :consumable_id, :code, :name, :quantity, :unit, :unit_price, :total_amount,
                    :deadline, :requester_name, :supplier_id, :note,
                    :status, :order_type, NOW()
                )
                """,
                {
                    "consumable_id": int(item["id"]),
                    "code": item["code"],
                    "name": item["name"],
                    "quantity": order_quantity,
                    "unit": item["unit"],
                    "unit_price": float(item["unit_price"]) if item["unit_price"] else 0,
                    "total_amount": total_amount,
                    "deadline": "通常",
                    "requester_name": requester,
                    "supplier_id": item["supplier_id"],
                    "note": f"自動発注依頼（在庫: {item['stock_quantity']}, 安全在庫: {item['safety_stock']}）",
                    "status": "依頼中",
                    "order_type": "自動",
                },
            )

            db.execute_update(
                "UPDATE consumables SET order_status = '依頼中' WHERE id = :id",
                {"id": int(item["id"])},
            )

            created_count += 1

        return jsonify({
            "success": True,
            "message": f"{created_count}件の自動発注依頼を作成しました",
            "count": created_count
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@orders_bp.route("/api/generate-order-pdf", methods=["GET", "POST"])
def generate_order_pdf():
    """注文書PDFを生成するAPI（ReportLab使用）"""
    try:
        db = get_db_manager()
        payload = request.get_json(silent=True) or {} if request.method == "POST" else {}
        if request.method == "POST":
            order_ids = payload.get("order_ids", [])
        else:
            order_ids = None

        if order_ids is None:
            order_ids_str = request.args.get("order_ids", "")
            if order_ids_str:
                order_ids = [int(item.strip()) for item in order_ids_str.split(",") if item.strip()]
            else:
                order_ids = []

        if not order_ids:
            return jsonify({"success": False, "error": "order_idsが指定されていません"}), 400

        try:
            order_ids = [int(order_id) for order_id in order_ids]
        except ValueError:
            return jsonify({"success": False, "error": "order_idsに数値以外の値が含まれています"}), 400

        order_number = payload.get("order_number") if request.method == "POST" else request.args.get("order_number")
        notes = payload.get("notes", "") if request.method == "POST" else request.args.get("notes", "")

        df = fetch_orders_for_pdf(db, order_ids)
        if df.empty:
            return jsonify({"success": False, "error": "注文データが見つかりません"}), 404

        pdf_bytes, pdf_filename, _ = render_order_pdf(df, order_number, notes)
        persist_order_pdf(pdf_bytes, pdf_filename)

        response = make_response(pdf_bytes)
        response.headers["Content-Type"] = "application/pdf"
        response.headers["Content-Disposition"] = f'attachment; filename="{pdf_filename}"'
        return response

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@orders_bp.route("/api/orders/dispatch", methods=["POST"])
def dispatch_orders():
    """注文書PDFの生成・保存・メール送信までを一括実行"""
    try:
        payload = request.get_json() or {}
        order_ids = payload.get("order_ids", [])
        if not isinstance(order_ids, list) or not order_ids:
            return jsonify({"success": False, "error": "order_idsは必須です"}), 400

        try:
            order_ids = [int(order_id) for order_id in order_ids]
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "order_idsには整数を指定してください"}), 400

        notes = payload.get("notes", "")
        next_status = payload.get("next_status", "発注済")
        consumable_status = payload.get("consumable_order_status", "発注済")
        save_pdf = bool(payload.get("save_pdf", True))
        include_pdf = bool(payload.get("include_pdf", False))
        order_number_input = payload.get("order_number")

        db = get_db_manager()
        df = fetch_orders_for_pdf(db, order_ids)
        if df.empty:
            return jsonify({"success": False, "error": "対象の注文が見つかりません"}), 404

        pdf_bytes, pdf_filename, metadata = render_order_pdf(df, order_number_input, notes)
        pdf_path = None
        if save_pdf:
            pdf_path = str(persist_order_pdf(pdf_bytes, pdf_filename))

        placeholders = ",".join([f":id{i}" for i in range(len(order_ids))])
        params = {f"id{i}": order_id for i, order_id in enumerate(order_ids)}
        params.update({"status": next_status, "order_number": metadata["order_number"]})
        db.execute_update(
            f"UPDATE orders SET status = :status, ordered_date = NOW(), receipt_no = :order_number WHERE id IN ({placeholders})",
            params,
        )

        consumable_ids = {
            int(consumable_id)
            for consumable_id in df["consumable_id"].dropna().tolist()
        }
        for consumable_id in consumable_ids:
            db.execute_update(
                "UPDATE consumables SET order_status = :status WHERE id = :cid",
                {"status": consumable_status, "cid": consumable_id},
            )

        email_payload = payload.get("email")
        email_sent = False
        if email_payload:
            try:
                send_order_email(email_payload, pdf_bytes, pdf_filename)
                email_sent = True
            except Exception as exc:
                return jsonify({"success": False, "error": f"メール送信に失敗しました: {exc}"}), 500

        response_payload = {
            "success": True,
            "order_number": metadata["order_number"],
            "supplier_name": metadata["supplier_name"],
            "total_amount": metadata["total_amount"],
            "pdf_filename": pdf_filename,
            "pdf_path": pdf_path,
            "updated_orders": len(order_ids),
            "consumables_updated": len(consumable_ids),
            "email_sent": email_sent,
        }
        if include_pdf:
            response_payload["pdf_base64"] = base64.b64encode(pdf_bytes).decode("utf-8")

        return jsonify(response_payload)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

"""
発注管理APIルート
"""
from __future__ import annotations

from flask import Blueprint, jsonify, request, session, send_file
from datetime import datetime
import pandas as pd
import os

from database_manager import get_db_manager
from pdf_generator import generate_purchase_order_pdf
from email_sender import send_purchase_order_email

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

        # Timestamp列を文字列に変換（NULL値を考慮）
        if "requested_date" in df.columns and not df.empty:
            df["requested_date"] = df["requested_date"].apply(
                lambda x: x.strftime("%Y-%m-%d %H:%M:%S") if pd.notna(x) else None
            )

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
            "SELECT name, contact_person FROM suppliers WHERE id = :id",
            {"id": supplier_id}
        )

        if supplier_df.empty:
            return jsonify({"success": False, "error": "購入先が見つかりません"}), 404

        supplier_name = supplier_df.iloc[0]["name"]
        contact_person = supplier_df.iloc[0]["contact_person"] if pd.notna(supplier_df.iloc[0]["contact_person"]) else ""

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
                o.id, o.consumable_id, o.code, c.order_code, o.name, o.quantity, o.unit,
                o.unit_price, o.total_amount, o.deadline, o.note
            FROM orders o
            LEFT JOIN consumables c ON o.consumable_id = c.id
            WHERE o.id IN ({placeholders}) AND o.status = '発注準備' AND o.supplier_id = :supplier_id
            """,
            {**item_params, "supplier_id": supplier_id}
        )

        if items_df.empty:
            return jsonify({"success": False, "error": "有効なアイテムが見つかりません"}), 404

        # 合計計算（Python標準型に変換）
        total_items = int(len(items_df))
        total_amount = float(items_df["total_amount"].sum())

        # 現在のユーザー
        created_by = session.get("full_name", session.get("username", "システム"))

        # 当日の同一購入先の注文書数を取得（回数計算のため）
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        daily_count_df = db.execute_query(
            """
            SELECT COUNT(*) as count FROM dispatch_orders
            WHERE supplier_id = :supplier_id
            AND created_at >= :today_start
            """,
            {"supplier_id": supplier_id, "today_start": today_start}
        )
        daily_count = int(daily_count_df.iloc[0]["count"]) + 1

        # PDFを先に生成
        pdf_path = None
        try:
            order_data_for_pdf = {
                "order_number": str(order_number),
                "supplier_name": str(supplier_name),
                "contact_person": str(contact_person) if contact_person else "",
                "created_by": str(created_by),
                "created_at": datetime.now(),
                "note": str(note) if note else "",
                "daily_count": int(daily_count)
            }
            # DataFrameをPython標準型の辞書リストに変換
            items_for_pdf = []
            for _, item in items_df.iterrows():
                items_for_pdf.append({
                    "order_code": str(item["order_code"]) if pd.notna(item["order_code"]) else "",
                    "code": str(item["code"]) if pd.notna(item["code"]) else "",
                    "name": str(item["name"]) if pd.notna(item["name"]) else "",
                    "quantity": int(item["quantity"]) if pd.notna(item["quantity"]) else 0,
                    "unit": str(item["unit"]) if pd.notna(item["unit"]) else "",
                    "unit_price": float(item["unit_price"]) if pd.notna(item["unit_price"]) else 0.0,
                    "total_amount": float(item["total_amount"]) if pd.notna(item["total_amount"]) else 0.0,
                    "deadline": str(item["deadline"]) if pd.notna(item["deadline"]) else "",
                    "note": str(item["note"]) if pd.notna(item["note"]) else ""
                })
            pdf_path = generate_purchase_order_pdf(order_data_for_pdf, items_for_pdf)
        except Exception as pdf_error:
            print(f"PDF生成エラー: {pdf_error}")
            import traceback
            traceback.print_exc()

        # dispatch_ordersテーブルに注文書を作成
        db.execute_update(
            """
            INSERT INTO dispatch_orders (
                order_number, supplier_id, supplier_name, total_items, total_amount,
                status, created_by, note, created_at, pdf_path
            ) VALUES (
                :order_number, :supplier_id, :supplier_name, :total_items, :total_amount,
                :status, :created_by, :note, :created_at, :pdf_path
            )
            """,
            {
                "order_number": str(order_number),
                "supplier_id": int(supplier_id),
                "supplier_name": str(supplier_name),
                "total_items": int(total_items),
                "total_amount": float(total_amount),
                "status": "未送信",
                "created_by": str(created_by),
                "note": str(note) if note else "",
                "created_at": datetime.now(),
                "pdf_path": str(pdf_path) if pdf_path else None
            }
        )

        # 作成した注文書のIDを取得
        order_id_df = db.execute_query(
            "SELECT id FROM dispatch_orders WHERE order_number = :order_number",
            {"order_number": order_number}
        )
        dispatch_order_id = int(order_id_df.iloc[0]["id"])

        # dispatch_order_itemsテーブルに明細を追加
        for _, item in items_df.iterrows():
            db.execute_update(
                """
                INSERT INTO dispatch_order_items (
                    dispatch_order_id, consumable_id, code, order_code, name, quantity, unit,
                    unit_price, total_amount, deadline, note, original_order_id
                ) VALUES (
                    :dispatch_order_id, :consumable_id, :code, :order_code, :name, :quantity, :unit,
                    :unit_price, :total_amount, :deadline, :note, :original_order_id
                )
                """,
                {
                    "dispatch_order_id": int(dispatch_order_id),
                    "consumable_id": int(item["consumable_id"]) if pd.notna(item["consumable_id"]) else None,
                    "code": str(item["code"]) if pd.notna(item["code"]) else None,
                    "order_code": str(item["order_code"]) if pd.notna(item["order_code"]) else None,
                    "name": str(item["name"]) if pd.notna(item["name"]) else None,
                    "quantity": int(item["quantity"]) if pd.notna(item["quantity"]) else 0,
                    "unit": str(item["unit"]) if pd.notna(item["unit"]) else None,
                    "unit_price": float(item["unit_price"]) if pd.notna(item["unit_price"]) else 0.0,
                    "total_amount": float(item["total_amount"]) if pd.notna(item["total_amount"]) else 0.0,
                    "deadline": str(item["deadline"]) if pd.notna(item["deadline"]) else None,
                    "note": str(item["note"]) if pd.notna(item["note"]) else None,
                    "original_order_id": int(item["id"]) if pd.notna(item["id"]) else None
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
            "order_number": str(order_number),
            "dispatch_order_id": int(dispatch_order_id),
            "pdf_generated": bool(pdf_path is not None)
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

        # Timestamp列を文字列に変換（NULL値を考慮）
        if "created_at" in df.columns and not df.empty:
            df["created_at"] = df["created_at"].apply(
                lambda x: x.strftime("%Y-%m-%d %H:%M:%S") if pd.notna(x) else None
            )
        if "sent_at" in df.columns and not df.empty:
            df["sent_at"] = df["sent_at"].apply(
                lambda x: x.strftime("%Y-%m-%d %H:%M:%S") if pd.notna(x) else None
            )

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

        # Timestamp列を文字列に変換（NULL値を考慮）
        if "created_at" in order_df.columns:
            order_df["created_at"] = order_df["created_at"].apply(
                lambda x: x.strftime("%Y-%m-%d %H:%M:%S") if pd.notna(x) else None
            )
        if "sent_at" in order_df.columns:
            order_df["sent_at"] = order_df["sent_at"].apply(
                lambda x: x.strftime("%Y-%m-%d %H:%M:%S") if pd.notna(x) else None
            )

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


def _get_or_generate_pdf(order_id: int):
    """PDFパスを取得または生成（内部共通関数）"""
    db = get_db_manager()

    # 注文書情報を取得（pdf_pathも含む）
    order_df = db.execute_query(
        """
        SELECT
            do.order_number, do.supplier_id, do.supplier_name, do.created_by, do.created_at, do.note, do.pdf_path,
            s.contact_person
        FROM dispatch_orders do
        LEFT JOIN suppliers s ON do.supplier_id = s.id
        WHERE do.id = :id
        """,
        {"id": order_id}
    )

    if order_df.empty:
        raise ValueError("注文書が見つかりません")

    order_data = order_df.iloc[0].to_dict()
    pdf_path = order_data.get('pdf_path')

    # PDFが既に存在し、ファイルが実際に存在する場合はそれを使用
    if pdf_path and os.path.exists(pdf_path):
        print(f"既存のPDFを使用: {pdf_path}")
        return pdf_path, order_data['order_number']

    # PDFが存在しない場合は再生成
    print(f"PDFを再生成します（order_id: {order_id}）")

    # 注文書明細を取得
    items_df = db.execute_query(
        """
        SELECT
            order_code, code, name, quantity, unit, unit_price, total_amount, deadline, note
        FROM dispatch_order_items
        WHERE dispatch_order_id = :dispatch_order_id
        ORDER BY id
        """,
        {"dispatch_order_id": order_id}
    )

    if items_df.empty:
        raise ValueError("注文書明細が見つかりません")

    # 当日の同一購入先の注文書数を計算（この注文書が何番目か）
    created_at = order_data.get('created_at')
    if created_at:
        if hasattr(created_at, 'date'):
            order_date = created_at.date()
        else:
            try:
                from datetime import datetime as dt
                order_date = dt.fromisoformat(str(created_at)).date()
            except:
                order_date = datetime.now().date()
    else:
        order_date = datetime.now().date()

    # その日の0時から現在の注文書の作成時刻までの同一購入先の注文書数を取得
    daily_count_df = db.execute_query(
        """
        SELECT COUNT(*) as count FROM dispatch_orders
        WHERE supplier_id = :supplier_id
        AND DATE(created_at) = :order_date
        AND created_at <= :created_at
        """,
        {
            "supplier_id": order_data.get('supplier_id'),
            "order_date": order_date,
            "created_at": created_at if created_at else datetime.now()
        }
    )
    daily_count = int(daily_count_df.iloc[0]["count"]) if not daily_count_df.empty else 1

    # PDFを再生成（contact_personをPython標準型に変換）
    order_data_for_pdf = {
        "order_number": str(order_data.get('order_number', '')),
        "supplier_name": str(order_data.get('supplier_name', '')),
        "contact_person": str(order_data.get('contact_person', '')) if pd.notna(order_data.get('contact_person')) else "",
        "created_by": str(order_data.get('created_by', '')),
        "created_at": order_data.get('created_at'),
        "note": str(order_data.get('note', '')) if order_data.get('note') else "",
        "daily_count": int(daily_count)
    }
    items = items_df.to_dict(orient="records")
    pdf_path = generate_purchase_order_pdf(order_data_for_pdf, items)

    # 再生成したPDFパスをデータベースに保存
    db.execute_update(
        "UPDATE dispatch_orders SET pdf_path = :pdf_path WHERE id = :id",
        {"pdf_path": pdf_path, "id": order_id}
    )

    return pdf_path, order_data['order_number']


@dispatch_bp.route("/api/dispatch/orders/<int:order_id>/pdf", methods=["GET"])
def view_dispatch_order_pdf(order_id: int):
    """注文書PDFをブラウザで表示"""
    try:
        pdf_path, order_number = _get_or_generate_pdf(order_id)

        # PDFファイルをブラウザで表示（as_attachment=False）
        return send_file(
            pdf_path,
            mimetype='application/pdf',
            as_attachment=False,
            download_name=f"{order_number}.pdf"
        )
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 404
    except Exception as exc:
        print(f"PDF表示エラー: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500


@dispatch_bp.route("/api/dispatch/orders/<int:order_id>/pdf/download", methods=["GET"])
def download_dispatch_order_pdf(order_id: int):
    """注文書PDFをダウンロード"""
    try:
        pdf_path, order_number = _get_or_generate_pdf(order_id)

        # PDFファイルをダウンロード（as_attachment=True）
        return send_file(
            pdf_path,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"{order_number}.pdf"
        )
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 404
    except Exception as exc:
        print(f"PDFダウンロードエラー: {exc}")
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

        # 注文書情報を取得
        order_df = db.execute_query(
            """
            SELECT
                do.id, do.order_number, do.supplier_name, do.status,
                s.contact_person
            FROM dispatch_orders do
            LEFT JOIN suppliers s ON do.supplier_id = s.id
            WHERE do.id = :id
            """,
            {"id": order_id}
        )

        if order_df.empty:
            return jsonify({"success": False, "error": "注文書が見つかりません"}), 404

        order_data = order_df.iloc[0]
        order_number = str(order_data['order_number'])
        supplier_name = str(order_data['supplier_name'])
        contact_person = str(order_data['contact_person']) if pd.notna(order_data['contact_person']) else ''

        # PDFを取得または生成
        pdf_path, _ = _get_or_generate_pdf(order_id)

        # メール送信
        try:
            send_purchase_order_email(
                to_email=email,
                order_number=order_number,
                supplier_name=supplier_name,
                pdf_path=pdf_path,
                contact_person=contact_person
            )
        except Exception as email_error:
            return jsonify({
                "success": False,
                "error": f"メール送信に失敗しました: {str(email_error)}"
            }), 500

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

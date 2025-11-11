"""
PDF生成ユーティリティ
"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

from config import PDF_FOLDER
from utils.validators import sanitize_filename


def fetch_orders_for_pdf(db, order_ids: list[int]):
    """注文データをPDF生成用に取得"""
    placeholders = ",".join([f":id{i}" for i in range(len(order_ids))])
    params = {f"id{i}": order_id for i, order_id in enumerate(order_ids)}
    query = f"""
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
            o.note,
            o.supplier_id,
            s.name AS supplier_name,
            s.contact AS supplier_contact,
            s.email AS supplier_email
        FROM orders o
        LEFT JOIN suppliers s ON o.supplier_id = s.id
        WHERE o.id IN ({placeholders})
        ORDER BY o.id
    """
    return db.execute_query(query, params)


def render_order_pdf(order_rows, order_number: str | None = None, notes: str = ""):
    """注文書PDFを生成"""
    if order_rows.empty:
        raise ValueError("注文データが存在しません")

    supplier_name = order_rows.iloc[0].get("supplier_name") or "未設定"
    requester = order_rows.iloc[0].get("requester_name") or ""
    deadline = order_rows.iloc[0].get("deadline") or ""
    order_date = datetime.now().strftime("%Y年%m月%d日")

    if not order_number:
        order_number = f"ORD-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

    pdf_buffer = BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=landscape(A4),
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )

    story = []
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontSize=20,
        alignment=1,
    )
    story.append(Paragraph("注文書", title_style))
    story.append(Spacer(1, 15))

    info_data = [
        ["注文書番号:", order_number, "仕入先:", supplier_name],
        ["注文日:", order_date, "発注者:", requester],
        ["納期:", deadline, "", ""],
    ]
    info_table = Table(info_data, colWidths=[25 * mm, 60 * mm, 25 * mm, 60 * mm])
    info_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (0, 0), (0, -1), "RIGHT"),
                ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 15))

    table_data = [["No.", "Code", "Name", "Qty", "Unit", "Price", "Amount"]]
    for idx, row in order_rows.iterrows():
        qty = int(float(row["quantity"]))
        unit_price = int(float(row["unit_price"] or 0))
        amount = int(float(row["total_amount"] or qty * unit_price))
        table_data.append(
            [
                str(idx + 1),
                row["code"],
                row["name"],
                f"{qty:,}",
                row["unit"],
                f"¥{unit_price:,}",
                f"¥{amount:,}",
            ]
        )
    total_amount = int(float(order_rows["total_amount"].fillna(0).sum()))
    table_data.append(["", "", "", "", "", "Total", f"¥{total_amount:,}"])

    detail_table = Table(
        table_data,
        colWidths=[15 * mm, 35 * mm, 80 * mm, 20 * mm, 15 * mm, 25 * mm, 35 * mm],
    )
    detail_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("ALIGN", (0, 1), (0, -1), "CENTER"),
                ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -2), 1, colors.black),
                ("LINEABOVE", (0, -1), (-1, -1), 2, colors.black),
                ("BACKGROUND", (0, -1), (-1, -1), colors.lightgrey),
            ]
        )
    )
    story.append(detail_table)
    story.append(Spacer(1, 15))

    if notes:
        story.append(Paragraph(f"<b>備考</b> {notes}", styles["Normal"]))
        story.append(Spacer(1, 10))

    story.append(Paragraph("上記内容にて発注いたします。よろしくお願いいたします。", styles["Normal"]))
    doc.build(story)

    pdf_bytes = pdf_buffer.getvalue()
    safe_order_number = sanitize_filename(order_number)
    pdf_filename = f"{safe_order_number}.pdf"

    metadata = {
        "order_number": order_number,
        "supplier_name": supplier_name,
        "requester": requester,
        "deadline": deadline,
        "order_date": order_date,
        "total_amount": total_amount,
    }
    return pdf_bytes, pdf_filename, metadata


def persist_order_pdf(pdf_bytes: bytes, pdf_filename: str) -> Path:
    """PDFをファイルシステムに保存"""
    pdf_path = PDF_FOLDER / pdf_filename
    with open(pdf_path, "wb") as f:
        f.write(pdf_bytes)
    return pdf_path

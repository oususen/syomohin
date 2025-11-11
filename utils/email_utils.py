"""
メール送信ユーティリティ
"""
from __future__ import annotations

import smtplib
from email.message import EmailMessage

from config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_USE_TLS, SMTP_FROM
from utils.validators import normalize_recipient_list


def send_order_email(email_payload: dict, pdf_bytes: bytes, pdf_filename: str):
    """注文書メールを送信"""
    if not SMTP_HOST:
        raise RuntimeError("SMTP_HOSTが設定されていないためメール送信できません")

    to_list = normalize_recipient_list(email_payload.get("to"))
    if not to_list:
        raise ValueError("メール宛先 (to) が指定されていません")

    cc_list = normalize_recipient_list(email_payload.get("cc"))
    bcc_list = normalize_recipient_list(email_payload.get("bcc"))
    subject = email_payload.get("subject") or "注文書送付のお知らせ"
    body = email_payload.get("body", "")
    is_html = email_payload.get("is_html", True)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM or SMTP_USER or "no-reply@example.com"
    msg["To"] = ", ".join(to_list)
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)

    if is_html:
        msg.add_alternative(body, subtype="html")
    else:
        msg.set_content(body)

    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=pdf_filename,
    )

    all_recipients = to_list + cc_list + bcc_list

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        if SMTP_USE_TLS:
            server.starttls()
        if SMTP_USER and SMTP_PASSWORD:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg, to_addrs=all_recipients)

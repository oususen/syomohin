"""
メール送信モジュール
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from email.utils import formataddr
import os


class EmailSender:
    """メール送信クラス"""

    def __init__(self):
        # メール設定（環境変数または設定ファイルから取得）
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_user = os.getenv('SMTP_USER', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.from_email = os.getenv('FROM_EMAIL', self.smtp_user)
        self.from_name = os.getenv('FROM_NAME', 'ダイソウ工業株式会社')

    def send_purchase_order(self, to_email: str, order_number: str, supplier_name: str, pdf_path: str, contact_person: str = ''):
        """
        注文書PDFをメールで送信

        Args:
            to_email: 送信先メールアドレス
            order_number: 注文書番号
            supplier_name: 購入先名
            pdf_path: PDFファイルパス
            contact_person: 担当者名

        Returns:
            bool: 送信成功の場合True
        """
        # SMTP設定のチェック
        if not self.smtp_user or not self.smtp_password:
            raise ValueError("メール設定が不完全です。SMTP_USERとSMTP_PASSWORDを設定してください。")

        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDFファイルが見つかりません: {pdf_path}")

        # メールメッセージの作成
        msg = MIMEMultipart()
        msg['From'] = formataddr((self.from_name, self.from_email))
        msg['To'] = to_email
        msg['Subject'] = f"【注文書送付】{order_number} - {supplier_name}"

        # メール本文
        body = self._create_email_body(order_number, supplier_name, contact_person)
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        # PDF添付
        with open(pdf_path, 'rb') as f:
            pdf_attachment = MIMEApplication(f.read(), _subtype='pdf')
            pdf_filename = os.path.basename(pdf_path)
            pdf_attachment.add_header('Content-Disposition', 'attachment', filename=pdf_filename)
            msg.attach(pdf_attachment)

        # メール送信
        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()  # TLS暗号化
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            return True
        except Exception as e:
            raise Exception(f"メール送信エラー: {str(e)}")

    def _create_email_body(self, order_number: str, supplier_name: str, contact_person: str = ''):
        """メール本文を作成"""
        if contact_person:
            greeting = f"{contact_person} 様"
        else:
            greeting = "ご担当者様"

        body = f"""
{supplier_name}
{greeting}

いつもお世話になっております。
ダイソウ工業株式会社 製缶事業部です。

下記の通り、注文書を送付いたします。
添付のPDFファイルをご確認ください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
注文書番号: {order_number}
購入先: {supplier_name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ご不明な点がございましたら、お気軽にお問い合わせください。

何卒よろしくお願い申し上げます。

――――――――――――――――――――――――――
ダイソウ工業株式会社
製缶事業部
――――――――――――――――――――――――――
"""
        return body.strip()


def send_purchase_order_email(to_email: str, order_number: str, supplier_name: str, pdf_path: str, contact_person: str = ''):
    """
    注文書PDFをメールで送信するヘルパー関数

    Args:
        to_email: 送信先メールアドレス
        order_number: 注文書番号
        supplier_name: 購入先名
        pdf_path: PDFファイルパス
        contact_person: 担当者名

    Returns:
        bool: 送信成功の場合True
    """
    sender = EmailSender()
    return sender.send_purchase_order(to_email, order_number, supplier_name, pdf_path, contact_person)

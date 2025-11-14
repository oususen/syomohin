"""
注文書PDF生成モジュール
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.platypus import Table, TableStyle
from datetime import datetime
import os


class PurchaseOrderGenerator:
    """注文書PDF生成クラス"""

    def __init__(self):
        self.width, self.height = A4
        self.margin = 15 * mm

        # 日本語フォントの登録（システムフォントを使用）
        try:
            # Windowsの標準フォント
            font_paths = [
                "C:/Windows/Fonts/msgothic.ttc",  # MSゴシック
                "C:/Windows/Fonts/msmincho.ttc",  # MS明朝
                "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",  # Mac
                "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"  # Linux
            ]

            for font_path in font_paths:
                if os.path.exists(font_path):
                    pdfmetrics.registerFont(TTFont('Japanese', font_path))
                    self.font_name = 'Japanese'
                    break
            else:
                # フォントが見つからない場合はHelveticaを使用
                self.font_name = 'Helvetica'
        except Exception:
            self.font_name = 'Helvetica'

    def generate_purchase_order(self, order_data, items, output_path):
        """
        注文書PDFを生成

        Args:
            order_data: 注文書マスター情報（dict）
            items: 注文書明細リスト（list of dict）
            output_path: 出力ファイルパス
        """
        c = canvas.Canvas(output_path, pagesize=A4)

        # タイトル
        self._draw_title(c)

        # ヘッダー部分（購入先情報と自社情報）
        self._draw_header(c, order_data)

        # 承認欄
        self._draw_approval_section(c, order_data)

        # 明細テーブル
        self._draw_items_table(c, items)

        # フッター（ページ番号など）
        self._draw_footer(c, order_data)

        c.save()
        return output_path

    def _draw_title(self, c):
        """タイトルを描画"""
        c.setFont(self.font_name, 24)
        title = "注文書"
        title_width = c.stringWidth(title, self.font_name, 24)
        c.drawString((self.width - title_width) / 2, self.height - 30 * mm, title)

    def _draw_header(self, c, order_data):
        """ヘッダー部分を描画"""
        y_start = self.height - 50 * mm

        # 左側：購入先情報
        c.setFont(self.font_name, 12)
        supplier_name = order_data.get('supplier_name', '購入先名')
        c.drawString(self.margin, y_start, f"{supplier_name} 御中")

        # 担当者欄（購入先データベースから取得）
        c.setFont(self.font_name, 10)
        contact_person = order_data.get('contact_person', '')
        if contact_person:
            c.drawString(self.margin, y_start - 10 * mm, f"{contact_person} 様")

        # 右側：自社情報と発行日
        right_x = self.width - self.margin - 70 * mm
        c.setFont(self.font_name, 14)
        c.drawString(right_x, y_start, "ダイソウ工業株式会社")

        c.setFont(self.font_name, 10)
        issue_date = datetime.now().strftime("%Y年%m月%d日")
        c.drawString(right_x, y_start - 8 * mm, f"発行日: {issue_date}")
        c.drawString(right_x, y_start - 15 * mm, "発行部門: 製缶事業部")

    def _draw_approval_section(self, c, order_data):
        """承認欄を描画"""
        right_x = self.width - self.margin - 70 * mm
        y_start = self.height - 70 * mm

        # 作成者と作成日を取得
        created_by = order_data.get('created_by', '')
        created_at = order_data.get('created_at')
        if created_at:
            if hasattr(created_at, 'strftime'):
                created_date = created_at.strftime("%Y/%m/%d")
            else:
                # 文字列の場合
                try:
                    from datetime import datetime as dt
                    created_date = dt.fromisoformat(str(created_at)).strftime("%Y/%m/%d")
                except:
                    created_date = str(created_at)[:10]
        else:
            created_date = datetime.now().strftime("%Y/%m/%d")

        # 承認欄のテーブル（2行に変更）
        approval_data = [
            ['承認', '確認', '作成'],
            ['', '', f'{created_by}\n{created_date}']
        ]

        col_width = 22 * mm
        row_heights = [8 * mm, 15 * mm]  # ヘッダー行と内容行

        table = Table(approval_data, colWidths=[col_width] * 3, rowHeights=row_heights)
        table.setStyle(TableStyle([
            ('FONT', (0, 0), (-1, -1), self.font_name, 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ]))

        table.wrapOn(c, self.width, self.height)
        table.drawOn(c, right_x, y_start - 23 * mm)

    def _draw_items_table(self, c, items):
        """明細テーブルを描画"""
        y_start = self.height - 115 * mm

        # ヘッダー
        headers = ['No', '発注\nコード', '商品名・仕様', '数量', '単位', '単価', '金額', '納期', '裏議書No', '備考']

        # データ行を作成
        table_data = [headers]
        for idx, item in enumerate(items, 1):
            row = [
                str(idx),
                item.get('code', ''),
                item.get('name', ''),
                str(item.get('quantity', '')),
                item.get('unit', ''),
                f"{int(item.get('unit_price', 0)):,}" if item.get('unit_price') else '',
                f"{int(item.get('total_amount', 0)):,}" if item.get('total_amount') else '',
                item.get('deadline', ''),
                '',  # 裏議書No
                item.get('note', '') or '-'
            ]
            table_data.append(row)

        # カラム幅（合計178mm、A4幅に収まるように調整）
        col_widths = [10 * mm, 18 * mm, 45 * mm, 12 * mm, 12 * mm, 18 * mm, 18 * mm, 15 * mm, 15 * mm, 15 * mm]

        table = Table(table_data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            ('FONT', (0, 0), (-1, -1), self.font_name, 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),  # ヘッダー中央揃え
            ('ALIGN', (3, 1), (3, -1), 'RIGHT'),  # 数量右揃え
            ('ALIGN', (5, 1), (6, -1), 'RIGHT'),  # 単価・金額右揃え
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTSIZE', (0, 0), (-1, 0), 7),  # ヘッダーフォントサイズ
            ('FONTSIZE', (0, 1), (-1, -1), 7),  # データフォントサイズ
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('WORDWRAP', (2, 0), (2, -1), True),  # 商品名の自動折り返し
            ('WORDWRAP', (9, 0), (9, -1), True),  # 備考の自動折り返し
        ]))

        # テーブルの高さを計算して配置
        table_width, table_height = table.wrap(self.width, self.height)
        table.drawOn(c, self.margin, y_start - table_height)

    def _draw_footer(self, c, order_data):
        """フッターを描画"""
        c.setFont(self.font_name, 8)
        footer_text = f"注文書番号: {order_data.get('order_number', '')}"
        c.drawString(self.margin, 15 * mm, footer_text)

        # 右下にページ番号
        c.drawRightString(self.width - self.margin, 15 * mm, "1 / 1")


def generate_purchase_order_pdf(order_data, items, output_dir="uploads/purchase_orders"):
    """
    注文書PDFを生成するヘルパー関数

    Args:
        order_data: 注文書マスター情報
        items: 注文書明細リスト
        output_dir: 出力ディレクトリ

    Returns:
        生成されたPDFファイルのパス
    """
    # 出力ディレクトリを作成
    os.makedirs(output_dir, exist_ok=True)

    # ファイル名を生成
    order_number = order_data.get('order_number', 'PO-UNKNOWN')
    filename = f"{order_number}.pdf"
    output_path = os.path.join(output_dir, filename)

    # PDF生成
    generator = PurchaseOrderGenerator()
    generator.generate_purchase_order(order_data, items, output_path)

    return output_path

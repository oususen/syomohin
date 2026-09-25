#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
syomohin → pm 移行用 CSV 出力スクリプト

pm の消耗品マスタ画面「CSV取込」でそのまま読める形式（UTF-8 BOM）で出力する。
  - suppliers.csv   : 購入先（pm で先に取り込む）
  - consumables.csv : 消耗品（購入先名で購入先に紐付く。画像ファイル名付き）
  - employees_not_in_pm.csv : syomohin の社員のうち pm ユーザーに社員コードが無い人（--pm-db 指定時）
  - images/         : 消耗品に紐付いた画像ファイルのコピー（--copy-images 指定時）
    → pm_backend/media/consumables/images/ に配置してから消耗品CSVを取り込む

使い方（syomohin フォルダで実行）:
  python scripts/maintenance/export_to_pm_csv.py --out export_pm --copy-images --pm-db pm_db

DB接続は syomohin と同じ .env（INVENTORY_DB_* / PRIMARY_DB_PASSWORD）を使う。読み取りのみで、DBは変更しない。
"""
from __future__ import annotations

import argparse
import csv
import shutil
import sys
from collections import Counter
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import text  # noqa: E402

import config  # noqa: E402
from database_manager import get_db_manager  # noqa: E402

SUPPLIER_HEADERS = ['購入先名', '担当者', '電話番号', 'メールアドレス', '住所', '備考']
CONSUMABLE_HEADERS = [
    'コード', '発注コード', '品名', 'カテゴリ', '単位', '保管場所', '在庫数', '安全在庫',
    '発注単位', '単価', '購入先', '備考', '画像ファイル',
]


def fetch_all(engine, sql, params=None):
    """クエリを実行して dict のリストを返す（エラーは握りつぶさずに停止する）"""
    with engine.connect() as conn:
        result = conn.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result]


def clean(value):
    if value is None:
        return ''
    return str(value).strip()


def number(value):
    """数値を CSV 用の文字列に（小数点以下が0なら整数表記）"""
    if value is None or value == '':
        return ''
    num = float(value)
    return str(int(num)) if num == int(num) else str(num)


def write_csv(path, headers, rows):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


def export_suppliers(engine, out_dir, warnings):
    suppliers = fetch_all(engine, """
        SELECT id, name, contact, phone, contact_person, email, address, note
        FROM suppliers ORDER BY name, id
    """)
    names = Counter(clean(s['name']) for s in suppliers)
    duplicated = sorted(n for n, c in names.items() if c > 1)
    if duplicated:
        warnings.append(
            f'購入先名の重複 {len(duplicated)}件（pm では購入先名が一意のため、後の行で上書きされます）: '
            + ', '.join(duplicated)
        )

    rows = []
    moved_contact = 0
    for s in suppliers:
        note = clean(s['note'])
        contact = clean(s['contact'])
        # pm に「連絡先」列は無いため、電話番号と異なる値は備考に残す
        if contact and contact != clean(s['phone']):
            note = f'{note}\n連絡先: {contact}'.strip()
            moved_contact += 1
        rows.append([
            clean(s['name']), clean(s['contact_person']), clean(s['phone']),
            clean(s['email']), clean(s['address']), note,
        ])
    if moved_contact:
        warnings.append(f'「連絡先」列の値を備考に移した購入先: {moved_contact}件')
    no_email = [clean(s['name']) for s in suppliers if not clean(s['email'])]
    if no_email:
        warnings.append(f'メールアドレス未登録の購入先 {len(no_email)}件（注文書を送信できません）: ' + ', '.join(no_email))

    write_csv(out_dir / 'suppliers.csv', SUPPLIER_HEADERS, rows)
    return len(rows)


def export_consumables(engine, out_dir, copy_images, warnings):
    items = fetch_all(engine, """
        SELECT c.code, c.order_code, c.name, c.category, c.unit, c.storage_location,
               c.stock_quantity, c.safety_stock, c.order_unit, c.unit_price,
               c.note, c.image_path, s.name AS supplier_name, c.supplier_id
        FROM consumables c
        LEFT JOIN suppliers s ON c.supplier_id = s.id
        ORDER BY c.code
    """)
    images_dir = out_dir / 'images'
    if copy_images:
        images_dir.mkdir(exist_ok=True)

    rows = []
    external_images, missing_images, no_supplier = [], [], []
    copied = 0
    for item in items:
        image_file = ''
        image_path = clean(item['image_path'])
        if image_path:
            if image_path.startswith(('http://', 'https://')):
                external_images.append(item['code'])
            else:
                # 保存形式は images/<uuid>.<ext>（uploads/ 配下）
                src = config.UPLOAD_FOLDER / image_path.lstrip('/').removeprefix('uploads/')
                if src.is_file():
                    image_file = src.name
                    if copy_images:
                        shutil.copy2(src, images_dir / src.name)
                        copied += 1
                else:
                    missing_images.append(f"{item['code']}({image_path})")
        if item['supplier_id'] and not item['supplier_name']:
            no_supplier.append(item['code'])
        rows.append([
            clean(item['code']), clean(item['order_code']), clean(item['name']), clean(item['category']),
            clean(item['unit']), clean(item['storage_location']), number(item['stock_quantity']),
            number(item['safety_stock']), number(item['order_unit']), number(item['unit_price']),
            clean(item['supplier_name']), clean(item['note']), image_file,
        ])

    if external_images:
        warnings.append(f'画像がURL指定のため移行しない消耗品 {len(external_images)}件: ' + ', '.join(external_images))
    if missing_images:
        warnings.append(f'画像ファイルが見つからない消耗品 {len(missing_images)}件: ' + ', '.join(missing_images))
    if no_supplier:
        warnings.append(f'購入先IDが購入先マスタに無い消耗品 {len(no_supplier)}件: ' + ', '.join(no_supplier))

    write_csv(out_dir / 'consumables.csv', CONSUMABLE_HEADERS, rows)
    return len(rows), copied


def export_employees_not_in_pm(engine, out_dir, pm_db):
    """syomohin の社員のうち、pm の UserProfile.employee_code に無い人"""
    if not pm_db.replace('_', '').isalnum():
        raise ValueError(f'pm DB 名が不正です: {pm_db}')
    rows = fetch_all(engine, f"""
        SELECT e.code, e.name, e.department
        FROM employees e
        LEFT JOIN `{pm_db}`.accounts_userprofile p ON p.employee_code = e.code
        WHERE p.user_id IS NULL
        ORDER BY e.code
    """)
    write_csv(out_dir / 'employees_not_in_pm.csv', ['社員コード', '氏名', '部署'],
              [[clean(r['code']), clean(r['name']), clean(r['department'])] for r in rows])
    return len(rows)


def print_status_counts(engine):
    """移行前確認: 状態の表記ゆれ（移行後の pm では依頼・注文書を登録し直す）"""
    print('\n[確認] 注文依頼の状態別件数（未完了分は pm で登録し直す）')
    for r in fetch_all(engine, 'SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status ORDER BY status'):
        print(f"  {clean(r['status']) or '(空)'}: {r['cnt']}")
    print('[確認] 注文書の状態別件数')
    for r in fetch_all(engine, 'SELECT status, COUNT(*) AS cnt FROM dispatch_orders GROUP BY status ORDER BY status'):
        print(f"  {clean(r['status']) or '(空)'}: {r['cnt']}")


def main():
    parser = argparse.ArgumentParser(description='syomohin → pm 移行用CSV出力')
    parser.add_argument('--out', default='export_pm', help='出力フォルダ（既定: export_pm）')
    parser.add_argument('--copy-images', action='store_true', help='画像ファイルを出力フォルダの images/ にコピーする')
    parser.add_argument('--pm-db', default='', help='pm のDB名（指定時、pm ユーザーに無い社員を出力）')
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    engine = get_db_manager().engine
    warnings = []

    supplier_count = export_suppliers(engine, out_dir, warnings)
    item_count, copied = export_consumables(engine, out_dir, args.copy_images, warnings)
    print(f'購入先: {supplier_count}件 → {out_dir / "suppliers.csv"}')
    print(f'消耗品: {item_count}件 → {out_dir / "consumables.csv"}')
    if args.copy_images:
        print(f'画像: {copied}件 → {out_dir / "images"}（pm_backend/media/consumables/images/ に配置）')
    if args.pm_db:
        missing = export_employees_not_in_pm(engine, out_dir, args.pm_db)
        print(f'pm ユーザーに無い社員: {missing}件 → {out_dir / "employees_not_in_pm.csv"}')

    print_status_counts(engine)

    if warnings:
        print('\n[要確認]')
        for w in warnings:
            print(f'  - {w}')
    print('\n取込順: pm の消耗品マスタ画面で 購入先CSV → 消耗品CSV の順に取り込んでください。')


if __name__ == '__main__':
    main()

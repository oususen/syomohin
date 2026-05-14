-- 消耗品リスト追加.xlsx インポート用SQL
-- INSERT IGNORE: codeが既存の場合はスキップ
-- 生成日: 2026-04-10 (20件)

INSERT IGNORE INTO consumables (code, order_code, name, unit, stock_quantity, safety_stock, supplier_id) VALUES
('IWATANI-001', 'S01', 'ノズルフレッシュ　351',                       '個', 0, 0, NULL),
('MASINA-OO340','S01', '',                                             '個', 0, 0, 14),
('MASINA-OO341','S01', 'レジボン　ミニスキルタッチ　＃80',             '個', 0, 0, 14),
('MASINA-OO342','S01', 'レジボン　ミニスキルタッチ　＃120',            '個', 0, 0, 14),
('MISUMI-002',  'S01', 'GA504-60　グリーンエースゴールド',             '個', 0, 0, NULL),
('NAGOYA-035',  'S01', 'スキルライター青',                             '個', 0, 0, 2),
('NAGOYA-036',  'S01', 'スキルライター青補充液',                       '個', 0, 0, 2),
('NAGOYA-037',  'S01', 'スキルライター赤',                             '個', 0, 0, 2),
('NAGOYA-038',  'S01', 'スキルライター赤補充液',                       '個', 0, 0, 2),
('NAGOYA-039',  'S01', 'スキルライター替え芯',                         '個', 0, 0, 2),
('NAGOYA-040',  'S01', 'SAKURA　クレパスソリッドマーカー赤',           '個', 0, 0, 2),
('NAGOYA-041',  'S01', 'SAKURA　クレパスソリッドマーカー黄',           '個', 0, 0, 2),
('NAGOYA-042',  'S01', 'N730×04　マスクライトテープ',                  '個', 0, 0, 2),
('NAGOYA-043',  'S01', 'SEKISUI　布両面テープ　№6100',                 '個', 0, 0, 2),
('ROJIKA-029',  'S01', 'GM500　グローブマニアトリル',                  NULL, 0, 0, NULL),
('TODAYA-075',  'S01', 'CREST352　山羊革手袋　LL',                     NULL, 0, 0, 9),
('TODAYA-076',  'S01', 'CREST352　山羊革手袋　L',                      NULL, 0, 0, 9),
('TODAYA-077',  'S01', 'N　199　アームカバー',                         NULL, 0, 0, 9),
('TODAYA-078',  'S01', '（770353）　排気弁T-6K型',                     NULL, 0, 0, 9),
('TODAYA-079',  'S01', '（771627）　吸気弁丸形',                       NULL, 0, 0, 9);

-- 結果確認
SELECT code, name, unit, supplier_id, created_at
FROM consumables
WHERE code IN (
  'IWATANI-001',
  'MASINA-OO340','MASINA-OO341','MASINA-OO342',
  'MISUMI-002',
  'NAGOYA-035','NAGOYA-036','NAGOYA-037','NAGOYA-038','NAGOYA-039',
  'NAGOYA-040','NAGOYA-041','NAGOYA-042','NAGOYA-043',
  'ROJIKA-029',
  'TODAYA-075','TODAYA-076','TODAYA-077','TODAYA-078','TODAYA-079'
)
ORDER BY code;

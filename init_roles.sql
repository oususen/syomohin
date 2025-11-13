-- 役職の初期データを投入
INSERT INTO roles (role_name, description) VALUES
('一般', '一般社員。基本的な操作が可能'),
('リーダ', 'チームリーダ。チーム内の調整・指示が可能'),
('班長', '班の責任者。班の管理・承認が可能'),
('係長', '係の責任者。係の管理・予算管理が可能'),
('課長', '課の責任者。課の管理・人事権限あり'),
('部長', '部の責任者。部の管理・すべての権限あり')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- デフォルトのページ権限を設定（一般）
INSERT INTO page_permissions (role_id, page_name, can_view, can_edit)
SELECT r.id, p.page_name, p.can_view, p.can_edit
FROM roles r
CROSS JOIN (
    SELECT '在庫一覧' as page_name, 1 as can_view, 0 as can_edit UNION ALL
    SELECT '出庫', 1, 1 UNION ALL
    SELECT '入庫', 1, 1 UNION ALL
    SELECT '注文依頼', 1, 1 UNION ALL
    SELECT '履歴', 1, 0
) p
WHERE r.role_name = '一般'
ON DUPLICATE KEY UPDATE can_view = VALUES(can_view), can_edit = VALUES(can_edit);

-- リーダの権限
INSERT INTO page_permissions (role_id, page_name, can_view, can_edit)
SELECT r.id, p.page_name, p.can_view, p.can_edit
FROM roles r
CROSS JOIN (
    SELECT '在庫一覧' as page_name, 1 as can_view, 1 as can_edit UNION ALL
    SELECT '出庫', 1, 1 UNION ALL
    SELECT '入庫', 1, 1 UNION ALL
    SELECT '注文依頼', 1, 1 UNION ALL
    SELECT '発注状態', 1, 1 UNION ALL
    SELECT '履歴', 1, 0
) p
WHERE r.role_name = 'リーダ'
ON DUPLICATE KEY UPDATE can_view = VALUES(can_view), can_edit = VALUES(can_edit);

-- 班長の権限
INSERT INTO page_permissions (role_id, page_name, can_view, can_edit)
SELECT r.id, p.page_name, p.can_view, p.can_edit
FROM roles r
CROSS JOIN (
    SELECT '在庫一覧' as page_name, 1 as can_view, 1 as can_edit UNION ALL
    SELECT '消耗品管理', 1, 1 UNION ALL
    SELECT '出庫', 1, 1 UNION ALL
    SELECT '入庫', 1, 1 UNION ALL
    SELECT '注文依頼', 1, 1 UNION ALL
    SELECT '発注状態', 1, 1 UNION ALL
    SELECT '発注', 1, 1 UNION ALL
    SELECT '履歴', 1, 0
) p
WHERE r.role_name = '班長'
ON DUPLICATE KEY UPDATE can_view = VALUES(can_view), can_edit = VALUES(can_edit);

-- 係長の権限
INSERT INTO page_permissions (role_id, page_name, can_view, can_edit)
SELECT r.id, p.page_name, p.can_view, p.can_edit
FROM roles r
CROSS JOIN (
    SELECT '在庫一覧' as page_name, 1 as can_view, 1 as can_edit UNION ALL
    SELECT '消耗品管理', 1, 1 UNION ALL
    SELECT '出庫', 1, 1 UNION ALL
    SELECT '入庫', 1, 1 UNION ALL
    SELECT '注文依頼', 1, 1 UNION ALL
    SELECT '発注状態', 1, 1 UNION ALL
    SELECT '発注', 1, 1 UNION ALL
    SELECT '購入先管理', 1, 1 UNION ALL
    SELECT '履歴', 1, 1
) p
WHERE r.role_name = '係長'
ON DUPLICATE KEY UPDATE can_view = VALUES(can_view), can_edit = VALUES(can_edit);

-- 課長の権限
INSERT INTO page_permissions (role_id, page_name, can_view, can_edit)
SELECT r.id, p.page_name, p.can_view, p.can_edit
FROM roles r
CROSS JOIN (
    SELECT '在庫一覧' as page_name, 1 as can_view, 1 as can_edit UNION ALL
    SELECT '消耗品管理', 1, 1 UNION ALL
    SELECT '出庫', 1, 1 UNION ALL
    SELECT '入庫', 1, 1 UNION ALL
    SELECT '注文依頼', 1, 1 UNION ALL
    SELECT '発注状態', 1, 1 UNION ALL
    SELECT '発注', 1, 1 UNION ALL
    SELECT '購入先管理', 1, 1 UNION ALL
    SELECT '従業員管理', 1, 1 UNION ALL
    SELECT '履歴', 1, 1
) p
WHERE r.role_name = '課長'
ON DUPLICATE KEY UPDATE can_view = VALUES(can_view), can_edit = VALUES(can_edit);

-- 部長の権限（すべて）
INSERT INTO page_permissions (role_id, page_name, can_view, can_edit)
SELECT r.id, p.page_name, 1, 1
FROM roles r
CROSS JOIN (
    SELECT '在庫一覧' as page_name UNION ALL
    SELECT '消耗品管理' UNION ALL
    SELECT '出庫' UNION ALL
    SELECT '入庫' UNION ALL
    SELECT '注文依頼' UNION ALL
    SELECT '発注状態' UNION ALL
    SELECT '発注' UNION ALL
    SELECT '購入先管理' UNION ALL
    SELECT '従業員管理' UNION ALL
    SELECT '履歴'
) p
WHERE r.role_name = '部長'
ON DUPLICATE KEY UPDATE can_view = 1, can_edit = 1;

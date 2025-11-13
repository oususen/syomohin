-- 発注機能用テーブル

-- 注文書マスターテーブル
CREATE TABLE IF NOT EXISTS dispatch_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(50) NOT NULL UNIQUE COMMENT '注文書番号（例: PO-20250114-001）',
    supplier_id INT NOT NULL COMMENT '購入先ID',
    supplier_name VARCHAR(255) NOT NULL COMMENT '購入先名（参照用）',
    total_items INT DEFAULT 0 COMMENT '明細数',
    total_amount DECIMAL(12, 2) DEFAULT 0 COMMENT '合計金額',
    status VARCHAR(50) DEFAULT '未送信' COMMENT 'ステータス（未送信/送信済/キャンセル）',
    created_by VARCHAR(100) COMMENT '作成者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    sent_at TIMESTAMP NULL COMMENT '送信日時',
    sent_email VARCHAR(255) COMMENT '送信先メールアドレス',
    note TEXT COMMENT '備考',
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    INDEX idx_order_number (order_number),
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='注文書マスター';

-- 注文書明細テーブル
CREATE TABLE IF NOT EXISTS dispatch_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dispatch_order_id INT NOT NULL COMMENT '注文書ID',
    consumable_id INT NOT NULL COMMENT '消耗品ID',
    code VARCHAR(50) NOT NULL COMMENT '商品コード',
    name VARCHAR(255) NOT NULL COMMENT '商品名',
    quantity INT NOT NULL COMMENT '数量',
    unit VARCHAR(20) COMMENT '単位',
    unit_price DECIMAL(10, 2) COMMENT '単価',
    total_amount DECIMAL(12, 2) COMMENT '金額',
    deadline VARCHAR(50) COMMENT '納期',
    note TEXT COMMENT '備考',
    original_order_id INT COMMENT '元の依頼ID（ordersテーブル）',
    FOREIGN KEY (dispatch_order_id) REFERENCES dispatch_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (consumable_id) REFERENCES consumables(id) ON DELETE CASCADE,
    FOREIGN KEY (original_order_id) REFERENCES orders(id) ON DELETE SET NULL,
    INDEX idx_dispatch_order_id (dispatch_order_id),
    INDEX idx_consumable_id (consumable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='注文書明細';

-- ordersテーブルにstatusカラムが不足している場合の対応
-- 既存のstatusを更新して、新しいステータスを追加
ALTER TABLE orders MODIFY COLUMN status VARCHAR(50) DEFAULT '依頼中' COMMENT 'ステータス（依頼中/発注準備/却下/発注済/キャンセル）';

-- データベース設定
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- 社員マスターテーブル
CREATE TABLE IF NOT EXISTS employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE COMMENT '社員コード',
    name VARCHAR(100) NOT NULL COMMENT '氏名',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='社員マスター';

-- 購入先マスターテーブル
CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL COMMENT '名称',
    contact VARCHAR(100) COMMENT '連絡先',
    contact_person VARCHAR(100) COMMENT '担当者',
    email VARCHAR(255) COMMENT 'メールアドレス',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='購入先マスター';

-- 消耗品マスターテーブル
CREATE TABLE IF NOT EXISTS consumables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE COMMENT 'コード',
    order_code VARCHAR(50) COMMENT '発注コード',
    name VARCHAR(255) NOT NULL COMMENT '品名',
    category VARCHAR(100) COMMENT 'カテゴリ',
    unit VARCHAR(20) COMMENT '単位',
    storage_location VARCHAR(100) COMMENT '保管場所',
    stock_quantity INT DEFAULT 0 COMMENT '在庫数',
    safety_stock INT DEFAULT 0 COMMENT '安全在庫',
    order_unit INT COMMENT '発注単位',
    supplier_id INT COMMENT '購入先ID',
    unit_price DECIMAL(10, 2) COMMENT '単価',
    order_status VARCHAR(50) COMMENT '注文状態',
    shortage_status VARCHAR(50) COMMENT '欠品状態',
    image_path VARCHAR(500) COMMENT '画像パス',
    pdf_path VARCHAR(500) COMMENT 'PDFパス',
    note TEXT COMMENT '備考',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    INDEX idx_code (code),
    INDEX idx_name (name),
    INDEX idx_category (category),
    INDEX idx_order_status (order_status),
    INDEX idx_shortage_status (shortage_status),
    INDEX idx_supplier_id (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消耗品マスター';

-- 出庫履歴テーブル
CREATE TABLE IF NOT EXISTS outbound_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consumable_id INT NOT NULL COMMENT '消耗品ID',
    code VARCHAR(50) NOT NULL COMMENT 'コード（参照用）',
    name VARCHAR(255) NOT NULL COMMENT '品名（参照用）',
    quantity INT NOT NULL COMMENT '出庫数量',
    employee_id INT COMMENT '作業者ID',
    employee_name VARCHAR(100) COMMENT '作業者名',
    usage_line VARCHAR(100) COMMENT '使用ライン',
    unit_price DECIMAL(10, 2) COMMENT '単価',
    total_amount DECIMAL(12, 2) COMMENT '金額',
    note TEXT COMMENT '備考',
    outbound_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '出庫日時',
    FOREIGN KEY (consumable_id) REFERENCES consumables(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    INDEX idx_consumable_id (consumable_id),
    INDEX idx_employee_id (employee_id),
    INDEX idx_outbound_date (outbound_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='出庫履歴';

-- 入庫履歴テーブル
CREATE TABLE IF NOT EXISTS inbound_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consumable_id INT NOT NULL COMMENT '消耗品ID',
    code VARCHAR(50) NOT NULL COMMENT 'コード（参照用）',
    name VARCHAR(255) NOT NULL COMMENT '品名（参照用）',
    quantity INT NOT NULL COMMENT '入庫数量',
    employee_id INT COMMENT '作業者ID',
    employee_name VARCHAR(100) COMMENT '作業者名',
    unit_price DECIMAL(10, 2) COMMENT '単価',
    total_amount DECIMAL(12, 2) COMMENT '金額',
    note TEXT COMMENT '備考',
    inbound_type VARCHAR(20) DEFAULT '手動' COMMENT '入庫種別（手動/自動）',
    inbound_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '入庫日時',
    FOREIGN KEY (consumable_id) REFERENCES consumables(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    INDEX idx_consumable_id (consumable_id),
    INDEX idx_employee_id (employee_id),
    INDEX idx_inbound_date (inbound_date),
    INDEX idx_inbound_type (inbound_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='入庫履歴';

-- 注文依頼テーブル
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consumable_id INT NOT NULL COMMENT '消耗品ID',
    code VARCHAR(50) NOT NULL COMMENT 'コード（参照用）',
    name VARCHAR(255) NOT NULL COMMENT '品名（参照用）',
    quantity INT NOT NULL COMMENT '注文数量',
    unit VARCHAR(20) COMMENT '単位',
    unit_price DECIMAL(10, 2) COMMENT '単価',
    total_amount DECIMAL(12, 2) COMMENT '金額',
    deadline VARCHAR(50) COMMENT '納期（最短/通常/余裕あり）',
    requester_id INT COMMENT '依頼者ID',
    requester_name VARCHAR(100) COMMENT '発注依頼者',
    supplier_id INT COMMENT '購入先ID',
    order_representative VARCHAR(100) COMMENT '注文代表者',
    receipt_no VARCHAR(100) COMMENT '受注票No',
    note TEXT COMMENT '備考',
    status VARCHAR(50) DEFAULT '依頼中' COMMENT 'ステータス（依頼中/発注済/入庫済/キャンセル）',
    order_type VARCHAR(50) DEFAULT '手動' COMMENT '依頼種別（手動/自動）',
    requested_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '依頼日時',
    ordered_date TIMESTAMP NULL COMMENT '発注日時',
    completed_date TIMESTAMP NULL COMMENT '完了日時',
    FOREIGN KEY (consumable_id) REFERENCES consumables(id) ON DELETE CASCADE,
    FOREIGN KEY (requester_id) REFERENCES employees(id) ON DELETE SET NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    INDEX idx_consumable_id (consumable_id),
    INDEX idx_requester_id (requester_id),
    INDEX idx_status (status),
    INDEX idx_order_type (order_type),
    INDEX idx_requested_date (requested_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='注文依頼';

-- 発注データテーブル
CREATE TABLE IF NOT EXISTS order_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL COMMENT '注文ID',
    order_code VARCHAR(50) COMMENT '発注コード',
    consumable_id INT NOT NULL COMMENT '消耗品ID',
    code VARCHAR(50) NOT NULL COMMENT 'コード（参照用）',
    name VARCHAR(255) NOT NULL COMMENT '品名',
    quantity INT NOT NULL COMMENT '数量',
    unit VARCHAR(20) COMMENT '単位',
    unit_price DECIMAL(10, 2) COMMENT '単価',
    total_amount DECIMAL(12, 2) COMMENT '金額',
    supplier_id INT COMMENT '購入先ID',
    receipt_no VARCHAR(100) COMMENT '受注票No',
    delivery_status VARCHAR(50) COMMENT '納期',
    note TEXT COMMENT '備考',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (consumable_id) REFERENCES consumables(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    INDEX idx_order_id (order_id),
    INDEX idx_order_code (order_code),
    INDEX idx_consumable_id (consumable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='発注データ';

-- 添付ファイルテーブル
CREATE TABLE IF NOT EXISTS attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consumable_id INT NOT NULL COMMENT '消耗品ID',
    file_type VARCHAR(20) NOT NULL COMMENT 'ファイル種別（image/pdf）',
    file_name VARCHAR(255) NOT NULL COMMENT 'ファイル名',
    file_path VARCHAR(500) NOT NULL COMMENT 'ファイルパス',
    file_size BIGINT COMMENT 'ファイルサイズ（バイト）',
    uploaded_by VARCHAR(100) COMMENT 'アップロード者',
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'アップロード日時',
    FOREIGN KEY (consumable_id) REFERENCES consumables(id) ON DELETE CASCADE,
    INDEX idx_consumable_id (consumable_id),
    INDEX idx_file_type (file_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='添付ファイル';

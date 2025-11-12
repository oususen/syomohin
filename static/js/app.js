// グローバル変数
let cameraStream = null;
let filterOptions = { order_status: [], shortage_status: [] };
let currentPage = 'inventory';
let currentRegisterSubtab = 'create';
let registerPageEventsBound = false;
let editGalleryCache = [];
let editGalleryLoaded = false;
let currentEditItemId = null;
let currentQrTarget = null; // 現在QRコードを入力しようとしているフィールド
const DEFAULT_SHORTAGE_STATUSES = ['欠品', '要注意', '在庫あり'];

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    // フィルターオプションを取得
    await loadFilterOptions();

    // 初期データを読み込み
    await loadInventory();

    // イベントリスナーを設定
    setupEventListeners();
}

// イベントリスナーの設定
function setupEventListeners() {
    // ナビゲーションボタン
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = e.target.dataset.page;
            switchPage(page);
        });
    });

    // 在庫一覧ページ
    document.getElementById('qrCodeInput').addEventListener('input', debounce(loadInventory, 300));
    document.getElementById('searchInput').addEventListener('input', debounce(loadInventory, 300));
    document.getElementById('orderStatus').addEventListener('change', loadInventory);
    document.getElementById('shortageStatus').addEventListener('change', loadInventory);
    document.getElementById('clearQrBtn').addEventListener('click', () => {
        document.getElementById('qrCodeInput').value = '';
        loadInventory();
    });
    document.getElementById('scanQrBtn').addEventListener('click', () => {
        currentQrTarget = 'qrCodeInput';
        openCamera();
    });

    // 出庫ページ
    document.getElementById('outboundQrCode').addEventListener('input', () => loadItemInfo('outbound'));
    document.getElementById('outboundScanBtn').addEventListener('click', () => {
        currentQrTarget = 'outboundQrCode';
        openCamera();
    });
    document.getElementById('outboundSearchText').addEventListener('input', debounce(() => searchItemByName('outbound'), 300));
    document.getElementById('outboundEmployeeCode').addEventListener('input', debounce(() => loadEmployeeByCode('outbound'), 300));
    document.getElementById('submitOutbound').addEventListener('click', submitOutbound);

    // 入庫ページ
    document.getElementById('showManualInbound').addEventListener('click', () => {
        document.getElementById('manualInboundForm').style.display = 'block';
        document.getElementById('autoInboundList').style.display = 'none';
    });
    document.getElementById('showAutoInbound').addEventListener('click', () => {
        document.getElementById('manualInboundForm').style.display = 'none';
        document.getElementById('autoInboundList').style.display = 'block';
        loadPendingOrders();
    });
    document.getElementById('inboundQrCode').addEventListener('input', () => loadItemInfo('inbound'));
    document.getElementById('inboundScanBtn').addEventListener('click', () => {
        currentQrTarget = 'inboundQrCode';
        openCamera();
    });
    document.getElementById('inboundSearchText').addEventListener('input', debounce(() => searchItemByName('inbound'), 300));
    document.getElementById('inboundEmployeeCode').addEventListener('input', debounce(() => loadEmployeeByCode('inbound'), 300));
    document.getElementById('submitInbound').addEventListener('click', submitInbound);

    ['editStockQty', 'editSafetyStock'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', autoUpdateEditShortageStatus);
        }
    });

    // 注文依頼ページ
    document.getElementById('orderQrCode').addEventListener('input', () => loadItemInfo('order'));
    document.getElementById('orderScanBtn').addEventListener('click', () => {
        currentQrTarget = 'orderQrCode';
        openCamera();
    });
    document.getElementById('orderEmployeeCode').addEventListener('input', debounce(() => loadEmployeeByCode('order'), 300));
    document.getElementById('submitOrder').addEventListener('click', submitOrder);

    // 発注状態リストページ
    document.getElementById('showManualOrders').addEventListener('click', () => {
        document.getElementById('manualOrdersList').style.display = 'block';
        document.getElementById('autoOrdersList').style.display = 'none';
        loadManualOrders();
    });
    document.getElementById('showAutoOrders').addEventListener('click', () => {
        document.getElementById('manualOrdersList').style.display = 'none';
        document.getElementById('autoOrdersList').style.display = 'block';
        loadAutoOrders();
    });

    // カメラモーダル
    document.getElementById('closeModal').addEventListener('click', closeCamera);
    document.getElementById('captureBtn').addEventListener('click', capturePhoto);
    document.getElementById('cameraModal').addEventListener('click', (e) => {
        if (e.target.id === 'cameraModal') {
            closeCamera();
        }
    });

    // 検索結果ドロップダウンを外側クリックで閉じる
    document.addEventListener('click', (e) => {
        const outboundResults = document.getElementById('outboundSearchResults');
        const inboundResults = document.getElementById('inboundSearchResults');
        const outboundSearch = document.getElementById('outboundSearchText');
        const inboundSearch = document.getElementById('inboundSearchText');

        if (outboundResults && !outboundSearch?.contains(e.target) && !outboundResults.contains(e.target)) {
            outboundResults.style.display = 'none';
        }
        if (inboundResults && !inboundSearch?.contains(e.target) && !inboundResults.contains(e.target)) {
            inboundResults.style.display = 'none';
        }
    });
}

// ページ切り替え
function switchPage(page) {
    currentPage = page;

    // ナビゲーションボタンのactive状態を更新
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    // ページコンテンツの表示を切り替え
    document.querySelectorAll('.page-content').forEach(content => {
        content.classList.remove('active');
    });

    const pageMap = {
        'inventory': 'inventoryPage',
        'register': 'registerPage',
        'outbound': 'outboundPage',
        'inbound': 'inboundPage',
        'history': 'historyPage',
        'order': 'orderPage',
        'order-list': 'orderListPage',
        'dispatch': 'dispatchPage',
        'suppliers': 'suppliersPage',
        'employees': 'employeesPage'
    };

    document.getElementById(pageMap[page]).classList.add('active');

    // ページタイトルを更新
    const titles = {
        'inventory': '📦 在庫一覧',
        'register': '🧰 消耗品管理',
        'outbound': '📤 出庫',
        'inbound': '📥 入庫',
        'history': '📋 入出庫履歴',
        'order': '📝 注文依頼',
        'order-list': '📋 発注状態',
        'dispatch': '📮 発注',
        'suppliers': '🏢 購入先管理',
        'employees': '👤 従業員管理'
    };
    document.getElementById('pageTitle').textContent = titles[page];

    // ページごとの初期化処理
    if (page === 'register') {
        initRegisterPage();
    } else if (page === 'order-list') {
        loadManualOrders();
    } else if (page === 'dispatch') {
        initDispatchPage();
    } else if (page === 'suppliers') {
        initSuppliersPage();
    } else if (page === 'employees') {
        initEmployeesPage();
    } else if (page === 'history') {
        initHistoryPage();
    }
}

// デバウンス関数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// フィルターオプションを読み込み
async function loadFilterOptions() {
    try {
        const response = await fetch('/api/filter-options');
        const data = await response.json();

        if (data.success) {
            filterOptions = data;

            const orderSelect = document.getElementById('orderStatus');
            if (orderSelect) {
                orderSelect.innerHTML = data.order_status.map(status =>
                    `<option value="${status}">${status}</option>`
                ).join('');
            }

            const shortageSelect = document.getElementById('shortageStatus');
            if (shortageSelect) {
                shortageSelect.innerHTML = data.shortage_status.map(status =>
                    `<option value="${status}">${status}</option>`
                ).join('');
            }

            const editShortageSelect = document.getElementById('editShortageStatus');
            if (editShortageSelect) {
                const selectableStatuses = (data.shortage_status || []).filter(status => status !== 'すべて');
                const mergedStatuses = Array.from(new Set([...DEFAULT_SHORTAGE_STATUSES, ...selectableStatuses]));
                const optionHtml = mergedStatuses.map(status =>
                    `<option value="${status}">${status}</option>`
                ).join('');
                editShortageSelect.innerHTML = `<option value="">-- 在庫状態を選択 --</option>${optionHtml}`;
            }
        }
    } catch (error) {
        console.error('フィルターオプションの取得に失敗:', error);
    }
}

// 在庫データを読み込み
async function loadInventory() {
    try {
        const qrCode = document.getElementById('qrCodeInput').value;
        const searchText = document.getElementById('searchInput').value;
        const orderStatus = document.getElementById('orderStatus').value;
        const shortageStatus = document.getElementById('shortageStatus').value;

        const params = new URLSearchParams({
            qr_code: qrCode,
            search_text: searchText,
            order_status: orderStatus,
            shortage_status: shortageStatus,
        });

        const response = await fetch(`/api/inventory?${params}`);
        const data = await response.json();

        if (data.success) {
            renderInventory(data.data);
            updateCountInfo(data.filtered, data.total);
        } else {
            showError('データの取得に失敗しました: ' + data.error);
        }
    } catch (error) {
        console.error('在庫データの取得に失敗:', error);
        showError('データの取得に失敗しました');
    }
}

// 在庫一覧を表示
function pickField(item, keys) {
    for (const key of keys) {
        if (item && Object.prototype.hasOwnProperty.call(item, key) && item[key] !== null && item[key] !== undefined) {
            return item[key];
        }
    }
    return "";
}

function escapeAttr(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).replace(/"/g, '&quot;');
}

function getStatusClass(value, type) {
    if (!value) return "status-neutral";
    const text = String(value);
    if (type === "shortage") {
        if (text.includes("欠") || text.includes("要") || text.includes("不足")) {
            return "status-alert";
        }
        return "status-safe";
    }
    if (type === "order") {
        if (text.includes("済") || text.includes("完")) {
            return "status-success";
        }
        if (text.includes("依頼") || text.includes("待") || text.includes("承認")) {
            return "status-warning";
        }
        return "status-info";
    }
    return "status-info";
}

function renderInventory(items) {
    const container = document.getElementById('inventoryList');

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>条件に合致する消耗品が見つかりません。</p>
                <p>フィルター条件を変えてください。</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        const code = pickField(item, ['コード', 'コーチE', 'code']);
        const orderCode = pickField(item, ['発注コード', '発注コーチE', 'order_code']);
        const name = pickField(item, ['品名', 'name']);
        const category = pickField(item, ['カテゴリ', 'category']);
        const unit = pickField(item, ['単位', 'unit']) || '個';
        const stock = parseInt(pickField(item, ['在庫数', 'stock_quantity'])) || 0;
        const safety = parseInt(pickField(item, ['安全在庫', 'safety_stock'])) || 0;
        const supplier = pickField(item, ['購入先', 'supplier_name']);
        const shortageStatus = pickField(item, ['欠品状態', 'shortage_status']) || '不明';
        const orderStatus = pickField(item, ['注文状態', 'order_status']) || '不明';
        const shortageClass = getStatusClass(shortageStatus, 'shortage');
        const orderClass = getStatusClass(orderStatus, 'order');
        const imagePath = pickField(item, ['画像URL', 'image_path']);
        const imageUrl = buildImageUrl(imagePath);
        const safeCodeAttr = escapeAttr(code);
        const safeNameAttr = escapeAttr(name);
        const safeUnitAttr = escapeAttr(unit);
        const safeSupplierAttr = escapeAttr(supplier);

        return `
            <div class="inventory-card">
                <div class="card-main">
                    <div class="card-image-wrapper">
                        <img
                            src="${imageUrl}"
                            alt="${name}"
                            class="card-image-large"
                            loading="lazy"
                        >
                    </div>
                    <div class="card-info">
                        <div class="card-title-row">
                            <div class="item-name">${name || '-'}</div>
                            <div class="item-code">コード: ${code || '-'}</div>
                        </div>
                        <div class="card-meta-row">
                            <span>発注コード: ${orderCode || '-'}</span>
                            <span>カテゴリ: ${category || '-'}</span>
                        </div>
                        <div class="card-meta-row">
                            <span>在庫数: <strong>${stock}</strong> ${unit}</span>
                            <span>安全在庫: ${safety} ${unit}</span>
                        </div>
                        <div class="card-meta-row">
                            <span>購入先: ${supplier || '-'}</span>
                        </div>
                        <div class="status-row">
                            <span class="status-pill ${shortageClass}">欠品状態: ${shortageStatus}</span>
                            <span class="status-pill ${orderClass}">注文状態: ${orderStatus}</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button
                            class="action-btn action-outbound"
                            data-code="${safeCodeAttr}"
                            data-name="${safeNameAttr}"
                            data-stock="${stock}"
                            data-safety="${safety}"
                            data-unit="${safeUnitAttr}"
                            data-supplier="${safeSupplierAttr}"
                            onclick="handleInventoryAction('outbound', this)"
                        >
                            📤 出庫
                        </button>
                        <button
                            class="action-btn action-inbound"
                            data-code="${safeCodeAttr}"
                            data-name="${safeNameAttr}"
                            data-stock="${stock}"
                            data-safety="${safety}"
                            data-unit="${safeUnitAttr}"
                            data-supplier="${safeSupplierAttr}"
                            onclick="handleInventoryAction('inbound', this)"
                        >
                            📥 入庫
                        </button>
                        <button
                            class="action-btn action-order"
                            data-code="${safeCodeAttr}"
                            data-name="${safeNameAttr}"
                            data-stock="${stock}"
                            data-safety="${safety}"
                            data-unit="${safeUnitAttr}"
                            data-supplier="${safeSupplierAttr}"
                            onclick="handleInventoryAction('order', this)"
                        >
                            📝 注文依頼
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function handleInventoryAction(action, button) {
    const payload = {
        code: button.dataset.code || "",
        name: button.dataset.name || "",
        stock: parseInt(button.dataset.stock || "0", 10),
        safety: parseInt(button.dataset.safety || "0", 10),
        unit: button.dataset.unit || "",
        supplier: button.dataset.supplier || "",
    };

    const configMap = {
        outbound: { page: 'outbound', qr: 'outboundQrCode', container: 'outboundItemInfo', details: 'outboundItemDetails', focus: 'outboundQuantity' },
        inbound: { page: 'inbound', qr: 'inboundQrCode', container: 'inboundItemInfo', details: 'inboundItemDetails', focus: 'inboundQuantity' },
        order: { page: 'order', qr: 'orderQrCode', container: 'orderItemInfo', details: 'orderItemDetails', focus: 'orderQuantity' },
    };

    const config = configMap[action];
    if (!config) return;

    switchPage(action === 'order' ? 'order' : action);
    if (config.qr) {
        const qrInput = document.getElementById(config.qr);
        if (qrInput) qrInput.value = payload.code;
    }

    showQuickInfo(config.container, config.details, payload);

    const focusTarget = document.getElementById(config.focus);
    if (focusTarget) {
        focusTarget.focus();
        focusTarget.select();
    }
}

function showQuickInfo(containerId, detailsId, payload) {
    const container = document.getElementById(containerId);
    const details = document.getElementById(detailsId);
    if (!container || !details) return;

    details.innerHTML = `
        <div class="quick-item-card">
            <div><strong>品名:</strong> ${payload.name || '-'}</div>
            <div><strong>コード:</strong> ${payload.code || '-'}</div>
            <div><strong>在庫数:</strong> ${payload.stock} ${payload.unit}</div>
            <div><strong>安全在庫:</strong> ${payload.safety} ${payload.unit}</div>
            <div><strong>購入先:</strong> ${payload.supplier || '-'}</div>
        </div>
    `;
    container.style.display = 'block';
    container.dataset.itemCode = payload.code || '';
}

function updateCountInfo(filtered, total) {
    document.getElementById('countInfo').textContent = `表示件数: ${filtered} / ${total}`;
}

// 商品情報を読み込み（出庫・入庫・注文用）
async function loadItemInfo(type) {
    const qrCodeId = type === 'outbound' ? 'outboundQrCode' :
                     type === 'inbound' ? 'inboundQrCode' : 'orderQrCode';
    const qrCode = document.getElementById(qrCodeId).value.trim();

    if (!qrCode) {
        document.getElementById(`${type}ItemInfo`).style.display = 'none';
        return;
    }

    try {
        const response = await fetch(`/api/inventory?qr_code=${qrCode}`);
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            const item = data.data[0];
            displayItemInfo(type, item);
        } else {
            document.getElementById(`${type}ItemInfo`).style.display = 'none';
            showError('商品が見つかりません');
        }
    } catch (error) {
        console.error('商品情報の取得に失敗:', error);
    }
}

// 品名で商品を検索
async function searchItemByName(type) {
    const searchInputId = type === 'outbound' ? 'outboundSearchText' : 'inboundSearchText';
    const searchText = document.getElementById(searchInputId).value.trim();

    // 検索結果表示用のコンテナを取得または作成
    let resultsContainer = document.getElementById(`${type}SearchResults`);
    if (!resultsContainer) {
        resultsContainer = document.createElement('div');
        resultsContainer.id = `${type}SearchResults`;
        resultsContainer.className = 'search-results-dropdown';
        resultsContainer.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            max-height: 300px;
            overflow-y: auto;
            z-index: 100;
            display: none;
            margin-top: 4px;
            width: calc(100% - 32px);
        `;
        document.getElementById(searchInputId).parentElement.style.position = 'relative';
        document.getElementById(searchInputId).parentElement.appendChild(resultsContainer);
    }

    if (!searchText) {
        resultsContainer.style.display = 'none';
        return;
    }

    try {
        const response = await fetch(`/api/inventory?search_text=${encodeURIComponent(searchText)}`);
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            displaySearchResults(type, data.data, resultsContainer);
        } else {
            resultsContainer.innerHTML = `
                <div style="padding: 12px; color: #666;">
                    該当する商品が見つかりません
                </div>
            `;
            resultsContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('商品検索に失敗:', error);
        resultsContainer.style.display = 'none';
    }
}

// 従業員コードから従業員情報を取得
async function loadEmployeeByCode(type) {
    const config = {
        outbound: {
            code: 'outboundEmployeeCode',
            person: 'outboundPerson',
            department: 'outboundDepartment',
        },
        inbound: {
            code: 'inboundEmployeeCode',
            person: 'inboundPerson',
            department: 'inboundDepartment',
        },
        order: {
            code: 'orderEmployeeCode',
            person: 'orderRequester',
            department: null,
        },
    };

    const target = config[type];
    if (!target) {
        return;
    }

    const codeInput = document.getElementById(target.code);
    const personInput = document.getElementById(target.person);
    const departmentInput = target.department ? document.getElementById(target.department) : null;

    if (!codeInput || !personInput) {
        return;
    }

    const employeeCode = codeInput.value.trim();

    const clearFields = () => {
        personInput.value = '';
        if (departmentInput) {
            departmentInput.value = '';
        }
    };

    if (!employeeCode) {
        clearFields();
        return;
    }

    try {
        const response = await fetch(`/api/employees/by-code/${encodeURIComponent(employeeCode)}`);
        const data = await response.json();

        if (data.success) {
            personInput.value = data.data.name || '';
            if (departmentInput) {
                departmentInput.value = data.data.department || '';
            }
        } else {
            clearFields();
            showError('従業員が見つかりません');
        }
    } catch (error) {
        console.error('従業員情報の取得に失敗:', error);
        clearFields();
    }
}

// 検索結果キャッシュ
let outboundSearchCache = [];
let inboundSearchCache = [];

// 検索結果を表示
function displaySearchResults(type, items, container) {
    // 結果をキャッシュ
    if (type === 'outbound') {
        outboundSearchCache = items;
    } else if (type === 'inbound') {
        inboundSearchCache = items;
    }

    container.innerHTML = items.slice(0, 10).map((item, index) => {
        const code = pickField(item, ['コード', 'code']);
        const name = pickField(item, ['品名', 'name']);
        const stock = pickField(item, ['在庫数', 'stock_quantity']);
        const unit = pickField(item, ['単位', 'unit']) || '個';
        const supplier = pickField(item, ['購入先', 'supplier_name']);

        return `
            <div class="search-result-item"
                 style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; transition: background 0.2s;"
                 onmouseover="this.style.background='#f5f5f5'"
                 onmouseout="this.style.background='white'"
                 onclick="selectSearchResultItem('${type}', ${index})">
                <div style="font-weight: bold; margin-bottom: 4px;">${name}</div>
                <div style="font-size: 13px; color: #666;">
                    コード: ${code} | 在庫: ${stock} ${unit} | 購入先: ${supplier || '-'}
                </div>
            </div>
        `;
    }).join('');

    if (items.length > 10) {
        container.innerHTML += `
            <div style="padding: 8px; text-align: center; color: #666; font-size: 12px; background: #f9f9f9;">
                他 ${items.length - 10} 件...（絞り込んでください）
            </div>
        `;
    }

    container.style.display = 'block';
}

// 検索結果から商品を選択
function selectSearchResultItem(type, itemIndex) {
    // キャッシュから商品を取得
    const cache = type === 'outbound' ? outboundSearchCache : inboundSearchCache;
    const item = cache[itemIndex];

    if (!item) {
        showError('商品情報の取得に失敗しました');
        return;
    }

    // 商品情報を表示
    displayItemInfo(type, item);

    // 検索フィールドに選択した商品名を設定
    const searchInputId = type === 'outbound' ? 'outboundSearchText' : 'inboundSearchText';
    const name = pickField(item, ['品名', 'name']);
    document.getElementById(searchInputId).value = name;

    // 検索結果を非表示
    const resultsContainer = document.getElementById(`${type}SearchResults`);
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
    }

    // 数量入力欄にフォーカス
    const quantityField = document.getElementById(`${type}Quantity`);
    if (quantityField) {
        quantityField.focus();
    }
}

// 商品情報を表示
function displayItemInfo(type, item) {
    const detailsDiv = document.getElementById(`${type}ItemDetails`);
    const stock = parseInt(item['在庫数']);
    const safety = parseInt(item['安全在庫']);

    detailsDiv.innerHTML = `
        <div style="padding: 12px; background: white; border-radius: 8px; margin-bottom: 12px;">
            <div style="margin-bottom: 8px;"><strong>品名:</strong> ${item['品名']}</div>
            <div style="margin-bottom: 8px;"><strong>コード:</strong> ${item['コード']}</div>
            <div style="margin-bottom: 8px;"><strong>現在庫数:</strong> ${stock} ${item['単位']}</div>
            <div style="margin-bottom: 8px;"><strong>安全在庫:</strong> ${safety} ${item['単位']}</div>
            <div><strong>購入先:</strong> ${item['購入先']}</div>
        </div>
    `;

    document.getElementById(`${type}ItemInfo`).style.display = 'block';
    document.getElementById(`${type}ItemInfo`).dataset.itemCode = item['コード'];
}

// 出庫を送信
async function submitOutbound() {
    const code = document.getElementById('outboundItemInfo').dataset.itemCode;
    const quantity = parseInt(document.getElementById('outboundQuantity').value);
    const person = document.getElementById('outboundPerson').value.trim();
    const department = document.getElementById('outboundDepartment').value.trim();
    const note = document.getElementById('outboundNote').value.trim();

    if (!quantity || quantity <= 0) {
        showError('出庫数量を入力してください');
        return;
    }

    if (!person) {
        showError('出庫者名を入力してください');
        return;
    }

    try {
        const response = await fetch('/api/outbound', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                quantity: quantity,
                person: person,
                department: department,
                note: note
            }),
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(`${code} を ${quantity} 個出庫しました（出庫者: ${person}${department ? ' / ' + department : ''}）`);

            // フォームをクリア
            document.getElementById('outboundQrCode').value = '';
            document.getElementById('outboundQuantity').value = '';
            document.getElementById('outboundEmployeeCode').value = '';
            document.getElementById('outboundPerson').value = '';
            document.getElementById('outboundDepartment').value = '';
            document.getElementById('outboundNote').value = '';
            document.getElementById('outboundItemInfo').style.display = 'none';

            // 在庫データを再読み込み
            await loadInventory();
        } else {
            showError(data.error || '出庫に失敗しました');
        }
    } catch (error) {
        console.error('出庫エラー:', error);
        showError('出庫に失敗しました');
    }
}

// 入庫を送信
async function submitInbound() {
    const code = document.getElementById('inboundItemInfo').dataset.itemCode;
    const quantity = parseInt(document.getElementById('inboundQuantity').value);
    const person = document.getElementById('inboundPerson').value.trim();
    const department = document.getElementById('inboundDepartment').value.trim();
    const note = document.getElementById('inboundNote').value.trim();

    if (!quantity || quantity <= 0) {
        showError('入庫数量を入力してください');
        return;
    }

    if (!person) {
        showError('入庫者名を入力してください');
        return;
    }

    try {
        const response = await fetch('/api/inbound', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                quantity: quantity,
                person: person,
                department: department,
                note: note,
                inbound_type: '手動'
            }),
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(`${code} を ${quantity} 個入庫しました（入庫者: ${person}${department ? ' / ' + department : ''}）`);

            // フォームをクリア
            document.getElementById('inboundQrCode').value = '';
            document.getElementById('inboundQuantity').value = '';
            document.getElementById('inboundEmployeeCode').value = '';
            document.getElementById('inboundPerson').value = '';
            document.getElementById('inboundDepartment').value = '';
            document.getElementById('inboundNote').value = '';
            document.getElementById('inboundItemInfo').style.display = 'none';

            // 在庫データを再読み込み
            await loadInventory();
        } else {
            showError(data.error || '入庫に失敗しました');
        }
    } catch (error) {
        console.error('入庫エラー:', error);
        showError('入庫に失敗しました');
    }
}

// 注文依頼を送信
async function submitOrder() {
    const code = document.getElementById('orderItemInfo').dataset.itemCode;
    const quantity = parseInt(document.getElementById('orderQuantity').value);
    const deadline = document.getElementById('orderDeadline').value;
    const requester = document.getElementById('orderRequester').value.trim();
    const note = document.getElementById('orderNote').value.trim();

    if (!quantity || quantity <= 0) {
        showError('注文数量を入力してください');
        return;
    }

    if (!requester) {
        showError('発注依頼者名を入力してください');
        return;
    }

    try {
        const response = await fetch('/api/order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: code,
                quantity: quantity,
                deadline: deadline || '通常',
                requester: requester,
                note: note,
                order_type: '手動'
            }),
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(`${code} を ${quantity} 個注文依頼しました（納期: ${deadline}）`);

            // フォームをクリア
            document.getElementById('orderQrCode').value = '';
            document.getElementById('orderQuantity').value = '';
            document.getElementById('orderEmployeeCode').value = '';
            document.getElementById('orderRequester').value = '';
            document.getElementById('orderNote').value = '';
            document.getElementById('orderItemInfo').style.display = 'none';

            // 在庫データを再読み込み
            await loadInventory();
        } else {
            showError(data.error || '注文依頼に失敗しました');
        }
    } catch (error) {
        console.error('注文依頼エラー:', error);
        showError('注文依頼に失敗しました');
    }
}

// 発注待ち一覧を読み込み
async function loadPendingOrders() {
    const container = document.getElementById('pendingOrdersList');
    container.innerHTML = '<p class="loading">読み込み中...</p>';

    try {
        const response = await fetch('/api/orders?status=依頼中');
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(order => `
                <div class="order-card">
                    <div style="margin-bottom: 8px;"><strong>品名:</strong> ${order.name}</div>
                    <div style="margin-bottom: 8px;"><strong>数量:</strong> ${order.quantity} ${order.unit}</div>
                    <div style="margin-bottom: 8px;"><strong>依頼者:</strong> ${order.requester_name}</div>
                    <div style="margin-bottom: 8px;"><strong>依頼日:</strong> ${new Date(order.requested_date).toLocaleDateString('ja-JP')}</div>
                    <div style="margin-bottom: 8px;"><strong>購入先:</strong> ${order.supplier_name || '未設定'}</div>
                    <div><span class="badge badge-blue">${order.status}</span></div>
                </div>
            `).join('');
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <p>発注待ちの商品はありません。</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('発注待ち一覧の取得に失敗:', error);
        container.innerHTML = '<p class="error">データの取得に失敗しました</p>';
    }
}

// 人からの依頼リストを読み込み
async function loadManualOrders() {
    const container = document.getElementById('manualOrdersContent');
    container.innerHTML = '<p class="loading">読み込み中...</p>';

    try {
        const response = await fetch('/api/orders?order_type=手動');
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(order => {
                const statusBadge = order.status === '発注済' ? 'badge-green' :
                                    order.status === '完了' ? 'badge-gray' : 'badge-blue';

                return `
                    <div class="order-card" data-order-id="${order.id}">
                        <div style="margin-bottom: 8px;"><strong>品名:</strong> ${order.name}</div>
                        <div style="margin-bottom: 8px;"><strong>コード:</strong> ${order.code}</div>
                        <div style="margin-bottom: 8px;"><strong>数量:</strong> ${order.quantity} ${order.unit}</div>
                        <div style="margin-bottom: 8px;"><strong>依頼者:</strong> ${order.requester_name}</div>
                        <div style="margin-bottom: 8px;"><strong>依頼日:</strong> ${new Date(order.requested_date).toLocaleDateString('ja-JP')}</div>
                        <div style="margin-bottom: 8px;"><strong>購入先:</strong> ${order.supplier_name || '未設定'}</div>
                        <div style="margin-bottom: 8px;"><strong>納期:</strong> ${order.deadline}</div>
                        <div style="margin-bottom: 12px;">
                            <span class="badge ${statusBadge}">${order.status}</span>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            ${order.status === '依頼中' ? `
                                <button onclick="updateOrderStatus(${order.id}, '発注済')"
                                    style="padding: 6px 12px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    発注済にする
                                </button>
                            ` : ''}
                            ${order.status === '発注済' ? `
                                <button onclick="updateOrderStatus(${order.id}, '完了')"
                                    style="padding: 6px 12px; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    完了にする
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <p>手動依頼の注文はありません。</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('手動依頼リストの取得に失敗:', error);
        container.innerHTML = '<p class="error">データの取得に失敗しました</p>';
    }
}

// 自動依頼分リストを読み込み
async function loadAutoOrders() {
    const container = document.getElementById('autoOrdersContent');
    container.innerHTML = '<p class="loading">読み込み中...</p>';

    try {
        const response = await fetch('/api/orders?order_type=自動');
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(order => {
                const statusBadge = order.status === '発注済' ? 'badge-green' :
                                    order.status === '完了' ? 'badge-gray' : 'badge-blue';

                return `
                    <div class="order-card" data-order-id="${order.id}">
                        <div style="margin-bottom: 8px;"><strong>品名:</strong> ${order.name}</div>
                        <div style="margin-bottom: 8px;"><strong>コード:</strong> ${order.code}</div>
                        <div style="margin-bottom: 8px;"><strong>数量:</strong> ${order.quantity} ${order.unit}</div>
                        <div style="margin-bottom: 8px;"><strong>依頼日:</strong> ${new Date(order.requested_date).toLocaleDateString('ja-JP')}</div>
                        <div style="margin-bottom: 8px;"><strong>購入先:</strong> ${order.supplier_name || '未設定'}</div>
                        <div style="margin-bottom: 8px;"><strong>備考:</strong> ${order.note || '-'}</div>
                        <div style="margin-bottom: 12px;">
                            <span class="badge ${statusBadge}">${order.status}</span>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            ${order.status === '依頼中' ? `
                                <button onclick="updateOrderStatus(${order.id}, '発注済')"
                                    style="padding: 6px 12px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    発注済にする
                                </button>
                            ` : ''}
                            ${order.status === '発注済' ? `
                                <button onclick="updateOrderStatus(${order.id}, '完了')"
                                    style="padding: 6px 12px; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    完了にする
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <p>自動依頼の注文はありません。</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('自動依頼リストの取得に失敗:', error);
        container.innerHTML = '<p class="error">データの取得に失敗しました</p>';
    }
}

// カメラを開く
async function openCamera() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } }
        });

        video.srcObject = cameraStream;
        modal.style.display = 'block';
    } catch (error) {
        console.error('カメラのアクセスに失敗:', error);
        alert('カメラへのアクセスができませんでした。ブラウザの設定を確認してください。');
    }
}

// カメラを閉じる
function closeCamera() {
    const modal = document.getElementById('cameraModal');

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    modal.style.display = 'none';
}

// 写真を撮影してQRコードを読み取る
async function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg');
    await decodeQRCode(imageData);
}

// QRコードを解析
async function decodeQRCode(imageData) {
    try {
        const response = await fetch('/api/decode-qr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: imageData }),
        });

        const data = await response.json();

        if (data.success) {
            // QRコードが読み取れた
            if (currentQrTarget) {
                document.getElementById(currentQrTarget).value = data.data;

                // ページに応じて商品情報を読み込み
                if (currentQrTarget === 'outboundQrCode') {
                    await loadItemInfo('outbound');
                } else if (currentQrTarget === 'inboundQrCode') {
                    await loadItemInfo('inbound');
                } else if (currentQrTarget === 'orderQrCode') {
                    await loadItemInfo('order');
                } else if (currentQrTarget === 'qrCodeInput') {
                    await loadInventory();
                }
            }

            closeCamera();
            showSuccess(`QRコードを読み取りました: ${data.data}`);
        } else {
            showError('QRコードを認識できませんでした。もう一度お試しください。');
        }
    } catch (error) {
        console.error('QRコードの解析に失敗:', error);
        showError('QRコードの解析に失敗しました');
    }
}

// 成功メッセージを表示
function showSuccess(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4caf50;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 2000;
        animation: slideIn 0.3s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// エラーメッセージを表示
function showError(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 2000;
        animation: slideIn 0.3s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}


const CSV_TEMPLATE_SAMPLE = [
    '\uFEFFコード,注文コード,品名,カテゴリ,単位,在庫数,安全在庫,単価,発注単位,仕入先,保管場所,備考,注文状態,欠品状態',
    'TIP-12-EG-1,S01,EGチップ Sサイズ,実験器具,箱,10,5,1200,1,LabMart,倉庫A,テスト用データ,未発注,在庫あり',
    'NOZUR-20-DB-1,S01,ノズル 20mm,製造部品,本,4,8,850,1,FactoryDirect,ライン1,安全在庫割れサンプル,再検討,要注意',
].join('\n');

function triggerFileDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function downloadCsvTemplate() {
    const filename = 'consumables_template.csv';
    try {
        const response = await fetch('/download/consumables-template');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        triggerFileDownload(blob, filename);
        showSuccess('CSVテンプレートをダウンロードしました');
    } catch (error) {
        console.warn('テンプレート取得に失敗したためローカル生成に切り替えます。', error);
        const blob = new Blob([CSV_TEMPLATE_SAMPLE], { type: 'text/csv;charset=utf-8;' });
        triggerFileDownload(blob, filename);
        showSuccess('サーバーに接続できなかったため、ローカルでサンプルを生成しました');
    }
}


// ========================================
// 新規登録ページ
// ========================================

// 購入先一覧を読み込む
async function loadSuppliers() {
    try {
        const response = await fetch('/api/suppliers');
        const result = await response.json();

        if (result.success) {
            // 新規登録フォームの購入先ドロップダウンを更新
            const registerSelect = document.getElementById('registerSupplier');
            if (registerSelect) {
                registerSelect.innerHTML = '<option value="">-- 購入先を選択 --</option>';
                result.data.forEach(supplier => {
                    const option = document.createElement('option');
                    option.value = supplier.id;
                    option.textContent = supplier.name;
                    registerSelect.appendChild(option);
                });
            }

            // 個別編集フォームの購入先ドロップダウンを更新
            const editSelect = document.getElementById('editSupplier');
            if (editSelect) {
                const currentValue = editSelect.value; // 現在の選択値を保存
                editSelect.innerHTML = '<option value="">-- 購入先を選択 --</option>';
                result.data.forEach(supplier => {
                    const option = document.createElement('option');
                    option.value = supplier.id;
                    option.textContent = supplier.name;
                    editSelect.appendChild(option);
                });
                // 以前の選択値を復元
                if (currentValue) {
                    editSelect.value = currentValue;
                }
            }
        }
    } catch (error) {
        console.error('購入先の読み込みに失敗しました:', error);
    }
}

// 新規登録フォームを送信
async function submitRegisterForm() {
    const code = document.getElementById('registerCode').value.trim();
    const name = document.getElementById('registerName').value.trim();

    // 必須チェック
    if (!code || !name) {
        showError('コードと品名は必須です');
        return;
    }

    // 画像ファイルの取得
    const imageInput = document.getElementById('registerImage');
    const imageFile = imageInput?.files[0];

    // FormDataを使用して画像を含めて送信
    const formData = new FormData();
    formData.append('code', code);
    formData.append('order_code', document.getElementById('registerOrderCode').value.trim());
    formData.append('name', name);
    formData.append('category', document.getElementById('registerCategory').value.trim());
    formData.append('unit', document.getElementById('registerUnit').value.trim() || '個');
    formData.append('stock_quantity', parseInt(document.getElementById('registerStockQty').value) || 0);
    formData.append('safety_stock', parseInt(document.getElementById('registerSafetyStock').value) || 0);
    formData.append('unit_price', parseFloat(document.getElementById('registerUnitPrice').value) || 0);
    formData.append('order_unit', parseInt(document.getElementById('registerOrderUnit').value) || 1);

    const supplierId = document.getElementById('registerSupplier').value;
    if (supplierId) {
        formData.append('supplier_id', parseInt(supplierId));
    }

    formData.append('storage_location', document.getElementById('registerStorageLocation').value.trim());
    formData.append('note', document.getElementById('registerNote').value.trim());

    // 画像ファイルがあれば追加
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const response = await fetch('/api/consumables', {
            method: 'POST',
            body: formData // FormDataを送信（Content-Typeヘッダーは自動設定される）
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('消耗品を登録しました');
            // フォームをクリア
            document.getElementById('registerCode').value = '';
            document.getElementById('registerOrderCode').value = '';
            document.getElementById('registerName').value = '';
            document.getElementById('registerCategory').value = '';
            document.getElementById('registerUnit').value = '個';
            document.getElementById('registerStockQty').value = '0';
            document.getElementById('registerSafetyStock').value = '0';
            document.getElementById('registerUnitPrice').value = '0';
            document.getElementById('registerOrderUnit').value = '1';
            document.getElementById('registerSupplier').value = '';
            document.getElementById('registerStorageLocation').value = '';
            document.getElementById('registerNote').value = '';
            // 画像をクリア
            if (imageInput) {
                imageInput.value = '';
            }
            const imagePreviewBox = document.getElementById('registerImagePreviewBox');
            if (imagePreviewBox) {
                imagePreviewBox.hidden = true;
            }
            // 在庫一覧に戻る
            setTimeout(() => {
                switchPage('inventory');
            }, 1500);
        } else {
            showError(result.error || '登録に失敗しました');
        }
    } catch (error) {
        console.error('登録エラー:', error);
        showError('登録に失敗しました');
    }
}

// 新規登録ページの初期化

async function importConsumablesCsv() {
    const fileInput = document.getElementById('csvFileInput');
    if (!fileInput || fileInput.files.length === 0) {
        showError('CSVファイルを選択してください');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const importButton = document.getElementById('csvImportBtn');
    if (importButton) {
        importButton.disabled = true;
        importButton.textContent = '取り込み中...';
    }

    try {
        const response = await fetch('/api/consumables/import-csv', {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();

        if (result.success) {
            const summary = result.summary || {};
            const inserted = summary.inserted || 0;
            const skipped = summary.skipped ? summary.skipped.length : 0;
            const errors = summary.errors ? summary.errors.length : 0;

            showSuccess(`CSVを取り込みました（登録${inserted}件 / 既存${skipped}件 / エラー${errors}件）`);
            if (errors > 0 && summary.errors) {
                console.group('CSV import errors');
                console.table(summary.errors);
                console.groupEnd();
            }

            fileInput.value = '';
            loadInventory();
        } else {
            showError(result.error || 'CSVの取り込みに失敗しました');
        }
    } catch (error) {
        console.error('CSV import failed:', error);
        showError('CSVの取り込みに失敗しました');
    } finally {
        if (importButton) {
            importButton.disabled = false;
            importButton.textContent = 'CSVを取り込む';
        }
    }
}


function initRegisterPage() {
    if (!registerPageEventsBound) {
        setupRegisterSubtabs();

        const registerSubmitBtn = document.getElementById('registerSubmitBtn');
        if (registerSubmitBtn) {
            registerSubmitBtn.addEventListener('click', submitRegisterForm);
        }

        const csvImportBtn = document.getElementById('csvImportBtn');
        if (csvImportBtn) {
            csvImportBtn.addEventListener('click', (event) => {
                event.preventDefault();
                importConsumablesCsv();
            });
        }

        const csvTemplateDownloadBtn = document.getElementById('csvTemplateDownloadBtn');
        if (csvTemplateDownloadBtn) {
            csvTemplateDownloadBtn.addEventListener('click', (event) => {
                event.preventDefault();
                downloadCsvTemplate();
            });
        }

        const editLoadBtn = document.getElementById('editLoadBtn');
        if (editLoadBtn) {
            editLoadBtn.addEventListener('click', (event) => {
                event.preventDefault();
                editGalleryLoaded = false;
                loadEditGallery();
            });
        }

        const editSearchInput = document.getElementById('editSearchCode');
        if (editSearchInput) {
            editSearchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    editGalleryLoaded = false;
                    loadEditGallery();
                }
            });
        }

        const editSubmitBtn = document.getElementById('editSubmitBtn');
        if (editSubmitBtn) {
            editSubmitBtn.addEventListener('click', submitEditForm);
        }

        // 画像アップロード機能のイベントリスナー
        setupImageUpload('register');
        setupImageUpload('edit');

        registerPageEventsBound = true;
    }

    loadSuppliers();

    if (currentRegisterSubtab === 'edit') {
        ensureEditGalleryLoaded();
    }
}

function setupRegisterSubtabs() {
    const container = document.getElementById('registerSubtabs');
    if (!container) return;
    container.querySelectorAll('.subtab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            switchRegisterSubtab(btn.dataset.detailTab);
        });
    });
    switchRegisterSubtab(currentRegisterSubtab);
}

function switchRegisterSubtab(target) {
    if (!target) return;
    currentRegisterSubtab = target;

    document.querySelectorAll('#registerSubtabs .subtab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.detailTab === target);
    });

    document.querySelectorAll('[data-detail-tab-content]').forEach((section) => {
        const isTarget = section.dataset.detailTabContent === target;
        section.hidden = !isTarget;
    });

    if (target === 'edit') {
        ensureEditGalleryLoaded();
    }
}

function ensureEditGalleryLoaded(force = false) {
    if (force) {
        editGalleryLoaded = false;
    }
    if (editGalleryLoaded) {
        return;
    }
    loadEditGallery();
}

async function loadEditGallery() {
    const container = document.getElementById('editGalleryContainer');
    if (!container) return;

    container.innerHTML = '<p class="loading">消耗品ギャラリーを読み込み中...</p>';

    try {
        const params = new URLSearchParams();
        const searchValue = document.getElementById('editSearchCode')?.value.trim();
        if (searchValue) {
            params.append('search_text', searchValue);
        }
        const query = params.toString();
        const response = await fetch(`/api/inventory${query ? `?${query}` : ''}`);
        const data = await response.json();

        if (data.success) {
            editGalleryCache = data.data || [];
            editGalleryLoaded = true;
            renderEditGallery(editGalleryCache);
        } else {
            container.innerHTML = `<p class="error">${data.error || 'ギャラリーの読み込みに失敗しました'}</p>`;
        }
    } catch (error) {
        console.error('edit gallery load error:', error);
        container.innerHTML = '<p class="error">ギャラリーの読み込みに失敗しました</p>';
    }
}

function renderEditGallery(items) {
    const container = document.getElementById('editGalleryContainer');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>対象の消耗品が見つかりません。</p>
                <p>検索条件を変更して再度お試しください。</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map((item, index) => {
        const code = pickField(item, ['コード', 'code']);
        const name = pickField(item, ['品名', 'name']);
        const category = pickField(item, ['カテゴリ', 'category']);
        const unit = pickField(item, ['単位', 'unit']) || '';
        const stock = parseInt(pickField(item, ['在庫数', 'stock_quantity']), 10) || 0;
        const safety = parseInt(pickField(item, ['安全在庫', 'safety_stock']), 10) || 0;
        const supplier = pickField(item, ['購入先', 'supplier_name']) || '-';
        const shortageStatus = pickField(item, ['欠品状態', 'shortage_status']) || '不明';
        const orderStatus = pickField(item, ['注文状態', 'order_status']) || '不明';
        const imagePath = pickField(item, ['画像URL', 'image_path']);
        const imageUrl = buildImageUrl(imagePath);
        const shortageClass = getStatusClass(shortageStatus, 'shortage');
        const orderClass = getStatusClass(orderStatus, 'order');

        return `
            <div class="inventory-card compact">
                <div class="card-main compact">
                    <div class="card-image-wrapper">
                        <img src="${imageUrl}" alt="${name || code || 'item'}" class="card-image-large" loading="lazy">
                    </div>
                    <div class="card-info">
                        <div class="card-title-row">
                            <div class="item-name">${name || '-'}</div>
                            <div class="item-code">コード: ${code || '-'}</div>
                        </div>
                        <div class="card-meta-row">
                            <span>カテゴリ: ${category || '-'}</span>
                            <span>購入先: ${supplier}</span>
                        </div>
                        <div class="card-meta-row">
                            <span>在庫: ${stock} ${unit}</span>
                            <span>安全在庫: ${safety} ${unit}</span>
                        </div>
                        <div class="status-row">
                            <span class="status-pill ${shortageClass}">欠品: ${shortageStatus}</span>
                            <span class="status-pill ${orderClass}">注文: ${orderStatus}</span>
                        </div>
                        <button class="btn btn-primary edit-gallery-select" type="button" onclick="handleEditCardSelect(${index})">
                            このアイテムを編集
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function handleEditCardSelect(index) {
    const item = editGalleryCache[index];
    if (!item) return;
    updateEditPreview(item);
    await loadEditDetail(item);
}

function toSafeInt(value) {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function calculateShortageStatusLabel(stock, safety) {
    const stockVal = Number.isFinite(stock) ? stock : 0;
    const safetyVal = Number.isFinite(safety) ? safety : 0;
    if (stockVal <= 0) return '欠品';
    if (stockVal <= safetyVal) return '要注意';
    return '在庫あり';
}

function ensureShortageOption(select, value) {
    if (!select || !value) return;
    const exists = Array.from(select.options).some(opt => opt.value === value);
    if (!exists) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    }
}

function setEditShortageStatusValue(value) {
    const select = document.getElementById('editShortageStatus');
    if (!select) return;
    if (value) {
        ensureShortageOption(select, value);
        select.value = value;
    } else {
        select.value = '';
    }
}

function autoUpdateEditShortageStatus() {
    const stockInput = document.getElementById('editStockQty');
    const safetyInput = document.getElementById('editSafetyStock');
    if (!stockInput || !safetyInput) {
        return;
    }
    const status = calculateShortageStatusLabel(
        toSafeInt(stockInput.value),
        toSafeInt(safetyInput.value)
    );
    setEditShortageStatusValue(status);
}

function updateEditPreview(item) {
    const preview = document.getElementById('editItemPreview');
    if (!preview) return;

    const code = pickField(item, ['コード', 'code']);
    const name = pickField(item, ['品名', 'name']);
    const stock = pickField(item, ['在庫数', 'stock_quantity']);
    const safety = pickField(item, ['安全在庫', 'safety_stock']);
    const supplier = pickField(item, ['購入先', 'supplier_name']);

    preview.innerHTML = `
        <div><strong>品名:</strong> ${name || '-'}</div>
        <div><strong>コード:</strong> ${code || '-'}</div>
        <div><strong>在庫:</strong> ${stock || '-'} / 安全在庫 ${safety || '-'}</div>
        <div><strong>購入先:</strong> ${supplier || '-'}</div>
    `;
    preview.hidden = false;
}

function getItemId(item) {
    return item?.id ?? item?.ID ?? item?.Id ?? null;
}

async function loadEditDetail(summary) {
    const consumableId = getItemId(summary);
    if (!consumableId) {
        showError('選択したアイテムのIDを取得できませんでした');
        return;
    }

    try {
        const response = await fetch(`/api/consumables/${consumableId}`);
        const data = await response.json();
        if (data.success) {
            populateEditForm(data.data);
        } else {
            showError(data.error || '詳細情報の取得に失敗しました');
        }
    } catch (error) {
        console.error('loadEditDetail error:', error);
        showError('詳細情報の取得に失敗しました');
    }
}

function populateEditForm(detail) {
    if (!detail) return;
    currentEditItemId = detail.id;

    const fields = document.getElementById('editFormFields');
    if (!fields) return;

    const setValue = (id, value = '') => {
        const el = document.getElementById(id);
        if (el) {
            el.value = value ?? '';
        }
    };

    setValue('editCode', detail.code);
    setValue('editOrderCode', detail.order_code);
    setValue('editName', detail.name);
    setValue('editCategory', detail.category);
    setValue('editUnit', detail.unit);
    setValue('editStockQty', detail.stock_quantity);
    setValue('editSafetyStock', detail.safety_stock);
    setValue('editUnitPrice', detail.unit_price);
    setValue('editOrderUnit', detail.order_unit);
    setValue('editStorageLocation', detail.storage_location);
    setValue('editNote', detail.note);
    setEditShortageStatusValue(detail.shortage_status);

    const supplierSelect = document.getElementById('editSupplier');
    if (supplierSelect) {
        supplierSelect.value = detail.supplier_id || '';
    }

    // 既存の画像を表示
    const imagePath = detail.image_path;
    if (imagePath) {
        setImagePreview('edit', imagePath);
        const hiddenPath = document.getElementById('editImagePath');
        if (hiddenPath) {
            hiddenPath.value = imagePath;
        }
    } else {
        // 画像がない場合はプレビューを非表示
        const imagePreviewBox = document.getElementById('editImagePreviewBox');
        if (imagePreviewBox) {
            imagePreviewBox.hidden = true;
        }
        // 入力フィールドもクリア
        const imageInput = document.getElementById('editImage');
        if (imageInput) {
            imageInput.value = '';
        }
    }

    fields.hidden = false;
}

async function submitEditForm() {
    if (!currentEditItemId) {
        showError('編集するアイテムを選択してください');
        return;
    }

    // 画像ファイルの取得
    const imageInput = document.getElementById('editImage');
    const imageFile = imageInput?.files[0];

    // FormDataを使用して画像を含めて送信
    const formData = new FormData();
    formData.append('order_code', document.getElementById('editOrderCode').value.trim());
    formData.append('name', document.getElementById('editName').value.trim());
    formData.append('category', document.getElementById('editCategory').value.trim());
    formData.append('unit', document.getElementById('editUnit').value.trim());
    formData.append('stock_quantity', parseInt(document.getElementById('editStockQty').value, 10) || 0);
    formData.append('safety_stock', parseInt(document.getElementById('editSafetyStock').value, 10) || 0);
    formData.append('unit_price', parseFloat(document.getElementById('editUnitPrice').value) || 0);
    formData.append('order_unit', parseInt(document.getElementById('editOrderUnit').value, 10) || 1);

    const supplierId = document.getElementById('editSupplier').value;
    if (supplierId) {
        formData.append('supplier_id', parseInt(supplierId, 10));
    }

    formData.append('storage_location', document.getElementById('editStorageLocation').value.trim());
    formData.append('note', document.getElementById('editNote').value.trim());
    const shortageStatusSelect = document.getElementById('editShortageStatus');
    if (shortageStatusSelect && shortageStatusSelect.value) {
        formData.append('shortage_status', shortageStatusSelect.value.trim());
    }

    // 画像ファイルがあれば追加
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const response = await fetch(`/api/consumables/${currentEditItemId}`, {
            method: 'PUT',
            body: formData // FormDataを送信
        });

        const result = await response.json();
        if (result.success) {
            showSuccess('内容を更新しました');
            editGalleryLoaded = false;
            await loadEditGallery();
            await loadInventory();
        } else {
            showError(result.error || '更新に失敗しました');
        }
    } catch (error) {
        console.error('submitEditForm error:', error);
        showError('更新に失敗しました');
    }
}


// ========================================
// 発注管理機能
// ========================================

// 注文状態を更新
async function updateOrderStatus(orderId, newStatus) {
    if (!confirm(`この注文を「${newStatus}」に変更しますか？`)) {
        return;
    }

    try {
        const response = await fetch(`/api/orders/${orderId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                status: newStatus
            }),
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(`注文状態を「${newStatus}」に更新しました`);

            // リストを再読み込み
            if (currentPage === 'order-list') {
                const manualVisible = document.getElementById('manualOrdersList').style.display !== 'none';
                if (manualVisible) {
                    await loadManualOrders();
                } else {
                    await loadAutoOrders();
                }
            }
        } else {
            showError(data.error || '状態の更新に失敗しました');
        }
    } catch (error) {
        console.error('状態更新エラー:', error);
        showError('状態の更新に失敗しました');
    }
}

// 安全在庫割れアイテムをチェック
async function checkLowStock() {
    try {
        const response = await fetch('/api/check-low-stock');
        const data = await response.json();

        if (data.success) {
            return data.data;
        } else {
            showError(data.error || '安全在庫チェックに失敗しました');
            return [];
        }
    } catch (error) {
        console.error('安全在庫チェックエラー:', error);
        showError('安全在庫チェックに失敗しました');
        return [];
    }
}

// 自動発注を実行
async function executeAutoOrders(requester = 'システム自動') {
    if (!confirm('安全在庫を下回る商品に対して自動で注文依頼を作成しますか？')) {
        return;
    }

    try {
        const response = await fetch('/api/auto-create-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                requester: requester
            }),
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(data.message || '自動発注依頼を作成しました');

            // 発注状態リストを再読み込み
            if (currentPage === 'order-list') {
                await loadAutoOrders();
            }
        } else {
            showError(data.error || '自動発注に失敗しました');
        }
    } catch (error) {
        console.error('自動発注エラー:', error);
        showError('自動発注に失敗しました');
    }
}

// ========================================
// 発注（PDF生成・メール送信）機能
// ========================================

let selectedOrderIds = [];

// 依頼中の注文を読み込み
async function loadDispatchOrders() {
    const container = document.getElementById('dispatchOrdersList');
    container.innerHTML = '<p class="loading">読み込み中...</p>';

    // フィルター条件を取得
    const qrCode = document.getElementById('dispatchQrCode')?.value.trim() || '';
    const searchText = document.getElementById('dispatchSearchText')?.value.trim() || '';
    const supplierId = document.getElementById('dispatchSupplier')?.value || '';
    const orderStatus = document.getElementById('dispatchOrderStatus')?.value || '';

    try {
        // クエリパラメータを構築
        const params = new URLSearchParams();
        if (orderStatus) {
            params.append('status', orderStatus);
        }
        if (qrCode) {
            // QRコードでコード検索
            const inventoryResponse = await fetch(`/api/inventory?qr_code=${qrCode}`);
            const inventoryData = await inventoryResponse.json();
            if (inventoryData.success && inventoryData.data.length > 0) {
                const code = inventoryData.data[0]['コード'];
                // コードで注文を検索する必要がある - 名前で検索
                params.append('search_text', code);
            }
        }
        if (searchText) params.append('search_text', searchText);
        if (supplierId) params.append('supplier_id', supplierId);

        const response = await fetch(`/api/orders?${params}`);
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(order => `
                <div class="order-card" style="padding: 12px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <label style="display: flex; align-items: flex-start; cursor: pointer;">
                        <input type="checkbox" class="order-checkbox" data-order-id="${order.id}"
                               data-amount="${order.total_amount}" style="margin-right: 12px; margin-top: 4px;"
                               onchange="updateSelectedOrders()">
                        <div style="flex: 1;">
                            <div style="margin-bottom: 4px;"><strong>${order.name}</strong> (${order.code})</div>
                            <div style="font-size: 13px; color: #666;">
                                数量: ${order.quantity} ${order.unit} |
                                金額: ¥${parseInt(order.total_amount).toLocaleString()} |
                                依頼者: ${order.requester_name}
                            </div>
                            <div style="font-size: 13px; color: #666;">
                                購入先: ${order.supplier_name || '未設定'} |
                                納期: ${order.deadline}
                            </div>
                        </div>
                    </label>
                </div>
            `).join('');

            updateSelectedOrders();
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <p>条件に合う注文がありません。</p>
                    <p>${qrCode || searchText ? 'フィルター条件を変更してください。' : '先に「注文依頼」から発注依頼を作成してください。'}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('注文読み込みエラー:', error);
        container.innerHTML = '<p class="error">データの取得に失敗しました</p>';
    }
}

// 発注ページ初期化時に購入先リストを読み込み
async function initDispatchPage() {
    try {
        const response = await fetch('/api/suppliers');
        const result = await response.json();

        if (result.success) {
            const select = document.getElementById('dispatchSupplier');
            if (select) {
                select.innerHTML = '<option value="">すべて</option>';
                result.data.forEach(supplier => {
                    const option = document.createElement('option');
                    option.value = supplier.id;
                    option.textContent = supplier.name;
                    select.appendChild(option);
                });
            }
        }

        // QRスキャンボタンのイベントリスナー
        const scanBtn = document.getElementById('dispatchScanBtn');
        if (scanBtn) {
            scanBtn.addEventListener('click', () => {
                currentQrTarget = 'dispatchQrCode';
                openCamera();
            });
        }
    } catch (error) {
        console.error('購入先の読み込みに失敗:', error);
    }
}

// 選択状態を更新
function updateSelectedOrders() {
    const checkboxes = document.querySelectorAll('.order-checkbox');
    selectedOrderIds = [];
    let totalAmount = 0;

    checkboxes.forEach(cb => {
        if (cb.checked) {
            selectedOrderIds.push(parseInt(cb.dataset.orderId));
            totalAmount += parseFloat(cb.dataset.amount || 0);
        }
    });

    const summary = document.getElementById('selectedOrdersSummary');
    if (selectedOrderIds.length > 0) {
        summary.style.display = 'block';
        document.getElementById('selectedCount').textContent = selectedOrderIds.length;
        document.getElementById('selectedTotal').textContent = parseInt(totalAmount).toLocaleString();
    } else {
        summary.style.display = 'none';
    }
}

// すべて選択
function selectAllOrders() {
    document.querySelectorAll('.order-checkbox').forEach(cb => {
        cb.checked = true;
    });
    updateSelectedOrders();
}

// すべて解除
function clearAllOrders() {
    document.querySelectorAll('.order-checkbox').forEach(cb => {
        cb.checked = false;
    });
    updateSelectedOrders();
}

// PDFのみ生成
async function generatePDFOnly() {
    if (selectedOrderIds.length === 0) {
        showError('注文を選択してください');
        return;
    }

    const orderNumber = document.getElementById('dispatchOrderNumber').value.trim();
    const notes = document.getElementById('dispatchNotes').value.trim();

    try {
        const params = new URLSearchParams({
            order_ids: selectedOrderIds.join(','),
            ...(orderNumber && { order_number: orderNumber }),
            ...(notes && { notes: notes })
        });

        const response = await fetch(`/api/generate-order-pdf?${params}`);

        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `order_${orderNumber || new Date().getTime()}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showSuccess('PDFをダウンロードしました');
        } else {
            const errorData = await response.json();
            showError(errorData.error || 'PDF生成に失敗しました');
        }
    } catch (error) {
        console.error('PDF生成エラー:', error);
        showError('PDF生成に失敗しました');
    }
}

// 注文書を作成してメール送信
async function dispatchOrdersWithEmail() {
    if (selectedOrderIds.length === 0) {
        showError('注文を選択してください');
        return;
    }

    const emailTo = document.getElementById('dispatchEmailTo').value.trim();
    const emailSubject = document.getElementById('dispatchEmailSubject').value.trim();
    const emailBody = document.getElementById('dispatchEmailBody').value.trim();

    if (!emailTo) {
        showError('宛先を入力してください');
        return;
    }

    if (!emailSubject) {
        showError('件名を入力してください');
        return;
    }

    if (!emailBody) {
        showError('本文を入力してください');
        return;
    }

    if (!confirm(`${selectedOrderIds.length}件の注文書を作成し、メール送信しますか？`)) {
        return;
    }

    const orderNumber = document.getElementById('dispatchOrderNumber').value.trim();
    const notes = document.getElementById('dispatchNotes').value.trim();
    const emailCc = document.getElementById('dispatchEmailCc').value.trim();
    const emailBcc = document.getElementById('dispatchEmailBcc').value.trim();
    const savePdf = document.getElementById('dispatchSavePdf').checked;

    try {
        const response = await fetch('/api/orders/dispatch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                order_ids: selectedOrderIds,
                order_number: orderNumber || null,
                notes: notes,
                save_pdf: savePdf,
                email: {
                    to: emailTo,
                    cc: emailCc || null,
                    bcc: emailBcc || null,
                    subject: emailSubject,
                    body: emailBody,
                    is_html: true
                }
            }),
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('注文書を送信しました');

            // 結果を表示
            const resultContent = document.getElementById('dispatchResultContent');
            resultContent.innerHTML = `
                <div style="padding: 16px; background: #e8f5e9; border-radius: 8px;">
                    <p><strong>注文書番号:</strong> ${data.order_number}</p>
                    <p><strong>購入先:</strong> ${data.supplier_name}</p>
                    <p><strong>合計金額:</strong> ¥${parseInt(data.total_amount).toLocaleString()}</p>
                    <p><strong>更新した注文:</strong> ${data.updated_orders}件</p>
                    <p><strong>PDF:</strong> ${data.pdf_filename}</p>
                    <p><strong>メール送信:</strong> ${data.email_sent ? '✅ 成功' : '❌ 失敗'}</p>
                </div>
            `;
            document.getElementById('dispatchResult').style.display = 'block';

            // フォームをクリア
            clearAllOrders();
            document.getElementById('dispatchOrderNumber').value = '';
            document.getElementById('dispatchNotes').value = '';
            document.getElementById('dispatchEmailTo').value = '';
            document.getElementById('dispatchEmailCc').value = '';
            document.getElementById('dispatchEmailBcc').value = '';
            document.getElementById('dispatchEmailSubject').value = '';
            document.getElementById('dispatchEmailBody').value = '';

            // 注文リストを再読み込み
            await loadDispatchOrders();
        } else {
            showError(data.error || '発注に失敗しました');
        }
    } catch (error) {
        console.error('発注エラー:', error);
        showError('発注に失敗しました');
    }
}

// ========================================
// 画像アップロード機能
// ========================================

function setupImageUpload(prefix) {
    const imageInput = document.getElementById(`${prefix}Image`);
    const imagePreviewBox = document.getElementById(`${prefix}ImagePreviewBox`);
    const imageClearBtn = document.getElementById(`${prefix}ImageClearBtn`);

    if (!imageInput || !imagePreviewBox) return;

    // 画像選択時のプレビュー
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // ファイルサイズチェック (5MB)
            if (file.size > 5 * 1024 * 1024) {
                showError('画像ファイルは5MB以下にしてください');
                imageInput.value = '';
                return;
            }

            // プレビュー表示
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = imagePreviewBox.querySelector('img');
                if (img) {
                    img.src = event.target.result;
                    imagePreviewBox.hidden = false;
                }
            };
            reader.readAsDataURL(file);
        }
    });

    // 画像クリアボタン
    if (imageClearBtn) {
        imageClearBtn.addEventListener('click', () => {
            imageInput.value = '';
            imagePreviewBox.hidden = true;
            const img = imagePreviewBox.querySelector('img');
            if (img) {
                img.src = '';
            }
            const hiddenPath = document.getElementById(`${prefix}ImagePath`);
            if (hiddenPath) {
                hiddenPath.value = '';
            }
        });
    }
}

function setImagePreview(prefix, imageUrl) {
    const imagePreviewBox = document.getElementById(`${prefix}ImagePreviewBox`);
    const img = imagePreviewBox?.querySelector('img');

    if (imageUrl && img) {
        img.src = buildImageUrl(imageUrl);
        imagePreviewBox.hidden = false;
    } else if (imagePreviewBox) {
        imagePreviewBox.hidden = true;
    }
}

function buildImageUrl(imagePath) {
    if (!imagePath) {
        return 'https://placehold.co/200x150?text=No+Image';
    }

    const pathStr = String(imagePath).trim();
    if (!pathStr) {
        return 'https://placehold.co/200x150?text=No+Image';
    }

    // すでに完全なURLの場合はそのまま返す
    if (pathStr.startsWith('http://') || pathStr.startsWith('https://')) {
        return pathStr;
    }

    // /uploads/で始まる場合はそのまま返す
    if (pathStr.startsWith('/uploads/')) {
        return pathStr;
    }

    // uploads/で始まる場合は先頭に/を追加
    if (pathStr.startsWith('uploads/')) {
        return '/' + pathStr;
    }

    // それ以外の場合は /uploads/ を追加
    return '/uploads/' + pathStr;
}

// ========================================
// 購入先管理機能
// ========================================

let currentSuppliersSubtab = 'list';
let suppliersPageEventsBound = false;

function initSuppliersPage() {
    if (!suppliersPageEventsBound) {
        setupSuppliersSubtabs();

        const submitBtn = document.getElementById('supplierSubmitBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', submitSupplierForm);
        }

        const updateBtn = document.getElementById('supplierUpdateBtn');
        if (updateBtn) {
            updateBtn.addEventListener('click', updateSupplier);
        }

        const cancelBtn = document.getElementById('supplierCancelEditBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', cancelEditSupplier);
        }

        suppliersPageEventsBound = true;
    }

    if (currentSuppliersSubtab === 'list') {
        loadSuppliersList();
    }
}

function setupSuppliersSubtabs() {
    const container = document.getElementById('suppliersSubtabs');
    if (!container) return;

    container.querySelectorAll('.subtab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            switchSuppliersSubtab(btn.dataset.detailTab);
        });
    });
    switchSuppliersSubtab(currentSuppliersSubtab);
}

function switchSuppliersSubtab(target) {
    if (!target) return;
    currentSuppliersSubtab = target;

    document.querySelectorAll('#suppliersSubtabs .subtab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.detailTab === target);
    });

    document.querySelectorAll('#suppliersPage [data-detail-tab-content]').forEach((section) => {
        const isTarget = section.dataset.detailTabContent === target;
        section.hidden = !isTarget;
    });

    if (target === 'list') {
        loadSuppliersList();
    }
}

async function loadSuppliersList() {
    const container = document.getElementById('suppliersList');
    if (!container) return;

    container.innerHTML = '<p class="loading">読み込み中...</p>';

    try {
        const response = await fetch('/api/suppliers');
        const data = await response.json();

        if (data.success) {
            renderSuppliersList(data.data || []);
        } else {
            container.innerHTML = `<p class="error">${data.error || '読み込みに失敗しました'}</p>`;
        }
    } catch (error) {
        console.error('suppliers load error:', error);
        container.innerHTML = '<p class="error">読み込みに失敗しました</p>';
    }
}

function renderSuppliersList(suppliers) {
    const container = document.getElementById('suppliersList');
    if (!container) return;

    if (!suppliers || suppliers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>購入先が登録されていません。</p>
                <p>「新規追加」タブから購入先を登録してください。</p>
            </div>
        `;
        return;
    }

    container.innerHTML = suppliers.map((supplier) => {
        const id = supplier.id;
        const name = supplier.name || '-';
        const contact = supplier.contact_person || '-';
        const email = supplier.email || '-';
        const address = supplier.address || '-';
        const note = supplier.note || '-';

        return `
            <div class="supplier-card" style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: #fff;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <h4 style="margin: 0; font-size: 18px; color: #333;">${name}</h4>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" onclick="editSupplier(${id})" style="padding: 6px 12px; font-size: 14px;">✏️ 編集</button>
                        <button class="btn btn-outline" onclick="deleteSupplier(${id}, '${name}')" style="padding: 6px 12px; font-size: 14px; color: #d32f2f; border-color: #d32f2f;">🗑️ 削除</button>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 14px; color: #666;">
                    <strong>連絡先:</strong><span>${contact}</span>
                    <strong>メール:</strong><span>${email}</span>
                    <strong>住所:</strong><span>${address}</span>
                    ${note !== '-' ? `<strong>備考:</strong><span>${note}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function submitSupplierForm() {
    const name = document.getElementById('supplierName').value.trim();

    if (!name) {
        showError('購入先名は必須です');
        return;
    }

    const data = {
        name: name,
        contact_person: document.getElementById('supplierContact').value.trim(),
        email: document.getElementById('supplierEmail').value.trim(),
        address: document.getElementById('supplierAddress').value.trim(),
        note: document.getElementById('supplierNote').value.trim()
    };

    try {
        const response = await fetch('/api/suppliers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('購入先を登録しました');
            // フォームをクリア
            document.getElementById('supplierName').value = '';
            document.getElementById('supplierContact').value = '';
            document.getElementById('supplierEmail').value = '';
            document.getElementById('supplierAddress').value = '';
            document.getElementById('supplierNote').value = '';
            // 一覧タブに切り替え
            switchSuppliersSubtab('list');
        } else {
            showError(result.error || '登録に失敗しました');
        }
    } catch (error) {
        console.error('supplier register error:', error);
        showError('登録に失敗しました');
    }
}

async function editSupplier(id) {
    try {
        // 購入先データを取得
        const response = await fetch(`/api/suppliers/${id}`);
        const result = await response.json();

        if (!result.success) {
            showError(result.error || '購入先データの取得に失敗しました');
            return;
        }

        const supplier = result.data;

        // フォームに値を設定
        document.getElementById('editSupplierId').value = supplier.id;
        document.getElementById('editSupplierName').value = supplier.name || '';
        document.getElementById('editSupplierContact').value = supplier.contact_person || '';
        document.getElementById('editSupplierEmail').value = supplier.email || '';
        document.getElementById('editSupplierAddress').value = supplier.address || '';
        document.getElementById('editSupplierNote').value = supplier.note || '';

        // 編集タブを表示して切り替え
        const editTab = document.querySelector('#suppliersSubtabs [data-detail-tab="edit"]');
        if (editTab) {
            editTab.style.display = 'inline-block';
        }
        switchSuppliersSubtab('edit');
    } catch (error) {
        console.error('supplier edit load error:', error);
        showError('購入先データの取得に失敗しました');
    }
}

async function updateSupplier() {
    const id = document.getElementById('editSupplierId').value;
    const name = document.getElementById('editSupplierName').value.trim();

    if (!name) {
        showError('購入先名は必須です');
        return;
    }

    const data = {
        name: name,
        contact_person: document.getElementById('editSupplierContact').value.trim(),
        email: document.getElementById('editSupplierEmail').value.trim(),
        address: document.getElementById('editSupplierAddress').value.trim(),
        note: document.getElementById('editSupplierNote').value.trim()
    };

    try {
        const response = await fetch(`/api/suppliers/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('購入先を更新しました');
            // 編集タブを非表示
            const editTab = document.querySelector('#suppliersSubtabs [data-detail-tab="edit"]');
            if (editTab) {
                editTab.style.display = 'none';
            }
            // 一覧タブに切り替え
            switchSuppliersSubtab('list');
        } else {
            showError(result.error || '更新に失敗しました');
        }
    } catch (error) {
        console.error('supplier update error:', error);
        showError('更新に失敗しました');
    }
}

function cancelEditSupplier() {
    // 編集タブを非表示
    const editTab = document.querySelector('#suppliersSubtabs [data-detail-tab="edit"]');
    if (editTab) {
        editTab.style.display = 'none';
    }
    // 一覧タブに切り替え
    switchSuppliersSubtab('list');
}

async function deleteSupplier(id, name) {
    if (!confirm(`購入先「${name}」を削除しますか？\n\n※ この購入先を使用している消耗品がある場合、削除できません。`)) {
        return;
    }

    try {
        const response = await fetch(`/api/suppliers/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('購入先を削除しました');
            loadSuppliersList();
        } else {
            showError(result.error || '削除に失敗しました');
        }
    } catch (error) {
        console.error('supplier delete error:', error);
        showError('削除に失敗しました');
    }
}

// ========================================
// 従業員管理ページ
// ========================================

let currentEmployeesSubtab = 'list';
let employeesPageEventsBound = false;

function initEmployeesPage() {
    if (!employeesPageEventsBound) {
        setupEmployeesSubtabs();

        const submitBtn = document.getElementById('employeeSubmitBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', submitEmployeeForm);
        }

        const updateBtn = document.getElementById('employeeUpdateBtn');
        if (updateBtn) {
            updateBtn.addEventListener('click', updateEmployee);
        }

        const cancelBtn = document.getElementById('employeeCancelEditBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', cancelEditEmployee);
        }

        // CSVインポート
        const csvImportBtn = document.getElementById('employeeCsvImportBtn');
        if (csvImportBtn) {
            csvImportBtn.addEventListener('click', importEmployeesCsv);
        }

        // CSVテンプレートダウンロード
        const csvTemplateBtn = document.getElementById('employeeCsvTemplateDownloadBtn');
        if (csvTemplateBtn) {
            csvTemplateBtn.addEventListener('click', downloadEmployeesCsvTemplate);
        }

        employeesPageEventsBound = true;
    }

    if (currentEmployeesSubtab === 'list') {
        loadEmployeesList();
    }
}

function setupEmployeesSubtabs() {
    const container = document.getElementById('employeesSubtabs');
    if (!container) return;

    container.querySelectorAll('.subtab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            switchEmployeesSubtab(btn.dataset.detailTab);
        });
    });
    switchEmployeesSubtab(currentEmployeesSubtab);
}

function switchEmployeesSubtab(target) {
    if (!target) return;
    currentEmployeesSubtab = target;

    document.querySelectorAll('#employeesSubtabs .subtab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.detailTab === target);
    });

    document.querySelectorAll('#employeesPage [data-detail-tab-content]').forEach((section) => {
        const isTarget = section.dataset.detailTabContent === target;
        section.hidden = !isTarget;
    });

    if (target === 'list') {
        loadEmployeesList();
    }
}

async function loadEmployeesList() {
    const container = document.getElementById('employeesList');
    if (!container) return;

    container.innerHTML = '<p class="loading">読み込み中...</p>';

    try {
        const response = await fetch('/api/employees');
        const data = await response.json();

        if (data.success) {
            renderEmployeesList(data.data || []);
        } else {
            container.innerHTML = `<p class="error">${data.error || '読み込みに失敗しました'}</p>`;
        }
    } catch (error) {
        console.error('employees load error:', error);
        container.innerHTML = '<p class="error">読み込みに失敗しました</p>';
    }
}

function renderEmployeesList(employees) {
    const container = document.getElementById('employeesList');
    if (!container) return;

    if (employees.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">従業員データがありません</p>';
        return;
    }

    const html = employees.map(employee => {
        const code = employee.code || '-';
        const name = employee.name || '-';
        const department = employee.department || '-';
        const email = employee.email || '-';
        const role = employee.role || '-';

        return `
            <div class="supplier-card" style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: #fff;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                    <div>
                        <h4 style="margin: 0 0 4px 0; font-size: 18px; color: #333;">${name}</h4>
                        <span style="font-size: 12px; color: #666;">コード: ${code}</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" onclick="editEmployee(${employee.id})" style="padding: 6px 12px; font-size: 14px;">✏️ 編集</button>
                        <button class="btn btn-outline" onclick="deleteEmployee(${employee.id}, '${name}')" style="padding: 6px 12px; font-size: 14px; color: #d32f2f; border-color: #d32f2f;">🗑️ 削除</button>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 14px; color: #666;">
                    <strong>部署:</strong><span>${department}</span>
                    <strong>メール:</strong><span>${email}</span>
                    <strong>役職:</strong><span>${role}</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

async function submitEmployeeForm() {
    const code = document.getElementById('employeeCode').value.trim();
    const name = document.getElementById('employeeName').value.trim();

    if (!code || !name) {
        showError('従業員コードと氏名は必須です');
        return;
    }

    const data = {
        code: code,
        name: name,
        department: document.getElementById('employeeDepartment').value.trim(),
        email: document.getElementById('employeeEmail').value.trim(),
        password: document.getElementById('employeePassword').value.trim(),
        role: document.getElementById('employeeRole').value
    };

    try {
        const response = await fetch('/api/employees', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('従業員を登録しました');
            // フォームをクリア
            document.getElementById('employeeCode').value = '';
            document.getElementById('employeeName').value = '';
            document.getElementById('employeeDepartment').value = '';
            document.getElementById('employeeEmail').value = '';
            document.getElementById('employeePassword').value = '';
            document.getElementById('employeeRole').value = '一般';
            // 一覧タブに切り替え
            switchEmployeesSubtab('list');
        } else {
            showError(result.error || '登録に失敗しました');
        }
    } catch (error) {
        console.error('employee register error:', error);
        showError('登録に失敗しました');
    }
}

async function editEmployee(id) {
    try {
        // 従業員データを取得
        const response = await fetch(`/api/employees/${id}`);
        const result = await response.json();

        if (!result.success) {
            showError(result.error || '従業員データの取得に失敗しました');
            return;
        }

        const employee = result.data;

        // フォームに値を設定
        document.getElementById('editEmployeeId').value = employee.id;
        document.getElementById('editEmployeeCode').value = employee.code || '';
        document.getElementById('editEmployeeName').value = employee.name || '';
        document.getElementById('editEmployeeDepartment').value = employee.department || '';
        document.getElementById('editEmployeeEmail').value = employee.email || '';
        document.getElementById('editEmployeePassword').value = '';
        document.getElementById('editEmployeeRole').value = employee.role || '一般';

        // 編集タブを表示して切り替え
        const editTab = document.querySelector('#employeesSubtabs [data-detail-tab="edit"]');
        if (editTab) {
            editTab.style.display = 'inline-block';
        }
        switchEmployeesSubtab('edit');
    } catch (error) {
        console.error('employee edit load error:', error);
        showError('従業員データの取得に失敗しました');
    }
}

async function updateEmployee() {
    const id = document.getElementById('editEmployeeId').value;
    const name = document.getElementById('editEmployeeName').value.trim();

    if (!name) {
        showError('氏名は必須です');
        return;
    }

    const data = {
        name: name,
        department: document.getElementById('editEmployeeDepartment').value.trim(),
        email: document.getElementById('editEmployeeEmail').value.trim(),
        role: document.getElementById('editEmployeeRole').value
    };

    // パスワードが入力されている場合のみ追加
    const password = document.getElementById('editEmployeePassword').value.trim();
    if (password) {
        data.password = password;
    }

    try {
        const response = await fetch(`/api/employees/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('従業員情報を更新しました');
            // 編集タブを非表示
            const editTab = document.querySelector('#employeesSubtabs [data-detail-tab="edit"]');
            if (editTab) {
                editTab.style.display = 'none';
            }
            // 一覧タブに切り替え
            switchEmployeesSubtab('list');
        } else {
            showError(result.error || '更新に失敗しました');
        }
    } catch (error) {
        console.error('employee update error:', error);
        showError('更新に失敗しました');
    }
}

function cancelEditEmployee() {
    // 編集タブを非表示
    const editTab = document.querySelector('#employeesSubtabs [data-detail-tab="edit"]');
    if (editTab) {
        editTab.style.display = 'none';
    }
    // 一覧タブに切り替え
    switchEmployeesSubtab('list');
}

async function deleteEmployee(id, name) {
    if (!confirm(`従業員「${name}」を削除しますか？`)) {
        return;
    }

    try {
        const response = await fetch(`/api/employees/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('従業員を削除しました');
            loadEmployeesList();
        } else {
            showError(result.error || '削除に失敗しました');
        }
    } catch (error) {
        console.error('employee delete error:', error);
        showError('削除に失敗しました');
    }
}

async function importEmployeesCsv() {
    const fileInput = document.getElementById('employeeCsvFileInput');
    const file = fileInput?.files[0];

    if (!file) {
        showError('CSVファイルを選択してください');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/employees/import-csv', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            const summary = result.summary;
            let message = result.message;

            if (summary.errors && summary.errors.length > 0) {
                message += `\n\nエラー:\n${summary.errors.slice(0, 5).join('\n')}`;
                if (summary.errors.length > 5) {
                    message += `\n... 他 ${summary.errors.length - 5} 件`;
                }
            }

            showSuccess(message);
            fileInput.value = '';
            loadEmployeesList();
        } else {
            showError(result.error || 'CSVの取り込みに失敗しました');
        }
    } catch (error) {
        console.error('CSV import error:', error);
        showError('CSVの取り込みに失敗しました');
    }
}

function downloadEmployeesCsvTemplate() {
    // CSVテンプレートを生成
    const template = 'コード,氏名,部署,メールアドレス,パスワード,役職\nEMP001,山田太郎,総務部,yamada@example.com,password123,一般\nEMP002,佐藤花子,営業部,sato@example.com,pass456,マネージャー';

    // Blobとしてダウンロードリンクを作成
    const blob = new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '従業員インポートテンプレート.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

// 入出庫履歴ページ
function initHistoryPage() {
    // 部署一覧を読み込み
    loadHistoryDepartments();

    // イベントリスナーを設定（初回のみ）
    if (!window.historyPageInitialized) {
        document.getElementById('searchHistory').addEventListener('click', loadHistory);
        document.getElementById('historyType').addEventListener('change', loadHistory);
        document.getElementById('historyDepartment').addEventListener('change', loadHistory);
        document.getElementById('historySearch').addEventListener('input', debounce(loadHistory, 300));
        window.historyPageInitialized = true;
    }

    // 履歴を読み込み
    loadHistory();
}

async function loadHistoryDepartments() {
    try {
        const response = await fetch('/api/history/departments');
        const data = await response.json();

        if (data.success && data.departments) {
            const select = document.getElementById('historyDepartment');
            const currentValue = select.value;

            select.innerHTML = '<option value="">すべて</option>';
            data.departments.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                select.appendChild(option);
            });

            // 以前の選択を復元
            if (currentValue) {
                select.value = currentValue;
            }
        }
    } catch (error) {
        console.error('部署一覧の取得に失敗:', error);
    }
}

async function loadHistory() {
    const type = document.getElementById('historyType').value;
    const department = document.getElementById('historyDepartment').value;
    const startDate = document.getElementById('historyStartDate').value;
    const endDate = document.getElementById('historyEndDate').value;
    const searchText = document.getElementById('historySearch').value.trim();

    const params = new URLSearchParams();
    if (type !== 'all') params.append('type', type);
    if (department) params.append('department', department);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (searchText) params.append('search_text', searchText);

    try {
        const response = await fetch(`/api/history?${params.toString()}`);
        const data = await response.json();

        if (data.success) {
            displayHistory(data.data);
            document.getElementById('historyCount').textContent = `表示件数: ${data.count}`;
        } else {
            showError(data.error || '履歴の取得に失敗しました');
        }
    } catch (error) {
        console.error('履歴取得エラー:', error);
        showError('履歴の取得に失敗しました');
    }
}

function displayHistory(history) {
    const tbody = document.getElementById('historyTableBody');

    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading">データがありません</td></tr>';
        return;
    }

    tbody.innerHTML = history.map(item => {
        const date = item.date ? new Date(item.date).toLocaleString('ja-JP') : '-';
        const type = item.type || '-';
        const typeBadge = type === '出庫'
            ? '<span style="background: #ff6b6b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">出庫</span>'
            : '<span style="background: #51cf66; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">入庫</span>';

        return `
            <tr>
                <td>${typeBadge}</td>
                <td>${date}</td>
                <td>${item.code || '-'}</td>
                <td>${item.name || '-'}</td>
                <td>${item.quantity || 0}</td>
                <td>${item.employee_name || '-'}</td>
                <td>${item.employee_department || '-'}</td>
                <td>¥${(item.unit_price || 0).toLocaleString()}</td>
                <td>¥${(item.total_amount || 0).toLocaleString()}</td>
                <td>${item.note || '-'}</td>
            </tr>
        `;
    }).join('');
}

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
        const pendingOrders = item['依頼中注文'] || [];
        const completedOrders = item['発注済み注文'] || [];

        // 依頼中注文の詳細HTML（商品の注文状態が「依頼中」または「発注準備」の場合のみ表示）
        let pendingOrdersHtml = '';
        if ((orderStatus === '依頼中' || orderStatus === '発注準備') && pendingOrders.length > 0) {
            const recentPendingOrders = pendingOrders.slice(0, 2); // 直近2件のみ
            pendingOrdersHtml = `
                <div class="order-details-section">
                    <div class="order-details-title">📋 注文依頼詳細（直近2件）</div>
                    ${recentPendingOrders.map(order => `
                        <div class="order-detail-item">
                            <span>依頼日: ${order['依頼日'] || '-'}</span>
                            <span>依頼者: ${order['依頼者'] || '-'}</span>
                            <span>依頼数量: <strong>${order['依頼数量'] || 0}</strong> ${unit}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // 発注済み注文の詳細HTML（商品の注文状態が「発注済み」の場合のみ表示）
        let completedOrdersHtml = '';
        if (orderStatus === '発注済み' && completedOrders.length > 0) {
            const recentOrders = completedOrders.slice(0, 2); // 直近2件のみ
            completedOrdersHtml = `
                <div class="order-details-section completed-order-section">
                    <div class="order-details-title">📦 発注詳細（直近2件）</div>
                    ${recentOrders.map(order => `
                        <div class="order-detail-item">
                            <span>注文日: ${order['注文日'] || '-'}</span>
                            <span>注文数量: <strong>${order['注文数量'] || 0}</strong> ${unit}</span>
                            <span>納期: ${order['納期'] || '-'}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // 入庫詳細HTML（商品の注文状態が「入庫済み」の場合のみ表示）
        const inboundDetails = item['入庫詳細'] || [];
        let inboundDetailsHtml = '';
        if (orderStatus === '入庫済み' && inboundDetails.length > 0) {
            const recentInbounds = inboundDetails.slice(0, 2); // 直近2件のみ
            inboundDetailsHtml = `
                <div class="order-details-section inbound-details-section">
                    <div class="order-details-title">📥 入庫詳細（直近2件）</div>
                    ${recentInbounds.map(detail => `
                        <div class="order-detail-item">
                            <span>入庫日: ${detail['入庫日'] || '-'}</span>
                            <span>数量: <strong>${detail['数量'] || 0}</strong> ${unit}</span>
                            <span>入庫者: ${detail['入庫者'] || '-'}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

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
                        ${pendingOrdersHtml}
                        ${completedOrdersHtml}
                        ${inboundDetailsHtml}
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

    // 出庫・入庫の場合は入出庫ページに遷移してサブタブを切り替え
    if (action === 'outbound' || action === 'inbound') {
        switchPage('operations');
        // サブタブ切り替えのために少し待つ
        setTimeout(() => {
            if (typeof switchOperationsSubtab === 'function') {
                switchOperationsSubtab(action);
            }

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
        }, 100);
        return;
    }

    // 注文依頼の場合は通常通り
    switchPage('order');
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


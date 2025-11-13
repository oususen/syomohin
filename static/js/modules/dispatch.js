// ========================================
// 発注管理JavaScript
// ========================================

// ページ初期化
function initDispatchPage() {
    // 発注サブタブが存在する場合、requestsタブを表示
    if (typeof switchDispatchSubtab === 'function') {
        switchDispatchSubtab('requests');
    }
}

// ========================================
// 1. 依頼管理機能
// ========================================

async function loadPendingOrders() {
    try {
        const response = await fetch('/api/orders/pending');
        const data = await response.json();

        const tbody = document.getElementById('pendingOrdersTableBody');
        if (!tbody) return;

        if (!data.success || !data.data || data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; color: #999;">依頼がありません</td></tr>';
            return;
        }

        tbody.innerHTML = data.data.map(order => `
            <tr>
                <td>${order.id}</td>
                <td>${order.code || '-'}</td>
                <td>${order.name || '-'}</td>
                <td>${order.quantity} ${order.unit || ''}</td>
                <td>¥${(order.unit_price || 0).toLocaleString()}</td>
                <td>¥${(order.total_amount || 0).toLocaleString()}</td>
                <td>${order.deadline || '-'}</td>
                <td>${order.requester_name || '-'}</td>
                <td>${order.supplier_name || '-'}</td>
                <td>
                    <span class="status-badge status-${order.status === '依頼中' ? 'pending' : 'ready'}">
                        ${order.status}
                    </span>
                </td>
                <td>${order.requested_date ? new Date(order.requested_date).toLocaleString('ja-JP') : '-'}</td>
                <td>
                    ${order.status === '依頼中' ? `
                        <button class="btn-small btn-edit" onclick="updateOrderStatus(${order.id}, '発注準備')" title="発注準備へ">
                            ✓
                        </button>
                        <button class="btn-small btn-delete" onclick="updateOrderStatus(${order.id}, '却下')" title="却下">
                            ✗
                        </button>
                    ` : `
                        <button class="btn-small" onclick="updateOrderStatus(${order.id}, '依頼中')" title="依頼中に戻す">
                            ↩
                        </button>
                    `}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading pending orders:', error);
        showError('依頼の読み込みに失敗しました');
    }
}

async function updateOrderStatus(orderId, newStatus) {
    const confirmMessages = {
        '発注準備': '発注準備に移行しますか？',
        '却下': 'この依頼を却下しますか？',
        '依頼中': '依頼中に戻しますか？'
    };

    if (!confirm(confirmMessages[newStatus])) return;

    try {
        const response = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(data.message);
            loadPendingOrders();
        } else {
            showError(data.error || 'ステータスの更新に失敗しました');
        }
    } catch (error) {
        console.error('Error updating order status:', error);
        showError('ステータスの更新に失敗しました');
    }
}

// 消耗品を直接追加
function showAddDirectOrderModal() {
    const modal = document.getElementById('addDirectOrderModal');
    if (modal) {
        modal.style.display = 'flex';
        // フィルターをクリア
        document.getElementById('directOrderCodeFilter').value = '';
        document.getElementById('directOrderNameFilter').value = '';
        document.getElementById('directOrderShortageFilter').value = 'すべて';
        document.getElementById('directOrderForm').style.display = 'none';
        // モーダルを開いた時に自動的に全商品を検索して表示
        searchDirectOrderConsumables();
    }
}

function closeAddDirectOrderModal() {
    const modal = document.getElementById('addDirectOrderModal');
    if (modal) {
        modal.style.display = 'none';
        document.getElementById('directOrderCodeFilter').value = '';
        document.getElementById('directOrderNameFilter').value = '';
        document.getElementById('directOrderShortageFilter').value = 'すべて';
        document.getElementById('directOrderGallery').innerHTML = '<p style="color: #666; text-align: center;">検索ボタンをクリックして消耗品を表示してください</p>';
        document.getElementById('directOrderForm').style.display = 'none';
    }
}

// 消耗品検索（フィルター条件付き）
async function searchDirectOrderConsumables() {
    const code = document.getElementById('directOrderCodeFilter').value.trim();
    const name = document.getElementById('directOrderNameFilter').value.trim();
    const shortage = document.getElementById('directOrderShortageFilter').value;
    const gallery = document.getElementById('directOrderGallery');

    gallery.innerHTML = '<p style="color: #666; text-align: center;">読み込み中...</p>';

    try {
        // 在庫APIを呼び出し（在庫一覧と同じAPI）
        let url = `/api/inventory?qr_code=${encodeURIComponent(code)}&search_text=${encodeURIComponent(name)}`;

        // 欠品状態フィルター
        if (shortage === '欠品') {
            url += '&shortage_status=欠品';
        } else if (shortage === '在庫あり') {
            url += '&shortage_status=在庫あり';
        } else {
            url += '&shortage_status=すべて';
        }

        url += '&order_status=すべて';

        const response = await fetch(url);
        const data = await response.json();

        if (!data.success || !data.data || data.data.length === 0) {
            gallery.innerHTML = '<p style="color: #999; text-align: center;">該当する消耗品が見つかりません</p>';
            return;
        }

        renderDirectOrderGallery(data.data);
    } catch (error) {
        console.error('search error:', error);
        gallery.innerHTML = '<p style="color: #d32f2f; text-align: center;">検索に失敗しました</p>';
    }
}

// ギャラリー表示
function renderDirectOrderGallery(items) {
    const gallery = document.getElementById('directOrderGallery');
    if (!gallery) return;

    const cards = (items || []).map(item => {
        const consumableId = Number(item.id || item.consumable_id || item.consumableId || 0);
        if (!consumableId) {
            return '';
        }

        const code = pickField(item, ['コード', 'code', 'qr_code']) || '';
        const orderCode = pickField(item, ['発注コード', 'order_code']) || '';
        const name = pickField(item, ['品名', 'name']) || '';
        const category = pickField(item, ['カテゴリ', 'category']) || '';
        const unit = pickField(item, ['単位', 'unit']) || '';
        const supplier = pickField(item, ['購入先', 'supplier_name', 'supplier']) || '';
        const stockQuantity = Number(pickField(item, ['在庫数', 'stock_quantity']) || 0);
        const safetyStock = Number(pickField(item, ['安全在庫', 'safety_stock', 'min_stock_quantity']) || 0);
        const shortageStatus = pickField(item, ['欠品状態', 'shortage_status']) || '状態未設定';
        const orderStatus = pickField(item, ['注文状態', 'order_status']) || '状態未設定';
        const unitPriceValue = Number(pickField(item, ['単価', 'unit_price']) || 0);
        const rawImagePath = pickField(item, ['画像URL', 'image_path']);
        const imageUrl = typeof buildImageUrl === 'function'
            ? buildImageUrl(rawImagePath)
            : (rawImagePath || 'https://placehold.co/240x180?text=No+Image');

        const shortageTheme = shortageStatus.includes('欠') || shortageStatus.includes('危')
            ? { icon: '△', textColor: '#c62828', bgColor: '#fdecea' }
            : { icon: '○', textColor: '#1b5e20', bgColor: '#e8f5e9' };

        const unitLabel = unit || '個';
        const unitPriceText = `¥${unitPriceValue.toLocaleString('ja-JP')}`;
        const qtyInputId = `qty_${consumableId}`;
        const codeLiteral = JSON.stringify(code || '');
        const nameLiteral = JSON.stringify(name || '');
        const unitLiteral = JSON.stringify(unitLabel);
        const supplierLiteral = JSON.stringify(supplier || '');

        return `
            <div class="direct-order-card" style="display:flex; gap:18px; align-items:stretch; border:1px solid #e0e6f0; border-radius:14px; padding:18px; background:#fff; box-shadow:0 2px 8px rgba(15,23,42,0.08); margin-bottom:18px;">
                <div style="flex:0 0 220px;">
                    <div style="width:100%; aspect-ratio:4/3; background:#f5f7fb; border-radius:12px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        <img src="${imageUrl}" alt="${escapeHtml(name)}" style="width:100%; height:100%; object-fit:contain;" loading="lazy">
                    </div>
                </div>
                <div style="flex:1; display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start;">
                        <div>
                            <div style="font-size:20px; font-weight:600; color:#111827;">${escapeHtml(name || '-')}</div>
                            <div style="margin-top:4px; color:#607d8b; font-size:13px;">部品番号: ${escapeHtml(code || '-')} ／ 発注コード: ${escapeHtml(orderCode || '-')}</div>
                            <div style="margin-top:4px; color:#607d8b; font-size:13px;">カテゴリ: ${escapeHtml(category || '-')}</div>
                            <div style="margin-top:4px; color:#607d8b; font-size:13px;">購入先: <strong>${escapeHtml(supplier || '-')}</strong></div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:18px; font-weight:700; color:#d32f2f;">${unitPriceText}</div>
                            <div style="font-size:12px; color:#607d8b;">単位: ${escapeHtml(unitLabel)}</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <span style="background:#eef2ff; color:#3730a3; padding:4px 10px; border-radius:999px; font-size:12px;">在庫 ${stockQuantity} ${escapeHtml(unitLabel)}</span>
                        <span style="background:#fef9c3; color:#a16207; padding:4px 10px; border-radius:999px; font-size:12px;">安全在庫 ${safetyStock} ${escapeHtml(unitLabel)}</span>
                        <span style="background:${shortageTheme.bgColor}; color:${shortageTheme.textColor}; padding:4px 10px; border-radius:999px; font-size:12px;">${shortageTheme.icon} ${escapeHtml(shortageStatus)}</span>
                        <span style="background:#e0f2f1; color:#00695c; padding:4px 10px; border-radius:999px; font-size:12px;">注文状態: ${escapeHtml(orderStatus)}</span>
                    </div>
                </div>
                <div style="flex:0 0 180px; border-left:1px solid #edf2fb; padding-left:16px; display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <label style="display:block; font-size:12px; color:#6b7280; margin-bottom:6px;">数量（${escapeHtml(unitLabel)}）</label>
                        <input type="number" id="${qtyInputId}" min="1" value="1" style="width:100%; padding:10px 12px; border:1px solid #cbd5f5; border-radius:8px; font-size:15px;" onclick="event.stopPropagation();">
                    </div>
                    <button class="btn btn-primary" style="margin-top:14px; width:100%; font-weight:600;" onclick='addDirectOrderFromCard(${consumableId}, ${codeLiteral}, ${nameLiteral}, ${unitLiteral}, ${unitPriceValue}, ${supplierLiteral})'>
                        カートに追加
                    </button>
                </div>
            </div>
        `;
    }).filter(Boolean).join('');

    gallery.innerHTML = cards || '<p style="color: #999; text-align: center;">表示できる消耗品がありません</p>';
}

// HTMLエスケープ（XSS対策）
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// カードから直接発注準備に追加
async function addDirectOrderFromCard(consumableId, code, name, unit, unitPrice, supplierName) {
    const qtyInput = document.getElementById(`qty_${consumableId}`);
    if (!qtyInput) {
        showError('数量入力欄が見つかりません');
        return;
    }

    const quantity = parseInt(qtyInput.value) || 1;

    if (quantity < 1) {
        showError('数量は1以上を入力してください');
        return;
    }

    try {
        const response = await fetch('/api/orders/add-to-dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                consumable_id: consumableId,
                quantity: quantity,
                deadline: '通常',
                note: ''
            })
        });

        const result = await response.json();

        if (result.success) {
            showSuccess(`${name} を発注準備に追加しました`);
            // 数量をリセット
            qtyInput.value = 1;
        } else {
            showError(result.error || '追加に失敗しました');
        }
    } catch (error) {
        console.error('add to dispatch error:', error);
        showError('追加に失敗しました');
    }
}

function selectConsumableForDirectOrder(id, code, name, unit, unitPrice, supplierName) {
    document.getElementById('selectedConsumableId').value = id;
    document.getElementById('selectedConsumableInfo').innerHTML = `
        <strong>${name}</strong> (${code})<br>
        <small>単価: ¥${unitPrice.toLocaleString()} ${unit} | 購入先: ${supplierName}</small>
    `;
    document.getElementById('directOrderForm').style.display = 'block';
    document.getElementById('directOrderQuantity').focus();
}

async function submitDirectOrder() {
    const consumableId = document.getElementById('selectedConsumableId').value;
    const quantity = document.getElementById('directOrderQuantity').value;
    const deadline = document.getElementById('directOrderDeadline').value;
    const note = document.getElementById('directOrderNote').value;

    if (!consumableId || !quantity) {
        showError('商品と数量を入力してください');
        return;
    }

    try {
        const response = await fetch('/api/orders/add-to-dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                consumable_id: parseInt(consumableId),
                quantity: parseInt(quantity),
                deadline: deadline,
                note: note
            })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(data.message);
            closeAddDirectOrderModal();
            loadPendingOrders();
        } else {
            showError(data.error || '追加に失敗しました');
        }
    } catch (error) {
        console.error('Error adding direct order:', error);
        showError('追加に失敗しました');
    }
}


// ========================================
// 2. 注文書作成機能
// ========================================

async function loadDispatchItems() {
    try {
        const response = await fetch('/api/dispatch/items');
        const data = await response.json();

        const container = document.getElementById('dispatchItemsContainer');
        if (!container) return;

        if (!data.success || !data.data || data.data.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">発注準備中のアイテムがありません</p>';
            return;
        }

        container.innerHTML = data.data.map(group => `
            <div class="form-container" style="margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div>
                        <h3 class="section-title" style="margin: 0;">🏢 ${group.supplier_name || '購入先未設定'}</h3>
                        <small style="color: #666;">明細数: ${group.items.length}件 | 合計: ¥${group.items.reduce((sum, item) => sum + (item.total_amount || 0), 0).toLocaleString()}</small>
                    </div>
                    <button class="btn btn-primary" onclick="createDispatchOrder(${group.supplier_id}, '${group.supplier_name}')">
                        📝 注文書を作成
                    </button>
                </div>

                <div class="table-container">
                    <table class="employees-table">
                        <thead>
                            <tr>
                                <th>商品コード</th>
                                <th>商品名</th>
                                <th>数量</th>
                                <th>単価</th>
                                <th>合計金額</th>
                                <th>納期</th>
                                <th>備考</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${group.items.map(item => `
                                <tr>
                                    <td>${item.code || '-'}</td>
                                    <td>${item.name || '-'}</td>
                                    <td>
                                        <input type="number" value="${item.quantity}" min="1"
                                               style="width: 80px;" class="input-field"
                                               onchange="updateDispatchItem(${item.id}, 'quantity', this.value)">
                                        ${item.unit || ''}
                                    </td>
                                    <td>¥${(item.unit_price || 0).toLocaleString()}</td>
                                    <td>¥${(item.total_amount || 0).toLocaleString()}</td>
                                    <td>
                                        <select style="width: 100px;" class="input-field"
                                                onchange="updateDispatchItem(${item.id}, 'deadline', this.value)">
                                            <option value="最短" ${item.deadline === '最短' ? 'selected' : ''}>最短</option>
                                            <option value="通常" ${item.deadline === '通常' ? 'selected' : ''}>通常</option>
                                            <option value="余裕あり" ${item.deadline === '余裕あり' ? 'selected' : ''}>余裕あり</option>
                                        </select>
                                    </td>
                                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${item.note || '-'}</td>
                                    <td>
                                        <button class="btn-small" onclick="updateOrderStatus(${item.id}, '依頼中')" title="依頼中に戻す">
                                            ↩
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading dispatch items:', error);
        showError('データの読み込みに失敗しました');
    }
}

async function updateDispatchItem(itemId, field, value) {
    try {
        const payload = {};
        payload[field] = field === 'quantity' ? parseInt(value) : value;

        const response = await fetch(`/api/dispatch/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            // 成功したら再読み込み
            loadDispatchItems();
        } else {
            showError(data.error || '更新に失敗しました');
        }
    } catch (error) {
        console.error('Error updating dispatch item:', error);
        showError('更新に失敗しました');
    }
}

async function createDispatchOrder(supplierId, supplierName) {
    if (!confirm(`${supplierName} 宛ての注文書を作成しますか？`)) return;

    try {
        // 該当する購入先のアイテムIDを取得
        const response = await fetch('/api/dispatch/items');
        const data = await response.json();

        if (!data.success) {
            showError('アイテムの取得に失敗しました');
            return;
        }

        const supplierGroup = data.data.find(g => g.supplier_id === supplierId);
        if (!supplierGroup || !supplierGroup.items) {
            showError('対象のアイテムが見つかりません');
            return;
        }

        const itemIds = supplierGroup.items.map(item => item.id);

        // 注文書を作成
        const createResponse = await fetch('/api/dispatch/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                supplier_id: supplierId,
                item_ids: itemIds,
                note: ''
            })
        });

        const createData = await createResponse.json();

        if (createData.success) {
            showSuccess(`注文書 ${createData.order_number} を作成しました`);
            loadDispatchItems(); // 発注準備リストを更新
        } else {
            showError(createData.error || '注文書の作成に失敗しました');
        }
    } catch (error) {
        console.error('Error creating dispatch order:', error);
        showError('注文書の作成に失敗しました');
    }
}


// ========================================
// 3. 注文書送信機能
// ========================================

async function loadDispatchOrders() {
    try {
        const response = await fetch('/api/dispatch/orders');
        const data = await response.json();

        const tbody = document.getElementById('dispatchOrdersTableBody');
        if (!tbody) return;

        if (!data.success || !data.data || data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #999;">注文書がありません</td></tr>';
            return;
        }

        tbody.innerHTML = data.data.map(order => `
            <tr>
                <td><strong>${order.order_number}</strong></td>
                <td>${order.supplier_name || '-'}</td>
                <td>${order.total_items || 0}件</td>
                <td>¥${(order.total_amount || 0).toLocaleString()}</td>
                <td>
                    <span class="status-badge status-${order.status === '未送信' ? 'pending' : 'sent'}">
                        ${order.status}
                    </span>
                </td>
                <td>${order.created_by || '-'}</td>
                <td>${order.created_at ? new Date(order.created_at).toLocaleString('ja-JP') : '-'}</td>
                <td>${order.sent_at ? new Date(order.sent_at).toLocaleString('ja-JP') : '-'}</td>
                <td>
                    <button class="btn-small btn-edit" onclick="showDispatchOrderDetail(${order.id})" title="詳細">
                        👁
                    </button>
                    ${order.status === '未送信' ? `
                        <button class="btn-small btn-primary" onclick="showSendOrderModal(${order.id}, '${order.supplier_name}')" title="送信">
                            📧
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading dispatch orders:', error);
        showError('注文書の読み込みに失敗しました');
    }
}

async function showDispatchOrderDetail(orderId) {
    const modal = document.getElementById('dispatchOrderDetailModal');
    const content = document.getElementById('dispatchOrderDetailContent');

    if (!modal || !content) return;

    modal.style.display = 'flex';
    content.innerHTML = '<p class="loading">読み込み中...</p>';

    try {
        const response = await fetch(`/api/dispatch/orders/${orderId}`);
        const data = await response.json();

        if (!data.success) {
            content.innerHTML = `<p style="color: #f44336;">エラー: ${data.error}</p>`;
            return;
        }

        const order = data.data;

        content.innerHTML = `
            <div class="form-container">
                <h4 style="margin-top: 0;">注文書情報</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                    <div><strong>注文書番号:</strong> ${order.order_number}</div>
                    <div><strong>購入先:</strong> ${order.supplier_name}</div>
                    <div><strong>作成者:</strong> ${order.created_by}</div>
                    <div><strong>作成日時:</strong> ${order.created_at ? new Date(order.created_at).toLocaleString('ja-JP') : '-'}</div>
                    <div><strong>状態:</strong> <span class="status-badge">${order.status}</span></div>
                    <div><strong>送信日時:</strong> ${order.sent_at ? new Date(order.sent_at).toLocaleString('ja-JP') : '-'}</div>
                </div>

                <h4>明細</h4>
                <div class="table-container">
                    <table class="employees-table">
                        <thead>
                            <tr>
                                <th>商品コード</th>
                                <th>商品名</th>
                                <th>数量</th>
                                <th>単価</th>
                                <th>合計金額</th>
                                <th>納期</th>
                                <th>備考</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${order.items.map(item => `
                                <tr>
                                    <td>${item.code || '-'}</td>
                                    <td>${item.name || '-'}</td>
                                    <td>${item.quantity} ${item.unit || ''}</td>
                                    <td>¥${(item.unit_price || 0).toLocaleString()}</td>
                                    <td>¥${(item.total_amount || 0).toLocaleString()}</td>
                                    <td>${item.deadline || '-'}</td>
                                    <td>${item.note || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="4" style="text-align: right;"><strong>合計:</strong></td>
                                <td><strong>¥${(order.total_amount || 0).toLocaleString()}</strong></td>
                                <td colspan="2"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading order detail:', error);
        content.innerHTML = '<p style="color: #f44336;">詳細の読み込みに失敗しました</p>';
    }
}

function closeDispatchOrderDetailModal() {
    const modal = document.getElementById('dispatchOrderDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function showSendOrderModal(orderId, supplierName) {
    const email = prompt(`${supplierName} に送信するメールアドレスを入力してください:`);

    if (!email) return;

    // 簡易的なメールアドレス検証
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('有効なメールアドレスを入力してください');
        return;
    }

    if (!confirm(`${email} に注文書を送信しますか？`)) return;

    try {
        const response = await fetch(`/api/dispatch/orders/${orderId}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(data.message);
            loadDispatchOrders(); // リストを更新
        } else {
            showError(data.error || '送信に失敗しました');
        }
    } catch (error) {
        console.error('Error sending order:', error);
        showError('送信に失敗しました');
    }
}


// ========================================
// 初期化
// ========================================

function initDispatchRequestsPage() {
    loadPendingOrders();
}

function initDispatchCreatePage() {
    loadDispatchItems();
}

function initDispatchSendPage() {
    loadDispatchOrders();
}


// CSS for search result items
const style = document.createElement('style');
style.textContent = `
    .search-result-item {
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .search-result-item:hover {
        background: #f0f8ff;
        border-color: #009688;
    }

    .status-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
    }

    .status-pending {
        background: #fff3cd;
        color: #856404;
    }

    .status-ready {
        background: #d1ecf1;
        color: #0c5460;
    }

    .status-sent {
        background: #d4edda;
        color: #155724;
    }
`;
document.head.appendChild(style);

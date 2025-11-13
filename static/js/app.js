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




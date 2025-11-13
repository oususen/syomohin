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


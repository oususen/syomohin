// ========================================
// 入出庫・共通操作
// ========================================

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
    console.log('=== submitInbound関数が呼び出されました ===');

    const inboundItemInfo = document.getElementById('inboundItemInfo');
    console.log('inboundItemInfo element:', inboundItemInfo);

    const code = inboundItemInfo ? inboundItemInfo.dataset.itemCode : null;
    console.log('商品コード:', code);

    const quantity = parseInt(document.getElementById('inboundQuantity').value);
    const person = document.getElementById('inboundPerson').value.trim();
    const department = document.getElementById('inboundDepartment').value.trim();
    const note = document.getElementById('inboundNote').value.trim();

    console.log('入庫データ:', { code, quantity, person, department, note });

    if (!quantity || quantity <= 0) {
        console.log('入庫数量エラー');
        showError('入庫数量を入力してください');
        return;
    }

    if (!person) {
        console.log('入庫者名エラー');
        showError('入庫者名を入力してください');
        return;
    }

    console.log('バリデーションOK、API呼び出しを開始します');

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
                deadline: deadline || '最短',
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

// グローバルに公開（common.jsから呼び出せるように）
window.submitInbound = submitInbound;
window.submitOutbound = submitOutbound;
window.submitOrder = submitOrder;
window.loadItemInfo = loadItemInfo;
window.searchItemByName = searchItemByName;
window.loadEmployeeByCode = loadEmployeeByCode;
window.openCamera = openCamera;
window.closeCamera = closeCamera;
window.capturePhoto = capturePhoto;
window.loadPendingOrders = loadPendingOrders;
window.loadManualOrders = loadManualOrders;

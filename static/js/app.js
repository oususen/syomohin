// グローバル変数
let cameraStream = null;
let filterOptions = { order_status: [], shortage_status: [] };
let currentPage = 'inventory';
let currentQrTarget = null; // 現在QRコードを入力しようとしているフィールド

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
    document.getElementById('submitInbound').addEventListener('click', submitInbound);

    // 注文依頼ページ
    document.getElementById('orderQrCode').addEventListener('input', () => loadItemInfo('order'));
    document.getElementById('orderScanBtn').addEventListener('click', () => {
        currentQrTarget = 'orderQrCode';
        openCamera();
    });
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
        'order': 'orderPage',
        'order-list': 'orderListPage',
        'dispatch': 'dispatchPage'
    };

    document.getElementById(pageMap[page]).classList.add('active');

    // ページタイトルを更新
    const titles = {
        'inventory': '📦 在庫一覧',
        'register': '➕ 新規登録',
        'outbound': '📤 出庫',
        'inbound': '📥 入庫',
        'order': '📝 注文依頼',
        'order-list': '📋 発注状態',
        'dispatch': '📮 発注'
    };
    document.getElementById('pageTitle').textContent = titles[page];

    // ページごとの初期化処理
    if (page === 'register') {
        initRegisterPage();
    } else if (page === 'order-list') {
        loadManualOrders();
    } else if (page === 'dispatch') {
        initDispatchPage();
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
            orderSelect.innerHTML = data.order_status.map(status =>
                `<option value="${status}">${status}</option>`
            ).join('');

            const shortageSelect = document.getElementById('shortageStatus');
            shortageSelect.innerHTML = data.shortage_status.map(status =>
                `<option value="${status}">${status}</option>`
            ).join('');
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

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>条件に合致する消耗品が見つかりません。</p>
                <p>フィルター条件を変えてください。</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        const stock = parseInt(item['在庫数']);
        const safety = parseInt(item['安全在庫']);
        const isStockSufficient = stock >= safety;

        return `
            <div class="inventory-card">
                <div class="card-content">
                    <img
                        src="${item['画像URL'] || 'https://placehold.co/120x80?text=IMG'}"
                        alt="${item['品名']}"
                        class="card-image"
                    >
                    <div class="card-details">
                        <div class="card-row">
                            <strong>コード:</strong> ${item['コード']} / <strong>発注コード:</strong> ${item['発注コード']}
                        </div>
                        <div class="card-row">
                            <strong>品名:</strong> ${item['品名']} / <strong>カテゴリ:</strong> ${item['カテゴリ']}
                        </div>
                        <div class="card-row">
                            <strong>在庫数:</strong> ${stock} (安全在庫 ${safety}) / <strong>単位:</strong> ${item['単位']}
                        </div>
                        <div class="card-row">
                            <strong>購入先:</strong> ${item['購入先']}
                        </div>
                        <div class="card-badges">
                            <span class="badge ${isStockSufficient ? 'badge-green' : 'badge-red'}">
                                ${isStockSufficient ? '✅ 在庫あり' : '⚠️ 要補充'}
                            </span>
                            <span class="badge badge-blue">
                                🗂 ${item['注文状態']}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 表示件数を更新
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
                note: note
            }),
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(`${code} を ${quantity} 個出庫しました（出庫者: ${person}）`);

            // フォームをクリア
            document.getElementById('outboundQrCode').value = '';
            document.getElementById('outboundQuantity').value = '';
            document.getElementById('outboundPerson').value = '';
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
                note: note,
                inbound_type: '手動'
            }),
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(`${code} を ${quantity} 個入庫しました（入庫者: ${person}）`);

            // フォームをクリア
            document.getElementById('inboundQrCode').value = '';
            document.getElementById('inboundQuantity').value = '';
            document.getElementById('inboundPerson').value = '';
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
            const select = document.getElementById('registerSupplier');
            select.innerHTML = '<option value="">-- 購入先を選択 --</option>';

            result.data.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = supplier.name;
                select.appendChild(option);
            });
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

    const data = {
        code: code,
        order_code: document.getElementById('registerOrderCode').value.trim(),
        name: name,
        category: document.getElementById('registerCategory').value.trim(),
        unit: document.getElementById('registerUnit').value.trim() || '個',
        stock_quantity: parseInt(document.getElementById('registerStockQty').value) || 0,
        safety_stock: parseInt(document.getElementById('registerSafetyStock').value) || 0,
        unit_price: parseFloat(document.getElementById('registerUnitPrice').value) || 0,
        order_unit: parseInt(document.getElementById('registerOrderUnit').value) || 1,
        supplier_id: document.getElementById('registerSupplier').value ? parseInt(document.getElementById('registerSupplier').value) : null,
        storage_location: document.getElementById('registerStorageLocation').value.trim(),
        note: document.getElementById('registerNote').value.trim()
    };

    try {
        const response = await fetch('/api/consumables', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
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
    // 購入先を読み込み
    loadSuppliers();

    // 登録ボタンのイベントリスナー
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

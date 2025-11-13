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
    // 現在のユーザー情報を取得
    await loadCurrentUser();

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
        'employees': 'employeesPage',
        'users': 'usersPage'
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
        'employees': '👤 従業員管理',
        'users': '👤 ユーザー管理'
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
    } else if (page === 'users') {
        initUsersPage();
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


// 認証関連の関数
// ========================================

// 現在のユーザー情報を取得
async function loadCurrentUser() {
    try {
        const response = await fetch('/api/current-user');
        const data = await response.json();

        if (data.success) {
            const userName = data.user.full_name || data.user.username;
            document.getElementById('currentUserName').textContent = `👤 ${userName}`;
        } else {
            // ログインしていない場合はログインページへ
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('ユーザー情報取得エラー:', error);
        window.location.href = '/login';
    }
}

// ログアウト
async function logout() {
    if (!confirm('ログアウトしますか？')) {
        return;
    }

    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            // ログインページへリダイレクト
            window.location.href = '/login';
        } else {
            showError('ログアウトに失敗しました');
        }
    } catch (error) {
        console.error('ログアウトエラー:', error);
        showError('ログアウトに失敗しました');
    }
}

// パスワード変更モーダルを開く
function openChangePasswordModal() {
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('changePasswordModal').style.display = 'flex';
}

// パスワード変更モーダルを閉じる
function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
}

// パスワード変更
async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showError('全ての項目を入力してください');
        return;
    }

    if (newPassword !== confirmPassword) {
        showError('新しいパスワードが一致しません');
        return;
    }

    if (newPassword.length < 6) {
        showError('パスワードは6文字以上で入力してください');
        return;
    }

    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('パスワードを変更しました');
            closeChangePasswordModal();
        } else {
            showError(data.error || 'パスワードの変更に失敗しました');
        }
    } catch (error) {
        console.error('パスワード変更エラー:', error);
        showError('パスワードの変更に失敗しました');
    }
}

// Helper utilities
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
        if (text.includes("欠") || text.includes("危") || text.includes("注意")) {
            return "status-alert";
        }
        return "status-safe";
    }
    if (type === "order") {
        if (text.includes("完") || text.includes("済")) {
            return "status-success";
        }
        if (text.includes("依頼") || text.includes("待") || text.includes("確認")) {
            return "status-warning";
        }
        return "status-info";
    }
    return "status-info";
}



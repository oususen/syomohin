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
let currentUserInfo = null;
let pagePermissionMap = {};
let tabPermissionMap = {};
const DEFAULT_SHORTAGE_STATUSES = ['欠品', '要注意', '在庫あり'];
const NAV_DISPLAY_ORDER = ['inventory', 'register', 'operations', 'dispatch', 'suppliers', 'employees', 'users'];
const OPERATION_SUBTABS = ['inbound', 'outbound', 'history'];
const DISPATCH_SUBTABS = ['requests', 'create', 'send'];
const PAGE_PERMISSION_RULES = {
    inventory: ['在庫一覧'],
    register: ['消耗品管理'],
    operations: ['入庫', '出庫', '履歴'],
    inbound: ['入庫'],
    outbound: ['出庫'],
    history: ['履歴'],
    order: ['注文依頼'],
    'order-list': ['発注状態'],
    dispatch: ['発注'],
    requests: ['発注'],
    create: ['発注'],
    send: ['発注'],
    suppliers: ['購入先管理'],
    employees: ['従業員管理'],
    users: ['ユーザー管理']
};

function normalizeEmployeeCode(code, width = 6) {
    const trimmed = (code ?? '').toString().trim();
    if (!trimmed) {
        return '';
    }
    if (/^\d+$/.test(trimmed) && trimmed.length < width) {
        return trimmed.padStart(width, '0');
    }
    return trimmed;
}

window.normalizeEmployeeCode = normalizeEmployeeCode;

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
        window.openCamera();
    });

    // 出庫ページ
    document.getElementById('outboundQrCode').addEventListener('input', () => window.loadItemInfo('outbound'));
    document.getElementById('outboundScanBtn').addEventListener('click', () => {
        currentQrTarget = 'outboundQrCode';
        window.openCamera();
    });
    document.getElementById('outboundSearchText').addEventListener('input', debounce(() => window.searchItemByName('outbound'), 300));
    document.getElementById('outboundEmployeeCode').addEventListener('input', debounce(() => window.loadEmployeeByCode('outbound'), 300));
    document.getElementById('outboundEmployeeCode').addEventListener('blur', () => {
        const input = document.getElementById('outboundEmployeeCode');
        const normalized = normalizeEmployeeCode(input.value);
        if (normalized !== input.value.trim()) {
            input.value = normalized;
        }
        window.loadEmployeeByCode('outbound');
    });
    document.getElementById('submitOutbound').addEventListener('click', () => window.submitOutbound());

    // 入庫ページ
    document.getElementById('showManualInbound').addEventListener('click', () => {
        document.getElementById('manualInboundForm').style.display = 'block';
        document.getElementById('autoInboundList').style.display = 'none';
    });
    document.getElementById('showAutoInbound').addEventListener('click', () => {
        document.getElementById('manualInboundForm').style.display = 'none';
        document.getElementById('autoInboundList').style.display = 'block';
        window.loadDispatchOrdersForInbound();
    });
    document.getElementById('inboundQrCode').addEventListener('input', () => window.loadItemInfo('inbound'));
    document.getElementById('inboundScanBtn').addEventListener('click', () => {
        currentQrTarget = 'inboundQrCode';
        window.openCamera();
    });
    document.getElementById('inboundSearchText').addEventListener('input', debounce(() => window.searchItemByName('inbound'), 300));
    document.getElementById('inboundEmployeeCode').addEventListener('input', debounce(() => window.loadEmployeeByCode('inbound'), 300));
    document.getElementById('inboundEmployeeCode').addEventListener('blur', () => {
        const input = document.getElementById('inboundEmployeeCode');
        const normalized = normalizeEmployeeCode(input.value);
        if (normalized !== input.value.trim()) {
            input.value = normalized;
        }
        window.loadEmployeeByCode('inbound');
    });

    const submitInboundBtn = document.getElementById('submitInbound');
    console.log('submitInbound button:', submitInboundBtn);
    if (submitInboundBtn) {
        submitInboundBtn.addEventListener('click', (e) => {
            console.log('入庫ボタンがクリックされました');
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.submitInbound === 'function') {
                console.log('submitInbound関数を呼び出します');
                window.submitInbound();
            } else {
                console.error('submitInbound関数が見つかりません');
            }
        });
        console.log('submitInboundイベントリスナーを登録しました');
    } else {
        console.error('submitInboundボタンが見つかりません');
    }

    ['editStockQty', 'editSafetyStock'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', autoUpdateEditShortageStatus);
        }
    });

    // 注文依頼ページ
    document.getElementById('orderQrCode').addEventListener('input', () => window.loadItemInfo('order'));
    document.getElementById('orderScanBtn').addEventListener('click', () => {
        currentQrTarget = 'orderQrCode';
        window.openCamera();
    });
    document.getElementById('orderEmployeeCode').addEventListener('input', debounce(() => window.loadEmployeeByCode('order'), 300));
    document.getElementById('orderEmployeeCode').addEventListener('blur', () => {
        const input = document.getElementById('orderEmployeeCode');
        const normalized = normalizeEmployeeCode(input.value);
        if (normalized !== input.value.trim()) {
            input.value = normalized;
        }
        window.loadEmployeeByCode('order');
    });
    document.getElementById('submitOrder').addEventListener('click', () => window.submitOrder());

    // 発注状態リストページ
    document.getElementById('showManualOrders').addEventListener('click', () => {
        document.getElementById('manualOrdersList').style.display = 'block';
        document.getElementById('autoOrdersList').style.display = 'none';
        window.loadManualOrders();
    });
    document.getElementById('showAutoOrders').addEventListener('click', () => {
        document.getElementById('manualOrdersList').style.display = 'none';
        document.getElementById('autoOrdersList').style.display = 'block';
        loadAutoOrders();
    });

    // カメラモーダル
    document.getElementById('closeModal').addEventListener('click', () => window.closeCamera());
    document.getElementById('captureBtn').addEventListener('click', () => window.capturePhoto());
    document.getElementById('cameraModal').addEventListener('click', (e) => {
        if (e.target.id === 'cameraModal') {
            window.closeCamera();
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
    if (!isPageAccessible(page)) {
        showError('このページを表示する権限がありません');
        return;
    }

    currentPage = page;

    // ナビゲーションボタンのactive状態を更新
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });

    // すべてのサブタブコンテナを非表示
    document.querySelectorAll('.subtab-container').forEach(container => {
        container.style.display = 'none';
    });

    // 入出庫タブの場合、表示できるサブタブを優先的に開く
    if (page === 'operations') {
        const subtabContainer = document.getElementById('operationsSubtabContainer');
        if (subtabContainer) {
            subtabContainer.style.display = 'block';
        }
        const defaultSubtab = getFirstAllowedOperationsSubtab();
        if (!defaultSubtab) {
            showError('入出庫ページの権限がありません');
            return;
        }
        if (typeof switchOperationsSubtab === 'function') {
            switchOperationsSubtab(defaultSubtab);
        }
        return;
    }

    // 発注タブの場合、表示できるサブタブを優先的に開く
    if (page === 'dispatch') {
        const subtabContainer = document.getElementById('dispatchSubtabContainer');
        if (subtabContainer) {
            subtabContainer.style.display = 'block';
        }
        const defaultSubtab = getFirstAllowedDispatchSubtab();
        if (!defaultSubtab) {
            showError('発注ページの権限がありません');
            return;
        }
        if (typeof switchDispatchSubtab === 'function') {
            switchDispatchSubtab(defaultSubtab);
        }
        return;
    }

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

    const targetId = pageMap[page];
    if (targetId) {
        const targetPage = document.getElementById(targetId);
        if (targetPage) {
            targetPage.classList.add('active');
        }
    }

    // ページタイトルを更新
    const titles = {
        'inventory': '📦 在庫一覧',
        'register': '🧰 消耗品管理',
        'operations': '↕️ 入出庫',
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
    if (titles[page]) {
        document.getElementById('pageTitle').textContent = titles[page];
    }

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
            currentUserInfo = data.user || {};
            pagePermissionMap = buildPermissionMap(currentUserInfo.page_permissions || [], 'page_name');
            tabPermissionMap = buildPermissionMap(currentUserInfo.tab_permissions || [], 'tab_name');

            const userName = currentUserInfo.full_name || currentUserInfo.username || 'ユーザー';
            const rolesText = (currentUserInfo.roles || '').trim();
            const roleLabel = rolesText ? `（${rolesText}）` : '';
            document.getElementById('currentUserName').textContent = `👤 ${userName}${roleLabel}`;

            applyPagePermissions();
        } else {
            // ログインしていない場合はログインページへ
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('ユーザー情報取得エラー:', error);
        window.location.href = '/login';
    }
}

function buildPermissionMap(items, keyField) {
    const map = {};
    if (!Array.isArray(items)) {
        return map;
    }
    items.forEach(item => {
        if (!item) return;
        let key = item[keyField];
        if (typeof key === 'string') {
            key = key.trim();
        }
        if (!key) return;
        map[key] = {
            can_view: Boolean(Number(item.can_view)),
            can_edit: Boolean(Number(item.can_edit))
        };
    });
    return map;
}

function hasPagePermission(pageName, action = 'view') {
    if (!pageName) return false;
    const permission = pagePermissionMap[pageName];
    if (!permission) return false;
    return action === 'edit' ? Boolean(permission.can_edit) : Boolean(permission.can_view);
}

function requirementSatisfied(requirements) {
    if (!requirements) return true;
    const names = Array.isArray(requirements) ? requirements : [requirements];
    return names.some(name => hasPagePermission(name));
}

function isPageAccessible(pageKey) {
    if (!pageKey) return true;
    const requirement = PAGE_PERMISSION_RULES[pageKey];
    if (!requirement) return true;
    return requirementSatisfied(requirement);
}

function getFirstAccessibleNavPage() {
    for (const key of NAV_DISPLAY_ORDER) {
        if (isPageAccessible(key)) {
            return key;
        }
    }
    return null;
}

function getFirstAllowedOperationsSubtab() {
    for (const key of OPERATION_SUBTABS) {
        if (isPageAccessible(key)) {
            return key;
        }
    }
    return null;
}

function getFirstAllowedDispatchSubtab() {
    for (const key of DISPATCH_SUBTABS) {
        if (isPageAccessible(key)) {
            return key;
        }
    }
    return null;
}

function applyPagePermissions() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        const pageKey = btn.dataset.page;
        const canView = isPageAccessible(pageKey);
        btn.style.display = canView ? '' : 'none';
        btn.disabled = !canView;
    });

    updateOperationsSubtabVisibility();
    updateDispatchSubtabVisibility();

    if (!isPageAccessible(currentPage)) {
        const fallback = getFirstAccessibleNavPage();
        if (fallback) {
            switchPage(fallback);
        } else {
            showError('表示できるページがありません。管理者にお問い合わせください。');
        }
    }
}

function updateOperationsSubtabVisibility() {
    document.querySelectorAll('#operationsSubtabContainer .subtab-btn').forEach(btn => {
        const subtabKey = btn.dataset.subtab;
        const canView = isPageAccessible(subtabKey);
        btn.style.display = canView ? '' : 'none';
        btn.disabled = !canView;
    });
}

function updateDispatchSubtabVisibility() {
    document.querySelectorAll('#dispatchSubtabContainer .subtab-btn').forEach(btn => {
        const subtabKey = btn.dataset.subtab;
        const canView = isPageAccessible(subtabKey);
        btn.style.display = canView ? '' : 'none';
        btn.disabled = !canView;
    });
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

function buildImageUrl(imagePath) {
    if (!imagePath) {
        return 'https://placehold.co/200x150?text=No+Image';
    }

    const pathStr = String(imagePath).trim();
    if (!pathStr) {
        return 'https://placehold.co/200x150?text=No+Image';
    }

    if (pathStr.startsWith('http://') || pathStr.startsWith('https://')) {
        return pathStr;
    }

    if (pathStr.startsWith('/uploads/')) {
        return pathStr;
    }

    if (pathStr.startsWith('uploads/')) {
        return '/' + pathStr;
    }

    return '/uploads/' + pathStr;
}

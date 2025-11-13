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
// 入出庫サブタブ機能
// ========================================

// 入出庫サブタブの切り替え
function switchOperationsSubtab(subtab) {
    // すべてのページコンテンツを非表示
    document.querySelectorAll('.page-content').forEach(content => {
        content.classList.remove('active');
    });

    // サブタブボタンのactive状態を更新
    document.querySelectorAll('#operationsSubtabContainer .subtab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`[data-subtab="${subtab}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }

    // 対応するページを表示
    const subtabPageMap = {
        'inbound': 'inboundPage',
        'outbound': 'outboundPage',
        'history': 'historyPage'
    };

    const pageId = subtabPageMap[subtab];
    if (pageId) {
        const page = document.getElementById(pageId);
        if (page) {
            page.classList.add('active');
        }
    }

    // ページタイトルを更新
    const subtabTitles = {
        'inbound': '📥 入庫',
        'outbound': '📤 出庫',
        'history': '📋 入出庫履歴'
    };
    document.getElementById('pageTitle').textContent = subtabTitles[subtab] || '↕️ 入出庫';

    // ページごとの初期化処理
    if (subtab === 'history') {
        if (typeof initHistoryPage === 'function') {
            initHistoryPage();
        }
    }
}

// サブタブボタンのイベントリスナーを設定
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#operationsSubtabContainer .subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const subtab = btn.dataset.subtab;
            switchOperationsSubtab(subtab);
        });
    });
});

// ========================================




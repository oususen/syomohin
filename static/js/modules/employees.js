// ========================================
// 従業員管理ページ
// ========================================

let currentEmployeesSubtab = 'list';
let employeesPageEventsBound = false;
let employeesEditAllowed = true;

function evaluateEmployeesEditPermission() {
    employeesEditAllowed =
        typeof hasPagePermission === 'function'
            ? hasPagePermission('従業員管理', 'edit')
            : true;
    return employeesEditAllowed;
}

function ensureEmployeesEditPermission() {
    if (!employeesEditAllowed) {
        showError('この操作を行う権限がありません');
        return false;
    }
    return true;
}

function toggleEmployeesSectionInputs(sectionId, enabled) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.querySelectorAll('input, select, textarea').forEach((el) => {
        if (el.dataset.permissionIgnore === 'true') return;
        el.disabled = !enabled;
    });
}

function setEmployeesButtonDisabled(buttonId, disabled) {
    const el = document.getElementById(buttonId);
    if (!el) return;
    el.disabled = disabled;
    el.classList.toggle('is-disabled', disabled);
}

function showEmployeesReadOnlyNotice(noticeId, visible) {
    const el = document.getElementById(noticeId);
    if (el) {
        el.hidden = !visible;
    }
}

function applyEmployeesPermissionLocks() {
    evaluateEmployeesEditPermission();
    toggleEmployeesSectionInputs('employeesAddSection', employeesEditAllowed);
    toggleEmployeesSectionInputs('employeesEditSection', employeesEditAllowed);
    setEmployeesButtonDisabled('employeeSubmitBtn', !employeesEditAllowed);
    setEmployeesButtonDisabled('employeeUpdateBtn', !employeesEditAllowed);
    setEmployeesButtonDisabled('employeeCsvImportBtn', !employeesEditAllowed);
    showEmployeesReadOnlyNotice('employeesAddReadOnlyNotice', !employeesEditAllowed);
    showEmployeesReadOnlyNotice('employeesEditReadOnlyNotice', !employeesEditAllowed);
}

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

    applyEmployeesPermissionLocks();

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
    } else if (target === 'roles') {
        loadRoleCounts();
    }
}

async function loadEmployeesList() {
    const tbody = document.getElementById('employeesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="loading">読み込み中...</td></tr>';

    try {
        const response = await fetch('/api/employees');
        const data = await response.json();

        if (data.success) {
            renderEmployeesList(data.data || []);
        } else {
            tbody.innerHTML = `<tr><td colspan="9" class="error">${data.error || '読み込みに失敗しました'}</td></tr>`;
        }
    } catch (error) {
        console.error('employees load error:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="error">読み込みに失敗しました</td></tr>';
    }
}

function renderEmployeesList(employees) {
    const tbody = document.getElementById('employeesTableBody');
    if (!tbody) return;

    if (employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #666;">従業員データがありません</td></tr>';
        return;
    }

    const html = employees.map(employee => {
        const id = employee.id || '-';
        const code = employee.code || '-';
        const name = employee.name || '-';
        const email = employee.email || '-';
        const department = employee.department || '-';
        const role = employee.role || '-';
        const createdAt = employee.created_at ? new Date(employee.created_at).toLocaleString('ja-JP') : '-';

        // 状態バッジ（常に有効と表示）
        const statusBadge = '<span style="background: #4caf50; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px;">有効</span>';
        const safeName = name.replace(/'/g, "&#39;");
        const actionButtons = employeesEditAllowed
            ? `
                <div style="display: flex; gap: 4px;">
                    <button class="btn-small btn-edit" onclick="editEmployee(${employee.id})" title="編集">✏️</button>
                    <button class="btn-small btn-delete" onclick="deleteEmployee(${employee.id}, '${safeName}')" title="削除">🗑️</button>
                </div>
            `
            : '<span style="color: #9e9e9e; font-size: 12px;">閲覧のみ</span>';

        return `
            <tr>
                <td>${id}</td>
                <td>${code}</td>
                <td><strong>${name}</strong></td>
                <td>${email}</td>
                <td>${department}</td>
                <td>${statusBadge}</td>
                <td>${role}</td>
                <td style="font-size: 13px; color: #666;">${createdAt}</td>
                <td>${actionButtons}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html;
}

async function submitEmployeeForm() {
    if (!ensureEmployeesEditPermission()) {
        return;
    }

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
    if (!ensureEmployeesEditPermission()) {
        return;
    }

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
    if (!ensureEmployeesEditPermission()) {
        return;
    }

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
    if (!ensureEmployeesEditPermission()) {
        return;
    }

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

// ロール別ユーザー数を取得
async function loadRoleCounts() {
    try {
        const response = await fetch('/api/employees');
        const data = await response.json();

        if (data.success && data.data) {
            const roleCounts = {
                '一般': 0,
                'マネージャー': 0,
                '管理者': 0
            };

            data.data.forEach(emp => {
                const role = emp.role || '一般';
                if (roleCounts.hasOwnProperty(role)) {
                    roleCounts[role]++;
                }
            });

            // 各ロールの件数を表示
            const generalCell = document.getElementById('roleCount_general');
            const managerCell = document.getElementById('roleCount_manager');
            const adminCell = document.getElementById('roleCount_admin');

            if (generalCell) generalCell.textContent = `${roleCounts['一般']} 人`;
            if (managerCell) managerCell.textContent = `${roleCounts['マネージャー']} 人`;
            if (adminCell) adminCell.textContent = `${roleCounts['管理者']} 人`;
        }
    } catch (error) {
        console.error('ロール数の取得エラー:', error);
    }
}

// 入出庫履歴ページ

// ========================================

let availableRoles = [];

async function initUsersPage() {
    console.log('ユーザー管理ページ初期化');

    // サブタブ切り替え
    const subtabs = document.querySelectorAll('#usersSubtabs .subtab-btn');
    subtabs.forEach(btn => {
        btn.addEventListener('click', async () => {
            const targetTab = btn.getAttribute('data-user-tab');

            // ボタンのアクティブ状態を更新
            subtabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // コンテンツの表示切り替え
            document.querySelectorAll('[data-user-content]').forEach(content => {
                content.hidden = content.getAttribute('data-user-content') !== targetTab;
            });

            // タブに応じてデータを読み込み
            if (targetTab === 'roles') {
                await loadRolesList();
            } else if (targetTab === 'permissions') {
                await loadPermissionsMatrix();
            }
        });
    });

    // ロールを読み込み
    await loadRoles();

    // ユーザー一覧を読み込み
    await loadUsersList();

    // 新規登録ボタン
    document.getElementById('userSubmitBtn').addEventListener('click', createUser);

    // 更新ボタン
    document.getElementById('userUpdateBtn').addEventListener('click', updateUser);
}

async function loadRoles() {
    try {
        const response = await fetch('/api/roles');
        const data = await response.json();

        if (data.success) {
            availableRoles = data.data;
            renderRoleCheckboxes('userRolesCheckboxes', []);
            renderRoleCheckboxes('editUserRolesCheckboxes', []);
        } else {
            showError('ロールの取得に失敗しました');
        }
    } catch (error) {
        console.error('ロール取得エラー:', error);
        showError('ロールの取得に失敗しました');
    }
}

function renderRoleCheckboxes(containerId, selectedRoleIds) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = availableRoles.map(role => {
        const checked = selectedRoleIds.includes(role.id) ? 'checked' : '';
        return `
            <label>
                <input type="checkbox" value="${role.id}" ${checked}>
                ${role.role_name}
            </label>
        `;
    }).join('');
}

async function loadUsersList() {
    try {
        const response = await fetch('/api/users');
        const data = await response.json();

        if (data.success) {
            displayUsersList(data.data);
        } else {
            showError(data.error || 'ユーザー一覧の取得に失敗しました');
        }
    } catch (error) {
        console.error('ユーザー一覧取得エラー:', error);
        showError('ユーザー一覧の取得に失敗しました');
    }
}

function displayUsersList(users) {
    const tbody = document.getElementById('usersTableBody');

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">ユーザーが登録されていません</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => {
        const createdAt = user.created_at ? new Date(user.created_at).toLocaleDateString('ja-JP') : '-';
        const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString('ja-JP') : '-';
        const status = user.is_active ?
            '<span style="color: #51cf66;">●</span> 有効' :
            '<span style="color: #999;">●</span> 無効';
        const roles = user.roles || '-';

        return `
            <tr>
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.full_name || '-'}</td>
                <td>${user.email || '-'}</td>
                <td>${roles}</td>
                <td>${status}</td>
                <td>${createdAt}</td>
                <td>${lastLogin}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="editUser(${user.id})">編集</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id}, '${user.username}')">削除</button>
                </td>
            </tr>
        `;
    }).join('');
}

function getSelectedRoleIds(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];

    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

async function createUser() {
    const username = document.getElementById('userUsername').value.trim();
    const fullName = document.getElementById('userFullName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const password = document.getElementById('userPassword').value;
    const isActive = document.getElementById('userActive').value === 'active';
    const roleIds = getSelectedRoleIds('userRolesCheckboxes');

    if (!username || !fullName || !password) {
        showError('ユーザー名、氏名、パスワードは必須です');
        return;
    }

    if (password.length < 6) {
        showError('パスワードは6文字以上で入力してください');
        return;
    }

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                full_name: fullName,
                email,
                password,
                is_active: isActive,
                role_ids: roleIds
            })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('ユーザーを登録しました');
            // フォームをクリア
            document.getElementById('userUsername').value = '';
            document.getElementById('userFullName').value = '';
            document.getElementById('userEmail').value = '';
            document.getElementById('userPassword').value = '';
            renderRoleCheckboxes('userRolesCheckboxes', []);
            // 一覧を再読み込み
            await loadUsersList();
            // 一覧タブに切り替え
            document.querySelector('[data-user-tab="list"]').click();
        } else {
            showError(data.error || 'ユーザー登録に失敗しました');
        }
    } catch (error) {
        console.error('ユーザー登録エラー:', error);
        showError('ユーザー登録に失敗しました');
    }
}

async function editUser(userId) {
    try {
        const response = await fetch(`/api/users/${userId}`);
        const data = await response.json();

        if (data.success) {
            const user = data.data;

            // フォームに値を設定
            document.getElementById('editUserId').value = user.id;
            document.getElementById('editUserUsername').value = user.username;
            document.getElementById('editUserFullName').value = user.full_name || '';
            document.getElementById('editUserEmail').value = user.email || '';
            document.getElementById('editUserPassword').value = '';
            document.getElementById('editUserActive').value = user.is_active ? 'active' : 'inactive';

            // ロールのチェックボックスを設定
            const roleIds = user.roles ? user.roles.map(r => r.id) : [];
            renderRoleCheckboxes('editUserRolesCheckboxes', roleIds);

            // モーダルを表示
            document.getElementById('userEditModal').style.display = 'flex';
        } else {
            showError(data.error || 'ユーザー情報の取得に失敗しました');
        }
    } catch (error) {
        console.error('ユーザー情報取得エラー:', error);
        showError('ユーザー情報の取得に失敗しました');
    }
}

function closeUserEditModal() {
    document.getElementById('userEditModal').style.display = 'none';
}

async function updateUser() {
    const userId = document.getElementById('editUserId').value;
    const username = document.getElementById('editUserUsername').value.trim();
    const fullName = document.getElementById('editUserFullName').value.trim();
    const email = document.getElementById('editUserEmail').value.trim();
    const password = document.getElementById('editUserPassword').value;
    const isActive = document.getElementById('editUserActive').value === 'active';
    const roleIds = getSelectedRoleIds('editUserRolesCheckboxes');

    if (!username || !fullName) {
        showError('ユーザー名と氏名は必須です');
        return;
    }

    if (password && password.length < 6) {
        showError('パスワードは6文字以上で入力してください');
        return;
    }

    try {
        const body = {
            username,
            full_name: fullName,
            email,
            is_active: isActive,
            role_ids: roleIds
        };

        // パスワードが入力されている場合のみ含める
        if (password) {
            body.password = password;
        }

        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('ユーザー情報を更新しました');
            // モーダルを閉じる
            closeUserEditModal();
            // 一覧を再読み込み
            await loadUsersList();
        } else {
            showError(data.error || 'ユーザー情報の更新に失敗しました');
        }
    } catch (error) {
        console.error('ユーザー更新エラー:', error);
        showError('ユーザー情報の更新に失敗しました');
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`ユーザー「${username}」を削除してもよろしいですか？`)) {
        return;
    }

    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('ユーザーを削除しました');
            await loadUsersList();
        } else {
            showError(data.error || 'ユーザーの削除に失敗しました');
        }
    } catch (error) {
        console.error('ユーザー削除エラー:', error);
        showError('ユーザーの削除に失敗しました');
    }
}

async function loadRolesList() {
    try {
        const [rolesResponse, usersResponse] = await Promise.all([
            fetch('/api/roles'),
            fetch('/api/users')
        ]);

        const rolesData = await rolesResponse.json();
        const usersData = await usersResponse.json();

        if (rolesData.success && usersData.success) {
            displayRolesList(rolesData.data, usersData.data);
            // ドロップダウンを設定
            populateAssignmentDropdowns(rolesData.data, usersData.data);
        } else {
            showError('ロール一覧の取得に失敗しました');
        }
    } catch (error) {
        console.error('ロール一覧取得エラー:', error);
        showError('ロール一覧の取得に失敗しました');
    }
}

function displayRolesList(roles, users) {
    const tbody = document.getElementById('rolesTableBody');

    if (!roles || roles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">ロールが登録されていません</td></tr>';
        return;
    }

    // 各ロールのユーザー数をカウント
    const roleCounts = {};
    users.forEach(user => {
        if (user.roles) {
            const roleNames = user.roles.split(', ');
            roleNames.forEach(roleName => {
                roleCounts[roleName] = (roleCounts[roleName] || 0) + 1;
            });
        }
    });

    tbody.innerHTML = roles.map(role => {
        const createdAt = role.created_at ? new Date(role.created_at).toLocaleDateString('ja-JP') : '-';
        const userCount = roleCounts[role.role_name] || 0;

        return `
            <tr>
                <td>${role.id}</td>
                <td><strong>${role.role_name}</strong></td>
                <td>${role.description || '-'}</td>
                <td>${userCount} 名</td>
                <td>${createdAt}</td>
            </tr>
        `;
    }).join('');
}

async function loadPermissionsMatrix() {
    try {
        const response = await fetch('/api/roles');
        const data = await response.json();

        if (data.success) {
            // ロール選択ドロップダウンを設定
            populatePermissionRoleSelect(data.data);
        } else {
            showError('権限設定の取得に失敗しました');
        }
    } catch (error) {
        console.error('権限設定取得エラー:', error);
        showError('権限設定の取得に失敗しました');
    }
}

function displayPermissionsMatrix(roles) {
    const tbody = document.getElementById('permissionsTableBody');

    // ページ一覧（実際のシステムのページに合わせて調整）
    const pages = [
        '在庫一覧',
        '消耗品管理',
        '出庫',
        '入庫',
        '注文依頼',
        '発注状態',
        '発注',
        '購入先管理',
        '従業員管理',
        'ユーザー管理',
        '履歴'
    ];

    // ロールを順番に並べる
    const roleOrder = ['一般', 'リーダ', '班長', '係長', '課長', '部長'];
    const sortedRoles = roleOrder.map(name => roles.find(r => r.role_name === name)).filter(r => r);

    tbody.innerHTML = pages.map(pageName => {
        const cells = sortedRoles.map(role => {
            // 簡易的な権限判定（実際のデータベースから取得する場合は修正が必要）
            const hasAccess = determineAccess(role.role_name, pageName);
            const icon = hasAccess ? '✓' : '−';
            const color = hasAccess ? '#4caf50' : '#ccc';

            return `<td style="text-align: center; color: ${color}; font-weight: bold;">${icon}</td>`;
        }).join('');

        return `
            <tr>
                <td><strong>${pageName}</strong></td>
                ${cells}
            </tr>
        `;
    }).join('');
}

function determineAccess(roleName, pageName) {
    // 権限マトリックスの簡易版（init_roles.sqlの内容に基づく）
    const permissions = {
        '一般': ['在庫一覧', '出庫', '入庫', '注文依頼', '履歴'],
        'リーダ': ['在庫一覧', '出庫', '入庫', '注文依頼', '発注状態', '履歴'],
        '班長': ['在庫一覧', '消耗品管理', '出庫', '入庫', '注文依頼', '発注状態', '発注', '履歴'],
        '係長': ['在庫一覧', '消耗品管理', '出庫', '入庫', '注文依頼', '発注状態', '発注', '購入先管理', '履歴'],
        '課長': ['在庫一覧', '消耗品管理', '出庫', '入庫', '注文依頼', '発注状態', '発注', '購入先管理', '従業員管理', '履歴'],
        '部長': ['在庫一覧', '消耗品管理', '出庫', '入庫', '注文依頼', '発注状態', '発注', '購入先管理', '従業員管理', 'ユーザー管理', '履歴']
    };

    return permissions[roleName]?.includes(pageName) || false;
}

// ロール割り当て用のドロップダウンを設定
function populateAssignmentDropdowns(roles, users) {
    const userSelect = document.getElementById('assignUserSelect');
    const roleSelect = document.getElementById('assignRoleSelect');

    // ユーザードロップダウン
    userSelect.innerHTML = '<option value="">ユーザーを選択...</option>' +
        users.map(user => `<option value="${user.id}" data-roles="${user.roles || ''}">${user.full_name} (${user.username})</option>`).join('');

    // ロールドロップダウン
    roleSelect.innerHTML = '<option value="">ロールを選択...</option>' +
        roles.map(role => `<option value="${role.id}">${role.role_name}</option>`).join('');

    // ユーザー選択時に現在のロールを表示
    userSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const roles = selectedOption.getAttribute('data-roles');
        showCurrentUserRoles(roles);
    });
}

// 選択したユーザーの現在のロールを表示
function showCurrentUserRoles(rolesStr) {
    const container = document.getElementById('currentUserRoles');
    const rolesList = document.getElementById('currentRolesList');

    if (!rolesStr) {
        container.style.display = 'none';
        return;
    }

    const roles = rolesStr.split(', ');
    rolesList.innerHTML = roles.map(role =>
        `<span style="padding: 6px 12px; background: #e3f2fd; color: #1976d2; border-radius: 4px; font-size: 13px;">${role}</span>`
    ).join('');
    container.style.display = 'block';
}

// ユーザーにロールを割り当て
async function assignRoleToUser() {
    const userId = document.getElementById('assignUserSelect').value;
    const roleId = document.getElementById('assignRoleSelect').value;

    if (!userId || !roleId) {
        showError('ユーザーとロールを選択してください');
        return;
    }

    try {
        const response = await fetch(`/api/users/${userId}/roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_id: parseInt(roleId) })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('ロールを割り当てました');
            // リストを再読み込み
            await loadRolesList();
        } else {
            showError(data.error || 'ロールの割り当てに失敗しました');
        }
    } catch (error) {
        console.error('ロール割り当てエラー:', error);
        showError('ロールの割り当てに失敗しました');
    }
}

// 権限設定用のロールドロップダウンを設定
function populatePermissionRoleSelect(roles) {
    const select = document.getElementById('permissionRoleSelect');
    select.innerHTML = '<option value="">ロールを選択...</option>' +
        roles.map(role => `<option value="${role.id}" data-role-name="${role.role_name}">${role.role_name}</option>`).join('');
}

// 選択したロールの権限を読み込み
async function loadPermissionsForRole() {
    const select = document.getElementById('permissionRoleSelect');
    const roleId = select.value;

    if (!roleId) {
        document.getElementById('permissionsEditorContainer').style.display = 'none';
        return;
    }

    const roleName = select.options[select.selectedIndex].getAttribute('data-role-name');

    try {
        const response = await fetch(`/api/permissions/${roleId}`);
        const data = await response.json();

        if (data.success) {
            displayPermissionsEditor(roleName, data.page_permissions, data.tab_permissions);
        } else {
            showError('権限の取得に失敗しました');
        }
    } catch (error) {
        console.error('権限取得エラー:', error);
        showError('権限の取得に失敗しました');
    }
}

// 権限編集画面を表示
function displayPermissionsEditor(roleName, pagePermissions, tabPermissions) {
    const container = document.getElementById('permissionsEditorContainer');
    const pageTableBody = document.getElementById('pagePermissionsTableBody');
    const tabTableBody = document.getElementById('tabPermissionsTableBody');

    // ページ権限
    const pages = [
        '在庫一覧', '消耗品管理', '出庫', '入庫', '注文依頼',
        '発注状態', '発注', '購入先管理', '従業員管理', 'ユーザー管理', '履歴'
    ];

    pageTableBody.innerHTML = pages.map(pageName => {
        const perm = pagePermissions.find(p => p.page_name === pageName) || { can_view: 0, can_edit: 0 };
        return `
            <tr>
                <td><strong>${pageName}</strong></td>
                <td style="text-align: center;">
                    <input type="checkbox" data-page="${pageName}" data-type="view" ${perm.can_view ? 'checked' : ''}>
                </td>
                <td style="text-align: center;">
                    <input type="checkbox" data-page="${pageName}" data-type="edit" ${perm.can_edit ? 'checked' : ''}>
                </td>
            </tr>
        `;
    }).join('');

    // タブ権限
    const tabs = ['新規登録', '個別編集', '一括編集', 'CSV取込'];

    tabTableBody.innerHTML = tabs.map(tabName => {
        const perm = tabPermissions.find(t => t.tab_name === tabName) || { can_view: 0, can_edit: 0 };
        return `
            <tr>
                <td><strong>${tabName}</strong></td>
                <td style="text-align: center;">
                    <input type="checkbox" data-tab="${tabName}" data-type="view" ${perm.can_view ? 'checked' : ''}>
                </td>
                <td style="text-align: center;">
                    <input type="checkbox" data-tab="${tabName}" data-type="edit" ${perm.can_edit ? 'checked' : ''}>
                </td>
            </tr>
        `;
    }).join('');

    container.style.display = 'block';
}

// 権限を保存
async function savePermissions() {
    const select = document.getElementById('permissionRoleSelect');
    const roleId = select.value;

    if (!roleId) {
        showError('ロールを選択してください');
        return;
    }

    // ページ権限を収集
    const pagePermissions = [];
    document.querySelectorAll('#pagePermissionsTableBody tr').forEach(row => {
        const pageName = row.querySelector('td strong').textContent;
        const canView = row.querySelector('input[data-type="view"]').checked ? 1 : 0;
        const canEdit = row.querySelector('input[data-type="edit"]').checked ? 1 : 0;
        pagePermissions.push({ page_name: pageName, can_view: canView, can_edit: canEdit });
    });

    // タブ権限を収集
    const tabPermissions = [];
    document.querySelectorAll('#tabPermissionsTableBody tr').forEach(row => {
        const tabName = row.querySelector('td strong').textContent;
        const canView = row.querySelector('input[data-type="view"]').checked ? 1 : 0;
        const canEdit = row.querySelector('input[data-type="edit"]').checked ? 1 : 0;
        tabPermissions.push({ tab_name: tabName, can_view: canView, can_edit: canEdit });
    });

    try {
        const response = await fetch(`/api/permissions/${roleId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                page_permissions: pagePermissions,
                tab_permissions: tabPermissions
            })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('権限を保存しました');
        } else {
            showError(data.error || '権限の保存に失敗しました');
        }
    } catch (error) {
        console.error('権限保存エラー:', error);
        showError('権限の保存に失敗しました');
    }
}


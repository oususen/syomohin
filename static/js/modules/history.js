// ========================================
// 履歴ページ
// ========================================

let historyPageInitialized = false;

function initHistoryPage() {
    // 部署一覧を読み込み
    loadHistoryDepartments();

    // イベントリスナーを設定（初回のみ）
    if (!historyPageInitialized) {
        document.getElementById('searchHistory').addEventListener('click', loadHistory);
        document.getElementById('historyType').addEventListener('change', loadHistory);
        document.getElementById('historyDepartment').addEventListener('change', loadHistory);
        document.getElementById('historySearch').addEventListener('input', debounce(loadHistory, 300));
        historyPageInitialized = true;
    }

    // 履歴を読み込み
    loadHistory();
}

async function loadHistoryDepartments() {
    try {
        const response = await fetch('/api/history/departments');
        const data = await response.json();

        if (data.success && data.departments) {
            const select = document.getElementById('historyDepartment');
            const currentValue = select.value;

            select.innerHTML = '<option value="">すべて</option>';
            data.departments.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept;
                option.textContent = dept;
                select.appendChild(option);
            });

            // 以前の選択を復元
            if (currentValue) {
                select.value = currentValue;
            }
        }
    } catch (error) {
        console.error('部署一覧の取得に失敗:', error);
    }
}

async function loadHistory() {
    const type = document.getElementById('historyType').value;
    const department = document.getElementById('historyDepartment').value;
    const startDate = document.getElementById('historyStartDate').value;
    const endDate = document.getElementById('historyEndDate').value;
    const searchText = document.getElementById('historySearch').value.trim();

    const params = new URLSearchParams();
    if (type !== 'all') params.append('type', type);
    if (department) params.append('department', department);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (searchText) params.append('search_text', searchText);

    try {
        const response = await fetch(`/api/history?${params.toString()}`);
        const data = await response.json();

        if (data.success) {
            displayHistory(data.data);
            document.getElementById('historyCount').textContent = `表示件数: ${data.count}`;
        } else {
            showError(data.error || '履歴の取得に失敗しました');
        }
    } catch (error) {
        console.error('履歴取得エラー:', error);
        showError('履歴の取得に失敗しました');
    }
}

function displayHistory(history) {
    const tbody = document.getElementById('historyTableBody');

    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading">データがありません</td></tr>';
        return;
    }

    tbody.innerHTML = history.map(item => {
        const date = item.date ? new Date(item.date).toLocaleString('ja-JP') : '-';
        const type = item.type || '-';
        const typeBadge = type === '出庫'
            ? '<span style="background: #ff6b6b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">出庫</span>'
            : '<span style="background: #51cf66; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">入庫</span>';

        return `
            <tr>
                <td>${typeBadge}</td>
                <td>${date}</td>
                <td>${item.code || '-'}</td>
                <td>${item.name || '-'}</td>
                <td>${item.quantity || 0}</td>
                <td>${item.employee_name || '-'}</td>
                <td>${item.employee_department || '-'}</td>
                <td>¥${(item.unit_price || 0).toLocaleString()}</td>
                <td>¥${(item.total_amount || 0).toLocaleString()}</td>
                <td>${item.note || '-'}</td>
            </tr>
        `;
    }).join('');
}


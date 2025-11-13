// ========================================
// 新規登録ページ
// ========================================

const CSV_TEMPLATE_SAMPLE = [
    '\uFEFFコード,発注コード,品名,カテゴリ,単位,在庫数,安全在庫,単価,発注単位,仕入先,保管場所,備考,注文状態,欠品状態',
    'TIP-12-EG-1,S01,EGチップ Sサイズ,実験用品,個,10,5,1200,1,LabMart,試薬A,テスト用データ,未発注,在庫あり',
    'NOZUR-20-DB-1,S01,ノズル 20mm,消耗品A,本,4,8,850,1,FactoryDirect,備品1,安全在庫割れ対策,様子見,要注意',
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
        console.warn('テンプレート取得に失敗したためローカルデータに切り替えます。', error);
        const blob = new Blob([CSV_TEMPLATE_SAMPLE], { type: 'text/csv;charset=utf-8;' });
        triggerFileDownload(blob, filename);
        showSuccess('サーバーに接続できなかったため、ローカルでサンプルを生成しました');
    }
}

// 購入先一覧を読み込む
async function loadSuppliers() {
    try {
        const response = await fetch('/api/suppliers');
        const result = await response.json();

        if (result.success) {
            // 新規登録フォームの購入先ドロップダウンを更新
            const registerSelect = document.getElementById('registerSupplier');
            if (registerSelect) {
                registerSelect.innerHTML = '<option value="">-- 購入先を選択 --</option>';
                result.data.forEach(supplier => {
                    const option = document.createElement('option');
                    option.value = supplier.id;
                    option.textContent = supplier.name;
                    registerSelect.appendChild(option);
                });
            }

            // 個別編集フォームの購入先ドロップダウンを更新
            const editSelect = document.getElementById('editSupplier');
            if (editSelect) {
                const currentValue = editSelect.value; // 現在の選択値を保存
                editSelect.innerHTML = '<option value="">-- 購入先を選択 --</option>';
                result.data.forEach(supplier => {
                    const option = document.createElement('option');
                    option.value = supplier.id;
                    option.textContent = supplier.name;
                    editSelect.appendChild(option);
                });
                // 以前の選択値を復元
                if (currentValue) {
                    editSelect.value = currentValue;
                }
            }
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

    // 画像ファイルの取得
    const imageInput = document.getElementById('registerImage');
    const imageFile = imageInput?.files[0];

    // FormDataを使用して画像を含めて送信
    const formData = new FormData();
    formData.append('code', code);
    formData.append('order_code', document.getElementById('registerOrderCode').value.trim());
    formData.append('name', name);
    formData.append('category', document.getElementById('registerCategory').value.trim());
    formData.append('unit', document.getElementById('registerUnit').value.trim() || '個');
    formData.append('stock_quantity', parseInt(document.getElementById('registerStockQty').value) || 0);
    formData.append('safety_stock', parseInt(document.getElementById('registerSafetyStock').value) || 0);
    formData.append('unit_price', parseFloat(document.getElementById('registerUnitPrice').value) || 0);
    formData.append('order_unit', parseInt(document.getElementById('registerOrderUnit').value) || 1);

    const supplierId = document.getElementById('registerSupplier').value;
    if (supplierId) {
        formData.append('supplier_id', parseInt(supplierId));
    }

    formData.append('storage_location', document.getElementById('registerStorageLocation').value.trim());
    formData.append('note', document.getElementById('registerNote').value.trim());

    // 画像ファイルがあれば追加
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const response = await fetch('/api/consumables', {
            method: 'POST',
            body: formData // FormDataを送信（Content-Typeヘッダーは自動設定される）
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
            // 画像をクリア
            if (imageInput) {
                imageInput.value = '';
            }
            const imagePreviewBox = document.getElementById('registerImagePreviewBox');
            if (imagePreviewBox) {
                imagePreviewBox.hidden = true;
            }
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
    if (!registerPageEventsBound) {
        setupRegisterSubtabs();

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

        const editLoadBtn = document.getElementById('editLoadBtn');
        if (editLoadBtn) {
            editLoadBtn.addEventListener('click', (event) => {
                event.preventDefault();
                editGalleryLoaded = false;
                loadEditGallery();
            });
        }

        const editSearchInput = document.getElementById('editSearchCode');
        if (editSearchInput) {
            editSearchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    editGalleryLoaded = false;
                    loadEditGallery();
                }
            });
        }

        const editSubmitBtn = document.getElementById('editSubmitBtn');
        if (editSubmitBtn) {
            editSubmitBtn.addEventListener('click', submitEditForm);
        }

        // 画像アップロード機能のイベントリスナー
        setupImageUpload('register');
        setupImageUpload('edit');

        registerPageEventsBound = true;
    }

    loadSuppliers();

    if (currentRegisterSubtab === 'edit') {
        ensureEditGalleryLoaded();
    }
}

function setupRegisterSubtabs() {
    const container = document.getElementById('registerSubtabs');
    if (!container) return;
    container.querySelectorAll('.subtab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            switchRegisterSubtab(btn.dataset.detailTab);
        });
    });
    switchRegisterSubtab(currentRegisterSubtab);
}

function switchRegisterSubtab(target) {
    if (!target) return;
    currentRegisterSubtab = target;

    document.querySelectorAll('#registerSubtabs .subtab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.detailTab === target);
    });

    document.querySelectorAll('[data-detail-tab-content]').forEach((section) => {
        const isTarget = section.dataset.detailTabContent === target;
        section.hidden = !isTarget;
    });

    if (target === 'edit') {
        ensureEditGalleryLoaded();
    }
}

function ensureEditGalleryLoaded(force = false) {
    if (force) {
        editGalleryLoaded = false;
    }
    if (editGalleryLoaded) {
        return;
    }
    loadEditGallery();
}

async function loadEditGallery() {
    const container = document.getElementById('editGalleryContainer');
    if (!container) return;

    container.innerHTML = '<p class="loading">消耗品ギャラリーを読み込み中...</p>';

    try {
        const params = new URLSearchParams();
        const searchValue = document.getElementById('editSearchCode')?.value.trim();
        if (searchValue) {
            params.append('search_text', searchValue);
        }
        const query = params.toString();
        const response = await fetch(`/api/inventory${query ? `?${query}` : ''}`);
        const data = await response.json();

        if (data.success) {
            editGalleryCache = data.data || [];
            editGalleryLoaded = true;
            renderEditGallery(editGalleryCache);
        } else {
            container.innerHTML = `<p class="error">${data.error || 'ギャラリーの読み込みに失敗しました'}</p>`;
        }
    } catch (error) {
        console.error('edit gallery load error:', error);
        container.innerHTML = '<p class="error">ギャラリーの読み込みに失敗しました</p>';
    }
}

function renderEditGallery(items) {
    const container = document.getElementById('editGalleryContainer');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>対象の消耗品が見つかりません。</p>
                <p>検索条件を変更して再度お試しください。</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map((item, index) => {
        const code = pickField(item, ['コード', 'code']);
        const name = pickField(item, ['品名', 'name']);
        const category = pickField(item, ['カテゴリ', 'category']);
        const unit = pickField(item, ['単位', 'unit']) || '';
        const stock = parseInt(pickField(item, ['在庫数', 'stock_quantity']), 10) || 0;
        const safety = parseInt(pickField(item, ['安全在庫', 'safety_stock']), 10) || 0;
        const supplier = pickField(item, ['購入先', 'supplier_name']) || '-';
        const shortageStatus = pickField(item, ['欠品状態', 'shortage_status']) || '不明';
        const orderStatus = pickField(item, ['注文状態', 'order_status']) || '不明';
        const imagePath = pickField(item, ['画像URL', 'image_path']);
        const imageUrl = buildImageUrl(imagePath);
        const shortageClass = getStatusClass(shortageStatus, 'shortage');
        const orderClass = getStatusClass(orderStatus, 'order');

        return `
            <div class="inventory-card compact">
                <div class="card-main compact">
                    <div class="card-image-wrapper">
                        <img src="${imageUrl}" alt="${name || code || 'item'}" class="card-image-large" loading="lazy">
                    </div>
                    <div class="card-info">
                        <div class="card-title-row">
                            <div class="item-name">${name || '-'}</div>
                            <div class="item-code">コード: ${code || '-'}</div>
                        </div>
                        <div class="card-meta-row">
                            <span>カテゴリ: ${category || '-'}</span>
                            <span>購入先: ${supplier}</span>
                        </div>
                        <div class="card-meta-row">
                            <span>在庫: ${stock} ${unit}</span>
                            <span>安全在庫: ${safety} ${unit}</span>
                        </div>
                        <div class="status-row">
                            <span class="status-pill ${shortageClass}">欠品: ${shortageStatus}</span>
                            <span class="status-pill ${orderClass}">注文: ${orderStatus}</span>
                        </div>
                        <button class="btn btn-primary edit-gallery-select" type="button" onclick="handleEditCardSelect(${index})">
                            このアイテムを編集
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function handleEditCardSelect(index) {
    const item = editGalleryCache[index];
    if (!item) return;
    updateEditPreview(item);
    await loadEditDetail(item);
}

function toSafeInt(value) {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function calculateShortageStatusLabel(stock, safety) {
    const stockVal = Number.isFinite(stock) ? stock : 0;
    const safetyVal = Number.isFinite(safety) ? safety : 0;
    if (stockVal <= 0) return '欠品';
    if (stockVal <= safetyVal) return '要注意';
    return '在庫あり';
}

function ensureShortageOption(select, value) {
    if (!select || !value) return;
    const exists = Array.from(select.options).some(opt => opt.value === value);
    if (!exists) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    }
}

function setEditShortageStatusValue(value) {
    const select = document.getElementById('editShortageStatus');
    if (!select) return;
    if (value) {
        ensureShortageOption(select, value);
        select.value = value;
    } else {
        select.value = '';
    }
}

function autoUpdateEditShortageStatus() {
    const stockInput = document.getElementById('editStockQty');
    const safetyInput = document.getElementById('editSafetyStock');
    if (!stockInput || !safetyInput) {
        return;
    }
    const status = calculateShortageStatusLabel(
        toSafeInt(stockInput.value),
        toSafeInt(safetyInput.value)
    );
    setEditShortageStatusValue(status);
}

function updateEditPreview(item) {
    const preview = document.getElementById('editItemPreview');
    if (!preview) return;

    const code = pickField(item, ['コード', 'code']);
    const name = pickField(item, ['品名', 'name']);
    const stock = pickField(item, ['在庫数', 'stock_quantity']);
    const safety = pickField(item, ['安全在庫', 'safety_stock']);
    const supplier = pickField(item, ['購入先', 'supplier_name']);

    preview.innerHTML = `
        <div><strong>品名:</strong> ${name || '-'}</div>
        <div><strong>コード:</strong> ${code || '-'}</div>
        <div><strong>在庫:</strong> ${stock || '-'} / 安全在庫 ${safety || '-'}</div>
        <div><strong>購入先:</strong> ${supplier || '-'}</div>
    `;
    preview.hidden = false;
}

function getItemId(item) {
    return item?.id ?? item?.ID ?? item?.Id ?? null;
}

async function loadEditDetail(summary) {
    const consumableId = getItemId(summary);
    if (!consumableId) {
        showError('選択したアイテムのIDを取得できませんでした');
        return;
    }

    try {
        const response = await fetch(`/api/consumables/${consumableId}`);
        const data = await response.json();
        if (data.success) {
            populateEditForm(data.data);
        } else {
            showError(data.error || '詳細情報の取得に失敗しました');
        }
    } catch (error) {
        console.error('loadEditDetail error:', error);
        showError('詳細情報の取得に失敗しました');
    }
}

function populateEditForm(detail) {
    if (!detail) return;
    currentEditItemId = detail.id;

    const fields = document.getElementById('editFormFields');
    if (!fields) return;

    const setValue = (id, value = '') => {
        const el = document.getElementById(id);
        if (el) {
            el.value = value ?? '';
        }
    };

    setValue('editCode', detail.code);
    setValue('editOrderCode', detail.order_code);
    setValue('editName', detail.name);
    setValue('editCategory', detail.category);
    setValue('editUnit', detail.unit);
    setValue('editStockQty', detail.stock_quantity);
    setValue('editSafetyStock', detail.safety_stock);
    setValue('editUnitPrice', detail.unit_price);
    setValue('editOrderUnit', detail.order_unit);
    setValue('editStorageLocation', detail.storage_location);
    setValue('editNote', detail.note);
    setEditShortageStatusValue(detail.shortage_status);

    const supplierSelect = document.getElementById('editSupplier');
    if (supplierSelect) {
        supplierSelect.value = detail.supplier_id || '';
    }

    // 既存の画像を表示
    const imagePath = detail.image_path;
    if (imagePath) {
        setImagePreview('edit', imagePath);
        const hiddenPath = document.getElementById('editImagePath');
        if (hiddenPath) {
            hiddenPath.value = imagePath;
        }
    } else {
        // 画像がない場合はプレビューを非表示
        const imagePreviewBox = document.getElementById('editImagePreviewBox');
        if (imagePreviewBox) {
            imagePreviewBox.hidden = true;
        }
        // 入力フィールドもクリア
        const imageInput = document.getElementById('editImage');
        if (imageInput) {
            imageInput.value = '';
        }
    }

    fields.hidden = false;
}

async function submitEditForm() {
    if (!currentEditItemId) {
        showError('編集するアイテムを選択してください');
        return;
    }

    // 画像ファイルの取得
    const imageInput = document.getElementById('editImage');
    const imageFile = imageInput?.files[0];

    // FormDataを使用して画像を含めて送信
    const formData = new FormData();
    formData.append('order_code', document.getElementById('editOrderCode').value.trim());
    formData.append('name', document.getElementById('editName').value.trim());
    formData.append('category', document.getElementById('editCategory').value.trim());
    formData.append('unit', document.getElementById('editUnit').value.trim());
    formData.append('stock_quantity', parseInt(document.getElementById('editStockQty').value, 10) || 0);
    formData.append('safety_stock', parseInt(document.getElementById('editSafetyStock').value, 10) || 0);
    formData.append('unit_price', parseFloat(document.getElementById('editUnitPrice').value) || 0);
    formData.append('order_unit', parseInt(document.getElementById('editOrderUnit').value, 10) || 1);

    const supplierId = document.getElementById('editSupplier').value;
    if (supplierId) {
        formData.append('supplier_id', parseInt(supplierId, 10));
    }

    formData.append('storage_location', document.getElementById('editStorageLocation').value.trim());
    formData.append('note', document.getElementById('editNote').value.trim());
    const shortageStatusSelect = document.getElementById('editShortageStatus');
    if (shortageStatusSelect && shortageStatusSelect.value) {
        formData.append('shortage_status', shortageStatusSelect.value.trim());
    }

    // 画像ファイルがあれば追加
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const response = await fetch(`/api/consumables/${currentEditItemId}`, {
            method: 'PUT',
            body: formData // FormDataを送信
        });

        const result = await response.json();
        if (result.success) {
            showSuccess('内容を更新しました');
            editGalleryLoaded = false;
            await loadEditGallery();
            await loadInventory();
        } else {
            showError(result.error || '更新に失敗しました');
        }
    } catch (error) {
        console.error('submitEditForm error:', error);
        showError('更新に失敗しました');
    }
}

// 画像アップロード関連
function setupImageUpload(prefix) {
    const imageInput = document.getElementById(`${prefix}Image`);
    const imagePreviewBox = document.getElementById(`${prefix}ImagePreviewBox`);
    const imageClearBtn = document.getElementById(`${prefix}ImageClearBtn`);

    if (!imageInput || !imagePreviewBox) return;

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                showError('画像ファイルは5MB以下にしてください');
                imageInput.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = imagePreviewBox.querySelector('img');
                if (img) {
                    img.src = event.target.result;
                    imagePreviewBox.hidden = false;
                }
            };
            reader.readAsDataURL(file);
        }
    });

    if (imageClearBtn) {
        imageClearBtn.addEventListener('click', () => {
            imageInput.value = '';
            imagePreviewBox.hidden = true;
            const img = imagePreviewBox.querySelector('img');
            if (img) {
                img.src = '';
            }
            const hiddenPath = document.getElementById(`${prefix}ImagePath`);
            if (hiddenPath) {
                hiddenPath.value = '';
            }
        });
    }
}

function setImagePreview(prefix, imageUrl) {
    const imagePreviewBox = document.getElementById(`${prefix}ImagePreviewBox`);
    const img = imagePreviewBox?.querySelector('img');

    if (imageUrl && img) {
        img.src = buildImageUrl(imageUrl);
        imagePreviewBox.hidden = false;
    } else if (imagePreviewBox) {
        imagePreviewBox.hidden = true;
    }
}

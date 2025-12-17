// アプリケーション状態
class ShoppingApp {
    constructor() {
        this.inventory = [];
        this.janProducts = {};
        this.consumeHistory = [];
        this.currentView = 'inventory';
        this.scanner = null;
        this.currentTargetInput = null;
        this.searchTimeout = null;
        this.isAuthenticated = false;
        this.validInviteCode = '1595';
        this.init();
    }

    async init() {
        // コンポーネントを読み込み
        await window.componentLoader.loadAllComponents();

        this.loadData();
        this.checkAuthentication();
        this.bindEvents();
        this.hideLoading();

        if (this.isAuthenticated) {
            this.showMainApp();
            this.updateInventoryView();
            this.updateJanProductList();
        } else {
            this.showInviteScreen();
        }
    }

    // ローカルストレージからデータを読み込み
    loadData() {
        const savedInventory = localStorage.getItem('shoppingAppInventory');
        if (savedInventory) {
            this.inventory = JSON.parse(savedInventory);
        }

        const savedJanProducts = localStorage.getItem('shoppingAppJanProducts');
        if (savedJanProducts) {
            this.janProducts = JSON.parse(savedJanProducts);
        }

        const savedConsumeHistory = localStorage.getItem('shoppingAppConsumeHistory');
        if (savedConsumeHistory) {
            this.consumeHistory = JSON.parse(savedConsumeHistory);
        }

        const savedAuthStatus = localStorage.getItem('shoppingAppAuthenticated');
        if (savedAuthStatus) {
            this.isAuthenticated = JSON.parse(savedAuthStatus);
        }
    }

    // データをローカルストレージに保存
    saveData() {
        localStorage.setItem('shoppingAppInventory', JSON.stringify(this.inventory));
        localStorage.setItem('shoppingAppJanProducts', JSON.stringify(this.janProducts));
        localStorage.setItem('shoppingAppConsumeHistory', JSON.stringify(this.consumeHistory));
        localStorage.setItem('shoppingAppAuthenticated', JSON.stringify(this.isAuthenticated));
    }

    // イベントリスナーを設定
    bindEvents() {
        // ナビゲーション
        document.getElementById('inventory-tab').addEventListener('click', () => this.showView('inventory'));
        document.getElementById('add-item-tab').addEventListener('click', () => this.showView('add-item'));
        document.getElementById('history-tab').addEventListener('click', () => this.showView('history'));
        document.getElementById('admin-tab').addEventListener('click', () => this.showView('admin'));

        // ソート
        document.getElementById('sort-select').addEventListener('change', () => this.updateInventoryView());

        // フォーム送信
        document.getElementById('add-item-form').addEventListener('submit', (e) => this.handleAddItem(e));
        document.getElementById('admin-form').addEventListener('submit', (e) => this.handleAdminAdd(e));

        // カメラ
        document.getElementById('scan-btn').addEventListener('click', () => this.openCamera('jan-input'));
        document.getElementById('admin-scan-btn').addEventListener('click', () => this.openCamera('admin-jan'));
        document.getElementById('stop-camera-btn').addEventListener('click', () => this.closeCamera());
        document.querySelector('.close').addEventListener('click', () => this.closeCamera());

        // モーダル外クリック
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('camera-modal');
            if (e.target === modal) {
                this.closeCamera();
            }
        });

        // 今日の日付を設定
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('purchase-date').value = today;

        // JAN入力フィールドのイベント
        document.getElementById('jan-input').addEventListener('input', (e) => this.handleJanInput(e));
        document.getElementById('jan-input').addEventListener('blur', () => this.hideSuggestions());

        // 商品名入力の予測変換イベント
        document.getElementById('product-name').addEventListener('input', (e) => this.handleProductNameInput(e));
        document.getElementById('product-name').addEventListener('blur', () => {
            setTimeout(() => this.hideSuggestions(), 150);
        });

        // キーボードナビゲーション
        document.getElementById('product-name').addEventListener('keydown', (e) => this.handleKeyNavigation(e));

        // 消費履歴のイベント
        document.getElementById('filter-history-btn').addEventListener('click', () => this.updateHistoryView());
        document.getElementById('clear-filter-btn').addEventListener('click', () => this.clearHistoryFilter());
        document.getElementById('export-csv-btn').addEventListener('click', () => this.exportToCSV());

        // 招待コード認証
        document.getElementById('invite-form').addEventListener('submit', (e) => this.handleInviteCodeSubmit(e));
        this.setupInviteCodeInputs();
    }

    // ローディング画面を非表示
    hideLoading() {
        setTimeout(() => {
            document.getElementById('loading').classList.add('hidden');
        }, 1000);
    }

    // ビュー切り替え
    showView(viewName) {
        // 全てのビューを非表示
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

        // 選択されたビューを表示
        document.getElementById(`${viewName}-view`).classList.add('active');
        document.getElementById(`${viewName}-tab`).classList.add('active');

        this.currentView = viewName;

        // 消費履歴画面が選択された場合
        if (viewName === 'history') {
            this.updateHistoryView();
            this.updateHistoryStats();
        }
    }

    // 商品追加処理
    handleAddItem(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const item = {
            id: Date.now(),
            jan: document.getElementById('jan-input').value,
            name: document.getElementById('product-name').value,
            purchaseDate: document.getElementById('purchase-date').value,
            expiryDate: document.getElementById('expiry-date').value,
            consumeDate: document.getElementById('consume-date').value,
            quantity: parseInt(document.getElementById('quantity').value)
        };

        this.inventory.push(item);
        this.saveData();
        this.updateInventoryView();

        // フォームリセット
        e.target.reset();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('purchase-date').value = today;

        // 成功メッセージ
        this.showMessage('商品を登録しました', 'success');
    }

    // 管理画面での商品登録
    handleAdminAdd(e) {
        e.preventDefault();

        const jan = document.getElementById('admin-jan').value;
        const name = document.getElementById('admin-product-name').value;

        if (this.janProducts[jan]) {
            this.showMessage('このJANコードは既に登録されています', 'error');
            return;
        }

        this.janProducts[jan] = name;
        this.saveData();
        this.updateJanProductList();

        // フォームリセット
        e.target.reset();

        this.showMessage('JAN商品を登録しました', 'success');
    }

    // 在庫一覧を更新
    updateInventoryView() {
        const container = document.getElementById('inventory-list');
        const sortType = document.getElementById('sort-select').value;

        // ソート処理
        const sortedInventory = this.sortInventory([...this.inventory], sortType);

        if (sortedInventory.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>商品がありません</h3>
                    <p>「商品登録」から商品を追加してください</p>
                </div>
            `;
            return;
        }

        container.innerHTML = sortedInventory.map(item => this.createInventoryItemHTML(item)).join('');

        // 消費ボタンのイベント設定
        container.querySelectorAll('.consume-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = parseInt(e.target.dataset.id);
                this.consumeItem(itemId, e.target);
            });
        });

        // 削除ボタンのイベント設定（管理画面用）
        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = parseInt(e.target.dataset.id);
                this.deleteItem(itemId);
            });
        });
    }

    // 在庫のソート
    sortInventory(inventory, sortType) {
        const today = new Date();

        switch (sortType) {
            case 'expiry-asc':
                return inventory.sort((a, b) => {
                    if (!a.expiryDate && !b.expiryDate) return 0;
                    if (!a.expiryDate) return 1;
                    if (!b.expiryDate) return -1;
                    return new Date(a.expiryDate) - new Date(b.expiryDate);
                });
            case 'expiry-desc':
                return inventory.sort((a, b) => {
                    if (!a.expiryDate && !b.expiryDate) return 0;
                    if (!a.expiryDate) return -1;
                    if (!b.expiryDate) return 1;
                    return new Date(b.expiryDate) - new Date(a.expiryDate);
                });
            case 'consume-asc':
                return inventory.sort((a, b) => {
                    if (!a.consumeDate && !b.consumeDate) return 0;
                    if (!a.consumeDate) return 1;
                    if (!b.consumeDate) return -1;
                    return new Date(a.consumeDate) - new Date(b.consumeDate);
                });
            case 'consume-desc':
                return inventory.sort((a, b) => {
                    if (!a.consumeDate && !b.consumeDate) return 0;
                    if (!a.consumeDate) return -1;
                    if (!b.consumeDate) return 1;
                    return new Date(b.consumeDate) - new Date(a.consumeDate);
                });
            case 'purchase-asc':
                return inventory.sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));
            case 'purchase-desc':
                return inventory.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
            case 'name-asc':
                return inventory.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
            case 'name-desc':
                return inventory.sort((a, b) => b.name.localeCompare(a.name, 'ja'));
            default:
                return inventory;
        }
    }

    // 在庫アイテムのHTML生成
    createInventoryItemHTML(item) {
        const today = new Date();
        const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
        const consumeDate = item.consumeDate ? new Date(item.consumeDate) : null;

        // 期限チェック
        let statusClass = '';
        let statusText = '';

        if (expiryDate || consumeDate) {
            const checkDate = consumeDate || expiryDate;
            const diffDays = Math.ceil((checkDate - today) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                statusClass = 'expired';
                statusText = '期限切れ';
            } else if (diffDays <= 3) {
                statusClass = 'warning';
                statusText = '期限間近';
            }
        }

        return `
            <div class="inventory-item ${statusClass}">
                <div class="item-header">
                    <div class="item-name">${item.name}</div>
                    <div class="item-quantity">${item.quantity}個</div>
                </div>
                <div class="item-details">
                    <div>購入日: ${this.formatDate(item.purchaseDate)}</div>
                    ${item.expiryDate ? `<div>賞味期限: ${this.formatDate(item.expiryDate)}</div>` : ''}
                    ${item.consumeDate ? `<div>消費期限: ${this.formatDate(item.consumeDate)}</div>` : ''}
                    ${item.jan ? `<div>JAN: ${item.jan}</div>` : ''}
                    ${statusText ? `<div style="color: var(--accent-red); font-weight: bold;">${statusText}</div>` : ''}
                </div>
                <button class="consume-btn" data-id="${item.id}">消費</button>
            </div>
        `;
    }

    // 日付フォーマット
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP');
    }

    // アイテム消費
    async consumeItem(itemId, buttonElement) {
        const item = this.inventory.find(item => item.id === itemId);
        if (!item) return;

        const itemElement = buttonElement.closest('.inventory-item');

        // 消費確認
        const confirmed = confirm(`${item.name}を消費しますか？\n（個数: ${item.quantity}個）`);
        if (!confirmed) return;

        // 消費アニメーション開始
        itemElement.classList.add('item-consuming');

        // パーティクルエフェクト
        this.showFoodParticles(itemElement);

        // 0.4秒後にメインエフェクト表示
        setTimeout(() => {
            this.showConsumeEffect();
        }, 400);

        // 0.8秒後にデータ更新
        setTimeout(() => {
            // 消費履歴に追加
            this.addToConsumeHistory(item);

            // 在庫から削除
            this.inventory = this.inventory.filter(item => item.id !== itemId);
            this.saveData();
            this.updateInventoryView();

            // 成功メッセージ
            this.showMessage(`${item.name}を美味しく頂きました！`, 'success');
        }, 800);
    }

    // アイテム削除（完全削除用）
    deleteItem(itemId) {
        if (confirm('この商品を削除しますか？（完全に削除されます）')) {
            this.inventory = this.inventory.filter(item => item.id !== itemId);
            this.saveData();
            this.updateInventoryView();
            this.showMessage('商品を削除しました', 'success');
        }
    }

    // 消費履歴に追加
    addToConsumeHistory(item) {
        const historyItem = {
            ...item,
            consumedAt: new Date().toISOString(),
            consumedDate: new Date().toISOString().split('T')[0]
        };
        this.consumeHistory.unshift(historyItem); // 最新を先頭に

        // 履歴は最大100件まで保持
        if (this.consumeHistory.length > 100) {
            this.consumeHistory = this.consumeHistory.slice(0, 100);
        }
    }

    // 食事完了エフェクト表示
    showConsumeEffect() {
        const effects = [
            '🍽️✨', '😋🎉', '🥢💫', '🍴⭐', '😄🌟',
            '🤤✨', '👍🎊', '🙂💝', '😊🌈', '🥰🎁'
        ];

        const randomEffect = effects[Math.floor(Math.random() * effects.length)];

        const effectElement = document.createElement('div');
        effectElement.className = 'consume-effect';
        effectElement.textContent = randomEffect;

        document.body.appendChild(effectElement);

        // 2秒後に削除
        setTimeout(() => {
            if (effectElement.parentNode) {
                effectElement.parentNode.removeChild(effectElement);
            }
        }, 2000);
    }

    // 食材パーティクルエフェクト
    showFoodParticles(itemElement) {
        const foodEmojis = ['🍎', '🍊', '🍌', '🍇', '🍓', '🥕', '🥬', '🍞', '🥛', '✨'];
        const rect = itemElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // 6個のパーティクルを生成
        for (let i = 0; i < 6; i++) {
            setTimeout(() => {
                const particle = document.createElement('div');
                particle.className = 'food-particle';
                particle.textContent = foodEmojis[Math.floor(Math.random() * foodEmojis.length)];

                // ランダムな位置に配置
                const angle = (Math.PI * 2 / 6) * i + (Math.random() - 0.5) * 0.5;
                const distance = 50 + Math.random() * 30;
                particle.style.left = (centerX + Math.cos(angle) * distance) + 'px';
                particle.style.top = (centerY + Math.sin(angle) * distance) + 'px';

                document.body.appendChild(particle);

                // 1.5秒後に削除
                setTimeout(() => {
                    if (particle.parentNode) {
                        particle.parentNode.removeChild(particle);
                    }
                }, 1500);
            }, i * 100); // 0.1秒間隔で生成
        }
    }

    // JAN商品一覧を更新
    updateJanProductList() {
        const container = document.getElementById('jan-product-list');
        const products = Object.entries(this.janProducts);

        if (products.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>登録されたJAN商品がありません</p>
                </div>
            `;
            return;
        }

        container.innerHTML = products.map(([jan, name]) => `
            <div class="jan-product-item">
                <div>
                    <strong>${name}</strong><br>
                    <span class="jan-code">${jan}</span>
                </div>
                <button class="delete-btn" onclick="app.deleteJanProduct('${jan}')">削除</button>
            </div>
        `).join('');
    }

    // JAN商品削除
    deleteJanProduct(jan) {
        if (confirm('このJAN商品を削除しますか？')) {
            delete this.janProducts[jan];
            this.saveData();
            this.updateJanProductList();
            this.showMessage('JAN商品を削除しました', 'success');
        }
    }

    // JAN入力時の処理
    async handleJanInput(e) {
        const jan = e.target.value.trim();
        if (jan.length >= 8) {
            // ローカルデータベースから検索
            if (this.janProducts[jan]) {
                document.getElementById('product-name').value = this.janProducts[jan];
                this.showMessage(`ローカルデータから商品名を取得しました`, 'success');
                return;
            }

            // オンライン検索
            this.showSearchingStatus(true);
            await this.searchProductByJan(jan);
            this.showSearchingStatus(false);
        }
    }

    // 検索中表示の制御
    showSearchingStatus(isSearching) {
        const productNameInput = document.getElementById('product-name');
        if (isSearching) {
            productNameInput.placeholder = '商品名を検索中...';
            productNameInput.style.background = 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%), linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%)';
            productNameInput.style.backgroundSize = '20px 20px';
            productNameInput.style.backgroundPosition = '0 0, 10px 10px';
            productNameInput.style.animation = 'searching 1s linear infinite';

            // アニメーションCSSを動的に追加
            if (!document.getElementById('searching-animation')) {
                const style = document.createElement('style');
                style.id = 'searching-animation';
                style.textContent = `
                    @keyframes searching {
                        0% { background-position: 0 0, 10px 10px; }
                        100% { background-position: 20px 20px, 30px 30px; }
                    }
                `;
                document.head.appendChild(style);
            }
        } else {
            productNameInput.placeholder = '商品名';
            productNameInput.style.background = '';
            productNameInput.style.animation = '';
        }
    }

    // 商品名入力時の予測変換
    handleProductNameInput(e) {
        const query = e.target.value.trim();

        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        if (query.length < 1) {
            this.hideSuggestions();
            return;
        }

        this.searchTimeout = setTimeout(() => {
            this.showSuggestions(query);
        }, 300);
    }

    // 予測変換の表示
    showSuggestions(query) {
        const suggestions = this.getSuggestions(query);
        const dropdown = document.getElementById('product-suggestions');

        if (suggestions.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = suggestions.map((suggestion, index) => `
            <div class="suggestion-item" data-index="${index}" data-name="${suggestion.name}">
                ${suggestion.name}
                ${suggestion.jan ? `<div class="suggestion-jan">JAN: ${suggestion.jan}</div>` : ''}
            </div>
        `).join('');

        // イベントリスナー追加
        dropdown.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const name = e.currentTarget.dataset.name;
                document.getElementById('product-name').value = name;
                this.hideSuggestions();
            });
        });

        dropdown.style.display = 'block';
    }

    // 予測変換候補の取得
    getSuggestions(query) {
        const suggestions = [];
        const queryLower = query.toLowerCase();

        // ローカルJANデータベースから検索
        Object.entries(this.janProducts).forEach(([jan, name]) => {
            if (name.toLowerCase().includes(queryLower)) {
                suggestions.push({ name, jan });
            }
        });

        // 在庫データから検索（重複除去）
        const existingNames = new Set(suggestions.map(s => s.name));
        this.inventory.forEach(item => {
            if (item.name.toLowerCase().includes(queryLower) && !existingNames.has(item.name)) {
                suggestions.push({ name: item.name, jan: item.jan });
                existingNames.add(item.name);
            }
        });

        return suggestions.slice(0, 10); // 最大10件
    }

    // 予測変換の非表示
    hideSuggestions() {
        const dropdown = document.getElementById('product-suggestions');
        dropdown.style.display = 'none';
    }

    // キーボードナビゲーション
    handleKeyNavigation(e) {
        const dropdown = document.getElementById('product-suggestions');
        const items = dropdown.querySelectorAll('.suggestion-item');

        if (items.length === 0) return;

        const current = dropdown.querySelector('.highlighted');
        let next;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (current) {
                    current.classList.remove('highlighted');
                    next = current.nextElementSibling || items[0];
                } else {
                    next = items[0];
                }
                next.classList.add('highlighted');
                break;

            case 'ArrowUp':
                e.preventDefault();
                if (current) {
                    current.classList.remove('highlighted');
                    next = current.previousElementSibling || items[items.length - 1];
                } else {
                    next = items[items.length - 1];
                }
                next.classList.add('highlighted');
                break;

            case 'Enter':
                e.preventDefault();
                if (current) {
                    const name = current.dataset.name;
                    document.getElementById('product-name').value = name;
                    this.hideSuggestions();
                }
                break;

            case 'Escape':
                this.hideSuggestions();
                break;
        }
    }

    // JAN検索API（複数のソースを試行）
    async searchProductByJan(jan) {
        try {
            // 複数のソースを順番に試行
            let productName = null;

            // 1. 電脳リサーチサイトから検索
            productName = await this.searchFromDennouResearch(jan);

            // 2. 楽天商品検索API（プロキシ経由）
            if (!productName) {
                productName = await this.searchFromRakuten(jan);
            }

            // 3. Yahoo!ショッピング検索（プロキシ経由）
            if (!productName) {
                productName = await this.searchFromYahoo(jan);
            }

            // 4. モックAPIからフォールバック
            if (!productName) {
                productName = await this.mockJanApi(jan);
            }

            if (productName) {
                document.getElementById('product-name').value = productName;
                this.showMessage(`商品名を自動入力しました: ${productName}`, 'success');

                // 検索結果をローカルデータベースに保存
                this.janProducts[jan] = productName;
                this.saveData();
            } else {
                this.showMessage('商品情報が見つかりませんでした', 'info');
            }
        } catch (error) {
            console.log('JAN検索エラー:', error);
            this.showMessage('検索中にエラーが発生しました', 'error');
        }
    }

    // 電脳リサーチサイトから検索
    async searchFromDennouResearch(jan) {
        try {
            // CORS制限を回避するためのプロキシを使用
            const proxyUrl = 'https://corsproxy.io/?';
            const targetUrl = `https://dennou-research.com/search/?jan=${jan}`;

            const response = await fetch(`${proxyUrl}${encodeURIComponent(targetUrl)}`, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                }
            });

            if (response.ok) {
                const html = await response.text();
                return this.extractProductNameFromHTML(html);
            }
        } catch (error) {
            console.log('電脳リサーチ検索エラー:', error);
        }
        return null;
    }

    // HTMLから商品名を抽出
    extractProductNameFromHTML(html) {
        try {
            // HTMLパーサーを使用して商品名を抽出
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 一般的な商品名の抽出パターン
            const selectors = [
                'h1',
                '.product-name',
                '.item-name',
                '#product-title',
                '[data-product-name]',
                'title'
            ];

            for (const selector of selectors) {
                const element = doc.querySelector(selector);
                if (element && element.textContent.trim()) {
                    let productName = element.textContent.trim();
                    // JANコードやサイト名を除去
                    productName = productName.replace(/^\d{8,14}/, '').trim();
                    productName = productName.replace(/電脳リサーチ.*/, '').trim();
                    if (productName.length > 3) {
                        return productName;
                    }
                }
            }
        } catch (error) {
            console.log('HTML解析エラー:', error);
        }
        return null;
    }

    // 楽天商品検索API（プロキシ経由）
    async searchFromRakuten(jan) {
        try {
            const proxyUrl = 'https://corsproxy.io/?';
            const rakutenUrl = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706?format=json&keyword=${jan}&applicationId=1093848717736099110`;

            const response = await fetch(`${proxyUrl}${encodeURIComponent(rakutenUrl)}`);

            if (response.ok) {
                const data = await response.json();
                if (data.Items && data.Items.length > 0) {
                    return data.Items[0].Item.itemName;
                }
            }
        } catch (error) {
            console.log('楽天API検索エラー:', error);
        }
        return null;
    }

    // Yahoo!ショッピング検索（プロキシ経由）
    async searchFromYahoo(jan) {
        try {
            const proxyUrl = 'https://corsproxy.io/?';
            const yahooUrl = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?appid=dj00aiZpPVE5bW1sdTJlbzk1aSZzPWNvbnN1bWVyc2VjcmV0Jng9NGE-&jan_code=${jan}`;

            const response = await fetch(`${proxyUrl}${encodeURIComponent(yahooUrl)}`);

            if (response.ok) {
                const data = await response.json();
                if (data.hits && data.hits.length > 0) {
                    return data.hits[0].name;
                }
            }
        } catch (error) {
            console.log('Yahoo!API検索エラー:', error);
        }
        return null;
    }

    // モックJAN API（実際のAPIの代替）
    async mockJanApi(jan) {
        // 実際の実装では、以下のようなAPIを使用します：
        // - Yahoo! Shopping API
        // - 楽天商品検索API
        // - Amazon Product Advertising API

        // ここではダミーデータを返します
        const mockProducts = {
            '4902777777777': 'コカ・コーラ 500ml',
            '4901777777777': 'キットカット ミニ',
            '4903777777777': 'ポテトチップス うすしお味',
            '4904777777777': '明治ミルクチョコレート',
            '4905777777777': 'カップヌードル',
            '4906777777777': 'ポッキー チョコレート',
            '4907777777777': 'ペプシコーラ 500ml',
            '4908777777777': 'うまい棒 めんたい味',
            '4909777777777': 'キリン午後の紅茶',
            '4910777777777': 'じゃがりこ サラダ'
        };

        // 遅延を追加してAPI呼び出しを模倣
        await new Promise(resolve => setTimeout(resolve, 500));

        return mockProducts[jan] || null;
    }

    // カメラ開始
    async openCamera(targetInputId = 'jan-input') {
        try {
            const modal = document.getElementById('camera-modal');
            const video = document.getElementById('camera-video');

            modal.style.display = 'block';

            // カメラストリーム取得
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });

            video.srcObject = stream;

            // ZXingライブラリでバーコードスキャン
            const codeReader = new ZXing.BrowserBarcodeReader();

            this.currentTargetInput = targetInputId;

            codeReader.decodeFromVideoDevice(undefined, video, async (result, err) => {
                if (result) {
                    const janCode = result.text;
                    document.getElementById(targetInputId).value = janCode;

                    // 商品登録画面の場合のみ商品名検索
                    if (targetInputId === 'jan-input') {
                        // ローカルJAN商品データベースから商品名を検索
                        if (this.janProducts[janCode]) {
                            document.getElementById('product-name').value = this.janProducts[janCode];
                        } else {
                            // オンライン検索
                            await this.searchProductByJan(janCode);
                        }
                    }

                    this.closeCamera();
                    this.showMessage(`JANコード ${janCode} を読み取りました`, 'success');
                }
            });

            this.scanner = codeReader;

        } catch (err) {
            console.error('カメラアクセスエラー:', err);
            this.showMessage('カメラにアクセスできませんでした', 'error');
        }
    }

    // カメラ停止
    closeCamera() {
        const modal = document.getElementById('camera-modal');
        const video = document.getElementById('camera-video');

        modal.style.display = 'none';

        // ストリーム停止
        if (video.srcObject) {
            const tracks = video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            video.srcObject = null;
        }

        // スキャナー停止
        if (this.scanner) {
            this.scanner.reset();
            this.scanner = null;
        }
    }

    // メッセージ表示
    showMessage(message, type = 'info') {
        // 既存のメッセージを削除
        const existingMessage = document.querySelector('.message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // メッセージ要素を作成
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${type}`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 10px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 10001;
            opacity: 0;
            transition: opacity 0.3s ease;
            background-color: ${type === 'error' ? 'var(--accent-red)' : 'var(--accent-blue)'};
        `;

        document.body.appendChild(messageEl);

        // フェードイン
        setTimeout(() => {
            messageEl.style.opacity = '1';
        }, 100);

        // 自動削除
        setTimeout(() => {
            messageEl.style.opacity = '0';
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 300);
        }, 3000);
    }

    // 消費履歴に追加
    addToConsumeHistory(item) {
        const historyItem = {
            id: Date.now(),
            itemId: item.id,
            jan: item.jan,
            name: item.name,
            quantity: item.quantity,
            purchaseDate: item.purchaseDate,
            expiryDate: item.expiryDate,
            consumeDate: item.consumeDate,
            consumedAt: new Date().toISOString()
        };

        this.consumeHistory.unshift(historyItem);
        this.saveData();
    }

    // 消費履歴ビュー更新
    updateHistoryView() {
        const historyList = document.getElementById('history-list');
        const startDate = document.getElementById('history-start-date').value;
        const endDate = document.getElementById('history-end-date').value;

        let filteredHistory = [...this.consumeHistory];

        // 日付フィルタリング
        if (startDate || endDate) {
            filteredHistory = this.consumeHistory.filter(item => {
                const consumedDate = new Date(item.consumedAt).toISOString().split('T')[0];
                const start = startDate || '2000-01-01';
                const end = endDate || '2099-12-31';
                return consumedDate >= start && consumedDate <= end;
            });
        }

        // 履歴が空の場合
        if (filteredHistory.length === 0) {
            historyList.innerHTML = '<div class="no-history">消費履歴がありません</div>';
            return;
        }

        // 履歴リスト生成
        historyList.innerHTML = filteredHistory.map(item => {
            const consumedDate = new Date(item.consumedAt);
            const isRecent = (Date.now() - consumedDate.getTime()) < 24 * 60 * 60 * 1000;

            return `
                <div class="history-item ${isRecent ? 'recent' : ''}">
                    <div class="history-info">
                        <h3>${item.name}</h3>
                        <div class="history-details">
                            <span class="history-date">消費日: ${consumedDate.toLocaleDateString('ja-JP')}</span>
                            <span class="history-quantity">個数: ${item.quantity}個</span>
                            ${item.jan ? `<span class="history-jan">JAN: ${item.jan}</span>` : ''}
                        </div>
                        <div class="history-dates">
                            <span>購入日: ${new Date(item.purchaseDate).toLocaleDateString('ja-JP')}</span>
                            ${item.expiryDate ? `<span>賞味期限: ${new Date(item.expiryDate).toLocaleDateString('ja-JP')}</span>` : ''}
                            ${item.consumeDate ? `<span>消費期限: ${new Date(item.consumeDate).toLocaleDateString('ja-JP')}</span>` : ''}
                        </div>
                    </div>
                    ${isRecent ? '<div class="recent-badge">NEW</div>' : ''}
                </div>
            `;
        }).join('');
    }

    // 消費履歴統計更新
    updateHistoryStats() {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // 今月の消費数
        const monthlyCount = this.consumeHistory.filter(item =>
            new Date(item.consumedAt) >= monthStart
        ).reduce((total, item) => total + item.quantity, 0);

        // 今週の消費数
        const weeklyCount = this.consumeHistory.filter(item =>
            new Date(item.consumedAt) >= weekStart
        ).reduce((total, item) => total + item.quantity, 0);

        // よく消費する商品
        const productCounts = {};
        this.consumeHistory.forEach(item => {
            productCounts[item.name] = (productCounts[item.name] || 0) + item.quantity;
        });

        const mostPopular = Object.keys(productCounts).reduce((a, b) =>
            productCounts[a] > productCounts[b] ? a : b, '-');

        // 表示更新
        document.getElementById('monthly-count').textContent = monthlyCount;
        document.getElementById('weekly-count').textContent = weeklyCount;
        document.getElementById('popular-product').textContent = mostPopular;
    }

    // 履歴フィルターをクリア
    clearHistoryFilter() {
        document.getElementById('history-start-date').value = '';
        document.getElementById('history-end-date').value = '';
        this.updateHistoryView();
    }

    // CSVエクスポート
    exportToCSV() {
        if (this.consumeHistory.length === 0) {
            this.showMessage('エクスポートする履歴がありません', 'error');
            return;
        }

        const headers = ['消費日', '商品名', '個数', 'JANコード', '購入日', '賞味期限', '消費期限'];
        const csvContent = [headers.join(',')];

        this.consumeHistory.forEach(item => {
            const row = [
                new Date(item.consumedAt).toLocaleDateString('ja-JP'),
                `"${item.name}"`,
                item.quantity,
                item.jan || '',
                new Date(item.purchaseDate).toLocaleDateString('ja-JP'),
                item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('ja-JP') : '',
                item.consumeDate ? new Date(item.consumeDate).toLocaleDateString('ja-JP') : ''
            ];
            csvContent.push(row.join(','));
        });

        const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `消費履歴_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showMessage('消費履歴をCSVでエクスポートしました', 'success');
    }

    // 認証状態チェック
    checkAuthentication() {
        // 開発環境では認証をスキップ（オプション）
        // if (window.location.hostname === 'localhost') {
        //     this.isAuthenticated = true;
        //     return;
        // }
    }

    // 招待画面表示
    showInviteScreen() {
        document.getElementById('invite-screen').style.display = 'block';
        document.getElementById('main-container').style.display = 'none';
    }

    // メインアプリ表示
    showMainApp() {
        document.getElementById('invite-screen').style.display = 'none';
        document.getElementById('main-container').style.display = 'block';
    }

    // 成功画面表示
    showSuccessScreen() {
        // 招待画面を隠す
        document.getElementById('invite-screen').style.display = 'none';

        // 成功画面を表示
        const successScreen = document.getElementById('success-screen');
        successScreen.style.display = 'flex';

        // アニメーション完了後にメイン画面に遷移（約3秒後）
        setTimeout(() => {
            this.hideSuccessScreen();
            this.showMainApp();
            this.updateInventoryView();
            this.updateJanProductList();
            this.showMessage('アプリへようこそ！', 'success');
        }, 3000);
    }

    // 成功画面を隠す
    hideSuccessScreen() {
        const successScreen = document.getElementById('success-screen');
        successScreen.style.display = 'none';
    }

    // 4桁招待コード入力フィールドのセットアップ
    setupInviteCodeInputs() {
        const inputs = document.querySelectorAll('.invite-code-input');

        inputs.forEach((input, index) => {
            // 入力イベント
            input.addEventListener('input', (e) => {
                const value = e.target.value;

                // 数字のみ許可
                if (!/^\d$/.test(value) && value !== '') {
                    e.target.value = '';
                    return;
                }

                // 入力された場合、次のフィールドにフォーカス
                if (value && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }

                // スタイル更新
                this.updateInputStyles();
            });

            // キーダウンイベント（バックスペース処理）
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });

            // ペースト処理
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);

                // 各フィールドに値を設定
                for (let i = 0; i < Math.min(pasteData.length, inputs.length); i++) {
                    inputs[i].value = pasteData[i];
                }

                // 最後の入力フィールドにフォーカス
                const focusIndex = Math.min(pasteData.length, inputs.length - 1);
                inputs[focusIndex].focus();

                this.updateInputStyles();
            });
        });
    }

    // 入力フィールドのスタイル更新
    updateInputStyles() {
        const inputs = document.querySelectorAll('.invite-code-input');
        inputs.forEach(input => {
            if (input.value) {
                input.classList.add('filled');
            } else {
                input.classList.remove('filled');
            }
            input.classList.remove('error');
        });
    }

    // 4桁コードを取得
    getInviteCode() {
        const inputs = document.querySelectorAll('.invite-code-input');
        return Array.from(inputs).map(input => input.value).join('');
    }

    // 招待コード認証処理
    async handleInviteCodeSubmit(e) {
        e.preventDefault();

        const submitBtn = document.getElementById('invite-submit');
        const errorDiv = document.getElementById('invite-error');
        const inputs = document.querySelectorAll('.invite-code-input');

        const inviteCode = this.getInviteCode();

        // エラーメッセージクリア
        errorDiv.textContent = '';
        this.updateInputStyles();

        // バリデーション
        if (inviteCode.length !== 4) {
            this.showInviteError('4桁の招待コードを入力してください');
            return;
        }

        // ローディング状態
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        // 認証処理（少し遅延を入れてリアルな感じに）
        setTimeout(() => {
            if (inviteCode === this.validInviteCode) {
                // 認証成功
                this.isAuthenticated = true;
                this.saveData();

                // 成功アニメーション
                submitBtn.classList.remove('loading');
                submitBtn.classList.add('success');
                submitBtn.innerHTML = '<span>認証成功！</span>';

                // 1秒後に成功画面を表示
                setTimeout(() => {
                    this.showSuccessScreen();
                }, 1000);

            } else {
                // 認証失敗
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                this.showInviteError('招待コードが正しくありません');
            }
        }, 1500); // 1.5秒の遅延で認証処理
    }

    // 招待エラー表示
    showInviteError(message) {
        const errorDiv = document.getElementById('invite-error');
        const inputs = document.querySelectorAll('.invite-code-input');

        errorDiv.textContent = message;

        // 全ての入力フィールドにエラースタイルを適用
        inputs.forEach(input => {
            input.classList.add('error');
        });

        // エラー音効果（オプション）
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(200);
        }
    }

    // 認証リセット（デバッグ用）
    resetAuthentication() {
        this.isAuthenticated = false;
        localStorage.removeItem('shoppingAppAuthenticated');
        location.reload();
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ShoppingApp();
});
// コンポーネントローダー
class ComponentLoader {
    constructor() {
        this.cache = new Map();
    }

    async loadComponent(path, targetElementId) {
        try {
            // キャッシュから取得を試行
            if (this.cache.has(path)) {
                const content = this.cache.get(path);
                this.insertContent(targetElementId, content);
                return;
            }

            // HTTPリクエストでコンポーネントファイルを取得
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load component: ${path}`);
            }

            const content = await response.text();

            // キャッシュに保存
            this.cache.set(path, content);

            // DOMに挿入
            this.insertContent(targetElementId, content);
        } catch (error) {
            console.error(`Error loading component ${path}:`, error);
        }
    }

    insertContent(targetElementId, content) {
        const targetElement = document.getElementById(targetElementId);
        if (targetElement) {
            targetElement.innerHTML = content;
        } else {
            console.error(`Target element not found: ${targetElementId}`);
        }
    }

    async loadAllComponents() {
        const components = [
            { path: 'components/invite-screen.html', target: 'invite-screen-container' },
            { path: 'components/success-screen.html', target: 'success-screen-container' },
            { path: 'components/header.html', target: 'header-container' },
            { path: 'components/inventory-view.html', target: 'inventory-view-container' },
            { path: 'components/add-item-view.html', target: 'add-item-view-container' },
            { path: 'components/history-view.html', target: 'history-view-container' },
            { path: 'components/admin-view.html', target: 'admin-view-container' },
            { path: 'components/camera-modal.html', target: 'camera-modal-container' }
        ];

        // 全コンポーネントを並行してロード
        const loadPromises = components.map(component =>
            this.loadComponent(component.path, component.target)
        );

        await Promise.all(loadPromises);
    }
}

// グローバルインスタンス
window.componentLoader = new ComponentLoader();
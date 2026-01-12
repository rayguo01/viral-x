/**
 * X 帖子生成器 - 主应用
 */
class App {
    constructor() {
        this.token = localStorage.getItem('token');
        this.username = localStorage.getItem('username');
        this.init();
    }

    init() {
        this.initTheme();
        this.bindAuthEvents();
        this.bindThemeEvents();

        if (this.token) {
            this.showGeneratorPage();
            this.initGenerator();
        } else {
            this.showAuthPage();
        }
    }

    // 主题相关方法
    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        // 更新图标
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
        }

        // 更新 meta theme-color
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === 'dark' ? '#0f172a' : '#f8fafc');
        }
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    bindThemeEvents() {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }

    bindAuthEvents() {
        // Tab 切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // 登录表单
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        // 注册表单
        document.getElementById('register-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.register();
        });

        // 退出按钮
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        // 历史按钮
        const historyBtn = document.getElementById('history-btn');
        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                window.location.hash = '#/history';
            });
        }
    }

    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
        document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
    }

    showAuthPage() {
        document.getElementById('auth-page').classList.remove('hidden');
        const generatorPage = document.getElementById('generator-page');
        if (generatorPage) generatorPage.classList.add('hidden');
        // 恢复 body overflow
        document.body.style.overflow = 'hidden';
    }

    showGeneratorPage() {
        document.getElementById('auth-page').classList.add('hidden');
        const generatorPage = document.getElementById('generator-page');
        if (generatorPage) generatorPage.classList.remove('hidden');
        // 允许页面滚动
        document.body.style.overflow = 'auto';
    }

    initGenerator() {
        // 初始化工作流组件
        window.workflowComponent = new WorkflowComponent('workflow-container');
        window.workflowComponent.render();

        // 初始化生成器
        window.postGenerator.init();
    }

    async login() {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        const submitBtn = document.querySelector('#login-form button[type="submit"]');

        if (submitBtn.disabled) return;
        submitBtn.disabled = true;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                errorEl.textContent = data.error;
                return;
            }

            this.token = data.token;
            this.username = data.username;
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);

            // 更新 postGenerator 的 token
            if (window.postGenerator) {
                window.postGenerator.token = data.token;
            }

            this.showGeneratorPage();
            this.initGenerator();
        } catch (err) {
            errorEl.textContent = '登录失败，请重试';
        } finally {
            submitBtn.disabled = false;
        }
    }

    async register() {
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        const errorEl = document.getElementById('register-error');
        const submitBtn = document.querySelector('#register-form button[type="submit"]');

        if (submitBtn.disabled) return;
        submitBtn.disabled = true;

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                errorEl.textContent = data.error;
                return;
            }

            this.token = data.token;
            this.username = data.username;
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);

            // 更新 postGenerator 的 token
            if (window.postGenerator) {
                window.postGenerator.token = data.token;
            }

            this.showGeneratorPage();
            this.initGenerator();
        } catch (err) {
            errorEl.textContent = '注册失败，请重试';
        } finally {
            submitBtn.disabled = false;
        }
    }

    logout() {
        this.token = null;
        this.username = null;
        localStorage.removeItem('token');
        localStorage.removeItem('username');

        // 重置生成器状态
        if (window.generatorState) {
            window.generatorState.reset();
        }

        // 清除 hash
        window.location.hash = '';

        this.showAuthPage();
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

// 防止 iOS Safari 双击缩放
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - (window.lastTouchEnd || 0) < 300) {
        e.preventDefault();
    }
    window.lastTouchEnd = now;
}, { passive: false });

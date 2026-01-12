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

        // 检查 URL 参数（处理 Twitter 登录回调）
        this.handleUrlParams();

        if (this.token) {
            this.showGeneratorPage();
            this.initGenerator();
        } else {
            this.showAuthPage();
        }
    }

    // 处理 URL 参数（Twitter 登录回调）
    handleUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);

        // Twitter 登录成功
        if (urlParams.get('twitter_login') === 'success') {
            const token = urlParams.get('token');
            const username = urlParams.get('username');

            if (token && username) {
                this.token = token;
                this.username = username;
                localStorage.setItem('token', token);
                localStorage.setItem('username', username);

                // 清除 URL 参数
                window.history.replaceState({}, document.title, '/');

                this.showToast(`欢迎, @${username}!`, 'success');
            }
        }

        // Twitter 错误
        if (urlParams.get('twitter_error')) {
            const error = urlParams.get('twitter_error');
            this.showToast(`Twitter 登录失败: ${error}`, 'error');
            // 清除 URL 参数
            window.history.replaceState({}, document.title, '/');
        }

        // Twitter 连接成功（绑定模式）
        if (urlParams.get('twitter_connected') === 'true') {
            const username = urlParams.get('twitter_username');
            this.showToast(`已连接 @${username}`, 'success');
            window.history.replaceState({}, document.title, '/');
        }
    }

    // 显示提示
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
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

        // Twitter 登录按钮
        const twitterLoginBtn = document.getElementById('twitter-login-btn');
        if (twitterLoginBtn) {
            twitterLoginBtn.addEventListener('click', () => this.twitterLogin());
        }
    }

    // Twitter 登录
    async twitterLogin() {
        const btn = document.getElementById('twitter-login-btn');
        if (btn.disabled) return;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 正在跳转...';

        try {
            const res = await fetch('/api/twitter/login');
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || '获取授权链接失败');
            }

            // 跳转到 Twitter 授权页面
            window.location.href = data.authUrl;
        } catch (err) {
            this.showToast(err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<svg class="x-logo" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> 使用 X 登录';
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

        // 确保 postGenerator 使用最新的 token
        if (window.postGenerator) {
            window.postGenerator.token = this.token;
        }

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

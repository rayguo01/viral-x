/**
 * 评论涨粉助手页面
 */

class CommentAssistantPage {
    constructor() {
        this.settings = null;
        this.status = null;
        this.currentTab = 'dashboard';
    }

    async render() {
        return `
            <div class="comment-assistant-page">
                <div class="page-header">
                    <h1 class="font-serif text-2xl font-bold text-slate-800">评论涨粉助手</h1>
                    <p class="text-slate-500 mt-2">自动追踪大V帖子，抢占高潜力评论位</p>
                </div>

                <div class="tabs flex gap-2 mb-6 border-b border-slate-200 pb-2">
                    <button class="tab-btn active px-4 py-2 rounded" data-tab="dashboard">仪表盘</button>
                    <button class="tab-btn px-4 py-2 rounded" data-tab="kol">大V管理</button>
                    <button class="tab-btn px-4 py-2 rounded" data-tab="history">评论历史</button>
                    <button class="tab-btn px-4 py-2 rounded" data-tab="usage">费用统计</button>
                </div>

                <div class="tab-content" id="tab-content">
                    <div class="loading text-center py-10 text-slate-500">加载中...</div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        // 绑定 Tab 切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // 加载仪表盘
        await this.loadDashboard();
    }

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        switch (tab) {
            case 'dashboard': this.loadDashboard(); break;
            case 'kol': this.loadKolManagement(); break;
            case 'history': this.loadHistory(); break;
            case 'usage': this.loadUsage(); break;
        }
    }

    // ============ 仪表盘 ============

    async loadDashboard() {
        const container = document.getElementById('tab-content');
        container.innerHTML = '<div class="loading text-center py-10 text-slate-500">加载中...</div>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/comment-assistant/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            this.settings = data.settings;
            this.status = data.status;

            container.innerHTML = this.renderDashboard();
            this.bindDashboardEvents();
        } catch (error) {
            container.innerHTML = `<div class="error text-red-600 p-4 bg-red-50 rounded">加载失败: ${error.message}</div>`;
        }
    }

    renderDashboard() {
        const { settings, status } = this;
        if (!settings) {
            return '<div class="text-slate-500 text-center py-10">无法加载设置</div>';
        }

        const regionLabel = status.currentRegion === 'ja' ? '日区' : '美区';
        const budgetPercent = ((status.monthlySpent / settings.monthly_budget) * 100).toFixed(1);
        const commentUser = status.commentUser;
        const hasCommentUser = !!commentUser;

        return `
            <div class="dashboard">
                <!-- 评论账号提示 -->
                ${!hasCommentUser ? `
                <div class="alert-warning bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg mb-6">
                    <span class="material-icons-outlined align-middle mr-2">warning</span>
                    <strong>未设置评论账号</strong> - 请在下方设置中选择一个已绑定 Twitter 的账号用于自动评论
                </div>
                ` : ''}

                <!-- 状态卡片 -->
                <div class="status-cards grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                    <div class="status-card glass-panel p-4 rounded-lg">
                        <div class="card-title text-xs text-slate-500 uppercase">功能状态</div>
                        <div class="card-value mt-2 flex items-center gap-3">
                            <label class="switch">
                                <input type="checkbox" id="auto-enabled" ${settings.auto_enabled ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <span class="status-label text-lg font-bold">${settings.auto_enabled ? '运行中' : '已停止'}</span>
                        </div>
                    </div>
                    <div class="status-card glass-panel p-4 rounded-lg">
                        <div class="card-title text-xs text-slate-500 uppercase">评论账号</div>
                        <div class="card-value mt-2 text-lg font-bold ${hasCommentUser ? 'text-green-600' : 'text-red-500'}">
                            ${hasCommentUser ? `@${commentUser.twitterUsername}` : '未设置'}
                        </div>
                    </div>
                    <div class="status-card glass-panel p-4 rounded-lg">
                        <div class="card-title text-xs text-slate-500 uppercase">今日评论</div>
                        <div class="card-value mt-2 text-2xl font-bold">${status.todayCount} / ${settings.daily_limit}</div>
                    </div>
                    <div class="status-card glass-panel p-4 rounded-lg">
                        <div class="card-title text-xs text-slate-500 uppercase">当前监控</div>
                        <div class="card-value mt-2 text-2xl font-bold region-${status.currentRegion}">${regionLabel}</div>
                    </div>
                    <div class="status-card glass-panel p-4 rounded-lg">
                        <div class="card-title text-xs text-slate-500 uppercase">本月费用</div>
                        <div class="card-value mt-2 text-2xl font-bold">$${status.monthlySpent.toFixed(2)} / $${settings.monthly_budget}</div>
                        <div class="budget-bar h-1 bg-slate-200 rounded mt-2 overflow-hidden">
                            <div class="budget-fill h-full bg-amber-500 transition-all" style="width: ${Math.min(budgetPercent, 100)}%"></div>
                        </div>
                    </div>
                </div>

                <!-- 设置 -->
                <div class="settings-section glass-panel p-6 rounded-lg mb-6">
                    <h3 class="font-serif text-lg font-bold mb-4">系统设置</h3>
                    <div class="settings-form grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div class="form-group">
                            <label class="block text-sm font-bold mb-1">评论账号</label>
                            <select id="comment-user" class="w-full p-2 border rounded">
                                <option value="">-- 选择账号 --</option>
                            </select>
                            <p class="text-xs text-slate-500 mt-1">选择用于自动评论的 Twitter 账号</p>
                        </div>
                        <div class="form-group">
                            <label class="block text-sm font-bold mb-1">每日评论上限</label>
                            <input type="number" id="daily-limit" value="${settings.daily_limit}" min="1" max="100" class="w-full p-2 border rounded">
                        </div>
                        <div class="form-group">
                            <label class="block text-sm font-bold mb-1">月度预算 (USD)</label>
                            <input type="number" id="monthly-budget" value="${settings.monthly_budget}" min="1" step="0.01" class="w-full p-2 border rounded">
                        </div>
                        <div class="form-group flex items-end">
                            <button class="btn-primary px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded" id="save-settings">保存设置</button>
                        </div>
                    </div>
                </div>

                <!-- KOL 统计 -->
                <div class="kol-stats glass-panel p-6 rounded-lg mb-6">
                    <h3 class="font-serif text-lg font-bold mb-4">大V配置</h3>
                    <div class="stats-grid flex gap-4 flex-wrap">
                        ${(status.kolStats || []).map(s => `
                            <div class="stat-item flex items-center gap-2">
                                <span class="region-tag px-2 py-1 rounded text-xs font-bold ${s.region === 'ja' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">${s.region === 'ja' ? '日区' : '美区'}</span>
                                <span class="text-slate-600">${s.count} 个大V，${s.groups} 个分组</span>
                            </div>
                        `).join('') || '<span class="text-slate-400">暂无大V配置</span>'}
                    </div>
                </div>

                <!-- 调试 -->
                <div class="debug-section glass-panel p-6 rounded-lg">
                    <h3 class="font-serif text-lg font-bold mb-4">调试</h3>
                    <button class="btn-secondary px-4 py-2 border border-slate-300 rounded hover:bg-slate-50" id="manual-run">手动执行一次</button>
                    <div id="run-result" class="mt-4"></div>
                </div>
            </div>
        `;
    }

    bindDashboardEvents() {
        const token = localStorage.getItem('token');

        // 加载 Twitter 用户列表
        this.loadTwitterUsers(token);

        // 开关
        document.getElementById('auto-enabled')?.addEventListener('change', async (e) => {
            await this.updateSettings({ autoEnabled: e.target.checked }, token);
        });

        // 保存设置
        document.getElementById('save-settings')?.addEventListener('click', async () => {
            const dailyLimit = parseInt(document.getElementById('daily-limit').value);
            const monthlyBudget = parseFloat(document.getElementById('monthly-budget').value);
            const commentUserId = document.getElementById('comment-user').value || null;
            await this.updateSettings({ dailyLimit, monthlyBudget, commentUserId: commentUserId ? parseInt(commentUserId) : null }, token);
        });

        // 手动执行
        document.getElementById('manual-run')?.addEventListener('click', async () => {
            const resultDiv = document.getElementById('run-result');
            resultDiv.innerHTML = '<span class="text-slate-500">执行中...</span>';
            try {
                const res = await fetch('/api/comment-assistant/run', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const result = await res.json();
                resultDiv.innerHTML = `<pre class="bg-slate-100 p-4 rounded text-sm overflow-auto">${JSON.stringify(result, null, 2)}</pre>`;
                this.loadDashboard(); // 刷新
            } catch (error) {
                resultDiv.innerHTML = `<div class="text-red-600">${error.message}</div>`;
            }
        });
    }

    async updateSettings(data, token) {
        try {
            const res = await fetch('/api/comment-assistant/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                this.loadDashboard();
            }
        } catch (error) {
            alert('更新失败: ' + error.message);
        }
    }

    async loadTwitterUsers(token) {
        try {
            const res = await fetch('/api/comment-assistant/twitter-users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const users = await res.json();

            const select = document.getElementById('comment-user');
            if (!select) return;

            // 保留第一个默认选项
            select.innerHTML = '<option value="">-- 选择账号 --</option>';

            // 添加用户选项
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `@${user.twitter_username} (${user.username})`;
                // 检查 Token 是否过期
                if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
                    option.textContent += ' [Token已过期]';
                    option.style.color = '#ef4444';
                }
                select.appendChild(option);
            });

            // 设置当前选中值
            if (this.settings?.comment_user_id) {
                select.value = this.settings.comment_user_id;
            }
        } catch (error) {
            console.error('加载 Twitter 用户列表失败:', error);
        }
    }

    // ============ 大V管理 ============

    async loadKolManagement() {
        const container = document.getElementById('tab-content');
        container.innerHTML = '<div class="loading text-center py-10 text-slate-500">加载中...</div>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/comment-assistant/kol-list', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const kols = await res.json();

            container.innerHTML = this.renderKolManagement(kols);
            this.bindKolEvents();
        } catch (error) {
            container.innerHTML = `<div class="error text-red-600 p-4 bg-red-50 rounded">加载失败: ${error.message}</div>`;
        }
    }

    renderKolManagement(kols) {
        const jaKols = kols.filter(k => k.region === 'ja');
        const enKols = kols.filter(k => k.region === 'en');

        return `
            <div class="kol-management">
                <div class="kol-actions mb-4 flex gap-2">
                    <button class="btn-primary px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded" id="add-kol">添加大V</button>
                    <button class="btn-secondary px-4 py-2 border border-slate-300 rounded hover:bg-slate-50" id="import-kols">批量导入</button>
                </div>

                <div class="kol-regions grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="kol-region glass-panel p-4 rounded-lg">
                        <h3 class="font-serif text-lg font-bold mb-3">日区 (${jaKols.length}/120)</h3>
                        <div class="kol-list" id="ja-kol-list">
                            ${this.renderKolList(jaKols)}
                        </div>
                    </div>
                    <div class="kol-region glass-panel p-4 rounded-lg">
                        <h3 class="font-serif text-lg font-bold mb-3">美区 (${enKols.length}/120)</h3>
                        <div class="kol-list" id="en-kol-list">
                            ${this.renderKolList(enKols)}
                        </div>
                    </div>
                </div>

                <!-- 添加弹窗 -->
                <div class="modal fixed inset-0 bg-black/50 items-center justify-center z-50" id="add-kol-modal" style="display:none;">
                    <div class="modal-content bg-white p-6 rounded-lg min-w-[400px]">
                        <h3 class="font-serif text-lg font-bold mb-4">添加大V</h3>
                        <div class="form-group mb-4">
                            <label class="block text-sm font-bold mb-1">区域</label>
                            <select id="kol-region" class="w-full p-2 border rounded">
                                <option value="ja">日区</option>
                                <option value="en">美区</option>
                            </select>
                        </div>
                        <div class="form-group mb-4">
                            <label class="block text-sm font-bold mb-1">用户名</label>
                            <input type="text" id="kol-username" placeholder="不带@" class="w-full p-2 border rounded">
                        </div>
                        <div class="form-group mb-4">
                            <label class="block text-sm font-bold mb-1">显示名称</label>
                            <input type="text" id="kol-display-name" placeholder="可选" class="w-full p-2 border rounded">
                        </div>
                        <div class="form-group mb-4">
                            <label class="block text-sm font-bold mb-1">分组 (0-11)</label>
                            <input type="number" id="kol-group" value="0" min="0" max="11" class="w-full p-2 border rounded">
                        </div>
                        <div class="modal-actions flex gap-2 justify-end">
                            <button class="btn-secondary px-4 py-2 border border-slate-300 rounded hover:bg-slate-50" id="cancel-add">取消</button>
                            <button class="btn-primary px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded" id="confirm-add">添加</button>
                        </div>
                    </div>
                </div>

                <!-- 批量导入弹窗 -->
                <div class="modal fixed inset-0 bg-black/50 items-center justify-center z-50" id="import-kol-modal" style="display:none;">
                    <div class="modal-content bg-white p-6 rounded-lg min-w-[500px] max-w-[600px]">
                        <h3 class="font-serif text-lg font-bold mb-4">批量导入大V</h3>
                        <div class="form-group mb-4">
                            <label class="block text-sm font-bold mb-1">区域</label>
                            <select id="import-region" class="w-full p-2 border rounded">
                                <option value="ja">日区</option>
                                <option value="en">美区</option>
                            </select>
                        </div>
                        <div class="form-group mb-4">
                            <label class="block text-sm font-bold mb-1">用户名列表（每行一个，不带@）</label>
                            <textarea id="import-usernames" rows="10" placeholder="elonmusk&#10;VitalikButerin&#10;caborat" class="w-full p-2 border rounded font-mono text-sm"></textarea>
                        </div>
                        <div class="form-group mb-4">
                            <label class="block text-sm font-bold mb-1">自动分组</label>
                            <div class="flex items-center gap-2">
                                <input type="checkbox" id="import-auto-group" checked>
                                <span class="text-sm text-slate-600">自动按 12 组平均分配</span>
                            </div>
                        </div>
                        <div class="form-group mb-4" id="import-manual-group-container" style="display:none;">
                            <label class="block text-sm font-bold mb-1">指定分组 (0-11)</label>
                            <input type="number" id="import-group" value="0" min="0" max="11" class="w-full p-2 border rounded">
                        </div>
                        <div class="modal-actions flex gap-2 justify-end">
                            <button class="btn-secondary px-4 py-2 border border-slate-300 rounded hover:bg-slate-50" id="cancel-import">取消</button>
                            <button class="btn-primary px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded" id="confirm-import">导入</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderKolList(kols) {
        if (kols.length === 0) return '<div class="text-slate-400 text-center py-4">暂无大V</div>';

        // 按组分组
        const groups = {};
        kols.forEach(k => {
            if (!groups[k.group_index]) groups[k.group_index] = [];
            groups[k.group_index].push(k);
        });

        return Object.entries(groups).map(([groupIndex, groupKols]) => `
            <div class="kol-group mb-3 bg-slate-50 rounded p-3">
                <div class="group-header font-bold text-slate-600 mb-2">组 ${groupIndex} (${groupKols.length}人)</div>
                <div class="group-kols space-y-1">
                    ${groupKols.map(k => {
                        const weight = k.weight ?? 100;
                        const weightColor = weight >= 80 ? 'text-green-600' : weight >= 50 ? 'text-amber-600' : 'text-red-600';
                        const showReset = weight < 100;
                        return `
                        <div class="kol-item flex items-center gap-2 py-1">
                            <span class="kol-name font-mono text-sm">@${k.kol_username}</span>
                            ${k.kol_display_name ? `<span class="kol-display text-slate-500 text-xs">${k.kol_display_name}</span>` : ''}
                            <span class="kol-weight ${weightColor} text-xs font-bold ml-2" title="权重值：满足评论条件时有效，否则权重-1">权重:${weight}</span>
                            ${showReset ? `<button class="btn-reset-weight px-2 py-1 bg-amber-50 text-amber-600 text-xs rounded hover:bg-amber-100" data-id="${k.id}" title="重置权重为100">重置</button>` : ''}
                            <button class="btn-delete ml-auto px-2 py-1 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100" data-id="${k.id}">删除</button>
                        </div>
                    `}).join('')}
                </div>
            </div>
        `).join('');
    }

    bindKolEvents() {
        const token = localStorage.getItem('token');

        // 添加按钮
        document.getElementById('add-kol')?.addEventListener('click', () => {
            document.getElementById('add-kol-modal').style.display = 'flex';
        });

        // 取消
        document.getElementById('cancel-add')?.addEventListener('click', () => {
            document.getElementById('add-kol-modal').style.display = 'none';
        });

        // 批量导入按钮
        document.getElementById('import-kols')?.addEventListener('click', () => {
            document.getElementById('import-kol-modal').style.display = 'flex';
        });

        // 取消导入
        document.getElementById('cancel-import')?.addEventListener('click', () => {
            document.getElementById('import-kol-modal').style.display = 'none';
        });

        // 自动分组切换
        document.getElementById('import-auto-group')?.addEventListener('change', (e) => {
            document.getElementById('import-manual-group-container').style.display = e.target.checked ? 'none' : 'block';
        });

        // 确认导入
        document.getElementById('confirm-import')?.addEventListener('click', async () => {
            const region = document.getElementById('import-region').value;
            const usernamesText = document.getElementById('import-usernames').value;
            const autoGroup = document.getElementById('import-auto-group').checked;
            const manualGroup = parseInt(document.getElementById('import-group').value);

            // 解析用户名
            const usernames = usernamesText.split('\n')
                .map(u => u.trim().replace(/^@/, ''))
                .filter(u => u.length > 0);

            if (usernames.length === 0) {
                alert('请输入用户名');
                return;
            }

            // 构建导入数据
            const GROUPS = 12;
            const kolsPerGroup = Math.ceil(usernames.length / GROUPS);
            const kols = usernames.map((username, index) => ({
                region,
                kolUsername: username,
                kolDisplayName: '',
                groupIndex: autoGroup ? Math.floor(index / kolsPerGroup) : manualGroup
            }));

            try {
                const res = await fetch('/api/comment-assistant/kol/import', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ kols })
                });

                if (res.ok) {
                    const result = await res.json();
                    alert(`成功导入 ${result.imported} 个大V`);
                    document.getElementById('import-kol-modal').style.display = 'none';
                    document.getElementById('import-usernames').value = '';
                    this.loadKolManagement();
                } else {
                    const err = await res.json();
                    alert('导入失败: ' + err.error);
                }
            } catch (error) {
                alert('导入失败: ' + error.message);
            }
        });

        // 确认添加
        document.getElementById('confirm-add')?.addEventListener('click', async () => {
            const data = {
                region: document.getElementById('kol-region').value,
                kolUsername: document.getElementById('kol-username').value,
                kolDisplayName: document.getElementById('kol-display-name').value,
                groupIndex: parseInt(document.getElementById('kol-group').value)
            };

            if (!data.kolUsername) {
                alert('请输入用户名');
                return;
            }

            try {
                const res = await fetch('/api/comment-assistant/kol', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    document.getElementById('add-kol-modal').style.display = 'none';
                    this.loadKolManagement();
                } else {
                    const err = await res.json();
                    alert(err.error);
                }
            } catch (error) {
                alert('添加失败: ' + error.message);
            }
        });

        // 删除
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                if (!confirm('确定删除此大V？')) return;

                try {
                    const res = await fetch(`/api/comment-assistant/kol/${id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        this.loadKolManagement();
                    }
                } catch (error) {
                    alert('删除失败: ' + error.message);
                }
            });
        });

        // 重置权重
        document.querySelectorAll('.btn-reset-weight').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                try {
                    const res = await fetch(`/api/comment-assistant/kol/${id}/weight/reset`, {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        this.loadKolManagement();
                    } else {
                        const err = await res.json();
                        alert(err.error);
                    }
                } catch (error) {
                    alert('重置权重失败: ' + error.message);
                }
            });
        });
    }

    // ============ 历史 ============

    async loadHistory() {
        const container = document.getElementById('tab-content');
        container.innerHTML = '<div class="loading text-center py-10 text-slate-500">加载中...</div>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/comment-assistant/history', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            container.innerHTML = this.renderHistory(data);
        } catch (error) {
            container.innerHTML = `<div class="error text-red-600 p-4 bg-red-50 rounded">加载失败: ${error.message}</div>`;
        }
    }

    renderHistory(data) {
        if (data.items.length === 0) {
            return '<div class="text-slate-400 text-center py-10">暂无评论记录</div>';
        }

        return `
            <div class="history-list">
                <div class="history-header mb-4 text-slate-500">
                    共 ${data.total} 条记录
                </div>
                ${data.items.map(item => `
                    <div class="history-item glass-panel p-4 rounded-lg mb-3">
                        <div class="history-meta flex items-center gap-2 mb-2">
                            <span class="region-tag px-2 py-1 rounded text-xs font-bold ${item.region === 'ja' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">${item.region === 'ja' ? '日区' : '美区'}</span>
                            <span class="style-tag px-2 py-1 bg-slate-100 rounded text-xs">${item.comment_style}</span>
                            <span class="time ml-auto text-slate-400 text-xs">${new Date(item.published_at).toLocaleString()}</span>
                        </div>
                        <div class="history-tweet bg-slate-50 p-3 rounded mb-2">
                            <a href="${item.tweet_url}" target="_blank" class="text-blue-600 font-bold">@${item.tweet_author}</a>
                            <p class="text-slate-600 text-sm mt-1">${item.tweet_content || ''}</p>
                        </div>
                        <div class="history-comment">
                            <strong class="text-slate-700">评论:</strong> <span class="text-slate-600">${item.comment_content}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ============ 费用统计 ============

    async loadUsage() {
        const container = document.getElementById('tab-content');
        container.innerHTML = '<div class="loading text-center py-10 text-slate-500">加载中...</div>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/comment-assistant/usage', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            container.innerHTML = this.renderUsage(data);
        } catch (error) {
            container.innerHTML = `<div class="error text-red-600 p-4 bg-red-50 rounded">加载失败: ${error.message}</div>`;
        }
    }

    renderUsage(data) {
        const summary = data.summary || {};

        return `
            <div class="usage-page">
                <div class="usage-summary grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div class="usage-card glass-panel p-4 rounded-lg text-center">
                        <div class="card-title text-xs text-slate-500 uppercase">总调用次数</div>
                        <div class="card-value text-2xl font-bold mt-2">${summary.total_requests || 0}</div>
                    </div>
                    <div class="usage-card glass-panel p-4 rounded-lg text-center">
                        <div class="card-title text-xs text-slate-500 uppercase">总条目数</div>
                        <div class="card-value text-2xl font-bold mt-2">${summary.total_items || 0}</div>
                    </div>
                    <div class="usage-card glass-panel p-4 rounded-lg text-center">
                        <div class="card-title text-xs text-slate-500 uppercase">总费用</div>
                        <div class="card-value text-2xl font-bold mt-2">$${(parseFloat(summary.total_cost) || 0).toFixed(4)}</div>
                    </div>
                </div>

                <div class="usage-by-action glass-panel p-6 rounded-lg mb-6">
                    <h3 class="font-serif text-lg font-bold mb-4">按操作类型</h3>
                    <table class="usage-table w-full">
                        <thead>
                            <tr class="border-b">
                                <th class="text-left py-2 px-3">操作</th>
                                <th class="text-left py-2 px-3">请求数</th>
                                <th class="text-left py-2 px-3">条目数</th>
                                <th class="text-left py-2 px-3">费用</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(data.byAction || []).map(a => `
                                <tr class="border-b">
                                    <td class="py-2 px-3">${a.api_action}</td>
                                    <td class="py-2 px-3">${a.requests}</td>
                                    <td class="py-2 px-3">${a.items}</td>
                                    <td class="py-2 px-3">$${parseFloat(a.cost).toFixed(4)}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="4" class="py-4 text-center text-slate-400">暂无数据</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <div class="usage-by-region glass-panel p-6 rounded-lg">
                    <h3 class="font-serif text-lg font-bold mb-4">按区域</h3>
                    <div class="region-stats flex gap-4">
                        ${(data.byRegion || []).map(r => `
                            <div class="region-stat flex items-center gap-2">
                                <span class="region-tag px-2 py-1 rounded text-xs font-bold ${r.region === 'ja' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">${r.region === 'ja' ? '日区' : '美区'}</span>
                                <span class="text-slate-600">${r.requests} 次 / $${parseFloat(r.cost).toFixed(4)}</span>
                            </div>
                        `).join('') || '<span class="text-slate-400">暂无数据</span>'}
                    </div>
                </div>
            </div>
        `;
    }
}

// 导出
window.CommentAssistantPage = CommentAssistantPage;

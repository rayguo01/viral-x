/**
 * 评论助手页面（普通用户界面）
 * 只显示评论历史，管理功能在 /admin.html 中
 */

class CommentAssistantPage {
    constructor(options = {}) {
        this.currentTab = 'history';
        // 分页状态
        this.historyPage = 1;
        this.historyLimit = 20;
    }

    async render() {
        return `
            <div class="comment-assistant-page">
                <div class="page-header">
                    <h1 class="font-serif text-2xl font-bold text-slate-800">评论助手</h1>
                    <p class="text-slate-500 mt-2">查看评论助手自动发布的评论记录</p>
                </div>

                <div class="tab-content" id="tab-content">
                    <div class="loading text-center py-10 text-slate-500">加载中...</div>
                </div>
            </div>
        `;
    }

    async afterRender() {
        // 直接加载评论历史
        await this.loadHistory();
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

                <!-- 功能控制 -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                    <!-- 自动评论 -->
                    <div class="glass-panel p-4 rounded-lg">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="font-bold text-slate-800">自动评论</h4>
                            <div class="flex items-center gap-3">
                                <label class="switch">
                                    <input type="checkbox" id="auto-enabled" ${settings.auto_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <span class="text-sm font-bold ${settings.auto_enabled ? 'text-green-600' : 'text-slate-400'}">${settings.auto_enabled ? '运行中' : '已停止'}</span>
                            </div>
                        </div>
                        <p class="text-xs text-slate-500 mb-3">自动抓取KOL推文并发布评论到Twitter</p>
                        <button class="btn-secondary px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50" id="run-auto-once">
                            <span class="material-icons-outlined align-middle mr-1 text-sm">play_arrow</span>运行一次
                        </button>
                        <div id="auto-run-result" class="mt-2"></div>
                    </div>

                    <!-- 手动评论 -->
                    <div class="glass-panel p-4 rounded-lg">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="font-bold text-slate-800">手动评论</h4>
                            <div class="flex items-center gap-3">
                                <label class="switch">
                                    <input type="checkbox" id="manual-enabled" ${settings.manual_enabled ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                                <span class="text-sm font-bold ${settings.manual_enabled ? 'text-green-600' : 'text-slate-400'}">${settings.manual_enabled ? '运行中' : '已停止'}</span>
                            </div>
                        </div>
                        <p class="text-xs text-slate-500 mb-3">为有权限的用户生成待评论记录，用户手动复制发布</p>
                        <button class="btn-secondary px-3 py-1.5 text-sm border border-amber-300 bg-amber-50 text-amber-700 rounded hover:bg-amber-100" id="run-manual-once">
                            <span class="material-icons-outlined align-middle mr-1 text-sm">edit_note</span>运行一次
                        </button>
                        <div id="manual-run-result" class="mt-2"></div>
                    </div>
                </div>

                <!-- 状态卡片 -->
                <div class="status-cards grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

            </div>
        `;
    }

    bindDashboardEvents() {
        const token = localStorage.getItem('token');

        // 加载 Twitter 用户列表
        this.loadTwitterUsers(token);

        // 自动评论开关
        document.getElementById('auto-enabled')?.addEventListener('change', async (e) => {
            await this.updateSettings({ autoEnabled: e.target.checked }, token);
        });

        // 手动评论开关
        document.getElementById('manual-enabled')?.addEventListener('change', async (e) => {
            await this.updateSettings({ manualEnabled: e.target.checked }, token);
        });

        // 保存设置
        document.getElementById('save-settings')?.addEventListener('click', async () => {
            const dailyLimit = parseInt(document.getElementById('daily-limit').value);
            const monthlyBudget = parseFloat(document.getElementById('monthly-budget').value);
            const commentUserId = document.getElementById('comment-user').value || null;
            await this.updateSettings({ dailyLimit, monthlyBudget, commentUserId: commentUserId ? parseInt(commentUserId) : null }, token);
        });

        // 运行一次自动评论
        document.getElementById('run-auto-once')?.addEventListener('click', async () => {
            const resultDiv = document.getElementById('auto-run-result');
            resultDiv.innerHTML = '<span class="text-slate-500 text-xs">执行中...</span>';
            try {
                const res = await fetch('/api/comment-assistant/run-auto', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const result = await res.json();
                resultDiv.innerHTML = `<pre class="bg-slate-100 p-2 rounded text-xs overflow-auto max-h-32">${JSON.stringify(result, null, 2)}</pre>`;
                this.loadDashboard();
            } catch (error) {
                resultDiv.innerHTML = `<div class="text-red-600 text-xs">${error.message}</div>`;
            }
        });

        // 运行一次手动评论
        document.getElementById('run-manual-once')?.addEventListener('click', async () => {
            const resultDiv = document.getElementById('manual-run-result');
            resultDiv.innerHTML = '<span class="text-amber-600 text-xs">生成中...</span>';
            try {
                const res = await fetch('/api/comment-assistant/run-manual', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const result = await res.json();
                resultDiv.innerHTML = `<pre class="bg-amber-50 p-2 rounded text-xs overflow-auto max-h-32 border border-amber-200">${JSON.stringify(result, null, 2)}</pre>`;
                this.loadDashboard();
            } catch (error) {
                resultDiv.innerHTML = `<div class="text-red-600 text-xs">${error.message}</div>`;
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

    async loadHistory(page = 1, status = null) {
        const container = document.getElementById('tab-content');
        container.innerHTML = '<div class="loading text-center py-10 text-slate-500">加载中...</div>';

        this.historyPage = page;
        this.historyStatus = status;

        try {
            const token = localStorage.getItem('token');
            let url = `/api/comment-assistant/history?page=${page}&limit=${this.historyLimit}`;
            if (status) {
                url += `&status=${status}`;
            }
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || '加载失败');
            }

            container.innerHTML = this.renderHistory(data);
            this.bindHistoryEvents();
        } catch (error) {
            container.innerHTML = `<div class="error text-red-600 p-4 bg-red-50 rounded">加载失败: ${error.message}</div>`;
        }
    }

    renderHistory(data) {
        // 保存数据供弹窗使用
        this.historyItems = data.items || [];

        const totalPages = Math.ceil(data.total / this.historyLimit);
        const currentPage = data.page || this.historyPage;
        const currentStatus = this.historyStatus || '';
        const pendingCount = data.pendingCount || 0;

        // 空数据提示
        const emptyMsg = currentStatus === 'pending'
            ? '暂无待评论记录'
            : currentStatus === 'completed'
                ? '暂无已完成记录'
                : '暂无评论记录';

        if (!data.items || data.items.length === 0) {
            return `
                <div class="history-list">
                    <!-- 状态筛选 -->
                    <div class="history-filter mb-4 flex items-center gap-2">
                        <button class="filter-btn px-3 py-1.5 text-sm rounded-lg ${!currentStatus ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" data-status="">全部</button>
                        <button class="filter-btn px-3 py-1.5 text-sm rounded-lg ${currentStatus === 'pending' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" data-status="pending">
                            待评论 ${pendingCount > 0 ? `<span class="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">${pendingCount}</span>` : ''}
                        </button>
                        <button class="filter-btn px-3 py-1.5 text-sm rounded-lg ${currentStatus === 'completed' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" data-status="completed">已完成</button>
                    </div>
                    <div class="text-slate-400 text-center py-10">${emptyMsg}</div>
                </div>
            `;
        }

        return `
            <div class="history-list">
                <!-- 状态筛选 -->
                <div class="history-filter mb-4 flex items-center gap-2">
                    <button class="filter-btn px-3 py-1.5 text-sm rounded-lg ${!currentStatus ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" data-status="">全部</button>
                    <button class="filter-btn px-3 py-1.5 text-sm rounded-lg ${currentStatus === 'pending' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" data-status="pending">
                        待评论 ${pendingCount > 0 ? `<span class="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">${pendingCount}</span>` : ''}
                    </button>
                    <button class="filter-btn px-3 py-1.5 text-sm rounded-lg ${currentStatus === 'completed' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}" data-status="completed">已完成</button>
                </div>

                <div class="history-header mb-4 flex items-center justify-between">
                    <span class="text-slate-500">共 ${data.total} 条记录</span>
                    <span class="text-slate-400 text-sm">第 ${currentPage} / ${totalPages} 页</span>
                </div>
                ${data.items.map((item, index) => {
                    const isPending = item.status === 'pending';
                    const statusLabel = isPending ? '待评论' : '已完成';
                    const statusClass = isPending ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';
                    return `
                    <div class="history-item glass-panel p-4 rounded-lg mb-3 cursor-pointer hover:bg-slate-50 transition-colors ${isPending ? 'border-l-4 border-orange-400' : ''}" data-index="${index}">
                        <div class="history-meta flex items-center gap-2 mb-2">
                            <span class="status-tag px-2 py-1 rounded text-xs font-bold ${statusClass}">${statusLabel}</span>
                            <span class="region-tag px-2 py-1 rounded text-xs font-bold ${item.region === 'ja' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">${item.region === 'ja' ? '日区' : '美区'}</span>
                            <span class="style-tag px-2 py-1 bg-slate-100 rounded text-xs">${item.comment_style}</span>
                            <span class="time ml-auto text-slate-400 text-xs">${new Date(item.published_at).toLocaleString()}</span>
                        </div>
                        <div class="history-tweet bg-slate-50 p-3 rounded mb-2">
                            <span class="text-blue-600 font-bold">@${item.tweet_author}</span>
                            <p class="text-slate-600 text-sm mt-1 line-clamp-2">${item.tweet_content || ''}</p>
                        </div>
                        <div class="history-comment">
                            <strong class="text-slate-700">评论:</strong> <span class="text-slate-600 line-clamp-1">${item.comment_content}</span>
                        </div>
                    </div>
                `}).join('')}

                <!-- 分页控件 -->
                ${totalPages > 1 ? `
                    <div class="pagination flex items-center justify-center gap-2 mt-6 pt-4 border-t border-slate-200">
                        <button class="btn-page px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                id="history-prev" ${currentPage <= 1 ? 'disabled' : ''}>
                            上一页
                        </button>
                        <span class="text-slate-500 text-sm px-3">${currentPage} / ${totalPages}</span>
                        <button class="btn-page px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                id="history-next" ${currentPage >= totalPages ? 'disabled' : ''}>
                            下一页
                        </button>
                    </div>
                ` : ''}
            </div>

            <!-- 详情弹窗 -->
            <div id="history-detail-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/40 backdrop-blur-sm">
                <div class="glass-panel bg-white/95 rounded-2xl max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden shadow-xl">
                    <div class="px-6 py-4 border-b border-slate-200/50 flex items-center justify-between">
                        <h3 class="text-lg font-bold text-slate-800">评论详情</h3>
                        <button id="modal-close" class="text-slate-400 hover:text-slate-600 transition-colors">
                            <span class="material-icons-outlined">close</span>
                        </button>
                    </div>
                    <div class="p-6 overflow-y-auto max-h-[65vh] space-y-4" id="modal-content">
                        <!-- 动态填充 -->
                    </div>
                    <div class="px-6 py-4 border-t border-slate-200/50 flex justify-between items-center">
                        <button id="modal-mark-complete" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors hidden">
                            <span class="material-icons-outlined text-sm align-middle mr-1">check</span>已评论
                        </button>
                        <div class="flex gap-2 ml-auto">
                            <button id="modal-close-btn" class="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">关闭</button>
                            <a id="modal-tweet-link" href="#" target="_blank" class="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2">
                                <span style="font-family: system-ui;">𝕏</span> 前往推文
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    bindHistoryEvents() {
        // 状态筛选按钮
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const status = btn.dataset.status || null;
                this.loadHistory(1, status);
            });
        });

        const prevBtn = document.getElementById('history-prev');
        const nextBtn = document.getElementById('history-next');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.historyPage > 1) {
                    this.loadHistory(this.historyPage - 1, this.historyStatus);
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.loadHistory(this.historyPage + 1, this.historyStatus);
            });
        }

        // 点击历史记录项显示弹窗
        document.querySelectorAll('.history-item[data-index]').forEach(item => {
            item.addEventListener('click', (e) => {
                const index = parseInt(item.dataset.index);
                if (this.historyItems && this.historyItems[index]) {
                    this.showDetailModal(this.historyItems[index]);
                }
            });
        });

        // 弹窗关闭按钮
        const closeBtn = document.getElementById('modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideDetailModal());
        }

        // 点击弹窗背景关闭
        const modal = document.getElementById('history-detail-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideDetailModal();
                }
            });
        }
    }

    showDetailModal(item) {
        const modal = document.getElementById('history-detail-modal');
        const content = document.getElementById('modal-content');
        const tweetLink = document.getElementById('modal-tweet-link');
        const markCompleteBtn = document.getElementById('modal-mark-complete');
        const closeBtn = document.getElementById('modal-close-btn');

        if (!modal || !content) return;

        // 保存当前查看的记录
        this.currentDetailItem = item;

        const isPending = item.status === 'pending';
        const statusLabel = isPending ? '待评论' : '已完成';
        const statusClass = isPending ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';

        // 填充内容
        content.innerHTML = `
            <!-- 状态 -->
            <div class="detail-status mb-2">
                <span class="status-tag px-3 py-1.5 rounded text-sm font-bold ${statusClass}">${statusLabel}</span>
            </div>

            <!-- 推特主号 -->
            <div class="detail-section">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs text-slate-500 uppercase font-medium">推特主号</span>
                    <button class="copy-btn text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1 text-xs" data-copy="@${item.tweet_author}">
                        <span class="material-icons-outlined text-sm">content_copy</span> 复制
                    </button>
                </div>
                <div class="bg-slate-50 p-3 rounded-lg">
                    <span class="text-blue-600 font-bold text-lg">@${item.tweet_author}</span>
                </div>
            </div>

            <!-- 推文内容 -->
            <div class="detail-section">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs text-slate-500 uppercase font-medium">推文内容</span>
                </div>
                <div class="bg-slate-50 p-3 rounded-lg">
                    <p class="text-slate-700 whitespace-pre-wrap">${item.tweet_content || '(无内容)'}</p>
                </div>
            </div>

            <!-- 评论内容 -->
            <div class="detail-section">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs text-slate-500 uppercase font-medium">评论内容</span>
                    <button class="copy-btn text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1 text-xs" data-copy="${this.escapeHtml(item.comment_content)}">
                        <span class="material-icons-outlined text-sm">content_copy</span> 复制
                    </button>
                </div>
                <div class="bg-amber-50 p-3 rounded-lg border border-amber-200">
                    <p class="text-slate-800 whitespace-pre-wrap">${item.comment_content}</p>
                </div>
            </div>

            <!-- 元信息 -->
            <div class="detail-meta flex items-center gap-3 text-xs text-slate-400 pt-2">
                <span class="region-tag px-2 py-1 rounded font-bold ${item.region === 'ja' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">${item.region === 'ja' ? '日区' : '美区'}</span>
                <span class="px-2 py-1 bg-slate-100 rounded">${item.comment_style}</span>
                <span class="ml-auto">${new Date(item.published_at).toLocaleString()}</span>
            </div>
        `;

        // 设置推文链接
        if (tweetLink) {
            tweetLink.href = item.tweet_url;
        }

        // 显示/隐藏"已评论"按钮
        if (markCompleteBtn) {
            if (isPending) {
                markCompleteBtn.classList.remove('hidden');
                markCompleteBtn.onclick = () => this.markCommentComplete(item.id);
            } else {
                markCompleteBtn.classList.add('hidden');
            }
        }

        // 关闭按钮
        if (closeBtn) {
            closeBtn.onclick = () => this.hideDetailModal();
        }

        // 绑定复制按钮事件
        content.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.dataset.copy;
                this.copyToClipboard(text, btn);
            });
        });

        // 显示弹窗
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    async markCommentComplete(commentId) {
        const btn = document.getElementById('modal-mark-complete');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons-outlined text-sm align-middle mr-1 animate-spin">sync</span>处理中...';
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/comment-assistant/history/${commentId}/complete`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || '标记失败');
            }

            // 关闭弹窗并刷新列表
            this.hideDetailModal();
            this.loadHistory(this.historyPage, this.historyStatus);
        } catch (error) {
            alert('标记失败: ' + error.message);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span class="material-icons-outlined text-sm align-middle mr-1">check</span>已评论';
            }
        }
    }

    hideDetailModal() {
        const modal = document.getElementById('history-detail-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    copyToClipboard(text, btn) {
        navigator.clipboard.writeText(text).then(() => {
            // 显示复制成功
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="material-icons-outlined text-sm">check</span> 已复制';
            btn.classList.add('text-green-600');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('text-green-600');
            }, 1500);
        }).catch(() => {
            alert('复制失败，请手动复制');
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/"/g, '&quot;');
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

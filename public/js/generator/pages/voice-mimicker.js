/**
 * 语气模仿器页面 - 支持市场和我的生成器子路由
 */
class VoiceMimickerPage {
    constructor(generator, params) {
        this.generator = generator;
        this.state = window.generatorState;
        // params 是数组，如 ['market'] 或 ['mine']
        this.subRoute = (Array.isArray(params) && params[0]) || 'market'; // 默认显示市场
        this.marketData = { items: [], total: 0 };
        this.myPrompts = [];
        this.subscribedPrompts = [];
        this.isAnalyzing = false;
        this.currentSort = 'usage';
    }

    render(container) {
        container.innerHTML = `
            <div class="voice-mimicker-page">
                <div class="page-header">
                    <button class="btn btn-ghost back-btn" id="back-to-home">
                        ← 返回
                    </button>
                    <div class="page-title">
                        <span>🎭</span> 语气模仿器
                    </div>
                </div>

                <!-- Tab 导航 -->
                <div class="vm-tabs">
                    <button class="vm-tab ${this.subRoute === 'market' ? 'active' : ''}" data-tab="market">
                        市场
                    </button>
                    <button class="vm-tab ${this.subRoute === 'mine' ? 'active' : ''}" data-tab="mine">
                        我的生成器
                    </button>
                </div>

                <!-- 子页面内容 -->
                <div class="vm-content" id="vm-content">
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <span>加载中...</span>
                    </div>
                </div>
            </div>

            <!-- Prompt 详情弹窗 -->
            <div class="prompt-modal hidden" id="prompt-modal">
                <div class="modal-overlay"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <div class="modal-user">
                            <img class="modal-avatar" id="modal-avatar" src="" alt="">
                            <div class="modal-user-info">
                                <span class="modal-username" id="modal-username"></span>
                                <span class="modal-meta" id="modal-meta"></span>
                            </div>
                        </div>
                        <button class="modal-close" id="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="prompt-content" id="modal-prompt-content"></div>
                    </div>
                    <div class="modal-footer" id="modal-footer">
                        <button class="btn btn-ghost" id="copy-prompt-btn">
                            📋 复制 Prompt
                        </button>
                        <button class="btn btn-danger" id="delete-prompt-btn">
                            🗑️ 删除
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents(container);
        this.loadSubPage();
    }

    bindEvents(container) {
        // 返回按钮 - 返回到工具页面并更新导航
        container.querySelector('#back-to-home').addEventListener('click', () => {
            // 更新导航到工具页面
            if (window.app) {
                window.app.navigateTo('tools');
            }
        });

        // Tab 切换
        container.querySelectorAll('.vm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                if (targetTab !== this.subRoute) {
                    this.subRoute = targetTab;
                    container.querySelectorAll('.vm-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.loadSubPage();
                    // 更新 URL hash（不触发导航）
                    history.replaceState(null, '', `#voice-mimicker/${targetTab}`);
                }
            });
        });

        // 弹窗关闭
        container.querySelector('#modal-close').addEventListener('click', () => {
            this.closeModal();
        });
        container.querySelector('.modal-overlay').addEventListener('click', () => {
            this.closeModal();
        });
    }

    loadSubPage() {
        if (this.subRoute === 'market') {
            this.renderMarketPage();
        } else {
            this.renderMinePage();
        }
    }

    // 切换到市场 tab
    switchToMarket() {
        this.subRoute = 'market';
        // 更新 tab 状态
        document.querySelectorAll('.vm-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.vm-tab[data-tab="market"]')?.classList.add('active');
        // 加载市场页面
        this.loadSubPage();
        // 更新 URL
        history.replaceState(null, '', '#voice-mimicker/market');
    }

    // ========== 市场页面 ==========
    async renderMarketPage() {
        const content = document.getElementById('vm-content');
        content.innerHTML = `
            <div class="vm-market">
                <!-- 排序选择器 -->
                <div class="market-toolbar">
                    <div class="sort-selector">
                        <span class="sort-label">排序：</span>
                        <select id="market-sort" class="sort-select">
                            <option value="usage" ${this.currentSort === 'usage' ? 'selected' : ''}>使用量</option>
                            <option value="latest" ${this.currentSort === 'latest' ? 'selected' : ''}>最新</option>
                            <option value="subscribers" ${this.currentSort === 'subscribers' ? 'selected' : ''}>订阅数</option>
                        </select>
                    </div>
                </div>

                <!-- 市场列表 -->
                <div class="market-grid" id="market-grid">
                    <div class="loading-state">
                        <div class="loading-spinner"></div>
                        <span>加载市场数据...</span>
                    </div>
                </div>
            </div>
        `;

        // 绑定排序事件
        document.getElementById('market-sort').addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.loadMarketData();
        });

        await this.loadMarketData();
    }

    async loadMarketData() {
        const grid = document.getElementById('market-grid');
        try {
            const data = await this.generator.api(`/api/tools/voice-prompts/market?sort=${this.currentSort}`);
            this.marketData = data;
            this.renderMarketGrid();
        } catch (error) {
            console.error('加载市场数据失败:', error);
            grid.innerHTML = `<div class="error-state">加载失败，请重试</div>`;
        }
    }

    renderMarketGrid() {
        const grid = document.getElementById('market-grid');
        const items = this.marketData.items || [];

        if (items.length === 0) {
            grid.innerHTML = `
                <div class="empty-market">
                    <span class="empty-icon">🏪</span>
                    <p>市场暂无内容</p>
                    <p class="empty-hint">成为第一个开放语气模仿器的人吧！</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = items.map(item => this.renderMarketCard(item)).join('');

        // 绑定卡片事件
        grid.querySelectorAll('.market-card').forEach(card => {
            const id = card.dataset.id;

            // 详情按钮
            card.querySelector('.card-body').addEventListener('click', () => {
                this.showPromptDetail(id, true);
            });

            // 订阅按钮
            const subBtn = card.querySelector('.subscribe-btn');
            if (subBtn) {
                subBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleSubscribe(id, subBtn);
                });
            }
        });
    }

    renderMarketCard(item) {
        const displayName = item.display_name || item.username;
        const role = item.role || '风格模仿器';
        const traits = item.core_traits ? (typeof item.core_traits === 'string' ? JSON.parse(item.core_traits) : item.core_traits) : [];
        const traitsHtml = traits.slice(0, 3).map(t => `<span class="trait-tag">${t}</span>`).join('');

        const isOwner = item.is_owner;
        const isSubscribed = item.is_subscribed;

        return `
            <div class="market-card" data-id="${item.id}">
                <div class="card-body">
                    <div class="card-header">
                        <img class="card-avatar"
                             src="${item.avatar_url || `https://unavatar.io/twitter/${item.username}`}"
                             alt="${displayName}"
                             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23667%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22>${item.username[0].toUpperCase()}</text></svg>'">
                        <div class="card-user">
                            <span class="card-username">${displayName}</span>
                            <span class="card-role">${role}</span>
                        </div>
                    </div>
                    <div class="card-traits">${traitsHtml || '<span class="trait-tag">暂无特质</span>'}</div>
                    <div class="card-stats">
                        <span>使用 ${item.usage_count || 0} 次</span>
                        <span>·</span>
                        <span>${item.subscriber_count || 0} 订阅</span>
                    </div>
                </div>
                <div class="card-actions">
                    ${isOwner ? '<span class="owner-badge">我的</span>' :
                      `<button class="btn btn-sm subscribe-btn ${isSubscribed ? 'subscribed' : ''}">
                          ${isSubscribed ? '已订阅' : '+ 订阅'}
                      </button>`
                    }
                </div>
            </div>
        `;
    }

    async toggleSubscribe(id, btn) {
        const isSubscribed = btn.classList.contains('subscribed');

        try {
            if (isSubscribed) {
                await this.generator.api(`/api/tools/voice-prompts/${id}/subscribe`, {
                    method: 'DELETE'
                });
                btn.classList.remove('subscribed');
                btn.textContent = '+ 订阅';
                this.generator.showToast('已取消订阅', 'success');
            } else {
                await this.generator.api(`/api/tools/voice-prompts/${id}/subscribe`, {
                    method: 'POST'
                });
                btn.classList.add('subscribed');
                btn.textContent = '已订阅';
                this.generator.showToast('订阅成功', 'success');
            }
            // 刷新市场数据更新订阅数
            this.loadMarketData();
        } catch (error) {
            this.generator.showToast(error.message || '操作失败', 'error');
        }
    }

    // ========== 我的生成器页面 ==========
    async renderMinePage() {
        const content = document.getElementById('vm-content');
        content.innerHTML = `
            <div class="vm-mine">
                <!-- 创建新生成器 -->
                <div class="create-section">
                    <div class="section-header">
                        <span class="section-icon">✨</span>
                        <span class="section-title">创建新生成器</span>
                    </div>
                    <div class="input-row">
                        <div class="input-wrapper">
                            <span class="input-prefix">@</span>
                            <input type="text"
                                   id="twitter-username"
                                   class="username-input"
                                   placeholder="输入 Twitter 用户名"
                                   autocomplete="off">
                        </div>
                        <button class="btn btn-primary" id="analyze-btn">
                            开始分析
                        </button>
                    </div>
                    <p class="input-hint">
                        将抓取该用户最近的推文，分析其写作风格
                    </p>
                </div>

                <!-- 分析进度 -->
                <div class="analyze-progress hidden" id="analyze-progress">
                    <div class="progress-header">
                        <div class="loading-spinner"></div>
                        <span id="progress-text">正在分析...</span>
                    </div>
                    <div class="log-output" id="analyze-log"></div>
                </div>

                <!-- 我的生成器列表 -->
                <div class="my-prompts-section">
                    <div class="section-header">
                        <span class="section-icon">📚</span>
                        <span class="section-title">我的生成器</span>
                    </div>
                    <div class="my-prompts-grid" id="my-prompts-grid">
                        <div class="loading-state">
                            <div class="loading-spinner"></div>
                            <span>加载中...</span>
                        </div>
                    </div>
                </div>

                <!-- 我订阅的 -->
                <div class="subscribed-section">
                    <div class="section-header">
                        <span class="section-icon">⭐</span>
                        <span class="section-title">我订阅的</span>
                    </div>
                    <div class="subscribed-grid" id="subscribed-grid">
                        <div class="loading-state">
                            <div class="loading-spinner"></div>
                            <span>加载中...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 绑定分析事件
        document.getElementById('analyze-btn').addEventListener('click', () => {
            this.startAnalysis();
        });
        document.getElementById('twitter-username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.startAnalysis();
            }
        });

        await Promise.all([
            this.loadMyPrompts(),
            this.loadSubscribedPrompts()
        ]);
    }

    async loadMyPrompts() {
        const grid = document.getElementById('my-prompts-grid');
        try {
            const data = await this.generator.api('/api/tools/voice-prompts/mine');
            this.myPrompts = data.prompts || [];
            this.renderMyPromptsGrid();
        } catch (error) {
            console.error('加载我的生成器失败:', error);
            grid.innerHTML = `<div class="error-state">加载失败</div>`;
        }
    }

    renderMyPromptsGrid() {
        const grid = document.getElementById('my-prompts-grid');

        if (this.myPrompts.length === 0) {
            grid.innerHTML = `
                <div class="empty-prompts">
                    <span class="empty-icon">📝</span>
                    <p>还没有创建生成器</p>
                    <p class="empty-hint">输入推主用户名开始分析</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.myPrompts.map(item => this.renderMyPromptCard(item)).join('');

        // 绑定事件
        grid.querySelectorAll('.my-prompt-card').forEach(card => {
            const id = card.dataset.id;

            card.querySelector('.card-body').addEventListener('click', () => {
                this.showPromptDetail(id, false);
            });

            // 发布/撤回按钮
            const publishBtn = card.querySelector('.publish-btn');
            if (publishBtn) {
                publishBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.togglePublish(id, publishBtn);
                });
            }

            // 删除按钮
            const deleteBtn = card.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deletePrompt(id);
                });
            }
        });
    }

    renderMyPromptCard(item) {
        const displayName = item.display_name || item.username;
        const isPublic = item.is_public;
        const role = item.role || '风格模仿器';
        const traits = item.core_traits ? (typeof item.core_traits === 'string' ? JSON.parse(item.core_traits) : item.core_traits) : [];
        const traitsHtml = traits.slice(0, 3).map(t => `<span class="trait-tag">${t}</span>`).join('');

        return `
            <div class="my-prompt-card" data-id="${item.id}">
                <div class="card-body">
                    <div class="card-header">
                        <img class="card-avatar"
                             src="${item.avatar_url || `https://unavatar.io/twitter/${item.username}`}"
                             alt="${displayName}"
                             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23667%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22>${item.username[0].toUpperCase()}</text></svg>'">
                        <div class="card-user">
                            <span class="card-username">${displayName}</span>
                            <span class="card-role">${role}</span>
                        </div>
                        ${isPublic ? '<span class="public-status">已开放</span>' : ''}
                    </div>
                    <div class="card-traits">${traitsHtml || '<span class="trait-tag">暂无特质</span>'}</div>
                    <div class="card-stats">
                        <span>使用 ${item.usage_count || 0} 次</span>
                        ${isPublic ? `<span>· ${item.subscriber_count || 0} 订阅</span>` : ''}
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-sm publish-btn ${isPublic ? 'published' : ''}">
                        ${isPublic ? '撤回' : '开放市场'}
                    </button>
                    <button class="btn btn-sm btn-danger delete-btn">删除</button>
                </div>
            </div>
        `;
    }

    async togglePublish(id, btn) {
        const isPublished = btn.classList.contains('published');
        const action = isPublished ? 'unpublish' : 'publish';
        const confirmMsg = isPublished
            ? '撤回后所有订阅者将无法继续使用，确定撤回吗？'
            : '开放到市场后，其他用户可以订阅使用（无法查看 Prompt 内容），确定开放吗？';

        const confirmed = await this.generator.showConfirm(confirmMsg);
        if (!confirmed) return;

        try {
            await this.generator.api(`/api/tools/voice-prompts/${id}/${action}`, {
                method: 'POST'
            });
            this.generator.showToast(isPublished ? '已从市场撤回' : '已开放到市场', 'success');
            this.loadMyPrompts();
        } catch (error) {
            this.generator.showToast(error.message || '操作失败', 'error');
        }
    }

    async loadSubscribedPrompts() {
        const grid = document.getElementById('subscribed-grid');
        try {
            const data = await this.generator.api('/api/tools/voice-prompts/subscribed');
            this.subscribedPrompts = data.prompts || [];
            this.renderSubscribedGrid();
        } catch (error) {
            console.error('加载订阅列表失败:', error);
            grid.innerHTML = `<div class="error-state">加载失败</div>`;
        }
    }

    renderSubscribedGrid() {
        const grid = document.getElementById('subscribed-grid');

        if (this.subscribedPrompts.length === 0) {
            grid.innerHTML = `
                <div class="empty-prompts">
                    <span class="empty-icon">⭐</span>
                    <p>还没有订阅</p>
                    <p class="empty-hint">
                        <a href="javascript:void(0)" class="link-to-market" id="go-to-market">去市场看看 →</a>
                    </p>
                </div>
            `;
            // 绑定跳转到市场的点击事件
            grid.querySelector('#go-to-market')?.addEventListener('click', () => {
                this.switchToMarket();
            });
            return;
        }

        grid.innerHTML = this.subscribedPrompts.map(item => this.renderSubscribedCard(item)).join('');

        // 绑定事件
        grid.querySelectorAll('.subscribed-card').forEach(card => {
            const id = card.dataset.id;

            card.querySelector('.card-body').addEventListener('click', () => {
                this.showPromptDetail(id, true);
            });

            const unsubBtn = card.querySelector('.unsubscribe-btn');
            if (unsubBtn) {
                unsubBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.unsubscribe(id);
                });
            }
        });
    }

    renderSubscribedCard(item) {
        const displayName = item.display_name || item.username;
        const role = item.role || '风格模仿器';
        const traits = item.core_traits ? (typeof item.core_traits === 'string' ? JSON.parse(item.core_traits) : item.core_traits) : [];
        const traitsHtml = traits.slice(0, 3).map(t => `<span class="trait-tag">${t}</span>`).join('');

        return `
            <div class="subscribed-card" data-id="${item.id}">
                <div class="card-body">
                    <div class="card-header">
                        <img class="card-avatar"
                             src="${item.avatar_url || `https://unavatar.io/twitter/${item.username}`}"
                             alt="${displayName}"
                             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23667%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22>${item.username[0].toUpperCase()}</text></svg>'">
                        <div class="card-user">
                            <span class="card-username">${displayName}</span>
                            <span class="card-role">${role}</span>
                        </div>
                    </div>
                    <div class="card-traits">${traitsHtml || '<span class="trait-tag">暂无特质</span>'}</div>
                    <div class="card-stats">
                        <span>使用 ${item.usage_count || 0} 次</span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-sm unsubscribe-btn">取消订阅</button>
                </div>
            </div>
        `;
    }

    async unsubscribe(id) {
        try {
            await this.generator.api(`/api/tools/voice-prompts/${id}/subscribe`, {
                method: 'DELETE'
            });
            this.generator.showToast('已取消订阅', 'success');
            this.loadSubscribedPrompts();
        } catch (error) {
            this.generator.showToast(error.message || '取消订阅失败', 'error');
        }
    }

    // ========== 分析功能 ==========
    async startAnalysis() {
        const input = document.getElementById('twitter-username');
        const username = input.value.trim().replace(/^@/, '');

        if (!username) {
            this.generator.showToast('请输入 Twitter 用户名', 'error');
            return;
        }

        if (this.isAnalyzing) {
            return;
        }

        this.isAnalyzing = true;
        const analyzeBtn = document.getElementById('analyze-btn');
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = '分析中...';

        const progressSection = document.getElementById('analyze-progress');
        const logOutput = document.getElementById('analyze-log');
        progressSection.classList.remove('hidden');
        logOutput.innerHTML = '';

        try {
            const response = await fetch('/api/tools/voice-prompts/analyze', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.generator.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            this.handleAnalyzeEvent(data);
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }
            }
        } catch (error) {
            this.generator.showToast('分析失败: ' + error.message, 'error');
        } finally {
            this.isAnalyzing = false;
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = '开始分析';
        }
    }

    handleAnalyzeEvent(data) {
        const logOutput = document.getElementById('analyze-log');
        const progressText = document.getElementById('progress-text');

        switch (data.type) {
            case 'start':
                progressText.textContent = data.message;
                this.appendLog(data.message, 'info');
                break;

            case 'log':
                this.appendLog(data.message, 'info');
                break;

            case 'done':
                progressText.textContent = '分析完成！';
                this.appendLog('✅ ' + data.message, 'success');
                this.generator.showToast('分析完成！', 'success');

                // 刷新我的列表
                this.loadMyPrompts();

                // 清空输入框
                document.getElementById('twitter-username').value = '';

                // 隐藏进度区域
                setTimeout(() => {
                    document.getElementById('analyze-progress').classList.add('hidden');
                }, 2000);
                break;

            case 'error':
                progressText.textContent = '分析失败';
                this.appendLog('❌ ' + data.message, 'error');
                this.generator.showToast(data.message, 'error');
                break;
        }

        // 自动滚动到底部
        logOutput.scrollTop = logOutput.scrollHeight;
    }

    appendLog(message, type = 'info') {
        const logOutput = document.getElementById('analyze-log');
        const line = document.createElement('span');
        line.className = `log-line ${type}`;
        line.textContent = message;
        logOutput.appendChild(line);
    }

    // ========== 弹窗功能 ==========
    async showPromptDetail(id, isPublicPrompt = false) {
        try {
            const data = await this.generator.api(`/api/tools/voice-prompts/${id}`);
            const prompt = data.prompt;

            this.currentPromptId = id;
            this.currentPromptIsPublic = isPublicPrompt;

            const displayName = prompt.display_name || prompt.username;

            // 填充弹窗内容
            document.getElementById('modal-avatar').src =
                prompt.avatar_url || `https://unavatar.io/twitter/${prompt.username}`;
            document.getElementById('modal-username').textContent = displayName;
            document.getElementById('modal-meta').textContent =
                `${prompt.tweet_count} 条推文 · ${prompt.total_chars} 字`;

            // 公共 prompt 不显示内容
            const promptContent = document.getElementById('modal-prompt-content');
            const footer = document.getElementById('modal-footer');

            if (isPublicPrompt && !prompt.prompt_content) {
                promptContent.innerHTML = `
                    <div class="public-prompt-notice">
                        <span class="notice-icon">🔒</span>
                        <p>这是公共语气模板，你可以在创作时使用它，但无法查看详细的 Prompt 内容。</p>
                        ${prompt.role ? `<p class="notice-role"><strong>角色：</strong>${prompt.role}</p>` : ''}
                    </div>
                `;
                footer.innerHTML = '';
            } else {
                promptContent.textContent = prompt.prompt_content || '';
                footer.innerHTML = `
                    <button class="btn btn-ghost" id="copy-prompt-btn">📋 复制 Prompt</button>
                    <button class="btn btn-danger" id="delete-prompt-btn">🗑️ 删除</button>
                `;

                footer.querySelector('#copy-prompt-btn').addEventListener('click', () => {
                    this.copyPrompt();
                });
                footer.querySelector('#delete-prompt-btn').addEventListener('click', () => {
                    this.deletePromptFromModal();
                });
            }

            // 显示弹窗
            document.getElementById('prompt-modal').classList.remove('hidden');
        } catch (error) {
            this.generator.showToast('加载详情失败', 'error');
        }
    }

    closeModal() {
        document.getElementById('prompt-modal').classList.add('hidden');
    }

    async copyPrompt() {
        const content = document.getElementById('modal-prompt-content').textContent;
        try {
            await navigator.clipboard.writeText(content);
            this.generator.showToast('已复制到剪贴板', 'success');
        } catch (error) {
            this.generator.showToast('复制失败', 'error');
        }
    }

    async deletePromptFromModal() {
        if (!this.currentPromptId) return;
        await this.deletePrompt(this.currentPromptId);
        this.closeModal();
    }

    async deletePrompt(id) {
        const confirmed = await this.generator.showConfirm('确定要删除这个语气生成器吗？');
        if (!confirmed) return;

        try {
            await this.generator.api(`/api/tools/voice-prompts/${id}`, {
                method: 'DELETE'
            });
            this.generator.showToast('删除成功', 'success');
            this.loadMyPrompts();
        } catch (error) {
            this.generator.showToast('删除失败', 'error');
        }
    }

    destroy() {
        // 清理
    }
}

// 导出
window.VoiceMimickerPage = VoiceMimickerPage;

/**
 * 语气模仿器页面
 */
class VoiceMimickerPage {
    constructor(generator, params) {
        this.generator = generator;
        this.state = window.generatorState;
        this.prompts = [];
        this.isAnalyzing = false;
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

                <p class="page-desc">
                    分析特定推主的写作风格，生成模仿其语气的 Prompt
                </p>

                <!-- 输入区域 -->
                <div class="analyze-section">
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
                        将抓取该用户最近的推文（>150字），分析其写作风格
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

                <!-- 已保存的 Prompts -->
                <div class="saved-prompts-section">
                    <div class="section-header">
                        <span class="section-icon">📚</span>
                        <span class="section-title">已保存的语气</span>
                    </div>
                    <div class="prompts-grid" id="prompts-grid">
                        <div class="loading-state">
                            <div class="loading-spinner"></div>
                            <span>加载中...</span>
                        </div>
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
                    <div class="modal-footer">
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
        this.loadSavedPrompts();
    }

    bindEvents(container) {
        // 返回按钮
        container.querySelector('#back-to-home').addEventListener('click', () => {
            this.generator.navigate('home');
        });

        // 分析按钮
        container.querySelector('#analyze-btn').addEventListener('click', () => {
            this.startAnalysis();
        });

        // 回车触发分析
        container.querySelector('#twitter-username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.startAnalysis();
            }
        });

        // 弹窗关闭
        container.querySelector('#modal-close').addEventListener('click', () => {
            this.closeModal();
        });
        container.querySelector('.modal-overlay').addEventListener('click', () => {
            this.closeModal();
        });

        // 复制按钮
        container.querySelector('#copy-prompt-btn').addEventListener('click', () => {
            this.copyPrompt();
        });

        // 删除按钮
        container.querySelector('#delete-prompt-btn').addEventListener('click', () => {
            this.deletePrompt();
        });
    }

    async loadSavedPrompts() {
        try {
            const data = await this.generator.api('/api/tools/voice-prompts');
            this.prompts = data.prompts || [];
            this.renderPrompts();
        } catch (error) {
            console.error('加载保存的 Prompts 失败:', error);
            this.renderPrompts();
        }
    }

    renderPrompts() {
        const grid = document.getElementById('prompts-grid');

        if (this.prompts.length === 0) {
            grid.innerHTML = `
                <div class="empty-prompts">
                    <span class="empty-icon">📝</span>
                    <p>还没有保存的语气 Prompt</p>
                    <p class="empty-hint">输入推主用户名开始分析</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.prompts.map(prompt => `
            <div class="prompt-card" data-id="${prompt.id}">
                <img class="prompt-avatar"
                     src="${prompt.avatar_url || `https://unavatar.io/twitter/${prompt.username}`}"
                     alt="@${prompt.username}"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23667%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22>${prompt.username[0].toUpperCase()}</text></svg>'">
                <div class="prompt-info">
                    <span class="prompt-username">@${prompt.username}</span>
                    <span class="prompt-stats">${prompt.tweet_count} 条推文</span>
                </div>
            </div>
        `).join('');

        // 绑定点击事件
        grid.querySelectorAll('.prompt-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                this.showPromptDetail(id);
            });
        });
    }

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

                // 刷新列表
                this.loadSavedPrompts();

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

    async showPromptDetail(id) {
        try {
            const data = await this.generator.api(`/api/tools/voice-prompts/${id}`);
            const prompt = data.prompt;

            this.currentPromptId = id;

            // 填充弹窗内容
            document.getElementById('modal-avatar').src =
                prompt.avatar_url || `https://unavatar.io/twitter/${prompt.username}`;
            document.getElementById('modal-username').textContent = `@${prompt.username}`;
            document.getElementById('modal-meta').textContent =
                `${prompt.tweet_count} 条推文 · ${prompt.total_chars} 字`;
            document.getElementById('modal-prompt-content').textContent = prompt.prompt_content;

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

    async deletePrompt() {
        if (!this.currentPromptId) return;

        const confirmed = await this.generator.showConfirm('确定要删除这个语气 Prompt 吗？');
        if (!confirmed) return;

        try {
            await this.generator.api(`/api/tools/voice-prompts/${this.currentPromptId}`, {
                method: 'DELETE'
            });
            this.generator.showToast('删除成功', 'success');
            this.closeModal();
            this.loadSavedPrompts();
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

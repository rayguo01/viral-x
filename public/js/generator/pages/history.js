/**
 * 历史记录页面 - 查看已完成的帖子
 */
class HistoryPage {
    constructor(generator, params) {
        this.generator = generator;
        this.state = window.generatorState;
        this.historyId = params[0] || null;
        this.historyList = [];
        this.historyDetail = null;
        this.isLoading = false;
    }

    render(container) {
        if (this.historyId) {
            this.renderDetail(container);
        } else {
            this.renderList(container);
        }
    }

    renderList(container) {
        container.innerHTML = `
            <div class="history-page">
                <div class="page-title">
                    <span>📋</span> 历史记录
                </div>

                <div class="history-content" id="history-content">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">加载中...</div>
                    </div>
                </div>

                <div class="page-actions">
                    <div class="action-left">
                        <button class="btn btn-secondary" id="back-btn">
                            ← 返回首页
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.bindListEvents(container);
        this.loadHistory();
    }

    renderDetail(container) {
        container.innerHTML = `
            <div class="history-page">
                <div class="page-title">
                    <span>📋</span> 历史详情
                </div>

                <div class="history-content" id="history-content">
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">加载中...</div>
                    </div>
                </div>

                <div class="page-actions">
                    <div class="action-left">
                        <button class="btn btn-secondary" id="back-btn">
                            ← 返回列表
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.bindDetailEvents(container);
        this.loadHistoryDetail();
    }

    bindListEvents(container) {
        container.querySelector('#back-btn').addEventListener('click', () => {
            this.generator.navigate('home');
        });
    }

    bindDetailEvents(container) {
        container.querySelector('#back-btn').addEventListener('click', () => {
            this.generator.navigate('history');
        });
    }

    async loadHistory() {
        this.isLoading = true;

        try {
            this.historyList = await this.generator.api('/api/tasks/history');
        } catch (error) {
            this.generator.showToast(`加载失败: ${error.message}`, 'error');
            this.historyList = [];
        } finally {
            this.isLoading = false;
            this.updateListContent();
        }
    }

    async loadHistoryDetail() {
        this.isLoading = true;

        try {
            this.historyDetail = await this.generator.api(`/api/tasks/history/${this.historyId}`);
        } catch (error) {
            this.generator.showToast(`加载失败: ${error.message}`, 'error');
            this.historyDetail = null;
        } finally {
            this.isLoading = false;
            this.updateDetailContent();
        }
    }

    updateListContent() {
        const content = document.getElementById('history-content');
        if (!content) return;

        if (this.isLoading) {
            content.innerHTML = `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">加载中...</div>
                </div>
            `;
            return;
        }

        if (this.historyList.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <div class="empty-state-text">暂无历史记录</div>
                    <button class="btn btn-primary" style="margin-top: 20px;" onclick="window.postGenerator.navigate('home')">
                        开始创作
                    </button>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="history-list">
                ${this.historyList.map(item => `
                    <div class="history-item" data-id="${item.id}">
                        <div class="history-item-header">
                            <span class="history-item-topic">${item.trend_topic || '未知话题'}</span>
                            <span class="history-item-date">${this.formatDate(item.created_at)}</span>
                        </div>
                        <div class="history-item-preview">${item.content_preview || ''}</div>
                        ${item.viral_score ? `
                            <div class="history-item-score">🔥 爆款评分: ${item.viral_score}/100</div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;

        // 绑定点击事件
        content.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                this.generator.navigate('history', id);
            });
        });
    }

    updateDetailContent() {
        const content = document.getElementById('history-content');
        if (!content) return;

        if (this.isLoading) {
            content.innerHTML = `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">加载中...</div>
                </div>
            `;
            return;
        }

        if (!this.historyDetail) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <div class="empty-state-text">记录不存在</div>
                </div>
            `;
            return;
        }

        const item = this.historyDetail;

        content.innerHTML = `
            <div class="history-detail">
                <div class="detail-meta">
                    <div class="detail-meta-item">
                        <strong>来源：</strong>
                        ${item.trend_source === 'x-trends' ? 'X(Twitter) 趋势' : 'TopHub 热榜'}
                    </div>
                    <div class="detail-meta-item">
                        <strong>话题：</strong>
                        ${item.trend_topic || '未知'}
                    </div>
                    <div class="detail-meta-item">
                        <strong>创建时间：</strong>
                        ${this.formatDate(item.created_at)}
                    </div>
                    ${item.viral_score ? `
                        <div class="detail-meta-item">
                            <strong>爆款评分：</strong>
                            <span style="color: #10b981; font-weight: bold;">${item.viral_score}/100</span>
                        </div>
                    ` : ''}
                </div>

                <div class="final-preview" style="margin-top: 24px;">
                    <div class="final-content">${this.escapeHtml(item.final_content)}</div>
                    <div class="char-count">${item.final_content.length} 字符</div>

                    ${item.final_image_path ? `
                        <div class="final-image">
                            <img src="${item.final_image_path}" alt="配图" />
                        </div>
                    ` : ''}
                </div>

                <div style="margin-top: 24px; text-align: center;">
                    <button class="btn btn-secondary" id="copy-content-btn">
                        📋 复制内容
                    </button>
                    ${item.final_image_path ? `
                        <button class="btn btn-secondary" id="download-image-btn" style="margin-left: 12px;">
                            ⬇️ 下载图片
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        // 绑定按钮事件
        const copyBtn = content.querySelector('#copy-content-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(item.final_content).then(() => {
                    this.generator.showToast('内容已复制', 'success');
                });
            });
        }

        const downloadBtn = content.querySelector('#download-image-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                const link = document.createElement('a');
                link.href = item.final_image_path;
                link.download = `x-post-${item.id}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        // 清理
    }
}

// 导出
window.HistoryPage = HistoryPage;

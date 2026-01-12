/**
 * 热帖抓取页 - Tab 切换显示 X 趋势和 TopHub 热榜
 */
class TrendsPage {
    constructor(generator, params) {
        this.generator = generator;
        this.state = window.generatorState;
        this.activeTab = this.state.task?.trends_data?.source || 'x-trends';
        this.reports = {
            'x-trends': null,
            'tophub-trends': null
        };
        this.selectedTopic = null;
        this.isLoading = false;
    }

    render(container) {
        container.innerHTML = `
            <div class="trends-page">
                <div class="page-title">
                    <span>🔥</span> 热帖抓取
                </div>

                <div class="tabs">
                    <button class="tab ${this.activeTab === 'x-trends' ? 'active' : ''}" data-tab="x-trends">
                        𝕏 X 趋势
                    </button>
                    <button class="tab ${this.activeTab === 'tophub-trends' ? 'active' : ''}" data-tab="tophub-trends">
                        🔥 TopHub 热榜
                    </button>
                </div>

                <div class="trends-content" id="trends-content">
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
                    <div class="action-right">
                        <button class="btn btn-primary" id="next-btn" disabled>
                            下一步: 生成内容 →
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents(container);
        this.loadTrends();
    }

    bindEvents(container) {
        // Tab 切换
        container.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.activeTab = tab.dataset.tab;
                container.querySelectorAll('.tab').forEach(t => {
                    t.classList.toggle('active', t.dataset.tab === this.activeTab);
                });
                this.renderContent();
            });
        });

        // 返回按钮
        container.querySelector('#back-btn').addEventListener('click', () => {
            this.generator.navigate('home');
        });

        // 下一步按钮
        container.querySelector('#next-btn').addEventListener('click', async () => {
            if (!this.selectedTopic) return;

            try {
                // 保存选择的话题并进入下一步
                await this.generator.updateTask('selectTopic', this.selectedTopic);
                this.generator.navigate('content');
            } catch (error) {
                console.error('保存话题失败:', error);
            }
        });
    }

    async loadTrends() {
        const cached = this.reports[this.activeTab];
        if (cached) {
            this.renderContent();
            return;
        }

        this.isLoading = true;
        this.cacheInfo = null;
        this.renderContent();

        try {
            await this.generator.executeStep('trends', { source: this.activeTab }, {
                start: (data) => {
                    if (data.fromCache) {
                        this.cacheInfo = { message: data.message };
                    }
                    this.renderContent();
                },
                log: (data) => {
                    // 可以显示日志
                },
                report: (data) => {
                    this.reports[this.activeTab] = data.content;
                    if (data.fromCache) {
                        this.cacheInfo = {
                            fromCache: true,
                            cachedAt: data.cachedAt
                        };
                    }
                },
                done: (data) => {
                    this.isLoading = false;
                    this.renderContent();
                    if (data.fromCache) {
                        this.generator.showToast('使用缓存数据', 'info');
                    }
                },
                error: (data) => {
                    this.isLoading = false;
                    this.reports[this.activeTab] = `加载失败: ${data.message}`;
                    this.renderContent();
                }
            });
        } catch (error) {
            this.isLoading = false;
            this.reports[this.activeTab] = `加载失败: ${error.message}`;
            this.renderContent();
        }
    }

    renderContent() {
        const content = document.getElementById('trends-content');
        if (!content) return;

        if (this.isLoading) {
            content.innerHTML = `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">正在获取热门趋势...</div>
                </div>
            `;
            return;
        }

        const report = this.reports[this.activeTab];
        if (!report) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <div class="empty-state-text">点击上方标签加载趋势数据</div>
                </div>
            `;

            // 自动加载
            this.loadTrends();
            return;
        }

        // 根据 Tab 类型使用不同的渲染方式
        if (this.activeTab === 'x-trends') {
            this.renderXTrendsContent(content, report);
        } else {
            this.renderTophubContent(content, report);
        }
    }

    renderXTrendsContent(content, report) {
        // 尝试解析 JSON 格式
        const jsonData = this.tryParseJSON(report);
        let sections, topics;

        if (jsonData) {
            // 使用 JSON 数据
            sections = {
                overview: jsonData.overview,
                highPotential: jsonData.highPotentialTopics,
                categories: jsonData.categories
            };
            topics = this.parseTopicsFromJSON(jsonData);
        } else {
            // 回退到 Markdown 解析
            sections = this.parseXTrendsReport(report);
            topics = this.parseTopics(report);
        }

        // 缓存提示
        const cacheNotice = this.cacheInfo?.fromCache
            ? `<div class="cache-notice">📦 数据来自缓存（每小时更新一次）</div>`
            : '';

        content.innerHTML = `
            ${cacheNotice}

            <!-- 热点概览 -->
            ${sections.overview ? `
                <div class="trends-section">
                    <h3 class="section-title">🔥 热点概览</h3>
                    <div class="section-content overview-content">
                        ${jsonData ? this.escapeHtml(sections.overview) : this.generator.formatMarkdown(sections.overview)}
                    </div>
                </div>
            ` : ''}

            <!-- 高潜力话题分析 -->
            ${sections.highPotential && sections.highPotential.length > 0 ? `
                <div class="trends-section">
                    <h3 class="section-title">⭐ 高潜力话题分析</h3>
                    <div class="section-content">
                        ${jsonData ? this.renderHighPotentialFromJSON(sections.highPotential) : this.renderHighPotentialTable(sections.highPotential)}
                    </div>
                </div>
            ` : ''}

            <!-- 话题分类 -->
            ${sections.categories ? `
                <div class="trends-section">
                    <h3 class="section-title">📂 话题分类</h3>
                    <div class="section-content categories-content">
                        ${jsonData ? this.renderCategoriesFromJSON(sections.categories) : this.renderCategories(sections.categories)}
                    </div>
                </div>
            ` : ''}

            <!-- 选题建议 -->
            <div class="trends-section">
                <h3 class="section-title">💡 选题建议 <span class="section-hint">（点击选择一个话题）</span></h3>
                ${topics.length > 0 ? `
                    <div class="topic-list">
                        ${topics.map((topic, index) => `
                            <div class="topic-item ${this.selectedTopic?.index === index ? 'selected' : ''}"
                                 data-index="${index}">
                                <div class="topic-header">
                                    <span class="topic-number">${index + 1}</span>
                                    <span class="topic-title">${this.escapeHtml(topic.title)}</span>
                                </div>
                                ${topic.angle ? `
                                    <div class="topic-field">
                                        <span class="field-label">选题角度:</span>
                                        <span class="field-value">${this.escapeHtml(topic.angle)}</span>
                                    </div>
                                ` : ''}
                                ${topic.meta ? `
                                    <div class="topic-field">
                                        <span class="field-label">为什么有效:</span>
                                        <span class="field-value">${this.escapeHtml(topic.meta)}</span>
                                    </div>
                                ` : ''}
                                ${topic.direction ? `
                                    <div class="topic-field">
                                        <span class="field-label">创作方向:</span>
                                        <div class="field-value direction-list">${topic.direction}</div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="empty-state" style="margin-bottom: 20px;">
                        <div class="empty-state-text">未能解析话题建议</div>
                    </div>
                `}
            </div>

            <div class="report-toggle">
                <button class="btn btn-ghost" id="toggle-report-btn">
                    📄 查看原始报告
                </button>
            </div>
            <div class="report-content" style="display: none;">
                <pre style="white-space: pre-wrap; font-size: 12px;">${this.escapeHtml(typeof report === 'string' ? report : JSON.stringify(report, null, 2))}</pre>
            </div>
        `;

        this.bindContentEvents(content, topics);
    }

    renderTophubContent(content, report) {
        // 尝试解析 JSON 格式
        const jsonData = this.tryParseJSON(report);
        let sections, topics;

        if (jsonData) {
            // 使用 JSON 数据
            sections = {
                overview: jsonData.overview,
                highPotential: jsonData.highPotentialTopics,
                categories: jsonData.categories
            };
            topics = this.parseTopicsFromJSON(jsonData);
        } else {
            // 回退到 Markdown 解析
            topics = this.parseTopics(report);
            sections = null;
        }

        const cacheNotice = this.cacheInfo?.fromCache
            ? `<div class="cache-notice">📦 数据来自缓存（每小时更新一次）</div>`
            : '';

        content.innerHTML = `
            ${cacheNotice}

            <!-- 热点概览 (仅 JSON 模式) -->
            ${jsonData && sections.overview ? `
                <div class="trends-section">
                    <h3 class="section-title">🔥 热点概览</h3>
                    <div class="section-content overview-content">
                        ${this.escapeHtml(sections.overview)}
                    </div>
                </div>
            ` : ''}

            <!-- 高潜力话题分析 (仅 JSON 模式) -->
            ${jsonData && sections.highPotential && sections.highPotential.length > 0 ? `
                <div class="trends-section">
                    <h3 class="section-title">⭐ 高潜力话题分析</h3>
                    <div class="section-content">
                        ${this.renderHighPotentialFromJSON(sections.highPotential, true)}
                    </div>
                </div>
            ` : ''}

            <!-- 话题分类 (仅 JSON 模式) -->
            ${jsonData && sections.categories ? `
                <div class="trends-section">
                    <h3 class="section-title">📂 话题分类</h3>
                    <div class="section-content categories-content">
                        ${this.renderCategoriesFromJSON(sections.categories)}
                    </div>
                </div>
            ` : ''}

            <!-- 选题建议 -->
            <div class="trends-section">
                <h3 class="section-title">💡 选题建议 <span class="section-hint">（点击选择一个话题）</span></h3>
                ${topics.length > 0 ? `
                    <div class="topic-list">
                        ${topics.map((topic, index) => `
                            <div class="topic-item ${this.selectedTopic?.index === index ? 'selected' : ''}"
                                 data-index="${index}">
                                <div class="topic-header">
                                    <span class="topic-number">${index + 1}</span>
                                    <span class="topic-title">${this.escapeHtml(topic.title)}</span>
                                </div>
                                ${topic.angle ? `
                                    <div class="topic-field">
                                        <span class="field-label">选题角度:</span>
                                        <span class="field-value">${this.escapeHtml(topic.angle)}</span>
                                    </div>
                                ` : ''}
                                ${topic.meta ? `
                                    <div class="topic-field">
                                        <span class="field-label">为什么有效:</span>
                                        <span class="field-value">${this.escapeHtml(topic.meta)}</span>
                                    </div>
                                ` : ''}
                                ${topic.direction ? `
                                    <div class="topic-field">
                                        <span class="field-label">创作方向:</span>
                                        <div class="field-value direction-list">${topic.direction}</div>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="empty-state" style="margin-bottom: 20px;">
                        <div class="empty-state-text">未能解析话题建议，请查看原始报告选择话题</div>
                    </div>
                `}
            </div>

            <div class="report-toggle">
                <button class="btn btn-ghost" id="toggle-report-btn">
                    📄 ${topics.length > 0 ? '查看原始报告' : '展开原始报告'}
                </button>
            </div>
            <div class="report-content" style="display: ${topics.length > 0 ? 'none' : 'block'};">
                <pre style="white-space: pre-wrap; font-size: 12px;">${this.escapeHtml(typeof report === 'string' ? report : JSON.stringify(report, null, 2))}</pre>
            </div>
        `;

        this.bindContentEvents(content, topics);
    }

    bindContentEvents(content, topics) {
        // 绑定报告折叠事件
        const toggleBtn = content.querySelector('#toggle-report-btn');
        const reportContent = content.querySelector('.report-content');
        if (toggleBtn && reportContent) {
            toggleBtn.addEventListener('click', () => {
                const isVisible = reportContent.style.display !== 'none';
                reportContent.style.display = isVisible ? 'none' : 'block';
                toggleBtn.textContent = isVisible ? '📄 查看原始报告' : '📄 收起报告';
            });
        }

        // 绑定话题选择事件
        content.querySelectorAll('.topic-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                const topic = topics[index];

                // 切换选择状态
                if (this.selectedTopic?.index === index) {
                    this.selectedTopic = null;
                } else {
                    this.selectedTopic = { ...topic, index, source: this.activeTab };
                }

                // 更新 UI
                content.querySelectorAll('.topic-item').forEach(i => {
                    i.classList.toggle('selected', parseInt(i.dataset.index) === this.selectedTopic?.index);
                });

                // 更新下一步按钮状态
                const nextBtn = document.querySelector('#next-btn');
                if (nextBtn) {
                    nextBtn.disabled = !this.selectedTopic;
                }
            });
        });
    }

    parseXTrendsReport(report) {
        const sections = {
            overview: null,
            highPotential: null,
            categories: null
        };

        // 提取热点概览
        const overviewMatch = report.match(/##\s*热点概览\s*\n([\s\S]*?)(?=\n---|\n##)/);
        if (overviewMatch) {
            sections.overview = overviewMatch[1].trim();
        }

        // 提取高潜力话题分析表格
        const highPotentialMatch = report.match(/##\s*高潜力话题分析\s*\n([\s\S]*?)(?=\n---|\n##)/);
        if (highPotentialMatch) {
            sections.highPotential = this.parseTable(highPotentialMatch[1]);
        }

        // 提取话题分类
        const categoriesMatch = report.match(/##\s*话题分类\s*\n([\s\S]*?)(?=\n---|\n##)/);
        if (categoriesMatch) {
            sections.categories = this.parseCategories(categoriesMatch[1]);
        }

        return sections;
    }

    parseTable(tableText) {
        const lines = tableText.trim().split('\n').filter(line => line.includes('|'));
        if (lines.length < 3) return null;

        // 解析表头
        const headers = lines[0].split('|').map(h => h.trim()).filter(h => h);

        // 跳过分隔行，解析数据行
        const rows = [];
        for (let i = 2; i < lines.length; i++) {
            const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
            if (cells.length >= headers.length) {
                const row = {};
                headers.forEach((h, idx) => {
                    row[h] = cells[idx] || '';
                });
                rows.push(row);
            }
        }

        return { headers, rows };
    }

    renderHighPotentialTable(tableData) {
        if (!tableData || !tableData.rows.length) return '';

        return `
            <div class="potential-table">
                ${tableData.rows.map(row => `
                    <div class="potential-row">
                        <div class="potential-rank">${row['排名'] || ''}</div>
                        <div class="potential-main">
                            <div class="potential-topic">${row['话题'] || ''}</div>
                            <div class="potential-reason">${row['原因'] || ''}</div>
                        </div>
                        <div class="potential-score">${row['潜力评分'] || ''}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    parseCategories(categoriesText) {
        const categories = [];
        const categoryRegex = /###\s*([^\n]+)\n([\s\S]*?)(?=###|$)/g;
        let match;

        while ((match = categoryRegex.exec(categoriesText)) !== null) {
            const title = match[1].trim();
            const items = match[2].trim().split('\n')
                .filter(line => line.startsWith('-'))
                .map(line => line.replace(/^-\s*/, '').trim());

            if (items.length > 0) {
                categories.push({ title, items });
            }
        }

        return categories;
    }

    renderCategories(categories) {
        if (!categories || categories.length === 0) return '';

        return `
            <div class="categories-grid">
                ${categories.map(cat => `
                    <div class="category-card">
                        <div class="category-title">${cat.title}</div>
                        <div class="category-items">
                            ${cat.items.map(item => `<span class="category-tag">${item}</span>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    parseTopics(report) {
        const topics = [];

        // 尝试解析 "建议N" 格式
        const suggestionRegex = /###\s*建议\s*(\d+)[：:]*\s*(.*?)(?=###\s*建议|\n##|\n#|$)/gs;
        let match;

        while ((match = suggestionRegex.exec(report)) !== null) {
            const content = match[2].trim();

            // 提取话题名称
            const topicMatch = content.match(/\*\*话题\*\*[：:]\s*(.+)/);
            const angleMatch = content.match(/\*\*选题角度\*\*[：:]\s*(.+)/);
            const whyMatch = content.match(/\*\*为什么有效\*\*[：:]\s*(.+)/);

            // 提取创作方向（可能是多行列表）
            const directionMatch = content.match(/\*\*创作方向\*\*[：:]\s*([\s\S]*?)(?=\n\n|$)/);
            let direction = '';
            if (directionMatch) {
                // 解析列表项
                const directionLines = directionMatch[1].trim().split('\n')
                    .filter(line => line.trim().startsWith('-'))
                    .map(line => line.replace(/^\s*-\s*/, '').trim());
                if (directionLines.length > 0) {
                    direction = directionLines.map(d => `<div class="direction-item">• ${d}</div>`).join('');
                } else {
                    direction = directionMatch[1].trim();
                }
            }

            topics.push({
                title: topicMatch ? topicMatch[1] : `建议 ${match[1]}`,
                topic: topicMatch ? topicMatch[1] : '',
                angle: angleMatch ? angleMatch[1] : '',
                meta: whyMatch ? whyMatch[1] : '',
                direction: direction,
                suggestion: angleMatch ? angleMatch[1] : '',
                context: content
            });
        }

        // 如果没有解析到，尝试其他格式
        if (topics.length === 0) {
            const lines = report.split('\n');
            let currentTopic = null;

            for (const line of lines) {
                if (line.match(/^#+\s*\d+[.、]/)) {
                    if (currentTopic) topics.push(currentTopic);
                    currentTopic = { title: line.replace(/^#+\s*/, ''), context: '' };
                } else if (currentTopic) {
                    currentTopic.context += line + '\n';
                }
            }
            if (currentTopic) topics.push(currentTopic);
        }

        return topics.slice(0, 10); // 最多显示 10 个
    }

    // === JSON 解析辅助方法 ===

    tryParseJSON(report) {
        try {
            let data = report;
            if (typeof report === 'string') {
                let jsonStr = report.trim();
                // 移除可能的 markdown 代码块
                const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                    jsonStr = jsonMatch[1].trim();
                }
                // 找到 JSON 对象
                const startIndex = jsonStr.indexOf('{');
                const endIndex = jsonStr.lastIndexOf('}');
                if (startIndex !== -1 && endIndex !== -1) {
                    jsonStr = jsonStr.substring(startIndex, endIndex + 1);
                }
                data = JSON.parse(jsonStr);
            }
            // 验证是否有 suggestions 字段（标志性字段）
            if (data && data.suggestions && Array.isArray(data.suggestions)) {
                return data;
            }
            return null;
        } catch (e) {
            console.log('JSON 解析失败，将使用 Markdown 解析:', e.message);
            return null;
        }
    }

    parseTopicsFromJSON(jsonData) {
        if (!jsonData || !jsonData.suggestions) return [];

        return jsonData.suggestions.map((s, index) => {
            // 处理创作方向：优先使用 directions 数组，回退到 direction 字符串
            let direction = '';

            if (s.directions && Array.isArray(s.directions) && s.directions.length > 0) {
                // 新格式：directions 是数组
                direction = s.directions.map(d => `<div class="direction-item">• ${this.escapeHtml(d.trim())}</div>`).join('');
            } else if (s.direction) {
                // 旧格式：direction 是字符串
                const dirStr = s.direction;
                if (!dirStr.includes('<div')) {
                    // 如果方向包含换行或分号，拆分为列表项
                    const items = dirStr.split(/[;；\n]/).filter(i => i.trim());
                    if (items.length > 1) {
                        direction = items.map(d => `<div class="direction-item">• ${this.escapeHtml(d.trim())}</div>`).join('');
                    } else {
                        direction = `<div class="direction-item">• ${this.escapeHtml(dirStr)}</div>`;
                    }
                } else {
                    direction = dirStr;
                }
            }

            return {
                title: s.topic || `建议 ${index + 1}`,
                topic: s.topic || '',
                angle: s.angle || '',
                meta: s.whyEffective || '',
                direction: direction,
                directions: s.directions || [], // 保存原始数组供后续使用
                suggestion: s.angle || '',
                context: JSON.stringify(s)
            };
        });
    }

    renderHighPotentialFromJSON(topics, showSource = false) {
        if (!topics || !topics.length) return '';

        return `
            <div class="potential-table">
                ${topics.map(item => `
                    <div class="potential-row">
                        <div class="potential-rank">${item.rank || ''}</div>
                        <div class="potential-main">
                            <div class="potential-topic">${this.escapeHtml(item.topic || '')}</div>
                            ${showSource && item.source ? `<div class="potential-source">${this.escapeHtml(item.source)}</div>` : ''}
                            <div class="potential-reason">${this.escapeHtml(item.reason || '')}</div>
                        </div>
                        <div class="potential-score">${this.escapeHtml(item.score || '')}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderCategoriesFromJSON(categories) {
        if (!categories || typeof categories !== 'object') return '';

        const categoryList = Object.entries(categories).map(([title, items]) => ({
            title,
            items: Array.isArray(items) ? items : [items]
        }));

        return `
            <div class="categories-grid">
                ${categoryList.map(cat => `
                    <div class="category-card">
                        <div class="category-title">${this.escapeHtml(cat.title)}</div>
                        <div class="category-items">
                            ${cat.items.map(item => `<span class="category-tag">${this.escapeHtml(item)}</span>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        // 清理
    }
}

// 导出
window.TrendsPage = TrendsPage;

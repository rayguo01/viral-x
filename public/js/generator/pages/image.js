/**
 * 生成图片页 - 使用 Prompt 生成图片
 */
class ImagePage {
    constructor(generator, params) {
        this.generator = generator;
        this.state = window.generatorState;
        this.isLoading = false;
        this.prompt = '';
        this.ratio = '16:9';  // Twitter/X 推荐比例
        this.imagePath = null;
    }

    render(container) {
        const task = this.state.task;

        // 恢复已有数据
        if (task?.image_data) {
            this.imagePath = task.image_data.imagePath || null;
            this.ratio = task.image_data.ratio || '16:9';
        }

        // 从 prompt_data 获取 prompt
        if (task?.prompt_data?.prompt) {
            this.prompt = task.prompt_data.prompt;
        } else if (task?.image_data?.prompt) {
            // 兼容旧数据
            this.prompt = task.image_data.prompt;
        }

        container.innerHTML = `
            <div class="image-page">
                <div class="page-title">
                    <span>🖼️</span> 生成图片
                </div>

                <div class="image-area" id="image-area">
                    ${this.renderImageArea()}
                </div>

                <div class="page-actions">
                    <div class="action-left">
                        <button class="btn btn-secondary" id="back-btn">
                            ← 返回描述
                        </button>
                        <button class="btn btn-danger" id="abandon-btn">
                            放弃任务
                        </button>
                    </div>
                    <div class="action-right">
                        <button class="btn btn-ghost" id="skip-btn">
                            跳过图片
                        </button>
                        <button class="btn btn-primary" id="next-btn">
                            下一步: 提交 →
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents(container);
    }

    renderImageArea() {
        if (this.isLoading) {
            return `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">正在生成图片，可能需要 30-60 秒...</div>
                </div>
                <div class="log-output" id="log-output"></div>
            `;
        }

        return `
            <!-- Prompt 预览 -->
            <div class="prompt-preview">
                <div class="editor-label">
                    <span>📝</span> 图片描述 Prompt
                </div>
                <div class="prompt-text">${this.escapeHtml(this.prompt) || '<span class="text-muted">未生成描述，请返回上一步</span>'}</div>
                <div class="prompt-meta">
                    <span class="ratio-badge">📐 比例: 16:9 (Twitter 推荐)</span>
                </div>
            </div>

            <!-- 生成按钮 -->
            <div class="generate-section">
                <button class="btn btn-primary btn-large" id="generate-image-btn" ${!this.prompt ? 'disabled' : ''}>
                    🎨 生成图片
                </button>
            </div>

            <!-- 图片预览 -->
            ${this.imagePath ? `
                <div class="image-preview">
                    <div class="editor-label">
                        <span>🖼️</span> 生成的图片
                    </div>
                    <img src="${this.imagePath}" alt="Generated Image" />
                    <div class="image-actions">
                        <button class="btn btn-secondary" id="regenerate-btn">
                            🔄 重新生成
                        </button>
                        <a class="btn btn-ghost" href="${this.imagePath}" download target="_blank">
                            💾 下载图片
                        </a>
                    </div>
                </div>
            ` : `
                <div class="image-placeholder">
                    <div class="placeholder-icon">🖼️</div>
                    <div class="placeholder-text">点击上方按钮生成图片</div>
                </div>
            `}
        `;
    }

    updateImageArea() {
        const area = document.getElementById('image-area');
        if (area) {
            area.innerHTML = this.renderImageArea();
            this.bindImageEvents();
        }
    }

    bindEvents(container) {
        // 返回按钮
        container.querySelector('#back-btn').addEventListener('click', async () => {
            try {
                await this.generator.updateTask('goBack', { toStep: 'prompt' });
                this.generator.navigate('prompt');
            } catch (error) {
                console.error('回退失败:', error);
            }
        });

        // 放弃任务
        container.querySelector('#abandon-btn').addEventListener('click', () => {
            this.generator.abandonTask();
        });

        // 跳过图片
        container.querySelector('#skip-btn').addEventListener('click', async () => {
            try {
                await this.generator.updateTask('saveImage', {
                    prompt: this.prompt,
                    ratio: this.ratio,
                    imagePath: null,
                    skipped: true
                });
                this.generator.navigate('submit');
            } catch (error) {
                console.error('跳过失败:', error);
            }
        });

        // 下一步
        container.querySelector('#next-btn').addEventListener('click', async () => {
            await this.saveImage();
            this.generator.navigate('submit');
        });

        this.bindImageEvents();
    }

    bindImageEvents() {
        const container = document.getElementById('image-area');
        if (!container) return;

        // 生成图片
        const generateBtn = container.querySelector('#generate-image-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateImage());
        }

        // 重新生成
        const regenerateBtn = container.querySelector('#regenerate-btn');
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', () => this.generateImage());
        }
    }

    async generateImage() {
        if (!this.prompt) {
            this.generator.showToast('请先生成图片描述', 'error');
            return;
        }

        this.isLoading = true;
        this.updateImageArea();

        try {
            await this.generator.executeStep('image', { prompt: this.prompt, ratio: this.ratio }, {
                start: (data) => {
                    console.log('[image] 开始执行:', data.message);
                },
                log: (data) => {
                    const logOutput = document.getElementById('log-output');
                    if (logOutput) {
                        this.appendLog(logOutput, data.message);
                    }
                },
                report: (data) => {
                    if (data.imagePath) {
                        this.imagePath = data.imagePath;
                    }
                },
                done: async () => {
                    this.isLoading = false;
                    this.updateImageArea();
                    if (this.imagePath) {
                        this.generator.showToast('图片生成成功', 'success');
                        await this.autoSaveImage();
                    }
                },
                error: (data) => {
                    this.isLoading = false;
                    this.generator.showToast(`图片生成失败: ${data.message}`, 'error');
                    this.updateImageArea();
                }
            });
        } catch (error) {
            this.isLoading = false;
            this.generator.showToast(`图片生成失败: ${error.message}`, 'error');
            this.updateImageArea();
        }
    }

    async saveImage() {
        try {
            await this.generator.updateTask('saveImage', {
                prompt: this.prompt,
                ratio: this.ratio,
                imagePath: this.imagePath,
                skipped: false
            });
        } catch (error) {
            console.error('保存图片数据失败:', error);
        }
    }

    async autoSaveImage() {
        if (!this.imagePath) return;

        try {
            await this.generator.updateTask('updateImageData', {
                prompt: this.prompt,
                ratio: this.ratio,
                imagePath: this.imagePath
            });
            console.log('图片数据已自动保存');
        } catch (error) {
            console.error('自动保存图片数据失败:', error);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    appendLog(logOutput, message) {
        if (!message) return;

        const lines = message.split('\n');

        lines.forEach(line => {
            if (!line.trim()) return;

            const span = document.createElement('span');
            span.className = 'log-line';

            if (line.includes('✅') || line.includes('成功') || line.includes('完成')) {
                span.classList.add('success');
            } else if (line.includes('❌') || line.includes('错误') || line.includes('失败') || line.includes('Error')) {
                span.classList.add('error');
            } else if (line.includes('⚠') || line.includes('警告') || line.includes('Warning')) {
                span.classList.add('warning');
            } else if (line.includes('🤖') || line.includes('📊') || line.includes('📋') || line.includes('🔥') || line.includes('✨')) {
                span.classList.add('emoji');
            } else if (line.includes('正在') || line.includes('开始') || line.includes('执行')) {
                span.classList.add('highlight');
            } else {
                span.classList.add('info');
            }

            span.textContent = line + '\n';
            logOutput.appendChild(span);
        });

        logOutput.scrollTop = logOutput.scrollHeight;
    }

    destroy() {
        // 清理
    }
}

// 导出
window.ImagePage = ImagePage;

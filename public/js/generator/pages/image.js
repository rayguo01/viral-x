/**
 * 生成图片页 - Prompt 编辑、比例选择和图片生成
 */
class ImagePage {
    constructor(generator, params) {
        this.generator = generator;
        this.state = window.generatorState;
        this.isLoading = false;
        this.isGeneratingPrompt = false;
        this.prompt = '';
        this.ratio = '16:9';  // Twitter/X 推荐比例，固定不可选
        this.imagePath = null;
    }

    render(container) {
        const task = this.state.task;

        // 恢复已有数据
        if (task?.image_data) {
            this.prompt = task.image_data.prompt || '';
            this.ratio = task.image_data.ratio || '16:9';
            this.imagePath = task.image_data.imagePath || null;
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
                            ← 返回优化
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

        // 如果没有 prompt，自动生成
        if (!this.prompt && !this.isGeneratingPrompt) {
            this.generatePrompt();
        }
    }

    renderImageArea() {
        if (this.isGeneratingPrompt) {
            return `
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-text" id="prompt-loading-text">正在生成图片描述...</div>
                </div>
                <div class="log-output" id="prompt-log-output" style="margin-top: 16px; max-height: 150px;"></div>
            `;
        }

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
            <div class="content-editor">
                <div class="editor-label">
                    <span>📝</span> 图片描述 Prompt (可编辑)
                </div>
                <textarea class="content-textarea" id="prompt-input" rows="4">${this.escapeHtml(this.prompt)}</textarea>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <button class="btn btn-secondary" id="regenerate-prompt-btn">
                        🔄 重新生成描述
                    </button>
                    <span class="ratio-badge">📐 比例: 16:9 (Twitter 推荐)</span>
                </div>
            </div>

            <div style="text-align: center; margin-top: 24px;">
                <button class="btn btn-primary" id="generate-image-btn" ${!this.prompt ? 'disabled' : ''}>
                    🎨 生成图片
                </button>
            </div>

            ${this.imagePath ? `
                <div class="image-preview">
                    <div class="editor-label" style="margin-top: 24px;">
                        <span>🖼️</span> 生成的图片
                    </div>
                    <img src="${this.imagePath}" alt="Generated Image" />
                    <div style="margin-top: 12px;">
                        <button class="btn btn-secondary" id="regenerate-image-btn">
                            🔄 重新生成图片
                        </button>
                    </div>
                </div>
            ` : `
                <div class="image-placeholder" style="margin-top: 24px;">
                    点击上方按钮生成图片
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
                await this.generator.updateTask('goBack', { toStep: 'optimize' });
                this.generator.navigate('optimize');
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

        // 重新生成描述
        const regeneratePromptBtn = container.querySelector('#regenerate-prompt-btn');
        if (regeneratePromptBtn) {
            regeneratePromptBtn.addEventListener('click', () => this.generatePrompt());
        }

        // 生成图片
        const generateImageBtn = container.querySelector('#generate-image-btn');
        if (generateImageBtn) {
            generateImageBtn.addEventListener('click', () => this.generateImage());
        }

        // 重新生成图片
        const regenerateImageBtn = container.querySelector('#regenerate-image-btn');
        if (regenerateImageBtn) {
            regenerateImageBtn.addEventListener('click', () => this.generateImage());
        }
    }

    async generatePrompt() {
        const task = this.state.task;
        const content = task?.optimize_data?.optimizedVersion || task?.content_data?.versionC;

        if (!content) {
            this.generator.showToast('没有找到内容来生成图片描述', 'error');
            return;
        }

        this.isGeneratingPrompt = true;
        this.updateImageArea();

        try {
            await this.generator.executeStep('prompt', { content }, {
                start: (data) => {
                    console.log('[prompt] 开始执行:', data.message);
                    const loadingText = document.getElementById('prompt-loading-text');
                    if (loadingText) {
                        loadingText.textContent = data.message || '正在连接...';
                    }
                },
                log: (data) => {
                    console.log('[prompt] 日志:', data.message);
                    const logOutput = document.getElementById('prompt-log-output');
                    if (logOutput) {
                        this.appendLog(logOutput, data.message);
                    }
                    // 更新加载文字
                    const loadingText = document.getElementById('prompt-loading-text');
                    if (loadingText && data.message.includes('正在')) {
                        loadingText.textContent = data.message.trim();
                    }
                },
                report: (data) => {
                    console.log('[prompt] 收到报告:', data.content?.substring(0, 100));
                    // 尝试解析 JSON 格式
                    try {
                        let jsonData = data.content;
                        if (typeof jsonData === 'string') {
                            let jsonStr = jsonData.trim();
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
                            jsonData = JSON.parse(jsonStr);
                        }
                        // 从 JSON 中提取 prompt
                        if (jsonData.prompt) {
                            this.prompt = jsonData.prompt;
                            this.promptData = jsonData; // 保存完整数据
                        } else {
                            this.prompt = data.content.trim();
                        }
                    } catch (e) {
                        console.warn('JSON 解析失败，使用原始文本:', e.message);
                        this.prompt = data.content.trim();
                    }
                },
                done: async () => {
                    console.log('[prompt] 完成');
                    this.isGeneratingPrompt = false;
                    this.updateImageArea();
                    // 自动保存 prompt
                    await this.autoSaveImageData();
                },
                error: (data) => {
                    console.error('[prompt] 错误:', data.message);
                    this.isGeneratingPrompt = false;
                    // 如果 prompt-generator 失败，使用默认提示
                    this.prompt = `社交媒体配图，现代简约风格，主题：${content.substring(0, 50)}`;
                    this.generator.showToast(`Prompt 生成失败: ${data.message}`, 'error');
                    this.updateImageArea();
                }
            });
        } catch (error) {
            console.error('[prompt] 异常:', error);
            this.isGeneratingPrompt = false;
            this.prompt = `社交媒体配图，现代简约风格`;
            this.updateImageArea();
        }
    }

    async generateImage() {
        const promptInput = document.getElementById('prompt-input');
        const prompt = promptInput ? promptInput.value.trim() : this.prompt;

        if (!prompt) {
            this.generator.showToast('请输入图片描述', 'error');
            return;
        }

        this.prompt = prompt;
        this.isLoading = true;
        this.updateImageArea();

        console.log('[image] 开始生成图片, prompt:', prompt.substring(0, 50) + '...');

        try {
            await this.generator.executeStep('image', { prompt, ratio: this.ratio }, {
                start: (data) => {
                    console.log('[image] 开始执行:', data.message);
                },
                log: (data) => {
                    console.log('[image] 日志:', data.message?.substring(0, 100));
                    const logOutput = document.getElementById('log-output');
                    if (logOutput) {
                        this.appendLog(logOutput, data.message);
                    }
                },
                report: (data) => {
                    console.log('[image] 收到报告:', data);
                    if (data.imagePath) {
                        this.imagePath = data.imagePath;
                    }
                },
                done: async () => {
                    console.log('[image] 完成');
                    this.isLoading = false;
                    this.updateImageArea();
                    if (this.imagePath) {
                        this.generator.showToast('图片生成成功', 'success');
                        // 自动保存图片数据
                        await this.autoSaveImageData();
                    }
                },
                error: (data) => {
                    console.error('[image] 错误:', data.message);
                    this.isLoading = false;
                    this.generator.showToast(`图片生成失败: ${data.message}`, 'error');
                    this.updateImageArea();
                }
            });
        } catch (error) {
            console.error('[image] 异常:', error);
            this.isLoading = false;
            this.generator.showToast(`图片生成失败: ${error.message}`, 'error');
            this.updateImageArea();
        }
    }

    async saveImage() {
        const promptInput = document.getElementById('prompt-input');
        const prompt = promptInput ? promptInput.value.trim() : this.prompt;

        try {
            await this.generator.updateTask('saveImage', {
                prompt: prompt,
                ratio: this.ratio,
                imagePath: this.imagePath,
                skipped: false
            });
        } catch (error) {
            console.error('保存图片数据失败:', error);
        }
    }

    async autoSaveImageData() {
        // 自动保存图片数据（不改变步骤），用于中间状态保存
        if (!this.prompt && !this.imagePath) return;

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
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 格式化追加日志到输出框
     */
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

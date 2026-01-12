/**
 * 提交页面 - 最终预览和完成任务
 */
class SubmitPage {
    constructor(generator, params) {
        this.generator = generator;
        this.state = window.generatorState;
    }

    render(container) {
        const task = this.state.task;
        const finalContent = task?.optimize_data?.optimizedVersion || task?.content_data?.versionC || '';
        const imagePath = task?.image_data?.imagePath;
        const topic = task?.trends_data?.selectedTopic;

        container.innerHTML = `
            <div class="submit-page">
                <div class="page-title">
                    <span>📤</span> 提交到 X
                </div>

                <div class="submit-info">
                    <div class="submit-info-item">
                        <strong>话题来源：</strong>
                        ${task?.trends_data?.source === 'x-trends' ? 'X(Twitter) 趋势' : 'TopHub 热榜'}
                    </div>
                    <div class="submit-info-item">
                        <strong>选题：</strong>
                        ${topic?.title || topic?.topic || '未知'}
                    </div>
                    ${task?.optimize_data?.viralScore ? `
                        <div class="submit-info-item">
                            <strong>爆款评分：</strong>
                            <span style="color: #10b981; font-weight: bold;">${task.optimize_data.viralScore}/100</span>
                        </div>
                    ` : ''}
                </div>

                <div class="final-preview">
                    <div class="final-content" id="final-content">${this.escapeHtml(finalContent)}</div>
                    <div class="char-count">${finalContent.length} 字符</div>

                    ${imagePath ? `
                        <div class="final-image">
                            <img src="${imagePath}" alt="配图" />
                        </div>
                    ` : ''}
                </div>

                <div class="submit-actions" style="margin-top: 24px; text-align: center;">
                    <button class="btn btn-secondary" id="copy-btn">
                        📋 复制内容
                    </button>
                    ${imagePath ? `
                        <button class="btn btn-secondary" id="download-btn" style="margin-left: 12px;">
                            ⬇️ 下载图片
                        </button>
                    ` : ''}
                </div>

                <div class="submit-notice" style="margin-top: 24px; padding: 16px; background: #fef3c7; border-radius: 12px; color: #92400e;">
                    <strong>💡 提示：</strong> X 平台自动发布功能即将上线，目前请手动复制内容到 X 发布。
                </div>

                <div class="page-actions">
                    <div class="action-left">
                        <button class="btn btn-secondary" id="back-btn">
                            ← 返回编辑
                        </button>
                        <button class="btn btn-danger" id="abandon-btn">
                            放弃任务
                        </button>
                    </div>
                    <div class="action-right">
                        <button class="btn btn-primary" id="complete-btn">
                            ✅ 完成并保存到历史
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents(container);
    }

    bindEvents(container) {
        // 返回按钮
        container.querySelector('#back-btn').addEventListener('click', async () => {
            const task = this.state.task;
            const prevStep = task?.image_data?.skipped ? 'optimize' : 'image';
            try {
                await this.generator.updateTask('goBack', { toStep: prevStep });
                this.generator.navigate(prevStep);
            } catch (error) {
                console.error('回退失败:', error);
            }
        });

        // 放弃任务
        container.querySelector('#abandon-btn').addEventListener('click', () => {
            this.generator.abandonTask();
        });

        // 复制内容
        container.querySelector('#copy-btn').addEventListener('click', () => {
            const content = document.getElementById('final-content').textContent;
            navigator.clipboard.writeText(content).then(() => {
                this.generator.showToast('内容已复制到剪贴板', 'success');
            }).catch(() => {
                this.generator.showToast('复制失败', 'error');
            });
        });

        // 下载图片
        const downloadBtn = container.querySelector('#download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                const task = this.state.task;
                const imagePath = task?.image_data?.imagePath;
                if (imagePath) {
                    const link = document.createElement('a');
                    link.href = imagePath;
                    link.download = `x-post-${Date.now()}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            });
        }

        // 完成任务
        container.querySelector('#complete-btn').addEventListener('click', async () => {
            try {
                await this.generator.updateTask('complete');
                this.generator.showToast('帖子已保存到历史记录', 'success');
                this.state.reset();
                this.generator.navigate('home');
            } catch (error) {
                this.generator.showToast(`保存失败: ${error.message}`, 'error');
            }
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
window.SubmitPage = SubmitPage;

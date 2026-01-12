/**
 * 帖子生成器 - 流程图组件
 */
class WorkflowComponent {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.state = window.generatorState;

        // 订阅状态变化
        this.state.subscribe(() => this.update());
    }

    // 渲染流程图
    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="workflow">
                <div class="workflow-steps">
                    ${this.state.workflowSteps.map((step, index) => this.renderStep(step, index)).join('')}
                </div>
            </div>
        `;

        // 绑定点击事件
        this.container.querySelectorAll('.workflow-step').forEach(el => {
            el.addEventListener('click', () => {
                const stepId = el.dataset.step;
                if (this.state.isStepAccessible(stepId)) {
                    window.postGenerator.navigate(stepId);
                }
            });
        });
    }

    // 渲染单个步骤
    renderStep(step, index) {
        const status = this.state.getStepStatus(step.id);
        const isAccessible = this.state.isStepAccessible(step.id);
        const isLast = index === this.state.workflowSteps.length - 1;

        return `
            <div class="workflow-step ${status} ${isAccessible ? 'accessible' : ''}" data-step="${step.id}">
                <div class="step-node">
                    <span class="step-icon">${this.getStepIcon(step, status)}</span>
                </div>
                <div class="step-label">${step.name}</div>
                ${step.skippable ? '<span class="step-skippable">可跳过</span>' : ''}
                ${!isLast ? '<div class="step-connector"></div>' : ''}
            </div>
        `;
    }

    // 获取步骤图标
    getStepIcon(step, status) {
        if (status === 'completed') return '✓';
        if (status === 'current') return step.icon;
        return step.icon;
    }

    // 更新流程图
    update() {
        this.render();
    }
}

// 导出
window.WorkflowComponent = WorkflowComponent;

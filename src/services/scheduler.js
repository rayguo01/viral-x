/**
 * 定时任务调度服务
 *
 * 功能：
 * 1. 每小时1分钟自动抓取 x-trends 和 tophub-trends
 * 2. 抓取结果保存到 skillCache
 * 3. 服务启动时立即执行一次抓取
 */

const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const skillCache = require('./skillCache');

class Scheduler {
    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
        this.maxRetries = 3;        // 最大重试次数
        this.retryDelay = 5000;     // 重试间隔（毫秒）
    }

    /**
     * 延迟函数
     * @param {number} ms - 毫秒
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 带重试的执行单个 skill 抓取
     * @param {string} skillId - x-trends 或 tophub-trends
     * @param {number} attempt - 当前尝试次数
     * @returns {Promise<string>} 抓取结果
     */
    async executeSkillWithRetry(skillId, attempt = 1) {
        try {
            return await this.executeSkill(skillId);
        } catch (err) {
            const isRetryable = err.message.includes('JSON 解析失败') ||
                               err.message.includes('执行失败') ||
                               err.message.includes('未找到报告文件');

            if (isRetryable && attempt < this.maxRetries) {
                console.log(`[调度器] ${skillId} 第 ${attempt} 次失败，${this.retryDelay / 1000}秒后重试...`);
                console.log(`[调度器] 失败原因: ${err.message.substring(0, 100)}...`);
                await this.sleep(this.retryDelay);
                return this.executeSkillWithRetry(skillId, attempt + 1);
            }
            throw err;
        }
    }

    /**
     * 执行单个 skill 抓取
     * @param {string} skillId - x-trends 或 tophub-trends
     * @returns {Promise<string>} 抓取结果
     */
    async executeSkill(skillId) {
        console.log(`[调度器] 开始抓取 ${skillId}...`);

        const scriptMap = {
            'x-trends': 'x-trends.ts',
            'tophub-trends': 'tophub.ts'
        };

        const scriptName = scriptMap[skillId];
        if (!scriptName) {
            throw new Error(`未知的 skill: ${skillId}`);
        }

        const skillDir = path.join(__dirname, '../../.claude', skillId);
        const scriptPath = path.join(skillDir, scriptName);

        if (!fs.existsSync(scriptPath)) {
            throw new Error(`脚本不存在: ${scriptPath}`);
        }

        return new Promise((resolve, reject) => {
            const child = spawn('npx', ['ts-node', scriptPath], {
                cwd: path.join(__dirname, '../..'),
                env: { ...process.env },
                shell: true
            });

            let output = '';
            let errorOutput = '';

            child.stdout.on('data', (data) => {
                output += data.toString();
                console.log(`[调度器][${skillId}] ${data.toString().trim()}`);
            });

            child.stderr.on('data', (data) => {
                const text = data.toString();
                if (!text.includes('Compiling') && !text.includes('Using TypeScript')) {
                    errorOutput += text;
                }
            });

            child.on('close', (code) => {
                if (code === 0) {
                    // 读取生成的报告
                    try {
                        const outputDir = path.join(__dirname, '../../outputs/trends');
                        const prefix = skillId === 'x-trends' ? 'x_trends_analysis' : 'tophub_analysis';

                        // 优先查找 JSON 文件
                        let files = fs.readdirSync(outputDir)
                            .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
                            .sort()
                            .reverse();

                        // 如果没有 JSON，查找 MD 文件
                        if (files.length === 0) {
                            files = fs.readdirSync(outputDir)
                                .filter(f => f.startsWith(prefix) && f.endsWith('.md'))
                                .sort()
                                .reverse();
                        }

                        if (files.length > 0) {
                            const reportPath = path.join(outputDir, files[0]);
                            const report = fs.readFileSync(reportPath, 'utf-8');
                            console.log(`[调度器][${skillId}] 抓取成功，报告长度: ${report.length}`);
                            resolve(report);
                        } else {
                            reject(new Error('未找到报告文件'));
                        }
                    } catch (err) {
                        reject(err);
                    }
                } else {
                    reject(new Error(`执行失败，退出码: ${code}, 错误: ${errorOutput}`));
                }
            });

            child.on('error', reject);
        });
    }

    /**
     * 执行所有趋势抓取任务
     */
    async fetchAllTrends() {
        if (this.isRunning) {
            console.log('[调度器] 上一次抓取仍在进行中，跳过本次');
            return;
        }

        this.isRunning = true;
        console.log(`[调度器] ========== 开始定时抓取 ${new Date().toLocaleString('zh-CN')} ==========`);

        const skills = ['x-trends', 'tophub-trends'];

        for (const skillId of skills) {
            try {
                const report = await this.executeSkillWithRetry(skillId);
                skillCache.set(skillId, report);
                console.log(`[调度器] ${skillId} 缓存已更新`);
            } catch (err) {
                console.error(`[调度器] ${skillId} 抓取失败（已重试 ${this.maxRetries} 次）:`, err.message);
                // 抓取失败不影响其他 skill
            }
        }

        this.isRunning = false;
        console.log(`[调度器] ========== 定时抓取完成 ==========\n`);
    }

    /**
     * 检查缓存是否在当前小时内生成
     * @param {string} skillId
     * @returns {boolean}
     */
    isCacheFromCurrentHour(skillId) {
        const cached = skillCache.get(skillId);
        if (!cached || !cached.generatedAt) {
            return false;
        }

        const now = new Date();
        const cacheTime = new Date(cached.generatedAt);

        // 检查是否同一小时
        return now.getFullYear() === cacheTime.getFullYear() &&
               now.getMonth() === cacheTime.getMonth() &&
               now.getDate() === cacheTime.getDate() &&
               now.getHours() === cacheTime.getHours();
    }

    /**
     * 启动定时任务
     * cron 格式: 分 时 日 月 星期
     * "1 * * * *" = 每小时的第1分钟
     */
    start() {
        // 每小时第1分钟执行
        const job = cron.schedule('1 * * * *', () => {
            this.fetchAllTrends();
        }, {
            scheduled: true,
            timezone: 'Asia/Shanghai'
        });

        this.jobs.set('trends', job);
        console.log('[调度器] 定时任务已启动：每小时1分钟抓取趋势数据');

        // 启动时检查是否需要抓取
        const xTrendsCached = this.isCacheFromCurrentHour('x-trends');
        const tophubCached = this.isCacheFromCurrentHour('tophub-trends');

        if (xTrendsCached && tophubCached) {
            console.log('[调度器] 当前小时已有缓存，跳过首次抓取');
        } else {
            const needFetch = [];
            if (!xTrendsCached) needFetch.push('x-trends');
            if (!tophubCached) needFetch.push('tophub-trends');
            console.log(`[调度器] 需要抓取: ${needFetch.join(', ')}`);
            this.fetchAllTrends();
        }
    }

    /**
     * 停止所有定时任务
     */
    stop() {
        for (const [name, job] of this.jobs) {
            job.stop();
            console.log(`[调度器] 定时任务 ${name} 已停止`);
        }
        this.jobs.clear();
    }
}

// 单例
const scheduler = new Scheduler();

module.exports = scheduler;

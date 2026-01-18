/**
 * 评论生成服务
 * 根据帖子内容和区域生成合适的评论
 * 使用 Claude CLI 调用
 */

const { spawn } = require('child_process');

// 评论风格模板
const STYLES = {
    ja: {
        agree: ['赞同型', '表示强烈认同'],
        question: ['提问型', '好奇地询问更多细节'],
        supplement: ['补充型', '分享自己相关的经验'],
        promotion: ['引流型', '提及自己也在做类似的事']
    },
    en: {
        agree: ['agree', 'express strong agreement'],
        question: ['question', 'curiously ask for more details'],
        supplement: ['supplement', 'share your related experience'],
        promotion: ['promotion', 'mention you work on something similar']
    }
};

const STYLE_KEYS = ['agree', 'question', 'supplement', 'promotion'];

class CommentGeneratorService {
    /**
     * 使用 Claude CLI 生成评论
     */
    async generate(tweet, region) {
        // 随机选择风格
        const styleKey = STYLE_KEYS[Math.floor(Math.random() * STYLE_KEYS.length)];
        const [styleName, styleDesc] = STYLES[region][styleKey];

        // 随机句子数（1-3）
        const sentenceCount = Math.floor(Math.random() * 3) + 1;

        const language = region === 'ja' ? '日语' : '英语';
        const langName = region === 'ja' ? 'Japanese' : 'English';

        const prompt = `你是一个社交媒体评论专家。根据以下推文生成一条${language}评论。

推文作者: @${tweet.author}
推文内容: ${tweet.content}

要求:
1. 语言: 纯${langName}，不要混用其他语言
2. 风格: ${styleName} - ${styleDesc}
3. 长度: ${sentenceCount}句话
4. 语气: 自然、真诚、像真人
5. 不要使用 hashtag
6. 不要 @作者
7. 不要太正式，用口语化表达

只输出评论内容，不要其他说明。`;

        const comment = await this.callClaudeCli(prompt);

        return {
            content: comment,
            style: styleKey,
            sentenceCount
        };
    }

    /**
     * 调用 Claude CLI（通过 stdin 传递 prompt，输出 JSON 格式）
     */
    callClaudeCli(prompt) {
        return new Promise((resolve, reject) => {
            let killed = false;
            const timeout = 60000; // 60秒超时

            // 使用 --output-format json 获取结构化响应
            const fullCommand = 'claude --output-format json';
            const child = spawn(fullCommand, [], {
                cwd: process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
                env: process.env
            });

            const timeoutId = setTimeout(() => {
                killed = true;
                console.error('[CommentGenerator] Claude CLI 超时，强制终止');
                child.kill('SIGTERM');
            }, timeout);

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                clearTimeout(timeoutId);

                if (killed) {
                    reject(new Error(`Claude CLI 超时（${timeout / 1000}秒）`));
                    return;
                }

                if (code === 0) {
                    try {
                        const response = JSON.parse(stdout.trim());
                        resolve(response.result || '');
                    } catch (parseError) {
                        console.error('[CommentGenerator] JSON 解析失败:', stdout.substring(0, 200));
                        reject(new Error(`Claude CLI 输出解析失败`));
                    }
                } else {
                    console.error(`[CommentGenerator] Claude CLI 错误: ${stderr.substring(0, 200)}`);
                    reject(new Error(`Claude CLI 退出码: ${code}`));
                }
            });

            child.on('error', (err) => {
                clearTimeout(timeoutId);
                reject(new Error(`Claude CLI 启动失败: ${err.message}`));
            });

            // 通过 stdin 传递 prompt
            child.stdin.write(prompt);
            child.stdin.end();
        });
    }
}

const commentGenerator = new CommentGeneratorService();
module.exports = commentGenerator;

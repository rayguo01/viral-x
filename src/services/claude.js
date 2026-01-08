const { spawn } = require('child_process');

/**
 * Claude CLI 服务
 * 每次请求启动新进程，通过 --resume 保持会话上下文
 */
class ClaudeService {
    /**
     * 发送消息到 Claude CLI
     * @param {string} prompt - 用户消息
     * @param {string|null} sessionId - Claude 会话ID（用于恢复上下文）
     * @param {function} onData - 流式数据回调
     * @param {function} onEnd - 完成回调
     * @param {function} onError - 错误回调
     */
    sendMessage(prompt, sessionId, onData, onEnd, onError) {
        const args = [
            '-p', prompt,
            '--output-format', 'stream-json'
        ];

        // 如果有会话ID，添加 --resume 参数以恢复上下文
        if (sessionId) {
            args.push('--resume', sessionId);
        }

        console.log(`[ClaudeService] 启动进程, sessionId: ${sessionId || 'new'}`);

        const proc = spawn('claude', args, {
            cwd: '/tmp',
            env: { ...process.env },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let buffer = '';
        let fullResponse = '';
        let newSessionId = sessionId;

        proc.stdout.on('data', (data) => {
            buffer += data.toString();

            // 按行解析 JSON
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 保留不完整的行

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const msg = JSON.parse(line);

                    // 提取 session_id
                    if (msg.session_id) {
                        newSessionId = msg.session_id;
                    }

                    // 处理不同类型的消息
                    if (msg.type === 'assistant' && msg.message && msg.message.content) {
                        for (const block of msg.message.content) {
                            if (block.type === 'text') {
                                fullResponse += block.text;
                                onData({
                                    type: 'text',
                                    content: block.text
                                });
                            }
                        }
                    } else if (msg.type === 'content_block_delta' && msg.delta && msg.delta.text) {
                        fullResponse += msg.delta.text;
                        onData({
                            type: 'text',
                            content: msg.delta.text
                        });
                    }
                } catch (e) {
                    console.error('[ClaudeService] JSON 解析错误:', e.message, 'Line:', line);
                }
            }
        });

        proc.stderr.on('data', (data) => {
            const errStr = data.toString();
            // 过滤掉一些非错误的 stderr 输出
            if (!errStr.includes('Resolving') && !errStr.includes('Fetching')) {
                console.error('[ClaudeService] stderr:', errStr);
            }
        });

        proc.on('close', (code) => {
            console.log(`[ClaudeService] 进程退出, code: ${code}, sessionId: ${newSessionId}`);

            if (code === 0) {
                onEnd({
                    sessionId: newSessionId,
                    fullResponse: fullResponse
                });
            } else {
                onError(new Error(`Claude CLI 退出码: ${code}`));
            }
        });

        proc.on('error', (err) => {
            console.error('[ClaudeService] 进程错误:', err);
            onError(err);
        });

        // 超时处理（2分钟）
        const timeout = setTimeout(() => {
            console.error('[ClaudeService] 处理超时，终止进程');
            proc.kill();
            onError(new Error('Claude CLI 处理超时'));
        }, 120000);

        proc.on('close', () => {
            clearTimeout(timeout);
        });
    }
}

// 单例
const claudeService = new ClaudeService();

module.exports = {
    ClaudeService,
    claudeService
};

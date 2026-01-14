/**
 * 语气模仿 Prompt 数据库服务
 */

const { pool } = require('../config/database');

class VoicePromptDbService {
    /**
     * 保存生成的 Prompt
     */
    async save(userId, data) {
        const result = await pool.query(
            `INSERT INTO voice_prompts
             (user_id, username, display_name, avatar_url, tweet_count, total_chars, prompt_content, sample_tweets)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                userId,
                data.username,
                data.displayName || data.username,
                data.avatarUrl,
                data.tweetCount,
                data.totalChars,
                data.promptContent,
                JSON.stringify(data.sampleTweets || [])
            ]
        );
        console.log(`[VoicePromptDb] 已保存 @${data.username} 的语气 Prompt`);
        return result.rows[0];
    }

    /**
     * 获取用户的所有语气 Prompt
     */
    async getByUserId(userId) {
        const result = await pool.query(
            `SELECT id, username, display_name, avatar_url, tweet_count, total_chars, created_at
             FROM voice_prompts
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows;
    }

    /**
     * 获取单个 Prompt 详情
     */
    async getById(id, userId) {
        const result = await pool.query(
            `SELECT * FROM voice_prompts
             WHERE id = $1 AND user_id = $2`,
            [id, userId]
        );
        return result.rows[0] || null;
    }

    /**
     * 检查是否已存在该用户的 Prompt
     */
    async existsByUsername(userId, username) {
        const result = await pool.query(
            `SELECT id FROM voice_prompts
             WHERE user_id = $1 AND username = $2`,
            [userId, username.toLowerCase()]
        );
        return result.rows.length > 0;
    }

    /**
     * 删除 Prompt
     */
    async delete(id, userId) {
        const result = await pool.query(
            `DELETE FROM voice_prompts
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [id, userId]
        );
        return result.rows.length > 0;
    }

    /**
     * 更新 Prompt（重新分析）
     */
    async update(id, userId, data) {
        const result = await pool.query(
            `UPDATE voice_prompts
             SET tweet_count = $3, total_chars = $4, prompt_content = $5, sample_tweets = $6
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [
                id,
                userId,
                data.tweetCount,
                data.totalChars,
                data.promptContent,
                JSON.stringify(data.sampleTweets || [])
            ]
        );
        return result.rows[0];
    }
}

// 单例
const voicePromptDb = new VoicePromptDbService();

module.exports = voicePromptDb;

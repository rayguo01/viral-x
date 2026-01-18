/**
 * 评论涨粉助手数据库服务
 */

const { pool } = require('../config/database');

class CommentAssistantDbService {
    // ============ 设置 ============

    /**
     * 获取系统设置
     */
    async getSettings() {
        const result = await pool.query(
            `SELECT * FROM comment_settings WHERE id = 1`
        );
        return result.rows[0] || null;
    }

    /**
     * 更新系统设置
     */
    async updateSettings(data) {
        const result = await pool.query(
            `UPDATE comment_settings
             SET daily_limit = COALESCE($1, daily_limit),
                 auto_enabled = COALESCE($2, auto_enabled),
                 notify_frequency = COALESCE($3, notify_frequency),
                 monthly_budget = COALESCE($4, monthly_budget),
                 comment_user_id = COALESCE($5, comment_user_id),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = 1
             RETURNING *`,
            [data.dailyLimit, data.autoEnabled, data.notifyFrequency, data.monthlyBudget, data.commentUserId]
        );
        return result.rows[0];
    }

    /**
     * 获取用户的 Twitter 凭证
     */
    async getUserTwitterCredentials(userId) {
        const result = await pool.query(
            `SELECT tc.*, u.username
             FROM twitter_credentials tc
             JOIN users u ON u.id = tc.user_id
             WHERE tc.user_id = $1`,
            [userId]
        );
        return result.rows[0] || null;
    }

    /**
     * 更新用户的 Twitter Token
     */
    async updateUserTwitterToken(userId, accessToken, refreshToken, expiresAt) {
        const result = await pool.query(
            `UPDATE twitter_credentials
             SET access_token = $2, refresh_token = COALESCE($3, refresh_token),
                 token_expires_at = $4, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1
             RETURNING *`,
            [userId, accessToken, refreshToken, expiresAt]
        );
        return result.rows[0];
    }

    /**
     * 获取所有已绑定 Twitter 的用户（用于选择评论账号）
     */
    async getTwitterConnectedUsers() {
        const result = await pool.query(
            `SELECT u.id, u.username, tc.twitter_username, tc.token_expires_at
             FROM users u
             JOIN twitter_credentials tc ON tc.user_id = u.id
             ORDER BY u.username`
        );
        return result.rows;
    }

    /**
     * 更新组索引（定时任务调用）
     */
    async updateGroupIndex(region, newIndex) {
        const column = region === 'ja' ? 'ja_group_index' : 'en_group_index';
        await pool.query(
            `UPDATE comment_settings
             SET ${column} = $1, last_run_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = 1`,
            [newIndex]
        );
    }

    // ============ 大V列表 ============

    /**
     * 获取大V列表
     */
    async getKolList(region = null) {
        let query = `SELECT * FROM comment_kol_list`;
        const params = [];
        if (region) {
            query += ` WHERE region = $1`;
            params.push(region);
        }
        query += ` ORDER BY region, group_index, kol_username`;
        const result = await pool.query(query, params);
        return result.rows;
    }

    /**
     * 更新大V权重
     * @param {number} kolId 大V ID
     * @param {number} delta 权重变化值（正数增加，负数减少）
     */
    async updateKolWeight(kolId, delta) {
        const result = await pool.query(
            `UPDATE comment_kol_list
             SET weight = GREATEST(0, COALESCE(weight, 100) + $2)
             WHERE id = $1
             RETURNING *`,
            [kolId, delta]
        );
        return result.rows[0];
    }

    /**
     * 根据用户名更新大V权重
     * @param {string} kolUsername 大V用户名
     * @param {string} region 区域
     * @param {number} delta 权重变化值
     */
    async updateKolWeightByUsername(kolUsername, region, delta) {
        const result = await pool.query(
            `UPDATE comment_kol_list
             SET weight = GREATEST(0, COALESCE(weight, 100) + $3)
             WHERE kol_username = $1 AND region = $2
             RETURNING *`,
            [kolUsername.toLowerCase(), region, delta]
        );
        return result.rows[0];
    }

    /**
     * 获取大V权重
     */
    async getKolWeight(kolUsername, region) {
        const result = await pool.query(
            `SELECT weight FROM comment_kol_list
             WHERE kol_username = $1 AND region = $2`,
            [kolUsername.toLowerCase(), region]
        );
        return result.rows[0]?.weight ?? 100;
    }

    /**
     * 重置大V权重
     */
    async resetKolWeight(kolId) {
        const result = await pool.query(
            `UPDATE comment_kol_list
             SET weight = 100
             WHERE id = $1
             RETURNING *`,
            [kolId]
        );
        return result.rows[0];
    }

    /**
     * 获取指定组的大V
     */
    async getKolsByGroup(region, groupIndex) {
        const result = await pool.query(
            `SELECT * FROM comment_kol_list
             WHERE region = $1 AND group_index = $2
             ORDER BY kol_username`,
            [region, groupIndex]
        );
        return result.rows;
    }

    /**
     * 添加大V
     */
    async addKol(data) {
        const result = await pool.query(
            `INSERT INTO comment_kol_list (region, kol_username, kol_display_name, group_index)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (region, kol_username) DO UPDATE SET
                 kol_display_name = EXCLUDED.kol_display_name,
                 group_index = EXCLUDED.group_index
             RETURNING *`,
            [data.region, data.kolUsername.toLowerCase(), data.kolDisplayName, data.groupIndex]
        );
        return result.rows[0];
    }

    /**
     * 批量导入大V
     */
    async importKols(kols) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const results = [];
            for (const kol of kols) {
                const result = await client.query(
                    `INSERT INTO comment_kol_list (region, kol_username, kol_display_name, group_index)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (region, kol_username) DO UPDATE SET
                         kol_display_name = EXCLUDED.kol_display_name,
                         group_index = EXCLUDED.group_index
                     RETURNING *`,
                    [kol.region, kol.kolUsername.toLowerCase(), kol.kolDisplayName, kol.groupIndex]
                );
                results.push(result.rows[0]);
            }
            await client.query('COMMIT');
            return results;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * 删除大V
     */
    async deleteKol(id) {
        const result = await pool.query(
            `DELETE FROM comment_kol_list WHERE id = $1 RETURNING id`,
            [id]
        );
        return result.rows.length > 0;
    }

    /**
     * 获取各区域大V统计
     */
    async getKolStats() {
        const result = await pool.query(
            `SELECT region, COUNT(*) as count,
                    COUNT(DISTINCT group_index) as groups
             FROM comment_kol_list
             GROUP BY region`
        );
        return result.rows;
    }

    // ============ 评论历史 ============

    /**
     * 保存评论记录
     */
    async saveComment(data) {
        const result = await pool.query(
            `INSERT INTO comment_history
             (user_id, region, tweet_id, tweet_url, tweet_author, tweet_content, comment_content, comment_style, comment_tweet_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                data.userId,
                data.region,
                data.tweetId,
                data.tweetUrl,
                data.tweetAuthor,
                data.tweetContent,
                data.commentContent,
                data.commentStyle,
                data.commentTweetId
            ]
        );
        return result.rows[0];
    }

    /**
     * 检查是否已评论过该帖子
     */
    async hasCommented(tweetId) {
        const result = await pool.query(
            `SELECT id FROM comment_history WHERE tweet_id = $1 LIMIT 1`,
            [tweetId]
        );
        return result.rows.length > 0;
    }

    /**
     * 获取今日评论数
     */
    async getTodayCommentCount() {
        const result = await pool.query(
            `SELECT COUNT(*) as count FROM comment_history
             WHERE DATE(published_at) = CURRENT_DATE`
        );
        return parseInt(result.rows[0].count);
    }

    /**
     * 获取评论历史列表
     */
    async getHistory(options = {}) {
        const { page = 1, limit = 20, region = null, startDate = null, endDate = null } = options;
        const offset = (page - 1) * limit;

        let whereClause = '1=1';
        const params = [];
        let paramIndex = 1;

        if (region) {
            whereClause += ` AND region = $${paramIndex++}`;
            params.push(region);
        }
        if (startDate) {
            whereClause += ` AND published_at >= $${paramIndex++}`;
            params.push(startDate);
        }
        if (endDate) {
            whereClause += ` AND published_at <= $${paramIndex++}`;
            params.push(endDate);
        }

        const countParams = [...params];
        params.push(limit, offset);

        const result = await pool.query(
            `SELECT * FROM comment_history
             WHERE ${whereClause}
             ORDER BY published_at DESC
             LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            params
        );

        const countResult = await pool.query(
            `SELECT COUNT(*) as count FROM comment_history WHERE ${whereClause}`,
            countParams
        );

        return {
            items: result.rows,
            total: parseInt(countResult.rows[0].count),
            page,
            limit
        };
    }

    // ============ 收件箱 ============

    /**
     * 创建收件箱通知
     */
    async createInboxNotification(userId, commentHistoryId) {
        const result = await pool.query(
            `INSERT INTO comment_inbox (user_id, comment_history_id)
             VALUES ($1, $2)
             RETURNING *`,
            [userId, commentHistoryId]
        );
        return result.rows[0];
    }

    /**
     * 获取收件箱
     */
    async getInbox(userId, options = {}) {
        const { page = 1, limit = 20, unreadOnly = false } = options;
        const offset = (page - 1) * limit;

        let whereClause = 'ci.user_id = $1';
        if (unreadOnly) {
            whereClause += ' AND ci.is_read = false';
        }

        const result = await pool.query(
            `SELECT ci.*, ch.region, ch.tweet_url, ch.tweet_author, ch.tweet_content,
                    ch.comment_content, ch.comment_style, ch.published_at
             FROM comment_inbox ci
             JOIN comment_history ch ON ch.id = ci.comment_history_id
             WHERE ${whereClause}
             ORDER BY ci.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        const countResult = await pool.query(
            `SELECT COUNT(*) as count FROM comment_inbox ci WHERE ${whereClause}`,
            [userId]
        );

        const unreadResult = await pool.query(
            `SELECT COUNT(*) as count FROM comment_inbox WHERE user_id = $1 AND is_read = false`,
            [userId]
        );

        return {
            items: result.rows,
            total: parseInt(countResult.rows[0].count),
            unread: parseInt(unreadResult.rows[0].count),
            page,
            limit
        };
    }

    /**
     * 标记已读
     */
    async markRead(userId, inboxId) {
        const result = await pool.query(
            `UPDATE comment_inbox SET is_read = true
             WHERE id = $1 AND user_id = $2
             RETURNING *`,
            [inboxId, userId]
        );
        return result.rows[0];
    }

    /**
     * 标记全部已读
     */
    async markAllRead(userId) {
        await pool.query(
            `UPDATE comment_inbox SET is_read = true WHERE user_id = $1`,
            [userId]
        );
    }

    // ============ API 费用追踪 ============

    /**
     * 记录 API 调用
     */
    async recordApiUsage(data) {
        const result = await pool.query(
            `INSERT INTO twitterapi_usage
             (api_endpoint, api_action, request_count, items_count, credits_used, cost_usd, region, related_tweet_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                data.apiEndpoint,
                data.apiAction,
                data.requestCount || 1,
                data.itemsCount || 0,
                data.creditsUsed,
                data.costUsd,
                data.region || null,
                data.relatedTweetId || null
            ]
        );
        return result.rows[0];
    }

    /**
     * 获取费用统计
     */
    async getUsageStats(options = {}) {
        const { period = 'month', startDate = null, endDate = null } = options;

        let dateFilter = '';
        if (startDate && endDate) {
            dateFilter = `WHERE created_at BETWEEN '${startDate}' AND '${endDate}'`;
        } else if (period === 'today') {
            dateFilter = `WHERE DATE(created_at) = CURRENT_DATE`;
        } else if (period === 'week') {
            dateFilter = `WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`;
        } else if (period === 'month') {
            dateFilter = `WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`;
        }

        // 总计
        const summaryResult = await pool.query(
            `SELECT
                SUM(request_count) as total_requests,
                SUM(items_count) as total_items,
                SUM(credits_used) as total_credits,
                SUM(cost_usd) as total_cost
             FROM twitterapi_usage ${dateFilter}`
        );

        // 按操作类型
        const byActionResult = await pool.query(
            `SELECT
                api_action,
                SUM(request_count) as requests,
                SUM(items_count) as items,
                SUM(cost_usd) as cost
             FROM twitterapi_usage ${dateFilter}
             GROUP BY api_action
             ORDER BY cost DESC`
        );

        // 按日期
        const byDateResult = await pool.query(
            `SELECT
                DATE(created_at) as date,
                SUM(cost_usd) as cost,
                SUM(request_count) as requests
             FROM twitterapi_usage ${dateFilter}
             GROUP BY DATE(created_at)
             ORDER BY date`
        );

        // 按区域
        const byRegionResult = await pool.query(
            `SELECT
                region,
                SUM(cost_usd) as cost,
                SUM(request_count) as requests
             FROM twitterapi_usage ${dateFilter}
             ${dateFilter ? 'AND' : 'WHERE'} region IS NOT NULL
             GROUP BY region`
        );

        return {
            summary: summaryResult.rows[0],
            byAction: byActionResult.rows,
            byDate: byDateResult.rows,
            byRegion: byRegionResult.rows
        };
    }

    /**
     * 获取费用明细
     */
    async getUsageDetail(options = {}) {
        const { page = 1, limit = 50, action = null, region = null, startDate = null, endDate = null } = options;
        const offset = (page - 1) * limit;

        let whereClause = '1=1';
        const params = [];
        let paramIndex = 1;

        if (action) {
            whereClause += ` AND api_action = $${paramIndex++}`;
            params.push(action);
        }
        if (region) {
            whereClause += ` AND region = $${paramIndex++}`;
            params.push(region);
        }
        if (startDate) {
            whereClause += ` AND created_at >= $${paramIndex++}`;
            params.push(startDate);
        }
        if (endDate) {
            whereClause += ` AND created_at <= $${paramIndex++}`;
            params.push(endDate);
        }

        const countParams = [...params];
        params.push(limit, offset);

        const result = await pool.query(
            `SELECT * FROM twitterapi_usage
             WHERE ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            params
        );

        const countResult = await pool.query(
            `SELECT COUNT(*) as count FROM twitterapi_usage WHERE ${whereClause}`,
            countParams
        );

        return {
            items: result.rows,
            total: parseInt(countResult.rows[0].count),
            page,
            limit
        };
    }

    /**
     * 获取本月费用
     */
    async getMonthlySpent() {
        const result = await pool.query(
            `SELECT COALESCE(SUM(cost_usd), 0) as spent
             FROM twitterapi_usage
             WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)`
        );
        return parseFloat(result.rows[0].spent);
    }

    // ============ 统计 ============

    /**
     * 获取统计数据
     */
    async getStats(options = {}) {
        const { period = 'month' } = options;

        let dateFilter = '';
        if (period === 'today') {
            dateFilter = `WHERE DATE(published_at) = CURRENT_DATE`;
        } else if (period === 'week') {
            dateFilter = `WHERE published_at >= CURRENT_DATE - INTERVAL '7 days'`;
        } else if (period === 'month') {
            dateFilter = `WHERE published_at >= CURRENT_DATE - INTERVAL '30 days'`;
        }

        // 总计
        const summaryResult = await pool.query(
            `SELECT COUNT(*) as total_comments,
                    COUNT(DISTINCT tweet_author) as unique_authors,
                    COUNT(CASE WHEN region = 'ja' THEN 1 END) as ja_comments,
                    COUNT(CASE WHEN region = 'en' THEN 1 END) as en_comments
             FROM comment_history ${dateFilter}`
        );

        // 按日期
        const byDateResult = await pool.query(
            `SELECT DATE(published_at) as date, COUNT(*) as count
             FROM comment_history ${dateFilter}
             GROUP BY DATE(published_at)
             ORDER BY date`
        );

        // 按风格
        const byStyleResult = await pool.query(
            `SELECT comment_style, COUNT(*) as count
             FROM comment_history ${dateFilter}
             GROUP BY comment_style`
        );

        return {
            summary: summaryResult.rows[0],
            byDate: byDateResult.rows,
            byStyle: byStyleResult.rows
        };
    }
}

const commentAssistantDb = new CommentAssistantDbService();
module.exports = commentAssistantDb;

/**
 * 评论涨粉助手 API 路由
 * 仅管理员可访问
 */

const express = require('express');
const { authMiddleware: authenticate } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');
const commentAssistantDb = require('../services/commentAssistantDb');
const commentAssistantJob = require('../services/commentAssistantJob');

const router = express.Router();

// 所有路由需要登录 + 管理员权限
router.use(authenticate);
router.use(adminAuth);

// ============ 设置 ============

/**
 * GET /api/comment-assistant/settings
 * 获取系统设置
 */
router.get('/settings', async (req, res) => {
    try {
        const settings = await commentAssistantDb.getSettings();
        const todayCount = await commentAssistantDb.getTodayCommentCount();
        const monthlySpent = await commentAssistantDb.getMonthlySpent();
        const kolStats = await commentAssistantDb.getKolStats();

        // 判断当前区域
        const hour = new Date().getHours();
        const currentRegion = (hour >= 8 && hour < 20) ? 'ja' : 'en';

        // 获取评论账号信息
        let commentUser = null;
        if (settings?.comment_user_id) {
            const credentials = await commentAssistantDb.getUserTwitterCredentials(settings.comment_user_id);
            if (credentials) {
                commentUser = {
                    userId: settings.comment_user_id,
                    username: credentials.username,
                    twitterUsername: credentials.twitter_username,
                    tokenExpiresAt: credentials.token_expires_at
                };
            }
        }

        res.json({
            settings,
            status: {
                todayCount,
                monthlySpent,
                currentRegion,
                kolStats,
                commentUser
            }
        });
    } catch (error) {
        console.error('获取设置失败:', error);
        res.status(500).json({ error: '获取设置失败' });
    }
});

/**
 * GET /api/comment-assistant/twitter-users
 * 获取已绑定 Twitter 的用户列表（用于选择评论账号）
 */
router.get('/twitter-users', async (req, res) => {
    try {
        const users = await commentAssistantDb.getTwitterConnectedUsers();
        res.json(users);
    } catch (error) {
        console.error('获取 Twitter 用户列表失败:', error);
        res.status(500).json({ error: '获取用户列表失败' });
    }
});

/**
 * PUT /api/comment-assistant/settings
 * 更新系统设置
 */
router.put('/settings', async (req, res) => {
    try {
        const { dailyLimit, autoEnabled, notifyFrequency, monthlyBudget, commentUserId } = req.body;
        const settings = await commentAssistantDb.updateSettings({
            dailyLimit,
            autoEnabled,
            notifyFrequency,
            monthlyBudget,
            commentUserId
        });
        res.json(settings);
    } catch (error) {
        console.error('更新设置失败:', error);
        res.status(500).json({ error: '更新设置失败' });
    }
});

// ============ 大V列表 ============

/**
 * GET /api/comment-assistant/kol-list
 * 获取大V列表
 */
router.get('/kol-list', async (req, res) => {
    try {
        const { region } = req.query;
        const kols = await commentAssistantDb.getKolList(region || null);
        res.json(kols);
    } catch (error) {
        console.error('获取大V列表失败:', error);
        res.status(500).json({ error: '获取大V列表失败' });
    }
});

/**
 * POST /api/comment-assistant/kol
 * 添加大V
 */
router.post('/kol', async (req, res) => {
    try {
        const { region, kolUsername, kolDisplayName, groupIndex } = req.body;
        if (!region || !kolUsername || groupIndex === undefined) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        const kol = await commentAssistantDb.addKol({
            region,
            kolUsername,
            kolDisplayName,
            groupIndex
        });
        res.json(kol);
    } catch (error) {
        console.error('添加大V失败:', error);
        res.status(500).json({ error: '添加大V失败' });
    }
});

/**
 * DELETE /api/comment-assistant/kol/:id
 * 删除大V
 */
router.delete('/kol/:id', async (req, res) => {
    try {
        const deleted = await commentAssistantDb.deleteKol(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: '大V不存在' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('删除大V失败:', error);
        res.status(500).json({ error: '删除大V失败' });
    }
});

/**
 * PUT /api/comment-assistant/kol/:id/weight/reset
 * 重置大V权重为100
 */
router.put('/kol/:id/weight/reset', async (req, res) => {
    try {
        const kol = await commentAssistantDb.resetKolWeight(req.params.id);
        if (!kol) {
            return res.status(404).json({ error: '大V不存在' });
        }
        res.json(kol);
    } catch (error) {
        console.error('重置权重失败:', error);
        res.status(500).json({ error: '重置权重失败' });
    }
});

/**
 * POST /api/comment-assistant/kol/import
 * 批量导入大V
 */
router.post('/kol/import', async (req, res) => {
    try {
        const { kols } = req.body;
        if (!Array.isArray(kols) || kols.length === 0) {
            return res.status(400).json({ error: '无效的导入数据' });
        }
        const results = await commentAssistantDb.importKols(kols);
        res.json({ imported: results.length, kols: results });
    } catch (error) {
        console.error('批量导入失败:', error);
        res.status(500).json({ error: '批量导入失败' });
    }
});

// ============ 历史和收件箱 ============

/**
 * GET /api/comment-assistant/history
 * 获取评论历史
 */
router.get('/history', async (req, res) => {
    try {
        const { page, limit, region, start_date, end_date } = req.query;
        const history = await commentAssistantDb.getHistory({
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 20,
            region,
            startDate: start_date,
            endDate: end_date
        });
        res.json(history);
    } catch (error) {
        console.error('获取历史失败:', error);
        res.status(500).json({ error: '获取历史失败' });
    }
});

/**
 * GET /api/comment-assistant/inbox
 * 获取收件箱
 */
router.get('/inbox', async (req, res) => {
    try {
        const { page, limit, unread_only } = req.query;
        const inbox = await commentAssistantDb.getInbox(req.user.userId, {
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 20,
            unreadOnly: unread_only === 'true'
        });
        res.json(inbox);
    } catch (error) {
        console.error('获取收件箱失败:', error);
        res.status(500).json({ error: '获取收件箱失败' });
    }
});

/**
 * PUT /api/comment-assistant/inbox/:id/read
 * 标记已读
 */
router.put('/inbox/:id/read', async (req, res) => {
    try {
        const result = await commentAssistantDb.markRead(req.user.userId, req.params.id);
        if (!result) {
            return res.status(404).json({ error: '通知不存在' });
        }
        res.json(result);
    } catch (error) {
        console.error('标记已读失败:', error);
        res.status(500).json({ error: '标记已读失败' });
    }
});

/**
 * PUT /api/comment-assistant/inbox/read-all
 * 标记全部已读
 */
router.put('/inbox/read-all', async (req, res) => {
    try {
        await commentAssistantDb.markAllRead(req.user.userId);
        res.json({ success: true });
    } catch (error) {
        console.error('标记全部已读失败:', error);
        res.status(500).json({ error: '标记全部已读失败' });
    }
});

// ============ 统计 ============

/**
 * GET /api/comment-assistant/stats
 * 获取统计数据
 */
router.get('/stats', async (req, res) => {
    try {
        const { period } = req.query;
        const stats = await commentAssistantDb.getStats({ period: period || 'month' });
        res.json(stats);
    } catch (error) {
        console.error('获取统计失败:', error);
        res.status(500).json({ error: '获取统计失败' });
    }
});

// ============ 费用统计 ============

/**
 * GET /api/comment-assistant/usage
 * 获取费用统计
 */
router.get('/usage', async (req, res) => {
    try {
        const { period, start_date, end_date } = req.query;
        const usage = await commentAssistantDb.getUsageStats({
            period: period || 'month',
            startDate: start_date,
            endDate: end_date
        });
        res.json(usage);
    } catch (error) {
        console.error('获取费用统计失败:', error);
        res.status(500).json({ error: '获取费用统计失败' });
    }
});

/**
 * GET /api/comment-assistant/usage/detail
 * 获取费用明细
 */
router.get('/usage/detail', async (req, res) => {
    try {
        const { page, limit, action, region, start_date, end_date } = req.query;
        const detail = await commentAssistantDb.getUsageDetail({
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50,
            action,
            region,
            startDate: start_date,
            endDate: end_date
        });
        res.json(detail);
    } catch (error) {
        console.error('获取费用明细失败:', error);
        res.status(500).json({ error: '获取费用明细失败' });
    }
});

// ============ 手动触发（调试） ============

/**
 * POST /api/comment-assistant/run
 * 手动触发任务（调试用）
 */
router.post('/run', async (req, res) => {
    try {
        const result = await commentAssistantJob.run();
        res.json(result);
    } catch (error) {
        console.error('手动执行失败:', error);
        res.status(500).json({ error: '执行失败', message: error.message });
    }
});

module.exports = router;

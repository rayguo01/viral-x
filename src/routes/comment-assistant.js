/**
 * 评论涨粉助手 API 路由
 * 管理员可访问所有功能，有权限的普通用户仅可访问历史记录
 */

const express = require('express');
const { authMiddleware: authenticate } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');
const { pool } = require('../config/database');
const commentAssistantDb = require('../services/commentAssistantDb');
const commentAssistantJob = require('../services/commentAssistantJob');

const router = express.Router();

/**
 * 评论助手权限中间件
 * 需要 can_use_comment_assistant 权限（管理员也需要单独设置）
 */
async function commentAssistantAuth(req, res, next) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: '未授权访问' });
        }

        const result = await pool.query(
            'SELECT is_admin, can_use_comment_assistant FROM users WHERE id = $1',
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: '用户不存在' });
        }

        const user = result.rows[0];
        if (!user.can_use_comment_assistant) {
            return res.status(403).json({ error: '无评论助手权限' });
        }

        // 将 isAdmin 标记存入 req 供后续使用
        req.isAdmin = user.is_admin;
        next();
    } catch (error) {
        console.error('评论助手权限验证失败:', error);
        res.status(500).json({ error: '权限验证失败' });
    }
}

// 所有路由需要登录
router.use(authenticate);

// ============ 设置 ============

/**
 * GET /api/comment-assistant/settings
 * 获取系统设置（仅管理员）
 */
router.get('/settings', adminAuth, async (req, res) => {
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
 * 获取已绑定 Twitter 的用户列表（仅管理员）
 */
router.get('/twitter-users', adminAuth, async (req, res) => {
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
 * 更新系统设置（仅管理员）
 */
router.put('/settings', adminAuth, async (req, res) => {
    try {
        const { dailyLimit, autoEnabled, notifyFrequency, monthlyBudget, commentUserId, manualEnabled } = req.body;
        const settings = await commentAssistantDb.updateSettings({
            dailyLimit,
            autoEnabled,
            notifyFrequency,
            monthlyBudget,
            commentUserId,
            manualEnabled
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
 * 获取大V列表（仅管理员）
 */
router.get('/kol-list', adminAuth, async (req, res) => {
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
 * 添加大V（仅管理员）
 */
router.post('/kol', adminAuth, async (req, res) => {
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
 * 删除大V（仅管理员）
 */
router.delete('/kol/:id', adminAuth, async (req, res) => {
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
 * 重置大V权重为100（仅管理员）
 */
router.put('/kol/:id/weight/reset', adminAuth, async (req, res) => {
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
 * 批量导入大V（仅管理员）
 */
router.post('/kol/import', adminAuth, async (req, res) => {
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
 * 获取评论历史（管理员或有权限的用户）
 * 普通用户只能看自己的记录
 */
router.get('/history', commentAssistantAuth, async (req, res) => {
    try {
        const { page, limit, region, start_date, end_date, status } = req.query;
        const history = await commentAssistantDb.getHistory({
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 20,
            region,
            startDate: start_date,
            endDate: end_date,
            status,
            // 普通用户只能看自己的记录，管理员可以看所有
            userId: req.isAdmin ? null : req.user.userId
        });
        res.json(history);
    } catch (error) {
        console.error('获取历史失败:', error);
        res.status(500).json({ error: '获取历史失败' });
    }
});

/**
 * PUT /api/comment-assistant/history/:id/complete
 * 标记评论为已完成（手动评论后调用）
 */
router.put('/history/:id/complete', commentAssistantAuth, async (req, res) => {
    try {
        const result = await commentAssistantDb.markCommentCompleted(
            req.user.userId,
            req.params.id
        );
        if (!result) {
            return res.status(404).json({ error: '记录不存在或已完成' });
        }
        res.json(result);
    } catch (error) {
        console.error('标记完成失败:', error);
        res.status(500).json({ error: '标记完成失败' });
    }
});

/**
 * GET /api/comment-assistant/inbox
 * 获取收件箱（仅管理员）
 */
router.get('/inbox', adminAuth, async (req, res) => {
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
 * 标记已读（仅管理员）
 */
router.put('/inbox/:id/read', adminAuth, async (req, res) => {
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
 * 标记全部已读（仅管理员）
 */
router.put('/inbox/read-all', adminAuth, async (req, res) => {
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
 * 获取统计数据（仅管理员）
 */
router.get('/stats', adminAuth, async (req, res) => {
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
 * 获取费用统计（仅管理员）
 */
router.get('/usage', adminAuth, async (req, res) => {
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
 * 获取费用明细（仅管理员）
 */
router.get('/usage/detail', adminAuth, async (req, res) => {
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

// ============ 手动触发 ============

/**
 * POST /api/comment-assistant/run
 * 手动触发完整任务（仅管理员）
 */
router.post('/run', adminAuth, async (req, res) => {
    try {
        const result = await commentAssistantJob.run();
        res.json(result);
    } catch (error) {
        console.error('手动执行失败:', error);
        res.status(500).json({ error: '执行失败', message: error.message });
    }
});

/**
 * POST /api/comment-assistant/run-auto
 * 仅运行自动评论（仅管理员）
 */
router.post('/run-auto', adminAuth, async (req, res) => {
    try {
        const result = await commentAssistantJob.runAutoOnly();
        res.json(result);
    } catch (error) {
        console.error('自动评论执行失败:', error);
        res.status(500).json({ error: '执行失败', message: error.message });
    }
});

/**
 * POST /api/comment-assistant/run-manual
 * 仅运行手动评论生成（仅管理员）
 */
router.post('/run-manual', adminAuth, async (req, res) => {
    try {
        const result = await commentAssistantJob.runManualOnly();
        res.json(result);
    } catch (error) {
        console.error('手动评论生成失败:', error);
        res.status(500).json({ error: '执行失败', message: error.message });
    }
});

module.exports = router;

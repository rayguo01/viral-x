/**
 * Twitter API 客户端
 * - twitterapi.io：用于抓取推文和评论数据（带费用追踪）
 * - Twitter 官方 API：用于点赞和发评论（使用用户 OAuth Token）
 */

const commentAssistantDb = require('./commentAssistantDb');

// twitterapi.io 费率配置 (USD)
const PRICING = {
    fetch_tweets: 0.00015,    // $0.15 / 1000 条
    fetch_replies: 0.00015    // $0.15 / 1000 条
};

// Twitter 官方 API 配置
const TWITTER_API_URL = 'https://api.twitter.com/2';
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';

class TwitterApiClient {
    constructor() {
        this.baseUrl = 'https://api.twitterapi.io';
        this.apiKey = process.env.TWITTER_API_IO_KEY;
    }

    /**
     * 通用请求方法
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        // 添加超时控制
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30秒超时

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Twitter API 错误: ${response.status} - ${error}`);
            }

            return response.json();
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('请求超时 (30秒)');
            }
            throw err;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * 获取用户最近推文
     */
    async getUserTweets(username, count = 10, region = null) {
        const endpoint = `/twitter/user/last_tweets?userName=${encodeURIComponent(username)}&count=${count}`;

        // 调试：检查 API Key
        if (!this.apiKey) {
            console.error('[TwitterAPI] 警告: TWITTER_API_IO_KEY 未配置!');
        }

        const data = await this.request(endpoint);

        // API 返回格式: { status, code, msg, data: { tweets: [...] } }
        const rawTweets = data.data?.tweets || data.tweets || [];

        // 调试：输出原始响应（如果没有推文）
        if (rawTweets.length === 0) {
            console.log(`[TwitterAPI] @${username} 响应: ${JSON.stringify(data).substring(0, 300)}`);
        }

        // 标准化字段名（API 返回驼峰格式，统一转为下划线格式）
        const tweets = rawTweets.map(t => ({
            ...t,
            created_at: t.createdAt || t.created_at,
            reply_count: t.replyCount ?? t.reply_count ?? 0,
            view_count: t.viewCount ?? t.view_count ?? 0,
            like_count: t.likeCount ?? t.like_count ?? 0,
            retweet_count: t.retweetCount ?? t.retweet_count ?? 0,
            full_text: t.text || t.full_text,
            media: t.extendedEntities?.media || t.media || []
        }));

        // 记录费用（按实际返回数量计费，不是截取后的数量）
        await commentAssistantDb.recordApiUsage({
            apiEndpoint: '/twitter/user/last_tweets',
            apiAction: 'fetch_tweets',
            itemsCount: rawTweets.length,
            creditsUsed: rawTweets.length * PRICING.fetch_tweets * 1000,
            costUsd: rawTweets.length * PRICING.fetch_tweets,
            region
        });

        return tweets;
    }

    /**
     * 获取推文评论
     */
    async getTweetReplies(tweetId, count = 20, region = null) {
        const endpoint = `/twitter/tweet/replies?tweetId=${tweetId}&count=${count}`;
        const data = await this.request(endpoint);

        // API 返回格式: { status, code, msg, data: { replies: [...] } }
        const rawReplies = data.data?.replies || data.replies || [];

        // 标准化字段名
        const replies = rawReplies.map(r => ({
            ...r,
            created_at: r.createdAt || r.created_at,
            view_count: r.viewCount ?? r.view_count ?? 0,
            like_count: r.likeCount ?? r.like_count ?? 0
        }));

        // 记录费用
        await commentAssistantDb.recordApiUsage({
            apiEndpoint: '/twitter/tweet/replies',
            apiAction: 'fetch_replies',
            itemsCount: replies.length,
            creditsUsed: replies.length * PRICING.fetch_replies * 1000,
            costUsd: replies.length * PRICING.fetch_replies,
            region,
            relatedTweetId: tweetId
        });

        return replies;
    }

    /**
     * 刷新用户的 Access Token
     */
    async refreshUserToken(refreshToken) {
        const clientId = process.env.TWITTER_CLIENT_ID;
        const clientSecret = process.env.TWITTER_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw new Error('Twitter OAuth 未配置');
        }

        const response = await fetch(TWITTER_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Token 刷新失败: ${response.status} - ${errorText}`);
        }

        const tokenData = await response.json();
        return {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || refreshToken,
            expiresIn: tokenData.expires_in
        };
    }

    /**
     * 获取有效的用户 Access Token（必要时自动刷新）
     */
    async getValidUserToken(userId) {
        const credentials = await commentAssistantDb.getUserTwitterCredentials(userId);
        if (!credentials) {
            throw new Error(`用户 ${userId} 未绑定 Twitter 账号`);
        }

        const { access_token, refresh_token, token_expires_at, twitter_username } = credentials;

        // 检查 Token 是否过期（提前 5 分钟刷新）
        const now = new Date();
        const expiresAt = token_expires_at ? new Date(token_expires_at) : null;
        const needsRefresh = expiresAt && (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000);

        if (needsRefresh) {
            if (!refresh_token) {
                throw new Error(`用户 @${twitter_username} 的 Token 已过期且无法刷新，请重新授权`);
            }

            console.log(`[TwitterAPI] 刷新用户 @${twitter_username} 的 Token...`);
            const refreshed = await this.refreshUserToken(refresh_token);

            // 更新数据库
            const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
            await commentAssistantDb.updateUserTwitterToken(
                userId,
                refreshed.accessToken,
                refreshed.refreshToken,
                newExpiresAt
            );

            return { accessToken: refreshed.accessToken, twitterUsername: twitter_username };
        }

        return { accessToken: access_token, twitterUsername: twitter_username };
    }

    /**
     * 点赞推文（使用用户 OAuth Token）
     */
    async likeTweet(tweetId, userId, region = null) {
        // 获取有效的用户 Token
        const { accessToken, twitterUsername } = await this.getValidUserToken(userId);

        // 首先获取用户的 Twitter ID
        const meResponse = await fetch(`${TWITTER_API_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!meResponse.ok) {
            const errorText = await meResponse.text();
            throw new Error(`获取用户信息失败: ${meResponse.status} - ${errorText}`);
        }

        const meData = await meResponse.json();
        const twitterUserId = meData.data.id;

        // 发送点赞请求
        const likeResponse = await fetch(`${TWITTER_API_URL}/users/${twitterUserId}/likes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tweet_id: tweetId })
        });

        if (!likeResponse.ok) {
            const errorData = await likeResponse.json();
            // 如果已经点赞过，不算错误
            if (errorData.detail?.includes('already liked')) {
                console.log(`[TwitterAPI] 帖子 ${tweetId} 已点赞过`);
                return { liked: true, alreadyLiked: true };
            }
            throw new Error(`点赞失败: ${likeResponse.status} - ${JSON.stringify(errorData)}`);
        }

        console.log(`[TwitterAPI] @${twitterUsername} 点赞帖子 ${tweetId} 成功`);
        return { liked: true };
    }

    /**
     * 发布评论（使用用户 OAuth Token）
     */
    async postComment(tweetId, text, userId, region = null) {
        // 获取有效的用户 Token
        const { accessToken, twitterUsername } = await this.getValidUserToken(userId);

        // 发送评论（作为回复）
        const tweetResponse = await fetch(`${TWITTER_API_URL}/tweets`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                reply: { in_reply_to_tweet_id: tweetId }
            })
        });

        if (!tweetResponse.ok) {
            const errorData = await tweetResponse.json();

            // 特殊处理 429 速率限制错误
            if (tweetResponse.status === 429) {
                // 尝试从 header 获取 retry-after 时间（秒）
                const retryAfter = tweetResponse.headers.get('retry-after');
                const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 15 * 60; // 默认 15 分钟
                const error = new Error(`发评论失败: 429 - ${JSON.stringify(errorData)}`);
                error.isRateLimited = true;
                error.retryAfterSeconds = retrySeconds;
                throw error;
            }

            throw new Error(`发评论失败: ${tweetResponse.status} - ${JSON.stringify(errorData)}`);
        }

        const tweetData = await tweetResponse.json();
        console.log(`[TwitterAPI] @${twitterUsername} 发布评论成功，ID: ${tweetData.data.id}`);

        return {
            id: tweetData.data.id,
            text: tweetData.data.text
        };
    }
}

const twitterApiClient = new TwitterApiClient();
module.exports = twitterApiClient;

/**
 * Twitter API Client for twitterapi.io
 */
import fetch from 'node-fetch';
import { DomainTweet, RawTweet, SearchResponse } from './types';

interface TwitterApiConfig {
  apiKey: string;
  provider?: 'twitterapi' | 'xquik';
}

export class TwitterApiClient {
  private apiKey: string;
  private provider: 'twitterapi' | 'xquik';
  private baseUrl: string;

  constructor(config: TwitterApiConfig) {
    this.apiKey = config.apiKey;
    this.provider = config.provider || 'twitterapi';
    this.baseUrl = this.provider === 'xquik'
      ? 'https://xquik.com'
      : 'https://api.twitterapi.io';
  }

  /**
   * 按关键词搜索推文
   */
  async search(query: string, count: number = 100, kolAccounts: string[] = []): Promise<DomainTweet[]> {
    return this.searchWithSource(query, count, kolAccounts, 'search', 'Top');
  }

  private async searchWithSource(
    query: string,
    count: number,
    kolAccounts: string[],
    source: 'search' | 'kol',
    queryType: 'Top' | 'Latest'
  ): Promise<DomainTweet[]> {
    const tweets: DomainTweet[] = [];
    let cursor = '';

    console.log(`[${this.provider}] 搜索: ${query.substring(0, 50)}...`);

    while (tweets.length < count) {
      const params = this.buildSearchParams(query, queryType, count);
      if (cursor) {
        params.append('cursor', cursor);
      }

      const response = await fetch(`${this.searchEndpoint()}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as SearchResponse;

      if (!data.tweets || data.tweets.length === 0) {
        console.log(`[${this.provider}] 没有更多结果`);
        break;
      }

      for (const tweet of data.tweets) {
        const transformed = this.transformTweet(tweet, source, kolAccounts);
        tweets.push(transformed);
        if (tweets.length >= count) break;
      }

      console.log(`[${this.provider}] 已获取 ${tweets.length}/${count} 条推文`);

      if (!data.has_next_page) break;
      cursor = data.next_cursor || '';
      if (!cursor) break;

      // 短暂延迟避免请求过快
      await this.delay(500);
    }

    return tweets;
  }

  /**
   * 获取 KOL 用户的最新推文
   */
  async getUserTweets(username: string, count: number = 10): Promise<DomainTweet[]> {
    console.log(`[${this.provider}] 获取 @${username} 的推文...`);

    if (this.provider === 'xquik') {
      return this.searchWithSource(
        `from:${username} -filter:retweets`,
        count,
        [username],
        'kol',
        'Latest'
      );
    }

    try {
      const params = new URLSearchParams({
        userName: username
      });

      const response = await fetch(`${this.baseUrl}/twitter/user/last_tweets?${params.toString()}`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey
        }
      });

      if (!response.ok) {
        console.warn(`[TwitterAPI] 获取 @${username} 失败: ${response.status}`);
        return [];
      }

      const data = await response.json() as { data?: { tweets?: RawTweet[] }; tweets?: RawTweet[] };
      // API 返回格式: { data: { tweets: [...] } } 或 { tweets: [...] }
      const rawTweets = data.data?.tweets || data.tweets || [];
      const tweets = rawTweets.map((t: RawTweet) =>
        this.transformTweet(t, 'kol', [username])
      );

      console.log(`[TwitterAPI] @${username}: ${tweets.length} 条推文`);
      return tweets;
    } catch (error) {
      console.warn(`[TwitterAPI] 获取 @${username} 出错:`, error);
      return [];
    }
  }

  /**
   * 批量获取多个 KOL 的推文
   */
  async getKolTweets(
    accounts: string[],
    tweetsPerKol: number,
    minLikes: number
  ): Promise<DomainTweet[]> {
    const allTweets: DomainTweet[] = [];

    console.log(`[TwitterAPI] 开始获取 ${accounts.length} 个 KOL 的推文...`);

    for (const username of accounts) {
      try {
        // 多获取一些，然后过滤
        const tweets = await this.getUserTweets(username, tweetsPerKol * 2);

        // 过滤低互动的推文
        const filtered = tweets.filter(t => t.likes >= minLikes);
        allTweets.push(...filtered.slice(0, tweetsPerKol));

        // 添加延迟避免速率限制 (免费用户限制: 5秒/请求)
        await this.delay(5500);
      } catch (error) {
        console.warn(`[TwitterAPI] @${username} 出错:`, error);
      }
    }

    console.log(`[TwitterAPI] KOL 推文总计: ${allTweets.length} 条`);
    return allTweets;
  }

  /**
   * 转换原始推文为标准格式
   */
  private transformTweet(raw: RawTweet, source: 'search' | 'kol', kolAccounts: string[]): DomainTweet {
    const authorUsername = raw.author?.userName || raw.author?.username || '';
    const isKol = kolAccounts.some(k =>
      k.toLowerCase() === authorUsername.toLowerCase()
    );

    return {
      id: raw.id,
      text: raw.text,
      author: authorUsername,
      authorFollowers: raw.author?.followersCount || raw.author?.followers || 0,
      likes: raw.likeCount || 0,
      retweets: raw.retweetCount || 0,
      replies: raw.replyCount || 0,
      hashtags: raw.entities?.hashtags?.map(h => h.text) || [],
      createdAt: raw.createdAt,
      url: `https://x.com/${authorUsername}/status/${raw.id}`,
      source,
      isKol
    };
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private searchEndpoint(): string {
    return this.provider === 'xquik'
      ? `${this.baseUrl}/api/v1/x/tweets/search`
      : `${this.baseUrl}/twitter/tweet/advanced_search`;
  }

  private buildSearchParams(query: string, queryType: 'Top' | 'Latest', count: number): URLSearchParams {
    if (this.provider === 'xquik') {
      return new URLSearchParams({
        q: query,
        queryType,
        limit: String(Math.min(count, 100))
      });
    }

    return new URLSearchParams({
      query,
      queryType
    });
  }
}

/**
 * 构建搜索查询字符串
 * 注意: min_faves/min_retweets 在 twitterapi.io 不支持，需要在代码中过滤
 */
export function buildSearchQuery(config: {
  keywords: string[];
  hashtags: string[];
  minLikes: number;
  minRetweets?: number;
  languages: string[];
  excludeRetweets: boolean;
}, hoursAgo: number = 24): string {
  const parts: string[] = [];

  // 关键词和标签组合
  const terms = [
    ...config.keywords,
    ...config.hashtags.map(h => h.startsWith('#') ? h : `#${h}`)
  ];
  if (terms.length > 0) {
    parts.push(`(${terms.join(' OR ')})`);
  }

  // 注意: min_faves/min_retweets 在 twitterapi.io 不支持
  // 需要在代码中过滤，而不是在查询中

  // 语言过滤（只支持单语言）
  if (config.languages?.length === 1) {
    parts.push(`lang:${config.languages[0]}`);
  }

  // 排除转发
  if (config.excludeRetweets) {
    parts.push('-is:retweet');
  }

  // 时间范围：最近 N 小时
  if (hoursAgo > 0) {
    const sinceDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const sinceStr = sinceDate.toISOString().split('T')[0]; // YYYY-MM-DD 格式
    parts.push(`since:${sinceStr}`);
  }

  return parts.join(' ');
}

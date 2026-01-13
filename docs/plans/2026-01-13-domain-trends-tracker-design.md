# 特定领域趋势追踪功能设计

**日期**：2026-01-13
**版本**：v2.0
**状态**：待实现

---

## 一、功能概述

### 背景

当前项目的热点抓取功能（x-trends）只能获取全球通用热点，无法追踪特定领域（如 Web3、AI、游戏等）的趋势。用户需要针对特定领域生成内容，需要更精准的热点数据。

### 目标

实现可配置的特定领域趋势追踪功能（domain-trends），与现有 x-trends 保持相同的架构模式：
- 从 twitterapi.io 按关键词搜索推文
- 支持预设领域配置（Web3、AI 等）
- 复用现有的 skillCache 和 SSE 执行机制
- 与现有热帖抓取页面无缝集成

---

## 二、技术方案

### 数据源

**第三方 API**：[twitterapi.io](https://twitterapi.io/)

| 项目 | 详情 |
|------|------|
| 免费额度 | 100,000 积分（约 6,600 条推文） |
| 付费价格 | $0.15 / 1,000 条推文 |
| 主要端点 | `POST /twitter/tweet/advanced_search` |
| 无需认证 | 不需要 X Developer 账号 |

### API 详情

**请求格式**：
```bash
curl -X POST "https://api.twitterapi.io/twitter/tweet/advanced_search" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "(web3 OR #web3 OR crypto) min_faves:50 lang:en -is:retweet",
    "queryType": "Latest",
    "cursor": ""
  }'
```

**响应格式**：
```json
{
  "tweets": [
    {
      "type": "tweet",
      "id": "1878428866051420389",
      "text": "推文内容...",
      "author": {
        "userName": "username",
        "name": "Display Name",
        "followersCount": 12345
      },
      "likeCount": 500,
      "retweetCount": 120,
      "replyCount": 30,
      "createdAt": "Mon Jan 13 10:30:00 +0000 2026",
      "entities": {
        "hashtags": [
          { "text": "web3" },
          { "text": "crypto" }
        ]
      }
    }
  ],
  "has_next_page": true,
  "next_cursor": "..."
}
```

### 成本估算

| 使用场景 | 每次抓取量 | 每月成本（每天3次） |
|----------|-----------|-------------------|
| 轻量使用 | 100 条 | ~$1.35/月 |
| 标准使用 | 500 条 | ~$6.75/月 |
| 深度使用 | 1000 条 | ~$13.5/月 |

---

## 三、架构设计

### 文件结构

```
.claude/domain-trends/
├── domain-trends.ts      # 主执行脚本（仿 x-trends.ts）
├── twitter-api-client.ts # twitterapi.io 客户端封装
├── presets/              # 预设配置
│   ├── web3.json
│   ├── ai.json
│   └── gaming.json
└── types.ts              # 类型定义
```

### 核心接口

```typescript
// types.ts
interface DomainConfig {
  id: string;
  name: string;
  description: string;
  query: {
    keywords: string[];      // 搜索关键词
    hashtags: string[];      // 话题标签
    minLikes: number;        // 最低点赞数
    minRetweets?: number;    // 最低转发数
    languages: string[];     // 语言过滤
    excludeRetweets: boolean;
  };
  fetchCount: number;        // 抓取数量
}

interface DomainTweet {
  id: string;
  text: string;
  author: string;
  authorFollowers: number;
  likes: number;
  retweets: number;
  hashtags: string[];
  createdAt: string;
  url: string;
}

interface DomainTrendItem {
  rank: number;
  topic: string;
  engagement: number;       // 总互动量
  tweetCount: number;       // 推文数
  topTweet: DomainTweet;    // 代表性推文
  url: string;
}
```

---

## 四、数据流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 加载预设配置 (presets/web3.json)                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. 构建搜索查询                                             │
│  "(web3 OR #web3 OR crypto) min_faves:50 lang:en -is:retweet"│
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. 调用 twitterapi.io 获取推文                              │
│  - 分页抓取直到达到 fetchCount                               │
│  - 过滤和去重                                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. 数据聚合                                                 │
│  - 按 hashtag 聚合统计                                       │
│  - 按话题关键词聚合                                          │
│  - 计算综合热度分数                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  5. 转换为 TrendItem 格式（与 x-trends 一致）                │
│  - rank, topic, engagement, url                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  6. Claude CLI 分析生成选题建议                              │
│  - 复用 x-trends 的 prompt 模板                             │
│  - 输出 JSON 格式报告                                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  7. 缓存结果到 skillCache                                    │
│  - 按小时存储                                                │
│  - 支持历史查看                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、预设配置

### Web3 预设 (presets/web3.json)

```json
{
  "id": "web3",
  "name": "Web3 趋势",
  "description": "追踪 Web3、加密货币、NFT 领域热点",
  "query": {
    "keywords": ["web3", "crypto", "NFT", "DeFi", "blockchain"],
    "hashtags": ["web3", "crypto", "NFT", "DeFi", "ethereum", "bitcoin"],
    "minLikes": 50,
    "minRetweets": 10,
    "languages": ["en"],
    "excludeRetweets": true
  },
  "fetchCount": 200
}
```

### AI 预设 (presets/ai.json)

```json
{
  "id": "ai",
  "name": "AI 趋势",
  "description": "追踪人工智能、机器学习、大模型领域热点",
  "query": {
    "keywords": ["AI", "GPT", "LLM", "machine learning", "ChatGPT", "Claude"],
    "hashtags": ["AI", "MachineLearning", "GPT", "LLM", "OpenAI", "Anthropic"],
    "minLikes": 100,
    "languages": ["en"],
    "excludeRetweets": true
  },
  "fetchCount": 200
}
```

### Gaming 预设 (presets/gaming.json)

```json
{
  "id": "gaming",
  "name": "游戏趋势",
  "description": "追踪游戏、电竞、游戏开发领域热点",
  "query": {
    "keywords": ["gaming", "esports", "gamedev", "indie game"],
    "hashtags": ["gaming", "esports", "gamedev", "indiegame", "PS5", "Xbox"],
    "minLikes": 50,
    "languages": ["en", "ja"],
    "excludeRetweets": true
  },
  "fetchCount": 200
}
```

---

## 六、核心代码设计

### Twitter API 客户端 (twitter-api-client.ts)

```typescript
import fetch from 'node-fetch';

interface TwitterApiConfig {
  apiKey: string;
}

interface SearchResponse {
  tweets: RawTweet[];
  has_next_page: boolean;
  next_cursor: string;
}

export class TwitterApiClient {
  private apiKey: string;
  private baseUrl = 'https://api.twitterapi.io';

  constructor(config: TwitterApiConfig) {
    this.apiKey = config.apiKey;
  }

  async search(query: string, count: number = 100): Promise<DomainTweet[]> {
    const tweets: DomainTweet[] = [];
    let cursor = '';

    while (tweets.length < count) {
      const response = await fetch(`${this.baseUrl}/twitter/tweet/advanced_search`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          queryType: 'Latest',
          cursor
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data: SearchResponse = await response.json();

      for (const tweet of data.tweets) {
        tweets.push(this.transformTweet(tweet));
        if (tweets.length >= count) break;
      }

      if (!data.has_next_page) break;
      cursor = data.next_cursor;
    }

    return tweets;
  }

  private transformTweet(raw: RawTweet): DomainTweet {
    return {
      id: raw.id,
      text: raw.text,
      author: raw.author.userName,
      authorFollowers: raw.author.followersCount,
      likes: raw.likeCount,
      retweets: raw.retweetCount,
      hashtags: raw.entities?.hashtags?.map(h => h.text) || [],
      createdAt: raw.createdAt,
      url: `https://x.com/${raw.author.userName}/status/${raw.id}`
    };
  }
}
```

### 查询构建器

```typescript
function buildSearchQuery(config: DomainConfig['query']): string {
  const parts: string[] = [];

  // 关键词和标签组合
  const terms = [
    ...config.keywords,
    ...config.hashtags.map(h => `#${h}`)
  ];
  if (terms.length > 0) {
    parts.push(`(${terms.join(' OR ')})`);
  }

  // 最低互动量
  if (config.minLikes) {
    parts.push(`min_faves:${config.minLikes}`);
  }
  if (config.minRetweets) {
    parts.push(`min_retweets:${config.minRetweets}`);
  }

  // 语言过滤（只支持单语言）
  if (config.languages?.length === 1) {
    parts.push(`lang:${config.languages[0]}`);
  }

  // 排除转发
  if (config.excludeRetweets) {
    parts.push('-is:retweet');
  }

  return parts.join(' ');
}

// 示例输出:
// "(web3 OR crypto OR NFT OR #web3 OR #crypto) min_faves:50 lang:en -is:retweet"
```

### 数据聚合

```typescript
interface AggregatedTopic {
  topic: string;
  tweets: DomainTweet[];
  totalLikes: number;
  totalRetweets: number;
  engagement: number;
}

function aggregateTweets(tweets: DomainTweet[]): DomainTrendItem[] {
  // 1. 按 hashtag 聚合
  const hashtagMap = new Map<string, DomainTweet[]>();

  for (const tweet of tweets) {
    for (const tag of tweet.hashtags) {
      const key = tag.toLowerCase();
      if (!hashtagMap.has(key)) {
        hashtagMap.set(key, []);
      }
      hashtagMap.get(key)!.push(tweet);
    }
  }

  // 2. 计算每个话题的热度
  const topics: AggregatedTopic[] = [];

  for (const [topic, topicTweets] of hashtagMap) {
    const totalLikes = topicTweets.reduce((sum, t) => sum + t.likes, 0);
    const totalRetweets = topicTweets.reduce((sum, t) => sum + t.retweets, 0);

    topics.push({
      topic: `#${topic}`,
      tweets: topicTweets,
      totalLikes,
      totalRetweets,
      engagement: totalLikes + totalRetweets * 2
    });
  }

  // 3. 排序并转换为 TrendItem
  return topics
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 15)
    .map((t, index) => ({
      rank: index + 1,
      topic: t.topic,
      engagement: t.engagement,
      tweetCount: t.tweets.length,
      topTweet: t.tweets.sort((a, b) => b.likes - a.likes)[0],
      url: `https://x.com/search?q=${encodeURIComponent(t.topic)}`
    }));
}
```

---

## 七、后端集成

### Skill 注册 (src/routes/skills.js)

在 `skillConfigs` 中添加 domain-trends：

```javascript
const skillConfigs = {
  'x-trends': { ... },
  'tophub-trends': { ... },
  'domain-trends': {
    name: '领域趋势',
    description: '特定领域热点追踪',
    scriptPath: '.claude/domain-trends/domain-trends.ts',
    outputDir: 'outputs/trends/domain',
    supportedPresets: ['web3', 'ai', 'gaming']
  }
};
```

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills/domain-trends/presets` | 获取预设列表 |
| POST | `/api/skills/domain-trends/execute` | 执行抓取（body: { preset: 'web3' }） |
| GET | `/api/skills/domain-trends/hours` | 获取历史数据列表 |
| GET | `/api/skills/domain-trends/cached/:hourKey` | 获取历史数据 |

### skillCache 集成

复用现有的 `skillCache.js`，skill ID 格式：`domain-trends:web3`

```javascript
// 缓存键示例
skillCache.set('domain-trends:web3', reportContent);
skillCache.get('domain-trends:web3');
skillCache.getAvailableHours('domain-trends:web3');
```

---

## 八、前端集成

### Tab 扩展

在热帖抓取页面增加第三个 Tab：

```html
<div class="tabs">
  <button class="tab" data-tab="x-trends">𝕏 X 趋势</button>
  <button class="tab" data-tab="tophub-trends">🔥 TopHub 热榜</button>
  <button class="tab" data-tab="domain-trends">🎯 领域趋势</button>
</div>
```

### 预设选择器

当选择"领域趋势"Tab 时，显示预设选择：

```html
<div class="preset-selector">
  <span class="preset-label">选择领域：</span>
  <button class="preset-btn active" data-preset="web3">🌐 Web3</button>
  <button class="preset-btn" data-preset="ai">🤖 AI</button>
  <button class="preset-btn" data-preset="gaming">🎮 Gaming</button>
</div>
```

### trends.js 修改

```javascript
// 新增状态
this.selectedPreset = 'web3';

// 修改 loadTrends 方法
async loadTrends() {
  const params = this.activeTab === 'domain-trends'
    ? { source: this.activeTab, preset: this.selectedPreset }
    : { source: this.activeTab };

  await this.generator.executeStep('trends', params, { ... });
}
```

---

## 九、实现步骤

### 第一阶段：核心功能

| 步骤 | 内容 | 优先级 |
|------|------|--------|
| 1 | 创建 `twitter-api-client.ts` | P0 |
| 2 | 创建预设配置文件 | P0 |
| 3 | 创建 `domain-trends.ts` 主脚本 | P0 |
| 4 | 后端 API 集成 | P0 |
| 5 | skillCache 集成 | P0 |

### 第二阶段：前端集成

| 步骤 | 内容 | 优先级 |
|------|------|--------|
| 6 | trends.js 添加 Tab 和预设选择 | P1 |
| 7 | CSS 样式调整 | P1 |
| 8 | 测试和调试 | P1 |

### 第三阶段：扩展功能（可选）

| 步骤 | 内容 | 优先级 |
|------|------|--------|
| 9 | 自定义配置界面 | P2 |
| 10 | KOL 账号监控 | P2 |
| 11 | 定时任务调度 | P2 |

---

## 十、环境变量

```env
# twitterapi.io API Key（必须）
TWITTER_API_IO_KEY=your_api_key_here
```

---

## 十一、输出格式

### 与 x-trends 保持一致

```json
{
  "metadata": {
    "generatedAt": "2026-01-13T08:00:00Z",
    "source": "domain-trends:web3",
    "preset": "web3",
    "tweetCount": 200
  },
  "overview": "过去 24 小时 Web3 领域热点概览...",
  "categories": {
    "DeFi": ["#DeFi", "#yield", "#DEX"],
    "NFT": ["#NFT", "#opensea"],
    "Layer2": ["#arbitrum", "#optimism"]
  },
  "suggestions": [
    {
      "rank": 1,
      "topic": "#Ethereum ETF",
      "url": "https://x.com/search?q=%23Ethereum%20ETF",
      "score": "高",
      "reason": "ETH ETF 审批进展引发大量讨论",
      "angle": "深度解读 SEC 对 ETH ETF 的最新态度",
      "whyEffective": "监管动态是 Crypto 圈最关注的话题",
      "directions": ["政策解读", "市场影响分析", "与 BTC ETF 对比"]
    }
  ],
  "summary": "整体内容策略建议..."
}
```

---

## 十二、待确认事项

- [x] twitterapi.io API 文档已确认
- [ ] 获取 API Key 并测试
- [ ] 确认 Web3 领域的关键词和标签列表
- [ ] 确认 AI 和 Gaming 领域的关键词列表
- [ ] 确定每次抓取的数量（建议 200 条）

---

## 十三、风险和注意事项

1. **API 限流**：twitterapi.io 有速率限制，需要合理控制请求频率
2. **成本控制**：免费额度有限，需要监控使用量
3. **数据质量**：可能抓取到低质量或垃圾推文，需要过滤
4. **时效性**：推文数据有时效性，建议每小时更新一次

---

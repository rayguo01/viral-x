/**
 * Domain Trends - 特定领域趋势追踪
 * 从 twitterapi.io 抓取特定领域的推文并分析
 */
import fs from 'fs';
import path from 'path';
import { TwitterApiClient, buildSearchQuery } from './twitter-api-client';
import { DomainConfig, DomainTweet, DomainTrendItem, AggregatedTopic, GroupRotationConfig, KolGroup } from './types';
import { parseRobustJSON } from '../utils/json-parser';
import { callClaude, ClaudeUsage, formatUsageLog } from '../utils/claude-cli';

// 路径配置
const projectRoot = path.resolve(__dirname, '../../');
const OUTPUT_DIR = path.join(projectRoot, 'outputs');
const TRENDS_DIR = path.join(OUTPUT_DIR, 'trends/domain');
const PRESETS_DIR = path.join(__dirname, 'presets');

type TwitterProvider = 'twitterapi' | 'xquik';

// 确保目录存在
if (!fs.existsSync(TRENDS_DIR)) {
  fs.mkdirSync(TRENDS_DIR, { recursive: true });
}

/**
 * 加载预设配置
 */
export function loadPreset(presetId: string): DomainConfig {
  const presetPath = path.join(PRESETS_DIR, `${presetId}.json`);

  if (!fs.existsSync(presetPath)) {
    throw new Error(`预设配置不存在: ${presetId}`);
  }

  const content = fs.readFileSync(presetPath, 'utf-8');
  return JSON.parse(content) as DomainConfig;
}

/**
 * 获取所有可用预设
 */
export function getAvailablePresets(): Array<{ id: string; name: string; description: string }> {
  const files = fs.readdirSync(PRESETS_DIR).filter(f => f.endsWith('.json') && !f.includes('-kol-groups'));

  return files.map(file => {
    const content = fs.readFileSync(path.join(PRESETS_DIR, file), 'utf-8');
    const config = JSON.parse(content) as DomainConfig;
    return {
      id: config.id,
      name: config.name,
      description: config.description
    };
  });
}

/**
 * 加载分组轮换配置
 */
export function loadGroupConfig(presetId: string): GroupRotationConfig {
  const configPath = path.join(PRESETS_DIR, `${presetId}-kol-groups.json`);

  if (!fs.existsSync(configPath)) {
    throw new Error(`分组配置不存在: ${presetId}-kol-groups.json`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content) as GroupRotationConfig;
}

/**
 * 根据当前时间获取应该抓取的分组
 * @param config 分组配置
 * @param currentHour 当前小时 (0-23)
 * @returns 当前应该抓取的分组
 */
export function getCurrentGroup(config: GroupRotationConfig, currentHour?: number): KolGroup {
  const hour = currentHour ?? new Date().getHours();
  // 每 rotationIntervalHours 小时轮换一组
  // 例如: 0-1点 -> 组0, 2-3点 -> 组1, ... 18-19点 -> 组9, 20-21点 -> 组0 (循环)
  const groupIndex = Math.floor(hour / config.rotationIntervalHours) % config.totalGroups;

  const group = config.groups.find(g => g.groupId === groupIndex);
  if (!group) {
    throw new Error(`找不到分组 ${groupIndex}`);
  }

  return group;
}

/**
 * 抓取指定分组的 KOL 推文
 */
export async function fetchGroupTweets(
  group: KolGroup,
  config: GroupRotationConfig
): Promise<DomainTweet[]> {
  const client = createTwitterApiClient();

  console.log(`📡 抓取分组 [${group.groupId}]: ${group.name}`);
  console.log(`👥 KOL 列表: ${group.accounts.join(', ')}`);

  const tweets = await client.getKolTweets(
    group.accounts,
    config.fetchConfig.tweetsPerKol,
    config.fetchConfig.minLikes
  );

  console.log(`✅ 获取到 ${tweets.length} 条推文`);
  return tweets;
}

/**
 * 分组轮换模式的主执行函数
 */
export async function runWithRotation(presetId: string = 'ai'): Promise<{
  reportPath: string;
  report: string;
  data: any;
  groupId: number;
}> {
  try {
    console.log(`\n🎯 开始 Domain Trends 分组轮换抓取 [${presetId}]`);

    // 1. 加载分组配置
    const groupConfig = loadGroupConfig(presetId);
    console.log(`📋 配置: ${groupConfig.name}`);

    // 2. 获取当前分组
    const currentHour = new Date().getHours();
    const group = getCurrentGroup(groupConfig, currentHour);
    console.log(`⏰ 当前时间: ${currentHour}:00, 轮换到分组 ${group.groupId}`);

    // 3. 抓取该分组的推文
    const tweets = await fetchGroupTweets(group, groupConfig);

    if (tweets.length === 0) {
      throw new Error('未获取到任何推文');
    }

    // 4. 保存原始数据
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const rawFilename = `${presetId}_group${group.groupId}_tweets_${dateStr}.json`;
    const rawPath = path.join(TRENDS_DIR, rawFilename);

    fs.writeFileSync(rawPath, JSON.stringify(tweets, null, 2));
    console.log(`✅ 原始数据已保存: ${rawPath}`);

    // 5. 聚合数据
    const trendItems = aggregateTweets(tweets);
    console.log(`📊 聚合后话题数: ${trendItems.length}`);

    // 6. AI 分析 - 使用简化的配置对象
    const analysisConfig: DomainConfig = {
      id: groupConfig.id,
      name: `${groupConfig.name} - ${group.name}`,
      description: groupConfig.description,
      hoursAgo: groupConfig.hoursAgo,
      query: {
        enabled: false,
        keywords: [],
        hashtags: [],
        minLikes: 0,
        languages: [],
        excludeRetweets: true
      },
      kols: {
        enabled: true,
        accounts: group.accounts,
        minLikes: groupConfig.fetchConfig.minLikes,
        tweetsPerKol: groupConfig.fetchConfig.tweetsPerKol
      },
      fetchCount: 50
    };

    const rawOutput = await analyzeTrends(trendItems, analysisConfig);

    console.log('📋 正在解析 JSON 输出...');
    const data = parseAndValidateJSON(rawOutput);

    // 7. 保存报告
    const reportFilename = `${presetId}_group${group.groupId}_analysis_${dateStr}.json`;
    const reportPath = path.join(TRENDS_DIR, reportFilename);

    const finalData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        source: `domain-trends:${presetId}`,
        preset: presetId,
        presetName: groupConfig.name,
        groupId: group.groupId,
        groupName: group.name,
        kolCount: group.accounts.length,
        tweetCount: tweets.length,
        rawDataFile: rawFilename
      },
      ...data
    };

    fs.writeFileSync(reportPath, JSON.stringify(finalData, null, 2), 'utf-8');
    console.log(`✅ 分析报告已保存: ${reportPath}`);

    return {
      reportPath,
      report: JSON.stringify(finalData),
      data: finalData,
      groupId: group.groupId
    };

  } catch (error) {
    console.error('❌ Domain Trends 分组轮换执行出错:', error);
    throw error;
  }
}

/**
 * 抓取推文数据
 */
export async function fetchTweets(config: DomainConfig): Promise<DomainTweet[]> {
  const client = createTwitterApiClient();
  const allTweets: DomainTweet[] = [];
  const seenIds = new Set<string>();

  // 1. 关键词搜索（默认24小时内）- 可通过配置禁用
  const queryEnabled = config.query.enabled !== false;  // 默认启用

  if (queryEnabled) {
    const hoursAgo = config.hoursAgo ?? 24;
    const query = buildSearchQuery(config.query, hoursAgo);
    console.log(`📡 搜索查询: ${query}`);
    console.log(`⏰ 时间范围: 最近 ${hoursAgo} 小时`);

    const searchTweets = await client.search(
      query,
      config.fetchCount * 2,  // 多获取一些，因为要过滤
      config.kols.enabled ? config.kols.accounts : []
    );

    // 在代码中过滤 minLikes 和 minRetweets (API 不支持这些查询参数)
    const minLikes = config.query.minLikes || 0;
    const minRetweets = config.query.minRetweets || 0;
    let filteredCount = 0;

    for (const tweet of searchTweets) {
      if (!seenIds.has(tweet.id)) {
        // 过滤低互动推文
        if (tweet.likes >= minLikes && tweet.retweets >= minRetweets) {
          seenIds.add(tweet.id);
          allTweets.push(tweet);
          if (allTweets.length >= config.fetchCount) break;
        } else {
          filteredCount++;
        }
      }
    }

    console.log(`✅ 关键词搜索: ${searchTweets.length} 条 → 过滤后 ${allTweets.length} 条 (过滤 ${filteredCount} 条低互动)`);
  } else {
    console.log(`⏭️ 关键词搜索已禁用，跳过`);
  }

  // 2. KOL 推文抓取
  if (config.kols.enabled && config.kols.accounts.length > 0) {
    const kolTweets = await client.getKolTweets(
      config.kols.accounts,
      config.kols.tweetsPerKol,
      config.kols.minLikes
    );

    for (const tweet of kolTweets) {
      if (!seenIds.has(tweet.id)) {
        seenIds.add(tweet.id);
        allTweets.push(tweet);
      }
    }

    console.log(`✅ KOL 推文: ${kolTweets.length} 条`);
  }

  console.log(`✅ 总计: ${allTweets.length} 条唯一推文`);
  return allTweets;
}

function createTwitterApiClient(): TwitterApiClient {
  const provider = getTwitterProvider();
  return new TwitterApiClient({
    provider,
    apiKey: getTwitterApiKey(provider)
  });
}

function getTwitterProvider(): TwitterProvider {
  return process.env.TWITTER_TRENDS_PROVIDER === 'xquik' ? 'xquik' : 'twitterapi';
}

function getTwitterApiKey(provider: TwitterProvider): string {
  const envName = provider === 'xquik' ? 'XQUIK_API_KEY' : 'TWITTER_API_IO_KEY';
  const apiKey = process.env[envName];
  if (!apiKey) {
    throw new Error(`缺少环境变量 ${envName}`);
  }
  return apiKey;
}

/**
 * 聚合推文数据，生成趋势列表
 * 优先按 hashtag 聚合，如果没有 hashtag 则按 KOL 作者聚合
 */
export function aggregateTweets(tweets: DomainTweet[]): DomainTrendItem[] {
  // 先尝试按 hashtag 聚合
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

  // 如果没有 hashtag，按 KOL 作者聚合
  if (hashtagMap.size === 0) {
    console.log('⚠️ 推文没有 hashtag，按 KOL 作者聚合');
    const authorMap = new Map<string, DomainTweet[]>();

    for (const tweet of tweets) {
      if (tweet.isKol && tweet.author) {
        if (!authorMap.has(tweet.author)) {
          authorMap.set(tweet.author, []);
        }
        authorMap.get(tweet.author)!.push(tweet);
      }
    }

    // 如果还是没有，直接用全部推文
    if (authorMap.size === 0 && tweets.length > 0) {
      console.log('⚠️ 没有 KOL 推文，使用全部推文');
      // 按互动量排序，取前 15 条作为独立话题
      const sortedTweets = [...tweets].sort((a, b) =>
        (b.likes + b.retweets * 2) - (a.likes + a.retweets * 2)
      ).slice(0, 15);

      return sortedTweets.map((tweet, index) => ({
        rank: index + 1,
        topic: `@${tweet.author}`,
        engagement: tweet.likes + tweet.retweets * 2,
        tweetCount: 1,
        topTweet: tweet,
        url: tweet.url
      }));
    }

    // 用作者聚合
    for (const [author, authorTweets] of authorMap) {
      hashtagMap.set(`@${author}`, authorTweets);
    }
  }

  // 计算每个话题的热度
  const topics: AggregatedTopic[] = [];

  for (const [topic, topicTweets] of hashtagMap) {
    const totalLikes = topicTweets.reduce((sum, t) => sum + t.likes, 0);
    const totalRetweets = topicTweets.reduce((sum, t) => sum + t.retweets, 0);

    // KOL 推文加权
    const kolBonus = topicTweets.filter(t => t.isKol).length * 500;

    topics.push({
      topic,
      tweets: topicTweets,
      totalLikes,
      totalRetweets,
      engagement: totalLikes + totalRetweets * 2 + kolBonus
    });
  }

  // 排序并转换为 TrendItem
  return topics
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 15)
    .map((t, index) => ({
      rank: index + 1,
      topic: t.topic,
      engagement: t.engagement,
      tweetCount: t.tweets.length,
      topTweet: t.tweets.sort((a, b) => b.likes - a.likes)[0],
      url: t.topic.startsWith('@')
        ? `https://x.com/${t.topic.slice(1)}`
        : `https://x.com/search?q=${encodeURIComponent(t.topic)}`
    }));
}

// 存储最近一次调用的 usage 信息
let lastUsage: ClaudeUsage | null = null;

/**
 * 获取最近一次调用的 usage 信息
 */
export function getLastUsage(): ClaudeUsage | null {
  return lastUsage;
}

// JSON Schema
const JSON_SCHEMA = `
{
  "overview": "热点概览，简要总结当前领域的热门话题趋势",
  "categories": {
    "分类名称": ["话题1", "话题2"]
  },
  "suggestions": [
    {
      "rank": 1,
      "topic": "原始话题名称",
      "tweetUrl": "具体推文链接（从输入的推文链接复制）",
      "url": "X搜索链接",
      "score": "潜力评分（高/中/低）",
      "reason": "为什么这个话题有潜力（简要说明）",
      "angle": "选题角度/标题建议",
      "whyEffective": "为什么这个选题角度有效，流量潜力解释",
      "directions": ["创作方向1", "创作方向2", "创作方向3"]
    }
  ],
  "summary": "总结与建议，整体内容策略建议"
}`;

/**
 * 分析趋势
 */
export async function analyzeTrends(
  items: DomainTrendItem[],
  config: DomainConfig
): Promise<string> {
  const itemsText = items.map(item => {
    const tweet = item.topTweet;
    return `${item.rank}. ${item.topic} (互动: ${item.engagement}, 推文数: ${item.tweetCount})
   代表推文: "${tweet.text.substring(0, 100)}..." by @${tweet.author}
   推文链接: ${tweet.url}
   搜索链接: ${item.url}`;
  }).join('\n\n');

  const prompt = `你是一位内容策略专家。以下是来自 X(Twitter) 的 **${config.name}** 领域热门话题：

${itemsText}

请执行以下任务：

1. **流量潜力分析 + 选题建议**：
   - 从上述话题中筛选出 5-8 个最具病毒式传播潜力的话题
   - 关注那些能引起强烈好奇心、争议性或紧迫感的话题
   - **每个高潜力话题都必须给出具体的选题角度和创作方向**

2. **话题分类**：将所有热门话题按类别分组。

3. **内容策略总结**：针对 ${config.name} 领域提供整体内容策略建议。

====================
输出格式要求（极其重要）
====================

**必须使用 XML 标签分隔思维过程和 JSON 结果，避免解析错误**

## 格式要求

<reasoning>
你的分析过程...
- 快速浏览热门话题
- 筛选高潜力话题
- 为每个高潜力话题构思选题角度
</reasoning>

<result>
${JSON_SCHEMA}
</result>

## 注意事项
1. <result> 标签内必须是合法的 JSON 格式
2. suggestions 必须包含 5-8 个高潜力话题，每个都要有完整的选题建议
3. 每个 suggestion 必须包含: rank, topic, tweetUrl, url, score, reason, angle, whyEffective, directions
4. **tweetUrl 必须使用输入中的"推文链接"，这是具体推文的 URL**
5. categories 至少包含 3 个分类
6. 每个 suggestion 的 directions 必须是包含 2-4 个创作方向的数组
7. 不要在 <result> 标签内添加 markdown 代码块
8. 所有标点符号必须使用英文半角字符`;

  console.log('🤖 正在使用 AI 分析趋势...');
  const response = await callClaude(prompt);
  lastUsage = response.usage;
  console.log(`📊 ${formatUsageLog(response.usage)}`);
  return response.result;
}

/**
 * 解析并验证 JSON 输出
 */
function parseAndValidateJSON(output: string): any {
  const result = parseRobustJSON(output, (data) => {
    if (!data.suggestions || !Array.isArray(data.suggestions)) {
      return { valid: false, error: '缺少 suggestions 字段' };
    }
    return { valid: true };
  });

  if (!result.success) {
    console.error('JSON 解析失败:', result.error);
    throw new Error(result.error || 'JSON 解析失败');
  }

  return result.data;
}

/**
 * 主执行函数
 */
export async function run(presetId: string = 'web3'): Promise<{
  reportPath: string;
  report: string;
  data: any;
  usage?: ClaudeUsage;
}> {
  try {
    console.log(`\n🎯 开始 Domain Trends 抓取 [${presetId}]`);

    // 1. 加载配置
    const config = loadPreset(presetId);
    console.log(`📋 配置: ${config.name}`);

    // 2. 抓取推文
    const tweets = await fetchTweets(config);

    if (tweets.length === 0) {
      throw new Error('未获取到任何推文');
    }

    // 3. 保存原始数据
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const rawFilename = `${presetId}_tweets_${dateStr}.json`;
    const rawPath = path.join(TRENDS_DIR, rawFilename);

    fs.writeFileSync(rawPath, JSON.stringify(tweets, null, 2));
    console.log(`✅ 原始数据已保存: ${rawPath}`);

    // 4. 聚合数据
    const trendItems = aggregateTweets(tweets);
    console.log(`📊 聚合后话题数: ${trendItems.length}`);

    // 5. AI 分析
    const rawOutput = await analyzeTrends(trendItems, config);

    console.log('📋 正在解析 JSON 输出...');
    const data = parseAndValidateJSON(rawOutput);

    // 6. 保存报告
    const reportFilename = `${presetId}_analysis_${dateStr}.json`;
    const reportPath = path.join(TRENDS_DIR, reportFilename);

    const finalData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        source: `domain-trends:${presetId}`,
        preset: presetId,
        presetName: config.name,
        tweetCount: tweets.length,
        rawDataFile: rawFilename
      },
      ...data,
      _usage: lastUsage ? {
        inputTokens: lastUsage.inputTokens,
        outputTokens: lastUsage.outputTokens,
        cacheCreationTokens: lastUsage.cacheCreationTokens,
        cacheReadTokens: lastUsage.cacheReadTokens,
        costUsd: lastUsage.costUsd,
        durationMs: lastUsage.durationMs,
        model: lastUsage.model
      } : undefined
    };

    fs.writeFileSync(reportPath, JSON.stringify(finalData, null, 2), 'utf-8');
    console.log(`✅ 分析报告已保存: ${reportPath}`);

    return {
      reportPath,
      report: JSON.stringify(finalData),
      data: finalData,
      usage: lastUsage || undefined
    };

  } catch (error) {
    console.error('❌ Domain Trends 执行出错:', error);
    throw error;
  }
}

/**
 * 仅抓取数据（两阶段执行 - 阶段1）
 * 返回原始推文数据，供后续分析使用
 */
export async function fetchOnly(presetId: string = 'ai'): Promise<{
  tweets: DomainTweet[];
  groupId: number;
  groupName: string;
  config: GroupRotationConfig;
}> {
  console.log(`\n🎯 开始 Domain Trends 仅抓取 [${presetId}]`);

  // 1. 加载分组配置
  const groupConfig = loadGroupConfig(presetId);
  console.log(`📋 配置: ${groupConfig.name}`);

  // 2. 获取当前分组
  const currentHour = new Date().getHours();
  const group = getCurrentGroup(groupConfig, currentHour);
  console.log(`⏰ 当前时间: ${currentHour}:00, 轮换到分组 ${group.groupId}`);

  // 3. 抓取该分组的推文
  const tweets = await fetchGroupTweets(group, groupConfig);

  if (tweets.length === 0) {
    throw new Error('未获取到任何推文');
  }

  console.log(`✅ 抓取完成: ${tweets.length} 条推文`);

  return {
    tweets,
    groupId: group.groupId,
    groupName: group.name,
    config: groupConfig
  };
}

/**
 * 仅分析数据（两阶段执行 - 阶段2）
 * 使用已有的原始数据进行分析
 */
export async function analyzeOnly(
  tweets: DomainTweet[],
  presetId: string,
  groupId: number,
  groupName: string,
  groupConfig: GroupRotationConfig
): Promise<{
  reportPath: string;
  report: string;
  data: any;
}> {
  console.log(`\n🎯 开始 Domain Trends 仅分析 [${presetId}] 组${groupId}`);
  console.log(`📊 输入数据: ${tweets.length} 条推文`);

  // 1. 聚合数据
  const trendItems = aggregateTweets(tweets);
  console.log(`📊 聚合后话题数: ${trendItems.length}`);

  // 2. AI 分析 - 使用简化的配置对象
  const analysisConfig: DomainConfig = {
    id: groupConfig.id,
    name: `${groupConfig.name} - ${groupName}`,
    description: groupConfig.description,
    hoursAgo: groupConfig.hoursAgo,
    query: {
      enabled: false,
      keywords: [],
      hashtags: [],
      minLikes: 0,
      languages: [],
      excludeRetweets: true
    },
    kols: {
      enabled: true,
      accounts: [],
      minLikes: groupConfig.fetchConfig.minLikes,
      tweetsPerKol: groupConfig.fetchConfig.tweetsPerKol
    },
    fetchCount: 50
  };

  const rawOutput = await analyzeTrends(trendItems, analysisConfig);

  console.log('📋 正在解析 JSON 输出...');
  const data = parseAndValidateJSON(rawOutput);

  // 3. 保存报告
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFilename = `${presetId}_group${groupId}_analysis_${dateStr}.json`;
  const reportPath = path.join(TRENDS_DIR, reportFilename);

  const finalData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: `domain-trends:${presetId}`,
      preset: presetId,
      presetName: groupConfig.name,
      groupId: groupId,
      groupName: groupName,
      tweetCount: tweets.length
    },
    ...data
  };

  fs.writeFileSync(reportPath, JSON.stringify(finalData, null, 2), 'utf-8');
  console.log(`✅ 分析报告已保存: ${reportPath}`);

  return {
    reportPath,
    report: JSON.stringify(finalData),
    data: finalData
  };
}

// 命令行执行
if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args[0] || 'standard';  // standard, rotation, fetch, analyze-file
  const presetId = args[1] || (mode === 'rotation' || mode === 'fetch' ? 'ai' : 'web3');

  if (mode === 'fetch') {
    // 仅抓取模式（两阶段执行 - 阶段1）
    fetchOnly(presetId).then(result => {
      // 输出 JSON 供调度器解析
      console.log('__FETCH_RESULT__' + JSON.stringify({
        tweets: result.tweets,
        groupId: result.groupId,
        groupName: result.groupName,
        presetId: presetId,
        configName: result.config.name,
        configDescription: result.config.description,
        hoursAgo: result.config.hoursAgo,
        fetchConfig: result.config.fetchConfig
      }));
    }).catch(error => {
      console.error(error);
      process.exit(1);
    });
  } else if (mode === 'analyze-file') {
    // 仅分析模式（两阶段执行 - 阶段2）
    const dataFilePath = args[1];
    if (!dataFilePath || !fs.existsSync(dataFilePath)) {
      console.error('请提供有效的数据文件路径');
      process.exit(1);
    }

    const rawData = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));

    // 重建 groupConfig
    const groupConfig: GroupRotationConfig = {
      id: rawData.presetId,
      name: rawData.configName,
      description: rawData.configDescription,
      hoursAgo: rawData.hoursAgo,
      rotationIntervalHours: 2,
      totalGroups: 10,
      fetchConfig: rawData.fetchConfig,
      groups: []
    };

    analyzeOnly(
      rawData.tweets,
      rawData.presetId,
      rawData.groupId,
      rawData.groupName,
      groupConfig
    ).then(result => {
      console.log('\n📊 分析完成！');
      console.log(`报告已保存到: ${result.reportPath}`);
    }).catch(error => {
      console.error(error);
      process.exit(1);
    });
  } else if (mode === 'rotation') {
    // 分组轮换模式（原有完整流程）
    runWithRotation(presetId).then(result => {
      console.log('\n📊 分组轮换抓取完成！');
      console.log(`分组: ${result.groupId}`);
      console.log(`报告已保存到: ${result.reportPath}`);
    }).catch(error => {
      console.error(error);
      process.exit(1);
    });
  } else {
    // 传统模式
    run(presetId).then(result => {
      console.log('\n📊 分析完成！');
      console.log(`报告已保存到: ${result.reportPath}`);
    }).catch(error => {
      console.error(error);
      process.exit(1);
    });
  }
}

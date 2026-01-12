import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// 1. Define Output Paths
const projectRoot = path.resolve(__dirname, '../../');
const OUTPUT_DIR = path.join(projectRoot, 'outputs');
const TRENDS_DIR = path.join(OUTPUT_DIR, 'trends');

// Ensure directories exist
if (!fs.existsSync(TRENDS_DIR)) {
  fs.mkdirSync(TRENDS_DIR, { recursive: true });
}

interface TrendItem {
  rank: number;
  name: string;
  tweets: string;
  url: string;
  timeSlot: string;
}

const TRENDS24_URL = 'https://trends24.in/';

/**
 * Fetch trending topics from trends24.in
 */
export async function fetchTrends(): Promise<TrendItem[]> {
  console.log(`正在抓取 ${TRENDS24_URL}...`);
  const response = await fetch(TRENDS24_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch trends24: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const items: TrendItem[] = [];
  const seenNames = new Set<string>();

  // Get the latest time slot header
  let currentTimeSlot = '';

  // Find all trend cards
  $('.trend-card').each((_, card) => {
    // Get time slot from card header
    const header = $(card).find('.trend-card__header h3, .card-header-title').first();
    if (header.length) {
      currentTimeSlot = header.text().trim();
    }

    // Get trends from the list
    $(card).find('.trend-card__list li, ol li').each((index, element) => {
      const el = $(element);
      const nameLink = el.find('a').first();
      const name = nameLink.text().trim();

      // Skip empty or duplicate names
      if (!name || seenNames.has(name.toLowerCase())) {
        return;
      }
      seenNames.add(name.toLowerCase());

      // Get URL
      let url = nameLink.attr('href') || '';
      if (url && !url.startsWith('http')) {
        url = `https://x.com/search?q=${encodeURIComponent(name)}`;
      }

      // Get tweet count if available
      const tweetCount = el.find('.tweet-count, .trend-count, span').text().trim() || 'N/A';

      items.push({
        rank: items.length + 1,
        name,
        tweets: tweetCount,
        url,
        timeSlot: currentTimeSlot
      });
    });
  });

  // Alternative selectors if the above doesn't work
  if (items.length === 0) {
    $('ol li a, .trend-name a, [class*="trend"] a').each((index, element) => {
      const name = $(element).text().trim();
      if (!name || seenNames.has(name.toLowerCase())) {
        return;
      }
      seenNames.add(name.toLowerCase());

      const url = `https://x.com/search?q=${encodeURIComponent(name)}`;

      items.push({
        rank: items.length + 1,
        name,
        tweets: 'N/A',
        url,
        timeSlot: 'Recent'
      });
    });
  }

  return items;
}

/**
 * Call Claude CLI to analyze trends
 * 使用 stdin 传递 prompt，避免命令行长度限制
 */
function callClaudeCLI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['--output-format', 'text'], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Claude CLI 退出码: ${code}, stderr: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });

    // 通过 stdin 传递 prompt
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// JSON Schema 定义
const JSON_SCHEMA = `
{
  "overview": "热点概览，简要总结当前热门话题的整体趋势",
  "highPotentialTopics": [
    {
      "rank": 1,
      "topic": "话题名称",
      "score": "潜力评分（高/中/低）",
      "reason": "原因说明"
    }
  ],
  "categories": {
    "分类名称": ["话题1", "话题2"]
  },
  "suggestions": [
    {
      "topic": "原始话题",
      "angle": "选题角度/标题建议",
      "whyEffective": "为什么有效，流量潜力解释",
      "directions": ["创作方向1", "创作方向2", "创作方向3"]
    }
  ],
  "summary": "总结与建议，整体内容策略建议"
}`;

/**
 * Analyze the trends using Claude CLI
 */
export async function analyzeTrends(items: TrendItem[]): Promise<string> {
  const topItems = items.slice(0, 15); // Analyze top 15 items
  const itemsText = topItems.map(item =>
    `${item.rank}. ${item.name} (Tweets: ${item.tweets}) - ${item.url}`
  ).join('\n');

  const prompt = `你是一位内容策略专家。以下是来自 X(Twitter) 的当前热门趋势话题：

${itemsText}

请执行以下任务：

1. **流量潜力分析**：识别哪些话题具有最高的病毒式传播潜力。关注那些能引起强烈好奇心、争议性或紧迫感的话题。

2. **话题分类**：将这些热门话题按类别分组（如：科技、娱乐、政治、体育、社会热点等）。

3. **选题建议**：基于高潜力话题，为内容创作者提供 5 个具体的选题角度/标题建议。

4. **内容策略**：针对每个建议，提供简短的内容创作方向指导。

====================
输出格式要求（极其重要）
====================
你必须严格按照以下 JSON 格式输出，不要输出任何其他内容：

${JSON_SCHEMA}

注意事项：
1. 输出必须是合法的 JSON 格式
2. highPotentialTopics 至少包含 5 个高潜力话题
3. categories 至少包含 3 个分类
4. suggestions 必须包含 5 个选题建议
5. 每个 suggestion 的 directions 必须是包含 2-4 个创作方向的数组，每个方向是具体可执行的内容建议
6. 不要在 JSON 前后添加任何说明文字
7. 不要使用 markdown 代码块包裹`;

  console.log('🤖 正在使用 Claude CLI 分析趋势...');

  return await callClaudeCLI(prompt);
}

/**
 * 解析并验证 JSON 输出
 */
function parseAndValidateJSON(output: string): any {
  let jsonStr = output.trim();

  // 移除可能的 markdown 代码块
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // 找到 JSON 对象的开始和结束
  const startIndex = jsonStr.indexOf('{');
  const endIndex = jsonStr.lastIndexOf('}');
  if (startIndex !== -1 && endIndex !== -1) {
    jsonStr = jsonStr.substring(startIndex, endIndex + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // 验证必要字段
    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      throw new Error('缺少 suggestions 字段');
    }

    return parsed;
  } catch (e) {
    console.error('JSON 解析失败，原始输出:', output.substring(0, 500));
    throw new Error(`JSON 解析失败: ${e.message}`);
  }
}

/**
 * Main execution function
 */
export async function run(): Promise<{ reportPath: string; report: string; data: any }> {
  try {
    // 1. Fetch
    const items = await fetchTrends();
    console.log(`✅ 获取到 ${items.length} 条热门趋势`);

    if (items.length === 0) {
      throw new Error('未找到热门趋势数据，网站结构可能已更改。');
    }

    // 2. Save Raw Data
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const rawFilename = `x_trends_${dateStr}.json`;
    const rawPath = path.join(TRENDS_DIR, rawFilename);

    fs.writeFileSync(rawPath, JSON.stringify(items, null, 2));
    console.log(`✅ 原始数据已保存到 ${rawPath}`);

    // 3. Analyze
    const rawOutput = await analyzeTrends(items);

    console.log('📋 正在解析 JSON 输出...');
    const data = parseAndValidateJSON(rawOutput);

    // 4. Save JSON Report
    const reportFilename = `x_trends_analysis_${dateStr}.json`;
    const reportPath = path.join(TRENDS_DIR, reportFilename);

    const finalData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        source: 'trends24.in',
        rawDataFile: rawFilename,
        itemCount: items.length
      },
      ...data
    };

    fs.writeFileSync(reportPath, JSON.stringify(finalData, null, 2), 'utf-8');
    console.log(`✅ JSON 报告已保存到 ${reportPath}`);

    // 同时保存 .md 文件用于兼容旧代码
    const mdPath = reportPath.replace('.json', '.md');
    fs.writeFileSync(mdPath, JSON.stringify(finalData, null, 2), 'utf-8');

    return { reportPath: mdPath, report: JSON.stringify(finalData), data: finalData };

  } catch (error) {
    console.error('❌ 执行 X Trends Skill 出错:', error);
    throw error;
  }
}

// Allow running directly
if (require.main === module) {
  run().then(result => {
    console.log('\n📊 分析完成！');
    console.log(`报告已保存到: ${result.reportPath}`);
  }).catch(error => {
    process.exit(1);
  });
}

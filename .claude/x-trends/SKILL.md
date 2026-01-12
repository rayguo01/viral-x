---
name: x-trends
description: 获取并分析 X(Twitter) 平台 24 小时热门趋势，提供内容创作灵感。
---

# X Trends Analysis Skill

这个 Skill 用于自动化获取 trends24.in 的 X(Twitter) 热榜数据，并利用 Claude 分析当前最具传播潜力的热点话题，为内容创作者提供选题建议。

## 功能描述

1. **Fetch Hot List**: 抓取 trends24.in 的 24 小时热门趋势数据。
2. **Analyze Trends**: 使用 Claude 模型分析前 15 个热点，识别高流量潜力的话题。
3. **Generate Report**: 生成包含选题建议的 Markdown 报告。

## 使用方法

### 通过 Web 界面

在主界面工具栏点击「X 趋势」按钮，即可自动执行分析并在对话界面显示结果。

### 运行脚本

```bash
# 在项目根目录下运行
npx ts-node .claude/x-trends/x-trends.ts
```

### 输出结果

脚本运行后，会在 `outputs/trends/` 目录下生成两个文件：

1. `x_trends_[timestamp].json`: 原始热榜数据。
2. `x_trends_analysis_[timestamp].md`: Claude 生成的分析报告。

## 数据来源

- **trends24.in**: 实时追踪 X(Twitter) 全球趋势，提供 24 小时热门话题数据。

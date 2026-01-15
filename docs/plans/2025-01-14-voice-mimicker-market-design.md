# 语气模仿器市场功能设计

## 概述

将语气模仿器从简单的"个人/公共"模式升级为完整的"市场"模式，支持用户自主开放、订阅机制、市场浏览等功能。

## 核心需求

1. **市场模式**: 用户可自主将模仿器开放到市场
2. **订阅机制**: 用户可订阅市场中的模仿器，自动同步更新
3. **撤回机制**: 开放者可随时撤回，撤回时断开所有订阅关系
4. **隐私保护**: 市场中只展示 Role 和 Core Traits，不暴露完整 prompt

## 数据库设计

### 修改 `voice_prompts` 表

```sql
ALTER TABLE voice_prompts ADD COLUMN IF NOT EXISTS role VARCHAR(200);
ALTER TABLE voice_prompts ADD COLUMN IF NOT EXISTS core_traits TEXT;
ALTER TABLE voice_prompts ADD COLUMN IF NOT EXISTS subscriber_count INTEGER DEFAULT 0;
-- is_public 字段已存在，语义变更为"是否开放到市场"
```

### 新增 `voice_prompt_subscriptions` 表

```sql
CREATE TABLE IF NOT EXISTS voice_prompt_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    prompt_id INTEGER REFERENCES voice_prompts(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, prompt_id)
);
```

## API 设计

### 市场相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/tools/voice-prompts/market | 获取市场列表，支持 sort=usage/latest/subscribers |
| POST | /api/tools/voice-prompts/:id/publish | 开放到市场 |
| POST | /api/tools/voice-prompts/:id/unpublish | 从市场撤回（级联删除订阅） |

### 订阅相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/tools/voice-prompts/:id/subscribe | 订阅 |
| DELETE | /api/tools/voice-prompts/:id/subscribe | 取消订阅 |
| GET | /api/tools/voice-prompts/subscribed | 我订阅的列表 |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/tools/voice-prompts/mine | 我创建的列表 |
| GET | /api/tools/voice-prompts/available | 内容生成时获取三列数据 |

## 前端路由

```
#voice-mimicker           → 重定向到 market
#voice-mimicker/market    → 市场页面
#voice-mimicker/mine      → 我的生成器页面
```

## 页面结构

### 统一布局（PC/手机）

```
┌─────────────────────────────────────┐
│  ← 返回    语气模仿器                │
├─────────────────────────────────────┤
│   [ 市场 ]    [ 我的生成器 ]         │  顶部 Tab
├─────────────────────────────────────┤
│         子页面内容区                 │
└─────────────────────────────────────┘
```

### 市场页面

- 排序选择器（使用量 / 最新 / 订阅数）
- 模仿器卡片：头像、用户名、Role、Core Traits、使用量、订阅数
- 操作按钮：订阅 / 已订阅

### 我的生成器页面

- 模仿器卡片 + is_public 状态标签
- 操作按钮：开放市场 / 撤回 / 删除 / 重新分析
- 底部：创建新生成器按钮

### 内容生成时选择器

三列布局，空列显示引导提示：
1. 市场热门 Top 5
2. 我创建的（引导：去创建）
3. 我订阅的（引导：去市场订阅）

## 生成器输出调整

AI 生成 prompt 时，额外提取并返回：
- `role`: 角色定位（如 "The Cynical Developer"）
- `coreTraits`: 核心特质数组

## 决策记录

| 问题 | 决策 |
|------|------|
| 订阅同步方式 | 自动同步，订阅是引用关系 |
| 撤回处理 | 可撤回，断开所有订阅关系 |
| 展示信息存储 | 单独存储 role 和 core_traits 字段 |
| 导航方式 | PC/手机统一使用顶部 Tab 栏 |
| 空列处理 | 保留占位，显示引导提示 |
| 市场排序 | 可切换：使用量/最新/订阅数 |
| 订阅数统计 | 冗余字段 subscriber_count |

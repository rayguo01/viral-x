# Token 使用统计功能设计

## 需求概述

- **用户视角**：在"我的"页面查看个人消耗统计
- **管理员视角**：独立管理后台查看全局统计和用户列表
- **时间维度**：支持按天/周/月筛选
- **统计粒度**：工作流步骤 → 具体 Skill（两层结构）
- **管理员判定**：users.is_admin 字段

---

## 数据库设计

### 新增表：token_usage

```sql
CREATE TABLE token_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES post_tasks(id) ON DELETE SET NULL,

    -- 调用信息
    workflow_step VARCHAR(30),      -- trends/content/optimize/image
    skill_id VARCHAR(100),          -- x-trends/content-writer/viral-verification 等
    model VARCHAR(100),             -- claude-opus-4-5-20251101

    -- Token 统计
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_creation_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,

    -- 费用
    cost_usd DECIMAL(12, 8) DEFAULT 0,

    -- 性能数据
    duration_ms INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_token_usage_user ON token_usage(user_id);
CREATE INDEX idx_token_usage_created ON token_usage(created_at);
CREATE INDEX idx_token_usage_skill ON token_usage(skill_id);
CREATE INDEX idx_token_usage_step ON token_usage(workflow_step);
```

### 修改表：users

```sql
ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
```

---

## 后端 API 设计

### 用户统计 API

```
GET /api/stats/my
```

Query 参数：
- `period`: day | week | month（默认 month）
- `start_date`: 开始日期（可选）
- `end_date`: 结束日期（可选）

返回：
```json
{
  "summary": {
    "total_cost_usd": 1.234,
    "total_input_tokens": 50000,
    "total_output_tokens": 10000,
    "total_requests": 42
  },
  "by_step": [
    {
      "workflow_step": "content",
      "cost_usd": 0.8,
      "request_count": 15,
      "skills": [
        { "skill_id": "content-writer", "cost_usd": 0.8, "request_count": 15 }
      ]
    }
  ],
  "by_date": [
    { "date": "2026-01-15", "cost_usd": 0.5, "request_count": 10 }
  ]
}
```

### 管理员 API

```
GET /api/admin/stats/overview
```

返回全局统计：总用户数、总消耗、活跃用户等。

```
GET /api/admin/stats/users
```

Query 参数：
- `search`: 用户名搜索
- `sort`: cost_desc | cost_asc | requests_desc（默认 cost_desc）
- `page`, `limit`: 分页

返回用户列表及消耗摘要。

```
GET /api/admin/stats/users/:userId
```

返回单用户详细统计（与 /api/stats/my 结构相同）。

---

## 数据采集实现

### 修改 Skill 脚本调用方式

当前 Skill 脚本使用 `--output-format text`，需改为 `--output-format json`：

```typescript
// .claude/content-writer/content-writer.ts 示例修改

const child = spawn('claude', [
  '--output-format', 'json',  // 改为 json
  '--allowedTools', 'WebSearch,WebFetch'
], options);

// 解析返回的 JSON
const result = JSON.parse(output);

// 提取内容
const content = result.result;

// 提取 usage 信息供后续记录
const usage = {
  input_tokens: result.usage?.input_tokens || 0,
  output_tokens: result.usage?.output_tokens || 0,
  cache_creation_tokens: result.usage?.cache_creation_input_tokens || 0,
  cache_read_tokens: result.usage?.cache_read_input_tokens || 0,
  cost_usd: result.total_cost_usd || 0,
  duration_ms: result.duration_ms || 0,
  model: Object.keys(result.modelUsage || {})[0] || 'unknown'
};
```

### 新增服务：tokenUsageDb.js

```javascript
// src/services/tokenUsageDb.js

async function recordUsage({
  userId,
  taskId,
  workflowStep,
  skillId,
  model,
  inputTokens,
  outputTokens,
  cacheCreationTokens,
  cacheReadTokens,
  costUsd,
  durationMs
}) {
  await pool.query(`
    INSERT INTO token_usage (
      user_id, task_id, workflow_step, skill_id, model,
      input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
      cost_usd, duration_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [userId, taskId, workflowStep, skillId, model,
      inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens,
      costUsd, durationMs]);
}

async function getUserStats(userId, { startDate, endDate }) {
  // 汇总查询
}

async function getAdminOverview() {
  // 全局统计
}

async function getAdminUserList({ search, sort, page, limit }) {
  // 用户列表
}
```

### 在 tasks.js 中记录用量

```javascript
// src/routes/tasks.js - execute-step 端点

// 执行 Skill 后
const skillResult = await executeSkill(skillId, input);

// 记录 token 使用
await tokenUsageDb.recordUsage({
  userId: req.user.id,
  taskId: id,
  workflowStep: step,
  skillId: skillId,
  model: skillResult.usage?.model,
  inputTokens: skillResult.usage?.input_tokens,
  outputTokens: skillResult.usage?.output_tokens,
  cacheCreationTokens: skillResult.usage?.cache_creation_tokens,
  cacheReadTokens: skillResult.usage?.cache_read_tokens,
  costUsd: skillResult.usage?.cost_usd,
  durationMs: skillResult.usage?.duration_ms
});
```

---

## 前端设计

### 用户个人页面 - 消耗统计卡片

位置：`public/js/generator/pages/profile.js`（我的页面）

```
┌─────────────────────────────────────────┐
│  我的消耗统计           [本月 ▼]        │
├─────────────────────────────────────────┤
│  总费用        总请求数       Token 消耗 │
│  $1.23         42 次         60,000     │
├─────────────────────────────────────────┤
│  按步骤分布                              │
│  ┌─────────┬─────────┬────────┐         │
│  │ 内容生成 │ 爆款优化 │ 趋势   │         │
│  │ $0.80   │ $0.30   │ $0.13  │         │
│  │ 65%     │ 24%     │ 11%    │         │
│  └─────────┴─────────┴────────┘         │
└─────────────────────────────────────────┘
```

### 管理后台页面

新增文件：`public/admin.html` + `public/js/admin/`

```
┌──────────────────────────────────────────────────────────┐
│  管理后台                              [rayguo] [退出]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  全局概览                    [本周 ▼]                    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │
│  │ $12.34 │ │ 156 次 │ │ 8 人   │ │ 500K   │            │
│  │ 总费用  │ │ 总请求 │ │活跃用户│ │ Tokens │            │
│  └────────┘ └────────┘ └────────┘ └────────┘            │
│                                                          │
│  用户消耗排行               [搜索用户...]                │
│  ┌────┬──────────┬────────┬────────┬────────┐           │
│  │ #  │ 用户名    │ 请求数  │ 费用    │ 操作   │           │
│  ├────┼──────────┼────────┼────────┼────────┤           │
│  │ 1  │ user_a   │ 50     │ $5.00  │ [详情] │           │
│  │ 2  │ user_b   │ 40     │ $4.00  │ [详情] │           │
│  │ 3  │ user_c   │ 30     │ $2.00  │ [详情] │           │
│  └────┴──────────┴────────┴────────┴────────┘           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

用户详情弹窗/页面：展示与"我的消耗统计"相同的结构。

---

## 文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/services/tokenUsageDb.js` | Token 使用数据库服务 |
| `src/routes/stats.js` | 用户统计 API |
| `src/routes/admin.js` | 管理员 API |
| `src/middleware/adminAuth.js` | 管理员权限中间件 |
| `public/admin.html` | 管理后台页面 |
| `public/js/admin/index.js` | 管理后台主逻辑 |
| `public/css/admin.css` | 管理后台样式 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/config/database.js` | 新增 token_usage 表、users.is_admin 字段 |
| `src/server.js` | 注册 stats、admin 路由 |
| `src/routes/tasks.js` | 执行 Skill 后记录 usage |
| `.claude/*//*.ts` | 所有 Skill 改为 --output-format json |
| `public/js/generator/pages/profile.js` | 添加消耗统计卡片 |

---

## 实施步骤

1. **数据库变更**：新增 token_usage 表和 is_admin 字段
2. **后端服务**：创建 tokenUsageDb.js
3. **改造 Skill 脚本**：统一使用 JSON 输出并返回 usage 信息
4. **修改 tasks.js**：调用后记录 usage
5. **用户统计 API**：创建 /api/stats 路由
6. **管理员 API**：创建 /api/admin 路由 + 权限中间件
7. **用户前端**：profile.js 添加统计卡片
8. **管理后台前端**：创建 admin.html 及相关 JS
9. **设置初始管理员**：UPDATE users SET is_admin = TRUE WHERE username = 'rayguo'

---

## 注意事项

1. **Skill 脚本改造**：需要同时修改返回值结构，确保 usage 信息能传回 tasks.js
2. **向后兼容**：老数据没有 usage 记录，统计时需处理
3. **精度问题**：cost_usd 使用 DECIMAL(12,8) 保证计费精度
4. **性能**：token_usage 表数据量会快速增长，需定期归档或建立分区

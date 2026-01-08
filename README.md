# Web Claude Code

一个基于 Node.js 的 Claude CLI Web 界面，通过 WebSocket 实现实时流式输出。

## 功能特性

- **用户系统** - 注册/登录，JWT 认证
- **多会话管理** - 创建、切换、删除对话
- **实时流式输出** - WebSocket 推送，打字机效果
- **上下文保持** - 支持多轮对话，自动恢复会话
- **进程池架构** - Claude CLI 长运行，响应更快
- **移动端适配** - 响应式设计，触摸手势支持

## 系统架构

```
┌─────────────┐     WebSocket      ┌─────────────┐    stdin/stdout   ┌─────────────┐
│   浏览器    │ ←───────────────→  │  Node.js    │ ←───────────────→ │ Claude CLI  │
│  (前端)     │    实时通信         │   服务器    │    stream-json    │  (进程池)   │
└─────────────┘                    └─────────────┘                   └─────────────┘
                                          ↓
                                   ┌─────────────┐
                                   │ PostgreSQL  │
                                   │   (Neon)    │
                                   └─────────────┘
```

## 技术栈

- **后端**: Node.js, Express, WebSocket (ws)
- **数据库**: PostgreSQL (Neon)
- **认证**: JWT (jsonwebtoken)
- **CLI**: Claude Code CLI (stream-json 模式)
- **前端**: 原生 HTML/CSS/JavaScript

## 前置要求

- Node.js >= 18
- Claude CLI 已安装并配置
- PostgreSQL 数据库 (推荐 [Neon](https://neon.tech))

### 安装 Claude CLI

```bash
# macOS
brew install claude

# 或使用 npm
npm install -g @anthropic-ai/claude-code

# 验证安装
claude --version
```

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/rayguo01/web_cc.git
cd web_cc
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
JWT_SECRET=your-secret-key-here
PORT=3000
```

### 4. 启动服务

```bash
# 生产模式
npm start

# 开发模式 (热重载)
npm run dev
```

### 5. 访问应用

打开浏览器访问 http://localhost:3000

## 项目结构

```
web-cc/
├── docs/                    # 文档
│   ├── summary.md          # 项目概要
│   ├── 技术方案.md          # 技术设计文档
│   └── 启动说明.md          # 详细部署指南
├── public/                  # 静态资源
│   ├── index.html          # 单页应用
│   ├── css/style.css       # 样式文件
│   └── js/app.js           # 前端逻辑
├── src/                     # 后端代码
│   ├── server.js           # 服务器入口
│   ├── config/database.js  # 数据库配置
│   ├── middleware/auth.js  # JWT 中间件
│   ├── routes/auth.js      # 认证 API
│   ├── routes/sessions.js  # 会话 API
│   ├── services/claude.js  # Claude 进程池
│   └── websocket/handler.js # WebSocket 处理
├── .env.example            # 环境变量示例
├── package.json
└── README.md
```

## API 接口

### REST API

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |
| GET | /api/sessions | 获取会话列表 |
| DELETE | /api/sessions/:id | 删除会话 |
| GET | /api/sessions/:id/messages | 获取会话消息 |

### WebSocket 消息

**客户端 → 服务器**:
```json
{"type": "message", "sessionId": "uuid", "content": "你好"}
```

**服务器 → 客户端**:
```json
{"type": "session_created", "sessionId": "uuid"}
{"type": "start"}
{"type": "stream", "content": "部分响应..."}
{"type": "done", "sessionId": "uuid"}
{"type": "error", "message": "错误信息"}
```

## 进程池架构

项目采用进程池模式管理 Claude CLI，避免每次请求都启动新进程：

- **每个会话一个进程** - 通过 stdin/stdout 持续通信
- **自动复用** - 同一会话内的请求复用进程
- **空闲清理** - 5分钟无活动自动关闭
- **会话恢复** - 进程关闭后通过 `--resume` 恢复上下文

```javascript
// 配置参数 (src/services/claude.js)
maxIdleTime: 5 * 60 * 1000,  // 空闲超时时间
maxProcesses: 10              // 最大进程数
```

## 前端设计

### 主题: 晨曦微风

- **配色**: 薄荷绿 (#10b981) + 天蓝 (#0ea5e9)
- **字体**: Quicksand
- **效果**: 毛玻璃、渐变、动画

### 移动端优化

- 抽屉式侧边栏
- 触摸手势 (滑动开关侧边栏)
- iPhone 安全区域适配
- 键盘弹出自适应

## 数据库表结构

```sql
-- 用户表
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 会话表
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(100),
    claude_session_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 消息表
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id),
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

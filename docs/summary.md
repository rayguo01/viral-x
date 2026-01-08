# Web Claude Code 项目概要

## 版本: v1.4.0

## 完成的工作

### 1. 技术方案设计
- 设计了系统架构：浏览器 ↔ WebSocket ↔ Node.js ↔ Claude CLI
- 确定技术栈：Express + WebSocket + PostgreSQL (Neon)
- 设计了数据库表结构（users, sessions, messages）
- 定义了 REST API 和 WebSocket 消息协议

### 2. 后端实现
- `src/server.js` - 主服务器入口
- `src/config/database.js` - 数据库连接和初始化
- `src/routes/auth.js` - 用户注册/登录 API
- `src/routes/sessions.js` - 会话管理 API
- `src/services/claude.js` - Claude CLI 调用服务
- `src/websocket/handler.js` - WebSocket 消息处理
- `src/middleware/auth.js` - JWT 认证中间件

### 3. 前端实现
- `public/index.html` - 单页应用主页面
- `public/css/style.css` - 清新主题样式（晨曦微风）
- `public/js/app.js` - 前端应用逻辑

### 3.1 前端美化 (v1.1.0)
**设计理念**：「晨曦微风」- 清晨的薄雾、露珠般的透明感、清新自然的色调

**配色方案**：
- 背景：淡绿白渐变 (#f0fdf4 → #ecfeff)
- 主色调：薄荷绿 (#10b981)
- 辅助色：天蓝 (#0ea5e9)
- 表面：毛玻璃白 (rgba(255, 255, 255, 0.85))

**字体**：Quicksand - 圆润、友好、现代的无衬线字体

**视觉特效**：
- 毛玻璃效果 (Glassmorphism)
- 柔和的渐变背景装饰
- 平滑的 CSS 过渡动画
- 消息气泡滑入动画
- 流式输出光标闪烁效果
- 按钮悬浮和光泽效果
- 发送按钮加载旋转动画

**UI 改进**：
- 登录页面居中布局，优化表单设计
- 侧边栏毛玻璃效果
- 会话列表渐变高亮
- 消息气泡圆角设计
- AI 消息带表情图标
- 代码块深色主题
- 响应式设计优化

### 3.2 移动端优化 (v1.2.0)

**响应式断点**：
- 平板 (≤900px)：侧边栏收窄、消息气泡加宽
- 手机 (≤768px)：抽屉式侧边栏、顶部导航栏
- 小屏手机 (≤375px)：紧凑布局
- 横屏模式：特殊适配

**移动端导航**：
- 顶部固定导航栏（汉堡菜单 + 标题 + 新对话按钮）
- 抽屉式侧边栏（85% 宽度，最大 320px）
- 遮罩层点击关闭

**触摸交互优化**：
- 所有可交互元素最小 44px 触摸目标
- 从左边缘右滑打开侧边栏
- 侧边栏内左滑关闭
- 选择会话后自动关闭侧边栏
- 发送消息后自动收起键盘
- 防止 iOS 双击缩放

**安全区域适配**：
- 支持 iPhone X 及以上刘海屏
- 使用 env(safe-area-inset-*) 适配
- 动态视口高度 (100dvh) 适配地址栏

**输入体验**：
- 移动端 Enter 键换行（使用按钮发送）
- 桌面端 Enter 发送，Shift+Enter 换行
- 输入框最小 16px 字体防止 iOS 缩放
- 键盘弹出时自动调整输入区域位置
- 输入框高度自动调整（移动端最大 120px）

**性能优化**：
- 触摸设备禁用 hover 效果
- 使用 requestAnimationFrame 优化滚动
- 平滑滚动到最新消息
- passive 事件监听器

**PWA 准备**：
- 添加 apple-mobile-web-app-capable
- 添加 theme-color
- 禁用电话号码自动检测
- 禁用用户缩放

### 3.3 Claude CLI 服务架构 (v1.4.0)

**架构设计**：每次请求启动新进程，通过 `--resume` 保持会话上下文。

```
用户发消息 → spawn claude -p "消息" --resume <session_id> → 流式输出 → 进程退出
```

**核心组件**：
- `ClaudeService` - Claude CLI 调用服务（单例）

**特性**：
- 简单可靠的进程管理
- 通过 `--resume` 参数恢复会话上下文
- 流式 JSON 输出 (`--output-format stream-json`)
- 2分钟超时保护
- session_id 持久化到数据库

**通信协议**：
```bash
# 命令格式
claude -p "用户消息" --output-format stream-json --resume <session_id>

# 输出 (stdout, 每行一个 JSON)
{"type":"assistant","message":{"content":[{"type":"text","text":"回复"}]},"session_id":"xxx"}
{"type":"result","session_id":"xxx",...}
```

**会话恢复**：
- 每次请求返回 session_id
- session_id 保存到数据库 sessions.claude_session_id
- 下次请求使用 `--resume <session_id>` 恢复上下文

### 4. 核心功能
- 用户注册/登录（JWT 认证）
- 多会话管理
- 实时流式输出
- 会话上下文保持（通过 Claude CLI --resume）
- 对话历史持久化

### 5. 文档编写
- `docs/启动说明.md` - Claude Code CLI 安装配置及项目部署指南

### 6. 自动化浏览器测试
使用 Chrome DevTools Protocol 进行自动化测试，验证结果：

| 测试项 | 状态 | 说明 |
|--------|------|------|
| 页面加载 | ✅ 通过 | 登录页面正确显示 |
| 用户注册 | ✅ 通过 | 成功创建用户并跳转到聊天页面 |
| 用户登录 | ✅ 通过 | 刷新页面后保持登录状态 |
| 会话创建 | ✅ 通过 | 新对话正确创建并显示在侧边栏 |
| 消息发送 | ✅ 通过 | 用户消息正确显示 |
| 流式输出 | ✅ 通过 | 显示加载动画等待响应 |
| 会话管理 | ✅ 通过 | 多会话切换、历史消息加载 |

**注意**: Claude CLI 响应速度取决于 API 并发限制和网络状况

## 目录结构

```
web-cc/
├── docs/
│   ├── 需求.md
│   ├── 技术方案.md
│   ├── 启动说明.md
│   └── summary.md
├── src/
│   ├── server.js
│   ├── config/database.js
│   ├── routes/auth.js
│   ├── routes/sessions.js
│   ├── services/claude.js
│   ├── middleware/auth.js
│   └── websocket/handler.js
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── package.json
├── .env
└── .gitignore
```

## 启动方式

```bash
# 安装依赖
npm install

# 启动服务器
npm start

# 开发模式（热重载）
npm run dev
```

访问 http://localhost:3000

## 依赖条件
- Node.js >= 18
- Claude CLI 已安装并配置
- Neon 数据库已配置

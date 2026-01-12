const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
    const client = await pool.connect();
    try {
        // 创建用户表
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建会话表
        await client.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                claude_session_id VARCHAR(100),
                title VARCHAR(255) DEFAULT '新对话',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建消息表
        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建帖子生成任务表
        await client.query(`
            CREATE TABLE IF NOT EXISTS post_tasks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                current_step VARCHAR(30) NOT NULL DEFAULT 'trends',
                workflow_config JSONB DEFAULT '{"steps":["trends","content","optimize","image","submit"]}',
                trends_data JSONB,
                content_data JSONB,
                optimize_data JSONB,
                image_data JSONB,
                final_content TEXT,
                final_image_path VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            )
        `);

        // 创建帖子历史记录表
        await client.query(`
            CREATE TABLE IF NOT EXISTS post_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                task_id INTEGER REFERENCES post_tasks(id) ON DELETE SET NULL,
                trend_source VARCHAR(30),
                trend_topic VARCHAR(500),
                final_content TEXT NOT NULL,
                final_image_path VARCHAR(500),
                viral_score INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建索引
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_post_tasks_user_status ON post_tasks(user_id, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_post_tasks_updated_at ON post_tasks(updated_at)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_post_history_user ON post_history(user_id)
        `);

        console.log('数据库表初始化完成');
    } finally {
        client.release();
    }
}

module.exports = { pool, initDatabase };

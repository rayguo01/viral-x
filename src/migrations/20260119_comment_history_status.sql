-- 评论历史添加状态字段，支持手动评论功能
-- status: 'pending' 待评论, 'completed' 已完成

-- 添加 status 字段
ALTER TABLE comment_history
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';

-- 添加 is_auto 字段（标记是否为自动评论）
ALTER TABLE comment_history
ADD COLUMN IF NOT EXISTS is_auto BOOLEAN DEFAULT true;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_comment_history_status ON comment_history(status);
CREATE INDEX IF NOT EXISTS idx_comment_history_user_status ON comment_history(user_id, status);

-- 大V列表添加权重字段（如果还没有）
ALTER TABLE comment_kol_list
ADD COLUMN IF NOT EXISTS weight INTEGER DEFAULT 100;

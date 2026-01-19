-- 评论设置添加手动评论开关
ALTER TABLE comment_settings
ADD COLUMN IF NOT EXISTS manual_enabled BOOLEAN DEFAULT false;

-- 添加速率限制字段到 comment_settings 表
-- 用于记录 Twitter API 429 错误后的限制解除时间

ALTER TABLE comment_settings
ADD COLUMN IF NOT EXISTS rate_limit_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN comment_settings.rate_limit_until IS 'Twitter API 速率限制解除时间，429 错误时设置';

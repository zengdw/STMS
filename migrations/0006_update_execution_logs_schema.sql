-- 更新 execution_logs 表结构
-- 1. 添加 log_type 字段
-- 2. 使 task_id 可为空（用于系统日志和审计日志）

-- 创建新表
CREATE TABLE execution_logs_new (
  id TEXT PRIMARY KEY,
  task_id TEXT, -- 可为空
  log_type TEXT NOT NULL DEFAULT 'execution' CHECK (log_type IN ('execution', 'system', 'audit')),
  execution_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  response_time INTEGER,
  status_code INTEGER,
  error_message TEXT,
  details TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- 迁移数据
-- 注意：旧数据中 'system_error' 和 'audit_log' 的 task_id 需要特殊处理
-- 先迁移普通任务日志
INSERT INTO execution_logs_new (id, task_id, log_type, execution_time, status, response_time, status_code, error_message, details)
SELECT id, task_id, 'execution', execution_time, status, response_time, status_code, error_message, details
FROM execution_logs
WHERE task_id NOT IN ('system_error', 'audit_log');

-- 迁移系统错误日志 (task_id = 'system_error')
INSERT INTO execution_logs_new (id, task_id, log_type, execution_time, status, response_time, status_code, error_message, details)
SELECT id, NULL, 'system', execution_time, status, response_time, status_code, error_message, details
FROM execution_logs
WHERE task_id = 'system_error';

-- 迁移审计日志 (task_id = 'audit_log')
INSERT INTO execution_logs_new (id, task_id, log_type, execution_time, status, response_time, status_code, error_message, details)
SELECT id, NULL, 'audit', execution_time, status, response_time, status_code, error_message, details
FROM execution_logs
WHERE task_id = 'audit_log';

-- 尝试迁移其他可能存在的日志（即使违反了FK，如果有的话）
-- 假设前面的 WHERE 子句覆盖了所有情况。

-- 删除旧表
DROP TABLE execution_logs;

-- 重命名新表
ALTER TABLE execution_logs_new RENAME TO execution_logs;

-- 创建索引
CREATE INDEX idx_execution_logs_task_id ON execution_logs(task_id);
CREATE INDEX idx_execution_logs_log_type ON execution_logs(log_type);
CREATE INDEX idx_execution_logs_execution_time ON execution_logs(execution_time);
CREATE INDEX idx_execution_logs_status ON execution_logs(status);

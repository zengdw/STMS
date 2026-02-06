// Cloudflare Worker环境类型定义
export interface Environment {
  DB: D1Database;
  ENVIRONMENT: string;
  JWT_SECRET: string;
}

// 用户模型
export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  created_at: string;
  updated_at: string;
}

// 任务配置类型
export interface KeepaliveConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeout: number;
}

export interface NotificationConfig {
  message: string;
  title?: string;
  priority?: 'low' | 'normal' | 'high';
  notifyxConfig: NotifyXConfig;
}

export interface NotifyXConfig {
  apiKey: string;
  channelId: string;
  message: string;
  title?: string;
  priority?: 'low' | 'normal' | 'high';
  recipients?: string[];
}

// 任务模型
export interface Task {
  id: string;
  name: string;
  type: 'keepalive' | 'notification';
  schedule: string;
  config: KeepaliveConfig | NotificationConfig;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_executed?: string;
  last_status?: 'success' | 'failure';
}

// 执行日志模型
export interface ExecutionLog {
  id: string;
  task_id: string;
  execution_time: string;
  status: 'success' | 'failure';
  response_time?: number;
  status_code?: number;
  error_message?: string;
  details?: string;
}

// 通知设置模型
export interface NotificationSettings {
  id: string;
  user_id: string;
  email_enabled: boolean;
  email_address?: string;
  webhook_enabled: boolean;
  webhook_url?: string;
  failure_threshold: number;
  created_at: string;
  updated_at: string;
}

// 执行结果
export interface ExecutionResult {
  success: boolean;
  responseTime?: number;
  statusCode?: number;
  error?: string;
  timestamp: Date;
}

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 认证相关类型
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

// 任务筛选器
export interface TaskFilter {
  type?: 'keepalive' | 'notification';
  enabled?: boolean;
  created_by?: string;
}

// 日志筛选器
export interface LogFilter {
  taskId?: string;
  taskType?: 'keepalive' | 'notification';
  status?: 'success' | 'failure';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}
// 前端类型定义

// 用户相关类型
export interface User {
  id: string
  username: string
  role: 'admin' | 'user'
  createdAt: string
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface AuthResult {
  success: boolean
  token?: string
  user?: User
  error?: string
}

// 任务相关类型
export type TaskType = 'keepalive' | 'notification'
export type TaskStatus = 'success' | 'failure'

export interface KeepaliveConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: string
  timeout: number
}

export interface NotificationConfig {
  message: string
  title: string
  executionRule?: ExecutionRule
}

export interface Task {
  id: string
  name: string
  type: TaskType
  cronExpression?: string
  config: KeepaliveConfig | NotificationConfig
  enabled: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  last_executed?: string
  last_status?: TaskStatus
}

export interface TaskConfig {
  name: string
  type: TaskType
  config: KeepaliveConfig | NotificationConfig
  enabled: boolean
  cronExpression?: string
}

export interface TaskFilter {
  type?: TaskType
  enabled?: boolean
  search?: string
}

// 日志相关类型
export interface LogEntry {
  id: string
  taskId: string
  taskName?: string
  taskType?: TaskType
  logType: 'execution' | 'system' | 'audit'
  action?: string
  resourceType?: string
  executionTime: string
  status: TaskStatus
  responseTime?: number
  statusCode?: number
  errorMessage?: string
  details?: string
}

export interface LogFilter {
  taskId?: string
  logType?: 'execution' | 'system' | 'audit'
  taskType?: TaskType
  status?: TaskStatus
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export interface SystemStatus {
  timestamp: string
  uptime: number
  tasks: {
    total: number
    active: number
    inactive: number
    keepalive: number
    notification: number
  }
  executions: {
    total: number
    successCount: number
    failureCount: number
    last24h: number
    successRate: number
    averageResponseTime: number
  }
  database: {
    healthy: boolean
    tables: Record<string, number>
  }
  errors: {
    last24h: number
    recentErrors: Array<{
      code: string
      message: string
      timestamp: string
    }>
  }
  anomalies?: Array<{
    type: string
    severity: string
    message: string
    timestamp: string
  }>
  health: 'healthy' | 'degraded' | 'critical'
}

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  total?: number
  error?: string
  message?: string
}

// 通知设置类型
export interface ExecutionRule {
  type: 'interval'
  unit: 'day' | 'month' | 'year'
  interval: number
  startDate: string
  endDate?: string
  reminderAdvanceValue?: number
  reminderAdvanceUnit?: 'day' | 'hour'
  autoRenew?: boolean
  nextDueDate?: string
}

// ... existing code ...

// NotificationSettings
export interface NotificationSettings {
  id: string
  userId: string
  emailEnabled: boolean
  emailAddress?: string
  emailApiKey?: string
  emailFrom?: string
  emailName?: string
  webhookEnabled: boolean
  webhookUrl?: string
  notifyxEnabled: boolean
  notifyxApiKey?: string
  failureThreshold: number
  allowedTimeSlots?: string
  createdAt: string
  updatedAt: string
}

// 修改密码请求类型
export interface ChangePasswordData {
  oldPassword: string
  newPassword: string
}

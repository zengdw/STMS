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

export interface KeepaliveConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: string
  timeout: number
  executionRule?: ExecutionRule
}

export interface NotifyXConfig {
  apiKey: string
  channelId: string
  message: string
  title?: string
  priority?: 'low' | 'normal' | 'high'
  recipients?: string[]
}

export interface NotificationConfig {
  message: string
  title?: string
  priority?: 'low' | 'normal' | 'high'
  notifyxConfig: NotifyXConfig
  executionRule?: ExecutionRule
}

export interface Task {
  id: string
  name: string
  type: TaskType
  schedule: string
  config: KeepaliveConfig | NotificationConfig
  enabled: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  lastExecuted?: string
  lastStatus?: TaskStatus
}

export interface TaskConfig {
  name: string
  type: TaskType
  schedule: string
  config: KeepaliveConfig | NotificationConfig
  enabled: boolean
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
  executionTime: string
  status: TaskStatus
  responseTime?: number
  statusCode?: number
  errorMessage?: string
  details?: string
}

export interface LogFilter {
  taskId?: string
  taskType?: TaskType
  status?: TaskStatus
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

// 系统状态相关类型
export interface SystemStatus {
  healthy: boolean
  activeTasksCount: number
  totalExecutions: number
  successRate: number
  lastExecutionTime?: string
}

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
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

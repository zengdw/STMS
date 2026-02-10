// API 客户端
import type {
  LoginCredentials,
  AuthResult,
  Task,
  TaskConfig,
  TaskFilter,
  LogEntry,
  LogFilter,
  SystemStatus,
  ApiResponse
} from '@/types'

// API 基础配置
const API_BASE_URL = '/api'

// 获取认证令牌
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}

// 设置认证令牌
function setAuthToken(token: string): void {
  localStorage.setItem('auth_token', token)
}

// 清除认证令牌
function clearAuthToken(): void {
  localStorage.removeItem('auth_token')
}

// 通用请求函数
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || '请求失败'
      }
    }

    return {
      success: true,
      data: data.data || data
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络错误'
    }
  }
}

// 认证 API
export const authApi = {
  // 登录
  async login(credentials: LoginCredentials): Promise<ApiResponse<AuthResult>> {
    const response = await request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    })

    if (response.success && response.data?.token) {
      setAuthToken(response.data.token)
    }

    return response
  },

  // 注销
  async logout(): Promise<void> {
    clearAuthToken()
    await request('/auth/logout', { method: 'POST' })
  },

  // 验证令牌（使用 /auth/me 接口）
  async validateToken(): Promise<ApiResponse<{ valid: boolean; user?: any }>> {
    const response = await request<{ user: any }>('/auth/me', { method: 'GET' })
    if (response.success && response.data?.user) {
      return { success: true, data: { valid: true, user: response.data.user } }
    }
    return { success: false, data: { valid: false } }
  },

  // 刷新令牌
  async refreshToken(): Promise<ApiResponse<{ token: string }>> {
    const response = await request<{ token: string }>('/auth/refresh', {
      method: 'POST'
    })

    if (response.success && response.data?.token) {
      setAuthToken(response.data.token)
    }

    return response
  }
}

// 任务 API
export const taskApi = {
  // 获取任务列表
  async getTasks(filter?: TaskFilter): Promise<ApiResponse<Task[]>> {
    const params = new URLSearchParams()
    if (filter?.type) params.append('type', filter.type)
    if (filter?.enabled !== undefined) params.append('enabled', String(filter.enabled))
    if (filter?.search) params.append('search', filter.search)

    const query = params.toString()
    return request<Task[]>(`/tasks${query ? `?${query}` : ''}`)
  },

  // 获取单个任务
  async getTask(id: string): Promise<ApiResponse<Task>> {
    return request<Task>(`/tasks/${id}`)
  },

  // 创建任务
  async createTask(task: TaskConfig): Promise<ApiResponse<Task>> {
    return request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(task)
    })
  },

  // 更新任务
  async updateTask(id: string, task: Partial<TaskConfig>): Promise<ApiResponse<Task>> {
    return request<Task>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(task)
    })
  },

  // 删除任务
  async deleteTask(id: string): Promise<ApiResponse<void>> {
    return request<void>(`/tasks/${id}`, {
      method: 'DELETE'
    })
  },

  // 切换任务状态
  async toggleTask(id: string): Promise<ApiResponse<Task>> {
    return request<Task>(`/tasks/${id}/toggle`, {
      method: 'PATCH'
    })
  }
}

// 日志 API
export const logApi = {
  // 获取日志列表
  async getLogs(filter?: LogFilter): Promise<ApiResponse<LogEntry[]>> {
    const params = new URLSearchParams()
    if (filter?.taskId) params.append('taskId', filter.taskId)
    if (filter?.taskType) params.append('taskType', filter.taskType)
    if (filter?.status) params.append('status', filter.status)
    if (filter?.startDate) params.append('startDate', filter.startDate)
    if (filter?.endDate) params.append('endDate', filter.endDate)
    if (filter?.limit) params.append('limit', String(filter.limit))
    if (filter?.offset) params.append('offset', String(filter.offset))

    const query = params.toString()
    return request<LogEntry[]>(`/logs${query ? `?${query}` : ''}`)
  },

  // 导出日志
  async exportLogs(filter?: LogFilter): Promise<Blob | null> {
    const params = new URLSearchParams()
    if (filter?.taskId) params.append('taskId', filter.taskId)
    if (filter?.taskType) params.append('taskType', filter.taskType)
    if (filter?.status) params.append('status', filter.status)
    if (filter?.startDate) params.append('startDate', filter.startDate)
    if (filter?.endDate) params.append('endDate', filter.endDate)

    const query = params.toString()
    const token = getAuthToken()

    try {
      const response = await fetch(`${API_BASE_URL}/logs/export${query ? `?${query}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })

      if (!response.ok) return null
      return await response.blob()
    } catch {
      return null
    }
  }
}

// 系统状态 API
export const systemApi = {
  // 获取系统状态
  async getStatus(): Promise<ApiResponse<SystemStatus>> {
    return request<SystemStatus>('/health')
  }
}

// 设置 API
export const settingsApi = {
  // 修改密码
  async changePassword(data: { oldPassword: string; newPassword: string }): Promise<ApiResponse<void>> {
    return request<void>('/settings/password', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  // 获取通知设置
  async getNotificationSettings(): Promise<ApiResponse<any>> {
    return request<any>('/settings/notifications')
  },

  // 更新通知设置
  async updateNotificationSettings(data: any): Promise<ApiResponse<any>> {
    return request<any>('/settings/notifications', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },

  // 获取已启用的通知渠道
  async getEnabledChannels(): Promise<ApiResponse<string[]>> {
    return request<string[]>('/settings/notifications/channels')
  },

  // 测试通知
  testNotification: async (channel?: 'email' | 'webhook' | 'notifyx'): Promise<ApiResponse<any>> => {
    return request<any>('/settings/notifications/test', {
      method: 'POST',
      body: JSON.stringify({ channel })
    })
  }
}

export { getAuthToken, setAuthToken, clearAuthToken }

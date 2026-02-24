// 日志状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { logApi } from '@/api/client'
import type { LogEntry, LogFilter } from '@/types'

export const useLogsStore = defineStore('logs', () => {
  // 状态
  const logs = ref<LogEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const filter = ref<LogFilter>({
    limit: 20,
    offset: 0
  })
  const totalCount = ref(0)
  const logStats = ref<{
    totalLogs: number
    successCount: number
    failureCount: number
    executionLogs: number
    errorLogs: number
    auditLogs: number
  } | null>(null)

  // 计算属性 - 基于全局统计数据
  const totalLogsCount = computed(() =>
    logStats.value?.totalLogs ?? totalCount.value
  )

  const successCount = computed(() =>
    logStats.value?.successCount ?? 0
  )

  const failureCount = computed(() =>
    logStats.value?.failureCount ?? 0
  )

  const successRate = computed(() => {
    const total = totalLogsCount.value
    if (total === 0) return 0
    return (successCount.value / total) * 100
  })

  // 保留原有的分页内计算属性（其他地方可能用到）
  const successLogs = computed(() =>
    logs.value.filter(log => log.status === 'success')
  )

  const failureLogs = computed(() =>
    logs.value.filter(log => log.status === 'failure')
  )

  const hasMore = computed(() => {
    const currentOffset = filter.value.offset || 0
    const currentLimit = filter.value.limit || 50
    return logs.value.length >= currentLimit && (currentOffset + currentLimit) < totalCount.value
  })

  // 获取日志列表
  async function fetchLogs(filterOptions?: LogFilter): Promise<void> {
    loading.value = true
    error.value = null

    try {
      const mergedFilter = { ...filter.value, ...filterOptions }
      const response = await logApi.getLogs(mergedFilter)

      if (response.success && response.data) {
        logs.value = response.data
        totalCount.value = response.total ?? response.data.length
      } else {
        error.value = response.error || '获取日志列表失败'
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取日志列表失败'
    } finally {
      loading.value = false
    }
  }

  // 获取日志统计信息（全局）
  async function fetchLogStats(): Promise<void> {
    try {
      const response = await logApi.getLogStats()
      if (response.success && response.data) {
        logStats.value = response.data
      }
    } catch (err) {
      // 统计获取失败不影响主流程
      console.error('获取日志统计失败:', err)
    }
  }

  // 导出日志
  async function exportLogs(filterOptions?: LogFilter): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const mergedFilter = { ...filter.value, ...filterOptions }
      const blob = await logApi.exportLogs(mergedFilter)

      if (blob) {
        // 创建下载链接
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `logs-${new Date().toISOString()}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        return true
      } else {
        error.value = '导出日志失败'
        return false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '导出日志失败'
      return false
    } finally {
      loading.value = false
    }
  }

  // 设置筛选条件
  function setFilter(newFilter: LogFilter): void {
    filter.value = { ...filter.value, ...newFilter }
    // 重置偏移量
    if (newFilter.taskId !== undefined ||
      newFilter.logType !== undefined ||
      newFilter.taskType !== undefined ||
      newFilter.status !== undefined ||
      newFilter.startDate !== undefined ||
      newFilter.endDate !== undefined) {
      filter.value.offset = 0
    }
  }

  // 清除错误
  function clearError(): void {
    error.value = null
  }

  // 刷新日志
  async function refresh(): Promise<void> {
    filter.value.offset = 0
    await fetchLogs()
  }

  return {
    // 状态
    logs,
    loading,
    error,
    filter,
    totalCount,
    logStats,
    // 计算属性
    totalLogsCount,
    successCount,
    failureCount,
    successLogs,
    failureLogs,
    successRate,
    hasMore,
    // 方法
    fetchLogs,
    fetchLogStats,
    exportLogs,
    setFilter,
    clearError,
    refresh
  }
})

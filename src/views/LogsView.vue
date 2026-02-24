<template>
  <AppLayout>
    <div class="logs-view">
      <div class="logs-header">
        <h1>日志查看</h1>
        <div class="header-actions">
          <button @click="refreshLogs" class="btn-refresh" :disabled="logsStore.loading">
            刷新
          </button>
          <button @click="exportLogs" class="btn-export" :disabled="logsStore.loading">
            导出日志
          </button>
        </div>
      </div>

      <!-- 筛选器 -->
      <div class="filters">
        <div class="filter-group">
          <label>日志类型：</label>
          <select v-model="filterLogType" @change="applyFilters">
            <option value="">全部</option>
            <option value="execution">执行日志</option>
            <option value="system">系统日志</option>
            <option value="audit">审计日志</option>
          </select>
        </div>
        <div v-if="!filterLogType || filterLogType === 'execution'" class="filter-group">
          <label>任务类型：</label>
          <select v-model="filterTaskType" @change="applyFilters">
            <option value="">全部</option>
            <option value="keepalive">保活任务</option>
            <option value="notification">通知任务</option>
          </select>
        </div>
        <div class="filter-group">
          <label>状态：</label>
          <select v-model="filterStatus" @change="applyFilters">
            <option value="">全部</option>
            <option value="success">成功</option>
            <option value="failure">失败</option>
          </select>
        </div>
        <div class="filter-group">
          <label>开始日期：</label>
          <input v-model="filterStartDate" type="datetime-local" @change="applyFilters" />
        </div>
        <div class="filter-group">
          <label>结束日期：</label>
          <input v-model="filterEndDate" type="datetime-local" @change="applyFilters" />
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="stats">
        <div class="stat-card">
          <div class="stat-label">总日志数</div>
          <div class="stat-value">{{ logsStore.totalLogsCount }}</div>
        </div>
        <div class="stat-card success">
          <div class="stat-label">成功</div>
          <div class="stat-value">{{ logsStore.successCount }}</div>
        </div>
        <div class="stat-card failure">
          <div class="stat-label">失败</div>
          <div class="stat-value">{{ logsStore.failureCount }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">成功率</div>
          <div class="stat-value">{{ logsStore.successRate.toFixed(1) }}%</div>
        </div>
      </div>

      <!-- 日志列表 -->
      <div v-if="logsStore.loading && logsStore.logs.length === 0" class="loading">
        加载中...
      </div>
      <div v-else-if="logsStore.error" class="error">
        {{ logsStore.error }}
      </div>
      <div v-else-if="logsStore.logs.length === 0" class="empty">
        暂无日志记录
      </div>
      <div v-else class="logs-list">
        <div v-for="log in logsStore.logs" :key="log.id" class="log-card" :class="log.status"
          @click="showLogDetail(log)">
          <div class="log-header">
            <div class="log-info">
              <span class="log-status" :class="log.status">
                {{ log.status === 'success' ? '✓ 成功' : '✗ 失败' }}
              </span>
              <span class="log-type-badge" :class="log.logType">
                {{ formatLogType(log.logType) }}
              </span>

              <template v-if="log.logType === 'audit'">
                <span class="log-action">{{ log.action }}</span>
                <span v-if="log.resourceType" class="log-resource">
                  ({{ log.resourceType }})
                </span>
              </template>

              <template v-else>
                <span class="log-task-name">{{ log.taskName || log.taskId }}</span>
                <span v-if="log.taskType" class="log-task-type" :class="log.taskType">
                  {{ log.taskType === 'keepalive' ? '保活' : '通知' }}
                </span>
              </template>
            </div>
            <div class="log-time">{{ formatDate(log.executionTime) }}</div>
          </div>
          <div class="log-details">
            <div v-if="log.responseTime" class="log-detail">
              <span class="label">响应时间：</span>
              <span>{{ log.responseTime }}ms</span>
            </div>
            <div v-if="log.statusCode" class="log-detail">
              <span class="label">状态码：</span>
              <span>{{ log.statusCode }}</span>
            </div>
            <div v-if="log.errorMessage" class="log-detail error-msg">
              <span class="label">错误：</span>
              <span>{{ log.errorMessage }}</span>
            </div>
          </div>
        </div>

        <!-- 分页控件 -->
        <div class="pagination">
          <div class="pagination-info">
            显示 {{ startIndex }} - {{ endIndex }} 条，共 {{ logsStore.totalCount }} 条
          </div>
          <div class="pagination-controls">
            <button @click="goToFirstPage" :disabled="currentPage === 1 || logsStore.loading" class="btn-page">
              首页
            </button>
            <button @click="goToPreviousPage" :disabled="currentPage === 1 || logsStore.loading" class="btn-page">
              上一页
            </button>
            <div class="page-numbers">
              <button v-for="page in visiblePages" :key="page" @click="goToPage(page)"
                :class="['btn-page-number', { active: page === currentPage }]" :disabled="logsStore.loading">
                {{ page }}
              </button>
            </div>
            <button @click="goToNextPage" :disabled="currentPage === totalPages || logsStore.loading" class="btn-page">
              下一页
            </button>
            <button @click="goToLastPage" :disabled="currentPage === totalPages || logsStore.loading" class="btn-page">
              末页
            </button>
          </div>
          <div class="pagination-size">
            <label>每页显示：</label>
            <select v-model.number="pageSize" @change="changePageSize">
              <option :value="20">20 条</option>
              <option :value="50">50 条</option>
              <option :value="100">100 条</option>
            </select>
          </div>
        </div>
      </div>

      <!-- 日志详情模态框 -->
      <LogDetailModal v-if="selectedLog" :log="selectedLog" @close="selectedLog = null" />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import LogDetailModal from '@/components/LogDetailModal.vue'
import { useLogsStore } from '@/stores/logs'
import type { LogEntry } from '@/types'

const logsStore = useLogsStore()

const filterLogType = ref('')
const filterTaskType = ref('')
const filterStatus = ref('')
const filterStartDate = ref('')
const filterEndDate = ref('')
const selectedLog = ref<LogEntry | null>(null)
const currentPage = ref(1)
const pageSize = ref(20)

// 分页计算
const totalPages = computed(() => {
  return Math.ceil(logsStore.totalCount / pageSize.value) || 1
})

const startIndex = computed(() => {
  return (currentPage.value - 1) * pageSize.value + 1
})

const endIndex = computed(() => {
  const end = currentPage.value * pageSize.value
  return Math.min(end, logsStore.totalCount)
})

const visiblePages = computed(() => {
  const pages: number[] = []
  const maxVisible = 5
  let start = Math.max(1, currentPage.value - Math.floor(maxVisible / 2))
  let end = Math.min(totalPages.value, start + maxVisible - 1)

  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1)
  }

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  return pages
})

onMounted(async () => {
  await Promise.all([
    logsStore.fetchLogs(),
    logsStore.fetchLogStats()
  ])
})

function applyFilters() {
  currentPage.value = 1
  logsStore.setFilter({
    logType: filterLogType.value as any,
    taskType: filterTaskType.value as any,
    status: filterStatus.value as any,
    startDate: filterStartDate.value || undefined,
    endDate: filterEndDate.value || undefined,
    limit: pageSize.value,
    offset: 0
  })
  logsStore.fetchLogs()
}

async function refreshLogs() {
  currentPage.value = 1
  await logsStore.refresh()
}

async function exportLogs() {
  await logsStore.exportLogs()
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return
  currentPage.value = page
  logsStore.setFilter({
    limit: pageSize.value,
    offset: (page - 1) * pageSize.value
  })
  logsStore.fetchLogs()
}

function goToFirstPage() {
  goToPage(1)
}

function goToPreviousPage() {
  goToPage(currentPage.value - 1)
}

function goToNextPage() {
  goToPage(currentPage.value + 1)
}

function goToLastPage() {
  goToPage(totalPages.value)
}

function changePageSize() {
  currentPage.value = 1
  logsStore.setFilter({
    limit: pageSize.value,
    offset: 0
  })
  logsStore.fetchLogs()
}

function showLogDetail(log: LogEntry) {
  selectedLog.value = log
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN')
}

function formatLogType(type: string): string {
  const map: Record<string, string> = {
    execution: '执行',
    system: '系统',
    audit: '审计'
  }
  return map[type] || type
}
</script>

<style scoped>
.logs-view {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.logs-header h1 {
  margin: 0;
  font-size: 1.75rem;
  color: #1a202c;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-refresh,
.btn-export {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh {
  background: #4299e1;
  color: white;
}

.btn-refresh:hover:not(:disabled) {
  background: #3182ce;
}

.btn-export {
  background: #48bb78;
  color: white;
}

.btn-export:hover:not(:disabled) {
  background: #38a169;
}

.btn-refresh:disabled,
.btn-export:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.filters {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
  padding: 1.5rem;
  background: #f7fafc;
  border-radius: 8px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-group label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #4a5568;
  white-space: nowrap;
}

.filter-group select,
.filter-group input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.stat-card {
  padding: 0.5rem 1.5rem;
  background: #f7fafc;
  border-radius: 8px;
  border-left: 4px solid #4299e1;
}

.stat-card.success {
  border-left-color: #48bb78;
}

.stat-card.failure {
  border-left-color: #e53e3e;
}

.stat-label {
  font-size: 0.9rem;
  color: #718096;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #1a202c;
}

.loading,
.error,
.empty {
  text-align: center;
  padding: 3rem;
  color: #718096;
  font-size: 1.1rem;
}

.error {
  color: #e53e3e;
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.log-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.log-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.log-card.success {
  border-left: 4px solid #48bb78;
}

.log-card.failure {
  border-left: 4px solid #e53e3e;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.log-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.log-status {
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
}

.log-status.success {
  background: #c6f6d5;
  color: #22543d;
}

.log-status.failure {
  background: #fed7d7;
  color: #742a2a;
}

.log-task-name {
  font-weight: 600;
  color: #1a202c;
}

.log-task-type {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.log-task-type.keepalive {
  background: #bee3f8;
  color: #2c5282;
}

.log-task-type.notification {
  background: #fbd38d;
  color: #7c2d12;
}

.log-type-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.log-type-badge.execution {
  background: #e2e8f0;
  color: #2d3748;
}

.log-type-badge.system {
  background: #fed7d7;
  color: #822727;
}

.log-type-badge.audit {
  background: #e9d8fd;
  color: #553c9a;
}

.log-action {
  font-weight: 600;
  color: #2b6cb0;
}

.log-resource {
  color: #718096;
  font-size: 0.9rem;
}

.log-time {
  font-size: 0.85rem;
  color: #718096;
}

.log-details {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.log-detail {
  display: flex;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.log-detail .label {
  font-weight: 600;
  color: #4a5568;
}

.log-detail.error-msg {
  color: #e53e3e;
  flex-basis: 100%;
}

.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2rem;
  padding: 1.5rem;
  background: #f7fafc;
  border-radius: 8px;
  flex-wrap: wrap;
  gap: 1rem;
}

.pagination-info {
  font-size: 0.9rem;
  color: #4a5568;
  font-weight: 500;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-page {
  padding: 0.5rem 1rem;
  background: white;
  color: #4a5568;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-page:hover:not(:disabled) {
  background: #edf2f7;
  border-color: #cbd5e0;
}

.btn-page:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-numbers {
  display: flex;
  gap: 0.25rem;
}

.btn-page-number {
  padding: 0.5rem 0.75rem;
  background: white;
  color: #4a5568;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 40px;
}

.btn-page-number:hover:not(:disabled) {
  background: #edf2f7;
  border-color: #cbd5e0;
}

.btn-page-number.active {
  background: #4299e1;
  color: white;
  border-color: #4299e1;
}

.btn-page-number:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-size {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pagination-size label {
  font-size: 0.9rem;
  color: #4a5568;
  font-weight: 500;
}

.pagination-size select {
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  background: white;
  cursor: pointer;
}

@media (max-width: 768px) {
  .logs-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .filters {
    flex-direction: column;
  }

  .log-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .pagination {
    flex-direction: column;
    align-items: stretch;
  }

  .pagination-controls {
    flex-wrap: wrap;
    justify-content: center;
  }

  .pagination-info,
  .pagination-size {
    justify-content: center;
  }
}
</style>

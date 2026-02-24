<template>
  <AppLayout>
    <div class="dashboard-view">
      <div class="dashboard-header">
        <h1>系统仪表板</h1>
        <button @click="refreshData" class="btn-refresh" :disabled="loading">
          {{ loading ? '刷新中...' : '刷新数据' }}
        </button>
      </div>

      <!-- 系统状态卡片 -->
      <div class="status-cards">
        <div class="status-card">
          <div class="card-icon healthy">
            <span>✓</span>
          </div>
          <div class="card-content">
            <div class="card-label">系统状态</div>
            <div class="card-value" :class="{ healthy: systemStore.status?.health === 'healthy' }">
              {{ systemStore.status?.health === 'healthy' ? '正常' : '异常' }}
            </div>
          </div>
        </div>

        <div class="status-card">
          <div class="card-icon tasks">
            <span>📋</span>
          </div>
          <div class="card-content">
            <div class="card-label">活跃任务</div>
            <div class="card-value">
              {{ systemStore.status?.tasks?.active || 0 }}
            </div>
          </div>
        </div>

        <div class="status-card">
          <div class="card-icon executions">
            <span>⚡</span>
          </div>
          <div class="card-content">
            <div class="card-label">总执行次数</div>
            <div class="card-value">
              {{ systemStore.totalExecutions }}
            </div>
          </div>
        </div>

        <div class="status-card">
          <div class="card-icon success-rate">
            <span>📊</span>
          </div>
          <div class="card-content">
            <div class="card-label">成功率</div>
            <div class="card-value">
              {{ (systemStore.status?.executions?.successRate || 0).toFixed(1) }}%
            </div>
          </div>
        </div>
      </div>

      <!-- 任务统计 -->
      <div class="stats-section">
        <h2>任务统计</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-header">
              <h3>任务总数</h3>
              <span class="stat-value">{{ tasksStore.tasks.length }}</span>
            </div>
            <div class="stat-breakdown">
              <div class="stat-item">
                <span class="label">保活任务：</span>
                <span class="value">{{ tasksStore.keepaliveTasks.length }}</span>
              </div>
              <div class="stat-item">
                <span class="label">通知任务：</span>
                <span class="value">{{ tasksStore.notificationTasks.length }}</span>
              </div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-header">
              <h3>任务状态</h3>
              <span class="stat-value">{{ tasksStore.enabledTasks.length }}/{{ tasksStore.tasks.length }}</span>
            </div>
            <div class="stat-breakdown">
              <div class="stat-item">
                <span class="label">已启用：</span>
                <span class="value success">{{ tasksStore.enabledTasks.length }}</span>
              </div>
              <div class="stat-item">
                <span class="label">已禁用：</span>
                <span class="value disabled">{{ tasksStore.disabledTasks.length }}</span>
              </div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-header">
              <h3>执行统计</h3>
              <span class="stat-value">{{ systemStore.totalExecutions }}</span>
            </div>
            <div class="stat-breakdown">
              <div class="stat-item">
                <span class="label">成功：</span>
                <span class="value success">{{ executionSuccessCount }}</span>
              </div>
              <div class="stat-item">
                <span class="label">失败：</span>
                <span class="value failure">{{ executionFailureCount }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 最近执行的任务 -->
      <div class="recent-section">
        <h2>最近执行的任务</h2>
        <div v-if="recentTasks.length === 0" class="empty">
          暂无最近执行记录
        </div>
        <div v-else class="recent-list">
          <div v-for="task in recentTasks" :key="task.id" class="recent-item" @click="goToTask(task.id)">
            <div class="recent-info">
              <div class="recent-name">{{ task.name }}</div>
              <div class="recent-meta">
                <span class="task-type" :class="task.type">
                  {{ task.type === 'keepalive' ? '保活' : '通知' }}
                </span>
                <span v-if="task.last_executed" class="recent-time">
                  {{ formatDate(task.last_executed) }}
                </span>
              </div>
            </div>
            <div v-if="task.last_status" class="recent-status" :class="task.last_status">
              {{ task.last_status === 'success' ? '✓ 成功' : '✗ 失败' }}
            </div>
          </div>
        </div>
      </div>

      <!-- 最近日志 -->
      <div class="logs-section">
        <div class="section-header">
          <h2>最近日志</h2>
          <router-link to="/logs" class="view-all">查看全部 →</router-link>
        </div>
        <div v-if="recentLogs.length === 0" class="empty">
          暂无日志记录
        </div>
        <div v-else class="logs-list">
          <div v-for="log in recentLogs" :key="log.id" class="log-item" :class="log.status">
            <div class="log-status" :class="log.status">
              {{ log.status === 'success' ? '✓' : '✗' }}
            </div>
            <div class="log-info">
              <div class="log-task">{{ log.taskName || log.taskId }}</div>
              <div class="log-time">{{ formatDate(log.executionTime) }}</div>
            </div>
            <div v-if="log.responseTime" class="log-response">
              {{ log.responseTime }}ms
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import { useSystemStore } from '@/stores/system'
import { useTasksStore } from '@/stores/tasks'
import { useLogsStore } from '@/stores/logs'

const router = useRouter()
const systemStore = useSystemStore()
const tasksStore = useTasksStore()
const logsStore = useLogsStore()

const loading = ref(false)

// 最近执行的任务（有执行记录的任务，按最后执行时间排序）
const recentTasks = computed(() => {
  return tasksStore.tasks
    .filter(task => task.last_executed)
    .sort((a, b) => {
      const dateA = new Date(a.last_executed!).getTime()
      const dateB = new Date(b.last_executed!).getTime()
      return dateB - dateA
    })
    .slice(0, 5)
})

// 最近的日志（前10条）
const recentLogs = computed(() => {
  return logsStore.logs.slice(0, 10)
})

// 执行统计 - 基于 systemStore 的执行数据（仅执行日志）
const executionSuccessCount = computed(() => {
  const total = systemStore.totalExecutions
  const rate = systemStore.status?.executions?.successRate || 0
  return Math.round(total * rate / 100)
})

const executionFailureCount = computed(() => {
  return systemStore.totalExecutions - executionSuccessCount.value
})

onMounted(async () => {
  await refreshData()
})

async function refreshData() {
  loading.value = true
  try {
    await Promise.all([
      systemStore.fetchStatus(),
      tasksStore.fetchTasks(),
      logsStore.fetchLogs({ limit: 10, logType: 'execution' })
    ])
  } finally {
    loading.value = false
  }
}

function goToTask(taskId: string) {
  router.push('/tasks')
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // 小于1分钟
  if (diff < 60000) {
    return '刚刚'
  }
  // 小于1小时
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`
  }
  // 小于24小时
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`
  }
  // 超过24小时
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.dashboard-view {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.dashboard-header h1 {
  margin: 0;
  font-size: 1.75rem;
  color: #1a202c;
}

.btn-refresh {
  padding: 0.75rem 1.5rem;
  background: #4299e1;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  background: #3182ce;
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem;
  background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;
}

.status-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
}

.card-icon {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 1.75rem;
}

.card-icon.healthy {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
}

.card-icon.tasks {
  background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
}

.card-icon.executions {
  background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%);
}

.card-icon.success-rate {
  background: linear-gradient(135deg, #9f7aea 0%, #805ad5 100%);
}

.card-content {
  flex: 1;
}

.card-label {
  font-size: 0.9rem;
  color: #718096;
  margin-bottom: 0.5rem;
}

.card-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #1a202c;
}

.card-value.healthy {
  color: #38a169;
}

.stats-section,
.recent-section,
.logs-section {
  margin-bottom: 3rem;
}

.stats-section h2,
.recent-section h2,
.logs-section h2 {
  margin: 0 0 1.5rem 0;
  font-size: 1.25rem;
  color: #1a202c;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  padding: 1.5rem;
  background: #f7fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #e2e8f0;
}

.stat-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #4a5568;
  font-weight: 600;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a202c;
}

.stat-breakdown {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.95rem;
}

.stat-item .label {
  color: #718096;
}

.stat-item .value {
  font-weight: 600;
  color: #1a202c;
}

.stat-item .value.success {
  color: #38a169;
}

.stat-item .value.failure {
  color: #e53e3e;
}

.stat-item .value.disabled {
  color: #a0aec0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.view-all {
  color: #4299e1;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  transition: color 0.2s;
}

.view-all:hover {
  color: #3182ce;
}

.empty {
  text-align: center;
  padding: 2rem;
  color: #a0aec0;
  font-size: 0.95rem;
}

.recent-list,
.logs-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.recent-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: #f7fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.2s;
}

.recent-item:hover {
  background: #edf2f7;
  transform: translateX(4px);
}

.recent-info {
  flex: 1;
}

.recent-name {
  font-weight: 600;
  color: #1a202c;
  margin-bottom: 0.5rem;
}

.recent-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
}

.task-type {
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-weight: 600;
}

.task-type.keepalive {
  background: #bee3f8;
  color: #2c5282;
}

.task-type.notification {
  background: #fbd38d;
  color: #7c2d12;
}

.recent-time {
  color: #a0aec0;
}

.recent-status {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.9rem;
}

.recent-status.success {
  background: #c6f6d5;
  color: #22543d;
}

.recent-status.failure {
  background: #fed7d7;
  color: #742a2a;
}

.log-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f7fafc;
  border-radius: 8px;
  border-left: 4px solid transparent;
}

.log-item.success {
  border-left-color: #48bb78;
}

.log-item.failure {
  border-left-color: #e53e3e;
}

.log-status {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 700;
  font-size: 1.1rem;
}

.log-status.success {
  background: #c6f6d5;
  color: #22543d;
}

.log-status.failure {
  background: #fed7d7;
  color: #742a2a;
}

.log-info {
  flex: 1;
}

.log-task {
  font-weight: 600;
  color: #1a202c;
  margin-bottom: 0.25rem;
}

.log-time {
  font-size: 0.85rem;
  color: #a0aec0;
}

.log-response {
  font-size: 0.9rem;
  color: #718096;
  font-weight: 600;
}

@media (max-width: 768px) {
  .dashboard-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .status-cards {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>

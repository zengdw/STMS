<template>
  <AppLayout>
    <div class="tasks-view">
      <div class="tasks-header">
        <h1>任务管理</h1>
        <button @click="showCreateModal = true" class="btn-primary">
          创建任务
        </button>
      </div>

      <!-- 筛选器 -->
      <div class="filters">
        <div class="filter-group">
          <label>任务类型：</label>
          <select v-model="filterType" @change="applyFilters">
            <option value="">全部</option>
            <option value="keepalive">保活任务</option>
            <option value="notification">通知任务</option>
          </select>
        </div>
        <div class="filter-group">
          <label>状态：</label>
          <select v-model="filterEnabled" @change="applyFilters">
            <option value="">全部</option>
            <option value="true">已启用</option>
            <option value="false">已禁用</option>
          </select>
        </div>
        <div class="filter-group">
          <label>搜索：</label>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索任务名称..."
            @input="applyFilters"
          />
        </div>
      </div>

      <!-- 任务列表 -->
      <div v-if="tasksStore.loading" class="loading">加载中...</div>
      <div v-else-if="tasksStore.error" class="error">
        {{ tasksStore.error }}
      </div>
      <div v-else-if="tasksStore.filteredTasks.length === 0" class="empty">
        暂无任务
      </div>
      <div v-else class="tasks-list">
        <div
          v-for="task in tasksStore.filteredTasks"
          :key="task.id"
          class="task-card"
          :class="{ disabled: !task.enabled }"
        >
          <div class="task-header">
            <div class="task-info">
              <h3>{{ task.name }}</h3>
              <span class="task-type" :class="task.type">
                {{ task.type === 'keepalive' ? '保活任务' : '通知任务' }}
              </span>
              <span class="status-badge" :class="{ enabled: task.enabled, disabled: !task.enabled }">
                {{ task.enabled ? '已启用' : '已禁用' }}
              </span>
            </div>
            <div class="task-actions">
              <button @click="editTask(task)" class="btn-edit">编辑</button>
              <button @click="deleteTaskConfirm(task)" class="btn-delete">
                删除
              </button>
            </div>
          </div>
          <div class="task-details">
            <div class="detail-item" v-if="!task.config?.executionRule">
              <span class="label">执行计划：</span>
              <span>{{ task.schedule }}</span>
            </div>
            
            <!-- Periodic Task Details -->
            <template v-if="task.config?.executionRule">
              <div class="detail-item">
                <span class="label">开始日期：</span>
                <span>{{ formatDate(task.config.executionRule.startDate) }}</span>
              </div>
              <div class="detail-item">
                <span class="label">到期日期：</span>
                <span>{{ formatDate(task.config.executionRule.nextDueDate || calculateDueDate(task.config.executionRule)) }}</span>
              </div>
              <div class="detail-item" v-if="task.config.executionRule.reminderAdvanceValue !== undefined">
                <span class="label">提前天数：</span>
                <span>
                  {{ task.config.executionRule.reminderAdvanceValue }} 
                  {{ task.config.executionRule.reminderAdvanceUnit === 'hour' ? '小时' : '天' }}
                </span>
              </div>
            </template>

            <div v-if="task.lastExecuted" class="detail-item">
              <span class="label">最后执行：</span>
              <span>{{ formatDateTime(task.lastExecuted) }}</span>
            </div>
            <div v-if="task.lastStatus" class="detail-item">
              <span class="label">最后状态：</span>
              <span class="status" :class="task.lastStatus">
                {{ task.lastStatus === 'success' ? '成功' : '失败' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 创建/编辑任务模态框 -->
      <TaskModal
        v-if="showCreateModal || showEditModal"
        :task="editingTask"
        @close="closeModal"
        @save="handleSaveTask"
      />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import TaskModal from '@/components/TaskModal.vue'
import { useTasksStore } from '@/stores/tasks'
import type { Task } from '@/types'

const tasksStore = useTasksStore()

const showCreateModal = ref(false)
const showEditModal = ref(false)
const editingTask = ref<Task | null>(null)

const filterType = ref('')
const filterEnabled = ref('')
const searchQuery = ref('')

onMounted(async () => {
  await tasksStore.fetchTasks()
})

function applyFilters() {
  tasksStore.setFilter({
    type: filterType.value as any,
    enabled: filterEnabled.value ? filterEnabled.value === 'true' : undefined,
    search: searchQuery.value
  })
}

async function toggleTaskStatus(task: Task) {
  await tasksStore.toggleTask(task.id)
}

function editTask(task: Task) {
  editingTask.value = task
  showEditModal.value = true
}

async function deleteTaskConfirm(task: Task) {
  if (confirm(`确定要删除任务"${task.name}"吗？`)) {
    await tasksStore.deleteTask(task.id)
  }
}

async function handleSaveTask() {
  await tasksStore.fetchTasks()
  closeModal()
}

function closeModal() {
  showCreateModal.value = false
  showEditModal.value = false
  editingTask.value = null
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN')
}

function formatDate(dateString: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN')
}

function calculateDueDate(rule: any): string {
  if (!rule.startDate) return ''
  
  const start = new Date(rule.startDate)
  const interval = rule.interval || 0
  const unit = rule.unit
  
  if (isNaN(start.getTime())) return ''
  
  const due = new Date(start)
  
  if (unit === 'day') {
    due.setDate(due.getDate() + interval)
  } else if (unit === 'month') {
    due.setMonth(due.getMonth() + interval)
  } else if (unit === 'year') {
    due.setFullYear(due.getFullYear() + interval)
  }
  
  return due.toISOString()
}
</script>

<style scoped>
.tasks-view {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tasks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.tasks-header h1 {
  margin: 0;
  font-size: 1.75rem;
  color: #1a202c;
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.filters {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: #f7fafc;
  border-radius: 8px;
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
}

.filter-group select,
.filter-group input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
}

.filter-group input {
  min-width: 200px;
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

.tasks-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.task-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.5rem;
  transition: all 0.2s;
}

.task-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.task-card.disabled {
  opacity: 0.6;
  background: #f7fafc;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.task-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.task-info h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #1a202c;
}

.task-type {
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8rem;
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

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.status-badge.enabled {
  background: #c6f6d5;
  color: #22543d;
}

.status-badge.disabled {
  background: #fed7d7;
  color: #742a2a;
}

.task-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-edit,
.btn-delete {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-edit {
  background: #4299e1;
  color: white;
}

.btn-edit:hover {
  background: #3182ce;
}

.btn-delete {
  background: #e53e3e;
  color: white;
}

.btn-delete:hover {
  background: #c53030;
}

.task-details {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.detail-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.detail-item .label {
  font-weight: 600;
  color: #4a5568;
}

.status {
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-weight: 600;
}

.status.success {
  background: #c6f6d5;
  color: #22543d;
}

.status.failure {
  background: #fed7d7;
  color: #742a2a;
}

@media (max-width: 768px) {
  .filters {
    flex-direction: column;
  }

  .task-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .task-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ isEdit ? "编辑任务" : "创建任务" }}</h2>
        <button @click="$emit('close')" class="close-button">&times;</button>
      </div>

      <form @submit.prevent="handleSubmit" class="modal-body">
        <!-- 基本信息 -->
        <div class="form-group">
          <label for="name">任务名称 *</label>
          <input id="name" v-model="formData.name" type="text" placeholder="请输入任务名称" required />
        </div>

        <div class="form-group">
          <label for="type">任务类型 *</label>
          <select id="type" v-model="formData.type" required :disabled="isEdit">
            <option value="keepalive">保活任务</option>
            <option value="notification">通知任务</option>
          </select>
        </div>

        <div class="form-group">
          <label>执行计划类型 *</label>
          <div class="schedule-type-selector">
            <label class="radio-label">
              <input type="radio" v-model="scheduleType" value="cron" />
              <span>Cron 表达式</span>
            </label>
            <label class="radio-label">
              <input type="radio" v-model="scheduleType" value="periodic" />
              <span>周期性执行</span>
            </label>
          </div>
        </div>

        <div v-if="scheduleType === 'cron'" class="form-group">
          <label for="schedule">Cron 表达式 *</label>
          <input id="schedule" v-model="formData.schedule" type="text" placeholder="例如: */5 * * * * (每5分钟)" required />
          <small>格式: 秒 分 时 日 月 周</small>
        </div>

        <div v-if="scheduleType === 'periodic'" class="periodic-config">
          <!-- Row 1: Start Date, Interval Value, Interval Unit -->
          <div class="form-row three-cols">
            <div class="form-group">
              <label for="startDate">开始日期</label>
              <input id="startDate" v-model="periodicConfig.startDate" type="date" required />
            </div>
            <div class="form-group">
              <label for="interval">周期数值 *</label>
              <input id="interval" v-model.number="periodicConfig.interval" type="number" min="1" required />
            </div>
            <div class="form-group">
              <label for="unit">周期单位 *</label>
              <select id="unit" v-model="periodicConfig.unit" required>
                <option value="day">天</option>
                <option value="month">月</option>
                <option value="year">年</option>
              </select>
            </div>
          </div>

          <!-- Row 2: Due Date -->
          <div class="form-row">
            <div class="form-group half-width">
              <label for="dueDate">到期日期 *</label>
              <input id="dueDate" :value="calculatedDueDate" type="date" readonly class="readonly-input" />
            </div>
          </div>

          <!-- Row 3: Reminder & Options -->
          <div class="form-row end-aligned">
            <!-- Reminder Section -->
            <div class="form-group half-width">
              <label>提醒提前量</label>
              <div class="input-group">
                <input type="number" v-model.number="periodicConfig.reminderAdvanceValue" min="0" placeholder="数值" />
                <select v-model="periodicConfig.reminderAdvanceUnit">
                  <option value="hour">小时</option>
                  <option value="day">天</option>
                </select>
              </div>
              <small class="help-text">0 = 仅在到期时提醒; 选择"小时"需要将 Worker 定时任务调整为小时级执行</small>
            </div>

            <!-- Options Section -->
            <div class="form-group options-group">
              <label>选项设置</label>
              <div class="checkbox-row">
                <label class="checkbox-label">
                  <input v-model="formData.enabled" type="checkbox" />
                  <span>启用订阅</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" v-model="periodicConfig.autoRenew" />
                  <span>自动续订</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="form-group" v-if="scheduleType !== 'periodic'">
          <label>
            <input v-model="formData.enabled" type="checkbox" />
            启用任务
          </label>
        </div>

        <!-- 保活任务配置 -->
        <div v-if="formData.type === 'keepalive'" class="config-section">
          <h3>保活任务配置</h3>

          <div class="form-group">
            <label for="url">目标URL *</label>
            <input id="url" v-model="keepaliveConfig.url" type="url" placeholder="https://example.com" required />
          </div>

          <div class="form-group">
            <label for="method">HTTP方法 *</label>
            <select id="method" v-model="keepaliveConfig.method" required>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          <div class="form-group">
            <label for="timeout">超时时间 (秒) *</label>
            <input id="timeout" v-model.number="keepaliveConfig.timeout" type="number" min="1" max="300" required />
          </div>

          <div class="form-group">
            <label for="headers">请求头 (JSON格式)</label>
            <textarea id="headers" v-model="headersJson" placeholder='{"Content-Type": "application/json"}'
              rows="3"></textarea>
          </div>

          <div class="form-group">
            <label for="body">请求体</label>
            <textarea id="body" v-model="keepaliveConfig.body" placeholder="请求体内容" rows="3"></textarea>
          </div>
        </div>

        <!-- 通知任务配置 -->
        <div v-if="formData.type === 'notification'" class="config-section">
          <h3>通知任务配置</h3>

          <div class="form-group">
            <label for="title">通知标题</label>
            <input id="title" v-model="notificationConfig.title" type="text" placeholder="通知标题" />
          </div>

          <div class="form-group">
            <label for="message">通知内容 *</label>
            <textarea id="message" v-model="notificationConfig.message" placeholder="通知内容" rows="3" required></textarea>
          </div>

          <div class="channel-hint">
            <p>
              通知将发送给您在
              <router-link to="/settings">设置页面</router-link>
              中配置的所有已启用渠道。
            </p>
          </div>
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="modal-footer">
          <button type="button" @click="$emit('close')" class="btn-cancel">
            取消
          </button>
          <button type="submit" class="btn-submit" :disabled="loading">
            {{ loading ? "保存中..." : "保存" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useTasksStore } from "@/stores/tasks";
import type {
  Task,
  TaskConfig,
  KeepaliveConfig,
  NotificationConfig,
} from "@/types";

const props = defineProps<{
  task?: Task | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [];
}>();

const tasksStore = useTasksStore();

const isEdit = computed(() => !!props.task);

const formData = ref<TaskConfig>({
  name: "",
  type: "keepalive",
  schedule: "*/5 * * * *",
  enabled: true,
  config: {} as any,
});

const keepaliveConfig = ref<KeepaliveConfig>({
  url: "",
  method: "GET",
  timeout: 30,
  headers: {},
  body: "",
});

const notificationConfig = ref<NotificationConfig>({
  message: "",
  title: "",
});

const headersJson = ref("");
const loading = ref(false);
const error = ref("");
const scheduleType = ref<"cron" | "periodic">("cron");
const periodicConfig = ref({
  startDate: new Date().toISOString().split("T")[0],
  endDate: "",
  interval: 1,
  unit: "day" as "day" | "month" | "year",
  reminderAdvanceValue: 0 as number | undefined,
  reminderAdvanceUnit: "day" as "day" | "hour",
  autoRenew: true,
});

// 计算到期日期
const calculatedDueDate = computed(() => {
  if (!periodicConfig.value.startDate) return "";

  const start = new Date(periodicConfig.value.startDate);
  const interval = periodicConfig.value.interval || 0;
  const unit = periodicConfig.value.unit;

  if (isNaN(start.getTime())) return "";

  const due = new Date(start);

  if (unit === 'day') {
    due.setDate(due.getDate() + interval);
  } else if (unit === 'month') {
    due.setMonth(due.getMonth() + interval);
  } else if (unit === 'year') {
    due.setFullYear(due.getFullYear() + interval);
  }

  return due.toISOString().split('T')[0];
});

// 如果是编辑模式，填充表单
watch(
  () => props.task,
  (task) => {
    if (task) {
      formData.value = {
        name: task.name,
        type: task.type,
        schedule: task.schedule,
        enabled: task.enabled,
        config: task.config,
      };

      // Check if executionRule exists
      const config = task.config as any;
      if (config.executionRule) {
        scheduleType.value = "periodic";
        periodicConfig.value = {
          startDate: config.executionRule.startDate.split("T")[0],
          endDate: "", // End Date is no longer used in UI
          interval: config.executionRule.interval,
          unit: config.executionRule.unit,
          reminderAdvanceValue: config.executionRule.reminderAdvanceValue,
          reminderAdvanceUnit:
            config.executionRule.reminderAdvanceUnit || "day",
          autoRenew: config.executionRule.autoRenew || false,
        };
      } else {
        scheduleType.value = "cron";
      }

      if (task.type === "keepalive") {
        keepaliveConfig.value = { ...(task.config as KeepaliveConfig) };
        if (keepaliveConfig.value.headers) {
          headersJson.value = JSON.stringify(
            keepaliveConfig.value.headers,
            null,
            2,
          );
        } else {
          headersJson.value = "";
        }
      } else {
        notificationConfig.value = { ...(task.config as NotificationConfig) };
      }
    } else {
      // Reset form
      periodicConfig.value = {
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        interval: 1,
        unit: "day",
        reminderAdvanceValue: 0,
        reminderAdvanceUnit: "day",
        autoRenew: true,
      };
    }
  },
  { immediate: true },
);

async function handleSubmit() {
  error.value = "";
  loading.value = true;

  try {
    // 保存任务
    if (formData.value.type === "keepalive") {
      // 解析headers JSON
      if (headersJson.value.trim()) {
        try {
          keepaliveConfig.value.headers = JSON.parse(headersJson.value);
        } catch {
          error.value = "请求头JSON格式错误";
          loading.value = false;
          return;
        }
      }
      formData.value.config = keepaliveConfig.value;
    } else {
      formData.value.config = notificationConfig.value;
    }

    // Handle Schedule Type
    if (scheduleType.value === "periodic") {
      // Set a default cron that runs frequently, e.g. every minute, so the aggressive filter passes it to the execution rule check
      formData.value.schedule = "* * * * *";

      const rule = {
        type: "interval" as const,
        unit: periodicConfig.value.unit,
        interval: periodicConfig.value.interval,
        startDate: new Date(
          periodicConfig.value.startDate as string,
        ).toISOString(),
        endDate: undefined, // End Date removed
        reminderAdvanceValue: periodicConfig.value.reminderAdvanceValue,
        reminderAdvanceUnit: periodicConfig.value.reminderAdvanceUnit,
        autoRenew: periodicConfig.value.autoRenew,
      };

      // Assign executionRule to config
      (formData.value.config as any).executionRule = rule;
    } else {
      // Clear executionRule if switching back to cron
      if ((formData.value.config as any).executionRule) {
        delete (formData.value.config as any).executionRule;
      }
    }

    // 保存任务
    let success = false;
    if (isEdit.value && props.task) {
      success = await tasksStore.updateTask(props.task.id, formData.value);
    } else {
      success = await tasksStore.createTask(formData.value);
    }

    if (success) {
      emit("save");
    } else {
      error.value = tasksStore.error || "保存失败";
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存失败";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #1a202c;
}

.close-button {
  background: none;
  border: none;
  font-size: 2rem;
  color: #718096;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 2rem;
  height: 2rem;
}

.close-button:hover {
  color: #1a202c;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 0.5rem;
}

.form-group input[type="text"],
.form-group input[type="url"],
.form-group input[type="number"],
.form-group input[type="date"],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.95rem;
}

.form-group input[type="checkbox"] {
  margin-right: 0.5rem;
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: #718096;
}

.config-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 2px solid #e2e8f0;
}

.config-section h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: #1a202c;
}

.config-section h4 {
  margin: 1.5rem 0 1rem 0;
  font-size: 1rem;
  color: #2d3748;
}

.error-message {
  padding: 0.75rem;
  background: #fed7d7;
  color: #c53030;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 1px solid #e2e8f0;
}

.btn-cancel,
.btn-submit {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: #e2e8f0;
  color: #4a5568;
}

.btn-cancel:hover {
  background: #cbd5e0;
}

.btn-submit {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-submit:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.channel-hint {
  padding: 0.75rem;
  background: #fefcbf;
  border-radius: 6px;
  color: #744210;
  font-size: 0.9rem;
}

.channel-hint a {
  color: #667eea;
  font-weight: 600;
}

.channel-list {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
}

.channel-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.channel-option:hover {
  border-color: #667eea;
  background: #f0f3ff;
}

.channel-option input[type="checkbox"] {
  accent-color: #667eea;
}

.channel-config-section {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f7fafc;
}

.schedule-type-selector {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.5rem;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-weight: 500;
}

.radio-label input[type="radio"] {
  accent-color: #667eea;
}

.periodic-config {
  background: #f7fafc;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.form-row .form-group {
  flex: 1;
  margin-bottom: 0;
}

.input-group {
  display: flex;
  gap: 0.5rem;
}

.input-group input,
.input-group select {
  flex: 1;
}

.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding-top: 1.5rem;
  /* Align with input label */
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-weight: 500;
  color: #2d3748;
}

.readonly-input {
  background-color: #f7fafc;
  cursor: not-allowed;
  color: #718096;
}

.three-cols {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
}

.half-width {
  width: 50%;
  flex: 0 0 auto !important;
  /* Override flex: 1 from .form-row .form-group */
}

.end-aligned {
  align-items: flex-start;
}

.options-group {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding-left: 1rem;
}

.checkbox-row {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.5rem;
}

.help-text {
  font-size: 0.75rem;
  color: #718096;
  margin-top: 0.25rem;
  line-height: 1.4;
}
</style>

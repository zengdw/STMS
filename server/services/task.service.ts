import { Environment, Task, KeepaliveConfig, NotificationConfig, ExecutionResult } from '../types/index.js';
import { DatabaseUtils } from '../utils/database.js';
import { TaskModel } from '../models/task.model.js';
import { ExecutionLogModel } from '../models/execution-log.model.js';
import { NotificationService } from './notification.service.js';
import { LogService } from './log.service.js';

/**
 * 任务服务类
 * 提供任务管理和执行的业务逻辑
 */
export class TaskService {
  /**
   * 生成唯一ID
   * @returns UUID字符串
   */
  private static generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * 创建任务
   * @param env 环境变量
   * @param taskData 任务数据
   * @param userId 用户ID
   * @returns 创建的任务
   */
  static async createTask(
    env: Environment,
    taskData: {
      name: string;
      type: 'keepalive' | 'notification';
      schedule: string;
      config: KeepaliveConfig | NotificationConfig;
      enabled?: boolean;
    },
    userId: string
  ): Promise<{ success: boolean; data?: Task; error?: string }> {
    try {
      // 创建任务对象
      const task = TaskModel.create({
        id: this.generateId(),
        name: taskData.name,
        type: taskData.type,
        schedule: taskData.schedule,
        config: taskData.config,
        created_by: userId,
        enabled: taskData.enabled !== undefined ? taskData.enabled : true
      });

      // Handle periodic task endDate initialization
      if (task.config.executionRule) {
        const rule = task.config.executionRule;
        if (!rule.endDate) {
          const startDate = new Date(rule.startDate);
          let nextDate = new Date(startDate);
          if (rule.unit === 'day') {
            nextDate.setDate(nextDate.getDate() + rule.interval);
          } else if (rule.unit === 'month') {
            nextDate.setMonth(nextDate.getMonth() + rule.interval);
          } else if (rule.unit === 'year') {
            nextDate.setFullYear(nextDate.getFullYear() + rule.interval);
          }
          task.config.executionRule.endDate = nextDate.toISOString();
        }
      }

      // 保存到数据库
      const result = await DatabaseUtils.createTask(env, task);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // 记录审计日志
      await LogService.logAudit(
        env,
        userId,
        'create_task',
        'task',
        task.id,
        { name: task.name, type: task.type }
      );

      return { success: true, data: result.data };
    } catch (error) {
      // 记录错误日志
      await LogService.logError(
        env,
        'TASK_SERVICE_ERROR',
        '创建任务失败',
        error instanceof Error ? error.stack : undefined,
        { userId, taskData }
      );

      return {
        success: false,
        error: `创建任务失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 更新任务
   * @param env 环境变量
   * @param taskId 任务ID
   * @param updateData 更新数据
   * @param userId 用户ID
   * @returns 更新后的任务
   */
  static async updateTask(
    env: Environment,
    taskId: string,
    updateData: Partial<Task>,
    userId: string
  ): Promise<{ success: boolean; data?: Task; error?: string }> {
    try {
      // 获取现有任务
      const existingResult = await DatabaseUtils.getTaskById(env, taskId);

      if (!existingResult.success || !existingResult.data) {
        return { success: false, error: '任务不存在' };
      }

      // 验证权限（只有创建者可以更新）
      if (existingResult.data.created_by !== userId) {
        return { success: false, error: '无权限更新此任务' };
      }

      // Handle periodic task endDate initialization for updates
      if (updateData.config && (updateData.config as any).executionRule) {
        const rule = (updateData.config as any).executionRule;
        if (!rule.endDate) {
          const startDate = new Date(rule.startDate);
          let nextDate = new Date(startDate);
          if (rule.unit === 'day') {
            nextDate.setDate(nextDate.getDate() + rule.interval);
          } else if (rule.unit === 'month') {
            nextDate.setMonth(nextDate.getMonth() + rule.interval);
          } else if (rule.unit === 'year') {
            nextDate.setFullYear(nextDate.getFullYear() + rule.interval);
          }
          rule.endDate = nextDate.toISOString();
        }
      }

      // 更新任务
      const result = await DatabaseUtils.updateTask(env, taskId, updateData);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // 记录审计日志
      await LogService.logAudit(
        env,
        userId,
        'update_task',
        'task',
        taskId,
        { updateData }
      );

      return { success: true, data: result.data };
    } catch (error) {
      // 记录错误日志
      await LogService.logError(
        env,
        'TASK_SERVICE_ERROR',
        '更新任务失败',
        error instanceof Error ? error.stack : undefined,
        { userId, taskId, updateData }
      );

      return {
        success: false,
        error: `更新任务失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 删除任务
   * @param env 环境变量
   * @param taskId 任务ID
   * @param userId 用户ID
   * @returns 删除结果
   */
  static async deleteTask(
    env: Environment,
    taskId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 获取现有任务
      const existingResult = await DatabaseUtils.getTaskById(env, taskId);

      if (!existingResult.success || !existingResult.data) {
        return { success: false, error: '任务不存在' };
      }

      // 验证权限（只有创建者可以删除）
      if (existingResult.data.created_by !== userId) {
        return { success: false, error: '无权限删除此任务' };
      }

      // 删除任务
      const result = await DatabaseUtils.deleteTask(env, taskId);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // 记录审计日志
      await LogService.logAudit(
        env,
        userId,
        'delete_task',
        'task',
        taskId,
        { name: existingResult.data.name, type: existingResult.data.type }
      );

      return { success: true };
    } catch (error) {
      // 记录错误日志
      await LogService.logError(
        env,
        'TASK_SERVICE_ERROR',
        '删除任务失败',
        error instanceof Error ? error.stack : undefined,
        { userId, taskId }
      );

      return {
        success: false,
        error: `删除任务失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取任务
   * @param env 环境变量
   * @param taskId 任务ID
   * @returns 任务对象
   */
  static async getTask(
    env: Environment,
    taskId: string
  ): Promise<{ success: boolean; data?: Task | null; error?: string }> {
    try {
      const result = await DatabaseUtils.getTaskById(env, taskId);
      return result;
    } catch (error) {
      return {
        success: false,
        error: `获取任务失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 列出任务
   * @param env 环境变量
   * @param filter 筛选条件
   * @returns 任务列表
   */
  static async listTasks(
    env: Environment,
    filter?: {
      type?: 'keepalive' | 'notification';
      enabled?: boolean;
      created_by?: string;
    }
  ): Promise<{ success: boolean; data?: Task[]; error?: string }> {
    try {
      const result = await DatabaseUtils.getAllTasks(env, filter);
      return result;
    } catch (error) {
      return {
        success: false,
        error: `获取任务列表失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 切换任务状态
   * @param env 环境变量
   * @param taskId 任务ID
   * @param userId 用户ID
   * @returns 更新后的任务
   */
  static async toggleTaskStatus(
    env: Environment,
    taskId: string,
    userId: string
  ): Promise<{ success: boolean; data?: Task; error?: string }> {
    try {
      // 获取现有任务
      const existingResult = await DatabaseUtils.getTaskById(env, taskId);

      if (!existingResult.success || !existingResult.data) {
        return { success: false, error: '任务不存在' };
      }

      // 验证权限
      if (existingResult.data.created_by !== userId) {
        return { success: false, error: '无权限修改此任务' };
      }

      // 切换状态
      const newEnabled = !existingResult.data.enabled;
      const result = await DatabaseUtils.updateTask(env, taskId, { enabled: newEnabled });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, data: result.data };
    } catch (error) {
      return {
        success: false,
        error: `切换任务状态失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 执行保活任务
   * @param env 环境变量
   * @param task 任务对象
   * @returns 执行结果
   */
  static async executeKeepaliveTask(
    env: Environment,
    task: Task
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // 验证任务类型
      if (task.type !== 'keepalive') {
        throw new Error('任务类型不是保活任务');
      }

      const config = task.config as KeepaliveConfig;

      // 设置请求选项
      const requestOptions: RequestInit = {
        method: config.method,
        headers: config.headers || {},
        signal: AbortSignal.timeout(config.timeout || 30000)
      };

      // 如果有请求体，添加到请求中
      if (config.body && (config.method === 'POST' || config.method === 'PUT')) {
        requestOptions.body = config.body;
      }

      // 发送HTTP请求
      const response = await fetch(config.url, requestOptions);
      const responseTime = Date.now() - startTime;

      // 记录执行结果
      const executionResult: ExecutionResult = {
        success: response.ok,
        responseTime,
        statusCode: response.status,
        timestamp: new Date()
      };

      // 如果请求失败，记录错误信息
      if (!response.ok) {
        executionResult.error = `HTTP ${response.status}: ${response.statusText}`;
      }

      // 记录执行日志
      await LogService.logExecution(
        env,
        task.id,
        executionResult.success ? 'success' : 'failure',
        executionResult.responseTime,
        executionResult.statusCode,
        executionResult.error,
        executionResult
      );

      // 更新任务的最后执行状态
      const updateData: Partial<Task> = {
        last_executed: new Date().toISOString(),
        last_status: executionResult.success ? 'success' : 'failure'
      };

      // Handle Auto Renew
      if (task.config.executionRule?.autoRenew) {
        this.handleAutoRenew(task, updateData);
      }

      await DatabaseUtils.updateTask(env, task.id, updateData);

      // 处理通知
      await this.handleTaskNotifications(env, task, executionResult);

      return executionResult;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const executionResult: ExecutionResult = {
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : '未知错误',
        timestamp: new Date()
      };

      // 记录执行日志
      await LogService.logExecution(
        env,
        task.id,
        executionResult.success ? 'success' : 'failure',
        executionResult.responseTime,
        executionResult.statusCode,
        executionResult.error,
        executionResult
      );

      // 更新任务的最后执行状态
      await DatabaseUtils.updateTask(env, task.id, {
        last_executed: new Date().toISOString(),
        last_status: 'failure'
      });

      // 处理通知
      await this.handleTaskNotifications(env, task, executionResult);

      return executionResult;
    }
  }

  /**
   * 执行通知任务
   * @param env 环境变量
   * @param task 任务对象
   * @returns 执行结果
   */
  static async executeNotificationTask(
    env: Environment,
    task: Task
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // 验证任务类型
      if (task.type !== 'notification') {
        throw new Error('任务类型不是通知任务');
      }

      const config = task.config as NotificationConfig;

      // 获取任务创建者的通知设置
      const settingsResult = await DatabaseUtils.getNotificationSettingsByUserId(env, task.created_by);

      let result;

      if (!settingsResult.success || !settingsResult.data) {
        result = { success: false, error: '未找到用户的通知设置' };
      } else {
        // 调用通知服务发送通知
        result = await NotificationService.sendNotification(
          env,
          settingsResult.data,
          config.title || '系统通知',
          config.message,
          {
            type: 'notification_task',
            task_id: task.id,
            task_name: task.name
          }
        );
      }

      const responseTime = Date.now() - startTime;

      // 记录执行结果
      const executionResult: ExecutionResult = {
        success: result.success,
        responseTime,
        statusCode: result.success ? 200 : 500,
        error: result.error,
        timestamp: new Date()
      };

      // 记录执行日志
      await LogService.logExecution(
        env,
        task.id,
        executionResult.success ? 'success' : 'failure',
        executionResult.responseTime,
        executionResult.statusCode,
        executionResult.error,
        executionResult
      );

      // 更新任务的最后执行状态
      const updateData: Partial<Task> = {
        last_executed: executionResult.timestamp.toISOString(),
        last_status: executionResult.success ? 'success' : 'failure'
      };

      // Handle Auto Renew
      if (task.config.executionRule?.autoRenew) {
        this.handleAutoRenew(task, updateData);
      }

      await DatabaseUtils.updateTask(env, task.id, updateData);

      return executionResult;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const executionResult: ExecutionResult = {
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : '未知错误',
        timestamp: new Date()
      };

      // 记录执行日志
      await LogService.logExecution(
        env,
        task.id,
        executionResult.success ? 'success' : 'failure',
        executionResult.responseTime,
        executionResult.statusCode,
        executionResult.error,
        executionResult
      );

      // 更新任务的最后执行状态
      await DatabaseUtils.updateTask(env, task.id, {
        last_executed: new Date().toISOString(),
        last_status: 'failure'
      });

      return executionResult;
    }
  }

  /**
   * 处理任务自动续期
   */
  private static handleAutoRenew(task: Task, updateData: Partial<Task>) {
    const rule = task.config.executionRule!;
    // Calculate next execution date based on current endDate (which is the Next Due Date)
    const currentDueDate = new Date(rule.endDate);
    const interval = rule.interval;
    const unit = rule.unit;

    let nextDueDate = new Date(currentDueDate);

    // FIX: If the current time is before the scheduled end date, it's an early execution (e.g. reminder).
    // In this case, do NOT auto-renew (move the date forward) yet.
    // The date should only be updated when the task is executed at or after the due date.
    if (Date.now() < currentDueDate.getTime()) {
      return;
    }

    if (unit === 'day') {
      nextDueDate.setDate(nextDueDate.getDate() + interval);
    } else if (unit === 'month') {
      nextDueDate.setMonth(nextDueDate.getMonth() + interval);
    } else if (unit === 'year') {
      nextDueDate.setFullYear(nextDueDate.getFullYear() + interval);
    }

    // Update rule in config
    // We only update endDate to the NEW Next Due Date
    const newRule = { ...rule, endDate: nextDueDate.toISOString() };

    // Merge into updateData
    // Note: We need to be careful not to overwrite other config updates if any (though currently we only update last_executed/status)
    // We need to cast updateData to any or properly type it to include config update
    // Since `updateTask` takes Partial<Task>, and Task has config, this is valid.
    // However, task.config is a JSON object in DB, but typed here.
    // We should update the whole config object.
    const newConfig = { ...task.config, executionRule: newRule };
    (updateData as any).config = newConfig;
  }



  /**
   * 获取任务执行统计
   * @param env 环境变量
   * @param taskId 任务ID
   * @returns 执行统计
   */
  static async getTaskStatistics(
    env: Environment,
    taskId: string
  ): Promise<{
    success: boolean;
    data?: {
      totalExecutions: number;
      successCount: number;
      failureCount: number;
      averageResponseTime: number;
      lastExecution?: string;
    };
    error?: string;
  }> {
    try {
      // 获取任务的所有执行日志
      const logsResult = await DatabaseUtils.getExecutionLogsByTaskId(env, taskId, 1000);

      if (!logsResult.success || !logsResult.data) {
        return { success: false, error: '获取执行日志失败' };
      }

      const logs = logsResult.data;
      const totalExecutions = logs.length;
      const successCount = logs.filter(log => log.status === 'success').length;
      const failureCount = logs.filter(log => log.status === 'failure').length;

      // 计算平均响应时间
      const responseTimes = logs
        .filter(log => log.response_time !== undefined && log.response_time !== null)
        .map(log => log.response_time!);

      const averageResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
        : 0;

      const lastExecution = logs.length > 0 ? logs[0].execution_time : undefined;

      return {
        success: true,
        data: {
          totalExecutions,
          successCount,
          failureCount,
          averageResponseTime: Math.round(averageResponseTime),
          lastExecution
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `获取任务统计失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 处理任务执行后的通知
   * @param env 环境变量
   * @param task 任务对象
   * @param result 执行结果
   */
  private static async handleTaskNotifications(
    env: Environment,
    task: Task,
    result: ExecutionResult
  ): Promise<void> {
    try {
      // 只对保活任务发送失败/恢复通知
      if (task.type !== 'keepalive') {
        return;
      }

      if (!result.success) {
        // 任务失败，发送失败通知
        await NotificationService.sendFailureAlert(
          env,
          task,
          result.error || '未知错误'
        );
      } else {
        // 任务成功，检查是否需要发送恢复通知
        const shouldSendRecovery = await NotificationService.shouldSendRecoveryAlert(env, task.id);
        if (shouldSendRecovery) {
          await NotificationService.sendRecoveryAlert(env, task);
        }
      }
    } catch (error) {
      console.error('处理任务通知失败:', error);
      // 通知失败不应该影响任务执行结果，只记录错误
    }
  }
}

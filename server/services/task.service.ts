import { Environment, Task, KeepaliveConfig, NotificationConfig, ExecutionResult } from '../types/index.js';
import { DatabaseUtils } from '../utils/database.js';
import { TaskModel } from '../models/task.model.js';
import { ExecutionLogModel } from '../models/execution-log.model.js';

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

      // 保存到数据库
      const result = await DatabaseUtils.createTask(env, task);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, data: result.data };
    } catch (error) {
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

      // 更新任务
      const result = await DatabaseUtils.updateTask(env, taskId, updateData);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, data: result.data };
    } catch (error) {
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

      return { success: true };
    } catch (error) {
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
      await this.logExecution(env, task.id, executionResult);

      // 更新任务的最后执行状态
      await DatabaseUtils.updateTask(env, task.id, {
        last_executed: new Date().toISOString(),
        last_status: executionResult.success ? 'success' : 'failure'
      });

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
      await this.logExecution(env, task.id, executionResult);

      // 更新任务的最后执行状态
      await DatabaseUtils.updateTask(env, task.id, {
        last_executed: new Date().toISOString(),
        last_status: 'failure'
      });

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
      
      // 调用通知服务发送通知
      // 注意：这里需要导入NotificationService，但为了避免循环依赖，
      // 我们直接在这里实现简单的NotifyX API调用
      const notifyxConfig = config.notifyxConfig;
      
      const response = await fetch('https://api.notifyx.cn/v1/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${notifyxConfig.apiKey}`
        },
        body: JSON.stringify({
          channel_id: notifyxConfig.channelId,
          title: config.title || notifyxConfig.title || '定时通知',
          message: config.message,
          priority: config.priority || 'normal',
          recipients: notifyxConfig.recipients
        }),
        signal: AbortSignal.timeout(30000)
      });

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
        const errorText = await response.text();
        executionResult.error = `通知发送失败: HTTP ${response.status} - ${errorText}`;
      }

      // 记录执行日志
      await this.logExecution(env, task.id, executionResult);

      // 更新任务的最后执行状态
      await DatabaseUtils.updateTask(env, task.id, {
        last_executed: new Date().toISOString(),
        last_status: executionResult.success ? 'success' : 'failure'
      });

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
      await this.logExecution(env, task.id, executionResult);

      // 更新任务的最后执行状态
      await DatabaseUtils.updateTask(env, task.id, {
        last_executed: new Date().toISOString(),
        last_status: 'failure'
      });

      return executionResult;
    }
  }

  /**
   * 记录任务执行日志
   * @param env 环境变量
   * @param taskId 任务ID
   * @param result 执行结果
   */
  private static async logExecution(
    env: Environment,
    taskId: string,
    result: ExecutionResult
  ): Promise<void> {
    try {
      const log = ExecutionLogModel.create({
        id: this.generateId(),
        task_id: taskId,
        status: result.success ? 'success' : 'failure',
        response_time: result.responseTime,
        status_code: result.statusCode,
        error_message: result.error,
        details: result
      });

      await DatabaseUtils.createExecutionLog(env, log);
    } catch (error) {
      console.error('记录执行日志失败:', error);
    }
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
}

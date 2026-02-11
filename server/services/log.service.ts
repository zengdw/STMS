import { Environment, ExecutionLog } from '../types/index.js';
import { DatabaseUtils } from '../utils/database.js';
import { ExecutionLogModel } from '../models/execution-log.model.js';

/**
 * 日志类型枚举
 */
export enum LogType {
  EXECUTION = 'execution',
  ERROR = 'system',
  AUDIT = 'audit'
}

/**
 * 审计日志条目
 */
export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details?: string;
  timestamp: string;
}

/**
 * 错误日志条目
 */
export interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  stack_trace?: string;
  context?: string;
  timestamp: string;
}

/**
 * 日志查询筛选条件
 */
export interface LogFilter {
  taskId?: string;
  logType?: 'execution' | 'system' | 'audit';
  taskType?: 'keepalive' | 'notification';
  status?: 'success' | 'failure';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * 日志服务类
 * 提供执行日志、错误日志和审计日志的管理功能
 */
export class LogService {
  /**
   * 生成唯一ID
   * @returns UUID字符串
   */
  private static generateId(): string {
    return crypto.randomUUID();
  }

  // ==================== 执行日志功能 ====================

  /**
   * 记录任务执行日志
   * @param env 环境变量
   * @param taskId 任务ID
   * @param status 执行状态
   * @param responseTime 响应时间
   * @param statusCode HTTP状态码
   * @param errorMessage 错误消息
   * @param details 详细信息
   * @returns 操作结果
   */
  static async logExecution(
    env: Environment,
    taskId: string,
    status: 'success' | 'failure',
    responseTime?: number,
    statusCode?: number,
    errorMessage?: string,
    details?: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const log = ExecutionLogModel.create({
        id: this.generateId(),
        task_id: taskId,
        log_type: LogType.EXECUTION,
        status,
        response_time: responseTime,
        status_code: statusCode,
        error_message: errorMessage,
        details
      });

      const result = await DatabaseUtils.createExecutionLog(env, log);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `记录执行日志失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取执行日志列表
   * @param env 环境变量
   * @param filter 筛选条件
   * @returns 日志列表
   */
  static async getExecutionLogs(
    env: Environment,
    filter?: LogFilter
  ): Promise<{ success: boolean; data?: ExecutionLog[]; error?: string }> {
    try {
      const dbFilter: any = {
        taskId: filter?.taskId,
        logType: filter?.logType,
        status: filter?.status,
        startDate: filter?.startDate?.toISOString(),
        endDate: filter?.endDate?.toISOString(),
        limit: filter?.limit || 100,
        offset: filter?.offset || 0
      };

      const result = await DatabaseUtils.getExecutionLogs(env, dbFilter);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // 如果指定了任务类型筛选，需要关联任务表进行筛选
      let logs = result.data || [];
      if (filter?.taskType) {
        const filteredLogs: ExecutionLog[] = [];
        for (const log of logs) {
          const taskResult = await DatabaseUtils.getTaskById(env, log.task_id!);
          if (taskResult.success && taskResult.data && taskResult.data.type === filter.taskType) {
            filteredLogs.push(log);
          }
        }
        logs = filteredLogs;
      }

      return { success: true, data: logs };
    } catch (error) {
      return {
        success: false,
        error: `获取执行日志失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取单个执行日志
   * @param env 环境变量
   * @param logId 日志ID
   * @returns 日志对象
   */
  static async getExecutionLog(
    env: Environment,
    logId: string
  ): Promise<{ success: boolean; data?: ExecutionLog | null; error?: string }> {
    try {
      const result = await DatabaseUtils.getExecutionLogById(env, logId);
      return result;
    } catch (error) {
      return {
        success: false,
        error: `获取执行日志失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取任务的执行日志
   * @param env 环境变量
   * @param taskId 任务ID
   * @param limit 限制数量
   * @param offset 偏移量
   * @returns 日志列表
   */
  static async getTaskExecutionLogs(
    env: Environment,
    taskId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ success: boolean; data?: ExecutionLog[]; error?: string }> {
    try {
      const result = await DatabaseUtils.getExecutionLogsByTaskId(env, taskId, limit, offset);
      return result;
    } catch (error) {
      return {
        success: false,
        error: `获取任务执行日志失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // ==================== 错误日志功能 ====================

  /**
   * 记录系统错误日志
   * @param env 环境变量
   * @param errorType 错误类型
   * @param errorMessage 错误消息
   * @param stackTrace 堆栈信息
   * @param context 上下文信息
   * @returns 操作结果
   */
  static async logError(
    env: Environment,
    errorType: string,
    errorMessage: string,
    stackTrace?: string,
    context?: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const errorLog: ErrorLog = {
        id: this.generateId(),
        error_type: errorType,
        error_message: errorMessage,
        stack_trace: stackTrace,
        context: context ? JSON.stringify(context) : undefined,
        timestamp: new Date().toISOString()
      };

      // 将错误日志作为执行日志存储（system类型，无需fake taskId）
      const log = ExecutionLogModel.create({
        id: errorLog.id,
        log_type: LogType.ERROR,
        status: 'failure',
        error_message: `[${errorType}] ${errorMessage}`,
        details: {
          error_type: errorType,
          stack_trace: stackTrace,
          context
        }
      });

      const result = await DatabaseUtils.createExecutionLog(env, log);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `记录错误日志失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取错误日志列表
   * @param env 环境变量
   * @param limit 限制数量
   * @param offset 偏移量
   * @returns 错误日志列表
   */
  static async getErrorLogs(
    env: Environment,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ success: boolean; data?: ErrorLog[]; error?: string }> {
    try {
      // 获取log_type为'system'的日志
      const result = await DatabaseUtils.getExecutionLogs(env, {
        logType: LogType.ERROR,
        limit,
        offset
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // 转换为错误日志格式
      const errorLogs: ErrorLog[] = (result.data || []).map(log => {
        const details = log.details ? JSON.parse(log.details) : {};
        return {
          id: log.id,
          error_type: details.error_type || 'unknown',
          error_message: log.error_message || '',
          stack_trace: details.stack_trace,
          context: details.context ? JSON.stringify(details.context) : undefined,
          timestamp: log.execution_time
        };
      });

      return { success: true, data: errorLogs };
    } catch (error) {
      return {
        success: false,
        error: `获取错误日志失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // ==================== 审计日志功能 ====================

  /**
   * 记录操作审计日志
   * @param env 环境变量
   * @param userId 用户ID
   * @param action 操作类型
   * @param resourceType 资源类型
   * @param resourceId 资源ID
   * @param details 详细信息
   * @returns 操作结果
   */
  static async logAudit(
    env: Environment,
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details?: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const auditLog: AuditLog = {
        id: this.generateId(),
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: details ? JSON.stringify(details) : undefined,
        timestamp: new Date().toISOString()
      };

      // 将审计日志作为执行日志存储（audit类型，无需fake taskId）
      const log = ExecutionLogModel.create({
        id: auditLog.id,
        log_type: LogType.AUDIT,
        status: 'success',
        details: {
          user_id: userId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          audit_details: details
        }
      });

      const result = await DatabaseUtils.createExecutionLog(env, log);
      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `记录审计日志失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取审计日志列表
   * @param env 环境变量
   * @param userId 用户ID（可选）
   * @param limit 限制数量
   * @param offset 偏移量
   * @returns 审计日志列表
   */
  static async getAuditLogs(
    env: Environment,
    userId?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ success: boolean; data?: AuditLog[]; error?: string }> {
    try {
      // 获取log_type为'audit'的日志
      const result = await DatabaseUtils.getExecutionLogs(env, {
        logType: LogType.AUDIT,
        limit,
        offset
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // 转换为审计日志格式
      let auditLogs: AuditLog[] = (result.data || []).map(log => {
        const details = log.details ? JSON.parse(log.details) : {};
        return {
          id: log.id,
          user_id: details.user_id || '',
          action: details.action || '',
          resource_type: details.resource_type || '',
          resource_id: details.resource_id || '',
          details: details.audit_details ? JSON.stringify(details.audit_details) : undefined,
          timestamp: log.execution_time
        };
      });

      // 如果指定了用户ID，进行筛选
      if (userId) {
        auditLogs = auditLogs.filter(log => log.user_id === userId);
      }

      return { success: true, data: auditLogs };
    } catch (error) {
      return {
        success: false,
        error: `获取审计日志失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  // ==================== 日志清理和轮转功能 ====================

  /**
   * 清理旧日志
   * @param env 环境变量
   * @param days 保留天数
   * @returns 清理结果
   */
  static async cleanupOldLogs(
    env: Environment,
    days: number = 30
  ): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
    try {
      // 计算截止日期
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await DatabaseUtils.deleteOldExecutionLogs(env, cutoffDate.toISOString());

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true, deletedCount: result.data };
    } catch (error) {
      return {
        success: false,
        error: `清理旧日志失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取日志统计信息
   * @param env 环境变量
   * @returns 统计信息
   */
  static async getLogStatistics(
    env: Environment
  ): Promise<{
    success: boolean;
    data?: {
      totalLogs: number;
      executionLogs: number;
      errorLogs: number;
      auditLogs: number;
      successCount: number;
      failureCount: number;
      oldestLog?: string;
      newestLog?: string;
    };
    error?: string;
  }> {
    try {
      // 获取所有日志
      const allLogsResult = await DatabaseUtils.getAllExecutionLogs(env, 10000);

      if (!allLogsResult.success) {
        return { success: false, error: allLogsResult.error };
      }

      const allLogs = allLogsResult.data || [];
      const totalLogs = allLogs.length;

      // 分类统计
      const executionLogs = allLogs.filter(
        log => log.log_type === 'execution'
      ).length;
      const errorLogs = allLogs.filter(log => log.log_type === 'system').length;
      const auditLogs = allLogs.filter(log => log.log_type === 'audit').length;

      // 状态统计
      const successCount = allLogs.filter(log => log.status === 'success').length;
      const failureCount = allLogs.filter(log => log.status === 'failure').length;

      // 时间范围
      const oldestLog = allLogs.length > 0 ? allLogs[allLogs.length - 1].execution_time : undefined;
      const newestLog = allLogs.length > 0 ? allLogs[0].execution_time : undefined;

      return {
        success: true,
        data: {
          totalLogs,
          executionLogs,
          errorLogs,
          auditLogs,
          successCount,
          failureCount,
          oldestLog,
          newestLog
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `获取日志统计失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 自动日志轮转
   * 根据配置自动清理旧日志
   * @param env 环境变量
   * @param maxDays 最大保留天数
   * @param maxLogs 最大日志数量
   * @returns 轮转结果
   */
  static async rotateLogsAutomatically(
    env: Environment,
    maxDays: number = 30,
    maxLogs: number = 10000
  ): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
    try {
      // 获取日志统计
      const statsResult = await this.getLogStatistics(env);

      if (!statsResult.success || !statsResult.data) {
        return { success: false, error: '获取日志统计失败' };
      }

      let deletedCount = 0;

      // 如果日志总数超过最大限制，按时间清理
      if (statsResult.data.totalLogs > maxLogs) {
        const cleanupResult = await this.cleanupOldLogs(env, maxDays);
        if (cleanupResult.success) {
          deletedCount = cleanupResult.deletedCount || 0;
        }
      }

      // 如果还是超过限制，继续清理更多
      if (statsResult.data.totalLogs - deletedCount > maxLogs) {
        const additionalDays = Math.floor(maxDays / 2);
        const additionalCleanup = await this.cleanupOldLogs(env, additionalDays);
        if (additionalCleanup.success) {
          deletedCount += additionalCleanup.deletedCount || 0;
        }
      }

      return { success: true, deletedCount };
    } catch (error) {
      return {
        success: false,
        error: `自动日志轮转失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
}

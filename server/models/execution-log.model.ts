import { ExecutionLog } from '../types/index.js';

/**
 * 执行日志模型类
 * 提供执行日志数据的验证和操作方法
 */
export class ExecutionLogModel {
  /**
   * 验证任务ID
   * @param taskId 任务ID
   * @returns 是否有效
   */
  /**
   * 验证任务ID
   * @param taskId 任务ID
   * @returns 是否有效
   */
  static validateTaskId(taskId: string | undefined): boolean {
    return !taskId || (typeof taskId === 'string' && taskId.trim().length > 0);
  }

  /**
   * 验证执行状态
   * @param status 执行状态
   * @returns 是否有效
   */
  static validateStatus(status: string): status is 'success' | 'failure' {
    return status === 'success' || status === 'failure';
  }

  /**
   * 验证响应时间
   * @param responseTime 响应时间（毫秒）
   * @returns 是否有效
   */
  static validateResponseTime(responseTime: number): boolean {
    return typeof responseTime === 'number' && responseTime >= 0 && responseTime <= 300000;
  }

  /**
   * 验证HTTP状态码
   * @param statusCode HTTP状态码
   * @returns 是否有效
   */
  static validateStatusCode(statusCode: number): boolean {
    return typeof statusCode === 'number' && statusCode >= 100 && statusCode <= 599;
  }

  /**
   * 验证错误消息
   * @param errorMessage 错误消息
   * @returns 是否有效
   */
  static validateErrorMessage(errorMessage: string): boolean {
    return typeof errorMessage === 'string' && errorMessage.length <= 1000;
  }

  /**
   * 验证详细信息
   * @param details 详细信息（JSON字符串）
   * @returns 是否有效
   */
  static validateDetails(details: string): boolean {
    if (typeof details !== 'string') {
      return false;
    }
    try {
      JSON.parse(details);
      return details.length <= 10000; // 限制详细信息长度
    } catch {
      return false;
    }
  }

  /**
   * 验证执行日志数据完整性
   * @param logData 日志数据
   * @returns 验证结果
   */
  static validate(logData: Partial<ExecutionLog>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证任务ID (如果是execution类型，则必须有taskId)
    if (logData.log_type === 'execution' && !this.validateTaskId(logData.task_id as string)) {
      errors.push('执行日志必须包含任务ID');
    }

    // 验证执行状态
    if (logData.status !== undefined && !this.validateStatus(logData.status)) {
      errors.push('执行状态必须是 success 或 failure');
    }

    // 验证响应时间
    if (logData.response_time !== undefined && !this.validateResponseTime(logData.response_time)) {
      errors.push('响应时间必须是0-300000毫秒之间的数字');
    }

    // 验证状态码
    if (logData.status_code !== undefined && !this.validateStatusCode(logData.status_code)) {
      errors.push('HTTP状态码必须是100-599之间的数字');
    }

    // 验证错误消息
    if (logData.error_message !== undefined && logData.error_message !== null && !this.validateErrorMessage(logData.error_message)) {
      errors.push('错误消息长度不能超过1000字符');
    }

    // 验证详细信息
    if (logData.details !== undefined && logData.details !== null && !this.validateDetails(logData.details)) {
      errors.push('详细信息必须是有效的JSON字符串，长度不超过10000字符');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 创建新执行日志对象
   * @param logData 日志数据
   * @returns 执行日志对象
   */
  static create(logData: {
    id: string;
    task_id?: string;
    log_type: 'execution' | 'system' | 'audit';
    status: 'success' | 'failure';
    response_time?: number;
    status_code?: number;
    error_message?: string;
    details?: any;
  }): ExecutionLog {
    return {
      id: logData.id,
      task_id: logData.task_id,
      log_type: logData.log_type,
      execution_time: new Date().toISOString(),
      status: logData.status,
      response_time: logData.response_time,
      status_code: logData.status_code,
      error_message: logData.error_message,
      details: logData.details ? JSON.stringify(logData.details) : undefined
    };
  }

  /**
   * 从数据库行创建执行日志对象
   * @param row 数据库行
   * @returns 执行日志对象
   */
  static fromDatabaseRow(row: any): ExecutionLog {
    return {
      id: row.id,
      task_id: row.task_id || undefined,
      log_type: row.log_type || 'execution',
      execution_time: row.execution_time,
      status: row.status,
      response_time: row.response_time || undefined,
      status_code: row.status_code || undefined,
      error_message: row.error_message || undefined,
      details: row.details || undefined
    };
  }

  /**
   * 转换为数据库插入格式
   * @param log 执行日志对象
   * @returns 数据库插入数据
   */
  static toDatabaseInsert(log: ExecutionLog): Record<string, any> {
    return {
      id: log.id,
      task_id: log.task_id || null,
      log_type: log.log_type,
      execution_time: log.execution_time,
      status: log.status,
      response_time: log.response_time || null,
      status_code: log.status_code || null,
      error_message: log.error_message || null,
      details: log.details || null
    };
  }

  /**
   * 创建成功日志
   * @param taskId 任务ID
   * @param responseTime 响应时间
   * @param statusCode HTTP状态码
   * @param details 详细信息
   * @returns 执行日志对象
   */
  static createSuccessLog(
    taskId: string,
    responseTime?: number,
    statusCode?: number,
    details?: any
  ): ExecutionLog {
    return this.create({
      id: crypto.randomUUID(),
      task_id: taskId,
      log_type: 'execution',
      status: 'success',
      response_time: responseTime,
      status_code: statusCode,
      details
    });
  }

  /**
   * 创建失败日志
   * @param taskId 任务ID
   * @param errorMessage 错误消息
   * @param statusCode HTTP状态码
   * @param details 详细信息
   * @returns 执行日志对象
   */
  static createFailureLog(
    taskId: string,
    errorMessage: string,
    statusCode?: number,
    details?: any
  ): ExecutionLog {
    return this.create({
      id: crypto.randomUUID(),
      task_id: taskId,
      log_type: 'execution',
      status: 'failure',
      error_message: errorMessage,
      status_code: statusCode,
      details
    });
  }
}
import { Task, KeepaliveConfig, NotificationConfig } from '../types/index.js';

/**
 * 任务模型类
 * 提供任务数据的验证和操作方法
 */
export class TaskModel {
  /**
   * 验证任务名称
   * @param name 任务名称
   * @returns 是否有效
   */
  static validateName(name: string): boolean {
    if (!name || typeof name !== 'string') {
      return false;
    }
    // 任务名称长度1-100字符，不能只包含空格
    return name.trim().length >= 1 && name.length <= 100;
  }

  /**
   * 验证任务类型
   * @param type 任务类型
   * @returns 是否有效
   */
  static validateType(type: string): type is 'keepalive' | 'notification' {
    return type === 'keepalive' || type === 'notification';
  }

  /**
   * 验证Cron表达式
   * @param schedule Cron表达式
   * @returns 是否有效
   */
  static validateSchedule(schedule?: string): boolean {
    if (!schedule || typeof schedule !== 'string') {
      return false;
    }
    // Cron表达式验证（5-7个字段），包含数字、*、/、-、,、?、L、W等常见特殊字符
    const parts = schedule.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 7) {
      return false;
    }
    const cronPartRegex = /^[\d\*\/\-\,\?LW]+$/i;
    return parts.every(part => cronPartRegex.test(part));
  }

  /**
   * 验证保活任务配置
   * @param config 保活配置
   * @returns 验证结果
   */
  static validateKeepaliveConfig(config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('保活配置必须是对象');
      return { valid: false, errors };
    }

    // 验证URL
    if (!config.url || typeof config.url !== 'string') {
      errors.push('URL不能为空');
    } else {
      try {
        new URL(config.url);
      } catch {
        errors.push('URL格式无效');
      }
    }

    // 验证HTTP方法
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    if (!config.method || !validMethods.includes(config.method)) {
      errors.push('HTTP方法必须是 GET、POST、PUT 或 DELETE');
    }

    // 验证超时时间
    if (config.timeout !== undefined) {
      if (typeof config.timeout !== 'number' || config.timeout <= 0 || config.timeout > 300000) {
        errors.push('超时时间必须是1-300000毫秒之间的数字');
      }
    }

    // 验证请求头
    if (config.headers !== undefined) {
      if (typeof config.headers !== 'object' || Array.isArray(config.headers)) {
        errors.push('请求头必须是对象');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证通知任务配置
   * @param config 通知配置
   * @returns 验证结果
   */
  static validateNotificationConfig(config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('通知配置必须是对象');
      return { valid: false, errors };
    }

    // 验证消息内容
    if (!config.message || typeof config.message !== 'string') {
      errors.push('通知消息不能为空');
    } else if (config.message.length > 1000) {
      errors.push('通知消息长度不能超过1000字符');
    }

    // 验证标题（可选）
    if (config.title !== undefined) {
      if (typeof config.title !== 'string' || config.title.length > 100) {
        errors.push('通知标题必须是字符串且长度不超过100字符');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证NotifyX配置
   * @param config NotifyX配置
   * @returns 验证结果
   */
  static validateNotifyXConfig(config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('NotifyX配置必须是对象');
      return { valid: false, errors };
    }

    // 验证API密钥
    if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim().length === 0) {
      errors.push('NotifyX API密钥不能为空');
    }

    // 验证标题
    if (!config.title || typeof config.title !== 'string' || config.title.trim().length === 0) {
      errors.push('NotifyX标题不能为空');
    }

    // 验证消息内容
    if (!config.message || typeof config.message !== 'string' || config.message.trim().length === 0) {
      errors.push('NotifyX消息内容不能为空');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证任务数据完整性
   * @param taskData 任务数据
   * @returns 验证结果
   */
  static validate(taskData: Partial<Task>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证任务名称
    if (taskData.name !== undefined && !this.validateName(taskData.name)) {
      errors.push('任务名称格式无效：长度1-100字符，不能只包含空格');
    }

    // 验证任务类型
    if (taskData.type !== undefined && !this.validateType(taskData.type)) {
      errors.push('任务类型必须是 keepalive 或 notification');
    }

    if (taskData.type === 'keepalive' && !this.validateSchedule(taskData.cronExpression)) {
      errors.push('Cron表达式格式无效');
    }

    // 验证配置
    if (taskData.config !== undefined && taskData.type !== undefined) {
      if (taskData.type === 'keepalive') {
        const configValidation = this.validateKeepaliveConfig(taskData.config);
        if (!configValidation.valid) {
          errors.push(...configValidation.errors);
        }
      } else if (taskData.type === 'notification') {
        const configValidation = this.validateNotificationConfig(taskData.config);
        if (!configValidation.valid) {
          errors.push(...configValidation.errors);
        }
      }
    }

    // 验证创建者ID
    if (taskData.created_by !== undefined && (!taskData.created_by || typeof taskData.created_by !== 'string')) {
      errors.push('创建者ID不能为空');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 创建新任务对象
   * @param taskData 任务数据
   * @returns 任务对象
   */
  static create(taskData: {
    id: string;
    name: string;
    type: 'keepalive' | 'notification';
    config: KeepaliveConfig | NotificationConfig;
    cronExpression?: string;
    created_by: string;
    enabled?: boolean;
  }): Task {
    const now = new Date().toISOString();
    return {
      id: taskData.id,
      name: taskData.name,
      type: taskData.type,
      config: taskData.config,
      cronExpression: taskData.cronExpression,
      enabled: taskData.enabled !== undefined ? taskData.enabled : true,
      created_by: taskData.created_by,
      created_at: now,
      updated_at: now
    };
  }

  /**
   * 更新任务对象
   * @param existingTask 现有任务
   * @param updateData 更新数据
   * @returns 更新后的任务对象
   */
  static update(existingTask: Task, updateData: Partial<Task>): Task {
    return {
      ...existingTask,
      ...updateData,
      updated_at: new Date().toISOString()
    };
  }

  /**
   * 从数据库行创建任务对象
   * @param row 数据库行
   * @returns 任务对象
   */
  static fromDatabaseRow(row: any): Task {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      cronExpression: row.cronExpression,
      config: JSON.parse(row.config),
      enabled: Boolean(row.enabled),
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_executed: row.last_executed || undefined,
      last_status: row.last_status || undefined
    };
  }

  /**
   * 转换为数据库插入格式
   * @param task 任务对象
   * @returns 数据库插入数据
   */
  static toDatabaseInsert(task: Task): Record<string, any> {
    return {
      id: task.id,
      name: task.name,
      type: task.type,
      config: JSON.stringify(task.config),
      cronExpression: task.cronExpression,
      enabled: task.enabled ? 1 : 0,
      created_by: task.created_by,
      created_at: task.created_at,
      updated_at: task.updated_at,
      last_executed: task.last_executed || null,
      last_status: task.last_status || null
    };
  }
}
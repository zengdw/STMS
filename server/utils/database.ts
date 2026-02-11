import { Environment, User, Task, ExecutionLog, NotificationSettings } from '../types/index.js';
import { UserModel } from '../models/user.model.js';
import { TaskModel } from '../models/task.model.js';
import { ExecutionLogModel } from '../models/execution-log.model.js';
import { NotificationSettingsModel } from '../models/notification-settings.model.js';

/**
 * 数据库操作结果
 */
export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 数据库工具类
 * 提供数据库连接和基础操作方法
 */
export class DatabaseUtils {
  /**
   * 最大重试次数
   */
  private static readonly MAX_RETRIES = 3;

  /**
   * 重试延迟（毫秒）
   */
  private static readonly RETRY_DELAY = 100;

  /**
   * 执行带重试的数据库操作
   * @param operation 数据库操作函数
   * @param retries 剩余重试次数
   * @returns 操作结果
   */
  private static async executeWithRetry<T>(
    operation: () => Promise<T>,
    retries: number = this.MAX_RETRIES
  ): Promise<DatabaseResult<T>> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';

      if (retries > 0) {
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        return this.executeWithRetry(operation, retries - 1);
      }

      return {
        success: false,
        error: `数据库操作失败（已重试${this.MAX_RETRIES}次）: ${errorMessage}`
      };
    }
  }
  /**
   * 测试数据库连接
   * @param env 环境变量
   * @returns 连接测试结果
   */
  static async testConnection(env: Environment): Promise<{ success: boolean; error?: string }> {
    const result = await this.executeWithRetry(async () => {
      await env.DB.prepare('SELECT 1 as test').first();
      return true;
    });

    return result.success
      ? { success: true }
      : { success: false, error: result.error };
  }

  // ==================== 用户CRUD操作 ====================

  /**
   * 创建用户
   * @param env 环境变量
   * @param user 用户对象
   * @returns 操作结果
   */
  static async createUser(env: Environment, user: User): Promise<DatabaseResult<User>> {
    // 验证用户数据
    const validation = UserModel.validate(user);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    return this.executeWithRetry(async () => {
      const data = UserModel.toDatabaseInsert(user);
      await env.DB.prepare(
        'INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        data.id,
        data.username,
        data.password_hash,
        data.role,
        data.created_at,
        data.updated_at
      ).run();

      return user;
    });
  }

  /**
   * 根据ID获取用户
   * @param env 环境变量
   * @param id 用户ID
   * @returns 操作结果
   */
  static async getUserById(env: Environment, id: string): Promise<DatabaseResult<User | null>> {
    return this.executeWithRetry(async () => {
      const row = await env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(id).first();

      return row ? UserModel.fromDatabaseRow(row) : null;
    });
  }

  /**
   * 根据用户名获取用户
   * @param env 环境变量
   * @param username 用户名
   * @returns 操作结果
   */
  static async getUserByUsername(env: Environment, username: string): Promise<DatabaseResult<User | null>> {
    return this.executeWithRetry(async () => {
      const row = await env.DB.prepare(
        'SELECT * FROM users WHERE username = ?'
      ).bind(username).first();

      return row ? UserModel.fromDatabaseRow(row) : null;
    });
  }

  /**
   * 更新用户
   * @param env 环境变量
   * @param id 用户ID
   * @param updateData 更新数据
   * @returns 操作结果
   */
  static async updateUser(env: Environment, id: string, updateData: Partial<User>): Promise<DatabaseResult<User>> {
    // 验证更新数据
    const validation = UserModel.validate(updateData);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    return this.executeWithRetry(async () => {
      // 获取现有用户
      const existingResult = await this.getUserById(env, id);
      if (!existingResult.success || !existingResult.data) {
        throw new Error('用户不存在');
      }

      // 更新用户对象
      const updatedUser = UserModel.update(existingResult.data, updateData);
      const data = UserModel.toDatabaseInsert(updatedUser);

      // 执行更新
      await env.DB.prepare(
        'UPDATE users SET username = ?, password_hash = ?, role = ?, updated_at = ? WHERE id = ?'
      ).bind(
        data.username,
        data.password_hash,
        data.role,
        data.updated_at,
        id
      ).run();

      return updatedUser;
    });
  }

  /**
   * 删除用户
   * @param env 环境变量
   * @param id 用户ID
   * @returns 操作结果
   */
  static async deleteUser(env: Environment, id: string): Promise<DatabaseResult<boolean>> {
    return this.executeWithRetry(async () => {
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return true;
    });
  }

  /**
   * 获取所有用户
   * @param env 环境变量
   * @returns 操作结果
   */
  static async getAllUsers(env: Environment): Promise<DatabaseResult<User[]>> {
    return this.executeWithRetry(async () => {
      const result = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
      return result.results.map(row => UserModel.fromDatabaseRow(row));
    });
  }

  // ==================== 任务CRUD操作 ====================

  /**
   * 创建任务
   * @param env 环境变量
   * @param task 任务对象
   * @returns 操作结果
   */
  static async createTask(env: Environment, task: Task): Promise<DatabaseResult<Task>> {
    // 验证任务数据
    const validation = TaskModel.validate(task);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    return this.executeWithRetry(async () => {
      const data = TaskModel.toDatabaseInsert(task);
      await env.DB.prepare(
        'INSERT INTO tasks (id, name, type, schedule, config, enabled, created_by, created_at, updated_at, last_executed, last_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        data.id,
        data.name,
        data.type,
        data.schedule,
        data.config,
        data.enabled,
        data.created_by,
        data.created_at,
        data.updated_at,
        data.last_executed,
        data.last_status
      ).run();

      return task;
    });
  }

  /**
   * 根据ID获取任务
   * @param env 环境变量
   * @param id 任务ID
   * @returns 操作结果
   */
  static async getTaskById(env: Environment, id: string): Promise<DatabaseResult<Task | null>> {
    return this.executeWithRetry(async () => {
      const row = await env.DB.prepare(
        'SELECT * FROM tasks WHERE id = ?'
      ).bind(id).first();

      return row ? TaskModel.fromDatabaseRow(row) : null;
    });
  }

  /**
   * 获取所有任务
   * @param env 环境变量
   * @param filter 筛选条件
   * @returns 操作结果
   */
  static async getAllTasks(env: Environment, filter?: {
    type?: 'keepalive' | 'notification';
    enabled?: boolean;
    created_by?: string;
  }): Promise<DatabaseResult<Task[]>> {
    return this.executeWithRetry(async () => {
      let query = 'SELECT * FROM tasks WHERE 1=1';
      const bindings: any[] = [];

      if (filter?.type) {
        query += ' AND type = ?';
        bindings.push(filter.type);
      }

      if (filter?.enabled !== undefined) {
        query += ' AND enabled = ?';
        bindings.push(filter.enabled ? 1 : 0);
      }

      if (filter?.created_by) {
        query += ' AND created_by = ?';
        bindings.push(filter.created_by);
      }

      query += ' ORDER BY created_at DESC';

      const stmt = env.DB.prepare(query);
      const result = bindings.length > 0
        ? await stmt.bind(...bindings).all()
        : await stmt.all();

      return result.results.map(row => TaskModel.fromDatabaseRow(row));
    });
  }

  /**
   * 更新任务
   * @param env 环境变量
   * @param id 任务ID
   * @param updateData 更新数据
   * @returns 操作结果
   */
  static async updateTask(env: Environment, id: string, updateData: Partial<Task>): Promise<DatabaseResult<Task>> {
    // 验证更新数据
    const validation = TaskModel.validate(updateData);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    return this.executeWithRetry(async () => {
      // 获取现有任务
      const existingResult = await this.getTaskById(env, id);
      if (!existingResult.success || !existingResult.data) {
        throw new Error('任务不存在');
      }

      // 更新任务对象
      const updatedTask = TaskModel.update(existingResult.data, updateData);
      const data = TaskModel.toDatabaseInsert(updatedTask);

      // 执行更新
      await env.DB.prepare(
        'UPDATE tasks SET name = ?, type = ?, schedule = ?, config = ?, enabled = ?, updated_at = ?, last_executed = ?, last_status = ? WHERE id = ?'
      ).bind(
        data.name,
        data.type,
        data.schedule,
        data.config,
        data.enabled,
        data.updated_at,
        data.last_executed,
        data.last_status,
        id
      ).run();

      return updatedTask;
    });
  }

  /**
   * 删除任务
   * @param env 环境变量
   * @param id 任务ID
   * @returns 操作结果
   */
  static async deleteTask(env: Environment, id: string): Promise<DatabaseResult<boolean>> {
    return this.executeWithRetry(async () => {
      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
      return true;
    });
  }

  /**
   * 获取启用的任务
   * @param env 环境变量
   * @param type 任务类型（可选）
   * @returns 操作结果
   */
  static async getEnabledTasks(env: Environment, type?: 'keepalive' | 'notification'): Promise<DatabaseResult<Task[]>> {
    return this.getAllTasks(env, { enabled: true, type });
  }

  // ==================== 执行日志CRUD操作 ====================

  /**
   * 创建执行日志
   * @param env 环境变量
   * @param log 执行日志对象
   * @returns 操作结果
   */
  static async createExecutionLog(env: Environment, log: ExecutionLog): Promise<DatabaseResult<ExecutionLog>> {
    // 验证日志数据
    const validation = ExecutionLogModel.validate(log);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    return this.executeWithRetry(async () => {
      const data = ExecutionLogModel.toDatabaseInsert(log);
      await env.DB.prepare(
        'INSERT INTO execution_logs (id, task_id, log_type, execution_time, status, response_time, status_code, error_message, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        data.id,
        data.task_id,
        data.log_type,
        data.execution_time,
        data.status,
        data.response_time,
        data.status_code,
        data.error_message,
        data.details
      ).run();

      return log;
    });
  }

  /**
   * 根据ID获取执行日志
   * @param env 环境变量
   * @param id 日志ID
   * @returns 操作结果
   */
  static async getExecutionLogById(env: Environment, id: string): Promise<DatabaseResult<ExecutionLog | null>> {
    return this.executeWithRetry(async () => {
      const row = await env.DB.prepare(
        'SELECT * FROM execution_logs WHERE id = ?'
      ).bind(id).first();

      return row ? ExecutionLogModel.fromDatabaseRow(row) : null;
    });
  }

  /**
   * 获取任务的执行日志
   * @param env 环境变量
   * @param taskId 任务ID
   * @param limit 限制数量
   * @param offset 偏移量
   * @returns 操作结果
   */
  static async getExecutionLogsByTaskId(
    env: Environment,
    taskId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<DatabaseResult<ExecutionLog[]>> {
    return this.executeWithRetry(async () => {
      const result = await env.DB.prepare(
        'SELECT * FROM execution_logs WHERE task_id = ? ORDER BY execution_time DESC LIMIT ? OFFSET ?'
      ).bind(taskId, limit, offset).all();

      return result.results.map(row => ExecutionLogModel.fromDatabaseRow(row));
    });
  }

  /**
   * 获取所有执行日志
   * @param env 环境变量
   * @param limit 限制数量
   * @param offset 偏移量
   * @returns 操作结果
   */
  static async getAllExecutionLogs(
    env: Environment,
    limit: number = 100,
    offset: number = 0
  ): Promise<DatabaseResult<ExecutionLog[]>> {
    return this.executeWithRetry(async () => {
      const result = await env.DB.prepare(
        'SELECT * FROM execution_logs ORDER BY execution_time DESC LIMIT ? OFFSET ?'
      ).bind(limit, offset).all();

      return result.results.map(row => ExecutionLogModel.fromDatabaseRow(row));
    });
  }

  /**
   * 获取执行日志（带筛选）
   * @param env 环境变量
   * @param filter 筛选条件
   * @returns 操作结果
   */
  static async getExecutionLogs(env: Environment, filter?: {
    taskId?: string;
    logType?: 'execution' | 'system' | 'audit';
    status?: 'success' | 'failure';
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<DatabaseResult<ExecutionLog[]>> {
    return this.executeWithRetry(async () => {
      let query = 'SELECT * FROM execution_logs WHERE 1=1';
      const bindings: any[] = [];

      if (filter?.taskId) {
        query += ' AND task_id = ?';
        bindings.push(filter.taskId);
      }

      if (filter?.logType) {
        query += ' AND log_type = ?';
        bindings.push(filter.logType);
      }

      if (filter?.status) {
        query += ' AND status = ?';
        bindings.push(filter.status);
      }

      if (filter?.startDate) {
        query += ' AND execution_time >= ?';
        bindings.push(filter.startDate);
      }

      if (filter?.endDate) {
        query += ' AND execution_time <= ?';
        bindings.push(filter.endDate);
      }

      query += ' ORDER BY execution_time DESC';

      if (filter?.limit) {
        query += ' LIMIT ?';
        bindings.push(filter.limit);
      }

      if (filter?.offset) {
        query += ' OFFSET ?';
        bindings.push(filter.offset);
      }

      const stmt = env.DB.prepare(query);
      const result = bindings.length > 0
        ? await stmt.bind(...bindings).all()
        : await stmt.all();

      return result.results.map(row => ExecutionLogModel.fromDatabaseRow(row));
    });
  }

  /**
   * 删除旧的执行日志
   * @param env 环境变量
   * @param beforeDate 删除此日期之前的日志
   * @returns 操作结果
   */
  static async deleteOldExecutionLogs(env: Environment, beforeDate: string): Promise<DatabaseResult<number>> {
    return this.executeWithRetry(async () => {
      const result = await env.DB.prepare(
        'DELETE FROM execution_logs WHERE execution_time < ?'
      ).bind(beforeDate).run();

      return result.meta.changes || 0;
    });
  }

  // ==================== 通知设置CRUD操作 ====================

  /**
   * 创建通知设置
   * @param env 环境变量
   * @param settings 通知设置对象
   * @returns 操作结果
   */
  static async createNotificationSettings(
    env: Environment,
    settings: NotificationSettings
  ): Promise<DatabaseResult<NotificationSettings>> {
    // 验证通知设置数据
    const validation = NotificationSettingsModel.validate(settings);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    return this.executeWithRetry(async () => {
      const data = NotificationSettingsModel.toDatabaseInsert(settings);
      await env.DB.prepare(
        `INSERT INTO notification_settings 
         (id, user_id, email_enabled, email_address, email_api_key, webhook_enabled, webhook_url, 
          notifyx_enabled, notifyx_api_key, failure_threshold, email_from, email_name, allowed_time_slots, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        data.id,
        data.user_id,
        data.email_enabled,
        data.email_address,
        data.email_api_key,
        data.webhook_enabled,
        data.webhook_url,
        data.notifyx_enabled,
        data.notifyx_api_key,
        data.failure_threshold,
        data.email_from,
        data.email_name,
        data.allowed_time_slots,
        data.created_at,
        data.updated_at
      ).run();

      return settings;
    });
  }

  /**
   * 根据用户ID获取通知设置
   * @param env 环境变量
   * @param userId 用户ID
   * @returns 操作结果
   */
  static async getNotificationSettingsByUserId(
    env: Environment,
    userId: string
  ): Promise<DatabaseResult<NotificationSettings | null>> {
    return this.executeWithRetry(async () => {
      const row = await env.DB.prepare(
        'SELECT * FROM notification_settings WHERE user_id = ?'
      ).bind(userId).first();

      return row ? NotificationSettingsModel.fromDatabaseRow(row) : null;
    });
  }

  /**
   * 更新通知设置
   * @param env 环境变量
   * @param userId 用户ID
   * @param updateData 更新数据
   * @returns 操作结果
   */
  static async updateNotificationSettings(
    env: Environment,
    userId: string,
    updateData: Partial<NotificationSettings>
  ): Promise<DatabaseResult<NotificationSettings>> {
    // 验证更新数据
    const validation = NotificationSettingsModel.validate(updateData);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    return this.executeWithRetry(async () => {
      // 获取现有设置
      const existingResult = await this.getNotificationSettingsByUserId(env, userId);
      if (!existingResult.success || !existingResult.data) {
        throw new Error('通知设置不存在');
      }

      // 更新设置对象
      const updatedSettings = NotificationSettingsModel.update(existingResult.data, updateData);
      const data = NotificationSettingsModel.toDatabaseInsert(updatedSettings);

      // 执行更新
      await env.DB.prepare(
        `UPDATE notification_settings 
         SET email_enabled = ?, email_address = ?, email_api_key = ?,
             webhook_enabled = ?, webhook_url = ?, 
             notifyx_enabled = ?, notifyx_api_key = ?,
             failure_threshold = ?, email_from = ?, email_name = ?, allowed_time_slots = ?, updated_at = ? 
         WHERE user_id = ?`
      ).bind(
        data.email_enabled,
        data.email_address,
        data.email_api_key,
        data.webhook_enabled,
        data.webhook_url,
        data.notifyx_enabled,
        data.notifyx_api_key,
        data.failure_threshold,
        data.email_from,
        data.email_name,
        data.allowed_time_slots,
        data.updated_at,
        userId
      ).run();

      return updatedSettings;
    });
  }

  /**
   * 删除通知设置
   * @param env 环境变量
   * @param userId 用户ID
   * @returns 操作结果
   */
  static async deleteNotificationSettings(env: Environment, userId: string): Promise<DatabaseResult<boolean>> {
    return this.executeWithRetry(async () => {
      await env.DB.prepare('DELETE FROM notification_settings WHERE user_id = ?').bind(userId).run();
      return true;
    });
  }

  // ==================== 原有方法保持不变 ====================


  /**
   * 检查表是否存在
   * @param env 环境变量
   * @param tableName 表名
   * @returns 表是否存在
   */
  static async tableExists(env: Environment, tableName: string): Promise<boolean> {
    try {
      const result = await env.DB.prepare(
        'SELECT name FROM sqlite_master WHERE type="table" AND name=?'
      ).bind(tableName).first();
      return !!result;
    } catch {
      return false;
    }
  }

  /**
   * 获取表的行数
   * @param env 环境变量
   * @param tableName 表名
   * @returns 行数
   */
  static async getTableRowCount(env: Environment, tableName: string): Promise<number> {
    try {
      const result = await env.DB.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).first();
      return (result as any)?.count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * 验证数据库架构完整性
   * @param env 环境变量
   * @returns 验证结果
   */
  static async validateSchema(env: Environment): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const requiredTables = ['users', 'tasks', 'execution_logs', 'notification_settings'];

    try {
      // 检查所有必需的表是否存在
      for (const table of requiredTables) {
        const exists = await this.tableExists(env, table);
        if (!exists) {
          errors.push(`表 ${table} 不存在`);
        }
      }

      // 检查索引是否存在
      const indexResult = await env.DB.prepare(
        'SELECT name FROM sqlite_master WHERE type="index" AND name LIKE "idx_%"'
      ).all();

      const expectedIndexes = [
        'idx_tasks_type',
        'idx_tasks_enabled',
        'idx_tasks_created_by',
        'idx_execution_logs_task_id',
        'idx_execution_logs_log_type',
        'idx_execution_logs_execution_time',
        'idx_execution_logs_status'
      ];

      const existingIndexes = indexResult.results.map((row: any) => row.name);

      for (const expectedIndex of expectedIndexes) {
        if (!existingIndexes.includes(expectedIndex)) {
          errors.push(`索引 ${expectedIndex} 不存在`);
        }
      }

    } catch (error) {
      errors.push(`数据库架构验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 执行数据库健康检查
   * @param env 环境变量
   * @returns 健康检查结果
   */
  static async healthCheck(env: Environment): Promise<{
    healthy: boolean;
    details: {
      connection: boolean;
      schema: boolean;
      tables: Record<string, number>;
    };
    errors: string[];
  }> {
    const errors: string[] = [];
    let connectionHealthy = false;
    let schemaHealthy = false;
    const tables: Record<string, number> = {};

    // 测试连接
    const connectionTest = await this.testConnection(env);
    connectionHealthy = connectionTest.success;
    if (!connectionHealthy && connectionTest.error) {
      errors.push(`数据库连接失败: ${connectionTest.error}`);
    }

    // 验证架构
    if (connectionHealthy) {
      const schemaValidation = await this.validateSchema(env);
      schemaHealthy = schemaValidation.valid;
      if (!schemaHealthy) {
        errors.push(...schemaValidation.errors);
      }

      // 获取表行数
      const tableNames = ['users', 'tasks', 'execution_logs', 'notification_settings'];
      for (const tableName of tableNames) {
        tables[tableName] = await this.getTableRowCount(env, tableName);
      }
    }

    return {
      healthy: connectionHealthy && schemaHealthy,
      details: {
        connection: connectionHealthy,
        schema: schemaHealthy,
        tables
      },
      errors
    };
  }
}
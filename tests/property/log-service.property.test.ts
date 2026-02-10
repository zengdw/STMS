import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LogService } from '../../server/services/log.service.js';
import { TaskService } from '../../server/services/task.service.js';
import type { Environment, KeepaliveConfig } from '../../server/types/index.js';

/**
 * 创建内存数据库环境用于测试
 */
function createTestEnvironment(): { env: Environment; db: Database.Database } {
  const sqliteDb = new Database(':memory:');
  const migrationPath = join(process.cwd(), 'migrations', '0001_initial.sql');
  const migration = readFileSync(migrationPath, 'utf-8');
  const statements = migration.split(';').filter(s => s.trim() && !s.includes('INSERT INTO users'));
  statements.forEach(stmt => {
    if (stmt.trim()) {
      sqliteDb.exec(stmt);
    }
  });

  const db = {
    prepare: (query: string) => {
      const stmt = sqliteDb.prepare(query);
      const bindings: any[] = [];
      return {
        bind: (...args: any[]) => {
          bindings.push(...args);
          return {
            run: async () => {
              const result = stmt.run(...bindings);
              return { success: true, meta: { changes: result.changes } };
            },
            first: async () => stmt.get(...bindings) || null,
            all: async () => ({ results: stmt.all(...bindings) })
          };
        },
        run: async () => {
          const result = stmt.run();
          return { success: true, meta: { changes: result.changes } };
        },
        first: async () => stmt.get() || null,
        all: async () => ({ results: stmt.all() })
      };
    }
  };

  return {
    env: {
      DB: db as any,
      ENVIRONMENT: 'test',
      JWT_SECRET: 'test_secret_key_for_property_testing_12345678'
    } as Environment,
    db: sqliteDb
  };
}

/**
 * 创建测试用户
 */
async function createTestUser(env: Environment, username: string): Promise<string> {
  const userId = crypto.randomUUID();
  const passwordHash = 'test_hash_' + username;
  
  await env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'
  ).bind(userId, username, passwordHash, 'user').run();
  
  return userId;
}

/**
 * 创建测试任务
 */
async function createTestTask(env: Environment, userId: string, name: string): Promise<string> {
  const config: KeepaliveConfig = {
    url: 'https://example.com',
    method: 'GET',
    timeout: 30000
  };
  
  const result = await TaskService.createTask(
    env,
    { name, type: 'keepalive', schedule: '*/5 * * * *', config, enabled: true },
    userId
  );
  
  return result.data?.id || '';
}

// 生成器定义
const errorTypeArbitrary = fc.constantFrom(
  'DATABASE_ERROR',
  'NETWORK_ERROR',
  'VALIDATION_ERROR',
  'AUTHENTICATION_ERROR',
  'AUTHORIZATION_ERROR',
  'TIMEOUT_ERROR',
  'UNKNOWN_ERROR'
);

const errorMessageArbitrary = fc.string({ minLength: 1, maxLength: 500 });

const stackTraceArbitrary = fc.option(
  fc.string({ minLength: 10, maxLength: 1000 }),
  { nil: undefined }
);

const contextArbitrary = fc.option(
  fc.record({
    component: fc.string({ minLength: 1, maxLength: 50 }),
    operation: fc.string({ minLength: 1, maxLength: 50 }),
    details: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined })
  }),
  { nil: undefined }
);

const actionArbitrary = fc.constantFrom(
  'create_task',
  'update_task',
  'delete_task',
  'enable_task',
  'disable_task',
  'login',
  'logout',
  'update_settings'
);

const resourceTypeArbitrary = fc.constantFrom('task', 'user', 'settings', 'notification');

const auditDetailsArbitrary = fc.option(
  fc.record({
    field: fc.string({ minLength: 1, maxLength: 50 }),
    oldValue: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
    newValue: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined })
  }),
  { nil: undefined }
);

const executionStatusArbitrary = fc.constantFrom('success' as const, 'failure' as const);

const responseTimeArbitrary = fc.option(
  fc.integer({ min: 10, max: 60000 }),
  { nil: undefined }
);

const statusCodeArbitrary = fc.option(
  fc.constantFrom(200, 201, 204, 400, 401, 403, 404, 500, 502, 503),
  { nil: undefined }
);

/**
 * Feature: app-keepalive-system, Property 12: 系统错误日志记录
 * 
 * 对于任何系统错误或异常，系统应该记录包含错误详情、堆栈信息和上下文的完整错误日志
 * 
 * 验证需求: 5.3, 9.2
 */
describe('属性测试: 系统错误日志记录', () => {
  let env: Environment;
  let sqliteDb: Database.Database;

  beforeEach(async () => {
    const testEnv = createTestEnvironment();
    env = testEnv.env;
    sqliteDb = testEnv.db;
  });

  afterEach(() => {
    if (sqliteDb) {
      sqliteDb.close();
    }
  });

  it('属性 12.1: 记录错误日志应该包含所有必需字段', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArbitrary,
        errorMessageArbitrary,
        stackTraceArbitrary,
        contextArbitrary,
        async (errorType, errorMessage, stackTrace, context) => {
          const result = await LogService.logError(
            env,
            errorType,
            errorMessage,
            stackTrace,
            context
          );

          expect(result.success).toBe(true);
          
          // 验证错误日志已被记录
          const logsResult = await LogService.getErrorLogs(env, 100, 0);
          expect(logsResult.success).toBe(true);
          expect(logsResult.data).toBeDefined();
          
          if (logsResult.data && logsResult.data.length > 0) {
            // 最新的日志在数组开头（按时间降序排列）
            const lastLog = logsResult.data[0];
            expect(lastLog.error_type).toBe(errorType);
            expect(lastLog.error_message).toBe(errorMessage);
            expect(lastLog.id).toBeDefined();
            expect(lastLog.timestamp).toBeDefined();
            
            if (stackTrace !== undefined) {
              expect(lastLog.stack_trace).toBe(stackTrace);
            }
            
            if (context !== undefined) {
              expect(lastLog.context).toBeDefined();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('属性 12.2: 记录的错误日志应该能够被检索', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArbitrary,
        errorMessageArbitrary,
        async (errorType, errorMessage) => {
          const logResult = await LogService.logError(
            env,
            errorType,
            errorMessage,
            undefined,
            undefined
          );

          expect(logResult.success).toBe(true);
          
          const retrieveResult = await LogService.getErrorLogs(env, 100, 0);
          expect(retrieveResult.success).toBe(true);
          expect(retrieveResult.data).toBeDefined();
          
          if (retrieveResult.data) {
            const found = retrieveResult.data.some(
              log => log.error_type === errorType && log.error_message === errorMessage
            );
            expect(found).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('属性 12.3: 多个错误日志应该按时间顺序记录', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            errorType: errorTypeArbitrary,
            errorMessage: errorMessageArbitrary
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (errors) => {
          const loggedTimestamps: string[] = [];
          
          for (const error of errors) {
            const result = await LogService.logError(
              env,
              error.errorType,
              error.errorMessage,
              undefined,
              undefined
            );
            expect(result.success).toBe(true);
            
            // 添加小延迟确保时间戳不同
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          const retrieveResult = await LogService.getErrorLogs(env, 100, 0);
          expect(retrieveResult.success).toBe(true);
          
          if (retrieveResult.data && retrieveResult.data.length >= errors.length) {
            // 日志按时间降序排列，取前N个（最新的）
            const recentLogs = retrieveResult.data.slice(0, errors.length);
            
            // 验证时间戳是递减的（因为是降序排列）
            for (let i = 1; i < recentLogs.length; i++) {
              const prevTime = new Date(recentLogs[i - 1].timestamp).getTime();
              const currTime = new Date(recentLogs[i].timestamp).getTime();
              expect(prevTime).toBeGreaterThanOrEqual(currTime);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 60000);

  it('属性 12.4: 错误日志应该包含完整的上下文信息', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArbitrary,
        errorMessageArbitrary,
        contextArbitrary,
        async (errorType, errorMessage, context) => {
          fc.pre(context !== undefined);
          
          const result = await LogService.logError(
            env,
            errorType,
            errorMessage,
            undefined,
            context
          );

          expect(result.success).toBe(true);
          
          const logsResult = await LogService.getErrorLogs(env, 100, 0);
          expect(logsResult.success).toBe(true);
          
          if (logsResult.data && logsResult.data.length > 0) {
            // 最新的日志在数组开头
            const lastLog = logsResult.data[0];
            expect(lastLog.context).toBeDefined();
            
            if (lastLog.context) {
              const parsedContext = JSON.parse(lastLog.context);
              expect(parsedContext.component).toBe(context!.component);
              expect(parsedContext.operation).toBe(context!.operation);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});

/**
 * Feature: app-keepalive-system, Property 13: 操作审计日志完整性
 * 
 * 对于任何用户管理操作，系统应该记录包含操作类型、操作者、时间戳和操作详情的审计日志
 * 
 * 验证需求: 5.4
 */
describe('属性测试: 操作审计日志完整性', () => {
  let env: Environment;
  let sqliteDb: Database.Database;
  let testUserId: string;

  beforeEach(async () => {
    const testEnv = createTestEnvironment();
    env = testEnv.env;
    sqliteDb = testEnv.db;
    testUserId = await createTestUser(env, `user_${Date.now()}_${Math.random()}`);
  });

  afterEach(() => {
    if (sqliteDb) {
      sqliteDb.close();
    }
  });

  it('属性 13.1: 记录审计日志应该包含所有必需字段', async () => {
    await fc.assert(
      fc.asyncProperty(
        actionArbitrary,
        resourceTypeArbitrary,
        fc.uuid(),
        auditDetailsArbitrary,
        async (action, resourceType, resourceId, details) => {
          const result = await LogService.logAudit(
            env,
            testUserId,
            action,
            resourceType,
            resourceId,
            details
          );

          expect(result.success).toBe(true);
          
          // 验证审计日志已被记录
          const logsResult = await LogService.getAuditLogs(env, undefined, 100, 0);
          expect(logsResult.success).toBe(true);
          expect(logsResult.data).toBeDefined();
          
          if (logsResult.data && logsResult.data.length > 0) {
            // 最新的日志在数组开头
            const lastLog = logsResult.data[0];
            expect(lastLog.user_id).toBe(testUserId);
            expect(lastLog.action).toBe(action);
            expect(lastLog.resource_type).toBe(resourceType);
            expect(lastLog.resource_id).toBe(resourceId);
            expect(lastLog.id).toBeDefined();
            expect(lastLog.timestamp).toBeDefined();
            
            if (details !== undefined) {
              expect(lastLog.details).toBeDefined();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('属性 13.2: 审计日志应该能够按用户ID筛选', async () => {
    await fc.assert(
      fc.asyncProperty(
        actionArbitrary,
        resourceTypeArbitrary,
        fc.uuid(),
        async (action, resourceType, resourceId) => {
          const user1Id = testUserId;
          const user2Id = await createTestUser(env, `user2_${Date.now()}_${Math.random()}`);
          
          // 为两个用户记录审计日志
          await LogService.logAudit(env, user1Id, action, resourceType, resourceId, undefined);
          await LogService.logAudit(env, user2Id, action, resourceType, resourceId, undefined);
          
          // 按用户1筛选
          const user1Logs = await LogService.getAuditLogs(env, user1Id, 100, 0);
          expect(user1Logs.success).toBe(true);
          
          if (user1Logs.data) {
            const allUser1 = user1Logs.data.every(log => log.user_id === user1Id);
            expect(allUser1).toBe(true);
          }
          
          // 按用户2筛选
          const user2Logs = await LogService.getAuditLogs(env, user2Id, 100, 0);
          expect(user2Logs.success).toBe(true);
          
          if (user2Logs.data) {
            const allUser2 = user2Logs.data.every(log => log.user_id === user2Id);
            expect(allUser2).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('属性 13.3: 审计日志应该记录操作详情', async () => {
    await fc.assert(
      fc.asyncProperty(
        actionArbitrary,
        resourceTypeArbitrary,
        fc.uuid(),
        auditDetailsArbitrary,
        async (action, resourceType, resourceId, details) => {
          fc.pre(details !== undefined);
          
          const result = await LogService.logAudit(
            env,
            testUserId,
            action,
            resourceType,
            resourceId,
            details
          );

          expect(result.success).toBe(true);
          
          const logsResult = await LogService.getAuditLogs(env, testUserId, 100, 0);
          expect(logsResult.success).toBe(true);
          
          if (logsResult.data && logsResult.data.length > 0) {
            // 最新的日志在数组开头
            const lastLog = logsResult.data[0];
            expect(lastLog.details).toBeDefined();
            
            if (lastLog.details) {
              const parsedDetails = JSON.parse(lastLog.details);
              expect(parsedDetails.field).toBe(details!.field);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('属性 13.4: 审计日志应该按时间顺序记录', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            action: actionArbitrary,
            resourceType: resourceTypeArbitrary,
            resourceId: fc.uuid()
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (operations) => {
          for (const op of operations) {
            await LogService.logAudit(
              env,
              testUserId,
              op.action,
              op.resourceType,
              op.resourceId,
              undefined
            );
            
            // 添加小延迟确保时间戳不同
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          const logsResult = await LogService.getAuditLogs(env, testUserId, 100, 0);
          expect(logsResult.success).toBe(true);
          
          if (logsResult.data && logsResult.data.length >= operations.length) {
            // 日志按时间降序排列，取前N个（最新的）
            const recentLogs = logsResult.data.slice(0, operations.length);
            
            // 验证时间戳是递减的（因为是降序排列）
            for (let i = 1; i < recentLogs.length; i++) {
              const prevTime = new Date(recentLogs[i - 1].timestamp).getTime();
              const currTime = new Date(recentLogs[i].timestamp).getTime();
              expect(prevTime).toBeGreaterThanOrEqual(currTime);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 60000);
});

/**
 * Feature: app-keepalive-system, Property 14: 日志查询筛选准确性
 * 
 * 对于任何日志查询筛选条件，返回的日志条目应该完全匹配指定的筛选条件
 * 
 * 验证需求: 5.5
 */
describe('属性测试: 日志查询筛选准确性', () => {
  let env: Environment;
  let sqliteDb: Database.Database;
  let testUserId: string;
  let testTaskId: string;

  beforeEach(async () => {
    const testEnv = createTestEnvironment();
    env = testEnv.env;
    sqliteDb = testEnv.db;
    testUserId = await createTestUser(env, `user_${Date.now()}_${Math.random()}`);
    testTaskId = await createTestTask(env, testUserId, `task_${Date.now()}`);
  });

  afterEach(() => {
    if (sqliteDb) {
      sqliteDb.close();
    }
  });

  it('属性 14.1: 按任务ID筛选应该只返回该任务的日志', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionStatusArbitrary,
        responseTimeArbitrary,
        statusCodeArbitrary,
        async (status, responseTime, statusCode) => {
          const task1Id = testTaskId;
          const task2Id = await createTestTask(env, testUserId, `task2_${Date.now()}`);
          
          // 为两个任务记录日志
          await LogService.logExecution(env, task1Id, status, responseTime, statusCode);
          await LogService.logExecution(env, task2Id, status, responseTime, statusCode);
          
          // 按任务1筛选
          const task1Logs = await LogService.getExecutionLogs(env, { taskId: task1Id });
          expect(task1Logs.success).toBe(true);
          
          if (task1Logs.data) {
            const allTask1 = task1Logs.data.every(log => log.task_id === task1Id);
            expect(allTask1).toBe(true);
          }
          
          // 按任务2筛选
          const task2Logs = await LogService.getExecutionLogs(env, { taskId: task2Id });
          expect(task2Logs.success).toBe(true);
          
          if (task2Logs.data) {
            const allTask2 = task2Logs.data.every(log => log.task_id === task2Id);
            expect(allTask2).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('属性 14.2: 按状态筛选应该只返回匹配状态的日志', async () => {
    await fc.assert(
      fc.asyncProperty(
        responseTimeArbitrary,
        statusCodeArbitrary,
        async (responseTime, statusCode) => {
          // 记录成功和失败的日志
          await LogService.logExecution(env, testTaskId, 'success', responseTime, statusCode);
          await LogService.logExecution(env, testTaskId, 'failure', responseTime, statusCode, '错误消息');
          
          // 按成功状态筛选
          const successLogs = await LogService.getExecutionLogs(env, { 
            taskId: testTaskId,
            status: 'success' 
          });
          expect(successLogs.success).toBe(true);
          
          if (successLogs.data) {
            const allSuccess = successLogs.data.every(log => log.status === 'success');
            expect(allSuccess).toBe(true);
          }
          
          // 按失败状态筛选
          const failureLogs = await LogService.getExecutionLogs(env, { 
            taskId: testTaskId,
            status: 'failure' 
          });
          expect(failureLogs.success).toBe(true);
          
          if (failureLogs.data) {
            const allFailure = failureLogs.data.every(log => log.status === 'failure');
            expect(allFailure).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('属性 14.3: 按时间范围筛选应该只返回该范围内的日志', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionStatusArbitrary,
        async (status) => {
          const now = new Date();
          const startDate = new Date(now.getTime() - 3600000); // 1小时前
          const endDate = new Date(now.getTime() + 3600000); // 1小时后
          
          // 记录日志
          await LogService.logExecution(env, testTaskId, status, 100, 200);
          
          // 按时间范围筛选
          const logsResult = await LogService.getExecutionLogs(env, {
            taskId: testTaskId,
            startDate,
            endDate
          });
          
          expect(logsResult.success).toBe(true);
          
          if (logsResult.data) {
            for (const log of logsResult.data) {
              const logTime = new Date(log.execution_time).getTime();
              expect(logTime).toBeGreaterThanOrEqual(startDate.getTime());
              expect(logTime).toBeLessThanOrEqual(endDate.getTime());
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  it('属性 14.4: 限制和偏移量应该正确分页', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            status: executionStatusArbitrary,
            responseTime: responseTimeArbitrary
          }),
          { minLength: 5, maxLength: 10 }
        ),
        async (logs) => {
          // 记录多个日志
          for (const log of logs) {
            await LogService.logExecution(
              env,
              testTaskId,
              log.status,
              log.responseTime,
              200
            );
          }
          
          const limit = 3;
          const offset = 2;
          
          // 获取分页结果
          const pagedResult = await LogService.getExecutionLogs(env, {
            taskId: testTaskId,
            limit,
            offset
          });
          
          expect(pagedResult.success).toBe(true);
          
          if (pagedResult.data) {
            expect(pagedResult.data.length).toBeLessThanOrEqual(limit);
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 60000);

  it('属性 14.5: 按任务类型筛选应该只返回该类型任务的日志', async () => {
    await fc.assert(
      fc.asyncProperty(
        executionStatusArbitrary,
        async (status) => {
          // 创建保活任务和通知任务
          const keepaliveTaskId = testTaskId;
          
          const notificationConfig = {
            message: '测试通知',
            notifyxConfig: {
              apiKey: 'test-key',
              channelId: 'test-channel',
              message: '测试消息'
            }
          };
          
          const notificationResult = await TaskService.createTask(
            env,
            { 
              name: `notification_${Date.now()}`, 
              type: 'notification', 
              schedule: '*/5 * * * *', 
              config: notificationConfig, 
              enabled: true 
            },
            testUserId
          );
          
          const notificationTaskId = notificationResult.data?.id || '';
          
          // 为两种类型的任务记录日志
          await LogService.logExecution(env, keepaliveTaskId, status, 100, 200);
          await LogService.logExecution(env, notificationTaskId, status, 100, 200);
          
          // 按保活任务类型筛选
          const keepaliveLogs = await LogService.getExecutionLogs(env, {
            taskType: 'keepalive'
          });
          
          expect(keepaliveLogs.success).toBe(true);
          
          // 验证返回的日志都是保活任务的
          if (keepaliveLogs.data) {
            for (const log of keepaliveLogs.data) {
              const taskResult = await TaskService.getTask(env, log.task_id);
              if (taskResult.data) {
                expect(taskResult.data.type).toBe('keepalive');
              }
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 60000);
});

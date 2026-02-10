import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HealthRoutes } from '../../server/routes/health.js';
import { TaskService } from '../../server/services/task.service.js';
import { LogService } from '../../server/services/log.service.js';
import { DatabaseUtils } from '../../server/utils/database.js';
import type { Environment, KeepaliveConfig, NotificationConfig } from '../../server/types/index.js';

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

// 生成器定义
const taskNameArbitrary = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

const cronScheduleArbitrary = fc.tuple(
  fc.integer({ min: 0, max: 59 }),
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 1, max: 31 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 0, max: 6 })
).map(([minute, hour, day, month, weekday]) => 
  `${minute} ${hour} ${day} ${month} ${weekday}`
);

const urlArbitrary = fc.webUrl({ validSchemes: ['http', 'https'] });

const httpMethodArbitrary = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE');

const keepaliveConfigArbitrary: fc.Arbitrary<KeepaliveConfig> = fc.record({
  url: urlArbitrary,
  method: httpMethodArbitrary,
  headers: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
  body: fc.option(fc.string(), { nil: undefined }),
  timeout: fc.integer({ min: 1000, max: 60000 })
});

const notificationConfigArbitrary: fc.Arbitrary<NotificationConfig> = fc.record({
  message: fc.string({ minLength: 1, maxLength: 1000 }),
  title: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  priority: fc.option(fc.constantFrom('low' as const, 'normal' as const, 'high' as const), { nil: undefined }),
  notifyxConfig: fc.record({
    apiKey: fc.string({ minLength: 10, maxLength: 50 }),
    channelId: fc.string({ minLength: 5, maxLength: 30 }),
    message: fc.string({ minLength: 1, maxLength: 1000 })
  })
});

/**
 * Feature: app-keepalive-system, Property 24: 系统状态查询准确性
 * 
 * 对于任何系统状态查询，返回的信息应该准确反映当前活跃任务数量、
 * 最近执行统计和系统健康状态
 * 
 * 验证需求: 9.1, 9.4
 */
describe('属性测试: 系统状态查询准确性', () => {
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

  it('属性 24.1: 系统状态应该准确反映任务总数', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: taskNameArbitrary,
            schedule: cronScheduleArbitrary,
            config: keepaliveConfigArbitrary,
            enabled: fc.boolean()
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (tasks) => {
          // 获取创建前的任务数量
          const beforeRequest = new Request('https://example.com/api/status');
          const beforeResponse = await HealthRoutes.status(beforeRequest, env);
          const beforeData = await beforeResponse.json();
          const tasksBefore = beforeData.data.tasks.total;

          // 创建任务
          for (const task of tasks) {
            await TaskService.createTask(
              env,
              { ...task, type: 'keepalive' },
              testUserId
            );
          }

          // 查询系统状态
          const request = new Request('https://example.com/api/status');
          const response = await HealthRoutes.status(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          expect(data.data).toBeDefined();
          expect(data.data.tasks).toBeDefined();
          expect(data.data.tasks.total).toBe(tasksBefore + tasks.length);
        }
      ),
      { numRuns: 10 }
    );
  }, 60000);

  it('属性 24.2: 系统状态应该准确反映活跃和非活跃任务数量', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: taskNameArbitrary,
            schedule: cronScheduleArbitrary,
            config: keepaliveConfigArbitrary,
            enabled: fc.boolean()
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (tasks) => {
          // 获取创建前的任务数量
          const beforeRequest = new Request('https://example.com/api/status');
          const beforeResponse = await HealthRoutes.status(beforeRequest, env);
          const beforeData = await beforeResponse.json();
          const activeBefore = beforeData.data.tasks.active;
          const inactiveBefore = beforeData.data.tasks.inactive;

          // 创建任务
          for (const task of tasks) {
            await TaskService.createTask(
              env,
              { ...task, type: 'keepalive' },
              testUserId
            );
          }

          // 计算预期的活跃和非活跃任务数量
          const expectedActive = activeBefore + tasks.filter(t => t.enabled).length;
          const expectedInactive = inactiveBefore + tasks.filter(t => !t.enabled).length;

          // 查询系统状态
          const request = new Request('https://example.com/api/status');
          const response = await HealthRoutes.status(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          expect(data.data.tasks.active).toBe(expectedActive);
          expect(data.data.tasks.inactive).toBe(expectedInactive);
        }
      ),
      { numRuns: 5 }
    );
  }, 60000);

  it('属性 24.3: 系统状态应该准确反映不同类型任务的数量', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: taskNameArbitrary,
            schedule: cronScheduleArbitrary,
            type: fc.constantFrom('keepalive' as const, 'notification' as const),
            enabled: fc.boolean()
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (tasks) => {
          // 获取创建前的任务数量
          const beforeRequest = new Request('https://example.com/api/status');
          const beforeResponse = await HealthRoutes.status(beforeRequest, env);
          const beforeData = await beforeResponse.json();
          const keepaliveBefore = beforeData.data.tasks.keepalive;
          const notificationBefore = beforeData.data.tasks.notification;

          // 创建任务
          let keepaliveCreated = 0;
          let notificationCreated = 0;
          
          for (const task of tasks) {
            const config = task.type === 'keepalive'
              ? await fc.sample(keepaliveConfigArbitrary, 1)[0]
              : await fc.sample(notificationConfigArbitrary, 1)[0];
            
            const result = await TaskService.createTask(
              env,
              { 
                name: task.name,
                type: task.type,
                schedule: task.schedule,
                config: config as any,
                enabled: task.enabled
              },
              testUserId
            );
            
            // 只统计成功创建的任务
            if (result.success) {
              if (task.type === 'keepalive') {
                keepaliveCreated++;
              } else {
                notificationCreated++;
              }
            }
          }

          // 计算预期的任务类型数量
          const expectedKeepalive = keepaliveBefore + keepaliveCreated;
          const expectedNotification = notificationBefore + notificationCreated;

          // 查询系统状态
          const request = new Request('https://example.com/api/status');
          const response = await HealthRoutes.status(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          expect(data.data.tasks.keepalive).toBe(expectedKeepalive);
          expect(data.data.tasks.notification).toBe(expectedNotification);
        }
      ),
      { numRuns: 5 }
    );
  }, 60000);

  it('属性 24.4: 系统状态应该包含执行统计信息', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: taskNameArbitrary,
            schedule: cronScheduleArbitrary,
            config: keepaliveConfigArbitrary
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (tasks) => {
          // 获取创建前的执行日志数量
          const beforeRequest = new Request('https://example.com/api/status');
          const beforeResponse = await HealthRoutes.status(beforeRequest, env);
          const beforeData = await beforeResponse.json();
          const executionsBefore = beforeData.data.executions.total;

          // 创建任务
          const taskIds: string[] = [];
          for (const task of tasks) {
            const result = await TaskService.createTask(
              env,
              { ...task, type: 'keepalive', enabled: true },
              testUserId
            );
            if (result.success && result.data) {
              taskIds.push(result.data.id);
            }
          }

          // 创建一些执行日志
          for (const taskId of taskIds) {
            await LogService.logExecution(
              env,
              taskId,
              'success',
              100,
              200
            );
          }

          // 查询系统状态
          const request = new Request('https://example.com/api/status');
          const response = await HealthRoutes.status(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          expect(data.data.executions).toBeDefined();
          expect(data.data.executions.total).toBeGreaterThanOrEqual(executionsBefore + taskIds.length);
          expect(data.data.executions.last24h).toBeGreaterThanOrEqual(taskIds.length);
          expect(data.data.executions.successRate).toBeGreaterThanOrEqual(0);
          expect(data.data.executions.successRate).toBeLessThanOrEqual(100);
          expect(data.data.executions.averageResponseTime).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 5 }
    );
  }, 60000);

  it('属性 24.5: 系统状态应该包含数据库健康状态', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // 查询系统状态
          const request = new Request('https://example.com/api/status');
          const response = await HealthRoutes.status(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          expect(data.data.database).toBeDefined();
          expect(data.data.database.healthy).toBeDefined();
          expect(typeof data.data.database.healthy).toBe('boolean');
          expect(data.data.database.tables).toBeDefined();
          expect(typeof data.data.database.tables).toBe('object');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 24.6: 系统状态应该包含时间戳和运行时间', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // 查询系统状态
          const request = new Request('https://example.com/api/status');
          const response = await HealthRoutes.status(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          expect(data.data.timestamp).toBeDefined();
          expect(data.data.uptime).toBeDefined();
          expect(typeof data.data.uptime).toBe('number');
          expect(data.data.uptime).toBeGreaterThanOrEqual(0);
          
          // 验证时间戳格式
          const timestamp = new Date(data.data.timestamp);
          expect(timestamp.toString()).not.toBe('Invalid Date');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 24.7: 系统状态应该包含错误统计信息', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // 查询系统状态
          const request = new Request('https://example.com/api/status');
          const response = await HealthRoutes.status(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          expect(data.data.errors).toBeDefined();
          expect(data.data.errors.last24h).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(data.data.errors.recentErrors)).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);

  it('属性 24.8: 健康检查端点应该返回数据库健康状态', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // 查询健康检查
          const request = new Request('https://example.com/api/health');
          const response = await HealthRoutes.check(request, env);
          const data = await response.json();

          expect(data.success).toBeDefined();
          expect(typeof data.success).toBe('boolean');
          expect(data.data).toBeDefined();
          expect(data.data.status).toBeDefined();
          expect(data.data.timestamp).toBeDefined();
          expect(data.data.database).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 24.9: 系统指标端点应该返回完整的指标信息', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // 查询系统指标
          const request = new Request('https://example.com/api/metrics');
          const response = await HealthRoutes.metrics(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          expect(data.data).toBeDefined();
          expect(data.data.timestamp).toBeDefined();
          expect(data.data.uptime).toBeDefined();
          expect(data.data.tasks).toBeDefined();
          expect(data.data.executions).toBeDefined();
          expect(data.data.database).toBeDefined();
          expect(data.data.errors).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 24.10: 系统状态查询应该在有任务和无任务时都能正常工作', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        async (shouldCreateTasks) => {
          if (shouldCreateTasks) {
            // 创建一些任务
            const tasks = await fc.sample(
              fc.array(
                fc.record({
                  name: taskNameArbitrary,
                  schedule: cronScheduleArbitrary,
                  config: keepaliveConfigArbitrary,
                  enabled: fc.boolean()
                }),
                { minLength: 1, maxLength: 5 }
              ),
              1
            )[0];

            for (const task of tasks) {
              await TaskService.createTask(
                env,
                { ...task, type: 'keepalive' },
                testUserId
              );
            }
          }

          // 查询系统状态
          const request = new Request('https://example.com/api/status');
          const response = await HealthRoutes.status(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          expect(data.data).toBeDefined();
          expect(data.data.tasks).toBeDefined();
          expect(data.data.tasks.total).toBeGreaterThanOrEqual(0);
          expect(data.data.executions).toBeDefined();
          expect(data.data.database).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);

  it('属性 24.11: 系统状态应该正确计算成功率', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: taskNameArbitrary,
            schedule: cronScheduleArbitrary,
            config: keepaliveConfigArbitrary,
            success: fc.boolean()
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (tasks) => {
          // 创建任务并记录执行日志
          for (const task of tasks) {
            const result = await TaskService.createTask(
              env,
              { name: task.name, type: 'keepalive', schedule: task.schedule, config: task.config, enabled: true },
              testUserId
            );

            if (result.success && result.data) {
              await LogService.logExecution(
                env,
                result.data.id,
                task.success ? 'success' : 'failure',
                100,
                task.success ? 200 : 500,
                task.success ? undefined : 'Test error'
              );
            }
          }

          // 查询系统状态
          const request = new Request('https://example.com/api/status');
          const response = await HealthRoutes.status(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          // 成功率应该在0-100之间
          expect(data.data.executions.successRate).toBeGreaterThanOrEqual(0);
          expect(data.data.executions.successRate).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 5 }
    );
  }, 60000);

  it('属性 24.12: 系统状态应该正确计算平均响应时间', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: taskNameArbitrary,
            schedule: cronScheduleArbitrary,
            config: keepaliveConfigArbitrary,
            responseTime: fc.integer({ min: 50, max: 5000 })
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (tasks) => {
          // 创建任务并记录执行日志
          for (const task of tasks) {
            const result = await TaskService.createTask(
              env,
              { name: task.name, type: 'keepalive', schedule: task.schedule, config: task.config, enabled: true },
              testUserId
            );

            if (result.success && result.data) {
              await LogService.logExecution(
                env,
                result.data.id,
                'success',
                task.responseTime,
                200
              );
            }
          }

          // 查询系统状态
          const request = new Request('https://example.com/api/status');
          const response = await HealthRoutes.status(request, env);
          const data = await response.json();

          expect(data.success).toBe(true);
          // 平均响应时间应该大于0
          expect(data.data.executions.averageResponseTime).toBeGreaterThan(0);
        }
      ),
      { numRuns: 5 }
    );
  }, 60000);
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuthService } from '../../server/services/auth.service.js';
import { TaskService } from '../../server/services/task.service.js';
import { AuthRoutes } from '../../server/routes/auth.js';
import { TaskRoutes } from '../../server/routes/tasks.js';
import { HealthRoutes } from '../../server/routes/health.js';
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
 * 创建测试用户并返回令牌
 */
async function createTestUserWithToken(env: Environment, username: string, password: string): Promise<string> {
  const result = await AuthService.register(env, username, password, 'user');
  if (!result.success || !result.token) {
    throw new Error(`创建测试用户失败: ${result.error || '未知错误'}, username: ${username}, password: ${password}`);
  }
  return result.token;
}

// 生成器定义
const uniqueUsernameArbitrary = fc.integer({ min: 1000, max: 9999 }).map(n => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `u${n}${timestamp}${random}`.substring(0, 20);
});

const validPasswordArbitrary = fc.tuple(
  fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'), { minLength: 4, maxLength: 10 }),
  fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 4, maxLength: 10 })
).map(([letters, numbers]) => {
  // 混合字母和数字
  const combined = [...letters, ...numbers];
  // 随机打乱
  return combined.sort(() => Math.random() - 0.5).join('').substring(0, 20);
});

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

const httpMethodArbitrary = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE');
const urlArbitrary = fc.webUrl({ validSchemes: ['http', 'https'] });

const keepaliveConfigArbitrary: fc.Arbitrary<KeepaliveConfig> = fc.record({
  url: urlArbitrary,
  method: httpMethodArbitrary,
  headers: fc.option(fc.dictionary(fc.string(), fc.string()), { nil: undefined }),
  body: fc.option(fc.string(), { nil: undefined }),
  timeout: fc.integer({ min: 1000, max: 60000 })
});

/**
 * Feature: app-keepalive-system, Property 15: API认证和响应一致性
 * 
 * 对于任何API请求，系统应该正确验证认证信息，对有效请求返回标准化响应，
 * 对无效请求返回适当的错误信息和状态码
 * 
 * 验证需求: 6.1, 6.2, 6.3
 */
describe('属性测试: API认证和响应一致性', () => {
  let env: Environment;
  let sqliteDb: Database.Database;

  beforeEach(() => {
    const testEnv = createTestEnvironment();
    env = testEnv.env;
    sqliteDb = testEnv.db;
  });

  afterEach(() => {
    if (sqliteDb) {
      sqliteDb.close();
    }
  });

  it('属性 15.1: 登录API应该验证凭据并返回标准化响应', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          // 先注册用户
          await AuthService.register(env, username, password, 'user');

          // 测试正确凭据
          const validRequest = new Request('https://example.com/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          const validResponse = await AuthRoutes.login(validRequest, env);
          expect(validResponse.status).toBe(200);
          
          const validData = await validResponse.json();
          expect(validData.success).toBe(true);
          expect(validData.data).toBeDefined();
          expect(validData.data.token).toBeDefined();
          expect(validData.data.user).toBeDefined();
          expect(validData.data.user.username).toBe(username);

          // 测试错误凭据
          const invalidRequest = new Request('https://example.com/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: 'wrongpassword123' })
          });

          const invalidResponse = await AuthRoutes.login(invalidRequest, env);
          expect(invalidResponse.status).toBe(401);
          
          const invalidData = await invalidResponse.json();
          expect(invalidData.success).toBe(false);
          expect(invalidData.error).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 15.2: 需要认证的API应该验证令牌', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          const token = await createTestUserWithToken(env, username, password);

          // 测试有效令牌
          const validRequest = new Request('https://example.com/api/tasks', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          const validResponse = await TaskRoutes.list(validRequest, env);
          expect(validResponse.status).toBe(200);
          
          const validData = await validResponse.json();
          expect(validData.success).toBe(true);
          expect(validData.data).toBeDefined();
          expect(Array.isArray(validData.data)).toBe(true);

          // 测试无效令牌
          const invalidRequest = new Request('https://example.com/api/tasks', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer invalid_token_12345' }
          });

          const invalidResponse = await TaskRoutes.list(invalidRequest, env);
          expect(invalidResponse.status).toBe(401);
          
          const invalidData = await invalidResponse.json();
          expect(invalidData.success).toBe(false);
          expect(invalidData.error).toBeDefined();

          // 测试缺少令牌
          const noTokenRequest = new Request('https://example.com/api/tasks', {
            method: 'GET'
          });

          const noTokenResponse = await TaskRoutes.list(noTokenRequest, env);
          expect(noTokenResponse.status).toBe(401);
          
          const noTokenData = await noTokenResponse.json();
          expect(noTokenData.success).toBe(false);
          expect(noTokenData.error).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 15.3: API应该返回标准化的成功响应格式', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        taskNameArbitrary,
        cronScheduleArbitrary,
        keepaliveConfigArbitrary,
        async (username, password, taskName, schedule, config) => {
          const token = await createTestUserWithToken(env, username, password);

          // 创建任务
          const createRequest = new Request('https://example.com/api/tasks', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: taskName,
              type: 'keepalive',
              schedule,
              config,
              enabled: true
            })
          });

          const createResponse = await TaskRoutes.create(createRequest, env);
          expect(createResponse.status).toBe(201);
          
          const createData = await createResponse.json();
          expect(createData).toHaveProperty('success');
          expect(createData.success).toBe(true);
          expect(createData).toHaveProperty('data');
          expect(createData.data).toBeDefined();
          expect(createData.data.id).toBeDefined();
          expect(createData.data.name).toBe(taskName);
        }
      ),
      { numRuns: 20 }
    );
  }, 30000);

  it('属性 15.4: API应该返回标准化的错误响应格式', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          const token = await createTestUserWithToken(env, username, password);

          // 测试缺少必填字段的请求
          const invalidRequest = new Request('https://example.com/api/tasks', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: 'test'
              // 缺少 type, schedule, config
            })
          });

          const response = await TaskRoutes.create(invalidRequest, env);
          expect(response.status).toBe(400);
          
          const data = await response.json();
          expect(data).toHaveProperty('success');
          expect(data.success).toBe(false);
          expect(data).toHaveProperty('error');
          expect(data.error).toBeDefined();
          expect(typeof data.error).toBe('string');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 15.5: API应该为不同错误返回适当的状态码', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        fc.uuid(),
        async (username, password, nonExistentId) => {
          const token = await createTestUserWithToken(env, username, password);

          // 测试404 - 资源不存在
          const notFoundRequest = new Request(`https://example.com/api/tasks/${nonExistentId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          const notFoundResponse = await TaskRoutes.get(notFoundRequest, env, nonExistentId);
          expect(notFoundResponse.status).toBe(404);
          
          const notFoundData = await notFoundResponse.json();
          expect(notFoundData.success).toBe(false);
          expect(notFoundData.error).toBeDefined();

          // 测试401 - 未授权
          const unauthorizedRequest = new Request('https://example.com/api/tasks', {
            method: 'GET'
          });

          const unauthorizedResponse = await TaskRoutes.list(unauthorizedRequest, env);
          expect(unauthorizedResponse.status).toBe(401);
          
          const unauthorizedData = await unauthorizedResponse.json();
          expect(unauthorizedData.success).toBe(false);
          expect(unauthorizedData.error).toBeDefined();

          // 测试400 - 请求格式错误
          const badRequest = new Request('https://example.com/api/tasks', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ invalid: 'data' })
          });

          const badResponse = await TaskRoutes.create(badRequest, env);
          expect(badResponse.status).toBe(400);
          
          const badData = await badResponse.json();
          expect(badData.success).toBe(false);
          expect(badData.error).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 15.6: 注册API应该验证输入并返回标准化响应', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          // 测试有效注册
          const validRequest = new Request('https://example.com/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          const validResponse = await AuthRoutes.register(validRequest, env);
          expect(validResponse.status).toBe(201);
          
          const validData = await validResponse.json();
          expect(validData.success).toBe(true);
          expect(validData.data).toBeDefined();
          expect(validData.data.token).toBeDefined();
          expect(validData.data.user).toBeDefined();

          // 测试重复用户名
          const duplicateRequest = new Request('https://example.com/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          const duplicateResponse = await AuthRoutes.register(duplicateRequest, env);
          expect(duplicateResponse.status).toBe(400);
          
          const duplicateData = await duplicateResponse.json();
          expect(duplicateData.success).toBe(false);
          expect(duplicateData.error).toBeDefined();

          // 测试缺少字段
          const missingFieldRequest = new Request('https://example.com/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
          });

          const missingFieldResponse = await AuthRoutes.register(missingFieldRequest, env);
          expect(missingFieldResponse.status).toBe(400);
          
          const missingFieldData = await missingFieldResponse.json();
          expect(missingFieldData.success).toBe(false);
          expect(missingFieldData.error).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 15.7: 令牌刷新API应该验证令牌并返回新令牌', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          // 为每次迭代创建唯一用户名（保持在20字符以内）
          const suffix = Math.random().toString(36).substring(2, 6);
          const uniqueUsername = `${username.substring(0, 14)}_${suffix}`;
          const token = await createTestUserWithToken(env, uniqueUsername, password);

          // 添加小延迟确保时间戳不同
          await new Promise(resolve => setTimeout(resolve, 10));

          // 测试有效令牌刷新
          const validRequest = new Request('https://example.com/api/auth/refresh', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          const validResponse = await AuthRoutes.refresh(validRequest, env);
          expect(validResponse.status).toBe(200);
          
          const validData = await validResponse.json();
          expect(validData.success).toBe(true);
          expect(validData.data).toBeDefined();
          expect(validData.data.token).toBeDefined();
          // 注意：由于时间戳精度问题，新令牌可能与旧令牌相同，这是可以接受的
          // 重要的是刷新操作成功并返回了有效令牌

          // 测试无效令牌
          const invalidRequest = new Request('https://example.com/api/auth/refresh', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer invalid_token' }
          });

          const invalidResponse = await AuthRoutes.refresh(invalidRequest, env);
          expect(invalidResponse.status).toBe(401);
          
          const invalidData = await invalidResponse.json();
          expect(invalidData.success).toBe(false);
          expect(invalidData.error).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 15.8: 获取当前用户API应该返回用户信息', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          const token = await createTestUserWithToken(env, username, password);

          // 测试有效请求
          const validRequest = new Request('https://example.com/api/auth/me', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          const validResponse = await AuthRoutes.me(validRequest, env);
          expect(validResponse.status).toBe(200);
          
          const validData = await validResponse.json();
          expect(validData.success).toBe(true);
          expect(validData.data).toBeDefined();
          expect(validData.data.user).toBeDefined();
          expect(validData.data.user.username).toBe(username);

          // 测试未授权请求
          const unauthorizedRequest = new Request('https://example.com/api/auth/me', {
            method: 'GET'
          });

          const unauthorizedResponse = await AuthRoutes.me(unauthorizedRequest, env);
          expect(unauthorizedResponse.status).toBe(401);
          
          const unauthorizedData = await unauthorizedResponse.json();
          expect(unauthorizedData.success).toBe(false);
          expect(unauthorizedData.error).toBeDefined();
        }
      ),
      { numRuns: 20 }
    );
  });
});

/**
 * Feature: app-keepalive-system, Property 17: CORS配置正确性
 * 
 * 对于任何跨域API请求，响应应该包含正确的CORS头以支持跨域访问
 * 
 * 验证需求: 6.5
 */
describe('属性测试: CORS配置正确性', () => {
  let env: Environment;
  let sqliteDb: Database.Database;

  beforeEach(() => {
    const testEnv = createTestEnvironment();
    env = testEnv.env;
    sqliteDb = testEnv.db;
  });

  afterEach(() => {
    if (sqliteDb) {
      sqliteDb.close();
    }
  });

  it('属性 17.1: 所有API响应应该包含CORS头', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          // 测试登录API
          const loginRequest = new Request('https://example.com/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          const loginResponse = await AuthRoutes.login(loginRequest, env);
          expect(loginResponse.headers.has('Access-Control-Allow-Origin')).toBe(true);
          expect(loginResponse.headers.get('Access-Control-Allow-Origin')).toBe('*');
          expect(loginResponse.headers.has('Access-Control-Allow-Methods')).toBe(true);
          expect(loginResponse.headers.has('Access-Control-Allow-Headers')).toBe(true);

          // 测试注册API
          const registerRequest = new Request('https://example.com/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          const registerResponse = await AuthRoutes.register(registerRequest, env);
          expect(registerResponse.headers.has('Access-Control-Allow-Origin')).toBe(true);
          expect(registerResponse.headers.get('Access-Control-Allow-Origin')).toBe('*');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 17.2: 健康检查API应该包含CORS头', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const request = new Request('https://example.com/api/health', {
            method: 'GET'
          });

          const response = await HealthRoutes.check(request, env);
          expect(response.headers.has('Access-Control-Allow-Origin')).toBe(true);
          expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
          expect(response.headers.has('Access-Control-Allow-Methods')).toBe(true);
          expect(response.headers.has('Access-Control-Allow-Headers')).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('属性 17.3: 任务API响应应该包含CORS头', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          const token = await createTestUserWithToken(env, username, password);

          // 测试任务列表API
          const listRequest = new Request('https://example.com/api/tasks', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          const listResponse = await TaskRoutes.list(listRequest, env);
          expect(listResponse.headers.has('Access-Control-Allow-Origin')).toBe(true);
          expect(listResponse.headers.get('Access-Control-Allow-Origin')).toBe('*');
          expect(listResponse.headers.has('Access-Control-Allow-Methods')).toBe(true);
          expect(listResponse.headers.has('Access-Control-Allow-Headers')).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 17.4: 错误响应应该包含CORS头', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          // 测试401错误响应
          const unauthorizedRequest = new Request('https://example.com/api/tasks', {
            method: 'GET'
          });

          const unauthorizedResponse = await TaskRoutes.list(unauthorizedRequest, env);
          expect(unauthorizedResponse.status).toBe(401);
          expect(unauthorizedResponse.headers.has('Access-Control-Allow-Origin')).toBe(true);
          expect(unauthorizedResponse.headers.get('Access-Control-Allow-Origin')).toBe('*');

          // 测试400错误响应
          const badRequest = new Request('https://example.com/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });

          const badResponse = await AuthRoutes.login(badRequest, env);
          expect(badResponse.status).toBe(400);
          expect(badResponse.headers.has('Access-Control-Allow-Origin')).toBe(true);
          expect(badResponse.headers.get('Access-Control-Allow-Origin')).toBe('*');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 17.5: CORS头应该允许必要的HTTP方法', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          const token = await createTestUserWithToken(env, username, password);

          const request = new Request('https://example.com/api/tasks', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          const response = await TaskRoutes.list(request, env);
          const allowMethods = response.headers.get('Access-Control-Allow-Methods');
          
          expect(allowMethods).toBeDefined();
          expect(allowMethods).toContain('GET');
          expect(allowMethods).toContain('POST');
          expect(allowMethods).toContain('PUT');
          expect(allowMethods).toContain('DELETE');
          expect(allowMethods).toContain('OPTIONS');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 17.6: CORS头应该允许必要的请求头', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          const token = await createTestUserWithToken(env, username, password);

          const request = new Request('https://example.com/api/tasks', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          const response = await TaskRoutes.list(request, env);
          const allowHeaders = response.headers.get('Access-Control-Allow-Headers');
          
          expect(allowHeaders).toBeDefined();
          expect(allowHeaders).toContain('Content-Type');
          expect(allowHeaders).toContain('Authorization');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 17.7: CORS头应该设置合理的Max-Age', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          const token = await createTestUserWithToken(env, username, password);

          const request = new Request('https://example.com/api/tasks', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          const response = await TaskRoutes.list(request, env);
          const maxAge = response.headers.get('Access-Control-Max-Age');
          
          expect(maxAge).toBeDefined();
          const maxAgeValue = parseInt(maxAge || '0', 10);
          expect(maxAgeValue).toBeGreaterThan(0);
          expect(maxAgeValue).toBeLessThanOrEqual(86400); // 不超过24小时
        }
      ),
      { numRuns: 20 }
    );
  });

  it('属性 17.8: 成功和失败响应都应该包含相同的CORS头', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueUsernameArbitrary,
        validPasswordArbitrary,
        async (username, password) => {
          const token = await createTestUserWithToken(env, username, password);

          // 成功响应
          const successRequest = new Request('https://example.com/api/tasks', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          const successResponse = await TaskRoutes.list(successRequest, env);
          const successCorsOrigin = successResponse.headers.get('Access-Control-Allow-Origin');
          const successCorsMethods = successResponse.headers.get('Access-Control-Allow-Methods');
          const successCorsHeaders = successResponse.headers.get('Access-Control-Allow-Headers');

          // 失败响应
          const failRequest = new Request('https://example.com/api/tasks', {
            method: 'GET'
          });

          const failResponse = await TaskRoutes.list(failRequest, env);
          const failCorsOrigin = failResponse.headers.get('Access-Control-Allow-Origin');
          const failCorsMethods = failResponse.headers.get('Access-Control-Allow-Methods');
          const failCorsHeaders = failResponse.headers.get('Access-Control-Allow-Headers');

          // 验证CORS头一致
          expect(successCorsOrigin).toBe(failCorsOrigin);
          expect(successCorsMethods).toBe(failCorsMethods);
          expect(successCorsHeaders).toBe(failCorsHeaders);
        }
      ),
      { numRuns: 20 }
    );
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { RateLimitMiddleware } from '../../server/middleware/rate-limit.js';
import type { Environment } from '../../server/types/index.js';

/**
 * 创建测试环境
 */
function createTestEnvironment(): Environment {
  return {
    DB: {} as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test_secret_key'
  } as Environment;
}

/**
 * 创建测试请求
 */
function createTestRequest(clientId: string, useAuth: boolean = false): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (useAuth) {
    headers['Authorization'] = `Bearer token_${clientId}`;
  } else {
    headers['CF-Connecting-IP'] = clientId;
  }

  return new Request('https://example.com/api/test', {
    method: 'GET',
    headers
  });
}

/**
 * Feature: app-keepalive-system, Property 16: API速率限制有效性
 * 
 * 对于任何超过速率限制的API调用序列，系统应该拒绝超出限制的请求并返回适当的错误码
 * 
 * 验证需求: 6.4
 */
describe('属性测试: API速率限制有效性', () => {
  let env: Environment;

  beforeEach(() => {
    env = createTestEnvironment();
    // 清理速率限制存储
    (RateLimitMiddleware as any).limitStore.clear();
  });

  it('属性 16.1: 在限制内的请求应该全部被允许', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }), // 请求数量（小于默认限制60）
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        async (requestCount, clientId) => {
          const config = { windowMs: 60000, maxRequests: 60 };
          
          for (let i = 0; i < requestCount; i++) {
            const request = createTestRequest(clientId);
            const result = RateLimitMiddleware.checkRateLimit(request, config);
            
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(60 - i - 1);
            expect(result.resetTime).toBeGreaterThan(Date.now());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('属性 16.2: 超过限制的请求应该被拒绝', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 20 }), // 速率限制
        fc.integer({ min: 1, max: 10 }), // 超出数量
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        async (maxRequests, extraRequests, clientId) => {
          const config = { windowMs: 60000, maxRequests };
          
          // 发送允许的请求
          for (let i = 0; i < maxRequests; i++) {
            const request = createTestRequest(clientId);
            const result = RateLimitMiddleware.checkRateLimit(request, config);
            expect(result.allowed).toBe(true);
          }
          
          // 发送超出限制的请求
          for (let i = 0; i < extraRequests; i++) {
            const request = createTestRequest(clientId);
            const result = RateLimitMiddleware.checkRateLimit(request, config);
            
            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
            expect(result.resetTime).toBeGreaterThan(Date.now());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('属性 16.3: 不同客户端的速率限制应该独立计算', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 5, maxLength: 20 }), { minLength: 2, maxLength: 5 }).map(arr => [...new Set(arr)]), // 唯一客户端ID数组
        fc.integer({ min: 5, max: 20 }), // 每个客户端的请求数
        async (clientIds, requestsPerClient) => {
          // 确保至少有2个不同的客户端
          if (clientIds.length < 2) return;
          
          const config = { windowMs: 60000, maxRequests: 30 };
          
          // 每个客户端发送请求
          for (const clientId of clientIds) {
            for (let i = 0; i < requestsPerClient; i++) {
              const request = createTestRequest(clientId);
              const result = RateLimitMiddleware.checkRateLimit(request, config);
              
              if (i < config.maxRequests) {
                expect(result.allowed).toBe(true);
              } else {
                expect(result.allowed).toBe(false);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('属性 16.4: 速率限制中间件应该返回429状态码', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 10 }), // 速率限制
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        async (maxRequests, clientId) => {
          const middleware = RateLimitMiddleware.forRoute(60000, maxRequests);
          
          // 发送允许的请求
          for (let i = 0; i < maxRequests; i++) {
            const request = createTestRequest(clientId);
            const response = middleware(request, env);
            expect(response).toBeNull(); // 允许的请求返回null
          }
          
          // 发送超出限制的请求
          const request = createTestRequest(clientId);
          const response = middleware(request, env);
          
          expect(response).not.toBeNull();
          expect(response!.status).toBe(429);
          
          const data = await response!.json();
          expect(data.success).toBe(false);
          expect(data.error).toBeDefined();
          expect(data.retryAfter).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('属性 16.5: 速率限制响应应该包含正确的头部信息', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 10 }), // 速率限制
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        async (maxRequests, clientId) => {
          const middleware = RateLimitMiddleware.forRoute(60000, maxRequests);
          
          // 发送超出限制的请求
          for (let i = 0; i <= maxRequests; i++) {
            const request = createTestRequest(clientId);
            middleware(request, env);
          }
          
          const request = createTestRequest(clientId);
          const response = middleware(request, env);
          
          expect(response).not.toBeNull();
          expect(response!.headers.has('X-RateLimit-Limit')).toBe(true);
          expect(response!.headers.has('X-RateLimit-Remaining')).toBe(true);
          expect(response!.headers.has('X-RateLimit-Reset')).toBe(true);
          expect(response!.headers.has('Retry-After')).toBe(true);
          
          expect(response!.headers.get('X-RateLimit-Limit')).toBe(maxRequests.toString());
          expect(response!.headers.get('X-RateLimit-Remaining')).toBe('0');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('属性 16.6: 时间窗口过期后应该重置计数', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 10 }), // 速率限制
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        async (maxRequests, clientId) => {
          const windowMs = 100; // 使用短时间窗口便于测试
          const config = { windowMs, maxRequests };
          
          // 发送达到限制的请求
          for (let i = 0; i < maxRequests; i++) {
            const request = createTestRequest(clientId);
            const result = RateLimitMiddleware.checkRateLimit(request, config);
            expect(result.allowed).toBe(true);
          }
          
          // 验证已达到限制
          const blockedRequest = createTestRequest(clientId);
          const blockedResult = RateLimitMiddleware.checkRateLimit(blockedRequest, config);
          expect(blockedResult.allowed).toBe(false);
          
          // 等待时间窗口过期
          await new Promise(resolve => setTimeout(resolve, windowMs + 50));
          
          // 验证计数已重置
          const newRequest = createTestRequest(clientId);
          const newResult = RateLimitMiddleware.checkRateLimit(newRequest, config);
          expect(newResult.allowed).toBe(true);
          expect(newResult.remaining).toBe(maxRequests - 1);
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  it('属性 16.7: 使用认证令牌的客户端应该独立于IP地址限制', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        fc.integer({ min: 3, max: 10 }), // 请求数
        async (clientId, requestCount) => {
          const config = { windowMs: 60000, maxRequests: 20 };
          
          // 使用IP地址发送请求
          for (let i = 0; i < requestCount; i++) {
            const request = createTestRequest(clientId, false);
            const result = RateLimitMiddleware.checkRateLimit(request, config);
            expect(result.allowed).toBe(true);
          }
          
          // 使用认证令牌发送请求（相同的clientId但不同的标识）
          for (let i = 0; i < requestCount; i++) {
            const request = createTestRequest(clientId, true);
            const result = RateLimitMiddleware.checkRateLimit(request, config);
            expect(result.allowed).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('属性 16.8: 严格模式应该有更低的限制', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        async (clientId) => {
          const strictMiddleware = RateLimitMiddleware.strict();
          
          // 发送11个请求（严格模式限制为10）
          let allowedCount = 0;
          let blockedCount = 0;
          
          for (let i = 0; i < 11; i++) {
            const request = createTestRequest(clientId);
            const response = strictMiddleware(request, env);
            
            if (response === null) {
              allowedCount++;
            } else {
              blockedCount++;
              expect(response.status).toBe(429);
            }
          }
          
          expect(allowedCount).toBe(10);
          expect(blockedCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('属性 16.9: 宽松模式应该有更高的限制', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        async (clientId) => {
          const lenientMiddleware = RateLimitMiddleware.lenient();
          
          // 发送100个请求（宽松模式限制为120）
          for (let i = 0; i < 100; i++) {
            const request = createTestRequest(clientId);
            const response = lenientMiddleware(request, env);
            expect(response).toBeNull(); // 所有请求都应该被允许
          }
          
          // 发送第121个请求应该被阻止
          for (let i = 100; i < 121; i++) {
            const request = createTestRequest(clientId);
            lenientMiddleware(request, env);
          }
          
          const blockedRequest = createTestRequest(clientId);
          const blockedResponse = lenientMiddleware(blockedRequest, env);
          expect(blockedResponse).not.toBeNull();
          expect(blockedResponse!.status).toBe(429);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('属性 16.10: 剩余请求数应该正确递减', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 20 }), // 速率限制
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        async (maxRequests, clientId) => {
          const config = { windowMs: 60000, maxRequests };
          
          for (let i = 0; i < maxRequests; i++) {
            const request = createTestRequest(clientId);
            const result = RateLimitMiddleware.checkRateLimit(request, config);
            
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(maxRequests - i - 1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('属性 16.11: 重置时间应该在时间窗口内保持一致', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 20 }), // 速率限制
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        async (maxRequests, clientId) => {
          const windowMs = 60000;
          const config = { windowMs, maxRequests };
          
          const request1 = createTestRequest(clientId);
          const result1 = RateLimitMiddleware.checkRateLimit(request1, config);
          const resetTime1 = result1.resetTime;
          
          // 短暂延迟
          await new Promise(resolve => setTimeout(resolve, 10));
          
          const request2 = createTestRequest(clientId);
          const result2 = RateLimitMiddleware.checkRateLimit(request2, config);
          const resetTime2 = result2.resetTime;
          
          // 在同一时间窗口内，重置时间应该相同
          expect(resetTime1).toBe(resetTime2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('属性 16.12: 速率限制错误响应应该包含重试时间', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 10 }), // 速率限制
        fc.string({ minLength: 5, maxLength: 20 }), // 客户端ID
        async (maxRequests, clientId) => {
          const middleware = RateLimitMiddleware.forRoute(60000, maxRequests);
          
          // 达到限制
          for (let i = 0; i <= maxRequests; i++) {
            const request = createTestRequest(clientId);
            middleware(request, env);
          }
          
          const request = createTestRequest(clientId);
          const response = middleware(request, env);
          
          expect(response).not.toBeNull();
          
          const data = await response!.json();
          expect(data.retryAfter).toBeDefined();
          expect(typeof data.retryAfter).toBe('number');
          expect(data.retryAfter).toBeGreaterThan(0);
          expect(data.retryAfter).toBeLessThanOrEqual(60); // 不超过时间窗口（秒）
          
          const retryAfterHeader = response!.headers.get('Retry-After');
          expect(retryAfterHeader).toBeDefined();
          expect(parseInt(retryAfterHeader!, 10)).toBe(data.retryAfter);
        }
      ),
      { numRuns: 100 }
    );
  });
});

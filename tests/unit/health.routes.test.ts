import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthRoutes } from '../../server/routes/health';
import { DatabaseUtils } from '../../server/utils/database';
import { LogService } from '../../server/services/log.service';
import { NotificationService } from '../../server/services/notification.service';
import type { Environment } from '../../server/types';

// Mock依赖
vi.mock('../../server/utils/database');
vi.mock('../../server/services/log.service');
vi.mock('../../server/services/notification.service');

describe('HealthRoutes - 系统监控和健康检查', () => {
  let mockEnv: Environment;

  beforeEach(() => {
    mockEnv = {
      DB: {} as any,
      ENVIRONMENT: 'test',
      JWT_SECRET: 'test-secret'
    };

    vi.clearAllMocks();
  });

  describe('健康检查端点', () => {
    it('应该返回健康状态', async () => {
      // Mock健康检查结果
      vi.mocked(DatabaseUtils.healthCheck).mockResolvedValue({
        healthy: true,
        details: {
          connection: true,
          schema: true,
          tables: {
            users: 1,
            tasks: 5,
            execution_logs: 10,
            notification_settings: 1
          }
        },
        errors: []
      });

      const request = new Request('http://localhost/api/health');
      const response = await HealthRoutes.check(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('healthy');
      expect(data.data.database).toBeDefined();
    });

    it('应该返回不健康状态', async () => {
      // Mock不健康的检查结果
      vi.mocked(DatabaseUtils.healthCheck).mockResolvedValue({
        healthy: false,
        details: {
          connection: false,
          schema: false,
          tables: {}
        },
        errors: ['数据库连接失败']
      });

      const request = new Request('http://localhost/api/health');
      const response = await HealthRoutes.check(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.data.status).toBe('unhealthy');
    });

    it('应该处理健康检查异常', async () => {
      // Mock异常
      vi.mocked(DatabaseUtils.healthCheck).mockRejectedValue(new Error('数据库错误'));

      const request = new Request('http://localhost/api/health');
      const response = await HealthRoutes.check(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.data.status).toBe('unhealthy');
    });
  });

  describe('系统状态端点', () => {
    it('应该返回完整的系统指标', async () => {
      // Mock任务数据
      vi.mocked(DatabaseUtils.getAllTasks).mockResolvedValue({
        success: true,
        data: [
          {
            id: '1',
            name: 'Task 1',
            type: 'keepalive',
            enabled: true,
            schedule: '*/5 * * * *',
            config: { url: 'http://test.com', method: 'GET', timeout: 30000 },
            created_by: 'user1',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          },
          {
            id: '2',
            name: 'Task 2',
            type: 'notification',
            enabled: false,
            schedule: '0 9 * * *',
            config: { content: 'Test', title: 'Test', notifyxConfig: { apiKey: 'key', content: 'Test', title: 'Test' } },
            created_by: 'user1',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          }
        ]
      });

      // Mock执行日志数据
      vi.mocked(DatabaseUtils.getAllExecutionLogs).mockResolvedValue({
        success: true,
        data: [
          {
            id: '1',
            task_id: '1',
            execution_time: new Date().toISOString(),
            status: 'success',
            response_time: 100
          },
          {
            id: '2',
            task_id: '1',
            execution_time: new Date().toISOString(),
            status: 'failure',
            response_time: 200,
            error_message: 'Error'
          }
        ]
      });

      // Mock健康检查
      vi.mocked(DatabaseUtils.healthCheck).mockResolvedValue({
        healthy: true,
        details: {
          connection: true,
          schema: true,
          tables: { users: 1, tasks: 2, execution_logs: 2, notification_settings: 1 }
        },
        errors: []
      });

      // Mock错误日志
      vi.mocked(LogService.getErrorLogs).mockResolvedValue({
        success: true,
        data: []
      });

      const request = new Request('http://localhost/api/status');
      const response = await HealthRoutes.status(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.tasks).toBeDefined();
      expect(data.data.tasks.total).toBe(2);
      expect(data.data.tasks.active).toBe(1);
      expect(data.data.tasks.inactive).toBe(1);
      expect(data.data.executions).toBeDefined();
      expect(data.data.database).toBeDefined();
      expect(data.data.errors).toBeDefined();
    });

    it('应该检测高失败率异常', async () => {
      // Mock任务数据
      vi.mocked(DatabaseUtils.getAllTasks).mockResolvedValue({
        success: true,
        data: []
      });

      // Mock大量失败的执行日志
      const failureLogs = Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        task_id: '1',
        execution_time: new Date().toISOString(),
        status: 'failure' as const,
        response_time: 100,
        error_message: 'Error'
      }));

      vi.mocked(DatabaseUtils.getAllExecutionLogs).mockResolvedValue({
        success: true,
        data: failureLogs
      });

      // Mock健康检查
      vi.mocked(DatabaseUtils.healthCheck).mockResolvedValue({
        healthy: true,
        details: {
          connection: true,
          schema: true,
          tables: {}
        },
        errors: []
      });

      // Mock错误日志
      vi.mocked(LogService.getErrorLogs).mockResolvedValue({
        success: true,
        data: []
      });

      const request = new Request('http://localhost/api/status');
      const response = await HealthRoutes.status(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.anomalies).toBeDefined();
      expect(data.data.anomalies.length).toBeGreaterThan(0);
      expect(data.data.health).toBe('critical');
    });

    it('应该检测数据库异常', async () => {
      // Mock任务数据
      vi.mocked(DatabaseUtils.getAllTasks).mockResolvedValue({
        success: true,
        data: []
      });

      // Mock执行日志
      vi.mocked(DatabaseUtils.getAllExecutionLogs).mockResolvedValue({
        success: true,
        data: []
      });

      // Mock不健康的数据库
      vi.mocked(DatabaseUtils.healthCheck).mockResolvedValue({
        healthy: false,
        details: {
          connection: false,
          schema: false,
          tables: {}
        },
        errors: ['数据库连接失败']
      });

      // Mock错误日志
      vi.mocked(LogService.getErrorLogs).mockResolvedValue({
        success: true,
        data: []
      });

      const request = new Request('http://localhost/api/status');
      const response = await HealthRoutes.status(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.anomalies).toBeDefined();
      expect(data.data.anomalies.some((a: any) => a.type === 'database_error')).toBe(true);
      expect(data.data.health).toBe('critical');
    });
  });

  describe('系统指标端点', () => {
    it('应该返回系统指标', async () => {
      // Mock数据
      vi.mocked(DatabaseUtils.getAllTasks).mockResolvedValue({
        success: true,
        data: []
      });

      vi.mocked(DatabaseUtils.getAllExecutionLogs).mockResolvedValue({
        success: true,
        data: []
      });

      vi.mocked(DatabaseUtils.healthCheck).mockResolvedValue({
        healthy: true,
        details: {
          connection: true,
          schema: true,
          tables: {}
        },
        errors: []
      });

      vi.mocked(LogService.getErrorLogs).mockResolvedValue({
        success: true,
        data: []
      });

      const request = new Request('http://localhost/api/metrics');
      const response = await HealthRoutes.metrics(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.timestamp).toBeDefined();
      expect(data.data.uptime).toBeDefined();
      expect(data.data.tasks).toBeDefined();
      expect(data.data.executions).toBeDefined();
      expect(data.data.database).toBeDefined();
      expect(data.data.errors).toBeDefined();
    });
  });

  describe('版本信息端点', () => {
    it('应该返回版本信息', async () => {
      const request = new Request('http://localhost/api/version');
      const response = await HealthRoutes.version(request, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('STMS API');
      expect(data.data.version).toBe('1.0.0');
      expect(data.data.environment).toBe('test');
    });
  });
});

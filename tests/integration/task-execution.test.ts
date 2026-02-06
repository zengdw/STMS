import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskService } from '../../server/services/task.service';
import { DatabaseUtils } from '../../server/utils/database';
import { Task, KeepaliveConfig, NotificationConfig, Environment } from '../../server/types';

// Mock DatabaseUtils
vi.mock('../../server/utils/database', () => ({
  DatabaseUtils: {
    createExecutionLog: vi.fn().mockResolvedValue({ success: true }),
    updateTask: vi.fn().mockResolvedValue({ success: true }),
    getExecutionLogsByTaskId: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getNotificationSettingsByUserId: vi.fn().mockResolvedValue({ success: true, data: null })
  }
}));

// Mock fetch
global.fetch = vi.fn();

describe('任务执行引擎集成测试', () => {
  let mockEnv: Environment;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      DB: {} as any,
      ENVIRONMENT: 'test',
      JWT_SECRET: 'test-secret'
    };
  });

  describe('保活任务HTTP请求执行', () => {
    it('应该使用正确的HTTP方法和URL发送GET请求', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'GET请求测试',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      const result = await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/health',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('应该使用正确的HTTP方法和请求体发送POST请求', async () => {
      const task: Task = {
        id: 'task-2',
        name: 'POST请求测试',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/ping',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ping: 'pong' }),
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 201,
        statusText: 'Created'
      } as Response);

      const result = await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/ping',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({ ping: 'pong' })
        })
      );
    });

    it('应该记录HTTP请求的响应时间', async () => {
      const task: Task = {
        id: 'task-3',
        name: '响应时间测试',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/test',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // 模拟延迟响应
      vi.mocked(global.fetch).mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            status: 200,
            statusText: 'OK'
          } as Response), 100)
        )
      );

      const result = await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(result.success).toBe(true);
      expect(result.responseTime).toBeGreaterThanOrEqual(100);
      expect(result.responseTime).toBeLessThan(200);
    });

    it('应该正确处理HTTP错误状态码', async () => {
      const task: Task = {
        id: 'task-4',
        name: 'HTTP错误测试',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/error',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response);

      const result = await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.error).toContain('HTTP 404');
    });

    it('应该记录执行日志', async () => {
      const task: Task = {
        id: 'task-5',
        name: '日志记录测试',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/test',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(DatabaseUtils.createExecutionLog).toHaveBeenCalledWith(
        mockEnv,
        expect.objectContaining({
          task_id: 'task-5',
          status: 'success'
        })
      );
    });

    it('应该更新任务的最后执行状态', async () => {
      const task: Task = {
        id: 'task-6',
        name: '状态更新测试',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/test',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(DatabaseUtils.updateTask).toHaveBeenCalledWith(
        mockEnv,
        'task-6',
        expect.objectContaining({
          last_status: 'success'
        })
      );
    });
  });

  describe('通知任务发送功能', () => {
    it('应该使用正确的NotifyX API配置发送通知', async () => {
      const task: Task = {
        id: 'task-7',
        name: '通知发送测试',
        type: 'notification',
        schedule: '0 9 * * *',
        config: {
          content: '这是一条测试通知',
          title: '测试标题',
          notifyxConfig: {
            apiKey: 'test-api-key-123',
            title: '测试标题',
            content: '这是一条测试通知'
          }
        } as NotificationConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      const result = await TaskService.executeNotificationTask(mockEnv, task);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.notifyx.cn/api/v1/send/test-api-key-123',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );

      // 验证请求体
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      expect(requestBody).toMatchObject({
        title: '测试标题',
        content: '这是一条测试通知'
      });
    });

    it('应该处理通知发送失败', async () => {
      const task: Task = {
        id: 'task-8',
        name: '通知失败测试',
        type: 'notification',
        schedule: '0 9 * * *',
        config: {
          content: '测试通知',
          title: '测试',
          notifyxConfig: {
            apiKey: 'invalid-key',
            title: '测试',
            content: '测试通知'
          }
        } as NotificationConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized')
      } as any);

      const result = await TaskService.executeNotificationTask(mockEnv, task);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.error).toContain('NotifyX API错误');
    });

    it('应该记录通知发送的执行日志', async () => {
      const task: Task = {
        id: 'task-9',
        name: '通知日志测试',
        type: 'notification',
        schedule: '0 9 * * *',
        config: {
          content: '测试通知',
          title: '测试',
          notifyxConfig: {
            apiKey: 'test-key',
            title: '测试',
            content: '测试通知'
          }
        } as NotificationConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      await TaskService.executeNotificationTask(mockEnv, task);

      expect(DatabaseUtils.createExecutionLog).toHaveBeenCalledWith(
        mockEnv,
        expect.objectContaining({
          task_id: 'task-9',
          status: 'success'
        })
      );
    });
  });

  describe('错误处理', () => {
    it('应该处理网络超时', async () => {
      const task: Task = {
        id: 'task-10',
        name: '超时测试',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/slow',
          method: 'GET',
          timeout: 100
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockRejectedValue(new Error('The operation was aborted'));

      const result = await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('aborted');
    });

    it('应该处理DNS解析失败', async () => {
      const task: Task = {
        id: 'task-11',
        name: 'DNS错误测试',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://invalid-domain-that-does-not-exist.com',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

      const result = await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该在失败时记录错误日志', async () => {
      const task: Task = {
        id: 'task-12',
        name: '错误日志测试',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/error',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(DatabaseUtils.createExecutionLog).toHaveBeenCalledWith(
        mockEnv,
        expect.objectContaining({
          task_id: 'task-12',
          status: 'failure',
          error_message: 'Network error'
        })
      );
    });

    it('应该在失败时更新任务状态为failure', async () => {
      const task: Task = {
        id: 'task-13',
        name: '失败状态测试',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/error',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockRejectedValue(new Error('Connection refused'));

      await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(DatabaseUtils.updateTask).toHaveBeenCalledWith(
        mockEnv,
        'task-13',
        expect.objectContaining({
          last_status: 'failure'
        })
      );
    });
  });
});

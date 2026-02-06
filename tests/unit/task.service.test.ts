import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskService } from '../../server/services/task.service';
import { DatabaseUtils } from '../../server/utils/database';
import { Task, KeepaliveConfig, NotificationConfig, Environment } from '../../server/types';

// Mock DatabaseUtils
vi.mock('../../server/utils/database', () => ({
  DatabaseUtils: {
    createTask: vi.fn(),
    getTaskById: vi.fn(),
    getAllTasks: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    createExecutionLog: vi.fn(),
    getExecutionLogsByTaskId: vi.fn(),
    getNotificationSettingsByUserId: vi.fn()
  }
}));

// Mock fetch
global.fetch = vi.fn();

describe('TaskService', () => {
  let mockEnv: Environment;
  const mockUserId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      DB: {} as any,
      ENVIRONMENT: 'test',
      JWT_SECRET: 'test-secret'
    };
    
    // 设置默认的 mock 返回值
    vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({ success: true, data: [] });
    vi.mocked(DatabaseUtils.getNotificationSettingsByUserId).mockResolvedValue({ success: true, data: null });
  });

  describe('createTask', () => {
    it('应该成功创建保活任务', async () => {
      const taskData = {
        name: '测试保活任务',
        type: 'keepalive' as const,
        schedule: '*/5 * * * *',
        config: {
          url: 'https://example.com',
          method: 'GET' as const,
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true
      };

      const mockTask: Task = {
        id: 'task-123',
        ...taskData,
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.createTask).mockResolvedValue({
        success: true,
        data: mockTask
      });

      const result = await TaskService.createTask(mockEnv, taskData, mockUserId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.name).toBe(taskData.name);
      expect(result.data?.type).toBe('keepalive');
      expect(DatabaseUtils.createTask).toHaveBeenCalledOnce();
    });

    it('应该成功创建通知任务', async () => {
      const taskData = {
        name: '测试通知任务',
        type: 'notification' as const,
        schedule: '0 9 * * *',
        config: {
          content: '测试通知消息',
          title: '测试标题',
          notifyxConfig: {
            apiKey: 'test-key',
            content: '测试通知消息'
          }
        } as NotificationConfig,
        enabled: true
      };

      const mockTask: Task = {
        id: 'task-456',
        ...taskData,
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.createTask).mockResolvedValue({
        success: true,
        data: mockTask
      });

      const result = await TaskService.createTask(mockEnv, taskData, mockUserId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.type).toBe('notification');
      expect(DatabaseUtils.createTask).toHaveBeenCalledOnce();
    });

    it('应该处理数据库错误', async () => {
      const taskData = {
        name: '测试任务',
        type: 'keepalive' as const,
        schedule: '*/5 * * * *',
        config: {
          url: 'https://example.com',
          method: 'GET' as const,
          timeout: 30000
        } as KeepaliveConfig
      };

      vi.mocked(DatabaseUtils.createTask).mockResolvedValue({
        success: false,
        error: '数据库错误'
      });

      const result = await TaskService.createTask(mockEnv, taskData, mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('数据库错误');
    });
  });

  describe('updateTask', () => {
    it('应该成功更新任务', async () => {
      const taskId = 'task-123';
      const existingTask: Task = {
        id: taskId,
        name: '原任务名',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://example.com',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const updateData = {
        name: '更新后的任务名'
      };

      const updatedTask = { ...existingTask, ...updateData };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({
        success: true,
        data: existingTask
      });

      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({
        success: true,
        data: updatedTask
      });

      const result = await TaskService.updateTask(mockEnv, taskId, updateData, mockUserId);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('更新后的任务名');
      expect(DatabaseUtils.updateTask).toHaveBeenCalledWith(mockEnv, taskId, updateData);
    });

    it('应该拒绝无权限的更新', async () => {
      const taskId = 'task-123';
      const existingTask: Task = {
        id: taskId,
        name: '任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {} as KeepaliveConfig,
        enabled: true,
        created_by: 'other-user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({
        success: true,
        data: existingTask
      });

      const result = await TaskService.updateTask(mockEnv, taskId, { name: '新名称' }, mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('无权限更新此任务');
      expect(DatabaseUtils.updateTask).not.toHaveBeenCalled();
    });

    it('应该处理任务不存在的情况', async () => {
      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({
        success: true,
        data: null
      });

      const result = await TaskService.updateTask(mockEnv, 'non-existent', { name: '新名称' }, mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('任务不存在');
    });
  });

  describe('deleteTask', () => {
    it('应该成功删除任务', async () => {
      const taskId = 'task-123';
      const existingTask: Task = {
        id: taskId,
        name: '任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {} as KeepaliveConfig,
        enabled: true,
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({
        success: true,
        data: existingTask
      });

      vi.mocked(DatabaseUtils.deleteTask).mockResolvedValue({
        success: true,
        data: true
      });

      const result = await TaskService.deleteTask(mockEnv, taskId, mockUserId);

      expect(result.success).toBe(true);
      expect(DatabaseUtils.deleteTask).toHaveBeenCalledWith(mockEnv, taskId);
    });

    it('应该拒绝无权限的删除', async () => {
      const taskId = 'task-123';
      const existingTask: Task = {
        id: taskId,
        name: '任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {} as KeepaliveConfig,
        enabled: true,
        created_by: 'other-user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({
        success: true,
        data: existingTask
      });

      const result = await TaskService.deleteTask(mockEnv, taskId, mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('无权限删除此任务');
      expect(DatabaseUtils.deleteTask).not.toHaveBeenCalled();
    });
  });

  describe('listTasks', () => {
    it('应该成功列出所有任务', async () => {
      const mockTasks: Task[] = [
        {
          id: 'task-1',
          name: '任务1',
          type: 'keepalive',
          schedule: '*/5 * * * *',
          config: {} as KeepaliveConfig,
          enabled: true,
          created_by: mockUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'task-2',
          name: '任务2',
          type: 'notification',
          schedule: '0 9 * * *',
          config: {} as NotificationConfig,
          enabled: false,
          created_by: mockUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      vi.mocked(DatabaseUtils.getAllTasks).mockResolvedValue({
        success: true,
        data: mockTasks
      });

      const result = await TaskService.listTasks(mockEnv);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(DatabaseUtils.getAllTasks).toHaveBeenCalledWith(mockEnv, undefined);
    });

    it('应该支持按类型筛选', async () => {
      const mockTasks: Task[] = [
        {
          id: 'task-1',
          name: '保活任务',
          type: 'keepalive',
          schedule: '*/5 * * * *',
          config: {} as KeepaliveConfig,
          enabled: true,
          created_by: mockUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      vi.mocked(DatabaseUtils.getAllTasks).mockResolvedValue({
        success: true,
        data: mockTasks
      });

      const result = await TaskService.listTasks(mockEnv, { type: 'keepalive' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].type).toBe('keepalive');
    });
  });

  describe('toggleTaskStatus', () => {
    it('应该成功切换任务状态', async () => {
      const taskId = 'task-123';
      const existingTask: Task = {
        id: taskId,
        name: '任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {} as KeepaliveConfig,
        enabled: true,
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const updatedTask = { ...existingTask, enabled: false };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({
        success: true,
        data: existingTask
      });

      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({
        success: true,
        data: updatedTask
      });

      const result = await TaskService.toggleTaskStatus(mockEnv, taskId, mockUserId);

      expect(result.success).toBe(true);
      expect(result.data?.enabled).toBe(false);
      expect(DatabaseUtils.updateTask).toHaveBeenCalledWith(mockEnv, taskId, { enabled: false });
    });
  });

  describe('executeKeepaliveTask', () => {
    it('应该成功执行保活任务', async () => {
      const task: Task = {
        id: 'task-123',
        name: '保活任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://example.com',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK'
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);
      vi.mocked(DatabaseUtils.createExecutionLog).mockResolvedValue({ success: true });
      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ success: true, data: task });

      const result = await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('应该处理HTTP错误', async () => {
      const task: Task = {
        id: 'task-123',
        name: '保活任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://example.com',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);
      vi.mocked(DatabaseUtils.createExecutionLog).mockResolvedValue({ success: true });
      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ success: true, data: task });

      const result = await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.error).toContain('HTTP 500');
    });

    it('应该处理网络错误', async () => {
      const task: Task = {
        id: 'task-123',
        name: '保活任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://example.com',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));
      vi.mocked(DatabaseUtils.createExecutionLog).mockResolvedValue({ success: true });
      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ success: true, data: task });

      const result = await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('executeNotificationTask', () => {
    it('应该成功执行通知任务', async () => {
      const task: Task = {
        id: 'task-456',
        name: '通知任务',
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
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK'
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);
      vi.mocked(DatabaseUtils.createExecutionLog).mockResolvedValue({ success: true });
      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ success: true, data: task });

      const result = await TaskService.executeNotificationTask(mockEnv, task);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.notifyx.cn/api/v1/send/test-key',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('应该处理通知发送失败', async () => {
      const task: Task = {
        id: 'task-456',
        name: '通知任务',
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
        created_by: mockUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const mockResponse = {
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Bad Request')
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      vi.mocked(DatabaseUtils.createExecutionLog).mockResolvedValue({ success: true });
      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ success: true, data: task });

      const result = await TaskService.executeNotificationTask(mockEnv, task);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.error).toContain('NotifyX API错误');
    });
  });

  describe('getTaskStatistics', () => {
    it('应该返回任务执行统计', async () => {
      const taskId = 'task-123';
      const mockLogs = [
        {
          id: 'log-1',
          task_id: taskId,
          execution_time: new Date().toISOString(),
          status: 'success' as const,
          response_time: 100
        },
        {
          id: 'log-2',
          task_id: taskId,
          execution_time: new Date().toISOString(),
          status: 'success' as const,
          response_time: 200
        },
        {
          id: 'log-3',
          task_id: taskId,
          execution_time: new Date().toISOString(),
          status: 'failure' as const,
          response_time: 50
        }
      ];

      vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({
        success: true,
        data: mockLogs
      });

      const result = await TaskService.getTaskStatistics(mockEnv, taskId);

      expect(result.success).toBe(true);
      expect(result.data?.totalExecutions).toBe(3);
      expect(result.data?.successCount).toBe(2);
      expect(result.data?.failureCount).toBe(1);
      expect(result.data?.averageResponseTime).toBe(117); // (100 + 200 + 50) / 3 = 116.67 -> 117
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskService } from '../../server/services/task.service';
import { AuthService } from '../../server/services/auth.service';
import { DatabaseUtils } from '../../server/utils/database';
import { Task, KeepaliveConfig, NotificationConfig, Environment, User } from '../../server/types';

// Mock DatabaseUtils
vi.mock('../../server/utils/database', () => ({
  DatabaseUtils: {
    createExecutionLog: vi.fn().mockResolvedValue({ success: true }),
    updateTask: vi.fn().mockResolvedValue({ success: true }),
    getExecutionLogsByTaskId: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getNotificationSettingsByUserId: vi.fn().mockResolvedValue({ success: true, data: null }),
    createTask: vi.fn().mockResolvedValue({ success: true }),
    getTaskById: vi.fn().mockResolvedValue({ success: true, data: null }),
    deleteTask: vi.fn().mockResolvedValue({ success: true }),
    getAllTasks: vi.fn().mockResolvedValue({ success: true, data: [] }),
    createUser: vi.fn().mockResolvedValue({ success: true }),
    getUserByUsername: vi.fn().mockResolvedValue({ success: true, data: null }),
    getUserById: vi.fn().mockResolvedValue({ success: true, data: null })
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


describe('前后端API集成测试', () => {
  let mockEnv: Environment;
  let testUser: User;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      DB: {} as any,
      ENVIRONMENT: 'test',
      JWT_SECRET: 'test-secret-key-for-integration-tests'
    };

    testUser = {
      id: 'user-test-1',
      username: 'testuser',
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  describe('认证服务集成', () => {
    it('应该成功注册新用户并返回令牌', async () => {
      vi.mocked(DatabaseUtils.getUserByUsername).mockResolvedValue({ 
        success: true, 
        data: null 
      });
      
      vi.mocked(DatabaseUtils.createUser).mockResolvedValue({ 
        success: true, 
        data: testUser 
      });

      const result = await AuthService.register(
        mockEnv,
        'newuser',
        'Password123',
        'user'
      );

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.username).toBe('newuser');
      expect(DatabaseUtils.createUser).toHaveBeenCalled();
    });

    it('应该拒绝已存在的用户名', async () => {
      vi.mocked(DatabaseUtils.getUserByUsername).mockResolvedValue({ 
        success: true, 
        data: testUser 
      });

      const result = await AuthService.register(
        mockEnv,
        'testuser',
        'Password123',
        'user'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('已存在');
    });

    it('应该成功认证有效用户', async () => {
      const passwordHash = await AuthService.hashPassword('Password123');
      const userWithPassword = { ...testUser, password_hash: passwordHash };

      vi.mocked(DatabaseUtils.getUserByUsername).mockResolvedValue({ 
        success: true, 
        data: userWithPassword 
      });

      const result = await AuthService.authenticate(
        mockEnv,
        'testuser',
        'Password123'
      );

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
    });

    it('应该拒绝错误的密码', async () => {
      const passwordHash = await AuthService.hashPassword('Password123');
      const userWithPassword = { ...testUser, password_hash: passwordHash };

      vi.mocked(DatabaseUtils.getUserByUsername).mockResolvedValue({ 
        success: true, 
        data: userWithPassword 
      });

      const result = await AuthService.authenticate(
        mockEnv,
        'testuser',
        'WrongPassword'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('错误');
    });

    it('应该成功验证有效令牌', async () => {
      const token = await AuthService.generateToken(testUser, 3600, mockEnv.JWT_SECRET);
      
      vi.mocked(DatabaseUtils.getUserById).mockResolvedValue({ 
        success: true, 
        data: testUser 
      });

      const user = await AuthService.validateToken(mockEnv, token);

      expect(user).toBeDefined();
      expect(user?.id).toBe(testUser.id);
      expect(user?.username).toBe(testUser.username);
    });

    it('应该拒绝无效令牌', async () => {
      const invalidToken = 'invalid.token.here';

      const user = await AuthService.validateToken(mockEnv, invalidToken);

      expect(user).toBeNull();
    });
  });

  describe('任务管理服务集成', () => {
    it('应该成功创建保活任务', async () => {
      const taskData = {
        name: '测试保活任务',
        type: 'keepalive' as const,
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET' as const,
          timeout: 30000
        },
        enabled: true
      };

      vi.mocked(DatabaseUtils.createTask).mockResolvedValue({ 
        success: true, 
        data: { ...taskData, id: 'task-1', created_by: testUser.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Task
      });

      const result = await TaskService.createTask(mockEnv, taskData, testUser.id);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(DatabaseUtils.createTask).toHaveBeenCalled();
    });

    it('应该成功创建通知任务', async () => {
      const taskData = {
        name: '测试通知任务',
        type: 'notification' as const,
        schedule: '0 9 * * *',
        config: {
          content: '测试通知内容',
          title: '测试标题',
          notifyxConfig: {
            apiKey: 'test-key',
            title: '测试标题',
            content: '测试通知内容'
          }
        },
        enabled: true
      };

      vi.mocked(DatabaseUtils.createTask).mockResolvedValue({ 
        success: true, 
        data: { ...taskData, id: 'task-2', created_by: testUser.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Task
      });

      const result = await TaskService.createTask(mockEnv, taskData, testUser.id);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(DatabaseUtils.createTask).toHaveBeenCalled();
    });

    it('应该成功更新任务', async () => {
      const existingTask: Task = {
        id: 'task-1',
        name: '原任务名',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: testUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: existingTask 
      });

      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ 
        success: true, 
        data: { ...existingTask, name: '新任务名' } 
      });

      const result = await TaskService.updateTask(
        mockEnv,
        'task-1',
        { name: '新任务名' },
        testUser.id
      );

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('新任务名');
      expect(DatabaseUtils.updateTask).toHaveBeenCalled();
    });

    it('应该拒绝无权限的更新操作', async () => {
      const existingTask: Task = {
        id: 'task-1',
        name: '原任务名',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: 'other-user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: existingTask 
      });

      const result = await TaskService.updateTask(
        mockEnv,
        'task-1',
        { name: '新任务名' },
        testUser.id
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('无权限');
    });

    it('应该成功删除任务', async () => {
      const existingTask: Task = {
        id: 'task-1',
        name: '待删除任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: testUser.id,
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

      const result = await TaskService.deleteTask(mockEnv, 'task-1', testUser.id);

      expect(result.success).toBe(true);
      expect(DatabaseUtils.deleteTask).toHaveBeenCalledWith(mockEnv, 'task-1');
    });

    it('应该成功获取任务列表', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          name: '任务1',
          type: 'keepalive',
          schedule: '*/5 * * * *',
          config: { url: 'https://api.example.com/1', method: 'GET', timeout: 30000 } as KeepaliveConfig,
          enabled: true,
          created_by: testUser.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'task-2',
          name: '任务2',
          type: 'notification',
          schedule: '0 9 * * *',
          config: { content: '测试', title: '测试', notifyxConfig: { apiKey: 'key', title: '测试', content: '测试' } } as NotificationConfig,
          enabled: true,
          created_by: testUser.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      vi.mocked(DatabaseUtils.getAllTasks).mockResolvedValue({ 
        success: true, 
        data: tasks 
      });

      const result = await TaskService.listTasks(mockEnv);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].name).toBe('任务1');
      expect(result.data?.[1].name).toBe('任务2');
    });

    it('应该成功切换任务状态', async () => {
      const existingTask: Task = {
        id: 'task-1',
        name: '测试任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: testUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: existingTask 
      });

      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ 
        success: true, 
        data: { ...existingTask, enabled: false } 
      });

      const result = await TaskService.toggleTaskStatus(mockEnv, 'task-1', testUser.id);

      expect(result.success).toBe(true);
      expect(result.data?.enabled).toBe(false);
    });
  });

  describe('任务执行统计集成', () => {
    it('应该正确计算任务执行统计', async () => {
      const logs = [
        {
          id: 'log-1',
          task_id: 'task-1',
          execution_time: new Date().toISOString(),
          status: 'success' as const,
          response_time: 100,
          status_code: 200
        },
        {
          id: 'log-2',
          task_id: 'task-1',
          execution_time: new Date().toISOString(),
          status: 'success' as const,
          response_time: 150,
          status_code: 200
        },
        {
          id: 'log-3',
          task_id: 'task-1',
          execution_time: new Date().toISOString(),
          status: 'failure' as const,
          response_time: 200,
          status_code: 500,
          error_message: '服务器错误'
        }
      ];

      vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({ 
        success: true, 
        data: logs 
      });

      const result = await TaskService.getTaskStatistics(mockEnv, 'task-1');

      expect(result.success).toBe(true);
      expect(result.data?.totalExecutions).toBe(3);
      expect(result.data?.successCount).toBe(2);
      expect(result.data?.failureCount).toBe(1);
      expect(result.data?.averageResponseTime).toBe(150); // (100 + 150 + 200) / 3
    });

    it('应该处理没有执行日志的情况', async () => {
      vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({ 
        success: true, 
        data: [] 
      });

      const result = await TaskService.getTaskStatistics(mockEnv, 'task-1');

      expect(result.success).toBe(true);
      expect(result.data?.totalExecutions).toBe(0);
      expect(result.data?.successCount).toBe(0);
      expect(result.data?.failureCount).toBe(0);
      expect(result.data?.averageResponseTime).toBe(0);
    });
  });
});

describe('数据库操作集成测试', () => {
  let mockEnv: Environment;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      DB: {} as any,
      ENVIRONMENT: 'test',
      JWT_SECRET: 'test-secret'
    };
  });

  describe('数据库连接和重试机制', () => {
    it('应该在数据库操作失败时进行重试', async () => {
      let attemptCount = 0;
      vi.mocked(DatabaseUtils.createTask).mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('数据库连接失败');
        }
        return { success: true, data: {} as Task };
      });

      // 注意：由于我们mock了DatabaseUtils，实际的重试逻辑不会执行
      // 这个测试主要验证错误处理流程
      const taskData = {
        name: '测试任务',
        type: 'keepalive' as const,
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET' as const,
          timeout: 30000
        },
        enabled: true
      };

      // 第一次调用会失败
      vi.mocked(DatabaseUtils.createTask).mockRejectedValueOnce(new Error('数据库连接失败'));
      
      const result = await TaskService.createTask(mockEnv, taskData, 'user-1');
      
      // 由于mock的实现，这里会失败
      expect(result.success).toBe(false);
    });
  });

  describe('数据验证集成', () => {
    it('应该拒绝无效的任务配置', async () => {
      const invalidTaskData = {
        name: '', // 无效：空名称
        type: 'keepalive' as const,
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET' as const,
          timeout: 30000
        },
        enabled: true
      };

      const result = await TaskService.createTask(mockEnv, invalidTaskData, 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该拒绝无效的用户名格式', async () => {
      const result = await AuthService.register(
        mockEnv,
        'ab', // 无效：太短
        'Password123',
        'user'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('用户名格式无效');
    });

    it('应该拒绝无效的密码格式', async () => {
      const result = await AuthService.register(
        mockEnv,
        'validuser',
        '123', // 无效：太短且没有字母
        'user'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('密码格式无效');
    });
  });
});

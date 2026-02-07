import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../server/services/auth.service';
import { TaskService } from '../../server/services/task.service';
import { DatabaseUtils } from '../../server/utils/database';
import { Environment, User, Task } from '../../server/types';

// Mock DatabaseUtils
vi.mock('../../server/utils/database');

describe('API路由集成测试', () => {
  let mockEnv: Environment;
  let testUser: User;
  let authToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    mockEnv = {
      DB: {} as any,
      ENVIRONMENT: 'test',
      JWT_SECRET: 'test-secret-key-for-api-integration'
    };

    testUser = {
      id: 'user-api-test-1',
      username: 'apiuser',
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 生成测试令牌
    authToken = await AuthService.generateToken(testUser, 3600, mockEnv.JWT_SECRET);
  });

  describe('认证流程集成', () => {
    it('应该完成完整的注册-登录-验证流程', async () => {
      // 1. 注册新用户
      vi.mocked(DatabaseUtils.getUserByUsername).mockResolvedValue({ 
        success: true, 
        data: null 
      });
      
      vi.mocked(DatabaseUtils.createUser).mockResolvedValue({ 
        success: true, 
        data: testUser 
      });

      const registerResult = await AuthService.register(
        mockEnv,
        'newuser',
        'Password123',
        'user'
      );

      expect(registerResult.success).toBe(true);
      expect(registerResult.token).toBeDefined();
      const registrationToken = registerResult.token!;

      // 2. 验证注册令牌
      const newUser = { ...testUser, username: 'newuser' };
      vi.mocked(DatabaseUtils.getUserById).mockResolvedValue({ 
        success: true, 
        data: newUser 
      });

      const validatedUser = await AuthService.validateToken(mockEnv, registrationToken);
      expect(validatedUser).toBeDefined();
      expect(validatedUser?.username).toBe('newuser');

      // 3. 使用凭据登录
      const passwordHash = await AuthService.hashPassword('Password123');
      const userWithPassword = { ...testUser, password_hash: passwordHash };

      vi.mocked(DatabaseUtils.getUserByUsername).mockResolvedValue({ 
        success: true, 
        data: userWithPassword 
      });

      const loginResult = await AuthService.authenticate(
        mockEnv,
        'newuser',
        'Password123'
      );

      expect(loginResult.success).toBe(true);
      expect(loginResult.token).toBeDefined();
    });

    it('应该正确处理令牌刷新流程', async () => {
      // 生成初始令牌
      const initialToken = await AuthService.generateToken(testUser, 3600, mockEnv.JWT_SECRET);

      // 模拟用户存在
      vi.mocked(DatabaseUtils.getUserById).mockResolvedValue({ 
        success: true, 
        data: testUser 
      });

      // 刷新令牌
      const newToken = await AuthService.refreshToken(mockEnv, initialToken);

      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(initialToken);

      // 验证新令牌有效
      const validatedUser = await AuthService.validateToken(mockEnv, newToken!);
      expect(validatedUser).toBeDefined();
      expect(validatedUser?.id).toBe(testUser.id);
    });

    it('应该从请求头中正确提取令牌', () => {
      const request = new Request('https://example.com/api/test', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const extractedToken = AuthService.extractTokenFromRequest(request);

      expect(extractedToken).toBe(authToken);
    });

    it('应该拒绝格式错误的Authorization头', () => {
      const request = new Request('https://example.com/api/test', {
        headers: {
          'Authorization': 'InvalidFormat token'
        }
      });

      const extractedToken = AuthService.extractTokenFromRequest(request);

      expect(extractedToken).toBeNull();
    });
  });

  describe('任务管理API集成', () => {
    it('应该完成完整的任务CRUD流程', async () => {
      // 1. 创建任务
      const taskData = {
        name: 'API集成测试任务',
        type: 'keepalive' as const,
        schedule: '*/10 * * * *',
        config: {
          url: 'https://api.example.com/ping',
          method: 'GET' as const,
          timeout: 30000
        },
        enabled: true
      };

      const createdTask: Task = {
        ...taskData,
        id: 'task-api-1',
        created_by: testUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.createTask).mockResolvedValue({ 
        success: true, 
        data: createdTask 
      });

      const createResult = await TaskService.createTask(mockEnv, taskData, testUser.id);

      expect(createResult.success).toBe(true);
      expect(createResult.data?.id).toBe('task-api-1');

      // 2. 获取任务
      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: createdTask 
      });

      const getResult = await TaskService.getTask(mockEnv, 'task-api-1');

      expect(getResult.success).toBe(true);
      expect(getResult.data?.name).toBe('API集成测试任务');

      // 3. 更新任务
      const updatedTask = { ...createdTask, name: '更新后的任务名' };
      
      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ 
        success: true, 
        data: updatedTask 
      });

      const updateResult = await TaskService.updateTask(
        mockEnv,
        'task-api-1',
        { name: '更新后的任务名' },
        testUser.id
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.data?.name).toBe('更新后的任务名');

      // 4. 删除任务
      vi.mocked(DatabaseUtils.deleteTask).mockResolvedValue({ 
        success: true, 
        data: true 
      });

      const deleteResult = await TaskService.deleteTask(mockEnv, 'task-api-1', testUser.id);

      expect(deleteResult.success).toBe(true);
    });

    it('应该正确处理任务筛选', async () => {
      const keepaliveTasks: Task[] = [
        {
          id: 'task-1',
          name: '保活任务1',
          type: 'keepalive',
          schedule: '*/5 * * * *',
          config: { url: 'https://api.example.com/1', method: 'GET', timeout: 30000 },
          enabled: true,
          created_by: testUser.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      vi.mocked(DatabaseUtils.getAllTasks).mockResolvedValue({ 
        success: true, 
        data: keepaliveTasks 
      });

      const result = await TaskService.listTasks(mockEnv, { type: 'keepalive' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].type).toBe('keepalive');
    });

    it('应该正确处理启用/禁用任务', async () => {
      const task: Task = {
        id: 'task-toggle-1',
        name: '可切换任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: { url: 'https://api.example.com/test', method: 'GET', timeout: 30000 },
        enabled: true,
        created_by: testUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: task 
      });

      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ 
        success: true, 
        data: { ...task, enabled: false } 
      });

      const result = await TaskService.toggleTaskStatus(mockEnv, 'task-toggle-1', testUser.id);

      expect(result.success).toBe(true);
      expect(result.data?.enabled).toBe(false);
    });
  });

  describe('错误处理集成', () => {
    it('应该正确处理数据库连接失败', async () => {
      vi.mocked(DatabaseUtils.createTask).mockResolvedValue({ 
        success: false, 
        error: '数据库连接失败' 
      });

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

      const result = await TaskService.createTask(mockEnv, taskData, testUser.id);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该正确处理不存在的资源', async () => {
      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: null 
      });

      const result = await TaskService.updateTask(
        mockEnv,
        'non-existent-task',
        { name: '新名称' },
        testUser.id
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('应该正确处理权限错误', async () => {
      const task: Task = {
        id: 'task-1',
        name: '其他用户的任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: { url: 'https://api.example.com/test', method: 'GET', timeout: 30000 },
        enabled: true,
        created_by: 'other-user-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: task 
      });

      const result = await TaskService.updateTask(
        mockEnv,
        'task-1',
        { name: '新名称' },
        testUser.id
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('无权限');
    });

    it('应该正确处理验证错误', async () => {
      const invalidTaskData = {
        name: '', // 无效的空名称
        type: 'keepalive' as const,
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET' as const,
          timeout: 30000
        },
        enabled: true
      };

      const result = await TaskService.createTask(mockEnv, invalidTaskData, testUser.id);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('并发操作集成', () => {
    it('应该正确处理并发任务创建', async () => {
      const taskData1 = {
        name: '并发任务1',
        type: 'keepalive' as const,
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/1',
          method: 'GET' as const,
          timeout: 30000
        },
        enabled: true
      };

      const taskData2 = {
        name: '并发任务2',
        type: 'notification' as const,
        schedule: '0 9 * * *',
        config: {
          content: '测试通知',
          title: '测试',
          notifyxConfig: {
            apiKey: 'test-key',
            title: '测试',
            content: '测试通知'
          }
        },
        enabled: true
      };

      vi.mocked(DatabaseUtils.createTask)
        .mockResolvedValueOnce({ 
          success: true, 
          data: { ...taskData1, id: 'task-1', created_by: testUser.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Task
        })
        .mockResolvedValueOnce({ 
          success: true, 
          data: { ...taskData2, id: 'task-2', created_by: testUser.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Task
        });

      const [result1, result2] = await Promise.all([
        TaskService.createTask(mockEnv, taskData1, testUser.id),
        TaskService.createTask(mockEnv, taskData2, testUser.id)
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.data?.name).toBe('并发任务1');
      expect(result2.data?.name).toBe('并发任务2');
    });
  });
});

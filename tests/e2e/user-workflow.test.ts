import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../server/services/auth.service';
import { TaskService } from '../../server/services/task.service';
import { CronService } from '../../server/services/cron.service';
import { DatabaseUtils } from '../../server/utils/database';
import { Environment, User, Task, KeepaliveConfig, NotificationConfig } from '../../server/types';

// Mock DatabaseUtils
vi.mock('../../server/utils/database');

// Mock LogService
vi.mock('../../server/services/log.service', () => ({
  LogService: {
    logAudit: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock fetch
global.fetch = vi.fn();

describe('端到端用户工作流程测试', () => {
  let mockEnv: Environment;
  let testUser: User;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockEnv = {
      DB: {} as any,
      ENVIRONMENT: 'test',
      JWT_SECRET: 'test-secret-key-for-e2e-tests'
    };

    testUser = {
      id: 'user-e2e-1',
      username: 'e2euser',
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  describe('完整的保活任务工作流程', () => {
    it('应该完成从创建到执行的完整保活任务流程', async () => {
      // 步骤1: 用户注册
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
        'e2euser',
        'Password123',
        'admin'
      );

      expect(registerResult.success).toBe(true);
      expect(registerResult.token).toBeDefined();
      expect(registerResult.user?.username).toBe('e2euser');

      // 步骤2: 创建保活任务
      const taskData = {
        name: 'E2E保活任务',
        type: 'keepalive' as const,
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET' as const,
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true
      };

      const createdTask: Task = {
        ...taskData,
        id: 'task-e2e-1',
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
      expect(createResult.data?.name).toBe('E2E保活任务');

      // 步骤3: 验证任务已创建
      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: createdTask 
      });

      const getResult = await TaskService.getTask(mockEnv, 'task-e2e-1');

      expect(getResult.success).toBe(true);
      expect(getResult.data?.enabled).toBe(true);

      // 步骤4: 直接执行任务（不通过Cron调度器，避免时间匹配问题）
      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: createdTask 
      });

      vi.mocked(DatabaseUtils.createExecutionLog).mockResolvedValue({ 
        success: true,
        data: {
          id: 'log-1',
          task_id: 'task-e2e-1',
          execution_time: new Date().toISOString(),
          status: 'success',
          response_time: 120,
          status_code: 200
        }
      });

      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ 
        success: true, 
        data: createdTask 
      });

      vi.mocked(DatabaseUtils.getNotificationSettingsByUserId).mockResolvedValue({ 
        success: true, 
        data: null 
      });

      vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({ 
        success: true, 
        data: [] 
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      const execResult = await TaskService.executeKeepaliveTask(mockEnv, createdTask);

      expect(execResult.success).toBe(true);
      expect(execResult.statusCode).toBe(200);

      // 步骤5: 验证执行日志已记录
      expect(DatabaseUtils.createExecutionLog).toHaveBeenCalled();
      expect(DatabaseUtils.updateTask).toHaveBeenCalled();

      // 步骤6: 获取任务统计
      vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({ 
        success: true, 
        data: [
          {
            id: 'log-1',
            task_id: 'task-e2e-1',
            execution_time: new Date().toISOString(),
            status: 'success',
            response_time: 120,
            status_code: 200
          }
        ] 
      });

      const statsResult = await TaskService.getTaskStatistics(mockEnv, 'task-e2e-1');

      expect(statsResult.success).toBe(true);
      expect(statsResult.data?.totalExecutions).toBe(1);
      expect(statsResult.data?.successCount).toBe(1);

      // 步骤7: 禁用任务
      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ 
        success: true, 
        data: { ...createdTask, enabled: false } 
      });

      const toggleResult = await TaskService.toggleTaskStatus(mockEnv, 'task-e2e-1', testUser.id);

      expect(toggleResult.success).toBe(true);
      expect(toggleResult.data?.enabled).toBe(false);

      // 步骤8: 删除任务
      vi.mocked(DatabaseUtils.deleteTask).mockResolvedValue({ 
        success: true, 
        data: true 
      });

      const deleteResult = await TaskService.deleteTask(mockEnv, 'task-e2e-1', testUser.id);

      expect(deleteResult.success).toBe(true);
    });
  });

  describe('完整的通知任务工作流程', () => {
    it('应该完成从创建到执行的完整通知任务流程', async () => {
      // 步骤1: 用户已登录（使用现有用户）
      vi.mocked(DatabaseUtils.getUserById).mockResolvedValue({ 
        success: true, 
        data: testUser 
      });

      const token = await AuthService.generateToken(testUser, 3600, mockEnv.JWT_SECRET);
      const validatedUser = await AuthService.validateToken(mockEnv, token);

      expect(validatedUser).toBeDefined();
      expect(validatedUser?.id).toBe(testUser.id);

      // 步骤2: 创建通知任务
      const taskData = {
        name: 'E2E通知任务',
        type: 'notification' as const,
        schedule: '0 9 * * *',
        config: {
          content: '这是一条E2E测试通知',
          title: 'E2E测试',
          notifyxConfig: {
            apiKey: 'test-api-key',
            title: 'E2E测试',
            content: '这是一条E2E测试通知'
          }
        } as NotificationConfig,
        enabled: true
      };

      const createdTask: Task = {
        ...taskData,
        id: 'task-e2e-notif-1',
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
      expect(createResult.data?.type).toBe('notification');

      // 步骤3: 直接执行通知任务（不通过Cron调度器）
      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: createdTask 
      });

      vi.mocked(DatabaseUtils.createExecutionLog).mockResolvedValue({ 
        success: true,
        data: {
          id: 'log-notif-1',
          task_id: 'task-e2e-notif-1',
          execution_time: new Date().toISOString(),
          status: 'success',
          response_time: 250,
          status_code: 200
        }
      });

      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ 
        success: true, 
        data: createdTask 
      });

      vi.mocked(DatabaseUtils.getNotificationSettingsByUserId).mockResolvedValue({ 
        success: true, 
        data: null 
      });

      vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({ 
        success: true, 
        data: [] 
      });

      // Mock NotifyX API响应
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      const execResult = await TaskService.executeNotificationTask(mockEnv, createdTask);

      expect(execResult.success).toBe(true);

      // 步骤4: 验证通知已发送
      expect(global.fetch).toHaveBeenCalled();
      expect(DatabaseUtils.createExecutionLog).toHaveBeenCalled();

      // 步骤5: 查看执行日志
      vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({ 
        success: true, 
        data: [
          {
            id: 'log-notif-1',
            task_id: 'task-e2e-notif-1',
            execution_time: new Date().toISOString(),
            status: 'success',
            response_time: 250,
            status_code: 200
          }
        ] 
      });

      const statsResult = await TaskService.getTaskStatistics(mockEnv, 'task-e2e-notif-1');

      expect(statsResult.success).toBe(true);
      expect(statsResult.data?.successCount).toBe(1);
    });
  });

  describe('错误场景和恢复机制', () => {
    it('应该正确处理任务执行失败并记录错误', async () => {
      // 步骤1: 创建会失败的保活任务
      const taskData = {
        name: '会失败的任务',
        type: 'keepalive' as const,
        schedule: '*/5 * * * *',
        config: {
          url: 'https://invalid-domain-that-does-not-exist.com',
          method: 'GET' as const,
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true
      };

      const createdTask: Task = {
        ...taskData,
        id: 'task-fail-1',
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

      // 步骤2: 执行任务（会失败）
      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: createdTask 
      });

      vi.mocked(DatabaseUtils.createExecutionLog).mockResolvedValue({ 
        success: true 
      });

      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ 
        success: true, 
        data: { ...createdTask, last_status: 'failure' } 
      });

      vi.mocked(DatabaseUtils.getNotificationSettingsByUserId).mockResolvedValue({ 
        success: true, 
        data: null 
      });

      // Mock网络错误
      vi.mocked(global.fetch).mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

      const execResult = await TaskService.executeKeepaliveTask(mockEnv, createdTask);

      expect(execResult.success).toBe(false);
      expect(execResult.error).toBeDefined();

      // 步骤3: 验证错误日志已记录
      expect(DatabaseUtils.createExecutionLog).toHaveBeenCalledWith(
        mockEnv,
        expect.objectContaining({
          task_id: 'task-fail-1',
          status: 'failure'
        })
      );

      // 步骤4: 验证任务状态已更新为失败
      expect(DatabaseUtils.updateTask).toHaveBeenCalledWith(
        mockEnv,
        'task-fail-1',
        expect.objectContaining({
          last_status: 'failure'
        })
      );

      // 步骤5: 查看失败统计
      vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({ 
        success: true, 
        data: [
          {
            id: 'log-fail-1',
            task_id: 'task-fail-1',
            execution_time: new Date().toISOString(),
            status: 'failure',
            response_time: 100,
            error_message: 'getaddrinfo ENOTFOUND'
          }
        ] 
      });

      const statsResult = await TaskService.getTaskStatistics(mockEnv, 'task-fail-1');

      expect(statsResult.success).toBe(true);
      expect(statsResult.data?.failureCount).toBe(1);
    });

    it('应该正确处理从失败到成功的恢复场景', async () => {
      const task: Task = {
        id: 'task-recovery-1',
        name: '恢复测试任务',
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
        updated_at: new Date().toISOString(),
        last_status: 'failure' // 之前失败过
      };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: task 
      });

      vi.mocked(DatabaseUtils.createExecutionLog).mockResolvedValue({ 
        success: true 
      });

      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ 
        success: true, 
        data: { ...task, last_status: 'success' } 
      });

      vi.mocked(DatabaseUtils.getNotificationSettingsByUserId).mockResolvedValue({ 
        success: true, 
        data: null 
      });

      // 模拟之前有失败记录
      vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({ 
        success: true, 
        data: [
          {
            id: 'log-1',
            task_id: 'task-recovery-1',
            execution_time: new Date(Date.now() - 60000).toISOString(),
            status: 'failure',
            error_message: '连接超时'
          },
          {
            id: 'log-2',
            task_id: 'task-recovery-1',
            execution_time: new Date(Date.now() - 120000).toISOString(),
            status: 'failure',
            error_message: '连接超时'
          }
        ] 
      });

      // Mock成功的响应
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      const execResult = await TaskService.executeKeepaliveTask(mockEnv, task);

      expect(execResult.success).toBe(true);
      expect(execResult.statusCode).toBe(200);

      // 验证状态已更新为成功
      expect(DatabaseUtils.updateTask).toHaveBeenCalledWith(
        mockEnv,
        'task-recovery-1',
        expect.objectContaining({
          last_status: 'success'
        })
      );
    });
  });

  describe('多任务并发执行场景', () => {
    it('应该正确处理多个任务同时执行', async () => {
      const tasks: Task[] = [
        {
          id: 'task-concurrent-1',
          name: '并发任务1',
          type: 'keepalive',
          schedule: '*/5 * * * *',
          config: {
            url: 'https://api.example.com/1',
            method: 'GET',
            timeout: 30000
          } as KeepaliveConfig,
          enabled: true,
          created_by: testUser.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'task-concurrent-2',
          name: '并发任务2',
          type: 'keepalive',
          schedule: '*/5 * * * *',
          config: {
            url: 'https://api.example.com/2',
            method: 'GET',
            timeout: 30000
          } as KeepaliveConfig,
          enabled: true,
          created_by: testUser.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'task-concurrent-3',
          name: '并发通知任务',
          type: 'notification',
          schedule: '0 9 * * *',
          config: {
            content: '并发通知',
            title: '测试',
            notifyxConfig: {
              apiKey: 'test-key',
              title: '测试',
              content: '并发通知'
            }
          } as NotificationConfig,
          enabled: true,
          created_by: testUser.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      vi.mocked(DatabaseUtils.createExecutionLog).mockResolvedValue({ 
        success: true,
        data: {
          id: 'log-1',
          task_id: 'task-1',
          execution_time: new Date().toISOString(),
          status: 'success',
          response_time: 100,
          status_code: 200
        }
      });

      vi.mocked(DatabaseUtils.updateTask).mockResolvedValue({ 
        success: true 
      });

      vi.mocked(DatabaseUtils.getNotificationSettingsByUserId).mockResolvedValue({ 
        success: true, 
        data: null 
      });

      vi.mocked(DatabaseUtils.getExecutionLogsByTaskId).mockResolvedValue({ 
        success: true, 
        data: [] 
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      // 直接执行每个任务
      const results = await Promise.all(
        tasks.map(task => {
          if (task.type === 'keepalive') {
            return TaskService.executeKeepaliveTask(mockEnv, task);
          } else {
            return TaskService.executeNotificationTask(mockEnv, task);
          }
        })
      );

      // 验证所有任务都成功执行
      expect(results.every(r => r.success)).toBe(true);
      expect(results).toHaveLength(3);

      // 验证所有任务都被执行
      expect(DatabaseUtils.createExecutionLog).toHaveBeenCalledTimes(3);
      expect(DatabaseUtils.updateTask).toHaveBeenCalledTimes(3);
    });
  });

  describe('用户权限和安全场景', () => {
    it('应该阻止用户访问其他用户的任务', async () => {
      const otherUser: User = {
        id: 'other-user-id',
        username: 'otheruser',
        role: 'user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const otherUserTask: Task = {
        id: 'task-other-1',
        name: '其他用户的任务',
        type: 'keepalive',
        schedule: '*/5 * * * *',
        config: {
          url: 'https://api.example.com/test',
          method: 'GET',
          timeout: 30000
        } as KeepaliveConfig,
        enabled: true,
        created_by: otherUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      vi.mocked(DatabaseUtils.getTaskById).mockResolvedValue({ 
        success: true, 
        data: otherUserTask 
      });

      // 尝试更新其他用户的任务
      const updateResult = await TaskService.updateTask(
        mockEnv,
        'task-other-1',
        { name: '尝试修改' },
        testUser.id
      );

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toContain('无权限');

      // 尝试删除其他用户的任务
      const deleteResult = await TaskService.deleteTask(
        mockEnv,
        'task-other-1',
        testUser.id
      );

      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toContain('无权限');
    });

    it('应该正确验证令牌过期', async () => {
      // 生成一个已过期的令牌（过期时间为-1秒）
      const expiredToken = await AuthService.generateToken(testUser, -1, mockEnv.JWT_SECRET);

      // 等待令牌过期
      await new Promise(resolve => setTimeout(resolve, 1100));

      const validatedUser = await AuthService.validateToken(mockEnv, expiredToken);

      expect(validatedUser).toBeNull();
    });
  });
});

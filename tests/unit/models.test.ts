import { describe, it, expect } from 'vitest';
import { UserModel } from '../../server/models/user.model.js';
import { TaskModel } from '../../server/models/task.model.js';
import { ExecutionLogModel } from '../../server/models/execution-log.model.js';
import { NotificationSettingsModel } from '../../server/models/notification-settings.model.js';

describe('数据模型测试', () => {
  describe('用户模型验证', () => {
    it('应该验证有效的用户名', () => {
      expect(UserModel.validateUsername('validuser')).toBe(true);
      expect(UserModel.validateUsername('user123')).toBe(true);
      expect(UserModel.validateUsername('test_user')).toBe(true);
    });

    it('应该拒绝无效的用户名', () => {
      expect(UserModel.validateUsername('ab')).toBe(false); // 太短
      expect(UserModel.validateUsername('a'.repeat(21))).toBe(false); // 太长
      expect(UserModel.validateUsername('user@name')).toBe(false); // 包含特殊字符
      expect(UserModel.validateUsername('')).toBe(false); // 空字符串
    });

    it('应该验证有效的密码', () => {
      expect(UserModel.validatePassword('Password123')).toBe(true);
      expect(UserModel.validatePassword('Test1234')).toBe(true);
    });

    it('应该拒绝无效的密码', () => {
      expect(UserModel.validatePassword('short1')).toBe(false); // 太短
      expect(UserModel.validatePassword('NoNumbers')).toBe(false); // 没有数字
      expect(UserModel.validatePassword('12345678')).toBe(false); // 没有字母
      expect(UserModel.validatePassword('')).toBe(false); // 空字符串
    });

    it('应该验证有效的用户角色', () => {
      expect(UserModel.validateRole('admin')).toBe(true);
      expect(UserModel.validateRole('user')).toBe(true);
    });

    it('应该拒绝无效的用户角色', () => {
      expect(UserModel.validateRole('superadmin')).toBe(false);
      expect(UserModel.validateRole('guest')).toBe(false);
      expect(UserModel.validateRole('')).toBe(false);
    });

    it('应该验证完整的用户数据', () => {
      const validUser = {
        username: 'testuser',
        password_hash: 'hashed_password',
        role: 'user' as const
      };
      
      const validation = UserModel.validate(validUser);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('应该拒绝无效的用户数据', () => {
      const invalidUser = {
        username: 'ab', // 太短
        password_hash: '',
        role: 'invalid' as any
      };
      
      const validation = UserModel.validate(invalidUser);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('任务模型验证', () => {
    it('应该验证有效的任务名称', () => {
      expect(TaskModel.validateName('测试任务')).toBe(true);
      expect(TaskModel.validateName('Test Task')).toBe(true);
      expect(TaskModel.validateName('a')).toBe(true);
    });

    it('应该拒绝无效的任务名称', () => {
      expect(TaskModel.validateName('')).toBe(false);
      expect(TaskModel.validateName('   ')).toBe(false);
      expect(TaskModel.validateName('a'.repeat(101))).toBe(false);
    });

    it('应该验证有效的任务类型', () => {
      expect(TaskModel.validateType('keepalive')).toBe(true);
      expect(TaskModel.validateType('notification')).toBe(true);
    });

    it('应该拒绝无效的任务类型', () => {
      expect(TaskModel.validateType('invalid')).toBe(false);
      expect(TaskModel.validateType('')).toBe(false);
    });

    it('应该验证有效的Cron表达式', () => {
      expect(TaskModel.validateSchedule('*/5 * * * *')).toBe(true);
      expect(TaskModel.validateSchedule('0 0 * * *')).toBe(true);
      expect(TaskModel.validateSchedule('30 2 * * 1')).toBe(true);
    });

    it('应该拒绝无效的Cron表达式', () => {
      expect(TaskModel.validateSchedule('invalid')).toBe(false);
      expect(TaskModel.validateSchedule('')).toBe(false);
      expect(TaskModel.validateSchedule('* * * *')).toBe(false); // 缺少字段
    });

    it('应该验证有效的保活任务配置', () => {
      const config = {
        url: 'https://example.com',
        method: 'GET' as const,
        timeout: 30000
      };
      
      const validation = TaskModel.validateKeepaliveConfig(config);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('应该拒绝无效的保活任务配置', () => {
      const config = {
        url: 'invalid-url',
        method: 'INVALID' as any,
        timeout: -1
      };
      
      const validation = TaskModel.validateKeepaliveConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('应该验证有效的通知任务配置', () => {
      const config = {
        message: '测试通知',
        priority: 'normal' as const,
        notifyxConfig: {
          apiKey: 'test-key',
          channelId: 'test-channel',
          message: '测试消息'
        }
      };
      
      const validation = TaskModel.validateNotificationConfig(config);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('执行日志模型验证', () => {
    it('应该验证有效的任务ID', () => {
      expect(ExecutionLogModel.validateTaskId('task-123')).toBe(true);
      expect(ExecutionLogModel.validateTaskId('abc')).toBe(true);
    });

    it('应该拒绝无效的任务ID', () => {
      expect(ExecutionLogModel.validateTaskId('')).toBe(false);
      expect(ExecutionLogModel.validateTaskId('   ')).toBe(false);
    });

    it('应该验证有效的执行状态', () => {
      expect(ExecutionLogModel.validateStatus('success')).toBe(true);
      expect(ExecutionLogModel.validateStatus('failure')).toBe(true);
    });

    it('应该拒绝无效的执行状态', () => {
      expect(ExecutionLogModel.validateStatus('pending')).toBe(false);
      expect(ExecutionLogModel.validateStatus('')).toBe(false);
    });

    it('应该验证有效的响应时间', () => {
      expect(ExecutionLogModel.validateResponseTime(0)).toBe(true);
      expect(ExecutionLogModel.validateResponseTime(1000)).toBe(true);
      expect(ExecutionLogModel.validateResponseTime(30000)).toBe(true);
    });

    it('应该拒绝无效的响应时间', () => {
      expect(ExecutionLogModel.validateResponseTime(-1)).toBe(false);
      expect(ExecutionLogModel.validateResponseTime(300001)).toBe(false);
    });

    it('应该验证有效的HTTP状态码', () => {
      expect(ExecutionLogModel.validateStatusCode(200)).toBe(true);
      expect(ExecutionLogModel.validateStatusCode(404)).toBe(true);
      expect(ExecutionLogModel.validateStatusCode(500)).toBe(true);
    });

    it('应该拒绝无效的HTTP状态码', () => {
      expect(ExecutionLogModel.validateStatusCode(99)).toBe(false);
      expect(ExecutionLogModel.validateStatusCode(600)).toBe(false);
    });
  });

  describe('通知设置模型验证', () => {
    it('应该验证有效的邮箱地址', () => {
      expect(NotificationSettingsModel.validateEmail('test@example.com')).toBe(true);
      expect(NotificationSettingsModel.validateEmail('user.name@domain.co.uk')).toBe(true);
    });

    it('应该拒绝无效的邮箱地址', () => {
      expect(NotificationSettingsModel.validateEmail('invalid')).toBe(false);
      expect(NotificationSettingsModel.validateEmail('test@')).toBe(false);
      expect(NotificationSettingsModel.validateEmail('@example.com')).toBe(false);
      expect(NotificationSettingsModel.validateEmail('')).toBe(false);
    });

    it('应该验证有效的Webhook URL', () => {
      expect(NotificationSettingsModel.validateWebhookUrl('https://example.com/webhook')).toBe(true);
      expect(NotificationSettingsModel.validateWebhookUrl('http://localhost:3000/hook')).toBe(true);
    });

    it('应该拒绝无效的Webhook URL', () => {
      expect(NotificationSettingsModel.validateWebhookUrl('ftp://example.com')).toBe(false);
      expect(NotificationSettingsModel.validateWebhookUrl('invalid-url')).toBe(false);
      expect(NotificationSettingsModel.validateWebhookUrl('')).toBe(false);
    });

    it('应该验证有效的失败阈值', () => {
      expect(NotificationSettingsModel.validateFailureThreshold(1)).toBe(true);
      expect(NotificationSettingsModel.validateFailureThreshold(50)).toBe(true);
      expect(NotificationSettingsModel.validateFailureThreshold(100)).toBe(true);
    });

    it('应该拒绝无效的失败阈值', () => {
      expect(NotificationSettingsModel.validateFailureThreshold(0)).toBe(false);
      expect(NotificationSettingsModel.validateFailureThreshold(101)).toBe(false);
      expect(NotificationSettingsModel.validateFailureThreshold(-1)).toBe(false);
    });
  });
});

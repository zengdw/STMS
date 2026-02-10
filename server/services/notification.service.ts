import { Environment, Task, NotifyXConfig, NotificationSettings, ExecutionLog } from '../types/index.js';
import { DatabaseUtils } from '../utils/database.js';
import { NotificationSettingsModel } from '../models/notification-settings.model.js';
import { Resend } from 'resend';

/**
 * 通知服务类
 * 提供通知发送和管理功能
 */
export class NotificationService {
  /**
   * 发送NotifyX消息
   * @param config NotifyX配置
   * @returns 发送结果
   */
  static async sendNotification(
    env: Environment,
    settings: NotificationSettings,
    title: string,
    message: string,
    metadata?: any
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const results: boolean[] = [];
      const errors: string[] = [];


      // 检查通知时段 (Notification Time Window)
      if (settings.allowed_time_slots) {
        const now = new Date();
        const currentHour = now.getHours();
        // Skip check for 'test' or 'urgent' notifications, or implement priority logic
        if (metadata?.type !== 'test') {
          const allowedHours = settings.allowed_time_slots.split(/[,，\s]+/).map((h: string) => parseInt(h, 10)).filter((h: number) => !isNaN(h));
          if (allowedHours.length > 0 && !allowedHours.includes(currentHour)) {
            return { success: false, error: `当前时间(${currentHour}时)不在允许的通知时段内` };
          }
        }
      }

      // 发送NotifyX通知
      if (settings.notifyx_enabled && settings.notifyx_api_key) {
        const notifyxResult = await this.sendNotifyXMessage({
          apiKey: settings.notifyx_api_key,
          message: message,
          title: title
        });
        results.push(notifyxResult.success);
        if (!notifyxResult.success) {
          errors.push(`NotifyX: ${notifyxResult.error}`);
        }
      }

      // 发送邮件通知
      if (settings.email_enabled && settings.email_address && settings.email_api_key) {
        const emailResult = await this.sendEmailNotification(
          settings.email_address,
          title,
          message,
          settings.email_api_key
        );
        results.push(emailResult.success);
        if (!emailResult.success) {
          errors.push(`Email: ${emailResult.error}`);
        }
      }

      // 发送Webhook通知
      if (settings.webhook_enabled && settings.webhook_url) {
        const webhookResult = await this.sendWebhookNotification(
          settings.webhook_url,
          {
            title,
            message,
            ...metadata,
            timestamp: new Date().toISOString()
          }
        );
        results.push(webhookResult.success);
        if (!webhookResult.success) {
          errors.push(`Webhook: ${webhookResult.error}`);
        }
      }

      // 如果没有启用任何渠道
      if (results.length === 0) {
        return { success: false, error: '未启用任何通知渠道' };
      }

      // 如果至少有一个通知发送成功，则认为成功
      const success = results.some(r => r);

      return {
        success,
        error: success ? undefined : `所有通知渠道发送失败: ${errors.join(', ')}`
      };
    } catch (error) {
      return {
        success: false,
        error: `发送通知异常: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 发送测试通知
   */
  static async testNotification(
    env: Environment,
    settings: NotificationSettings,
    channel?: 'email' | 'webhook' | 'notifyx'
  ): Promise<{ success: boolean; error?: string }> {
    const title = 'STMS 测试通知';
    const message = '这是一条来自 STMS 的测试通知。如果您收到这条消息，说明您的通知设置配置正确。';
    const metadata = { type: 'test' };

    if (channel) {
      // Test specific channel
      if (channel === 'notifyx') {
        if (!settings.notifyx_enabled || !settings.notifyx_api_key) return { success: false, error: 'NotifyX 未启用或未配置密钥' };
        const result = await this.sendNotifyXMessage({ apiKey: settings.notifyx_api_key, message, title });
        return result;
      }
      if (channel === 'email') {
        if (!settings.email_enabled || !settings.email_address || !settings.email_api_key) return { success: false, error: '邮件通知未启用或未配置' };
        const result = await this.sendEmailNotification(settings.email_address, title, message, settings.email_api_key);
        return result;
      }
      if (channel === 'webhook') {
        if (!settings.webhook_enabled || !settings.webhook_url) return { success: false, error: 'Webhook 未启用或未配置' };
        const result = await this.sendWebhookNotification(settings.webhook_url, { title, message, ...metadata, timestamp: new Date().toISOString() });
        return result;
      }
      return { success: false, error: '未知的通知渠道' };
    }

    // Default: send to all enabled channels (existing logic via sendNotification)
    return this.sendNotification(
      env,
      settings,
      title,
      message,
      metadata
    );
  }

  /**
   * 发送NotifyX消息
   * @param config NotifyX配置
   * @returns 发送结果
   */
  public static async sendNotifyXMessage(config: NotifyXConfig): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // 验证配置
      const validation = this.validateNotifyXConfig(config);
      if (!validation.valid) {
        return {
          success: false,
          error: `NotifyX配置无效: ${validation.errors.join(', ')}`
        };
      }

      // 发送请求到NotifyX API
      const response = await fetch(`https://www.notifyx.cn/api/v1/send/${config.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: config.title || '系统通知',
          content: config.message,
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `NotifyX API错误: HTTP ${response.status} - ${errorText}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `发送NotifyX消息失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 发送NotifyX消息
    try {
      // 验证配置
      const validation = this.validateNotifyXConfig(config);
      if (!validation.valid) {
        return {
          success: false,
          error: `NotifyX配置无效: ${validation.errors.join(', ')}`
        };
      }

      // 发送请求到NotifyX API
      const response = await fetch(`https://www.notifyx.cn/api/v1/send/${config.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: config.title || '系统通知',
          content: config.message,
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `NotifyX API错误: HTTP ${response.status} - ${errorText}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `发送NotifyX消息失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 发送失败通知
   * @param env 环境变量
   * @param task 任务对象
   * @param error 错误信息
   * @returns 发送结果
   */
  static async sendFailureAlert(
    env: Environment,
    task: Task,
    error: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // 获取任务的失败次数
      const failureCount = await this.getConsecutiveFailureCount(env, task.id);

      // 获取任务创建者的通知设置
      const settingsResult = await DatabaseUtils.getNotificationSettingsByUserId(env, task.created_by);

      if (!settingsResult.success || !settingsResult.data) {
        console.log(`用户 ${task.created_by} 没有配置通知设置，跳过失败通知`);
        return { success: true };
      }

      const settings = settingsResult.data;

      // 检查是否需要发送通知
      if (!NotificationSettingsModel.shouldSendNotification(settings, failureCount)) {
        console.log(`失败次数 ${failureCount} 未达到阈值 ${settings.failure_threshold}，跳过通知`);
        return { success: true };
      }

      // 构建通知消息
      const message = this.buildFailureMessage(task, error, failureCount);
      const title = `任务失败通知: ${task.name}`;

      return this.sendNotification(env, settings, title, message, {
        type: 'task_failure',
        task_id: task.id,
        task_name: task.name,
        task_type: task.type,
        error,
        failure_count: failureCount
      });
    } catch (error) {
      return {
        success: false,
        error: `发送失败通知异常: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 发送恢复通知
   * @param env 环境变量
   * @param task 任务对象
   * @returns 发送结果
   */
  static async sendRecoveryAlert(
    env: Environment,
    task: Task
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // 获取任务创建者的通知设置
      const settingsResult = await DatabaseUtils.getNotificationSettingsByUserId(env, task.created_by);

      if (!settingsResult.success || !settingsResult.data) {
        console.log(`用户 ${task.created_by} 没有配置通知设置，跳过恢复通知`);
        return { success: true };
      }

      const settings = settingsResult.data;

      // 检查是否启用了任何通知渠道
      const channels = NotificationSettingsModel.getAvailableChannels(settings);
      if (channels.length === 0) {
        console.log('没有可用的通知渠道，跳过恢复通知');
        return { success: true };
      }

      // 构建通知消息
      const message = this.buildRecoveryMessage(task);
      const title = `任务恢复通知: ${task.name}`;

      return this.sendNotification(env, settings, title, message, {
        type: 'task_recovery',
        task_id: task.id,
        task_name: task.name,
        task_type: task.type
      });
    } catch (error) {
      return {
        success: false,
        error: `发送恢复通知异常: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 验证NotifyX配置
   * @param config NotifyX配置
   * @returns 验证结果
   */
  static validateNotifyXConfig(config: NotifyXConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      errors.push('NotifyX配置必须是对象');
      return { valid: false, errors };
    }

    // 验证API密钥
    if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim().length === 0) {
      errors.push('NotifyX API密钥不能为空');
    }

    // 消息标题
    if (!config.title || typeof config.title !== 'string' || config.title.trim().length === 0) {
      errors.push('NotifyX消息标题不能为空');
    } else if (config.title.length > 100) {
      errors.push('NotifyX消息标题长度不能超过100字符');
    }

    // 验证消息
    if (!config.message || typeof config.message !== 'string' || config.message.trim().length === 0) {
      errors.push('NotifyX消息不能为空');
    } else if (config.message.length > 2000) {
      errors.push('NotifyX消息长度不能超过2000字符');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取任务的连续失败次数
   * @param env 环境变量
   * @param taskId 任务ID
   * @returns 连续失败次数
   */
  private static async getConsecutiveFailureCount(env: Environment, taskId: string): Promise<number> {
    try {
      // 获取任务的最近执行日志
      const logsResult = await DatabaseUtils.getExecutionLogsByTaskId(env, taskId, 100);

      if (!logsResult.success || !logsResult.data) {
        return 0;
      }

      const logs = logsResult.data;
      let failureCount = 0;

      // 从最新的日志开始计数连续失败
      for (const log of logs) {
        if (log.status === 'failure') {
          failureCount++;
        } else {
          // 遇到成功记录，停止计数
          break;
        }
      }

      return failureCount;
    } catch (error) {
      console.error('获取连续失败次数失败:', error);
      return 0;
    }
  }

  /**
   * 构建失败通知消息
   * @param task 任务对象
   * @param error 错误信息
   * @param failureCount 失败次数
   * @returns 通知消息
   */
  private static buildFailureMessage(task: Task, error: string, failureCount: number): string {
    return `
任务执行失败通知

任务名称: ${task.name}
任务类型: ${task.type === 'keepalive' ? '保活任务' : '通知任务'}
任务ID: ${task.id}
连续失败次数: ${failureCount}
错误信息: ${error}
时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

请及时检查任务配置和目标服务状态。
    `.trim();
  }

  /**
   * 构建恢复通知消息
   * @param task 任务对象
   * @returns 通知消息
   */
  private static buildRecoveryMessage(task: Task): string {
    return `
任务恢复通知

任务名称: ${task.name}
任务类型: ${task.type === 'keepalive' ? '保活任务' : '通知任务'}
任务ID: ${task.id}
时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

任务已恢复正常执行。
    `.trim();
  }

  /**
   * 发送邮件通知
   * @param email 邮箱地址
   * @param subject 邮件主题
   * @param message 邮件内容
   * @param apiKey 邮件服务 API 密钥
   * @returns 发送结果
   */
  private static async sendEmailNotification(
    email: string,
    subject: string,
    message: string,
    apiKey: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // 使用 Resend 邮件服务发送邮件
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: 'zengd <send@zengdw.dpdns.org>',
        to: [email],
        subject,
        html: `<strong>${message}</strong>`,
      });

      if (error) {
        const errorText = error.message;
        return {
          success: false,
          error: `邮件服务 API 错误: HTTP ${error.statusCode} - ${errorText}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `发送邮件失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 发送Webhook通知
   * @param webhookUrl Webhook URL
   * @param payload 通知数据
   * @returns 发送结果
   */
  private static async sendWebhookNotification(
    webhookUrl: string,
    payload: any
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'STMS-Notification-Service/1.0'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Webhook请求失败: HTTP ${response.status}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `发送Webhook通知失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 检查任务是否需要发送恢复通知
   * @param env 环境变量
   * @param taskId 任务ID
   * @returns 是否需要发送恢复通知
   */
  static async shouldSendRecoveryAlert(env: Environment, taskId: string): Promise<boolean> {
    try {
      // 获取任务的最近两次执行日志
      const logsResult = await DatabaseUtils.getExecutionLogsByTaskId(env, taskId, 2);

      if (!logsResult.success || !logsResult.data || logsResult.data.length < 2) {
        return false;
      }

      const logs = logsResult.data;

      // 如果最新的执行成功，且上一次执行失败，则需要发送恢复通知
      return logs[0].status === 'success' && logs[1].status === 'failure';
    } catch (error) {
      console.error('检查是否需要发送恢复通知失败:', error);
      return false;
    }
  }
}

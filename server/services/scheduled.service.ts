import { Environment, Task } from '../types/index.js';
import { TaskService } from './task.service.js';
import { DatabaseUtils } from '../utils/database.js';

/**
 * 定时任务服务类
 * 处理定时任务调度逻辑
 */
export class ScheduledService {
  /**
   * 处理定时触发事件
   * @param env 环境变量
   * @returns 处理结果
   */
  static async handleScheduledEvent(env: Environment): Promise<{
    success: boolean;
    processed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let processed = 0;

    try {
      // 获取所有启用的任务
      const tasksResult = await DatabaseUtils.getAllTasks(env, { enabled: true });

      if (!tasksResult.success || !tasksResult.data) {
        errors.push('获取任务列表失败');
        return { success: false, processed: 0, errors };
      }

      const tasks = tasksResult.data;
      console.log(`找到 ${tasks.length} 个启用的任务`);

      // 筛选需要执行的任务
      const tasksToExecute = await this.filterTasksToExecute(env, tasks);
      console.log(`需要执行 ${tasksToExecute.length} 个任务`);

      // 执行任务
      for (const task of tasksToExecute) {
        try {
          await TaskService.executeTask(env, task);
          processed++;
        } catch (error) {
          const errorMsg = `执行任务 ${task.name} (${task.id}) 失败: ${error instanceof Error ? error.message : '未知错误'}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      console.log(`定时任务处理完成，成功执行 ${processed} 个任务`);
      return { success: true, processed, errors };
    } catch (error) {
      const errorMsg = `定时任务处理失败: ${error instanceof Error ? error.message : '未知错误'}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      return { success: false, processed, errors };
    }
  }

  /**
   * 筛选需要执行的任务
   * @param env 环境变量
   * @param tasks 任务列表
   * @returns 需要执行的任务列表
   */
  private static async filterTasksToExecute(env: Environment, tasks: Task[]): Promise<Task[]> {
    const results = await Promise.all(tasks.map(async (task) => {
      // 只执行启用的任务
      if (!task.enabled) {
        return false;
      }

      // 检查是否有自定义执行规则
      const config = task.config as any; // Temporary cast to access optional executionRule
      if (config.executionRule) {
        return await this.checkExecutionRule(env, config.executionRule, task);
      }
      if (task.type === 'keepalive') {
        return this.checkCronSchedule(task.cronExpression);
      }
      return false;
    }));

    return tasks.filter((_, index) => results[index]);
  }

  /**
   * 检查是否满足自定义执行规则
   * @param env 环境变量
   * @param rule 执行规则
   * @param task 任务对象
   * @returns 是否需要执行
   */
  private static async checkExecutionRule(env: Environment, rule: any, task: Task): Promise<boolean> {
    const now = new Date();
    // Use endDate as the target execution date (Next Due Date)
    const targetDate = new Date(rule.endDate);

    // Check if we are within the reminder advance window
    if (rule.reminderAdvanceValue && rule.reminderAdvanceUnit) {
      const advanceMs = this.getAdvanceMs(rule.reminderAdvanceValue, rule.reminderAdvanceUnit);
      const startTime = targetDate.getTime() - advanceMs;

      if (now.getTime() >= startTime) {
        // Fetch notification settings to check allowed time slots
        const settingsResult = await DatabaseUtils.getNotificationSettingsByUserId(env, task.created_by);

        if (settingsResult.success && settingsResult.data && settingsResult.data.allowed_time_slots) {
          const allowedSlots = settingsResult.data.allowed_time_slots.split(',').map(s => parseInt(s.trim(), 10));
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();

          // Allow execution only if current hour is in allowed slots AND it is the top of the hour (minute 0).
          // This prevents execution every minute during the allowed hour.
          if (allowedSlots.includes(currentHour) && currentMinute === 0) {
            return true;
          }
          return false;
        }

        return true;
      }
      return false;
    }

    // Standard check: is it time yet?
    return now >= targetDate;
  }

  private static getAdvanceMs(value: number, unit: 'day' | 'hour'): number {
    return value * (unit === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
  }

  /**
   * 验证 Cron 表达式是否在当前时间触发
   * @param cronExpression Cron表达式
   * @returns 是否触发
   */
  private static checkCronSchedule(cronExpression?: string): boolean {
    if (!cronExpression) return false;

    // Cron格式: "分 时 日 月 星期" 或 "秒 分 时 日 月 星期"
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 7) return false;

    let minute, hour, dom, month, dow;
    if (parts.length === 5) {
      [minute, hour, dom, month, dow] = parts;
    } else {
      // 6 或 7 位的 Cron，首位为秒（Worker 按分钟调度，因此忽略秒的精准匹配）
      [, minute, hour, dom, month, dow] = parts;
    }
    const localNow = new Date();

    // Worker 环境本地通常是 UTC 时间，但前端设定的 Cron 表达式是 UTC+8 时区
    // 我们将当前时间加上 8 小时的毫秒数，然后以 UTC 形式读取各个时间单元
    const now = new Date(localNow.getTime() + 8 * 60 * 60 * 1000);

    const currentMinute = now.getUTCMinutes();
    const currentHour = now.getUTCHours();
    const currentDom = now.getUTCDate();
    const currentMonth = now.getUTCMonth() + 1; // 1-12
    const currentDow = now.getUTCDay(); // 0-6，0为周日

    const matchPart = (part: string, value: number): boolean => {
      if (part === '*' || part === '?') return true;

      // 处理逗号分隔的列表项 (如 1,2,3)
      if (part.includes(',')) {
        return part.split(',').some(p => matchPart(p, value));
      }

      // 处理步长 (如 */5 或者 1-10/2)
      if (part.includes('/')) {
        const [range, stepStr] = part.split('/');
        const step = parseInt(stepStr, 10);
        if (isNaN(step)) return false;

        if (range === '*') {
          return value % step === 0;
        } else if (range.includes('-')) {
          const [startStr, endStr] = range.split('-');
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);
          if (value >= start && value <= end) {
            return (value - start) % step === 0;
          }
          return false;
        } else {
          const start = parseInt(range, 10);
          if (value >= start) {
            return (value - start) % step === 0;
          }
          return false;
        }
      }

      // 处理范围 (如 1-5)
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n, 10));
        return value >= start && value <= end;
      }

      // 处理确切值
      return parseInt(part, 10) === value;
    };

    return matchPart(minute, currentMinute) &&
      matchPart(hour, currentHour) &&
      matchPart(dom, currentDom) &&
      matchPart(month, currentMonth) &&
      (matchPart(dow, currentDow) || (currentDow === 0 && matchPart(dow, 7))); // 支持 Sunday=7
  }

}
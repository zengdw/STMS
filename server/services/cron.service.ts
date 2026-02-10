import { Environment, Task } from '../types/index.js';
import { TaskService } from './task.service.js';
import { DatabaseUtils } from '../utils/database.js';

/**
 * Cron服务类
 * 处理定时任务调度逻辑
 */
export class CronService {
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
      console.log('开始处理定时任务:', new Date().toISOString());

      // 获取所有启用的任务
      const tasksResult = await DatabaseUtils.getAllTasks(env, { enabled: true });

      if (!tasksResult.success || !tasksResult.data) {
        errors.push('获取任务列表失败');
        return { success: false, processed: 0, errors };
      }

      const tasks = tasksResult.data;
      console.log(`找到 ${tasks.length} 个启用的任务`);

      // 筛选需要执行的任务
      const tasksToExecute = this.filterTasksToExecute(tasks);
      console.log(`需要执行 ${tasksToExecute.length} 个任务`);

      // 执行任务
      for (const task of tasksToExecute) {
        try {
          await this.executeTask(env, task);
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
   * @param tasks 任务列表
   * @returns 需要执行的任务列表
   */
  private static filterTasksToExecute(tasks: Task[]): Task[] {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1; // JavaScript月份从0开始
    const currentDayOfWeek = now.getDay();

    return tasks.filter(task => {
      // 只执行启用的任务
      if (!task.enabled) {
        return false;
      }

      // 检查是否有自定义执行规则
      const config = task.config as any; // Temporary cast to access optional executionRule
      if (config.executionRule) {
        return this.checkExecutionRule(task, config.executionRule);
      }

      // 解析Cron表达式
      const cronMatch = this.matchCronExpression(
        task.schedule,
        currentMinute,
        currentHour,
        currentDay,
        currentMonth,
        currentDayOfWeek
      );

      return cronMatch;
    });
  }

  /**
   * 检查是否满足自定义执行规则
   * @param task 任务
   * @param rule 执行规则
   * @returns 是否需要执行
   */
  private static checkExecutionRule(task: Task, rule: any): boolean {
    const now = new Date();

    // 检查结束日期
    if (rule.endDate && new Date(rule.endDate) < now) {
      return false;
    }

    // 如果任务从未执行过
    if (!task.last_executed) {
      const startDate = new Date(rule.startDate);
      // 如果设置了提前提醒，则检查是否到了提醒时间
      if (rule.reminderAdvanceValue && rule.reminderAdvanceUnit) {
        const advanceMs = this.getAdvanceMs(rule.reminderAdvanceValue, rule.reminderAdvanceUnit);
        if (now.getTime() >= startDate.getTime() - advanceMs) {
          return true;
        }
      }
      return now >= startDate;
    }

    // 计算下次执行时间
    const lastExecuted = new Date(task.last_executed);
    const nextDue = new Date(lastExecuted);

    if (rule.unit === 'day') {
      nextDue.setDate(nextDue.getDate() + rule.interval);
    } else if (rule.unit === 'month') {
      nextDue.setMonth(nextDue.getMonth() + rule.interval);
    } else if (rule.unit === 'year') {
      nextDue.setFullYear(nextDue.getFullYear() + rule.interval);
    }

    // 如果设置了提前提醒
    if (rule.reminderAdvanceValue && rule.reminderAdvanceUnit) {
      const advanceMs = this.getAdvanceMs(rule.reminderAdvanceValue, rule.reminderAdvanceUnit);
      if (now.getTime() >= nextDue.getTime() - advanceMs) {
        // 防止在同一周期内重复执行 (简单防重：Last Executed < Next Due - Period)
        // 但这里我们假设每次执行都会更新 last_executed，所以只要 now >= nextDue - advanceMs 且 last_executed 是上个周期的即可
        // 更严谨的逻辑可能需要记录 "nextDueDate" 到 task 中
        // 为简化，这里假设执行间隔肯定大于提前量，且如果 last_executed 接近 nextDue (在 advanceMs 范围内)，说明是本次周期的执行

        // 如果上次执行时间在 (NextDue - Advance - Buffer) 之后，说明已经为这个周期执行过了
        // Buffer 设为 1 小时，避免因为计算误差重复执行
        const cycleStart = new Date(nextDue.getTime() - advanceMs - 60 * 60 * 1000);
        if (lastExecuted > cycleStart) {
          return false;
        }

        return true;
      }
    }

    return now >= nextDue;
  }

  private static getAdvanceMs(value: number, unit: 'day' | 'hour'): number {
    return value * (unit === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
  }


  /**
   * 匹配Cron表达式
   * @param cronExpression Cron表达式 (分 时 日 月 周)
   * @param minute 当前分钟
   * @param hour 当前小时
   * @param day 当前日期
   * @param month 当前月份
   * @param dayOfWeek 当前星期
   * @returns 是否匹配
   */
  private static matchCronExpression(
    cronExpression: string,
    minute: number,
    hour: number,
    day: number,
    month: number,
    dayOfWeek: number
  ): boolean {
    const parts = cronExpression.trim().split(/\s+/);

    if (parts.length !== 5) {
      console.warn(`无效的Cron表达式: ${cronExpression}`);
      return false;
    }

    const [minutePart, hourPart, dayPart, monthPart, dayOfWeekPart] = parts;

    // 检查每个部分是否匹配
    return (
      this.matchCronPart(minutePart, minute, 0, 59) &&
      this.matchCronPart(hourPart, hour, 0, 23) &&
      this.matchCronPart(dayPart, day, 1, 31) &&
      this.matchCronPart(monthPart, month, 1, 12) &&
      this.matchCronPart(dayOfWeekPart, dayOfWeek, 0, 6)
    );
  }

  /**
   * 匹配Cron表达式的单个部分
   * @param part Cron部分
   * @param value 当前值
   * @param min 最小值
   * @param max 最大值
   * @returns 是否匹配
   */
  private static matchCronPart(part: string, value: number, min: number, max: number): boolean {
    // * 匹配所有值
    if (part === '*') {
      return true;
    }

    // */n 匹配能被n整除的值
    if (part.startsWith('*/')) {
      const step = parseInt(part.substring(2), 10);
      return value % step === 0;
    }

    // n-m 匹配范围内的值
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(s => parseInt(s, 10));
      return value >= start && value <= end;
    }

    // n,m,o 匹配列表中的值
    if (part.includes(',')) {
      const values = part.split(',').map(s => parseInt(s, 10));
      return values.includes(value);
    }

    // 精确匹配
    const exactValue = parseInt(part, 10);
    return value === exactValue;
  }

  /**
   * 执行单个任务
   * @param env 环境变量
   * @param task 任务对象
   */
  private static async executeTask(env: Environment, task: Task): Promise<void> {
    console.log(`执行任务: ${task.name} (${task.type})`);

    try {
      if (task.type === 'keepalive') {
        await TaskService.executeKeepaliveTask(env, task);
      } else if (task.type === 'notification') {
        await TaskService.executeNotificationTask(env, task);
      } else {
        throw new Error(`未知的任务类型: ${task.type}`);
      }
    } catch (error) {
      console.error(`任务执行失败: ${task.name}`, error);
      throw error;
    }
  }

  /**
   * 处理保活任务
   * @param env 环境变量
   * @returns 处理结果
   */
  static async processKeepaliveTasks(env: Environment): Promise<{
    success: boolean;
    processed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let processed = 0;

    try {
      // 获取所有启用的保活任务
      const tasksResult = await DatabaseUtils.getAllTasks(env, {
        type: 'keepalive',
        enabled: true
      });

      if (!tasksResult.success || !tasksResult.data) {
        errors.push('获取保活任务列表失败');
        return { success: false, processed: 0, errors };
      }

      const tasks = tasksResult.data;
      const tasksToExecute = this.filterTasksToExecute(tasks);

      // 执行保活任务
      for (const task of tasksToExecute) {
        try {
          await TaskService.executeKeepaliveTask(env, task);
          processed++;
        } catch (error) {
          const errorMsg = `执行保活任务 ${task.name} 失败: ${error instanceof Error ? error.message : '未知错误'}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      return { success: true, processed, errors };
    } catch (error) {
      const errorMsg = `处理保活任务失败: ${error instanceof Error ? error.message : '未知错误'}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      return { success: false, processed, errors };
    }
  }

  /**
   * 处理通知任务
   * @param env 环境变量
   * @returns 处理结果
   */
  static async processNotificationTasks(env: Environment): Promise<{
    success: boolean;
    processed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let processed = 0;

    try {
      // 获取所有启用的通知任务
      const tasksResult = await DatabaseUtils.getAllTasks(env, {
        type: 'notification',
        enabled: true
      });

      if (!tasksResult.success || !tasksResult.data) {
        errors.push('获取通知任务列表失败');
        return { success: false, processed: 0, errors };
      }

      const tasks = tasksResult.data;
      const tasksToExecute = this.filterTasksToExecute(tasks);

      // 执行通知任务
      for (const task of tasksToExecute) {
        try {
          await TaskService.executeNotificationTask(env, task);
          processed++;
        } catch (error) {
          const errorMsg = `执行通知任务 ${task.name} 失败: ${error instanceof Error ? error.message : '未知错误'}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      return { success: true, processed, errors };
    } catch (error) {
      const errorMsg = `处理通知任务失败: ${error instanceof Error ? error.message : '未知错误'}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      return { success: false, processed, errors };
    }
  }
}

import { Environment, ApiResponse } from '../types/index.js';
import { DatabaseUtils } from '../utils/database.js';
import { LogService } from '../services/log.service.js';
import { NotificationService } from '../services/notification.service.js';

/**
 * 系统指标接口
 */
interface SystemMetrics {
  timestamp: string;
  uptime: number;
  tasks: {
    total: number;
    active: number;
    inactive: number;
    keepalive: number;
    notification: number;
  };
  executions: {
    total: number;
    last24h: number;
    successRate: number;
    averageResponseTime: number;
  };
  database: {
    healthy: boolean;
    tables: Record<string, number>;
  };
  errors: {
    last24h: number;
    recentErrors: Array<{
      code: string;
      message: string;
      timestamp: string;
    }>;
  };
}

/**
 * 异常信息接口
 */
interface AnomalyInfo {
  type: 'high_failure_rate' | 'slow_response' | 'database_error' | 'task_execution_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: any;
  timestamp: string;
}

/**
 * 健康检查路由处理器
 */
export class HealthRoutes {
  // 系统启动时间
  private static startTime: number = Date.now();

  /**
   * 健康检查端点
   */
  static async check(request: Request, env: Environment): Promise<Response> {
    try {
      const healthCheck = await DatabaseUtils.healthCheck(env);
      
      const response: ApiResponse = {
        success: healthCheck.healthy,
        data: {
          status: healthCheck.healthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          environment: env.ENVIRONMENT,
          database: healthCheck.details,
          errors: healthCheck.errors
        }
      };

      return new Response(JSON.stringify(response), {
        status: healthCheck.healthy ? 200 : 503,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : '未知错误'
        }
      } as ApiResponse), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 系统状态端点 - 增强版
   */
  static async status(request: Request, env: Environment): Promise<Response> {
    try {
      // 收集系统指标
      const metrics = await this.collectSystemMetrics(env);
      
      // 检测异常
      const anomalies = await this.detectAnomalies(env, metrics);
      
      // 如果有严重异常，触发通知
      if (anomalies.length > 0) {
        await this.notifyAnomalies(env, anomalies);
      }

      const response: ApiResponse = {
        success: true,
        data: {
          ...metrics,
          anomalies: anomalies.length > 0 ? anomalies : undefined,
          health: anomalies.some(a => a.severity === 'critical') ? 'critical' : 
                  anomalies.some(a => a.severity === 'high') ? 'degraded' : 'healthy'
        }
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // 记录错误
      await LogService.logError(
        env,
        'HEALTH_CHECK_ERROR',
        '获取系统状态失败',
        error instanceof Error ? error.stack : undefined
      );

      return new Response(JSON.stringify({
        success: false,
        error: '获取系统状态失败'
      } as ApiResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 版本信息端点
   */
  static async version(request: Request, env: Environment): Promise<Response> {
    const response: ApiResponse = {
      success: true,
      data: {
        name: 'STMS API',
        version: '1.0.0',
        description: '定时任务管理系统',
        environment: env.ENVIRONMENT
      }
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 系统指标端点
   */
  static async metrics(request: Request, env: Environment): Promise<Response> {
    try {
      const metrics = await this.collectSystemMetrics(env);

      const response: ApiResponse = {
        success: true,
        data: metrics
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: '获取系统指标失败'
      } as ApiResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 收集系统指标
   */
  private static async collectSystemMetrics(env: Environment): Promise<SystemMetrics> {
    // 获取任务统计
    const tasksResult = await DatabaseUtils.getAllTasks(env);
    const tasks = tasksResult.data || [];
    
    const activeTasks = tasks.filter(t => t.enabled).length;
    const inactiveTasks = tasks.filter(t => !t.enabled).length;
    const totalTasks = tasks.length;
    const keepaliveTasks = tasks.filter(t => t.type === 'keepalive').length;
    const notificationTasks = tasks.filter(t => t.type === 'notification').length;

    // 获取执行日志统计
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const allLogsResult = await DatabaseUtils.getAllExecutionLogs(env, 1000);
    const allLogs = allLogsResult.data || [];
    
    const last24hLogs = allLogs.filter(log => 
      new Date(log.execution_time) >= yesterday
    );
    
    const successCount = last24hLogs.filter(l => l.status === 'success').length;
    const successRate = last24hLogs.length > 0 
      ? (successCount / last24hLogs.length) * 100 
      : 100;
    
    // 计算平均响应时间
    const responseTimes = last24hLogs
      .filter(log => log.response_time !== undefined && log.response_time !== null)
      .map(log => log.response_time!);
    
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    // 获取数据库健康状态
    const healthCheck = await DatabaseUtils.healthCheck(env);

    // 获取错误日志统计
    const errorLogsResult = await LogService.getErrorLogs(env, 100);
    const errorLogs = errorLogsResult.data || [];
    
    const last24hErrors = errorLogs.filter(log => 
      new Date(log.timestamp) >= yesterday
    );

    const recentErrors = last24hErrors.slice(0, 5).map(log => ({
      code: log.error_type,
      message: log.error_message,
      timestamp: log.timestamp
    }));

    // 计算系统运行时间（秒）
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      timestamp: new Date().toISOString(),
      uptime,
      tasks: {
        total: totalTasks,
        active: activeTasks,
        inactive: inactiveTasks,
        keepalive: keepaliveTasks,
        notification: notificationTasks
      },
      executions: {
        total: allLogs.length,
        last24h: last24hLogs.length,
        successRate: Math.round(successRate * 100) / 100,
        averageResponseTime: Math.round(averageResponseTime)
      },
      database: {
        healthy: healthCheck.healthy,
        tables: healthCheck.details.tables
      },
      errors: {
        last24h: last24hErrors.length,
        recentErrors
      }
    };
  }

  /**
   * 检测系统异常
   */
  private static async detectAnomalies(
    env: Environment, 
    metrics: SystemMetrics
  ): Promise<AnomalyInfo[]> {
    const anomalies: AnomalyInfo[] = [];
    const now = new Date().toISOString();

    // 检测高失败率
    if (metrics.executions.last24h > 10 && metrics.executions.successRate < 50) {
      anomalies.push({
        type: 'high_failure_rate',
        severity: 'critical',
        message: `任务执行成功率过低: ${metrics.executions.successRate.toFixed(2)}%`,
        details: {
          successRate: metrics.executions.successRate,
          totalExecutions: metrics.executions.last24h
        },
        timestamp: now
      });
    } else if (metrics.executions.last24h > 10 && metrics.executions.successRate < 80) {
      anomalies.push({
        type: 'high_failure_rate',
        severity: 'high',
        message: `任务执行成功率较低: ${metrics.executions.successRate.toFixed(2)}%`,
        details: {
          successRate: metrics.executions.successRate,
          totalExecutions: metrics.executions.last24h
        },
        timestamp: now
      });
    }

    // 检测响应时间过慢
    if (metrics.executions.averageResponseTime > 10000) {
      anomalies.push({
        type: 'slow_response',
        severity: 'high',
        message: `平均响应时间过长: ${metrics.executions.averageResponseTime}ms`,
        details: {
          averageResponseTime: metrics.executions.averageResponseTime
        },
        timestamp: now
      });
    } else if (metrics.executions.averageResponseTime > 5000) {
      anomalies.push({
        type: 'slow_response',
        severity: 'medium',
        message: `平均响应时间较长: ${metrics.executions.averageResponseTime}ms`,
        details: {
          averageResponseTime: metrics.executions.averageResponseTime
        },
        timestamp: now
      });
    }

    // 检测数据库健康状态
    if (!metrics.database.healthy) {
      anomalies.push({
        type: 'database_error',
        severity: 'critical',
        message: '数据库连接异常',
        details: metrics.database,
        timestamp: now
      });
    }

    // 检测错误日志数量
    if (metrics.errors.last24h > 100) {
      anomalies.push({
        type: 'task_execution_error',
        severity: 'high',
        message: `24小时内错误日志数量过多: ${metrics.errors.last24h}`,
        details: {
          errorCount: metrics.errors.last24h,
          recentErrors: metrics.errors.recentErrors
        },
        timestamp: now
      });
    } else if (metrics.errors.last24h > 50) {
      anomalies.push({
        type: 'task_execution_error',
        severity: 'medium',
        message: `24小时内错误日志数量较多: ${metrics.errors.last24h}`,
        details: {
          errorCount: metrics.errors.last24h
        },
        timestamp: now
      });
    }

    return anomalies;
  }

  /**
   * 通知系统异常
   */
  private static async notifyAnomalies(
    env: Environment,
    anomalies: AnomalyInfo[]
  ): Promise<void> {
    try {
      // 只通知严重和关键级别的异常
      const criticalAnomalies = anomalies.filter(
        a => a.severity === 'critical' || a.severity === 'high'
      );

      if (criticalAnomalies.length === 0) {
        return;
      }

      // 构建通知消息
      const message = criticalAnomalies.map(a => 
        `[${a.severity.toUpperCase()}] ${a.message}`
      ).join('\n');

      // 记录系统错误日志
      await LogService.logError(
        env,
        'SYSTEM_ANOMALY_DETECTED',
        '检测到系统异常',
        undefined,
        { anomalies: criticalAnomalies }
      );

      // 发送系统异常通知（如果配置了NotifyX）
      // 注意：这里需要系统级别的NotifyX配置，而不是用户级别的
      // 可以通过环境变量配置系统级别的通知
      if (env.SYSTEM_NOTIFYX_API_KEY) {
        await NotificationService.sendNotifyXMessage({
          apiKey: env.SYSTEM_NOTIFYX_API_KEY,
          content: message,
          title: '系统异常告警'
        });
      }
    } catch (error) {
      console.error('发送异常通知失败:', error);
      // 通知失败不应该影响健康检查
    }
  }
}

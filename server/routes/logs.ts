import { Environment, ApiResponse, LogFilter } from '../types/index.js';
import { AuthService } from '../services/auth.service.js';
import { LogService } from '../services/log.service.js';

/**
 * 日志路由处理器
 */
export class LogRoutes {
  /**
   * 获取执行日志列表
   */
  static async list(request: Request, env: Environment): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return new Response(JSON.stringify({
          success: false,
          error: '未授权'
        } as ApiResponse), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const url = new URL(request.url);
      const taskId = url.searchParams.get('taskId');
      const logType = url.searchParams.get('logType') as 'execution' | 'system' | 'audit' | null;
      const taskType = url.searchParams.get('taskType') as 'keepalive' | 'notification' | null;
      const status = url.searchParams.get('status') as 'success' | 'failure' | null;
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      // 构建筛选条件
      const filter: any = {
        taskId: taskId || undefined,
        logType: logType || undefined,
        taskType: taskType || undefined,
        status: status || undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit,
        offset
      };

      // 获取日志
      const result = await LogService.getExecutionLogs(env, filter);

      if (!result.success) {
        return new Response(JSON.stringify({
          success: false,
          error: result.error
        } as ApiResponse), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 转换字段格式为前端使用的 camelCase
      const mappedData = (result.data || []).map(log => {
        let action: string | undefined;
        let resourceType: string | undefined;

        // 尝试从 details 中解析 action 和 resource_type
        if (log.details) {
          try {
            const details = JSON.parse(log.details);
            action = details.action;
            resourceType = details.resource_type || details.resourceType;
          } catch (e) {
            // 忽略解析错误
          }
        }

        return {
          id: log.id,
          taskId: log.task_id || '',
          // taskName: '', // execution_logs 不包含 task_name，如果需要可以在这里查询或前端处理
          // taskType: log.log_type === 'execution' ? ('keepalive' as const) : undefined, // 简单推断
          logType: log.log_type,
          action,
          resourceType,
          executionTime: log.execution_time,
          status: log.status,
          responseTime: log.response_time,
          statusCode: log.status_code,
          errorMessage: log.error_message,
          details: log.details
        };
      });

      return new Response(JSON.stringify({
        success: true,
        data: mappedData
      } as ApiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // 记录错误日志
      await LogService.logError(
        env,
        'API_ERROR',
        '获取日志列表失败',
        error instanceof Error ? error.stack : undefined,
        { endpoint: '/logs' }
      );

      return new Response(JSON.stringify({
        success: false,
        error: '获取日志列表失败'
      } as ApiResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 获取单个日志详情
   */
  static async get(request: Request, env: Environment, logId: string): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return new Response(JSON.stringify({
          success: false,
          error: '未授权'
        } as ApiResponse), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const result = await LogService.getExecutionLog(env, logId);

      if (!result.success) {
        return new Response(JSON.stringify({
          success: false,
          error: result.error
        } as ApiResponse), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (!result.data) {
        return new Response(JSON.stringify({
          success: false,
          error: '日志不存在'
        } as ApiResponse), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const log = result.data;
      let action: string | undefined;
      let resourceType: string | undefined;

      if (log.details) {
        try {
          const details = JSON.parse(log.details);
          action = details.action;
          resourceType = details.resource_type || details.resourceType;
        } catch (e) {
          // 忽略解析错误
        }
      }

      const mappedLog = {
        id: log.id,
        taskId: log.task_id || '',
        logType: log.log_type,
        action,
        resourceType,
        executionTime: log.execution_time,
        status: log.status,
        responseTime: log.response_time,
        statusCode: log.status_code,
        errorMessage: log.error_message,
        details: log.details
      };

      return new Response(JSON.stringify({
        success: true,
        data: mappedLog
      } as ApiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // 记录错误日志
      await LogService.logError(
        env,
        'API_ERROR',
        '获取日志详情失败',
        error instanceof Error ? error.stack : undefined,
        { endpoint: '/logs/:id', logId }
      );

      return new Response(JSON.stringify({
        success: false,
        error: '获取日志详情失败'
      } as ApiResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 清理旧日志
   */
  static async cleanup(request: Request, env: Environment): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return new Response(JSON.stringify({
          success: false,
          error: '未授权'
        } as ApiResponse), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 只有管理员可以清理日志
      if (user.role !== 'admin') {
        return new Response(JSON.stringify({
          success: false,
          error: '权限不足'
        } as ApiResponse), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json() as { days: number };
      const days = body.days || 30;

      // 记录审计日志
      await LogService.logAudit(
        env,
        user.id,
        'cleanup_logs',
        'logs',
        'all',
        { days }
      );

      const result = await LogService.cleanupOldLogs(env, days);

      if (!result.success) {
        return new Response(JSON.stringify({
          success: false,
          error: result.error
        } as ApiResponse), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: `已清理 ${days} 天前的日志，共删除 ${result.deletedCount} 条记录`
      } as ApiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // 记录错误日志
      await LogService.logError(
        env,
        'API_ERROR',
        '清理日志失败',
        error instanceof Error ? error.stack : undefined,
        { endpoint: '/logs/cleanup' }
      );

      return new Response(JSON.stringify({
        success: false,
        error: '清理日志失败'
      } as ApiResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 获取日志统计信息
   */
  static async statistics(request: Request, env: Environment): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return new Response(JSON.stringify({
          success: false,
          error: '未授权'
        } as ApiResponse), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const result = await LogService.getLogStatistics(env);

      if (!result.success) {
        return new Response(JSON.stringify({
          success: false,
          error: result.error
        } as ApiResponse), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: result.data
      } as ApiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // 记录错误日志
      await LogService.logError(
        env,
        'API_ERROR',
        '获取日志统计失败',
        error instanceof Error ? error.stack : undefined,
        { endpoint: '/logs/statistics' }
      );

      return new Response(JSON.stringify({
        success: false,
        error: '获取日志统计失败'
      } as ApiResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 获取错误日志列表
   */
  static async errors(request: Request, env: Environment): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return new Response(JSON.stringify({
          success: false,
          error: '未授权'
        } as ApiResponse), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const result = await LogService.getErrorLogs(env, limit, offset);

      if (!result.success) {
        return new Response(JSON.stringify({
          success: false,
          error: result.error
        } as ApiResponse), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: result.data
      } as ApiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // 记录错误日志
      await LogService.logError(
        env,
        'API_ERROR',
        '获取错误日志失败',
        error instanceof Error ? error.stack : undefined,
        { endpoint: '/logs/errors' }
      );

      return new Response(JSON.stringify({
        success: false,
        error: '获取错误日志失败'
      } as ApiResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * 获取审计日志列表
   */
  static async audits(request: Request, env: Environment): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return new Response(JSON.stringify({
          success: false,
          error: '未授权'
        } as ApiResponse), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const url = new URL(request.url);
      const userId = url.searchParams.get('userId');
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const result = await LogService.getAuditLogs(env, userId || undefined, limit, offset);

      if (!result.success) {
        return new Response(JSON.stringify({
          success: false,
          error: result.error
        } as ApiResponse), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: result.data
      } as ApiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // 记录错误日志
      await LogService.logError(
        env,
        'API_ERROR',
        '获取审计日志失败',
        error instanceof Error ? error.stack : undefined,
        { endpoint: '/logs/audits' }
      );

      return new Response(JSON.stringify({
        success: false,
        error: '获取审计日志失败'
      } as ApiResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}

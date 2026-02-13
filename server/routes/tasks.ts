import { Environment, ApiResponse, Task, KeepaliveConfig, NotificationConfig } from '../types/index.js';
import { AuthService } from '../services/auth.service.js';
import { TaskService } from '../services/task.service.js';
import { ResponseUtils } from '../utils/response.js';
import { DatabaseUtils } from '../utils/database.js';

/**
 * 任务路由处理器
 */
export class TaskRoutes {
  /**
   * 创建任务
   */
  static async create(request: Request, env: Environment): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return ResponseUtils.unauthorized('未授权');
      }

      const body = await request.json() as Partial<Task>;

      // 验证必填字段
      if (!body.name || !body.type || !body.config) {
        return ResponseUtils.error('缺少必填字段', 400);
      }
      const body1 = body as Task;

      const result = await TaskService.createTask(env, body1, user.id);

      if (!result.success) {
        return ResponseUtils.error(result.error || '创建任务失败', 400);
      }

      return ResponseUtils.json({
        success: true,
        data: result.data
      }, 201);
    } catch (error) {
      return ResponseUtils.serverError('创建任务失败');
    }
  }

  /**
   * 获取任务列表
   */
  static async list(request: Request, env: Environment): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return ResponseUtils.unauthorized('未授权');
      }

      const url = new URL(request.url);
      const type = url.searchParams.get('type') as 'keepalive' | 'notification' | null;
      const enabled = url.searchParams.get('enabled');

      const filter: any = {};
      if (type) filter.type = type;
      if (enabled !== null) filter.enabled = enabled === 'true';

      const result = await TaskService.listTasks(env, filter);

      if (!result.success) {
        return ResponseUtils.serverError(result.error || '获取任务列表失败');
      }

      return ResponseUtils.json({
        success: true,
        data: result.data
      }, 200);
    } catch (error) {
      return ResponseUtils.serverError('获取任务列表失败');
    }
  }

  /**
   * 获取单个任务
   */
  static async get(request: Request, env: Environment, taskId: string): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return ResponseUtils.unauthorized('未授权');
      }

      const result = await TaskService.getTask(env, taskId);

      if (!result.success) {
        return ResponseUtils.serverError(result.error || '获取任务失败');
      }

      if (!result.data) {
        return ResponseUtils.notFound('任务不存在');
      }

      return ResponseUtils.json({
        success: true,
        data: result.data
      }, 200);
    } catch (error) {
      return ResponseUtils.serverError('获取任务失败');
    }
  }

  /**
   * 
   * @param request 任务测试通知
   * @param taskId 任务id
   * @returns 
   */
  static async test(request: Request, env: Environment, taskId: string): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return ResponseUtils.unauthorized('未授权');
      }

      const task = await DatabaseUtils.getTaskById(env, taskId);
      if (!task) {
        return ResponseUtils.notFound('任务不存在');
      }
      await TaskService.executeTask(env, task.data as Task, true);

      return ResponseUtils.json({
        success: true,
        message: '通知发送成功'
      }, 200);
    } catch (error) {
      return ResponseUtils.serverError(`通知发送失败:${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 更新任务
   */
  static async update(request: Request, env: Environment, taskId: string): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return ResponseUtils.unauthorized('未授权');
      }

      const body = await request.json() as Partial<Task>;

      const result = await TaskService.updateTask(env, taskId, body, user.id);

      if (!result.success) {
        const status = result.error === '任务不存在' ? 404 : 400;
        return ResponseUtils.error(result.error || '更新任务失败', status);
      }

      return ResponseUtils.json({
        success: true,
        data: result.data
      }, 200);
    } catch (error) {
      return ResponseUtils.serverError('更新任务失败');
    }
  }

  /**
   * 删除任务
   */
  static async delete(request: Request, env: Environment, taskId: string): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return ResponseUtils.unauthorized('未授权');
      }

      const result = await TaskService.deleteTask(env, taskId, user.id);

      if (!result.success) {
        const status = result.error === '任务不存在' ? 404 : 400;
        return ResponseUtils.error(result.error || '删除任务失败', status);
      }

      return ResponseUtils.json({
        success: true,
        message: '任务已删除'
      }, 200);
    } catch (error) {
      return ResponseUtils.serverError('删除任务失败');
    }
  }

  /**
   * 获取任务统计
   */
  static async statistics(request: Request, env: Environment, taskId: string): Promise<Response> {
    try {
      // 认证检查
      const user = await AuthService.authenticateRequest(env, request);
      if (!user) {
        return ResponseUtils.unauthorized('未授权');
      }

      const result = await TaskService.getTaskStatistics(env, taskId);

      if (!result.success) {
        return ResponseUtils.serverError(result.error || '获取任务统计失败');
      }

      return ResponseUtils.json({
        success: true,
        data: result.data
      }, 200);
    } catch (error) {
      return ResponseUtils.serverError('获取任务统计失败');
    }
  }
}

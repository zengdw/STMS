import { Environment } from './types/index.js';
import { CronService } from './services/cron.service.js';
import { AuthRoutes } from './routes/auth.js';
import { TaskRoutes } from './routes/tasks.js';
import { LogRoutes } from './routes/logs.js';
import { HealthRoutes } from './routes/health.js';
import { ResponseUtils } from './utils/response.js';
import { RateLimitMiddleware } from './middleware/rate-limit.js';

export default {
	async fetch(request: Request, env: Environment, ctx: ExecutionContext): Promise<Response> {
		try {
			const url = new URL(request.url);
			const { pathname } = url;
			const method = request.method;

			// 处理OPTIONS预检请求
			if (method === 'OPTIONS') {
				return ResponseUtils.options();
			}

			// 应用速率限制中间件
			const rateLimitResult = RateLimitMiddleware.middleware()(request, env);
			if (rateLimitResult) {
				return rateLimitResult;
			}

			// ==================== 健康检查路由 ====================
			if (pathname === '/api/health') {
				return await HealthRoutes.check(request, env);
			}

			if (pathname === '/api/status') {
				return await HealthRoutes.status(request, env);
			}

			if (pathname === '/api/metrics') {
				return await HealthRoutes.metrics(request, env);
			}

			if (pathname === '/api/version') {
				return await HealthRoutes.version(request, env);
			}

			// ==================== 认证路由 ====================
			if (pathname === '/api/auth/login' && method === 'POST') {
				return await AuthRoutes.login(request, env);
			}

			if (pathname === '/api/auth/register' && method === 'POST') {
				return await AuthRoutes.register(request, env);
			}

			if (pathname === '/api/auth/refresh' && method === 'POST') {
				return await AuthRoutes.refresh(request, env);
			}

			if (pathname === '/api/auth/me' && method === 'GET') {
				return await AuthRoutes.me(request, env);
			}

			// ==================== 任务路由 ====================
			if (pathname === '/api/tasks' && method === 'GET') {
				return await TaskRoutes.list(request, env);
			}

			if (pathname === '/api/tasks' && method === 'POST') {
				return await TaskRoutes.create(request, env);
			}

			// 匹配 /api/tasks/:id
			const taskIdMatch = pathname.match(/^\/api\/tasks\/([^\/]+)$/);
			if (taskIdMatch) {
				const taskId = taskIdMatch[1];

				if (method === 'GET') {
					return await TaskRoutes.get(request, env, taskId);
				}

				if (method === 'PUT') {
					return await TaskRoutes.update(request, env, taskId);
				}

				if (method === 'DELETE') {
					return await TaskRoutes.delete(request, env, taskId);
				}
			}

			// 匹配 /api/tasks/:id/toggle
			const taskToggleMatch = pathname.match(/^\/api\/tasks\/([^\/]+)\/toggle$/);
			if (taskToggleMatch && method === 'POST') {
				const taskId = taskToggleMatch[1];
				return await TaskRoutes.toggle(request, env, taskId);
			}

			// 匹配 /api/tasks/:id/statistics
			const taskStatsMatch = pathname.match(/^\/api\/tasks\/([^\/]+)\/statistics$/);
			if (taskStatsMatch && method === 'GET') {
				const taskId = taskStatsMatch[1];
				return await TaskRoutes.statistics(request, env, taskId);
			}

			// ==================== 日志路由 ====================
			if (pathname === '/api/logs' && method === 'GET') {
				return await LogRoutes.list(request, env);
			}

			if (pathname === '/api/logs/cleanup' && method === 'POST') {
				return await LogRoutes.cleanup(request, env);
			}

			if (pathname === '/api/logs/statistics' && method === 'GET') {
				return await LogRoutes.statistics(request, env);
			}

			if (pathname === '/api/logs/errors' && method === 'GET') {
				return await LogRoutes.errors(request, env);
			}

			if (pathname === '/api/logs/audits' && method === 'GET') {
				return await LogRoutes.audits(request, env);
			}

			// 匹配 /api/logs/:id
			const logIdMatch = pathname.match(/^\/api\/logs\/([^\/]+)$/);
			if (logIdMatch && method === 'GET') {
				const logId = logIdMatch[1];
				return await LogRoutes.get(request, env, logId);
			}

			// ==================== 404 ====================
			return ResponseUtils.notFound('API端点不存在');
		} catch (error) {
			console.error('Worker error:', error);
			return ResponseUtils.serverError(
				error instanceof Error ? error.message : '未知错误'
			);
		}
	},

	async scheduled(controller: ScheduledController, env: Environment, ctx: ExecutionContext): Promise<void> {
		console.log('Cron触发器执行于:', new Date().toISOString());
		
		try {
			// 处理所有定时任务
			const result = await CronService.handleScheduledEvent(env);
			
			if (result.success) {
				console.log(`定时任务处理成功，执行了 ${result.processed} 个任务`);
			} else {
				console.error('定时任务处理失败:', result.errors);
			}
			
			if (result.errors.length > 0) {
				console.warn('部分任务执行出错:', result.errors);
			}
		} catch (error) {
			console.error('定时任务处理异常:', error);
		}
	}
} satisfies ExportedHandler<Environment>;

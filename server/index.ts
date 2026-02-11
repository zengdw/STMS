import { Environment } from './types/index.js';
import { CronService } from './services/cron.service.js';
import { staticRoutes, dynamicRoutes } from './routes/index.js';
import { ResponseUtils } from './utils/response.js';
import { RateLimitMiddleware } from './middleware/rate-limit.js';

export default {
	async fetch(request: Request, env: Environment, ctx: ExecutionContext): Promise<Response> {
		// this.scheduled({ "cron": "* * * * *", "scheduledTime": Date.now(), "noRetry": () => { } }, env, ctx);
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

			// 1. 静态路由匹配
			const staticHandler = staticRoutes[`${method}:${pathname}`];
			if (staticHandler) {
				return await staticHandler(request, env);
			}

			// 2. 动态路由匹配
			for (const [pattern, methods, handler] of dynamicRoutes) {
				if (!methods.includes(method)) continue;
				const match = pathname.match(pattern);
				if (match) {
					return await handler(request, env, ...match.slice(1));
				}
			}

			// 404
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

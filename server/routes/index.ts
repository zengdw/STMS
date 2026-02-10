import { Environment } from '../types/index.js';
import { AuthRoutes } from './auth.js';
import { TaskRoutes } from './tasks.js';
import { LogRoutes } from './logs.js';
import { HealthRoutes } from './health.js';
import { SettingsRoutes } from './settings.js';

// 路由处理器类型
export type RouteHandler = (request: Request, env: Environment, ...args: string[]) => Promise<Response>;

// 静态路由表: key = "METHOD:path"
export const staticRoutes: Record<string, RouteHandler> = {
    // 健康检查
    'GET:/api/health': (req, env) => HealthRoutes.check(req, env),
    'GET:/api/status': (req, env) => HealthRoutes.status(req, env),
    'GET:/api/metrics': (req, env) => HealthRoutes.metrics(req, env),
    'GET:/api/version': (req, env) => HealthRoutes.version(req, env),

    // 认证
    'POST:/api/auth/login': (req, env) => AuthRoutes.login(req, env),
    'POST:/api/auth/register': (req, env) => AuthRoutes.register(req, env),
    'POST:/api/auth/refresh': (req, env) => AuthRoutes.refresh(req, env),
    'GET:/api/auth/me': (req, env) => AuthRoutes.me(req, env),

    // 任务
    'GET:/api/tasks': (req, env) => TaskRoutes.list(req, env),
    'POST:/api/tasks': (req, env) => TaskRoutes.create(req, env),

    // 设置
    'PUT:/api/settings/password': (req, env) => SettingsRoutes.changePassword(req, env),
    'GET:/api/settings/notifications': (req, env) => SettingsRoutes.getNotificationSettings(req, env),
    'PUT:/api/settings/notifications': (req, env) => SettingsRoutes.updateNotificationSettings(req, env),
    'GET:/api/settings/notifications/channels': (req, env) => SettingsRoutes.getEnabledChannels(req, env),
    'POST:/api/settings/notifications/test': (req, env) => SettingsRoutes.testNotification(req, env),

    // 日志
    'GET:/api/logs': (req, env) => LogRoutes.list(req, env),
    'POST:/api/logs/cleanup': (req, env) => LogRoutes.cleanup(req, env),
    'GET:/api/logs/statistics': (req, env) => LogRoutes.statistics(req, env),
    'GET:/api/logs/errors': (req, env) => LogRoutes.errors(req, env),
    'GET:/api/logs/audits': (req, env) => LogRoutes.audits(req, env),
};

// 动态路由表: [正则, 方法(数组), 处理器]
export const dynamicRoutes: Array<[RegExp, string[], RouteHandler]> = [
    [/^\/api\/tasks\/([^/]+)$/, ['GET'], (req, env, id) => TaskRoutes.get(req, env, id)],
    [/^\/api\/tasks\/([^/]+)$/, ['PUT'], (req, env, id) => TaskRoutes.update(req, env, id)],
    [/^\/api\/tasks\/([^/]+)$/, ['DELETE'], (req, env, id) => TaskRoutes.delete(req, env, id)],
    [/^\/api\/tasks\/([^/]+)\/toggle$/, ['POST'], (req, env, id) => TaskRoutes.toggle(req, env, id)],
    [/^\/api\/tasks\/([^/]+)\/statistics$/, ['GET'], (req, env, id) => TaskRoutes.statistics(req, env, id)],
    [/^\/api\/logs\/([^/]+)$/, ['GET'], (req, env, id) => LogRoutes.get(req, env, id)],
];

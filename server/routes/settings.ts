import { Environment, NotificationSettings } from '../types/index.js';
import { AuthService } from '../services/auth.service.js';
import { NotificationService } from '../services/notification.service.js';
import { ResponseUtils } from '../utils/response.js';
import { DatabaseUtils } from '../utils/database.js';
import { NotificationSettingsModel } from '../models/notification-settings.model.js';

/**
 * 设置路由处理器
 */
export class SettingsRoutes {
    /**
     * 修改密码
     */
    static async changePassword(request: Request, env: Environment): Promise<Response> {
        try {
            const user = await AuthService.authenticateRequest(env, request);
            if (!user) {
                return ResponseUtils.unauthorized('未授权');
            }

            const body = await request.json() as { oldPassword: string; newPassword: string };

            if (!body.oldPassword || !body.newPassword) {
                return ResponseUtils.error('旧密码和新密码不能为空', 400);
            }

            const result = await AuthService.changePassword(env, user.id, body.oldPassword, body.newPassword);

            if (!result.success) {
                return ResponseUtils.error(result.error || '修改密码失败', 400);
            }

            return ResponseUtils.json({
                success: true,
                message: '密码修改成功'
            }, 200);
        } catch (error) {
            return ResponseUtils.serverError('修改密码请求处理失败');
        }
    }

    /**
     * 获取通知设置
     */
    static async getNotificationSettings(request: Request, env: Environment): Promise<Response> {
        try {
            const user = await AuthService.authenticateRequest(env, request);
            if (!user) {
                return ResponseUtils.unauthorized('未授权');
            }

            const result = await DatabaseUtils.getNotificationSettingsByUserId(env, user.id);

            if (!result.success) {
                return ResponseUtils.serverError(result.error || '获取通知设置失败');
            }

            return ResponseUtils.json({
                success: true,
                data: result.data || null
            }, 200);
        } catch (error) {
            return ResponseUtils.serverError('获取通知设置请求处理失败');
        }
    }

    /**
     * 更新通知设置
     */
    static async updateNotificationSettings(request: Request, env: Environment): Promise<Response> {
        try {
            const user = await AuthService.authenticateRequest(env, request);
            if (!user) {
                return ResponseUtils.unauthorized('未授权');
            }

            const body = await request.json() as Partial<NotificationSettings>;

            // 检查是否已有设置
            const existingResult = await DatabaseUtils.getNotificationSettingsByUserId(env, user.id);

            let result;
            if (existingResult.success && existingResult.data) {
                // 更新现有设置
                result = await DatabaseUtils.updateNotificationSettings(env, user.id, body);
            } else {
                // 创建新设置
                const newSettings = NotificationSettingsModel.create({
                    id: crypto.randomUUID(),
                    user_id: user.id,
                    email_enabled: body.email_enabled,
                    email_address: body.email_address,
                    email_api_key: body.email_api_key,
                    webhook_enabled: body.webhook_enabled,
                    webhook_url: body.webhook_url,
                    notifyx_enabled: body.notifyx_enabled,
                    notifyx_api_key: body.notifyx_api_key,
                    failure_threshold: body.failure_threshold
                });
                result = await DatabaseUtils.createNotificationSettings(env, newSettings);
            }

            if (!result.success) {
                return ResponseUtils.error(result.error || '更新通知设置失败', 400);
            }

            return ResponseUtils.json({
                success: true,
                data: result.data,
                message: '通知设置已更新'
            }, 200);
        } catch (error) {
            return ResponseUtils.serverError('更新通知设置请求处理失败');
        }
    }

    /**
     * 获取已启用的通知渠道
     */
    static async getEnabledChannels(request: Request, env: Environment): Promise<Response> {
        try {
            const user = await AuthService.authenticateRequest(env, request);
            if (!user) {
                return ResponseUtils.unauthorized('未授权');
            }

            const result = await DatabaseUtils.getNotificationSettingsByUserId(env, user.id);

            if (!result.success || !result.data) {
                return ResponseUtils.json({
                    success: true,
                    data: []
                }, 200);
            }

            const channels = NotificationSettingsModel.getAvailableChannels(result.data);

            return ResponseUtils.json({
                success: true,
                data: channels
            }, 200);
        } catch (error) {
            return ResponseUtils.serverError('获取已启用通知渠道请求处理失败');
        }
    }

    /**
     * 测试通知
     */
    static async testNotification(request: Request, env: Environment): Promise<Response> {
        try {
            const user = await AuthService.authenticateRequest(env, request);
            if (!user) {
                return ResponseUtils.unauthorized('未授权');
            }

            // 获取用户当前的通知设置
            const result = await DatabaseUtils.getNotificationSettingsByUserId(env, user.id);

            if (!result.success || !result.data) {
                return ResponseUtils.error('未找到通知设置，请先配置通知', 400);
            }

            // 解析请求体获取 channel 参数
            let channel: 'email' | 'webhook' | 'notifyx' | undefined;
            try {
                const body = await request.json() as any;
                if (body && body.channel) {
                    channel = body.channel;
                }
            } catch (e) {
                // Ignore json parse error, channel remains undefined
            }

            // 发送测试通知
            const testResult = await NotificationService.testNotification(env, result.data, channel);

            if (!testResult.success) {
                return ResponseUtils.error(testResult.error || '测试通知发送失败', 400);
            }

            return ResponseUtils.json({
                success: true,
                message: '测试通知已发送'
            }, 200);
        } catch (error) {
            return ResponseUtils.serverError('测试通知请求处理失败');
        }
    }
}

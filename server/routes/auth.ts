import { Environment, ApiResponse, LoginCredentials } from '../types/index.js';
import { AuthService } from '../services/auth.service.js';
import { ResponseUtils } from '../utils/response.js';

/**
 * 认证路由处理器
 */
export class AuthRoutes {
  /**
   * 处理登录请求
   */
  static async login(request: Request, env: Environment): Promise<Response> {
    try {
      const body = await request.json() as LoginCredentials;
      
      if (!body.username || !body.password) {
        return ResponseUtils.error('用户名和密码不能为空', 400);
      }

      const result = await AuthService.authenticate(env, body.username, body.password);
      
      if (!result.success) {
        return ResponseUtils.unauthorized(result.error);
      }

      return ResponseUtils.json({
        success: true,
        data: {
          token: result.token,
          user: result.user
        }
      }, 200);
    } catch (error) {
      return ResponseUtils.serverError('登录请求处理失败');
    }
  }

  /**
   * 处理注册请求
   */
  static async register(request: Request, env: Environment): Promise<Response> {
    try {
      const body = await request.json() as { username: string; password: string; role?: 'admin' | 'user' };
      
      if (!body.username || !body.password) {
        return ResponseUtils.error('用户名和密码不能为空', 400);
      }

      const result = await AuthService.register(env, body.username, body.password, body.role);
      
      if (!result.success) {
        return ResponseUtils.error(result.error || '注册失败', 400);
      }

      return ResponseUtils.json({
        success: true,
        data: {
          token: result.token,
          user: result.user
        }
      }, 201);
    } catch (error) {
      return ResponseUtils.serverError('注册请求处理失败');
    }
  }

  /**
   * 处理令牌刷新请求
   */
  static async refresh(request: Request, env: Environment): Promise<Response> {
    try {
      const token = AuthService.extractTokenFromRequest(request);
      
      if (!token) {
        return ResponseUtils.unauthorized('缺少认证令牌');
      }

      const newToken = await AuthService.refreshToken(env, token);
      
      if (!newToken) {
        return ResponseUtils.unauthorized('令牌刷新失败');
      }

      return ResponseUtils.json({
        success: true,
        data: { token: newToken }
      }, 200);
    } catch (error) {
      return ResponseUtils.serverError('令牌刷新请求处理失败');
    }
  }

  /**
   * 处理获取当前用户信息请求
   */
  static async me(request: Request, env: Environment): Promise<Response> {
    try {
      const user = await AuthService.authenticateRequest(env, request);
      
      if (!user) {
        return ResponseUtils.unauthorized('未授权');
      }

      return ResponseUtils.json({
        success: true,
        data: { user }
      }, 200);
    } catch (error) {
      return ResponseUtils.serverError('获取用户信息失败');
    }
  }
}

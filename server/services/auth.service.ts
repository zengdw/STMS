import { Environment, User } from '../types/index.js';
import { DatabaseUtils, DatabaseResult } from '../utils/database.js';
import { UserModel } from '../models/user.model.js';

/**
 * 认证结果
 */
export interface AuthResult {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

/**
 * 令牌载荷
 */
export interface TokenPayload {
  userId: string;
  username: string;
  role: 'admin' | 'user';
  iat: number; // 签发时间
  exp: number; // 过期时间
}

/**
 * 认证服务类
 * 提供用户认证、令牌管理和会话管理功能
 */
export class AuthService {
  /**
   * 令牌过期时间（秒）- 24小时
   */
  private static readonly TOKEN_EXPIRY = 24 * 60 * 60;

  /**
   * 刷新令牌过期时间（秒）- 7天
   */
  private static readonly REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60;

  /**
   * 哈希密码
   * @param password 明文密码
   * @returns 密码哈希
   */
  static async hashPassword(password: string): Promise<string> {
    // 使用Web Crypto API进行密码哈希
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * 验证密码
   * @param password 明文密码
   * @param hash 密码哈希
   * @returns 是否匹配
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    const passwordHash = await this.hashPassword(password);
    return passwordHash === hash;
  }

  /**
   * 生成JWT令牌
   * @param user 用户对象
   * @param expirySeconds 过期时间（秒）
   * @param secret JWT密钥
   * @returns JWT令牌
   */
  static async generateToken(user: User, expirySeconds: number, secret: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      iat: now,
      exp: now + expirySeconds
    };

    // 创建JWT头部
    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    // Base64URL编码
    const base64UrlEncode = (obj: any): string => {
      const json = JSON.stringify(obj);
      const base64 = btoa(json);
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    const encodedHeader = base64UrlEncode(header);
    const encodedPayload = base64UrlEncode(payload);

    // 创建签名
    const encoder = new TextEncoder();
    const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
    const keyData = encoder.encode(secret);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
    const encodedSignature = signatureBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  }

  /**
   * 验证JWT令牌
   * @param token JWT令牌
   * @param secret JWT密钥
   * @returns 令牌载荷或null
   */
  static async verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const [encodedHeader, encodedPayload, encodedSignature] = parts;

      // 验证签名
      const encoder = new TextEncoder();
      const data = encoder.encode(`${encodedHeader}.${encodedPayload}`);
      const keyData = encoder.encode(secret);
      
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      // 解码签名
      const signatureBase64 = encodedSignature.replace(/-/g, '+').replace(/_/g, '/');
      const paddedSignature = signatureBase64 + '='.repeat((4 - signatureBase64.length % 4) % 4);
      const signatureStr = atob(paddedSignature);
      const signature = new Uint8Array(signatureStr.split('').map(c => c.charCodeAt(0)));

      const isValid = await crypto.subtle.verify('HMAC', cryptoKey, signature, data);
      if (!isValid) {
        return null;
      }

      // 解码载荷
      const payloadBase64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
      const paddedPayload = payloadBase64 + '='.repeat((4 - payloadBase64.length % 4) % 4);
      const payloadJson = atob(paddedPayload);
      const payload: TokenPayload = JSON.parse(payloadJson);

      // 检查过期时间
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return null;
      }

      return payload;
    } catch (error) {
      console.error('Token verification error:', error);
      return null;
    }
  }

  /**
   * 用户认证
   * @param env 环境变量
   * @param username 用户名
   * @param password 密码
   * @returns 认证结果
   */
  static async authenticate(
    env: Environment,
    username: string,
    password: string
  ): Promise<AuthResult> {
    try {
      // 验证输入
      if (!username || !password) {
        return { success: false, error: '用户名和密码不能为空' };
      }

      // 获取用户
      const userResult = await DatabaseUtils.getUserByUsername(env, username);
      if (!userResult.success) {
        return { success: false, error: '数据库查询失败' };
      }

      if (!userResult.data) {
        return { success: false, error: '用户名或密码错误' };
      }

      const user = userResult.data;

      // 验证密码
      const isPasswordValid = await this.verifyPassword(password, user.password_hash);
      if (!isPasswordValid) {
        return { success: false, error: '用户名或密码错误' };
      }

      // 生成令牌
      const token = await this.generateToken(user, this.TOKEN_EXPIRY, env.JWT_SECRET);

      // 返回用户信息（不包含密码哈希）
      const { password_hash, ...userWithoutPassword } = user;

      return {
        success: true,
        token,
        user: userWithoutPassword as User
      };
    } catch (error) {
      console.error('Authentication error:', error);
      return {
        success: false,
        error: '认证过程发生错误'
      };
    }
  }

  /**
   * 验证令牌并获取用户
   * @param env 环境变量
   * @param token JWT令牌
   * @returns 用户对象或null
   */
  static async validateToken(env: Environment, token: string): Promise<User | null> {
    try {
      // 验证令牌
      const payload = await this.verifyToken(token, env.JWT_SECRET);
      if (!payload) {
        return null;
      }

      // 获取用户
      const userResult = await DatabaseUtils.getUserById(env, payload.userId);
      if (!userResult.success || !userResult.data) {
        return null;
      }

      return userResult.data;
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  }

  /**
   * 刷新令牌
   * @param env 环境变量
   * @param token 当前令牌
   * @returns 新令牌或null
   */
  static async refreshToken(env: Environment, token: string): Promise<string | null> {
    try {
      // 验证当前令牌（允许过期）
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const [, encodedPayload] = parts;
      const payloadBase64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
      const paddedPayload = payloadBase64 + '='.repeat((4 - payloadBase64.length % 4) % 4);
      const payloadJson = atob(paddedPayload);
      const payload: TokenPayload = JSON.parse(payloadJson);

      // 获取用户
      const userResult = await DatabaseUtils.getUserById(env, payload.userId);
      if (!userResult.success || !userResult.data) {
        return null;
      }

      // 生成新令牌
      const newToken = await this.generateToken(userResult.data, this.TOKEN_EXPIRY, env.JWT_SECRET);
      return newToken;
    } catch (error) {
      console.error('Token refresh error:', error);
      return null;
    }
  }

  /**
   * 注册新用户
   * @param env 环境变量
   * @param username 用户名
   * @param password 密码
   * @param role 用户角色
   * @returns 认证结果
   */
  static async register(
    env: Environment,
    username: string,
    password: string,
    role: 'admin' | 'user' = 'user'
  ): Promise<AuthResult> {
    try {
      // 验证输入
      if (!UserModel.validateUsername(username)) {
        return { success: false, error: '用户名格式无效：长度3-20字符，只允许字母、数字和下划线' };
      }

      if (!UserModel.validatePassword(password)) {
        return { success: false, error: '密码格式无效：至少8位，包含字母和数字' };
      }

      // 检查用户名是否已存在
      const existingUserResult = await DatabaseUtils.getUserByUsername(env, username);
      if (existingUserResult.success && existingUserResult.data) {
        return { success: false, error: '用户名已存在' };
      }

      // 哈希密码
      const passwordHash = await this.hashPassword(password);

      // 创建用户
      const user = UserModel.create({
        id: crypto.randomUUID(),
        username,
        password_hash: passwordHash,
        role
      });

      const createResult = await DatabaseUtils.createUser(env, user);
      if (!createResult.success) {
        return { success: false, error: createResult.error || '创建用户失败' };
      }

      // 生成令牌
      const token = await this.generateToken(user, this.TOKEN_EXPIRY, env.JWT_SECRET);

      // 返回用户信息（不包含密码哈希）
      const { password_hash, ...userWithoutPassword } = user;

      return {
        success: true,
        token,
        user: userWithoutPassword as User
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: '注册过程发生错误'
      };
    }
  }

  /**
   * 从请求头中提取令牌
   * @param request HTTP请求
   * @returns JWT令牌或null
   */
  static extractTokenFromRequest(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * 认证中间件
   * @param env 环境变量
   * @param request HTTP请求
   * @returns 用户对象或null
   */
  static async authenticateRequest(env: Environment, request: Request): Promise<User | null> {
    const token = this.extractTokenFromRequest(request);
    if (!token) {
      return null;
    }

    return this.validateToken(env, token);
  }
}

import { describe, it, expect, beforeAll } from 'vitest';
import { AuthService } from '../../server/services/auth.service.js';
import { UserModel } from '../../server/models/user.model.js';

describe('认证服务测试', () => {
  const mockEnv = {
    DB: null as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test_secret_key_12345678'
  };

  let testUser: any;
  let hashedPassword: string;

  beforeAll(async () => {
    hashedPassword = await AuthService.hashPassword('TestPassword123');
    testUser = UserModel.create({
      id: 'test-user-id',
      username: 'testuser',
      password_hash: hashedPassword,
      role: 'user'
    });
  });

  describe('密码哈希和验证', () => {
    it('应该成功哈希密码', async () => {
      const password = 'TestPassword123';
      const hash = await AuthService.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
      expect(typeof hash).toBe('string');
    });

    it('应该验证正确的密码', async () => {
      const password = 'TestPassword123';
      const isValid = await AuthService.verifyPassword(password, hashedPassword);
      
      expect(isValid).toBe(true);
    });

    it('应该拒绝错误的密码', async () => {
      const wrongPassword = 'WrongPassword';
      const isValid = await AuthService.verifyPassword(wrongPassword, hashedPassword);
      
      expect(isValid).toBe(false);
    });

    it('相同密码应该生成相同的哈希', async () => {
      const password = 'TestPassword123';
      const hash1 = await AuthService.hashPassword(password);
      const hash2 = await AuthService.hashPassword(password);
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('JWT令牌生成和验证', () => {
    it('应该成功生成JWT令牌', async () => {
      const token = await AuthService.generateToken(testUser, 3600, mockEnv.JWT_SECRET);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT格式：header.payload.signature
    });

    it('应该验证有效的JWT令牌', async () => {
      const token = await AuthService.generateToken(testUser, 3600, mockEnv.JWT_SECRET);
      const payload = await AuthService.verifyToken(token, mockEnv.JWT_SECRET);
      
      expect(payload).toBeDefined();
      expect(payload?.userId).toBe(testUser.id);
      expect(payload?.username).toBe(testUser.username);
      expect(payload?.role).toBe(testUser.role);
    });

    it('应该拒绝无效的JWT令牌', async () => {
      const invalidToken = 'invalid.token.here';
      const payload = await AuthService.verifyToken(invalidToken, mockEnv.JWT_SECRET);
      
      expect(payload).toBeNull();
    });

    it('应该拒绝使用错误密钥签名的令牌', async () => {
      const token = await AuthService.generateToken(testUser, 3600, mockEnv.JWT_SECRET);
      const payload = await AuthService.verifyToken(token, 'wrong_secret');
      
      expect(payload).toBeNull();
    });

    it('应该拒绝过期的令牌', async () => {
      // 生成一个已过期的令牌（-1秒）
      const expiredToken = await AuthService.generateToken(testUser, -1, mockEnv.JWT_SECRET);
      
      // 等待一小段时间确保令牌过期
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const payload = await AuthService.verifyToken(expiredToken, mockEnv.JWT_SECRET);
      expect(payload).toBeNull();
    });
  });

  describe('令牌提取', () => {
    it('应该从Authorization头中提取Bearer令牌', async () => {
      const token = await AuthService.generateToken(testUser, 3600, mockEnv.JWT_SECRET);
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const extractedToken = AuthService.extractTokenFromRequest(request);
      expect(extractedToken).toBe(token);
    });

    it('无Authorization头时应返回null', () => {
      const request = new Request('https://example.com');
      const token = AuthService.extractTokenFromRequest(request);
      
      expect(token).toBeNull();
    });

    it('Authorization头格式错误时应返回null', () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': 'InvalidFormat token'
        }
      });
      
      const token = AuthService.extractTokenFromRequest(request);
      expect(token).toBeNull();
    });

    it('只有Bearer关键字时应返回null', () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': 'Bearer'
        }
      });
      
      const token = AuthService.extractTokenFromRequest(request);
      expect(token).toBeNull();
    });
  });
});

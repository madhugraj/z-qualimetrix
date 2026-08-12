import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt, hashToken, maskToken } from '../../lib/encryption';

const prisma = new PrismaClient();

interface GitHubTokenData {
  tenantId: string;
  token: string;
  userId: string;
}

interface TokenValidationResult {
  isValid: boolean;
  username?: string;
  tokenType?: string;
  error?: string;
}

export class GitHubTokenService {
  /**
   * Save GitHub token to database (encrypted)
   */
  async saveToken(data: GitHubTokenData): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const { tenantId, token, userId } = data;

      // Validate the token first
      const validation = await this.validateToken(token);
      if (!validation.isValid) {
        return {
          success: false,
          message: validation.error || 'Invalid GitHub token'
        };
      }

      // Check if integration already exists for tenant
      const existing = await prisma.gitHubIntegration.findUnique({
        where: { tenantId }
      });

      // Encrypt the token
      const encryptedToken = encrypt(token);

      if (existing) {
        // Update existing integration
        await prisma.gitHubIntegration.update({
          where: { tenantId },
          data: {
            encryptedToken,
            tokenType: validation.tokenType || 'unknown',
            githubUsername: validation.username,
            lastValidated: new Date(),
            lastUsed: new Date(),
            isActive: true
          }
        });

        return {
          success: true,
          message: 'GitHub token updated successfully',
          data: {
            username: validation.username,
            tokenType: validation.tokenType
          }
        };
      } else {
        // Create new integration
        await prisma.gitHubIntegration.create({
          data: {
            tenantId,
            encryptedToken,
            tokenType: validation.tokenType || 'unknown',
            githubUsername: validation.username,
            lastValidated: new Date(),
            createdBy: userId
          }
        });

        return {
          success: true,
          message: 'GitHub token saved successfully',
          data: {
            username: validation.username,
            tokenType: validation.tokenType
          }
        };
      }
    } catch (error: any) {
      console.error('Error saving GitHub token:', error);
      return {
        success: false,
        message: `Failed to save token: ${error.message}`
      };
    }
  }

  /**
   * Get GitHub token from database (decrypted)
   */
  async getToken(tenantId: string): Promise<string | null> {
    try {
      const integration = await prisma.gitHubIntegration.findUnique({
        where: { tenantId, isActive: true }
      });

      if (!integration) {
        return null;
      }

      // Update last used timestamp
      await prisma.gitHubIntegration.update({
        where: { tenantId },
        data: { lastUsed: new Date() }
      });

      return decrypt(integration.encryptedToken);
    } catch (error: any) {
      console.error('Error retrieving GitHub token:', error);
      return null;
    }
  }

  /**
   * Get GitHub integration status (without exposing token)
   */
  async getStatus(tenantId: string): Promise<{
    isConnected: boolean;
    username?: string;
    tokenType?: string;
    lastValidated?: string;
    lastUsed?: string;
  }> {
    try {
      const integration = await prisma.gitHubIntegration.findUnique({
        where: { tenantId }
      });

      if (!integration || !integration.isActive) {
        return { isConnected: false };
      }

      return {
        isConnected: true,
        username: integration.githubUsername || undefined,
        tokenType: integration.tokenType,
        lastValidated: integration.lastValidated?.toISOString(),
        lastUsed: integration.lastUsed?.toISOString()
      };
    } catch (error) {
      console.error('Error getting GitHub status:', error);
      return { isConnected: false };
    }
  }

  /**
   * Validate GitHub token by making API call
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'QualiMetrix-GitHub-Integration'
        }
      });

      if (!response.ok) {
        return {
          isValid: false,
          error: `GitHub API returned ${response.status}: ${response.statusText}`
        };
      }

      const userData = await response.json();

      // Determine token type based on prefix
      let tokenType = 'unknown';
      if (token.startsWith('ghp_')) tokenType = 'personal_access_token';
      else if (token.startsWith('gho_')) tokenType = 'oauth_token';
      else if (token.startsWith('ghu_')) tokenType = 'user_token';

      return {
        isValid: true,
        username: userData.login,
        tokenType
      };
    } catch (error: any) {
      return {
        isValid: false,
        error: error.message || 'Token validation failed'
      };
    }
  }

  /**
   * Delete GitHub integration
   */
  async deleteToken(tenantId: string): Promise<{ success: boolean; message: string }> {
    try {
      await prisma.gitHubIntegration.delete({
        where: { tenantId }
      });

      return {
        success: true,
        message: 'GitHub integration removed successfully'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to remove integration: ${error.message}`
      };
    }
  }

  /**
   * Test stored token by making a GitHub API call
   */
  async testStoredToken(tenantId: string): Promise<TokenValidationResult> {
    try {
      const token = await this.getToken(tenantId);
      if (!token) {
        return {
          isValid: false,
          error: 'No GitHub token found in database'
        };
      }

      return await this.validateToken(token);
    } catch (error: any) {
      return {
        isValid: false,
        error: error.message || 'Failed to test stored token'
      };
    }
  }
}

export const githubTokenService = new GitHubTokenService();
export default githubTokenService;
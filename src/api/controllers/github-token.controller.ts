import { Request, Response } from 'express';
import githubTokenService from '../services/github-token.service';

/**
 * GitHub Token Controller
 * Handles secure storage and retrieval of GitHub integration tokens
 */

export async function saveGitHubToken(req: Request, res: Response): Promise<void> {
  try {
    const { token, tenantId, userId } = req.body;

    if (!token || !tenantId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Token and tenantId are required'
      });
      return;
    }

    // For now, use a default tenant ID if not provided (for testing)
    const actualTenantId = tenantId || 'default-tenant';
    const actualUserId = userId || 'system-user';

    console.log(`🔐 Saving GitHub token for tenant: ${actualTenantId}`);

    const result = await githubTokenService.saveToken({
      tenantId: actualTenantId,
      token,
      userId: actualUserId
    });

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('Error saving GitHub token:', error);
    res.status(500).json({
      error: 'Failed to save GitHub token',
      message: error.message || 'Unknown error'
    });
  }
}

export async function getGitHubToken(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Tenant ID is required'
      });
      return;
    }

    const token = await githubTokenService.getToken(tenantId);

    if (!token) {
      res.status(404).json({
        error: 'Not Found',
        message: 'No GitHub token found for this tenant'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        token // In production, you might want to be more careful about returning tokens
      }
    });
  } catch (error: any) {
    console.error('Error retrieving GitHub token:', error);
    res.status(500).json({
      error: 'Failed to retrieve GitHub token',
      message: error.message || 'Unknown error'
    });
  }
}

export async function getGitHubStatus(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const actualTenantId = tenantId || 'default-tenant';

    const status = await githubTokenService.getStatus(actualTenantId);

    res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    console.error('Error getting GitHub status:', error);
    res.status(500).json({
      error: 'Failed to get GitHub status',
      message: error.message || 'Unknown error'
    });
  }
}

export async function validateGitHubToken(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Token is required'
      });
      return;
    }

    console.log('🔍 Validating GitHub token...');

    const result = await githubTokenService.validateToken(token);

    if (result.isValid) {
      res.json({
        success: true,
        message: 'GitHub token is valid',
        data: {
          username: result.username,
          tokenType: result.tokenType
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Token validation failed'
      });
    }
  } catch (error: any) {
    console.error('Error validating GitHub token:', error);
    res.status(500).json({
      error: 'Failed to validate GitHub token',
      message: error.message || 'Unknown error'
    });
  }
}

export async function deleteGitHubToken(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const actualTenantId = tenantId || 'default-tenant';

    console.log(`🗑️  Deleting GitHub token for tenant: ${actualTenantId}`);

    const result = await githubTokenService.deleteToken(actualTenantId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('Error deleting GitHub token:', error);
    res.status(500).json({
      error: 'Failed to delete GitHub token',
      message: error.message || 'Unknown error'
    });
  }
}

export async function testGitHubToken(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const actualTenantId = tenantId || 'default-tenant';

    console.log(`🧪 Testing stored GitHub token for tenant: ${actualTenantId}`);

    const result = await githubTokenService.testStoredToken(actualTenantId);

    if (result.isValid) {
      res.json({
        success: true,
        message: `GitHub token is valid for user ${result.username}`,
        data: {
          username: result.username,
          tokenType: result.tokenType
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Stored token is invalid or expired'
      });
    }
  } catch (error: any) {
    console.error('Error testing GitHub token:', error);
    res.status(500).json({
      error: 'Failed to test GitHub token',
      message: error.message || 'Unknown error'
    });
  }
}
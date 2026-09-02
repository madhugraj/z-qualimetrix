import { Request, Response } from 'express';
import githubTokenService from '../services/github-token.service';

/**
 * GitHub Token Controller
 * Handles secure storage and retrieval of GitHub integration tokens.
 * Tenant is always derived from req.user (set by requireAuth/requireAdmin),
 * never from the request body or a URL param — a client-supplied tenantId
 * here would let one tenant read/overwrite/delete another's connection.
 */

export async function saveGitHubToken(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    if (!tenantId || !userId) {
      res.status(403).json({ error: 'Forbidden', message: 'Not assigned to an organization yet' });
      return;
    }
    if (!token) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Token is required'
      });
      return;
    }

    console.log(`🔐 Saving GitHub token for tenant: ${tenantId}`);

    const result = await githubTokenService.saveToken({ tenantId, token, userId });

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

export async function getGitHubStatus(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Forbidden', message: 'Not assigned to an organization yet' });
      return;
    }

    const status = await githubTokenService.getStatus(tenantId);

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
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Forbidden', message: 'Not assigned to an organization yet' });
      return;
    }

    console.log(`🗑️  Deleting GitHub token for tenant: ${tenantId}`);

    const result = await githubTokenService.deleteToken(tenantId);

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
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Forbidden', message: 'Not assigned to an organization yet' });
      return;
    }

    console.log(`🧪 Testing stored GitHub token for tenant: ${tenantId}`);

    const result = await githubTokenService.testStoredToken(tenantId);

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

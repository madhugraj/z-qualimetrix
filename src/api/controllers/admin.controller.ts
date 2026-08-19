/**
 * Admin Configuration Controller
 * Handles one-time enterprise setup and configuration
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BCRYPT_COST = 12;

/**
 * POST /api/v1/admin/setup-organization
 * One-time organization setup for enterprise deployment
 */
export async function setupOrganization(req: Request, res: Response) {
  try {
    const {
      organizationName,
      domain,
      timezone,
      workingDays,
      defaultSprintLength,
      budgetSettings,
      adminUser
    } = req.body;

    // Validate required fields
    if (!organizationName) {
      return res.status(400).json({
        success: false,
        error: 'Organization name is required'
      });
    }

    // Create organization slug. Slug collisions were impossible while only one
    // tenant could ever exist; now that setupOrganization allows many, a second
    // "Acme Corp" needs a distinct slug rather than a raw 500 on the unique
    // constraint.
    const baseSlug = organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++suffix}`;
    }

    // Create organization with default settings
    const tenant = await prisma.tenant.create({
      data: {
        name: organizationName,
        slug,
        domain: domain || null,
        settings: {
          timezone: timezone || 'UTC',
          dateFormat: 'YYYY-MM-DD',
          workingDays: workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          defaultSprintLength: defaultSprintLength || 14
        },
        subscriptionTier: 'enterprise',
        maxUsers: 1000, // Enterprise scale
        maxProducts: 100
      }
    });

    // Create admin user if provided
    let adminUserResponse = null;
    if (adminUser && adminUser.email) {
      const existingAdmin = await prisma.user.findUnique({
        where: { email: adminUser.email }
      });

      if (!existingAdmin) {
        const admin = await prisma.user.create({
          data: {
            email: adminUser.email,
            name: adminUser.name || 'System Administrator',
            role: 'admin',
            tenantId: tenant.id,
            passwordHash: adminUser.password ? await bcrypt.hash(adminUser.password, BCRYPT_COST) : null,
          }
        });

        adminUserResponse = {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role
        };
      }
    }

    // Set up AI budget configuration if provided
    let budgetConfig = null;
    if (budgetSettings) {
      // This would be stored in a separate budget configuration table
      budgetConfig = {
        orgSprintBudget: budgetSettings.orgSprintBudget || 3200,
        defaultSeatBudget: budgetSettings.defaultSeatBudget || 400,
        alertThresholds: budgetSettings.alertThresholds || {
          warning: 75,
          critical: 90
        }
      };
    }

    res.json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          domain: tenant.domain,
          settings: tenant.settings,
          subscriptionTier: tenant.subscriptionTier,
          maxUsers: tenant.maxUsers,
          maxProducts: tenant.maxProducts
        },
        adminUser: adminUserResponse,
        budgetConfiguration: budgetConfig,
        nextSteps: [
          'Import users via bulk import endpoint',
          'Configure teams and squads',
          'Set up products and projects',
          'Configure AI model catalog if needed'
        ]
      }
    });

  } catch (error) {
    console.error('Error setting up organization:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to setup organization'
    });
  }
}

/**
 * POST /api/v1/admin/users/bulk-import
 * Bulk user import for enterprise deployment
 */
export async function bulkImportUsers(req: Request, res: Response) {
  try {
    const { users, method, mappings } = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Users array is required'
      });
    }

    // tenantId must be explicit now that more than one tenant can exist —
    // silently picking "whichever tenant is first" would land every import
    // in the wrong organization as soon as a second one exists.
    const { tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'tenantId is required'
      });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(400).json({
        success: false,
        error: 'Organization not found for the given tenantId.'
      });
    }

    const results = {
      successful: [],
      failed: [],
      skipped: []
    };

    // Process each user
    for (const userData of users) {
      try {
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { email: userData.email }
        });

        if (existingUser) {
          results.skipped.push({
            email: userData.email,
            reason: 'User already exists'
          });
          continue;
        }

        // Create user
        const user = await prisma.user.create({
          data: {
            email: userData.email,
            name: userData.name || userData.email.split('@')[0],
            role: userData.role || 'developer',
            tenantId: tenant.id,
            isActive: true,
            passwordHash: userData.password ? await bcrypt.hash(userData.password, BCRYPT_COST) : null,
          }
        });

        results.successful.push({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          team: userData.team || null
        });

      } catch (error) {
        results.failed.push({
          email: userData.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({
      success: true,
      data: {
        summary: {
          total: users.length,
          successful: results.successful.length,
          failed: results.failed.length,
          skipped: results.skipped.length
        },
        results,
        importedUsers: results.successful
      }
    });

  } catch (error) {
    console.error('Error importing users:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import users'
    });
  }
}

/**
 * POST /api/v1/admin/teams
 * Configure teams and squads for the organization
 */
export async function configureTeams(req: Request, res: Response) {
  try {
    const { teams } = req.body;

    if (!teams || !Array.isArray(teams) || teams.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Teams array is required'
      });
    }

    // Get the tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return res.status(400).json({
        success: false,
        error: 'Organization not configured'
      });
    }

    // This would be stored in a teams configuration table
    // For now, we'll return a success response with the team structure
    const teamConfig = teams.map(team => ({
      name: team.name,
      budget: team.budget || 4000,
      lead: team.lead || null,
      members: team.members || [],
      settings: team.settings || {}
    }));

    res.json({
      success: true,
      data: {
        teams: teamConfig,
        totalTeams: teamConfig.length,
        organizationId: tenant.id
      }
    });

  } catch (error) {
    console.error('Error configuring teams:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to configure teams'
    });
  }
}

/**
 * PUT /api/v1/admin/budget-configuration
 * Update enterprise budget configuration
 */
export async function updateBudgetConfiguration(req: Request, res: Response) {
  try {
    const { orgSprintBudget, defaultSeatBudget, alertThresholds } = req.body;

    // Get the tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return res.status(400).json({
        success: false,
        error: 'Organization not configured'
      });
    }

    // Update tenant settings with budget configuration
    const updatedSettings = {
      ...tenant.settings,
      budgetConfiguration: {
        orgSprintBudget: orgSprintBudget || 3200,
        defaultSeatBudget: defaultSeatBudget || 400,
        alertThresholds: alertThresholds || {
          warning: 75,
          critical: 90
        }
      }
    };

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        settings: updatedSettings
      }
    });

    res.json({
      success: true,
      data: {
        budgetConfiguration: updatedSettings.budgetConfiguration,
        message: 'Budget configuration updated successfully'
      }
    });

  } catch (error) {
    console.error('Error updating budget configuration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update budget configuration'
    });
  }
}

/**
 * GET /api/v1/admin/configuration-status
 * Get current configuration status
 */
export async function getConfigurationStatus(req: Request, res: Response) {
  try {
    const tenant = await prisma.tenant.findFirst();
    const userCount = await prisma.user.count();

    // Get basic stats
    const stats = {
      organizationConfigured: !!tenant,
      userCount,
      maxUsers: tenant?.maxUsers || 0,
      subscriptionTier: tenant?.subscriptionTier || 'none',
      productsConfigured: await prisma.product.count(),
      aiUsageEvents: await prisma.aiUsageEvent.count()
    };

    // Determine setup progress
    const setupSteps = [
      { step: 'Organization Setup', completed: !!tenant, required: true },
      { step: 'Admin User', completed: userCount > 0, required: true },
      { step: 'User Import', completed: userCount >= 10, required: false },
      { step: 'Team Configuration', completed: false, required: false }, // Would check teams table
      { step: 'Product Setup', completed: stats.productsConfigured > 0, required: false }
    ];

    const completedRequired = setupSteps
      .filter(step => step.required)
      .filter(step => step.completed).length;

    const totalRequired = setupSteps.filter(step => step.required).length;

    res.json({
      success: true,
      data: {
        stats,
        setupSteps,
        setupProgress: {
          percentage: Math.round((completedRequired / totalRequired) * 100),
          completedRequired,
          totalRequired,
          isComplete: completedRequired === totalRequired
        },
        readyForUsers: completedRequired === totalRequired
      }
    });

  } catch (error) {
    console.error('Error getting configuration status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get configuration status'
    });
  }
}
#!/usr/bin/env node

/**
 * Database CRUD Operations Test Suite
 * Tests all database operations using Prisma client
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

async function test(name, testFn) {
  try {
    const result = await testFn();
    log(`✓ ${name}`, 'green');
    return { success: true, result };
  } catch (error) {
    log(`✗ ${name}`, 'red');
    log(`  Error: ${error.message}`, 'yellow');
    return { success: false, error };
  }
}

async function cleanupTestData() {
  logSection('🧹 CLEANING UP TEST DATA');

  try {
    // Delete in reverse order of creation to avoid foreign key constraints
    await prisma.testExecution.deleteMany({});
    await prisma.workItem.deleteMany({});
    await prisma.testCase.deleteMany({});
    await prisma.manualDeliverable.deleteMany({});
    await prisma.sprint.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.tenantMembership.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    log('✓ Cleanup completed', 'green');
  } catch (error) {
    log(`✗ Cleanup failed: ${error.message}`, 'red');
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  try {
    logSection('🗄️ DATABASE CRUD OPERATIONS TEST SUITE');

    // First, cleanup any existing data
    await cleanupTestData();

    // 1. CREATE Operations
    logSection('1. CREATE OPERATIONS');

    const createTests = [
      test('Create tenant', async () => {
        const tenant = await prisma.tenant.create({
          data: {
            name: 'Test Organization',
            slug: 'test-org',
            subscriptionTier: 'professional',
            maxUsers: 50,
            maxProducts: 10
          }
        });

        if (!tenant.id) throw new Error('Tenant ID missing');
        if (tenant.slug !== 'test-org') throw new Error('Slug mismatch');

        return { tenantId: tenant.id, tenant };
      }),

      test('Create user', async () => {
        // First get the tenant
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) throw new Error('No tenant found');

        const user = await prisma.user.create({
          data: {
            tenantId: tenant.id,
            email: 'admin@test.com',
            name: 'Admin User',
            role: 'admin',
            isActive: true
          }
        });

        if (!user.id) throw new Error('User ID missing');
        if (user.email !== 'admin@test.com') throw new Error('Email mismatch');

        return { userId: user.id, user };
      }),

      test('Create product', async () => {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) throw new Error('No tenant found');

        const product = await prisma.product.create({
          data: {
            tenantId: tenant.id,
            name: 'Test Product',
            key: 'TEST',
            description: 'A test product for QA',
            color: '#0066cc'
          }
        });

        if (!product.id) throw new Error('Product ID missing');
        if (product.key !== 'TEST') throw new Error('Product key mismatch');

        return { productId: product.id, product };
      }),

      test('Create sprint', async () => {
        const tenant = await prisma.tenant.findFirst();
        const product = await prisma.product.findFirst();
        if (!tenant || !product) throw new Error('Missing tenant or product');

        const now = new Date();
        const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
        const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

        const sprint = await prisma.sprint.create({
          data: {
            tenantId: tenant.id,
            productId: product.id,
            name: 'Sprint 1',
            status: 'active',
            startDate,
            endDate,
            goal: 'Test sprint for database validation'
          }
        });

        if (!sprint.id) throw new Error('Sprint ID missing');

        return { sprintId: sprint.id, sprint };
      }),

      test('Create work item', async () => {
        const tenant = await prisma.tenant.findFirst();
        const product = await prisma.product.findFirst();
        const sprint = await prisma.sprint.findFirst();
        const user = await prisma.user.findFirst();

        if (!tenant || !product || !sprint || !user) {
          throw new Error('Missing required entities');
        }

        const workItem = await prisma.workItem.create({
          data: {
            tenantId: tenant.id,
            productId: product.id,
            externalId: 'STORY-101',
            type: 'story',
            status: 'in_progress',
            priority: 'high',
            title: 'User authentication feature',
            description: 'Implement OAuth 2.0 authentication',
            sprintId: sprint.id,
            storyPoints: 8,
            createdBy: user.id
          }
        });

        if (!workItem.id) throw new Error('Work item ID missing');

        return { workItemId: workItem.id, workItem };
      }),

      test('Create test case', async () => {
        const tenant = await prisma.tenant.findFirst();
        const product = await prisma.product.findFirst();
        const user = await prisma.user.findFirst();

        if (!tenant || !product || !user) {
          throw new Error('Missing required entities');
        }

        const testCase = await prisma.testCase.create({
          data: {
            tenantId: tenant.id,
            productId: product.id,
            externalId: 'TC-101',
            name: 'Test user login',
            description: 'Verify user can login with valid credentials',
            type: 'functional',
            status: 'active',
            priority: 'high',
            automationStatus: 'automated',
            createdBy: user.id
          }
        });

        if (!testCase.id) throw new Error('Test case ID missing');

        return { testCaseId: testCase.id, testCase };
      }),

      test('Create test execution', async () => {
        const testCase = await prisma.testCase.findFirst();
        if (!testCase) throw new Error('No test case found');

        const execution = await prisma.testExecution.create({
          data: {
            testCaseId: testCase.id,
            status: 'passed',
            executedBy: 'system',
            notes: 'Test executed successfully',
            duration: 45
          }
        });

        if (!execution.id) throw new Error('Execution ID missing');

        return { executionId: execution.id, execution };
      }),

      test('Create manual deliverable', async () => {
        const tenant = await prisma.tenant.findFirst();
        const product = await prisma.product.findFirst();
        const user = await prisma.user.findFirst();

        if (!tenant || !product || !user) {
          throw new Error('Missing required entities');
        }

        const deliverable = await prisma.manualDeliverable.create({
          data: {
            tenantId: tenant.id,
            productId: product.id,
            type: 'demo',
            title: 'Product Demo to Stakeholders',
            description: 'Demonstrated new authentication features',
            rating: 4.5,
            links: ['https://demo-recording.example.com'],
            metadata: { audience: 'stakeholders', duration: 30 },
            createdBy: user.id
          }
        });

        if (!deliverable.id) throw new Error('Deliverable ID missing');

        return { deliverableId: deliverable.id, deliverable };
      })
    ];

    // 2. READ Operations
    logSection('2. READ OPERATIONS');

    const readTests = [
      test('Read tenant with relationships', async () => {
        const tenant = await prisma.tenant.findFirst({
          where: { slug: 'test-org' },
          include: {
            products: true,
            users: true,
            tenantMemberships: true
          }
        });

        if (!tenant) throw new Error('Tenant not found');
        if (!tenant.products || !tenant.users) throw new Error('Relationships not loaded');

        return { tenant, productCount: tenant.products.length, userCount: tenant.users.length };
      }),

      test('Read product with work items', async () => {
        const product = await prisma.product.findFirst({
          where: { key: 'TEST' },
          include: {
            workItems: true,
            testCases: true,
            sprints: true
          }
        });

        if (!product) throw new Error('Product not found');
        if (!product.workItems) throw new Error('Work items not loaded');

        return { product, workItemCount: product.workItems.length };
      }),

      test('Read user with memberships', async () => {
        const user = await prisma.user.findFirst({
          where: { email: 'admin@test.com' },
          include: {
            tenantMemberships: true,
            createdWorkItems: true,
            createdTestCases: true
          }
        });

        if (!user) throw new Error('User not found');

        return { user, name: user.name };
      }),

      test('Query work items by status', async () => {
        const inProgressItems = await prisma.workItem.findMany({
          where: { status: 'in_progress' }
        });

        if (!Array.isArray(inProgressItems)) throw new Error('Invalid result');

        return { count: inProgressItems.length };
      }),

      test('Query test cases with pagination', async () => {
        const testCases = await prisma.testCase.findMany({
          take: 5,
          skip: 0,
          orderBy: { createdAt: 'desc' }
        });

        if (!Array.isArray(testCases)) throw new Error('Invalid result');

        return { count: testCases.length };
      })
    ];

    // 3. UPDATE Operations
    logSection('3. UPDATE OPERATIONS');

    const updateTests = [
      test('Update tenant settings', async () => {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) throw new Error('No tenant found');

        const updated = await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            settings: {
              timezone: 'America/New_York',
              dateFormat: 'MM/DD/YYYY'
            }
          }
        });

        if (updated.settings.timezone !== 'America/New_York') {
          throw new Error('Settings not updated');
        }

        return { updated };
      }),

      test('Update work item status', async () => {
        const workItem = await prisma.workItem.findFirst();
        if (!workItem) throw new Error('No work item found');

        const updated = await prisma.workItem.update({
          where: { id: workItem.id },
          data: {
            status: 'completed',
            resolvedAt: new Date()
          }
        });

        if (updated.status !== 'completed') throw new Error('Status not updated');
        if (!updated.resolvedAt) throw new Error('Resolved at not set');

        return { updated };
      }),

      test('Update test case status', async () => {
        const testCase = await prisma.testCase.findFirst();
        if (!testCase) throw new Error('No test case found');

        const updated = await prisma.testCase.update({
          where: { id: testCase.id },
          data: {
            status: 'deprecated'
          }
        });

        if (updated.status !== 'deprecated') throw new Error('Status not updated');

        return { updated };
      }),

      test('Update user last login', async () => {
        const user = await prisma.user.findFirst();
        if (!user) throw new Error('No user found');

        const updated = await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date()
          }
        });

        if (!updated.lastLoginAt) throw new Error('Last login not set');

        return { updated };
      })
    ];

    // 4. DELETE Operations
    logSection('4. DELETE OPERATIONS');

    const deleteTests = [
      test('Delete test execution', async () => {
        const execution = await prisma.testExecution.findFirst();
        if (!execution) throw new Error('No execution found');

        await prisma.testExecution.delete({
          where: { id: execution.id }
        });

        // Verify it's deleted
        const deleted = await prisma.testExecution.findUnique({
          where: { id: execution.id }
        });

        if (deleted !== null) throw new Error('Execution not deleted');

        return { deleted: true };
      }),

      test('Delete work item', async () => {
        const workItem = await prisma.workItem.findFirst();
        if (!workItem) throw new Error('No work item found');

        await prisma.workItem.delete({
          where: { id: workItem.id }
        });

        // Verify it's deleted
        const deleted = await prisma.workItem.findUnique({
          where: { id: workItem.id }
        });

        if (deleted !== null) throw new Error('Work item not deleted');

        return { deleted: true };
      }),

      test('Delete test case', async () => {
        const testCase = await prisma.testCase.findFirst();
        if (!testCase) throw new Error('No test case found');

        await prisma.testCase.delete({
          where: { id: testCase.id }
        });

        // Verify it's deleted
        const deleted = await prisma.testCase.findUnique({
          where: { id: testCase.id }
        });

        if (deleted !== null) throw new Error('Test case not deleted');

        return { deleted: true };
      }),

      test('Delete product', async () => {
        const product = await prisma.product.findFirst();
        if (!product) throw new Error('No product found');

        await prisma.product.delete({
          where: { id: product.id }
        });

        // Verify it's deleted
        const deleted = await prisma.product.findUnique({
          where: { id: product.id }
        });

        if (deleted !== null) throw new Error('Product not deleted');

        return { deleted: true };
      }),

      test('Delete user', async () => {
        const user = await prisma.user.findFirst();
        if (!user) throw new Error('No user found');

        await prisma.user.delete({
          where: { id: user.id }
        });

        // Verify it's deleted
        const deleted = await prisma.user.findUnique({
          where: { id: user.id }
        });

        if (deleted !== null) throw new Error('User not deleted');

        return { deleted: true };
      }),

      test('Delete tenant', async () => {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) throw new Error('No tenant found');

        await prisma.tenant.delete({
          where: { id: tenant.id }
        });

        // Verify it's deleted
        const deleted = await prisma.tenant.findUnique({
          where: { id: tenant.id }
        });

        if (deleted !== null) throw new Error('Tenant not deleted');

        return { deleted: true };
      })
    ];

    // 5. AGGREGATION Queries
    logSection('5. AGGREGATION QUERIES');

    const aggregationTests = [
      test('Count all tenants', async () => {
        const count = await prisma.tenant.count();
        return { count };
      }),

      test('Count all users', async () => {
        const count = await prisma.user.count();
        return { count };
      }),

      test('Count work items by status', async () => {
        const completedCount = await prisma.workItem.count({
          where: { status: 'completed' }
        });

        return { completedCount };
      }),

      test('Group test cases by type', async () => {
        const testCases = await prisma.testCase.groupBy({
          by: ['type'],
          _count: {
            id: true
          }
        });

        if (!Array.isArray(testCases)) throw new Error('Invalid result');

        return { groups: testCases.length };
      })
    ];

    // Run all test suites
    const allTests = [
      ...createTests,
      ...readTests,
      ...updateTests,
      ...deleteTests,
      ...aggregationTests
    ];

    for (const testResult of allTests) {
      if (testResult.success) {
        passed++;
      } else {
        failed++;
      }
    }

    // Summary
    logSection('📊 TEST RESULTS');

    const total = passed + failed;
    const passRate = ((passed / total) * 100).toFixed(1);

    log(`Total Tests: ${total}`, 'blue');
    log(`Passed: ${passed}`, 'green');
    log(`Failed: ${failed}`, 'red');
    log(`Pass Rate: ${passRate}%`, passRate >= 80 ? 'green' : 'yellow');

    // Final cleanup
    await cleanupTestData();

    logSection('🎯 OVERALL RESULT');

    if (failed === 0) {
      log('✓ ALL DATABASE TESTS PASSED - CRUD operations working correctly!', 'green');
    } else if (failed <= 2) {
      log('⚠ MOSTLY WORKING - Minor issues detected', 'yellow');
    } else {
      log('✗ ISSUES FOUND - Review failed tests', 'red');
    }

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runTests();
#!/usr/bin/env node

/**
 * Quick Integration Test
 * Creates sample data and verifies it through both database and API
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

async function createSampleData() {
  logSection('📝 CREATING SAMPLE DATA');

  try {
    // Create a tenant
    log('Creating test organization...', 'blue');
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Demo Organization',
        slug: 'demo-org',
        subscriptionTier: 'professional',
        maxUsers: 50,
        maxProducts: 10
      }
    });
    log(`✓ Created tenant: ${tenant.name} (${tenant.slug})`, 'green');

    // Create users
    log('Creating users...', 'blue');
    const admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@demo.com',
        name: 'Admin User',
        role: 'admin',
        isActive: true
      }
    });
    log(`✓ Created admin: ${admin.name}`, 'green');

    const tester = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'tester@demo.com',
        name: 'QA Tester',
        role: 'tester',
        isActive: true
      }
    });
    log(`✓ Created tester: ${tester.name}`, 'green');

    // Create product
    log('Creating product...', 'blue');
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: 'E-Commerce Platform',
        key: 'ECOM',
        description: 'Online shopping platform',
        color: '#0066cc'
      }
    });
    log(`✓ Created product: ${product.name} (${product.key})`, 'green');

    // Create sprint
    log('Creating sprint...', 'blue');
    const now = new Date();
    const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const sprint = await prisma.sprint.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        name: 'Sprint 23',
        status: 'active',
        startDate,
        endDate,
        goal: 'Implement payment processing'
      }
    });
    log(`✓ Created sprint: ${sprint.name}`, 'green');

    // Create work items
    log('Creating work items...', 'blue');
    const story = await prisma.workItem.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        externalId: 'STORY-201',
        type: 'story',
        status: 'in_progress',
        priority: 'high',
        title: 'Payment integration',
        description: 'Integrate Stripe payment gateway',
        sprintId: sprint.id,
        storyPoints: 8,
        createdBy: admin.id
      }
    });
    log(`✓ Created story: ${story.externalId} - ${story.title}`, 'green');

    const bug = await prisma.workItem.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        externalId: 'BUG-102',
        type: 'bug',
        status: 'open',
        priority: 'critical',
        title: 'Login page crashes on Safari',
        description: 'Users report login crashes on Safari browser',
        sprintId: sprint.id,
        createdBy: tester.id
      }
    });
    log(`✓ Created bug: ${bug.externalId} - ${bug.title}`, 'green');

    // Create test cases
    log('Creating test cases...', 'blue');
    const testCase1 = await prisma.testCase.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        externalId: 'TC-301',
        name: 'Test successful payment',
        description: 'Verify user can complete payment flow',
        type: 'functional',
        status: 'active',
        priority: 'high',
        automationStatus: 'automated',
        createdBy: tester.id
      }
    });
    log(`✓ Created test case: ${testCase1.externalId} - ${testCase1.name}`, 'green');

    const testCase2 = await prisma.testCase.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        externalId: 'TC-302',
        name: 'Test payment failure handling',
        description: 'Verify proper error handling for failed payments',
        type: 'functional',
        status: 'active',
        priority: 'high',
        automationStatus: 'manual',
        createdBy: tester.id
      }
    });
    log(`✓ Created test case: ${testCase2.externalId} - ${testCase2.name}`, 'green');

    // Create test executions
    log('Creating test executions...', 'blue');
    const execution1 = await prisma.testExecution.create({
      data: {
        testCaseId: testCase1.id,
        status: 'passed',
        executedBy: tester.id,
        notes: 'Payment flow working correctly',
        duration: 120
      }
    });
    log(`✓ Created execution: ${execution1.status}`, 'green');

    const execution2 = await prisma.testExecution.create({
      data: {
        testCaseId: testCase2.id,
        status: 'failed',
        executedBy: tester.id,
        notes: 'Error message not user-friendly',
        duration: 45
      }
    });
    log(`✓ Created execution: ${execution2.status}`, 'green');

    // Create manual deliverables
    log('Creating manual deliverables...', 'blue');
    const demo = await prisma.manualDeliverable.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        type: 'demo',
        title: 'Sprint 23 Demo to Product Team',
        description: 'Demonstrated payment integration features',
        rating: 4.5,
        links: ['https://demo-recording.example.com'],
        metadata: { audience: 'product-team', attendees: 12 },
        createdBy: admin.id
      }
    });
    log(`✓ Created demo deliverable: ${demo.title}`, 'green');

    const documentation = await prisma.manualDeliverable.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        type: 'documentation',
        title: 'API Documentation Update',
        description: 'Updated payment API documentation',
        links: ['https://docs.example.com/payment-api'],
        createdBy: tester.id
      }
    });
    log(`✓ Created documentation deliverable: ${documentation.title}`, 'green');

    return {
      tenant,
      users: { admin, tester },
      product,
      sprint,
      workItems: { story, bug },
      testCases: { testCase1, testCase2 },
      executions: { execution1, execution2 },
      deliverables: { demo, documentation }
    };

  } catch (error) {
    log(`✗ Error creating sample data: ${error.message}`, 'red');
    throw error;
  }
}

async function verifyThroughDatabase() {
  logSection('🔍 VERIFYING THROUGH DATABASE');

  try {
    const tenantCount = await prisma.tenant.count();
    const userCount = await prisma.user.count();
    const productCount = await prisma.product.count();
    const workItemCount = await prisma.workItem.count();
    const testCaseCount = await prisma.testCase.count();
    const executionCount = await prisma.testExecution.count();
    const deliverableCount = await prisma.manualDeliverable.count();

    log(`✓ Tenants: ${tenantCount}`, 'green');
    log(`✓ Users: ${userCount}`, 'green');
    log(`✓ Products: ${productCount}`, 'green');
    log(`✓ Work Items: ${workItemCount}`, 'green');
    log(`✓ Test Cases: ${testCaseCount}`, 'green');
    log(`✓ Test Executions: ${executionCount}`, 'green');
    log(`✓ Manual Deliverables: ${deliverableCount}`, 'green');

    // Get detailed info
    const tenant = await prisma.tenant.findFirst({
      where: { slug: 'demo-org' },
      include: {
        products: true,
        users: true
      }
    });

    if (tenant) {
      log(`✓ Tenant: ${tenant.name}`, 'green');
      log(`  Products: ${tenant.products.length}`, 'blue');
      log(`  Users: ${tenant.users.length}`, 'blue');

      // Get work items by status
      const workItemsByStatus = await prisma.workItem.groupBy({
        by: ['status'],
        _count: { id: true },
        where: { productId: tenant.products[0].id }
      });

      log('  Work Items by Status:', 'blue');
      for (const item of workItemsByStatus) {
        log(`    ${item.status}: ${item._count.id}`, 'blue');
      }
    }

    return true;
  } catch (error) {
    log(`✗ Database verification failed: ${error.message}`, 'red');
    return false;
  }
}

async function verifyThroughAPI() {
  logSection('🌐 VERIFYING THROUGH API');

  try {
    // Test database info endpoint
    const response = await fetch('http://localhost:3001/api/v1/database-info');
    const data = await response.json();

    if (data.status === 'ok' && data.database.connected) {
      log('✓ API database connection confirmed', 'green');
      log('✓ Database records:', 'green');

      for (const [table, count] of Object.entries(data.database.tables)) {
        if (count > 0) {
          log(`  ${table}: ${count} records`, 'blue');
        }
      }
    } else {
      log('✗ API database check failed', 'red');
      return false;
    }

    return true;
  } catch (error) {
    log(`✗ API verification failed: ${error.message}`, 'red');
    return false;
  }
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

async function main() {
  try {
    console.log('\n🚀 QUALIMETRIX INTEGRATION TEST');
    console.log('Creating sample data and verifying full stack...\n');

    // Create sample data
    const data = await createSampleData();

    // Verify through database
    const dbVerified = await verifyThroughDatabase();

    // Verify through API
    const apiVerified = await verifyThroughAPI();

    // Final result
    logSection('🎯 INTEGRATION TEST RESULT');

    if (dbVerified && apiVerified) {
      log('✓ INTEGRATION TEST PASSED', 'green');
      log('✓ Database operations working correctly', 'green');
      log('✓ API endpoints responding correctly', 'green');
      log('✓ Full stack integration verified', 'green');
    } else {
      log('✗ INTEGRATION TEST FAILED', 'red');
      if (!dbVerified) log('✗ Database verification failed', 'red');
      if (!apiVerified) log('✗ API verification failed', 'red');
    }

    logSection('📊 SAMPLE DATA SUMMARY');
    log('You can now explore the data using:', 'blue');
    log('  npm run prisma:studio', 'yellow');
    log('Or test the API endpoints:', 'blue');
    log('  curl http://localhost:3001/api/v1/database-info', 'yellow');

  } catch (error) {
    log(`✗ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  process.exit(0);
}

main();
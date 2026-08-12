#!/usr/bin/env node

/**
 * QA Engineer Test Suite
 * Comprehensive testing of QualiMetrix Backend API
 * Following standard QA methodologies and best practices
 */

const BASE_URL = 'http://localhost:3001';

// Test data for validation
const testValidators = {
  isValidUUID: (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str),
  isValidEmail: (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str),
  isValidUrl: (str) => /^https?:\/\/.+/.test(str) || str === '',
  isValidEnum: (str, values) => values.includes(str),
  isValidNumber: (num, min = 0, max = Infinity) => typeof num === 'number' && num >= min && num <= max,
  isValidArray: (arr) => Array.isArray(arr),
  isValidObject: (obj) => typeof obj === 'object' && obj !== null && !Array.isArray(obj),
  isValidString: (str) => typeof str === 'string',
  isValidBoolean: (bool) => typeof bool === 'boolean',
  isValidDate: (str) => !isNaN(Date.parse(str))
};

// Test result tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  bugs: [],
  warnings: [],
  performance: []
};

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70));
}

function logSubSection(title) {
  console.log('\n' + '-'.repeat(70));
  log(title, 'blue');
  console.log('-'.repeat(70));
}

// HTTP client with timing
async function apiCall(endpoint, options = {}) {
  const startTime = Date.now();
  const url = `${BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    return {
      success: response.ok,
      status: response.status,
      duration,
      data,
      headers: response.headers
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      status: 0,
      duration,
      error: error.message,
      data: null
    };
  }
}

// Test case class
class TestCase {
  constructor(name, category, priority = 'medium') {
    this.name = name;
    this.category = category;
    this.priority = priority;
    this.steps = [];
    this.expectedResult = '';
    this.actualResult = '';
    this.status = 'pending'; // pending, passed, failed, skipped
  }

  addStep(description, action) {
    this.steps.push({ description, action });
  }

  async execute() {
    testResults.total++;
    this.status = 'in_progress';

    try {
      for (const step of this.steps) {
        const result = await step.action();
        if (!result.success) {
          this.status = 'failed';
          this.actualResult = `Failed at step: ${step.description}`;
          testResults.failed++;
          testResults.bugs.push({
            test: this.name,
            category: this.category,
            severity: this.priority === 'critical' ? 'high' : 'medium',
            description: this.actualResult,
            result
          });
          return false;
        }
      }

      this.status = 'passed';
      this.actualResult = 'All steps passed successfully';
      testResults.passed++;
      return true;
    } catch (error) {
      this.status = 'failed';
      this.actualResult = `Exception: ${error.message}`;
      testResults.failed++;
      testResults.bugs.push({
        test: this.name,
        category: this.category,
        severity: 'high',
        description: this.actualResult,
        error: error.message
      });
      return false;
    }
  }
}

// Performance monitoring
function measurePerformance(endpoint, maxDuration = 1000) {
  return async (test) => {
    const result = await apiCall(endpoint);
    testResults.performance.push({
      endpoint,
      duration: result.duration,
      status: result.duration > maxDuration ? 'slow' : 'ok',
      maxDuration
    });

    if (result.duration > maxDuration) {
      testResults.warnings.push({
        type: 'performance',
        message: `${endpoint} took ${result.duration}ms (max: ${maxDuration}ms)`
      });
    }

    return result;
  };
}

// Test suite execution
async function runTestSuite() {
  const testSuites = [];

  // ============================================================================
  // SUITE 1: API HEALTH AND CONNECTIVITY
  // ============================================================================
  const healthTests = new TestCase('API Health Check', 'Health', 'critical');
  healthTests.addStep('Server should be running', measurePerformance('/health', 100));
  healthTests.addStep('Database should be connected', async () => {
    const result = await apiCall('/health');
    if (result.success && result.data.database === 'connected') {
      return { success: true };
    }
    return { success: false, error: 'Database not connected' };
  });

  // ============================================================================
  // SUITE 2: TENANT OPERATIONS
  // ============================================================================
  const tenantCRUD = new TestCase('Tenant CRUD Operations', 'Functional', 'high');

  // READ
  tenantCRUD.addStep('Should get all tenants', async () => {
    return await apiCall('/api/v1/tenants');
  });

  tenantCRUD.addStep('Should get tenant by slug', async () => {
    return await apiCall('/api/v1/tenants/slug/demo-org');
  });

  tenantCRUD.addStep('Should get tenant statistics', async () => {
    const tenants = await apiCall('/api/v1/tenants');
    if (!tenants.success || !tenants.data?.tenants?.length) {
      return { success: false, error: 'No tenants found' };
    }
    const tenantId = tenants.data.tenants[0].id;
    return await apiCall(`/api/v1/tenants/${tenantId}/stats`);
  });

  // VALIDATION
  const tenantValidation = new TestCase('Tenant Data Validation', 'Data Quality', 'high');
  tenantValidation.addStep('Tenant data should have valid structure', async () => {
    const result = await apiCall('/api/v1/tenants');
    if (!result.success || !result.data?.tenants?.length) {
      return { success: false, error: 'No tenants to validate' };
    }

    const tenant = result.data.tenants[0];

    // Required fields validation
    const requiredFields = ['id', 'name', 'slug', 'subscriptionTier', 'createdAt'];
    const missingFields = requiredFields.filter(field => !(field in tenant));

    if (missingFields.length > 0) {
      return { success: false, error: `Missing fields: ${missingFields.join(', ')}` };
    }

    // Data type validation
    if (!testValidators.isValidUUID(tenant.id)) {
      return { success: false, error: 'Invalid UUID format for id' };
    }

    if (!testValidators.isValidString(tenant.name)) {
      return { success: false, error: 'Invalid name format' };
    }

    if (!testValidators.isValidDate(tenant.createdAt)) {
      return { success: false, error: 'Invalid createdAt date' };
    }

    return { success: true };
  });

  // ============================================================================
  // SUITE 3: USER OPERATIONS
  // ============================================================================
  const userCRUD = new TestCase('User CRUD Operations', 'Functional', 'high');

  userCRUD.addStep('Should get all users', measurePerformance('/api/v1/users', 200));
  userCRUD.addStep('Should get user by ID', async () => {
    const users = await apiCall('/api/v1/users');
    if (!users.success || !users.data.users.length) {
      return { success: false, error: 'No users found' };
    }
    const userId = users.data.users[0].id;
    return await apiCall(`/api/v1/users/${userId}`);
  });

  userCRUD.addStep('Should get user activity', async () => {
    const users = await apiCall('/api/v1/users');
    if (!users.success || !users.data.users.length) {
      return { success: false, error: 'No users found' };
    }
    const userId = users.data.users[0].id;
    return await apiCall(`/api/v1/users/${userId}/activity`);
  });

  const userValidation = new TestCase('User Data Validation', 'Data Quality', 'high');
  userValidation.addStep('User data should have valid structure', async () => {
    const result = await apiCall('/api/v1/users');
    if (!result.success || !result.data?.users?.length) {
      return { success: false, error: 'No users to validate' };
    }

    const user = result.data.users[0];

    // Required fields
    const requiredFields = ['id', 'email', 'role', 'isActive', 'createdAt'];
    const missingFields = requiredFields.filter(field => !(field in user));

    if (missingFields.length > 0) {
      return { success: false, error: `Missing fields: ${missingFields.join(', ')}` };
    }

    // Data validation
    if (!testValidators.isValidUUID(user.id)) {
      return { success: false, error: 'Invalid UUID format' };
    }

    if (!testValidators.isValidEmail(user.email)) {
      return { success: false, error: 'Invalid email format' };
    }

    if (!testValidators.isValidEnum(user.role, ['admin', 'tester', 'developer', 'product_owner', 'viewer'])) {
      return { success: false, error: `Invalid role: ${user.role}` };
    }

    if (!testValidators.isValidBoolean(user.isActive)) {
      return { success: false, error: 'Invalid isActive boolean' };
    }

    return { success: true };
  });

  // ============================================================================
  // SUITE 4: PRODUCT OPERATIONS
  // ============================================================================
  const productCRUD = new TestCase('Product CRUD Operations', 'Functional', 'high');

  productCRUD.addStep('Should get all products', measurePerformance('/api/v1/products', 200));
  productCRUD.addStep('Should get product by ID', async () => {
    const products = await apiCall('/api/v1/products');
    if (!products.success || !products.data.products.length) {
      return { success: false, error: 'No products found' };
    }
    const productId = products.data.products[0].id;
    return await apiCall(`/api/v1/products/${productId}`);
  });

  productCRUD.addStep('Should get product statistics', async () => {
    const products = await apiCall('/api/v1/products');
    if (!products.success || !products.data.products.length) {
      return { success: false, error: 'No products found' };
    }
    const productId = products.data.products[0].id;
    return await apiCall(`/api/v1/products/${productId}/stats`);
  });

  const productValidation = new TestCase('Product Data Validation', 'Data Quality', 'high');
  productValidation.addStep('Product data should have valid structure', async () => {
    const result = await apiCall('/api/v1/products');
    if (!result.success || !result.data?.products?.length) {
      return { success: false, error: 'No products to validate' };
    }

    const product = result.data.products[0];

    const requiredFields = ['id', 'tenantId', 'name', 'key', 'isActive', 'createdAt'];
    const missingFields = requiredFields.filter(field => !(field in product));

    if (missingFields.length > 0) {
      return { success: false, error: `Missing fields: ${missingFields.join(', ')}` };
    }

    if (!testValidators.isValidUUID(product.id) || !testValidators.isValidUUID(product.tenantId)) {
      return { success: false, error: 'Invalid UUID format' };
    }

    if (!testValidators.isValidString(product.name) || !testValidators.isValidString(product.key)) {
      return { success: false, error: 'Invalid name or key format' };
    }

    if (!testValidators.isValidBoolean(product.isActive)) {
      return { success: false, error: 'Invalid isActive boolean' };
    }

    return { success: true };
  });

  // ============================================================================
  // SUITE 5: WORK ITEM OPERATIONS
  // ============================================================================
  const workItemCRUD = new TestCase('Work Item CRUD Operations', 'Functional', 'high');

  workItemCRUD.addStep('Should get all work items', measurePerformance('/api/v1/work-items', 300));
  workItemCRUD.addStep('Should get work items by product', async () => {
    const products = await apiCall('/api/v1/products');
    if (!products.success || !products.data.products.length) {
      return { success: false, error: 'No products found' };
    }
    const productId = products.data.products[0].id;
    return await apiCall(`/api/v1/products/${productId}/work-items`);
  });

  workItemCRUD.addStep('Should support pagination', async () => {
    const result1 = await apiCall('/api/v1/work-items?page=1&limit=1');
    const result2 = await apiCall('/api/v1/work-items?page=2&limit=1');

    if (!result1.success || !result2.success) {
      return { success: false, error: 'Pagination failed' };
    }

    if (result1.data.workItems.length !== 1 || result2.data.workItems.length !== 1) {
      return { success: false, error: 'Pagination not working correctly' };
    }

    return { success: true };
  });

  const workItemValidation = new TestCase('Work Item Data Validation', 'Data Quality', 'high');
  workItemValidation.addStep('Work item data should have valid structure', async () => {
    const result = await apiCall('/api/v1/work-items');
    if (!result.success || !result.data?.workItems?.length) {
      return { success: false, error: 'No work items to validate' };
    }

    const workItem = result.data.workItems[0];

    const requiredFields = ['id', 'tenantId', 'productId', 'type', 'status', 'title', 'createdAt'];
    const missingFields = requiredFields.filter(field => !(field in workItem));

    if (missingFields.length > 0) {
      return { success: false, error: `Missing fields: ${missingFields.join(', ')}` };
    }

    if (!testValidators.isValidEnum(workItem.type, ['story', 'task', 'bug', 'epic'])) {
      return { success: false, error: `Invalid type: ${workItem.type}` };
    }

    if (!testValidators.isValidEnum(workItem.status, ['open', 'in_progress', 'resolved', 'closed', 'blocked'])) {
      return { success: false, error: `Invalid status: ${workItem.status}` };
    }

    return { success: true };
  });

  // ============================================================================
  // SUITE 6: TEST CASE OPERATIONS
  // ============================================================================
  const testCaseCRUD = new TestCase('Test Case CRUD Operations', 'Functional', 'high');

  testCaseCRUD.addStep('Should get all test cases', measurePerformance('/api/v1/test-cases', 300));
  testCaseCRUD.addStep('Should get test cases by product', async () => {
    const products = await apiCall('/api/v1/products');
    if (!products.success || !products.data.products.length) {
      return { success: false, error: 'No products found' };
    }
    const productId = products.data.products[0].id;
    return await apiCall(`/api/v1/products/${productId}/test-cases`);
  });

  testCaseCRUD.addStep('Should get test case with executions', async () => {
    const testCases = await apiCall('/api/v1/test-cases');
    if (!testCases.success || !testCases.data.testCases.length) {
      return { success: false, error: 'No test cases found' };
    }

    const testCaseId = testCases.data.testCases[0].id;
    return await apiCall(`/api/v1/test-cases/${testCaseId}`);
  });

  const testCaseValidation = new TestCase('Test Case Data Validation', 'Data Quality', 'high');
  testCaseValidation.addStep('Test case data should have valid structure', async () => {
    const result = await apiCall('/api/v1/test-cases');
    if (!result.success || !result.data?.testCases?.length) {
      return { success: false, error: 'No test cases to validate' };
    }

    const testCase = result.data.testCases[0];

    const requiredFields = ['id', 'tenantId', 'productId', 'name', 'type', 'status', 'createdAt'];
    const missingFields = requiredFields.filter(field => !(field in testCase));

    if (missingFields.length > 0) {
      return { success: false, error: `Missing fields: ${missingFields.join(', ')}` };
    }

    if (!testValidators.isValidEnum(testCase.type, ['functional', 'performance', 'security', ' usability'])) {
      return { success: false, error: `Invalid type: ${testCase.type}` };
    }

    return { success: true };
  });

  // ============================================================================
  // SUITE 7: ANALYTICS OPERATIONS
  // ============================================================================
  const analyticsTests = new TestCase('Analytics Operations', 'Analytics', 'high');

  analyticsTests.addStep('Should get MTTR metrics', measurePerformance('/api/v1/analytics/mttr', 500));
  analyticsTests.addStep('Should get defect leakage', measurePerformance('/api/v1/analytics/defect-leakage', 500));
  analyticsTests.addStep('Should get test metrics', measurePerformance('/api/v1/analytics/test-metrics', 500));
  analyticsTests.addStep('Should get quality dashboard', measurePerformance('/api/v1/analytics/dashboard?productId=8183d79f-7b02-49ab-9b7a-6380f6250a9b', 1000));
  analyticsTests.addStep('Should get quality trends', measurePerformance('/api/v1/analytics/trends?productId=8183d79f-7b02-49ab-9b7a-6380f6250a9b', 1000));

  const analyticsValidation = new TestCase('Analytics Data Validation', 'Data Quality', 'high');
  analyticsValidation.addStep('Analytics data should have valid structure', async () => {
    const result = await apiCall('/api/v1/analytics/test-metrics');

    if (!result.success) {
      return { success: false, error: 'Analytics call failed' };
    }

    const metrics = result.data;

    // Required fields
    const requiredFields = ['total', 'passed', 'failed', 'passRate', 'automationRate'];
    const missingFields = requiredFields.filter(field => !(field in metrics));

    if (missingFields.length > 0) {
      return { success: false, error: `Missing fields: ${missingFields.join(', ')}` };
    }

    // Data validation
    if (!testValidators.isValidNumber(metrics.total, 0)) {
      return { success: false, error: 'Invalid total count' };
    }

    if (!testValidators.isValidNumber(metrics.passRate, 0, 100)) {
      return { success: false, error: 'Invalid pass rate percentage' };
    }

    if (!testValidators.isValidNumber(metrics.automationRate, 0, 100)) {
      return { success: false, error: 'Invalid automation rate percentage' };
    }

    return { success: true };
  });

  // ============================================================================
  // SUITE 8: ERROR HANDLING AND EDGE CASES
  // ============================================================================
  const errorHandlingTests = new TestCase('Error Handling', 'Robustness', 'high');

  errorHandlingTests.addStep('Should handle 404 for non-existent endpoints', async () => {
    const result = await apiCall('/api/v1/non-existent-endpoint');
    if (result.status === 404) {
      return { success: true };
    }
    return { success: false, error: 'Expected 404, got ' + result.status };
  });

  errorHandlingTests.addStep('Should handle invalid UUID format', async () => {
    const result = await apiCall('/api/v1/tenants/invalid-uuid-format');
    if (!result.success && (result.status === 400 || result.status === 404)) {
      return { success: true };
    }
    return { success: false, error: 'Should reject invalid UUID format' };
  });

  errorHandlingTests.addStep('Should handle missing required fields in POST', async () => {
    const result = await apiCall('/api/v1/tenants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }) // Missing required 'slug' field
    });

    if (!result.success && result.status === 400) {
      return { success: true };
    }
    return { success: false, error: 'Should reject POST with missing fields' };
  });

  errorHandlingTests.addStep('Should handle pagination limits', async () => {
    // Request more than maximum limit (100)
    const result = await apiCall('/api/v1/work-items?limit=1000');
    if (result.success && result.data.pagination.limit <= 100) {
      return { success: true };
    }
    return { success: false, error: 'Should enforce pagination limits' };
  });

  // ============================================================================
  // SUITE 9: INTEGRATION TESTS
  // ============================================================================
  const integrationTests = new TestCase('Integration Tests', 'Integration', 'high');

  integrationTests.addStep('Should navigate from tenant to products', async () => {
    const tenants = await apiCall('/api/v1/tenants');
    if (!tenants.success || !tenants.data.tenants.length) {
      return { success: false, error: 'No tenants found' };
    }

    const tenantId = tenants.data.tenants[0].id;
    const products = await apiCall(`/api/v1/tenants/${tenantId}/products`);

    if (!products.success || !products.data.products.length) {
      return { success: false, error: 'No products found for tenant' };
    }

    return { success: true };
  });

  integrationTests.addStep('Should navigate from product to work items', async () => {
    const products = await apiCall('/api/v1/products');
    if (!products.success || !products.data.products.length) {
      return { success: false, error: 'No products found' };
    }

    const productId = products.data.products[0].id;
    const workItems = await apiCall(`/api/v1/products/${productId}/work-items`);

    return { success: workItems.success };
  });

  integrationTests.addStep('Should navigate from test case to executions', async () => {
    const testCases = await apiCall('/api/v1/test-cases');
    if (!testCases.success || !testCases.data.testCases.length) {
      return { success: false, error: 'No test cases found' };
    }

    const testCaseId = testCases.data.testCases[0].id;
    const executions = await apiCall(`/api/v1/test-cases/${testCaseId}/executions`);

    return { success: executions.success };
  });

  // ============================================================================
  // SUITE 10: PERFORMANCE TESTS
  // ============================================================================
  const performanceTests = new TestCase('Performance Benchmarks', 'Performance', 'medium');

  performanceTests.addStep('Health endpoint should respond in <100ms', async () => {
    const result = await apiCall('/health');
    if (result.success && result.duration < 100) {
      return { success: true };
    }
    return { success: false, error: `Health endpoint took ${result.duration}ms` };
  });

  performanceTests.addStep('List endpoints should respond in <300ms', async () => {
    const endpoints = ['/api/v1/tenants', '/api/v1/users', '/api/v1/products'];
    const results = await Promise.all(endpoints.map(ep => apiCall(ep)));

    const slowEndpoints = results.filter(r => r.duration > 300);
    if (slowEndpoints.length === 0) {
      return { success: true };
    }
    return { success: false, error: `${slowEndpoints.length} endpoints were slow` };
  });

  performanceTests.addStep('Analytics endpoints should respond in <1s', async () => {
    const endpoint = '/api/v1/analytics/test-metrics';
    const result = await apiCall(endpoint);

    if (result.success && result.duration < 1000) {
      return { success: true };
    }
    return { success: false, error: `Analytics took ${result.duration}ms` };
  });

  // ============================================================================
  // SUITE 11: CONCURRENT REQUESTS
  // ============================================================================
  const loadTests = new TestCase('Load Testing', 'Load', 'medium');

  loadTests.addStep('Should handle 10 concurrent requests', async () => {
    const requests = Array(10).fill(null).map(() =>
      apiCall('/api/v1/health')
    );

    const results = await Promise.all(requests);
    const failedRequests = results.filter(r => !r.success);

    if (failedRequests.length === 0) {
      return { success: true };
    }
    return { success: false, error: `${failedRequests.length} requests failed` };
  });

  loadTests.addStep('Should handle concurrent different endpoints', async () => {
    const endpoints = [
      '/api/v1/tenants',
      '/api/v1/users',
      '/api/v1/products',
      '/api/v1/work-items',
      '/api/v1/test-cases'
    ];

    const requests = endpoints.map(ep => apiCall(ep));
    const results = await Promise.all(requests);

    const failedRequests = results.filter(r => !r.success);
    if (failedRequests.length === 0) {
      return { success: true };
    }
    return { success: false, error: `${failedRequests.length} requests failed` };
  });

  // ============================================================================
  // COLLECT ALL TEST CASES
  // ============================================================================
  const allTests = [
    healthTests,
    tenantCRUD, tenantValidation,
    userCRUD, userValidation,
    productCRUD, productValidation,
    workItemCRUD, workItemValidation,
    testCaseCRUD, testCaseValidation,
    analyticsTests, analyticsValidation,
    errorHandlingTests,
    integrationTests,
    performanceTests,
    loadTests
  ];

  // ============================================================================
  // EXECUTE TESTS
  // ============================================================================

  console.log('\n');
  log('🧪 QUALIMETRIX BACKEND QA TEST SUITE', 'cyan');
  log('Testing API as a Quality Engineer would', 'blue');
  log('Test Environment: Development', 'yellow');
  log('Base URL: http://localhost:3001', 'yellow');
  log('Test Approach: Functional + Integration + Performance + Data Quality', 'yellow');

  for (const test of allTests) {
    logSection(`TEST: ${test.name}`);
    log(`Category: ${test.category} | Priority: ${test.priority}`, 'blue');

    await test.execute();

    if (test.status === 'passed') {
      log(`✓ PASSED: ${test.name}`, 'green');
    } else if (test.status === 'failed') {
      log(`✗ FAILED: ${test.name}`, 'red');
      log(`  Details: ${test.actualResult}`, 'yellow');
    } else {
      log(`○ SKIPPED: ${test.name}`, 'yellow');
    }
  }

  // ============================================================================
  // GENERATE TEST REPORT
  // ============================================================================
  logSection('📊 QA TEST REPORT');

  const passRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  const failRate = ((testResults.failed / testResults.total) * 100).toFixed(1);

  log(`Total Tests: ${testResults.total}`, 'blue');
  log(`Passed: ${testResults.passed}`, 'green');
  log(`Failed: ${testResults.failed}`, 'red');
  log(`Skipped: ${testResults.skipped}`, 'yellow');
  log(`Pass Rate: ${passRate}%`, passRate >= 80 ? 'green' : 'yellow');

  // Performance summary
  if (testResults.performance.length > 0) {
    logSection('⚡ PERFORMANCE SUMMARY');

    const slowEndpoints = testResults.performance.filter(p => p.status === 'slow');
    const avgDuration = testResults.performance.reduce((sum, p) => sum + p.duration, 0) / testResults.performance.length;

    log(`Average Response Time: ${Math.round(avgDuration)}ms`, 'blue');
    log(`Slow Endpoints: ${slowEndpoints.length}`, slowEndpoints.length > 0 ? 'red' : 'green');

    if (slowEndpoints.length > 0) {
      log('Slow endpoints:', 'yellow');
      slowEndpoints.forEach(ep => {
        log(`  ${ep.endpoint}: ${ep.duration}ms (max: ${ep.maxDuration}ms)`, 'yellow');
      });
    }
  }

  // Bugs found
  if (testResults.bugs.length > 0) {
    logSection('🐛 BUGS FOUND');

    testResults.bugs.forEach((bug, index) => {
      log(`${index + 1}. ${bug.test}`, 'red');
      log(`   Category: ${bug.category} | Severity: ${bug.severity}`, 'yellow');
      log(`   Description: ${bug.description}`, 'yellow');
    });
  }

  // Warnings
  if (testResults.warnings.length > 0) {
    logSection('⚠️  WARNINGS');

    testResults.warnings.forEach((warning, index) => {
      log(`${index + 1}. ${warning.type}: ${warning.message}`, 'yellow');
    });
  }

  // ============================================================================
  // FINAL VERDICT
  // ============================================================================
  logSection('🎯 QA VERDICT');

  if (testResults.failed === 0) {
    log('✓ ALL TESTS PASSED - Backend is PRODUCTION READY!', 'green');
    log('Quality Assessment: EXCELLENT', 'green');
  } else if (testResults.failed <= 2 && testResults.failed < testResults.total / 2) {
    log('⚠ MOSTLY WORKING - Minor issues detected', 'yellow');
    log('Quality Assessment: GOOD with notes', 'yellow');
    log(`Action Required: Fix ${testResults.failed} bug(s) before production`, 'yellow');
  } else {
    log('✗ SIGNIFICANT ISSUES FOUND - Not production ready', 'red');
    log('Quality Assessment: NEEDS IMPROVEMENT', 'red');
    log(`Action Required: Fix ${testResults.failed} bug(s) before production`, 'red');
  }

  // Recommendations
  logSection('📋 QA RECOMMENDATIONS');

  if (testResults.failed === 0) {
    log('✓ System is ready for production deployment', 'green');
    log('✓ All core functionality working as expected', 'green');
    log('✓ Performance within acceptable limits', 'green');
    log('✓ Data quality standards met', 'green');
  } else {
    log('✗ Review and fix identified bugs', 'red');
    log('✗ Improve error handling and validation', 'yellow');
    log('✗ Consider adding more comprehensive logging', 'yellow');
    log('✗ Review performance bottlenecks', 'yellow');
  }

  log('Next Steps: Authentication, Integration Services, Frontend Development', 'blue');

  process.exit(testResults.failed === 0 ? 0 : 1);
}

// Make sure API server is running
async function checkServerStatus() {
  try {
    const response = await fetch('http://localhost:3001/health');
    if (!response.ok) throw new Error('Server not healthy');
    return true;
  } catch (error) {
    log('❌ ERROR: API server is not running on http://localhost:3001', 'red');
    log('Please start the server first: npm run api:start', 'yellow');
    process.exit(1);
  }
}

// Run the test suite
(async () => {
  await checkServerStatus();
  await runTestSuite();
})();
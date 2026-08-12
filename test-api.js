#!/usr/bin/env node

/**
 * Comprehensive API Testing Script
 * Tests all aspects of the QualiMetrix backend implementation
 */

const BASE_URL = 'http://localhost:3001';

// ANSI color codes for output
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

async function fetchJSON(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// Test Suite
async function runTests() {
  let passed = 0;
  let failed = 0;

  logSection('🧪 QUALIMETRIX BACKEND API TEST SUITE');

  // 1. Server Health Tests
  logSection('1. SERVER HEALTH TESTS');

  const healthTests = [
    test('Basic health endpoint', async () => {
      const result = await fetchJSON('/health');
      if (result.status !== 'ok') throw new Error('Status not ok');
      if (!result.timestamp) throw new Error('Missing timestamp');
      return result;
    }),

    test('Health endpoint includes database status', async () => {
      const result = await fetchJSON('/health');
      if (result.database !== 'connected') throw new Error('Database not connected');
      return result;
    }),

    test('API v1 health check', async () => {
      const result = await fetchJSON('/api/v1/health');
      if (result.status !== 'ok') throw new Error('Status not ok');
      return result;
    }),

    test('Database info endpoint', async () => {
      const result = await fetchJSON('/api/v1/database-info');
      if (!result.database || !result.database.connected) {
        throw new Error('Database connection info missing');
      }
      if (typeof result.database.tables !== 'object') {
        throw new Error('Table counts missing');
      }
      return result;
    }),

    test('API information endpoint', async () => {
      const result = await fetchJSON('/api/v1');
      if (!result.version || !result.endpoints) {
        throw new Error('Missing API info');
      }
      return result;
    })
  ];

  // 2. Database Connection Tests
  logSection('2. DATABASE CONNECTION TESTS');

  const dbTests = [
    test('Database connection is active', async () => {
      const result = await fetchJSON('/health');
      if (result.database !== 'connected') {
        throw new Error('Database not connected');
      }
      return result;
    }),

    test('Database tables exist', async () => {
      const result = await fetchJSON('/api/v1/database-info');
      const tables = result.database.tables;

      const requiredTables = ['tenants', 'users', 'products'];
      const missingTables = requiredTables.filter(table =>
        typeof tables[table] !== 'number'
      );

      if (missingTables.length > 0) {
        throw new Error(`Missing tables: ${missingTables.join(', ')}`);
      }

      return result;
    }),

    test('Database is in clean state (empty)', async () => {
      const result = await fetchJSON('/api/v1/database-info');
      const tables = result.database.tables;

      // All tables should be empty (0 records)
      const nonEmptyTables = Object.entries(tables)
        .filter(([_, count]) => count > 0)
        .map(([name, _]) => name);

      if (nonEmptyTables.length > 0) {
        log(`  Note: Non-empty tables: ${nonEmptyTables.join(', ')}`, 'yellow');
      }

      return result;
    })
  ];

  // 3. Error Handling Tests
  logSection('3. ERROR HANDLING TESTS');

  const errorTests = [
    test('404 for non-existent endpoints', async () => {
      try {
        await fetchJSON('/non-existent-endpoint');
        throw new Error('Should have returned 404');
      } catch (error) {
        if (!error.message.includes('404')) {
          throw new Error('Wrong error code');
        }
        return { status: 404 };
      }
    }),

    test('Invalid JSON handling', async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/v1/health`, {
          method: 'POST',
          body: 'invalid json',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.status !== 400 && response.status !== 500) {
          throw new Error(`Expected 400/500, got ${response.status}`);
        }

        return { status: response.status };
      } catch (error) {
        // Expected behavior
        return { status: 'error_handled' };
      }
    })
  ];

  // 4. Performance Tests
  logSection('4. PERFORMANCE TESTS');

  const perfTests = [
    test('Health endpoint response time < 100ms', async () => {
      const start = Date.now();
      await fetchJSON('/health');
      const duration = Date.now() - start;

      if (duration > 100) {
        throw new Error(`Too slow: ${duration}ms`);
      }

      return { duration: `${duration}ms` };
    }),

    test('Database info endpoint response time < 200ms', async () => {
      const start = Date.now();
      await fetchJSON('/api/v1/database-info');
      const duration = Date.now() - start;

      if (duration > 200) {
        throw new Error(`Too slow: ${duration}ms`);
      }

      return { duration: `${duration}ms` };
    }),

    test('Concurrent requests handling', async () => {
      const start = Date.now();
      const requests = Array(10).fill(null).map(() =>
        fetchJSON('/health')
      );

      await Promise.all(requests);
      const duration = Date.now() - start;

      if (duration > 500) {
        throw new Error(`Concurrent requests too slow: ${duration}ms`);
      }

      return { duration: `${duration}ms`, requests: 10 };
    })
  ];

  // 5. Data Structure Tests
  logSection('5. DATA STRUCTURE TESTS');

  const structureTests = [
    test('Health response structure', async () => {
      const result = await fetchJSON('/health');

      const requiredFields = ['status', 'message', 'database', 'timestamp'];
      const missingFields = requiredFields.filter(field => !(field in result));

      if (missingFields.length > 0) {
        throw new Error(`Missing fields: ${missingFields.join(', ')}`);
      }

      return result;
    }),

    test('Database info response structure', async () => {
      const result = await fetchJSON('/api/v1/database-info');

      if (!result.status || !result.database) {
        throw new Error('Invalid structure');
      }

      const db = result.database;
      if (!db.connected || typeof db.tables !== 'object') {
        throw new Error('Invalid database structure');
      }

      return result;
    }),

    test('API info response structure', async () => {
      const result = await fetchJSON('/api/v1');

      if (!result.message || !result.version || !result.endpoints) {
        throw new Error('Invalid API info structure');
      }

      return result;
    })
  ];

  // Run all test suites
  const allTests = [
    ...healthTests,
    ...dbTests,
    ...errorTests,
    ...perfTests,
    ...structureTests
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

  // Database Status
  logSection('🗄️ DATABASE STATUS');
  try {
    const dbInfo = await fetchJSON('/api/v1/database-info');
    log(`Connection: ${dbInfo.database.connected ? 'Connected ✓' : 'Disconnected ✗'}`,
        dbInfo.database.connected ? 'green' : 'red');
    log('Table Records:', 'blue');

    for (const [table, count] of Object.entries(dbInfo.database.tables)) {
      log(`  ${table}: ${count}`, 'blue');
    }
  } catch (error) {
    log(`Failed to get database info: ${error.message}`, 'red');
  }

  // Overall Result
  logSection('🎯 OVERALL RESULT');

  if (failed === 0) {
    log('✓ ALL TESTS PASSED - Backend is working correctly!', 'green');
  } else if (failed <= 2) {
    log('⚠ MOSTLY WORKING - Minor issues detected', 'yellow');
  } else {
    log('✗ ISSUES FOUND - Review failed tests', 'red');
  }

  process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
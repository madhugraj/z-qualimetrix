/**
 * GitHub Integration Test Script
 * Tests the GitHub API integration endpoints
 */

const BASE_URL = 'http://localhost:3001/api/v1/github';

// Test repository (using a popular open source repository for testing)
const TEST_OWNER = 'facebook';
const TEST_REPO = 'react';

async function testGitHubIntegration() {
  console.log('🧪 Testing GitHub Integration...\n');

  const tests = [
    {
      name: 'Token Status Check',
      url: `${BASE_URL}/token-status`,
      method: 'GET'
    },
    {
      name: 'Repository Info',
      url: `${BASE_URL}/${TEST_OWNER}/${TEST_REPO}/repository`,
      method: 'GET'
    },
    {
      name: 'Recent Commits',
      url: `${BASE_URL}/${TEST_OWNER}/${TEST_REPO}/commits?limit=5`,
      method: 'GET'
    },
    {
      name: 'Issues',
      url: `${BASE_URL}/${TEST_OWNER}/${TEST_REPO}/issues?state=open&limit=10`,
      method: 'GET'
    },
    {
      name: 'Pull Requests',
      url: `${BASE_URL}/${TEST_OWNER}/${TEST_REPO}/pull-requests?state=open&limit=10`,
      method: 'GET'
    },
    {
      name: 'Branches',
      url: `${BASE_URL}/${TEST_OWNER}/${TEST_REPO}/branches`,
      method: 'GET'
    },
    {
      name: 'Workflows',
      url: `${BASE_URL}/${TEST_OWNER}/${TEST_REPO}/workflows?limit=5`,
      method: 'GET'
    },
    {
      name: 'Complete Project Status',
      url: `${BASE_URL}/${TEST_OWNER}/${TEST_REPO}/status`,
      method: 'GET'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`\n🔍 Testing: ${test.name}`);
      console.log(`   URL: ${test.url}`);

      const response = await fetch(test.url, {
        method: test.method,
        headers: {
          'Accept': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`   ✅ PASS - Status: ${response.status}`);
        console.log(`   Response: ${JSON.stringify(data).substring(0, 100)}...`);
        passed++;
      } else {
        console.log(`   ❌ FAIL - Status: ${response.status}`);
        console.log(`   Error: ${JSON.stringify(data)}`);
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ FAIL - Exception: ${error.message}`);
      failed++;
    }
  }

  console.log('\n\n📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n💡 Tips:');
    console.log('   1. Make sure the API server is running: npm run api:dev');
    console.log('   2. Set up your GITHUB_TOKEN in .env file for full functionality');
    console.log('   3. Some endpoints may work without token, but rate limits apply');
  }
}

// Run tests
testGitHubIntegration().catch(console.error);
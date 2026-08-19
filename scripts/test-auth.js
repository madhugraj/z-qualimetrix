/**
 * Simple JavaScript test for authentication - load this in browser console
 * Run this while on http://localhost:8086/login
 */

const API_BASE = 'http://localhost:3001/api/v1';

async function testLogin() {
  console.log('🧪 Testing authentication...');

  try {
    // Test 1: Health check
    console.log('1️⃣ Testing API health...');
    const health = await fetch('http://localhost:3001/health');
    const healthData = await health.json();
    console.log('✅ Health check:', healthData);

    // Test 2: Login attempt
    console.log('2️⃣ Testing login...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: 'admin@demo.com',
        password: 'admin123'
      })
    });

    console.log('Login response status:', loginResponse.status);
    const loginData = await loginResponse.json();
    console.log('Login response data:', loginData);

    if (loginData.success) {
      console.log('✅ Login successful!');
      console.log('👤 User:', loginData.user);

      // Test 3: Protected endpoint
      console.log('3️⃣ Testing protected endpoint...');
      const meResponse = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include'
      });
      const meData = await meResponse.json();
      console.log('✅ Protected endpoint works:', meData);

    } else {
      console.error('❌ Login failed:', loginData.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
console.log('🚀 Starting authentication test...');
console.log('Make sure you are on http://localhost:8086');
testLogin();
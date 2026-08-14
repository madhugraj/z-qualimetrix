/**
 * Test Script: Real Claude API Integration with AI Usage Tracking
 *
 * This script demonstrates how to:
 * 1. Call Claude API with your real credentials
 * 2. Track token usage automatically
 * 3. Send events to your analytics system
 * 4. View results in the dashboard
 */

import Anthropic from '@anthropic-ai/sdk';

// Configuration
const API_BASE_URL = 'http://localhost:3001/api/v1';
const ANALYTICS_USER_ID = '1f9c1029-80ed-48ef-8892-c9aa06092640'; // Admin user from database

async function testClaudeWithTracking() {
  console.log('🚀 Testing Real Claude API with AI Usage Tracking...\n');

  // 1. Get Claude API key from environment
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not found in environment');
    console.log('💡 Add it to your .env file: ANTHROPIC_API_KEY=sk-ant-...');
    return;
  }

  console.log('✅ Claude API key found');
  console.log('📞 Making test call to Claude...\n');

  try {
    // 2. Make real Claude API call
    const anthropic = new Anthropic({ apiKey });

    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: "Explain quantum computing in one sentence."
      }]
    });
    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    console.log('✅ Claude API call successful!');
    console.log(`📊 Response: ${message.content[0].type === 'text' ? message.content[0].text.slice(0, 100) + '...' : 'N/A'}`);
    console.log(`⏱️  Latency: ${latencyMs}ms`);

    // 3. Extract usage data from Claude response
    const usage = message.usage;
    const aiUsageEvent = {
      userId: ANALYTICS_USER_ID,
      modelId: 'claude-sonnet',
      activity: 'docs', // Document generation
      tokensIn: usage.input_tokens,
      tokensOut: usage.output_tokens,
      cachedIn: usage.cache_read_input_tokens || 0,
      latencyMs: latencyMs,
      accepted: true, // Assume user accepted the response
      reworked: false, // Assume no rework needed
    };

    console.log('\n📈 AI Usage Event:');
    console.log(`   Input Tokens: ${aiUsageEvent.tokensIn}`);
    console.log(`   Output Tokens: ${aiUsageEvent.tokensOut}`);
    console.log(`   Cached Tokens: ${aiUsageEvent.cachedIn}`);
    console.log(`   Total Cost: ~$${((usage.input_tokens + usage.output_tokens) / 1000 * 0.003).toFixed(4)}`);

    // 4. Send event to your analytics system
    console.log('\n📡 Sending event to analytics system...');

    const response = await fetch(`${API_BASE_URL}/public/ai-usage/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([aiUsageEvent])
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Event successfully tracked!');
      console.log(`   Total events in system: ${result.total}`);

      console.log('\n🎉 Testing Complete!');
      console.log('📊 View your analytics at: http://localhost:8086/ai-usage');
      console.log(`   Use visibility: "self"`);
      console.log(`   User ID: ${ANALYTICS_USER_ID}`);
    } else {
      console.error('❌ Failed to track event:', await response.text());
    }

  } catch (error) {
    console.error('❌ Test failed:', error);

    if (error instanceof Error) {
      if (error.message.includes('401')) {
        console.log('💡 Check your ANTHROPIC_API_KEY is valid');
      } else if (error.message.includes('429')) {
        console.log('💡 Rate limited - wait a moment before trying again');
      }
    }
  }
}

// Test different activity types
async function testMultipleActivities() {
  console.log('\n🔄 Testing Multiple Activity Types...\n');

  const activities = [
    { type: 'code', prompt: 'Write a Python function to calculate fibonacci numbers' },
    { type: 'tests', prompt: 'Generate unit tests for a fibonacci function' },
    { type: 'review', prompt: 'Review this code for potential bugs: def fib(n): return n if n <= 1 else fib(n-1) + fib(n-2)' },
    { type: 'docs', prompt: 'Explain how fibonacci sequences work in mathematics' }
  ];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not found');
    return;
  }

  const anthropic = new Anthropic({ apiKey });

  for (const activity of activities) {
    try {
      console.log(`Testing ${activity.type} activity...`);

      const startTime = Date.now();
      const message = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 512,
        messages: [{ role: "user", content: activity.prompt }]
      });
      const latencyMs = Date.now() - startTime;

      const usage = message.usage;
      const event = {
        userId: ANALYTICS_USER_ID,
        modelId: 'claude-sonnet',
        activity: activity.type,
        tokensIn: usage.input_tokens,
        tokensOut: usage.output_tokens,
        cachedIn: usage.cache_read_input_tokens || 0,
        latencyMs: latencyMs,
        accepted: true,
        reworked: Math.random() > 0.8, // Random rework for testing
      };

      await fetch(`${API_BASE_URL}/public/ai-usage/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([event])
      });

      console.log(`✅ ${activity.type}: ${usage.input_tokens + usage.output_tokens} tokens`);

    } catch (error) {
      console.error(`❌ ${activity.type} failed:`, error);
    }
  }

  console.log('\n📊 All activities tracked! Check your dashboard.');
}

// Main test runner
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'single';

  if (mode === 'multiple') {
    await testMultipleActivities();
  } else {
    await testClaudeWithTracking();
  }
}

// Run tests
main().catch(console.error);
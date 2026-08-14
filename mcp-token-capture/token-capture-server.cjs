#!/usr/bin/env node

/**
 * QualiMetrix Real-Time Token Capture Proxy
 *
 * This proxy server intercepts AI API calls and captures token usage data
 * Run with: node token-capture-server.js
 * Then set: export HTTP_PROXY=http://localhost:8080
 */

const http = require('http');
const https = require('https');
const url = require('url');

const QUALIMETRIX_API = 'http://localhost:3001/api/v1/public/ai-usage/events';
const PROXY_PORT = 8888; // Changed from 8080 to avoid conflicts
const DEFAULT_USER_ID = '3bdee509-9f96-425c-8305-d34ab63803fc';

// AI API endpoints to intercept
const AI_ENDPOINTS = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com'
];

console.log('🚀 Starting QualiMetrix Token Capture Proxy...');
console.log(`📡 Proxy listening on port ${PROXY_PORT}`);
console.log(`📊 Sending token data to: ${QUALIMETRIX_API}`);
console.log(`🎯 Intercepting: ${AI_ENDPOINTS.join(', ')}`);

// Create proxy server
const proxy = http.createServer((clientReq, clientRes) => {
  const reqUrl = url.parse(clientReq.url);
  const hostname = reqUrl.hostname;

  console.log(`\n📨 Request: ${clientReq.method} ${hostname}${reqUrl.path}`);

  // Check if this is an AI API call we want to intercept
  if (AI_ENDPOINTS.some(endpoint => hostname.includes(endpoint))) {
    interceptAIRequest(clientReq, clientRes, reqUrl);
  } else {
    // Pass through non-AI requests
    proxyRequest(clientReq, clientRes, reqUrl);
  }
});

/**
 * Intercept AI API request and capture token data
 */
function interceptAIRequest(clientReq, clientRes, reqUrl) {
  console.log('🎯 Intercepting AI API call...');

  let requestBody = [];
  clientReq.on('data', chunk => requestBody.push(chunk));
  clientReq.on('end', () => {
    const body = Buffer.concat(requestBody).toString();

    // Detect AI provider and model
    const provider = detectProvider(reqUrl.hostname);
    const startTime = Date.now();

    // Forward to real API
    proxyToRealAPI(clientReq.method, reqUrl, body, clientReq.headers)
      .then(realResponse => {
        const endTime = Date.now();
        const latencyMs = endTime - startTime;

        console.log(`✅ ${provider} API responded in ${latencyMs}ms`);

        // Extract token data
        const tokenData = extractTokenData(realResponse.body, provider, latencyMs);

        if (tokenData) {
          console.log(`📊 Token Data: In=${tokenData.tokensIn}, Out=${tokenData.tokensOut}, Cached=${tokenData.cachedIn}`);

          // Send to QualiMetrix
          sendToQualiMetrix(tokenData);
        }

        // Return response to client
        clientRes.writeHead(realResponse.statusCode, realResponse.headers);
        clientRes.end(realResponse.body);
      })
      .catch(error => {
        console.error('❌ Proxy error:', error);
        clientRes.writeHead(500);
        clientRes.end('Proxy error');
      });
  });
}

/**
 * Forward request to real API
 */
function proxyToRealAPI(method, reqUrl, body, headers) {
  return new Promise((resolve, reject) => {
    const protocol = reqUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: reqUrl.hostname,
      port: reqUrl.port || (reqUrl.protocol === 'https:' ? 443 : 80),
      path: reqUrl.path,
      method: method,
      headers: {
        ...headers,
        host: reqUrl.hostname
      }
    };

    const req = protocol.request(options, (res) => {
      let responseBody = [];
      res.on('data', chunk => responseBody.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(responseBody).toString()
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Detect AI provider from hostname
 */
function detectProvider(hostname) {
  if (hostname.includes('anthropic')) return 'claude';
  if (hostname.includes('openai')) return 'openai';
  if (hostname.includes('google')) return 'gemini';
  return 'unknown';
}

/**
 * Extract token data from API response
 */
function extractTokenData(responseBody, provider, latencyMs) {
  try {
    const response = JSON.parse(responseBody);

    if (provider === 'claude') {
      // Claude API format
      if (response.usage) {
        return {
          userId: DEFAULT_USER_ID,
          modelId: 'claude-sonnet',
          activity: detectActivity(response),
          tokensIn: response.usage.input_tokens,
          tokensOut: response.usage.output_tokens,
          cachedIn: response.usage.cache_read_input_tokens || 0,
          latencyMs: latencyMs,
          accepted: true,
          reworked: false
        };
      }
    }

    if (provider === 'openai') {
      // OpenAI API format
      if (response.usage) {
        return {
          userId: DEFAULT_USER_ID,
          modelId: 'gpt-4',
          activity: detectActivity(response),
          tokensIn: response.usage.prompt_tokens,
          tokensOut: response.usage.completion_tokens,
          cachedIn: response.usage.prompt_tokens_details?.cached_tokens || 0,
          latencyMs: latencyMs,
          accepted: true,
          reworked: false
        };
      }
    }

    if (provider === 'gemini') {
      // Gemini API format
      if (response.usageMetadata) {
        return {
          userId: DEFAULT_USER_ID,
          modelId: 'gemini-pro',
          activity: detectActivity(response),
          tokensIn: response.usageMetadata.promptTokenCount || response.usageMetadata.totalTokenCount,
          tokensOut: response.usageMetadata.candidatesTokenCount || 0,
          cachedIn: 0,
          latencyMs: latencyMs,
          accepted: true,
          reworked: false
        };
      }
    }

  } catch (error) {
    console.error('❌ Error parsing response:', error.message);
  }

  return null;
}

/**
 * Detect activity type from response
 */
function detectActivity(response) {
  const content = JSON.stringify(response).toLowerCase();

  if (content.includes('test') || content.includes('spec')) return 'tests';
  if (content.includes('doc') || content.includes('readme')) return 'docs';
  if (content.includes('review') || content.includes('bug')) return 'review';
  return 'code';
}

/**
 * Send token data to QualiMetrix
 */
async function sendToQualiMetrix(tokenData) {
  if (!tokenData) return;

  try {
    console.log('📡 Sending token data to QualiMetrix...');

    const response = await fetch(QUALIMETRIX_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([tokenData])
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Token data captured! Total events: ${result.total}`);
    } else {
      console.error('❌ QualiMetrix API error:', await response.text());
    }
  } catch (error) {
    console.error('❌ Error sending to QualiMetrix:', error.message);
  }
}

/**
 * Pass through non-AI requests
 */
function proxyRequest(clientReq, clientRes, reqUrl) {
  proxyToRealAPI(clientReq.method, reqUrl, null, clientReq.headers)
    .then(realResponse => {
      clientRes.writeHead(realResponse.statusCode, realResponse.headers);
      clientRes.end(realResponse.body);
    })
    .catch(error => {
      console.error('❌ Proxy error:', error);
      clientRes.writeHead(500);
      clientRes.end('Proxy error');
    });
}

// Start proxy server
proxy.listen(PROXY_PORT, () => {
  console.log(`\n🎯 Proxy server ready!`);
  console.log(`\n📋 SETUP INSTRUCTIONS:`);
  console.log(`1. Set proxy environment variables:`);
  console.log(`   export HTTP_PROXY=http://localhost:${PROXY_PORT}`);
  console.log(`   export HTTPS_PROXY=http://localhost:${PROXY_PORT}`);
  console.log(`\n2. Make AI API calls - they will be automatically captured!`);
  console.log(`\n3. Check QualiMetrix dashboard: http://localhost:8086/ai-usage`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down proxy server...');
  proxy.close(() => {
    console.log('✅ Proxy server stopped');
    process.exit(0);
  });
});
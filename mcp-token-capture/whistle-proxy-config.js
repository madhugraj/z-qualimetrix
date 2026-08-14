/**
 * Whistle MCP Server Configuration for Real-Time Token Capture
 *
 * This configuration sets up a local proxy that intercepts AI API calls,
 * extracts token usage data, and forwards it to QualiMetrix analytics.
 */

const QUALIMETRIX_API_URL = 'http://localhost:3001/api/v1/public/ai-usage/events';
const DEFAULT_USER_ID = '3bdee509-9f96-425c-8305-d34ab63803fc'; // Would be dynamic in production

module.exports = {
  port: 8080,
  rules: [
    // Claude API Interception
    {
      pattern: 'api.anthropic.com/v1/messages',
      handler: async (req, res) => {
        console.log('🎯 Intercepting Claude API call...');

        const startTime = Date.now();

        // Forward to real Claude API
        const realResponse = await proxyToRealAPI(req, 'https://api.anthropic.com/v1/messages');

        const endTime = Date.now();
        const latencyMs = endTime - startTime;

        // Extract token data from Claude response
        const tokenData = extractTokenData(realResponse, 'claude-sonnet', latencyMs);

        // Send to QualiMetrix
        await sendToQualiMetrix(tokenData);

        // Return original response to client
        res.status(realResponse.status);
        res.set(realResponse.headers);
        res.end(realResponse.body);
      }
    },

    // OpenAI API Interception
    {
      pattern: 'api.openai.com/v1/chat/completions',
      handler: async (req, res) => {
        console.log('🎯 Intercepting OpenAI API call...');

        const startTime = Date.now();
        const realResponse = await proxyToRealAPI(req, 'https://api.openai.com/v1/chat/completions');
        const latencyMs = Date.now() - startTime;

        const tokenData = extractTokenData(realResponse, 'gpt-4', latencyMs);
        await sendToQualiMetrix(tokenData);

        res.status(realResponse.status);
        res.set(realResponse.headers);
        res.end(realResponse.body);
      }
    },

    // Google Gemini API Interception
    {
      pattern: 'generativelanguage.googleapis.com/v1/models/*',
      handler: async (req, res) => {
        console.log('🎯 Intercepting Gemini API call...');

        const startTime = Date.now();
        const realResponse = await proxyToRealAPI(req, req.url);
        const latencyMs = Date.now() - startTime;

        const tokenData = extractTokenData(realResponse, 'gemini', latencyMs);
        await sendToQualiMetrix(tokenData);

        res.status(realResponse.status);
        res.set(realResponse.headers);
        res.end(realResponse.body);
      }
    }
  ]
};

/**
 * Proxy request to real AI API
 */
async function proxyToRealAPI(req, targetUrl) {
  const https = require('https');
  const http = require('http');

  return new Promise((resolve, reject) => {
    const protocol = targetUrl.startsWith('https') ? https : http;

    const options = {
      hostname: new URL(targetUrl).hostname,
      path: new URL(targetUrl).pathname + new URL(targetUrl).search,
      method: req.method,
      headers: {
        ...req.headers,
        host: new URL(targetUrl).hostname,
        'Content-Type': 'application/json'
      }
    };

    const proxyReq = protocol.request(options, (proxyRes) => {
      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        resolve({
          status: proxyRes.statusCode,
          headers: proxyRes.headers,
          body: body
        });
      });
    });

    proxyReq.on('error', reject);
    proxyReq.write(req.body);
    proxyReq.end();
  });
}

/**
 * Extract token data from AI API response
 */
function extractTokenData(response, modelId, latencyMs) {
  try {
    const body = JSON.parse(response.body);

    // Claude API format
    if (body.usage && body.usage.input_tokens) {
      return {
        userId: DEFAULT_USER_ID, // In production, this would come from authentication
        modelId: modelId,
        activity: detectActivity(body),
        tokensIn: body.usage.input_tokens,
        tokensOut: body.usage.output_tokens,
        cachedIn: body.usage.cache_read_input_tokens || 0,
        latencyMs: latencyMs,
        accepted: true, // Would prompt user in real implementation
        reworked: false,
        timestamp: new Date().toISOString()
      };
    }

    // OpenAI API format
    if (body.usage && body.usage.prompt_tokens) {
      return {
        userId: DEFAULT_USER_ID,
        modelId: modelId,
        activity: detectActivity(body),
        tokensIn: body.usage.prompt_tokens,
        tokensOut: body.usage.completion_tokens,
        cachedIn: body.usage.prompt_tokens_details?.cached_tokens || 0,
        latencyMs: latencyMs,
        accepted: true,
        reworked: false,
        timestamp: new Date().toISOString()
      };
    }

    // Gemini API format
    if (body.usageMetadata) {
      return {
        userId: DEFAULT_USER_ID,
        modelId: modelId,
        activity: detectActivity(body),
        tokensIn: body.usageMetadata.promptTokenCount || body.usageMetadata.totalTokenCount,
        tokensOut: body.usageMetadata.candidatesTokenCount || 0,
        cachedIn: 0, // Gemini doesn't provide cache data
        latencyMs: latencyMs,
        accepted: true,
        reworked: false,
        timestamp: new Date().toISOString()
      };
    }

  } catch (error) {
    console.error('Error extracting token data:', error);
    return null;
  }
}

/**
 * Detect activity type from request content
 */
function detectActivity(responseBody) {
  // Simple heuristics - could be enhanced with ML
  const content = JSON.stringify(responseBody).toLowerCase();

  if (content.includes('test') || content.includes('spec')) return 'tests';
  if (content.includes('doc') || content.includes('readme')) return 'docs';
  if (content.includes('review') || content.includes('bug')) return 'review';
  return 'code'; // default
}

/**
 * Send token data to QualiMetrix
 */
async function sendToQualiMetrix(tokenData) {
  if (!tokenData) return;

  try {
    const response = await fetch(QUALIMETRIX_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([tokenData])
    });

    if (response.ok) {
      console.log('✅ Token data sent to QualiMetrix:', {
        tokensIn: tokenData.tokensIn,
        tokensOut: tokenData.tokensOut,
        modelId: tokenData.modelId
      });
    } else {
      console.error('❌ Failed to send token data:', await response.text());
    }
  } catch (error) {
    console.error('❌ Error sending token data:', error);
  }
}

console.log('🚀 QualiMetrix Token Capture Proxy loaded!');
console.log(`📡 Listening on port 8080, forwarding to ${QUALIMETRIX_API_URL}`);
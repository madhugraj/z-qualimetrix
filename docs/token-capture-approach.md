# Real-Time Token Capture Using MCP Servers

## Architecture: MCP-based Token Collection

### Option 1: Whistle MCP Server (Local Proxy)
```
Developer's IDE 
    ↓
Whistle MCP Server (Local Proxy on :8080)
    ↓ 
Intercepts: api.anthropic.com calls
    ↓
Extracts: response.usage.input_tokens, output_tokens
    ↓
Forwards to: QualiMetrix /api/v1/public/ai-usage/events
```

### Option 2: HTTP Toolkit MCP Server (Network Inspection)
```
Developer Machine
    ↓
HTTP Toolkit MCP (Network Inspector)
    ↓
Captures all HTTPS traffic to AI providers
    ↓
Parses response JSON for token counts
    ↓
Sends to QualiMetrix analytics backend
```

## Implementation Approach

### Step 1: Install Whistle MCP Server
```bash
npm install -g @whistle/mcp-server
# or HTTP Toolkit MCP
npm install -g httptoolkit-mcp-server
```

### Step 2: Configure Proxy Rules
```javascript
// whistle-mcp-config.js
module.exports = {
  rules: [
    {
      pattern: 'api.anthropic.com/*',
      handler: (req, res) => {
        // Capture request
        const originalRequest = req;
        
        // Forward to real API
        const realResponse = await proxyToAnthropic(req);
        
        // Extract token data
        const tokenData = {
          tokensIn: realResponse.usage?.input_tokens,
          tokensOut: realResponse.usage?.output_tokens,
          cachedIn: realResponse.usage?.cache_read_input_tokens || 0
        };
        
        // Send to QualiMetrix
        await fetch('http://localhost:3001/api/v1/public/ai-usage/events', {
          method: 'POST',
          body: JSON.stringify([tokenData])
        });
        
        return realResponse;
      }
    }
  ]
};
```

### Step 3: Developer Setup
```bash
# Developers set their IDE/proxy to use MCP server
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080

# Claude API calls automatically routed through proxy
# Token data automatically captured and sent to QualiMetrix
```

## Advantages of MCP Approach

✅ **No IDE Plugin Development** - Works with any tool that uses HTTP
✅ **Centralized Collection** - All AI traffic captured automatically
✅ **Enterprise Ready** - Can be deployed at network level
✅ **Provider Agnostic** - Works with Claude, OpenAI, Gemini, etc.
✅ **Real-Time Capture** - Token data captured as it happens

## Next Steps

1. **Install and configure Whistle MCP Server**
2. **Set up proxy rules for AI API endpoints**
3. **Test with real Claude API calls**
4. **Deploy to development team**
5. **Scale to enterprise deployment**
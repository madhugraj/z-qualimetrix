# GitHub Integration Guide - Complete Setup

I've built a comprehensive GitHub integration system with **database token storage** for you! Here's how everything works:

## 🎯 **What You Now Have**

### 1. **Database Schema** ✅
- **GitHubIntegration Table**: Stores encrypted GitHub tokens
- **Fields**: `encryptedToken`, `githubUsername`, `tokenType`, `lastValidated`, `lastUsed`
- **Security**: AES-256-GCM encryption for all tokens
- **Migration**: Applied to your PostgreSQL database

### 2. **API Endpoints** ✅
- **POST** `/api/v1/github-token/validate` - Validate GitHub tokens
- **POST** `/api/v1/github-token/tokens` - Save encrypted tokens to database
- **GET** `/api/v1/github-token/status/:tenantId` - Get connection status
- **GET** `/api/v1/github-token/test/:tenantId` - Test stored tokens
- **DELETE** `/api/v1/github-token/tokens/:tenantId` - Remove tokens

### 3. **Encryption Service** ✅
- **File**: `src/lib/encryption.ts`
- **Method**: AES-256-GCM with authenticated encryption
- **Key**: PBKDF2-derived from `ENCRYPTION_KEY` in `.env`
- **Functions**: `encrypt()`, `decrypt()`, `hashToken()`, `maskToken()`

### 4. **UI Components** ✅
- **Settings Page**: GitHub configuration UI with database storage
- **Integrations Page**: Shows GitHub connection status from database
- **GitInsights Component**: Live repository analytics with database tokens

## 🚀 **How to Use It**

### **Step 1: Get a GitHub Token**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Name it "QualiMetrix"
4. Select scopes: ✅ `repo` and ✅ `read:org`
5. Click "Generate token" and **copy it immediately**

### **Step 2: Configure in Settings**
1. Go to **http://localhost:8083/settings**
2. Click the **"Integrations"** tab
3. Paste your GitHub token
4. Click **"Test"** - you'll see ✅ "Connected as [your username]"
5. Select a repository and click **"Save"**

### **Step 3: Token Storage**
Your token is now:
- ✅ **Encrypted** with AES-256-GCM
- ✅ **Stored** in PostgreSQL database
- ✅ **Backed up** in localStorage for client-side API calls
- ✅ **Persisted** across browser sessions

### **Step 4: Use GitInsights**
1. Go to **http://localhost:8083/integrations**
2. GitHub card shows **"Connected"** with your username
3. Enter any repository (like `facebook/react`)
4. See live analytics: PRs, commits, issues, CI/CD status

## 🔒 **Security Features**

### **Database Storage**
```sql
CREATE TABLE github_integrations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  encrypted_token TEXT NOT NULL,  -- AES-256-GCM encrypted
  github_username VARCHAR(255),
  token_type VARCHAR(50),
  last_validated TIMESTAMPTZ,
  last_used TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);
```

### **Encryption Process**
1. **Token received** from user
2. **Validated** with GitHub API
3. **Encrypted** using AES-256-GCM
4. **Stored** in PostgreSQL database
5. **Decrypted** only when needed for API calls
6. **Never exposed** in logs or responses

## 🎨 **UI Improvements**

### **Settings → Integrations Tab**
- **Token Input**: Secure password field
- **Validation**: Shows GitHub username when connected
- **Repository Loading**: Loads your actual repositories
- **Save Confirmation**: Success message with username

### **Integrations Page**
- **GitHub Status**: Shows connection status from database
- **Username Display**: Shows which GitHub account is connected
- **Real-time Updates**: Checks both localStorage and database
- **Configure Link**: Easy access to settings

## 🛠️ **Backend Services**

### **GitHub Token Service** (`src/api/services/github-token.service.ts`)
- **saveToken()**: Encrypt and save to database
- **getToken()**: Retrieve and decrypt from database
- **getStatus()**: Get connection status (without exposing token)
- **validateToken()**: Test token with GitHub API
- **deleteToken()**: Remove from database

### **Encryption Service** (`src/lib/encryption.ts`)
- **encrypt()**: Encrypt sensitive data
- **decrypt()**: Decrypt encrypted data
- **hashToken()**: Hash tokens for comparison
- **maskToken()**: Mask tokens for display (e.g., `ghp_****1234`)

## 📊 **Database Integration**

### **Migration Applied**
```bash
✅ Migration: 20260811080151_add_github_integration
✅ Table: github_integrations
✅ Prisma Client: Generated
```

### **Usage in Code**
```typescript
// Save token
const result = await githubTokenService.saveToken({
  tenantId: 'default-tenant',
  token: 'ghp_your_token_here',
  userId: 'user-id'
});

// Get connection status
const status = await githubTokenService.getStatus('default-tenant');

// Retrieve token (when needed)
const token = await githubTokenService.getToken('default-tenant');
```

## 🧪 **Testing the Integration**

### **Test Database Storage**
```bash
# Save token to database
curl -X POST "http://localhost:3001/api/v1/github-token/tokens" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "ghp_your_token_here",
    "tenantId": "default-tenant",
    "userId": "test-user"
  }'

# Check status
curl "http://localhost:3001/api/v1/github-token/status/default-tenant"
```

### **Test UI Flow**
1. **Open**: http://localhost:8083/settings → "Integrations" tab
2. **Add**: GitHub token and click "Test"
3. **Verify**: See "Connected as [username]" message
4. **Save**: Click "Save" to store in database
5. **Check**: Go to /integrations page - GitHub shows "Connected"

## 💾 **Token Persistence**

### **Storage Locations**
1. **Database**: Primary, encrypted storage
2. **localStorage**: Backup for client-side API calls
3. **Session Memory**: Active token for API requests

### **Retrieval Order**
1. Check database for stored token
2. Fallback to localStorage
3. Use environment variable as final fallback

## 🎯 **Next Steps**

### **Production Deployment**
1. **Generate Secure Encryption Key**:
   ```bash
   openssl rand -base64 32
   ```
2. **Update `.env`**: Set `ENCRYPTION_KEY` to generated value
3. **Configure GitHub OAuth** (optional): Replace PATs with OAuth flow
4. **Add User Authentication**: Map tokens to actual users
5. **Implement Token Rotation**: Regular token updates

### **Multi-Tenant Support**
- Each tenant has their own GitHub integration
- Tokens isolated by tenant_id
- Separate rate limits per tenant
- Individual connection status

## 🔧 **Troubleshooting**

### **Token Not Saving to Database**
- Check PostgreSQL is running
- Verify `ENCRYPTION_KEY` is set in `.env`
- Check API server logs for errors

### **GitHub Connection Fails**
- Verify token has correct scopes (`repo`, `read:org`)
- Check token hasn't expired or been revoked
- Test token with: `curl -H "Authorization: Bearer TOKEN" https://api.github.com/user`

### **UI Not Showing Connection**
- Clear browser localStorage
- Check browser console for errors
- Verify API server is running
- Check database has token stored

**Your GitHub integration is now complete with secure database storage!** 🎉
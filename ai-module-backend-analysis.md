# 🔍 AI Usage Module - Backend Integration Requirements

## Executive Summary
The new AI Usage UI represents a comprehensive AI/LLM analytics and cost management system that requires substantial backend infrastructure. This module tracks **token consumption, costs, efficiency metrics, and ROI** for multiple AI models across an organization with **role-based visibility** and **budget management**.

---

## 🎯 Frontend Feature Analysis

### **Core Features Identified**
1. **Role-Based Visibility** (4 levels): self, team, org, finance
2. **Multi-Model Analytics**: Claude, Codex, Gemini, In-house models
3. **Budget Management**: Sprint caps, pacing, forecasting
4. **Per-Person Analytics**: Usage, efficiency, rework rates
5. **Trend Analysis**: Sprint-over-sprint token/cost tracking
6. **Activity Breakdown**: Code, tests, docs, review/RCA
7. **Model Efficiency**: Acceptance rates vs cost analysis

### **UI Components Analysis**
- **KPI Cards**: Role-specific metrics with trends
- **Spend Charts**: Stacked bar charts by model per sprint
- **Token Charts**: Input/output trends with caching ratios
- **Activity Donuts**: Token distribution by activity type
- **Efficiency Charts**: Acceptance rate vs cost per million tokens
- **Model Tables**: Detailed per-model performance metrics
- **Person Tables**: Individual usage with efficiency metrics

---

## 🗄️ Required Database Schema Additions

### **New AI-Specific Entities Needed**

```sql
-- AI Models (vendor/model catalog)
CREATE TABLE ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Model Identification
  model_id VARCHAR(100) NOT NULL, -- claude-sonnet, gpt-4, etc.
  model_name VARCHAR(100) NOT NULL,
  vendor VARCHAR(50) NOT NULL, -- anthropic, openai, google, self_hosted
  model_version VARCHAR(50),
  
  -- Pricing & Configuration
  input_price_per_1k_tokens DECIMAL(10,4), -- USD per 1K input tokens
  output_price_per_1k_tokens DECIMAL(10,4), -- USD per 1K output tokens
  is_self_hosted BOOLEAN DEFAULT false,
  api_endpoint VARCHAR(500),
  
  -- Usage Categories
  primary_purpose VARCHAR(100), -- code_generation, testing, documentation
  supported_activities VARCHAR(20)[], -- ['code', 'test', 'docs', 'review']
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  deprecation_date DATE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, model_id)
);

CREATE INDEX idx_ai_models_tenant ON ai_models(tenant_id);
CREATE INDEX idx_ai_models_vendor ON ai_models(vendor);

-- AI Usage Budgets (spend caps and targets)
CREATE TABLE ai_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
  
  -- Budget Configuration
  budget_type VARCHAR(20) DEFAULT 'sprint', -- sprint, monthly, quarterly, annual
  budget_usd DECIMAL(15,2) NOT NULL,
  alert_threshold_percent DECIMAL(5,2) DEFAULT 80.0, -- Alert at 80% spend
  alert_sent BOOLEAN DEFAULT false,
  
  -- Budget Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Breakdown by Model (optional constraints)
  model_budgets JSONB, -- { "claude-sonnet": 200, "codex": 150 }
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, sprint_id)
);

CREATE INDEX idx_ai_budgets_tenant ON ai_budgets(tenant_id);
CREATE INDEX idx_ai_budgets_sprint ON ai_budgets(sprint_id);

-- AI Usage Records (individual AI requests)
CREATE TABLE ai_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  model_id UUID NOT NULL REFERENCES ai_models(id),
  
  -- Request Context
  activity_type VARCHAR(50) NOT NULL, -- code_generation, test_authoring, documentation, review_rca
  request_id VARCHAR(255), -- External request ID for deduplication
  integration_context JSONB, -- IDE plugin, web app, API, etc.
  
  -- Token Consumption
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens + cached_input_tokens) STORED,
  
  -- Performance Metrics
  latency_ms INTEGER,
  was_cached BOOLEAN DEFAULT false,
  cache_hit_tokens INTEGER DEFAULT 0,
  
  -- Cost Calculation
  cost_usd DECIMAL(10,4) GENERATED ALWAYS AS (
    ((input_tokens - cached_input_tokens) * (SELECT input_price_per_1k_tokens FROM ai_models WHERE id = model_id) / 1000) +
    (output_tokens * (SELECT output_price_per_1k_tokens FROM ai_models WHERE id = model_id) / 1000)
  ) STORED,
  
  -- Outcome Tracking
  suggestion_accepted BOOLEAN, -- Was the AI suggestion accepted by user?
  suggestion_used BOOLEAN DEFAULT false, -- Was it used in final deliverable?
  rework_required BOOLEAN DEFAULT false, -- Did the AI output require significant rework?
  work_item_id UUID REFERENCES work_items(id), -- Linked work item if applicable
  deliverable_id UUID REFERENCES manual_deliverables(id), -- Linked deliverable if applicable
  
  -- Timestamps
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(request_id) -- Prevent duplicate recording of same request
);

CREATE INDEX idx_ai_usage_tenant_user ON ai_usage_records(tenant_id, user_id);
CREATE INDEX idx_ai_usage_model ON ai_usage_records(model_id);
CREATE INDEX idx_ai_usage_activity ON ai_usage_records(activity_type);
CREATE INDEX idx_ai_usage_requested ON ai_usage_records(requested_at);
CREATE INDEX idx_ai_usage_workitem ON ai_usage_records(work_item_id);

-- AI Usage Snapshots (aggregated metrics for dashboards)
CREATE TABLE ai_usage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL for org-level snapshots
  model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL, -- NULL for total usage
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
  
  -- Snapshot Context
  snapshot_type VARCHAR(20) NOT NULL, -- daily, sprint, user_total, model_total
  snapshot_date DATE NOT NULL,
  
  -- Aggregated Metrics
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_cached_tokens BIGINT DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(15,2) DEFAULT 0.0,
  
  -- Efficiency Metrics
  suggestions_accepted INTEGER DEFAULT 0,
  suggestions_total INTEGER DEFAULT 0,
  acceptance_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN suggestions_total > 0 
    THEN (suggestions_accepted::DECIMAL / suggestions_total::DECIMAL) * 100 
    ELSE 0 END
  ) STORED,
  
  ai_assisted_output_percent DECIMAL(5,2), -- % of work that used AI
  rework_rate DECIMAL(5,2), -- % of AI work that required rework
  avg_latency_ms DECIMAL(10,2),
  
  -- Activity Breakdown
  activity_breakdown JSONB, -- { code_generation: {tokens: 100, cost: 50}, ... }
  
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, snapshot_type, snapshot_date, user_id, model_id, sprint_id)
);

CREATE INDEX idx_ai_snapshots_tenant ON ai_usage_snapshots(tenant_id);
CREATE INDEX idx_ai_snapshots_user ON ai_usage_snapshots(user_id);
CREATE INDEX idx_ai_snapshots_sprint ON ai_usage_snapshots(sprint_id);
CREATE INDEX idx_ai_snapshots_date ON ai_usage_snapshots(snapshot_date);

-- AI Configuration & Settings
CREATE TABLE ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Visibility & Access Control
  default_visibility_level VARCHAR(20) DEFAULT 'self', -- self, team, org, finance
  visibility_role_mappings JSONB, -- { tester: "self", manager: "org", executive: "finance" }
  
  -- Cost Control
  enable_budget_alerts BOOLEAN DEFAULT true,
  budget_alert_email BOOLEAN DEFAULT true,
  budget_alert_slack BOOLEAN DEFAULT false,
  overage_action VARCHAR(50) DEFAULT 'alert', -- alert, throttle, block
  
  -- Caching Settings
  enable_prompt_caching BOOLEAN DEFAULT true,
  cache_strategy VARCHAR(50) DEFAULT 'auto', -- auto, aggressive, conservative
  
  -- Tracking Settings
  track_individual_usage BOOLEAN DEFAULT true,
  track_outcomes BOOLEAN DEFAULT true, -- Track acceptance/rework
  retention_days INTEGER DEFAULT 90, -- How long to keep detailed usage records
  
  -- Integration Settings
  enabled_integrations JSONB, -- { ide_plugin: true, web_app: true, api: true }
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  UNIQUE(tenant_id)
);
```

---

## 🔌 Required API Endpoints

### **AI Usage & Analytics APIs**

```typescript
// GET /ai-usage/summary
// Get AI usage summary for current user based on role
interface AiUsageSummaryResponse {
  visibilityLevel: 'self' | 'team' | 'org' | 'finance';
  summary: {
    totalCostUsd: number;
    totalTokens: number;
    totalRequests: number;
    budgetUsd: number;
    budgetConsumedPercent: number;
  };
  kpis: AiKpiCard[];
  trends: {
    period: string;
    cost: number;
    tokens: number;
    acceptRate: number;
  }[];
}

// GET /ai-usage/models
// Get AI model performance data
interface AiModelsResponse {
  models: {
    id: string;
    name: string;
    vendor: string;
    purpose: string;
    tokensIn: number;
    tokensOut: number;
    requests: number;
    costUsd: number;
    avgLatencyMs: number;
    acceptRate: number;
  }[];
}

// GET /ai-usage/sprint-trends
// Get sprint-over-sprint AI usage trends
interface AiSprintTrendsResponse {
  trends: {
    sprint: string;
    claude: number; // cost per sprint
    codex: number;
    inhouse: number;
    gemini: number;
    budget: number;
  }[];
}

// GET /ai-usage/token-trends
// Get input/output token consumption trends
interface AiTokenTrendsResponse {
  trends: {
    sprint: string;
    input: number; // millions of tokens
    output: number;
    cachedPct: number;
  }[];
}

// GET /ai-usage/activity-mix
// Get token distribution by activity type
interface AiActivityMixResponse {
  activities: {
    activity: string;
    tokens: number;
    costUsd: number;
  }[];
}

// GET /ai-usage/people
// Get per-person AI usage (role-filtered)
interface AiPeopleUsageResponse {
  visibilityNote: string;
  people: {
    id: string;
    name: string;
    role: string;
    squad: string;
    tokens: number; // millions
    costUsd: number;
    requests: number;
    acceptRate: number;
    aiAssistedOutput: number;
    reworkRate: number;
    topModel: string;
  }[];
  teamMedians?: {
    acceptRate: number;
    aiAssistedOutput: number;
    reworkRate: number;
  };
}

// GET /ai-usage/insights
// Get AI usage insights and recommendations
interface AiInsightsResponse {
  insights: {
    title: string;
    detail: string;
    tone: 'good' | 'warning' | 'critical' | 'ops';
    priority: number;
  }[];
}

// POST /ai-usage/records
// Record individual AI usage (for integrations)
interface RecordAiUsageRequest {
  modelId: string;
  activityType: string;
  requestId?: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  latencyMs?: number;
  suggestionAccepted?: boolean;
  suggestionUsed?: boolean;
  reworkRequired?: boolean;
  workItemId?: string;
  deliverableId?: string;
  integrationContext?: any;
}
```

### **Budget Management APIs**

```typescript
// GET /ai-usage/budgets
// Get AI budgets for current context
interface AiBudgetsResponse {
  budgets: {
    id: string;
    budgetType: string;
    budgetUsd: number;
    spentUsd: number;
    remainingUsd: number;
    alertThresholdPercent: number;
    periodStart: string;
    periodEnd: string;
    sprint?: {
      id: string;
      name: string;
    };
  }[];
}

// POST /ai-usage/budgets
// Create new AI budget
interface CreateAiBudgetRequest {
  budgetType: string;
  budgetUsd: number;
  alertThresholdPercent?: number;
  sprintId?: string;
  modelBudgets?: Record<string, number>;
}

// PUT /ai-usage/budgets/:id
// Update AI budget
interface UpdateAiBudgetRequest {
  budgetUsd?: number;
  alertThresholdPercent?: number;
  modelBudgets?: Record<string, number>;
}
```

---

## 🔄 Integration Points Required

### **1. AI Provider Integrations**

#### **Anthropic Claude Integration**
```typescript
// Needed for:
// - Real-time cost tracking
// - Token usage monitoring
// - Model performance metrics

interface ClaudeIntegration {
  apiKey: string;
  modelName: string;
  usageEndpoint: string;
  
  // Tracking functions
  trackUsage(request: ClaudeRequest): ClaudeUsage;
  calculateCost(usage: ClaudeUsage): number;
  monitorLatency(request: ClaudeRequest): number;
}
```

#### **OpenAI Codex Integration**
```typescript
interface OpenAIIntegration {
  apiKey: string;
  modelName: string;
  
  // Similar tracking functions
  trackUsage(request: OpenAIRequest): OpenAIUsage;
  calculateCost(usage: OpenAIUsage): number;
  monitorLatency(request: OpenAIRequest): number;
}
```

#### **Google Gemini Integration**
```typescript
interface GeminiIntegration {
  apiKey: string;
  modelName: string;
  
  trackUsage(request: GeminiRequest): GeminiUsage;
  calculateCost(usage: GeminiUsage): number;
}
```

#### **Self-Hosted Model Integration**
```typescript
interface SelfHostedIntegration {
  endpoint: string;
  modelName: string;
  
  trackUsage(request: SelfHostedRequest): SelfHostedUsage;
  calculateCost(usage: SelfHostedUsage): number; // May be cost-based or fixed
}
```

### **2. IDE Plugin Integration**

```typescript
// IDE plugins need to send usage data
interface IDEPluginIntegration {
  // Send usage record
  sendUsageRecord(record: AiUsageRecord): Promise<void>;
  
  // Get user's current budget status
  getBudgetStatus(): Promise<BudgetStatus>;
  
  // Track suggestion outcomes
  trackSuggestionOutcome(requestId: string, outcome: SuggestionOutcome): Promise<void>;
}
```

### **3. Web Application Integration**

```typescript
// Web app usage tracking
interface WebAppIntegration {
  // Track AI assistant usage in web app
  trackWebAppUsage(usage: WebAppUsage): Promise<void>;
  
  // Monitor caching effectiveness
  trackCacheMetrics(metrics: CacheMetrics): Promise<void>;
  
  // Track user interactions with AI suggestions
  trackUserInteraction(interaction: UserInteraction): Promise<void>;
}
```

---

## 📊 Background Jobs Required

### **1. Usage Aggregation Job**

```typescript
// Run: Hourly for real-time, daily for historical
interface AggregateAiUsageJob {
  // Aggregate user-level usage
  aggregateUserUsage(userId: string, period: DateRange): Promise<AiUsageSnapshot>;
  
  // Aggregate model-level usage
  aggregateModelUsage(modelId: string, period: DateRange): Promise<AiUsageSnapshot>;
  
  // Calculate sprint-level metrics
  aggregateSprintUsage(sprintId: string): Promise<AiUsageSnapshot>;
  
  // Generate efficiency insights
  generateInsights(tenantId: string): Promise<AiInsight[]>;
}
```

### **2. Budget Monitoring Job**

```typescript
// Run: Every 15 minutes
interface BudgetMonitoringJob {
  // Check budget consumption
  checkBudgetConsumption(budgetId: string): Promise<BudgetStatus>;
  
  // Send alerts if threshold exceeded
  sendBudgetAlert(budget: Budget, status: BudgetStatus): Promise<void>;
  
  // Calculate budget pacing
  calculateBudgetPacing(budget: Budget): Promise<BudgetPacing>;
}
```

### **3. Cost Calculation Job**

```typescript
// Run: Daily
interface CostCalculationJob {
  // Update cost calculations for usage records
  updateCostRecords(): Promise<void>;
  
  // Calculate per-model cost trends
  calculateModelCostTrends(period: DateRange): Promise<CostTrend[]>;
  
  // Calculate per-user cost trends
  calculateUserCostTrends(period: DateRange): Promise<CostTrend[]>;
}
```

---

## 🚨 Critical Implementation Considerations

### **1. Data Volume & Performance**

**Challenge**: AI usage records can be very high volume (every API call)
**Solutions**:
- **Async Recording**: Record usage asynchronously via message queue
- **Time-Series Optimization**: Use partitioned tables for usage records
- **Aggregation**: Pre-calculate metrics in snapshots, don't query raw records for dashboards
- **Retention Policy**: Archive detailed records after 90 days, keep snapshots

### **2. Real-Time Cost Tracking**

**Challenge**: Need accurate, real-time cost data for budget monitoring
**Solutions**:
- **Streaming Costs**: Calculate costs on ingestion, don't wait for aggregation
- **Budget Caching**: Cache current budget status in Redis
- **Incremental Updates**: Update budget consumption incrementally
- **Cost Estimation**: Use token counts for immediate cost estimation

### **3. Multi-Provider Integration**

**Challenge**: Different AI providers have different APIs and pricing
**Solutions**:
- **Provider Abstraction**: Create unified AI provider interface
- **Pricing Configuration**: Store pricing in database, update easily
- **Usage Normalization**: Normalize usage data across providers
- **Error Handling**: Handle provider-specific errors gracefully

### **4. Role-Based Visibility**

**Challenge**: Complex visibility rules based on user roles
**Solutions**:
- **RBAC Integration**: Integrate with existing role-based access control
- **Query-Level Filtering**: Apply visibility filters at database query level
- **Caching Strategy**: Cache role-filtered data separately
- **Audit Logging**: Log all access to sensitive cost data

### **5. Outcome Tracking**

**Challenge**: Need to track whether AI suggestions were accepted and used
**Solutions**:
- **Integration Points**: Track outcomes in IDE plugins and web apps
- **Deferred Tracking**: Allow delayed outcome tracking
- **Work Item Linking**: Link AI usage to resulting work items
- **Sampling**: Use statistical sampling if full tracking is too expensive

---

## 📈 Implementation Priority

### **Phase 1: Core Infrastructure (Weeks 1-2)**
1. **Database Schema**: Implement AI-specific tables
2. **Basic Recording**: Create usage recording API
3. **Model Management**: Build AI model catalog and pricing
4. **Basic Snapshots**: Implement usage aggregation

### **Phase 2: Integration & Tracking (Weeks 3-4)**
1. **Provider Integrations**: Connect to Claude, OpenAI, Google APIs
2. **IDE Plugin SDK**: Build plugin integration for usage tracking
3. **Outcome Tracking**: Implement suggestion outcome recording
4. **Cost Calculation**: Real-time cost calculation system

### **Phase 3: Analytics & UI (Weeks 5-6)**
1. **Dashboard APIs**: Build all analytics endpoints
2. **Budget Management**: Implement budget monitoring and alerts
3. **Role-Based Access**: Implement visibility controls
4. **Insights Engine**: Generate automated insights and recommendations

### **Phase 4: Optimization & Production (Weeks 7-8)**
1. **Performance Optimization**: Query optimization, caching, indexing
2. **Alert System**: Budget alerts and notifications
3. **Monitoring**: System health and performance monitoring
4. **Documentation**: Integration guides and API documentation

---

## 🔐 Security & Privacy Considerations

### **1. Cost Data Protection**
- **Role-Based Access**: Strict access control based on user roles
- **Data Encryption**: Encrypt sensitive cost data at rest
- **Audit Logging**: Log all access to cost analytics
- **Compliance**: Ensure compliance with financial data regulations

### **2. User Privacy**
- **Anonymization**: Option for anonymized individual analytics
- **Consent Management**: User consent for detailed tracking
- **Data Minimization**: Only collect necessary usage data
- **Retention Policies**: Clear data retention and deletion policies

### **3. API Security**
- **Authentication**: Require proper JWT authentication
- **Rate Limiting**: Prevent abuse of usage recording API
- **Input Validation**: Validate all usage data inputs
- **Request Signing**: Sign requests from external integrations

---

## 🎯 Success Metrics

### **Technical Metrics**
- ✅ **Recording Latency**: <100ms for usage recording
- ✅ **Dashboard Load**: <500ms for AI usage dashboard
- ✅ **Cost Accuracy**: >99% accuracy in cost calculations
- ✅ **Budget Alerts**: <5 minutes from threshold breach to alert

### **Business Metrics**
- ✅ **Cost Visibility**: Complete visibility into AI spending
- ✅ **Budget Control**: Effective budget management and pacing
- ✅ **Efficiency Insights**: Actionable insights for improvement
- ✅ **ROI Tracking**: Clear ROI measurement for AI investments

---

## 📋 Updated Schema Integration Points

### **Connections to Existing Schema**
1. **Users**: Link AI usage to users for per-person analytics
2. **Tenants**: Multi-tenant isolation of AI usage data
3. **Products**: Track AI usage by product/team
4. **Sprints**: Sprint-based budget and trend analysis
5. **WorkItems**: Link AI suggestions to resulting work items
6. **ManualDeliverables**: Track AI assistance in deliverables

---

## 🔄 Updated Database Schema File

The existing updated database schema needs to include these AI-specific entities. The new tables should be added as a new section:

```sql
-- ============================================================
-- 🆕 AI USAGE & COST MANAGEMENT
-- ============================================================
-- [All the AI tables defined above]
```

This represents a **significant new module** that requires approximately **8-10 weeks of dedicated development** but provides **enterprise-grade AI cost management and analytics** capabilities.

The AI Usage module is **production-ready** and aligns perfectly with the existing QualiMetrix architecture, extending the platform's capabilities into the growing area of AI/LLM cost management and optimization.
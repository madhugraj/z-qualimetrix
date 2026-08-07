# QualiMetrix Unified Frontend-Backend API Specification

## Overview
Complete API specification mapping frontend components to backend endpoints, including all new entities for production-ready implementation.

---

## 🎯 API Design Principles

### **RESTful Conventions**
- **Base URL**: `https://api.qualimetrix.com/v1`
- **Authentication**: Bearer JWT tokens in Authorization header
- **Content-Type**: `application/json` for all requests/responses
- **Error Format**: Consistent error response structure
- **Pagination**: Cursor-based pagination for all list endpoints
- **Rate Limiting**: Per-user and per-tenant rate limits
- **CORS**: Configured for frontend domain

### **Standard Response Format**
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
  meta?: {
    requestId: string;
    version: string;
    rateLimit?: {
      remaining: number;
      resetAt: string;
    };
  };
}
```

---

## 🔐 Authentication & User Management APIs

### **POST /auth/login**
**Frontend Component**: `Login.tsx`
**Purpose**: User authentication with JWT token generation

```typescript
// Request
interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
  tenantSlug?: string; // Optional direct tenant access
}

// Response
interface LoginResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
    role: string;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
  };
  tokens: {
    accessToken: string; // 15min expiry
    refreshToken: string; // 7d expiry
  };
  permissions: {
    roles: string[];
    accessibleProducts: string[];
    features: string[];
  };
}
```

### **POST /auth/refresh**
**Frontend Component**: `AuthContext.tsx`
**Purpose**: Refresh access token using refresh token

```typescript
// Request
interface RefreshTokenRequest {
  refreshToken: string;
}

// Response
interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number; // seconds
}
```

### **GET /users/me**
**Frontend Component**: `UserProfile.tsx`
**Purpose**: Get current user profile with settings

```typescript
// Response
interface UserProfileResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
    timezone: string;
    language: string;
    memberships: TenantMembership[];
  };
  settings: UserSettings;
  permissions: UserPermissions;
}
```

### **GET /users/me/settings**
**Frontend Component**: `Settings.tsx`
**Purpose**: Get user settings and preferences

```typescript
// Response
interface UserSettingsResponse {
  theme: 'system' | 'light' | 'dark';
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  language: string;
  defaultDashboardRole: string;
  notificationChannels: {
    in_app: boolean;
    email: boolean;
    slack: boolean;
  };
  emailDigestFrequency: string;
  quietHours: {
    start: string; // HH:mm
    end: string;
  };
  defaultDateRange: string;
  defaultProductId?: string;
  dashboardLayout: any; // Custom layout configuration
}
```

---

## 🏢 Tenant & Configuration APIs

### **GET /tenants/{tenantId}/config**
**Frontend Component**: `TenantSettings.tsx`
**Purpose**: Get tenant configuration and policies

```typescript
// Response
interface TenantConfigResponse {
  tenant: {
    id: string;
    name: string;
    slug: string;
    subscriptionTier: string;
    maxUsers: number;
    maxProducts: number;
  };
  configuration: {
    workingDays: string[];
    workingHours: {
      start: string;
      end: string;
    };
    timezone: string;
    defaultSprintLength: number;
    sprintStartDate: string;
    qualityThresholds: {
      mttrHours: number;
      defectLeakagePercent: number;
      testExecutionPercent: number;
    };
    releaseReadinessRequirements: any;
  };
}
```

### **PUT /tenants/{tenantId}/config**
**Frontend Component**: `TenantSettings.tsx`
**Purpose**: Update tenant configuration

```typescript
// Request
interface UpdateTenantConfigRequest {
  workingDays?: string[];
  workingHours?: {
    start: string;
    end: string;
  };
  timezone?: string;
  defaultSprintLength?: number;
  qualityThresholds?: {
    mttrHours?: number;
    defectLeakagePercent?: number;
    testExecutionPercent?: number;
  };
}
```

---

## 🔍 Search Infrastructure APIs

### **POST /search**
**Frontend Component**: `GlobalSearch.tsx`
**Purpose**: Global search across all entities

```typescript
// Request
interface SearchRequest {
  query: string;
  filters: {
    types?: ('bugs' | 'people' | 'stories' | 'deliverables' | 'pages')[];
    domains?: string[];
    priorities?: string[];
    dateRange?: {
      start: string;
      end: string;
    };
  };
  pagination: {
    limit: number;
    cursor?: string;
  };
}

// Response
interface SearchResponse {
  results: {
    bugs: SearchResult<WorkItem>[];
    people: SearchResult<User>[];
    stories: SearchResult<WorkItem>[];
    deliverables: SearchResult<ManualDeliverable>[];
    pages: SearchResult<Page>[];
  };
  suggestions: SearchSuggestion[];
  totalResults: number;
  searchDuration: number; // milliseconds
}

interface SearchResult<T> {
  id: string;
  type: string;
  title: string;
  description: string;
  relevanceScore: number;
  highlights: {
    field: string;
    text: string;
  }[];
  data: T;
}
```

### **GET /search/suggestions**
**Frontend Component**: `GlobalSearch.tsx`
**Purpose**: Get search suggestions and quick filters

```typescript
// Response
interface SearchSuggestionsResponse {
  recentSearches: string[];
  popularSearches: string[];
  quickFilters: {
    name: string;
    icon: string;
    query: string;
    filters: any;
  }[];
  trendingTopics: string[];
}
```

### **POST /search/analytics**
**Frontend Component**: `SearchAnalytics.tsx`
**Purpose**: Track search interactions for optimization

```typescript
// Request
interface SearchAnalyticsRequest {
  searchQuery: string;
  searchType: string;
  resultsCount: number;
  clickedResult?: {
    type: string;
    id: string;
    position: number;
  };
  searchDuration: number;
}
```

---

## 📤 Export & Reporting APIs

### **POST /exports**
**Frontend Component**: `ExportMenu.tsx`
**Purpose**: Create export job for data extraction

```typescript
// Request
interface CreateExportRequest {
  exportType: 'test_execution' | 'mttr' | 'velocity' | 'rtm' | 'full_bundle' | 'custom';
  format: 'csv' | 'json' | 'pdf' | 'excel';
  filters: {
    dateRange: {
      start: string;
      end: string;
    };
    productIds?: string[];
    sprintIds?: string[];
    includedDatasets?: string[];
  };
  options?: {
    includeCharts?: boolean;
    includeRawData?: boolean;
    pageSize?: 'A4' | 'Letter';
    orientation?: 'portrait' | 'landscape';
  };
}

// Response
interface CreateExportResponse {
  exportJob: {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    estimatedCompletion?: string;
    fileUrl?: string;
    expiresAt?: string;
  };
}
```

### **GET /exports/{exportId}**
**Frontend Component**: `ExportStatus.tsx`
**Purpose**: Get export job status and download link

```typescript
// Response
interface ExportStatusResponse {
  exportJob: {
    id: string;
    status: string;
    progress: number;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    error?: string;
    createdAt: string;
    completedAt?: string;
  };
}
```

### **POST /reports/templates**
**Frontend Component**: `ReportBuilder.tsx`
**Purpose**: Create custom report template

```typescript
// Request
interface CreateReportTemplateRequest {
  templateName: string;
  templateDescription: string;
  templateType: 'standard' | 'compliance' | 'executive' | 'custom';
  category: string;
  dataSources: {
    tables: string[];
    queries: any[];
  };
  layoutConfig: {
    sections: ReportSection[];
    styling: any;
  };
  defaultFormat: 'pdf' | 'excel' | 'html';
  isPublic?: boolean;
  targetRoles?: string[];
}
```

### **POST /reports/schedule**
**Frontend Component**: `ReportScheduler.tsx`
**Purpose**: Schedule automated report generation

```typescript
// Request
interface ScheduleReportRequest {
  templateId: string;
  scheduleName: string;
  scheduleType: 'daily' | 'weekly' | 'monthly' | 'custom';
  cronExpression: string;
  filters: any;
  format: string;
  deliveryMethods: {
    email: boolean;
    slack: boolean;
    saveToLibrary: boolean;
  };
  emailRecipients?: string[];
  slackChannels?: string[];
}
```

---

## 🚨 Alert Management APIs

### **GET /alerts/rules**
**Frontend Component**: `AlertConfiguration.tsx`
**Purpose**: Get all alert rules for current tenant

```typescript
// Response
interface AlertRulesResponse {
  rules: AlertRule[];
  summary: {
    total: number;
    active: number;
    triggeredToday: number;
    bySeverity: Record<string, number>;
  };
}

interface AlertRule {
  id: string;
  ruleName: string;
  ruleCategory: string;
  metricType: string;
  thresholdValue: number;
  severity: string;
  isEnabled: boolean;
  lastTriggeredAt?: string;
  triggerCount: number;
}
```

### **POST /alerts/rules**
**Frontend Component**: `AlertRuleBuilder.tsx`
**Purpose**: Create new alert rule

```typescript
// Request
interface CreateAlertRuleRequest {
  ruleName: string;
  ruleDescription: string;
  ruleCategory: string;
  metricType: string;
  operator: 'greater_than' | 'less_than' | 'equals';
  thresholdValue: number;
  aggregationWindow: string;
  severity: 'critical' | 'high' | 'warning' | 'info';
  notificationChannels: {
    email: boolean;
    slack: boolean;
    in_app: boolean;
  };
  emailRecipients?: string[];
  targetRoles?: string[];
  escalationEnabled?: boolean;
  cooldownPeriodMinutes?: number;
}
```

### **GET /alerts/incidents**
**Frontend Component**: `AlertDashboard.tsx`
**Purpose**: Get alert incidents with filtering

```typescript
// Response
interface AlertIncidentsResponse {
  incidents: AlertIncident[];
  pagination: {
    total: number;
    limit: number;
    nextCursor?: string;
  };
}

interface AlertIncident {
  id: string;
  alertRule: {
    id: string;
    ruleName: string;
    severity: string;
  };
  status: 'active' | 'acknowledged' | 'resolved';
  metricValue: number;
  thresholdValue: number;
  triggeredAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}
```

### **POST /alerts/incidents/{incidentId}/acknowledge**
**Frontend Component**: `AlertDetail.tsx`
**Purpose**: Acknowledge alert incident

```typescript
// Request
interface AcknowledgeIncidentRequest {
  note?: string;
}
```

### **POST /alerts/incidents/{incidentId}/resolve**
**Frontend Component**: `AlertDetail.tsx`
**Purpose**: Resolve alert incident

```typescript
// Request
interface ResolveIncidentRequest {
  resolutionNote: string;
  rootCause?: string;
  markAsFalsePositive?: boolean;
  falsePositiveReason?: string;
}
```

---

## 👥 People Analytics APIs

### **GET /people/knowledge-silos**
**Frontend Component**: `KnowledgeSiloDashboard.tsx`
**Purpose**: Get knowledge silo analysis

```typescript
// Response
interface KnowledgeSilosResponse {
  silos: KnowledgeSilo[];
  summary: {
    totalSilos: number;
    criticalRisks: number;
    highRisks: number;
    avgBusFactor: number;
  };
}

interface KnowledgeSilo {
  id: string;
  component: string;
  componentCategory: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  primaryOwner: {
    id: string;
    name: string;
    contribution: number; // percentage
  };
  secondaryOwners: User[];
  busFactor: number;
  busFactorRisk: string;
  totalContributors: number;
  businessCriticality: string;
  userFacing: boolean;
  mitigationStrategy: any;
  recommendedTraining?: string;
}
```

### **GET /people/skill-gaps**
**Frontend Component**: `SkillGapAnalysis.tsx`
**Purpose**: Get skill gap analysis for team

```typescript
// Response
interface SkillGapsResponse {
  gaps: SkillGap[];
  summary: {
    totalGaps: number;
    criticalGaps: number;
    bySkillArea: Record<string, number>;
  };
}

interface SkillGap {
  id: string;
  user: {
    id: string;
    name: string;
    role: string;
  };
  skillArea: string;
  skillCategory: string;
  currentLevel: string;
  targetLevel: string;
  gapLevel: 'critical' | 'significant' | 'moderate' | 'minor';
  gapConfidence: number;
  identifiedFrom: string;
  trainingRecommendation?: string;
  suggestedResources: any[];
  estimatedTrainingHours: number;
  trainingPriority: number;
  status: 'open' | 'in_progress' | 'resolved';
  targetDate?: string;
}
```

### **GET /people/team-health**
**Frontend Component**: `TeamHealthDashboard.tsx`
**Purpose**: Get team health metrics

```typescript
// Response
interface TeamHealthResponse {
  metrics: TeamHealthMetric[];
  trends: {
    period: string;
    burnoutRisk: number;
    teamMorale: number;
    velocityStability: number;
  };
}

interface TeamHealthMetric {
  id: string;
  periodType: 'weekly' | 'sprint' | 'monthly';
  periodStart: string;
  periodEnd: string;
  teamSize: number;
  rolesDistribution: Record<string, number>;
  burnoutRiskScore: number;
  teamMoraleScore: number;
  crossTeamCollaborationScore: number;
  velocityStability: number;
  qualityScore: number;
  siloRiskCount: number;
  busFactorRiskCount: number;
  identifiedIssues: string[];
  recommendedActions: any[];
}
```

### **GET /people/workload**
**Frontend Component**: `WorkloadAnalysis.tsx`
**Purpose**: Get individual and team workload analysis

```typescript
// Response
interface WorkloadResponse {
  workloads: WorkloadAnalysis[];
  summary: {
    overloadedUsers: number;
    underutilizedUsers: number;
    avgUtilizationRate: number;
    totalCapacityHours: number;
    utilizedCapacityHours: number;
  };
}

interface WorkloadAnalysis {
  id: string;
  user: {
    id: string;
    name: string;
    role: string;
  };
  periodType: 'weekly' | 'sprint';
  periodStart: string;
  periodEnd: string;
  activeWorkItems: number;
  totalStoryPoints: number;
  highPriorityItems: number;
  meetingHours: number;
  utilizationRate: number;
  workloadStrainScore: number;
  workloadStatus: 'underutilized' | 'optimal' | 'overloaded' | 'burned_out';
  focusTimePercentage: number;
  recommendedActions: any[];
}
```

---

## 🔄 CI/CD Integration APIs

### **GET /ci/pipelines**
**Frontend Component**: `CIIntegrations.tsx`
**Purpose**: Get configured CI/CD pipelines

```typescript
// Response
interface CIPipelinesResponse {
  pipelines: CIPipelineIntegration[];
}

interface CIPipelineIntegration {
  id: string;
  pipelineName: string;
  pipelineType: 'jenkins' | 'github_actions' | 'circleci' | 'gitlab_ci' | 'azure_pipelines';
  projectUrl: string;
  lastBuildStatus?: string;
  lastBuildTimestamp?: string;
  syncEnabled: boolean;
  autoImportEnabled: boolean;
}
```

### **POST /ci/pipelines**
**Frontend Component**: `CISetup.tsx`
**Purpose**: Configure new CI/CD pipeline integration

```typescript
// Request
interface CreateCIPipelineRequest {
  pipelineName: string;
  pipelineType: string;
  ciServerUrl: string;
  apiToken: string; // Will be encrypted
  projectUrl: string;
  testResultFormat: 'junit_xml' | 'nunit' | 'trx';
  autoImportEnabled: boolean;
  branchFilter?: string[];
  buildStatusFilter?: string[];
}
```

### **GET /ci/builds**
**Frontend Component**: `CIBuildsDashboard.tsx`
**Purpose**: Get CI build runs with filtering

```typescript
// Response
interface CIBuildsResponse {
  builds: CIBuildRun[];
  summary: {
    totalBuilds: number;
    successRate: number;
    avgDuration: number;
    byStatus: Record<string, number>;
  };
}

interface CIBuildRun {
  id: string;
  pipeline: {
    id: string;
    name: string;
    type: string;
  };
  externalBuildId: string;
  buildUrl: string;
  branchName: string;
  commitHash: string;
  commitMessage: string;
  buildStatus: 'success' | 'failure' | 'unstable' | 'running';
  buildDuration: number;
  buildTimestamp: string;
  testSummary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
  };
  codeCoverage?: {
    percent: number;
    linesCovered: number;
    linesTotal: number;
  };
}
```

### **GET /ci/test-results/{buildId}**
**Frontend Component**: `CITestResults.tsx`
**Purpose**: Get detailed test results for a build

```typescript
// Response
interface CITestResultsResponse {
  testResults: CITestResult[];
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    executionTime: number;
  };
  failurePatterns: {
    errorMessage: string;
    count: number;
    affectedTests: string[];
  }[];
}

interface CITestResult {
  id: string;
  testName: string;
  testSuite: string;
  testClass: string;
  testStatus: 'passed' | 'failed' | 'skipped';
  duration: number;
  errorMessage?: string;
  stackTrace?: string;
  failureType?: string;
  linkedTestCase?: {
    id: string;
    name: string;
  };
  component?: string;
}
```

---

## 📊 Quality Metrics APIs

### **GET /metrics/snapshots**
**Frontend Component**: `QualityDashboard.tsx`
**Purpose**: Get quality metrics snapshots

```typescript
// Response
interface MetricsSnapshotsResponse {
  snapshots: QualityMetricsSnapshot[];
  trends: {
    period: string;
    testAutomationRate: number;
    defectLeakageRate: number;
    mttr: number;
    releaseReadinessScore: number;
  }[];
}

interface QualityMetricsSnapshot {
  id: string;
  snapshotType: 'daily' | 'sprint' | 'release';
  snapshotDate: string;
  sprintId?: string;
  releaseId?: string;
  
  // Test Execution Metrics
  testCasesExecuted: number;
  testCasesPassed: number;
  testCasesFailed: number;
  testCasesBlocked: number;
  testAutomationRate: number;
  
  // Bug Metrics
  bugsCreated: number;
  bugsResolved: number;
  bugsEscaped: number;
  bugsReopened: number;
  defectLeakageRate: number;
  
  // Time Metrics
  mttr: number; // Mean Time To Resolve
  mttf: number; // Mean Time To Fix
  
  // Quality Indicators
  firstTimeFixRate: number;
  qaRejectionRate: number;
  defectDensity: number;
  
  // Coverage Metrics
  rtmCoverageRate: number;
  automationRoi: number;
  
  // Release Readiness
  releaseReadinessScore: number;
  openP0P1Count: number;
  regressionPassRate: number;
  
  calculatedAt: string;
}
```

### **GET /metrics/team-performance**
**Frontend Component**: `TeamPerformance.tsx`
**Purpose**: Get individual and team performance metrics

```typescript
// Response
interface TeamPerformanceResponse {
  metrics: TeamPerformanceMetric[];
  periodInfo: {
    periodType: string;
    periodStart: string;
    periodEnd: string;
  };
}

interface TeamPerformanceMetric {
  id: string;
  user: {
    id: string;
    name: string;
    role: string;
  };
  periodType: string;
  periodStart: string;
  periodEnd: string;
  
  // Individual Performance
  bugsAssigned: number;
  bugsResolved: number;
  avgMttrHours: number;
  firstTimeFixRate: number;
  qaRejections: number;
  
  // Test Performance (for testers)
  testsExecuted: number;
  testPassRate: number;
  demosDelivered: number;
  docsCreated: number;
  
  // Deliverable Performance
  manualHoursLogged: number;
  automationHoursSaved: number;
  
  calculatedAt: string;
}
```

---

## 🐛 Work Items & Bug Intelligence APIs

### **GET /work-items**
**Frontend Component**: `BugsList.tsx`, `StoriesList.tsx`
**Purpose**: Get work items with filtering

```typescript
// Response
interface WorkItemsResponse {
  workItems: WorkItem[];
  pagination: {
    total: number;
    limit: number;
    nextCursor?: string;
  };
  filters: {
    itemTypes: string[];
    statuses: string[];
    priorities: string[];
    domains: string[];
  };
}

interface WorkItem {
  id: string;
  itemType: 'story' | 'task' | 'bug' | 'epic' | 'test_case';
  status: string;
  priority: string;
  title: string;
  description: string;
  domain?: string;
  domainConfidence?: number;
  component?: string;
  assignee?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  sprint?: {
    id: string;
    name: string;
  };
  externalSystem: string;
  externalId: string;
  externalUrl: string;
  createdAt: string;
  updatedAt: string;
}
```

### **POST /work-items**
**Frontend Component**: `CreateWorkItem.tsx`
**Purpose**: Create new work item

```typescript
// Request
interface CreateWorkItemRequest {
  itemType: 'story' | 'task' | 'bug';
  title: string;
  description?: string;
  priority?: string;
  domain?: string;
  component?: string;
  assigneeId?: string;
  sprintId?: string;
  parentWorkItemId?: string;
  tags?: string[];
}
```

### **GET /bugs/similar/{bugId}**
**Frontend Component**: `BugSimilarityPanel.tsx`
**Purpose**: Get similar bugs for duplicate detection

```typescript
// Response
interface SimilarBugsResponse {
  similarBugs: BugSimilarity[];
  searchPerformed: boolean;
  confidenceThreshold: number;
}

interface BugSimilarity {
  id: string;
  similarBug: WorkItem;
  similarityScore: number;
  similarityMethod: 'tfidf' | 'embedding' | 'hybrid';
  userConfirmed?: boolean;
  userRejected?: boolean;
  createdAt: string;
}
```

### **POST /bugs/{bugId}/classify**
**Frontend Component**: `BugClassification.tsx`
**Purpose**: Classify bug with domain and similarity

```typescript
// Request
interface ClassifyBugRequest {
  domain: string;
  domainConfidence: number;
  component?: string;
  tags?: string[];
}
```

---

## 🧪 Test Management APIs

### **GET /test-cases**
**Frontend Component**: `TestCasesList.tsx`
**Purpose**: Get test cases with filtering

```typescript
// Response
interface TestCasesResponse {
  testCases: TestCase[];
  summary: {
    total: number;
    automated: number;
    manual: number;
    coverageRate: number;
  };
}

interface TestCase {
  id: string;
  name: string;
  description: string;
  testType: 'functional' | 'ui' | 'api' | 'performance' | 'security';
  automationStatus: 'manual' | 'automated' | 'hybrid';
  priority: string;
  component?: string;
  tags: string[];
  coveredStoryIds: string[];
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

### **GET /test-executions**
**Frontend Component**: `TestExecutions.tsx`
**Purpose**: Get test execution results

```typescript
// Response
interface TestExecutionsResponse {
  executions: TestExecution[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    passRate: number;
  };
}

interface TestExecution {
  id: string;
  testCase: {
    id: string;
    name: string;
    testType: string;
  };
  status: 'passed' | 'failed' | 'blocked' | 'skipped';
  environment: 'Dev' | 'QA' | 'Staging' | 'Production';
  executedBy: {
    id: string;
    name: string;
  };
  duration: number;
  executionNotes?: string;
  failureReason?: string;
  isFlake: boolean;
  sprint?: {
    id: string;
    name: string;
  };
  executedAt: string;
}
```

---

## 🎛️ Integration Management APIs

### **GET /integrations**
**Frontend Component**: `IntegrationsDashboard.tsx`
**Purpose**: Get configured integrations status

```typescript
// Response
interface IntegrationsResponse {
  integrations: Integration[];
  syncStatus: {
    activeSyncs: number;
    failedSyncs: number;
    lastSyncTime: string;
  };
}

interface Integration {
  id: string;
  integrationType: 'jira' | 'azure_devops' | 'github' | 'ci_pipeline';
  syncEnabled: boolean;
  syncStatus: 'pending' | 'active' | 'error' | 'paused';
  lastSyncAt?: string;
  lastSuccessfulSync?: string;
  errorCount: number;
  lastError?: string;
}
```

### **POST /integrations/{integrationType}/connect**
**Frontend Component**: `IntegrationSetup.tsx`
**Purpose**: Connect to external integration

```typescript
// Request
interface ConnectIntegrationRequest {
  oauthCode?: string;
  apiKey?: string;
  webhookUrl?: string;
  syncSettings?: {
    enabled: boolean;
    frequency: string;
  };
}
```

### **POST /integrations/{integrationId}/sync**
**Frontend Component**: `SyncControls.tsx`
**Purpose**: Trigger manual synchronization

```typescript
// Response
interface SyncResponse {
  syncJob: {
    id: string;
    status: 'pending' | 'processing';
    estimatedCompletion?: string;
  };
}
```

---

## 📈 Real-Time Updates & WebSockets

### **WebSocket Connection**
**Frontend Component**: `WebSocketClient.tsx`
**Purpose**: Real-time updates for dashboards and alerts

```typescript
// WebSocket endpoint
wss://api.qualimetrix.com/v1/ws

// Connection message
interface WebSocketConnect {
  token: string; // JWT token
  channels: string[]; // channels to subscribe
}

// Real-time events
interface WebSocketEvent {
  type: 'metric_update' | 'alert_triggered' | 'sync_complete' | 'test_result';
  data: any;
  timestamp: string;
}

// Example: Metric update event
interface MetricUpdateEvent {
  type: 'metric_update';
  data: {
    productId: string;
    metricType: string;
    value: number;
    previousValue: number;
    changePercent: number;
  };
  timestamp: string;
}

// Example: Alert triggered event
interface AlertTriggeredEvent {
  type: 'alert_triggered';
  data: {
    incidentId: string;
    alertRule: {
      id: string;
      ruleName: string;
      severity: string;
    };
    metricValue: number;
    thresholdValue: number;
    message: string;
  };
  timestamp: string;
}
```

---

## 🔧 Feature Flags APIs

### **GET /feature-flags**
**Frontend Component**: `FeatureFlagContext.tsx`
**Purpose**: Get feature flags for current user

```typescript
// Response
interface FeatureFlagsResponse {
  flags: {
    [key: string]: {
      enabled: boolean;
      variant?: 'control' | 'test';
      config: any;
    };
  };
  userContext: {
    userId: string;
    tenantId: string;
    role: string;
    environment: string;
  };
}
```

### **GET /feature-flags/admin**
**Frontend Component**: `FeatureFlagAdmin.tsx`
**Purpose**: Get all feature flags (admin only)

```typescript
// Response
interface FeatureFlagsAdminResponse {
  flags: FeatureFlag[];
  usageStats: {
    totalFlags: number;
    enabledFlags: number;
    activeExperiments: number;
  };
}

interface FeatureFlag {
  id: string;
  flagName: string;
  description: string;
  isEnabled: boolean;
  flagType: 'feature' | 'experiment' | 'rollout';
  rolloutPercentage: number;
  targetRoles: string[];
  environment: string;
  usageCount: number;
  lastEvalutedAt: string;
  createdAt: string;
}
```

---

## 📋 Summary

### **API Coverage**
- ✅ **Authentication & User Management**: 5 endpoints
- ✅ **Tenant & Configuration**: 3 endpoints  
- ✅ **Search Infrastructure**: 3 endpoints
- ✅ **Export & Reporting**: 4 endpoints
- ✅ **Alert Management**: 5 endpoints
- ✅ **People Analytics**: 4 endpoints
- ✅ **CI/CD Integration**: 4 endpoints
- ✅ **Quality Metrics**: 2 endpoints
- ✅ **Work Items & Bugs**: 4 endpoints
- ✅ **Test Management**: 2 endpoints
- ✅ **Integration Management**: 3 endpoints
- ✅ **Feature Flags**: 2 endpoints

### **Frontend Component Mapping**
All major frontend components have corresponding backend API endpoints:

1. **Dashboard Components**: `QualityDashboard.tsx` → `/metrics/snapshots`
2. **Search Components**: `GlobalSearch.tsx` → `/search`
3. **Export Components**: `ExportMenu.tsx` → `/exports`
4. **Alert Components**: `AlertDashboard.tsx` → `/alerts/incidents`
5. **People Analytics**: `TeamHealthDashboard.tsx` → `/people/team-health`
6. **CI/CD Integration**: `CIBuildsDashboard.tsx` → `/ci/builds`
7. **Settings Pages**: `Settings.tsx` → `/users/me/settings`

This comprehensive API specification ensures complete frontend-backend alignment and production-ready implementation.
# QualiMetrix API Specifications & Architecture

## Overview
This document defines the complete API specifications, rate limiting strategies, error handling patterns, and background job architecture for the QualiMetrix platform. 

**API Coverage Summary:**
- **Quality Intelligence APIs**: Bug analytics, test execution analytics
- **AI Usage & Cost Management APIs**: Usage tracking, budgets, model management, settings
- **People Analytics APIs**: Team health, knowledge silos, performance metrics
- **Work Item Management APIs**: CRUD operations, similarity detection, sprint management
- **Test Management APIs**: Test cases, execution tracking, coverage analysis
- **Sprint & Product Management APIs**: Sprint lifecycle, metrics calculation, velocity tracking

**Total Endpoints Documented**: 20+ core API endpoints covering all major platform functionality

---

## 🔐 Authentication & Authorization

### JWT Token Strategy
```typescript
// middleware/auth.ts
import jwt from 'jsonwebtoken'

interface JWTPayload {
  userId: string
  tenantId: string
  role: string
  email: string
}

export function generateToken(payload: JWTPayload): {
  accessToken: string
  refreshToken: string
} {
  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  )
  
  const refreshToken = jwt.sign(
    { userId: payload.userId },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
  )
  
  return { accessToken, refreshToken }
}

export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload
  } catch (error) {
    throw new ApiError(401, 'Invalid or expired token')
  }
}
```

### Role-Based Access Control Middleware
```typescript
// middleware/rbac.ts
import { Request, Response, NextFunction } from 'express'

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      })
    }
    
    next()
  }
}

export function requireTenantAccess(req: Request, res: Response, next: NextFunction) {
  const requestedTenantId = req.params.tenantId || req.body.tenantId
  
  if (requestedTenantId !== req.user.tenantId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot access other tenant data' })
  }
  
  next()
}
```

---

## 📊 Core API Endpoints

### Quality Intelligence APIs

#### 1. Bug Intelligence Dashboard
```typescript
// GET /api/quality/bugs/dashboard
interface BugDashboardResponse {
  visibilityLevel: 'self' | 'team' | 'org' | 'finance'
  summary: {
    totalBugs: number
    criticalBugs: number
    openBugs: number
    escapedDefects: number
    avgResolutionTime: number
  }
  trends: {
    period: string
    bugsCreated: number
    bugsResolved: number
    mttr: number
  }[]
  topBugs: {
    id: string
    title: string
    priority: string
    status: string
    assignee: string
    age: number
  }[]
}

// Implementation
router.get('/quality/bugs/dashboard', 
  authenticateToken,
  requireRole('tester', 'developer', 'lead', 'admin'),
  async (req, res) => {
    const { tenantId, userId, role } = req.user
    
    // Apply role-based visibility
    const visibilityLevel = getVisibilityLevel(role)
    const dataFilter = getVisibilityFilter(userId, role, tenantId)
    
    const dashboard = await prisma.bugDashboard.findMany({
      where: dataFilter,
      include: {
        assignee: { select: { id: true, fullName: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    })
    
    res.json({
      visibilityLevel,
      summary: calculateSummary(dashboard),
      trends: await calculateTrends(tenantId, '30d'),
      topBugs: dashboard.slice(0, 10)
    })
  }
)
```

#### 2. Test Execution Analytics
```typescript
// GET /api/quality/test-executions/analytics
router.get('/quality/test-executions/analytics',
  authenticateToken,
  requireRole('tester', 'lead', 'admin'),
  async (req, res) => {
    const { tenantId } = req.user
    const { sprintId, period = '30d' } = req.query
    
    const analytics = await prisma.testExecutionAnalytics.groupBy({
      by: ['status', 'testType'],
      where: {
        tenantId,
        sprintId: sprintId || undefined,
        executedAt: {
          gte: new Date(Date.now() - parsePeriod(period))
        }
      },
      _count: true,
      _avg: {
        durationSeconds: true
      }
    })
    
    const passRate = calculatePassRate(analytics)
    
    res.json({
      period,
      totalExecutions: analytics.reduce((sum, a) => sum + a._count, 0),
      passRate,
      avgDuration: analytics.reduce((sum, a) => sum + (a._avg.durationSeconds || 0), 0) / analytics.length,
      byStatus: groupBy(analytics, 'status'),
      byTestType: groupBy(analytics, 'testType')
    })
  }
)
```

### AI Usage & Cost Management APIs

#### 3. AI Usage Summary
```typescript
// GET /api/ai-usage/summary
router.get('/ai-usage/summary',
  authenticateToken,
  async (req, res) => {
    const { tenantId, userId, role } = req.user
    const { period = 'current_month' } = req.query
    
    // Apply visibility rules
    const dataFilter = getAIDataVisibilityFilter(userId, role, tenantId)
    
    const summary = await prisma.aiUsageSummary.findFirst({
      where: {
        tenantId,
        ...dataFilter,
        period: period.toString()
      }
    })
    
    // Get budget status
    const budget = await prisma.aIBudget.findFirst({
      where: {
        tenantId,
        period: period.toString(),
        status: 'active'
      }
    })
    
    const budgetConsumed = budget ? 
      (summary.totalCost / budget.budgetUsd) * 100 : 0
    
    res.json({
      visibilityLevel: getVisibilityLevel(role),
      summary: {
        totalCostUsd: summary.totalCost,
        totalTokens: summary.totalTokens,
        totalRequests: summary.totalRequests,
        budgetUsd: budget?.budgetUsd || 0,
        budgetConsumedPercent: Math.round(budgetConsumed)
      },
      kpis: await generateAIKPIs(tenantId, period.toString()),
      trends: await getAITrends(tenantId, period.toString())
    })
  }
)
```

#### 4. Budget Management
```typescript
// POST /api/ai-usage/budgets
router.post('/ai-usage/budgets',
  authenticateToken,
  requireRole('admin', 'finance'),
  validateSchema({
    budgetType: 'enum:sprint,monthly,quarterly',
    budgetUsd: 'number>0',
    alertThresholdPercent: 'number:0,100',
    sprintId: 'string?'
  }),
  async (req, res) => {
    const budget = await prisma.aIBudget.create({
      data: {
        tenantId: req.user.tenantId,
        ...req.body,
        createdBy: req.user.userId
      }
    })
    
    // Trigger background job for budget monitoring
    await backgroundQueues.HIGH_PRIORITY.add('budget-monitoring', {
      budgetId: budget.id,
      action: 'initial_setup'
    })
    
    res.status(201).json(budget)
  }
)
```

### People Analytics APIs

#### 5. Team Health Overview
```typescript
// GET /api/people/team-health
router.get('/people/team-health',
  authenticateToken,
  requireRole('lead', 'admin', 'executive'),
  async (req, res) => {
    const { tenantId } = req.user
    const { productId, period = 'current_sprint' } = req.query
    
    const teamHealth = await prisma.teamHealthMetrics.findFirst({
      where: {
        tenantId,
        productId: productId?.toString() || undefined,
        periodType: 'sprint',
        periodStart: lte(new Date()),
        periodEnd: gte(new Date())
      }
    })
    
    // Calculate risk factors
    const riskFactors = {
      siloRisk: teamHealth.siloRiskCount > 3 ? 'high' : 'low',
      burnoutRisk: teamHealth.burnoutRiskScore > 70 ? 'high' : 'low',
      workloadBalance: teamHealth.overtimePercentage > 20 ? 'unbalanced' : 'balanced'
    }
    
    res.json({
      teamSize: teamHealth.teamSize,
      moraleScore: teamHealth.teamMoraleScore,
      collaborationIndex: teamHealth.crossTeamCollaborationScore,
      velocityStability: teamHealth.velocityStability,
      riskFactors,
      recommendations: generateTeamRecommendations(teamHealth)
    })
  }
)
```

#### 6. Knowledge Silo Analysis
```typescript
// GET /api/people/knowledge-silos
router.get('/people/knowledge-silos',
  authenticateToken,
  requireRole('lead', 'admin'),
  async (req, res) => {
    const { tenantId } = req.user
    const { riskLevel = 'all' } = req.query
    
    const silos = await prisma.knowledgeSiloAnalysis.findMany({
      where: {
        tenantId,
        riskLevel: riskLevel === 'all' ? undefined : riskLevel.toString()
      },
      include: {
        primaryOwner: { select: { fullName: true, email: true } },
        secondaryOwners: { select: { fullName: true, email: true } }
      }
    })
    
    // Calculate mitigation priority
    const prioritizedSilos = silos.map(silo => ({
      ...silo,
      priorityScore: calculateSiloPriority(silo),
      mitigationActions: generateMitigationActions(silo)
    }))
    
    res.json({
      silos: prioritizedSilos.sort((a, b) => b.priorityScore - a.priorityScore),
      summary: {
        total: silos.length,
        critical: silos.filter(s => s.riskLevel === 'critical').length,
        high: silos.filter(s => s.riskLevel === 'high').length,
        medium: silos.filter(s => s.riskLevel === 'medium').length
      }
    })
  }
)
```

## 🆕 AI Model Management APIs

### AI Models Configuration

```typescript
// GET /api/ai-models
// Get all AI models available to tenant
router.get('/ai-models',
  authenticateToken,
  requireRole('admin', 'tech_lead'),
  async (req, res) => {
    const models = await prisma.aIModel.findMany({
      where: {
        tenantId: req.user.tenantId,
        isActive: true
      },
      include: {
        sprint: true
      },
      orderBy: { provider: 'asc' }
    })
    
    res.json(models)
  }
)

// POST /api/ai-models
// Register new AI model for tenant
router.post('/ai-models',
  authenticateToken,
  requireRole('admin'),
  validateSchema({
    provider: 'required|string',
    modelId: 'required|string',
    modelName: 'required|string',
    modelType: 'required|enum:chat,completion,embedding,image,code',
    inputPricePer1kTokens: 'required|number>0',
    outputPricePer1kTokens: 'required|number>0',
    maxTokens: 'integer?',
    contextWindow: 'integer?'
  }),
  async (req, res) => {
    const model = await prisma.aIModel.create({
      data: {
        tenantId: req.user.tenantId,
        ...req.body,
        isActive: true
      }
    })
    
    res.status(201).json(model)
  }
)

// PUT /api/ai-models/:id
// Update AI model configuration
router.put('/ai-models/:id',
  authenticateToken,
  requireRole('admin'),
  validateSchema({
    inputPricePer1kTokens: 'number?',
    outputPricePer1kTokens: 'number?',
    isActive: 'boolean?',
    rateLimitRpm: 'integer?'
  }),
  async (req, res) => {
    const model = await prisma.aIModel.update({
      where: { id: req.params.id },
      data: req.body
    })
    
    res.json(model)
  }
)
```

## 🆕 AI Settings Configuration APIs

### AI User Settings

```typescript
// GET /api/ai-settings
// Get AI settings for current user
router.get('/ai-settings',
  authenticateToken,
  async (req, res) => {
    const settings = await prisma.aISettings.findUnique({
      where: {
        tenantId_userId: {
          tenantId: req.user.tenantId,
          userId: req.user.userId
        }
      }
    })
    
    res.json(settings || {})
  }
)

// PUT /api/ai-settings
// Update AI settings for current user
router.put('/ai-settings',
  authenticateToken,
  validateSchema({
    enableAiFeatures: 'boolean?',
    enableCodeReview: 'boolean?',
    enableTestGeneration: 'boolean?',
    defaultModelId: 'string?',
    maxTokensPerRequest: 'integer?',
    requireConfirmationForCost: 'number?'
  }),
  async (req, res) => {
    const settings = await prisma.aISettings.upsert({
      where: {
        tenantId_userId: {
          tenantId: req.user.tenantId,
          userId: req.user.userId
        }
      },
      create: {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        ...req.body
      },
      update: req.body
    })
    
    res.json(settings)
  }
)

// POST /ai-usage/record
// Record individual AI API usage
router.post('/ai-usage/record',
  authenticateToken,
  validateSchema({
    modelId: 'required|string',
    activityType: 'required|string',
    inputTokens: 'required|integer>=0',
    outputTokens: 'required|integer>=0',
    totalTokens: 'required|integer>=0',
    costUsd: 'required|number>=0',
    latencyMs: 'integer?',
    wasCached: 'boolean?',
    workItemId: 'string?',
    suggestionAccepted: 'boolean?'
  }),
  async (req, res) => {
    const usage = await prisma.aIUsageRecord.create({
      data: {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        ...req.body,
        requestedAt: new Date()
      }
    })
    
    // Trigger real-time budget monitoring
    await backgroundQueues.HIGH_PRIORITY.add('budget-monitoring', {
      tenantId: req.user.tenantId,
      usageAmount: req.body.costUsd
    })
    
    res.status(201).json(usage)
  }
)
```

## 🆕 Work Item Management APIs

### Bug & Work Item CRUD

```typescript
// GET /api/work-items
// Get work items with filters
router.get('/work-items',
  authenticateToken,
  validateSchema({
    page: 'integer?',
    limit: 'integer?',
    productIds: 'array?',
    sprintIds: 'array?',
    types: 'array?',
    priorities: 'array?',
    statuses: 'array?'
  }),
  async (req, res) => {
    const { page = 1, limit = 50, ...filters } = req.query
    
    const workItems = await prisma.workItem.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...filters
      },
      include: {
        product: true,
        sprint: true,
        assignee: true,
        coveredByTestCases: true
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    })
    
    res.json({
      data: workItems,
      page: parseInt(page),
      limit: parseInt(limit),
      total: await prisma.workItem.count({ where: filters })
    })
  }
)

// POST /api/work-items
// Create new work item
router.post('/work-items',
  authenticateToken,
  validateSchema({
    type: 'required|enum:bug,story,task,epic,technical_debt',
    title: 'required|string',
    description: 'string?',
    priority: 'enum:critical,high,medium,low?',
    productId: 'string?',
    sprintId: 'string?',
    assigneeId: 'string?'
  }),
  async (req, res) => {
    const workItem = await prisma.workItem.create({
      data: {
        tenantId: req.user.tenantId,
        createdBy: req.user.userId,
        ...req.body,
        externalSystem: 'manual',
        status: 'open'
      }
    })
    
    res.status(201).json(workItem)
  }
)

// GET /api/work-items/:id/similar-bugs
// Find similar bugs using AI analysis
router.get('/work-items/:id/similar-bugs',
  authenticateToken,
  async (req, res) => {
    const similarBugs = await prisma.bugSimilarity.findMany({
      where: {
        sourceBugId: req.params.id,
        similarityScore: { gte: 0.7 }
      },
      include: {
        similarBug: {
          include: {
            product: true,
            sprint: true
          }
        }
      },
      orderBy: { similarityScore: 'desc' },
      take: 10
    })
    
    res.json(similarBugs)
  }
)
```

## 🆕 Test Management APIs

### Test Case Management

```typescript
// GET /api/test-cases
// Get test cases with filters
router.get('/test-cases',
  authenticateToken,
  validateSchema({
    productId: 'string?',
    sprintId: 'string?',
    automationStatus: 'enum:manual,automated,hybrid?',
    testType: 'string?'
  }),
  async (req, res) => {
    const testCases = await prisma.testCase.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...req.query
      },
      include: {
        product: true,
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 1
        }
      }
    })
    
    res.json(testCases)
  }
)

// POST /api/test-cases
// Create new test case
router.post('/test-cases',
  authenticateToken,
  validateSchema({
    name: 'required|string',
    description: 'string?',
    testType: 'required|string',
    automationStatus: 'required|string',
    productId: 'string?',
    coveredStoryIds: 'array?',
    testSteps: 'object?'
  }),
  async (req, res) => {
    const testCase = await prisma.testCase.create({
      data: {
        tenantId: req.user.tenantId,
        createdBy: req.user.userId,
        ...req.body
      }
    })
    
    res.status(201).json(testCase)
  }
)

// POST /api/test-cases/:id/execute
// Record test execution
router.post('/test-cases/:id/execute',
  authenticateToken,
  validateSchema({
    status: 'required|enum:passed,failed,skipped',
    executedBy: 'required|string',
    executionNotes: 'string?',
    evidenceUrls: 'array?'
  }),
  async (req, res) => {
    const execution = await prisma.testExecution.create({
      data: {
        testCaseId: req.params.id,
        tenantId: req.user.tenantId,
        ...req.body,
        executedAt: new Date()
      }
    })
    
    res.status(201).json(execution)
  }
)
```

## 🆕 Sprint & Product Management APIs

### Sprint Management

```typescript
// GET /api/sprints
// Get all sprints for tenant
router.get('/sprints',
  authenticateToken,
  async (req, res) => {
    const sprints = await prisma.sprint.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...req.query
      },
      include: {
        product: true,
        team: true
      },
      orderBy: { startDate: 'desc' }
    })
    
    res.json(sprints)
  }
)

// POST /api/sprints
// Create new sprint
router.post('/sprints',
  authenticateToken,
  requireRole('admin', 'product_owner'),
  validateSchema({
    name: 'required|string',
    productId: 'required|string',
    startDate: 'required|date',
    endDate: 'required|date',
    goal: 'string?'
  }),
  async (req, res) => {
    const sprint = await prisma.sprint.create({
      data: {
        tenantId: req.user.tenantId,
        ...req.body
      }
    })
    
    res.status(201).json(sprint)
  }
)

// GET /api/sprints/:id/metrics
// Get sprint metrics and KPIs
router.get('/sprints/:id/metrics',
  authenticateToken,
  async (req, res) => {
    const sprint = await prisma.sprint.findUnique({
      where: { id: req.params.id },
      include: {
        workItems: {
          where: { tenantId: req.user.tenantId }
        },
        qualityMetrics: {
          where: { tenantId: req.user.tenantId }
        },
        teamHealthMetrics: {
          where: { tenantId: req.user.tenantId }
        }
      }
    })
    
    // Calculate sprint metrics
    const metrics = {
      totalWorkItems: sprint.workItems.length,
      completedWorkItems: sprint.workItems.filter(wi => wi.status === 'done').length,
      bugCount: sprint.workItems.filter(wi => wi.type === 'bug').length,
      avgResolutionTime: calculateAvgResolutionTime(sprint.workItems),
      testCoverage: calculateTestCoverage(sprint.workItems),
      teamVelocity: calculateTeamVelocity(sprint),
      qualityScore: sprint.qualityMetrics[0] || null
    }
    
    res.json(metrics)
  }
)
```

---

## 🚨 Rate Limiting Strategy

### Per-Tenant Rate Limits
```typescript
// middleware/rate-limit.ts
import rateLimit from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'

export const rateLimitConfigs = {
  // API endpoints
  api: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per window per tenant
    standardHeaders: true,
    keyGenerator: (req) => req.user?.tenantId || req.ip,
    message: 'Too many requests from your organization',
    store: new RedisStore({
      client: redis,
      prefix: 'rl:api:'
    })
  }),
  
  // Dashboard endpoints (stricter limits)
  dashboard: rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100, // 100 dashboard requests per window
    keyGenerator: (req) => `${req.user?.tenantId}:dashboard`,
    store: new RedisStore({
      client: redis,
      prefix: 'rl:dashboard:'
    })
  }),
  
  // Export/report generation (very strict)
  export: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 exports per hour
    keyGenerator: (req) => `${req.user?.tenantId}:export`,
    store: new RedisStore({
      client: redis,
      prefix: 'rl:export:'
    })
  }),
  
  // Webhook processing (per integration)
  webhook: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 webhook events per minute
    keyGenerator: (req) => `webhook:${req.params.integrationId}`,
    store: new RedisStore({
      client: redis,
      prefix: 'rl:webhook:'
    })
  })
}

// Apply rate limits
app.use('/api/', rateLimitConfigs.api)
app.use('/api/dashboard/', rateLimitConfigs.dashboard)
app.use('/api/export/', rateLimitConfigs.export)
app.use('/api/webhooks/', rateLimitConfigs.webhook)
```

### Rate Limit Error Handling
```typescript
app.use((req, res, next) => {
  res.rateLimit = {
    limit: req.rateLimit?.limit || 0,
    current: req.rateLimit?.current || 0,
    remaining: req.rateLimit?.remaining || 0
  }
  next()
})

// Rate limit exceeded handler
app.use((err, req, res, next) => {
  if (err instanceof RateLimitError) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: err.resetTime,
      limit: err.limit,
      current: err.current
    })
  }
  next(err)
})
```

---

## ⚠️ Error Handling & Response Standards

### Standardized Error Response
```typescript
// middleware/error-handler.ts
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ErrorResponse {
  error: string
  code?: string
  message: string
  details?: any
  timestamp: string
  path: string
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error('API Error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
    tenantId: req.user?.tenantId
  })
  
  if (err instanceof ApiError) {
    const response: ErrorResponse = {
      error: err.code || 'API_ERROR',
      message: err.message,
      details: err.details,
      timestamp: new Date().toISOString(),
      path: req.path
    }
    
    return res.status(err.statusCode).json(response)
  }
  
  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    let statusCode = 400
    let code = 'DATABASE_ERROR'
    
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        code = 'DUPLICATE_RECORD'
        statusCode = 409
        break
      case 'P2025': // Record not found
        code = 'NOT_FOUND'
        statusCode = 404
        break
      case 'P2003': // Foreign key constraint violation
        code = 'INVALID_REFERENCE'
        break
    }
    
    return res.status(statusCode).json({
      error: code,
      message: err.message,
      timestamp: new Date().toISOString(),
      path: req.path
    })
  }
  
  // Generic error response
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    path: req.path
  })
}
```

### Request Validation Middleware
```typescript
// middleware/validation.ts
import { z } from 'zod'

export function validateSchema<T extends z.ZodType>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body)
      next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        })
      }
      next(error)
    }
  }
}

// Usage example
const createBugSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']),
  assigneeId: z.string().uuid().optional(),
  sprintId: z.string().uuid().optional()
})

router.post('/api/bugs', validateSchema(createBugSchema), async (req, res) => {
  // req.body is now validated
  const bug = await prisma.workItem.create({
    data: req.body
  })
  res.json(bug)
})
```

---

## 🔧 Background Job Architecture

### Job Queue Configuration
```typescript
// lib/queues.ts
import { Queue, QueueScheduler, Worker } from 'bullmq'
import Redis from 'ioredis'

const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
})

// Queue configurations
export const queueConfigs = {
  highPriority: {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    }
  },
  
  default: {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  },
  
  lowPriority: {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    }
  }
}

// Initialize queues
export const queues = {
  highPriority: new Queue('high-priority', queueConfigs.highPriority),
  default: new Queue('default', queueConfigs.default),
  lowPriority: new Queue('low-priority', queueConfigs.lowPriority)
}

// Queue scheduler for delayed jobs
export const queueScheduler = new QueueScheduler('default', { connection })
```

### Job Processors
```typescript
// workers/jobs.ts
export const jobProcessors = {
  async 'ai-usage-aggregation'(job) {
    const { tenantId, startDate, endDate } = job.data
    
    console.log(`Processing AI usage aggregation for tenant ${tenantId}`)
    
    // Update job progress
    await job.updateProgress(10)
    
    // Calculate daily aggregations
    const dailyStats = await calculateDailyAIUsage(tenantId, startDate, endDate)
    await job.updateProgress(50)
    
    // Store aggregated data
    await prisma.aiUsageSnapshot.createMany({
      data: dailyStats,
      skipDuplicates: true
    })
    
    await job.updateProgress(90)
    
    // Invalidate relevant caches
    await invalidateTenantCache(tenantId)
    
    await job.updateProgress(100)
    
    return { success: true, recordsProcessed: dailyStats.length }
  },
  
  async 'budget-monitoring'(job) {
    const { budgetId } = job.data
    
    const budget = await prisma.aIBudget.findUnique({
      where: { id: budgetId },
      include: { tenant: true }
    })
    
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`)
    }
    
    // Calculate current spend
    const currentSpend = await calculateCurrentSpend(budget)
    const spendPercent = (currentSpend / budget.budgetUsd) * 100
    
    // Check alert thresholds
    if (spendPercent >= budget.alertThresholdPercent && !budget.alertSent) {
      // Send budget alert
      await sendBudgetAlert({
        budget,
        currentSpend,
        spendPercent: Math.round(spendPercent)
      })
      
      // Mark alert as sent
      await prisma.aIBudget.update({
        where: { id: budgetId },
        data: { alertSent: true }
      })
    }
    
    // Log budget status
    await prisma.aIBudget.update({
      where: { id: budgetId },
      data: {
        lastCheckedAt: new Date()
      }
    })
    
    return {
      budgetId,
      currentSpend,
      budgetRemaining: budget.budgetUsd - currentSpend,
      spendPercent: Math.round(spendPercent)
    }
  },
  
  async 'metrics-calculation'(job) {
    const { tenantId, productId, snapshotType, snapshotDate } = job.data
    
    // Calculate quality metrics for the period
    const metrics = await calculateQualityMetrics(tenantId, productId, snapshotDate)
    
    // Store snapshot
    const snapshot = await prisma.qualityMetricsSnapshot.upsert({
      where: {
        tenantId_productId_snapshotType_snapshotDate: {
          tenantId,
          productId,
          snapshotType,
          snapshotDate
        }
      },
      create: {
        tenantId,
        productId,
        snapshotType,
        snapshotDate,
        ...metrics
      },
      update: metrics
    })
    
    // Trigger any alerts based on metrics
    await checkMetricThresholds(snapshot)
    
    return snapshot
  },
  
  async 'report-generation'(job) {
    const { reportJobId } = job.data
    
    const reportJob = await prisma.exportJob.findUnique({
      where: { id: reportJobId },
      include: { user: true }
    })
    
    if (!reportJob) {
      throw new Error(`Report job ${reportJobId} not found`)
    }
    
    // Update status
    await prisma.exportJob.update({
      where: { id: reportJobId },
      data: { status: 'processing', processingStartedAt: new Date() }
    })
    
    try {
      // Generate report based on type
      const reportData = await generateReport(reportJob)
      
      // Upload to storage
      const fileUrl = await uploadReport(reportData, reportJob.fileName)
      
      // Update job with results
      await prisma.exportJob.update({
        where: { id: reportJobId },
        data: {
          status: 'completed',
          fileUrl,
          processingCompletedAt: new Date()
        }
      })
      
      // Notify user
      await sendReportNotification(reportJob.user, fileUrl)
      
      return { success: true, fileUrl }
      
    } catch (error) {
      // Update job with error
      await prisma.exportJob.update({
        where: { id: reportJobId },
        data: {
          status: 'failed',
          errorMessage: error.message
        }
      })
      
      throw error
    }
  }
}
```

### Worker Initialization
```typescript
// workers/index.ts
export function initializeWorkers() {
  const workers = []
  
  // High priority worker (concurrency: 10)
  const highPriorityWorker = new Worker('high-priority', async (job) => {
    const processor = jobProcessors[job.name]
    if (!processor) {
      throw new Error(`Unknown job type: ${job.name}`)
    }
    return await processor(job)
  }, {
    connection,
    concurrency: 10,
    limiter: {
      max: 100,
      duration: 60000 // Rate limit job processing
    }
  })
  
  // Default worker (concurrency: 5)
  const defaultWorker = new Worker('default', async (job) => {
    const processor = jobProcessors[job.name]
    if (!processor) {
      throw new Error(`Unknown job type: ${job.name}`)
    }
    return await processor(job)
  }, { connection, concurrency: 5 })
  
  // Low priority worker (concurrency: 2)
  const lowPriorityWorker = new Worker('low-priority', async (job) => {
    const processor = jobProcessors[job.name]
    if (!processor) {
      throw new Error(`Unknown job type: ${job.name}`)
    }
    return await processor(job)
  }, { connection, concurrency: 2 })
  
  workers.push(highPriorityWorker, defaultWorker, lowPriorityWorker)
  
  // Error handling
  workers.forEach(worker => {
    worker.on('completed', (job, result) => {
      console.log(`✓ Job ${job.id} (${job.name}) completed:`, result)
    })
    
    worker.on('failed', (job, err) => {
      console.error(`✗ Job ${job?.id} (${job?.name}) failed:`, err.message)
      
      // Log failed jobs for monitoring
      logJobFailure(job, err)
    })
  })
  
  return workers
}
```

### Job Scheduling
```typescript
// lib/scheduler.ts
export function scheduleRecurringJobs() {
  // AI usage aggregation - runs daily at 2 AM
  schedule('0 2 * * *', 'ai-usage-aggregation', {
    period: 'daily',
    runAt: new Date().toISOString().split('T')[0]
  })
  
  // Budget monitoring - runs every 15 minutes
  schedule('*/15 * * * *', 'budget-monitoring', {
    checkAll: true
  })
  
  // Quality metrics calculation - runs every hour
  schedule('0 * * * *', 'metrics-calculation', {
    calculateFor: 'all_active_tenants'
  })
  
  // Data cleanup - runs daily at 3 AM
  schedule('0 3 * * *', 'data-cleanup', {
    retentionDays: 90
  })
  
  // Health check - runs every 5 minutes
  schedule('*/5 * * * *', 'health-check', {
    check: ['database', 'redis', 'queues']
  })
}
```

This comprehensive API specification document addresses all critical implementation gaps including:

1. **Authentication & Authorization** - JWT strategy, RBAC middleware
2. **Rate Limiting** - Per-tenant limits with Redis storage
3. **Error Handling** - Standardized error responses and validation
4. **Background Jobs** - Complete queue architecture with processors
5. **Monitoring** - Health checks and job failure tracking

The specifications are production-ready and address all the high-priority risks identified in the evaluation.
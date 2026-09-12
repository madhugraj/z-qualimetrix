import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import { healthCheck, databaseInfo } from './controllers/health.controller'
import apiRoutes from './routes'
import { assertJwtSecretConfigured } from '../lib/jwt'
import { startScheduler, registerAiProviderSyncHandler, registerSyncHandler, registerGithubCommitSyncHandler } from '../lib/scheduler'
import { syncAllProductsForIntegration as syncAllJira } from './services/jira-sync.service'
import { syncAllConfluence } from './services/confluence-sync.service'
import { syncAllProductsForIntegration as syncAllAdo } from './services/azure-devops-sync.service'
import { syncOpenAiUsage } from './services/openai-usage-sync.service'
import { syncAnthropicConnection } from './services/anthropic-usage-sync.service'
import { syncVertexAiConnection } from './services/vertex-ai-usage-sync.service'
import { syncGcpGpuCost } from './services/gcp-gpu-cost-sync.service'
import { syncAwsGpuCost } from './services/aws-gpu-cost-sync.service'
import { syncAzureGpuCost } from './services/azure-gpu-cost-sync.service'
import { syncKrutrimGpuCost } from './services/krutrim-gpu-cost-sync.service'
import { syncGithubCommits } from './services/github-commit-sync.service'

// Load environment variables
dotenv.config()

// Fail closed rather than start with a forgeable OAuth-state secret.
assertJwtSecretConfigured()

// Initialize Express app
const app = express()
const PORT = process.env.PORT || 3001

// Middleware
// credentials:true + an explicit origin (not '*') is required once anything
// on this API issues cookies — matches the CORS shape the parallel auth
// session's branch already uses, kept consistent so it reconciles cleanly
// when both branches merge.
//
// In development, accept any localhost/127.0.0.1 origin regardless of port —
// Vite's dev server port varies (auto-increments when its default is taken),
// so pinning CORS to one hardcoded port breaks every time it picks a
// different one. Also trust *.devtunnels.ms (VS Code's port-forwarding
// service) for remote testing (e.g. a PM completing an OAuth flow from
// their own machine) — the exact subdomain changes per tunnel session, so
// this is a pattern match, not a fixed origin. Production still requires an
// exact FRONTEND_ORIGIN match — neither of these dev allowances apply there.
const isProduction = process.env.NODE_ENV === 'production'
const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const devTunnelOriginPattern = /^https:\/\/[a-z0-9-]+\.devtunnels\.ms$/

app.use(cors({
  origin: isProduction
    ? process.env.FRONTEND_ORIGIN
    : (origin, callback) => {
        if (!origin || localhostOriginPattern.test(origin) || devTunnelOriginPattern.test(origin)) {
          return callback(null, true)
        }
        callback(new Error(`Origin ${origin} not allowed by CORS`))
      },
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString()
  console.log(`${timestamp} - ${req.method} ${req.path}`)
  next()
})

// Health check endpoints
app.get('/health', healthCheck)
app.get('/api/v1/health', healthCheck)
app.get('/api/v1/database-info', databaseInfo)

// API information endpoint
app.get('/api/v1', (req: Request, res: Response) => {
  res.json({
    message: 'QualiMetrix API v1',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      database: '/api/v1/database-info',
      tenants: '/api/v1/tenants',
      users: '/api/v1/users',
      products: '/api/v1/products',
      workItems: '/api/v1/work-items',
      testCases: '/api/v1/test-cases'
    }
  })
})

// API routes
app.use('/api/v1', apiRoutes)

// Error handling middleware
app.use((err: Error & { status?: number; statusCode?: number }, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err)
  const status = err.status ?? err.statusCode ?? 500
  res.status(status).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 QualiMetrix API server running on http://localhost:${PORT}`)
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`)

  registerSyncHandler('jira', syncAllJira)
  registerSyncHandler('confluence', syncAllConfluence)
  registerSyncHandler('azure_devops', syncAllAdo)
  registerSyncHandler('openai', syncOpenAiUsage)
  registerAiProviderSyncHandler('anthropic', syncAnthropicConnection)
  // One GCP connection backs two distinct facts (Vertex AI/Gemini token
  // usage, GPU-compute rental cost) from the same Billing Export table — run
  // both per due connection rather than needing two separate vendor slots.
  registerAiProviderSyncHandler('gcp', async (connection) => {
    await syncVertexAiConnection(connection)
    await syncGcpGpuCost(connection)
  })
  registerAiProviderSyncHandler('aws', syncAwsGpuCost)
  registerAiProviderSyncHandler('azure', syncAzureGpuCost)
  registerAiProviderSyncHandler('krutrim', syncKrutrimGpuCost)
  registerGithubCommitSyncHandler(syncGithubCommits)
  startScheduler()
})

export default app

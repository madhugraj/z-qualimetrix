import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { healthCheck, databaseInfo } from './controllers/health.controller'
import apiRoutes from './routes'

// Load environment variables
dotenv.config()

// Initialize Express app
const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
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
})

export default app
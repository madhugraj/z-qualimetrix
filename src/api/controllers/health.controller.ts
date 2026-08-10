import { Request, Response } from 'express'
import prisma from '../../lib/prisma'

export const healthCheck = async (req: Request, res: Response) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`

    res.json({
      status: 'ok',
      message: 'QualiMetrix API is running',
      database: 'connected',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export const databaseInfo = async (req: Request, res: Response) => {
  try {
    // Get database info
    const tenantCount = await prisma.tenant.count()
    const userCount = await prisma.user.count()
    const productCount = await prisma.product.count()

    res.json({
      status: 'ok',
      database: {
        connected: true,
        tables: {
          tenants: tenantCount,
          users: userCount,
          products: productCount
        },
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get database info',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
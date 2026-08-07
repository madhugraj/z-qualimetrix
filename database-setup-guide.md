# Database Setup & Migration Guide

## Prerequisites

### 1. PostgreSQL Installation
```bash
# macOS (using Homebrew)
brew install postgresql@15
brew services start postgresql@15

# Ubuntu/Debian
sudo apt update
sudo apt install postgresql-15
sudo systemctl start postgresql

# Docker
docker run --name qualimetrix-db \
  -e POSTGRES_USER=qualimetrix \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=qualimetrix \
  -p 5432:5432 \
  -d postgres:15-alpine
```

### 2. Redis Installation (for caching & sessions)
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis

# Docker
docker run --name qualimetrix-redis \
  -p 6379:6379 \
  -d redis:7-alpine
```

---

## Environment Configuration

Create `.env` file in project root:

```env
# Database Configuration
DATABASE_URL="postgresql://qualimetrix:password@localhost:5432/qualimetrix?schema=public"
DIRECT_URL="postgresql://qualimetrix:password@localhost:5432/qualimetrix?schema=public"

# Redis Configuration
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-change-this"
JWT_REFRESH_SECRET="your-refresh-token-secret-change-this"
JWT_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"

# Encryption Keys (for sensitive data)
ENCRYPTION_KEY="your-32-character-encryption-key"
ENCRYPTION_IV="your-16-character-iv"

# Application Configuration
NODE_ENV="development"
APP_URL="http://localhost:3000"
API_BASE_URL="http://localhost:3001"

# External Integrations (optional for development)
JIRA_CLIENT_ID=""
JIRA_CLIENT_SECRET=""
AZURE_DEVOPS_CLIENT_ID=""
AZURE_DEVOPS_CLIENT_SECRET=""
```

---

## Prisma Setup

### 1. Install Dependencies
```bash
# Install Prisma CLI
npm install -D prisma

# Install Prisma Client
npm install @prisma/client

# Install additional dependencies
npm install bcrypt jsonwebtoken uuid
npm install -D @types/bcrypt @types/jsonwebtoken
```

### 2. Initialize Prisma
```bash
# Generate Prisma Client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# Open Prisma Studio (optional GUI)
npx prisma studio
```

### 3. Seed Database
Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting database seed...')

  // Create Demo Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo',
      domain: 'demo.qualimetrix.com',
      subscriptionTier: 'professional',
      maxUsers: 50,
      maxProducts: 10,
      settings: {
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        defaultSprintLength: 14
      }
    }
  })

  console.log(`Created tenant: ${tenant.name}`)

  // Create Admin User
  const hashedPassword = await bcrypt.hash('admin123', 12)
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@qualimetrix.com' },
    update: {},
    create: {
      email: 'admin@qualimetrix.com',
      passwordHash: hashedPassword,
      fullName: 'System Administrator',
      authProvider: 'local',
      isSystemAdmin: true,
      emailVerified: true
    }
  })

  console.log(`Created admin user: ${adminUser.email}`)

  // Create Tenant Admin Membership
  const membership = await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: adminUser.id
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: adminUser.id,
      role: 'admin',
      notificationSettings: {
        email: true,
        push: false,
        slack: false
      }
    }
  })

  console.log(`Created admin membership`)

  // Create Demo Products
  const products = await Promise.all([
    prisma.product.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: 'ATLAS' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Atlas Core',
        key: 'ATLAS',
        description: 'Core platform infrastructure and services',
        jiraProjectKey: 'ATLAS',
        color: '#0ea5e9'
      }
    }),
    prisma.product.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: 'NIMBUS' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Nimbus Billing',
        key: 'NIMBUS',
        description: 'Billing and subscription management',
        azureDevopsAreaPath: 'Nimbus',
        color: '#8b5cf6'
      }
    }),
    prisma.product.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: 'ORB' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Orbit Mobile',
        key: 'ORB',
        description: 'Mobile application platform',
        githubRepoFullName: 'qualimetrix/orbit-mobile',
        color: '#10b981'
      }
    })
  ])

  console.log(`Created ${products.length} products`)

  // Create Demo Users
  const demoUsers = await Promise.all([
    prisma.user.upsert({
      where: { email: 'priya.n@qualimetrix.com' },
      update: {},
      create: {
        email: 'priya.n@qualimetrix.com',
        passwordHash: await bcrypt.hash('demo123', 12),
        fullName: 'Priya Natarajan',
        authProvider: 'local',
        emailVerified: true
      }
    }),
    prisma.user.upsert({
      where: { email: 'marcus.l@qualimetrix.com' },
      update: {},
      create: {
        email: 'marcus.l@qualimetrix.com',
        passwordHash: await bcrypt.hash('demo123', 12),
        fullName: 'Marcus Lee',
        authProvider: 'local',
        emailVerified: true
      }
    }),
    prisma.user.upsert({
      where: { email: 'sofia.r@qualimetrix.com' },
      update: {},
      create: {
        email: 'sofia.r@qualimetrix.com',
        passwordHash: await bcrypt.hash('demo123', 12),
        fullName: 'Sofia Rodriguez',
        authProvider: 'local',
        emailVerified: true
      }
    })
  ])

  console.log(`Created ${demoUsers.length} demo users`)

  // Create User Memberships with different roles
  await Promise.all([
    prisma.tenantMembership.upsert({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: demoUsers[0].id }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: demoUsers[0].id,
        role: 'tester',
        defaultProductId: products[0].id
      }
    }),
    prisma.tenantMembership.upsert({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: demoUsers[1].id }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: demoUsers[1].id,
        role: 'developer',
        defaultProductId: products[0].id
      }
    }),
    prisma.tenantMembership.upsert({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: demoUsers[2].id }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: demoUsers[2].id,
        role: 'po',
        defaultProductId: products[0].id
      }
    })
  ])

  console.log('Created user memberships')

  // Create Demo Sprints
  const currentDate = new Date()
  const sprintLength = 14 // days

  for (let i = 12; i >= 9; i--) {
    const startDate = new Date(currentDate)
    startDate.setDate(startDate.getDate() - ((12 - i) * sprintLength))
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + sprintLength)

    await prisma.sprint.upsert({
      where: {
        tenantId_productId_sequence: {
          tenantId: tenant.id,
          productId: products[0].id,
          sequence: i
        }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        productId: products[0].id,
        name: `Sprint ${i}`,
        sequence: i,
        startDate,
        endDate,
        state: i === 12 ? 'active' : i === 11 ? 'active' : 'closed',
        externalId: `SPRINT-${i}`
      }
    })
  }

  console.log('Created demo sprints')

  // Create Demo Work Items (Bugs)
  const sampleBugs = [
    {
      externalId: 'ATL-2201',
      title: 'Invoice modal overflows on 13-inch screens',
      description: 'CSS layout breaks, modal content clipped, responsive breakpoint missing.',
      priority: 'P2',
      domain: 'UI/UX',
      component: 'Billing',
      assigneeId: demoUsers[0].id
    },
    {
      externalId: 'NIM-914',
      title: 'Payment API returns 500 on proration query timeout',
      description: 'Database query timeout in the proration endpoint under load.',
      priority: 'P0',
      domain: 'Backend/API',
      component: 'Payments',
      assigneeId: demoUsers[1].id
    },
    {
      externalId: 'VRT-455',
      title: 'Assistant hallucinates account balances in summary',
      description: 'LLM prompt lacks grounding, model returns invented numbers from embeddings.',
      priority: 'P0',
      domain: 'AI/ML Team',
      component: 'AI Engine',
      assigneeId: demoUsers[2].id
    }
  ]

  for (const bug of sampleBugs) {
    await prisma.workItem.upsert({
      where: {
        tenantId_externalSystem_externalId: {
          tenantId: tenant.id,
          externalSystem: 'jira',
          externalId: bug.externalId
        }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        productId: products[0].id,
        externalSystem: 'jira',
        externalId: bug.externalId,
        itemType: 'bug',
        status: 'Open',
        priority: bug.priority,
        title: bug.title,
        description: bug.description,
        domain: bug.domain,
        domainConfidence: 0.85,
        component: bug.component,
        assigneeId: bug.assigneeId,
        externalUrl: `https://jira.qualimetrix.com/browse/${bug.externalId}`,
        externalCreatedAt: new Date(),
        externalUpdatedAt: new Date()
      }
    })
  }

  console.log('Created demo work items')

  // Create Quality Metrics Snapshots
  const metricsDate = new Date()
  for (let i = 6; i >= 0; i--) {
    const snapshotDate = new Date(metricsDate)
    snapshotDate.setDate(snapshotDate.getDate() - (i * 2))

    await prisma.qualityMetricsSnapshot.upsert({
      where: {
        tenantId_productId_snapshotType_snapshotDate: {
          tenantId: tenant.id,
          productId: products[0].id,
          snapshotType: 'daily',
          snapshotDate
        }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        productId: products[0].id,
        snapshotType: 'daily',
        snapshotDate,
        testCasesExecuted: 350 + (i * 10),
        testCasesPassed: 320 + (i * 12),
        testCasesFailed: 25 - i,
        testCasesBlocked: 5 - Math.floor(i / 2),
        testAutomationRate: 0.68 + (i * 0.01),
        bugsCreated: 18 - i,
        bugsResolved: 15 + i,
        bugsEscaped: 11 - i,
        bugsReopened: 4 - Math.floor(i / 2),
        defectLeakageRate: 0.07 - (i * 0.005),
        mttr: 6.1 - (i * 0.4),
        firstTimeFixRate: 0.72 + (i * 0.02),
        releaseReadinessScore: 0.62 + (i * 0.04),
        openP0P1Count: 4 + Math.floor(i / 2),
        regressionPassRate: 0.88 + (i * 0.01)
      }
    })
  }

  console.log('Created quality metrics snapshots')

  console.log('Database seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

Add seed script to `package.json`:

```json
{
  "scripts": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

Run the seed:
```bash
npm run seed
```

---

## Database Migration Strategy

### Development Workflow
```bash
# Create a new migration
npx prisma migrate dev --name add_user_preferences

# Reset database (development only!)
npx prisma migrate reset

# Generate Prisma Client after schema changes
npx prisma generate
```

### Production Workflow with Zero-Downtime Strategy

```bash
# 1. Create migration without applying
npx prisma migrate dev --create-only --name add_ai_tables

# 2. Review migration SQL
npx prisma migrate show

# 3. Test migration in staging environment
npx prisma migrate deploy --skip-generate

# 4. Production deployment with zero-downtime steps

# Step 1: Add new tables (non-breaking changes)
npx prisma migrate deploy --skip-generate
# This adds new tables/columns without affecting existing functionality

# Step 2: Deploy application code compatible with both old and new schema
# This allows rolling update without downtime

# Step 3: Verify new schema is working
curl -f https://api.qualimetrix.com/health || rollback

# Step 4: If successful, complete any data migrations
npx prisma migrate deploy

# Step 5: Finalize application deployment
# Full rollout of new features

# Resolve migration conflicts if needed
npx prisma migrate resolve --applied "20231201000000_add_user_preferences"
```

### Zero-Downtime Migration Strategy

```typescript
// scripts/migration-deployment.ts
import { PrismaClient } from '@prisma/client'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface MigrationStep {
  name: string
  check: () => Promise<boolean>
  execute: () => Promise<void>
  rollback: () => Promise<void>
}

export class ZeroDowntimeMigration {
  private prisma: PrismaClient
  private steps: MigrationStep[] = []
  private completedSteps: string[] = []

  constructor() {
    this.prisma = new PrismaClient()
  }

  addStep(step: MigrationStep) {
    this.steps.push(step)
    return this
  }

  async execute(): Promise<boolean> {
    console.log('Starting zero-downtime migration...')

    for (const step of this.steps) {
      try {
        console.log(`Executing step: ${step.name}`)
        
        // Check if step can be executed
        const canExecute = await step.check()
        if (!canExecute) {
          console.log(`Skipping step: ${step.name} (pre-check failed)`)
          continue
        }

        // Execute the step
        await step.execute()
        this.completedSteps.push(step.name)
        console.log(`✓ Completed: ${step.name}`)

        // Small delay to ensure changes propagate
        await this.delay(2000)
        
      } catch (error) {
        console.error(`✗ Failed at step: ${step.name}`)
        console.error('Initiating rollback...')
        
        await this.rollback()
        throw error
      }
    }

    console.log('Migration completed successfully!')
    return true
  }

  private async rollback() {
    console.log('Rolling back completed steps...')
    
    // Rollback in reverse order
    for (const stepName of [...this.completedSteps].reverse()) {
      const step = this.steps.find(s => s.name === stepName)
      if (step) {
        try {
          await step.rollback()
          console.log(`✓ Rolled back: ${step.name}`)
        } catch (error) {
          console.error(`✗ Rollback failed for: ${step.name}`)
        }
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Example usage for AI tables migration
export async function deployAIMigration() {
  const migration = new ZeroDowntimeMigration()

  migration.addStep({
    name: 'Create new AI tables',
    check: async () => {
      const result = await this.prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'ai_models'
        )
      `
      return !result[0].exists
    },
    execute: async () => {
      await execAsync('npx prisma migrate deploy')
      console.log('AI tables created')
    },
    rollback: async () => {
      await this.prisma.$executeRaw`
        DROP TABLE IF EXISTS ai_usage_records, ai_usage_snapshots, 
                        ai_budgets, ai_models, ai_settings CASCADE
      `
    }
  })

  migration.addStep({
    name: 'Backfill AI model configuration',
    check: async () => {
      const count = await this.prisma.aIModel.count()
      return count === 0
    },
    execute: async () => {
      // Seed default AI models
      await this.prisma.aIModel.createMany({
        data: [
          {
            tenantId: 'default',
            modelId: 'claude-sonnet-4-20250514',
            modelName: 'Claude Sonnet 4',
            vendor: 'anthropic',
            inputPricePer1kTokens: 3.0,
            outputPricePer1kTokens: 15.0,
            primaryPurpose: 'code_generation',
            supportedActivities: ['code', 'docs', 'review'],
            isActive: true
          },
          {
            tenantId: 'default',
            modelId: 'gpt-4-turbo',
            modelName: 'GPT-4 Turbo',
            vendor: 'openai',
            inputPricePer1kTokens: 0.01,
            outputPricePer1kTokens: 0.03,
            primaryPurpose: 'general_purpose',
            supportedActivities: ['code', 'test', 'docs'],
            isActive: true
          }
        ]
      })
    },
    rollback: async () => {
      await this.prisma.aIModel.deleteMany()
    }
  })

  return migration.execute()
}
```

### Database Backup & Restore Procedures

```bash
#!/bin/bash
# scripts/backup-production.sh

# Configuration
BACKUP_DIR="/backups/qualimetrix/production"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="qualimetrix_prod_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=30

# Create backup directory
mkdir -p ${BACKUP_DIR}

# Perform backup with consistency
pg_dump -h ${PRODUCTION_DB_HOST} \
  -U ${PRODUCTION_DB_USER} \
  -d ${PRODUCTION_DB_NAME} \
  -F c \
  -f ${BACKUP_DIR}/${BACKUP_FILE} \
  --verbose

# Compress backup
gzip ${BACKUP_DIR}/${BACKUP_FILE}

# Upload to cloud storage (AWS S3, Azure Blob, etc.)
aws s3 cp ${BACKUP_DIR}/${BACKUP_FILE}.gz \
  s3://${BACKUP_BUCKET}/production/

# Clean up old backups
find ${BACKUP_DIR} -name "qualimetrix_prod_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "Backup completed: ${BACKUP_FILE}"

# Restore procedure (if needed)
#!/bin/bash
# scripts/restore-from-backup.sh

BACKUP_FILE=${1} # e.g., qualimetrix_prod_20260806_120000.sql.gz

# Download from cloud storage
aws s3 cp s3://${BACKUP_BUCKET}/production/${BACKUP_FILE} /tmp/

# Extract and restore
gunzip /tmp/${BACKUP_FILE}
pg_restore -h ${RESTORE_DB_HOST} \
  -U ${RESTORE_DB_USER} \
  -d ${RESTORE_DB_NAME} \
  -j 4 \ # Use 4 concurrent jobs
  --clean --if-exists \
  /tmp/${BACKUP_FILE%.gz}

echo "Restore completed from: ${BACKUP_FILE}"
```

### Monitoring Migration Health

```typescript
// scripts/migration-monitor.ts
export async function monitorMigrationHealth() {
  const healthChecks = {
    database connectivity: async () => {
      try {
        await prisma.$queryRaw`SELECT 1`
        return { status: 'healthy', latency: Date.now() - startTime }
      } catch (error) {
        return { status: 'unhealthy', error: error.message }
      }
    },
    
    newTablesAccessible: async () => {
      const tables = ['ai_models', 'ai_usage_records', 'ai_budgets']
      const results = await Promise.all(
        tables.map(table => 
          prisma.$queryRaw`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = ${table})`
        )
      )
      return {
        status: results.every(r => r[0].exists) ? 'healthy' : 'unhealthy',
        tables: Object.fromEntries(tables.map((t, i) => [t, results[i][0].exists]))
      }
    },
    
    queryPerformance: async () => {
      const startTime = Date.now()
      await prisma.aIModel.findMany({ take: 1 })
      const latency = Date.now() - startTime
      return {
        status: latency < 100 ? 'healthy' : 'degraded',
        latency: `${latency}ms`
      }
    },
    
    dataIntegrity: async () => {
      const aiModelsCount = await prisma.aIModel.count()
      const tenantConfigCount = await prisma.tenantConfiguration.count()
      
      return {
        status: 'healthy',
        counts: { aiModels: aiModelsCount, tenantConfigs: tenantConfigCount }
      }
    }
  }

  const results = await Promise.all(
    Object.entries(healthChecks).map(async ([name, check]) => {
      try {
        const result = await check()
        return [name, result]
      } catch (error) {
        return [name, { status: 'error', error: error.message }]
      }
    })
  )

  console.log('Migration Health Check Results:')
  console.table(Object.fromEntries(results))
  
  const overallHealth = Object.values(results).every(([_, result]: any) => result.status === 'healthy')
  return overallHealth ? 'HEALTHY' : 'ISSUES_DETECTED'
}
```

---

## PostgreSQL Extensions Setup

Connect to your database and run:

```sql
-- Enable UUID generation (already available in PostgreSQL 13+)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full-text search and trigrams
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enable vector similarity search for AI features
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enable additional statistical functions
CREATE EXTENSION IF NOT EXISTS "tablefunc";

-- Verify extensions
SELECT * FROM pg_extension WHERE extname IN ('uuid-ossp', 'pg_trgm', 'vector', 'tablefunc');
```

---

## Performance Optimization

### 1. Connection Pooling
Install and configure PgBouncer:

```bash
# Install PgBouncer
brew install pgbouncer  # macOS
sudo apt install pgbouncer  # Ubuntu

# Configure PgBouncer (pgbouncer.ini)
[databases]
qualimetrix = host=localhost port=5432 dbname=qualimetrix

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
reserve_pool_size = 10
reserve_pool_timeout = 3
server_lifetime = 3600
server_idle_timeout = 600
```

### 2. Database Indexes
The Prisma schema includes optimized indexes. To add custom indexes:

```prisma
// Add to your model
@@index([tenantId, userId, status])
@@index([createdAt(sort: Desc)])
```

### 3. Query Optimization
Monitor slow queries:

```sql
-- Enable query logging
ALTER DATABASE qualimetrix SET log_min_duration_statement = 1000;

-- View slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

---

## Backup & Recovery

### Automated Backups
Create backup script `scripts/backup-database.sh`:

```bash
#!/bin/bash

# Database Backup Script
BACKUP_DIR="/backups/qualimetrix"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="qualimetrix_backup_${TIMESTAMP}.sql.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Perform backup
pg_dump -h localhost -U qualimetrix qualimetrix | gzip > $BACKUP_DIR/$BACKUP_FILE

# Keep only last 30 days of backups
find $BACKUP_DIR -name "qualimetrix_backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
```

### Restore from Backup
```bash
# Restore from backup
gunzip -c /backups/qualimetrix/qualimetrix_backup_20231201_120000.sql.gz | psql -h localhost -U qualimetrix qualimetrix

# Point-in-time recovery
# Configure postgresql.conf for WAL archiving
restore_command = 'cp /wal_archive/%f %p'
recovery_target_time = '2023-12-01 12:00:00'
```

---

## Monitoring & Maintenance

### 1. Health Check Script
```typescript
// scripts/health-check.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function healthCheck() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1 as health_check`
    
    // Check table counts
    const tenantCount = await prisma.tenant.count()
    const userCount = await prisma.user.count()
    const workItemCount = await prisma.workItem.count()
    
    // Check recent activity
    const recentActivity = await prisma.activityTimeline.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    })
    
    console.log({
      status: 'healthy',
      database: 'connected',
      stats: {
        tenants: tenantCount,
        users: userCount,
        workItems: workItemCount,
        recentActivity24h: recentActivity
      }
    })
  } catch (error) {
    console.error('Health check failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

healthCheck()
```

### 2. Regular Maintenance Tasks
```sql
-- Weekly table analysis
ANALYZE work_items, test_cases, quality_metrics_snapshots;

-- Monthly vacuum and reindex
VACUUM ANALYZE;
REINDEX DATABASE CONCURRENTLY qualimetrix;

-- Check table bloat
SELECT 
  schemaname, tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_stat_get_dead_tuples(c.oid) AS dead_tuples
FROM pg_class c
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE relkind = 'r' AND n.nspname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Security Hardening

### 1. Row-Level Security Policies
```sql
-- Enable RLS on sensitive tables
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policy
CREATE POLICY tenant_isolation_work_items 
ON work_items FOR ALL
USING (
  tenant_id = (
    SELECT tm.tenant_id 
    FROM tenant_memberships tm
    JOIN users u ON u.id = tm.user_id
    WHERE u.email = current_setting('app.current_user_email')
    LIMIT 1
  )
);
```

### 2. Data Encryption
Create encryption utilities:

```typescript
// lib/encryption.ts
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
const IV_LENGTH = 16

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, encryptedText] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

### 3. Connection Security
```env
# Force SSL in production
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
```

### 4. Enhanced Key Management & Rotation Strategy

```typescript
// lib/key-management.ts
import crypto from 'crypto'

// Key Rotation Schedule
const KEY_ROTATION_DAYS = 90

// Generate new encryption key
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Key versioning for rotation support
export function getCurrentKeyVersion(): string {
  const keyVersion = process.env.ENCRYPTION_KEY_VERSION || '1'
  return keyVersion
}

// Key rotation handler
export async function rotateEncryptionKeys(prisma: PrismaClient) {
  // 1. Generate new key
  const newKey = generateEncryptionKey()
  
  // 2. Store in secure environment (AWS KMS, HashiCorp Vault, etc.)
  // 3. Gradually re-encrypt sensitive data
  const encryptedRecords = await prisma.integration.findMany({
    where: { clientSecretEncrypted: { not: null } }
  })
  
  for (const record of encryptedRecords) {
    const decrypted = decrypt(record.clientSecretEncrypted!)
    const reEncrypted = encrypt(decrypted, newKey)
    await prisma.integration.update({
      where: { id: record.id },
      data: { clientSecretEncrypted: reEncrypted }
    })
  }
  
  // 4. Update key version
  await prisma.systemSettings.update({
    data: { encryptionKeyVersion: parseInt(getCurrentKeyVersion()) + 1 }
  })
}

// Multiple environments support
export function getEnvironmentKey(): Buffer {
  const env = process.env.NODE_ENV
  const key = process.env[`ENCRYPTION_KEY_${env.toUpperCase()}`]
  if (!key) throw new Error(`No encryption key for environment: ${env}`)
  return Buffer.from(key, 'hex')
}
```

### 5. Comprehensive Row-Level Security Policies

```sql
-- Enable RLS on all multi-tenant tables
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Comprehensive tenant isolation policy
CREATE POLICY strict_tenant_isolation ON work_items
FOR ALL
USING (
  tenant_id = (
    SELECT tm.tenant_id 
    FROM tenant_memberships tm
    JOIN users u ON u.id = tm.user_id
    WHERE u.email = current_setting('app.current_user_email', true)
    LIMIT 1
  )
);

-- Role-based data access policy
CREATE POLICY role_based_work_item_access ON work_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tenant_memberships tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.user_id = current_setting('app.current_user_id', true)::uuid
    AND tm.tenant_id = work_items.tenant_id
    AND (
      tm.role IN ('admin', 'lead', 'po', 'executive') OR
      work_items.assignee_id = current_setting('app.current_user_id', true)::uuid OR
      work_items.reporter_id = current_setting('app.current_user_id', true)::uuid OR
      tm.accessible_products IS NULL OR 
      work_items.product_id = ANY(tm.accessible_products)
    )
  )
);

-- Write restrictions based on role
CREATE POLICY role_based_work_item_write ON work_items
FOR INSERT WITH CHECK
(
  EXISTS (
    SELECT 1 FROM tenant_memberships tm
    WHERE tm.user_id = current_setting('app.current_user_id', true)::uuid
    AND tm.tenant_id = work_items.tenant_id
    AND tm.role IN ('admin', 'lead', 'developer', 'tester', 'po')
  )
);

CREATE POLICY role_based_work_item_update ON work_items
FOR UPDATE USING
(
  EXISTS (
    SELECT 1 FROM tenant_memberships tm
    WHERE tm.user_id = current_setting('app.current_user_id', true)::uuid
    AND tm.tenant_id = work_items.tenant_id
    AND tm.role IN ('admin', 'lead', 'developer', 'tester', 'po')
  )
);

-- Integration secrets only accessible to admins
CREATE POLICY admin_only_integrations ON integrations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tenant_memberships tm
    WHERE tm.user_id = current_setting('app.current_user_id', true)::uuid
    AND tm.tenant_id = integrations.tenant_id
    AND tm.role = 'admin'
  )
);
```

### 6. Application-Level Security Middleware

```typescript
// middleware/security.ts
import { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      db?: PrismaClient
      user?: {
        id: string
        email: string
        tenantId: string
        role: string
      }
    }
  }
}

// Set user context for RLS policies
export function setUserContext(req: Request, res: Response, next: NextFunction) {
  if (req.user?.id && req.user?.email) {
    // Set PostgreSQL session variables for RLS
    req.db!.$executeRawUnsafe`SET LOCAL app.current_user_id = '${req.user.id}'`
    req.db!.$executeRawUnsafe`SET LOCAL app.current_user_email = '${req.user.email}'`
    req.db!.$executeRawUnsafe`SET LOCAL app.current_tenant_id = '${req.user.tenantId}'`
  }
  next()
}

// Data encryption for sensitive fields
export async function encryptSensitiveData(req: Request, res: Response, next: NextFunction) {
  if (req.body.integrationType === 'jira' && req.body.clientSecret) {
    req.body.clientSecret = encrypt(req.body.clientSecret)
  }
  if (req.body.webhookSecret) {
    req.body.webhookSecret = encrypt(req.body.webhookSecret)
  }
  next()
}

// Audit logging for sensitive operations
export async function auditLog(req: Request, res: Response, next: NextFunction) {
  const originalSend = res.send
  
  res.send = function(data) {
    // Log sensitive operations
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && 
        ['/api/integrations', '/api/users', '/api/tenants'].some(path => req.path.startsWith(path))) {
      
      req.db!.auditLog.create({
        data: {
          tenantId: req.user?.tenantId,
          userId: req.user?.id,
          action: `${req.method} ${req.path}`,
          resourceType: req.path.split('/')[2],
          resourceId: req.params.id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          oldValues: req.body.oldValues,
          newValues: req.body.newValues
        }
      }).catch(console.error) // Don't block response on audit log failure
    }
    
    originalSend.call(this, data)
  }
  
  next()
}

// Rate limiting by tenant
import rateLimit from 'express-rate-limit'

export const tenantRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each tenant to 1000 requests per windowMs
  keyGenerator: (req) => req.user?.tenantId || req.ip,
  message: 'Too many requests from your organization, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

// Data retention policy enforcement
export async function enforceRetentionPolicy(prisma: PrismaClient) {
  const now = new Date()
  
  // Clean up old webhook events
  await prisma.webhookEvent.deleteMany({
    where: {
      processed: true,
      receivedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } // 30 days
    }
  })
  
  // Clean up old audit logs based on tenant settings
  const tenants = await prisma.tenant.findMany({
    select: { id: true, auditLogRetentionDays: true }
  })
  
  for (const tenant of tenants) {
    await prisma.auditLog.deleteMany({
      where: {
        tenantId: tenant.id,
        createdAt: { lt: new Date(now.getTime() - tenant.auditLogRetentionDays! * 24 * 60 * 60 * 1000) }
      }
    })
  }
}
```

---

## Troubleshooting

### Common Issues

1. **Migration Conflicts**
```bash
# Resolve migration conflicts
npx prisma migrate resolve --rolled-back "conflicting_migration"
```

2. **Connection Pool Exhaustion**
```env
# Increase connection pool size
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=20"
```

3. **Slow Queries**
```sql
-- Identify slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

---

## Performance Optimization Strategy

### 1. Database Partitioning for High-Volume Tables

```sql
-- Partition ai_usage_records by month
CREATE TABLE ai_usage_records_partitioned (
  LIKE ai_usage_records INCLUDING ALL
) PARTITION BY RANGE (requested_at);

-- Create monthly partitions
CREATE TABLE ai_usage_records_2026_08 PARTITION OF ai_usage_records_partitioned
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE ai_usage_records_2026_09 PARTITION OF ai_usage_records_partitioned
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- Partition test_executions by quarter
CREATE TABLE test_executions_partitioned (
  LIKE test_executions INCLUDING ALL
) PARTITION BY RANGE (executed_at);

CREATE TABLE test_executions_q3_2026 PARTITION OF test_executions_partitioned
  FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');

-- Automated partition management
CREATE OR REPLACE FUNCTION create_monthly_partitions()
RETURNS void AS $$
DECLARE
  partition_date DATE := date_trunc('month', CURRENT_DATE + interval '1 month');
  partition_name TEXT := 'ai_usage_records_' || to_char(partition_date, 'YYYY_MM');
  start_date TEXT := to_char(partition_date, 'YYYY-MM-DD');
  end_date TEXT := to_char(partition_date + interval '1 month', 'YYYY-MM-DD');
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ai_usage_records_partitioned FOR VALUES FROM (%L) TO (%L)', 
    partition_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;
```

### 2. Composite Indexes for Dashboard Queries

```sql
-- Work item dashboard queries
CREATE INDEX idx_workitems_tenant_status_priority ON work_items(tenant_id, status, priority);
CREATE INDEX idx_workitems_tenant_assignee_status ON work_items(tenant_id, assignee_id, status);
CREATE INDEX idx_workitems_product_sprint_status ON work_items(product_id, sprint_id, status);

-- Test execution analytics
CREATE INDEX idx_testexecutions_tenant_sprint_status ON test_executions(tenant_id, sprint_id, status);
CREATE INDEX idx_testexecutions_testcase_status ON test_executions(test_case_id, status);

-- AI usage analytics
CREATE INDEX idx_aiusage_tenant_model_date ON ai_usage_records(tenant_id, model_id, requested_at DESC);
CREATE INDEX idx_aiusage_user_activity_date ON ai_usage_records(user_id, activity_type, requested_at DESC);

-- Quality metrics queries
CREATE INDEX idx_qualitymetrics_tenant_product_date ON quality_metrics_snapshots(tenant_id, product_id, snapshot_date DESC);

-- Alert monitoring
CREATE INDEX idx_alertincidents_tenant_status_triggered ON alert_incidents(tenant_id, incident_status, triggered_at DESC);

-- Background job processing
CREATE INDEX idx_backgroundjobs_status_priority_scheduled ON background_jobs(status, priority DESC, scheduled_at);
```

### 3. Query Optimization & Materialized Views

```sql
-- Dashboard summary materialized view
CREATE MATERIALIZED VIEW mv_tenant_dashboard_summary AS
SELECT 
  t.id as tenant_id,
  t.name as tenant_name,
  COUNT(DISTINCT wi.id) FILTER (WHERE wi.item_type = 'bug' AND wi.status != 'Closed') as open_bugs,
  COUNT(DISTINCT wi.id) FILTER (WHERE wi.item_type = 'bug' AND wi.priority IN ('P0', 'P1')) as critical_bugs,
  COUNT(DISTINCT te.id) as total_test_executions,
  AVG(te.duration_seconds) FILTER (WHERE te.status = 'passed') as avg_test_duration,
  COUNT(DISTINCT aiur.id) as total_ai_requests,
  SUM(aiur.cost_usd) as total_ai_cost,
  COUNT(DISTINCT u.id) as active_users
FROM tenants t
LEFT JOIN work_items wi ON wi.tenant_id = t.id
LEFT JOIN test_executions te ON te.tenant_id = t.id AND te.executed_at > NOW() - INTERVAL '30 days'
LEFT JOIN ai_usage_records aiur ON aiur.tenant_id = t.id AND aiur.requested_at > NOW() - INTERVAL '30 days'
LEFT JOIN tenant_memberships tm ON tm.tenant_id = t.id AND tm.joined_at > NOW() - INTERVAL '30 days'
LEFT JOIN users u ON u.id = tm.user_id
GROUP BY t.id, t.name;

-- Refresh strategy for materialized views
CREATE OR REPLACE FUNCTION refresh_dashboard_summaries()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tenant_dashboard_summary;
END;
$$ LANGUAGE plpgsql;
```

### 4. Connection Pooling Configuration

```ini
# PgBouncer configuration for production
[databases]
qualimetrix = host=localhost port=5432 dbname=qualimetrix

[pgbouncer]
pool_mode = transaction
max_client_conn = 10000
default_pool_size = 50
min_pool_size = 10
reserve_pool_size = 10
reserve_pool_timeout = 3
server_lifetime = 3600
server_idle_timeout = 600
server_connect_timeout = 15
query_timeout = 30
client_idle_timeout = 300
idle_transaction_timeout = 60

# Logging
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
stats_period = 60

# Admin interface for monitoring
admin_users = postgres
stats_user = pgb_stats
```

### 5. Redis Caching Strategy

```typescript
// lib/cache.ts
import Redis from 'ioredis'

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
})

// Cache key design with proper namespacing
const CACHE_KEYS = {
  USER_CONTEXT: (userId: string) => `user:${userId}:context`,
  TENANT_CONFIG: (tenantId: string) => `tenant:${tenantId}:config`,
  DASHBOARD_SUMMARY: (tenantId: string, period: string) => 
    `dashboard:${tenantId}:summary:${period}`,
  AI_USAGE_STATS: (tenantId: string, date: string) => 
    `ai:${tenantId}:stats:${date}`,
  ACTIVE_WORK_ITEMS: (tenantId: string) => 
    `workitems:${tenantId}:active`,
}

// TTL policies (in seconds)
const CACHE_TTL = {
  SHORT: 300,           // 5 minutes
  MEDIUM: 1800,         // 30 minutes  
  LONG: 3600,           // 1 hour
  VERY_LONG: 86400,     // 24 hours
}

// Cache warming for critical data
export async function warmCache(tenantId: string) {
  const summary = await computeDashboardSummary(tenantId)
  await redis.setex(
    CACHE_KEYS.DASHBOARD_SUMMARY(tenantId, 'current'),
    CACHE_TTL.MEDIUM,
    JSON.stringify(summary)
  )
}

// Cache invalidation strategy
export async function invalidateTenantCache(tenantId: string) {
  const pattern = `*:${tenantId}:*`
  const keys = await redis.keys(pattern)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}
```

### 6. Background Job Processing Architecture

```typescript
// lib/background-jobs.ts
import { Queue, Worker, Job } from 'bullmq'

export const JOB_TYPES = {
  AI_USAGE_AGGREGATION: 'ai-usage-aggregation',
  METRICS_CALCULATION: 'metrics-calculation',
  BUDGET_MONITORING: 'budget-monitoring',
  WEBHOOK_PROCESSING: 'webhook-processing',
  DATA_SYNC: 'data-sync',
  REPORT_GENERATION: 'report-generation',
  ALERT_CHECKING: 'alert-checking',
}

// Job configuration with retry strategies
export const JOB_CONFIG = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
}

// Priority queues for different job types
export const backgroundQueues = {
  HIGH_PRIORITY: new Queue('high-priority'),
  DEFAULT: new Queue('default'),
  LOW_PRIORITY: new Queue('low-priority'),
}
```

---

## Next Steps

1. **Set up CI/CD pipeline** for automated testing and deployment
2. **Configure monitoring** with tools like Grafana or Datadog  
3. **Implement caching strategy** with Redis for dashboard queries
4. **Set up backup automation** with cron jobs or cloud backups
5. **Configure database replication** for high availability
6. **Implement data retention policies** for automated cleanup

This database architecture provides a solid foundation for the QualiMetrix platform with support for multi-tenancy, RBAC, external integrations, and comprehensive quality analytics.
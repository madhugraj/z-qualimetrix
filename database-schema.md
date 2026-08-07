# QualiMetrix Database Schema Requirements

## Overview
Multi-tenant Quality Intelligence Platform with RBAC, external integrations, and automated data synchronization.

## Database Technology Stack
- **Primary Database**: PostgreSQL 15+ (ACID compliance, JSONB support, full-text search)
- **Cache Layer**: Redis 7+ (session management, rate limiting, dashboard cache)
- **ORM**: Prisma ORM with TypeScript
- **Search**: PostgreSQL Full-Text Search + pgvector (for AI embeddings)

---

## Core Domain Entities

### 1. Tenant & Organization Management

```sql
-- Tenants (Multi-tenant organization isolation)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  domain VARCHAR(255) UNIQUE, -- custom domain for SaaS deployment
  logo_url VARCHAR(500),
  settings JSONB DEFAULT '{
    "timezone": "UTC",
    "dateFormat": "YYYY-MM-DD",
    "defaultSprintLength": 14,
    "workingDays": ["Mon","Tue","Wed","Thu","Fri"]
  }',
  subscription_tier VARCHAR(50) DEFAULT 'starter', -- starter, professional, enterprise
  max_users INTEGER DEFAULT 10,
  max_products INTEGER DEFAULT 3,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_domain ON tenants(domain);

-- Products/Projects (linked to external project keys)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key VARCHAR(50) NOT NULL, -- Jira project key or ADO area path
  description TEXT,
  icon_url VARCHAR(500),
  color VARCHAR(7), -- hex color for UI theming
  
  -- External Integration References
  jira_project_key VARCHAR(20),
  azure_devops_area_path VARCHAR(255),
  github_repo_full_name VARCHAR(255), -- "org/repo"
  
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, key)
);

CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_jira ON products(jira_project_key);
CREATE INDEX idx_products_azure ON products(azure_devops_area_path);
```

### 2. Authentication & User Management

```sql
-- Users (cross-tenant authentication)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255), -- bcrypt for local auth
  auth_provider VARCHAR(20) DEFAULT 'local', -- local, google, github, saml
  
  -- Profile Information
  full_name VARCHAR(255),
  avatar_url VARCHAR(500),
  timezone VARCHAR(50) DEFAULT 'UTC',
  language VARCHAR(10) DEFAULT 'en',
  
  -- External Identity References
  google_id VARCHAR(255),
  github_id VARCHAR(255),
  saml_idp VARCHAR(255),
  
  -- System Metadata
  email_verified BOOLEAN DEFAULT false,
  is_system_admin BOOLEAN DEFAULT false, -- platform admin
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_external_ids ON users(google_id, github_id);

-- Tenant Memberships (many-to-many with roles)
CREATE TABLE tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- admin, lead, developer, tester, po, executive, viewer
  
  -- Product Access Control (if null, access to all products)
  accessible_products UUID[], -- array of product IDs
  
  -- User Preferences
  default_role VARCHAR(50), -- for UI default view
  default_product_id UUID REFERENCES products(id),
  notification_settings JSONB DEFAULT '{
    "email": true,
    "push": false,
    "slack": false
  }',
  
  invited_by UUID REFERENCES users(id),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_memberships_tenant ON tenant_memberships(tenant_id);
CREATE INDEX idx_memberships_user ON tenant_memberships(user_id);
CREATE INDEX idx_memberships_role ON tenant_memberships(role);

-- Refresh Tokens (JWT rotation)
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- null for system admin
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  device_info JSONB -- { userAgent, ip, deviceType }
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

### 3. External Integration Configurations

```sql
-- Integration Credentials (encrypted at rest)
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_type VARCHAR(50) NOT NULL, -- jira, azure_devops, github, ci_pipeline
  
  -- OAuth 2.0 Configuration
  client_id VARCHAR(255),
  client_secret_encrypted TEXT, -- AES-256 encrypted
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- API Configuration
  api_base_url VARCHAR(500),
  webhook_secret_encrypted TEXT,
  
  -- Sync Settings
  sync_enabled BOOLEAN DEFAULT true,
  sync_frequency VARCHAR(20) DEFAULT '15min', -- 5min, 15min, 1hour, 6hour
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status VARCHAR(50) DEFAULT 'pending', -- pending, active, error, paused
  
  -- Error Handling
  last_error TEXT,
  error_count INTEGER DEFAULT 0,
  last_successful_sync TIMESTAMP WITH TIME ZONE,
  
  configuration JSONB DEFAULT '{}', -- custom settings per integration
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, integration_type)
);

CREATE INDEX idx_integrations_tenant ON integrations(tenant_id);
CREATE INDEX idx_integrations_type ON integrations(integration_type);

-- Webhook Events (incoming from external systems)
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_type VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL, -- jira:issue_updated, ado:workitem_created, etc.
  
  -- Event Payload
  raw_payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processing_attempts INTEGER DEFAULT 0,
  
  -- Metadata
  external_id VARCHAR(255), -- Jira issue key, ADO work item ID
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

CREATE INDEX idx_webhook_tenant ON webhook_events(tenant_id);
CREATE INDEX idx_webhook_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_external ON webhook_events(external_id);
```

### 4. Work Items & Bug Intelligence

```sql
-- Work Items (synced from Jira/ADO + manual creation)
CREATE TABLE work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- External System References
  external_system VARCHAR(20), -- jira, azure_devops, github, manual
  external_id VARCHAR(100), -- Jira key, ADO ID, GitHub issue number
  external_url VARCHAR(500),
  
  -- Work Item Classification
  item_type VARCHAR(20) NOT NULL, -- story, task, bug, epic, test_case, spike
  status VARCHAR(50) NOT NULL, -- Open, In Progress, Resolved, Closed, etc.
  priority VARCHAR(10), -- P0, P1, P2, P3, P4
  
  -- Content
  title VARCHAR(500) NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,
  
  -- Classification & Intelligence
  domain VARCHAR(50), -- UI/UX, Backend/API, AI/ML Team, Infrastructure
  domain_confidence DECIMAL(3,2), -- 0.00 to 1.00
  tags VARCHAR(500)[], -- array of tags
  component VARCHAR(100), -- module/component name
  
  -- Relationships
  parent_id UUID REFERENCES work_items(id), -- Epic -> Story hierarchy
  sprint_id UUID, -- reference to sprints table
  assignee_id UUID REFERENCES users(id),
  reporter_id UUID REFERENCES users(id),
  
  -- Resolution Information
  resolution VARCHAR(100), -- Fixed, Won't Fix, Duplicate, Cannot Reproduce
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_duration_hours DECIMAL(10,2), -- MTTR calculation
  
  -- Quality Metrics
  is_escaped_defect BOOLEAN DEFAULT false, -- found in production
  is_reopened BOOLEAN DEFAULT false,
  qa_rejection_count INTEGER DEFAULT 0,
  first_time_fix BOOLEAN DEFAULT true,
  
  -- Timestamps
  external_created_at TIMESTAMP WITH TIME ZONE,
  external_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, external_system, external_id)
);

CREATE INDEX idx_workitems_tenant ON work_items(tenant_id);
CREATE INDEX idx_workitems_product ON work_items(product_id);
CREATE INDEX idx_workitems_external ON work_items(external_system, external_id);
CREATE INDEX idx_workitems_type_status ON work_items(item_type, status);
CREATE INDEX idx_workitems_assignee ON work_items(assignee_id);
CREATE INDEX idx_workitems_sprint ON work_items(sprint_id);

-- Bug Similarity & Deduplication
CREATE TABLE bug_similarities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_bug_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  similar_bug_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  
  similarity_score DECIMAL(3,2) NOT NULL, -- 0.00 to 1.00
  similarity_method VARCHAR(50) DEFAULT 'tfidf', -- tfidf, embedding, hybrid
  
  -- User Feedback
  user_confirmed BOOLEAN, -- true if user confirmed duplicate
  user_rejected BOOLEAN, -- true if user rejected suggestion
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(source_bug_id, similar_bug_id)
);

CREATE INDEX idx_bug_similarities_source ON bug_similarities(source_bug_id);
CREATE INDEX idx_bug_similarities_score ON bug_similarities(similarity_score);

-- Bug Comments & Activity
CREATE TABLE work_item_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  
  external_comment_id VARCHAR(100), -- for sync with external systems
  comment_body TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false, -- not visible to external systems
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  external_created_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_comments_workitem ON work_item_comments(work_item_id);
CREATE INDEX idx_comments_external ON work_item_comments(external_comment_id);

-- Work Item Attachments
CREATE TABLE work_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  
  external_attachment_id VARCHAR(100),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_attachments_workitem ON work_item_attachments(work_item_id);
```

### 5. Test Management & Execution

```sql
-- Test Cases
CREATE TABLE test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- External References
  external_system VARCHAR(20),
  external_id VARCHAR(100),
  external_url VARCHAR(500),
  
  -- Test Case Content
  name VARCHAR(500) NOT NULL,
  description TEXT,
  test_type VARCHAR(50) DEFAULT 'functional', -- functional, ui, api, performance, security
  automation_status VARCHAR(20) DEFAULT 'manual', -- manual, automated, hybrid
  
  -- Coverage Mapping
  covered_story_ids UUID[], -- array of work item IDs
  requirement_ids VARCHAR(100)[], -- external requirement IDs
  
  -- Test Steps
  test_steps JSONB, -- structured steps array
  
  -- Classification
  priority VARCHAR(10), -- P0, P1, P2, P3
  tags VARCHAR(500)[],
  component VARCHAR(100),
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  external_created_at TIMESTAMP WITH TIME ZONE,
  external_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, external_system, external_id)
);

CREATE INDEX idx_testcases_tenant ON test_cases(tenant_id);
CREATE INDEX idx_testcases_product ON test_cases(product_id);
CREATE INDEX idx_testcases_stories ON test_cases USING GIN(covered_story_ids);

-- Test Executions
CREATE TABLE test_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  
  -- Execution Context
  execution_run VARCHAR(100), -- grouping for batch executions
  sprint_id UUID, -- reference to sprints table
  environment VARCHAR(50) DEFAULT 'QA', -- Dev, QA, Staging, Production
  executed_by UUID REFERENCES users(id),
  
  -- Results
  status VARCHAR(20) NOT NULL, -- passed, failed, blocked, skipped
  duration_seconds INTEGER,
  execution_notes TEXT,
  
  -- Failure Analysis
  failure_reason VARCHAR(255),
  is_flake BOOLEAN DEFAULT false, -- previously passed, now failed
  
  -- External References (for CI integration)
  external_run_id VARCHAR(100), -- CI pipeline run ID
  external_test_id VARCHAR(100), -- JUnit test ID
  
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_test_executions_tenant ON test_executions(tenant_id);
CREATE INDEX idx_test_executions_testcase ON test_executions(test_case_id);
CREATE INDEX idx_test_executions_run ON test_executions(execution_run);
CREATE INDEX idx_test_executions_sprint ON test_executions(sprint_id);
CREATE INDEX idx_test_executions_status ON test_executions(status);

-- Test Execution Attachments (screenshots, logs)
CREATE TABLE test_execution_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_execution_id UUID NOT NULL REFERENCES test_executions(id) ON DELETE CASCADE,
  
  evidence_type VARCHAR(20) NOT NULL, -- screenshot, video, log, metrics
  file_url VARCHAR(500) NOT NULL,
  description TEXT,
  
  captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_evidence_execution ON test_execution_evidence(test_execution_id);
```

### 6. Manual Deliverables & Activities

```sql
-- Manual Deliverables (Demos, Docs, RCAs, Manual Testing)
CREATE TABLE manual_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  deliverable_type VARCHAR(20) NOT NULL, -- DEMO, DOC, RCA, TEST
  title VARCHAR(500) NOT NULL,
  description TEXT,
  
  -- Deliverable-specific metadata
  metadata JSONB DEFAULT '{}', -- { rating: 4.5, reviewer: ["user1"], hours: 3.5 }
  
  -- Links and References
  external_urls VARCHAR(500)[], -- array of related URLs
  related_work_item_ids UUID[], -- linked bugs/stories
  
  -- People
  created_by UUID NOT NULL REFERENCES users(id),
  
  -- Timestamps
  delivered_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_manual_deliverables_tenant ON manual_deliverables(tenant_id);
CREATE INDEX idx_manual_deliverables_type ON manual_deliverables(deliverable_type);
CREATE INDEX idx_manual_deliverables_product ON manual_deliverables(product_id);
CREATE INDEX idx_manual_deliverables_created_by ON manual_deliverables(created_by);

-- Deliverable Collaborators
CREATE TABLE deliverable_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id UUID NOT NULL REFERENCES manual_deliverables(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(50) DEFAULT 'contributor', -- author, reviewer, approver
  
  UNIQUE(deliverable_id, user_id)
);

CREATE INDEX idx_deliverable_collabs_deliverable ON deliverable_collaborators(deliverable_id);
```

### 7. Sprints & Releases

```sql
-- Sprints (for agile tracking)
CREATE TABLE sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  name VARCHAR(100) NOT NULL, -- "Sprint 12", "Sprint 11"
  sequence INTEGER NOT NULL, -- for ordering
  
  -- Sprint Timeline
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  state VARCHAR(20) DEFAULT 'active', -- future, active, closed
  
  -- External References
  external_system VARCHAR(20),
  external_id VARCHAR(100),
  
  -- Sprint Goals & Retrospective
  sprint_goal TEXT,
  retrospective_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, product_id, sequence)
);

CREATE INDEX idx_sprints_tenant ON sprints(tenant_id);
CREATE INDEX idx_sprints_product ON sprints(product_id);
CREATE INDEX idx_sprints_dates ON sprints(start_date, end_date);

-- Releases
CREATE TABLE releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  version VARCHAR(50) NOT NULL, -- "24.7.0"
  name VARCHAR(255), -- "Summer 2024 Release"
  
  -- Release Timeline
  target_date DATE,
  actual_date DATE,
  state VARCHAR(20) DEFAULT 'planned', -- planned, in_development, released, cancelled
  
  -- Release Metrics
  stories_completed INTEGER DEFAULT 0,
  bugs_resolved INTEGER DEFAULT 0,
  test_execution_rate DECIMAL(5,2), -- percentage
  release_readiness_score DECIMAL(5,2), -- calculated score
  
  -- Release Notes
  release_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_releases_tenant ON releases(tenant_id);
CREATE INDEX idx_releases_product ON releases(product_id);
```

### 8. Quality Metrics & Analytics

```sql
-- Quality Metrics Snapshots (pre-calculated for dashboard performance)
CREATE TABLE quality_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Snapshot Context
  snapshot_type VARCHAR(50) NOT NULL, -- daily, sprint, release, custom
  snapshot_date DATE NOT NULL,
  sprint_id UUID REFERENCES sprints(id),
  release_id UUID REFERENCES releases(id),
  
  -- Test Execution Metrics
  test_cases_executed INTEGER DEFAULT 0,
  test_cases_passed INTEGER DEFAULT 0,
  test_cases_failed INTEGER DEFAULT 0,
  test_cases_blocked INTEGER DEFAULT 0,
  test_automation_rate DECIMAL(5,2),
  
  -- Bug Metrics
  bugs_created INTEGER DEFAULT 0,
  bugs_resolved INTEGER DEFAULT 0,
  bugs_escaped INTEGER DEFAULT 0, -- found in production
  bugs_reopened INTEGER DEFAULT 0,
  defect_leakage_rate DECIMAL(5,2),
  
  -- Time Metrics (in hours)
  mttr DECIMAL(10,2), -- Mean Time To Resolve
  mttf DECIMAL(10,2), -- Mean Time To Fix (first-time fix rate inverse)
  
  -- Quality Indicators
  first_time_fix_rate DECIMAL(5,2),
  qa_rejection_rate DECIMAL(5,2),
  defect_density DECIMAL(10,2), -- defects per KLOC
  
  -- Coverage Metrics
  rtm_coverage_rate DECIMAL(5,2), -- Requirements Traceability Matrix
  automation_roi DECIMAL(10,2), -- Return on Investment
  
  -- Release Readiness
  release_readiness_score DECIMAL(5,2),
  open_p0_p1_count INTEGER DEFAULT 0,
  regression_pass_rate DECIMAL(5,2),
  
  -- Cost of Quality
  cost_of_quality DECIMAL(15,2), -- in currency units
  
  metadata JSONB DEFAULT '{}', -- additional metrics
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, product_id, snapshot_type, snapshot_date)
);

CREATE INDEX idx_metrics_snapshot_tenant ON quality_metrics_snapshots(tenant_id);
CREATE INDEX idx_metrics_snapshot_product ON quality_metrics_snapshots(product_id);
CREATE INDEX idx_metrics_snapshot_date ON quality_metrics_snapshots(snapshot_date);
CREATE INDEX idx_metrics_snapshot_sprint ON quality_metrics_snapshots(sprint_id);

-- Team Performance Metrics
CREATE TABLE team_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Period Context
  period_type VARCHAR(20) NOT NULL, -- daily, weekly, sprint, monthly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Individual Performance
  bugs_assigned INTEGER DEFAULT 0,
  bugs_resolved INTEGER DEFAULT 0,
  avg_mttr_hours DECIMAL(10,2),
  first_time_fix_rate DECIMAL(5,2),
  qa_rejections INTEGER DEFAULT 0,
  
  -- Test Performance (for testers)
  tests_executed INTEGER DEFAULT 0,
  test_pass_rate DECIMAL(5,2),
  demos_delivered INTEGER DEFAULT 0,
  docs_created INTEGER DEFAULT 0,
  
  -- Deliverable Performance
  manual_hours_logged DECIMAL(10,2),
  automation_hours_saved DECIMAL(10,2),
  
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, user_id, product_id, period_type, period_start)
);

CREATE INDEX idx_team_perf_tenant ON team_performance_metrics(tenant_id);
CREATE INDEX idx_team_perf_user ON team_performance_metrics(user_id);
CREATE INDEX idx_team_perf_period ON team_performance_metrics(period_start, period_end);
```

### 9. Background Jobs & Sync Tracking

```sql
-- Background Jobs (for sync and processing tasks)
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  job_type VARCHAR(50) NOT NULL, -- jira_sync, ado_sync, metrics_calculation, webhook_processing
  job_name VARCHAR(255) NOT NULL,
  
  -- Job Configuration
  payload JSONB DEFAULT '{}',
  priority INTEGER DEFAULT 5, -- 1-10, higher = more important
  
  -- Job Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
  progress INTEGER DEFAULT 0, -- 0-100
  result JSONB, -- job results
  
  -- Error Handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Timestamps
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_background_jobs_tenant ON background_jobs(tenant_id);
CREATE INDEX idx_background_jobs_status ON background_jobs(status);
CREATE INDEX idx_background_jobs_scheduled ON background_jobs(scheduled_at);
CREATE INDEX idx_background_jobs_type ON background_jobs(job_type);

-- Sync State Tracking (for external integrations)
CREATE TABLE sync_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_type VARCHAR(50) NOT NULL,
  
  -- Sync Configuration
  resource_type VARCHAR(50) NOT NULL, -- issues, projects, users, test_cases
  last_sync_cursor TEXT, -- for incremental sync pagination
  
  -- Sync Statistics
  total_records INTEGER DEFAULT 0,
  last_sync_count INTEGER DEFAULT 0,
  last_sync_duration_ms INTEGER,
  
  -- Health Monitoring
  last_successful_sync TIMESTAMP WITH TIME ZONE,
  last_failed_sync TIMESTAMP WITH TIME ZONE,
  consecutive_failures INTEGER DEFAULT 0,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, integration_type, resource_type)
);

CREATE INDEX idx_sync_states_tenant ON sync_states(tenant_id);
CREATE INDEX idx_sync_states_integration ON sync_states(integration_type);
```

### 10. Audit Logging & Activity Tracking

```sql
-- Audit Log (compliance and security)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  action VARCHAR(100) NOT NULL, -- user.login, work_item.created, integration.configured
  resource_type VARCHAR(50), -- user, work_item, integration, tenant
  resource_id UUID,
  
  -- Request Context
  ip_address INET,
  user_agent TEXT,
  request_id UUID, -- for tracing related actions
  
  -- Change Details
  old_values JSONB,
  new_values JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- Activity Timeline (for user-facing activity feeds)
CREATE TABLE activity_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  
  activity_type VARCHAR(50) NOT NULL, -- bug_created, demo_delivered, test_executed
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Related Entities
  entity_type VARCHAR(50), -- work_item, manual_deliverable, test_execution
  entity_id UUID,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Visibility
  visibility VARCHAR(20) DEFAULT 'tenant', -- tenant, product, team, private
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_activity_timeline_tenant ON activity_timeline(tenant_id);
CREATE INDEX idx_activity_timeline_user ON activity_timeline(user_id);
CREATE INDEX idx_activity_timeline_created ON activity_timeline(created_at DESC);
CREATE INDEX idx_activity_timeline_entity ON activity_timeline(entity_type, entity_id);
```

### 11. Notification Management

```sql
-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  notification_type VARCHAR(50) NOT NULL, -- bug_assigned, metric_threshold, sync_failure
  title VARCHAR(255) NOT NULL,
  body TEXT,
  
  -- Action Links
  action_url VARCHAR(500),
  action_label VARCHAR(50),
  
  -- Priority & Delivery
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  delivery_methods VARCHAR(20)[] DEFAULT ARRAY['in_app'], -- in_app, email, slack
  
  -- Status
  read_at TIMESTAMP WITH TIME ZONE,
  delivered_email BOOLEAN DEFAULT false,
  delivered_slack BOOLEAN DEFAULT false,
  
  -- Expiry
  expires_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- Notification Preferences (per user)
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  notification_type VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  delivery_methods VARCHAR(20)[] DEFAULT ARRAY['in_app'],
  
  -- Threshold-based notifications
  threshold_config JSONB DEFAULT '{}', -- { "mttr_hours": 24, "bug_count": 10 }
  
  UNIQUE(user_id, tenant_id, notification_type)
);

CREATE INDEX idxnotif_prefs_user ON notification_preferences(user_id);
CREATE INDEX idxnotif_prefs_tenant ON notification_preferences(tenant_id);
```

---

## Database Views for Common Queries

```sql
-- Active User Context View
CREATE VIEW active_users_view AS
SELECT 
  u.id, u.email, u.full_name, u.avatar_url,
  tm.tenant_id, t.name as tenant_name, t.slug as tenant_slug,
  tm.role, tm.accessible_products,
  p.id as default_product_id, p.name as default_product_name, p.key as default_product_key
FROM users u
JOIN tenant_memberships tm ON u.id = tm.user_id
JOIN tenants t ON tm.tenant_id = t.id
LEFT JOIN products p ON tm.default_product_id = p.id
WHERE t.subscription_tier != 'suspended';

-- Bug Intelligence Dashboard View
CREATE VIEW bug_intelligence_view AS
SELECT 
  wi.id, wi.tenant_id, wi.product_id,
  wi.external_id, wi.title, wi.status, wi.priority,
  wi.domain, wi.domain_confidence,
  wi.component, wi.assignee_id, u.full_name as assignee_name,
  wi.resolution_duration_hours, wi.is_escaped_defect,
  wi.is_reopened, wi.qa_rejection_count, wi.first_time_fix,
  p.name as product_name, p.key as product_key
FROM work_items wi
LEFT JOIN users u ON wi.assignee_id = u.id
LEFT JOIN products p ON wi.product_id = p.id
WHERE wi.item_type = 'bug';

-- Test Execution Summary View
CREATE VIEW test_execution_summary_view AS
SELECT 
  te.id, te.tenant_id, te.test_case_id, te.status,
  tc.name as test_case_name, tc.test_type, tc.automation_status,
  te.sprint_id, te.environment, te.executed_by,
  u.full_name as executed_by_name,
  te.executed_at, te.execution_run,
  p.name as product_name, p.key as product_key
FROM test_executions te
JOIN test_cases tc ON te.test_case_id = tc.id
LEFT JOIN users u ON te.executed_by = u.id
LEFT JOIN products p ON tc.product_id = p.id;

-- Metrics Snapshot Aggregated View
CREATE VIEW metrics_trend_view AS
SELECT 
  tenant_id, product_id, snapshot_date, snapshot_type,
  AVG(test_automation_rate) as avg_automation_rate,
  AVG(defect_leakage_rate) as avg_leakage_rate,
  AVG(mttr) as avg_mttr,
  AVG(release_readiness_score) as avg_readiness,
  SUM(bugs_created) as total_bugs_created,
  SUM(bugs_resolved) as total_bugs_resolved
FROM quality_metrics_snapshots
GROUP BY tenant_id, product_id, snapshot_date, snapshot_type;
```

---

## PostgreSQL Extensions Required

```sql
-- UUID generation (already available in PostgreSQL 13+)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Full-text search (built-in, but ensuring proper configuration)
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- Vector similarity search (for AI-powered bug similarity)
CREATE EXTENSION IF NOT EXISTS "vector";

-- Statistical functions (for advanced analytics)
CREATE EXTENSION IF NOT EXISTS "tablefunc";
```

---

## Security & Performance Considerations

### Row-Level Security (RLS) Policies

```sql
-- Enable RLS on multi-tenant tables
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_deliverables ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY tenant_isolation ON work_items
  FOR ALL
  USING (tenant_id = (
    SELECT tm.tenant_id 
    FROM tenant_memberships tm 
    WHERE tm.user_id = current_user_id() 
    LIMIT 1
  ));

-- Role-based access policy
CREATE POLICY role_based_access ON work_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenant_memberships tm
      WHERE tm.user_id = current_user_id()
      AND tm.tenant_id = work_items.tenant_id
      AND (
        tm.role IN ('admin', 'lead', 'po', 'executive') OR
        tm.accessible_products IS NULL OR -- access to all products
        work_items.product_id = ANY(tm.accessible_products)
      )
    )
  );
```

### Database Indexes for Performance

Critical indexes for query performance:
- **Tenant-based queries**: All major tables have `tenant_id` indexes
- **Time-series data**: Timestamps indexes for metrics and activities
- **Full-text search**: Trigram indexes on work item titles/descriptions
- **Array searches**: GIN indexes on tags, covered_story_ids arrays
- **Foreign keys**: All foreign keys have corresponding indexes

### Encryption at Rest

Sensitive data encryption (using application-level encryption with AES-256):
- Integration access tokens
- API credentials
- Webhook secrets
- OAuth client secrets

### Connection Pooling

Recommended setup:
- **PgBouncer**: Transaction pooling mode for high-concurrency
- **Connection limit**: 100 connections per tenant based on tier
- **Timeout settings**: 30s statement timeout, 10s idle timeout

---

## Database Migration Strategy

### Initial Schema Creation
1. Create core tables (tenants, users, memberships)
2. Create integration and webhook tables
3. Create work items and bug intelligence tables
4. Create test management tables
5. Create metrics and analytics tables
6. Create audit and notification tables

### Migration Process
- **Version control**: All migrations versioned with timestamps
- **Rollback capability**: Down migration scripts for each version
- **Data preservation**: No destructive changes without data migration
- **Performance testing**: Index creation during low-traffic periods

### Data Seeding
- Sample tenant data for development
- User roles and permissions
- Integration configuration templates
- Sample work items and test cases
- Demo data for metrics dashboards

---

## Backup & Recovery Strategy

### Backup Strategy
- **Daily full backups**: During low-traffic hours (2-4 AM UTC)
- **Continuous WAL archiving**: For point-in-time recovery
- **Cross-region replication**: For disaster recovery
- **Retention policy**: 30 days daily, 12 weekly, 6 monthly backups

### Recovery Procedures
- **Point-in-time recovery**: WAL replay to specific timestamp
- **Partial restore**: Single tenant restoration
- **Data export**: Tenant data export in JSON format

---

## Monitoring & Maintenance

### Performance Monitoring
- **Query performance**: pg_stat_statements for slow query detection
- **Index usage**: Monitor missing and unused indexes
- **Table bloat**: Regular VACUUM and ANALYZE operations
- **Connection pool**: Monitor PgBouncer statistics

### Data Retention
- **Audit logs**: 90-day retention
- **Webhook events**: 30-day retention after processing
- **Background jobs**: 7-day retention for completed jobs
- **Notifications**: 30-day retention for read notifications

### Maintenance Tasks
- **Weekly**: Index rebuild, statistics update
- **Monthly**: Table bloat cleanup, partition maintenance
- **Quarterly**: Index optimization, query plan analysis
# QualiMetrix Complete Database Schema Requirements

## Overview
Multi-tenant Quality Intelligence Platform with RBAC, external integrations, comprehensive analytics, and production-ready feature completeness.

---

## 🚨 CRITICAL ADDITIONS FOR FRONTEND ALIGNMENT

### 1. Search Infrastructure
### 2. Export & Reporting System  
### 3. Advanced People Analytics
### 4. CI/CD Pipeline Integration
### 5. Alert Management System
### 6. Settings & Configuration

---

## Database Technology Stack
- **Primary Database**: PostgreSQL 15+ (ACID compliance, JSONB support, full-text search)
- **Cache Layer**: Redis 7+ (session management, rate limiting, dashboard cache)
- **ORM**: Prisma ORM with TypeScript
- **Search**: PostgreSQL Full-Text Search + pgvector (for AI embeddings)

---

## CORE DOMAIN ENTITIES

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

---

## 🆕 NEW SECTION: SETTINGS & CONFIGURATION MANAGEMENT

### 3. System Settings & User Preferences

```sql
-- User Settings (NEW)
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- UI Preferences
  theme VARCHAR(20) DEFAULT 'system', -- system, light, dark
  timezone VARCHAR(50) DEFAULT 'UTC',
  date_format VARCHAR(20) DEFAULT 'MM/DD/YYYY',
  time_format VARCHAR(10) DEFAULT '12h', -- 12h, 24h
  language VARCHAR(10) DEFAULT 'en',
  
  -- Dashboard Preferences
  default_dashboard_role VARCHAR(50), -- tester, developer, po, executive
  dashboard_layout JSONB DEFAULT '{}', -- customizable widget layout
  
  -- Notification Preferences
  notification_channels JSONB DEFAULT '{
    "in_app": true,
    "email": true,
    "slack": false
  }',
  email_digest_frequency VARCHAR(20) DEFAULT 'daily', -- immediate, daily, weekly
  quiet_hours_start TIME, -- start time for quiet hours
  quiet_hours_end TIME,   -- end time for quiet hours
  
  -- Data Preferences
  default_date_range VARCHAR(20) DEFAULT 'last_30_days', -- last_7_days, last_30_days, current_sprint
  default_product_id UUID REFERENCES products(id),
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id)
);

CREATE INDEX idx_user_settings_user ON user_settings(user_id);

-- Tenant Configuration (NEW)
CREATE TABLE tenant_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Working Hours & Days
  working_days VARCHAR(20)[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  working_hours_start TIME DEFAULT '09:00',
  working_hours_end TIME DEFAULT '17:00',
  timezone VARCHAR(50) DEFAULT 'UTC',
  
  -- Sprint Configuration
  default_sprint_length INTEGER DEFAULT 14, -- days
  sprint_start_day VARCHAR(10) DEFAULT 'Monday', -- for sprint planning
  sprint_review_days_before_end INTEGER DEFAULT 2,
  
  -- Quality Metrics Configuration
  mttr_threshold_hours DECIMAL(10,2) DEFAULT 24.0,
  defect_leakage_threshold_percent DECIMAL(5,2) DEFAULT 5.0,
  test_execution_threshold_percent DECIMAL(5,2) DEFAULT 80.0,
  
  -- Release Readiness Criteria
  release_readiness_requirements JSONB DEFAULT '{
    "min_test_execution_rate": 95,
    "max_open_p0_p1": 0,
    "min_regression_pass_rate": 90,
    "max_defect_leakage": 2
  }',
  
  -- Integration Defaults
  auto_sync_enabled BOOLEAN DEFAULT true,
  sync_frequency_minutes INTEGER DEFAULT 15,
  webhook_retention_days INTEGER DEFAULT 30,
  
  -- Data Retention
  audit_log_retention_days INTEGER DEFAULT 90,
  metrics_snapshot_retention_days INTEGER DEFAULT 365,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  UNIQUE(tenant_id)
);

CREATE INDEX idx_tenant_config_tenant ON tenant_configuration(tenant_id);

-- Feature Flags (NEW)
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  
  -- Flag Configuration
  is_enabled BOOLEAN DEFAULT false,
  flag_type VARCHAR(20) DEFAULT 'feature', -- feature, experiment, rollout
  
  -- Targeting Rules
  target_tenant_ids UUID[], -- specific tenants
  target_user_ids UUID[], -- specific users
  target_roles VARCHAR(50)[], -- admin, tester, developer
  
  -- Rollout Strategy
  rollout_percentage INTEGER DEFAULT 0, -- 0-100
  environment VARCHAR(20) DEFAULT 'development', -- development, staging, production
  
  -- Experiment Configuration (for A/B testing)
  experiment_name VARCHAR(100),
  variant_a JSONB, -- control group configuration
  variant_b JSONB, -- test group configuration
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT valid_rollout_percentage CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100)
);

CREATE INDEX idx_feature_flags_name ON feature_flags(flag_name);
CREATE INDEX idx_feature_flags_environment ON feature_flags(environment);

-- Feature Flag Usage Tracking (NEW)
CREATE TABLE feature_flag_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  tenant_id UUID REFERENCES tenants(id),
  
  flag_evaluation BOOLEAN, -- whether flag was enabled for this request
  context JSONB, -- request context for evaluation
  accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_feature_flag_usage_flag ON feature_flag_usage(flag_id);
CREATE INDEX idx_feature_flag_usage_user ON feature_flag_usage(user_id);
```

---

## 🆕 NEW SECTION: SEARCH INFRASTRUCTURE

### 4. Full-Text Search System

```sql
-- Search Analytics (NEW)
CREATE TABLE search_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Search Query Details
  search_query TEXT NOT NULL,
  search_type VARCHAR(50), -- global, bugs, people, stories, deliverables
  search_filters JSONB, -- { domain: "UI/UX", priority: "P0" }
  
  -- Search Results
  results_count INTEGER DEFAULT 0,
  result_types JSONB, -- { bugs: 5, people: 2, stories: 3 }
  
  -- User Interaction
  clicked_result_type VARCHAR(50), -- bug, person, story, deliverable
  clicked_result_id UUID,
  clicked_position INTEGER, -- position in results (1-10)
  time_to_click_ms INTEGER, -- time from search to click
  
  -- Search Performance
  search_duration_ms INTEGER,
  search_source VARCHAR(20), -- keyboard_shortcut, search_bar, navigation
  
  searched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_search_analytics_tenant ON search_analytics(tenant_id);
CREATE INDEX idx_search_analytics_user ON search_analytics(user_id);
CREATE INDEX idx_search_analytics_query ON search_analytics USING GIN(to_tsvector('english', search_query));
CREATE INDEX idx_search_analytics_timestamps ON search_analytics(searched_at DESC);

-- Popular Searches (Aggregated View - NEW)
CREATE MATERIALIZED VIEW popular_searches AS
SELECT 
  tenant_id,
  search_query,
  search_type,
  COUNT(*) as search_count,
  AVG(results_count) as avg_results,
  SUM(CASE WHEN clicked_result_id IS NOT NULL THEN 1 ELSE 0 END) as click_count,
  MAX(searched_at) as last_searched_at
FROM search_analytics
WHERE searched_at > NOW() - INTERVAL '30 days'
GROUP BY tenant_id, search_query, search_type
ORDER BY search_count DESC;

-- Search Suggestions (NEW - Admin configured)
CREATE TABLE search_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  suggestion_type VARCHAR(50) NOT NULL, -- quick_filter, shortcut, template
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Search Configuration
  search_query TEXT, -- the query to execute
  search_filters JSONB, -- pre-configured filters
  icon VARCHAR(50), -- emoji or icon name
  
  -- Targeting
  target_roles VARCHAR(50)[], -- which roles see this suggestion
  display_order INTEGER DEFAULT 0,
  
  -- Usage Tracking
  click_count INTEGER DEFAULT 0,
  last_clicked_at TIMESTAMP WITH TIME ZONE,
  
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_search_suggestions_tenant ON search_suggestions(tenant_id);
CREATE INDEX idx_search_suggestions_active ON search_suggestions(is_active, display_order);
```

---

## 🆕 NEW SECTION: EXPORT & REPORTING SYSTEM

### 5. Export & Reporting Infrastructure

```sql
-- Export Jobs (NEW)
CREATE TABLE export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- Export Configuration
  export_type VARCHAR(50) NOT NULL, -- test_execution, mttr, velocity, rtm, full_bundle, custom
  export_name VARCHAR(255), -- user-provided name
  format VARCHAR(20) NOT NULL, -- csv, json, pdf, excel, html
  
  -- Data Filters & Scope
  filters JSONB DEFAULT '{}', -- { dateRange: { start, end }, productIds: [], sprintIds: [] }
  included_datasets JSONB, -- which data sections to include
  
  -- Export Processing
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, expired
  progress INTEGER DEFAULT 0, -- 0-100
  file_size_bytes BIGINT,
  record_count INTEGER,
  
  -- Output Configuration
  file_url VARCHAR(500), -- presigned URL or storage path
  file_name VARCHAR(255),
  expires_at TIMESTAMP WITH TIME ZONE, -- when export file is deleted
  
  -- Error Handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Processing Details
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_export_jobs_tenant ON export_jobs(tenant_id);
CREATE INDEX idx_export_jobs_user ON export_jobs(user_id);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE INDEX idx_export_jobs_created ON export_jobs(created_at DESC);

-- Report Templates (NEW)
CREATE TABLE report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Template Metadata
  template_name VARCHAR(100) NOT NULL,
  template_description TEXT,
  template_type VARCHAR(50) DEFAULT 'custom', -- standard, compliance, executive, custom
  category VARCHAR(50), -- quality, performance, compliance, executive_summary
  
  -- Template Configuration
  data_sources JSONB NOT NULL, -- { tables: ["work_items", "test_executions"], queries: [...] }
  layout_config JSONB NOT NULL, -- report structure, sections, formatting
  styling_config JSONB, -- colors, fonts, logos
  
  -- Report Settings
  default_format VARCHAR(20) DEFAULT 'pdf', -- pdf, excel, html
  include_charts BOOLEAN DEFAULT true,
  include_raw_data BOOLEAN DEFAULT false,
  page_size VARCHAR(20) DEFAULT 'A4', -- A4, Letter, Legal
  orientation VARCHAR(20) DEFAULT 'portrait', -- portrait, landscape
  
  -- Scheduling & Automation
  is_scheduled BOOLEAN DEFAULT false,
  schedule_cron VARCHAR(100), -- cron expression for automatic generation
  schedule_recipients VARCHAR(255)[], -- email recipients
  
  -- Access Control
  created_by UUID REFERENCES users(id),
  is_public BOOLEAN DEFAULT false, -- can other users use this template
  target_roles VARCHAR(50)[], -- which roles can use this template
  
  -- Usage Tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, template_name)
);

CREATE INDEX idx_report_templates_tenant ON report_templates(tenant_id);
CREATE INDEX idx_report_templates_type ON report_templates(template_type);
CREATE INDEX idx_report_templates_category ON report_templates(category);

-- Scheduled Reports (NEW)
CREATE TABLE scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  
  -- Schedule Configuration
  schedule_name VARCHAR(100) NOT NULL,
  schedule_type VARCHAR(20) NOT NULL, -- daily, weekly, monthly, quarterly, custom
  cron_expression VARCHAR(100),
  timezone VARCHAR(50) DEFAULT 'UTC',
  
  -- Report Parameters
  filters JSONB DEFAULT '{}', -- default filters for scheduled runs
  format VARCHAR(20) DEFAULT 'pdf',
  
  -- Delivery Configuration
  delivery_methods JSONB DEFAULT '{
    "email": true,
    "slack": false,
    "save_to_library": true
  }',
  email_recipients VARCHAR(255)[],
  slack_channels VARCHAR(100)[],
  
  -- Schedule Status
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  last_status VARCHAR(20), -- success, failed, skipped
  
  -- Error Handling
  last_error TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_scheduled_reports_tenant ON scheduled_reports(tenant_id);
CREATE INDEX idx_scheduled_reports_active ON scheduled_reports(is_active, next_run_at);
CREATE INDEX idx_scheduled_reports_template ON scheduled_reports(template_id);

-- Report Library (Generated Reports Archive - NEW)
CREATE TABLE report_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scheduled_report_id UUID REFERENCES scheduled_reports(id) ON DELETE SET NULL,
  export_job_id UUID REFERENCES export_jobs(id) ON DELETE SET NULL,
  
  -- Report Metadata
  report_name VARCHAR(255) NOT NULL,
  report_description TEXT,
  report_type VARCHAR(50), -- on_demand, scheduled
  
  -- File Information
  file_url VARCHAR(500) NOT NULL,
  file_size_bytes BIGINT,
  file_format VARCHAR(20),
  page_count INTEGER,
  
  -- Report Content Summary
  data_period_start DATE,
  data_period_end DATE,
  included_sections JSONB, -- summary of what's in the report
  
  -- Access & Retention
  created_by UUID REFERENCES users(id),
  expires_at TIMESTAMP WITH TIME ZONE, -- when to auto-delete
  retention_days INTEGER DEFAULT 90,
  
  -- Usage Tracking
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_report_library_tenant ON report_library(tenant_id);
CREATE INDEX idx_report_library_scheduled ON report_library(scheduled_report_id);
CREATE INDEX idx_report_library_created ON report_library(created_at DESC);
```

---

## EXISTING SECTIONS (from original schema)

### 6. External Integration Configurations

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

---

## 🆕 NEW SECTION: CI/CD PIPELINE INTEGRATION

### 7. CI/CD Pipeline & Test Results Ingestion

```sql
-- CI Pipeline Integrations (NEW)
CREATE TABLE ci_pipeline_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Pipeline Identification
  pipeline_name VARCHAR(100) NOT NULL,
  pipeline_type VARCHAR(50) NOT NULL, -- jenkins, github_actions, circleci, gitlab_ci, azure_pipelines, teamcity
  ci_server_url VARCHAR(500),
  project_url VARCHAR(500),
  
  -- Authentication (encrypted)
  api_token_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  
  -- Test Result Configuration
  test_result_format VARCHAR(20) DEFAULT 'junit_xml', -- junit_xml, nunit, trx, custom
  test_result_path VARCHAR(500), -- path in artifact where test results are stored
  auto_import_enabled BOOLEAN DEFAULT true,
  
  -- Pipeline Settings
  branch_filter VARCHAR(100)[], -- only import from specific branches
  build_status_filter VARCHAR(50)[], -- success, failure, unstable
  notification_on_failure BOOLEAN DEFAULT true,
  
  -- Integration Status
  last_build_id VARCHAR(100),
  last_build_status VARCHAR(20),
  last_build_timestamp TIMESTAMP WITH TIME ZONE,
  sync_enabled BOOLEAN DEFAULT true,
  
  configuration JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ci_pipeline_integrations_tenant ON ci_pipeline_integrations(tenant_id);
CREATE INDEX idx_ci_pipeline_integrations_product ON ci_pipeline_integrations(product_id);
CREATE INDEX idx_ci_pipeline_integrations_type ON ci_pipeline_integrations(pipeline_type);

-- CI Build Runs (NEW)
CREATE TABLE ci_build_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES ci_pipeline_integrations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Build Identification
  external_build_id VARCHAR(100) NOT NULL, -- build number from CI system
  build_url VARCHAR(500),
  
  -- Build Context
  branch_name VARCHAR(100),
  commit_hash VARCHAR(50),
  commit_message TEXT,
  commit_author VARCHAR(255),
  
  -- Build Results
  build_status VARCHAR(20) NOT NULL, -- success, failure, unstable, aborted, running
  build_duration_seconds INTEGER,
  build_timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Test Summary
  total_tests INTEGER DEFAULT 0,
  passed_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,
  skipped_tests INTEGER DEFAULT 0,
  
  -- Coverage Data (if available)
  code_coverage_percent DECIMAL(5,2),
  lines_covered INTEGER,
  lines_total INTEGER,
  
  -- Processing Status
  test_results_imported BOOLEAN DEFAULT false,
  test_results_file_url VARCHAR(500),
  
  -- Sprint/Release Context
  sprint_id UUID REFERENCES sprints(id),
  release_id UUID REFERENCES releases(id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(pipeline_id, external_build_id)
);

CREATE INDEX idx_ci_build_runs_pipeline ON ci_build_runs(pipeline_id);
CREATE INDEX idx_ci_build_runs_product ON ci_build_runs(product_id);
CREATE INDEX idx_ci_build_runs_status ON ci_build_runs(build_status);
CREATE INDEX idx_ci_build_runs_timestamp ON ci_build_runs(build_timestamp DESC);

-- CI Test Results (Detailed - NEW)
CREATE TABLE ci_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  build_id UUID NOT NULL REFERENCES ci_build_runs(id) ON DELETE CASCADE,
  
  -- Test Identification
  external_test_id VARCHAR(100), -- test class/method name from CI system
  test_name VARCHAR(255) NOT NULL,
  test_suite VARCHAR(255),
  test_class VARCHAR(255),
  package_name VARCHAR(255),
  
  -- Test Results
  test_status VARCHAR(20) NOT NULL, -- passed, failed, skipped, ignored
  duration_ms INTEGER,
  
  -- Failure Details
  error_message TEXT,
  stack_trace TEXT,
  failure_type VARCHAR(100), -- assertion, error, timeout
  
  -- Test Metadata
  test_categories VARCHAR(100)[], -- smoke, regression, integration, unit
  test_priority VARCHAR(10), -- P0, P1, P2, P3
  
  -- Coverage Mapping
  linked_test_case_id UUID REFERENCES test_cases(id),
  component VARCHAR(100),
  
  -- Execution Context
  execution_node VARCHAR(100), -- which CI agent/runner executed
  retry_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ci_test_results_build ON ci_test_results(build_id);
CREATE INDEX idx_ci_test_results_status ON ci_test_results(test_status);
CREATE INDEX idx_ci_test_results_testcase ON ci_test_results(linked_test_case_id);
```

---

---

## 🆕 NEW SECTION: ALERT MANAGEMENT SYSTEM

### 8. Alert Rules & Threshold Management

```sql
-- Alert Rules (NEW)
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Rule Definition
  rule_name VARCHAR(100) NOT NULL,
  rule_description TEXT,
  rule_category VARCHAR(50), -- quality, performance, security, compliance, operational
  
  -- Trigger Configuration
  metric_type VARCHAR(50) NOT NULL, -- mttr_hours, bug_count, pass_rate, defect_leakage, sync_failure
  operator VARCHAR(10) NOT NULL, -- greater_than, less_than, equals, not_equals, contains
  threshold_value DECIMAL(10,2) NOT NULL,
  threshold_unit VARCHAR(20), -- percent, hours, count, days
  aggregation_window VARCHAR(50), -- current_sprint, last_7_days, last_30_days, rolling
  
  -- Advanced Trigger Conditions
  secondary_metric_type VARCHAR(50), -- for compound conditions
  secondary_operator VARCHAR(10),
  secondary_threshold_value DECIMAL(10,2),
  condition_logic VARCHAR(10) DEFAULT 'AND', -- AND, OR
  
  -- Severity & Priority
  severity VARCHAR(20) DEFAULT 'warning', -- critical, high, warning, info, debug
  priority INTEGER DEFAULT 5, -- 1-10 for alert ranking
  
  -- Notification Configuration
  notification_channels JSONB DEFAULT '{
    "email": true,
    "slack": false,
    "in_app": true
  }',
  email_recipients VARCHAR(255)[],
  slack_channels VARCHAR(100)[],
  notification_title_template TEXT, -- template for alert title
  notification_body_template TEXT, -- template for alert body
  
  -- Routing & Escalation
  target_roles VARCHAR(50)[], -- which roles should receive this alert
  target_users UUID[], -- specific users to notify
  escalation_enabled BOOLEAN DEFAULT false,
  escalation_rules JSONB, -- { escalation_after_hours: 2, escalate_to_role: "admin" }
  
  -- Suppression & Deduplication
  cooldown_period_minutes INTEGER DEFAULT 60, -- minimum time between similar alerts
  suppression_rules JSONB, -- { suppress_during_hours: { start: "22:00", end: "08:00" } }
  auto_resolve BOOLEAN DEFAULT true, -- auto-resolve when condition returns to normal
  auto_resolve_after_minutes INTEGER,
  
  -- Alert Status
  is_enabled BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  trigger_count INTEGER DEFAULT 0,
  last_resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, rule_name)
);

CREATE INDEX idx_alert_rules_tenant ON alert_rules(tenant_id);
CREATE INDEX idx_alert_rules_enabled ON alert_rules(is_enabled);
CREATE INDEX idx_alert_rules_severity ON alert_rules(severity);
CREATE INDEX idx_alert_rules_metric ON alert_rules(metric_type);

-- Alert History & Incidents (NEW)
CREATE TABLE alert_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  
  -- Incident Details
  incident_status VARCHAR(20) DEFAULT 'active', -- active, acknowledged, resolved, suppressed, false_positive
  severity VARCHAR(20) NOT NULL,
  
  -- Trigger Data
  metric_value DECIMAL(10,2) NOT NULL,
  threshold_value DECIMAL(10,2) NOT NULL,
  violation_magnitude DECIMAL(10,2), -- how much threshold was exceeded
  context_data JSONB, -- additional context at time of trigger
  
  -- Scope & Impact
  affected_product_id UUID REFERENCES products(id),
  affected_sprint_id UUID REFERENCES sprints(id),
  affected_user_ids UUID[], -- users who should be aware
  
  -- Acknowledgment & Resolution
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_note TEXT,
  
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_note TEXT,
  root_cause TEXT,
  
  -- False Positive Management
  marked_as_false_positive_by UUID REFERENCES users(id),
  false_positive_reason TEXT,
  false_positive_at TIMESTAMP WITH TIME ZONE,
  
  -- Impact Assessment
  business_impact TEXT, -- description of business impact
  affected_users_count INTEGER,
  downtime_minutes INTEGER,
  
  -- Related Entities
  related_work_item_ids UUID[], -- bugs/stories related to this alert
  related_incident_ids UUID[], -- other incidents triggered by same root cause
  
  -- Notification Tracking
  notification_sent BOOLEAN DEFAULT false,
  notification_channels_used VARCHAR(20)[],
  notification_failed_reason TEXT,
  
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_alert_incidents_tenant ON alert_incidents(tenant_id);
CREATE INDEX idx_alert_incidents_rule ON alert_incidents(alert_rule_id);
CREATE INDEX idx_alert_incidents_status ON alert_incidents(incident_status);
CREATE INDEX idx_alert_incidents_triggered ON alert_incidents(triggered_at DESC);

-- Alert Notification Delivery (NEW)
CREATE TABLE alert_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES alert_incidents(id) ON DELETE CASCADE,
  
  -- Delivery Configuration
  delivery_channel VARCHAR(20) NOT NULL, -- email, slack, in_app, webhook, sms
  delivery_status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed, retrying
  
  -- Recipient Information
  recipient_type VARCHAR(20) NOT NULL, -- user, role, external, channel
  recipient_id UUID, -- user_id or role identifier
  recipient_address VARCHAR(255), -- email address or slack channel
  
  -- Message Content
  message_subject TEXT,
  message_body TEXT,
  message_template_used VARCHAR(100),
  
  -- Delivery Tracking
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  
  -- Error Handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  
  -- External Provider Data
  external_message_id VARCHAR(255), -- provider's message ID for tracking
  external_metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_alert_notification_deliveries_incident ON alert_notification_deliveries(incident_id);
CREATE INDEX idx_alert_notification_deliveries_status ON alert_notification_deliveries(delivery_status);
CREATE INDEX idx_alert_notification_deliveries_channel ON alert_notification_deliveries(delivery_channel);

-- Alert Maintenance Windows (NEW)
CREATE TABLE alert_maintenance_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Window Definition
  window_name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Schedule
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  recurring_schedule VARCHAR(50), -- one_time, daily, weekly, monthly
  recurring_cron VARCHAR(100),
  
  -- Scope
  affected_alert_rule_ids UUID[], -- which alerts to suppress during window
  affected_products UUID[], -- limit scope to specific products
  affected_environments VARCHAR(20)[], -- development, staging, production
  
  -- Configuration
  suppress_all BOOLEAN DEFAULT false, -- suppress all alerts during window
  allow_critical BOOLEAN DEFAULT false, -- still allow critical alerts
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_alert_maintenance_windows_tenant ON alert_maintenance_windows(tenant_id);
CREATE INDEX idx_alert_maintenance_windows_active ON alert_maintenance_windows(is_active, start_time);
```

---

## 🆕 NEW SECTION: ADVANCED PEOPLE ANALYTICS

### 9. People Analytics & Team Intelligence

```sql
-- Knowledge Silo Analysis (NEW)
CREATE TABLE knowledge_silo_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  
  -- Silo Definition
  component VARCHAR(100) NOT NULL, -- module, feature, or code area
  component_category VARCHAR(50), -- frontend, backend, database, infrastructure
  risk_level VARCHAR(20) NOT NULL, -- low, medium, high, critical
  
  -- Ownership Analysis
  primary_owner_id UUID REFERENCES users(id),
  primary_owner_contribution DECIMAL(5,2), -- % of commits/changes by primary owner
  
  secondary_owner_ids UUID[], -- other people with significant knowledge
  tertiary_contributor_ids UUID[], -- people with some knowledge
  
  -- Bus Factor Analysis
  bus_factor INTEGER DEFAULT 1, -- minimum people needed before knowledge is lost
  bus_factor_risk VARCHAR(20), -- single_point_of_failure, low_coverage, adequate, excellent
  
  -- Knowledge Distribution Metrics
  total_contributors INTEGER,
  knowledge_concentration_score DECIMAL(5,2), -- 0-100, higher = more concentrated (riskier)
  cross_functional_coverage BOOLEAN, -- is knowledge spread across teams/roles
  
  -- Impact Assessment
  lines_of_code INTEGER,
  complexity_score DECIMAL(5,2), -- code complexity metrics
  business_criticality VARCHAR(20), -- low, medium, high, critical
  user_facing BOOLEAN, -- does this component directly affect users
  
  -- Mitigation & Recommendations
  mitigation_strategy JSONB, -- { documentation_needed: true, mentorship_suggested: true }
  recommended_training TEXT,
  recommended_pairing_pairs UUID[], -- suggested pairs for knowledge sharing
  
  -- Analysis Metadata
  analysis_method VARCHAR(50) DEFAULT 'git_analysis', -- git_analysis, bug_pattern, code_review, manual
  analysis_date DATE,
  last_git_commit_analyzed TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_knowledge_silo_tenant ON knowledge_silo_analysis(tenant_id);
CREATE INDEX idx_knowledge_silo_product ON knowledge_silo_analysis(product_id);
CREATE INDEX idx_knowledge_silo_risk ON knowledge_silo_analysis(risk_level);
CREATE INDEX idx_knowledge_silo_component ON knowledge_silo_analysis(component);

-- Skill Gap Analysis (NEW)
CREATE TABLE skill_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Skill Definition
  skill_area VARCHAR(100) NOT NULL, -- security, performance, ux, testing, database, frontend
  skill_category VARCHAR(50), -- technical, soft, domain, tool
  current_level VARCHAR(20), -- none, beginner, intermediate, advanced, expert
  target_level VARCHAR(20), -- what level they should achieve
  
  -- Gap Analysis
  gap_level VARCHAR(20) NOT NULL, -- critical, significant, moderate, minor
  gap_confidence DECIMAL(3,2), -- how confident we are in this assessment
  
  -- Identification Source
  identified_from VARCHAR(50) NOT NULL, -- bug_patterns, test_failures, code_review, self_assessment, manager_input
  evidence_data JSONB, -- { bug_count: 5, failed_reviews: 2, security_incidents: 1 }
  
  -- Impact & Consequences
  business_impact TEXT,
  affected_work_item_ids UUID[], -- examples of work affected by this gap
  
  -- Training & Development
  training_recommendation TEXT,
  suggested_resources JSONB, -- [{ type: "course", title: "AWS Security", url: "..." }]
  estimated_training_hours INTEGER,
  training_priority INTEGER DEFAULT 5, -- 1-10, higher = more urgent
  
  -- Mentorship & Support
  recommended_mentor_ids UUID[], -- users who could mentor in this skill
  peer_learning_group_ids UUID[], -- other users with similar gaps for group learning
  
  -- Progress Tracking
  development_plan_created BOOLEAN DEFAULT false,
  training_completed BOOLEAN DEFAULT false,
  target_date DATE,
  completion_date DATE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'open', -- open, in_progress, resolved, deferred, closed
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_skill_gaps_tenant ON skill_gaps(tenant_id);
CREATE INDEX idx_skill_gaps_user ON skill_gaps(user_id);
CREATE INDEX idx_skill_gaps_skill_area ON skill_gaps(skill_area);
CREATE INDEX idx_skill_gaps_level ON skill_gaps(gap_level);

-- Team Health Metrics (NEW)
CREATE TABLE team_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  period_type VARCHAR(20) NOT NULL, -- weekly, sprint, monthly, quarterly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Team Composition
  team_size INTEGER,
  roles_distribution JSONB, -- { developers: 8, testers: 3, designers: 2 }
  tenure_distribution JSONB, -- { new: 2, mid: 5, senior: 6 }
  
  -- Collaboration Metrics
  cross_team_collaboration_score DECIMAL(5,2), -- 0-100, how much teams work together
  knowledge_sharing_index DECIMAL(5,2), -- 0-100, active knowledge sharing
  communication_frequency INTEGER, -- avg messages/discussions per day
  meeting_load_hours DECIMAL(10,2), -- average meeting hours per person
  
  -- Well-being & Workload
  avg_workload_hours DECIMAL(10,2),
  overtime_percentage DECIMAL(5,2), -- % of people working extra hours
  after_hours_activity_percentage DECIMAL(5,2),
  burnout_risk_score DECIMAL(5,2), -- 0-100, higher = more risk
  team_morale_score DECIMAL(5,2), -- 0-100, from surveys
  
  -- Performance & Delivery
  velocity_stability DECIMAL(5,2), -- consistency of delivery
  quality_score DECIMAL(5,2), -- overall quality metrics
  innovation_index DECIMAL(5,2), -- new approaches/tools adoption
  process_compliance DECIMAL(5,2), -- adherence to processes
  
  -- Risk Factors
  silo_risk_count INTEGER, -- number of dangerous knowledge silos
  bus_factor_risk_count INTEGER, -- number of single-point failures
  on_call_burden_score DECIMAL(5,2), -- on-call distribution fairness
  
  -- Improvement Actions
  identified_issues TEXT[],
  recommended_actions JSONB,
  action_items_created INTEGER,
  action_items_completed INTEGER,
  
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, product_id, period_type, period_start)
);

CREATE INDEX idx_team_health_tenant ON team_health_metrics(tenant_id);
CREATE INDEX idx_team_health_product ON team_health_metrics(product_id);
CREATE INDEX idx_team_health_period ON team_health_metrics(period_start, period_end);

-- Workload Analysis (NEW)
CREATE TABLE workload_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type VARCHAR(20) NOT NULL, -- weekly, sprint, monthly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Work Assignment Metrics
  active_work_items INTEGER DEFAULT 0,
  total_story_points DECIMAL(10,2),
  high_priority_items INTEGER DEFAULT 0, -- P0, P1 items
  bug_assignments INTEGER DEFAULT 0,
  
  -- Meeting & Collaboration Load
  meeting_hours DECIMAL(10,2) DEFAULT 0,
  code_review_hours DECIMAL(10,2) DEFAULT 0,
  mentoring_hours DECIMAL(10,2) DEFAULT 0,
  collaboration_overhead_percentage DECIMAL(5,2),
  
  -- Context Switching
  context_switch_count INTEGER DEFAULT 0, -- number of different tasks worked on
  context_switch_cost_hours DECIMAL(10,2) DEFAULT 0,
  focus_time_percentage DECIMAL(5,2), -- % time available for focused work
  
  -- Capacity & Utilization
  available_capacity_hours DECIMAL(10,2),
  utilized_capacity_hours DECIMAL(10,2),
  utilization_rate DECIMAL(5,2), -- % of capacity used
  overallocation_percentage DECIMAL(5,2), -- % over assigned capacity
  
  -- Quality Impact
  avg_bug_fix_time_hours DECIMAL(10,2),
  code_review_turnaround_hours DECIMAL(10,2),
  rework_rate DECIMAL(5,2), -- % of work that needed redoing
  
  -- Well-being Indicators
  after_hours_work_hours DECIMAL(10,2),
  weekend_work_hours DECIMAL(10,2),
  workload_strain_score DECIMAL(5,2), -- 0-100, higher = more strain
  
  -- Recommendations
  workload_status VARCHAR(20), -- underutilized, optimal, overloaded, burned_out
  recommended_actions JSONB, -- { redistribute: true, additional_resources: false }
  
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, user_id, period_type, period_start)
);

CREATE INDEX idx_workload_analysis_tenant ON workload_analysis(tenant_id);
CREATE INDEX idx_workload_analysis_user ON workload_analysis(user_id);
CREATE INDEX idx_workload_analysis_period ON workload_analysis(period_start, period_end);
```

---

## 🆕 NEW SECTION: AI MODULE & USAGE TRACKING

### AI Models Configuration

```sql
CREATE TABLE ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
  
  -- Model Identification
  provider VARCHAR(50) NOT NULL, -- anthropic, openai, google, azure, etc.
  model_id VARCHAR(100) NOT NULL, -- claude-3-5-sonnet-20241022, gpt-4, etc.
  model_name VARCHAR(200) NOT NULL,
  version VARCHAR(50),
  
  -- Capabilities & Classification
  model_type VARCHAR(50) NOT NULL, -- chat, completion, embedding, image, code
  capability_category JSONB DEFAULT '[]', -- ["code", "analysis", "writing", "math"]
  max_tokens INTEGER,
  context_window INTEGER,
  
  -- Pricing Configuration
  input_price_per_1k_tokens DECIMAL(10,6) NOT NULL,
  output_price_per_1k_tokens DECIMAL(10,6) NOT NULL,
  caching_price_per_1k_tokens DECIMAL(10,6),
  hourly_price DECIMAL(10,6),
  
  -- Availability & Configuration
  is_active BOOLEAN DEFAULT true,
  requires_credits BOOLEAN DEFAULT false,
  rate_limit_rpm INTEGER, -- requests per minute
  rate_limit_tpm INTEGER, -- tokens per minute
  
  -- Feature Support
  supports_caching BOOLEAN DEFAULT false,
  supports_streaming BOOLEAN DEFAULT true,
  supports_function_calling BOOLEAN DEFAULT false,
  supports_vision BOOLEAN DEFAULT false,
  
  -- Metadata
  documentation_url VARCHAR(500),
  deprecation_date DATE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, sprint_id, provider, model_id)
);

CREATE INDEX ai_models_tenant ON ai_models(tenant_id);
CREATE INDEX ai_models_sprint ON ai_models(sprint_id);
CREATE INDEX ai_models_provider ON ai_models(provider);
CREATE INDEX ai_models_active ON ai_models(is_active);
```

### AI Usage Records (Individual API Calls)

```sql
CREATE TABLE ai_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  
  -- Request Context
  activity_type VARCHAR(50) NOT NULL, -- code_review, test_generation, documentation, analysis, chat
  request_id VARCHAR(255) UNIQUE, -- for deduplication
  integration_context JSONB DEFAULT '{}', -- metadata about originating feature
  
  -- Token Usage
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL,
  
  -- Performance Metrics
  latency_ms INTEGER,
  was_cached BOOLEAN DEFAULT false,
  cache_hit_tokens INTEGER DEFAULT 0,
  
  -- Cost Tracking
  cost_usd DECIMAL(10,4) NOT NULL,
  
  -- Outcome Metrics
  suggestion_accepted BOOLEAN,
  suggestion_used BOOLEAN DEFAULT false,
  rework_required BOOLEAN DEFAULT false,
  
  -- Related Entities
  work_item_id UUID REFERENCES work_items(id) ON DELETE SET NULL,
  deliverable_id UUID REFERENCES manual_deliverables(id) ON DELETE SET NULL,
  
  -- Timing
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, request_id)
);

CREATE INDEX ai_usage_tenant ON ai_usage_records(tenant_id);
CREATE INDEX ai_usage_user ON ai_usage_records(user_id);
CREATE INDEX ai_usage_model ON ai_usage_records(model_id);
CREATE INDEX ai_usage_activity ON ai_usage_records(activity_type);
CREATE INDEX ai_usage_requested ON ai_usage_records(requested_at);
CREATE INDEX ai_usage_work_item ON ai_usage_records(work_item_id);
```

### AI Usage Snapshots (Aggregated Metrics)

```sql
CREATE TABLE ai_usage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
  
  -- Snapshot Context
  snapshot_type VARCHAR(20) NOT NULL, -- daily, weekly, sprint, monthly
  snapshot_date DATE NOT NULL,
  
  -- Aggregated Token Usage
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_cached_tokens BIGINT DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(15,2) DEFAULT 0.0,
  
  -- Quality Metrics
  suggestions_accepted INTEGER DEFAULT 0,
  suggestions_total INTEGER DEFAULT 0,
  acceptance_rate DECIMAL(5,2),
  ai_assisted_output_percent DECIMAL(5,2),
  rework_rate DECIMAL(5,2),
  avg_latency_ms DECIMAL(10,2),
  
  -- Detailed Breakdown
  activity_breakdown JSONB DEFAULT '{}', -- { code_review: { tokens: 1000, cost: 0.05 }, ... }
  
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, snapshot_type, snapshot_date, user_id, model_id, sprint_id)
);

CREATE INDEX ai_snapshots_tenant ON ai_usage_snapshots(tenant_id);
CREATE INDEX ai_snapshots_user ON ai_usage_snapshots(user_id);
CREATE INDEX ai_snapshots_model ON ai_usage_snapshots(model_id);
CREATE INDEX ai_snapshots_product ON ai_usage_snapshots(product_id);
CREATE INDEX ai_snapshots_sprint ON ai_usage_snapshots(sprint_id);
CREATE INDEX ai_snapshots_date ON ai_usage_snapshots(snapshot_date);
```

### AI Budgets & Spend Management

```sql
CREATE TABLE ai_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
  
  -- Budget Configuration
  budget_type VARCHAR(20) NOT NULL, -- user, product, sprint, tenant
  period_type VARCHAR(20) NOT NULL, -- daily, weekly, sprint, monthly, custom
  budget_usd DECIMAL(10,2) NOT NULL,
  
  -- Alert Thresholds
  warning_threshold_percent INTEGER DEFAULT 80, -- alert at 80% usage
  critical_threshold_percent INTEGER DEFAULT 95, -- alert at 95% usage
  
  -- Control Actions
  enforce_hard_limit BOOLEAN DEFAULT false,
  action_on_exceed VARCHAR(50) DEFAULT 'notify', -- notify, suspend, downgrade
  
  -- Current State
  current_spend_usd DECIMAL(10,2) DEFAULT 0.0,
  budget_remaining_usd DECIMAL(10,2),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  reset_date DATE,
  
  -- Notification Status
  last_warning_at TIMESTAMP WITH TIME ZONE,
  last_critical_at TIMESTAMP WITH TIME ZONE,
  last_notified_user_id UUID,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, user_id, product_id, sprint_id, period_type, period_start)
);

CREATE INDEX ai_budgets_tenant ON ai_budgets(tenant_id);
CREATE INDEX ai_budgets_user ON ai_budgets(user_id);
CREATE INDEX ai_budgets_product ON ai_budgets(product_id);
CREATE INDEX ai_budgets_sprint ON ai_budgets(sprint_id);
CREATE INDEX ai_budgets_period ON ai_budgets(period_start, period_end);
```

### AI Settings & Configuration

```sql
CREATE TABLE ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Feature Flags
  enable_ai_features BOOLEAN DEFAULT true,
  enable_code_review BOOLEAN DEFAULT true,
  enable_test_generation BOOLEAN DEFAULT true,
  enable_documentation_assist BOOLEAN DEFAULT true,
  enable_bug_analysis BOOLEAN DEFAULT true,
  enable_chat_assistant BOOLEAN DEFAULT true,
  
  -- Model Preferences
  default_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  fallback_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  
  -- Usage Controls
  max_tokens_per_request INTEGER DEFAULT 4000,
  max_requests_per_day INTEGER DEFAULT 100,
  require_confirmation_for_cost DECIMAL(10,2), -- confirm if single request exceeds this amount
  
  -- Quality Preferences
  minimum_acceptance_rate DECIMAL(5,2), -- only suggest if above this rate
  enable_auto_suggestion BOOLEAN DEFAULT true,
  enable_learning_from_feedback BOOLEAN DEFAULT true,
  
  -- Privacy & Security
  allow_code_analysis BOOLEAN DEFAULT true,
  allow_telemetry BOOLEAN DEFAULT false,
  data_retention_days INTEGER DEFAULT 90,
  
  -- User Interface
  show_ai_confidence_scores BOOLEAN DEFAULT true,
  show_ai_cost_estimates BOOLEAN DEFAULT true,
  compact_ai_suggestions BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX ai_settings_tenant ON ai_settings(tenant_id);
CREATE INDEX ai_settings_user ON ai_settings(user_id);
```

---

## EXISTING ENTITIES CONTINUED

### 10. Work Items & Bug Intelligence

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

---

### 11. Test Management & Execution

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

---

### 12. Manual Deliverables & Activities

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

---

### 13. Sprints & Releases

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

---

### 14. Quality Metrics & Analytics

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
  sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
  
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
CREATE INDEX idx_team_perf_product ON team_performance_metrics(product_id);
CREATE INDEX idx_team_perf_sprint ON team_performance_metrics(sprint_id);
CREATE INDEX idx_team_perf_period ON team_performance_metrics(period_start, period_end);
```

---

### 15. Background Jobs & Sync Tracking

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

---

### 16. Audit Logging & Activity Tracking

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

---

### 17. Notification Management

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

## DATABASE VIEWS FOR COMMON QUERIES

```sql
-- Active User Context View
CREATE VIEW active_users_view AS
SELECT 
  u.id, u.email, u.full_name, u.avatar_url,
  tm.tenant_id, t.name as tenant_name, t.slug as tenant_slug,
  tm.role, tm.accessible_products,
  p.id as default_product_id, p.name as default_product_name, p.key as default_product_key,
  us.theme, us.timezone, us.date_format
FROM users u
JOIN tenant_memberships tm ON u.id = tm.user_id
JOIN tenants t ON tm.tenant_id = t.id
LEFT JOIN products p ON tm.default_product_id = p.id
LEFT JOIN user_settings us ON u.id = us.user_id
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

-- Alert Status Summary View (NEW)
CREATE VIEW alert_status_summary AS
SELECT 
  ar.id as rule_id, ar.rule_name, ar.rule_category, ar.severity, ar.metric_type,
  ai.id as incident_id, ai.incident_status, ai.triggered_at,
  t.name as tenant_name, p.name as product_name,
  ar.is_enabled, ar.last_triggered_at
FROM alert_rules ar
LEFT JOIN alert_incidents ai ON ar.id = ai.alert_rule_id AND ai.incident_status IN ('active', 'acknowledged')
LEFT JOIN tenants t ON ar.tenant_id = t.id
LEFT JOIN products p ON ai.affected_product_id = p.id
WHERE ar.is_enabled = true;

-- Team Health Overview View (NEW)
CREATE VIEW team_health_overview AS
SELECT 
  tm.tenant_id, tm.product_id, tm.period_type, tm.period_start, tm.period_end,
  tm.team_size, tm.burnout_risk_score, tm.silo_risk_count,
  tm.velocity_stability, tm.quality_score,
  tm.team_morale_score, tm.cross_team_collaboration_score,
  COUNT(DISTINCT ks.component) FILTER (WHERE ks.risk_level IN ('high', 'critical')) as critical_silos,
  COUNT(DISTINCT sg.user_id) FILTER (WHERE sg.gap_level = 'critical') as critical_skill_gaps
FROM team_health_metrics tm
LEFT JOIN knowledge_silo_analysis ks ON tm.tenant_id = ks.tenant_id 
  AND (tm.product_id IS NULL OR ks.product_id = tm.product_id)
LEFT JOIN skill_gaps sg ON tm.tenant_id = sg.tenant_id 
  AND sg.status IN ('open', 'in_progress')
GROUP BY tm.tenant_id, tm.product_id, tm.period_type, tm.period_start, tm.period_end;
```

---

This completes the updated database schema with all critical missing entities identified from the frontend-backend alignment analysis. The schema now includes:

## 🆕 NEW MAJOR SECTIONS ADDED:

1. **Settings & Configuration Management** - User preferences, tenant configuration, feature flags
2. **Search Infrastructure** - Full-text search analytics, popular searches, search suggestions
3. **Export & Reporting System** - Export jobs, report templates, scheduled reports, report library
4. **CI/CD Pipeline Integration** - Pipeline integrations, build runs, detailed test results
5. **Alert Management System** - Alert rules, incidents, notifications, maintenance windows
6. **Advanced People Analytics** - Knowledge silo analysis, skill gaps, team health, workload analysis

These additions address all the critical gaps identified in the frontend-backend alignment analysis and ensure production-ready feature completeness.
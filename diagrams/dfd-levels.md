# QualiMetrix Data Flow Diagrams (DFD)

## System Overview
Comprehensive data flow documentation for QualiMetrix showing how data moves through the system from external sources to user dashboards.

---

## Level 0: Context Diagram

```mermaid
graph TB
    subgraph "External Systems"
        JIRA[Jira Cloud]
        ADO[Azure DevOps]
        GITHUB[GitHub]
        CI[CI/CD Pipelines]
    end
    
    subgraph "Users"
        ADMIN[Admin User]
        TESTER[Tester]
        DEVELOPER[Developer]
        PO[Product Owner]
        EXEC[Executive]
    end
    
    QUALIMETRIX[QualiMetrix System]
    
    %% Data Flows from External Systems
    JIRA -- "OAuth 2.0<br/>Webhooks<br/>REST API" --> QUALIMETRIX
    ADO -- "OAuth 2.0<br/>Webhooks<br/>REST API" --> QUALIMETRIX
    GITHUB -- "Webhooks<br/>API Integration" --> QUALIMETRIX
    CI -- "JUnit XML<br/>Test Results" --> QUALIMETRIX
    
    %% Data Flows from Users
    ADMIN -- "RBAC Management<br/>System Config" --> QUALIMETRIX
    TESTER -- "Manual Test Logs<br/>Bug Reports" --> QUALIMETRIX
    DEVELOPER -- "Bug Updates<br/>Status Changes" --> QUALIMETRIX
    PO -- "Requirements<br/>Release Planning" --> QUALIMETRIX
    EXEC -- "Portfolio Analytics<br/>Reports" --> QUALIMETRIX
    
    %% Data Flows to Users
    QUALIMETRIX -- "Quality Dashboards<br/>Role-Based Views" --> ADMIN
    QUALIMETRIX -- "Test Execution<br/>Defect Metrics" --> TESTER
    QUALIMETRIX -- "Bug Intelligence<br/>Performance Stats" --> DEVELOPER
    QUALIMETRIX -- "Release Readiness<br/>RTM Reports" --> PO
    QUALIMETRIX -- "Portfolio Health<br/>ROI Analytics" --> EXEC
    
    style QUALIMETRIX fill:#0ea5e9,stroke:#0369a1,color:#fff
    style JIRA fill:#0052cc,stroke:#003d99,color:#fff
    style ADO fill:#0078d4,stroke:#005a9e,color:#fff
    style GITHUB fill:#24292e,stroke:#1b1f23,color:#fff
    style CI fill:#ff6b6b,stroke:#c92a2a,color:#fff
```

### **Context Diagram Description**

**External Systems:**
- **Jira Cloud**: OAuth authentication, webhook events, REST API sync
- **Azure DevOps**: OAuth authentication, area path mapping, work item sync
- **GitHub**: Webhooks for PR/commit tracking, defect density analysis
- **CI/CD Pipelines**: JUnit XML test result ingestion

**User Roles (5 personas):**
- **Admin**: RBAC management, integration configuration, system settings
- **Tester**: Test execution logging, bug reporting, operational deliverables
- **Developer**: Bug triaging, status updates, MTTR tracking
- **Product Owner**: Requirements management, release planning, RTM oversight
- **Executive**: Portfolio analytics, cross-product comparison, ROI tracking

---

## Level 1: Main System Processes

```mermaid
graph TB
    subgraph "External Data Sources"
        JIRA[Jira Cloud]
        ADO[Azure DevOps]
        USERS[Users]
    end
    
    subgraph "QualiMetrix Core System"
        AUTH[Authentication<br/>& RBAC]
        INGEST[Data Ingestion<br/>& Processing]
        INTELL[Bug Intelligence<br/>& Classification]
        STORE[Data Storage<br/>& Management]
        ANALYT[Analytics<br/>& Metrics]
        DASH[Dashboard<br/>& Reporting]
    end
    
    subgraph "Data Outputs"
        NOTIF[Notifications]
        REPORTS[Reports &<br/>Analytics]
        API[External API<br/>Responses]
    end
    
    %% Authentication Flow
    USERS -->|"Login<br/>Credentials"| AUTH
    AUTH -->|"Session Tokens<br/>User Context"| USERS
    
    %% Data Ingestion
    JIRA -->|"Webhooks<br/>OAuth"| INGEST
    ADO -->|"Webhooks<br/>OAuth"| INGEST
    USERS -->|"Manual Logs<br/>Deliverables"| INGEST
    
    %% Processing Pipeline
    INGEST -->|"Raw Data<br/>Events"| INTELL
    INTELL -->|"Classified Work Items<br/>Similarity Scores"| STORE
    INGEST -->|"Manual Deliverables<br/>Activity Logs"| STORE
    
    %% Analytics Processing
    STORE -->|"Historical Data<br/>Events"| ANALYT
    ANALYT -->|"Metrics Snapshots<br/>KPIs"| STORE
    
    %% Dashboard & Reporting
    STORE -->|"Query Results<br/>Aggregated Data"| DASH
    ANALYT -->|"Calculated Metrics<br/>Trends"| DASH
    
    %% User Outputs
    DASH -->|"Role-Based Dashboards<br/>KPI Cards"| USERS
    DASH -->|"Reports<br/>Export Data"| REPORTS
    DASH -->|"API Responses<br/>Webhook Events"| API
    ANALYT -->|"Alerts<br/>Threshold Breach"| NOTIF
    NOTIF -->|"Email<br/>Slack<br/>In-App"| USERS
    
    style AUTH fill:#10b981,stroke:#059669,color:#fff
    style INGEST fill:#f59e0b,stroke:#d97706,color:#fff
    style INTELL fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style STORE fill:#3b82f6,stroke:#2563eb,color:#fff
    style ANALYT fill:#ec4899,stroke:#db2777,color:#fff
    style DASH fill:#0ea5e9,stroke:#0369a1,color:#fff
```

### **Level 1 Process Descriptions**

#### **1. Authentication & RBAC**
- **Input**: User login credentials, OAuth tokens, SAML assertions
- **Process**: JWT token generation, role validation, session management
- **Output**: Session tokens, user context, role-based permissions
- **Storage**: Users, TenantMemberships, RefreshTokens

#### **2. Data Ingestion & Processing**
- **Input**: Webhook events, OAuth API calls, manual form submissions
- **Process**: Payload validation, data normalization, rate limiting
- **Output**: Standardized work items, test executions, deliverables
- **Storage**: WebhookEvents, WorkItems, TestExecutions

#### **3. Bug Intelligence & Classification**
- **Input**: Raw work items, bug descriptions, code paths
- **Process**: Domain classification, similarity detection, duplicate screening
- **Output**: Classified bugs, similarity scores, domain assignments
- **Storage**: BugSimilarities, WorkItems (with domain tags)

#### **4. Data Storage & Management**
- **Input**: All processed data entities
- **Process**: Multi-tenant isolation, RLS policy enforcement, data archiving
- **Output**: Queryable datasets with tenant isolation
- **Storage**: All database tables with RLS enabled

#### **5. Analytics & Metrics**
- **Input**: Historical work items, test executions, deliverables
- **Process**: KPI calculation, trend analysis, metric aggregation
- **Output**: Pre-calculated metrics snapshots, team performance stats
- **Storage**: QualityMetricsSnapshots, TeamPerformanceMetrics

#### **6. Dashboard & Reporting**
- **Input**: User queries, role context, metric snapshots
- **Process**: Data filtering, visualization generation, export formatting
- **Output**: Role-based dashboards, PDF reports, API responses
- **Storage**: Query cache (Redis), export files

---

## Level 2A: Authentication & Authorization Flow

```mermaid
graph TB
    subgraph "User Authentication"
        USER[User]
        CRED[Credentials<br/>OAuth/SAML]
    end
    
    subgraph "Authentication Process"
        VALIDATE[Validate Credentials]
        JWT[Generate JWT<br/>Tokens]
        RBAC[Load User<br/>Roles & Permissions]
        SESSION[Create Session<br/>Context]
    end
    
    subgraph "Authorization Check"
        REQUEST[API Request<br/>with JWT]
        VERIFY[Verify JWT<br/>Signature]
        EXTRACT[Extract User<br/>Context]
        CHECK[Check RBAC<br/>Permissions]
        ALLOW[Allow Access]
        DENY[Deny Access<br/>403 Forbidden]
    end
    
    subgraph "Data Storage"
        USERS_DB[(Users<br/>TenantMemberships)]
        TOKENS_DB[(RefreshTokens)]
        CACHE[(Redis<br/>Session Cache)]
    end
    
    %% Authentication Flow
    USER -->|"Login Request<br/>+ Credentials"| VALIDATE
    CRED -->|External Auth Provider| VALIDATE
    VALIDATE -->|"Valid User"| JWT
    JWT -->|"Access Token<br/>Refresh Token"| USERS_DB
    JWT -->|"Hashed Token"| TOKENS_DB
    JWT -->|"Session Data"| RBAC
    RBAC -->|"User + Tenant<br/>Role + Products"| SESSION
    SESSION -->|"Session Context"| CACHE
    SESSION -->|"Auth Response"| USER
    
    %% Authorization Flow
    USER -->|"API Request<br/>+ JWT"| REQUEST
    REQUEST -->|"JWT Token"| VERIFY
    VERIFY -->|"Valid/Invalid"| EXTRACT
    EXTRACT -->|"User ID<br/>Tenant ID<br/>Role"| CHECK
    CHECK -->|"Permission Check"| ALLOW
    CHECK -->|"No Permission"| DENY
    ALLOW -->|"Data Access"| USER
    DENY -->|"Error Response"| USER
    
    %% Storage Interactions
    VALIDATE <-->|"User Lookup<br/>Password Verify"| USERS_DB
    VERIFY <-->|"Token Validation<br/>Revocation Check"| TOKENS_DB
    CHECK <-->|"Role Lookup<br/>Product Access"| USERS_DB
    SESSION <-->|"Session Store<br/>TTL Management"| CACHE
    
    style VALIDATE fill:#10b981,stroke:#059669,color:#fff
    style JWT fill:#3b82f6,stroke:#2563eb,color:#fff
    style RBAC fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style CHECK fill:#f59e0b,stroke:#d97706,color:#fff
    style ALLOW fill:#10b981,stroke:#059669,color:#fff
    style DENY fill:#ef4444,stroke:#dc2626,color:#fff
```

### **Authentication Flow Details**

#### **Login Process**
1. **Credential Validation**: Check local password hash or OAuth/SAML token
2. **Token Generation**: Create JWT access token (15min) + refresh token (7d)
3. **Role Loading**: Fetch user memberships with tenant roles and product access
4. **Session Creation**: Store session context in Redis with 7d TTL

#### **Authorization Process**
1. **JWT Verification**: Validate token signature and expiration
2. **Context Extraction**: Extract user ID, tenant ID, role from JWT claims
3. **Permission Check**: Verify user has required role and product access
4. **Access Control**: Allow/deny based on RBAC policies

---

## Level 2B: External Integration Data Flow

```mermaid
graph TB
    subgraph "External Systems"
        JIRA[Jira Cloud]
        ADO[Azure DevOps]
        GITHUB[GitHub]
        CI[CI/CD Pipelines]
    end
    
    subgraph "Integration Layer"
        WEBHOOK[Webhook<br/>Receiver]
        OAUTH[OAuth<br/>Manager]
        SYNC[Background<br/>Sync]
    end
    
    subgraph "Data Processing"
        NORMALIZE[Data<br/>Normalization]
        CLASSIFY[Bug<br/>Classification]
        DEDUP[Duplicate<br/>Detection]
        VALIDATE[Data<br/>Validation]
    end
    
    subgraph "Data Storage"
        QUEUE[Background<br/>Job Queue]
        INTEGRATION_DB[(Integration<br/>Configs)]
        WEBHOOK_DB[(Webhook<br/>Events)]
        WORKITEM_DB[(WorkItems<br/>TestCases)]
        SYNC_DB[(Sync<br/>States)]
    end
    
    %% Webhook Flow
    JIRA -->|"Issue Created<br/>Updated<br/>Deleted"| WEBHOOK
    ADO -->|"Workitem Events<br/>Pipeline Events"| WEBHOOK
    GITHUB -->|"PR Events<br/>Push Events"| WEBHOOK
    CI -->|"Build Complete<br/>Test Results"| WEBHOOK
    
    %% Webhook Processing
    WEBHOOK -->|"Raw Payload<br/>Headers"| QUEUE
    QUEUE -->|"Async Processing"| NORMALIZE
    WEBHOOK -->|"Event Log<br/>Timestamps"| WEBHOOK_DB
    
    %% OAuth API Sync
    JIRA -->|"OAuth 2.0<br/>Access Token"| OAUTH
    ADO -->|"OAuth 2.0<br/>Access Token"| OAUTH
    OAUTH -->|"Encrypted<br/>Credentials"| INTEGRATION_DB
    OAUTH -->|"API Responses<br/>Incremental Sync"| SYNC
    
    %% Sync Processing
    SYNC -->|"Raw Data<br/>Pagination"| NORMALIZE
    SYNC -->|"Sync Progress<br/>Last Cursor"| SYNC_DB
    
    %% Data Processing Pipeline
    NORMALIZE -->|"Standardized<br/>Entity"| VALIDATE
    VALIDATE -->|"Valid<br/>Entity"| CLASSIFY
    VALIDATE -->|"Invalid<br/>+ Errors"| WEBHOOK_DB
    
    CLASSIFY -->|"Domain Tags<br/>Confidence"| DEDUP
    DEDUP -->|"Unique<br/>Work Items"| WORKITEM_DB
    DEDUP -->|"Similarity<br/>Scores"| WORKITEM_DB
    
    %% Error Handling
    CLASSIFY -->|"Classification<br/>Failed"| WEBHOOK_DB
    DEDUP -->|"Potential<br/>Duplicates"| WORKITEM_DB
    
    %% Sync State Updates
    SYNC -->|"Sync Complete<br/>+ Timestamps"| SYNC_DB
    SYNC -->|"Sync Failed<br/>+ Error"| SYNC_DB
    
    style WEBHOOK fill:#f59e0b,stroke:#d97706,color:#fff
    style OAUTH fill:#3b82f6,stroke:#2563eb,color:#fff
    style SYNC fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style CLASSIFY fill:#ec4899,stroke:#db2777,color:#fff
    style DEDUP fill:#10b981,stroke:#059669,color:#fff
```

### **Integration Flow Details**

#### **Webhook Processing**
1. **Event Reception**: Receive webhook payload with authentication
2. **Queue Processing**: Store raw event in background job queue
3. **Data Normalization**: Convert external format to internal schema
4. **Entity Processing**: Classify, deduplicate, and store entities

#### **OAuth API Sync**
1. **Token Management**: Handle access token refresh with encrypted storage
2. **Incremental Sync**: Fetch only changed entities using sync cursor
3. **Rate Limiting**: Respect API rate limits with exponential backoff
4. **Error Recovery**: Track sync failures with retry logic

#### **Data Processing Pipeline**
1. **Normalization**: Map Jira/ADO fields to unified schema
2. **Validation**: Enforce data constraints and business rules
3. **Classification**: AI-powered domain tagging with confidence scores
4. **Deduplication**: Similarity detection for duplicate bug screening

---

## Level 2C: Analytics & Metrics Calculation

```mermaid
graph TB
    subgraph "Data Sources"
        WORKITEMS[(WorkItems)]
        TESTS[(TestExecutions)]
        DELIVERABLES[(ManualDeliverables)]
        SPRINTS[(Sprints)]
    end
    
    subgraph "Metrics Calculation"
        AGGREGATE[Data<br/>Aggregation]
        CALCULATE[KPI<br/>Calculation]
        TREND[Trend<br/>Analysis]
        SCORE[Scoring<br/>Algorithms]
    end
    
    subgraph "Metrics Storage"
        SNAPSHOTS[(Metrics<br/>Snapshots)]
        PERFORMANCE[(Team<br/>Performance)]
        ALERTS[(Alert<br/>Thresholds)]
    end
    
    subgraph "Dashboard Delivery"
        QUERY[Dashboard<br/>Queries]
        CACHE[Redis<br/>Cache]
        VISUAL[Data<br/>Visualization]
    end
    
    subgraph "User Outputs"
        DASHBOARDS[Role-Based<br/>Dashboards]
        REPORTS[Analytical<br/>Reports]
        NOTIFICATIONS[Threshold<br/>Alerts]
    end
    
    %% Data Source Flow
    WORKITEMS -->|"Bug Metrics<br/>Status Changes"| AGGREGATE
    TESTS -->|"Execution Rates<br/>Pass/Fail"| AGGREGATE
    DELIVERABLES -->|"Activity Metrics<br/>Deliverable Counts"| AGGREGATE
    SPRINTS -->|"Time Periods<br/>Sprint Dates"| AGGREGATE
    
    %% Calculation Pipeline
    AGGREGATE -->|"Aggregated<br/>Data"| CALCULATE
    CALCULATE -->|"Test Execution<br/>Bug Metrics<br/>Time Metrics"| TREND
    CALCULATE -->|"Raw KPIs<br/>Counts & Rates"| SCORE
    
    TREND -->|"Trend Data<br/>Patterns"| SNAPSHOTS
    SCORE -->|"Quality Scores<br/>Readiness Index"| SNAPSHOTS
    SCORE -->|"Individual<br/>Metrics"| PERFORMANCE
    
    %% Alert Processing
    CALCULATE -->|"Current Metrics"| ALERTS
    ALERTS -->|"Threshold Checks<br/>Breach Detection"| NOTIFICATIONS
    ALERTS -->|"Alert History<br/>Trend Analysis"| SNAPSHOTS
    
    %% Dashboard Delivery
    SNAPSHOTS -->|"Pre-Calculated<br/>Metrics"| QUERY
    PERFORMANCE -->|"User Stats<br/>Productivity"| QUERY
    
    QUERY -->|"Metric Queries"| CACHE
    CACHE -->|"Cached Results<br/>&lt;200ms"| VISUAL
    CACHE -->|"Cache Miss<br/>DB Query"| QUERY
    
    VISUAL -->|"KPI Cards<br/>Charts<br/>Heatmaps"| DASHBOARDS
    VISUAL -->|"Export Data<br/>Trend Analysis"| REPORTS
    
    %% Alert Delivery
    NOTIFICATIONS -->|"Email<br/>Slack<br/>In-App"| NOTIFICATIONS
    
    style AGGREGATE fill:#3b82f6,stroke:#2563eb,color:#fff
    style CALCULATE fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style TREND fill:#ec4899,stroke:#db2777,color:#fff
    style SCORE fill:#10b981,stroke:#059669,color:#fff
    style CACHE fill:#f59e0b,stroke:#d97706,color:#fff
```

### **Analytics Flow Details**

#### **Data Aggregation**
1. **Multi-source Collection**: Aggregate data from work items, tests, deliverables
2. **Time-based Grouping**: Group by sprint, date range, or release
3. **Tenant Isolation**: Separate calculations per tenant/product
4. **Incremental Updates**: Only recalculate changed periods

#### **KPI Calculation**
1. **Test Metrics**: Execution rate, pass rate, automation ratio, blocked rate
2. **Bug Metrics**: Creation/resolution rates, leakage rate, reopen rate, escaped defects
3. **Time Metrics**: MTTR, MTTF, resolution duration, time to detect
4. **Quality Metrics**: First-time fix rate, QA rejection rate, defect density

#### **Trend Analysis**
1. **Pattern Detection**: Identify increasing/decreasing trends
2. **Anomaly Detection**: Flag unusual metric variations
3. **Predictive Analysis**: Forecast trends based on historical patterns
4. **Comparative Analysis**: Compare across products, sprints, teams

#### **Scoring Algorithms**
1. **Release Readiness**: Composite score from RTM coverage, defect counts, pass rates
2. **Quality Health Index**: Multi-dimensional quality assessment
3. **Team Performance**: Individual productivity and quality contributions
4. **Automation ROI**: Cost-benefit analysis of automation investments

---

## Level 2D: Bug Intelligence Processing

```mermaid
graph TB
    subgraph "Input Sources"
        WEBHOOK[Webhook<br/>Events]
        MANUAL[Manual<br/>Reports]
        API[REST API<br/>Calls]
    end
    
    subgraph "Bug Processing"
    EXTRACT[Bug Data<br/>Extraction]
    ENRICH[Data<br/>Enrichment]
    CLASSIFY[Domain<br/>Classification]
    SIMILAR[Similarity<br/>Detection]
    SCORE[Confidence<br/>Scoring]
    end
    
    subgraph "AI/ML Processing"
        TOKEN[Text<br/>Tokenization]
        VEC[Vector<br/>Generation]
        COSINE[Cosine<br/>Similarity]
        RULE[Rule-Based<br/>Classifier]
    end
    
    subgraph "Data Storage"
        BUGS[(WorkItems<br/>Bugs)]
        SIMILARITIES[(Bug<br/>Similarities)]
        PATTERNS[(Classification<br/>Patterns)]
        FEEDBACK[(User<br/>Feedback)]
    end
    
    subgraph "User Interaction"
        DASHBOARD[Bug<br/>Dashboard]
        REVIEW[Similarity<br/>Review]
        APPROVE[User<br/>Approval]
        REJECT[User<br/>Rejection]
    end
    
    %% Input Flow
    WEBHOOK -->|"Raw Bug<br/>Data"| EXTRACT
    MANUAL -->|"Bug Form<br/>Submission"| EXTRACT
    API -->|"Bug Creation<br/>API"| EXTRACT
    
    %% Processing Pipeline
    EXTRACT -->|"Title<br/>Description<br/>Code Path"| ENRICH
    ENRICH -->|"Enriched<br/>Bug Data"| CLASSIFY
    
    %% Domain Classification
    CLASSIFY -->|"Text Analysis"| TOKEN
    TOKEN -->|"Keywords<br/>Tokens"| RULE
    RULE -->|"Domain Rules<br/>Pattern Matching"| CLASSIFY
    CLASSIFY -->|"Domain Tag<br/>+ Confidence"| SCORE
    
    %% Similarity Detection
    SCORE -->|"Bug Text<br/>+ Metadata"| SIMILAR
    SIMILAR -->|"Existing<br/>Corpus"| VEC
    VEC -->|"TF-IDF<br/>Vectors"| COSINE
    COSINE -->|"Similarity<br/>Scores"| SIMILAR
    SIMILAR -->|"Similar Bugs<br/>+ Scores"| PATTERNS
    
    %% Storage
    SCORE -->|"Classified<br/>Bugs"| BUGS
    SIMILAR -->|"Similarity<br/>Relationships"| SIMILARITIES
    CLASSIFY -->|"Classification<br/>Models"| PATTERNS
    
    %% User Feedback Loop
    PATTERNS -->|"Similarity<br/>Suggestions"| DASHBOARD
    DASHBOARD -->|"Review<br/>Interface"| REVIEW
    REVIEW -->|"Confirm<br/>Duplicate"| APPROVE
    REVIEW -->|"Reject<br/>Suggestion"| REJECT
    APPROVE -->|"Positive<br/>Feedback"| FEEDBACK
    REJECT -->|"Negative<br/>Feedback"| FEEDBACK
    FEEDBACK -->|"Model<br/>Retraining"| PATTERNS
    
    style EXTRACT fill:#3b82f6,stroke:#2563eb,color:#fff
    style CLASSIFY fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style SIMILAR fill:#ec4899,stroke:#db2777,color:#fff
    style COSINE fill:#10b981,stroke:#059669,color:#fff
    style APPROVE fill:#10b981,stroke:#059669,color:#fff
    style REJECT fill:#ef4444,stroke:#dc2626,color:#fff
```

### **Bug Intelligence Flow Details**

#### **Data Extraction & Enrichment**
1. **Multi-source Input**: Webhook events, manual forms, API calls
2. **Data Enrichment**: Add component, product, sprint context
3. **Text Processing**: Extract title, description, code paths, stack traces
4. **Metadata Addition**: Priority, assignee, reporter, external IDs

#### **Domain Classification**
1. **Rule-Based Classification**: Keyword matching against domain patterns
2. **Text Tokenization**: Extract meaningful terms from bug descriptions
3. **Domain Assignment**: UI/UX, Backend/API, AI/ML Team, Infrastructure
4. **Confidence Scoring**: Calculate classification confidence (0.0-1.0)

#### **Similarity Detection**
1. **Text Vectorization**: TF-IDF vector generation for bug text
2. **Corpus Comparison**: Compare against existing bug database
3. **Cosine Similarity**: Calculate similarity scores (0.0-1.0)
4. **Candidate Ranking**: Return top 3 most similar bugs with scores

#### **User Feedback Loop**
1. **Review Interface**: Present similarity suggestions to users
2. **User Action**: Confirm/reject duplicate suggestions
3. **Model Retraining**: Update classification patterns based on feedback
4. **Accuracy Improvement**: Continuous learning from user corrections

---

## Security Data Flow

```mermaid
graph TB
    subgraph "Security Layers"
        ENCRYPT[Encryption<br/>at Rest]
        RLS[Row-Level<br/>Security]
        AUDIT[Audit<br/>Logging]
        RATE[Rate<br/>Limiting]
    end
    
    subgraph "Data Protection"
        CREDENTIALS[Integration<br/>Credentials]
        PERSONAL[User<br/>PII]
        TENANT[Tenant<br/>Data]
        SESSIONS[Session<br/>Tokens]
    end
    
    subgraph "Monitoring"
        ALERT[Security<br/>Alerts]
        COMPLIANCE[Compliance<br/>Reporting]
        INCIDENT[Incident<br/>Response]
    end
    
    subgraph "Storage"
        SECURE_DB[(Encrypted<br/>Database)]
        AUDIT_DB[(Audit<br/>Logs)]
        MONITORING[(Security<br/>Events)]
    end
    
    %% Encryption Flow
    CREDENTIALS -->|"AES-256<br/>Encryption"| ENCRYPT
    PERSONAL -->|"Field-Level<br/>Encryption"| ENCRYPT
    ENCRYPT -->|"Encrypted<br/>Data"| SECURE_DB
    
    %% Access Control
    TENANT -->|"Tenant ID<br/>Filtering"| RLS
    SESSIONS -->|"User Context<br/>Validation"| RLS
    RLS -->|"Policy<br/>Enforcement"| TENANT
    
    %% Rate Limiting
    SESSIONS -->|"Request<br/>Counting"| RATE
    RATE -->|"Threshold<br/>Check"| SESSIONS
    RATE -->|"Rate Limit<br/>Exceeded"| ALERT
    
    %% Audit Logging
    RLS -->|"Access<br/>Attempts"| AUDIT
    ENCRYPT -->|"Data<br/>Access"| AUDIT
    AUDIT -->|"Audit Trail"| AUDIT_DB
    
    %% Security Monitoring
    ALERT -->|"Security<br/>Events"| MONITORING
    AUDIT_DB -->|"Compliance<br/>Data"| COMPLIANCE
    ALERT -->|"Incident<br/>Response"| INCIDENT
    
    style ENCRYPT fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style RLS fill:#10b981,stroke:#059669,color:#fff
    style AUDIT fill:#f59e0b,stroke:#d97706,color:#fff
    style RATE fill:#ef4444,stroke:#dc2626,color:#fff
```

### **Security Flow Details**

#### **Encryption at Rest**
1. **Credential Encryption**: AES-256 encryption for OAuth tokens, API keys
2. **Field-Level Encryption**: Sensitive PII fields encrypted individually
3. **Key Management**: Secure key storage with rotation policies
4. **Data Masking**: Sensitive data masked in logs and responses

#### **Row-Level Security**
1. **Tenant Isolation**: Automatic filtering by tenant_id in all queries
2. **Role-Based Access**: Additional filtering based on user roles
3. **Product Access Control**: Respect user's product access permissions
4. **Policy Enforcement**: Database-level RLS policies for all major tables

#### **Audit Logging**
1. **Comprehensive Logging**: All data access, modifications, deletions logged
2. **User Context**: Track user, IP, timestamp for all operations
3. **Data Changes**: Store old/new values for audit trail
4. **Compliance Reporting**: Generate compliance reports from audit logs

#### **Rate Limiting & Monitoring**
1. **Request Throttling**: Per-user and per-tenant rate limits
2. **Anomaly Detection**: Flag unusual access patterns
3. **Security Alerts**: Real-time alerts for security incidents
4. **Incident Response**: Automated and manual incident handling

---

## Performance Optimization Flow

```mermaid
graph TB
    subgraph "Query Optimization"
        CACHE_STRATEGY[Cache<br/>Strategy]
        QUERY_OPT[Query<br/>Optimization]
        INDEX[Index<br/>Strategy]
        POOL[Connection<br/>Pooling]
    end
    
    subgraph "Data Caching"
        REDIS[(Redis<br/>Cache)]
        MEMCACHE[Query<br/>Results]
        SESSIONS[User<br/>Sessions]
        DASHBOARD[Dashboard<br/>Data]
    end
    
    subgraph "Database Performance"
        SLOW[Slow Query<br/>Detection]
        ANALYZE[Query<br/>Analysis]
        OPTIMIZE[Performance<br/>Tuning]
        MAINTAIN[Database<br/>Maintenance]
    end
    
    subgraph "Monitoring"
        PERF[Performance<br/>Metrics]
        BOTTLENECK[Bottleneck<br/>Analysis]
        SCALE[Scaling<br/>Decisions]
    end
    
    %% Caching Strategy
    QUERY_OPT -->|"Frequent Queries"| CACHE_STRATEGY
    CACHE_STRATEGY -->|"Cache Key<br/>Generation"| REDIS
    REDIS -->|"Cached Results<br/>&lt;200ms"| MEMCACHE
    REDIS -->|"Session Store<br/>TTL Management"| SESSIONS
    REDIS -->|"Dashboard Cache<br/>Role-Based"| DASHBOARD
    
    %% Query Optimization
    QUERY_OPT -->|"Execution Plans"| ANALYZE
    ANALYZE -->|"Slow Queries"| SLOW
    SLOW -->|"Query<br/>Optimization"| OPTIMIZE
    OPTIMIZE -->|"Index<br/>Suggestions"| INDEX
    INDEX -->|"Performance<br/>Improvement"| QUERY_OPT
    
    %% Database Maintenance
    ANALYZE -->|"Table<br/>Statistics"| MAINTAIN
    MAINTAIN -->|"VACUUM<br/>ANALYZE"| PERF
    MAINTAIN -->|"Index<br/>Rebuild"| PERF
    PERF -->|"Performance<br/>Metrics"| MONITORING
    
    %% Monitoring & Scaling
    PERF -->|"Response Times<br/>Throughput"| BOTTLENECK
    BOTTLENECK -->|"Scaling<br/>Needs"| SCALE
    SCALE -->|"Horizontal<br/>Scaling"| POOL
    SCALE -->|"Vertical<br/>Scaling"| POOL
    
    %% Connection Pooling
    QUERY_OPT -->|"Connection<br/>Requests"| POOL
    POOL -->|"Connection<br/>Reuse"| QUERY_OPT
    POOL -->|"Pool<br/>Management"| PERF
    
    style CACHE_STRATEGY fill:#10b981,stroke:#059669,color:#fff
    style QUERY_OPT fill:#3b82f6,stroke:#2563eb,color:#fff
    style INDEX fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style POOL fill:#ec4899,stroke:#db2777,color:#fff
```

### **Performance Flow Details**

#### **Caching Strategy**
1. **Multi-Layer Cache**: Redis for distributed caching, in-memory for local cache
2. **Cache Keys**: Structured keys with tenant, role, data type
3. **TTL Management**: Different expiration times for different data types
4. **Cache Invalidation**: Smart invalidation on data updates

#### **Query Optimization**
1. **Execution Plans**: Analyze query execution plans for optimization
2. **Index Strategy**: Strategic indexes on frequently queried columns
3. **Query Refactoring**: Optimize expensive queries with better patterns
4. **Connection Pooling**: Reuse database connections for better performance

#### **Database Maintenance**
1. **Regular VACUUM**: Remove dead tuples and reclaim space
2. **Statistics Update**: Keep table statistics current for query planning
3. **Index Rebuild**: Rebuild fragmented indexes for better performance
4. **Partition Management**: Manage time-series partitions for optimal queries

#### **Performance Monitoring**
1. **Metrics Collection**: Track response times, throughput, error rates
2. **Bottleneck Analysis**: Identify performance bottlenecks in data flow
3. **Scaling Decisions**: Make data-driven scaling decisions
4. **Capacity Planning**: Plan capacity based on performance trends

---

## Real-time Data Sync Flow

```mermaid
graph TB
    subgraph "External Systems"
        JIRA[Jira Cloud]
        ADO[Azure DevOps]
    end
    
    subgraph "Real-time Processing"
        WEBHOOK[Webhook<br/>Receiver]
        VALIDATE[Payload<br/>Validation]
        QUEUE[Event<br/>Queue]
        PROCESS[Async<br/>Processor]
    end
    
    subgraph "Data Updates"
        WORKITEMS[WorkItem<br/>Updates]
        TESTS[Test<br/>Updates]
        METRICS[Metric<br/>Recalculation]
        CACHE[Cache<br/>Invalidation]
    end
    
    subgraph "User Notifications"
        WEBSOCKET[WebSocket<br/>Push]
        EMAIL[Email<br/>Notifications]
        SLACK[Slack<br/>Alerts]
    end
    
    subgraph "Monitoring"
        SYNC_HEALTH[Sync<br/>Health]
        ERROR[Error<br/>Tracking]
        RETRY[Retry<br/>Logic]
    end
    
    %% Webhook Flow
    JIRA -->|"Real-time<br/>Webhooks"| WEBHOOK
    ADO -->|"Real-time<br/>Webhooks"| WEBHOOK
    WEBHOOK -->|"Signature<br/>Validation"| VALIDATE
    VALIDATE -->|"Valid<br/>Payloads"| QUEUE
    VALIDATE -->|"Invalid<br/>Payloads"| ERROR
    
    %% Processing Flow
    QUEUE -->|"Background<br/>Jobs"| PROCESS
    PROCESS -->|"Data<br/>Updates"| WORKITEMS
    PROCESS -->|"Test<br/>Results"| TESTS
    PROCESS -->|"Metric<br/>Updates"| METRICS
    
    %% Cache & Notification
    WORKITEMS -->|"Cache<br/>Invalidation"| CACHE
    TESTS -->|"Cache<br/>Invalidation"| CACHE
    METRICS -->|"Dashboard<br/>Updates"| WEBSOCKET
    
    %% User Notifications
    METRICS -->|"Threshold<br/>Breach"| EMAIL
    WORKITEMS -->|"Assignment<br/>Changes"| WEBSOCKET
    TESTS -->|"Test<br/>Failures"| SLACK
    
    %% Monitoring & Error Handling
    PROCESS -->|"Processing<br/>Errors"| ERROR
    ERROR -->|"Retry<br/>Queue"| RETRY
    RETRY -->|"Retry<br/>Attempts"| PROCESS
    RETRY -->|"Max Retries<br/>Exceeded"| SYNC_HEALTH
    
    SYNC_HEALTH -->|"Sync<br/>Status"| METRICS
    SYNC_HEALTH -->|"Health<br/>Checks"| PROCESS
    
    style WEBHOOK fill:#f59e0b,stroke:#d97706,color:#fff
    style PROCESS fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style WEBSOCKET fill:#10b981,stroke:#059669,color:#fff
    style RETRY fill:#ef4444,stroke:#dc2626,color:#fff
```

### **Real-time Sync Flow Details**

#### **Webhook Processing**
1. **Immediate Validation**: Validate webhook signatures and payloads
2. **Queue Processing**: Background job queue for async processing
3. **Error Handling**: Retry logic with exponential backoff
4. **Monitoring**: Track sync health and processing status

#### **Data Updates**
1. **Real-time Updates**: Immediate database updates from webhook data
2. **Metric Recalculation**: Background recalculation of affected metrics
3. **Cache Invalidation**: Smart cache invalidation for updated data
4. **Dashboard Updates**: Real-time dashboard updates via WebSocket

#### **User Notifications**
1. **Immediate Alerts**: Real-time notifications for critical events
2. **Email Notifications**: Batched email notifications for non-critical events
3. **Slack Integration**: Slack alerts for specific event types
4. **WebSocket Push**: Real-time push notifications to connected clients

#### **Monitoring & Reliability**
1. **Sync Health Monitoring**: Track sync status and error rates
2. **Error Tracking**: Comprehensive error logging and tracking
3. **Retry Logic**: Exponential backoff for failed operations
4. **Circuit Breaker**: Circuit breaker pattern for failing integrations

---

This comprehensive DFD documentation covers all major data flows in the QualiMetrix system, from external integrations to user dashboards, with detailed security, performance, and monitoring considerations. Each level provides increasing detail while maintaining clarity about system architecture and data movement.
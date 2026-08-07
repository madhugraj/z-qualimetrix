# QualiMetrix Data Flow Diagrams (Updated & Complete)

## System Overview
Comprehensive data flow documentation for QualiMetrix showing **all** system processes, including new search, export, alert, CI/CD, and people analytics flows.

---

## Level 0: Context Diagram (Updated)

```mermaid
graph TB
    subgraph "External Systems"
        JIRA[Jira Cloud]
        ADO[Azure DevOps]
        GITHUB[GitHub]
        CI[CI/CD Pipelines]
        EMAIL[Email Service]
        SLACK[Slack API]
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
    CI -- "JUnit XML<br/>Test Results<br/>Build Status" --> QUALIMETRIX
    
    %% Data Flows to External Systems
    QUALIMETRIX -- "Alert Notifications<br/>Report Emails" --> EMAIL
    QUALIMETRIX -- "Team Updates<br/>Alert Notifications" --> SLACK
    
    %% Data Flows from Users
    ADMIN -- "RBAC Management<br/>Alert Config<br/>Export Requests" --> QUALIMETRIX
    TESTER -- "Manual Test Logs<br/>Bug Reports<br/>Search Queries" --> QUALIMETRIX
    DEVELOPER -- "Bug Updates<br/>Status Changes<br/>Settings Prefs" --> QUALIMETRIX
    PO -- "Requirements<br/>Report Generation<br/>Release Planning" --> QUALIMETRIX
    EXEC -- "Portfolio Analytics<br/>People Insights<br/>Strategic Reports" --> QUALIMETRIX
    
    %% Data Flows to Users
    QUALIMETRIX -- "Quality Dashboards<br/>Search Results<br/>Export Files" --> ADMIN
    QUALIMETRIX -- "Test Execution<br/>Defect Metrics<br/>Assignments" --> TESTER
    QUALIMETRIX -- "Bug Intelligence<br/>CI Results<br/>Performance Stats" --> DEVELOPER
    QUALIMETRIX -- "Release Readiness<br/>RTM Reports<br/>Scheduled Reports" --> PO
    QUALIMETRIX -- "Team Health<br/>People Analytics<br/>ROI Analytics" --> EXEC
    
    style QUALIMETRIX fill:#0ea5e9,stroke:#0369a1,color:#fff
    style JIRA fill:#0052cc,stroke:#003d99,color:#fff
    style ADO fill:#0078d4,stroke:#005a9e,color:#fff
    style GITHUB fill:#24292e,stroke:#1b1f23,color:#fff
    style CI fill:#ff6b6b,stroke:#c92a2a,color:#fff
    style EMAIL fill:#f59e0b,stroke:#d97706,color:#fff
    style SLACK fill:#4a154b,stroke:#361134,color:#fff
```

---

## Level 1: Main System Processes (Updated)

```mermaid
graph TB
    subgraph "External Data Sources"
        JIRA[Jira Cloud]
        ADO[Azure DevOps]
        CI_PIPES[CI/CD Pipelines]
        USERS[Users]
    end
    
    subgraph "QualiMetrix Core System"
        AUTH[Authentication<br/>& RBAC]
        SETTINGS[Settings<br/>& Config]
        INGEST[Data Ingestion<br/>& Processing]
        INTELL[Bug Intelligence<br/>& Classification]
        SEARCH[Search<br/>Infrastructure]
        EXPORT[Export &<br/>Reporting]
        ALERT[Alert<br/>Management]
        PEOPLE[People<br/>Analytics]
        STORE[Data Storage<br/>& Management]
        ANALYT[Analytics<br/>& Metrics]
        DASH[Dashboard<br/>& Reporting]
        NOTIF[Notification<br/>Delivery]
    end
    
    subgraph "Data Outputs"
        REPORTS[Reports &<br/>Analytics]
        EXPORTS[Export<br/>Files]
        SEARCH_RESULTS[Search<br/>Results]
        ALERTS[Alert<br/>Notifications]
        API[External API<br/>Responses]
    end
    
    %% Authentication Flow
    USERS -->|"Login<br/>Credentials"| AUTH
    AUTH -->|"Session Tokens<br/>User Context"| USERS
    
    %% Settings Management
    USERS -->|"User Prefs<br/>Tenant Config"| SETTINGS
    SETTINGS -->|"Feature Flags<br/>Settings"| STORE
    
    %% Data Ingestion
    JIRA -->|"Webhooks<br/>OAuth"| INGEST
    ADO -->|"Webhooks<br/>OAuth"| INGEST
    CI_PIPES -->|"Test Results<br/>Build Status"| INGEST
    USERS -->|"Manual Logs<br/>Deliverables"| INGEST
    
    %% Processing Pipeline
    INGEST -->|"Raw Data<br/>Events"| INTELL
    INTELL -->|"Classified Work Items<br/>Similarity Scores"| STORE
    INGEST -->|"Manual Deliverables<br/>Activity Logs"| STORE
    
    %% Search Processing
    USERS -->|"Search Queries<br/>Filters"| SEARCH
    SEARCH -->|"Search Analytics<br/>Optimized Queries"| STORE
    STORE -->|"Full-Text Results<br/>Suggestions"| SEARCH
    
    %% Export Processing
    USERS -->|"Export Requests<br/>Report Configs"| EXPORT
    EXPORT -->|"Job Queues<br/>Report Generation"| STORE
    STORE -->|"Data Extraction<br/>Formatting"| EXPORT
    
    %% Alert Processing
    STORE -->|"Metric Updates<br/>Threshold Checks"| ALERT
    ALERT -->|"Alert Incidents<br/>Routing Rules"| STORE
    ALERT -->|"Alert Notifications"| NOTIF
    
    %% People Analytics
    STORE -->|"Code Changes<br/>Bug Patterns<br/>Workload Data"| PEOPLE
    PEOPLE -->|"Silo Detection<br/>Skill Gaps<br/>Team Health"| STORE
    
    %% Analytics Processing
    STORE -->|"Historical Data<br/>Events"| ANALYT
    ANALYT -->|"Metrics Snapshots<br/>KPIs"| STORE
    
    %% Dashboard & Reporting
    STORE -->|"Query Results<br/>Aggregated Data"| DASH
    SEARCH -->|"Search Results<br/>Quick Filters"| DASH
    ANALYT -->|"Calculated Metrics<br/>Trends"| DASH
    
    %% User Outputs
    DASH -->|"Role-Based Dashboards<br/>KPI Cards"| USERS
    EXPORT -->|"Export Files<br/>Scheduled Reports"| EXPORTS
    SEARCH -->|"Search Results<br/>Suggestions"| SEARCH_RESULTS
    DASH -->|"Reports<br/>Export Data"| REPORTS
    DASH -->|"API Responses<br/>Webhook Events"| API
    
    %% Notification Delivery
    NOTIF -->|"Email<br/>Slack<br/>In-App"| USERS
    NOTIF -->|"External<br/>Notifications"| ALERTS
    
    style AUTH fill:#10b981,stroke:#059669,color:#fff
    style SETTINGS fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style SEARCH fill:#f59e0b,stroke:#d97706,color:#fff
    style EXPORT fill:#ec4899,stroke:#db2777,color:#fff
    style ALERT fill:#ef4444,stroke:#dc2626,color:#fff
    style PEOPLE fill:#06b6d4,stroke:#0891b2,color:#fff
```

---

## 🆕 Level 2A: Search Infrastructure Flow

```mermaid
graph TB
    subgraph "User Interactions"
        USER[User]
        KEYBOARD[Keyboard<br/>Shortcuts]
        SEARCH_BAR[Search<br/>Bar]
    end
    
    subgraph "Search Processing"
        RECEIVE[Receive<br/>Search Query]
        PARSE[Parse Query<br/>& Filters]
        AUTHZ[Authorization<br/>Check]
        SEARCH_DB[Full-Text<br/>Search]
        FILTER[Apply<br/>Filters]
        RANK[Rank &<br/>Sort]
        SUGGEST[Generate<br/>Suggestions]
    end
    
    subgraph "Analytics & Optimization"
        TRACK[Track Search<br/>Analytics]
        ANALYZE[Analyze<br/>Patterns]
        OPTIMIZE[Optimize<br/>Indexes]
        POPULAR[Popular<br/>Searches]
    end
    
    subgraph "Data Storage"
        SEARCH_IDX[(Full-Text<br/>Indexes)]
        ANALYTICS_DB[(Search<br/>Analytics)]
        SUGGESTIONS_DB[(Search<br/>Suggestions)]
        RESULTS_CACHE[(Results<br/>Cache)]
    end
    
    subgraph "Response Generation"
        FORMAT[Format<br/>Results]
        PAGINATE[Paginate<br/>Results]
        CACHE_results[Cache<br/>Results]
        RESPOND[Return<br/>Response]
    end
    
    %% User Input Flow
    USER -->|"⌘K<br/>Search"| KEYBOARD
    USER -->|"Type<br/>Query"| SEARCH_BAR
    KEYBOARD -->|"Search<br/>Request"| RECEIVE
    SEARCH_BAR -->|"Search<br/>Request"| RECEIVE
    
    %% Search Processing
    RECEIVE -->|"Query +<br/>Context"| PARSE
    PARSE -->|"Parsed<br/>Query"| AUTHZ
    AUTHZ -->|"Authorized<br/>Request"| SEARCH_DB
    SEARCH_DB -->|"Indexed<br/>Results"| FILTER
    FILTER -->|"Filtered<br/>Results"| RANK
    RANK -->|"Ranked<br/>Results"| SUGGEST
    
    %% Suggestion Generation
    SUGGEST -->|"Quick Filters<br/>Shortcuts"| SUGGESTIONS_DB
    SUGGESTIONS_DB -->|"Matching<br/>Suggestions"| FORMAT
    
    %% Analytics Tracking
    RECEIVE -->|"Raw Query<br/>Context"| TRACK
    TRACK -->|"Search<br/>Event"| ANALYTICS_DB
    ANALYTICS_DB -->|"Search<br/>Data"| ANALYZE
    ANALYZE -->|"Usage<br/>Patterns"| POPULAR
    ANALYZE -->|"Index<br/>Optimizations"| OPTIMIZE
    OPTIMIZE -->|"Index<br/>Updates"| SEARCH_IDX
    
    %% Response Generation
    SUGGEST -->|"Ranked<br/>Results"| FORMAT
    FORMAT -->|"Formatted<br/>Results"| PAGINATE
    PAGINATE -->|"Paginated<br/>Results"| CACHE_results
    CACHE_results -->|"Cached<br/>Results"| RESULTS_CACHE
    CACHE_results -->|"Final<br/>Results"| RESPOND
    RESPOND -->|"Search<br/>Response"| USER
    
    %% Cache Hits
    USER -->|"Subsequent<br/>Searches"| RECEIVE
    RESULTS_CACHE -->|"Cached<br/>Results"| RESPOND
    
    style RECEIVE fill:#3b82f6,stroke:#2563eb,color:#fff
    style SEARCH_DB fill:#10b981,stroke:#059669,color:#fff
    style TRACK fill:#f59e0b,stroke:#d97706,color:#fff
    style SUGGEST fill:#8b5cf6,stroke:#7c3aed,color:#fff
```

### **Search Infrastructure Flow Details**

#### **Query Processing**
1. **Input Reception**: Receive search queries from keyboard shortcuts (⌘K) or search bar
2. **Query Parsing**: Extract search terms, filters, and scope (bugs, people, stories)
3. **Authorization Check**: Verify user permissions for searched entities
4. **Full-Text Search**: Query PostgreSQL full-text indexes with TF-IDF ranking

#### **Results Processing**
1. **Filter Application**: Apply role-based, product-based, and custom filters
2. **Ranking & Sorting**: Rank by relevance, date, priority, or custom criteria
3. **Suggestion Enhancement**: Add admin-configured suggestions and shortcuts
4. **Response Formatting**: Format results for UI display with pagination

#### **Analytics & Optimization**
1. **Search Tracking**: Log all searches with results, clicks, and timing
2. **Pattern Analysis**: Identify popular searches and zero-result queries
3. **Index Optimization**: Update indexes based on search patterns
4. **Caching Strategy**: Cache common searches and result sets

---

## 🆕 Level 2B: Export & Reporting Flow

```mermaid
graph TB
    subgraph "User Requests"
        USER[User]
        EXPORT_UI[Export<br/>Menu]
        REPORT_UI[Report<br/>Builder]
        SCHEDULE_UI[Schedule<br/>Reports]
    end
    
    subgraph "Export Processing"
        CREATE_JOB[Create<br/>Export Job]
        QUEUE_JOB[Queue<br/>Job]
        EXTRACT[Extract<br/>Data]
        TRANSFORM[Transform<br/>& Format]
        GENERATE[Generate<br/>File]
        STORE_FILE[Store<br/>File]
        NOTIFY[Notify<br/>User]
    end
    
    subgraph "Report Generation"
        SELECT_TEMPLATE[Select<br/>Template]
        CONFIGURE[Configure<br/>Report]
        APPLY_LAYOUT[Apply<br/>Layout]
        RENDER_CHARTS[Render<br/>Charts]
        COMPILE[Compile<br/>Report]
        SCHEDULE[Schedule<br/>Generation]
    end
    
    subgraph "Data Storage"
        JOB_QUEUE[(Export<br/>Jobs)]
        TEMPLATE_DB[(Report<br/>Templates)]
        SCHEDULED_DB[(Scheduled<br/>Reports)]
        LIBRARY_DB[(Report<br/>Library)]
        FILE_STORAGE[(File<br/>Storage)]
    end
    
    subgraph "Delivery & Notifications"
        DOWNLOAD[Download<br/>Link]
        EMAIL_DEL[Email<br/>Delivery]
        SLACK_DEL[Slack<br/>Delivery]
        LIBRARY[Report<br/>Library]
    end
    
    %% Export Flow
    USER -->|"Export<br/>Request"| EXPORT_UI
    EXPORT_UI -->|"Export<br/>Config"| CREATE_JOB
    CREATE_JOB -->|"Job<br/>Details"| QUEUE_JOB
    QUEUE_JOB -->|"Queued<br/>Job"| JOB_QUEUE
    
    %% Job Processing
    JOB_QUEUE -->|"Process<br/>Job"| EXTRACT
    EXTRACT -->|"Raw<br/>Data"| TRANSFORM
    TRANSFORM -->|"Transformed<br/>Data"| GENERATE
    GENERATE -->|"File<br/>Content"| STORE_FILE
    STORE_FILE -->|"File<br/>URL"| FILE_STORAGE
    
    %% User Notification
    STORE_FILE -->|"File<br/>Ready"| NOTIFY
    NOTIFY -->|"Notification"| USER
    NOTIFY -->|"Download<br/>Link"| DOWNLOAD
    
    %% Report Generation
    USER -->|"Report<br/>Request"| REPORT_UI
    REPORT_UI -->|"Template<br/>Selection"| SELECT_TEMPLATE
    SELECT_TEMPLATE -->|"Template<br/>Config"| TEMPLATE_DB
    TEMPLATE_DB -->|"Template<br/>Definition"| CONFIGURE
    
    %% Report Configuration
    CONFIGURE -->|"Report<br/>Config"| APPLY_LAYOUT
    APPLY_LAYOUT -->|"Layout<br/>Config"| RENDER_CHARTS
    RENDER_CHARTS -->|"Chart<br/>Data"| COMPILE
    COMPILE -->|"Compiled<br/>Report"| LIBRARY
    
    %% Scheduled Reports
    USER -->|"Schedule<br/>Request"| SCHEDULE_UI
    SCHEDULE_UI -->|"Schedule<br/>Config"| SCHEDULE
    SCHEDULE -->|"Scheduled<br/>Report"| SCHEDULED_DB
    SCHEDULED_DB -->|"Auto-<br/>Generation"| COMPILE
    
    %% Report Delivery
    COMPILE -->|"Generated<br/>Report"| LIBRARY_DB
    LIBRARY_DB -->|"Report<br/>Access"| LIBRARY
    LIBRARY -->|"Report<br/>Download"| USER
    
    %% Automated Delivery
    COMPILE -->|"Automated<br/>Reports"| EMAIL_DEL
    COMPILE -->|"Automated<br/>Reports"| SLACK_DEL
    
    style CREATE_JOB fill:#3b82f6,stroke:#2563eb,color:#fff
    style EXTRACT fill:#10b981,stroke:#059669,color:#fff
    style GENERATE fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style COMPILE fill:#ec4899,stroke:#db2777,color:#fff
    style SCHEDULE fill:#f59e0b,stroke:#d97706,color:#fff
```

### **Export & Reporting Flow Details**

#### **Export Processing**
1. **Job Creation**: Create export job with user config, filters, and format
2. **Queue Management**: Prioritize jobs based on size and user role
3. **Data Extraction**: Query database with appropriate filters and scopes
4. **Transformation**: Convert data to target format (CSV, JSON, PDF, Excel)
5. **File Generation**: Generate file with appropriate formatting and metadata
6. **Storage & Delivery**: Store file with expiration and notify user

#### **Report Generation**
1. **Template Selection**: Choose from standard, custom, or ad-hoc templates
2. **Configuration**: Define data sources, filters, layout, and styling
3. **Chart Rendering**: Generate visualizations from metrics data
4. **Report Compilation**: Combine charts, tables, and text into final report
5. **Library Storage**: Archive reports with retention policies

#### **Scheduling & Automation**
1. **Schedule Configuration**: Define cron expressions and delivery methods
2. **Automated Generation**: Background processing at scheduled times
3. **Multi-Channel Delivery**: Email, Slack, and library storage
4. **Error Handling**: Retry failed deliveries and alert administrators

---

## 🆕 Level 2C: Alert Management Flow

```mermaid
graph TB
    subgraph "Alert Configuration"
        ADMIN[Admin User]
        ALERT_CFG[Alert<br/>Configuration]
        RULES[Alert<br/>Rules]
        THRESH[Threshold<br/>Settings]
        MAINT[Maintenance<br/>Windows]
    end
    
    subgraph "Real-Time Monitoring"
        MONITOR[Metrics<br/>Monitor]
        EVALUATE[Condition<br/>Evaluation]
        AGGREGATE[Data<br/>Aggregation]
        CHECK[Threshold<br/>Check]
        COMPOUND[Compound<br/>Conditions]
    end
    
    subgraph "Alert Processing"
        INCIDENT[Create<br/>Incident]
        ROUTE[Alert<br/>Routing]
        ESCALATE[Escalation<br/>Logic]
        SUPPRESS[Suppression<br/>Check]
        DEDUP[De-<br/>duplication]
    end
    
    subgraph "Notification Delivery"
        CHANNEL[Channel<br/>Selection]
        FORMAT[Message<br/>Formatting]
        DELIVER[Multi-<br/>Channel<br/>Delivery]
        TRACK[Delivery<br/>Tracking]
        RETRY[Retry<br/>Logic]
    end
    
    subgraph "Data Storage"
        RULES_DB[(Alert<br/>Rules)]
        INCIDENTS_DB[(Alert<br/>Incidents)]
        DELIVERY_DB[(Notification<br/>Deliveries)]
        MAINT_DB[(Maintenance<br/>Windows)]
    end
    
    subgraph "User Interaction"
        NOTIFICATION[Alert<br/>Notification]
        ACKNOWLEDGE[Acknowledge<br/>Alert]
        RESOLVE[Resolve<br/>Incident]
        FEEDBACK[User<br/>Feedback]
    end
    
    %% Configuration Flow
    ADMIN -->|"Define<br/>Rules"| ALERT_CFG
    ALERT_CFG -->|"Rule<br/>Config"| RULES
    RULES -->|"Rule<br/>Definition"| RULES_DB
    ADMIN -->|"Set<br/>Thresholds"| THRESH
    THRESH -->|"Threshold<br/>Config"| RULES_DB
    ADMIN -->|"Configure<br/>Windows"| MAINT
    MAINT -->|"Maintenance<br/>Schedule"| MAINT_DB
    
    %% Real-Time Monitoring
    MONITOR -->|"Metric<br/>Updates"| AGGREGATE
    AGGREGATE -->|"Aggregated<br/>Data"| EVALUATE
    EVALUATE -->|"Condition<br/>Check"| CHECK
    CHECK -->|"Threshold<br/>Status"| COMPOUND
    COMPOUND -->|"Compound<br/>Result"| INCIDENT
    
    %% Alert Processing
    INCIDENT -->|"Incident<br/>Created"| INCIDENTS_DB
    INCIDENT -->|"Routing<br/>Rules"| ROUTE
    ROUTE -->|"Suppression<br/>Check"| SUPPRESS
    SUPPRESS -->|"Maintenance<br/>Check"| MAINT_DB
    SUPPRESS -->|"Not<br/>Suppressed"| DEDUP
    SUPPRESS -->|"Suppressed"| ROUTE
    DEDUP -->|"Unique<br/>Alert"| ESCALATE
    
    %% Escalation & Routing
    ESCALATE -->|"Escalated<br/>Alert"| ROUTE
    ROUTE -->|"Target<br/>Roles/Users"| CHANNEL
    
    %% Notification Delivery
    CHANNEL -->|"Channel<br/>Config"| FORMAT
    FORMAT -->|"Formatted<br/>Message"| DELIVER
    DELIVER -->|"Delivery<br/>Attempts"| TRACK
    TRACK -->|"Delivery<br/>Status"| DELIVERY_DB
    DELIVER -->|"Success"| NOTIFICATION
    DELIVER -->|"Failed"| RETRY
    RETRY -->|"Retry<br/>Logic"| DELIVER
    
    %% User Interaction
    NOTIFICATION -->|"Alert<br/>Received"| ACKNOWLEDGE
    ACKNOWLEDGE -->|"Acknowledged"| INCIDENTS_DB
    ACKNOWLEDGE -->|"Resolve<br/>Action"| RESOLVE
    RESOLVE -->|"Resolution<br/>Details"| INCIDENTS_DB
    RESOLVE -->|"Root Cause<br/>Feedback"| FEEDBACK
    FEEDBACK -->|"Learning<br/>Data"| RULES_DB
    
    style MONITOR fill:#3b82f6,stroke:#2563eb,color:#fff
    style EVALUATE fill:#10b981,stroke:#059669,color:#fff
    style INCIDENT fill:#ef4444,stroke:#dc2626,color:#fff
    style DELIVER fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style RETRY fill:#f59e0b,stroke:#d97706,color:#fff
```

### **Alert Management Flow Details**

#### **Alert Configuration**
1. **Rule Definition**: Configure metric types, operators, thresholds, and conditions
2. **Compound Conditions**: Combine multiple metrics with AND/OR logic
3. **Targeting Rules**: Define roles, users, and products for alert scope
4. **Maintenance Windows**: Configure suppression periods for planned downtime
5. **Notification Channels**: Set up email, Slack, and in-app delivery methods

#### **Real-Time Monitoring**
1. **Metrics Monitoring**: Continuously monitor metric values from quality snapshots
2. **Data Aggregation**: Aggregate metrics by time window and scope
3. **Condition Evaluation**: Check if thresholds are exceeded or conditions met
4. **Compound Logic**: Evaluate complex conditions with multiple metrics

#### **Alert Processing**
1. **Incident Creation**: Create alert incidents when conditions are triggered
2. **Suppression Check**: Verify if maintenance windows or cooldowns apply
3. **Deduplication**: Prevent duplicate alerts for same condition
4. **Escalation Logic**: Apply escalation rules based on time and severity

#### **Notification Delivery**
1. **Channel Selection**: Choose appropriate channels based on severity and config
2. **Message Formatting**: Apply templates with dynamic data insertion
3. **Multi-Channel Delivery**: Send to email, Slack, and in-app simultaneously
4. **Delivery Tracking**: Monitor delivery status and retry failures
5. **User Interaction**: Handle acknowledgments, resolutions, and feedback

---

## 🆕 Level 2D: People Analytics Flow

```mermaid
graph TB
    subgraph "Data Sources"
        GIT[Git<br/>Repository]
        WORKITEMS[(Work<br/>Items)]
        TESTS[(Test<br/>Executions)]
        USERS[(User<br/>Data)]
        SURVEYS[Employee<br/>Surveys]
    end
    
    subgraph "People Analytics Processing"
        SILO[Knowledge<br/>Silo Detection]
        SKILL[Skill Gap<br/>Analysis]
        HEALTH[Team Health<br/>Monitoring]
        WORK[Workload<br/>Analysis]
        AGGREGATE[People Data<br/>Aggregation]
    end
    
    subgraph "Analysis Algorithms"
        CODE_ANALYSIS[Code<br/>Analysis]
        BUG_PATTERN[Bug<br/>Pattern<br/>Analysis]
        COLLABORATION[Collaboration<br/>Metrics]
        WELLBEING[Wellbeing<br/>Indicators]
        TRAINING[Training<br/>Needs<br/>Detection]
    end
    
    subgraph "Data Storage"
        SILO_DB[(Knowledge<br/>Silo Analysis)]
        SKILL_DB[(Skill<br/>Gaps)]
        HEALTH_DB[(Team<br/>Health Metrics)]
        WORK_DB[(Workload<br/>Analysis)]
        RECOMMENDATIONS[(Recommendations<br/>Engine)]
    end
    
    subgraph "Insights & Actions"
        DASHBOARD[People<br/>Analytics<br/>Dashboard]
        RISK_REPORT[Risk<br/>Assessment<br/>Reports]
        TRAINING_PLAN[Training<br/>Plans]
        MENTORSHIP[Mentorship<br/>Matching]
        CAPACITY[Capacity<br/>Planning]
    end
    
    subgraph "User Outputs"
        MANAGER[Engineering<br/>Manager]
        HR[HR<br/>Team]
        EXECUTIVE[Executive<br/>Leadership]
        INDIVIDUAL[Individual<br/>Contributors]
    end
    
    %% Data Collection
    GIT -->|"Commit<br/>Data"| CODE_ANALYSIS
    WORKITEMS -->|"Assignment<br/>Patterns"| BUG_PATTERN
    TESTS -->|"Quality<br/>Metrics"| COLLABORATION
    USERS -->|"Profile<br/>Data"| AGGREGATE
    SURVEYS -->|"Wellbeing<br/>Data"| WELLBEING
    
    %% Knowledge Silo Detection
    CODE_ANALYSIS -->|"Code<br/>Ownership"| SILO
    SILO -->|"Silo<br/>Analysis"| SILO_DB
    SILO_DB -->|"Risk<br/>Assessment"| RISK_REPORT
    
    %% Skill Gap Analysis
    BUG_PATTERN -->|"Bug<br/>Patterns"| SKILL
    SKILL -->|"Gap<br/>Detection"| TRAINING
    TRAINING -->|"Training<br/>Needs"| SKILL_DB
    SKILL_DB -->|"Skill<br/>Assessment"| TRAINING_PLAN
    
    %% Team Health Monitoring
    COLLABORATION -->|"Collaboration<br/>Metrics"| HEALTH
    WELLBEING -->|"Wellbeing<br/>Indicators"| HEALTH
    HEALTH -->|"Health<br/>Score"| HEALTH_DB
    HEALTH_DB -->|"Team<br/>Dynamics"| DASHBOARD
    
    %% Workload Analysis
    AGGREGATE -->|"Activity<br/>Data"| WORK
    WORK -->|"Capacity<br/>Analysis"| WORK_DB
    WORK_DB -->|"Resource<br/>Allocation"| CAPACITY
    
    %% Recommendation Generation
    SILO_DB -->|"Silo<br/>Risks"| RECOMMENDATIONS
    SKILL_DB -->|"Skill<br/>Gaps"| RECOMMENDATIONS
    HEALTH_DB -->|"Team<br/>Issues"| RECOMMENDATIONS
    WORK_DB -->|"Workload<br/>Issues"| RECOMMENDATIONS
    RECOMMENDATIONS -->|"Actionable<br/>Insights"| DASHBOARD
    
    %% User Outputs
    RISK_REPORT -->|"Risk<br/>Reports"| MANAGER
    TRAINING_PLAN -->|"Development<br/>Plans"| MANAGER
    TRAINING_PLAN -->|"Learning<br/>Programs"| HR
    DASHBOARD -->|"People<br/>Insights"| EXECUTIVE
    CAPACITY -->|"Capacity<br/>Planning"| MANAGER
    DASHBOARD -->|"Personal<br/>Insights"| INDIVIDUAL
    MENTORSHIP -->|"Mentor<br/>Matching"| INDIVIDUAL
    
    style SILO fill:#ef4444,stroke:#dc2626,color:#fff
    style SKILL fill:#f59e0b,stroke:#d97706,color:#fff
    style HEALTH fill:#10b981,stroke:#059669,color:#fff
    style WORK fill:#3b82f6,stroke:#2563eb,color:#fff
    style RECOMMENDATIONS fill:#8b5cf6,stroke:#7c3aed,color:#fff
```

### **People Analytics Flow Details**

#### **Knowledge Silo Detection**
1. **Code Analysis**: Analyze Git commits for code ownership patterns
2. **Ownership Calculation**: Determine primary, secondary, and tertiary contributors
3. **Bus Factor Analysis**: Calculate minimum people needed before knowledge loss
4. **Risk Assessment**: Identify critical silos with high bus factor risk
5. **Mitigation Recommendations**: Suggest documentation, mentorship, and training

#### **Skill Gap Analysis**
1. **Bug Pattern Analysis**: Identify skill gaps from bug patterns and failures
2. **Performance Assessment**: Analyze code reviews, test failures, and incidents
3. **Gap Classification**: Categorize gaps by skill area and severity level
4. **Training Recommendations**: Suggest specific training resources and programs
5. **Development Planning**: Create individual development plans with timelines

#### **Team Health Monitoring**
1. **Collaboration Metrics**: Measure cross-team collaboration and communication
2. **Workload Analysis**: Track individual and team workload distribution
3. **Wellbeing Indicators**: Monitor overtime, burnout risk, and team morale
4. **Performance Metrics**: Analyze velocity, quality, and innovation indices
5. **Health Scoring**: Generate comprehensive team health scores

#### **Workload & Capacity Planning**
1. **Activity Aggregation**: Collect work items, meetings, and tasks per user
2. **Capacity Analysis**: Calculate utilization rates and capacity availability
3. **Context Switching**: Measure context switching costs and focus time
4. **Strain Assessment**: Identify workload strain and burnout risks
5. **Capacity Recommendations**: Suggest workload redistribution and resource allocation

---

## 🆕 Level 2E: CI/CD Pipeline Integration Flow

```mermaid
graph TB
    subgraph "CI/CD Systems"
        JENKINS[Jenkins]
        GITHUB_ACTIONS[GitHub<br/>Actions]
        CIRCLECI[CircleCI]
        GITLAB[GitLab<br/>CI]
        AZURE_PIPE[Azure<br/>Pipelines]
    end
    
    subgraph "Pipeline Integration"
        AUTH[Pipeline<br/>Auth]
        CONFIG[Pipeline<br/>Configuration]
        WEBHOOK_CI[CI<br/>Webhooks]
        SYNC[Build<br/>Sync]
    end
    
    subgraph "Build Processing"
        RECEIVE_BUILD[Receive<br/>Build Event]
        PROCESS_BUILD[Process<br/>Build Data]
        STORE_BUILD[Store<br/>Build Run]
        PARSE_TESTS[Parse<br/>Test Results]
        STORE_TESTS[Store<br/>Test Results]
        COVERAGE[Calculate<br/>Coverage]
    end
    
    subgraph "Quality Integration"
        LINK_RUN[Link to<br/>Sprint/Release]
        ANALYZE[Analyze<br/>Test Patterns]
        CORRELATE[Correlate<br/>with Bugs]
        TREND[Test<br/>Trends]
    end
    
    subgraph "Data Storage"
        PIPELINE_DB[(CI Pipeline<br/>Integrations)]
        BUILD_DB[(CI Build<br/>Runs)]
        TEST_RESULTS_DB[(CI Test<br/>Results)]
        QUALITY_DB[(Quality<br/>Metrics)]
    end
    
    subgraph "Notification & Reporting"
        BUILD_NOTIF[Build<br/>Notifications]
        QUALITY_REPORT[Test<br/>Quality<br/>Reports]
        DASHBOARD_UPDATE[Dashboard<br/>Updates]
    end
    
    subgraph "User Actions"
        DEV[Developers]
        QA[QA Team]
        MANAGER[Engineering<br/>Manager]
    end
    
    %% Pipeline Integration
    JENKINS -->|"API<br/>Webhooks"| WEBHOOK_CI
    GITHUB_ACTIONS -->|"Webhooks"| WEBHOOK_CI
    CIRCLECI -->|"Webhooks"| WEBHOOK_CI
    GITLAB -->|"Webhooks"| WEBHOOK_CI
    AZURE_PIPE -->|"Webhooks"| WEBHOOK_CI
    
    %% Configuration Flow
    MANAGER -->|"Configure<br/>Pipeline"| CONFIG
    CONFIG -->|"Pipeline<br/>Config"| PIPELINE_DB
    PIPELINE_DB -->|"Auth<br/>Tokens"| AUTH
    AUTH -->|"OAuth<br/>Tokens"| SYNC
    
    %% Build Processing
    WEBHOOK_CI -->|"Build<br/>Event"| RECEIVE_BUILD
    RECEIVE_BUILD -->|"Build<br/>Data"| PROCESS_BUILD
    PROCESS_BUILD -->|"Processed<br/>Build"| STORE_BUILD
    STORE_BUILD -->|"Build<br/>Record"| BUILD_DB
    
    %% Test Results Processing
    PROCESS_BUILD -->|"Test<br/>Results"| PARSE_TESTS
    PARSE_TESTS -->|"Parsed<br/>Tests"| STORE_TESTS
    STORE_TESTS -->|"Test<br/>Results"| TEST_RESULTS_DB
    
    %% Coverage Analysis
    PARSE_TESTS -->|"Coverage<br/>Data"| COVERAGE
    COVERAGE -->|"Coverage<br/>Metrics"| BUILD_DB
    
    %% Quality Integration
    STORE_BUILD -->|"Build<br/>Context"| LINK_RUN
    LINK_RUN -->|"Sprint/Release<br/>Links"| QUALITY_DB
    STORE_TESTS -->|"Test<br/>Results"| ANALYZE
    ANALYZE -->|"Test<br/>Patterns"| CORRELATE
    CORRELATE -->|"Bug<br/>Correlations"| QUALITY_DB
    ANALYZE -->|"Quality<br/>Trends"| TREND
    TREND -->|"Trend<br/>Data"| QUALITY_DB
    
    %% Notification & Reporting
    STORE_BUILD -->|"Build<br/>Status"| BUILD_NOTIF
    BUILD_NOTIF -->|"Build<br/>Alerts"| DEV
    QUALITY_DB -->|"Quality<br/>Metrics"| QUALITY_REPORT
    QUALITY_REPORT -->|"Test<br/>Reports"| QA
    QUALITY_DB -->|"Dashboard<br/>Data"| DASHBOARD_UPDATE
    DASHBOARD_UPDATE -->|"Updated<br/>Dashboards"| MANAGER
    
    style RECEIVE_BUILD fill:#3b82f6,stroke:#2563eb,color:#fff
    style PARSE_TESTS fill:#10b981,stroke:#059669,color:#fff
    style ANALYZE fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style COVERAGE fill:#ec4899,stroke:#db2777,color:#fff
```

### **CI/CD Integration Flow Details**

#### **Pipeline Integration**
1. **Authentication**: Configure OAuth tokens and API credentials for CI systems
2. **Webhook Processing**: Receive build events, status changes, and completion notifications
3. **Build Synchronization**: Sync build data with proper branch and commit mapping
4. **Product Mapping**: Link builds to products, sprints, and releases

#### **Build Processing**
1. **Build Event Reception**: Receive webhook events with build metadata
2. **Build Data Storage**: Store build information including status, duration, and context
3. **Test Results Parsing**: Parse JUnit XML, NUnit, TRX, and custom test result formats
4. **Coverage Calculation**: Calculate code coverage from coverage reports
5. **Result Storage**: Store detailed test results with failure information

#### **Quality Integration**
1. **Sprint/Release Linking**: Link builds and tests to sprints and releases
2. **Test Pattern Analysis**: Analyze test failures for patterns and trends
3. **Bug Correlation**: Correlate test failures with related bug reports
4. **Quality Trending**: Track test quality trends over time
5. **Metrics Integration**: Update quality metrics with CI/CD data

#### **Notification & Reporting**
1. **Build Notifications**: Alert teams on build failures and status changes
2. **Test Quality Reports**: Generate comprehensive test quality reports
3. **Dashboard Updates**: Update dashboards with real-time CI/CD metrics
4. **Trend Analysis**: Provide insights into test quality and coverage trends

---

## 🆕 Level 2F: Settings & Configuration Flow

```mermaid
graph TB
    subgraph "User Settings"
        USER[User]
        SETTINGS_UI[Settings<br/>Page]
        PREFS[User<br/>Preferences]
        PROFILE[Profile<br/>Settings]
        NOTIF_PREFS[Notification<br/>Preferences]
    end
    
    subgraph "Tenant Configuration"
        ADMIN[Tenant<br/>Admin]
        TENANT_UI[Tenant<br/>Settings]
        WORKING[Working<br/>Hours]
        SPRINT[Sprint<br/>Config]
        QUALITY[Quality<br/>Thresholds]
        INTEGRATION[Integration<br/>Settings]
    end
    
    subgraph "Feature Flag Management"
        FEATURE_ADMIN[Feature<br/>Flag Admin]
        FLAG_UI[Feature<br/>Flags UI]
        CREATE_FLAG[Create<br/>Flag]
        TARGET[Target<br/>Users/Roles]
        ROLLBACK[Rollout<br/>Control]
        EXPERIMENT[A/B<br/>Testing]
    end
    
    subgraph "Settings Processing"
        VALIDATE[Validate<br/>Settings]
        APPLY[Apply<br/>Settings]
        CACHE[Cache<br/>Settings]
        SYNC[Sync to<br/>Database]
        PROPAGATE[Propagate<br/>Changes]
    end
    
    subgraph "Feature Flag Processing"
        EVALUATE[Evaluate<br/>Flags]
        TRACK[Track<br/>Usage]
        ROLLOUT[Handle<br/>Rollout]
        EXPERIMENT_TRACK[Track<br/>Experiments]
    end
    
    subgraph "Data Storage"
        USER_SETTINGS_DB[(User<br/>Settings)]
        TENANT_CONFIG_DB[(Tenant<br/>Configuration)]
        FEATURE_FLAGS_DB[(Feature<br/>Flags)]
        FLAG_USAGE_DB[(Feature<br/>Flag Usage)]
    end
    
    subgraph "Impact & Effects"
        BEHAVIOR[Behavior<br/>Changes]
        UI_UPDATE[UI<br/>Updates]
        ACCESS[Access<br/>Control]
        ANALYTICS[Feature<br/>Analytics]
    end
    
    %% User Settings Flow
    USER -->|"Settings<br/>Changes"| SETTINGS_UI
    SETTINGS_UI -->|"Preference<br/>Updates"| PREFS
    SETTINGS_UI -->|"Profile<br/>Updates"| PROFILE
    SETTINGS_UI -->|"Notification<br/>Settings"| NOTIF_PREFS
    
    PREFS -->|"Theme,<br/>Timezone"| VALIDATE
    PROFILE -->|"Personal<br/>Info"| VALIDATE
    NOTIF_PREFS -->|"Channel<br/>Prefs"| VALIDATE
    
    VALIDATE -->|"Validated<br/>Settings"| APPLY
    APPLY -->|"Apply<br/>Changes"| CACHE
    CACHE -->|"Cached<br/>Settings"| SYNC
    SYNC -->|"Persisted<br/>Settings"| USER_SETTINGS_DB
    
    %% Settings Impact
    CACHE -->|"Immediate<br/>Effect"| UI_UPDATE
    UI_UPDATE -->|"Updated<br/>UI"| USER
    
    %% Tenant Configuration
    ADMIN -->|"Config<br/>Changes"| TENANT_UI
    TENANT_UI -->|"Working<br/>Hours"| WORKING
    TENANT_UI -->|"Sprint<br/>Settings"| SPRINT
    TENANT_UI -->|"Quality<br/>Thresholds"| QUALITY
    TENANT_UI -->|"Integration<br/>Settings"| INTEGRATION
    
    WORKING -->|"Schedule<br/>Config"| VALIDATE
    SPRINT -->|"Sprint<br/>Config"| VALIDATE
    QUALITY -->|"Threshold<br/>Config"| VALIDATE
    INTEGRATION -->|"Integration<br/>Config"| VALIDATE
    
    VALIDATE -->|"Validated<br/>Config"| APPLY
    APPLY -->|"Apply<br/>Config"| PROPAGATE
    PROPAGATE -->|"Propagated<br/>Changes"| TENANT_CONFIG_DB
    
    %% Feature Flag Management
    FEATURE_ADMIN -->|"Flag<br/>Management"| FLAG_UI
    FLAG_UI -->|"Create<br/>Flag"| CREATE_FLAG
    FLAG_UI -->|"Targeting<br/>Rules"| TARGET
    FLAG_UI -->|"Rollout<br/>Control"| ROLLBACK
    FLAG_UI -->|"A/B Tests"| EXPERIMENT
    
    CREATE_FLAG -->|"Flag<br/>Definition"| VALIDATE
    TARGET -->|"Target<br/>Rules"| VALIDATE
    ROLLBACK -->|"Rollout<br/>%age"| VALIDATE
    EXPERIMENT -->|"Experiment<br/>Config"| VALIDATE
    
    VALIDATE -->|"Validated<br/>Flags"| APPLY
    APPLY -->|"Apply<br/>Flags"| SYNC
    SYNC -->|"Persisted<br/>Flags"| FEATURE_FLAGS_DB
    
    %% Feature Flag Evaluation
    USER -->|"User<br/>Request"| EVALUATE
    EVALUATE -->|"Check<br/>Flags"| FEATURE_FLAGS_DB
    FEATURE_FLAGS_DB -->|"Flag<br/>Rules"| ROLLOUT
    ROLLOUT -->|"Enabled/<br/>Disabled"| EVALUATE
    EVALUATE -->|"Flag<br/>Status"| BEHAVIOR
    EVALUATE -->|"Usage<br/>Event"| TRACK
    TRACK -->|"Usage<br/>Data"| FLAG_USAGE_DB
    
    %% Experiment Tracking
    EXPERIMENT -->|"Experiment<br/>Config"| EXPERIMENT_TRACK
    EXPERIMENT_TRACK -->|"Experiment<br/>Data"| FLAG_USAGE_DB
    FLAG_USAGE_DB -->|"Experiment<br/>Results"| ANALYTICS
    
    %% Settings Impact
    BEHAVIOR -->|"Feature<br/>Behavior"| USER
    ACCESS -->|"Access<br/>Control"| USER
    ANALYTICS -->|"Usage<br/>Insights"| FEATURE_ADMIN
    
    style VALIDATE fill:#3b82f6,stroke:#2563eb,color:#fff
    style APPLY fill:#10b981,stroke:#059669,color:#fff
    style EVALUATE fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style ROLLOUT fill:#f59e0b,stroke:#d97706,color:#fff
```

### **Settings & Configuration Flow Details**

#### **User Settings Management**
1. **Settings Input**: Receive user preferences for theme, timezone, notifications
2. **Validation**: Validate settings format, values, and constraints
3. **Application**: Apply settings to user session and cache
4. **Persistence**: Store settings in database with user association
5. **Immediate Effect**: Update UI and behavior based on changed settings

#### **Tenant Configuration**
1. **Admin Input**: Configure working hours, sprint settings, quality thresholds
2. **Policy Validation**: Ensure policies comply with organizational rules
3. **Propagation**: Apply settings to all tenant users and products
4. **Integration Sync**: Update integration configurations and sync schedules
5. **Impact Assessment**: Analyze impact of configuration changes

#### **Feature Flag Management**
1. **Flag Creation**: Define feature flags with targeting rules and rollout percentages
2. **Targeting Configuration**: Set up user, role, and tenant-based targeting
3. **Rollout Control**: Manage gradual rollouts with percentage-based deployment
4. **A/B Testing**: Configure experiments with variants and tracking
5. **Flag Evaluation**: Real-time flag evaluation based on user context

#### **Feature Flag Processing**
1. **Request Evaluation**: Check feature flags for each user request
2. **Rollout Logic**: Apply rollout percentage and targeting rules
3. **Usage Tracking**: Log flag usage for analytics and monitoring
4. **Experiment Tracking**: Track A/B test results and user behavior
5. **Analytics**: Generate insights on feature usage and experiment results

---

This completes the comprehensive updated DFD documentation covering **all major system processes** including the new search, export, alert, people analytics, CI/CD integration, and settings management flows. Each level provides increasing detail while maintaining clarity about system architecture and data movement.
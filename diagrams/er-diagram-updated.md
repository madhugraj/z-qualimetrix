# QualiMetrix Complete Entity-Relationship Diagram (Updated)

## System Overview
This ER diagram represents the **complete and production-ready** database schema for QualiMetrix, including all new entities for search, export, alerts, CI/CD integration, and advanced people analytics.

---

## Complete ER Diagram (Mermaid) - All Entities

```mermaid
erDiagram
    %% ============================================================
    %% TENANT & ORGANIZATION MANAGEMENT
    %% ============================================================
    Tenant ||--o{ Product : "owns"
    Tenant ||--o{ TenantMembership : "has"
    Tenant ||--o{ TenantConfiguration : "configures"
    Tenant ||--o{ Integration : "integrates"
    Tenant ||--o{ WebhookEvent : "receives"
    Tenant ||--o{ WorkItem : "contains"
    Tenant ||--o{ TestCase : "defines"
    Tenant ||--o{ ManualDeliverable : "tracks"
    Tenant ||--o{ Sprint : "manages"
    Tenant ||--o{ Release : "publishes"
    Tenant ||--o{ QualityMetricsSnapshot : "generates"
    Tenant ||--o{ TeamPerformanceMetric : "measures"
    Tenant ||--o{ BackgroundJob : "schedules"
    Tenant ||--o{ AuditLog : "logs"
    Tenant ||--o{ ActivityTimeline : "shows"
    Tenant ||--o{ Notification : "sends"
    Tenant ||--o{ RefreshToken : "maintains"
    Tenant ||--o{ AlertRule : "defines"
    Tenant ||--o{ AlertIncident : "triggers"
    Tenant ||--o{ SearchAnalytics : "searches"
    Tenant ||--o{ SearchSuggestion : "suggests"
    Tenant ||--o{ ExportJob : "exports"
    Tenant ||--o{ ReportTemplate : "templates"
    Tenant ||--o{ ScheduledReport : "schedules"
    Tenant ||--o{ ReportLibrary : "archives"
    Tenant ||--o{ CIPipelineIntegration : "integrates"
    Tenant ||--o{ KnowledgeSiloAnalysis : "analyzes"
    Tenant ||--o{ SkillGap : "identifies"
    Tenant ||--o{ TeamHealthMetric : "monitors"
    Tenant ||--o{ WorkloadAnalysis : "tracks"

    Tenant {
        uuid id PK
        string name UK
        string slug UK
        string domain UK
        string logoUrl
        jsonb settings
        string subscriptionTier
        int maxUsers
        int maxProducts
        timestamp trialEndsAt
        timestamp createdAt
        timestamp updatedAt
    }

    Product {
        uuid id PK
        uuid tenantId FK
        string name
        string key UK
        string description
        string iconUrl
        string color
        string jiraProjectKey UK
        string azureDevopsAreaPath UK
        string githubRepoFullName UK
        jsonb settings
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
    }

    %% ============================================================
    %% AUTHENTICATION & USER MANAGEMENT
    %% ============================================================
    User ||--o{ TenantMembership : "belongs to"
    User ||--|| UserSettings : "configures"
    User ||--o{ WorkItem : "assigns"
    User ||--o{ WorkItem : "reports"
    User ||--o{ WorkItemComment : "writes"
    User ||--o{ TestCase : "creates"
    User ||--o{ ManualDeliverable : "submits"
    User ||--o{ RefreshToken : "has"
    User ||--o{ AuditLog : "performs"
    User ||--o{ ActivityTimeline : "does"
    User ||--o{ Notification : "receives"
    User ||--o{ NotificationPreference : "configures"
    User ||--o{ FeatureFlagUsage : "uses"
    User ||--o{ SearchAnalytics : "searches"
    User ||--o{ ExportJob : "requests"
    User ||--o{ ReportTemplate : "creates"
    User ||--o{ ScheduledReport : "schedules"
    User ||--o{ AlertIncident : "acknowledges"
    User ||--o{ KnowledgeSiloAnalysis : "owns"
    User ||--o{ SkillGap : "has"
    User ||--o{ WorkloadAnalysis : "has"

    User {
        uuid id PK
        string email UK
        string passwordHash
        string authProvider
        string fullName
        string avatarUrl
        string timezone
        string language
        string googleId UK
        string githubId UK
        string samlIdp UK
        boolean emailVerified
        boolean isSystemAdmin
        timestamp lastLoginAt
        timestamp createdAt
        timestamp updatedAt
    }

    TenantMembership {
        uuid id PK
        uuid tenantId FK
        uuid userId FK
        string role
        uuid[] accessibleProducts
        string defaultRole
        uuid defaultProductId FK
        jsonb notificationSettings
        uuid invitedBy FK
        timestamp joinedAt
        timestamp updatedAt
    }

    RefreshToken {
        uuid id PK
        uuid userId FK
        uuid tenantId FK
        string tokenHash UK
        timestamp expiresAt
        timestamp createdAt
        timestamp revokedAt
        jsonb deviceInfo
    }

    %% ============================================================
    %% 🆕 SETTINGS & CONFIGURATION MANAGEMENT
    %% ============================================================
    UserSettings {
        uuid id PK
        uuid userId FK
        string theme
        string timezone
        string dateFormat
        string timeFormat
        string language
        string defaultDashboardRole
        jsonb dashboardLayout
        jsonb notificationChannels
        string emailDigestFrequency
        time quietHoursStart
        time quietHoursEnd
        string defaultDateRange
        uuid defaultProductId FK
        timestamp updatedAt
    }

    TenantConfiguration {
        uuid id PK
        uuid tenantId FK
        string[] workingDays
        time workingHoursStart
        time workingHoursEnd
        string timezone
        int defaultSprintLength
        string sprintStartDay
        int sprintReviewDaysBeforeEnd
        decimal mttrThresholdHours
        decimal defectLeakageThresholdPercent
        decimal testExecutionThresholdPercent
        jsonb releaseReadinessRequirements
        boolean autoSyncEnabled
        int syncFrequencyMinutes
        int webhookRetentionDays
        int auditLogRetentionDays
        int metricsSnapshotRetentionDays
        timestamp updatedAt
        uuid updatedBy FK
    }

    FeatureFlag {
        uuid id PK
        string flagName UK
        string description
        boolean isEnabled
        string flagType
        uuid[] targetTenantIds
        uuid[] targetUserIds
        string[] targetRoles
        int rolloutPercentage
        string environment
        string experimentName
        jsonb variantA
        jsonb variantB
        uuid createdBy FK
        timestamp createdAt
        timestamp expiresAt
    }

    FeatureFlagUsage {
        uuid id PK
        uuid flagId FK
        uuid userId FK
        uuid tenantId FK
        boolean flagEvaluation
        jsonb context
        timestamp accessedAt
    }

    %% ============================================================
    %% 🆕 SEARCH INFRASTRUCTURE
    %% ============================================================
    SearchAnalytics {
        uuid id PK
        uuid tenantId FK
        uuid userId FK
        string searchQuery
        string searchType
        jsonb searchFilters
        int resultsCount
        jsonb resultTypes
        string clickedResultType
        uuid clickedResultId
        int clickedPosition
        int timeToClickMs
        int searchDurationMs
        string searchSource
        timestamp searchedAt
    }

    SearchSuggestion {
        uuid id PK
        uuid tenantId FK
        string suggestionType
        string title
        string description
        string searchQuery
        jsonb searchFilters
        string icon
        string[] targetRoles
        int displayOrder
        int clickCount
        timestamp lastClickedAt
        boolean isActive
        uuid createdBy FK
        timestamp createdAt
    }

    %% ============================================================
    %% 🆕 EXPORT & REPORTING SYSTEM
    %% ============================================================
    ExportJob {
        uuid id PK
        uuid tenantId FK
        uuid userId FK
        string exportType
        string exportName
        string format
        jsonb filters
        jsonb includedDatasets
        string status
        int progress
        bigint fileSizeBytes
        int recordCount
        string fileUrl
        string fileName
        timestamp expiresAt
        string errorMessage
        int retryCount
        timestamp processingStartedAt
        timestamp processingCompletedAt
        timestamp createdAt
    }

    ReportTemplate {
        uuid id PK
        uuid tenantId FK
        string templateName
        string templateDescription
        string templateType
        string category
        jsonb dataSources
        jsonb layoutConfig
        jsonb stylingConfig
        string defaultFormat
        boolean includeCharts
        boolean includeRawData
        string pageSize
        string orientation
        boolean isScheduled
        string scheduleCron
        string[] scheduleRecipients
        uuid createdBy FK
        boolean isPublic
        string[] targetRoles
        int usageCount
        timestamp lastUsedAt
        timestamp createdAt
        timestamp updatedAt
    }

    ScheduledReport {
        uuid id PK
        uuid tenantId FK
        uuid templateId FK
        string scheduleName
        string scheduleType
        string cronExpression
        string timezone
        jsonb filters
        string format
        jsonb deliveryMethods
        string[] emailRecipients
        string[] slackChannels
        boolean isActive
        timestamp lastRunAt
        timestamp nextRunAt
        string lastStatus
        string lastError
        int consecutiveFailures
        uuid createdBy FK
        timestamp createdAt
        timestamp updatedAt
    }

    ReportLibrary {
        uuid id PK
        uuid tenantId FK
        uuid scheduledReportId FK
        uuid exportJobId FK
        string reportName
        string reportDescription
        string reportType
        string fileUrl
        bigint fileSizeBytes
        string fileFormat
        int pageCount
        date dataPeriodStart
        date dataPeriodEnd
        jsonb includedSections
        uuid createdBy FK
        timestamp expiresAt
        int retentionDays
        int downloadCount
        timestamp lastDownloadedAt
        timestamp createdAt
    }

    %% ============================================================
    %% 🆕 CI/CD PIPELINE INTEGRATION
    %% ============================================================
    CIPipelineIntegration {
        uuid id PK
        uuid tenantId FK
        uuid productId FK
        string pipelineName
        string pipelineType
        string ciServerUrl
        string projectUrl
        string apiTokenEncrypted
        string webhookSecretEncrypted
        string testResultFormat
        string testResultPath
        boolean autoImportEnabled
        string[] branchFilter
        string[] buildStatusFilter
        boolean notificationOnFailure
        string lastBuildId
        string lastBuildStatus
        timestamp lastBuildTimestamp
        boolean syncEnabled
        jsonb configuration
        timestamp createdAt
        timestamp updatedAt
    }

    CIBuildRun {
        uuid id PK
        uuid tenantId FK
        uuid pipelineId FK
        uuid productId FK
        string externalBuildId UK
        string buildUrl
        string branchName
        string commitHash
        string commitMessage
        string commitAuthor
        string buildStatus
        int buildDurationSeconds
        timestamp buildTimestamp
        int totalTests
        int passedTests
        int failedTests
        int skippedTests
        decimal codeCoveragePercent
        int linesCovered
        int linesTotal
        boolean testResultsImported
        string testResultsFileUrl
        uuid sprintId FK
        uuid releaseId FK
        timestamp createdAt
        timestamp updatedAt
    }

    CITestResult {
        uuid id PK
        uuid tenantId FK
        uuid buildId FK
        string externalTestId
        string testName
        string testSuite
        string testClass
        string packageName
        string testStatus
        int durationMs
        string errorMessage
        string stackTrace
        string failureType
        string[] testCategories
        string testPriority
        uuid linkedTestCaseId FK
        string component
        string executionNode
        int retryCount
        timestamp createdAt
    }

    %% ============================================================
    %% 🆕 ALERT MANAGEMENT SYSTEM
    %% ============================================================
    AlertRule {
        uuid id PK
        uuid tenantId FK
        string ruleName UK
        string ruleDescription
        string ruleCategory
        string metricType
        string operator
        decimal thresholdValue
        string thresholdUnit
        string aggregationWindow
        string secondaryMetricType
        string secondaryOperator
        decimal secondaryThresholdValue
        string conditionLogic
        string severity
        int priority
        jsonb notificationChannels
        string[] emailRecipients
        string[] slackChannels
        string notificationTitleTemplate
        string notificationBodyTemplate
        string[] targetRoles
        uuid[] targetUsers
        boolean escalationEnabled
        jsonb escalationRules
        int cooldownPeriodMinutes
        jsonb suppressionRules
        boolean autoResolve
        int autoResolveAfterMinutes
        boolean isEnabled
        timestamp lastTriggeredAt
        int triggerCount
        timestamp lastResolvedAt
        uuid createdBy FK
        uuid updatedBy FK
        timestamp createdAt
        timestamp updatedAt
    }

    AlertIncident {
        uuid id PK
        uuid tenantId FK
        uuid alertRuleId FK
        string incidentStatus
        string severity
        decimal metricValue
        decimal thresholdValue
        decimal violationMagnitude
        jsonb contextData
        uuid affectedProductId FK
        uuid affectedSprintId FK
        uuid[] affectedUserIds
        uuid acknowledgedBy FK
        timestamp acknowledgedAt
        string acknowledgedNote
        uuid resolvedBy FK
        timestamp resolvedAt
        string resolutionNote
        string rootCause
        uuid markedAsFalsePositiveBy FK
        string falsePositiveReason
        timestamp falsePositiveAt
        string businessImpact
        int affectedUsersCount
        int downtimeMinutes
        uuid[] relatedWorkItemIds
        uuid[] relatedIncidentIds
        boolean notificationSent
        string[] notificationChannelsUsed
        string notificationFailedReason
        timestamp triggeredAt
        timestamp updatedAt
    }

    AlertNotificationDelivery {
        uuid id PK
        uuid incidentId FK
        string deliveryChannel
        string deliveryStatus
        string recipientType
        uuid recipientId
        string recipientAddress
        string messageSubject
        string messageBody
        string messageTemplateUsed
        timestamp sentAt
        timestamp deliveredAt
        timestamp readAt
        string errorMessage
        int retryCount
        int maxRetries
        timestamp nextRetryAt
        string externalMessageId
        jsonb externalMetadata
        timestamp createdAt
    }

    AlertMaintenanceWindow {
        uuid id PK
        uuid tenantId FK
        string windowName
        string description
        timestamp startTime
        timestamp endTime
        string recurringSchedule
        string recurringCron
        uuid[] affectedAlertRuleIds
        uuid[] affectedProducts
        string[] affectedEnvironments
        boolean suppressAll
        boolean allowCritical
        boolean isActive
        uuid createdBy FK
        timestamp createdAt
    }

    %% ============================================================
    %% EXTERNAL INTEGRATIONS
    %% ============================================================
    Integration ||--o{ WebhookEvent : "processes"
    Integration ||--o{ SyncState : "tracks"

    Integration {
        uuid id PK
        uuid tenantId FK
        string integrationType UK
        string clientId
        string clientSecretEncrypted
        string accessTokenEncrypted
        string refreshTokenEncrypted
        timestamp tokenExpiresAt
        string apiBaseUrl
        string webhookSecretEncrypted
        boolean syncEnabled
        string syncFrequency
        timestamp lastSyncAt
        string syncStatus
        string lastError
        int errorCount
        timestamp lastSuccessfulSync
        jsonb configuration
        timestamp createdAt
        timestamp updatedAt
    }

    WebhookEvent {
        uuid id PK
        uuid tenantId FK
        string integrationType
        string eventType
        jsonb rawPayload
        boolean processed
        int processingAttempts
        string externalId
        timestamp receivedAt
        timestamp processedAt
        string errorMessage
    }

    SyncState {
        uuid id PK
        uuid tenantId FK
        string integrationType UK
        string resourceType UK
        string lastSyncCursor
        int totalRecords
        int lastSyncCount
        int lastSyncDurationMs
        timestamp lastSuccessfulSync
        timestamp lastFailedSync
        int consecutiveFailures
        timestamp updatedAt
    }

    %% ============================================================
    %% WORK ITEMS & BUG INTELLIGENCE
    %% ============================================================
    WorkItem ||--o{ WorkItem : "parent-child"
    WorkItem ||--o{ BugSimilarity : "source of"
    WorkItem ||--o{ BugSimilarity : "similar to"
    WorkItem ||--o{ WorkItemComment : "has"
    WorkItem ||--o{ WorkItemAttachment : "contains"
    WorkItem ||--o{ TestCase : "covered by"
    WorkItem ||--o{ ManualDeliverable : "linked to"
    WorkItem ||--o| Sprint : "assigned to"
    WorkItem }o--o{ User : "assigned to"
    WorkItem }o--o{ User : "reported by"

    WorkItem {
        uuid id PK
        uuid tenantId FK
        uuid productId FK
        string externalSystem UK
        string externalId UK
        string externalUrl
        string itemType
        string status
        string priority
        string title
        string description
        string acceptanceCriteria
        string domain
        decimal domainConfidence
        string[] tags
        string component
        uuid parentId FK
        uuid sprintId FK
        uuid assigneeId FK
        uuid reporterId FK
        string resolution
        timestamp resolvedAt
        decimal resolutionDurationHours
        boolean isEscapedDefect
        boolean isReopened
        int qaRejectionCount
        boolean firstTimeFix
        timestamp externalCreatedAt
        timestamp externalUpdatedAt
        timestamp createdAt
        timestamp updatedAt
    }

    BugSimilarity {
        uuid id PK
        uuid tenantId FK
        uuid sourceBugId FK
        uuid similarBugId FK
        decimal similarityScore
        string similarityMethod
        boolean userConfirmed
        boolean userRejected
        uuid reviewedBy FK
        timestamp reviewedAt
        timestamp createdAt
    }

    WorkItemComment {
        uuid id PK
        uuid workItemId FK
        uuid userId FK
        string externalCommentId UK
        string commentBody
        boolean isInternal
        timestamp createdAt
        timestamp updatedAt
        timestamp externalCreatedAt
    }

    WorkItemAttachment {
        uuid id PK
        uuid workItemId FK
        string fileName
        string fileUrl
        bigint fileSizeBytes
        string mimeType
        string externalAttachmentId
        uuid uploadedBy FK
        timestamp createdAt
    }

    %% ============================================================
    %% TEST MANAGEMENT
    %% ============================================================
    TestCase ||--o{ TestExecution : "has"
    TestCase ||--o{ WorkItem : "covers"

    TestCase {
        uuid id PK
        uuid tenantId FK
        uuid productId FK
        string externalSystem UK
        string externalId UK
        string externalUrl
        string name
        string description
        string testType
        string automationStatus
        uuid[] coveredStoryIds
        string[] requirementIds
        jsonb testSteps
        string priority
        string[] tags
        string component
        uuid createdBy FK
        uuid updatedBy FK
        timestamp externalCreatedAt
        timestamp externalUpdatedAt
        timestamp createdAt
        timestamp updatedAt
    }

    TestExecution ||--o{ TestExecutionEvidence : "evidenced by"

    TestExecution {
        uuid id PK
        uuid tenantId FK
        uuid testCaseId FK
        string executionRun
        uuid sprintId FK
        string environment
        uuid executedBy FK
        string status
        int durationSeconds
        string executionNotes
        string failureReason
        boolean isFlake
        string externalRunId
        string externalTestId
        timestamp executedAt
        timestamp createdAt
    }

    TestExecutionEvidence {
        uuid id PK
        uuid testExecutionId FK
        string evidenceType
        string fileUrl
        string description
        timestamp capturedAt
    }

    %% ============================================================
    %% MANUAL DELIVERABLES
    %% ============================================================
    ManualDeliverable ||--o{ DeliverableCollaborator : "collaborators"
    ManualDeliverable ||--o{ WorkItem : "related"

    ManualDeliverable {
        uuid id PK
        uuid tenantId FK
        uuid productId FK
        string deliverableType
        string title
        string description
        jsonb metadata
        string[] externalUrls
        uuid[] relatedWorkItemIds
        uuid createdBy FK
        timestamp deliveredAt
        timestamp createdAt
        timestamp updatedAt
    }

    DeliverableCollaborator {
        uuid id PK
        uuid deliverableId FK
        uuid userId FK
        string role
    }

    %% ============================================================
    %% SPRINTS & RELEASES
    %% ============================================================
    Sprint {
        uuid id PK
        uuid tenantId FK
        uuid productId FK
        string name
        int sequence
        date startDate
        date endDate
        string state
        string externalSystem
        string externalId
        string sprintGoal
        string retrospectiveNotes
        timestamp createdAt
        timestamp updatedAt
    }

    Release {
        uuid id PK
        uuid tenantId FK
        uuid productId FK
        string version
        string name
        date targetDate
        date actualDate
        string state
        int storiesCompleted
        int bugsResolved
        decimal testExecutionRate
        decimal releaseReadinessScore
        string releaseNotes
        timestamp createdAt
        timestamp updatedAt
    }

    %% ============================================================
    %% QUALITY METRICS
    %% ============================================================
    QualityMetricsSnapshot }o--o| Sprint : "for"
    QualityMetricsSnapshot }o--o| Release : "for"

    QualityMetricsSnapshot {
        uuid id PK
        uuid tenantId FK
        uuid productId FK
        string snapshotType UK
        date snapshotDate UK
        uuid sprintId FK
        uuid releaseId FK
        int testCasesExecuted
        int testCasesPassed
        int testCasesFailed
        int testCasesBlocked
        decimal testAutomationRate
        int bugsCreated
        int bugsResolved
        int bugsEscaped
        int bugsReopened
        decimal defectLeakageRate
        decimal mttr
        decimal mttf
        decimal firstTimeFixRate
        decimal qaRejectionRate
        decimal defectDensity
        decimal rtmCoverageRate
        decimal automationRoi
        decimal releaseReadinessScore
        int openP0P1Count
        decimal regressionPassRate
        decimal costOfQuality
        jsonb metadata
        timestamp calculatedAt
    }

    TeamPerformanceMetric }o--o| Sprint : "for"

    TeamPerformanceMetric {
        uuid id PK
        uuid tenantId FK
        uuid userId FK
        uuid productId FK
        string periodType UK
        date periodStart UK
        date periodEnd
        int bugsAssigned
        int bugsResolved
        decimal avgMttrHours
        decimal firstTimeFixRate
        int qaRejections
        int testsExecuted
        decimal testPassRate
        int demosDelivered
        int docsCreated
        decimal manualHoursLogged
        decimal automationHoursSaved
        timestamp calculatedAt
    }

    %% ============================================================
    %% 🆕 ADVANCED PEOPLE ANALYTICS
    %% ============================================================
    KnowledgeSiloAnalysis {
        uuid id PK
        uuid tenantId FK
        uuid productId FK
        string component
        string componentCategory
        string riskLevel
        uuid primaryOwnerId FK
        decimal primaryOwnerContribution
        uuid[] secondaryOwnerIds
        uuid[] tertiaryContributorIds
        int busFactor
        string busFactorRisk
        int totalContributors
        decimal knowledgeConcentrationScore
        boolean crossFunctionalCoverage
        int linesOfCode
        decimal complexityScore
        string businessCriticality
        boolean userFacing
        jsonb mitigationStrategy
        string recommendedTraining
        uuid[] recommendedPairingPairs
        string analysisMethod
        date analysisDate
        timestamp lastGitCommitAnalyzed
        timestamp createdAt
        timestamp updatedAt
    }

    SkillGap {
        uuid id PK
        uuid tenantId FK
        uuid userId FK
        string skillArea
        string skillCategory
        string currentLevel
        string targetLevel
        string gapLevel
        decimal gapConfidence
        string identifiedFrom
        jsonb evidenceData
        string businessImpact
        uuid[] affectedWorkItemIds
        string trainingRecommendation
        jsonb suggestedResources
        int estimatedTrainingHours
        int trainingPriority
        uuid[] recommendedMentorIds
        uuid[] peerLearningGroupIds
        boolean developmentPlanCreated
        boolean trainingCompleted
        date targetDate
        date completionDate
        string status
        uuid createdBy FK
        timestamp createdAt
        timestamp updatedAt
    }

    TeamHealthMetric {
        uuid id PK
        uuid tenantId FK
        uuid productId FK
        string periodType
        date periodStart
        date periodEnd
        int teamSize
        jsonb rolesDistribution
        jsonb tenureDistribution
        decimal crossTeamCollaborationScore
        decimal knowledgeSharingIndex
        int communicationFrequency
        decimal meetingLoadHours
        decimal avgWorkloadHours
        decimal overtimePercentage
        decimal afterHoursActivityPercentage
        decimal burnoutRiskScore
        decimal teamMoraleScore
        decimal velocityStability
        decimal qualityScore
        decimal innovationIndex
        decimal processCompliance
        int siloRiskCount
        int busFactorRiskCount
        decimal onCallBurdenScore
        string[] identifiedIssues
        jsonb recommendedActions
        int actionItemsCreated
        int actionItemsCompleted
        timestamp calculatedAt
    }

    WorkloadAnalysis {
        uuid id PK
        uuid tenantId FK
        uuid userId FK
        string periodType
        date periodStart
        date periodEnd
        int activeWorkItems
        decimal totalStoryPoints
        int highPriorityItems
        int bugAssignments
        decimal meetingHours
        decimal codeReviewHours
        decimal mentoringHours
        decimal collaborationOverheadPercentage
        int contextSwitchCount
        decimal contextSwitchCostHours
        decimal focusTimePercentage
        decimal availableCapacityHours
        decimal utilizedCapacityHours
        decimal utilizationRate
        decimal overallocationPercentage
        decimal avgBugFixTimeHours
        decimal codeReviewTurnaroundHours
        decimal reworkRate
        decimal afterHoursWorkHours
        decimal weekendWorkHours
        decimal workloadStrainScore
        string workloadStatus
        jsonb recommendedActions
        timestamp calculatedAt
    }

    %% ============================================================
    %% BACKGROUND PROCESSING
    %% ============================================================
    BackgroundJob {
        uuid id PK
        uuid tenantId FK
        string jobType
        string jobName
        jsonb payload
        int priority
        string status
        int progress
        jsonb result
        string errorMessage
        int retryCount
        int maxRetries
        timestamp scheduledAt
        timestamp startedAt
        timestamp completedAt
        timestamp createdAt
    }

    %% ============================================================
    %% AUDIT & ACTIVITY
    %% ============================================================
    AuditLog {
        uuid id PK
        uuid tenantId FK
        uuid userId FK
        string action
        string resourceType
        uuid resourceId
        inet ipAddress
        string userAgent
        uuid requestId
        jsonb oldValues
        jsonb newValues
        timestamp createdAt
    }

    ActivityTimeline {
        uuid id PK
        uuid tenantId FK
        uuid userId FK
        string activityType
        string title
        string description
        string entityType
        uuid entityId
        uuid productId FK
        string visibility
        jsonb metadata
        timestamp createdAt
    }

    %% ============================================================
    %% NOTIFICATIONS
    %% ============================================================
    Notification {
        uuid id PK
        uuid tenantId FK
        uuid userId FK
        string notificationType
        string title
        string body
        string actionUrl
        string actionLabel
        string priority
        string[] deliveryMethods
        timestamp readAt
        boolean deliveredEmail
        boolean deliveredSlack
        timestamp expiresAt
        timestamp createdAt
    }

    NotificationPreference {
        uuid id PK
        uuid userId FK
        uuid tenantId FK
        string notificationType UK
        boolean enabled
        string[] deliveryMethods
        jsonb thresholdConfig
    }
```

---

## 🆕 NEW ENTITY GROUPS ADDED

### **Settings & Configuration (4 new entities)**
- `UserSettings` - User preferences and UI customization
- `TenantConfiguration` - Organization-level settings and policies
- `FeatureFlag` - Feature toggling and A/B testing
- `FeatureFlagUsage` - Feature flag analytics

### **Search Infrastructure (2 new entities)**
- `SearchAnalytics` - Search query tracking and optimization
- `SearchSuggestion` - Admin-configured quick filters and shortcuts

### **Export & Reporting (4 new entities)**
- `ExportJob` - Asynchronous data export processing
- `ReportTemplate` - Reusable report definitions
- `ScheduledReport` - Automated report generation
- `ReportLibrary` - Generated report archive

### **CI/CD Integration (3 new entities)**
- `CIPipelineIntegration` - Pipeline configuration and authentication
- `CIBuildRun` - Build execution tracking
- `CITestResult` - Detailed test result storage

### **Alert Management (4 new entities)**
- `AlertRule` - Threshold and condition configuration
- `AlertIncident` - Alert occurrence and resolution tracking
- `AlertNotificationDelivery` - Multi-channel notification delivery
- `AlertMaintenanceWindow` - Alert suppression schedules

### **People Analytics (4 new entities)**
- `KnowledgeSiloAnalysis` - Code ownership and bus factor analysis
- `SkillGap` - Skills assessment and development tracking
- `TeamHealthMetric` - Team well-being and performance metrics
- `WorkloadAnalysis` - Individual workload and capacity planning

---

## Key Relationship Updates

### **Enhanced User Relationships**
- `User` now links to `UserSettings`, `FeatureFlagUsage`, `SearchAnalytics`, `ExportJob`, `AlertIncident`, and people analytics entities
- Support for comprehensive user activity tracking and personalization

### **Multi-Tenant Search & Export**
- `Tenant` has relationships with all new entities for proper data isolation
- Search analytics tracked per tenant for optimization
- Export system fully integrated with tenant access controls

### **Advanced Alert Routing**
- `AlertRule` → `AlertIncident` → `AlertNotificationDelivery` flow
- Support for escalation, maintenance windows, and multi-channel delivery
- Integration with user roles and product access controls

### **CI/CD Pipeline Integration**
- `Product` → `CIPipelineIntegration` → `CIBuildRun` → `CITestResult` hierarchy
- Automatic linking of CI results to sprints and releases
- Support for multiple pipeline types per product

### **People Analytics Integration**
- `KnowledgeSiloAnalysis` links to users and products for ownership tracking
- `SkillGap` connects users to development plans and training resources
- `WorkloadAnalysis` provides individual and team capacity insights
- `TeamHealthMetric` aggregates multiple dimensions of team performance

---

## Frontend Alignment Improvements

### **✅ Now Fully Supported**
1. **Global Search** - Complete search infrastructure with analytics
2. **Export System** - Full export, reporting, and scheduling capabilities
3. **Alert Management** - Comprehensive alert rules, incidents, and notifications
4. **Settings Pages** - User and tenant configuration management
5. **People Analytics** - Advanced team intelligence and workload tracking
6. **CI/CD Integration** - Complete pipeline and test result management

### **🎯 Production Ready Features**
- **Search Performance**: Full-text search indexes and query optimization
- **Export Scalability**: Async job processing with large file support
- **Alert Reliability**: Multi-channel delivery with maintenance windows
- **People Insights**: Comprehensive team health and skill development tracking
- **CI/CD Visibility**: Complete build and test result lineage

---

This updated ER diagram represents the **complete and production-ready** database schema that fully aligns with the frontend implementation. All identified gaps have been addressed with comprehensive entity definitions, relationships, and metadata support.
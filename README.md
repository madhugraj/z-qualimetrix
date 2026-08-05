# Quality Pulse

# SYSTEM PROMPT: ARCHITECT & BUILD "QUALIMETRIX" — QA & QUALITY INTELLIGENCE PLATFORM

## ROLE & OBJECTIVE

You are an expert Full-Stack Software Engineer and Solutions Architect. You are tasked with designing and implementing a robust, scalable, and multi-tenant Quality Intelligence & Team Performance Platform named "QualiMetrix". 

The platform enables software development teams, product managers, and engineering leaders to track product quality and team productivity by aggregating data via:

1. Automated Integrations (Jira Cloud / Azure DevOps / GitHub / CI Pipelines).

2. Manual Activity Logging (for Demos, Technical Documentation, Exploratory Testing, and RCAs).

---

## SYSTEM ARCHITECTURE REQUIREMENTS

### 1. Dual Data Ingestion Engine

*   **Automated Sync (Jira & Azure DevOps):**

    *   Support OAuth 2.0 and Webhook ingestion for Jira Cloud (Jira REST API v3) and Azure DevOps Services (ADO REST API 7.0).

    *   Sync Epics, User Stories, Bugs, Tasks, Test Cases, Sprint statuses, and Execution outcomes.

    *   Implement an asynchronous background worker (e.g., Celery, BullMQ, or Go workers) with exponential backoff and rate-limit handling to sync data without blocking UI threads.

*   **Hybrid / Manual Entry Layer:**

    *   Provide intuitive UI forms and bulk loggers for activities that APIs cannot track: Demos Given, Technical Documentation completed, Root Cause Analysis (RCA) docs, and Manual Testing Hours.

    *   Include customizable fields per product (e.g., demo ratings, doc links, reviewer approvals).

### 2. Multi-Persona Role-Based Dashboards

Implement role-tailored perspectives with customizable date/sprint/product filters:

*   **Tester Perspective:**

    *   Individual & Team Test Execution Progress (Pass/Fail/Skip/Blocked).

    *   Defect Leakage Rate & Bug Reopen Rate trends.

    *   Operational Deliverables Tracker: Demos logged, Test Plans created, and Docs updated.

    *   Manual vs. Automated test ratio breakdown per product area.

*   **Developer Perspective:**

    *   Personal & Squad Bug Resolution MTTR (Mean Time to Resolve).

    *   First-Time Fix Rate & QA Rejection Reasons.

    *   Defect Density per feature/module touched.

    *   QA Bottleneck Alerts (e.g., "Story awaiting QA for >48 hours").

*   **Product Owner (PO) Perspective:**

    *   Release Readiness Scorecard (Calculated from RTM coverage, open P0/P1 defects, and regression pass rates).

    *   Requirements Traceability Matrix (RTM): Direct visual path from Story -> Test Cases -> Bug Status.

    *   Feature Defect Heatmap (identifying unstable modules).

*   **Leadership / Executive View:**

    *   Multi-Product Quality Health Index (Aggregate comparison radar across all portfolio projects).

    *   Quality Velocity Trend (Sprint Velocity overlaid against Bug Creation/Resolution trends).

    *   Cost of Quality (CoQ) & Automation ROI trends.

---

## TECHNICAL STACK & DESIGN REQUIREMENTS

### Backend Specifications

*   **API Framework:** Node.js (NestJS / Express + TypeScript) OR Python (FastAPI).

*   **Database:** PostgreSQL (for relational core data, tenant isolation, and RBAC) + Redis (for caching dashboard aggregates, rate limiting, and queue management).

*   **ORM/Data Handling:** Prisma / TypeORM / SQLAlchemy with strict schema migrations and indexed key queries for high-performance reporting.

*   **Security:** JWT with Refresh Tokens, Role-Based Access Control (RBAC - Admin, Lead, Dev, Tester, PO, Viewer), AES-256 encryption at rest for Jira/ADO API tokens.

### Frontend Specifications

*   **UI Framework:** React / Next.js with TypeScript and Tailwind CSS.

*   **Component & Charting Library:** Shadcn UI + Tremor / Recharts for high-density, real-time analytics widgets.

*   **UX/UI Principles:** Responsive, high-scannability dark/light modes, drag-and-drop widget layout, filter bars (Product, Team, Sprint, Date Range, Individual).

---

## CORE DOMAIN DATA MODEL (ENTITIES & RELATIONS)

Your backend database schema must include (at minimum) the following entities:

1. `Tenants` / `Organizations`

2. `Products` / `Projects` (linked to Jira Project Keys / ADO Area Paths)

3. `Users` & `Roles` (Admin, Tester, Dev, PO, Executive)

4. `WorkItems` (Stories, Tasks, Bugs, Epics synced from Jira/ADO)

5. `TestCases` & `TestExecutions` (Automated or Manual pass/fail logs)

6. `ManualDeliverables` (Type: Demo, Documentation, RCA; Metadata: links, ratings, dates, author)

7. `QualityMetricsSnapshot` (Pre-calculated daily/sprint rollups for fast executive dashboard rendering)

---

## YOUR EXECUTION TASKS

As the Full-Stack Developer Agent, carry out the following step-by-step implementation plan:

1. **Architecture & Data Schema Blueprint:** Define the complete database schema (Prisma/SQL), API route structure, and state management flow.

2. **Integration Core:** Code the webhook handlers and background sync adapters for Jira REST API and Azure DevOps REST API. Include payload normalization so both systems transform into a unified internal data model.

3. **Analytics Engine:** Write efficient SQL/ORM queries or aggregation service functions to calculate MTTR, Defect Leakage Rate, Requirement Traceability %, and Release Readiness Scores.

4. **Frontend Dashboard Components:** Build reusable frontend components for KPI Cards, Chart Modules (Line, Bar, Heatmap, Radar), RTM Interactive Tables, and Activity Log Forms.

5. **Role-Based Routing:** Implement RBAC view guards to adapt the workspace UI depending on whether the logged-in user is a Tester, Dev, PO, or Executive.

Think deeply about edge cases, such as handling large-scale webhooks without dropping payloads, caching dynamic dashboard queries to stay under 200ms response times, and providing sensible default sample data when Jira/ADO integrations are not yet configured.

Begin by proposing the DB Schema and high-level project structure before writing code. # UI/UX DESIGN SPECIFICATION: CRYSTAL CLEAR QUALITY & PERFORMANCE HUB

## VISUAL AESTHETIC & THEME

*   **Design Language:** Glassmorphism / Neu-Minimalism (highly inspired by modern Apple macOS/iOS surfaces).

*   **Base Layer:** Soft, blurred gradient background (e.g., diffused deep teal, cool blue, and faint cyan) suggesting energy and movement without being distracting.

*   **Surfaces:** Translucent "frosted glass" panels (background-blur: 20px-40px) with thin, subtle 1px white or light gray internal borders and soft, diffused drop shadows to create a floating effect.

*   **Typography:** Clean, sans-serif font family (e.g., SF Pro, Inter, or Montserrat). Use high-contrast hierarchy (Large, bold headers; light, distinct sub-labels).

*   **Iconography:** Minimal, thin-line vector icons (e.g., SF Symbols style) with subtle glow effects on hover.

*   **Color Palette (Semantic):** Minimalist grayscale for structure, with accent colors used only for performance indicators (Cyan/Teal for primary actions and 'Good' status; Amber for 'Warning'; Crimson/Red for 'Blocker' or 'Critical'; Purple for 'Operational Deliverables').

## LAYOUT STRUCTURE (MULTI-VIEW DASHBOARD)

The main application screen is an adaptable canvas of floating glass tiles. It must dynamically prioritize data based on user role (Developer, Tester, PO, Leader).

#### 1. Global Navigation (Left Sidebar)

*   A narrow, highly translucent frosted sidebar with minimal icons: Dashboard, Reports, Integrations, Settings, Manual Log.

*   The active icon should have a vibrant, subtle cyan glow and indicator line.

#### 2. Key Component Groups (Floating Glass Panels)

A. **KPI Overview Tiles (Mini Glass Cards):**

    *   Small, simple rectangular glass tiles showing a single number, a tiny trend arrow, and a subtle sparkline graph (e.g., MTTR: 3.2 hrs ↓; First-Time Fix: 88% ↑; Bug Reopen Rate: 2% ↓).

B. **Interactive Heatmaps & Progress Rings:**

    *   **Defect Density Heatmap:** A grid of colored glass squares (Green to Red) showing bug counts across product modules.

    *   **Test Execution / Release Readiness:** Large, bold circular progress meters (cyan fill, gray track) showing percentage completion (e.g., "94% Executed", "91% Release Ready").

C. **"Operational Deliverables" Feed (Purple Accent):**

    *   A list view showing recent activity tags like "[DEMO] Product A Sprint 12 (Rating: 4.5/5)" and "[DOC] API v3 Swagger update."

D. **Cross-Product Radar Chart (Leadership View):**

    *   A multi-colored radar graph comparing multiple products across Quality, Stability, Velocity, ROI, and Automation coverage.

---

## EXECUTION TASKS FOR AGENT (FE IMPLEMENTATION)

1. **CSS/Styling Architecture:** Define reusable Tailwind or CSS variables for background blur, frosted transparency, white borders, and semantic color accents (Teal, Amber, Crimson, Purple).

2. **Component Library:** Build the core reusable "GlassPanel" container, "KpiMetricCard", "CircularProgress", and "RoleSwitcher" components.

3. **Responsive Dashboard Grid:** Implement a CSS Grid layout that intelligently reflows the floating panels based on screen size (e.g., single column on mobile, multi-column matrix on ultra-wide).

4. **Data Visualization Integration:** Connect a charting library (like Tremor or Recharts) to render the line graphs, heatmaps, and radar charts inside the frosted glass containers.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://z-qualimetrix.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6f4706e5-88ce-4bcc-90f1-083cbc7af21e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

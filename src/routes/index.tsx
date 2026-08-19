import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Bug,
  LineChart,
  Sparkles,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QubeIQ - Unified Quality Metrics Platform" },
      {
        name: "description",
        content:
          "QubeIQ turns scattered QA signals, defect data, delivery effort and AI tool usage into one accountable picture of product quality and team health.",
      },
      { property: "og:title", content: "QubeIQ - Unified Quality Metrics Platform" },
      {
        property: "og:description",
        content:
          "See what quality actually costs you: defect leakage, MTTR, release readiness, engineering workload and AI token spend in one hub.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const CAPABILITIES = [
  {
    id: "quality-intelligence",
    icon: LineChart,
    title: "Quality Intelligence",
    subtitle: "Transform scattered signals into predictive insights",
    description: "Most engineering teams have quality data scattered across Jira, Azure DevOps, test runners, and spreadsheets. QubeIQ unifies every signal into real-time quality intelligence that predicts release risk, optimizes resource allocation, and drives continuous improvement.",
    metrics: [
      { value: "85%", label: "Reduction in release risk" },
      { value: "60%", label: "Less time in quality meetings" },
      { value: "100%", label: "Elimination of manual reporting" },
    ],
    features: [
      { title: "Predictive Quality Scoring", desc: "Machine learning models predict release readiness based on historical patterns and current signals" },
      { title: "Real-time Dashboards", desc: "Live KPIs for execution coverage, defect leakage, MTTR, and release readiness across all teams" },
      { title: "Trend Analysis", desc: "Identify quality trends weeks before they impact delivery with advanced anomaly detection" },
      { title: "Multi-dimensional Metrics", desc: "View quality by team, product, sprint, or any dimension that matters to your organization" },
    ],
    glow: "text-primary",
    span: "lg:col-span-3",
  },
  {
    id: "defect-classification",
    icon: Bug,
    title: "Smart Defect Management",
    subtitle: "AI-powered classification eliminates duplicate triage work",
    description: "Stop wasting engineering time on manual defect categorization and duplicate investigations. Our AI automatically classifies every defect by domain, severity, and historical patterns, ensuring your team focuses on fixing problems, not sorting them.",
    metrics: [
      { value: "75%", label: "Faster triage process" },
      { value: "90%", label: "Reduction in duplicate work" },
      { value: "95%", label: "Classification accuracy" },
    ],
    features: [
      { title: "Automatic Domain Classification", desc: "AI tags every defect as UI, Backend, AI/ML, or Infrastructure with 95% accuracy" },
      { title: "Duplicate Detection", desc: "Historical pattern matching surfaces related defects before your team duplicates investigation work" },
      { title: "Priority Scoring", desc: "ML models rank defects by business impact and technical severity to optimize fix prioritization" },
      { title: "Root Cause Clustering", desc: "Identify systemic issues by grouping related defects across teams and time periods" },
    ],
    glow: "text-critical",
    span: "lg:col-span-3",
  },
  {
    id: "engineering-health",
    icon: Users,
    title: "Engineering Health Analytics",
    subtitle: "Proactive monitoring prevents burnout and optimizes delivery",
    description: "Quality isn't just about code—it's about the people who build it. QubeIQ monitors workload patterns, after-hours work, feature-to-fix ratios, and team composition to identify health risks 30 days before they impact delivery or retention.",
    metrics: [
      { value: "30", label: "Days early burnout detection" },
      { value: "45%", label: "Reduction in after-hours work" },
      { value: "2.3x", label: "Improved team retention" },
    ],
    features: [
      { title: "Workload Strain Analysis", desc: "Identify unhealthy sprint patterns and resource imbalances before team exhaustion occurs" },
      { title: "After-hours Impact Tracking", desc: "Measure and reduce off-hours work that correlates with burnout and attrition" },
      { title: "Team Composition Optimization", desc: "Data-driven insights into optimal team size, skill mix, and bus factor risk" },
      { title: "Predictive Retention Modeling", desc: "Identify flight risk factors and proactively address team health issues" },
    ],
    glow: "text-good",
    span: "lg:col-span-3",
  },
  {
    id: "ai-governance",
    icon: Bot,
    title: "AI Usage Governance",
    subtitle: "Complete control over AI spend, efficiency, and adoption",
    description: "AI tools are transforming development, but unchecked usage can explode costs and create security risks. QubeIQ provides complete visibility into token consumption, model efficiency, and ROI across every squad, with governance guardrails that enable safe scaling.",
    metrics: [
      { value: "40%", label: "Reduction in AI spend waste" },
      { value: "65%", label: "Improvement in model efficiency" },
      { value: "100%", label: "Visibility into AI usage" },
    ],
    features: [
      { title: "Per-Squad Budget Tracking", desc: "Set and monitor AI spend limits by team with real-time alerts and automated enforcement" },
      { title: "Model Efficiency Analytics", desc: "Compare prompt performance across models to optimize for cost, speed, and quality" },
      { title: "ROI Measurement", desc: "Quantify the business impact of AI investments by connecting usage to delivery outcomes" },
      { title: "Governance Guardrails", desc: "Policy-based controls ensure AI adoption stays within security, compliance, and budget boundaries" },
    ],
    glow: "text-ops",
    span: "lg:col-span-3",
  },
];

const PROOF = [
  { value: "1 hub", label: "Jira, ADO and manual effort in one model" },
  { value: "4 lenses", label: "Tester, Developer, Product Owner, Leadership" },
  { value: "0 guesswork", label: "Every KPI traceable to its source item" },
];

const MOCK_KPIS = [
  { label: "Execution coverage", value: "92%", tone: "text-primary", bar: 92 },
  { label: "Defect leakage", value: "3.1%", tone: "text-warning", bar: 31 },
  { label: "MTTR", value: "18h", tone: "text-foreground", bar: 62 },
  { label: "Release readiness", value: "78", tone: "text-good", bar: 78 },
];

const MOCK_BARS = [42, 58, 36, 71, 49, 84, 63, 92, 55, 74, 68, 88];

function DashboardMockup() {
  return (
    <div className="gloss rounded-[2.5rem] p-3 sm:p-4">
      <div className="rounded-[2rem] border border-glass-border/70 bg-background/45 p-4 sm:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-critical/60" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-good/60" />
            <span className="ml-3 truncate text-xs text-muted-foreground">
              QubeIQ · Leadership perspective · Sprint 24.6
            </span>
          </div>
          <span className="rounded-full border border-primary/40 px-2.5 py-1 text-[10px] tracking-wide text-primary uppercase">
            Live
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MOCK_KPIS.map((k) => (
            <div key={k.label} className="gloss rounded-2xl p-3">
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${k.tone}`}>{k.value}</p>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${k.bar}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <div className="gloss rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Defect trend vs. fix rate</p>
            <div className="mt-4 flex h-32 items-end gap-1.5">
              {MOCK_BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-md bg-gradient-to-t from-primary/25 to-primary/85"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
          <div className="gloss rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Bug domains</p>
            <ul className="mt-4 space-y-3 text-xs">
              {[
                { l: "Backend / API", v: "38%", c: "bg-primary" },
                { l: "UI / UX", v: "27%", c: "bg-good" },
                { l: "AI / ML", v: "21%", c: "bg-warning" },
                { l: "Infrastructure", v: "14%", c: "bg-critical" },
              ].map((d) => (
                <li key={d.l} className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${d.c}`} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.l}</span>
                  <span className="shrink-0 font-medium">{d.v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="gloss-bloom -top-40 -left-32 h-[34rem] w-[34rem]"
        style={{ background: "radial-gradient(circle, oklch(0.82 0.11 70 / 45%), transparent 70%)" }}
      />
      <div
        className="gloss-bloom top-52 -right-40 h-[30rem] w-[30rem]"
        style={{ background: "radial-gradient(circle, oklch(0.86 0.06 190 / 40%), transparent 70%)" }}
      />

      <header className="sticky top-4 z-50 mx-auto w-[min(100%-1.5rem,64rem)]">
        <nav className="gloss grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-full px-4 py-2.5 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60">
              <span className="text-sm font-bold text-primary-foreground">Q</span>
            </div>
            <span className="truncate text-sm font-semibold tracking-tight">QubeIQ</span>
          </Link>
          <div className="flex items-center gap-2">
            <a
              href="#capabilities"
              className="gloss gloss-hover rounded-full px-4 py-2 text-sm font-medium hover:text-primary"
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              className="gloss gloss-hover rounded-full px-4 py-2 text-sm font-medium hover:text-primary"
            >
              How it works
            </a>
            <a
              href="#trust"
              className="gloss gloss-hover rounded-full px-4 py-2 text-sm font-medium hover:text-primary"
            >
              Results
            </a>
            <Link
              to="/login"
              className="gloss-cta inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            >
              Get Demo
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative mx-auto max-w-7xl px-5 pb-28">
        <section className="pt-24 pb-16 text-center md:pt-32 lg:pt-40">
          <div className="gloss inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-primary mb-6">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            <span className="uppercase tracking-wider">Unified Quality Metrics Platform</span>
          </div>
          <h1 className="mx-auto max-w-5xl text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            Quality intelligence that
            <br className="hidden sm:block" />
            <span className="text-gradient">predicts release success</span>
          </h1>
          <p className="mx-auto mt-8 max-w-3xl text-lg text-muted-foreground md:text-xl lg:text-2xl">
            Stop firefighting quality issues. QubeIQ unifies scattered signals across Jira, Azure DevOps, test runners, and AI tools into predictive intelligence that prevents defects before they reach production.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row flex-wrap justify-center gap-4">
            <Link
              to="/login"
              className="gloss-cta inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-bold"
            >
              Get a personalized demo
              <ArrowRight className="h-5 w-5" strokeWidth={2} />
            </Link>
            <a
              href="#how-it-works"
              className="gloss gloss-hover inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-semibold"
            >
              See how it works
            </a>
          </div>
          <div className="mt-16 flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-good"></span>
              <span>Trusted by enterprise teams</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary"></span>
              <span>SOC 2 compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-ops"></span>
              <span>Real-time analytics</span>
            </div>
          </div>
        </section>

        <section className="py-16 [perspective:1600px]">
          <div className="[transform:rotateX(7deg)_rotateZ(-0.6deg)]">
            <DashboardMockup />
          </div>
        </section>

        <section id="how-it-works" className="mt-32">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <span className="gloss inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-primary uppercase tracking-wider mb-6">
              How QubeIQ Works
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              From scattered signals to unified intelligence
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              QubeIQ connects your existing tools and transforms scattered quality data into actionable intelligence in three simple steps.
            </p>
          </div>

          <div className="grid gap-8 md:gap-12 lg:gap-16 md:grid-cols-3">
            <div className="gloss gloss-hover rounded-3xl p-8 relative">
              <div className="absolute -top-4 left-8 gloss-cta h-8 w-8 rounded-full flex items-center justify-center font-bold">1</div>
              <div className="mt-4">
                <h3 className="text-xl font-bold tracking-tight mb-3">Connect Your Tools</h3>
                <p className="text-base text-muted-foreground leading-relaxed mb-4">
                  Integrate with Jira, Azure DevOps, test runners, and AI tools in minutes. Our pre-built connectors automatically start pulling quality signals.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0"></span>
                    <span>One-click Jira & Azure DevOps integration</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0"></span>
                    <span>Automatic test runner connection</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0"></span>
                    <span>AI tool usage tracking setup</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="gloss gloss-hover rounded-3xl p-8 relative">
              <div className="absolute -top-4 left-8 gloss-cta h-8 w-8 rounded-full flex items-center justify-center font-bold">2</div>
              <div className="mt-4">
                <h3 className="text-xl font-bold tracking-tight mb-3">AI Analysis Begins</h3>
                <p className="text-base text-muted-foreground leading-relaxed mb-4">
                  Our ML models automatically classify defects, detect patterns, and establish baseline quality metrics for your teams and products.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-good mt-1.5 shrink-0"></span>
                    <span>Automatic defect classification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-good mt-1.5 shrink-0"></span>
                    <span>Pattern recognition & anomaly detection</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-good mt-1.5 shrink-0"></span>
                    <span>Baseline quality metrics establishment</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="gloss gloss-hover rounded-3xl p-8 relative">
              <div className="absolute -top-4 left-8 gloss-cta h-8 w-8 rounded-full flex items-center justify-center font-bold">3</div>
              <div className="mt-4">
                <h3 className="text-xl font-bold tracking-tight mb-3">Predictive Intelligence</h3>
                <p className="text-base text-muted-foreground leading-relaxed mb-4">
                  Get real-time dashboards, risk predictions, and actionable insights that help your team ship quality code faster and more confidently.
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-ops mt-1.5 shrink-0"></span>
                    <span>Real-time quality dashboards</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-ops mt-1.5 shrink-0"></span>
                    <span>Predictive release risk scoring</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-ops mt-1.5 shrink-0"></span>
                    <span>Team health & AI spend insights</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="trust" className="mt-32">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <span className="gloss inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-primary uppercase tracking-wider mb-6">
              Why Leading Teams Choose QubeIQ
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              Proven results across enterprise engineering teams
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              From Fortune 500 enterprises to high-growth startups, engineering teams trust QubeIQ to transform their quality intelligence and predict delivery success.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="gloss gloss-hover rounded-3xl p-8 text-center">
              <div className="text-5xl font-bold text-primary mb-2">85%</div>
              <div className="text-base font-semibold mb-1">Reduction in Release Risk</div>
              <div className="text-sm text-muted-foreground">Teams using QubeIQ catch defects before production</div>
            </div>
            <div className="gloss gloss-hover rounded-3xl p-8 text-center">
              <div className="text-5xl font-bold text-good mb-2">75%</div>
              <div className="text-base font-semibold mb-1">Faster Triage Process</div>
              <div className="text-sm text-muted-foreground">AI classification eliminates manual sorting</div>
            </div>
            <div className="gloss gloss-hover rounded-3xl p-8 text-center">
              <div className="text-5xl font-bold text-warning mb-2">40%</div>
              <div className="text-base font-semibold mb-1">Reduction in AI Spend Waste</div>
              <div className="text-sm text-muted-foreground">Governance controls optimize token consumption</div>
            </div>
            <div className="gloss gloss-hover rounded-3xl p-8 text-center">
              <div className="text-5xl font-bold text-ops mb-2">30 days</div>
              <div className="text-base font-semibold mb-1">Early Burnout Detection</div>
              <div className="text-sm text-muted-foreground">Proactive health monitoring prevents team exhaustion</div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="mt-32">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <span className="gloss inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-primary uppercase tracking-wider mb-6">
              Platform Capabilities
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
              Enterprise-grade quality intelligence
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
              Transform scattered quality signals into actionable insights that predict release risk, optimize team performance, and drive continuous improvement across your entire engineering organization.
            </p>
          </div>

          <div className="space-y-24">
            {CAPABILITIES.map((capability, index) => (
              <section key={capability.id} id={capability.id} className="scroll-mt-24">
                <div className={`grid gap-12 lg:gap-16 items-center ${index % 2 === 0 ? 'lg:grid-cols-[1fr,1.2fr]' : 'lg:grid-cols-[1.2fr,1fr]'}`}>
                  <div className={index % 2 === 0 ? '' : 'lg:order-2'}>
                    <div className="gloss rounded-3xl p-8 lg:p-10">
                      <div className="flex items-center gap-4 mb-6">
                        <span className="gloss inline-flex h-14 w-14 items-center justify-center rounded-2xl">
                          <capability.icon className={`h-7 w-7 ${capability.glow}`} strokeWidth={1.5} />
                        </span>
                        <div>
                          <h3 className="text-2xl font-bold tracking-tight">{capability.title}</h3>
                          <p className={`text-sm font-semibold ${capability.glow} mt-1`}>{capability.subtitle}</p>
                        </div>
                      </div>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {capability.description}
                      </p>

                      <div className="mt-8 pt-8 border-t border-glass-border">
                        <h4 className="text-sm font-semibold mb-4 uppercase tracking-wider text-muted-foreground">Proven Results</h4>
                        <div className="grid gap-4 sm:grid-cols-3">
                          {capability.metrics.map((metric, idx) => (
                            <div key={idx} className="text-center">
                              <div className={`text-3xl font-bold ${capability.glow}`}>{metric.value}</div>
                              <div className="text-sm text-muted-foreground mt-1">{metric.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={index % 2 === 0 ? '' : 'lg:order-1'}>
                    <div className="space-y-6">
                      <h4 className="text-xl font-semibold tracking-tight">Key Capabilities</h4>
                      <div className="space-y-4">
                        {capability.features.map((feature, idx) => (
                          <div key={idx} className="gloss gloss-hover rounded-2xl p-6">
                            <h5 className="font-semibold tracking-tight mb-2">{feature.title}</h5>
                            <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative mx-auto max-w-6xl px-5 pb-10 pt-16 border-t border-glass-border">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h4 className="text-sm font-semibold mb-3">Platform</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><a href="#capabilities" className="hover:text-primary transition-colors">Platform Capabilities</a></li>
              <li><a href="#how-it-works" className="hover:text-primary transition-colors">How It Works</a></li>
              <li><a href="#trust" className="hover:text-primary transition-colors">Results & Metrics</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3">Resources</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><Link to="/setup" className="hover:text-primary transition-colors">Setup Guide</Link></li>
              <li><Link to="/login" className="hover:text-primary transition-colors">Documentation</Link></li>
              <li><a className="hover:text-primary transition-colors">API Reference</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3">Company</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><a className="hover:text-primary transition-colors">About YAVAR</a></li>
              <li><a className="hover:text-primary transition-colors">Contact</a></li>
              <li><a className="hover:text-primary transition-colors">Privacy Policy</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3">Get Started</h4>
            <Link
              to="/login"
              className="gloss-cta inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
            >
              Request Demo
              <ArrowRight className="h-3 w-3" strokeWidth={2} />
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">
              Transform your quality intelligence today
            </p>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-glass-border text-xs text-muted-foreground">
          <p>YAVAR™ · QubeIQ - Unified Quality Metrics Platform</p>
          <p className="mt-1">© 2026 YAVAR. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Bug,
  HeartPulse,
  LineChart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import yavarLogo from "@/assets/yavar-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QualiMetrix — Quality Intelligence for Engineering Teams" },
      {
        name: "description",
        content:
          "QualiMetrix turns scattered QA signals, defect data, delivery effort and AI tool usage into one accountable picture of product quality and team health.",
      },
      { property: "og:title", content: "QualiMetrix — Quality Intelligence Platform" },
      {
        property: "og:description",
        content:
          "See what quality actually costs you: defect leakage, MTTR, release readiness, engineering workload and AI token spend in one hub.",
      },
    ],
  }),
  component: Landing,
});

const CAPABILITIES = [
  {
    icon: LineChart,
    title: "Quality, quantified",
    body: "Execution coverage, defect leakage, MTTR and release readiness computed per sprint, per product, per team — no spreadsheet archaeology.",
    glow: "text-primary",
    ring: "shadow-[0_0_40px_-12px_var(--primary)]",
    span: "lg:col-span-3",
  },
  {
    icon: Bug,
    title: "Bugs that classify themselves",
    body: "Every defect is tagged to UI, Backend, AI/ML or Infrastructure and screened against history, so duplicates surface before they cost a second triage.",
    glow: "text-accent",
    ring: "shadow-[0_0_40px_-12px_var(--accent)]",
    span: "lg:col-span-3",
  },
  {
    icon: HeartPulse,
    title: "Engineering health, not just output",
    body: "Workload strain, after-hours load, feature-vs-fix balance and bus-factor risk — the leading indicators that show up in delivery a quarter later.",
    glow: "text-good",
    ring: "shadow-[0_0_40px_-12px_var(--good)]",
    span: "lg:col-span-3",
  },
  {
    icon: Bot,
    title: "AI usage under control",
    body: "Token burn, model efficiency and per-squad spend against the sprint cap, with visibility tiered from individual contributor to leadership.",
    glow: "text-accent",
    ring: "shadow-[0_0_40px_-12px_var(--accent)]",
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
    <div className="glass-panel rounded-[2rem] p-3 sm:p-4">
      <div className="rounded-[1.5rem] border border-border bg-[oklch(0.17_0.015_270_/_75%)] p-4 sm:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-critical/70" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-good/70" />
            <span className="ml-3 truncate text-xs text-muted-foreground">
              QualiMetrix · Leadership perspective · Sprint 24.6
            </span>
          </div>
          <span className="rounded-full border border-primary/40 px-2.5 py-1 text-[10px] tracking-wide text-primary uppercase">
            Live
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MOCK_KPIS.map((k) => (
            <div key={k.label} className="glass-panel rounded-2xl p-3">
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${k.tone}`}>{k.value}</p>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${k.bar}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Defect trend vs. fix rate</p>
            <div className="mt-4 flex h-32 items-end gap-1.5">
              {MOCK_BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-primary/25 to-primary/80"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">Bug domains</p>
            <ul className="mt-4 space-y-3 text-xs">
              {[
                { l: "Backend / API", v: "38%", c: "bg-primary" },
                { l: "UI / UX", v: "27%", c: "bg-accent" },
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
    <div className="qm-night relative min-h-screen overflow-hidden">
      <div className="night-mesh" aria-hidden="true" />
      <div
        className="night-orb h-[32rem] w-[32rem] bg-[radial-gradient(circle,oklch(0.6_0.14_250_/_35%),transparent_70%)] bottom-[-10rem] left-1/3"
        aria-hidden="true"
      />

      <div className="relative z-10">
        <header className="sticky top-4 z-50 mx-auto w-[min(100%-1.5rem,64rem)]">
          <nav className="glass-panel grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-full px-4 py-2.5 sm:px-6">
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <img
                src={yavarLogo.url}
                alt="Yavar logo"
                className="h-6 w-[44px] shrink-0 object-contain invert mix-blend-screen"
              />
              <span className="truncate text-sm font-semibold tracking-tight">
                Yavar QualiMetrix
              </span>
            </Link>
            <Link
              to="/login"
              className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-all hover:border-primary/50 hover:text-primary hover:shadow-[0_0_28px_-8px_var(--primary)]"
            >
              Sign in
            </Link>
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-5 pb-28">
          <section className="pt-20 pb-10 text-center md:pt-28">
            <span className="glass-panel inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
              Quality Intelligence Platform
            </span>
            <h1 className="mx-auto mt-7 max-w-4xl text-[2.6rem] leading-[1.03] font-semibold tracking-tight sm:text-6xl md:text-7xl">
              Quality is a number.
              <br />
              <span className="shimmer-text">Most teams never see it.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
              Defects leak, fixes stall, effort disappears into untracked work and AI tools
              quietly compound the bill. QualiMetrix reconstructs the full picture — from a
              single failing test case to portfolio-level release risk — and makes it
              answerable to a person, a sprint and a cost.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                to="/login"
                className="glow-cyan inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                Enter the platform
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>
              <Link
                to="/dashboard"
                className="glass-panel glass-lift inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium"
              >
                View a live dashboard
              </Link>
            </div>
          </section>

          <section className="[perspective:1600px]">
            <div className="[transform:rotateX(7deg)_rotateZ(-0.6deg)]">
              <DashboardMockup />
            </div>
          </section>

          <section className="mt-14 grid gap-4 sm:grid-cols-3">
            {PROOF.map((p) => (
              <div key={p.label} className="glass-panel glass-lift rounded-3xl p-5">
                <p className="text-2xl font-semibold">{p.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.label}</p>
              </div>
            ))}
          </section>

          <section className="mt-24">
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
              Built for the parts of quality nobody instruments
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
              Test management tools track cases. Issue trackers track tickets. Neither tells
              you whether the team is healthy, whether the defect is new, or what the last
              sprint of quality work cost.
            </p>
            <div className="mt-10 grid gap-4 lg:grid-cols-6">
              {CAPABILITIES.map((c) => (
                <article
                  key={c.title}
                  className={`glass-panel glass-lift flex flex-col rounded-3xl p-6 ${c.span}`}
                >
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border ${c.ring}`}
                  >
                    <c.icon className={`h-5 w-5 ${c.glow}`} strokeWidth={1.5} />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{c.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-24">
            <div className="glass-panel rounded-[2rem] px-6 py-12 text-center sm:px-12">
              <span className="glow-cyan mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl">
                <ShieldCheck className="h-7 w-7 text-primary" strokeWidth={1.4} />
              </span>
              <h2 className="mt-6 text-3xl font-semibold tracking-tight">Ready when you are</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
                Sign in with two-factor verification and start from the perspective that
                matches your role.
              </p>
              <Link
                to="/login"
                className="glow-cyan mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                Sign in
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>
            </div>
          </section>
        </main>

        <footer className="relative z-10 mx-auto max-w-6xl px-5 pb-10 text-xs text-muted-foreground">
          YAVAR™ · QualiMetrix — Quality Intelligence Platform
        </footer>
      </div>
    </div>
  );
}

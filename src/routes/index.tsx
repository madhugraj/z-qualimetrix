import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Bug,
  HeartPulse,
  LineChart,
  LogIn,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import yavarLogo from "@/assets/yavar-logo.png.asset.json";
import { GlassPanel } from "@/components/qm/GlassPanel";

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
  },
  {
    icon: Bug,
    title: "Bugs that classify themselves",
    body: "Every defect is tagged to UI, Backend, AI/ML or Infrastructure and screened against history, so duplicates surface before they cost a second triage.",
  },
  {
    icon: HeartPulse,
    title: "Engineering health, not just output",
    body: "Workload strain, after-hours load, feature-vs-fix balance and bus-factor risk — the leading indicators that show up in delivery a quarter later.",
  },
  {
    icon: Bot,
    title: "AI usage under control",
    body: "Token burn, model efficiency and per-squad spend against the sprint cap, with visibility tiered from individual contributor to leadership.",
  },
];

const PROOF = [
  { value: "1 hub", label: "Jira, ADO and manual effort in one model" },
  { value: "4 lenses", label: "Tester, Developer, Product Owner, Leadership" },
  { value: "0 guesswork", label: "Every KPI traceable to its source item" },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-6">
        <img
          src={yavarLogo.url}
          alt="YAVAR logo"
          className="h-7 w-[48px] object-contain mix-blend-multiply"
        />
        <span className="text-sm font-semibold tracking-tight">QualiMetrix</span>
        <Link
          to="/login"
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_30px_-12px_var(--primary)] transition-transform hover:-translate-y-0.5"
        >
          <LogIn className="h-4 w-4" strokeWidth={1.75} />
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="grid items-center gap-10 py-12 md:grid-cols-[1.1fr_0.9fr] md:py-20">
          <div>
            <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
              Quality Intelligence Platform
            </span>
            <h1 className="mt-5 text-4xl leading-[1.05] font-semibold md:text-6xl">
              Quality is a number.
              <br />
              <span className="text-gradient">Most teams never see it.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
              Defects leak, fixes stall, effort disappears into untracked work and AI tools
              quietly compound the bill. QualiMetrix reconstructs the full picture — from a
              single failing test case to portfolio-level release risk — and makes it
              answerable to a person, a sprint and a cost.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-transform hover:-translate-y-0.5"
              >
                Enter the platform
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
              <Link
                to="/dashboard"
                className="glass glass-hover inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium"
              >
                View a live dashboard
              </Link>
            </div>
          </div>

          <GlassPanel className="p-6">
            <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
              What it answers
            </p>
            <ul className="mt-4 space-y-4 text-sm">
              {[
                "Is this release safe to ship — and what exactly is the risk?",
                "Which module keeps producing defects, and who carries it alone?",
                "Where did the sprint's engineering hours actually go?",
                "What are we spending on AI, and is it improving quality?",
              ].map((q) => (
                <li key={q} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-foreground/85">{q}</span>
                </li>
              ))}
            </ul>
          </GlassPanel>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {PROOF.map((p) => (
            <GlassPanel key={p.label} className="p-5">
              <p className="text-2xl font-semibold">{p.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{p.label}</p>
            </GlassPanel>
          ))}
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold md:text-3xl">
            Built for the parts of quality nobody instruments
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Test management tools track cases. Issue trackers track tickets. Neither tells you
            whether the team is healthy, whether the defect is new, or what the last sprint of
            quality work cost.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <GlassPanel key={c.title} className="glass-hover p-6">
                <c.icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
                <h3 className="mt-4 text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
              </GlassPanel>
            ))}
          </div>
        </section>

        <section className="mt-20">
          <GlassPanel className="flex flex-wrap items-center gap-6 p-8">
            <ShieldCheck className="h-8 w-8 text-primary" strokeWidth={1.4} />
            <div className="min-w-[240px] flex-1">
              <h2 className="text-xl font-semibold">Ready when you are</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in with two-factor verification and start from the perspective that matches
                your role.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Sign in
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </GlassPanel>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-muted-foreground">
        YAVAR™ · QualiMetrix — Quality Intelligence Platform
      </footer>
    </div>
  );
}

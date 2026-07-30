// ---------------------------------------------------------------------------
// Intelligent Bug Classification Engine (client-side reference implementation)
// Domain tagging = keyword/path rules. Similarity = tf-idf cosine.
// Swap for server-side embeddings (pgvector) once a backend is wired.
// ---------------------------------------------------------------------------

export type BugDomain = "UI/UX" | "Backend/API" | "AI/ML Team" | "Infrastructure";

export const BUG_DOMAINS: BugDomain[] = ["UI/UX", "Backend/API", "AI/ML Team", "Infrastructure"];

export const DOMAIN_COLOR: Record<BugDomain, string> = {
  "UI/UX": "var(--primary)",
  "Backend/API": "var(--ops)",
  "AI/ML Team": "var(--critical)",
  Infrastructure: "var(--warning)",
};

const RULES: { domain: BugDomain; terms: string[] }[] = [
  {
    domain: "UI/UX",
    terms: [
      "css",
      "layout",
      "render",
      "responsive",
      "modal",
      "button",
      "contrast",
      "accessibility",
      "aria",
      "focus",
      "tooltip",
      "overflow",
      "spacing",
      "/src/components",
      "/web/",
      "tailwind",
    ],
  },
  {
    domain: "Backend/API",
    terms: [
      "api",
      "endpoint",
      "500",
      "timeout",
      "database",
      "sql",
      "query",
      "migration",
      "latency",
      "webhook",
      "auth",
      "token",
      "serializer",
      "/services/",
      "/api/",
      "postgres",
    ],
  },
  {
    domain: "AI/ML Team",
    terms: [
      "model",
      "hallucination",
      "hallucinate",
      "embedding",
      "prompt",
      "llm",
      "inference",
      "vector",
      "rag",
      "token limit",
      "fine-tune",
      "classifier",
      "/ml/",
      "/ai/",
    ],
  },
  {
    domain: "Infrastructure",
    terms: [
      "ci",
      "cd",
      "pipeline",
      "docker",
      "kubernetes",
      "deploy",
      "environment",
      "staging",
      "runner",
      "build",
      "terraform",
      "helm",
      "/.github/",
      "/infra/",
    ],
  },
];

export interface Bug {
  id: string;
  title: string;
  description: string;
  path: string;
  severity: "P0" | "P1" | "P2" | "P3";
  status: "Open" | "In progress" | "Resolved";
  module: string;
  assignee: string;
  reported: string;
  domain?: BugDomain;
  confidence?: number;
}

/** Rule-based domain classifier over title + description + repo path. */
export function classifyBug(bug: Pick<Bug, "title" | "description" | "path">) {
  const text = `${bug.title} ${bug.description} ${bug.path}`.toLowerCase();
  const scores = RULES.map((rule) => ({
    domain: rule.domain,
    score: rule.terms.reduce((acc, term) => (text.includes(term) ? acc + 1 : acc), 0),
  })).sort((a, b) => b.score - a.score);

  const total = scores.reduce((acc, s) => acc + s.score, 0);
  const top = scores[0];
  return {
    domain: (top.score > 0 ? top.domain : "Backend/API") as BugDomain,
    confidence: total ? Math.min(0.99, top.score / total) : 0.4,
  };
}

// ---------- tf-idf similarity ----------

const STOP = new Set([
  "the",
  "a",
  "an",
  "on",
  "in",
  "for",
  "of",
  "to",
  "is",
  "are",
  "and",
  "with",
  "when",
  "after",
  "not",
  "it",
  "at",
]);

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function tfidfVectors(docs: string[]) {
  const tokenised = docs.map(tokenize);
  const df = new Map<string, number>();
  tokenised.forEach((tokens) => {
    new Set(tokens).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1));
  });
  return tokenised.map((tokens) => {
    const tf = new Map<string, number>();
    tokens.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1));
    const vec = new Map<string, number>();
    tf.forEach((count, term) => {
      const idf = Math.log(docs.length / (1 + (df.get(term) ?? 0))) + 1;
      vec.set(term, (count / tokens.length) * idf);
    });
    return vec;
  });
}

function cosine(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0;
  a.forEach((v, k) => {
    const w = b.get(k);
    if (w) dot += v * w;
  });
  const norm = (m: Map<string, number>) =>
    Math.sqrt([...m.values()].reduce((acc, v) => acc + v * v, 0));
  const d = norm(a) * norm(b);
  return d ? dot / d : 0;
}

export interface SimilarBug {
  bug: Bug;
  score: number;
}

/** Returns previously reported bugs that closely match the given bug. */
export function findSimilarBugs(target: Bug, corpus: Bug[], limit = 3): SimilarBug[] {
  const others = corpus.filter((b) => b.id !== target.id);
  const docs = [target, ...others].map((b) => `${b.title} ${b.description} ${b.module}`);
  const vectors = tfidfVectors(docs);
  return others
    .map((bug, i) => ({ bug, score: cosine(vectors[0], vectors[i + 1]) }))
    .filter((r) => r.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------- sample corpus ----------

const RAW: Omit<Bug, "domain" | "confidence">[] = [
  {
    id: "ATL-2201",
    title: "Invoice modal overflows on 13-inch screens",
    description: "CSS layout breaks, modal content clipped, responsive breakpoint missing.",
    path: "/src/components/billing/InvoiceModal.tsx",
    severity: "P2",
    status: "Open",
    module: "Billing",
    assignee: "Priya N.",
    reported: "2h ago",
  },
  {
    id: "ATL-2189",
    title: "Billing invoice dialog clipped on small laptop viewport",
    description: "Layout overflow in the invoice modal, needs responsive css fix.",
    path: "/src/components/billing/InvoiceDialog.tsx",
    severity: "P2",
    status: "Resolved",
    module: "Billing",
    assignee: "Priya N.",
    reported: "3 sprints ago",
  },
  {
    id: "NIM-914",
    title: "Payment API returns 500 on proration query timeout",
    description: "Database query timeout in the proration endpoint under load.",
    path: "/services/payments/api/proration.ts",
    severity: "P0",
    status: "In progress",
    module: "Payments",
    assignee: "Marcus L.",
    reported: "5h ago",
  },
  {
    id: "NIM-871",
    title: "Proration endpoint intermittent timeout under load",
    description: "Slow sql query causes api timeout and 500 responses for payments.",
    path: "/services/payments/api/proration.ts",
    severity: "P1",
    status: "Resolved",
    module: "Payments",
    assignee: "Marcus L.",
    reported: "2 sprints ago",
  },
  {
    id: "VRT-455",
    title: "Assistant hallucinates account balances in summary",
    description: "LLM prompt lacks grounding, model returns invented numbers from embeddings.",
    path: "/ml/ai/summariser/prompt.py",
    severity: "P0",
    status: "Open",
    module: "AI Engine",
    assignee: "Sofia R.",
    reported: "1d ago",
  },
  {
    id: "VRT-441",
    title: "Incorrect embeddings returned for long documents",
    description: "Vector chunking truncates input, rag retrieval quality drops for the model.",
    path: "/ml/ai/embeddings/chunker.py",
    severity: "P1",
    status: "In progress",
    module: "AI Engine",
    assignee: "Sofia R.",
    reported: "2d ago",
  },
  {
    id: "OPS-118",
    title: "CI pipeline runner fails to build docker image on staging deploy",
    description: "Deploy environment misconfigured, kubernetes helm values out of date.",
    path: "/.github/workflows/deploy.yml",
    severity: "P1",
    status: "Open",
    module: "Sync Engine",
    assignee: "Ayo B.",
    reported: "6h ago",
  },
  {
    id: "ORB-330",
    title: "Focus ring missing on mobile nav buttons (accessibility)",
    description: "Aria labels absent and contrast below threshold on the button component.",
    path: "/web/src/components/nav/MobileNav.tsx",
    severity: "P2",
    status: "Open",
    module: "Mobile Shell",
    assignee: "Dan K.",
    reported: "8h ago",
  },
  {
    id: "ORB-318",
    title: "Low contrast labels fail accessibility audit on settings screen",
    description: "Contrast and aria attributes missing across settings layout.",
    path: "/web/src/components/settings/Panel.tsx",
    severity: "P3",
    status: "Resolved",
    module: "Settings",
    assignee: "Dan K.",
    reported: "1 sprint ago",
  },
  {
    id: "ATL-2150",
    title: "Webhook auth token refresh fails after rotation",
    description: "Backend api rejects rotated token, database record stale.",
    path: "/services/webhooks/auth.ts",
    severity: "P1",
    status: "Open",
    module: "Webhooks",
    assignee: "Marcus L.",
    reported: "1d ago",
  },
];

export const BUGS: Bug[] = RAW.map((bug) => ({ ...bug, ...classifyBug(bug) }));

export const DOMAIN_DISTRIBUTION = BUG_DOMAINS.map((domain) => ({
  domain,
  count: BUGS.filter((b) => b.domain === domain).length,
}));

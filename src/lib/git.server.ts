// Server-only helpers for live GitHub / GitLab ingestion.
// GitHub goes through the Lovable connector gateway; GitLab uses a PAT.

export interface RepoInsights {
  provider: "github" | "gitlab";
  repo: string;
  fetchedAt: string;
  pulls: {
    open: number;
    mergedLast30d: number;
    avgMergeHours: number | null;
    avgFirstReviewHours: number | null;
    stale: number;
    list: Array<{
      id: string;
      title: string;
      author: string;
      state: string;
      ageHours: number;
      url: string;
    }>;
  };
  commits: {
    last30d: number;
    authors: number;
    additions: number;
    deletions: number;
    churnSeries: Array<{ week: string; additions: number; deletions: number }>;
  };
  ci: {
    total: number;
    success: number;
    failed: number;
    successRate: number;
    avgDurationMin: number | null;
    list: Array<{ id: string; name: string; status: string; durationMin: number | null; url: string }>;
  };
  issues: {
    open: number;
    bugs: number;
    list: Array<{ id: string; title: string; labels: string[]; ageDays: number; url: string }>;
  };
}

const GH_GATEWAY = "https://connector-gateway.lovable.dev/github";
const hoursBetween = (a: string, b: string) =>
  Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000);
const avg = (n: number[]) => (n.length ? n.reduce((s, v) => s + v, 0) / n.length : null);

async function gh(path: string) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["GITHUB_API_KEY"];
  if (!lovableKey || !connKey) throw new Error("GitHub connection is not configured for this project.");
  const res = await fetch(`${GH_GATEWAY}/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub request failed [${res.status}]: ${body.slice(0, 400)}`);
  }
  return res.json();
}

export async function githubInsights(owner: string, repo: string): Promise<RepoInsights> {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const base = `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const [pulls, commits, runs, issues, freq] = await Promise.all([
    gh(`${base}/pulls?state=all&per_page=50&sort=updated&direction=desc`),
    gh(`${base}/commits?per_page=100&since=${since}`),
    gh(`${base}/actions/runs?per_page=50`).catch(() => ({ workflow_runs: [] })),
    gh(`${base}/issues?state=open&per_page=50`),
    gh(`${base}/stats/code_frequency`).catch(() => []),
  ]);

  const prList: any[] = Array.isArray(pulls) ? pulls : [];
  const merged = prList.filter((p) => p.merged_at && new Date(p.merged_at) > new Date(since));
  const open = prList.filter((p) => p.state === "open");

  const commitList: any[] = Array.isArray(commits) ? commits : [];
  const weeks: any[] = Array.isArray(freq) ? freq.slice(-12) : [];

  const runList: any[] = runs?.workflow_runs ?? [];
  const done = runList.filter((r) => r.conclusion);
  const success = done.filter((r) => r.conclusion === "success").length;

  const issueList: any[] = (Array.isArray(issues) ? issues : []).filter((i) => !i.pull_request);

  return {
    provider: "github",
    repo: `${owner}/${repo}`,
    fetchedAt: new Date().toISOString(),
    pulls: {
      open: open.length,
      mergedLast30d: merged.length,
      avgMergeHours: avg(merged.map((p) => hoursBetween(p.created_at, p.merged_at))),
      avgFirstReviewHours: avg(
        merged
          .filter((p) => p.updated_at)
          .map((p) => hoursBetween(p.created_at, p.updated_at)),
      ),
      stale: open.filter((p) => hoursBetween(p.created_at, new Date().toISOString()) > 168).length,
      list: open.slice(0, 8).map((p) => ({
        id: `#${p.number}`,
        title: p.title,
        author: p.user?.login ?? "unknown",
        state: p.draft ? "draft" : "open",
        ageHours: hoursBetween(p.created_at, new Date().toISOString()),
        url: p.html_url,
      })),
    },
    commits: {
      last30d: commitList.length,
      authors: new Set(commitList.map((c) => c.author?.login ?? c.commit?.author?.email)).size,
      additions: weeks.reduce((s, w) => s + (w?.[1] ?? 0), 0),
      deletions: weeks.reduce((s, w) => s + Math.abs(w?.[2] ?? 0), 0),
      churnSeries: weeks.map((w) => ({
        week: new Date((w?.[0] ?? 0) * 1000).toISOString().slice(5, 10),
        additions: w?.[1] ?? 0,
        deletions: Math.abs(w?.[2] ?? 0),
      })),
    },
    ci: {
      total: done.length,
      success,
      failed: done.length - success,
      successRate: done.length ? Math.round((success / done.length) * 100) : 0,
      avgDurationMin: avg(
        done
          .filter((r) => r.run_started_at && r.updated_at)
          .map((r) => hoursBetween(r.run_started_at, r.updated_at) * 60),
      ),
      list: done.slice(0, 8).map((r) => ({
        id: `#${r.run_number}`,
        name: r.name ?? "workflow",
        status: r.conclusion,
        durationMin:
          r.run_started_at && r.updated_at ? hoursBetween(r.run_started_at, r.updated_at) * 60 : null,
        url: r.html_url,
      })),
    },
    issues: {
      open: issueList.length,
      bugs: issueList.filter((i) =>
        (i.labels ?? []).some((l: any) => /bug|defect|regression/i.test(l.name ?? "")),
      ).length,
      list: issueList.slice(0, 8).map((i) => ({
        id: `#${i.number}`,
        title: i.title,
        labels: (i.labels ?? []).map((l: any) => l.name ?? String(l)),
        ageDays: hoursBetween(i.created_at, new Date().toISOString()) / 24,
        url: i.html_url,
      })),
    },
  };
}

async function gl(host: string, token: string, path: string) {
  const res = await fetch(`${host.replace(/\/$/, "")}/api/v4/${path}`, {
    headers: { "PRIVATE-TOKEN": token },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitLab request failed [${res.status}]: ${body.slice(0, 400)}`);
  }
  return res.json();
}

export async function gitlabInsights(projectPath: string): Promise<RepoInsights> {
  const token = process.env["GITLAB_TOKEN"];
  if (!token) throw new Error("GITLAB_TOKEN is not configured for this project.");
  const host = process.env["GITLAB_HOST"] || "https://gitlab.com";
  const id = encodeURIComponent(projectPath);
  const since = new Date(Date.now() - 30 * 864e5).toISOString();

  const [mrs, commits, pipelines, issues] = await Promise.all([
    gl(host, token, `projects/${id}/merge_requests?state=all&per_page=50&order_by=updated_at`),
    gl(host, token, `projects/${id}/repository/commits?since=${since}&per_page=100&with_stats=true`),
    gl(host, token, `projects/${id}/pipelines?per_page=50`).catch(() => []),
    gl(host, token, `projects/${id}/issues?state=opened&per_page=50`),
  ]);

  const mrList: any[] = Array.isArray(mrs) ? mrs : [];
  const merged = mrList.filter((m) => m.merged_at && new Date(m.merged_at) > new Date(since));
  const open = mrList.filter((m) => m.state === "opened");
  const commitList: any[] = Array.isArray(commits) ? commits : [];
  const pipeList: any[] = (Array.isArray(pipelines) ? pipelines : []).filter((p) =>
    ["success", "failed", "canceled"].includes(p.status),
  );
  const success = pipeList.filter((p) => p.status === "success").length;
  const issueList: any[] = Array.isArray(issues) ? issues : [];

  const byWeek = new Map<string, { additions: number; deletions: number }>();
  for (const c of commitList) {
    const w = new Date(c.created_at).toISOString().slice(5, 10);
    const e = byWeek.get(w) ?? { additions: 0, deletions: 0 };
    e.additions += c.stats?.additions ?? 0;
    e.deletions += c.stats?.deletions ?? 0;
    byWeek.set(w, e);
  }
  const churnSeries = [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-12)
    .map(([week, v]) => ({ week, ...v }));

  return {
    provider: "gitlab",
    repo: projectPath,
    fetchedAt: new Date().toISOString(),
    pulls: {
      open: open.length,
      mergedLast30d: merged.length,
      avgMergeHours: avg(merged.map((m) => hoursBetween(m.created_at, m.merged_at))),
      avgFirstReviewHours: avg(merged.map((m) => hoursBetween(m.created_at, m.updated_at))),
      stale: open.filter((m) => hoursBetween(m.created_at, new Date().toISOString()) > 168).length,
      list: open.slice(0, 8).map((m) => ({
        id: `!${m.iid}`,
        title: m.title,
        author: m.author?.username ?? "unknown",
        state: m.draft ? "draft" : "open",
        ageHours: hoursBetween(m.created_at, new Date().toISOString()),
        url: m.web_url,
      })),
    },
    commits: {
      last30d: commitList.length,
      authors: new Set(commitList.map((c) => c.author_email)).size,
      additions: churnSeries.reduce((s, w) => s + w.additions, 0),
      deletions: churnSeries.reduce((s, w) => s + w.deletions, 0),
      churnSeries,
    },
    ci: {
      total: pipeList.length,
      success,
      failed: pipeList.length - success,
      successRate: pipeList.length ? Math.round((success / pipeList.length) * 100) : 0,
      avgDurationMin: avg(
        pipeList
          .filter((p) => p.created_at && p.updated_at)
          .map((p) => hoursBetween(p.created_at, p.updated_at) * 60),
      ),
      list: pipeList.slice(0, 8).map((p) => ({
        id: `#${p.id}`,
        name: p.ref ?? "pipeline",
        status: p.status,
        durationMin:
          p.created_at && p.updated_at ? hoursBetween(p.created_at, p.updated_at) * 60 : null,
        url: p.web_url,
      })),
    },
    issues: {
      open: issueList.length,
      bugs: issueList.filter((i) => (i.labels ?? []).some((l: string) => /bug|defect|regression/i.test(l)))
        .length,
      list: issueList.slice(0, 8).map((i) => ({
        id: `#${i.iid}`,
        title: i.title,
        labels: i.labels ?? [],
        ageDays: hoursBetween(i.created_at, new Date().toISOString()) / 24,
        url: i.web_url,
      })),
    },
  };
}

export function gitProviderStatus() {
  return {
    github: Boolean(process.env["GITHUB_API_KEY"] && process.env["LOVABLE_API_KEY"]),
    gitlab: Boolean(process.env["GITLAB_TOKEN"]),
    gitlabHost: process.env["GITLAB_HOST"] || "https://gitlab.com",
  };
}

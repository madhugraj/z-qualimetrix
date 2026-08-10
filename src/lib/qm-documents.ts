// ---------------------------------------------------------------------------
// Document download system — mock catalogue of project documentation held in
// external repositories (Drive / SharePoint / Confluence / OneDrive).
// No backend: connections live in component state, downloads are generated
// client-side so the UX is complete and ready to swap for real APIs.
// ---------------------------------------------------------------------------

export type DocSourceId = "gdrive" | "sharepoint" | "confluence" | "onedrive";

export interface DocSource {
  id: DocSourceId;
  name: string;
  detail: string;
  /** What the connector would pull once wired to a real API. */
  scope: string;
}

export const DOC_SOURCES: DocSource[] = [
  {
    id: "gdrive",
    name: "Google Drive",
    detail: "OAuth to a shared drive or folder scoped to the selected project.",
    scope: "drive.readonly · files metadata + download",
  },
  {
    id: "sharepoint",
    name: "Microsoft SharePoint",
    detail: "Connect a site and document library for release and QA artefacts.",
    scope: "Sites.Read.All · document library sync",
  },
  {
    id: "confluence",
    name: "Atlassian Confluence",
    detail: "Pull spaces and pages linked to the project's Jira key.",
    scope: "read:page · space export",
  },
  {
    id: "onedrive",
    name: "Microsoft OneDrive",
    detail: "Individual drive folders for test evidence and manual reports.",
    scope: "Files.Read · folder watch",
  },
];

export type DocKind = "Test plan" | "RCA" | "Release note" | "Spec" | "Report" | "Evidence";

export interface ProjectDocument {
  id: string;
  project: string;
  title: string;
  kind: DocKind;
  source: DocSourceId;
  owner: string;
  updated: string;
  size: string;
  /** Body used for the generated download in this mock. */
  body: string;
}

export const PROJECT_DOCUMENTS: ProjectDocument[] = [
  {
    id: "DOC-1001",
    project: "Atlas Core",
    title: "Atlas Core — Sprint 24.6 test plan",
    kind: "Test plan",
    source: "gdrive",
    owner: "Priya N.",
    updated: "2 days ago",
    size: "412 KB",
    body: "Scope: regression across Auth, Billing sync and Search.\nEntry criteria: build 24.6.3 deployed to staging.\nExit criteria: 0 open P0/P1, execution coverage >= 90%.",
  },
  {
    id: "DOC-1002",
    project: "Atlas Core",
    title: "RCA — payment webhook duplication",
    kind: "RCA",
    source: "confluence",
    owner: "Sofia R.",
    updated: "5 days ago",
    size: "188 KB",
    body: "Trigger: retry storm on webhook consumer.\nRoot cause: idempotency key derived from mutable payload field.\nCorrective action: hash immutable event id; add consumer-side dedupe window.",
  },
  {
    id: "DOC-1003",
    project: "Nimbus Billing",
    title: "Nimbus Billing — release notes v3.4",
    kind: "Release note",
    source: "sharepoint",
    owner: "Dan K.",
    updated: "1 day ago",
    size: "96 KB",
    body: "Added: proration preview API.\nFixed: invoice rounding on multi-currency plans.\nKnown issues: tax engine latency under bulk import.",
  },
  {
    id: "DOC-1004",
    project: "Nimbus Billing",
    title: "Invoice engine functional specification",
    kind: "Spec",
    source: "confluence",
    owner: "Meera S.",
    updated: "3 weeks ago",
    size: "1.2 MB",
    body: "Defines invoice lifecycle states, proration rules and dunning retries with acceptance criteria per requirement id.",
  },
  {
    id: "DOC-1005",
    project: "Orbit Mobile",
    title: "Orbit Mobile — device matrix evidence pack",
    kind: "Evidence",
    source: "onedrive",
    owner: "Arun P.",
    updated: "4 days ago",
    size: "6.8 MB",
    body: "Screenshots and logs for 18 device/OS combinations covering onboarding, offline mode and push handling.",
  },
  {
    id: "DOC-1006",
    project: "Orbit Mobile",
    title: "Crash-free sessions weekly report",
    kind: "Report",
    source: "gdrive",
    owner: "Arun P.",
    updated: "12 hours ago",
    size: "244 KB",
    body: "Crash-free sessions 99.2% (target 99.5%). Top cluster: image cache eviction on low-memory Android 12 devices.",
  },
  {
    id: "DOC-1007",
    project: "Vertex Analytics",
    title: "Model evaluation & drift review",
    kind: "Report",
    source: "sharepoint",
    owner: "Sofia R.",
    updated: "6 days ago",
    size: "3.1 MB",
    body: "Quarterly evaluation of ranking model: precision@10, drift on feature distribution, retraining recommendation.",
  },
  {
    id: "DOC-1008",
    project: "Vertex Analytics",
    title: "Data pipeline QA checklist",
    kind: "Test plan",
    source: "confluence",
    owner: "Priya N.",
    updated: "2 weeks ago",
    size: "132 KB",
    body: "Schema contract checks, null-rate thresholds, late-arrival handling and backfill verification steps.",
  },
];

export const DOC_SOURCE_NAME: Record<DocSourceId, string> = Object.fromEntries(
  DOC_SOURCES.map((s) => [s.id, s.name]),
) as Record<DocSourceId, string>;

/** Text rendered into the downloaded file for a mock document. */
export function documentFileContent(doc: ProjectDocument) {
  return [
    `# ${doc.title}`,
    "",
    `Project: ${doc.project}`,
    `Type: ${doc.kind}`,
    `Source: ${DOC_SOURCE_NAME[doc.source]}`,
    `Owner: ${doc.owner}`,
    `Last updated: ${doc.updated}`,
    "",
    doc.body,
    "",
    "— Generated by QualiMetrix (sample document export).",
  ].join("\n");
}

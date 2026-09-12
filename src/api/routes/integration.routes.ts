import { Router } from "express";
import {
  startConnect,
  handleCallback,
  getStatus,
  listAll,
  updateSyncFrequency,
  disconnect,
  triggerSync,
  listProjects,
  listJiraUsers,
  saveJiraSelection,
  saveAzureDevOpsSelection,
  connectOpenAi,
  listKeyMappings,
  upsertKeyMapping,
  deleteKeyMapping,
} from "../controllers/integration.controller";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import {
  attachAnthropicReportingCredential,
  createAnthropicConnection,
  disconnectAnthropicConnection,
  discoverAnthropicReportingCredential,
  getAnthropicDeletionPreview,
  getAnthropicDeploymentReadiness,
  listAnthropicConnections,
  listAnthropicIdentities,
  permanentlyDeleteAnthropicConnection,
  rotateAnthropicTelemetryToken,
  syncAnthropicNow,
} from "../controllers/ai-provider-connection.controller";
import {
  createGcpConnection,
  disconnectGcpConnection,
  listGcpConnections,
  syncGcpNow,
} from "../controllers/gcp-connection.controller";
import {
  createAwsConnection,
  disconnectAwsConnection,
  listAwsConnections,
  syncAwsNow,
} from "../controllers/aws-connection.controller";
import {
  createAzureConnection,
  disconnectAzureConnection,
  listAzureConnections,
  syncAzureNow,
} from "../controllers/azure-connection.controller";
import {
  createKrutrimConnection,
  disconnectKrutrimConnection,
  listKrutrimConnections,
  syncKrutrimNow,
} from "../controllers/krutrim-connection.controller";
import {
  listSpaces as listConfluenceSpaces,
  saveSelection as saveConfluenceSelection,
  listPages as listConfluencePages,
  getPage as getConfluencePage,
  search as searchConfluence,
} from "../controllers/confluence.controller";

const router = Router();

router.get("/", requireAuth, listAll);

// AI provider organizations are multi-connection and PM-owned. Keep these
// explicit routes before the generic /:provider wildcards below.
router.get("/anthropic/connections", requireAdmin, listAnthropicConnections);
router.get("/anthropic/deployment-readiness", requireAdmin, getAnthropicDeploymentReadiness);
router.post("/anthropic/discover", requireAdmin, discoverAnthropicReportingCredential);
router.post("/anthropic/connections", requireAdmin, createAnthropicConnection);
router.get("/anthropic/connections/:id/identities", requireAdmin, listAnthropicIdentities);
router.get(
  "/anthropic/connections/:id/deletion-preview",
  requireAdmin,
  getAnthropicDeletionPreview,
);
router.post(
  "/anthropic/connections/:id/reporting-credential",
  requireAdmin,
  attachAnthropicReportingCredential,
);
router.post(
  "/anthropic/connections/:id/rotate-telemetry-token",
  requireAdmin,
  rotateAnthropicTelemetryToken,
);
router.post("/anthropic/connections/:id/sync", requireAdmin, syncAnthropicNow);
router.post(
  "/anthropic/connections/:id/permanent-delete",
  requireAdmin,
  permanentlyDeleteAnthropicConnection,
);
router.delete("/anthropic/connections/:id", requireAdmin, disconnectAnthropicConnection);

// GCP: one connection backs both Vertex AI/Gemini usage and GPU-compute
// rental cost (same Billing Export/BigQuery source, different SKU filter).
router.get("/gcp/connections", requireAdmin, listGcpConnections);
router.post("/gcp/connections", requireAdmin, createGcpConnection);
router.post("/gcp/connections/:id/sync", requireAdmin, syncGcpNow);
router.delete("/gcp/connections/:id", requireAdmin, disconnectGcpConnection);

// AWS / Azure: GPU-compute rental cost only (no LLM-usage vendor equivalent
// on these two — Vertex AI is GCP-specific).
router.get("/aws/connections", requireAdmin, listAwsConnections);
router.post("/aws/connections", requireAdmin, createAwsConnection);
router.post("/aws/connections/:id/sync", requireAdmin, syncAwsNow);
router.delete("/aws/connections/:id", requireAdmin, disconnectAwsConnection);

router.get("/azure/connections", requireAdmin, listAzureConnections);
router.post("/azure/connections", requireAdmin, createAzureConnection);
router.post("/azure/connections/:id/sync", requireAdmin, syncAzureNow);
router.delete("/azure/connections/:id", requireAdmin, disconnectAzureConnection);

// Krutrim: no scoped API key exists for console/usage data (see
// krutrim-gpu-cost-sync.service.ts) — credential is the account's real
// email+password, used for a headless-browser login on each sync.
router.get("/krutrim/connections", requireAdmin, listKrutrimConnections);
router.post("/krutrim/connections", requireAdmin, createKrutrimConnection);
router.post("/krutrim/connections/:id/sync", requireAdmin, syncKrutrimNow);
router.delete("/krutrim/connections/:id", requireAdmin, disconnectKrutrimConnection);

// Confluence: no /connect or /callback of its own (it rides Jira's OAuth
// grant — see jira-oauth.service.ts's SCOPES comment and handleCallback's
// 'jira' branch), so these are its only provider-specific routes. Registered
// before the generic /:provider wildcards below, same reasoning as the
// pasted-credential routes further down. The generic /confluence/status,
// /confluence/sync, /confluence/sync-frequency and DELETE /confluence
// routes already work unmodified once isKnownProvider includes it.
router.get("/confluence/spaces", requireAdmin, listConfluenceSpaces);
router.put("/confluence/selection", requireAdmin, saveConfluenceSelection);
router.get("/confluence/pages", requireAuth, listConfluencePages);
router.get("/confluence/pages/:id", requireAuth, getConfluencePage);
router.get("/confluence/search", requireAuth, searchConfluence);

// Deliberate exception to admin-gating: reached via browser redirect from the
// provider, no custom headers (or cookies from a different origin) survive
// the trip. See handleCallback's docstring — it self-authenticates via the
// signed OAuth `state` instead.
router.get("/:provider/callback", handleCallback);

// Pasted-credential connect (OpenAI/Vertex — no OAuth redirect). Registered
// before the /:provider/connect wildcard below, or Express would route
// POST /openai/connect to startConnect instead (which now correctly rejects
// non-OAuth providers, but never falls through to this route — Express
// doesn't retry the next match after a handler responds).
router.post("/openai/connect", requireAdmin, connectOpenAi);
router.get("/:provider/key-mappings", requireAdmin, listKeyMappings);
router.post("/:provider/key-mappings", requireAdmin, upsertKeyMapping);
router.delete("/key-mappings/:id", requireAdmin, deleteKeyMapping);

// Raw OAuth credentials are PM-only — a PO's delegation only ever reaches
// Product.jiraProjectKey/azureDevopsAreaPath (see membership.routes.ts), never
// the tenant-wide Integration record itself. status/projects fall under that
// same record (externalMetadata, scopes, a live call using the stored token)
// and were previously left at requireAuth — every actual frontend consumer
// (integrations.tsx, settings.tsx) is already PM-gated, so this closes the
// gap rather than changing any real behavior.
router.post("/:provider/connect", requireAdmin, startConnect);
router.get("/:provider/status", requireAdmin, getStatus);
router.get("/:provider/projects", requireAdmin, listProjects);
router.get("/jira/users", requireAdmin, listJiraUsers);
router.put("/jira/selection", requireAdmin, saveJiraSelection);
router.put("/azure_devops/selection", requireAdmin, saveAzureDevOpsSelection);
router.put("/:provider/sync-frequency", requireAdmin, updateSyncFrequency);
router.post("/:provider/sync", requireAdmin, triggerSync);
router.delete("/:provider", requireAdmin, disconnect);

export default router;

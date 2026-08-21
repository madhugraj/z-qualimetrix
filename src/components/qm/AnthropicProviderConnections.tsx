import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";

interface AnthropicConnection {
  id: string;
  organizationName: string;
  externalAccountId: string;
  domain: string | null;
  acquisitionChannel: string;
  planType: string;
  collectionMode: string;
  status: string;
  credentialLabel: string | null;
  lastValidatedAt: string | null;
  lastTelemetryAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  isActive: boolean;
  identityCount?: number;
  mappedIdentityCount?: number;
  capabilities: { managedOtel?: boolean; apiAdapter?: string | null; costAuthority?: string };
  verification?: {
    overall: "verified" | "partially_verified" | "awaiting_deployment" | "registered_unverified";
    api: "verified" | "unverified" | "not_configured";
    telemetry: "verified" | "awaiting_deployment" | "not_configured";
  };
}

type MonitoringIntent = "analytics" | "realtime" | "complete";
type CredentialSource = "enterprise_analytics" | "console_admin";

interface CredentialDiscovery {
  credentialSource: CredentialSource;
  keyType: string;
  organization: { id: string; name: string | null };
  capabilities: {
    historicalAnalytics: boolean;
    dailyUserActivity: boolean;
    productivityMetrics: boolean;
    tokenUsage: boolean;
    costAuthority: string;
    realtimeEvents: boolean;
  };
}

interface DeploymentReadiness {
  baseUrl: string;
  enterpriseReady: boolean;
  mode: "enterprise" | "local_test" | "configuration_required";
  source: "configured" | "request";
  message: string;
}

interface ManagedTelemetryDeployment extends DeploymentReadiness {
  schemaVersion: 1;
  generatedAt: string;
  managedSettings: { env: Record<string, string> };
}

interface DeploymentArtifact {
  connection: AnthropicConnection;
  deployment: ManagedTelemetryDeployment;
}

interface DeletionPreview {
  connectionId: string;
  organizationName: string;
  externalAccountId: string;
  legalHold: boolean;
  confirmationPhrase: string;
  recordCounts: {
    connections: number;
    identities: number;
    rawEvents: number;
    dailyActivities: number;
    usageEvents: number;
    totalCollectedRecords: number;
  };
  consequences: string[];
}

const CHANNELS = [
  ["anthropic_direct", "Anthropic direct (claude.ai)"],
  ["anthropic_console", "Anthropic Console / Claude API"],
  ["aws_bedrock", "Amazon Bedrock"],
  ["google_vertex", "Google Vertex AI"],
  ["microsoft_foundry", "Microsoft Foundry"],
  ["gateway", "Enterprise AI gateway"],
] as const;

const PLANS = [
  ["team", "Team"],
  ["enterprise", "Enterprise"],
  ["console_api", "Console API organization"],
  ["custom", "Custom / cloud contract"],
] as const;

const MONITORING_CHOICES: ReadonlyArray<{
  value: MonitoringIntent;
  label: string;
  description: string;
}> = [
  {
    value: "complete",
    label: "Complete monitoring",
    description: "Daily and historical reports plus near-real-time Claude Code activity.",
  },
  {
    value: "analytics",
    label: "Daily and historical reports",
    description: "Provider reporting API for user activity, productivity, tokens, and cost.",
  },
  {
    value: "realtime",
    label: "Near-real-time monitoring",
    description: "Organization-managed telemetry for activity after deployment.",
  },
] as const;

const CREDENTIAL_SOURCES = [
  ["enterprise_analytics", "Claude Enterprise Analytics key"],
  ["console_admin", "Anthropic Console Admin key"],
] as const;

function defaultPlan(channel: string): string {
  if (channel === "anthropic_direct") return "team";
  if (channel === "anthropic_console") return "console_api";
  return "custom";
}

function reportingCredentialSource(channel: string, planType: string): CredentialSource | null {
  if (channel === "anthropic_direct" && planType === "enterprise") return "enterprise_analytics";
  if (
    (channel === "anthropic_direct" && planType === "team") ||
    (channel === "anthropic_console" && planType === "console_api")
  )
    return "console_admin";
  return null;
}

function collectionModeFor(
  monitoringIntent: MonitoringIntent,
  credentialSource: CredentialSource,
): string {
  if (monitoringIntent === "realtime") return "managed_otel";
  if (monitoringIntent === "complete") return "hybrid";
  return credentialSource === "enterprise_analytics" ? "enterprise_analytics" : "console_analytics";
}

function credentialHelp(source: CredentialSource) {
  return source === "enterprise_analytics"
    ? {
        label: "Open Anthropic Analytics API guide",
        href: "https://platform.claude.com/docs/en/manage-claude/analytics-api",
        instruction:
          "A Claude Primary Owner creates an Analytics API key with read:analytics access in Claude.ai organization settings.",
      }
    : {
        label: "Open Anthropic Admin keys",
        href: "https://platform.claude.com/settings/admin-keys",
        instruction:
          "A Claude Console organization administrator creates an Admin API key. QualiMetrix will test whether it can read Claude Code analytics.",
      };
}

function verificationLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function AnthropicProviderConnections() {
  const [connections, setConnections] = useState<AnthropicConnection[]>([]);
  const [readiness, setReadiness] = useState<DeploymentReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deploymentArtifact, setDeploymentArtifact] = useState<DeploymentArtifact | null>(null);
  const [deploymentPath, setDeploymentPath] = useState<"claude_admin" | "it_handoff">(
    "claude_admin",
  );
  const [copied, setCopied] = useState(false);
  const [handoffCopied, setHandoffCopied] = useState(false);
  const [validatingCredential, setValidatingCredential] = useState(false);
  const [credentialDiscovery, setCredentialDiscovery] = useState<CredentialDiscovery | null>(null);
  const [credentialValidationError, setCredentialValidationError] = useState<string | null>(null);
  const [credentialEditorId, setCredentialEditorId] = useState<string | null>(null);
  const [existingCredentialSource, setExistingCredentialSource] =
    useState<CredentialSource>("console_admin");
  const [existingApiKey, setExistingApiKey] = useState("");
  const [dataManagementTarget, setDataManagementTarget] = useState<AnthropicConnection | null>(
    null,
  );
  const [deletionPreview, setDeletionPreview] = useState<DeletionPreview | null>(null);
  const [loadingDeletionPreview, setLoadingDeletionPreview] = useState(false);
  const [permanentlyDeleting, setPermanentlyDeleting] = useState(false);
  const [disconnectAcknowledged, setDisconnectAcknowledged] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [deletionPassword, setDeletionPassword] = useState("");
  const [form, setForm] = useState({
    organizationName: "",
    externalAccountId: "",
    domain: "",
    acquisitionChannel: "anthropic_direct",
    planType: "team",
    monitoringIntent: "realtime" as MonitoringIntent,
    credentialSource: "console_admin" as CredentialSource,
    apiKey: "",
  });

  const load = useCallback(async () => {
    try {
      const [connectionsResponse, readinessResponse] = await Promise.all([
        apiFetch("/integrations/anthropic/connections"),
        apiFetch("/integrations/anthropic/deployment-readiness"),
      ]);
      const connectionsBody = await connectionsResponse.json();
      const readinessBody = await readinessResponse.json();
      if (!connectionsResponse.ok || !connectionsBody.success)
        throw new Error(connectionsBody.error ?? "Failed to load Claude connections");
      if (!readinessResponse.ok || !readinessBody.success)
        throw new Error(readinessBody.error ?? "Failed to check telemetry deployment readiness");
      setConnections(connectionsBody.data);
      setReadiness(readinessBody.data);
    } catch (error) {
      toast.error("Could not load Claude connections", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const needsApiKey = form.monitoringIntent !== "realtime";
  const supportedCredentialSource = reportingCredentialSource(
    form.acquisitionChannel,
    form.planType,
  );
  const reportingApiSupported = supportedCredentialSource !== null;

  function updateOrganizationId(value: string) {
    setCredentialDiscovery(null);
    setCredentialValidationError(null);
    setForm((current) => ({ ...current, externalAccountId: value }));
  }

  function updateApiKey(value: string) {
    setCredentialDiscovery(null);
    setCredentialValidationError(null);
    setForm((current) => ({ ...current, apiKey: value }));
  }

  function updateCredentialSource(value: CredentialSource) {
    setCredentialDiscovery(null);
    setCredentialValidationError(null);
    setForm((current) => ({ ...current, credentialSource: value }));
  }

  function updateChannel(value: string) {
    const nextPlan = defaultPlan(value);
    const nextSource = reportingCredentialSource(value, nextPlan);
    setCredentialDiscovery(null);
    setCredentialValidationError(null);
    setForm((current) => ({
      ...current,
      acquisitionChannel: value,
      planType: nextPlan,
      monitoringIntent: nextSource ? current.monitoringIntent : "realtime",
      credentialSource: nextSource ?? "console_admin",
      apiKey: "",
    }));
  }

  function updatePlan(value: string) {
    const nextSource = reportingCredentialSource(form.acquisitionChannel, value);
    setCredentialDiscovery(null);
    setCredentialValidationError(null);
    setForm((current) => ({
      ...current,
      planType: value,
      monitoringIntent: nextSource ? current.monitoringIntent : "realtime",
      credentialSource: nextSource ?? "console_admin",
      apiKey: "",
    }));
  }

  async function validateReportingCredential() {
    if (!form.apiKey.trim()) {
      toast.error("Reporting API key is required");
      return;
    }
    if (!reportingApiSupported || supportedCredentialSource !== form.credentialSource) {
      toast.error("This key type does not match the selected purchase channel and plan");
      return;
    }
    setValidatingCredential(true);
    setCredentialDiscovery(null);
    setCredentialValidationError(null);
    try {
      const response = await apiFetch("/integrations/anthropic/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialSource: form.credentialSource,
          apiKey: form.apiKey,
          externalAccountId: form.externalAccountId.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "Reporting credential validation failed");
      setCredentialDiscovery(body.data);
      setCredentialValidationError(null);
      setForm((current) => ({
        ...current,
        externalAccountId: body.data.organization.id,
        organizationName:
          current.organizationName || body.data.organization.name || "Claude organization",
      }));
      toast.success("Anthropic reporting access verified", {
        description: `Key belongs to organization ${body.data.organization.id}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Anthropic validation failed";
      setCredentialValidationError(message);
      toast.error("Anthropic could not verify this reporting key", {
        description: message,
      });
    } finally {
      setValidatingCredential(false);
    }
  }

  async function createConnection(event: React.FormEvent) {
    event.preventDefault();
    if (needsApiKey && !credentialDiscovery) {
      toast.error("Validate the reporting key before connecting the organization");
      return;
    }
    setSaving(true);
    try {
      const collectionMode = collectionModeFor(form.monitoringIntent, form.credentialSource);
      const response = await apiFetch("/integrations/anthropic/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: form.organizationName,
          externalAccountId: form.externalAccountId,
          domain: form.domain,
          acquisitionChannel: form.acquisitionChannel,
          planType: form.planType,
          collectionMode,
          apiKey: needsApiKey ? form.apiKey : "",
        }),
      });
      const body = await response.json();
      if (response.status === 409) {
        toast.error("Organization already registered", {
          description:
            "Use the existing organization below to add reporting access or deploy monitoring.",
        });
        await load();
        return;
      }
      if (!response.ok || !body.success) throw new Error(body.error ?? "Connection failed");
      setDeploymentArtifact(
        body.data.deployment
          ? { connection: body.data.connection, deployment: body.data.deployment }
          : null,
      );
      setForm((current) => ({
        ...current,
        organizationName: "",
        externalAccountId: "",
        domain: "",
        apiKey: "",
      }));
      setCredentialDiscovery(null);
      setCredentialValidationError(null);
      toast.success(
        body.data.deployment
          ? "Connection created — choose a deployment path below"
          : "Claude organization connected",
      );
      await load();
    } catch (error) {
      toast.error("Claude connection failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  function openCredentialEditor(connection: AnthropicConnection) {
    const source = reportingCredentialSource(connection.acquisitionChannel, connection.planType);
    if (!source) {
      toast.error("Provider reporting is not yet available for this purchase channel", {
        description: "Live Claude Code telemetry can still be collected for this organization.",
      });
      return;
    }
    setCredentialEditorId(connection.id);
    setExistingCredentialSource(source);
    setExistingApiKey("");
  }

  async function attachReportingCredential(connection: AnthropicConnection) {
    if (!existingApiKey.trim()) {
      toast.error("Reporting API key is required");
      return;
    }
    setBusyId(connection.id);
    try {
      const response = await apiFetch(
        `/integrations/anthropic/connections/${connection.id}/reporting-credential`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credentialSource: existingCredentialSource,
            apiKey: existingApiKey,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "Reporting credential connection failed");
      toast.success("Reporting API verified and connected", {
        description: `Anthropic confirmed organization ${body.data.discovery.organization.id}. Initial synchronization has started.`,
      });
      setCredentialEditorId(null);
      setExistingApiKey("");
      await load();
    } catch (error) {
      toast.error("Anthropic could not connect this reporting key", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  }

  function closeDataManagement() {
    if (permanentlyDeleting) return;
    setDataManagementTarget(null);
    setDeletionPreview(null);
    setDisconnectAcknowledged(false);
    setDeletionReason("");
    setDeletionConfirmation("");
    setDeletionPassword("");
  }

  async function openDataManagement(connection: AnthropicConnection) {
    setDataManagementTarget(connection);
    setDeletionPreview(null);
    setDisconnectAcknowledged(false);
    setDeletionReason("");
    setDeletionConfirmation("");
    setDeletionPassword("");
    setLoadingDeletionPreview(true);
    try {
      const response = await apiFetch(
        `/integrations/anthropic/connections/${connection.id}/deletion-preview`,
      );
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "Could not calculate deletion impact");
      setDeletionPreview(body.data);
    } catch (error) {
      toast.error("Could not load data-management options", {
        description: error instanceof Error ? error.message : undefined,
      });
      setDataManagementTarget(null);
    } finally {
      setLoadingDeletionPreview(false);
    }
  }

  async function permanentlyDeleteConnection() {
    if (!dataManagementTarget || !deletionPreview) return;
    setPermanentlyDeleting(true);
    try {
      const response = await apiFetch(
        `/integrations/anthropic/connections/${dataManagementTarget.id}/permanent-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: deletionReason,
            confirmation: deletionConfirmation,
            password: deletionPassword,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error ?? "Permanent deletion failed");
      toast.success("Claude organization data permanently deleted", {
        description: `Deletion receipt ${body.data.deletionReceiptId} · ${body.data.recordCounts.totalCollectedRecords} collected records removed.`,
      });
      setDataManagementTarget(null);
      setDeletionPreview(null);
      setDeletionReason("");
      setDeletionConfirmation("");
      setDeletionPassword("");
      await load();
    } catch (error) {
      toast.error("Permanent deletion failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPermanentlyDeleting(false);
    }
  }

  async function connectionAction(
    id: string,
    action: "sync" | "rotate" | "delete",
  ): Promise<boolean> {
    setBusyId(id);
    try {
      const path =
        action === "rotate"
          ? `/integrations/anthropic/connections/${id}/rotate-telemetry-token`
          : `/integrations/anthropic/connections/${id}${action === "sync" ? "/sync" : ""}`;
      const response = await apiFetch(path, { method: action === "delete" ? "DELETE" : "POST" });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error ?? `${action} failed`);
      if (body.data?.deployment) {
        const connection =
          body.data.connection ?? connections.find((candidate) => candidate.id === id);
        if (connection) setDeploymentArtifact({ connection, deployment: body.data.deployment });
      }
      toast.success(
        action === "sync"
          ? "Sync started"
          : action === "rotate"
            ? "Telemetry token rotated — redeploy the settings"
            : "Connection disconnected",
      );
      await load();
      return true;
    } catch (error) {
      toast.error(`Claude ${action} failed`, {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function copySettings() {
    if (!deploymentArtifact) return;
    await navigator.clipboard.writeText(
      JSON.stringify(deploymentArtifact.deployment.managedSettings, null, 2),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadManagedSettings() {
    if (!deploymentArtifact || !deploymentArtifact.deployment.enterpriseReady) return;
    const contents = JSON.stringify(deploymentArtifact.deployment.managedSettings, null, 2);
    const blob = new Blob([contents], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeOrganization = deploymentArtifact.connection.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    link.href = objectUrl;
    link.download = `qualimetrix-claude-${safeOrganization || "organization"}-managed-settings.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  async function copyHandoffInstructions() {
    if (!deploymentArtifact) return;
    const { connection, deployment } = deploymentArtifact;
    const message = [
      `Claude Code telemetry deployment for ${connection.organizationName}`,
      `QualiMetrix connection: ${connection.id}`,
      `Telemetry endpoint: ${deployment.baseUrl}`,
      "",
      "The attached managed-settings.json contains a one-time ingestion credential.",
      "Transfer and store it only through the organization's approved secret-sharing channel.",
      "",
      "Deployment options:",
      "1. Claude Admin: Admin Settings > Claude Code > Managed settings, then paste the JSON and save.",
      "2. Endpoint management: deploy as managed-settings.json through MDM/OS policy.",
      "",
      "Do not ask individual developers to edit their settings.",
      "Verification: run Claude Code and confirm the QualiMetrix connection changes from awaiting telemetry to connected.",
    ].join("\n");
    await navigator.clipboard.writeText(message);
    setHandoffCopied(true);
    setTimeout(() => setHandoffCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      <GlassPanel
        title="Claude Code organizations"
        subtitle="PM-managed organization connections; developers do not register QualiMetrix monitoring"
      >
        {readiness && (
          <div
            className={`mb-4 rounded-xl border p-3 ${
              readiness.enterpriseReady
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-amber-500/30 bg-amber-500/5"
            }`}
          >
            <div className="flex items-start gap-2">
              {readiness.enterpriseReady ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {readiness.enterpriseReady
                    ? "Enterprise telemetry endpoint ready"
                    : readiness.mode === "local_test"
                      ? "Local test endpoint only"
                      : "Enterprise telemetry endpoint requires configuration"}
                </p>
                <p className="mt-0.5 break-all text-[11px] text-muted-foreground">
                  {readiness.baseUrl}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{readiness.message}</p>
              </div>
            </div>
          </div>
        )}
        <form onSubmit={createConnection} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="anthropic-org-name">Organization name</Label>
            <Input
              id="anthropic-org-name"
              value={form.organizationName}
              onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
              placeholder="XYZ.ai Engineering"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="anthropic-org-id">
              Provider organization/account ID {needsApiKey ? "(optional)" : ""}
            </Label>
            <Input
              id="anthropic-org-id"
              value={form.externalAccountId}
              onChange={(e) => updateOrganizationId(e.target.value)}
              placeholder="Anthropic org UUID or cloud account/project ID"
              required={!needsApiKey}
            />
            {needsApiKey && (
              <p className="text-[11px] text-muted-foreground">
                Leave this blank if you do not know it. QualiMetrix will discover it from the
                verified reporting key.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="anthropic-domain">Employee domain (optional)</Label>
            <Input
              id="anthropic-domain"
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              placeholder="xyz.ai"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="anthropic-channel">Purchased through</Label>
            <select
              id="anthropic-channel"
              value={form.acquisitionChannel}
              onChange={(e) => updateChannel(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {CHANNELS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {form.acquisitionChannel === "anthropic_direct" && form.planType === "team" && (
            <div className="space-y-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 md:col-span-2">
              <div>
                <p className="text-xs font-medium">
                  Claude Team: choose the access you actually have
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A Team subscription does not automatically guarantee an Admin API key. If your
                  organization can create one in Claude Console, QualiMetrix can test it and import
                  daily aggregated reports. Otherwise, use server-managed live monitoring from
                  Claude.ai—developers take no action.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.monitoringIntent === "complete" ? "default" : "outline"}
                  onClick={() => {
                    setCredentialDiscovery(null);
                    setCredentialValidationError(null);
                    setForm((current) => ({ ...current, monitoringIntent: "complete" }));
                  }}
                >
                  I can access Admin keys
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.monitoringIntent === "realtime" ? "default" : "outline"}
                  onClick={() => {
                    setCredentialDiscovery(null);
                    setCredentialValidationError(null);
                    setForm((current) => ({
                      ...current,
                      monitoringIntent: "realtime",
                      apiKey: "",
                    }));
                  }}
                >
                  I do not see Admin keys
                </Button>
                <Button type="button" size="sm" variant="ghost" asChild className="gap-1.5">
                  <a
                    href="https://claude.ai/analytics/claude-code"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Team analytics / CSV export
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="anthropic-plan">Plan / account type</Label>
            <select
              id="anthropic-plan"
              value={form.planType}
              onChange={(e) => updatePlan(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {PLANS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>What should QualiMetrix monitor?</Label>
            <div className="grid gap-2 md:grid-cols-3">
              {MONITORING_CHOICES.map((choice) => {
                const disabled = choice.value !== "realtime" && !reportingApiSupported;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setCredentialDiscovery(null);
                      setForm((current) => ({ ...current, monitoringIntent: choice.value }));
                    }}
                    className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      form.monitoringIntent === choice.value
                        ? "border-primary bg-primary/5"
                        : "border-glass-border hover:bg-white/5"
                    }`}
                  >
                    <p className="text-xs font-medium">{choice.label}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {disabled
                        ? "The cloud-provider billing connector will be added separately."
                        : choice.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          {needsApiKey && (
            <div className="space-y-3 rounded-xl border border-glass-border p-3 md:col-span-2">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="anthropic-credential-source">Reporting key type</Label>
                  <select
                    id="anthropic-credential-source"
                    value={form.credentialSource}
                    onChange={(e) => updateCredentialSource(e.target.value as CredentialSource)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    {CREDENTIAL_SOURCES.filter(
                      ([value]) =>
                        !supportedCredentialSource || value === supportedCredentialSource,
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="anthropic-api-key">Reporting API key</Label>
                  <Input
                    id="anthropic-api-key"
                    type="password"
                    autoComplete="off"
                    value={form.apiKey}
                    onChange={(e) => updateApiKey(e.target.value)}
                    placeholder="Paste the key supplied by Anthropic"
                    required
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {credentialHelp(form.credentialSource).instruction} The key is sent only to the
                QualiMetrix backend. QualiMetrix discovers the organization, verifies analytics
                access, and encrypts the key only when you connect it.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={validateReportingCredential}
                  disabled={validatingCredential || !form.apiKey}
                  className="gap-1.5"
                >
                  {validatingCredential ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Validate reporting key
                </Button>
                <Button type="button" size="sm" variant="ghost" asChild className="gap-1.5">
                  <a
                    href={credentialHelp(form.credentialSource).href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {credentialHelp(form.credentialSource).label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
              {credentialDiscovery && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                  <p className="flex items-center gap-1.5 font-medium text-emerald-600">
                    <Check className="h-4 w-4" /> Anthropic organization verified
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {credentialDiscovery.organization.name || "Anthropic organization"} ·{" "}
                    {credentialDiscovery.organization.id} · {credentialDiscovery.keyType}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Access confirmed: daily activity, productivity, token usage, and cost data.
                  </p>
                </div>
              )}
              {credentialValidationError && (
                <div className="rounded-lg border border-critical/30 bg-critical/5 p-3 text-xs">
                  <p className="font-medium text-critical">Reporting API access was not verified</p>
                  <p className="mt-1 text-muted-foreground">{credentialValidationError}</p>
                  {form.acquisitionChannel === "anthropic_direct" && form.planType === "team" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => {
                        setCredentialDiscovery(null);
                        setCredentialValidationError(null);
                        setForm((current) => ({
                          ...current,
                          monitoringIntent: "realtime",
                          apiKey: "",
                        }));
                      }}
                    >
                      Continue with managed live monitoring
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="md:col-span-2">
            <Button
              type="submit"
              size="sm"
              disabled={saving || (needsApiKey && !credentialDiscovery)}
              className="gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {readiness?.mode === "local_test" &&
              ["realtime", "complete"].includes(form.monitoringIntent)
                ? "Create local test connection"
                : "Connect organization"}
            </Button>
            {needsApiKey && !credentialDiscovery && (
              <span className="ml-2 text-[11px] text-muted-foreground">
                Validate the reporting key first.
              </span>
            )}
          </div>
        </form>
      </GlassPanel>

      {deploymentArtifact && (
        <GlassPanel
          title="Deploy Claude monitoring"
          subtitle="Choose who will deploy the one-time organization configuration; developers take no action"
        >
          <div className="space-y-4">
            {!deploymentArtifact.deployment.enterpriseReady && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <p className="font-medium text-amber-600">Organization deployment is blocked</p>
                <p className="mt-1 text-muted-foreground">
                  {deploymentArtifact.deployment.message} Configure
                  <code className="mx-1 rounded bg-black/10 px-1">QUALIMETRIX_PUBLIC_API_URL</code>
                  and rotate the telemetry token to generate a deployable package.
                </p>
              </div>
            )}

            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setDeploymentPath("claude_admin")}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  deploymentPath === "claude_admin"
                    ? "border-primary bg-primary/5"
                    : "border-glass-border hover:bg-white/5"
                }`}
              >
                <p className="text-sm font-medium">I am also a Claude Admin</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Copy and publish through Claude.ai. No terminal or developer action.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDeploymentPath("it_handoff")}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  deploymentPath === "it_handoff"
                    ? "border-primary bg-primary/5"
                    : "border-glass-border hover:bg-white/5"
                }`}
              >
                <p className="text-sm font-medium">Send to Claude Admin / IT</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Download the one-time file and hand it off through an approved secure channel.
                </p>
              </button>
            </div>

            {deploymentPath === "claude_admin" ? (
              <div className="rounded-xl border border-glass-border p-4">
                <ol className="list-decimal space-y-2 pl-4 text-xs text-muted-foreground">
                  <li>Sign in to the organization on Claude.ai as an Admin or Owner.</li>
                  <li>Open Admin Settings → Claude Code → Managed settings.</li>
                  <li>Copy the configuration below, paste it there, and save.</li>
                  <li>Run Claude Code once and wait for QualiMetrix to verify telemetry.</li>
                </ol>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!deploymentArtifact.deployment.enterpriseReady}
                    onClick={copySettings}
                    className="gap-1.5"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy managed settings"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" asChild className="gap-1.5">
                    <a href="https://claude.ai" target="_blank" rel="noreferrer">
                      Open Claude.ai <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-glass-border p-4">
                <p className="text-xs text-muted-foreground">
                  The downloaded file contains an ingestion credential. Do not attach it to email,
                  chat, or a normal service-desk ticket. Use your approved enterprise secret-sharing
                  mechanism.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!deploymentArtifact.deployment.enterpriseReady}
                    onClick={downloadManagedSettings}
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" /> Download managed-settings.json
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={copyHandoffInstructions}
                    className="gap-1.5"
                  >
                    {handoffCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {handoffCopied ? "Copied" : "Copy handoff instructions"}
                  </Button>
                </div>
                <div className="mt-3 text-[11px] text-muted-foreground">
                  Supported endpoint-managed locations: macOS managed preferences or
                  <code className="mx-1 rounded bg-black/10 px-1">
                    /Library/Application Support/ClaudeCode/
                  </code>
                  ; Linux/WSL
                  <code className="mx-1 rounded bg-black/10 px-1">/etc/claude-code/</code>; Windows
                  HKLM policy or
                  <code className="ml-1 rounded bg-black/10 px-1">
                    C:\Program Files\ClaudeCode\
                  </code>
                  .
                </div>
              </div>
            )}

            {!deploymentArtifact.deployment.enterpriseReady && (
              <details className="rounded-xl border border-glass-border p-3">
                <summary className="cursor-pointer text-xs font-medium">
                  Local same-computer test settings
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-glass-border bg-black/20 p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(deploymentArtifact.deployment.managedSettings, null, 2)}
                </pre>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={copySettings}
                  className="mt-3 gap-1.5"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy local test settings"}
                </Button>
              </details>
            )}

            <p className="text-[11px] text-muted-foreground">
              Generated {new Date(deploymentArtifact.deployment.generatedAt).toLocaleString()} · The
              credential is stored only as a hash by QualiMetrix and will not be shown again after
              this page is refreshed.
            </p>
          </div>
        </GlassPanel>
      )}

      <GlassPanel
        title="Registered organizations"
        subtitle="Active and disconnected organizations remain visible until an authorized PM permanently deletes them"
      >
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : connections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-glass-border p-4 text-center text-xs text-muted-foreground">
            No Claude organization is registered.
          </p>
        ) : (
          <ul className="space-y-3">
            {connections.map((connection) => {
              const overallVerification =
                connection.verification?.overall ??
                (connection.lastTelemetryAt || connection.lastValidatedAt
                  ? "partially_verified"
                  : "registered_unverified");
              const connectionCredentialSource = reportingCredentialSource(
                connection.acquisitionChannel,
                connection.planType,
              );
              const editingCredential = credentialEditorId === connection.id;
              return (
                <li key={connection.id} className="rounded-xl border border-glass-border/70 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{connection.organizationName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {connection.externalAccountId} · {connection.acquisitionChannel} ·{" "}
                        {connection.planType}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        overallVerification === "verified"
                          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
                          : "border-amber-500/30 bg-amber-500/5 text-amber-600"
                      }`}
                    >
                      {connection.isActive
                        ? verificationLabel(overallVerification)
                        : "disconnected · history retained"}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground md:grid-cols-3">
                    <span>
                      Reporting API:{" "}
                      {connection.isActive
                        ? verificationLabel(connection.verification?.api ?? "not_configured")
                        : "disabled · credential removed"}
                      {connection.isActive && connection.credentialLabel
                        ? ` · ${connection.credentialLabel}`
                        : ""}
                    </span>
                    <span>
                      Live telemetry:{" "}
                      {connection.isActive
                        ? verificationLabel(connection.verification?.telemetry ?? "not_configured")
                        : "disabled · token invalidated"}
                    </span>
                    <span>
                      Observed people: {connection.identityCount ?? 0} (
                      {connection.mappedIdentityCount ?? 0} mapped)
                    </span>
                    <span>Last API sync: {formatTime(connection.lastSyncedAt)}</span>
                    <span>Last live event: {formatTime(connection.lastTelemetryAt)}</span>
                    <span>API key checked: {formatTime(connection.lastValidatedAt)}</span>
                  </div>

                  {connection.isActive &&
                    !connection.capabilities.apiAdapter &&
                    connectionCredentialSource && (
                      <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                        <p className="font-medium">
                          Organization registered; provider reports are not connected
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Add a reporting key to import daily user activity, productivity, token,
                          and cost records.
                        </p>
                      </div>
                    )}
                  {connection.isActive &&
                    connection.capabilities.managedOtel &&
                    !connection.lastTelemetryAt && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        No live event has arrived. Generate and publish the organization deployment
                        package to verify live monitoring.
                      </p>
                    )}
                  {connection.lastSyncError && (
                    <p className="mt-2 text-xs text-critical">{connection.lastSyncError}</p>
                  )}

                  {connection.isActive && editingCredential && connectionCredentialSource && (
                    <div className="mt-3 space-y-3 rounded-xl border border-glass-border p-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`existing-credential-source-${connection.id}`}>
                            Reporting key type
                          </Label>
                          <select
                            id={`existing-credential-source-${connection.id}`}
                            value={existingCredentialSource}
                            onChange={(event) =>
                              setExistingCredentialSource(event.target.value as CredentialSource)
                            }
                            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                          >
                            {CREDENTIAL_SOURCES.filter(
                              ([value]) => value === connectionCredentialSource,
                            ).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`existing-api-key-${connection.id}`}>
                            Reporting API key
                          </Label>
                          <Input
                            id={`existing-api-key-${connection.id}`}
                            type="password"
                            autoComplete="off"
                            value={existingApiKey}
                            onChange={(event) => setExistingApiKey(event.target.value)}
                            placeholder="Paste the key supplied by Anthropic"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {credentialHelp(existingCredentialSource).instruction} Validation must prove
                        access to organization {connection.externalAccountId}; otherwise nothing is
                        saved.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!existingApiKey || busyId === connection.id}
                          onClick={() => attachReportingCredential(connection)}
                          className="gap-1.5"
                        >
                          {busyId === connection.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                          Validate and connect reporting key
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          asChild
                          className="gap-1.5"
                        >
                          <a
                            href={credentialHelp(existingCredentialSource).href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {credentialHelp(existingCredentialSource).label}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCredentialEditorId(null);
                            setExistingApiKey("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {connection.isActive && connectionCredentialSource && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === connection.id}
                        onClick={() => openCredentialEditor(connection)}
                        className="gap-1.5"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {connection.capabilities.apiAdapter
                          ? "Replace reporting key"
                          : "Add reporting access"}
                      </Button>
                    )}
                    {connection.isActive && connection.capabilities.apiAdapter && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === connection.id}
                        onClick={() => connectionAction(connection.id, "sync")}
                        className="gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Sync now
                      </Button>
                    )}
                    {connection.isActive && connection.capabilities.managedOtel && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === connection.id}
                        onClick={() => connectionAction(connection.id, "rotate")}
                        className="gap-1.5"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                        {connection.lastTelemetryAt
                          ? "Rotate telemetry token"
                          : "Generate deployment package"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === connection.id}
                      onClick={() => openDataManagement(connection)}
                      className="gap-1.5 text-critical hover:text-critical"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Manage connection & data
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassPanel>

      <Dialog
        open={Boolean(dataManagementTarget)}
        onOpenChange={(open) => {
          if (!open) closeDataManagement();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Claude organization data</DialogTitle>
            <DialogDescription>
              Choose whether to stop future collection while retaining history, or permanently erase
              this organization and all collected QualiMetrix records.
            </DialogDescription>
          </DialogHeader>

          {loadingDeletionPreview || !deletionPreview ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-glass-border p-3">
                <p className="text-sm font-medium">{deletionPreview.organizationName}</p>
                <p className="mt-1 break-all text-[11px] text-muted-foreground">
                  {deletionPreview.externalAccountId}
                </p>
              </div>

              {dataManagementTarget?.isActive ? (
                <section className="space-y-3 rounded-xl border border-glass-border p-4">
                  <div>
                    <p className="text-sm font-medium">Stop collection and retain history</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Disables API synchronization and invalidates the QualiMetrix telemetry token.
                      Existing usage, identity, activity, and cost records remain available under
                      your retention policy. You can permanently erase them later.
                    </p>
                  </div>
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={disconnectAcknowledged}
                      onChange={(event) => setDisconnectAcknowledged(event.target.checked)}
                    />
                    <span>I understand that disconnecting does not delete collected history.</span>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!disconnectAcknowledged || busyId === dataManagementTarget.id}
                    onClick={async () => {
                      if (await connectionAction(dataManagementTarget.id, "delete")) {
                        closeDataManagement();
                      }
                    }}
                  >
                    {busyId === dataManagementTarget.id && (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    )}
                    Stop collection and retain history
                  </Button>
                </section>
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                  Collection is already stopped. The records below are retained until you
                  permanently delete them.
                </div>
              )}

              <section className="space-y-4 rounded-xl border border-critical/30 bg-critical/5 p-4">
                <div>
                  <p className="text-sm font-medium text-critical">Permanently delete all data</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This cannot be undone. QualiMetrix keeps only a non-identifying deletion receipt
                    with the requester, reason, timestamp, and record counts.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {[
                    ["Observed identities", deletionPreview.recordCounts.identities],
                    ["Raw provider events", deletionPreview.recordCounts.rawEvents],
                    ["Daily activity rows", deletionPreview.recordCounts.dailyActivities],
                    ["Normalized usage rows", deletionPreview.recordCounts.usageEvents],
                    ["Total collected records", deletionPreview.recordCounts.totalCollectedRecords],
                  ].map(([label, count]) => (
                    <div key={String(label)} className="rounded-lg border border-glass-border p-2">
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="mt-1 text-sm font-medium">{count}</p>
                    </div>
                  ))}
                </div>

                {deletionPreview.legalHold ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                    This organization is under legal hold. Permanent deletion is blocked until the
                    authorized governance process removes the hold.
                  </div>
                ) : (
                  <>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                      {deletionPreview.consequences.map((consequence) => (
                        <li key={consequence}>{consequence}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      QualiMetrix cannot revoke a provider-issued Admin or Analytics key. Revoke it
                      separately in Anthropic after deletion.
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="anthropic-deletion-reason">Business reason</Label>
                      <Textarea
                        id="anthropic-deletion-reason"
                        value={deletionReason}
                        maxLength={500}
                        onChange={(event) => setDeletionReason(event.target.value)}
                        placeholder="Minimum 10 characters. Do not include employee or customer data."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="anthropic-deletion-password">Your QualiMetrix password</Label>
                      <Input
                        id="anthropic-deletion-password"
                        type="password"
                        autoComplete="current-password"
                        value={deletionPassword}
                        onChange={(event) => setDeletionPassword(event.target.value)}
                        placeholder="Required for re-authentication"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="anthropic-deletion-confirmation">
                        Type <span className="font-mono">{deletionPreview.confirmationPhrase}</span>
                      </Label>
                      <Input
                        id="anthropic-deletion-confirmation"
                        value={deletionConfirmation}
                        onChange={(event) => setDeletionConfirmation(event.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeDataManagement}
              disabled={permanentlyDeleting}
            >
              Cancel
            </Button>
            {deletionPreview && !deletionPreview.legalHold && (
              <Button
                type="button"
                variant="destructive"
                onClick={permanentlyDeleteConnection}
                disabled={
                  permanentlyDeleting ||
                  deletionReason.trim().length < 10 ||
                  !deletionPassword ||
                  deletionConfirmation !== deletionPreview.confirmationPhrase
                }
                className="gap-1.5"
              >
                {permanentlyDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Permanently delete organization data
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from "react";
import { RefreshCw, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface GpuConnection {
  id: string;
  vendor: string;
  status: string;
  externalAccountId: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

type Provider = "gcp" | "aws" | "azure" | "krutrim";

const PROVIDER_LABEL: Record<Provider, string> = {
  gcp: "Google Cloud (Vertex AI + GPU compute)",
  aws: "AWS (GPU compute)",
  azure: "Azure (GPU compute)",
  krutrim: "Krutrim Cloud (GPU compute)",
};
const PROVIDER_PREREQ: Record<Provider, string> = {
  gcp: "Requires Billing Export to BigQuery already enabled on the GCP project (Billing → Billing export in the GCP console) and a service-account key with BigQuery Data Viewer.",
  aws: "Requires an IAM user/role with the ce:GetCostAndUsage permission. No export setup needed — Cost Explorer is queried directly.",
  azure: "Requires an Azure AD app registration (service principal) with the Cost Management Reader role on the subscription.",
  krutrim:
    "Krutrim has no scoped API key for usage data — this stores your actual account email and password, used to log in automatically on each sync. Cost figures aren't available yet for this provider (Krutrim's usage API doesn't separate GPU cost from other compute cost); syncs currently only confirm how many GPU/AI-Pod resources are active.",
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(body.error ?? `Request failed: ${path}`);
  return body.data as T;
}

function statusLabel(status: string): string {
  return status.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function ConnectionList({ provider, connections, onSync, onDisconnect, busyId }: {
  provider: Provider;
  connections: GpuConnection[];
  onSync: (id: string) => void;
  onDisconnect: (id: string) => void;
  busyId: string | null;
}) {
  if (connections.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2">
      {connections.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-glass-border p-3 text-xs">
          <div>
            <p className="font-medium">{c.externalAccountId}</p>
            <p className="mt-0.5 text-muted-foreground">
              {statusLabel(c.status)}
              {c.lastSyncedAt ? ` · synced ${new Date(c.lastSyncedAt).toLocaleString()}` : " · never synced"}
            </p>
            {c.lastSyncError && <p className="mt-0.5 text-critical">{c.lastSyncError}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => onSync(c.id)}
              disabled={busyId === c.id}
              className="glass flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] disabled:opacity-50"
            >
              {busyId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sync now
            </button>
            <button
              type="button"
              onClick={() => onDisconnect(c.id)}
              className="glass rounded-full px-2.5 py-1 text-[11px] text-critical"
            >
              Disconnect
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function GcpConnectForm({ onConnected }: { onConnected: () => void }) {
  const [gcpProjectId, setGcpProjectId] = useState("");
  const [billingAccountId, setBillingAccountId] = useState("");
  const [bigQueryDataset, setBigQueryDataset] = useState("");
  const [bigQueryTableSuffix, setBigQueryTableSuffix] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!gcpProjectId || !bigQueryDataset || !bigQueryTableSuffix || !serviceAccountJson) {
      toast.error("Project ID, BigQuery dataset, table suffix and service-account key are required");
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson("/integrations/gcp/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gcpProjectId, billingAccountId, bigQueryDataset, bigQueryTableSuffix, serviceAccountJson }),
      });
      toast.success("GCP connected — first sync will backfill the last 30 days");
      setGcpProjectId(""); setBillingAccountId(""); setBigQueryDataset(""); setBigQueryTableSuffix(""); setServiceAccountJson("");
      onConnected();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect GCP");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = "w-full rounded-xl border border-glass-border bg-input/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";

  return (
    <div className="mt-3 space-y-2">
      <input className={fieldClass} placeholder="GCP project ID" value={gcpProjectId} onChange={(e) => setGcpProjectId(e.target.value)} />
      <input className={fieldClass} placeholder="Billing account ID (optional)" value={billingAccountId} onChange={(e) => setBillingAccountId(e.target.value)} />
      <div className="flex gap-2">
        <input className={fieldClass} placeholder="BigQuery dataset (e.g. billing_export)" value={bigQueryDataset} onChange={(e) => setBigQueryDataset(e.target.value)} />
        <input className={fieldClass} placeholder="Billing account id, dashes removed" value={bigQueryTableSuffix} onChange={(e) => setBigQueryTableSuffix(e.target.value)} />
      </div>
      <textarea className={cn(fieldClass, "font-mono text-xs")} rows={4} placeholder="Paste service-account JSON key" value={serviceAccountJson} onChange={(e) => setServiceAccountJson(e.target.value)} />
      <button type="button" onClick={submit} disabled={submitting} className="glass rounded-full px-4 py-2 text-xs font-medium disabled:opacity-50">
        {submitting ? "Connecting…" : "Connect GCP"}
      </button>
    </div>
  );
}

function AwsConnectForm({ onConnected }: { onConnected: () => void }) {
  const [awsAccountId, setAwsAccountId] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!awsAccountId || !accessKeyId || !secretAccessKey) {
      toast.error("Account ID, access key ID and secret access key are required");
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson("/integrations/aws/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ awsAccountId, accessKeyId, secretAccessKey }),
      });
      toast.success("AWS connected — first sync will backfill the last 30 days");
      setAwsAccountId(""); setAccessKeyId(""); setSecretAccessKey("");
      onConnected();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect AWS");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = "w-full rounded-xl border border-glass-border bg-input/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";

  return (
    <div className="mt-3 space-y-2">
      <input className={fieldClass} placeholder="AWS account ID" value={awsAccountId} onChange={(e) => setAwsAccountId(e.target.value)} />
      <input className={fieldClass} placeholder="Access key ID" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} />
      <input className={fieldClass} type="password" placeholder="Secret access key" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} />
      <button type="button" onClick={submit} disabled={submitting} className="glass rounded-full px-4 py-2 text-xs font-medium disabled:opacity-50">
        {submitting ? "Connecting…" : "Connect AWS"}
      </button>
    </div>
  );
}

function AzureConnectForm({ onConnected }: { onConnected: () => void }) {
  const [subscriptionId, setSubscriptionId] = useState("");
  const [azureTenantId, setAzureTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!subscriptionId || !azureTenantId || !clientId || !clientSecret) {
      toast.error("Subscription ID, tenant ID, client ID and client secret are required");
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson("/integrations/azure/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, azureTenantId, clientId, clientSecret }),
      });
      toast.success("Azure connected — first sync will backfill the last 30 days");
      setSubscriptionId(""); setAzureTenantId(""); setClientId(""); setClientSecret("");
      onConnected();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect Azure");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = "w-full rounded-xl border border-glass-border bg-input/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";

  return (
    <div className="mt-3 space-y-2">
      <input className={fieldClass} placeholder="Subscription ID" value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} />
      <input className={fieldClass} placeholder="Azure AD tenant ID" value={azureTenantId} onChange={(e) => setAzureTenantId(e.target.value)} />
      <input className={fieldClass} placeholder="App registration client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
      <input className={fieldClass} type="password" placeholder="Client secret" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
      <button type="button" onClick={submit} disabled={submitting} className="glass rounded-full px-4 py-2 text-xs font-medium disabled:opacity-50">
        {submitting ? "Connecting…" : "Connect Azure"}
      </button>
    </div>
  );
}

function KrutrimConnectForm({ onConnected }: { onConnected: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      toast.error("Email and password are required");
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson("/integrations/krutrim/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      toast.success("Krutrim connected");
      setEmail(""); setPassword("");
      onConnected();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect Krutrim");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = "w-full rounded-xl border border-glass-border bg-input/40 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";

  return (
    <div className="mt-3 space-y-2">
      <input className={fieldClass} type="email" placeholder="Account email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className={fieldClass} type="password" placeholder="Account password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="button" onClick={submit} disabled={submitting} className="glass rounded-full px-4 py-2 text-xs font-medium disabled:opacity-50">
        {submitting ? "Connecting…" : "Connect Krutrim"}
      </button>
    </div>
  );
}

const CONNECT_FORM: Record<Provider, typeof GcpConnectForm> = {
  gcp: GcpConnectForm,
  aws: AwsConnectForm,
  azure: AzureConnectForm,
  krutrim: KrutrimConnectForm,
};

function ProviderCard({ provider, connections, onRefresh }: { provider: Provider; connections: GpuConnection[]; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ConnectForm = CONNECT_FORM[provider];

  const sync = async (id: string) => {
    setBusyId(id);
    try {
      await fetchJson(`/integrations/${provider}/connections/${id}/sync`, { method: "POST" });
      toast.success("Sync started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start sync");
    } finally {
      setBusyId(null);
    }
  };

  const disconnect = async (id: string) => {
    try {
      await fetchJson(`/integrations/${provider}/connections/${id}`, { method: "DELETE" });
      toast.success("Disconnected");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect");
    }
  };

  return (
    <div className="rounded-2xl border border-glass-border p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <div>
          <p className="text-sm font-medium">{PROVIDER_LABEL[provider]}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{connections.length > 0 ? `${connections.length} connected` : "Not connected"}</p>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      <ConnectionList provider={provider} connections={connections} onSync={sync} onDisconnect={disconnect} busyId={busyId} />
      {expanded && (
        <>
          <p className="mt-3 text-[11px] text-muted-foreground">{PROVIDER_PREREQ[provider]}</p>
          <ConnectForm onConnected={onRefresh} />
        </>
      )}
    </div>
  );
}

/**
 * PM-facing "register your company" connect flow for the GPU-compute spend
 * feature (see /infra-spend) — until now these connections could only be
 * created by calling the API directly. One card per provider; AWS/Azure
 * cover GPU-compute cost only, GCP also backs the Vertex AI/Gemini usage
 * sync since it reads the same Billing Export source.
 */
export function GpuComputeConnect() {
  const [connections, setConnections] = useState<Record<Provider, GpuConnection[]>>({ gcp: [], aws: [], azure: [], krutrim: [] });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [gcp, aws, azure, krutrim] = await Promise.all([
        fetchJson<GpuConnection[]>("/integrations/gcp/connections"),
        fetchJson<GpuConnection[]>("/integrations/aws/connections"),
        fetchJson<GpuConnection[]>("/integrations/azure/connections"),
        fetchJson<GpuConnection[]>("/integrations/krutrim/connections"),
      ]);
      setConnections({ gcp, aws, azure, krutrim });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load GPU-compute connections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <GlassPanel title="Cloud GPU compute" subtitle="Register the org's cloud accounts for GPU-rental spend tracking">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {(["gcp", "aws", "azure", "krutrim"] as Provider[]).map((provider) => (
            <ProviderCard key={provider} provider={provider} connections={connections[provider]} onRefresh={refresh} />
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

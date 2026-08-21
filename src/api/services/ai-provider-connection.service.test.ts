import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTelemetryDeploymentAllowed,
  buildManagedSettings,
  discoverAnthropicCredential,
  resolveAnthropicCapabilities,
  resolveTelemetryDeploymentReadiness,
  validateAnthropicCredential,
} from "./ai-provider-connection.service";

test("organization telemetry requires an explicitly configured public HTTPS endpoint", () => {
  const ready = resolveTelemetryDeploymentReadiness(
    "http://localhost:3001",
    "https://telemetry.qualimetrix.example.com/platform/",
  );
  assert.deepEqual(ready, {
    baseUrl: "https://telemetry.qualimetrix.example.com/platform",
    enterpriseReady: true,
    mode: "enterprise",
    source: "configured",
    message: "Public HTTPS telemetry ingestion is configured for organization deployment.",
  });

  const settings = buildManagedSettings(ready.baseUrl, "connection-1", "tenant-1", "secret");
  assert.equal(
    settings.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
    "https://telemetry.qualimetrix.example.com/platform/api/v1/ai-usage/otlp/connection-1/logs",
  );
});

test("localhost telemetry is clearly classified as local-test-only", () => {
  const readiness = resolveTelemetryDeploymentReadiness("http://localhost:3001", "");
  assert.equal(readiness.enterpriseReady, false);
  assert.equal(readiness.mode, "local_test");
  assert.match(readiness.message, /Do not publish/);
});

test("untrusted request hosts never become enterprise deployment endpoints", () => {
  const readiness = resolveTelemetryDeploymentReadiness("https://spoofed.example.com", "");
  assert.equal(readiness.enterpriseReady, false);
  assert.equal(readiness.mode, "configuration_required");
  assert.equal(readiness.source, "request");
  assert.throws(
    () => assertTelemetryDeploymentAllowed(readiness, "production"),
    /deployment is blocked/,
  );
  assert.doesNotThrow(() => assertTelemetryDeploymentAllowed(readiness, "development"));
});

test("Team plans do not pretend to have the Enterprise Analytics API", () => {
  assert.throws(
    () =>
      resolveAnthropicCapabilities({
        acquisitionChannel: "anthropic_direct",
        planType: "team",
        collectionMode: "enterprise_analytics",
      }),
    /cannot use a Claude Enterprise Analytics credential/,
  );
  assert.deepEqual(
    resolveAnthropicCapabilities({
      acquisitionChannel: "anthropic_direct",
      planType: "team",
      collectionMode: "managed_otel",
    }),
    {
      managedOtel: true,
      providerActivity: false,
      providerUsage: false,
      providerCost: false,
      costAuthority: "none",
      apiAdapter: null,
    },
  );
  assert.deepEqual(
    resolveAnthropicCapabilities({
      acquisitionChannel: "anthropic_direct",
      planType: "team",
      collectionMode: "hybrid",
    }),
    {
      managedOtel: true,
      providerActivity: true,
      providerUsage: true,
      providerCost: true,
      costAuthority: "provider_estimated",
      apiAdapter: "console",
    },
  );
});

test("Console Admin credential discovery proves the organization and reporting endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    paths.push(new URL(url).pathname);
    if (url.includes("/organizations/me")) {
      return Response.json({ id: "team-org", name: "Example Team" });
    }
    if (url.includes("/usage_report/claude_code")) {
      return Response.json({ data: [], has_more: false, next_page: null });
    }
    return Response.json({ error: "wrong endpoint" }, { status: 500 });
  }) as typeof fetch;

  try {
    const discovery = await discoverAnthropicCredential("console_admin", "admin-key", "team-org");
    assert.equal(discovery.organization.name, "Example Team");
    assert.equal(discovery.capabilities.historicalAnalytics, true);
    assert.equal(discovery.capabilities.realtimeEvents, false);
    assert.deepEqual(paths, ["/v1/organizations/me", "/v1/organizations/usage_report/claude_code"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Enterprise Analytics validation uses analytics endpoints, not the incompatible Admin API", async () => {
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    paths.push(new URL(url).pathname);
    if (url.includes("user_usage_report")) {
      return Response.json({ organization_id: "enterprise-org", data: [], has_more: false });
    }
    if (url.includes("/analytics/users")) {
      return Response.json({ data: [], next_page: null });
    }
    return Response.json({ error: "wrong endpoint" }, { status: 500 });
  }) as typeof fetch;

  try {
    const organization = await validateAnthropicCredential(
      "analytics-key",
      "enterprise-org",
      "enterprise",
    );
    assert.equal(organization.id, "enterprise-org");
    assert.deepEqual(paths, [
      "/v1/organizations/analytics/user_usage_report",
      "/v1/organizations/analytics/users",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

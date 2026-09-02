/**
 * Krutrim Cloud GPU-compute — fourth GPU-spend provider, and the odd one
 * out: Krutrim (cloud.olakrutrim.com) has no documented billing/usage REST
 * API and no general-purpose API key (their only self-service "API key"
 * feature, confirmed via recon, is under /kos/v1/access_keys — Object
 * Storage access keys, a completely different, S3-compatible auth path that
 * does not authenticate against the console's own usage/resource endpoints).
 * The stored credential here is therefore the user's real account
 * email+password, and every sync logs in via a headless Playwright browser
 * to obtain a session, then calls the console's private JSON endpoints
 * directly through that session (Playwright's `context.request`, which
 * shares cookies with the logged-in page) rather than scraping rendered
 * HTML. Endpoint paths and response shapes below were captured directly
 * from a real logged-in session (krutrim-recon-output/network.json) via
 * scripts/krutrim-recon.ts, not guessed or inferred from documentation —
 * Krutrim publishes none for this.
 *
 * Deliberately does NOT write real cost rows yet. `/api/v2/resource/
 * usagestats/summary` only breaks cost into three coarse buckets (Compute /
 * Network / Storage) with no per-resource-type split, and the one account
 * this was verified against has zero active GPU/AI-Pod resources — so there
 * is no confirmed way yet to isolate GPU-specific spend from ordinary VM
 * spend within the "Compute" bucket. Writing the whole bucket as "GPU
 * spend" would misattribute non-GPU cost, which is worse than reporting
 * nothing. Once `get-user-resources`' `breakdown.byType` has been observed
 * on an account with a real active GPU/AI-Pod resource (confirming whether
 * per-type cost is exposed there), this file's writeCostRow should be
 * filled in the same way as the other three providers' — until then, a
 * sync either confirms zero GPU resources (a real, honest "nothing to
 * report" success) or surfaces a clear sync error explaining the gap, never
 * a fabricated number.
 */
import type { Browser, BrowserContext } from "playwright";
import { chromium } from "playwright";
import type { AiProviderConnection } from "@prisma/client";
import providerConnectionService, {
  getDecryptedCredential,
  recordSyncStart,
  recordSyncSuccess,
  recordSyncError,
} from "./provider-connection.service";

const LOGIN_URL = "https://cloud.olakrutrim.com/signIn";
const RESOURCES_URL = "https://cloud.olakrutrim.com/admin/api/v1/get-user-resources";

interface KrutrimCredential {
  email: string;
  password: string;
}

interface KrutrimResourceStats {
  vm_instances?: { total: number; active: number };
  kpod_instances?: { total: number; active: number };
  [key: string]: unknown;
}

interface KrutrimUserResourcesResponse {
  success: boolean;
  message?: string;
  data?: {
    resourceStats?: KrutrimResourceStats;
    breakdown?: { byType?: unknown[] };
  };
}

async function loginSession(connection: AiProviderConnection): Promise<{ browser: Browser; context: BrowserContext }> {
  const raw = await getDecryptedCredential(connection.id);
  if (!raw) throw new Error("Krutrim connection has no stored credential.");
  const credential: KrutrimCredential = JSON.parse(raw);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOGIN_URL);
  // Same disambiguation as scripts/krutrim-recon.ts — the page renders more
  // than one email/password input (a hidden nav/header duplicate alongside
  // the real form), so label text alone is ambiguous.
  await page.locator('input[type="email"]:visible').first().fill(credential.email);
  await page.locator('input[type="password"]:visible').first().fill(credential.password);
  await page.locator("button:visible", { hasText: /sign in/i }).first().click();
  await page.waitForTimeout(3000);

  if (page.url().includes("/signIn")) {
    await browser.close();
    throw new Error(
      "Krutrim login did not redirect away from the sign-in page — wrong password, a CAPTCHA, " +
        "or a UI change on Krutrim's end. Re-run scripts/krutrim-recon.ts to see what's happening.",
    );
  }

  await page.close();
  return { browser, context };
}

async function fetchUserResources(context: BrowserContext): Promise<KrutrimUserResourcesResponse> {
  const response = await context.request.get(RESOURCES_URL);
  if (!response.ok()) {
    throw new Error(`Krutrim get-user-resources returned ${response.status()}`);
  }
  return response.json();
}

export async function syncKrutrimGpuCost(connection: AiProviderConnection): Promise<void> {
  await recordSyncStart(connection.id);
  let browser: Browser | undefined;
  try {
    const session = await loginSession(connection);
    browser = session.browser;

    const resources = await fetchUserResources(session.context);
    const kpod = resources.data?.resourceStats?.kpod_instances;
    const activeGpuResources = kpod?.active ?? 0;

    const cursor = (connection.syncCursor as Record<string, unknown>) ?? {};
    if (activeGpuResources === 0) {
      // Real, honest "nothing to report" — this account currently has no
      // active GPU/AI-Pod resources, so zero GpuComputeUsageEvent rows is
      // the correct answer, not a gap.
      await recordSyncSuccess(connection.id, {
        ...cursor,
        lastKrutrimCheck: new Date().toISOString(),
        lastKnownActiveGpuResources: 0,
      });
      return;
    }

    // Resources exist, but there's still no confirmed way to isolate their
    // cost from the account's total Compute spend (see file header) — this
    // needs a real capture of breakdown.byType on an active-GPU account
    // before writeCostRow can be implemented honestly. Surface this as a
    // sync error rather than guessing.
    throw new Error(
      `Krutrim reports ${activeGpuResources} active GPU/AI-Pod resource(s), but Krutrim's usage API ` +
        "doesn't yet have a confirmed way to isolate their cost from total account Compute spend " +
        "(see krutrim-gpu-cost-sync.service.ts header). Needs a fresh recon capture of " +
        "get-user-resources' breakdown.byType on this account before cost sync can be implemented.",
    );
  } catch (error) {
    await recordSyncError(connection.id, error);
    throw error;
  } finally {
    await browser?.close();
  }
}

export async function syncAllKrutrimGpuCost(): Promise<void> {
  const connections = await providerConnectionService.listDueForSync("krutrim");
  await Promise.allSettled(connections.map((c) => syncKrutrimGpuCost(c)));
}

/**
 * One-off recon script for the planned Krutrim Cloud GPU-utilization
 * integration — NOT part of the production sync path.
 *
 * Krutrim Cloud (cloud.olakrutrim.com) has no documented billing/usage REST
 * API, so the only way to read GPU utilization today is the logged-in web
 * dashboard. This script logs in once with your own credentials (read from
 * environment variables — never hardcode or paste them into chat/source
 * control), then lets you visit as many pages as you want in a single
 * session — each one gets its own screenshot/HTML checkpoint, and every
 * JSON API response the site makes along the way is captured cumulatively.
 * A private JSON API (if the page uses one) is far more robust to build the
 * real sync against than scraping rendered HTML, so that's the first thing
 * to look for in the output.
 *
 * Usage:
 *   KRUTRIM_EMAIL="you@example.com" KRUTRIM_PASSWORD="..." \
 *     npx tsx scripts/krutrim-recon.ts
 *
 * After login, the terminal will repeatedly prompt you to navigate
 * somewhere in the browser window (e.g. Monitoring > Dashboard, or
 * Administration > IAM for API-key/programmatic-access options), give it a
 * short label, and press Enter — repeat for as many pages as useful, then
 * type "done".
 *
 * Output lands in krutrim-recon-output/ (gitignored):
 *   - checkpoint-<n>-<label>.png / .html  — one pair per page you captured
 *   - network.json                          — every JSON API response seen, in order
 *   - checkpoints.json                      — maps each checkpoint to the
 *     slice of network.json captured while you were on that page
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { chromium } from "playwright";

const OUTPUT_DIR = "krutrim-recon-output";
const LOGIN_URL = "https://cloud.olakrutrim.com/signIn";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function slugify(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "page"
  );
}

async function main() {
  const email = process.env.KRUTRIM_EMAIL;
  const password = process.env.KRUTRIM_PASSWORD;
  if (!email || !password) {
    console.error(
      "Set KRUTRIM_EMAIL and KRUTRIM_PASSWORD as environment variables before running this " +
        "(never pass credentials as command-line args — they'd end up in shell history).",
    );
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const capturedResponses: Array<{ url: string; status: number; body: unknown }> = [];
  const checkpoints: Array<{
    label: string;
    url: string;
    screenshot: string;
    html: string;
    networkResponseRange: [number, number];
  }> = [];

  console.log("Launching a visible browser window — watch for a CAPTCHA or unexpected prompt.");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture JSON API responses site-wide from this point on, cumulatively
  // across every page visited this session.
  page.on("response", async (response) => {
    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("application/json")) return;
    try {
      const body = await response.json();
      capturedResponses.push({ url: response.url(), status: response.status(), body });
    } catch {
      // non-JSON or empty body despite the content-type header — skip
    }
  });

  console.log(`Navigating to ${LOGIN_URL} ...`);
  await page.goto(LOGIN_URL);

  console.log("Logging in...");
  // The page renders more than one email/password input (likely a hidden
  // nav/header duplicate alongside the real form) — label text alone is
  // ambiguous, so scope to whichever instance is actually visible.
  await page.locator('input[type="email"]:visible').first().fill(email);
  await page.locator('input[type="password"]:visible').first().fill(password);
  await page.locator('button:visible', { hasText: /sign in/i }).first().click();
  await page.waitForTimeout(3000);

  console.log(
    "\nLogged in. Now, for each page worth capturing (e.g. Monitoring > Dashboard, " +
      "Administration > IAM, any GPU/AI Pod detail page): navigate there in the browser " +
      "window, then answer the prompt below. Type 'done' when finished.\n",
  );

  let index = 0;
  while (true) {
    const label = (await rl.question(`Label for this page (or 'done' to finish): `)).trim();
    if (label.toLowerCase() === "done") break;
    if (!label) continue;

    index += 1;
    const slug = slugify(label);
    const before = capturedResponses.length;

    const screenshotFile = `checkpoint-${String(index).padStart(2, "0")}-${slug}.png`;
    const htmlFile = `checkpoint-${String(index).padStart(2, "0")}-${slug}.html`;
    await page.screenshot({ path: `${OUTPUT_DIR}/${screenshotFile}`, fullPage: true });
    await writeFile(`${OUTPUT_DIR}/${htmlFile}`, await page.content(), "utf-8");

    const after = capturedResponses.length;
    checkpoints.push({
      label,
      url: page.url(),
      screenshot: screenshotFile,
      html: htmlFile,
      networkResponseRange: [before, after],
    });
    console.log(`  Saved ${screenshotFile} — ${after - before} JSON response(s) captured on this page.\n`);
  }
  rl.close();

  const networkPath = `${OUTPUT_DIR}/network.json`;
  const checkpointsPath = `${OUTPUT_DIR}/checkpoints.json`;
  await writeFile(networkPath, JSON.stringify(capturedResponses, null, 2), "utf-8");
  await writeFile(checkpointsPath, JSON.stringify(checkpoints, null, 2), "utf-8");

  console.log(`\nSaved ${checkpoints.length} checkpoint(s) to ${OUTPUT_DIR}/, plus:
  - ${networkPath} (${capturedResponses.length} JSON response(s) total)
  - ${checkpointsPath}
`);

  await browser.close();
}

main().catch((error) => {
  console.error("Recon script failed:", error);
  process.exit(1);
});

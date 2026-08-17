/**
 * AI Usage Analytics Controller
 * Handles endpoints for AI usage analytics and event ingestion.
 *
 * getAiUsageAnalyticsHandler and connectAiUsage require requireAuth (browser
 * session cookie) — see src/api/middleware/auth.middleware.ts.
 * ingestAiUsageEvents and ingestOtlpLogs require requireIngestToken (machine
 * bearer header) — see src/api/middleware/ingest-token.middleware.ts.
 * Identity/tenant for every handler below comes only from req.user/req.ingestUser,
 * populated by that middleware — never from a client-supplied query/body field.
 */

import { Request, Response } from 'express';
import { getAiUsageAnalytics } from '../../lib/ai-usage.functions';
import {
  recordEvents,
  parseIngestPayload,
  issueAiIngestToken,
  ensureModelCatalogEntry,
} from '../../lib/ai-usage.server';
import { extractApiRequestAttrs, mapToRawEvent } from '../../lib/otel-claude-code.server';

/**
 * GET /api/v1/ai-usage/analytics
 * Requires requireAuth. Get AI usage analytics for the requested visibility
 * level, scoped to the authenticated user's own tenant.
 */
export async function getAiUsageAnalyticsHandler(req: Request, res: Response) {
  try {
    if (!req.user!.tenantId) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not assigned to an organization yet. Contact an administrator.',
      });
    }

    const { visibility, sprints, enhanced } = req.query;
    const visibilityLevel = (visibility as string) || 'self';
    const sprintsCount = sprints ? parseInt(sprints as string, 10) : undefined;
    const enhancedAnalytics = enhanced === 'true';

    const analytics = await getAiUsageAnalytics({
      visibility: visibilityLevel as any,
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      sprints: sprintsCount,
      enhanced: enhancedAnalytics,
    });

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Error getting AI usage analytics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get analytics data',
    });
  }
}

/**
 * POST /api/public/ai-usage/events
 * Requires requireIngestToken. Ingest AI usage events from external sources,
 * scoped to the ingest token holder's tenant.
 */
export async function ingestAiUsageEvents(req: Request, res: Response) {
  try {
    const tenantId = req.ingestUser!.tenantId;
    const events = await parseIngestPayload(req.body, tenantId);
    const result = await recordEvents(events, tenantId);

    res.json({
      success: true,
      accepted: result.accepted,
      total: result.total,
      message: `Processed ${result.accepted} events. Total events in store: ${result.total}`,
    });
  } catch (error) {
    console.error('Error ingesting AI usage events:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process events',
    });
  }
}

/**
 * POST /api/v1/ai-usage/connect
 * Requires requireAuth. Issues the authenticated user a personal ingest
 * token + setup snippet for Claude Code's OTLP export. No client-supplied
 * email — identity/tenant come from the session, so a user must already
 * exist (admin-created, tenantId set) and be logged in before connecting.
 * Re-connecting issues a new token and invalidates the old one.
 */
export async function connectAiUsage(req: Request, res: Response) {
  try {
    const token = await issueAiIngestToken(req.user!.id);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const endpoint = `${baseUrl}/api/v1/ai-usage/otlp/logs`;

    // Recommended path: one command that writes straight into Claude Code's own
    // settings.json, so there's no shell/profile knowledge required and it applies
    // to every future session automatically — no manual exports, no new terminal.
    // Merges into any existing env block rather than overwriting the file, and
    // aborts (rather than clobbering) if the existing file fails to parse.
    const mergeScript = [
      "const fs=require('fs');",
      "const path=require('path');",
      "const os=require('os');",
      "const dir=path.join(os.homedir(),'.claude');",
      "const file=path.join(dir,'settings.json');",
      'fs.mkdirSync(dir,{recursive:true});',
      'let settings={};',
      'if(fs.existsSync(file)){',
      "try{settings=JSON.parse(fs.readFileSync(file,'utf8'))}",
      "catch(e){console.error('Could not parse existing ~/.claude/settings.json - aborting without changes. Fix its JSON syntax and try again.');process.exit(1)}",
      '}',
      `settings.env=Object.assign({},settings.env,{CLAUDE_CODE_ENABLE_TELEMETRY:'1',OTEL_LOGS_EXPORTER:'otlp',OTEL_EXPORTER_OTLP_PROTOCOL:'http/json',OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:'${endpoint}',OTEL_EXPORTER_OTLP_HEADERS:'x-qualimetrix-token=${token}'});`,
      'fs.writeFileSync(file,JSON.stringify(settings,null,2));',
      "console.log('QualiMetrix connected. Restart Claude Code to start tracking your usage.');",
    ].join('');
    const quickSetupCommand = `node -e "${mergeScript}"`;

    // Advanced/manual fallback (e.g. CI, containers, shared machines where editing
    // a personal global settings.json isn't appropriate) — session-scoped only.
    const setupSnippet = [
      'export CLAUDE_CODE_ENABLE_TELEMETRY=1',
      'export OTEL_LOGS_EXPORTER=otlp',
      'export OTEL_EXPORTER_OTLP_PROTOCOL=http/json',
      `export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=${endpoint}`,
      `export OTEL_EXPORTER_OTLP_HEADERS="x-qualimetrix-token=${token}"`,
    ].join('\n');

    res.json({
      success: true,
      userId: req.user!.id,
      token,
      quickSetupCommand,
      setupSnippet,
    });
  } catch (error) {
    console.error('Error connecting AI usage:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect',
    });
  }
}

/**
 * POST /api/v1/ai-usage/otlp/logs
 * Requires requireIngestToken. Receiver for Claude Code's OpenTelemetry logs
 * export, scoped to the ingest token holder's tenant.
 */
export async function ingestOtlpLogs(req: Request, res: Response) {
  try {
    const { id: userId, tenantId } = req.ingestUser!;

    const records = extractApiRequestAttrs(req.body);
    if (records.length === 0) {
      const { total } = await recordEvents([], tenantId);
      return res.json({ success: true, accepted: 0, total });
    }

    const uniqueModelIds = new Set(records.map((r) => String(r.attrs.model ?? 'unknown-model')));
    for (const modelId of uniqueModelIds) {
      await ensureModelCatalogEntry(modelId);
    }

    const rawEvents = records.map((r) => mapToRawEvent(r.attrs, r.timeUnixNano, userId));
    const events = await parseIngestPayload(rawEvents, tenantId);
    const result = await recordEvents(events, tenantId);

    res.json({ success: true, accepted: result.accepted, total: result.total });
  } catch (error) {
    console.error('Error ingesting OTLP logs:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process OTLP payload',
    });
  }
}

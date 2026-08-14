/**
 * AI Usage Analytics Controller
 * Handles endpoints for AI usage analytics and event ingestion
 */

import { Request, Response } from 'express';
import { getAiUsageAnalytics } from '../../lib/ai-usage.functions';
import {
  recordEvents,
  parseIngestPayload,
  findOrCreateUserByEmail,
  issueAiIngestToken,
  resolveUserByIngestToken,
  ensureModelCatalogEntry,
  refreshAiDirectory,
} from '../../lib/ai-usage.server';
import { extractApiRequestAttrs, mapToRawEvent } from '../../lib/otel-claude-code.server';

/**
 * GET /api/v1/ai-usage/analytics
 * Get AI usage analytics for specified visibility level and user
 */
export async function getAiUsageAnalyticsHandler(req: Request, res: Response) {
  try {
    const { visibility, userId, sprints, enhanced } = req.query;

    // Parse parameters
    const visibilityLevel = (visibility as string) || 'self';
    const userIdStr = (userId as string) || '1f9c1029-80ed-48ef-8892-c9aa06092640'; // Default to admin user
    const sprintsCount = sprints ? parseInt(sprints as string, 10) : undefined;
    const enhancedAnalytics = enhanced === 'true'; // Enable MCP-enhanced analytics if requested

    // Get analytics data
    const analytics = await getAiUsageAnalytics({
      visibility: visibilityLevel as any,
      userId: userIdStr,
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
 * Ingest AI usage events from external sources
 * This is a public endpoint (token-guarded) for event ingestion
 */
export async function ingestAiUsageEvents(req: Request, res: Response) {
  try {
    const events = await parseIngestPayload(req.body);
    const result = await recordEvents(events);

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/v1/ai-usage/connect
 * Self-service registration: a developer types their own email (+ optional squad)
 * and gets back a personal ingest token to configure Claude Code's OTLP export with.
 * Re-connecting the same email issues a new token and invalidates the old one.
 */
export async function connectAiUsage(req: Request, res: Response) {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const squad = req.body?.squad ? String(req.body.squad).trim() : undefined;

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email is required' });
    }

    const user = await findOrCreateUserByEmail(email, squad);
    const token = await issueAiIngestToken(user.id);
    await refreshAiDirectory();

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const setupSnippet = [
      'export CLAUDE_CODE_ENABLE_TELEMETRY=1',
      'export OTEL_LOGS_EXPORTER=otlp',
      'export OTEL_EXPORTER_OTLP_PROTOCOL=http/json',
      `export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=${baseUrl}/api/v1/ai-usage/otlp/logs`,
      `export OTEL_EXPORTER_OTLP_HEADERS="x-qualimetrix-token=${token}"`,
    ].join('\n');

    res.json({
      success: true,
      userId: user.id,
      token,
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
 * Receiver for Claude Code's OpenTelemetry logs export. Identity comes ONLY from
 * the x-qualimetrix-token header — the payload's user.email/user.id attributes are
 * never trusted for identity.
 */
export async function ingestOtlpLogs(req: Request, res: Response) {
  try {
    const token = req.header('x-qualimetrix-token');
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing x-qualimetrix-token header' });
    }
    const user = await resolveUserByIngestToken(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid or revoked ingest token' });
    }

    const records = extractApiRequestAttrs(req.body);
    if (records.length === 0) {
      const { total } = await recordEvents([]);
      return res.json({ success: true, accepted: 0, total });
    }

    const uniqueModelIds = new Set(records.map((r) => String(r.attrs.model ?? 'unknown-model')));
    for (const modelId of uniqueModelIds) {
      await ensureModelCatalogEntry(modelId);
    }

    const rawEvents = records.map((r) => mapToRawEvent(r.attrs, r.timeUnixNano, user.id));
    const events = await parseIngestPayload(rawEvents);
    const result = await recordEvents(events);

    res.json({ success: true, accepted: result.accepted, total: result.total });
  } catch (error) {
    console.error('Error ingesting OTLP logs:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process OTLP payload',
    });
  }
}
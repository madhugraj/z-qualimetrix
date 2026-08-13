/**
 * AI Usage Analytics Controller
 * Handles endpoints for AI usage analytics and event ingestion
 */

import { Request, Response } from 'express';
import { getAiUsageAnalytics } from '../../lib/ai-usage.functions';
import { recordEvents, parseIngestPayload } from '../../lib/ai-usage.server';

/**
 * GET /api/v1/ai-usage/analytics
 * Get AI usage analytics for specified visibility level and user
 */
export async function getAiUsageAnalyticsHandler(req: Request, res: Response) {
  try {
    const { visibility, userId, sprints } = req.query;

    // Parse parameters
    const visibilityLevel = (visibility as string) || 'self';
    const userIdStr = (userId as string) || 'p1'; // Default to demo user
    const sprintsCount = sprints ? parseInt(sprints as string, 10) : undefined;

    // Get analytics data
    const analytics = await getAiUsageAnalytics({
      visibility: visibilityLevel as any,
      userId: userIdStr,
      sprints: sprintsCount,
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
    const events = parseIngestPayload(req.body);
    const result = recordEvents(events);

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
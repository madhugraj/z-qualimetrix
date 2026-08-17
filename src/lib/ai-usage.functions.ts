/**
 * Server functions for AI usage analytics
 * Bridges between the HTTP layer and the core analytics logic
 * Now supports both standard and MCP-enhanced analytics
 */

import { aggregate } from "./ai-usage.server";
import { getEnhancedAnalytics } from "./mcp-analytics-enhanced";
import type { AiUsageQuery, AiUsageAnalytics } from "./ai-usage.server";

/**
 * Main server function to get AI usage analytics
 * Called from the API endpoint with proper validation and scoping
 */
export async function getAiUsageAnalytics(params: {
  visibility: "self" | "team" | "org" | "finance";
  userId: string;
  tenantId: string;
  sprints?: number;
  enhanced?: boolean; // Enable MCP-enhanced analytics
}): Promise<AiUsageAnalytics> {
  const { visibility, userId, tenantId, sprints, enhanced = false } = params;

  // Validate inputs
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  if (!["self", "team", "org", "finance"].includes(visibility)) {
    throw new Error(`Invalid visibility level: ${visibility}`);
  }

  if (sprints !== undefined && (typeof sprints !== "number" || sprints < 1 || sprints > 12)) {
    throw new Error("sprints must be between 1 and 12");
  }

  // Choose between standard and MCP-enhanced analytics
  try {
    if (enhanced) {
      console.log('Using MCP-enhanced analytics for better performance and insights');
      return await getEnhancedAnalytics({ visibility, userId, tenantId, sprints }, true) as AiUsageAnalytics;
    } else {
      return await aggregate({ visibility, userId, tenantId, sprints });
    }
  } catch (error) {
    console.error("Error generating AI usage analytics:", error);
    throw new Error("Failed to generate analytics data");
  }
}
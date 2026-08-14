/**
 * MCP PostgreSQL Client Integration
 *
 * This module integrates with Model Context Protocol (MCP) PostgreSQL servers
 * to provide enhanced analytics, monitoring, and query optimization capabilities.
 *
 * Features:
 * - Natural language query generation for complex analytics
 * - Real-time query performance monitoring
 * - Automatic query optimization hints
 * - Connection pooling and resource management
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MCPAnalyticsConfig {
  enabled: boolean;
  serverType: 'local' | 'remote';
  serverPath?: string;
  optimizationLevel: 'basic' | 'advanced' | 'aggressive';
  monitoringEnabled: boolean;
}

class MCPPostgresClient {
  private client: Client | null = null;
  private config: MCPAnalyticsConfig;
  private isConnected = false;

  constructor(config: MCPAnalyticsConfig = { enabled: false, serverType: 'local', optimizationLevel: 'basic', monitoringEnabled: false }) {
    this.config = config;
  }

  /**
   * Initialize MCP PostgreSQL client connection
   */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) {
      console.log('MCP PostgreSQL integration is disabled in configuration');
      return false;
    }

    try {
      // Create MCP client
      this.client = new Client({
        name: "qualimetrix-ai-analytics",
        version: "1.0.0"
      });

      // Set up transport (stdio for local MCP server)
      const transport = new StdioClientTransport({
        command: 'node',
        args: ['path/to/mcp-postgres-server'], // Update with actual MCP server path
        env: {
          DATABASE_URL: process.env.DATABASE_URL,
          MCP_ANALYTICS_ENABLED: 'true'
        }
      });

      await this.client.connect(transport);
      this.isConnected = true;
      console.log('MCP PostgreSQL client connected successfully');
      return true;

    } catch (error) {
      console.error('Failed to initialize MCP PostgreSQL client:', error);
      return false;
    }
  }

  /**
   * Execute analytics query with MCP optimization
   */
  async executeAnalyticsQuery(queryText: string, params?: any[]): Promise<any> {
    if (!this.isConnected || !this.client) {
      console.warn('MCP client not connected, falling back to direct Prisma query');
      return this.fallbackQuery(queryText, params);
    }

    try {
      // Use MCP to optimize and execute query
      const result = await this.client.callTool({
        name: "execute_optimized_query",
        arguments: {
          query: queryText,
          parameters: params,
          optimization_level: this.config.optimizationLevel,
          monitor_performance: this.config.monitoringEnabled
        }
      });

      return result;

    } catch (error) {
      console.error('MCP query execution failed, falling back to direct query:', error);
      return this.fallbackQuery(queryText, params);
    }
  }

  /**
   * Generate natural language analytics query
   */
  async generateAnalyticsQuery(naturalLanguageRequest: string): Promise<string> {
    if (!this.isConnected || !this.client) {
      throw new Error('MCP client not connected for natural language query generation');
    }

    try {
      const result = await this.client.callTool({
        name: "generate_sql_query",
        arguments: {
          natural_language: naturalLanguageRequest,
          schema_context: await this.getSchemaContext(),
          optimization_hints: true
        }
      });

      return result.query;

    } catch (error) {
      console.error('Failed to generate natural language query:', error);
      throw error;
    }
  }

  /**
   * Get query performance insights
   */
  async getQueryPerformanceInsights(queryText: string): Promise<any> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      const insights = await this.client.callTool({
        name: "analyze_query_performance",
        arguments: {
          query: queryText,
          include_recommendations: true
        }
      });

      return insights;

    } catch (error) {
      console.error('Failed to get query performance insights:', error);
      return null;
    }
  }

  /**
   * Get database schema context for MCP
   */
  private async getSchemaContext(): Promise<string> {
    try {
      // Get AI usage table structure
      const tableInfo = await prisma.$queryRaw`
        SELECT
          table_name,
          column_name,
          data_type,
          is_nullable
        FROM information_schema.columns
        WHERE table_name IN ('ai_usage_events', 'ai_model_catalog', 'ai_usage_analytics')
        ORDER BY table_name, ordinal_position
      `;

      return JSON.stringify(tableInfo);

    } catch (error) {
      console.error('Failed to get schema context:', error);
      return '{}';
    }
  }

  /**
   * Fallback to direct Prisma query when MCP is unavailable
   */
  private async fallbackQuery(queryText: string, params?: any[]): Promise<any> {
    try {
      return await prisma.$queryRawUnsafe(queryText, ...(params || []));
    } catch (error) {
      console.error('Fallback query also failed:', error);
      throw error;
    }
  }

  /**
   * Monitor AI usage analytics performance
   */
  async monitorAnalyticsPerformance(): Promise<any> {
    if (!this.config.monitoringEnabled) {
      return null;
    }

    try {
      const metrics = await this.client?.callTool({
        name: "get_analytics_metrics",
        arguments: {
          time_range: "1h",
          include_query_stats: true,
          include_connection_stats: true
        }
      });

      return metrics;

    } catch (error) {
      console.error('Failed to get analytics performance metrics:', error);
      return null;
    }
  }

  /**
   * Health check for MCP connection
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string; details?: any }> {
    if (!this.isConnected) {
      return {
        healthy: false,
        message: 'MCP client is not connected'
      };
    }

    try {
      const health = await this.client?.callTool({
        name: "health_check",
        arguments: {}
      });

      return {
        healthy: true,
        message: 'MCP PostgreSQL client is healthy',
        details: health
      };

    } catch (error) {
      return {
        healthy: false,
        message: `MCP health check failed: ${error}`
      };
    }
  }

  /**
   * Disconnect MCP client
   */
  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.close();
        this.isConnected = false;
        console.log('MCP PostgreSQL client disconnected');
      } catch (error) {
        console.error('Error disconnecting MCP client:', error);
      }
    }
  }
}

// Singleton instance
let mcpClient: MCPPostgresClient | null = null;

/**
 * Get or create MCP PostgreSQL client instance
 */
export async function getMCPClient(config?: MCPAnalyticsConfig): Promise<MCPPostgresClient> {
  if (!mcpClient) {
    mcpClient = new MCPPostgresClient(config);
    await mcpClient.initialize();
  }
  return mcpClient;
}

/**
 * Reset MCP client (mainly for testing)
 */
export function resetMCPClient(): void {
  if (mcpClient) {
    mcpClient.disconnect();
    mcpClient = null;
  }
}
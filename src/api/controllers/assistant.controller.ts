import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ApiError as GeminiApiError } from '@google/genai';
import { BaseController } from './base.controller';
import { ScopeError } from '../middleware/auth.middleware';
import * as assistantChatService from '../services/assistant-chat.service';
import { RateLimitError, AssistantNotConfiguredError } from '../services/assistant-chat.service';

/**
 * PM/Leadership analytics assistant. Every route is gated by
 * `requireRole('pm', 'executive')` at the route layer (assistant.routes.ts);
 * every service call below still scopes to `req.user!.tenantId` itself as a
 * second, independent layer — never trusts a client-supplied id.
 */
export class AssistantController extends BaseController {
  private handleServiceError(res: Response, error: unknown): boolean {
    if (error instanceof ScopeError) {
      this.error(res, error.message, 403);
      return true;
    }
    if (error instanceof RateLimitError) {
      this.error(res, error.message, 429);
      return true;
    }
    if (error instanceof AssistantNotConfiguredError) {
      this.error(res, error.message, 503);
      return true;
    }
    // Any LLM vendor's own error status (401 invalid key, 429 rate-limited,
    // 529 overloaded, ...) must never be forwarded as-is, regardless of
    // which provider is active: this app's frontend (src/lib/api-client.ts)
    // treats ANY 401 from ANY endpoint as "my session expired" and silently
    // retries the whole request — which would duplicate a real, paid LLM
    // call on a transient upstream error. Always normalize to 502 (this
    // endpoint's own upstream-failure code).
    if (error instanceof Anthropic.APIError || error instanceof OpenAI.APIError || error instanceof GeminiApiError) {
      console.error('Assistant LLM provider error:', error);
      this.error(res, 'The analytics assistant is temporarily unavailable. Try again shortly.', 502);
      return true;
    }
    return false;
  }

  listConversations = this.asyncHandler(async (req: Request, res: Response) => {
    try {
      const conversations = await assistantChatService.listConversations(req.user!);
      this.success(res, conversations);
    } catch (error) {
      if (!this.handleServiceError(res, error)) throw error;
    }
  });

  getConversation = this.asyncHandler(async (req: Request, res: Response) => {
    try {
      const messages = await assistantChatService.getConversationMessages(req.user!, this.paramString(req, 'id'));
      this.success(res, messages);
    } catch (error) {
      if (!this.handleServiceError(res, error)) throw error;
    }
  });

  createConversation = this.asyncHandler(async (req: Request, res: Response) => {
    try {
      const conversation = await assistantChatService.createConversation(req.user!);
      this.success(res, conversation, undefined, 201);
    } catch (error) {
      if (!this.handleServiceError(res, error)) throw error;
    }
  });

  sendMessage = this.asyncHandler(async (req: Request, res: Response) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) return this.error(res, 'Message content is required', 400);

    try {
      const reply = await assistantChatService.sendMessage(req.user!, this.paramString(req, 'id'), content);
      this.success(res, reply);
    } catch (error) {
      if (!this.handleServiceError(res, error)) throw error;
    }
  });
}

export default new AssistantController();

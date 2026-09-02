import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import * as connectionService from '../services/assistant-provider-connection.service';

/**
 * PM-only management of the tenant's LLM connection for the analytics
 * assistant — distinct from the pm+executive chat endpoints
 * (assistant.controller.ts). Configuring the credential is a PM action,
 * same as every other Settings integration in this app; tenant is always
 * derived from req.user, never a client-supplied id.
 */
export class AssistantProviderConnectionController extends BaseController {
  save = this.asyncHandler(async (req: Request, res: Response) => {
    const { provider, apiKey, modelId } = req.body ?? {};
    if (typeof provider !== 'string' || typeof apiKey !== 'string' || !apiKey.trim()) {
      return this.error(res, 'provider and apiKey are required', 400);
    }

    const result = await connectionService.saveConnection({
      tenantId: req.user!.tenantId!,
      userId: req.user!.id,
      provider,
      apiKey: apiKey.trim(),
      modelId: typeof modelId === 'string' && modelId.trim() ? modelId.trim() : undefined,
    });

    if (!result.success) return this.error(res, result.message, 400);
    this.success(res, undefined, result.message);
  });

  status = this.asyncHandler(async (req: Request, res: Response) => {
    const status = await connectionService.getStatus(req.user!.tenantId!);
    this.success(res, status);
  });

  remove = this.asyncHandler(async (req: Request, res: Response) => {
    const result = await connectionService.deleteConnection(req.user!.tenantId!);
    if (!result.success) return this.error(res, result.message, 400);
    this.success(res, undefined, result.message);
  });
}

export default new AssistantProviderConnectionController();

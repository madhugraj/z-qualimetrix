import { Request, Response } from 'express';
import { BaseController } from './base.controller';
import { getDeveloperHealthProfiles, BURNOUT_FORMULA_LABEL } from '../services/engineering-health.service';

export class EngineeringHealthController extends BaseController {
  getDeveloperProfiles = this.asyncHandler(async (req: Request, res: Response) => {
    const tenantId = this.getTenantId(req);
    if (!tenantId) return this.error(res, 'No tenant associated with this account', 403);

    const developers = await getDeveloperHealthProfiles(tenantId);
    this.success(res, { developers, burnoutFormula: BURNOUT_FORMULA_LABEL });
  });
}

export default new EngineeringHealthController();

/**
 * Tenant-scoped CRUD for AiModelCatalog — the concrete "add a new provider /
 * manage pricing" surface. Writes are always tenant-scoped (tenantId from
 * req.user, never null/global) and requireAdmin-gated; a tenant can only ever
 * edit its own rows, never a global default or another tenant's override.
 * Reads merge tenant + global rows via the same getModelCatalog() the
 * dashboard itself uses, so this always reflects exactly what pricing the
 * cost math is using.
 */

import { Request, Response } from 'express';
import prisma from '../../lib/prisma';

/**
 * Deliberately NOT getModelCatalog() — that function collapses a tenant
 * override and the global default for the same modelId into one row (for
 * cost-lookup purposes) and exposes modelId as `id`, dropping the row's real
 * UUID entirely. An admin management view needs the opposite: every distinct
 * row, with its real primary key, so a tenant can see both "here's the global
 * default" and "here's our own override" and edit/deactivate the right one.
 */
export async function listModelCatalog(req: Request, res: Response) {
  const tenantId = req.user!.tenantId;
  if (!tenantId) return res.status(403).json({ success: false, error: 'Not assigned to an organization yet' });

  const rows = await prisma.aiModelCatalog.findMany({
    where: { OR: [{ tenantId }, { tenantId: null }] },
    orderBy: [{ modelId: 'asc' }, { tenantId: 'desc' }],
  });
  res.json({ success: true, data: rows });
}

/** Shared by both create and update — modelId is checked separately since it's immutable on update. */
function validatePricingFields(body: any): string | null {
  if (typeof body?.name !== 'string' || !body.name.trim()) return 'name is required';
  if (typeof body?.vendor !== 'string' || !body.vendor.trim()) return 'vendor is required';
  if (typeof body?.priceIn !== 'number' || !Number.isFinite(body.priceIn) || body.priceIn < 0) return 'priceIn must be a non-negative number';
  if (typeof body?.priceOut !== 'number' || !Number.isFinite(body.priceOut) || body.priceOut < 0) return 'priceOut must be a non-negative number';
  if (body.cacheDiscount !== undefined) {
    if (typeof body.cacheDiscount !== 'number' || body.cacheDiscount < 0 || body.cacheDiscount > 1) {
      return 'cacheDiscount must be a number between 0 and 1';
    }
  }
  return null;
}

export async function createModelCatalogEntry(req: Request, res: Response) {
  const tenantId = req.user!.tenantId;
  if (!tenantId) return res.status(403).json({ success: false, error: 'Not assigned to an organization yet' });

  if (typeof req.body?.modelId !== 'string' || !req.body.modelId.trim()) {
    return res.status(400).json({ success: false, error: 'modelId is required' });
  }
  const error = validatePricingFields(req.body);
  if (error) return res.status(400).json({ success: false, error });

  const { modelId, name, vendor, purpose, priceIn, priceOut, cacheDiscount } = req.body;
  try {
    const created = await prisma.aiModelCatalog.create({
      data: {
        modelId: modelId.trim(),
        name: name.trim(),
        vendor: vendor.trim(),
        purpose: purpose ?? null,
        priceIn,
        priceOut,
        cacheDiscount: cacheDiscount ?? 0.9,
        isActive: true,
        tenantId,
      },
    });
    res.json({ success: true, data: created });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Your organization already has a pricing row for this modelId' });
    }
    throw err;
  }
}

export async function updateModelCatalogEntry(req: Request, res: Response) {
  const tenantId = req.user!.tenantId;
  if (!tenantId) return res.status(403).json({ success: false, error: 'Not assigned to an organization yet' });

  const { id } = req.params;
  const existing = await prisma.aiModelCatalog.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return res.status(404).json({ success: false, error: 'Catalog entry not found' });
  }

  // existing's priceIn/priceOut/cacheDiscount are Prisma Decimal objects, not
  // JS numbers — merging them straight into req.body for validation made an
  // unchanged field fail its own typeof-number check. Convert explicitly.
  const merged = {
    name: req.body.name ?? existing.name,
    vendor: req.body.vendor ?? existing.vendor,
    priceIn: req.body.priceIn ?? Number(existing.priceIn),
    priceOut: req.body.priceOut ?? Number(existing.priceOut),
    cacheDiscount: req.body.cacheDiscount ?? Number(existing.cacheDiscount ?? 0.9),
  };

  const error = validatePricingFields(merged);
  if (error) return res.status(400).json({ success: false, error });

  const updated = await prisma.aiModelCatalog.update({
    where: { id },
    data: { ...merged, purpose: req.body.purpose ?? existing.purpose },
  });
  res.json({ success: true, data: updated });
}

export async function deactivateModelCatalogEntry(req: Request, res: Response) {
  const tenantId = req.user!.tenantId;
  if (!tenantId) return res.status(403).json({ success: false, error: 'Not assigned to an organization yet' });

  const { id } = req.params;
  const existing = await prisma.aiModelCatalog.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return res.status(404).json({ success: false, error: 'Catalog entry not found' });
  }

  await prisma.aiModelCatalog.update({ where: { id }, data: { isActive: false } });
  res.json({ success: true });
}

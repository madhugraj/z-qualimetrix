import { Request, Response } from "express";
import gpuSpendAnalyticsService from "../services/gpu-spend-analytics.service";

const LEADERSHIP_ROLES = ["pm", "executive"];

function resolveTenant(req: Request, res: Response): string | null {
  if (!req.user?.tenantId) {
    res.status(403).json({ success: false, error: "Not assigned to an organization yet" });
    return null;
  }
  if (!LEADERSHIP_ROLES.includes(req.user.role)) {
    res.status(403).json({ success: false, error: "GPU spend analytics are visible to PM/Executive roles only" });
    return null;
  }
  return req.user.tenantId;
}

function parseDate(value: unknown): Date | undefined {
  return typeof value === "string" && value ? new Date(value) : undefined;
}

export async function getGpuSpendSummary(req: Request, res: Response) {
  const tenantId = resolveTenant(req, res);
  if (!tenantId) return;
  res.json({ success: true, data: await gpuSpendAnalyticsService.getSummary(tenantId) });
}

export async function getGpuSpendTrend(req: Request, res: Response) {
  const tenantId = resolveTenant(req, res);
  if (!tenantId) return;
  const data = await gpuSpendAnalyticsService.getSpendTrend(
    tenantId,
    parseDate(req.query.startDate),
    parseDate(req.query.endDate),
  );
  res.json({ success: true, data });
}

export async function getGpuSpendBySquad(req: Request, res: Response) {
  const tenantId = resolveTenant(req, res);
  if (!tenantId) return;
  res.json({ success: true, data: await gpuSpendAnalyticsService.getSpendBySquad(tenantId) });
}

export async function getGpuSpendByType(req: Request, res: Response) {
  const tenantId = resolveTenant(req, res);
  if (!tenantId) return;
  res.json({ success: true, data: await gpuSpendAnalyticsService.getSpendByGpuType(tenantId) });
}

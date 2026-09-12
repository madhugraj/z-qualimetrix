import { Request, Response } from 'express';
import { getNotifications, markNotificationRead, markNotificationsRead } from '../services/notification.service';

export async function listNotifications(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const result = await getNotifications(req.user);
  res.json({ success: true, data: result });
}

export async function markRead(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const id = String(req.params.id ?? '');
  if (!id) return res.status(400).json({ success: false, error: 'Notification id is required' });
  await markNotificationRead(req.user, id);
  res.json({ success: true });
}

export async function markAllRead(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
    return res.status(400).json({ success: false, error: 'ids must be an array of strings' });
  }
  await markNotificationsRead(req.user, ids);
  res.json({ success: true });
}

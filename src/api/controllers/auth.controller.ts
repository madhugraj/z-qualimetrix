/**
 * Session authentication controller.
 * Distinct from src/lib/jwt.ts, which signs the Jira/Azure DevOps OAuth
 * `state` parameter — both reuse the same validated JWT_SECRET (see that
 * file's assertJwtSecretConfigured, called once at server boot), but the
 * claim shapes never overlap: OAuthStatePayload has no `sub`, and a session
 * token has no `tenantId`/`provider`/`nonce`, so neither can be replayed as
 * the other even though they share a secret.
 */

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { hashToken, generateSecureToken } from '../../lib/encryption';

const prisma = new PrismaClient();

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ACCESS_COOKIE = 'qm_access_token';
const REFRESH_COOKIE = 'qm_refresh_token';
const BCRYPT_COST = 12;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return secret;
}

function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 15 * 60 * 1000,
    path: '/',
  };
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: '/api/v1/auth',
  };
}

export async function issueSession(res: Response, userId: string) {
  const accessToken = jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: ACCESS_TOKEN_TTL });
  const rawRefreshToken = generateSecureToken();
  await prisma.refreshToken.create({
    data: {
      token: hashToken(rawRefreshToken),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
  res.cookie(REFRESH_COOKIE, rawRefreshToken, refreshCookieOptions());
}

function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

/** POST /api/v1/auth/login */
export async function login(req: Request, res: Response) {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const genericError = { success: false, error: 'Invalid email or password' };

    if (!email || !password) return res.status(401).json(genericError);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || !user.isActive) {
      return res.status(401).json(genericError);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json(genericError);

    await issueSession(res, user.id);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId },
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ success: false, error: 'Failed to log in' });
  }
}

/** POST /api/v1/auth/refresh */
export async function refresh(req: Request, res: Response) {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const existing = await prisma.refreshToken.findUnique({ where: { token: hashToken(rawToken) } });
    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      clearSessionCookies(res);
      return res.status(401).json({ success: false, error: 'Session expired' });
    }

    const user = await prisma.user.findUnique({ where: { id: existing.userId } });
    if (!user || !user.isActive) {
      clearSessionCookies(res);
      return res.status(401).json({ success: false, error: 'Account not found or deactivated' });
    }

    // Rotate: revoke the presented refresh token before issuing a new one, so
    // a stolen-but-unused token becomes worthless the next time the real
    // user refreshes.
    await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    await issueSession(res, user.id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error refreshing session:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh session' });
  }
}

/** POST /api/v1/auth/logout */
export async function logout(req: Request, res: Response) {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      await prisma.refreshToken.updateMany({
        where: { token: hashToken(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearSessionCookies(res);
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({ success: false, error: 'Failed to log out' });
  }
}

/** GET /api/v1/auth/me — requires requireAuth to have populated req.user */
export async function me(req: Request, res: Response) {
  res.json({ success: true, user: req.user });
}

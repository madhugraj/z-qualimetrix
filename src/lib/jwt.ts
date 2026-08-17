import jwt from 'jsonwebtoken';

/**
 * Centralizes jsonwebtoken usage, mirroring how lib/encryption.ts centralizes
 * token crypto. Currently used to sign/verify the short-lived OAuth `state`
 * parameter for the Jira/Azure DevOps connect flows (see integration.controller.ts).
 */

const PLACEHOLDER_SECRET = 'your-super-secret-jwt-key-change-in-production';
const MIN_SECRET_LENGTH = 16;

/**
 * Fails closed at import time if JWT_SECRET is missing, too short, or left at
 * the .env.example placeholder. JWT_SECRET now signs OAuth state (a forged
 * state could attach an attacker-controlled Jira/ADO account to any tenant),
 * so a weak/default secret is no longer safe to silently run with.
 */
function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH || secret === PLACEHOLDER_SECRET) {
    throw new Error(
      'JWT_SECRET is missing, too short, or left at its placeholder value. ' +
      'Set a strong random secret (e.g. `openssl rand -base64 32`) in your .env before starting the server.'
    );
  }
  return secret;
}

/**
 * Called once at server boot (see server.ts). Fails fast and loudly rather
 * than letting the server start with a forgeable OAuth state secret.
 */
export function assertJwtSecretConfigured(): void {
  getSecret();
}

export interface OAuthStatePayload {
  tenantId: string;
  userId: string;
  provider: string;
  nonce: string;
}

const OAUTH_STATE_TTL = '10m';

export function signOAuthState(payload: OAuthStatePayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: OAUTH_STATE_TTL });
}

export function verifyOAuthState(token: string): OAuthStatePayload {
  const decoded = jwt.verify(token, getSecret());
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Malformed OAuth state token');
  }
  const { tenantId, userId, provider, nonce } = decoded as Record<string, unknown>;
  if (typeof tenantId !== 'string' || typeof userId !== 'string' || typeof provider !== 'string' || typeof nonce !== 'string') {
    throw new Error('Malformed OAuth state token');
  }
  return { tenantId, userId, provider, nonce };
}

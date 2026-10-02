import { createHash, randomBytes } from 'node:crypto';

export function hashCredential(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function generateCredential(prefix: string, bytes = 32) {
  const secret = `${prefix}_${randomBytes(bytes).toString('base64url')}`;
  return {
    secret,
    prefix: secret.slice(0, Math.min(24, secret.length)),
    hash: hashCredential(secret),
  };
}

export function normalizeScopes(scopes: string[]) {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
}

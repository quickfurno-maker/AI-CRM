import { NextResponse } from 'next/server';

export const API_BASE_URL =
  process.env.API_BASE_URL ?? 'http://localhost:4000/v1';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

const secure = process.env.NODE_ENV === 'production';

export function setAuthCookies(response: NextResponse, tokens: AuthTokens) {
  response.cookies.set('crm_ai_access', tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.expiresIn,
  });
  response.cookies.set('crm_ai_refresh', tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set('crm_ai_access', '', { path: '/', maxAge: 0 });
  response.cookies.set('crm_ai_refresh', '', { path: '/', maxAge: 0 });
}

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  API_BASE_URL,
  clearAuthCookies,
  setAuthCookies,
  type AuthTokens,
} from '@/lib/server-auth';

async function forward(request: NextRequest) {
  const store = await cookies();
  let accessToken = store.get('crm_ai_access')?.value;
  const refreshToken = store.get('crm_ai_refresh')?.value;
  let rotated: AuthTokens | undefined;

  const target = new URL(`${API_BASE_URL}/marketplace`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  const send = (token?: string) =>
    fetch(target, {
      method: request.method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });

  let upstream = await send(accessToken);
  if (upstream.status === 401 && refreshToken) {
    const refreshed = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (refreshed.ok) {
      rotated = (await refreshed.json()) as AuthTokens;
      accessToken = rotated.accessToken;
      upstream = await send(accessToken);
    }
  }

  const response = new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
    },
  });
  if (rotated) setAuthCookies(response, rotated);
  if (upstream.status === 401) clearAuthCookies(response);
  return response;
}

export const GET = forward;

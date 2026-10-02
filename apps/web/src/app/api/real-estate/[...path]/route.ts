import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  API_BASE_URL,
  clearAuthCookies,
  setAuthCookies,
  type AuthTokens,
} from '@/lib/server-auth';

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const store = await cookies();
  let accessToken = store.get('crm_ai_access')?.value;
  const refreshToken = store.get('crm_ai_refresh')?.value;
  let rotated: AuthTokens | undefined;

  const target = new URL(`${API_BASE_URL}/real-estate/${path.join('/')}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  const method = request.method;
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await request.text();

  const send = (token?: string) =>
    fetch(target, {
      method,
      headers: {
        ...(request.headers.get('content-type')
          ? { 'content-type': request.headers.get('content-type') as string }
          : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body,
      cache: 'no-store',
    });

  let upstream = await send(accessToken);

  if (upstream.status === 401 && refreshToken) {
    const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (refreshResponse.ok) {
      rotated = (await refreshResponse.json()) as AuthTokens;
      accessToken = rotated.accessToken;
      upstream = await send(accessToken);
    }
  }

  const responseBody = await upstream.text();
  const response = new NextResponse(responseBody || null, {
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
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;

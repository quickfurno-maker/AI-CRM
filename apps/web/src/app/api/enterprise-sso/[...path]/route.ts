import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL, setAuthCookies, type AuthTokens } from '@/lib/server-auth';

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const target = new URL(
    `${API_BASE_URL}/enterprise/sso/oidc/${path.join('/')}`,
  );
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  const method = request.method;
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await request.text();
  const upstream = await fetch(target, {
    method,
    headers: request.headers.get('content-type')
      ? { 'content-type': request.headers.get('content-type') as string }
      : {},
    body,
    cache: 'no-store',
  });
  const text = await upstream.text();
  const response = new NextResponse(text || null, {
    status: upstream.status,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
    },
  });

  if (
    upstream.ok &&
    path[path.length - 1] === 'exchange' &&
    text
  ) {
    try {
      const payload = JSON.parse(text) as { tokens?: AuthTokens };
      if (payload.tokens) setAuthCookies(response, payload.tokens);
    } catch {
      // Upstream response validation remains authoritative.
    }
  }
  return response;
}

export const GET = forward;
export const POST = forward;

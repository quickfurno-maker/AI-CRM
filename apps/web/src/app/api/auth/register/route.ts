import { NextResponse } from 'next/server';
import { API_BASE_URL, setAuthCookies, type AuthTokens } from '@/lib/server-auth';

export async function POST(request: Request) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = await upstream.json();
  if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status });

  const response = NextResponse.json({
    user: payload.user,
    organization: payload.organization,
  });
  setAuthCookies(response, payload.tokens as AuthTokens);
  return response;
}

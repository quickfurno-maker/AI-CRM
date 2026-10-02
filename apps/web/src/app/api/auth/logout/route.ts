import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE_URL, clearAuthCookies } from '@/lib/server-auth';

export async function POST() {
  const store = await cookies();
  const accessToken = store.get('crm_ai_access')?.value;
  if (accessToken) {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);
  return response;
}

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  API_BASE_URL,
  clearAuthCookies,
  setAuthCookies,
  type AuthTokens,
} from '@/lib/server-auth';

async function loadTenantData(accessToken: string) {
  const headers = { authorization: `Bearer ${accessToken}` };
  const [organization, capabilities] = await Promise.all([
    fetch(`${API_BASE_URL}/organization/current`, { headers, cache: 'no-store' }),
    fetch(`${API_BASE_URL}/capabilities`, { headers, cache: 'no-store' }),
  ]);

  if (organization.status === 401 || capabilities.status === 401) {
    return { unauthorized: true as const };
  }
  if (!organization.ok || !capabilities.ok) {
    return {
      error: true as const,
      status: Math.max(organization.status, capabilities.status),
    };
  }
  return {
    organization: await organization.json(),
    capabilities: await capabilities.json(),
  };
}

export async function GET() {
  const store = await cookies();
  let accessToken = store.get('crm_ai_access')?.value;
  const refreshToken = store.get('crm_ai_refresh')?.value;
  let rotatedTokens: AuthTokens | undefined;

  let tenantData = accessToken ? await loadTenantData(accessToken) : { unauthorized: true as const };

  if ('unauthorized' in tenantData && tenantData.unauthorized) {
    if (!refreshToken) {
      const response = NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
      clearAuthCookies(response);
      return response;
    }

    const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!refreshResponse.ok) {
      const response = NextResponse.json({ message: 'Session expired.' }, { status: 401 });
      clearAuthCookies(response);
      return response;
    }

    rotatedTokens = (await refreshResponse.json()) as AuthTokens;
    accessToken = rotatedTokens.accessToken;
    tenantData = await loadTenantData(accessToken);
  }

  if ('unauthorized' in tenantData || 'error' in tenantData) {
    const status = 'error' in tenantData ? tenantData.status : 401;
    return NextResponse.json({ message: 'Unable to load tenant session.' }, { status });
  }

  const response = NextResponse.json(tenantData);
  if (rotatedTokens) setAuthCookies(response, rotatedTokens);
  return response;
}

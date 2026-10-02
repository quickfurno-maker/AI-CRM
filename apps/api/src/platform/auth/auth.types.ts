export type Principal = {
  userId: string;
  organizationId: string;
  membershipId: string;
  sessionId: string;
  isPlatformAdmin: boolean;
  actorType?: 'USER' | 'AI_AGENT' | 'AUTOMATION' | 'SYSTEM' | 'API' | 'INTEGRATION';
  actorId?: string;
};

export type AccessTokenPayload = {
  sub: string;
  org: string;
  membership: string;
  sid: string;
};

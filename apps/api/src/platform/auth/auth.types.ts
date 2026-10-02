export type Principal = {
  userId: string;
  organizationId: string;
  membershipId: string;
  sessionId: string;
  isPlatformAdmin: boolean;
  actorType?: 'USER' | 'AI_AGENT' | 'AUTOMATION' | 'SYSTEM' | 'API' | 'INTEGRATION';
  actorId?: string;
  authType?: 'SESSION' | 'API_KEY' | 'OAUTH';
  authScopes?: string[];
  seatClass?: 'FULL' | 'LIGHT' | 'ATTENDANCE_ONLY' | 'GUEST';
  permissionKey?: string;
  permissionScope?: 'OWN' | 'TEAM' | 'BRANCH' | 'WORKSPACE' | 'ORGANIZATION';
};

export type AccessTokenPayload = {
  sub: string;
  org: string;
  membership: string;
  sid: string;
};

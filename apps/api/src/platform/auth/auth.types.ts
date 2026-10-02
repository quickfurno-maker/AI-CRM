export type Principal = {
  userId: string;
  organizationId: string;
  membershipId: string;
  sessionId: string;
  isPlatformAdmin: boolean;
};

export type AccessTokenPayload = {
  sub: string;
  org: string;
  membership: string;
  sid: string;
};

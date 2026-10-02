import { SetMetadata } from '@nestjs/common';

export const REQUIRED_ENTITLEMENT_KEY = 'auth:requiredEntitlement';

export const RequireEntitlement = (entitlement: string) =>
  SetMetadata(REQUIRED_ENTITLEMENT_KEY, entitlement);

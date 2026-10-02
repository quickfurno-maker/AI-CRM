export const CORE_PERMISSIONS = [
  {
    key: 'organization.read',
    description: 'Read organization profile and structure.',
  },
  {
    key: 'organization.manage',
    description: 'Change organization settings and structure.',
  },
  {
    key: 'members.read',
    description: 'Read organization members.',
  },
  {
    key: 'members.manage',
    description: 'Invite, update, suspend and remove members.',
  },
  {
    key: 'roles.manage',
    description: 'Create roles and grant permissions.',
  },
  {
    key: 'billing.read',
    description: 'Read subscription and entitlement information.',
  },
  {
    key: 'billing.manage',
    description: 'Change plans and billing settings.',
  },
  {
    key: 'feature_flags.read',
    description: 'Read enabled feature flags.',
  },
  {
    key: 'audit.read',
    description: 'Read tenant audit logs.',
  },
  {
    key: 'api_keys.manage',
    description: 'Create and revoke tenant API keys.',
  },
] as const;

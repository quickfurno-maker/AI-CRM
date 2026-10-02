import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z
      .string()
      .url()
      .default('postgresql://crm_ai:crm_ai_dev@localhost:55432/crm_ai'),
    REDIS_URL: z.string().url().default('redis://localhost:56379'),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32)
      .default('dev-only-secret-change-before-production-123456'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    META_TRANSPORT_MODE: z.enum(['disabled', 'mock', 'live']).default('disabled'),
    META_GRAPH_VERSION: z.string().optional(),
    META_APP_ID: z.string().optional(),
    META_EMBEDDED_SIGNUP_CONFIG_ID: z.string().optional(),
    META_PROVIDER_BUSINESS_ID: z.string().optional(),
    META_SYSTEM_USER_ID: z.string().optional(),
    META_SYSTEM_USER_ACCESS_TOKEN: z.string().optional(),
    META_APP_SECRET: z.string().optional(),
    META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      env.JWT_ACCESS_SECRET.startsWith('dev-only-secret')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'Production must use a non-development JWT secret.',
      });
    }
    if (env.NODE_ENV === 'production' && env.META_TRANSPORT_MODE === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['META_TRANSPORT_MODE'],
        message: 'Mock Meta transport is not allowed in production.',
      });
    }
    if (env.META_TRANSPORT_MODE === 'live') {
      const required = [
        'META_GRAPH_VERSION',
        'META_APP_ID',
        'META_EMBEDDED_SIGNUP_CONFIG_ID',
        'META_PROVIDER_BUSINESS_ID',
        'META_SYSTEM_USER_ID',
        'META_SYSTEM_USER_ACCESS_TOKEN',
        'META_APP_SECRET',
        'META_WEBHOOK_VERIFY_TOKEN',
      ] as const;

      for (const key of required) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required for live Meta transport.`,
          });
        }
      }
    }
  });

export type Environment = z.infer<typeof schema>;

export function validateEnvironment(config: Record<string, unknown>) {
  return schema.parse(config);
}

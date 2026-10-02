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
  });

export type Environment = z.infer<typeof schema>;

export function validateEnvironment(config: Record<string, unknown>) {
  return schema.parse(config);
}

import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment.js';

describe('environment validation', () => {
  it('accepts safe development defaults', () => {
    const env = validateEnvironment({ NODE_ENV: 'development' });
    expect(env.API_PORT).toBe(4000);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
  });

  it('rejects the development JWT secret in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'dev-only-secret-change-before-production-123456',
      }),
    ).toThrow();
  });

  it('requires the full provider configuration for live Meta transport', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        META_TRANSPORT_MODE: 'live',
      }),
    ).toThrow();
  });

  it('requires an OpenAI API key for live AI transport', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        AI_TRANSPORT_MODE: 'live',
      }),
    ).toThrow();
  });

  it('rejects mock AI transport in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'production-secret-that-is-long-enough-123456',
        AI_TRANSPORT_MODE: 'mock',
      }),
    ).toThrow();
  });
});

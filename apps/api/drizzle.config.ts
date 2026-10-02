import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/platform/database/schema.ts',
    './src/modules/crm/crm.schema.ts',
    './src/modules/communication/communication.schema.ts',
    './src/modules/ai/ai.schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://crm_ai:crm_ai_dev@localhost:55432/crm_ai',
  },
  strict: true,
  verbose: true,
});

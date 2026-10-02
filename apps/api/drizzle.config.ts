import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/platform/database/schema.ts',
    './src/modules/crm/crm.schema.ts',
    './src/modules/communication/communication.schema.ts',
    './src/modules/ai/ai.schema.ts',
    './src/modules/automation/automation.schema.ts',
    './src/modules/business-billing/business-billing.schema.ts',
    './src/extensions/real-estate/real-estate.schema.ts',
    './src/modules/developer/developer.schema.ts',
    './src/modules/enterprise/enterprise.schema.ts',
    './src/modules/staff/staff.schema.ts',
    './src/extensions/attendance/attendance.schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://crm_ai:crm_ai_dev@localhost:15432/crm_ai',
  },
  strict: true,
  verbose: true,
});

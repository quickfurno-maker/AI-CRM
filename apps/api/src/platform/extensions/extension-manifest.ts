import { z } from 'zod';

export const extensionManifestV1Schema = z
  .object({
    schemaVersion: z.literal('1'),
    key: z.string().regex(/^[a-z][a-z0-9-]{2,119}$/),
    name: z.string().min(2).max(180),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
    publisher: z.string().min(2).max(180),
    description: z.string().min(10).max(5000),
    category: z.string().max(80).default('INTEGRATION'),
    apiScopes: z.array(z.string().min(1).max(160)).max(100).default([]),
    eventSubscriptions: z
      .array(z.string().min(1).max(180))
      .max(100)
      .default([]),
    navigation: z
      .object({
        label: z.string().min(1).max(80),
        externalUrl: z.string().url(),
      })
      .optional(),
    configSchema: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ExtensionManifestV1 = z.infer<typeof extensionManifestV1Schema>;

export function parseExtensionManifest(value: unknown) {
  return extensionManifestV1Schema.parse(value);
}

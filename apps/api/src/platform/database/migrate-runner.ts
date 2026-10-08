import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const connectionString =
  process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'MIGRATION_DATABASE_URL or DATABASE_URL is required for database migration.',
  );
}

const migrationsFolder =
  process.env.MIGRATIONS_FOLDER ??
  fileURLToPath(new URL('../../../drizzle', import.meta.url));

const pool = new Pool({
  connectionString,
  max: 1,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 10_000,
});

try {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder });
  console.log('Database migrations applied successfully.');
} finally {
  await pool.end();
}

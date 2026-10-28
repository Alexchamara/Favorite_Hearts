import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Load apps/api/.env locally (hosted environments set real environment variables).
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  // Migrations always run over Neon's DIRECT (non-pooled) connection.
  // `db:generate` works offline; `db:migrate` / `db:studio` need this URL.
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? '' },
  strict: true,
  verbose: true,
});

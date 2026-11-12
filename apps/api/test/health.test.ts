// /health and start-up know when the database is behind the code's migrations (a dev database missing 0008–0011
// answered every /api request with a 500 and the app sat on "Loading…").
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { appliedMigrations, EXPECTED_MIGRATIONS } from '../src/db/migrations.ts';
import { createTestApp } from './harness.ts';

describe('health and migrations', () => {
  test('the API root identifies the service and health endpoint', async () => {
    const t = await createTestApp();
    const res = await t.app.request('/');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      service: 'favorite-hearts-api',
      status: 'ok',
      health: '/health',
    });
  });

  test('a database with every migration is healthy; one behind is not, and says by how much', async () => {
    const t = await createTestApp();
    assert.ok(EXPECTED_MIGRATIONS >= 12);
    assert.equal(await appliedMigrations(t.db), EXPECTED_MIGRATIONS);
    let res = await t.app.request('/health');
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).migrations, { applied: EXPECTED_MIGRATIONS, expected: EXPECTED_MIGRATIONS });

    // Forget the last four migrations, as a database migrated only up to 0007 would look.
    await t.db.execute(sql`delete from drizzle.__drizzle_migrations where id in (select id from drizzle.__drizzle_migrations order by id desc limit 4)`);
    res = await t.app.request('/health');
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.database, true);
    assert.deepEqual(body.migrations, { applied: EXPECTED_MIGRATIONS - 4, expected: EXPECTED_MIGRATIONS });
  });
});

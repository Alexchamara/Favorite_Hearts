/**
 * Staff account administration, run by the developer together with the owner:
 *
 *   npm run staff -w @fh/api -- invite --email owner@example.lk --name "Owner Name" --role owner
 *   npm run staff -w @fh/api -- revoke --email person@example.lk
 *   npm run staff -w @fh/api -- reset-2fa --email person@example.lk
 *   npm run staff -w @fh/api -- add --email owner@example.lk --name "Owner Name" --role owner   (member-app staff screens only)
 *
 * `invite` prints a link to the admin site (ADMIN_URL) that works once, for 24 hours: the person chooses their own
 * password and sets up two-step login there, so nobody else ever knows it. Use it for the first owner; the owner
 * invites the backup reviewer from the admin site (phase admin-3). Revoking and resetting are audited and email the
 * security mailbox (SECURITY_ALERT_EMAIL). Uses the database in apps/api/.env. See docs/ADMIN-PANEL-PLAN.md.
 */
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { STAFF_ROLES, type StaffRole } from '@fh/shared';
import { createAuth } from '../src/auth.ts';
import { createDb } from '../src/db/client.ts';
import { configFromEnv, env } from '../src/env.ts';
import { createStaffInvite } from '../src/admin/invites.ts';
import { addStaff, resetTwoFactor, revokeStaff } from '../src/lib/staff-accounts.ts';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    output._writeToOutput = (text) => {
      if (text.includes(question)) process.stdout.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' } },
});
const [command] = positionals;
const { db, pool } = createDb(env.DATABASE_URL_DIRECT);
const unused = async () => {
  throw new Error('Not used by staff administration.');
};
const config = configFromEnv();
const auth = createAuth({ db, config, messenger: { smsEnabled: false, sendEmail: unused, sendSms: unused } });

try {
  if (!values.email) throw new Error('Pass --email.');
  if (command === 'invite') {
    const role = values.role as StaffRole;
    if (!STAFF_ROLES.includes(role)) throw new Error(`Pass --role ${STAFF_ROLES.join(' or ')}.`);
    if (!values.name) throw new Error('Pass --name.');
    const { link, expiresAt } = await createStaffInvite({ db, config }, { email: values.email, name: values.name, role, invitedBy: null });
    console.log(`Invitation for ${role} (works once, until ${expiresAt.toISOString()}):\n${link}`);
    console.log('Give the link to the person directly (not by email to a shared inbox). They set their password and two-step login there.');
  } else if (command === 'add') {
    const role = values.role as StaffRole;
    if (!STAFF_ROLES.includes(role)) throw new Error(`Pass --role ${STAFF_ROLES.join(' or ')}.`);
    if (!values.name) throw new Error('Pass --name.');
    const password = await askHidden('New password (12+ characters): ');
    if (password !== (await askHidden('Repeat the password: '))) throw new Error('The passwords do not match.');
    await addStaff({ auth, db }, { email: values.email, name: values.name, role, password });
    console.log(`Added ${role}. At first sign-in they must turn on two-step login; staff screens stay locked until then.`);
  } else if (command === 'revoke') {
    await revokeStaff({ db, config }, values.email);
    console.log('Staff access revoked and all sessions ended.');
  } else if (command === 'reset-2fa') {
    await resetTwoFactor({ db, config }, values.email);
    console.log('Two-step login and passkeys removed and all sessions ended. On the admin site, send them a new invitation.');
  } else {
    throw new Error('Use: invite | revoke | reset-2fa | add');
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

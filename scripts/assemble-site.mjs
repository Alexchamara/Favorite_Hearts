// Combine the two front-end builds into one folder for static hosting (Cloudflare Pages):
//   dist/site/        <- apps/website/dist   (public website at /)
//   dist/site/app/    <- apps/member/dist    (member app at /app/)
// Run via `npm run build:site`.
import { access, cp, rm } from 'node:fs/promises';

const out = new URL('../dist/site/', import.meta.url);
const parts = [
  ['website', new URL('../apps/website/dist/', import.meta.url), out],
  ['member app', new URL('../apps/member/dist/', import.meta.url), new URL('app/', out)],
];

for (const [name, from] of parts) {
  try {
    await access(from);
  } catch {
    console.error(`The ${name} has not been built yet. Run \`npm run build:site\`.`);
    process.exit(1);
  }
}

await rm(out, { recursive: true, force: true });
for (const [, from, to] of parts) await cp(from, to, { recursive: true });
console.log('Site ready in dist/site — website at /, member app at /app/.');

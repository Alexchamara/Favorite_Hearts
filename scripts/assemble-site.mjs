// Combine the two front-end builds into one folder for static hosting (Cloudflare Pages):
//   dist/site/        <- apps/website/dist   (public website at /)
//   dist/site/app/    <- apps/member/dist    (member app at /app/)
// Run via `npm run build:site`.
import { access, cp, readFile, rm, writeFile } from 'node:fs/promises';

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

// The pricing page reads the live plans from the API. When the API has its own address (VITE_API_URL, the same value
// the member app is built with), the website's security policy must allow calls to it.
const apiUrl = process.env.VITE_API_URL?.trim();
if (apiUrl) {
  const headers = new URL('_headers', out);
  const text = await readFile(headers, 'utf8');
  const origin = new URL(apiUrl).origin;
  await writeFile(headers, text.replace("connect-src 'self';", `connect-src 'self' ${origin};`));
  console.log(`Website policy allows the API at ${origin}.`);
}
console.log('Site ready in dist/site — website at /, member app at /app/.');

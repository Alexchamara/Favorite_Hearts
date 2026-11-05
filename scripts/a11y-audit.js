// The browser accessibility audit (Stage 5e), served by `npm run preview:site` at /__audit/run.js and never deployed.
// On any page of the preview, run in the browser's console:   (await import('/__audit/run.js')).audit()
// It checks the page as it is on screen (open a menu or dialog first to check it too) against WCAG 2.2 A and AA and
// axe's best practices, prints each problem with the elements it found, and returns the list.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function loadAxe() {
  if (window.axe) return window.axe;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/__audit/axe.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('axe-core did not load: is this `npm run preview:site`?'));
    document.head.append(script);
  });
  return window.axe;
}

export async function audit() {
  const axe = await loadAxe();
  const { violations } = await axe.run(document, { runOnly: { type: 'tag', values: TAGS } });
  const rows = violations.map((v) => ({
    impact: v.impact,
    rule: v.id,
    count: v.nodes.length,
    where: v.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | '),
    why: (v.nodes[0]?.any[0] ?? v.nodes[0]?.all[0] ?? v.nodes[0]?.none[0])?.message ?? v.help,
  }));
  if (rows.length) console.table(rows);
  else console.log(`No accessibility problems found on ${location.pathname} (axe-core ${axe.version}).`);
  return rows;
}

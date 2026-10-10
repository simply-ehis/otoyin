// Post-migration smoke test: production build must boot, route, and the
// workspace routes (whose imports moved trees) must actually resolve.
const { chromium } = require('playwright');
const URL = 'http://localhost:43118/';

(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 150)));
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/CORS|Failed to load resource/.test(t)) {
      errs.push('CONSOLE: ' + t.slice(0, 150));
    }
  });

  const t0 = Date.now();
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForSelector('nav a', { timeout: 60000 });
  const boot = Date.now() - t0;
  const navLinks = await p.locator('nav a').count();

	// Routes that exercise the moved Workspace imports plus general coverage.
	// Note: /studio is a child of /workspace (workspaceRoute); bare /studio
	// falls through to a minimal shell without the sidebar.
	const routes = ['/workspace/studio', '/workspace', '/voices', '/library', '/store',
	                '/settings', '/generate', '/stories'];
  const rows = [];
  for (const r of routes) {
    const before = errs.length;
    await p.goto(URL.replace(/\/$/, '') + r, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(1000);
    rows.push({
      route: r,
      nav: await p.locator('nav a').count(),
      // A chunk-load failure renders a bare error; a real route renders content.
      content: (await p.locator('main, [role=main]').first().innerText().catch(() => '')).length,
      newErrors: errs.length - before,
    });
  }

  console.log('boot ms:', boot, ' nav links:', navLinks);
  console.table(rows);
  console.log('errors:', [...new Set(errs)].slice(0, 6).join('\n  ') || 'none');
  const bad = rows.filter((r) => r.nav < 17 || r.newErrors > 0);
  console.log('\n' + (bad.length ? 'ISSUES: ' + JSON.stringify(bad) : 'all routes clean'));
  await b.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
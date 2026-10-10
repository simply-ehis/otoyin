const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });

  // Fresh profile => empty localStorage, so nothing is pre-warmed.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const js = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (u.endsWith('.js') || u.includes('.js?')) {
      let len = 0;
      try { len = (await r.body()).length; } catch { /* ignore */ }
      js.push({ u: u.split('/').pop().split('?')[0], len });
    }
  });

  const t0 = Date.now();
  await page.goto('http://localhost:21132/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  const domContentLoaded = Date.now() - t0;

  // First paint / first meaningful content.
  await page.waitForSelector('nav, main, aside', { timeout: 60000 }).catch(() => {});
  const navVisible = Date.now() - t0;

  await page.waitForTimeout(6000);
  const totalJs = js.reduce((a, b) => a + b.len, 0);

  // Split by phase: everything already fetched by the time nav appeared
  // is startup-critical; the rest is lazy.
  const startup = js.slice(0, js.findIndex((x) => x.u.startsWith('index')) + 1 || js.length);
  const byPhase = {
    domContentLoadedMs: domContentLoaded,
    navVisibleMs: navVisible,
    jsRequests: js.length,
    jsTotalKB: Math.round(totalJs / 1024),
    loaded: js.map((x) => ({ f: x.u, kb: Math.round(x.len / 1024) })),
  };

  console.log(JSON.stringify(byPhase, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
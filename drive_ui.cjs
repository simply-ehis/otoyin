// Drive the real UI in a browser: click the main nav and record failures.

const { chromium } = require('playwright');

(async () => {
  const pageErrors = [];
  const consoleErrors = [];
  const failedReq = [];
  const badResponses = [];

  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 220));
  });
  page.on('requestfailed', (r) =>
    failedReq.push(`${r.url().slice(0, 110)} :: ${r.failure()?.errorText}`),
  );
  page.on('response', (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().slice(0, 110)}`);
  });

  await page.goto('http://localhost:21132/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(4000);

  // Dismiss any modal that blocks interaction.
  for (const sel of ['button:has-text("Next")', '[aria-label="Close"]', 'button:has-text("Skip")']) {
    const el = page.locator(sel).first();
    if (await el.count()) { await el.click({ timeout: 1500 }).catch(() => {}); }
  }
  await page.waitForTimeout(1500);

  const navLabels = await page.locator('nav a, nav button').allInnerTexts().catch(() => []);
  console.log('NAV ITEMS:', JSON.stringify(navLabels.slice(0, 20)));

  const results = [];
  for (const label of ['Generate', 'Voices', 'Audio Studio', 'Settings', 'Store', 'Library']) {
    const before = {
      errs: pageErrors.length,
      cerrs: consoleErrors.length,
      bad: badResponses.length,
    };
    const link = page.locator(`nav a:has-text("${label}"), nav button:has-text("${label}")`).first();
    if (!(await link.count())) {
      results.push({ label, status: 'no nav item' });
      continue;
    }
    await link.click({ timeout: 4000 }).catch((e) => {});
    await page.waitForTimeout(2500);

    const visible = await page.evaluate(() => {
      const main = document.querySelector('main');
      const t = (main?.innerText || '').trim();
      return { chars: t.length, head: t.slice(0, 120).replace(/\s+/g, ' ') };
    });
    results.push({
      label,
      newPageErrors: pageErrors.slice(before.errs),
      newConsoleErrors: consoleErrors.slice(before.cerrs).slice(0, 3),
      newBad: badResponses.slice(before.bad).slice(0, 4),
      content: visible,
    });
  }

  await page.screenshot({ path: 'C:\\Users\\ehis\\AppData\\Local\\Temp\\opencode\\nav.png' });

  console.log('\n=== PER-NAV-RESULT ===');
  for (const r of results) console.log(JSON.stringify(r, null, 2));

  console.log('\n=== TOTALS ===');
  console.log('page errors   :', pageErrors.length);
  console.log('console errors:', consoleErrors.length);
  console.log('failed reqs   :', failedReq.length);
  console.log('4xx/5xx       :', badResponses.length);
  console.log('\n--- unique bad responses ---');
  console.log([...new Set(badResponses)].slice(0, 20).join('\n') || 'none');
  console.log('\n--- console errors ---');
  console.log([...new Set(consoleErrors)].slice(0, 12).join('\n') || 'none');
  console.log('\n--- page errors ---');
  console.log([...new Set(pageErrors)].slice(0, 10).join('\n') || 'none');

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
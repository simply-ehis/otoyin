// Are BOTH first-run modals opening at once, stacked on top of each other?
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  // Fresh profile = genuine first run.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto('http://localhost:21132/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(5000);

  const snapshot = async (label) => {
    const s = await page.evaluate(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')].map((d) => ({
        label: d.getAttribute('aria-label'),
        text: (d.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70),
      }));
      const skipBtns = [...document.querySelectorAll('button')].filter(
        (b) => (b.innerText || '').trim().toLowerCase() === 'skip',
      );
      return {
        dialogCount: dialogs.length,
        dialogs,
        skipButtons: skipBtns.length,
        skipVisible: skipBtns.filter((b) => {
          const r = b.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !!top && (b === top || b.contains(top));
        }).length,
        ls: Object.keys(localStorage),
      };
    });
    console.log(`\n--- ${label} ---`);
    console.log(JSON.stringify(s, null, 2));
    return s;
  };

  await snapshot('fresh first run');

  // Dismiss repeatedly and watch whether the app frees up.
  for (let i = 0; i < 4; i++) {
    const skip = page.locator('button:has-text("Skip")').first();
    if (!(await skip.count())) { console.log(`\nno Skip button on pass ${i + 1}`); break; }
    const clickable = await skip.isVisible().catch(() => false);
    console.log(`\npass ${i + 1}: Skip visible=${clickable}`);
    if (!clickable) break;
    await skip.click({ timeout: 2500, force: true }).catch((e) => console.log('  click err:', e.message.slice(0, 80)));
    await page.waitForTimeout(1500);
    const s = await snapshot(`after skip ${i + 1}`);
    if (s.dialogCount === 0) { console.log('\n*** all modals dismissed ***'); break; }
  }

  // Final: can we actually navigate now?
  const nav = page.locator('nav a:has-text("Voices")').first();
  const urlBefore = page.url();
  await nav.click({ timeout: 4000 }).catch((e) => console.log('nav click:', e.message.slice(0, 70)));
  await page.waitForTimeout(2000);
  console.log(`\nURL ${urlBefore} -> ${page.url()}`);
  console.log('navigation works:', page.url() !== urlBefore);

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
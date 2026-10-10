// Is a full-viewport modal overlay blocking all clicks, and why?
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto('http://localhost:21132/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(4000);

  const state = await page.evaluate(() => {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      ls[k] = (localStorage.getItem(k) || '').slice(0, 300);
    }
    // Radix dialogs render an overlay + content; find the dialog owner.
    const overlays = [...document.querySelectorAll('div')].filter((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        (cs.position === 'fixed') &&
        r.width > window.innerWidth * 0.9 &&
        r.height > window.innerHeight * 0.9 &&
        cs.pointerEvents !== 'none' &&
        Number(cs.zIndex || 0) >= 10
      );
    });
    return {
      ls,
      overlayCount: overlays.length,
      overlayClasses: overlays.map((o) => String(o.className).slice(0, 100)),
      hasRoleDialog: !!document.querySelector('[role="dialog"]'),
      hasAriaModal: !!document.querySelector('[aria-modal="true"]'),
      // Radix sets aria-hidden on siblings while a modal is open.
      bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
    };
  });
  console.log('STATE:', JSON.stringify(state, null, 2));

  // Try to find a working dismiss control and click it for real.
  const dismissSelectors = [
    'button:has-text("Skip")',
    'button[aria-label="Close"]',
    '[role="dialog"] button:has-text("Skip")',
    '[role="dialog"] [data-radix-dialog-close]',
  ];
  for (const sel of dismissSelectors) {
    const loc = page.locator(sel).first();
    const n = await loc.count();
    if (n) {
      const visible = await loc.isVisible().catch(() => false);
      console.log(`dismiss "${sel}": count=${n} visible=${visible}`);
      if (visible) {
        await loc.click({ timeout: 3000 }).catch((e) => console.log('  click failed:', e.message));
        await page.waitForTimeout(1500);
      }
    } else {
      console.log(`dismiss "${sel}": not found`);
    }
  }

  const after = await page.evaluate(() => {
    const nav = document.querySelector('nav a');
    const r = nav.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      overlaysLeft: [...document.querySelectorAll('div')].filter((el) => {
        const cs = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        return cs.position === 'fixed' && b.width > window.innerWidth * 0.9 &&
               b.height > window.innerHeight * 0.9 && cs.pointerEvents !== 'none' &&
               Number(cs.zIndex || 0) >= 10;
      }).length,
      hitTag: hit?.tagName,
      hitCls: String(hit?.className?.baseVal ?? hit?.className ?? '').slice(0, 80),
    };
  });
  console.log('AFTER DISMISS:', JSON.stringify(after, null, 2));

  // Now try a real nav click.
  const nav = page.locator('nav a:has-text("Voices")').first();
  await nav.click({ timeout: 4000 }).catch((e) => console.log('nav click failed:', e.message));
  await page.waitForTimeout(2500);
  console.log('URL after nav click:', page.url());

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
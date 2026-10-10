const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:21132/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(5000);

  const out = await page.evaluate(() => {
    const probe = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, found: false };
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        sel,
        found: true,
        w: Math.round(b.width),
        h: Math.round(b.height),
        width: cs.width,
        height: cs.height,
        flexBasis: cs.flexBasis,
        flexGrow: cs.flexGrow,
        alignSelf: cs.alignSelf,
      };
    };

    // Which stylesheet rules match a size-4 svg, and what does Tailwind think?
    const svg = document.querySelector('svg.size-4');
    const sheets = [...document.styleSheets].map((s) => {
      try {
        return {
          href: s.href ? s.href.split('/').pop() : '(inline)',
          rules: s.cssRules ? s.cssRules.length : -1,
        };
      } catch (e) {
        return { href: s.href ? s.href.split('/').pop() : '(cors)', rules: 'blocked' };
      }
    });

    // Does the utility actually exist in the stylesheet?
    let sizeRule = null;
    for (const s of document.styleSheets) {
      try {
        for (const r of s.cssRules) {
          if (r.selectorText && /(^|,)\s*\.size-4\s*(,|$)/.test(r.selectorText)) {
            sizeRule = r.cssText.slice(0, 200);
          }
        }
      } catch (e) { /* ignore */ }
    }

    return {
      probes: ['.h-screen', 'svg.size-4', 'svg.size-10', '.flex-1', 'main'].map(probe),
      sheets,
      sizeRule,
      rootHeight: document.documentElement.scrollHeight,
    };
  });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
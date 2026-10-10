const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:21132/';
const OUT = 'C:\\Users\\ehis\\AppData\\Local\\Temp\\opencode\\web_render2.png';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(6000);

  const out = await page.evaluate(() => {
    const cls = (el) => {
      const c = el && el.className;
      if (c === undefined || c === null) return '';
      return typeof c === 'string' ? c : String(c.baseVal || '');
    };
    const desc = (el) => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        cls: cls(el).slice(0, 70),
        w: Math.round(b.width),
        h: Math.round(b.height),
        pos: cs.position,
        display: cs.display,
        overflow: cs.overflow,
        flex: cs.flex,
        minH: cs.minHeight,
        height: cs.height,
      };
    };

    // Tallest elements in the document.
    const all = [...document.body.querySelectorAll('*')].map(desc);
    all.sort((a, b) => b.h - a.h);

    // Every SVG and img, with rendered size.
    const media = [...document.querySelectorAll('svg, img, canvas')].map(desc);

    // The element that establishes page height.
    const root = document.getElementById('root');
    const first = root && root.firstElementChild;

    return {
      docScrollH: document.documentElement.scrollHeight,
      viewportH: window.innerHeight,
      rootFirst: first ? desc(first) : null,
      tallest: all.slice(0, 12),
      media: media.slice(0, 15),
      mediaCount: media.length,
    };
  });

  await page.screenshot({ path: OUT });
  console.log(JSON.stringify(out, null, 2));
  console.log('shot:', OUT);
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
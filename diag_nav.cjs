// Diagnose why nav clicks do not change the page.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const navigations = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations.push(f.url());
  });

  await page.goto('http://localhost:21132/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(3500);

  const urlBefore = page.url();
  const headingBefore = await page.locator('main h1, main h2').first().innerText().catch(() => '(none)');

  // What does a nav item actually look like?
  const anatomy = await page.evaluate(() => {
    const nav = document.querySelector('nav');
    if (!nav) return { nav: false };
    const first = nav.querySelector('a, button');
    if (!first) return { nav: true, children: nav.children.length };
    const cs = getComputedStyle(first);
    return {
      nav: true,
      tag: first.tagName,
      href: first.getAttribute('href'),
      text: (first.innerText || '').trim().slice(0, 40),
      pointerEvents: cs.pointerEvents,
      cursor: cs.cursor,
      hasOnclick: !!first.onclick,
      closestA: !!first.closest('a'),
      rect: (() => { const r = first.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
    };
  });
  console.log('NAV ANATOMY:', JSON.stringify(anatomy, null, 2));

  // Is something covering the viewport and eating clicks?
  const topAtNav = await page.evaluate(() => {
    const nav = document.querySelector('nav a, nav button');
    if (!nav) return null;
    const r = nav.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const cls = (el) => String(el?.className?.baseVal ?? el?.className ?? '').slice(0, 90);
    return {
      clickedPointIsNav: hit === nav || nav.contains(hit),
      hitTag: hit?.tagName,
      hitCls: cls(hit),
      isOverlay: hit !== nav && !nav.contains(hit),
    };
  });
  console.log('HIT TEST AT NAV:', JSON.stringify(topAtNav, null, 2));

  // Overlays that could be intercepting.
  const overlays = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const covers = r.width > window.innerWidth * 0.8 && r.height > window.innerHeight * 0.8;
      if ((cs.position === 'fixed' || cs.position === 'absolute') && covers && cs.pointerEvents !== 'none') {
        if (Number(cs.zIndex || 0) >= 10) {
          out.push({
            tag: el.tagName,
            cls: String(el.className?.baseVal ?? el.className ?? '').slice(0, 80),
            z: cs.zIndex,
            opacity: cs.opacity,
            bg: cs.backgroundColor,
          });
        }
      }
    }
    return out;
  });
  console.log('FULL-VIEWPORT OVERLAYS:', JSON.stringify(overlays, null, 2));

  // Click via the DOM to bypass any hit-test interference.
  const clicked = await page.evaluate(() => {
    const nav = document.querySelector('nav');
    const items = [...nav.querySelectorAll('a, button')];
    const voices = items.find((i) => (i.innerText || '').trim() === 'Voices');
    if (!voices) return 'not found';
    voices.click();
    return 'clicked';
  });
  console.log('DOM CLICK:', clicked);
  await page.waitForTimeout(2500);
  console.log('URL  before:', urlBefore);
  console.log('URL  after :', page.url());
  console.log('heading before:', headingBefore);
  console.log('heading after :', await page.locator('main h1, main h2').first().innerText().catch(() => '(none)'));
  console.log('navigations  :', JSON.stringify(navigations.slice(-5)));

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
const { chromium } = require('playwright');
const fs = require('fs');

const URL = process.argv[2] || 'http://localhost:21132/';
const OUT = 'C:\\Users\\ehis\\AppData\\Local\\Temp\\opencode\\web_render.png';

(async () => {
  const pageErrors = [];
  const consoleErrors = [];

  // Use the installed Chrome: Playwright's own browsers are not downloaded.
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}\n${e.stack}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[console] ${m.text()}`);
  });
  page.on('requestfailed', (r) =>
    consoleErrors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`),
  );

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(6000);

  const info = await page.evaluate(() => {
    const root = document.getElementById('root');
    const body = document.body;
    const cls = (el) => {
      const c = el && el.className;
      if (c === undefined || c === null) return '';
      return typeof c === 'string' ? c : String(c.baseVal || '');
    };
    const huge = [];
    for (const el of body.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.width > 2000 || b.height > 2000) {
        huge.push({
          tag: el.tagName,
          cls: cls(el).slice(0, 90),
          w: Math.round(b.width),
          h: Math.round(b.height),
        });
      }
    }
    const at = document.elementFromPoint(720, 450);
    const cs = at ? getComputedStyle(at) : null;
    const b = at ? at.getBoundingClientRect() : null;
    return {
      rootExists: !!root,
      rootChildCount: root ? root.children.length : -1,
      rootText: root ? root.innerText.trim().slice(0, 700) : null,
      rootHtmlHead: root ? root.innerHTML.slice(0, 400) : null,
      bodyBg: getComputedStyle(body).backgroundColor,
      bodyColor: getComputedStyle(body).color,
      docScrollW: document.documentElement.scrollWidth,
      docScrollH: document.documentElement.scrollHeight,
      title: document.title,
      huge: huge.slice(0, 20),
      centre: at
        ? {
            tag: at.tagName,
            cls: cls(at).slice(0, 110),
            bg: cs.backgroundColor,
            color: cs.color,
            opacity: cs.opacity,
            visibility: cs.visibility,
            display: cs.display,
            w: b ? Math.round(b.width) : null,
            h: b ? Math.round(b.height) : null,
          }
        : null,
    };
  });

  await page.screenshot({ path: OUT });

  console.log('=== PAGE ERRORS ===');
  console.log(pageErrors.length ? pageErrors.join('\n---\n') : 'none');
  console.log('\n=== CONSOLE / REQUEST ERRORS ===');
  console.log(consoleErrors.length ? consoleErrors.slice(0, 20).join('\n') : 'none');
  console.log('\n=== RENDER INFO ===');
  console.log(JSON.stringify(info, null, 2));
  console.log('\nscreenshot:', OUT);

  await browser.close();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
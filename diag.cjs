const { chromium } = require('playwright');

const OUT = 'C:\\Users\\ehis\\AppData\\Local\\Temp\\opencode\\diag.png';

(async () => {
  const pageErrors = [];
  const consoleErrors = [];
  const failed = [];
  const reqCounts = {};

  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('requestfailed', (r) =>
    failed.push(`${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`),
  );
  page.on('response', (r) => {
    const u = new URL(r.url());
    const key = u.origin + u.pathname;
    reqCounts[key] = reqCounts[key] || { n: 0, codes: {} };
    reqCounts[key].n += 1;
    reqCounts[key].codes[r.status()] = (reqCounts[key].codes[r.status()] || 0) + 1;
  });

  await page.goto('http://localhost:21132/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(8000);

  const dom = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      ls[k] = (localStorage.getItem(k) || '').slice(0, 200);
    }

    // Which element is pulsing (animation running)?
    const animated = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.animationName && cs.animationName !== 'none') {
        const b = el.getBoundingClientRect();
        animated.push({
          tag: el.tagName,
          cls: String(el.className?.baseVal ?? el.className ?? '').slice(0, 80),
          anim: cs.animationName,
          dur: cs.animationDuration,
          w: Math.round(b.width),
          h: Math.round(b.height),
        });
      }
    }

    // Theme plumbing.
    const probeVars = ['--background', '--foreground', '--accent', '--primary'];
    const computed = {};
    const tmp = document.createElement('div');
    tmp.style.display = 'none';
    document.body.appendChild(tmp);
    for (const v of probeVars) {
      computed[v] = getComputedStyle(tmp).getPropertyValue(v).trim() || '(empty)';
    }
    tmp.remove();

    return {
      htmlClass: html.className,
      bodyClass: body.className,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      localStorageKeys: Object.keys(ls),
      localStorageSample: ls,
      animatedCount: animated.length,
      animated: animated.slice(0, 8),
      themeVars: computed,
      bodyBg: getComputedStyle(body).backgroundColor,
      bodyColor: getComputedStyle(body).color,
      // Boot gate state, if exposed anywhere in the DOM.
      bootText: (document.body.innerText.match(/Loading[^\n]*/gi) || []).slice(0, 4),
      hasSpinner: !!document.querySelector('[class*="animate-"]'),
    };
  });

  await page.screenshot({ path: OUT });

  console.log('=== PAGE ERRORS ===');
  console.log(pageErrors.length ? pageErrors.join('\n') : 'none');
  console.log('\n=== CONSOLE ERRORS ===');
  console.log(consoleErrors.length ? consoleErrors.slice(0, 12).join('\n') : 'none');
  console.log('\n=== FAILED REQUESTS ===');
  console.log(failed.length ? failed.slice(0, 12).join('\n') : 'none');
  console.log('\n=== NON-2xx RESPONSES ===');
  const bad = Object.entries(reqCounts).filter(([, v]) =>
    Object.keys(v.codes).some((c) => Number(c) >= 400),
  );
  console.log(bad.length ? JSON.stringify(bad, null, 2).slice(0, 1800) : 'none');
  console.log('\n=== DOM / THEME / BOOT ===');
  console.log(JSON.stringify(dom, null, 2));

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
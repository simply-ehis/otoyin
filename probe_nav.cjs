// Precise nav contrast: resolve EFFECTIVE background by walking ancestors,
// and measure active vs inactive links separately.
const { chromium } = require('playwright');
const THEMES = ['light', 'dark', 'di-stefano', 'stripe', 'coastal-light', 'mesh-dark'];
const URL = process.argv[2] || 'http://localhost:43117/';

const PROBE = () => {
  const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (fg, bg) => {
    const a = lum(parse(fg)), b = lum(parse(bg));
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const alpha = (c) => { const p = parse(c); return p.length > 3 ? p[3] : 1; };
  // Blend an rgba() colour over an opaque backdrop.
  const over = (fg, bg) => {
    const f = parse(fg), b = parse(bg), a = alpha(fg);
    if (a >= 1) return `rgb(${f[0]}, ${f[1]}, ${f[2]})`;
    return `rgb(${Math.round(f[0] * a + b[0] * (1 - a))}, ${Math.round(f[1] * a + b[1] * (1 - a))}, ${Math.round(f[2] * a + b[2] * (1 - a))})`;
  };
  const effectiveBg = (el) => {
    let node = el, acc = null;
    while (node && node !== document.documentElement.parentNode) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'transparent' && alpha(bg) > 0) {
        acc = acc ? over(acc, bg) : bg;
        if (alpha(bg) >= 1) return acc;
      }
      node = node.parentElement;
    }
    return acc || 'rgb(255,255,255)';
  };

  const links = [...document.querySelectorAll('nav a')].slice(0, 6).map((a) => {
    const cs = getComputedStyle(a);
    const bg = effectiveBg(a);
    const active = a.getAttribute('data-active') === 'true';
    const span = a.querySelector('span');
    const textVisible = span ? getComputedStyle(span).opacity !== '0' : true;
    return {
      label: (a.textContent || '').trim().slice(0, 14),
      active,
      color: cs.color,
      ownBg: cs.backgroundColor,
      effBg: bg,
      ratio: ratio(over(cs.color, bg), bg),
      textVisible,
    };
  });
  return links;
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  for (const theme of THEMES) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.evaluate((t) => localStorage.setItem('otoyin-ui', JSON.stringify({ state: { theme: t }, version: 0 })), theme);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('nav a', { timeout: 60000 });
    await p.waitForTimeout(800);
    const links = await p.evaluate(PROBE);
    console.log(`\n=== ${theme} ===`);
    console.table(links);
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
import { chromium } from 'playwright';
const EXE = '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage();
const bad = [];
page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.request().method() + ' ' + r.url()); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 180)); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
// login
await page.fill('input[type="email"]', 'smoke9a@riseos.test');
await page.fill('input[type="password"]', 'Riseos1234!');
await page.click('button[type="submit"]');
await page.waitForTimeout(7000);
console.log('--- after login, url:', page.url());
// visit all modules via sidebar buttons
const navs = await page.$$('nav button, aside button, [class*="sidebar"] button');
console.log('nav buttons found:', navs.length);
for (const [i, btn] of navs.entries()) {
  try {
    const label = (await btn.innerText().catch(() => '')).trim().slice(0, 25);
    if (!label) continue;
    await btn.click({ timeout: 3000 });
    await page.waitForTimeout(2500);
    console.log(i, label, '->', page.url().split('/').pop() || 'root', '| errors so far:', bad.length);
  } catch (e) { /* skip */ }
}
await page.waitForTimeout(2000);
console.log('=== 4xx/5xx responses ===');
[...new Set(bad)].forEach(x => console.log(x));
await browser.close();

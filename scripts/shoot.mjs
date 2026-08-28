import { chromium } from 'playwright';
const EXE = '/home/z/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1360, height: 850 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0,150)); });
await page.addInitScript(() => localStorage.setItem('rise-onboarding-done', '1'));
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const email = page.locator('input[type="email"]');
if (await email.count()) {
  await email.fill('smoke9a@riseos.test');
  await page.fill('input[type="password"]', 'Riseos1234!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4500);
}
// close any lingering dialog
for (let i = 0; i < 3; i++) {
  const overlay = page.locator('[data-slot="dialog-overlay"][data-state="open"]');
  if (await overlay.count()) {
    await page.screenshot({ path: 'shots/debug-dialog.png' });
    await page.keyboard.press('Escape').catch(()=>{});
    await page.waitForTimeout(600);
  } else break;
}
await page.screenshot({ path: 'shots/day-dashboard.png' });
const sw = page.locator('[role="switch"]').first();
if (await sw.count()) { await sw.click({ force: true, timeout: 8000 }).catch(async () => { await sw.dispatchEvent('click'); }); await page.waitForTimeout(1400); }
await page.screenshot({ path: 'shots/night-dashboard.png' });
const btn = page.locator('nav button', { hasText: 'المهام' }).first();
if (await btn.count()) { await btn.click({ timeout: 8000 }).catch(()=>{}); await page.waitForTimeout(2500); }
await page.screenshot({ path: 'shots/night-tasks.png' });
const sw2 = page.locator('[role="switch"]').first();
if (await sw2.count()) { await sw2.click({ force: true, timeout: 8000 }).catch(async () => { await sw2.dispatchEvent('click'); }); await page.waitForTimeout(1400); }
await page.screenshot({ path: 'shots/day-tasks.png' });
console.log('console errors:', errs.length); errs.slice(0,5).forEach(e=>console.log('ERR:',e));
await browser.close();

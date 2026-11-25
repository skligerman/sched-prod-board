// Usage: node scripts/verify.mjs <board url>
// Checks R1-R6 against a running board. Prints what it saw.
import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) throw new Error('usage: node scripts/verify.mjs <board url>');
const browser = await chromium.launch();

async function open(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(url);
  return { ctx, page, logs };
}

const tid = (id) => `[data-testid="${id}"]`;

// R3 + R1 + R2 + R6 + R4 in a default context
{
  const { ctx, page, logs } = await open({});
  await page.waitForSelector(tid('incident-row'));
  console.log('loader gone:', await page.locator(tid('loader')).isHidden());
  const n = await page.locator(tid('incident-row')).count();
  const times = await page.locator(`${tid('incident-row')} time`).evaluateAll((ts) => ts.map((t) => t.dateTime));
  const sorted = [...times].sort().reverse();
  console.log('rows:', n, 'newest first:', JSON.stringify(times) === JSON.stringify(sorted));
  console.log('meta build:', await page.locator('meta[name=build]').getAttribute('content'));
  console.log('footer sha:', await page.locator(tid('build-sha')).innerText());
  const first = page.locator(tid('incident-row')).first();
  const firstId = await first.getAttribute('data-id');
  await first.locator(tid('ack')).click();
  console.log('confirm text:', await first.locator(tid('confirm')).innerText());
  await first.locator(tid('confirm-cancel')).click();
  console.log('cancel leaves Ack, nothing acked:', await first.locator(tid('ack')).isVisible(), await first.locator(tid('acked')).count());
  await first.locator(tid('ack')).click();
  console.log('confirm names id:', (await first.locator(tid('confirm')).innerText()).includes(firstId));
  await first.locator(tid('confirm-ack')).click();
  await first.locator(tid('acked')).waitFor();
  console.log('acked row:', await first.getAttribute('data-id'));
  console.log('ack log:', logs.filter((l) => l.startsWith('ack ')).map((l) => l.slice(0, 80)));
  const reqs = [];
  page.on('request', (r) => r.url().includes('/incidents') && reqs.push(Date.now()));
  await page.waitForTimeout(7000);
  console.log('incident polls in 7s:', reqs.length);
  await ctx.close();
}

// R5: Auckland and Berlin
for (const [locale, timezoneId] of [['en-NZ', 'Pacific/Auckland'], ['de-DE', 'Europe/Berlin'], ['en-US', 'America/New_York']]) {
  const { ctx, page } = await open({ locale, timezoneId });
  await page.waitForSelector(tid('incident-row'));
  const t = page.locator(`${tid('incident-row')} time`).first();
  console.log(locale, timezoneId, '|', await t.innerText(), '|', await t.getAttribute('datetime'));
  await ctx.close();
}
await browser.close();

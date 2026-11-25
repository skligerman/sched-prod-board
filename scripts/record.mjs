// Usage: node scripts/record.mjs <board url> <out dir> [max watch seconds]
// Records the board in use: open, ack one incident, then watch for a new one. Prints mm:ss marks.
import { chromium } from 'playwright';

const [url, outDir, watch = '150'] = process.argv.slice(2);
if (!url || !outDir) throw new Error('usage: node scripts/record.mjs <url> <outDir> [watchSeconds]');

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1100, height: 640 },
  recordVideo: { dir: outDir, size: { width: 1100, height: 640 } },
});
const page = await ctx.newPage();
const t0 = Date.now();
const mark = (label) => {
  const s = Math.round((Date.now() - t0) / 1000);
  console.log(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}  ${label}`);
};
const receipts = [];
page.on('console', (m) => m.text().startsWith('ack ') && receipts.push(m.text()));

const tid = (id) => `[data-testid="${id}"]`;
await page.goto(url);
mark('open-board: loader shown');
await page.waitForSelector(tid('incident-row'));
mark(`open-board: ${await page.locator(tid('incident-row')).count()} incidents, loader gone`);
await page.waitForTimeout(3000);

const row = page.locator(tid('incident-row')).first();
const id = await row.getAttribute('data-id');
await row.locator(tid('ack')).hover();
await page.waitForTimeout(1500);
await row.locator(tid('ack')).click();
await row.locator(tid('acked')).waitFor();
mark(`ack-incident: ${id} acked`);
await page.waitForTimeout(3000);

const before = await page.locator(tid('incident-row')).count();
const topBefore = await page.locator(tid('incident-row')).first().getAttribute('data-id');
mark(`watch-board: waiting for a new incident (top is ${topBefore})`);
const deadline = Date.now() + Number(watch) * 1000;
let seen = false;
while (Date.now() < deadline) {
  const top = await page.locator(tid('incident-row')).first().getAttribute('data-id');
  if (top !== topBefore) {
    mark(`watch-board: new incident ${top} at the top, no reload`);
    seen = true;
    break;
  }
  await page.waitForTimeout(500);
}
if (!seen) mark('watch-board: no new incident in the window');
await page.waitForTimeout(4000);
mark('end');
const path = await page.video().path();
await ctx.close();
await browser.close();
console.log('video:', path);
console.log('receipts:', JSON.stringify(receipts));

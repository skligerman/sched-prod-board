// Usage: node scripts/race.mjs <board url> <out dir>
// Clicks like a person: aims the mouse at the top row's Ack, then clicks at the screen position the moment
// a new incident lands. Prints which row was meant, which row was acked, and the receipt.
import { chromium } from 'playwright';

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) throw new Error('usage: node scripts/race.mjs <url> <outDir>');

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1100, height: 640 },
  recordVideo: { dir: outDir, size: { width: 1100, height: 640 } },
});
const page = await ctx.newPage();
const t0 = Date.now();
const stamp = () => {
  const s = (Date.now() - t0) / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${s % 60 < 10 ? '0' : ''}${(s % 60).toFixed(1)}`;
};
const mark = (m) => console.log(stamp(), m);
const tid = (id) => `[data-testid="${id}"]`;

const receipts = [];
page.on('console', (m) => m.text().startsWith('ack ') && receipts.push({ at: stamp(), line: m.text() }));

let landed = null; // resolves when a poll brings a new top incident
let meant = null;
let resolveLanded;
const landedP = new Promise((r) => (resolveLanded = r));
page.on('response', async (res) => {
  if (!res.url().includes('/incidents') || !meant || landed) return;
  try {
    const body = await res.json();
    const top = [...body.incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt))[0];
    if (top && top.id !== meant) {
      landed = top.id;
      resolveLanded();
    }
  } catch {}
});

await page.goto(url);
await page.waitForSelector(tid('incident-row'));
const row = page.locator(tid('incident-row')).first();
meant = await row.getAttribute('data-id');
mark(`open-board: I mean to ack the top row, ${meant}`);
const box = await row.locator(tid('ack')).boundingBox();
const x = box.x + box.width / 2;
const y = box.y + box.height / 2;
await page.mouse.move(x - 200, y + 60);
await page.waitForTimeout(800);
await page.mouse.move(x, y, { steps: 20 });
mark(`pointer on ${meant}'s Ack, waiting for a new incident`);

await landedP; // the poll that brings the new incident just answered
await page.mouse.click(x, y); // a person's click: where the button was, no waiting
mark(`click at the same spot as ${landed} lands`);
await page.waitForTimeout(2500);

const acked = await page.locator(`${tid('incident-row')}:has(${tid('acked')})`).evaluateAll((rs) => rs.map((r) => r.dataset.id));
const order = await page.locator(tid('incident-row')).evaluateAll((rs) => rs.slice(0, 3).map((r) => r.dataset.id));
mark(`top rows now: ${order.join(', ')}; acked rows: ${acked.join(', ') || 'none'}`);
await page.waitForTimeout(2000);
const path = await page.video().path();
await ctx.close();
await browser.close();
console.log('meant:', meant, '| new incident:', landed, '| acked:', JSON.stringify(acked));
console.log('receipts:', JSON.stringify(receipts));
console.log('video:', path);

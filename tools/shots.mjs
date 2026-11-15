// Take the entry's three screenshots with headless Chromium (Puppeteer).
//
//   node tools/shots.mjs --out <built output dir> --dest <screenshots dir>
//
// The four shots the gate wants, from the built dashboard:
//   1-board.png    the ranked board, top of the page
//   2-detail.png   a protocol's detail view (rank #1, clicked open)
//   3-filtered.png a filtered view (the Watchlist-only tab)
//   4-model.png    the methodology and calibration table
// Screenshots land at 1440x900, inside the gate's caps (long side at most
// 1440, short side at least 800, at most 512 KiB each). Puppeteer itself
// lives outside this repository (installed per machine); only the PNGs it
// writes are handed in.
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Puppeteer lives outside this repository (installed per machine, e.g.
// /tmp/shotter); resolve it from that install, or PUPPETEER_HOME when set.
// puppeteer-core is accepted too: then PUPPETEER_EXECUTABLE_PATH names the
// Chrome binary (a puppeteer cache install works).
const puppeteerHome = process.env.PUPPETEER_HOME ?? '/tmp/shotter';
const requireShotter = createRequire(join(puppeteerHome, 'package.json'));
let puppeteer;
try {
  puppeteer = requireShotter('puppeteer');
} catch {
  puppeteer = requireShotter('puppeteer-core');
}

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const outDir = arg('out', '/tmp/radar-out');
const destDir = arg('dest', join(process.cwd(), 'screenshots'));
mkdirSync(destDir, { recursive: true });

const pageUrl = pathToFileURL(join(outDir, 'dashboard', 'index.html')).href;

const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-gpu'],
  ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

async function shoot(name, setup) {
  await page.goto(pageUrl, { waitUntil: 'networkidle0' });
  await page.waitForSelector('tbody tr[data-slug]', { timeout: 15000 });
  if (setup) await setup();
  await new Promise((r) => setTimeout(r, 400));
  const file = join(destDir, name);
  await page.screenshot({ path: file, type: 'png' });
  const bytes = statSync(file).size;
  console.log(`shot ${name}: ${bytes} bytes`);
  if (bytes > 512 * 1024) {
    await page.screenshot({ path: file.replace(/\.png$/, '.jpg'), type: 'jpeg', quality: 88 });
    console.log(`shot ${name} over the cap as PNG, saved JPEG instead`);
  }
}

// 1. The board, top of the page.
await shoot('1-board.png', null);

// 2. The detail view: open rank #1 and scroll its detail into view.
await shoot('2-detail.png', async () => {
  await page.click('tbody tr[data-slug]');
  await page.waitForSelector('#detail', { timeout: 10000 });
  await page.evaluate(() => document.getElementById('detail').scrollIntoView({ block: 'start' }));
  await new Promise((r) => setTimeout(r, 400));
});

// 3. A filtered view: the Watchlist-only tab.
await shoot('3-filtered.png', async () => {
  await page.click('[data-tab="watchlist"]');
  await page.waitForSelector('tbody tr[data-slug]', { timeout: 10000 });
});

// 4. The model: the methodology and calibration table at the foot of the page.
await shoot('4-model.png', async () => {
  await page.evaluate(() => document.querySelector('section.block').scrollIntoView({ block: 'start' }));
  await new Promise((r) => setTimeout(r, 400));
});

await browser.close();
console.log('shots done');

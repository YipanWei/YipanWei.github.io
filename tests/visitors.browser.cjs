const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
const origin = 'https://yipanwei.github.io';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };

async function main() {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
  assert.doesNotMatch(workflow, /schedule:|sync-visitor-stats|visitors\.js|\bassets\b/);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const mode of ['local', 'production']) {
      const page = await browser.newPage();
      const errors = [];
      const external = [];
      const statistics = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (/visitors\.js|visitor-stats|visitor-world|workers\.dev/.test(request.url())) {
          statistics.push(request.url());
        }
      });
      // Serve the actual site under its production origin without any live traffic.
      await page.route('https://**/*', async (route) => {
        const url = new URL(route.request().url());
        if (mode !== 'production' || url.origin !== origin) {
          external.push(url.href);
          return route.abort();
        }
        const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
        return route.fulfill({
          body: fs.readFileSync(path.join(root, name)),
          contentType: types[path.extname(name)] || 'application/octet-stream',
        });
      });
      for (const file of ['index.html', 'research.html', 'failures.html']) {
        await page.goto(mode === 'local' ? pathToFileURL(path.join(root, file)).href : `${origin}/${file}`);
        assert.equal(await page.locator('.visitor-stats, .visitor-privacy, .visitor-map, .visitor-digits').count(), 0);
        assert.equal(await page.locator('script[src*="visitor"]').count(), 0);
        assert.match(await page.locator('.site-footer').innerText(), /Yipan Wei/);
        for (const width of [1280, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          await page.locator('.site-footer').scrollIntoViewIfNeeded();
          await page.waitForTimeout(250);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          if (file === 'index.html') {
            assert.equal(await page.locator('.profile-avatar').evaluate((img) => img.complete && img.naturalWidth > 0), true);
            await page.screenshot({ path: path.join(output, `statistics-removed-${mode}-${width}.png`) });
          }
        }
      }
      assert.deepEqual(statistics, [], 'No visitor scripts, maps, snapshots, or API requests');
      assert.deepEqual(external, [], 'No external runtime dependencies');
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${mode}: all pages, no statistics or tracking, 1280/390/320 layouts`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

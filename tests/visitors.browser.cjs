const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
const endpoint = 'https://visitor-api.invalid/visits';
// Synthetic test data lives here only, never in the deployed page or database.
const fixture = { views: 10, points: [
  { country: 'CN', latitude: 30, longitude: 114, views: 4 },
  { country: 'US', latitude: 38, longitude: -122, views: 3 },
  { country: 'DE', latitude: 52, longitude: 14, views: 2 },
  { country: 'AU', latitude: -34, longitude: 152, views: 1 },
] };

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const local = await browser.newPage();
    const errors = [];
    local.on('pageerror', (e) => errors.push(e.message));
    let external = 0;
    await local.route('https://**/*', (route) => { external++; return route.abort(); });
    await local.goto(pathToFileURL(path.join(root, 'index.html')).href);
    assert.equal(await local.locator('#visitor-count-status').isVisible(), false);
    assert.equal(await local.locator('#visitor-map-status').isVisible(), false);
    assert.equal(await local.getByText(/Local preview/).count(), 0);
    assert.equal(external, 0);
    assert.equal(await local.locator('.visitor-stats h2').count(), 0);
    for (const width of [1280, 390, 320]) {
      await local.setViewportSize({ width, height: 900 });
      await local.locator('.site-footer').scrollIntoViewIfNeeded();
      await local.waitForTimeout(300);
      assert.equal(await local.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const counterBox = await local.locator('.visitor-counter').boundingBox();
      const mapBox = await local.locator('.visitor-map').boundingBox();
      const digitsBox = await local.locator('.visitor-digits').boundingBox();
      assert.ok(mapBox.y >= counterBox.y + counterBox.height, 'Counter stays above map');
      assert.ok(mapBox.y - counterBox.y - counterBox.height <= 16, 'Compact vertical gap');
      assert.ok(Math.abs(digitsBox.x + digitsBox.width / 2 - mapBox.x - mapBox.width / 2) < 1, 'Counter centered over map');
      assert.equal(await local.locator('.visitor-map img').evaluate((e) => e.complete && e.naturalWidth > 0), true);
      await local.screenshot({ path: path.join(output, `visitors-local-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    await local.close();
    console.log('PASS local preview, map asset, zero tracking, 1280/390/320 layouts');

    for (const scenario of ['success', 'zero', 'large', 'unknown', 'invalid', 'error', 'limited', 'timeout', 'gpc', 'dnt', 'unconfigured', 'other-host']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const calls = [];
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      if (scenario === 'gpc') await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }));
      if (scenario === 'dnt') await page.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { value: '1' }));
      if (scenario === 'timeout') await page.clock.install();
      await page.route('https://**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === 'yipanwei.github.io' || url.hostname === 'other.invalid') {
          const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
          let body = fs.readFileSync(path.join(root, name));
          if (name === '/index.html') body = body.toString().replace(/data-api-url="[^"]*"/, `data-api-url="${scenario === 'unconfigured' ? '' : endpoint}"`);
          const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
          return route.fulfill({ body, contentType: types[path.extname(name)] || 'application/octet-stream' });
        }
        assert.equal(url.href, endpoint, 'No third-party widgets, geo APIs, or map tile requests');
        calls.push(route.request().method());
        if (scenario === 'timeout') return;
        if (scenario === 'error') return route.abort();
        if (scenario === 'limited' && route.request().method() === 'POST') return route.fulfill({ status: 429 });
        let data = fixture;
        if (scenario === 'zero') data = { views: 0, points: [] };
        if (scenario === 'unknown') data = { views: 3, points: [] };
        if (scenario === 'large') data = { views: Number.MAX_SAFE_INTEGER, points: [] };
        if (scenario === 'invalid') data = { views: 1, points: [{ country: '<script>', latitude: 500, longitude: 0, views: 3 }] };
        return route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': 'https://yipanwei.github.io' } });
      });
      await page.goto(`https://${scenario === 'other-host' ? 'other.invalid' : 'yipanwei.github.io'}/`);
      const status = page.locator('#visitor-count-status');
      if (['gpc', 'dnt', 'unconfigured', 'other-host'].includes(scenario)) {
        assert.equal(calls.length, 0);
        if (scenario === 'other-host') {
          assert.equal(await status.isVisible(), false);
          assert.equal(await page.locator('#visitor-map-status').isVisible(), false);
        } else {
          assert.match(await status.innerText(), /disabled|not enabled/);
        }
      } else if (['invalid', 'error', 'timeout'].includes(scenario)) {
        if (scenario === 'timeout') await page.clock.fastForward(11000);
        await page.waitForFunction(() => document.querySelector('#visitor-count-status').textContent.includes('unavailable'));
        assert.equal(await page.locator('.visitor-map-dot').count(), 0);
        assert.deepEqual(calls, ['POST']);
      } else {
        await page.waitForFunction(() => document.querySelector('#visitor-count-status').textContent === 'Recorded page views');
        assert.deepEqual(calls, scenario === 'limited' ? ['POST', 'GET'] : ['POST']);
        if (scenario === 'zero') assert.equal(await page.locator('.visitor-digits').getAttribute('aria-label'), '0 homepage views');
        if (scenario === 'unknown') assert.equal(await page.locator('#visitor-map-status').innerText(), 'No located visits yet');
        if (scenario === 'large') {
          await page.setViewportSize({ width: 320, height: 900 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.equal(await page.locator('.visitor-digit').count(), 16);
        }
        if (scenario === 'success') {
          assert.equal(await page.locator('.visitor-map-dot').count(), 4);
          const first = page.locator('.visitor-map-dot').first();
          assert.ok(Math.abs(Number(await first.getAttribute('cx')) - 816.6667) < 0.01);
          assert.ok(Math.abs(Number(await first.getAttribute('cy')) - 166.6667) < 0.01);
          await first.focus();
          assert.equal(await page.locator('.visitor-map-tooltip').isVisible(), true);
          assert.match(await page.locator('.visitor-map-tooltip').innerText(), /China: 4 views/);
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.visitor-map-tooltip').isVisible(), false);
          await first.click();
          assert.equal(await page.locator('.visitor-map-tooltip').isVisible(), true);
          await page.keyboard.press('Escape');
          const colors = await page.locator('.visitor-map img').evaluate(async (img) => {
            await img.decode();
            const canvas = document.createElement('canvas');
            canvas.width = 200; canvas.height = 100;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 200, 100);
            const data = ctx.getImageData(0, 0, 200, 100).data;
            let land = 0;
            for (let i = 0; i < data.length; i += 4) if (data[i] < 225 && data[i + 3] === 255) land++;
            return land;
          });
          assert.ok(colors > 1000 && colors < 18000, `World outline is nonblank: ${colors} land pixels`);
          await page.locator('#visitor-map-status').evaluate((e) => { e.textContent += ' (test fixture)'; });
          for (const width of [1280, 390, 320]) {
            await page.setViewportSize({ width, height: 900 });
            await page.locator('.site-footer').scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: path.join(output, `visitors-fixture-${width}.png`) });
          }
        }
      }
      assert.deepEqual(pageErrors, []);
      await page.close();
      console.log(`PASS ${scenario}`);
    }
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

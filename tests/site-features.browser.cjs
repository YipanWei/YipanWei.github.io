const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://yipanwei.github.io';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };

async function main() {
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const mode of ['normal', 'storage-blocked', 'no-js']) {
      const context = await browser.newContext({ javaScriptEnabled: mode !== 'no-js' });
      const external = [];
      await context.route('https://**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) {
          external.push(url.href);
          return route.abort();
        }
        const file = decodeURIComponent(url.pathname).slice(1) || 'index.html';
        return route.fulfill({ body: fs.readFileSync(path.join(root, file)), contentType: types[path.extname(file)] });
      });
      if (mode === 'storage-blocked') {
        await context.addInitScript(() => {
          for (const method of ['getItem', 'setItem', 'removeItem']) {
            Storage.prototype[method] = () => { throw new Error('Storage blocked'); };
          }
        });
      }
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/index.html`);
      assert.match(await page.locator('.award-list li').first().innerText(), /National Scholarship, Wuhan University/);
      assert.match(await page.locator('.news-item').first().innerText(), /National Scholarship at Wuhan University/);
      const toggle = page.getByRole('button', { name: 'Terminal theme', exact: true });
      if (mode === 'no-js') {
        assert.equal(await toggle.count(), 0);
        assert.equal(await page.locator('#news').evaluate((node) => getComputedStyle(node).opacity), '1');
      } else {
        assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
        await toggle.focus();
        assert.equal(await page.locator('.theme-tooltip').isVisible(), true);
        await page.keyboard.press('Enter');
        assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'terminal');
        if (mode === 'normal') {
          for (const file of ['index.html', 'research.html', 'failures.html']) {
            await page.goto(`${origin}/${file}`);
            assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'Theme persists across pages');
            assert.equal(await page.locator('.site-nav').getByRole('link', { name: 'Attempts', exact: true }).count(), 1);
            assert.doesNotMatch(await page.locator('body').innerText(), /Failures/);
            if (file === 'failures.html') {
              assert.equal(await page.title(), 'Attempts | Yipan Wei');
              assert.equal(await page.locator('h1').innerText(), 'Attempts');
              assert.equal(await page.locator('.plain-list li').count(), 5);
            }
            for (const width of [1280, 390, 320]) {
              await page.setViewportSize({ width, height: 900 });
              await page.waitForTimeout(300);
              assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
              const image = page.locator('.profile-avatar');
              if (await image.count()) assert.equal(await image.evaluate((img) => img.complete && img.naturalWidth > 0), true);
              await page.screenshot({ path: path.join(root, `test-results/terminal-${file}-${width}.png`) });
            }
          }
        }
        await toggle.focus();
        await page.keyboard.press('Space');
        assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
        assert.equal(await page.locator('html').getAttribute('data-theme'), null);
        await page.reload();
        assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
      }
      assert.deepEqual(external, []);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${mode}: scholarship, theme controls and storage fallback`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

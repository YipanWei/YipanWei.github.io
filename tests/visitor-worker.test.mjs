import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { approximateLocation } from '../visitor-api/worker.mjs';

const origin = 'https://yipanwei.github.io';
const location = { country: 'CN', latitude: '30.59', longitude: '114.30' };

function setup(t) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../visitor-api/schema.sql', import.meta.url), 'utf8'));
  t.after(() => sql.close());
  return {
    sql,
    ALLOWED_ORIGIN: origin,
    WRITE_LIMITER: { limit: async () => ({ success: true }) },
    READ_LIMITER: { limit: async () => ({ success: true }) },
    DB: {
      prepare(query) {
        return { query, values: [], bind(...values) { this.values = values; return this; } };
      },
      async batch(statements) {
        sql.exec('BEGIN');
        try {
          const results = statements.map(({ query, values }) => ({ results: sql.prepare(query).all(...values) }));
          sql.exec('COMMIT');
          return results;
        } catch (error) { sql.exec('ROLLBACK'); throw error; }
      },
    },
  };
}

function request(method = 'POST', cf = location, headers = {}, path = '/visits', body) {
  const req = new Request(`https://test.invalid${path}`, {
    method, body, headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.1', ...headers },
  });
  Object.defineProperty(req, 'cf', { value: cf });
  return req;
}

test('two-degree locations, dateline, equator, missing and invalid coordinates', () => {
  assert.deepEqual(approximateLocation(location), { country: 'CN', latitude: 30, longitude: 114 });
  assert.deepEqual(approximateLocation({ country: 'US', latitude: 0, longitude: 180 }), { country: 'US', latitude: 0, longitude: -180 });
  for (const invalid of [undefined, {}, { ...location, latitude: '' }, { ...location, latitude: null },
    { ...location, longitude: 181 }, { ...location, latitude: 91 }, { ...location, longitude: 'NaN' },
    { ...location, country: 'XX' }, { ...location, country: '<script>' }]) {
    assert.equal(approximateLocation(invalid), null);
  }
});

test('GET reads without counting; POST accumulates; unknown IP location still counts', async (t) => {
  const env = setup(t);
  assert.deepEqual(await (await worker.fetch(request('GET'), env)).json(), { views: 0, startedAt: null, points: [] });
  for (let i = 1; i <= 3; i++) {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.views, i);
    assert.equal(data.points[0].views, i);
    assert.ok(data.startedAt);
  }
  const unknown = await (await worker.fetch(request('POST', null), env)).json();
  assert.equal(unknown.views, 4);
  assert.equal(unknown.points[0].views, 3);
  assert.equal((await (await worker.fetch(request('GET'), env)).json()).views, 4);
  const fields = env.sql.prepare('PRAGMA table_info(locations)').all().map((r) => r.name);
  assert.deepEqual(fields, ['country', 'latitude', 'longitude', 'views']);
  const privateRecord = env.sql.prepare('SELECT * FROM ip_visits').get();
  assert.equal(privateRecord.ip, '192.0.2.1');
  assert.equal(privateRecord.views, 4);
  assert.equal(privateRecord.country, 'CN');
  const publicData = await (await worker.fetch(request('GET'), env)).text();
  assert.equal(publicData.includes('192.0.2.1'), false);
  assert.equal(publicData.includes('ip_visits'), false);
});

test('parallel arrivals do not lose increments', async (t) => {
  const env = setup(t);
  await Promise.all(Array.from({ length: 30 }, () => worker.fetch(request(), env)));
  const data = await (await worker.fetch(request('GET'), env)).json();
  assert.equal(data.views, 30);
  assert.equal(data.points[0].views, 30);
});

test('CORS, unsupported methods, privacy signals, and rate limiting never write', async (t) => {
  const env = setup(t);
  for (const [req, status] of [
    [request('POST', location, { Origin: 'https://other.invalid' }), 403],
    [request('POST', location, { Origin: 'null' }), 403],
    [request('PUT'), 405], [request('OPTIONS'), 204],
    [request('POST', location, { DNT: '1' }), 204],
    [request('POST', location, { 'Sec-GPC': '1' }), 204],
    [request('POST', location, {}, '/other'), 404],
  ]) assert.equal((await worker.fetch(req, env)).status, status);
  env.WRITE_LIMITER.limit = async () => ({ success: false });
  const limited = await worker.fetch(request(), env);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal((await (await worker.fetch(request('GET'), env)).json()).views, 0);
  assert.equal(env.sql.prepare('SELECT COUNT(*) AS count FROM ip_visits').get().count, 0);
});

test('client supplied geography is ignored, and SQL errors roll back totals', async (t) => {
  const env = setup(t);
  const data = await (await worker.fetch(request('POST', location, { 'Content-Type': 'application/json' }, '/visits',
    JSON.stringify({ country: 'US', latitude: 45, longitude: -120 })), env)).json();
  assert.equal(data.points[0].country, 'CN');
  env.sql.exec('DROP TABLE locations');
  const failure = await worker.fetch(request(), env);
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: 'Statistics unavailable' });
  assert.equal(env.sql.prepare('SELECT views FROM totals').get().views, 1);
  assert.equal(env.sql.prepare('SELECT views FROM ip_visits').get().views, 1);
});

test('IPv6 and daily records are private; old records are retained without automatic expiration', async (t) => {
  const env = setup(t);
  const ip = '2001:db8::1';
  const response = await worker.fetch(request('POST', location, { 'CF-Connecting-IP': ip }), env);
  assert.equal((await response.text()).includes(ip), false);
  assert.equal(env.sql.prepare('SELECT ip FROM ip_visits').get().ip, ip);
  env.sql.exec(`INSERT INTO ip_visits (visit_day, ip, views) VALUES
    (date('now', '-31 days'), '192.0.2.2', 2),
    (date('now', '-29 days'), '192.0.2.3', 3)`);
  await worker.fetch(request('GET'), env);
  assert.equal(env.sql.prepare("SELECT views FROM ip_visits WHERE ip = '192.0.2.2'").get().views, 2);
  assert.equal(env.sql.prepare("SELECT views FROM ip_visits WHERE ip = '192.0.2.3'").get().views, 3);
  assert.equal(env.sql.prepare('SELECT views FROM totals').get().views, 1);
  assert.equal(env.sql.prepare('SELECT views FROM locations').get().views, 1);
  env.sql.exec("INSERT INTO ip_visits (visit_day, ip, views) VALUES (date('now', '-365 days'), '192.0.2.4', 1)");
  await worker.fetch(request('POST', null, { 'CF-Connecting-IP': ip }), env);
  assert.equal(env.sql.prepare("SELECT views FROM ip_visits WHERE ip = '192.0.2.4'").get().views, 1);
  assert.equal(worker.scheduled, undefined);
});

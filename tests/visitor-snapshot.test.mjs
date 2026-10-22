import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { publicStatistics, refreshSnapshot } from '../tools/sync-visitor-stats.mjs';

const fixture = {
  views: 2, startedAt: '2026-10-22 12:00:00',
  points: [{ country: 'CN', latitude: 30, longitude: 114, views: 2 }],
};

test('snapshot explicitly strips private fields at every level', () => {
  const clean = publicStatistics({ ...fixture, ip: '192.0.2.1', ip_visits: [{ ip: '192.0.2.2' }],
    points: [{ ...fixture.points[0], ip: '192.0.2.3', userAgent: 'private' }] });
  assert.deepEqual(clean, fixture);
  assert.equal(JSON.stringify(clean).includes('192.0.2.'), false);
});

test('malformed and inconsistent records cannot be published', () => {
  for (const value of [null, { ...fixture, views: -1 }, { ...fixture, views: 1 },
    { ...fixture, views: '2' }, { ...fixture, startedAt: '</script>' },
    { ...fixture, points: [{ ...fixture.points[0], country: ['CN'] }] },
    { ...fixture, points: [{ ...fixture.points[0], latitude: 100 }] },
    { ...fixture, points: [{ ...fixture.points[0], longitude: null }] },
    { ...fixture, points: [{ ...fixture.points[0], views: 2.5 }] }]) {
    assert.throws(() => publicStatistics(value));
  }
  assert.deepEqual(publicStatistics({ views: 0, startedAt: null, points: [] }), { views: 0, startedAt: null, points: [] });
});

test('valid JSON and local-file-compatible script match; upstream failure preserves both', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'visitor-snapshot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const generated = await refreshSnapshot({ directory, readStatistics: async () => fixture, now: new Date('2026-10-22T12:34:00Z') });
  const json = await readFile(join(directory, 'visitor-stats.json'), 'utf8');
  const js = await readFile(join(directory, 'visitor-stats.js'), 'utf8');
  assert.deepEqual(JSON.parse(json), generated);
  const context = { window: {} };
  runInNewContext(js, context);
  assert.equal(JSON.stringify(context.window.VISITOR_STATS), JSON.stringify(generated));
  for (const readStatistics of [async () => { throw new Error('unreachable'); }, async () => ({ ...fixture, views: -1 })]) {
    await assert.rejects(refreshSnapshot({ directory, readStatistics }));
    assert.equal(await readFile(join(directory, 'visitor-stats.json'), 'utf8'), json);
    assert.equal(await readFile(join(directory, 'visitor-stats.js'), 'utf8'), js);
  }
});

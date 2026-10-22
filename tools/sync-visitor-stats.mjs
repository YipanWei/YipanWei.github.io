import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const defaultEndpoint = 'https://yipanwei-visitors.ersonal-eb.workers.dev/visits';

export function publicStatistics(data) {
  if (!data || !Number.isSafeInteger(data.views) || data.views < 0 || !Array.isArray(data.points)) {
    throw new Error('Invalid visitor statistics');
  }
  if (data.startedAt !== null && (typeof data.startedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(data.startedAt))) {
    throw new Error('Invalid collection start time');
  }
  let located = 0;
  const points = data.points.map((point) => {
    if (!point || typeof point.country !== 'string' || !/^[A-Z]{2}$/.test(point.country)
      || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90
      || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180
      || !Number.isSafeInteger(point.views) || point.views < 1) {
      throw new Error('Invalid map point');
    }
    located += point.views;
    // Explicit allowlist: even an unexpected upstream field must never publish IPs.
    return { country: point.country, latitude: point.latitude, longitude: point.longitude, views: point.views };
  });
  if (!Number.isSafeInteger(located) || located > data.views) throw new Error('Inconsistent counts');
  return { views: data.views, startedAt: data.startedAt, points };
}

async function fetchStatistics() {
  const url = new URL(process.env.VISITOR_STATS_API || defaultEndpoint);
  if (url.protocol !== 'https:') throw new Error('Statistics endpoint must use HTTPS');
  // curl honors the research server's HTTPS_PROXY; GET never records its IP.
  const { stdout } = await execute('curl', [
    '--fail', '--silent', '--show-error', '--max-time', '25',
    '--header', 'Origin: https://yipanwei.github.io', url.href,
  ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

export async function refreshSnapshot({
  readStatistics = fetchStatistics,
  directory = fileURLToPath(new URL('../assets/', import.meta.url)),
  now = new Date(),
} = {}) {
  // Fetch and validate before touching the last good files. Failure aborts deployment.
  const snapshot = { ...publicStatistics(await readStatistics()), generatedAt: now.toISOString() };
  const json = JSON.stringify(snapshot, null, 2);
  const files = [
    ['visitor-stats.json', `${json}\n`],
    ['visitor-stats.js', `// Generated public statistics; no private IP records.\nwindow.VISITOR_STATS = ${json};\n`],
  ];
  await mkdir(directory, { recursive: true });
  const temporary = files.map(([name]) => join(directory, `.${name}.${randomUUID()}.tmp`));
  try {
    for (let i = 0; i < files.length; i++) await writeFile(temporary[i], files[i][1]);
    for (let i = 0; i < files.length; i++) await rename(temporary[i], join(directory, files[i][0]));
  } finally {
    for (const file of temporary) await rm(file, { force: true });
  }
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  refreshSnapshot().then((snapshot) => {
    console.log(`Public snapshot updated: ${snapshot.views} views, ${snapshot.points.length} locations, ${snapshot.generatedAt}`);
  }).catch(() => {
    console.error('Statistics sync failed; existing snapshot unchanged. Do not publish a stale fallback.');
    process.exitCode = 1;
  });
}

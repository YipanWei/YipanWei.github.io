export function approximateLocation(cf) {
  if (!cf || !/^[A-Z]{2}$/.test(cf.country) || cf.country === 'XX') return null;
  const coordinate = (value, max) => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= max ? number : null;
  };
  const latitude = coordinate(cf.latitude, 90);
  const longitude = coordinate(cf.longitude, 180);
  if (latitude === null || longitude === null) return null;
  return {
    country: cf.country,
    latitude: Math.round(latitude / 2) * 2,
    longitude: ((Math.round(longitude / 2) * 2 + 180) % 360 + 360) % 360 - 180,
  };
}

export default {
  async fetch(request, env) {
    const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
    const respond = (body, status = 200) => body === null
      ? new Response(null, { status, headers })
      : Response.json(body, { status, headers });
    if (new URL(request.url).pathname !== '/visits') return respond({ error: 'Not found' }, 404);
    if (!env.ALLOWED_ORIGIN || request.headers.get('Origin') !== env.ALLOWED_ORIGIN) {
      return respond({ error: 'Origin not allowed' }, 403);
    }
    headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, DNT, Sec-GPC');
    if (request.method === 'OPTIONS') return respond(null, 204);
    if (!['GET', 'POST'].includes(request.method)) {
      headers.set('Allow', 'GET, POST, OPTIONS');
      return respond({ error: 'Method not allowed' }, 405);
    }
    if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') {
      return respond(null, 204);
    }

    try {
      const limiter = request.method === 'POST' ? env.WRITE_LIMITER : env.READ_LIMITER;
      const ip = request.headers.get('CF-Connecting-IP');
      if (!limiter || !ip || !env.DB) return respond({ error: 'Statistics unavailable' }, 503);
      // Cloudflare supplies this IP. Keep it out of logs and public responses.
      const { success } = await limiter.limit({ key: ip });
      if (!success) {
        headers.set('Retry-After', '60');
        return respond({ error: 'Rate limited' }, 429);
      }
      const statements = [];
      if (request.method === 'POST') {
        statements.push(env.DB.prepare(
          'UPDATE totals SET views = views + 1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = 1'
        ));
        // Trust edge-supplied geolocation only; clients cannot submit coordinates.
        const point = approximateLocation(request.cf);
        if (point) {
          statements.push(env.DB.prepare(
            `INSERT INTO locations (country, latitude, longitude, views) VALUES (?, ?, ?, 1)
             ON CONFLICT (country, latitude, longitude) DO UPDATE SET views = views + 1`
          ).bind(point.country, point.latitude, point.longitude));
        }
        statements.push(env.DB.prepare(
          `INSERT INTO ip_visits (visit_day, ip, country, latitude, longitude, views)
           VALUES (date('now'), ?, ?, ?, ?, 1)
           ON CONFLICT (visit_day, ip) DO UPDATE SET
             views = views + 1,
             country = COALESCE(excluded.country, country),
             latitude = COALESCE(excluded.latitude, latitude),
             longitude = COALESCE(excluded.longitude, longitude)`
        ).bind(ip, point?.country ?? null, point?.latitude ?? null, point?.longitude ?? null));
      }
      statements.push(env.DB.prepare('SELECT views, started_at FROM totals WHERE id = 1'));
      statements.push(env.DB.prepare('SELECT country, latitude, longitude, views FROM locations ORDER BY country, latitude, longitude'));
      // D1 batches are transactions: location counts and total advance together.
      const results = await env.DB.batch(statements);
      const total = results.at(-2).results[0];
      return respond({ views: total.views, startedAt: total.started_at, points: results.at(-1).results });
    } catch {
      return respond({ error: 'Statistics unavailable' }, 503);
    }
  },
};

(() => {
  const section = document.querySelector('.visitor-stats');
  if (!section) return;

  const digits = section.querySelector('.visitor-digits');
  const countStatus = document.querySelector('#visitor-count-status');
  const mapStatus = document.querySelector('#visitor-map-status');
  const map = section.querySelector('.visitor-map-points');
  const tooltip = section.querySelector('.visitor-map-tooltip');
  const segments = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g',
  };

  function renderCount(value) {
    const text = value === null ? '------' : String(value).padStart(6, '0');
    digits.replaceChildren(...Array.from(text, (character) => {
      const digit = document.createElement('span');
      digit.className = 'visitor-digit';
      digit.setAttribute('aria-hidden', 'true');
      for (const name of 'abcdefg') {
        const segment = document.createElement('i');
        segment.className = `segment segment-${name}${segments[character].includes(name) ? ' is-lit' : ''}`;
        digit.append(segment);
      }
      return digit;
    }));
    digits.setAttribute('aria-label', value === null ? 'View count unavailable' : `${value} homepage views`);
  }

  function renderMap(points) {
    const names = typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
    map.replaceChildren(...points.map((point) => {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const country = names ? names.of(point.country) : point.country;
      const label = `${country}: ${point.views.toLocaleString('en-US')} ${point.views === 1 ? 'view' : 'views'} (approximate location)`;
      // Same equirectangular projection as the locally generated world outline.
      dot.setAttribute('cx', (point.longitude + 180) * 1000 / 360);
      dot.setAttribute('cy', (90 - point.latitude) * 500 / 180);
      dot.setAttribute('r', Math.min(16, 7 + Math.log2(point.views)));
      dot.setAttribute('class', 'visitor-map-dot');
      dot.setAttribute('tabindex', '0');
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', label);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = label;
      dot.append(title);
      const show = () => { tooltip.textContent = label; tooltip.hidden = false; };
      dot.addEventListener('pointerenter', show);
      dot.addEventListener('focus', show);
      dot.addEventListener('click', show);
      dot.addEventListener('pointerleave', () => { tooltip.hidden = true; });
      dot.addEventListener('blur', () => { tooltip.hidden = true; });
      return dot;
    }));
  }

  function validate(data) {
    if (!data || !Number.isSafeInteger(data.views) || data.views < 0 || !Array.isArray(data.points)) return false;
    let located = 0;
    for (const point of data.points) {
      if (!point || typeof point.country !== 'string' || !/^[A-Z]{2}$/.test(point.country)
        || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90
        || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180
        || !Number.isSafeInteger(point.views) || point.views < 1) return false;
      located += point.views;
    }
    return Number.isSafeInteger(located) && located <= data.views;
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') tooltip.hidden = true;
  });
  // Display only same-site static data. Collection failures never erase it.
  const snapshot = window.VISITOR_STATS;
  if (validate(snapshot) && typeof snapshot.generatedAt === 'string'
    && Number.isFinite(Date.parse(snapshot.generatedAt))) {
    renderCount(snapshot.views);
    renderMap(snapshot.points);
    const updated = new Date(snapshot.generatedAt).toISOString();
    countStatus.textContent = `Updated ${updated.slice(0, 10)} ${updated.slice(11, 16)} UTC`;
    const countries = new Set(snapshot.points.map((point) => point.country)).size;
    mapStatus.textContent = countries
      ? `${countries} ${countries === 1 ? 'country / region' : 'countries / regions'}`
      : snapshot.views === 0 ? 'No visits yet' : 'No located visits yet';
  } else {
    renderCount(null);
    countStatus.textContent = 'Statistics unavailable';
    mapStatus.textContent = 'Locations unavailable';
  }
  // File previews and copies of the site must never pollute shared statistics.
  if (location.protocol !== 'https:' || location.hostname !== section.dataset.productionHost) {
    return;
  }
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1' || window.doNotTrack === '1') {
    return;
  }
  if (!section.dataset.apiUrl) {
    return;
  }

  async function recordVisit() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    try {
      const endpoint = new URL(section.dataset.apiUrl);
      if (endpoint.protocol !== 'https:') throw new Error('HTTPS required');
      const options = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal };
      // One write per page load. Never retry a timed-out POST, which may have committed.
      await fetch(endpoint, { ...options, method: 'POST' });
    } catch {
      // Some visitors cannot reach workers.dev. Preserve the published snapshot.
    } finally {
      window.clearTimeout(timeout);
    }
  }
  recordVisit();
})();

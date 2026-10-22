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
      if (!point || !/^[A-Z]{2}$/.test(point.country)
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
  renderCount(null);
  // File previews and copies of the site must never pollute shared statistics.
  if (location.protocol !== 'https:' || location.hostname !== section.dataset.productionHost) {
    countStatus.textContent = '';
    mapStatus.textContent = '';
    countStatus.hidden = true;
    mapStatus.hidden = true;
    return;
  }
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1' || window.doNotTrack === '1') {
    countStatus.textContent = 'Statistics disabled by privacy settings';
    mapStatus.textContent = 'Statistics disabled';
    return;
  }
  if (!section.dataset.apiUrl) {
    countStatus.textContent = 'Statistics not enabled';
    mapStatus.textContent = 'Statistics not enabled';
    return;
  }

  async function loadStatistics() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    countStatus.textContent = 'Loading...';
    mapStatus.textContent = 'Loading...';
    try {
      const endpoint = new URL(section.dataset.apiUrl);
      if (endpoint.protocol !== 'https:') throw new Error('HTTPS required');
      const options = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal };
      // One write per page load. Never retry a timed-out POST, which may have committed.
      let response = await fetch(endpoint, { ...options, method: 'POST' });
      if (response.status === 429) response = await fetch(endpoint, options);
      if (!response.ok || response.status === 204) throw new Error('Statistics unavailable');
      const data = await response.json();
      if (!validate(data)) throw new Error('Invalid statistics');
      renderMap(data.points);
      renderCount(data.views);
      countStatus.textContent = 'Recorded page views';
      const countries = new Set(data.points.map((point) => point.country)).size;
      mapStatus.textContent = countries
        ? `${countries} ${countries === 1 ? 'country / region' : 'countries / regions'}`
        : data.views === 0 ? 'No visits yet' : 'No located visits yet';
    } catch {
      renderCount(null);
      map.replaceChildren();
      countStatus.textContent = 'Count temporarily unavailable';
      mapStatus.textContent = 'Locations temporarily unavailable';
    } finally {
      window.clearTimeout(timeout);
    }
  }
  loadStatistics();
})();

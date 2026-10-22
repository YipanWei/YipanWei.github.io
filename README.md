# Personal Website

This repository contains a static personal website that can be deployed with
GitHub Pages.

## Files

- `index.html`: page structure and text content
- `research.html`: research notes and paper reading page
- `failures.html`: unsuccessful submissions, ordered by the relevant official notification date
- `summary.pdf`: paper reading notes linked from the research notes page
- `styles.css`: visual design and responsive layout
- `script.js`: small interactions and footer year
- `visitors.js`: first-party homepage counter and visitor map
- `assets/visitor-world.svg`: local world outline (no third-party runtime)
- `visitor-api/`: Cloudflare Worker and D1 schema for shared visitor records
- `tests/`: visitor API and browser regression checks
- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow

## How to customize

`failures.html` uses one sentence per submission, without review-stage labels.
Each conference links to its official schedule (checked 2026-10-21).
The ordering references are ICCV 2025 (2025-06-26), AAAI 2026 (2025-09-15),
NeurIPS 2025 (2025-09-18), CVPR 2026 (2026-02-20), and AAAI 2027 (2026-09-24).
Dates are not displayed on the page. Outcomes come from the owner, not from
public schedules; add personal dates or reflections only when supplied.

1. Replace placeholder text in `index.html`.
2. Update the contact links in the contact section.
3. If needed, change colors and spacing in `styles.css`.

## Visitor statistics

The homepage renders a seven-segment counter and its own world map. There are
no embedded statistics widgets or external map scripts. Both use one
first-party endpoint and database. The counter measures recorded page loads,
not unique people; only the homepage loads it, not the subpages.

The API is deployed in the owner's Cloudflare account, and `data-api-url` on
`.visitor-stats` points to `https://yipanwei-visitors.ersonal-eb.workers.dev/visits`.
Cloudflare deployment, remote database queries, and the public endpoint GET
check succeeded on 2026-10-22. The endpoint returned HTTP 200 with the expected
CORS origin and an empty initial dataset. No production test visits were
written; real recording starts when the updated homepage is published.
The local world outline always renders. Unavailable counts use dashes, not
invented zeros, and the empty map has no fictional visitor points.

### One-time API deployment

GitHub Pages cannot write shared visitor records. The included API runs in
your own Cloudflare account; no map-widget account or separate IP API key is
needed. Deployment is separate from pushing the static site to GitHub.

For a fresh deployment, run these from `visitor-api/`, after the owner's
approval. The existing database is already created; do not recreate it:

```bash
npx wrangler@4 login --device --browser=false --scopes account:read user:read workers_scripts:write d1:write
npx wrangler@4 d1 create yipanwei-visitors
```

Put the returned database ID in `wrangler.toml` (`database_id`), then run:

```bash
npx wrangler@4 d1 execute yipanwei-visitors --remote --file=schema.sql
npx wrangler@4 deploy
```

Set `data-api-url` in `index.html` to the deployed HTTPS Worker URL followed
by `/visits`. Keep `ALLOWED_ORIGIN` in the Worker and `data-production-host`
in the HTML aligned with the public homepage domain. Do not add API tokens
to HTML, commit secrets, or enable request logging containing IP addresses.
If the account already uses the configured rate-limit namespace IDs, choose
two unused positive integer strings before deploying.

After deployment, visit the public homepage once and check for a count of 1
(on a new database) and a dot when edge geolocation is available. Check browser
developer tools for one POST and no requests to analytics widgets.
The local tests do not verify the deployed Cloudflare account or geolocation.

### Data and privacy

- `POST /visits` records one page load and returns totals and map points.
  `GET /visits` reads without incrementing. No automatic write retries.
- The Worker uses [Cloudflare's request geolocation](https://developers.cloudflare.com/workers/runtime-apis/request/),
  not coordinates or IPs submitted by the browser. No GPS permission is used.
- Public data consists of country codes, coordinates rounded to two-degree
  cells, counts, and a single collection start time. Full IPs never appear in
  the public endpoint or map.
- At the owner's request, the private `ip_visits` table retains the full
  Cloudflare-supplied IPv4/IPv6 address, UTC visit date, daily count, and latest
  available approximate location for that IP/date. Records have no automatic
  expiry or deletion schedule; they remain until the owner deletes them.
  No per-visit exact timestamps, city names, URLs, or user agents are stored.
- Same-country visits in the same cell share one dot. Point size reflects
  count. Hover, focus, or tap shows country and views; Escape dismisses it.
  A cell may fall over water or across a border; it is not a precise address.
- Visits without usable location still count but do not produce fake points.
  IP locations can be wrong, particularly with VPNs and shared networks.
- D1 batches atomically update the counters and private IP records. Cloudflare processes IPs to
  route requests, geolocate, and apply short-lived rate limits. Worker
  observability is disabled; infrastructure processing is not eliminated.
- Writes are limited to approximately 10 per IP per minute per edge location;
  reads to 60. Excess writes read the existing total instead. These are basic
  abuse controls, not bot-proof analytics; Origin checks are not authentication.
- Requests run only on the configured HTTPS hostname. File previews, localhost,
  other domains, Do Not Track and Global Privacy Control never send statistics.
  No cookies or local-storage history. History starts at activation and cannot
  recover past visits. Opt-outs, blockers, failures and limits cause undercounting.

### Owner-only IP records

In the Cloudflare dashboard, open the D1 database `yipanwei-visitors` and its
Console. This query is for the authenticated dashboard only, not a public API:

```sql
SELECT visit_day, ip, country, latitude, longitude, views
FROM ip_visits
ORDER BY visit_day DESC, views DESC
LIMIT 100;
```

The public Worker never selects this table. Origin checks are not a substitute
for authentication, so do not add an IP-list route without proper owner login.
Keep the privacy disclosure on the homepage aligned with retention settings.
No automatic expiry is not a guarantee of permanent cloud availability; monitor
database quotas and periodically export an encrypted/private backup outside
this repository. Never commit exports or IP lists to GitHub or Pages artifacts.

### Development and regression checks

The site can still be previewed by opening `index.html` directly. No build or
server is needed. The committed map asset was generated using D3 Geo and
world-atlas 2.0.2, whose land outlines derive from public-domain Natural Earth.
Regenerate only if changing its projection/design:

```bash
npm ci --prefix tools
npm run build-map --prefix tools
```

Tests require Node 22.13+ (SQLite) and Playwright with Chromium:

```bash
node --test tests/visitor-worker.test.mjs
node tests/visitors.browser.cjs
```

For an existing Playwright installation, set `PLAYWRIGHT_PATH` to its package
directory. Browser tests intercept the API and use test-only fixtures, never
send actual visits, and save screenshots in ignored `test-results/`.
They cover local preview, host/privacy guards, zeros, large counts, invalid
responses, errors, timeouts, rate-limit recovery, marker interactions, map
pixels and mobile overflow. API tests run the real schema in SQLite with a
D1 adapter; Cloudflare edge behavior still needs the deployment smoke check.

## How to deploy

1. Create a GitHub repository.
2. If you want the site at the root domain, name the repository
   `<your-github-username>.github.io`.
3. Push this project to the `main` branch.
4. Example commands:

   ```bash
   git remote add origin git@github.com:<your-github-username>/<your-repo-name>.git
   git add .
   git commit -m "Initial personal website"
   git push -u origin main
   ```

5. In GitHub, open `Settings -> Pages`.
6. Set `Source` to `GitHub Actions`.
7. After the workflow finishes, your site will be available from the Pages URL.

## Optional next steps

- Add a `CNAME` file if you want to use a custom domain.
- Add a resume PDF and link it from the hero section.
- Replace the project cards with real work samples.

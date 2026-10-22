import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const atlas = JSON.parse(await readFile(require.resolve('world-atlas/land-110m.json'), 'utf8'));
// Fixed projection shared with visitors.js; D3 handles clipping at the dateline.
const projection = geoEquirectangular().scale(1000 / (2 * Math.PI)).translate([500, 250]);
const path = geoPath(projection).digits(1);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">
<title>World map</title>
<desc>Natural Earth public-domain land outlines, projected with D3 Geo.</desc>
<rect width="1000" height="500" fill="#f4f9fa"/>
<path d="${path(geoGraticule10())}" fill="none" stroke="#e0ebec" stroke-width="0.7"/>
<path d="${path(feature(atlas, atlas.objects.land))}" fill="#ceded8" stroke="#f4f9fa" stroke-width="0.8"/>
</svg>\n`;
const directory = new URL('../assets/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('visitor-world.svg', directory), svg);

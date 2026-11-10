const fs = require('fs');
const path = require('path');

const PROJECT = 'earth-properties-c3c56';
const BASE = 'https://theearthproperty.com';
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Test phase: sirf ye 2. Baad me null kar do = saari active cities.
const ONLY = ['india-haryana-panchkula', 'india-haryana-gurugram'];

const val = f => {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(val);
  return undefined;
};
const flat = fields => {
  const o = {};
  for (const k in (fields || {})) o[k] = val(fields[k]);
  return o;
};
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function rep(html, from, to) {
  if (!html.includes(from)) throw new Error('Template me nahi mila: ' + from.slice(0, 70));
  return html.replace(from, () => to);
}

async function getCities() {
  const out = [];
  if (ONLY) {
    for (const slug of ONLY) {
      const r = await fetch(`${DOCS}/cities/${encodeURIComponent(slug)}`);
      if (!r.ok) { console.warn('skip', slug, r.status); continue; }
      const d = await r.json();
      out.push({ ...flat(d.fields), slug });
    }
    return out;
  }
  let token = '';
  do {
    const r = await fetch(`${DOCS}/cities?pageSize=300` + (token ? `&pageToken=${encodeURIComponent(token)}` : ''));
    if (!r.ok) throw new Error('cities fetch ' + r.status);
    const d = await r.json();
    for (const doc of d.documents || []) {
      const c = flat(doc.fields);
      if (c.isActive === false) continue;
      out.push({ ...c, slug: doc.name.split('/').pop() });
    }
    token = d.nextPageToken || '';
  } while (token);
  return out;
}

function variants(name) {
  const t = String(name).trim().toLowerCase().split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return [...new Set([name, name.toLowerCase(), name.toUpperCase(), t])];
}

async function getListings(city) {
  const body = { structuredQuery: {
    from: [{ collectionId: 'properties' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'city' }, op: 'IN',
        value: { arrayValue: { values: variants(city.name).map(v => ({ stringValue: v })) } } } },
      { fieldFilter: { field: { fieldPath: 'isExpired' }, op: 'EQUAL', value: { booleanValue: false } } }
    ] } },
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: 10
  } };
  const r = await fetch(`${DOCS}:runQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!r.ok) { console.warn('listings fail', city.slug, r.status); return []; }
  const rows = await r.json();
  const now = Date.now();
  return rows.filter(x => x.document)
    .map(x => ({ id: x.document.name.split('/').pop(), ...flat(x.document.fields) }))
    .filter(p => (!p.status || p.status === 'active') && !(p.expiryDate && Date.parse(p.expiryDate) < now));
}

function cardHtml(p) {
  const n = Number(p.price || 0);
  const price = n ? `${p.currency || 'INR'} ${n.toLocaleString('en-IN')}` : '';
  const href = `/property-detail.html?id=${encodeURIComponent(p.id)}`;
  return `<div class="prop-card"><div class="card-body">` +
    `<div class="card-price">${esc(price)}</div>` +
    `<a class="card-title" href="${href}" style="display:block;color:inherit;text-decoration:none;">${esc(p.title || 'Property')}</a>` +
    `<div class="card-location">📍 ${esc(p.location || p.locality || '')}</div>` +
    `</div></div>`;
}

function build(tpl, city, listings) {
  const name = city.name;
  const url = `${BASE}/city/${city.slug}/`;
  const title = city.seoTitle || `Property in ${name} | The Earth Property`;
  const desc = city.seoDescription || `Find verified properties in ${name} – flats, rooms, plots, commercial. No broker. Direct owner listings.`;
  const body = city.longDescription || `Browse and list properties in ${name} for free — flats for rent, rooms, PG, residential plots, and commercial offices. All listings are direct from owners with no brokerage charges.`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: `The Earth Property – ${name}`,
    description: desc,
    url,
    areaServed: { '@type': 'City', name,
      containedInPlace: { '@type': 'State', name: city.state || '',
        containedInPlace: { '@type': 'Country', name: city.country || '' } } }
  };
  const tag = [city.state, city.country].filter(Boolean).join(' · ') || name;
  const cards = listings.length ? `<div class="cards-grid">${listings.map(cardHtml).join('')}</div>` : '';

  let h = tpl;
  h = rep(h, '<title id="pageTitle">Properties | The Earth Property</title>', `<title id="pageTitle">${esc(title)}</title>`);
  h = rep(h, '<meta id="metaDesc" name="description" content="Find verified properties. Direct owner listings on The Earth Property." />', `<meta id="metaDesc" name="description" content="${esc(desc)}" />`);
  h = rep(h, '<link id="canonicalLink" rel="canonical" href="https://theearthproperty.com/city.html" />', `<link id="canonicalLink" rel="canonical" href="${url}" />`);
  h = rep(h, '<meta id="ogTitle" property="og:title" content="The Earth Property" />', `<meta id="ogTitle" property="og:title" content="${esc(title)}" />`);
  h = rep(h, '<meta id="ogDesc" property="og:description" content="Direct owner listings, no brokerage." />', `<meta id="ogDesc" property="og:description" content="${esc(desc)}" />`);
  h = rep(h, '<meta id="ogUrl" property="og:url" content="https://theearthproperty.com/city.html" />', `<meta id="ogUrl" property="og:url" content="${url}" />`);
  h = rep(h, '<script id="jsonLd" type="application/ld+json">{}</script>', `<script id="jsonLd" type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  h = rep(h, '<div class="hero-tag" id="heroTag">Loading...</div>', `<div class="hero-tag" id="heroTag">${esc(tag)}</div>`);
  h = rep(h, '<span id="heroCityName">—</span>', `<span id="heroCityName">${esc(name)}</span>`);
  h = rep(h, 'id="cityDescBlock" style="display:none;"', 'id="cityDescBlock"');
  h = rep(h, '<h2 id="cityDescTitle"></h2>', `<h2 id="cityDescTitle">Find Your Perfect Property in ${esc(name)}</h2>`);
  h = rep(h, '<p id="cityDescBody"></p>', `<p id="cityDescBody">${esc(body)}</p>`);
  h = rep(h, '<h2 class="section-title" id="listingsTitle">Properties</h2>', `<h2 class="section-title" id="listingsTitle">${esc(name)} Properties</h2>`);

  const re = /<div class="loading-state" id="loadingState">[\s\S]*?Finding properties\.\.\.<\/p>\s*<\/div>/;
  if (!re.test(h)) throw new Error('loadingState block nahi mila');
  h = h.replace(re, () => `<div id="loadingState">${cards}</div>`);
  return h;
}

(async () => {
  const tpl = fs.readFileSync('city.html', 'utf8');
  const cities = await getCities();
  if (!cities.length) throw new Error('0 cities mile');
  let ok = 0;
  for (const c of cities) {
    try {
      const listings = await getListings(c);
      const dir = path.join('city', c.slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), build(tpl, c, listings));
      console.log('OK', c.slug, listings.length, 'listings');
      ok++;
    } catch (e) {
      console.error('FAIL', c.slug, e.message);
      process.exitCode = 1;
    }
  }
  console.log('Done:', ok, '/', cities.length);
})();

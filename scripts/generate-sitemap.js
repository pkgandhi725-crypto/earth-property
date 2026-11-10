const fs = require('fs');

const PROJECT = 'earth-properties-c3c56';
const BASE = 'https://theearthproperty.com';
const FILE = 'sitemap.xml';

// Jin cities ke static pages ban chuke hain (/city/<slug>/).
// Baaki cities abhi purane city.html?name=... URL pe rahengi.
const STATIC_PAGE_SLUGS = [
  'india-haryana-panchkula',
  'india-haryana-gurugram'
];

async function getCitySlugs() {
  const slugs = [];
  let pageToken = '';
  do {
    const url =
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/cities` +
      `?pageSize=300&mask.fieldPaths=name&mask.fieldPaths=isActive` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Firestore fetch failed: ' + res.status);
    const data = await res.json();
    (data.documents || []).forEach(d => {
      const active = d.fields && d.fields.isActive;
      if (active && active.booleanValue === false) return; // inactive city skip
      slugs.push(d.name.split('/').pop());
    });
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return slugs;
}

(async () => {
  const slugs = await getCitySlugs();
  if (slugs.length === 0) throw new Error('0 cities mile, sitemap overwrite nahi kar raha');

  const old = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';
  const entries = old.match(/<url>[\s\S]*?<\/url>/g) || [];
  // Purani city entries (dono format) hata do, baaki static entries rakho
  const staticEntries = entries.filter(e => !e.includes('city.html?name=') && !e.includes('/city/'));

  const today = new Date().toISOString().slice(0, 10);
  const cityEntries = slugs.sort().map(s => {
    const loc = STATIC_PAGE_SLUGS.includes(s)
      ? `${BASE}/city/${encodeURIComponent(s)}/`
      : `${BASE}/city.html?name=${encodeURIComponent(s)}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`;
  });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...staticEntries.map(e => '  ' + e.trim()), ...cityEntries].join('\n') +
    `\n</urlset>\n`;

  fs.writeFileSync(FILE, xml);
  console.log(`Done: ${staticEntries.length} static + ${cityEntries.length} city URLs`);
})().catch(e => { console.error(e); process.exit(1); });

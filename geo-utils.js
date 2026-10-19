/* ==========================================================
   TEP Geo Utils — shared GPS→IP location + distance helpers
   Used by: city.html (and can replace the inline copy in index.html later)
   Exposes: window.TEPGeo
   ========================================================== */
(function (global) {
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(null), ms))
    ]);
  }

  function tryGPSLocation(timeoutMs) {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, timeoutMs);
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (!settled) {
            settled = true; clearTimeout(timer);
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps' });
          }
        },
        () => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } },
        { timeout: timeoutMs, maximumAge: 600000 }
      );
    });
  }

  async function tryIPLocation() {
    try {
      const res = await fetch('https://ipwho.is/');
      if (!res.ok) throw new Error('ipwho failed');
      const data = await res.json();
      if (data && data.success !== false && data.latitude && data.longitude) {
        return { lat: data.latitude, lng: data.longitude, source: 'ip' };
      }
      throw new Error('no coords');
    } catch (e) {
      try {
        const res2 = await fetch('https://get.geojs.io/v1/ip/geo.json');
        const data2 = await res2.json();
        if (data2 && data2.latitude && data2.longitude) {
          return { lat: parseFloat(data2.latitude), lng: parseFloat(data2.longitude), source: 'ip' };
        }
      } catch (e2) {}
      return null;
    }
  }

  async function detectUserLocation() {
    if (navigator.permissions) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        if (perm.state === 'granted') {
          const gps = await tryGPSLocation(4000);
          if (gps) return gps;
        }
      } catch (e) {}
    }
    const ip = await tryIPLocation();
    if (ip) return ip;
    return null;
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function sortByProximity(items, userLat, userLng, getLat, getLng) {
    if (userLat == null || userLng == null) return items;
    return [...items].sort((a, b) => {
      const la = getLat(a), lo = getLng(a), lb = getLat(b), lob = getLng(b);
      const dA = (la && lo) ? calculateDistance(userLat, userLng, la, lo) : Infinity;
      const dB = (lb && lob) ? calculateDistance(userLat, userLng, lb, lob) : Infinity;
      return dA - dB;
    });
  }

  function formatPrice(amount, currency) {
    if (!amount) return 'Price on request';
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency: currency || 'INR',
        notation: 'compact', maximumFractionDigits: 1
      }).format(amount);
    } catch (e) {
      return (currency || '') + ' ' + amount.toLocaleString();
    }
  }

     /* ================= GEOHASH + NEARBY PAGER ================= */
  const GH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

  function geohashEncode(lat, lng, precision) {
    precision = precision || 9;
    let latR = [-90, 90], lngR = [-180, 180];
    let hash = '', bits = 0, bit = 0, even = true;
    while (hash.length < precision) {
      if (even) {
        const mid = (lngR[0] + lngR[1]) / 2;
        if (lng >= mid) { bit = bit * 2 + 1; lngR[0] = mid; } else { bit = bit * 2; lngR[1] = mid; }
      } else {
        const mid = (latR[0] + latR[1]) / 2;
        if (lat >= mid) { bit = bit * 2 + 1; latR[0] = mid; } else { bit = bit * 2; latR[1] = mid; }
      }
      even = !even;
      bits++;
      if (bits === 5) { hash += GH_BASE32[bit]; bits = 0; bit = 0; }
    }
    return hash;
  }

  function geohashBounds(hash) {
    let latR = [-90, 90], lngR = [-180, 180], even = true;
    for (const ch of hash) {
      const idx = GH_BASE32.indexOf(ch);
      for (let n = 4; n >= 0; n--) {
        const b = (idx >> n) & 1;
        if (even) { const mid = (lngR[0] + lngR[1]) / 2; if (b) lngR[0] = mid; else lngR[1] = mid; }
        else { const mid = (latR[0] + latR[1]) / 2; if (b) latR[0] = mid; else latR[1] = mid; }
        even = !even;
      }
    }
    return { minLat: latR[0], maxLat: latR[1], minLng: lngR[0], maxLng: lngR[1] };
  }

  // Cells around the user within radiusKm, nearest cell first
  function planNearbyCells(lat, lng, radiusKm, precision) {
    precision = precision || 5;
    radiusKm = radiusKm || 20;
    const home = geohashBounds(geohashEncode(lat, lng, precision));
    const dLat = home.maxLat - home.minLat;
    const dLng = home.maxLng - home.minLng;
    const cLat = (home.minLat + home.maxLat) / 2;
    const cLng = (home.minLng + home.maxLng) / 2;
    const kmLat = 111.32;
    const kmLng = Math.max(0.01, 111.32 * Math.cos(lat * Math.PI / 180));
    const latSteps = Math.min(40, Math.ceil(radiusKm / (dLat * kmLat)) + 1);
    const lngSteps = Math.min(40, Math.ceil(radiusKm / (dLng * kmLng)) + 1);
    const seen = new Set(), cells = [];
    for (let i = -latSteps; i <= latSteps; i++) {
      for (let j = -lngSteps; j <= lngSteps; j++) {
        const la = cLat + i * dLat;
        if (la > 89.999 || la < -89.999) continue;
        const lo = ((cLng + j * dLng + 540) % 360) - 180;
        const hash = geohashEncode(la, lo, precision);
        if (seen.has(hash)) continue;
        seen.add(hash);
        const b = geohashBounds(hash);
        const nLat = Math.min(Math.max(lat, b.minLat), b.maxLat);
        const nLng = Math.min(Math.max(lng, b.minLng), b.maxLng);
        const d = calculateDistance(lat, lng, nLat, nLng);
        if (d <= radiusKm) cells.push({ prefix: hash, minDistKm: d });
      }
    }
    cells.sort((a, b) => a.minDistKm - b.minDistKm);
    return cells;
  }

  // Pager: each loadNext(20) returns up to 20 listings, nearest cells first.
  // opts: { lat, lng, radiusKm=20, precision=5, wheres=[['purpose','==','Rent']], maxQueries=30 }
  function createNearbyPager(db, opts) {
    opts = opts || {};
    const radiusKm = opts.radiusKm || 20;
    const precision = opts.precision || 5;
    const wheres = opts.wheres || [];
    const maxQueries = opts.maxQueries || 30;
    const cells = planNearbyCells(opts.lat, opts.lng, radiusKm, precision);
    const seen = new Set();
    let cellIdx = 0, lastDoc = null, reads = 0;

    async function loadNext(pageSize) {
      pageSize = pageSize || 20;
      const out = [];
      const now = new Date();
      let queries = 0;
      while (out.length < pageSize && cellIdx < cells.length && queries < maxQueries) {
        const need = pageSize - out.length;
        const prefix = cells[cellIdx].prefix;
        let q = db.collection('properties').where('status', '==', 'active');
        wheres.forEach(w => { q = q.where(w[0], w[1], w[2]); });
        q = q.where('geohash', '>=', prefix).where('geohash', '<=', prefix + '\uf8ff')
             .orderBy('geohash').limit(need);
        if (lastDoc) q = q.startAfter(lastDoc);
        const snap = await q.get();
        queries++;
        reads += Math.max(1, snap.size);
        snap.docs.forEach(doc => {
          if (seen.has(doc.id)) return;
          seen.add(doc.id);
          const d = doc.data();
          if (d.isExpired === true) return;
          if (d.expiryDate && d.expiryDate.toDate() < now) return;
          if (!d.latitude || !d.longitude) return;
          const dist = calculateDistance(opts.lat, opts.lng, d.latitude, d.longitude);
          if (dist > radiusKm) return;
          out.push({ id: doc.id, ...d, _distKm: dist });
        });
        if (snap.size < need) { cellIdx++; lastDoc = null; }
        else lastDoc = snap.docs[snap.docs.length - 1];
      }
      out.sort((a, b) => a._distKm - b._distKm);
      return { items: out, done: cellIdx >= cells.length, reads: reads };
    }
    return { loadNext: loadNext, isDone: () => cellIdx >= cells.length, cellCount: cells.length };
  }
   
    global.TEPGeo = {
    withTimeout, tryGPSLocation, tryIPLocation, detectUserLocation,
    calculateDistance, sortByProximity, formatPrice,
    geohashEncode, geohashBounds, planNearbyCells, createNearbyPager
  };
})(window);

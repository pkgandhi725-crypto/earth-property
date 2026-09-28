(function () {
  'use strict';

  var CACHE_KEY = 'tep_cities_cache_v1';
  var CACHE_TTL = 6 * 60 * 60 * 1000; // 6 ghante
  var DEFAULT_COUNT = 6;
  var DEFAULT_MAX_KM = 500; // 0 = koi limit nahi

  function toRad(d) { return d * Math.PI / 180; }

  function haversine(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function norm(s) { return String(s || '').trim().toLowerCase(); }

  function slugify(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // Chip ka link: /kochi.html, /kuala-lumpur.html style
  function linkFor(city) { return '/' + slugify(city.name) + '.html'; }

  function validCoord(lat, lng) {
    return isFinite(lat) && isFinite(lng) &&
           Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
           !(lat === 0 && lng === 0);
  }

  function readCache() {
    try {
      if (/[?&]nocache/.test(location.search)) return null;
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !Array.isArray(o.cities) || Date.now() - o.t > CACHE_TTL) return null;
      return o.cities;
    } catch (e) { return null; }
  }

  function writeCache(cities) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), cities: cities }));
    } catch (e) {}
  }

  async function fetchCities() {
    var cached = readCache();
    if (cached) return cached;
    var m = window._firestoreModules, db = window._db;
    var snap = await m.getDocs(m.collection(db, 'cities'));
    var list = [];
    snap.forEach(function (doc) {
      var d = doc.data();
      if (d.isActive === false) return;
      if (d.lat == null || d.lng == null || !d.name) return;
      var lat = Number(d.lat), lng = Number(d.lng);
      if (!validCoord(lat, lng)) return;
      list.push({
        id: doc.id,
        slug: d.slug || doc.id,
        name: d.name,
        state: d.state || '',
        country: d.country || '',
        lat: lat,
        lng: lng
      });
    });
    writeCache(list);
    return list;
  }

  function findCurrent(cities, el) {
    var slug = norm(el.dataset.slug);
    var name = norm(el.dataset.city);
    var country = norm(el.dataset.country);
    var state = norm(el.dataset.state);
    var i;

    if (slug) {
      for (i = 0; i < cities.length; i++) {
        if (norm(cities[i].id) === slug || norm(cities[i].slug) === slug) return cities[i];
      }
    }
    if (name) {
      var matches = cities.filter(function (c) {
        return norm(c.name) === name && (!country || norm(c.country) === country);
      });
      if (state) {
        var byState = matches.filter(function (c) { return norm(c.state) === state; });
        if (byState.length) return byState[0];
      }
      if (matches.length) return matches[0];
    }
    var lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
    if (validCoord(lat, lng)) {
      return { id: '', name: el.dataset.city || '', country: el.dataset.country || '', lat: lat, lng: lng };
    }
    return null;
  }

  function injectStyle() {
    if (document.getElementById('tep-nearby-style')) return;
    var st = document.createElement('style');
    st.id = 'tep-nearby-style';
    st.textContent = '.nearby-chip small{margin-left:6px;font-size:.68rem;font-weight:400;opacity:.55}';
    document.head.appendChild(st);
  }

  function render(el, list) {
    el.textContent = '';
    list.forEach(function (c) {
      var a = document.createElement('a');
      a.className = 'nearby-chip';
      a.href = linkFor(c);
      a.textContent = c.name;
      var s = document.createElement('small');
      s.textContent = Math.max(1, Math.round(c.km)) + ' km';
      a.appendChild(s);
      el.appendChild(a);
    });
  }

  async function init() {
    var el = document.getElementById('nearbyChips');
    if (!el) return;
    var section = document.getElementById('nearbySection') || el.parentElement;

    try {
      var cities = await fetchCities();
      var cur = findCurrent(cities, el);
      if (!cur) { console.warn('[nearby] current city DB mein nahi mili'); return; }

      var count = parseInt(el.dataset.count, 10) || DEFAULT_COUNT;
      var maxKm = parseFloat(el.dataset.maxKm);
      if (isNaN(maxKm)) maxKm = DEFAULT_MAX_KM;

      var seen = {};
      var result = cities
        .filter(function (c) {
          if (cur.id && c.id === cur.id) return false;
          if (norm(c.name) === norm(cur.name) && norm(c.country) === norm(cur.country)) return false;
          return true;
        })
        .map(function (c) {
          return { id: c.id, name: c.name, country: c.country, km: haversine(cur.lat, cur.lng, c.lat, c.lng) };
        })
        .filter(function (c) { return maxKm === 0 || c.km <= maxKm; })
        .sort(function (a, b) { return a.km - b.km; })
        .filter(function (c) {
          var k = norm(c.name) + '|' + norm(c.country);
          if (seen[k]) return false;
          seen[k] = true;
          return true;
        })
        .slice(0, count);

      if (!result.length) return; // section hidden hi rahega

      injectStyle();
      render(el, result);
      section.style.display = '';
    } catch (err) {
      console.error('[nearby] error:', err);
    }
  }

  function start() {
    if (readCache() || (window._db && window._firestoreModules)) init();
    else window.addEventListener('firebaseReady', init, { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

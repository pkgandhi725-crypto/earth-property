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

  global.TEPGeo = {
    withTimeout, tryGPSLocation, tryIPLocation, detectUserLocation,
    calculateDistance, sortByProximity, formatPrice
  };
})(window);

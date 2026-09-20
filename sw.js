importScripts("https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDJ_qGtz1lx_orG4brwp4xUHWdrKctgJ50",
  authDomain: "earth-properties-c3c56.firebaseapp.com",
  projectId: "earth-properties-c3c56",
  messagingSenderId: "677407721236",
  appId: "1:677407721236:web:2964262087105819e6a401"
});

const messaging = firebase.messaging();

// 🔔 Background push handler (unchanged)
messaging.onBackgroundMessage(function(payload) {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "The Earth Property", {
    body: body || "New update!",
    icon: "/icon-192.png"
  });
});

// ═══════════════════════════════════════════════
// 📦 PWA CACHE — app shell + slow-network fallback
// ═══════════════════════════════════════════════
// ⚠️ BUMP THIS NUMBER every time you deploy changed code
// (city.html, price-filter.js, geo-utils.js, index.html, etc.)
// Bumping it forces old cached files to be purged on next app open —
// without this, installed-app users can get stuck on stale code.
const CACHE_NAME = "the-earth-property-v4";
const NAV_TIMEOUT_MS = 5000; // if network takes longer than this on a page load, fall back to cache

const urlsToCache = [
  "/",
  "/index.html",
  "/post.html",
  "/login.html",
  "/signup.html",
  "/myposts.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/offline.html"
];

// File types that change often during active development — always try
// the network first so code updates show up immediately, falling back
// to cache only if the network is slow/unavailable.
function isFreshnessCritical(url) {
  return /\.js(\?|$)/.test(url) || /\.html(\?|$)/.test(url) || /\.css(\?|$)/.test(url);
}

// ── INSTALL: pre-cache the shell ──
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean up old cache versions ──
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: network-first (with timeout) for page navigations AND for
//           js/html/css (so deploys show up right away); cache-first
//           only for truly static assets (images, icons, fonts) ──
self.addEventListener("fetch", (e) => {
  const req = e.request;

  if (req.method !== "GET") return;

  // Never intercept Firebase/Firestore/Cloudinary calls — those need real
  // live network handling (listings, auth, uploads) and must never be
  // served from cache.
  if (req.url.includes("firestore.googleapis.com") ||
      req.url.includes("firebaseio.com") ||
      req.url.includes("googleapis.com") ||
      req.url.includes("cloudinary.com")) {
    return;
  }

  const networkFirst = req.mode === "navigate" || isFreshnessCritical(req.url);

  if (networkFirst) {
    e.respondWith(
      Promise.race([
        fetch(req).then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("network-timeout")), NAV_TIMEOUT_MS)
        )
      ]).catch(() =>
        caches.match(req).then((cached) => cached || (req.mode === "navigate" ? caches.match("/offline.html") : undefined))
      )
    );
    return;
  }

  // ── Truly static assets (logo, icons) — cache-first is fine, these rarely change ──
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).catch(() => caches.match("/offline.html"))
    )
  );
});

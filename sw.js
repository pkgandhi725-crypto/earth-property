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
const CACHE_NAME = "the-earth-property-v3";
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

// ── FETCH: network-first (with timeout) for page navigations,
//           cache-first for everything else (images, css, js) ──
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

  // ── Page loads (typing URL, clicking a link, opening the app) ──
  if (req.mode === "navigate") {
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
        caches.match(req).then((cached) => cached || caches.match("/offline.html"))
      )
    );
    return;
  }

  // ── Static assets (logo, icons, css, js) ──
  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).catch(() => caches.match("/offline.html"))
    )
  );
});

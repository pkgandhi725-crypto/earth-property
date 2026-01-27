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

// 🔔 Background push handler
messaging.onBackgroundMessage(function(payload) {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Earth Property", {
    body: body || "New update!",
    icon: "icon-192.png"
  });
});

// 📦 PWA cache
const CACHE_NAME = "earth-property-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/post.html",
  "/login.html",
  "/signup.html",
  "/myposts.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(urlsToCache)));
});

self.addEventListener("fetch", e=>{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
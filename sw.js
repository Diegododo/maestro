importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');


const CACHE_NAME = 'maestro-v9';

// Init Firebase in SW
firebase.initializeApp({
    apiKey: "AIzaSyBCcZZ-IvQY7MhSosS69ImZpJCwHMyVziA",
    authDomain: "maestro-868c5.firebaseapp.com",
    projectId: "maestro-868c5",
    storageBucket: "maestro-868c5.firebasestorage.app",
    messagingSenderId: "584400657420",
    appId: "1:584400657420:web:99361ef62ff0a40552e229",
    measurementId: "G-PMZ9MZH2L2"
});

// Initialize Firebase Messaging
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Background message: ', payload);
    const title = payload.notification?.title || payload.data?.title || 'Maestro';
    const options = {
        body: payload.notification?.body || payload.data?.body || '',
        icon: './images/logo.png',
        badge: './images/logo.png'
    };
    self.registration.showNotification(title, options);
});


const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './data.js',
    './images/logo.png',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;800&display=swap'
];

// Install Event: Cache core assets & Force Waiting SW to activate
self.addEventListener('install', (e) => {
    self.skipWaiting(); // FORCE IMMEDIATE INSTALL
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activate Event: Clean old caches & Take control immediately
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        }).then(() => self.clients.claim()) // FORCE CONTROL OF OPEN CLIENTS
    );
});

// Fetch Event: Cache First, Network Fallback
self.addEventListener('fetch', (e) => {
    // Ignore non-http requests (like chrome-extension://) and Firestore requests
    if (!e.request.url.startsWith('http')) return;
    if (e.request.url.includes('firestore.googleapis.com')) return;

    e.respondWith(
        caches.match(e.request).then((cached) => {
            return cached || fetch(e.request).then((response) => {
                // Return response if not valid to cache
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                // Optional: Cache new dynamic requests here if needed
                return response;
            });
        })
    );
});

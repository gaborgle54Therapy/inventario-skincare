// Permite instalar la app y abrirla aunque la señal esté mala.
// Siempre intenta la versión más nueva primero; si no hay internet usa la guardada.
const CACHE = 'skincare-v1';
const ARCHIVOS = [
  './', 'index.html', 'css/estilos.css', 'manifest.webmanifest', 'iconos/icono-192.png',
  'js/app.js', 'js/config.js', 'js/api-supabase.js', 'js/api-demo.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((llaves) => Promise.all(llaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const propio = url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net';
  if (e.request.method !== 'GET' || !propio) return; // los datos de Supabase nunca se guardan aquí
  e.respondWith(fetch(e.request)
    .then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
      return r;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});

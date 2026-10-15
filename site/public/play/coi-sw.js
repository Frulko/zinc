// Cross-origin isolation for a host that cannot set headers (GitHub Pages): the page's own requests come back with COOP and COEP, which
// the browser build of Zinc needs for SharedArrayBuffer.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.status === 0) return r;
    const h = new Headers(r.headers);
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Embedder-Policy', 'require-corp');
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  }).catch(() => Response.error()));
});

// مركز النعمان — Service Worker
// عند أي تحديث للموقع: ارفع رقم الإصدار (CACHE_VERSION) → ينزل التحديث تلقائيًّا للمستخدمين.
const CACHE_VERSION = 'v5';
const CACHE = 'numan-' + CACHE_VERSION;
const SHELL = [
  'index.html','admin.html','teacher.html','committee.html',
  'finance.html','logistics.html','media.html',
  'logo.png','manifest.json',
  'lib/supabase.min.js','lib/offline-queue.js',
  'lib/html5-qrcode.min.js','lib/qrcode.min.js',
  'icons/icon-192.png','icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // اترك الطلبات الخارجية (Supabase, CDN) للمتصفّح — لا نكاشها
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // الصفحات: الشبكة أولًا (تحديث فوري عند الاتصال) ثم الكاش (أوفلاين)
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
    return;
  }

  // الأصول الثابتة (شعار/مكتبات): الكاش أولًا ثم الشبكة
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    }).catch(() => r))
  );
});

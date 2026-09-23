// Service Worker cho MikiSkin.
//
// Chiến lược (mục tiêu: người dùng LUÔN thấy bản mới nhất khi có mạng, vẫn dùng được khi mất mạng):
//   - Trang HTML (điều hướng):        network-first  → luôn lấy bản mới nhất khi online;
//                                       khi mất mạng thì dùng bản đã lưu, không có thì hiện offline.html.
//   - CSS/JS/ảnh cùng gốc:            stale-while-revalidate → hiển thị ngay từ cache (nhanh),
//                                       đồng thời âm thầm tải bản mới cho lần sau.
//   - api/*.php và mọi request khác gốc (vd. Google Fonts): KHÔNG can thiệp, để trình duyệt tự xử lý bình thường.
//
// => Vì HTML/CSS/JS không "khoá cứng" theo một bản đã lưu sẵn, mỗi khi bạn deploy bản mới lên Hostinger,
//    người dùng sẽ thấy ngay trong lần tải trang kế tiếp — KHÔNG cần bump số phiên bản dưới đây.
//    Chỉ cần bump CACHE_VERSION khi bạn sửa chính file sw.js này (đổi chiến lược cache) và muốn
//    buộc xoá sạch cache cũ trên máy người dùng.
//
// LƯU Ý QUAN TRỌNG: Hostinger mặc định trả `Cache-Control: max-age=604800` (7 ngày) cho .css/.js.
// fetch() bên trong Service Worker vẫn tuân theo cache HTTP của trình duyệt nếu không nói rõ —
// nên mọi fetch() network ở dưới đều dùng freshRequest() để ép bỏ qua cache đó và lấy đúng bản mới nhất.
const CACHE_VERSION = 'v3';
const PRECACHE = `skinai-precache-${CACHE_VERSION}`;
const RUNTIME = `skinai-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = './offline.html';

const PRECACHE_URLS = [OFFLINE_URL, './manifest.json', './assets/icons/icon-192.png'];

// Bỏ qua cache HTTP của trình duyệt (và của Hostinger) — luôn hỏi thẳng mạng cho bản mới nhất.
// mode 'navigate' không tạo lại được qua Request(); Chrome tự hạ xuống 'same-origin' nên vẫn lấy đúng nội dung.
function freshRequest(request) {
  return new Request(request, { cache: 'reload' });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('skinai-') && k !== PRECACHE && k !== RUNTIME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

async function networkFirstNavigate(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const fresh = await fetch(freshRequest(request));
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const networkFetch = fetch(freshRequest(request))
    .then((resp) => {
      if (resp && resp.ok) cache.put(request, resp.clone());
      return resp;
    })
    .catch(() => null);
  return cached || (await networkFetch) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PUT... để trình duyệt xử lý thẳng, không cache

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google Fonts, v.v. — bỏ qua, không can thiệp
  if (url.pathname.indexOf('/api/') !== -1) return; // dữ liệu người dùng: luôn phải là mạng thật, không cache

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

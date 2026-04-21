// Service worker test environment setup.
// Provides a Cache API polyfill and fetch mock so the jsdom test suite can
// exercise the service-worker caching tests without a real browser or SW.

const BASE_URL = 'http://localhost';
const CACHE_NAME = 'jetshift-v1';

const CACHED_ASSETS = ['/', '/index.html', '/assets/index.js', '/assets/index.css'].map(
  (p) => BASE_URL + p,
);

const fakeManifest = {
  name: 'JetShift',
  short_name: 'JetShift',
  display: 'standalone',
  theme_color: '#0a0a0a',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
};

// ── Fake Cache API ────────────────────────────────────────────────────────────

const cacheStore = new Map<string, boolean>();
for (const url of CACHED_ASSETS) cacheStore.set(url, true);

function toAbsolute(url: string): string {
  return url.startsWith('http') ? url : BASE_URL + url;
}

const fakeCache = {
  async keys() {
    return Array.from(cacheStore.keys()).map((url) => ({ url }) as Request);
  },
  async match(request: Request | string) {
    const url = typeof request === 'string' ? toAbsolute(request) : request.url;
    return cacheStore.has(url) ? new Response('', { status: 200 }) : undefined;
  },
  async put(request: Request, _response: Response) {
    cacheStore.set(request.url, true);
  },
};

const fakeCacheStorage = {
  async open(_name: string) {
    return fakeCache;
  },
};

Object.defineProperty(globalThis, 'caches', {
  value: fakeCacheStorage,
  configurable: true,
  writable: true,
});

// ── Fetch mock ────────────────────────────────────────────────────────────────

type FetchInput = RequestInfo | URL;

const _originalFetch =
  typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined;

(globalThis as unknown as Record<string, unknown>)['fetch'] = async (
  input: FetchInput,
  init?: RequestInit,
): Promise<Response> => {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

  const path = raw.startsWith(BASE_URL) ? raw.slice(BASE_URL.length) : raw;

  if (path === '/manifest.json') {
    return new Response(JSON.stringify(fakeManifest), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (cacheStore.has(toAbsolute(raw))) {
    return new Response('', {
      status: 200,
      headers: { 'x-from-cache': 'true' },
    });
  }

  if (_originalFetch) return _originalFetch(input as RequestInfo, init);
  throw new TypeError(`sw-setup: no handler for ${raw}`);
};

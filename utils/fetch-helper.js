// =================================================================================
// FETCH HELPER MODULE - Universal Fetch with CORS Proxy Support
// =================================================================================
// Menggantikan jQuery $.getJSON() dan $.ajax() dengan native fetch()
// Mendukung automatic proxy wrapping untuk CORS-safe requests
// Pattern diambil dari MINI/services/cex-wallet.js

/**
 * Get CORS proxy URL dari APP_DEV_CONFIG atau fallback default
 * @returns {string} Proxy base URL (dengan trailing ?)
 */
function getCorsProxyUrl() {
  try {
    if (typeof window !== 'undefined') {
      // 1. Prioritas: Proxy spesifik di APP_DEV_CONFIG
      if (window.APP_DEV_CONFIG?.corsProxy) return window.APP_DEV_CONFIG.corsProxy;
      
      // 2. Prioritas: Gunakan getRandomProxy() dari config.js (mengambil acak dari LIST)
      if (typeof window.getRandomProxy === 'function') {
        const p = window.getRandomProxy();
        if (p) return p;
      }
      
      // 3. Prioritas: Ambil langsung dari CONFIG_PROXY.PREFIX
      if (window.CONFIG_PROXY?.PREFIX) return window.CONFIG_PROXY.PREFIX;
    }
  } catch (_) { }
  
  // Fallback terakhir: proxy Cloudflare Workers (jika semua di atas gagal)
  return 'https://proxykanan.awokawok.workers.dev/?';
}

/**
 * Fetch dengan automatic proxy wrapping dan timeout support
 * @param {string} url - Target URL
 * @param {object} opts - Fetch options { method, headers, body, timeout, bypassProxy, retries }
 * @returns {Promise<Response>} Fetch response
 * @throws {Error} Jika timeout, network error, atau HTTP error
 */
async function fetchWithProxy(url, opts = {}) {
  const {
    timeout = 12000,
    bypassProxy = false,
    retries = 1,
    ...fetchOpts
  } = opts;

  const proxyUrl = getCorsProxyUrl();

  // Tentukan apakah perlu proxy:
  // - Bypass jika URL sudah menggunakan proxy, atau jika bypassProxy=true
  // - Otherwise wrap dengan proxy untuk CORS-safe
  const urlLower = String(url).toLowerCase();
  const alreadyProxied = urlLower.startsWith('https://proxy') || 
                         urlLower.startsWith('https://server') || 
                         urlLower.startsWith('https://worker') ||
                         urlLower.startsWith('https://new') ||
                         urlLower.startsWith('https://my');
  
  const needsProxy = !alreadyProxied && !bypassProxy && String(url).startsWith('https://');

  const finalUrl = needsProxy
    ? proxyUrl + encodeURIComponent(url)
    : url;

  // Setup timeout dengan AbortSignal
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let lastError;
  for (let attempt = 0; attempt <= (retries || 0); attempt++) {
    try {
      const resp = await fetch(finalUrl, {
        ...fetchOpts,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errMsg = `HTTP ${resp.status}`;
        console.warn(`[fetchWithProxy] ${errMsg} from ${url.substring(0, 80)}`);
        throw new Error(errMsg);
      }

      return resp;
    } catch (error) {
      lastError = error;

      // Retry logic
      if (attempt < (retries || 0)) {
        const delayMs = Math.min(500 * Math.pow(2, attempt), 5000); // exponential backoff
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      clearTimeout(timeoutId);
      throw lastError;
    }
  }

  clearTimeout(timeoutId);
  throw lastError || new Error('Fetch failed');
}

/**
 * Fetch JSON dengan proxy support
 * @param {string} url - Target URL
 * @param {object} opts - Fetch options
 * @returns {Promise<object>} Parsed JSON response
 */
async function fetchJsonWithProxy(url, opts = {}) {
  const response = await fetchWithProxy(url, opts);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON, got ${contentType}`);
  }
  return response.json();
}

/**
 * Fetch dengan auto-detect HMAC-SHA256 signed requests (Binance-like)
 * Format URL harus sudah include signature, ini hanya wrap proxy
 * @param {string} url - Signed URL (dengan ?signature=...)
 * @param {object} headers - Custom headers { 'X-MBX-ApiKey': key, ... }
 * @param {object} opts - Additional fetch options
 * @returns {Promise<object>} Parsed JSON
 */
async function fetchSignedRequest(url, headers = {}, opts = {}) {
  const response = await fetchWithProxy(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
  return response.json();
}

/**
 * HMAC-SHA256 helper (untuk sign Binance/MEXC requests)
 * @param {string} secret - API secret
 * @param {string} message - Message to sign
 * @returns {Promise<string>} Hex signature
 */
async function hmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * HMAC-SHA512 helper (untuk sign OKX requests)
 * @param {string} secret - API secret
 * @param {string} message - Message to sign
 * @returns {Promise<string>} Base64 signature
 */
async function hmacSha512(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const arr = Array.from(new Uint8Array(sig));
  return btoa(String.fromCharCode.apply(null, arr));
}

/**
 * Exponential backoff sleep helper
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export untuk global use
if (typeof window !== 'undefined') {
  window.fetchWithProxy = fetchWithProxy;
  window.fetchJsonWithProxy = fetchJsonWithProxy;
  window.fetchSignedRequest = fetchSignedRequest;
  window.hmacSha256 = hmacSha256;
  window.hmacSha512 = hmacSha512;
  window.sleep = sleep;
}

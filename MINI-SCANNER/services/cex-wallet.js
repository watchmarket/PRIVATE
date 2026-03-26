// ============================================================
// CEX Wallet Fee Service — cex-wallet.js
// Fetch withdrawal fee, deposit/withdraw status per token per chain
// dari masing-masing CEX (Binance, MEXC, Gate, Indodax)
// Data di-cache di localStorage key LS_CEX_WALLET
// ============================================================

const LS_CEX_WALLET = 'hybrid_cex_wallet';

// ─── In-Memory Cache ──────────────────────────────────────
// Agar tidak JSON.parse localStorage setiap kali lookup (sangat lambat untuk 1000+ token)
let _walletMemCache = null;

function _getCexWalletCache() {
  if (_walletMemCache !== null) return _walletMemCache;
  try { _walletMemCache = JSON.parse(localStorage.getItem(LS_CEX_WALLET) || '{}'); }
  catch { _walletMemCache = {}; }
  return _walletMemCache;
}

function _invalidateWalletMemCache() {
  _walletMemCache = null;
}

// ─── Chain Name Normalization ─────────────────────────────
// Maps nama network dari API CEX ke key chain kita (bsc, ethereum, polygon, arbitrum, base)
const _CEX_CHAIN_MAP = {
  // --- BSC / BEP20 ---
  BSC: 'bsc', BEP20: 'bsc', BEP2: 'bsc', BNB: 'bsc',
  BSCMAINNET: 'bsc', BNBCHAIN: 'bsc', BSCBEP20: 'bsc', BSC_BSC: 'bsc',
  BSCCHAIN: 'bsc', 'BNB CHAIN': 'bsc', 'BNB SMART CHAIN': 'bsc',
  // --- Ethereum / ERC20 ---
  ETH: 'ethereum', ERC20: 'ethereum', ETHEREUM: 'ethereum',
  ETHMAINNET: 'ethereum', ETHEREUMMAINNET: 'ethereum', USDTERC20: 'ethereum',
  // --- Polygon ---
  MATIC: 'polygon', POLYGON: 'polygon', POL: 'polygon',
  POLYGONPOS: 'polygon', POLYGONEVM: 'polygon', POLYGONMAINNET: 'polygon',
  'POLYGON POS': 'polygon', 'POLYGON_POS': 'polygon',
  // --- Arbitrum ---
  ARB: 'arbitrum', ARBITRUM: 'arbitrum', ARBONE: 'arbitrum',
  ARBITRUMONE: 'arbitrum', ARBEVM: 'arbitrum', ARBMAINNET: 'arbitrum',
  ARBITRUMEVM: 'arbitrum', ARBI: 'arbitrum', 'ARBITRUM ONE': 'arbitrum', 'ARB-ETH': 'arbitrum',
  // --- Base ---
  BASE: 'base', BASEEVM: 'base', BASEMAINNET: 'base', BASECHAIN: 'base',
  'BASE MAINNET': 'base', 'BASE CHAIN': 'base',
  // --- Skip non-EVM (return null = skip) ---
  BTC: null, BITCOIN: null, TRX: null, TRC20: null, TRON: null, USDTTRC20: null,
  SOL: null, SOLANA: null, SPL: null, XRP: null, LTC: null, DOGE: null,
  ADA: null, DOT: null, AVAX: null, AVAXC: null, AVALANCHE: null,
  FTM: null, OP: null, OPTIMISM: null, TON: null, NEAR: null, ATOM: null,
  HT: null, HECO: null, STARKNET: null, ZKSYNC: null, LINEA: null, SCROLL: null,
  KCC: null, CELO: null, MOONBEAM: null, MOONRIVER: null, CRONOS: null,
  KLAY: null, KLAYTN: null, SUI: null, APT: null, APTOS: null,
};

function _normalizeChain(raw) {
  if (!raw) return null;
  const up = raw.toUpperCase().replace(/[-\s]/g, '');
  return _CEX_CHAIN_MAP[up] ?? null;
}

// ─── Crypto Helpers ───────────────────────────
async function _hmacSha256(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _hmacSha512(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _sha512hex(text) {
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Fetch Helper (dengan proxy) ───────────────────────────
async function _fetchJson(url, opts = {}) {
  const proxyUrl = APP_DEV_CONFIG.corsProxy + encodeURIComponent(url);
  const resp = await fetch(proxyUrl, { ...opts, signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ─── BINANCE ──────────────────────────────────────────────
// GET /sapi/v1/capital/config/getall — signed HMAC-SHA256
// Proxy khusus: proxykanan.awokawok.workers.dev (tidak pakai corsProxy biasa)
async function _fetchBinanceWallet() {
  const { ApiKey, ApiSecret } = CONFIG_CEX_KEYS.BINANCE;
  const ts = Date.now();
  const qs = `timestamp=${ts}&recvWindow=10000`;
  const sig = await _hmacSha256(ApiSecret, qs);
  const proxyBase = 'https://proxykanan.awokawok.workers.dev/?';
  const url = `${proxyBase}https://api-gcp.binance.com/sapi/v1/capital/config/getall?${qs}&signature=${sig}`;
  const resp = await fetch(url, {
    headers: { 'X-MBX-ApiKey': ApiKey },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();

  const result = [];
  for (const item of (data || [])) {
    for (const net of (item.networkList || [])) {
      const chain = _normalizeChain(net.network);
      if (!chain) continue;
      result.push({
        token: item.coin.toUpperCase(),
        chain,
        feeWd: parseFloat(net.withdrawFee) || 0,
        depositEnable: !!net.depositEnable,
        withdrawEnable: !!net.withdrawEnable,
        minWd: parseFloat(net.withdrawMin) || 0,
      });
    }
  }
  return result;
}

// ─── MEXC ─────────────────────────────────────────────────
// GET /api/v3/capital/config/getall — signed HMAC-SHA256
async function _fetchMexcWallet() {
  const { ApiKey, ApiSecret } = CONFIG_CEX_KEYS.MEXC;
  const ts = Date.now();
  const qs = `timestamp=${ts}`;
  const sig = await _hmacSha256(ApiSecret, qs);
  const url = `https://api.mexc.com/api/v3/capital/config/getall?${qs}&signature=${sig}`;
  const data = await _fetchJson(url, { headers: { 'X-MEXC-APIKEY': ApiKey } });

  const result = [];
  for (const item of (data || [])) {
    for (const net of (item.networkList || [])) {
      const chain = _normalizeChain(net.network);
      if (!chain) continue;
      result.push({
        token: item.coin.toUpperCase(),
        chain,
        feeWd: parseFloat(net.withdrawFee) || 0,
        depositEnable: net.depositEnable !== false,
        withdrawEnable: net.withdrawEnable !== false,
        minWd: parseFloat(net.withdrawMin) || 0,
      });
    }
  }
  return result;
}

// ─── GATE.IO ──────────────────────────────────────────────
// Dua endpoint:
// 1. GET /api/v4/spot/currencies  — public, status WD/DP per chain (via chains[])
// 2. GET /api/v4/wallet/withdraw_status — signed, fee WD per chain
async function _fetchGateWallet() {
  // ── 1. Spot currencies (public) → status deposit/withdraw per chain ──
  const currData = await _fetchJson('https://api.gateio.ws/api/v4/spot/currencies');

  // Build statusMap: { TOKEN: { RAW_CHAIN_UPPER: { depositEnable, withdrawEnable } } }
  // Prioritas: item.chains[] (per-chain), fallback: item.chain (top-level)
  const statusMap = {};
  for (const item of (currData || [])) {
    const tk = (item.currency || '').toUpperCase();
    if (!statusMap[tk]) statusMap[tk] = {};
    const chains = Array.isArray(item.chains) && item.chains.length > 0
      ? item.chains
      : [{ name: item.chain || '', withdraw_disabled: item.withdraw_disabled, deposit_disabled: item.deposit_disabled }];
    for (const ch of chains) {
      const chKey = (ch.name || '').toUpperCase();
      if (!chKey) continue;
      statusMap[tk][chKey] = {
        depositEnable:  !ch.deposit_disabled,
        withdrawEnable: !ch.withdraw_disabled,
      };
    }
  }

  // ── 2. Withdraw status (authenticated) → fee WD per chain ──
  const { ApiKey, ApiSecret } = CONFIG_CEX_KEYS.GATE;
  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyHash = await _sha512hex('');
  const sigPayload = `GET\n/api/v4/wallet/withdraw_status\n\n${bodyHash}\n${ts}`;
  const sig = await _hmacSha512(ApiSecret, sigPayload);
  const feeData = await _fetchJson('https://api.gateio.ws/api/v4/wallet/withdraw_status', {
    headers: { 'KEY': ApiKey, 'SIGN': sig, 'Timestamp': ts }
  });

  // Build feeMap: { TOKEN: { RAW_CHAIN_UPPER: { feeWd, minWd } } }
  const feeMap = {};
  for (const item of (feeData || [])) {
    const token = (item.currency || '').toUpperCase().split('_')[0];
    if (!feeMap[token]) feeMap[token] = {};
    const chainsMap = item.withdraw_fix_on_chains || {};
    const chainKeys = Object.keys(chainsMap);
    if (chainKeys.length > 0) {
      for (const rawChain of chainKeys) {
        feeMap[token][rawChain.toUpperCase()] = {
          feeWd: parseFloat(chainsMap[rawChain]) || 0,
          minWd: parseFloat(item.withdraw_amount_mini || item.withdraw_min_amount || 0),
        };
      }
    } else if (item.chain) {
      feeMap[token][item.chain.toUpperCase()] = {
        feeWd: parseFloat(item.withdraw_fix || item.withdraw_percent || 0),
        minWd: parseFloat(item.withdraw_amount_mini || item.withdraw_min_amount || 0),
      };
    }
  }

  // ── 3. Merge: sumber utama adalah statusMap dari spot/currencies ──
  // Setiap chain yang dikenali di statusMap akan masuk result, fee diambil dari feeMap (0 jika tidak ada)
  const result = [];
  for (const [token, chainStatus] of Object.entries(statusMap)) {
    for (const [rawChain, st] of Object.entries(chainStatus)) {
      const chain = _normalizeChain(rawChain);
      if (!chain) continue;
      const fee = (feeMap[token] || {})[rawChain] || {};
      result.push({
        token, chain,
        feeWd:         fee.feeWd || 0,
        depositEnable:  st.depositEnable,
        withdrawEnable: st.withdrawEnable,
        minWd:         fee.minWd || 0,
      });
    }
  }
  return result;
}

// ─── INDODAX ──────────────────────────────────────────────
// Public endpoint: GET /api/summaries (tanpa auth, no withdraw fee detail)
// TAPI dengan auth: method=withdrawFee
async function _fetchIndodaxWallet() {
  const { ApiKey, ApiSecret } = CONFIG_CEX_KEYS.INDODAX;
  const ts = Date.now();
  const nonce = ts;
  const body = `method=getInfo&timestamp=${ts}&nonce=${nonce}`;
  const sig = await _hmacSha512(ApiSecret, body);

  // Indodax: pakai public summaries untuk daftar koin, withdraw fee dari info
  const sumUrl = 'https://indodax.com/api/summaries';
  const sumData = await _fetchJson(sumUrl);

  const result = [];
  for (const [pair, info] of Object.entries(sumData.tickers || {})) {
    const token = pair.replace(/_idr$/, '').toUpperCase();
    const feeWd = parseFloat(info.withdraw_fee || 0);
    // Indodax menggunakan BSC & ETH sebagai jaringan utama
    // Cek coin_info untuk chain yang tersedia
    const chainEntry = (sumData.coins || {})[pair] || {};
    const rawChain = chainEntry.network || chainEntry.chain || 'bsc';
    const chain = _normalizeChain(rawChain) || 'bsc';
    result.push({
      token,
      chain,
      feeWd,
      depositEnable: true,
      withdrawEnable: true,
      minWd: parseFloat(info.min_withdraw || 0),
    });
  }
  return result;
}

// ─── Main: Update All CEX Wallet Fees ─────────────────────
let _cexWalletUpdating = false;

async function updateCexWalletFees(onProgress) {
  if (_cexWalletUpdating) { showToast('Proses update sedang berjalan...'); return; }
  _cexWalletUpdating = true;

  const cexTasks = [
    { key: 'binance', label: 'BINANCE', fn: _fetchBinanceWallet },
    { key: 'mexc',    label: 'MEXC',    fn: _fetchMexcWallet },
    { key: 'gate',    label: 'GATE',    fn: _fetchGateWallet },
    { key: 'indodax', label: 'INDODAX', fn: _fetchIndodaxWallet },
  ];

  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(LS_CEX_WALLET) || '{}'); } catch {}

  const errors = [];
  let successCount = 0;

  for (const cex of cexTasks) {
    if (onProgress) onProgress(cex.label, 'loading');
    try {
      const rows = await cex.fn();
      // Rebuild map: cache[cexKey][TOKEN][CHAIN] = { feeWd, depositEnable, withdrawEnable, minWd }
      cache[cex.key] = {};
      for (const r of rows) {
        if (!cache[cex.key][r.token]) cache[cex.key][r.token] = {};
        cache[cex.key][r.token][r.chain] = {
          feeWd: r.feeWd,
          depositEnable: r.depositEnable,
          withdrawEnable: r.withdrawEnable,
          minWd: r.minWd,
        };
      }
      successCount++;
      if (onProgress) onProgress(cex.label, 'ok', rows.length);
    } catch (e) {
      errors.push(`${cex.label}: ${e.message}`);
      if (onProgress) onProgress(cex.label, 'error', e.message);
    }
  }

  cache._updatedAt = new Date().toISOString();
  localStorage.setItem(LS_CEX_WALLET, JSON.stringify(cache));
  // Update in-memory cache langsung (tidak perlu re-parse localStorage)
  _walletMemCache = cache;
  _cexWalletUpdating = false;
  return { successCount, errors };
}

// ─── Lookup Helpers ───────────────────────────────────────

// Dapatkan fee WD dalam USDT untuk token tertentu di CEX+chain
// tokenPriceUsdt: harga token dalam USDT (untuk konversi feeWd unit token → USDT)
function getCexFeeWdUsdt(cexKey, tokenSymbol, chain, tokenPriceUsdt) {
  if (!tokenSymbol || !chain) return 0;
  const cache = _getCexWalletCache();
  const cexData = cache[cexKey] || {};
  const tokenData = cexData[tokenSymbol.toUpperCase()] || {};
  const chainData = tokenData[chain] || {};
  const feeWd = chainData.feeWd || 0;
  if (!feeWd) return 0;
  // Stablecoin: fee dalam USD langsung (1:1)
  const STABLES = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'FDUSD'];
  const isStable = STABLES.includes(tokenSymbol.toUpperCase());
  if (isStable) return feeWd;
  return feeWd * (tokenPriceUsdt || 0);
}

// Dapatkan status WD/DP token di CEX+chain
// Return: { depositEnable, withdrawEnable, feeWd, feeWdUsdt, minWd } atau null jika data belum ada
function getCexTokenStatus(cexKey, tokenSymbol, chain, tokenPriceUsdt) {
  if (!tokenSymbol || !chain) return null;
  const cache = _getCexWalletCache();
  const cexData = cache[cexKey] || {};
  const tokenData = cexData[tokenSymbol.toUpperCase()] || {};
  const chainData = tokenData[chain] || null;
  if (!chainData) return null;
  const feeWdUsdt = getCexFeeWdUsdt(cexKey, tokenSymbol, chain, tokenPriceUsdt);
  return {
    depositEnable:  chainData.depositEnable !== false,
    withdrawEnable: chainData.withdrawEnable !== false,
    feeWd:     chainData.feeWd || 0,
    feeWdUsdt,
    minWd:     chainData.minWd || 0,
  };
}

// Apakah data wallet untuk CEX tertentu sudah pernah di-fetch?
// Digunakan untuk membedakan "belum fetch" (→ ??) vs "sudah fetch tapi token tidak ada" (→ ✖)
function isCexWalletFetched(cexKey) {
  const cache = _getCexWalletCache();
  const cexData = cache[cexKey];
  return !!cexData && Object.keys(cexData).length > 0;
}

// Waktu terakhir update
function getCexWalletUpdatedAt() {
  const cache = _getCexWalletCache();
  if (!cache._updatedAt) return null;
  try {
    return new Date(cache._updatedAt).toLocaleString('id-ID', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return cache._updatedAt; }
}

// ─── UI: Update Button Handler ─────────────────────────────
async function runUpdateCexWallet() {
  const btn = document.getElementById('btnUpdateCexWallet');
  const statusEl = document.getElementById('cexWalletStatus');
  const overlay = document.getElementById('walletUpdateOverlay');
  const progressEl = document.getElementById('walletUpdateProgress');

  // Tampilkan overlay
  if (overlay) overlay.classList.add('open');
  if (btn) btn.disabled = true;

  const lines = {};
  const allCex = ['BINANCE', 'MEXC', 'GATE', 'INDODAX'];
  allCex.forEach(c => { lines[c] = `${c}: ⏳`; });

  function renderStatus() {
    if (statusEl) statusEl.innerHTML = Object.values(lines).join('<br>');
  }
  renderStatus();

  const result = await updateCexWalletFees((label, status, extra) => {
    if (status === 'loading') {
      lines[label] = `${label}: ⏳ fetching...`;
      if (progressEl) progressEl.textContent = `Mengambil data ${label}...`;
    } else if (status === 'ok') {
      lines[label] = `${label}: ✅ ${extra} token`;
    } else {
      lines[label] = `${label}: ❌ ${extra}`;
    }
    renderStatus();
  });

  // Sembunyikan overlay
  if (overlay) overlay.classList.remove('open');
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Check Wallet Exchanger'; }

  const upEl = document.getElementById('walletLastUpdate');
  if (upEl) upEl.textContent = 'Update: ' + (getCexWalletUpdatedAt() || '-');

  if (result.errors.length === 0) {
    showToast(`✅ Fee WD berhasil diupdate (${result.successCount} CEX)`);
  } else {
    showToast(`⚠ ${result.successCount} berhasil, ${result.errors.length} gagal`);
  }
}

// ─── Export / Import CEX Wallet Data ──────────────────────

function exportCexWalletData() {
  const cache = _getCexWalletCache();
  if (!cache._updatedAt && Object.keys(cache).length <= 1) {
    showToast('⚠ Belum ada data fee WD. Tekan Update dulu.');
    return;
  }
  const json = JSON.stringify(cache, null, 2);
  const filename = `cex-wallet-fees-${new Date().toISOString().slice(0,10)}.json`;

  // Android WebView
  if (window.AndroidBridge && window.AndroidBridge.saveFile) {
    window.AndroidBridge.saveFile(filename, json);
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  showToast('✅ Data fee WD berhasil di-export');
}

function importCexWalletData(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      // Validasi: harus object dengan minimal salah satu key CEX
      const validKeys = ['binance','mexc','gate','indodax'];
      const hasData = validKeys.some(k => data[k] && typeof data[k] === 'object');
      if (!hasData) {
        showToast('⚠ File tidak valid: tidak ada data CEX yang dikenali');
        return;
      }
      localStorage.setItem(LS_CEX_WALLET, JSON.stringify(data));
      initCexWalletUI();
      showToast('✅ Data fee WD berhasil di-import');
    } catch (err) {
      showToast('❌ Gagal import: ' + err.message);
    }
  };
  r.readAsText(f);
  input.value = '';
}

// Inisialisasi: tampilkan waktu update terakhir saat halaman dimuat
function initCexWalletUI() {
  const upEl = document.getElementById('walletLastUpdate');
  const statusEl = document.getElementById('cexWalletStatus');
  const upAt = getCexWalletUpdatedAt();
  if (upEl) upEl.textContent = upAt ? 'Update: ' + upAt : '';
  if (statusEl && upAt) {
    const cache = _getCexWalletCache();
    const cexes = ['binance', 'mexc', 'gate', 'indodax'];
    const lines = cexes.map(k => {
      const d = cache[k];
      const cnt = d ? Object.keys(d).length : 0;
      return `${k.toUpperCase()}: ${cnt > 0 ? `✅ ${cnt} token` : '—'}`;
    });
    statusEl.innerHTML = lines.join('<br>');
  }
}

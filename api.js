// =================================================================================
// API AND NETWORK FUNCTIONS
// =================================================================================

const APP_META = (function () {
  try {
    return (typeof window !== 'undefined' && window.CONFIG_APP && window.CONFIG_APP.APP) ? window.CONFIG_APP.APP : {};
  } catch (_) { return {}; }
})();
const APP_NAME = APP_META.NAME || 'MULTIALL-PLUS';
const APP_VERSION = APP_META.VERSION ? String(APP_META.VERSION) : '';
const APP_HASHTAG = (function (name) {
  try {
    const base = String(name || '').trim();
    if (!base) return '#APP';
    const normalized = base.replace(/\s+/g, '');
    return `#${normalized.toUpperCase()}`;
  } catch (_) { return '#APP'; }
})(APP_NAME);
const APP_HEADER = APP_VERSION ? `${APP_HASHTAG} v${APP_VERSION}` : APP_HASHTAG;

/**
 * Fetches the user's public IP address.
 * @returns {Promise<string>} The user's IP address or 'N/A' on failure.
 */
async function getUserIP() {
  try {
    // Using a reliable and simple IP service
    const response = await fetch('https://api.ipify.org?format=json');
    if (!response.ok) return 'N/A';
    const data = await response.json();
    return data.ip || 'N/A';
  } catch (error) {
    // console.error('Error fetching IP address:', error);
    return 'N/A';
  }
}


/**
 * Fetches the order book for a token pair from a CEX.
 * @param {object} coins - The token object containing pair info.
 * @param {string} NameToken - The base token symbol.
 * @param {string} NamePair - The quote token symbol.
 * @param {string} cex - The CEX name.
 * @param {string} tableBodyId - The ID of the table body to update.
 * @param {function} callback - The callback function (error, result).
 */

/**
 * Fetch USDT/IDR rate from Tokocrypto and cache to storage (IndexedDB).
 * Stores 'PRICE_RATE_USDT' for IDR conversions (e.g., INDODAX display).
 */
function getRateUSDT() {
  //const url = "https://cloudme-toko.2meta.app/api/v1/depth?symbol=USDTIDR&limit=5";
  const url = "https://www.tokocrypto.site/api/v3/depth?symbol=USDTIDR&limit=5"
  return $.getJSON(url)
    .done(data => {
      if (data && data.bids && data.bids.length > 0) {
        const topBid = parseFloat(data.bids[0][0]); // harga beli tertinggi

        if (!isNaN(topBid) && topBid > 0) {
          saveToLocalStorage('PRICE_RATE_USDT', topBid);
        } else {
          console.error("Failed to parse USDT/IDR rate from Tokocrypto response:", data);
          // refactor: use toast helper
          if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal parse kurs USDT/IDR dari Tokocrypto.');
        }
      } else {
        console.error("Invalid data structure for USDT/IDR rate from Tokocrypto:", data);
        if (typeof toast !== 'undefined' && toast.error) toast.error('Struktur data kurs dari Tokocrypto tidak valid.');
      }
    })
    .fail((jqXHR, textStatus, errorThrown) => {
      console.error("Failed to fetch USDT/IDR rate from Tokocrypto:", textStatus, errorThrown);
      if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal mengambil kurs USDT/IDR dari Tokocrypto.');
    });
}

/**
 * Fetch gas metrics (gwei and USD) for active chains and cache to 'ALL_GAS_FEES'.
 * Resolves chain list based on current app mode and filters.
 */
async function feeGasGwei() {
  // Determine which chains to fetch gas for (mode-aware)
  let chains = [];
  try {
    if (Array.isArray(window.CURRENT_CHAINS) && window.CURRENT_CHAINS.length) {
      chains = window.CURRENT_CHAINS.map(c => String(c).toLowerCase());
    } else if (typeof getAppMode === 'function') {
      const m = getAppMode();
      if (m.type === 'single' && m.chain) chains = [String(m.chain).toLowerCase()];
      else if (typeof getFilterMulti === 'function') {
        const fm = getFilterMulti();
        if (fm && Array.isArray(fm.chains) && fm.chains.length) chains = fm.chains.map(c => String(c).toLowerCase());
      }
    }
  } catch (_) { }
  if (!chains.length) return; // no active chains -> skip fetching

  // Update progress label with chain names for better UX
  try {
    const names = chains
      .map(n => {
        try {
          const cd = getChainData(n);
          return (cd?.SHORT_NAME || cd?.Nama_Chain || n).toString().toUpperCase();
        } catch (_) { return String(n).toUpperCase(); }
      })
      .filter(Boolean);
    if (names.length) {
      $('#progress').text(`CHECKING GAS / GWEI CHAINS: ${names.join(', ')}`);
    } else {
      $('#progress').text('CHECKING GAS / GWEI CHAINS...');
    }
  } catch (_) { }

  const chainInfos = chains.map(name => {
    const data = getChainData(name);
    return data ? { ...data, rpc: data.RPC, symbol: data.BaseFEEDEX.replace("USDT", ""), gasLimit: data.GASLIMIT || 21000 } : null;
  }).filter(c => c && c.rpc && c.symbol);

  const symbols = [...new Set(chainInfos.map(c => c.BaseFEEDEX.toUpperCase()))];
  if (!symbols.length) return;

  try {
    const prices = await $.getJSON(`https://api-gcp.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
    const tokenPrices = Object.fromEntries(prices.map(p => [p.symbol.replace('USDT', ''), parseFloat(p.price)]));

    const gasResults = await Promise.all(chainInfos.map(async (chain) => {
      const price = tokenPrices[chain.symbol.toUpperCase()];
      if (!price) return null;
      try {
        const web3 = new Web3(new Web3.providers.HttpProvider(chain.rpc));
        const block = await web3.eth.getBlock("pending");
        const baseFee = Number(block?.baseFeePerGas ?? await web3.eth.getGasPrice());
        const gwei = (baseFee / 1e9) * 2;
        const gasUSD = (gwei * chain.gasLimit * price) / 1e9;
        return { chain: chain.Nama_Chain, key: chain.key || chain.symbol, symbol: chain.symbol, tokenPrice: price, gwei, gasUSD };
      } catch { return null; }
    }));
    // Keep previous label; readiness is updated by caller
    saveToLocalStorage("ALL_GAS_FEES", gasResults.filter(Boolean));
  } catch (err) { console.error("Gagal ambil harga token gas:", err); }
}

/**
 * Calculate HMAC signature for CEX API requests.
 * @param {string} exchange - Exchange key (e.g., BINANCE, MEXC, OKX)
 * @param {string} apiSecret - Secret key
 * @param {string} dataToSign - Raw query string/body
 * @returns {string|null} signature
 */
function calculateSignature(exchange, apiSecret, dataToSign) {
  if (!apiSecret || !dataToSign) return null;
  const method = exchange.toUpperCase() === "OKX" ? "HmacSHA256" : "HmacSHA256";
  const encoding = exchange.toUpperCase() === "OKX" ? CryptoJS.enc.Base64 : CryptoJS.enc.Hex;
  return CryptoJS[method](dataToSign, apiSecret).toString(encoding);
}

/**
 * Pick a random OKX Web3 DEX API key from pool.
 * @param {Array<{ApiKeyOKX:string}>} keys
 * @returns {any}
 */
function getRandomApiKeyOKX(keys) {
  if (!keys || keys.length === 0) {
    throw new Error("OKX API keys are not available.");
  }
  return keys[Math.floor(Math.random() * keys.length)];
}

/**
 * Send a compact status message to Telegram (startup/online, etc.).
 * Prefers proxy (PROXY_URL) but falls back to direct bot API when not provided.
 * Link previews are disabled by default.
 */
function sendTelegramHTML(message) {
  try {
    const cfg = (typeof CONFIG_TELEGRAM !== 'undefined' && CONFIG_TELEGRAM) ? CONFIG_TELEGRAM : {};
    const chatId = cfg.CHAT_ID;
    if (!chatId) return;

    // prefer proxy to avoid exposing bot token
    let endpoint = cfg.PROXY_URL;
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    if (!endpoint) {
      const token = cfg.BOT_TOKEN;
      if (!token) return;
      endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
    }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (_) { /* noop */ }
}

// =================================================================================
// AUTO VOLUME FUNCTIONS
// =================================================================================

/**
 * Parse orderbook response from various CEX formats.
 * @param {string} cex - CEX name (GATE, BINANCE, MEXC, etc.)
 * @param {object} response - Raw API response
 * @returns {{ asks: Array<[number, number]>, bids: Array<[number, number]> }}
 */
function parseOrderbook(cex, response) {
  try {
    const cexUpper = String(cex || '').toUpperCase();
    const parser = CONFIG_CEX[cexUpper]?.ORDERBOOK?.parser || 'standard';

    switch (parser) {
      case 'standard':
        // Format: { asks: [[price, amount], ...], bids: [[price, amount], ...] }
        return {
          asks: Array.isArray(response.asks) ? response.asks.map(([p, a]) => [parseFloat(p), parseFloat(a)]) : [],
          bids: Array.isArray(response.bids) ? response.bids.map(([p, a]) => [parseFloat(p), parseFloat(a)]) : []
        };

      case 'kucoin':
        // Format: { data: { asks: [...], bids: [...] } }
        const data = response.data || response;
        return {
          asks: Array.isArray(data.asks) ? data.asks.map(([p, a]) => [parseFloat(p), parseFloat(a)]) : [],
          bids: Array.isArray(data.bids) ? data.bids.map(([p, a]) => [parseFloat(p), parseFloat(a)]) : []
        };

      case 'mexc':
        // Format: { asks: [...], bids: [...] } sama seperti standard
        return {
          asks: Array.isArray(response.asks) ? response.asks.map(([p, a]) => [parseFloat(p), parseFloat(a)]) : [],
          bids: Array.isArray(response.bids) ? response.bids.map(([p, a]) => [parseFloat(p), parseFloat(a)]) : []
        };

      default:
        // Fallback ke standard
        return {
          asks: Array.isArray(response.asks) ? response.asks.map(([p, a]) => [parseFloat(p), parseFloat(a)]) : [],
          bids: Array.isArray(response.bids) ? response.bids.map(([p, a]) => [parseFloat(p), parseFloat(a)]) : []
        };
    }
  } catch (error) {
    console.error('[parseOrderbook] Error parsing orderbook:', error);
    return { asks: [], bids: [] };
  }
}

/**
 * Calculate volume-weighted average price and actual modal based on orderbook depth.
 * @param {object} orderbook - Parsed orderbook { asks: [[price, amount], ...], bids: [...] }
 * @param {number} maxModal - Maximum modal limit (user input)
 * @param {number} maxLevels - Maximum orderbook levels to check (1-4)
 * @param {string} side - 'asks' (CEX→DEX) or 'bids' (DEX→CEX)
 * @returns {object} { actualModal, avgPrice, totalCoins, levelsUsed, error }
 */
function calculateAutoVolume(orderbook, maxModal, maxLevels, side) {
  try {
    // 🔍 DEBUG: Input parameters
    console.log('┌─────────────────────────────────────────────────┐');
    console.log('│ 🔍 [AUTO VOLUME] CALCULATION START             │');
    console.log('└─────────────────────────────────────────────────┘');
    console.log('📊 Modal Max:', maxModal);
    console.log('📊 Max Levels:', maxLevels);
    console.log('📊 Side:', side, side === 'asks' ? '(CEX→DEX/BUY)' : '(DEX→CEX/SELL)');

    // Validation
    if (!orderbook || typeof orderbook !== 'object') {
      console.warn('⚠️  Invalid orderbook data');
      return {
        actualModal: maxModal,
        avgPrice: 0,
        totalCoins: 0,
        levelsUsed: 0,
        error: 'Invalid orderbook data'
      };
    }

    const levels = orderbook[side]; // 'asks' or 'bids'

    if (!Array.isArray(levels) || levels.length === 0) {
      console.warn('⚠️  No orderbook levels available');
      return {
        actualModal: maxModal,
        avgPrice: 0,
        totalCoins: 0,
        levelsUsed: 0,
        error: 'No orderbook levels available'
      };
    }

    // Limit maxLevels to 4
    const limitedMaxLevels = Math.min(Math.max(1, Math.floor(maxLevels)), 4);
    const limitedLevels = levels.slice(0, limitedMaxLevels);

    // 🔍 DEBUG: Orderbook levels
    console.log('📚 Orderbook Levels (first', limitedMaxLevels, '):', limitedLevels.map((l, i) => ({
      level: i + 1,
      price: l[0],
      amount: l[1],
      volumeUSDT: (l[0] * l[1]).toFixed(2)
    })));

    let totalUSDT = 0;
    let totalCoins = 0;
    let levelsUsed = 0;
    let lastLevelPrice = 0;  // Track last/highest level price for display

    // Iterate through levels and accumulate
    console.log('🔄 Processing levels...');
    for (let i = 0; i < limitedLevels.length; i++) {
      const [price, amount] = limitedLevels[i];

      // Skip invalid levels
      if (!isFinite(price) || !isFinite(amount) || price <= 0 || amount <= 0) {
        console.warn(`  ⏭️  Level ${i + 1} skipped (invalid):`, { price, amount });
        continue;
      }

      lastLevelPrice = price;  // Update with each valid level (last one wins)
      const volumeUSDT = price * amount;

      // Check if adding this level would exceed maxModal
      if (totalUSDT + volumeUSDT > maxModal) {
        // Take partial from this level
        const remaining = maxModal - totalUSDT;
        const partialCoins = remaining / price;

        totalCoins += partialCoins;
        totalUSDT += remaining;
        levelsUsed = i + 1;

        // 🔍 DEBUG: Partial level used
        console.log(`  📍 Level ${i + 1} (PARTIAL):`, {
          price,
          amount,
          volumeUSDT: volumeUSDT.toFixed(2),
          remaining: remaining.toFixed(2),
          partialCoins: partialCoins.toFixed(6),
          totalUSDT: totalUSDT.toFixed(2),
          totalCoins: totalCoins.toFixed(6),
          status: '🛑 STOP (Modal reached)'
        });

        // Stop: maxModal reached
        break;
      }

      // Add entire level
      totalUSDT += volumeUSDT;
      totalCoins += amount;
      levelsUsed = i + 1;

      // 🔍 DEBUG: Full level used
      console.log(`  ✅ Level ${i + 1} (FULL):`, {
        price,
        amount,
        volumeUSDT: volumeUSDT.toFixed(2),
        totalUSDT: totalUSDT.toFixed(2),
        totalCoins: totalCoins.toFixed(6)
      });
    }

    // Calculate weighted average price
    const avgPrice = totalCoins > 0 ? (totalUSDT / totalCoins) : 0;

    // 🔍 DEBUG: Final results
    console.log('┌─────────────────────────────────────────────────┐');
    console.log('│ ✨ [AUTO VOLUME] RESULTS                       │');
    console.log('└─────────────────────────────────────────────────┘');
    console.log('📊 Levels Used:', levelsUsed, '/', limitedMaxLevels);
    console.log('💰 Actual Modal:', totalUSDT.toFixed(2), '/', maxModal.toFixed(2));
    console.log('🪙 Total Coins:', totalCoins.toFixed(6));
    console.log('💵 Weighted Avg Price:', avgPrice.toFixed(8), '(for PNL calculation)');
    console.log('💵 Last Level Price:', lastLevelPrice.toFixed(8), '(for display)');
    console.log('');

    return {
      actualModal: totalUSDT,     // Can be < maxModal if volume insufficient
      avgPrice,                    // For PNL calculation (weighted average)
      lastLevelPrice,              // For display (last/highest level used)
      totalCoins,
      levelsUsed,
      error: null
    };

  } catch (error) {
    console.error('[calculateAutoVolume] Error:', error);
    return {
      actualModal: maxModal,
      avgPrice: 0,
      totalCoins: 0,
      levelsUsed: 0,
      error: error.message || 'Calculation error'
    };
  }
}

async function sendStatusTELE(user, status) {
  const settings = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage('SETTING_SCANNER', {}) : {};
  const walletMeta = settings.walletMeta || 'N/A';
  const ipAddress = await getUserIP();

  // Get active chains information
  let chainInfo = 'MULTICHAIN';
  try {
    if (Array.isArray(window.CURRENT_CHAINS) && window.CURRENT_CHAINS.length > 0) {
      const chainNames = window.CURRENT_CHAINS.map(c => String(c).toUpperCase());
      chainInfo = chainNames.length === 1 ? chainNames[0] : 'MULTICHAIN';
    }
  } catch (_) { }

  const message = `<b>${APP_HEADER}</b>\n<b>USER:</b> ${user ? user.toUpperCase() : '-'}[<b>${status ? status.toUpperCase() : '-'}]</b>\n<b>IP:</b> ${ipAddress}\n<b>CHAIN :</b> ${chainInfo}`;
  sendTelegramHTML(message);
}

/**
 * Send a detailed arbitrage signal message to Telegram.
 * Links include CEX trade pages and DEX aggregator swap link.
 */
async function MultisendMessage(
  cex, dex, tokenData, modal, PNL, priceBUY, priceSELL,
  FeeSwap, FeeWD, totalFee, nickname, direction,
  statusOverrides /* { depositToken, withdrawToken, depositPair, withdrawPair } opsional */
) {
  const chainKey = String(tokenData.chain || '').toLowerCase();
  const chainConfig = CONFIG_CHAINS[chainKey];
  if (!chainConfig) return;

  // === NORMALISASI INPUT ===
  // Canonicalize agar TOKEN = coin yg dimaksud "token" (bukan quote/pair) dan PAIR = pasangannya,
  // terlepas dari bagaimana caller mengisi tokenData.
  const isC2D = (direction === 'cex_to_dex');     // token -> pair
  const isD2C = (direction === 'dex_to_cex');     // pair -> token

  // Data mentah (apa adanya dari caller)
  const rawSym = String(tokenData.symbol || '');
  const rawPairSym = String(tokenData.pairSymbol || '');
  const rawSc = String(tokenData.contractAddress || '');        // address utk "symbol"
  const rawScPair = String(tokenData.pairContractAddress || '');    // address utk "pairSymbol"

  // Canonical TOKEN/PAIR
  // - saat cex_to_dex: symbol=TOKEN, pairSymbol=PAIR (sudah pas)
  // - saat dex_to_cex: symbol=PAIR,  pairSymbol=TOKEN (perlu dibalik)
  const TOKEN_SYM = isC2D ? rawSym : rawPairSym;
  const PAIR_SYM = isC2D ? rawPairSym : rawSym;
  const SC_TOKEN = isC2D ? rawSc : rawScPair;
  const SC_PAIR = isC2D ? rawScPair : rawSc;

  // Arah transaksi (from → to)
  const fromSymbol = isC2D ? TOKEN_SYM : PAIR_SYM;
  const toSymbol = isC2D ? PAIR_SYM : TOKEN_SYM;
  const scIn = isC2D ? SC_TOKEN : SC_PAIR;
  const scOut = isC2D ? SC_PAIR : SC_TOKEN;

  // Links dasar (pakai symbol yg sesuai arah current view)
  const urls = (typeof GeturlExchanger === 'function')
    ? GeturlExchanger(String(cex).toUpperCase(), fromSymbol, toSymbol) || {}
    : {};

  const linkCexTradeToken = urls.tradeToken || '#';
  const linkCexTradePair = urls.tradePair || '#';
  const wdTokenUrl = urls.withdrawTokenUrl || urls.withdrawUrl || '#';
  const dpTokenUrl = urls.depositTokenUrl || urls.depositUrl || '#';
  const wdPairUrl = urls.withdrawPairUrl || urls.withdrawUrl || '#';
  const dpPairUrl = urls.depositPairUrl || urls.depositUrl || '#';

  const linkDefillama = `https://swap.defillama.com/?chain=${chainConfig.Nama_Chain}&from=${scIn}&to=${scOut}`;
  const linkScFrom = `${chainConfig.URL_Chain}/token/${scIn}`;
  const linkScTo = `${chainConfig.URL_Chain}/token/${scOut}`;

  // === STATUS WD/DP ===
  let depTok, wdTok, depPair, wdPair;
  let stockLink = '#';
  try {
    // Fallback autodetect
    const listChain = (typeof getTokensChain === 'function') ? getTokensChain(chainKey) : [];
    const listMulti = (typeof getTokensMulti === 'function') ? getTokensMulti() : [];
    const flat = ([]).concat(Array.isArray(listChain) ? listChain : []).concat(Array.isArray(listMulti) ? listMulti : []);
    const flatAll = (typeof flattenDataKoin === 'function') ? flattenDataKoin(flat) : [];
    const match = (flatAll || []).find(e =>
      String(e.cex || '').toUpperCase() === String(cex || '').toUpperCase() &&
      String(e.chain || '').toLowerCase() === chainKey &&
      String(e.symbol_in || '').toUpperCase() === String(TOKEN_SYM || '').toUpperCase() &&
      String(e.symbol_out || '').toUpperCase() === String(PAIR_SYM || '').toUpperCase()
    );
    if (match) {
      depTok = match.depositToken; wdTok = match.withdrawToken;
      depPair = match.depositPair; wdPair = match.withdrawPair;
    }

    // Override dari caller (jika ada) — menang
    if (statusOverrides && typeof statusOverrides === 'object') {
      if ('depositToken' in statusOverrides) depTok = statusOverrides.depositToken;
      if ('withdrawToken' in statusOverrides) wdTok = statusOverrides.withdrawToken;
      if ('depositPair' in statusOverrides) depPair = statusOverrides.depositPair;
      if ('withdrawPair' in statusOverrides) wdPair = statusOverrides.withdrawPair;
    }

    // STOK link (alamat wallet CEX di explorer) — pakai scIn agar relevan dgn langkah pertama
    const chainData = (typeof getChainData === 'function') ? getChainData(chainKey) : null;
    const walletObj = chainData?.CEXCHAIN?.[String(cex).toUpperCase()] || {};
    const firstAddr = Object.entries(walletObj)
      .filter(([k, v]) => /address/i.test(String(k)) && v && v !== '#')
      .map(([, v]) => String(v))[0];
    if (firstAddr) stockLink = `${chainConfig.URL_Chain}/token/${scIn}?a=${firstAddr}`;
  } catch (_) { }

  const emo = (v) => (v === true ? '✅' : (v === false ? '❌' : '❓'));

  // PROSES (CEX ↔ DEX) arah-aware
  const procLeft = isC2D ? String(cex).toUpperCase() : String(dex).toUpperCase();
  const procRight = isC2D ? String(dex).toUpperCase() : String(cex).toUpperCase();

  const settings = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage('SETTING_SCANNER', {}) : {};
  const walletMeta = settings.walletMeta || 'N/A';
  const ipAddress = await getUserIP();
  // Compose pesan
  const lines = [];
  lines.push('---------------------------------------------------');
  lines.push(`${APP_HEADER} #${String(chainConfig.Nama_Chain || '').toUpperCase()}`);
  lines.push(`<b>IP:</b> ${ipAddress}\n<b>WALLET:</b> ${walletMeta}`);
  lines.push(`#USERNAME : #${String(nickname || '').trim() || '-'}`);
  lines.push('---------------------------------------------------');
  lines.push(`<b>PROSES :</b> <b>${procLeft}</b>[ #${String(fromSymbol).toUpperCase()} ] => <b>${procRight}</b>[ #${String(toSymbol).toUpperCase()} ]`);
  lines.push(`<b>TRANSAKSI :</b> <a href="${linkScFrom}">${String(fromSymbol).toUpperCase()}</a> => <a href="${linkScTo}">${String(toSymbol).toUpperCase()}</a>`);
  lines.push(`<b>MODAL:</b> ${Number(modal || 0).toFixed(2)}$ | <a href="${stockLink}">STOK</a>`);

  // BUY/SELL arah-aware
  const buyLinkText = isC2D ? linkCexTradeToken : linkDefillama;
  const sellLinkText = isC2D ? linkDefillama : linkCexTradePair;
  lines.push(`<b>BUY USDT-${String(toSymbol).toUpperCase()}</b> : <a href="${buyLinkText}">${Number(priceBUY || 0).toFixed(10)}$</a>`);
  lines.push(`<b>SELL ${String(toSymbol).toUpperCase()}-USDT</b> : <a href="${sellLinkText}">${Number(priceSELL || 0).toFixed(10)}$</a>`);
  lines.push(`<b>PROFIT & TOTAL FEE :</b> ${Number(PNL || 0).toFixed(2)}$ & ${Number(totalFee || 0).toFixed(2)}$`);
  lines.push(`<b>FEE WD & FEE SWAP :</b> ${Number(FeeWD || 0).toFixed(2)}$ & ${Number(FeeSwap || 0).toFixed(2)}$`);

  // Status WD/DP — selalu tampilkan berdasarkan canonical TOKEN/PAIR
  const tokenSym = String(TOKEN_SYM || '').toUpperCase();
  const pairSym = String(PAIR_SYM || '').toUpperCase();
  lines.push(`<b>${tokenSym}:</b> <a href="${wdTokenUrl}">WD</a>${emo(wdTok)} | <a href="${dpTokenUrl}">DP</a>${emo(depTok)}`);
  lines.push(`<b>${pairSym}:</b> <a href="${wdPairUrl}">WD</a>${emo(wdPair)} | <a href="${dpPairUrl}">DP</a>${emo(depPair)}`);
  lines.push('---------------------------------------------------');

  sendTelegramHTML(lines.join('\n'));
}


// [moved later] CEX Shims will be appended at end of file to override earlier defs
// =================================================================================
// Helpers
// =================================================================================
const clean = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function infoSet(msg) {
  try {
    // Respect RUN banner: if any run state is active, do not override
    const st = (typeof getAppState === 'function') ? getAppState() : { run: 'NO' };
    const anyRun = (String(st.run || 'NO').toUpperCase() === 'YES') || (window.RUN_STATES && Object.values(window.RUN_STATES).some(Boolean));
    if (anyRun) { if (typeof window.updateRunningChainsBanner === 'function') window.updateRunningChainsBanner(); return; }
  } catch (_) { }
  try { $('#infoAPP').html(msg); } catch (_) { }
  // debug logs removed
}
function infoAdd(msg) {
  try {
    const st = (typeof getAppState === 'function') ? getAppState() : { run: 'NO' };
    const anyRun = (String(st.run || 'NO').toUpperCase() === 'YES') || (window.RUN_STATES && Object.values(window.RUN_STATES).some(Boolean));
    if (anyRun) { if (typeof window.updateRunningChainsBanner === 'function') window.updateRunningChainsBanner(); return; }
  } catch (_) { }
  try { $('#infoAPP').html(`${$('#infoAPP').html()}<br>${msg}`); } catch (_) { }
  // debug logs removed
}

// =================================================================================
// CEX Shims (final override to delegate to services)
// =================================================================================
function getPriceCEX(coins, NameToken, NamePair, cex, tableBodyId) {
  if (window.App && window.App.Services && window.App.Services.CEX && typeof window.App.Services.CEX.getPriceCEX === 'function') {
    return window.App.Services.CEX.getPriceCEX(coins, NameToken, NamePair, cex, tableBodyId);
  }
  return Promise.reject(new Error('CEX service not available'));
}

async function fetchWalletStatus(cex) {
  if (window.App && window.App.Services && window.App.Services.CEX && typeof window.App.Services.CEX.fetchWalletStatus === 'function') {
    return window.App.Services.CEX.fetchWalletStatus(cex);
  }
  return [];
}

function applyWalletStatusToTokenList(tokenListName) {
  if (window.App && window.App.Services && window.App.Services.CEX && typeof window.App.Services.CEX.applyWalletStatusToTokenList === 'function') {
    return window.App.Services.CEX.applyWalletStatusToTokenList(tokenListName);
  }
}

async function checkAllCEXWallets() {
  if (window.App && window.App.Services && window.App.Services.CEX && typeof window.App.Services.CEX.checkAllCEXWallets === 'function') {
    return window.App.Services.CEX.checkAllCEXWallets();
  }
}

async function fetchAllCEXPrices(cex) {
  if (window.App && window.App.Services && window.App.Services.CEX && typeof window.App.Services.CEX.fetchAllCEXPrices === 'function') {
    return window.App.Services.CEX.fetchAllCEXPrices(cex);
  }
  return Promise.reject(new Error('fetchAllCEXPrices not available'));
}

// =================================================================================
// DEX Shims (final override to delegate to services)
// =================================================================================
function getPriceDEX(sc_input_in, des_input, sc_output_in, des_output, amount_in, PriceRate, dexType, NameToken, NamePair, cex, chainName, codeChain, action, tableBodyId) {
  if (window.App && window.App.Services && window.App.Services.DEX && typeof window.App.Services.DEX.getPriceDEX === 'function') {
    return window.App.Services.DEX.getPriceDEX(sc_input_in, des_input, sc_output_in, des_output, amount_in, PriceRate, dexType, NameToken, NamePair, cex, chainName, codeChain, action, tableBodyId);
  }
  return Promise.reject(new Error('DEX service not available'));
}

function getPriceAltDEX(sc_input, des_input, sc_output, des_output, amount_in, PriceRate, dexType, NameToken, NamePair, cex, nameChain, codeChain, action) {
  if (window.App && window.App.Services && window.App.Services.DEX && typeof window.App.Services.DEX.getPriceAltDEX === 'function') {
    return window.App.Services.DEX.getPriceAltDEX(sc_input, des_input, sc_output, des_output, amount_in, PriceRate, dexType, NameToken, NamePair, cex, nameChain, codeChain, action);
  }
  return Promise.reject(new Error('DEX service not available'));
}

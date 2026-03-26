// ─── CEX Orderbook Fetch ─────────────────────
let usdtRate = 16000;
async function fetchUsdtRate() {
    const cached = cacheGet('usdtRate');
    if (cached !== undefined) { usdtRate = cached; return usdtRate; }
    try {
        const r = await fetch(APP_DEV_CONFIG.corsProxy + 'https://indodax.com/api/ticker/usdtidr');
        const d = await r.json();
        usdtRate = parseFloat(d.ticker?.last) || 16000;
        cacheSet('usdtRate', usdtRate, 60_000);
    } catch { }
    return usdtRate;
}

// ─── Native Token Price (untuk konversi gas fee DEX ke USD) ──
// Binance public API — no key required
const _NATIVE_SYMBOL = {
    1:     'ETHUSDT',   // Ethereum
    56:    'BNBUSDT',   // BSC
    137:   'POLUSDT',   // Polygon (ex MATIC)
    42161: 'ETHUSDT',   // Arbitrum
    8453:  'ETHUSDT',   // Base
};

async function fetchNativeTokenPrice(chainId) {
    const sym = _NATIVE_SYMBOL[chainId];
    if (!sym) return 0;
    const cacheKey = `native:price:${sym}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;
    try {
        const url = `https://data-api.binance.vision/api/v3/ticker/price?symbol=${sym}`;
        const r = await fetch(url);
        const d = await r.json();
        const price = parseFloat(d.price) || 0;
        cacheSet(cacheKey, price, 60_000); // cache 1 menit
        return price;
    } catch { return 0; }
}

// ─── Chain Gas Estimate in USD ────────────────
// Fetch gas price via eth_gasPrice JSON-RPC ke DefiLlama RPC (CORS-enabled, langsung tanpa proxy)
// Dipanggil sekali saat start scan per chain aktif, result di-cache 1 menit
async function fetchChainGasEstimateUsdt(chainId) {
    const chainCfg = Object.values(CONFIG_CHAINS).find(c => c.Kode_Chain === Number(chainId));
    const rpc      = chainCfg?.RPC;
    const gasUnits = chainCfg?.GAS_UNITS;
    if (!rpc || !gasUnits) return 0;
    const cacheKey = `gas:estimate:${chainId}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;
    try {
        const [rpcResp, nativePrice] = await Promise.all([
            fetch(rpc, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 }),
            }),
            fetchNativeTokenPrice(chainId),
        ]);
        if (!rpcResp.ok) return 0;
        const rpcData = await rpcResp.json();
        const gasPriceWei = parseInt(rpcData.result, 16);
        if (!gasPriceWei || !nativePrice) return 0;
        const estimateUsdt = (gasPriceWei * gasUnits / 1e18) * nativePrice;
        cacheSet(cacheKey, estimateUsdt, 60_000);
        return estimateUsdt;
    } catch { return 0; }
}

async function fetchOrderbook(cexKey, symbol) {
    const cacheKey = `ob:${cexKey}:${symbol}`;
    return cacheWrap(cacheKey, 1200, async () => {
        const cfg = CONFIG_CEX[cexKey];
        if (!cfg) return null;
        let url = cfg.ORDERBOOK.urlTpl(symbol);
        if (cfg.ORDERBOOK.proxy) url = APP_DEV_CONFIG.corsProxy + url;
        try {
            const r = await fetch(url);
            const d = await r.json();
            return parseOrderbook(d, cfg.ORDERBOOK.parser);
        } catch (e) { return { error: e.message }; }
    });
}

function parseOrderbook(raw, parser) {
    try {
        let bids, asks;
        if (parser === 'standard') { bids = raw.bids; asks = raw.asks; }
        else if (parser === 'indodax') {
            // Indodax depth API: both buy & sell return [price_idr, amount_coin]
            bids = (raw.buy || []).map(b => [b[0] / usdtRate, b[1]]);
            asks = (raw.sell || []).map(s => [s[0] / usdtRate, s[1]]);
        }
        if (!bids || !asks) return { error: 'no data' };
        const toNum = (arr) => arr.slice(0, 5).map(e => [parseFloat(e[0]), parseFloat(e[1])]);
        return {
            bids: toNum(bids),
            asks: toNum(asks),
            askPrice: parseFloat(asks[0]?.[0] || 0),
            bidPrice: parseFloat(bids[0]?.[0] || 0),
        };
    } catch (e) { return { error: e.message }; }
}

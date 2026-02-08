// =================================================================================
// CEX Service Module (moved intact) — Pindahkan utuh + shim
// =================================================================================
/**
 * CEX Service Module
 * - Normalizes order books from CEX endpoints
 * - Fetches wallet (DP/WD) statuses
 * - Bridges UI rendering (updateTableVolCEX)
 */
(function initCEXService(global) {
    const root = global || (typeof window !== 'undefined' ? window : {});
    const App = root.App || (root.App = {});

    // Keep internal constant local to this module
    const stablecoins = ["USDT", "DAI", "USDC", "FDUSD"];

    // ====== Fungsi Universal untuk Orderbook CEX ======
    /** Normalize standard CEX orderbook payload into top N levels. */
    function processOrderBook(data, limit = 4) {
        if (!data?.bids || !data?.asks) {
            console.error("Invalid orderbook data:", data);
            return { priceBuy: [], priceSell: [] };
        }

        // bids: sort desc (harga tertinggi dulu)
        const bids = [...data.bids].sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
        // asks: sort asc (harga terendah dulu)
        const asks = [...data.asks].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

        // harga beli = ambil harga tertinggi (dari bids)
        const priceBuy = bids.slice(0, limit).map(([price, volume]) => ({
            price: parseFloat(price),                // harga beli
            volume: parseFloat(volume) * parseFloat(price) // nilai dalam USDT
        }));

        // harga jual = ambil harga terendah (dari asks)
        const priceSell = asks.slice(0, limit).map(([price, volume]) => ({
            price: parseFloat(price),                // harga jual
            volume: parseFloat(volume) * parseFloat(price) // nilai dalam USDT
        }));

        return { priceBuy, priceSell };
    }

    // Removed legacy processOrderBookLAMA (unused)

    // ====== Fungsi Khusus untuk INDODAX ======
    /** Normalize INDODAX orderbook (IDR) to USDT using cached rate. */
    function processIndodaxOrderBook(data, limit = 4) {
        if (!data?.buy || !data?.sell) {
            console.error("Invalid INDODAX response structure:", data);
            return { priceBuy: [], priceSell: [] };
        }

        // Ensure same semantics: buy = bids desc (best bid first), sell = asks asc (best ask first)
        const buySorted = [...data.buy].sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
        const sellSorted = [...data.sell].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

        const priceBuy = buySorted.slice(0, limit).map(([price, volume]) => {
            const priceFloat = parseFloat(price);
            const volumeFloat = parseFloat(volume);
            return {
                price: convertIDRtoUSDT(priceFloat),
                volume: convertIDRtoUSDT(priceFloat * volumeFloat)
            };
        });

        const priceSell = sellSorted.slice(0, limit).map(([price, volume]) => {
            const priceFloat = parseFloat(price);
            const volumeFloat = parseFloat(volume);
            return {
                price: convertIDRtoUSDT(priceFloat),
                volume: convertIDRtoUSDT(priceFloat * volumeFloat)
            };
        });

        return { priceBuy, priceSell };
    }

    // ====== Konfigurasi Exchange via registry/CONFIG_CEX ======
    // Orderbook endpoints and parsers are sourced from CONFIG_CEX.<CEX>.ORDERBOOK
    // through services/cex/registry.js. This object is kept empty by default
    // and will be hydrated by the merge block below.
    let exchangeConfig = {};

    // If CEX registry is present and defines orderbook config, prefer it
    try {
        if (root.CEX && typeof root.CEX._all === 'function') {
            const merged = {};
            root.CEX._all().forEach(e => {
                const ob = e?.orderbook || null;
                if (!ob || typeof ob.urlTpl !== 'function') return;
                // Accept direct parser function or a token resolved here
                let parserFn = null;
                if (typeof ob.parser === 'function') parserFn = ob.parser;
                else if (typeof ob.parserToken === 'string') {
                    const tok = ob.parserToken.toLowerCase();
                    if (tok === 'standard') parserFn = (data) => processOrderBook(data, 4);
                    else if (tok === 'indodax') parserFn = (data) => processIndodaxOrderBook(data, 4);
                    else if (tok === 'kucoin') parserFn = (data) => processOrderBook(data?.data || {}, 4);
                    else if (tok === 'bitget') parserFn = (data) => processOrderBook(data?.data || {}, 4);
                    else if (tok === 'bybit') parserFn = (data) => {
                        try {
                            const a = (data?.result?.a || []).map(([p, v]) => [p, v]);
                            const b = (data?.result?.b || []).map(([p, v]) => [p, v]);
                            return processOrderBook({ asks: a, bids: b }, 4);
                        } catch (_) { return { priceBuy: [], priceSell: [] }; }
                    }
                    else if (tok === 'htx') parserFn = (data) => {
                        // HTX response: { status: "ok", tick: { asks: [[p,q],...], bids: [[p,q],...] } }
                        try {
                            return processOrderBook(data?.tick || {}, 4);
                        } catch (_) { return { priceBuy: [], priceSell: [] }; }
                    }
                }
                if (parserFn) {
                    merged[e.name] = { url: ob.urlTpl, processData: parserFn };
                }
            });
            // Keep existing as fallback for entries not provided via registry
            exchangeConfig = Object.assign({}, exchangeConfig, merged);
        }
    } catch (_) { }

    // Secondary hydration directly from CONFIG_CEX as a safety net
    try {
        const cfgAll = root.CONFIG_CEX || {};
        Object.keys(cfgAll).forEach(name => {
            const up = String(name).toUpperCase();
            if (exchangeConfig[up]) return;
            const ob = cfgAll[up]?.ORDERBOOK || {};
            if (typeof ob.urlTpl !== 'function') return;
            let parserFn = null;
            const tok = String(ob.parser || '').toLowerCase();
            if (tok === 'standard') parserFn = (data) => processOrderBook(data, 4);
            else if (tok === 'indodax') parserFn = (data) => processIndodaxOrderBook(data, 4);
            else if (tok === 'kucoin') parserFn = (data) => processOrderBook(data?.data || {}, 4);
            else if (tok === 'bitget') parserFn = (data) => processOrderBook(data?.data || {}, 4);
            else if (tok === 'bybit') parserFn = (data) => {
                try {
                    const a = (data?.result?.a || []).map(([p, v]) => [p, v]);
                    const b = (data?.result?.b || []).map(([p, v]) => [p, v]);
                    return processOrderBook({ asks: a, bids: b }, 4);
                } catch (_) { return { priceBuy: [], priceSell: [] }; }
            }
            else if (tok === 'htx') parserFn = (data) => {
                // HTX response: { status: "ok", tick: { asks: [[p,q],...], bids: [[p,q],...] } }
                try {
                    return processOrderBook(data?.tick || {}, 4);
                } catch (_) { return { priceBuy: [], priceSell: [] }; }
            }
            if (parserFn) exchangeConfig[up] = { url: ob.urlTpl, processData: parserFn };
        });
    } catch (_) { }

    // Debug: log populated exchanges once at init
    try {
        const keysInit = Object.keys(exchangeConfig || {});
        if (keysInit.length === 0) {
            /* debug logs removed */
        } else {
            /* debug logs removed */
        }
    } catch (_) { }

    /** Fetches the order book for a token pair from a CEX. */
    /**
     * Fetch and parse CEX orderbook for token and pair.
     * Also updates the UI via updateTableVolCEX.
     */
    function getPriceCEX(coins, NameToken, NamePair, cex, tableBodyId) {
        return new Promise((resolve, reject) => {
            const key = String(cex || '').toUpperCase();
            let config = exchangeConfig[key] || exchangeConfig[cex];
            // On-demand build as last resort if missing
            if (!config) {
                try {
                    const ob = (root.CONFIG_CEX || {})[key]?.ORDERBOOK || {};
                    if (typeof ob.urlTpl === 'function') {
                        const tok = String(ob.parser || '').toLowerCase();
                        let parserFn = null;
                        if (tok === 'standard') parserFn = (data) => processOrderBook(data, 4);
                        else if (tok === 'indodax') parserFn = (data) => processIndodaxOrderBook(data, 4);
                        else if (tok === 'kucoin') parserFn = (data) => processOrderBook(data?.data || {}, 4);
                        else if (tok === 'bitget') parserFn = (data) => processOrderBook(data?.data || {}, 4);
                        else if (tok === 'bybit') parserFn = (data) => {
                            try {
                                const a = (data?.result?.a || []).map(([p, v]) => [p, v]);
                                const b = (data?.result?.b || []).map(([p, v]) => [p, v]);
                                return processOrderBook({ asks: a, bids: b }, 4);
                            } catch (_) { return { priceBuy: [], priceSell: [] }; }
                        }
                        else if (tok === 'htx') parserFn = (data) => {
                            // HTX response: { status: "ok", tick: { asks: [[p,q],...], bids: [[p,q],...] } }
                            try {
                                return processOrderBook(data?.tick || {}, 4);
                            } catch (_) { return { priceBuy: [], priceSell: [] }; }
                        };
                        if (parserFn) {
                            exchangeConfig[key] = { url: ob.urlTpl, processData: parserFn };
                            config = exchangeConfig[key];
                            /* debug logs removed */
                        }
                    }
                } catch (_) { }
            }
            if (!config) {
                return reject(`Exchange ${key || cex} tidak ditemukan dalam konfigurasi.`);
            }

            // CEX delay configuration removed; requests execute immediately
            const isStablecoin = (token) => stablecoins.includes(token);

            const urls = [
                isStablecoin(NameToken) ? null : config.url({ symbol: NameToken }),
                isStablecoin(NamePair) ? null : config.url({ symbol: NamePair })
            ];

            let promises = urls.map((url, index) => {
                const tokenName = index === 0 ? NameToken : NamePair;
                if (isStablecoin(tokenName)) {
                    return Promise.resolve({
                        tokenName: tokenName,
                        price_sell: 1,
                        price_buy: 1,
                        volumes_sell: Array(4).fill({ price: 1, volume: 10000 }),
                        volumes_buy: Array(4).fill({ price: 1, volume: 10000 })
                    });
                }
                if (url) {
                    return new Promise((resolveAjax, rejectAjax) => {
                        $.ajax({
                            url: url,
                            method: 'GET',
                            success: function (data) {
                                try {
                                    const processedData = config.processData(data);
                                    // Select best prices: BUY uses best ask (lowest), SELL uses best bid (highest)
                                    const priceBuy = processedData?.priceSell?.[0]?.price || 0;
                                    const priceSell = processedData?.priceBuy?.[0]?.price || 0;
                                    if (priceBuy <= 0 || priceSell <= 0) {
                                        return rejectAjax(`Harga tidak valid untuk ${tokenName} di ${cex}.`);
                                    }
                                    resolveAjax({
                                        tokenName: tokenName,
                                        price_sell: priceSell,
                                        price_buy: priceBuy,
                                        volumes_sell: processedData.priceSell || [],
                                        volumes_buy: processedData.priceBuy || []
                                    });
                                } catch (error) {
                                    rejectAjax(`Error processing data untuk ${tokenName} di ${cex}: ${error.message}`);
                                }
                            },
                            error: function (xhr) {
                                const errorMessage = xhr.responseJSON?.msg || "Unknown ERROR";
                                rejectAjax(`Error koneksi API untuk ${tokenName} di ${cex}: ${errorMessage}`);
                            }
                        });
                    });
                }
                return Promise.resolve(null);
            });

            Promise.all(promises).then(resultsArray => {
                const results = resultsArray.reduce((acc, res) => {
                    if (res) acc[res.tokenName] = res;
                    return acc;
                }, {});

                const priceBuyToken = results[NameToken]?.price_buy || 0;
                const priceBuyPair = results[NamePair]?.price_buy || 0;

                const feeTokensRaw = parseFloat(coins.feeWDToken || 0);
                const feePairsRaw = parseFloat(coins.feeWDPair || 0);
                const feeWDToken = (isFinite(feeTokensRaw) ? feeTokensRaw : 0) * priceBuyToken;
                const feeWDPair = (isFinite(feePairsRaw) ? feePairsRaw : 0) * priceBuyPair;

                if (isNaN(feeWDToken) || feeWDToken < 0) return reject(`FeeWD untuk ${NameToken} di ${cex} tidak valid.`);
                if (isNaN(feeWDPair) || feeWDPair < 0) return reject(`FeeWD untuk ${NamePair} di ${cex} tidak valid.`);

                // ✅ FIX: Extract WD/DP status from coins.dataCexs for WALLET CEX skip logic
                const cexData = coins.dataCexs?.[cex] || {};
                const withdrawToken = cexData.withdrawToken !== undefined ? cexData.withdrawToken : false;
                const depositToken = cexData.depositToken !== undefined ? cexData.depositToken : false;
                const withdrawPair = cexData.withdrawPair !== undefined ? cexData.withdrawPair : false;
                const depositPair = cexData.depositPair !== undefined ? cexData.depositPair : false;

                const finalResult = {
                    token: NameToken.toUpperCase(),
                    sc_input: coins.sc_in,
                    sc_output: coins.sc_out,
                    pair: NamePair.toUpperCase(),
                    cex: cex.toUpperCase(),
                    priceSellToken: results[NameToken]?.price_sell || 0,
                    priceBuyToken: priceBuyToken,
                    priceSellPair: results[NamePair]?.price_sell || 0,
                    priceBuyPair: priceBuyPair,
                    volumes_sellToken: results[NameToken]?.volumes_sell || [],
                    volumes_buyToken: results[NameToken]?.volumes_buy || [],
                    volumes_sellPair: results[NamePair]?.volumes_sell || [],
                    volumes_buyPair: results[NamePair]?.volumes_buy || [],
                    feeWDToken: feeWDToken,
                    feeWDPair: feeWDPair,
                    chainName: coins.chain,
                    // ✅ FIX: Include WD/DP status for WALLET CEX skip logic
                    withdrawToken: withdrawToken,
                    depositToken: depositToken,
                    withdrawPair: withdrawPair,
                    depositPair: depositPair
                };

                updateTableVolCEX(finalResult, cex, tableBodyId);

                resolve(finalResult);
            }).catch(error => { reject(error); });
        });
    }

    // =================================================================================
    // Universal CEX Wallet Fetcher (moved)
    // =================================================================================
    /** Fetch DP/WD statuses and fees for a given CEX (per token/chain). */
    async function fetchWalletStatus(cex) {
        // CEX yang menggunakan PUBLIC API (tidak perlu API Key)
        const publicApiCex = ['HTX', 'HUOBI', 'INDODAX', 'KUCOIN', 'BITGET', 'LBANK'];
        const cexUpper = String(cex || '').toUpperCase();

        // Get API keys from IndexedDB via getCEXCredentials()
        let ApiKey, ApiSecret, Passphrase;

        if (!publicApiCex.includes(cexUpper)) {
            if (typeof getCEXCredentials === 'function') {
                const credentials = getCEXCredentials(cex);
                if (!credentials) {
                    throw new Error(`${cex} API Key/Secret not configured. Please configure in Settings.`);
                }
                ApiKey = credentials.ApiKey;
                ApiSecret = credentials.ApiSecret;
                Passphrase = credentials.Passphrase;
            } else {
                // Fallback to old method
                const cfg = CONFIG_CEX?.[cex] || {};
                const secretSrc = (typeof CEX_SECRETS !== 'undefined' && CEX_SECRETS?.[cex]) ? CEX_SECRETS[cex]
                    : ((typeof window !== 'undefined' && window.CEX_SECRETS && window.CEX_SECRETS[cex]) ? window.CEX_SECRETS[cex] : {});
                ApiKey = cfg.ApiKey || secretSrc?.ApiKey;
                ApiSecret = cfg.ApiSecret || secretSrc?.ApiSecret;
                Passphrase = cfg.Passphrase || secretSrc?.Passphrase;
            }
        }

        const hasKeys = !!(ApiKey && ApiSecret);
        const timestamp = Date.now();

        switch (cex) {
            case 'BINANCE': {
                if (!hasKeys) throw new Error(`${cex} API Key/Secret not configured in CONFIG_CEX.`);
                const query = `timestamp=${timestamp}`;
                const sig = calculateSignature("BINANCE", ApiSecret, query, "HmacSHA256");
                const url = `https://proxykanan.awokawok.workers.dev/?https://api-gcp.binance.com/sapi/v1/capital/config/getall?${query}&signature=${sig}`;
                const response = await $.ajax({ url, headers: { "X-MBX-ApiKey": ApiKey } });
                return response.flatMap(item =>
                    (item.networkList || []).map(net => ({
                        cex,
                        tokenName: item.coin,
                        chain: net.network,
                        feeWDs: parseFloat(net.withdrawFee || 0),
                        depositEnable: !!net.depositEnable,
                        withdrawEnable: !!net.withdrawEnable,
                        contractAddress: net.contractAddress || '',
                        trading: !!item.trading // Tambahkan field trading dari response Binance
                    }))
                );
            }

            case 'MEXC': {
                if (!hasKeys) throw new Error(`${cex} API Key/Secret not configured in CONFIG_CEX.`);
                const query = `recvWindow=5000&timestamp=${timestamp}`;
                const sig = calculateSignature("MEXC", ApiSecret, query);
                const url = `https://proxykiri.awokawok.workers.dev/?https://api.mexc.com/api/v3/capital/config/getall?${query}&signature=${sig}`;
                const response = await $.ajax({ url, headers: { "X-MEXC-APIKEY": ApiKey } });
                return response.flatMap(item =>
                    (item.networkList || []).map(net => ({
                        cex,
                        tokenName: item.coin,
                        chain: net.netWork,
                        feeWDs: parseFloat(net.withdrawFee || 0),
                        depositEnable: !!net.depositEnable,
                        withdrawEnable: !!net.withdrawEnable,
                        contractAddress: net.contract || '',
                        trading: true // MEXC tidak menyediakan field trading di API, default true
                    }))
                );
            }

            case 'GATE': {
                if (!hasKeys) throw new Error(`${cex} API Key/Secret not configured in CONFIG_CEX.`);
                const host = "https://cors.gemul-putra.workers.dev/?https://api.gateio.ws";
                const prefix = "/api/v4";
                const ts = Math.floor(Date.now() / 1000);

                function gateSign(method, path, query = "", body = "") {
                    const hashedBody = CryptoJS.SHA512(body).toString(CryptoJS.enc.Hex);
                    const payload = `${method}\n${path}\n${query}\n${hashedBody}\n${ts}`;
                    return CryptoJS.HmacSHA512(payload, ApiSecret).toString(CryptoJS.enc.Hex);
                }

                const wdPath = "/wallet/withdraw_status";
                const wdHeaders = { KEY: ApiKey, SIGN: gateSign("GET", prefix + wdPath, "", ""), Timestamp: ts };
                const wdData = await $.ajax({ url: `${host}${prefix}${wdPath}`, headers: wdHeaders });
                const statusData = await $.ajax({ url: `${host}${prefix}/spot/currencies` });

                return statusData.flatMap(item =>
                    (item.chains || []).map(chain => {
                        const match = (wdData || []).find(w => (w.currency || '').toUpperCase() === (item.currency || '').toUpperCase()) || {};
                        const chainCode = String(chain.name || chain.chain || chain.network || chain.chain_name || '').toUpperCase();
                        const feeMap = match.withdraw_fix_on_chains || {};
                        const feeOnChain = feeMap[chainCode] ?? feeMap[chain.name] ?? feeMap[chain.chain] ?? 0;
                        return {
                            cex,
                            tokenName: item.currency,
                            chain: chainCode,
                            feeWDs: parseFloat(chain.withdraw_fee || feeOnChain || 0),
                            depositEnable: !Boolean(chain.deposit_disabled),
                            withdrawEnable: !Boolean(chain.withdraw_disabled),
                            contractAddress: chain.addr || '',
                            trading: !item.delisted // GATE: trading = true jika tidak delisted
                        };
                    })
                );
            }

            case 'INDODAX': {
                const url = `https://indodax.com/api/summaries`;
                const response = await $.ajax({ url });
                const list = response?.tickers || {};
                const arr = Object.keys(list).map(k => ({ cex, tokenName: k.toUpperCase().replace('IDR', ''), chain: 'INDODAX', feeWDs: 0, depositEnable: true, withdrawEnable: true, trading: true }));
                return arr;
            }

            case 'KUCOIN': {
                // Public endpoint: currencies and chains
                const url = `https://proxykiri.awokawok.workers.dev/?https://api.kucoin.com/api/v3/currencies`;
                const res = await $.ajax({ url, method: 'GET' });
                const data = (res && res.data) || [];
                const arr = [];
                data.forEach(item => {
                    const coin = item?.currency || item?.coin || '';
                    const chains = item?.chains || item?.networkList || [];
                    (chains || []).forEach(net => {
                        const chainName = net?.chainName || net?.network || net?.name || '';
                        const fee = parseFloat(net?.withdrawalMinFee || net?.withdrawFee || 0);
                        const dep = (net?.isDepositEnabled === true) || (net?.canDeposit === true) || (String(net?.depositEnable).toLowerCase() === 'true');
                        const wd = (net?.isWithdrawEnabled === true) || (net?.canWithdraw === true) || (String(net?.withdrawEnable).toLowerCase() === 'true');
                        if (!coin || !chainName) return;
                        arr.push({
                            cex: 'KUCOIN',
                            tokenName: String(coin).toUpperCase(),
                            chain: String(chainName),
                            feeWDs: isFinite(fee) ? fee : 0,
                            depositEnable: !!dep,
                            withdrawEnable: !!wd,
                            contractAddress: net?.contractAddress || '',
                            trading: true // KUCOIN tidak menyediakan field trading di endpoint currencies
                        });
                    });
                });
                return arr;
            }

            case 'BITGET': {
                // Public endpoint: coins and chains
                const url = `https://api.bitget.com/api/v2/spot/public/coins`;
                const res = await $.ajax({ url, method: 'GET' });
                const data = (res && res.data) || [];
                const arr = [];
                data.forEach(item => {
                    const coin = item?.coin || item?.currency || '';
                    const chains = item?.chains || [];
                    (chains || []).forEach(net => {
                        const chain = net?.chain || net?.network || net?.name || '';
                        const fee = parseFloat(net?.withdrawFee || net?.withdrawMinFee || 0);
                        const dep = (String(net?.rechargeable).toLowerCase() === 'true') || (net?.rechargeable === true);
                        const wd = (String(net?.withdrawable).toLowerCase() === 'true') || (net?.withdrawable === true);
                        if (!coin || !chain) return;
                        arr.push({
                            cex: 'BITGET',
                            tokenName: String(coin).toUpperCase(),
                            chain: String(chain),
                            feeWDs: isFinite(fee) ? fee : 0,
                            depositEnable: !!dep,
                            withdrawEnable: !!wd,
                            contractAddress: net?.contractAddress || '',
                            trading: true // BITGET tidak menyediakan field trading di endpoint public coins
                        });
                    });
                });
                return arr;
            }

            case 'BYBIT': {
                if (!hasKeys) throw new Error(`${cex} API Key/Secret not configured in CONFIG_CEX.`);
                const key = ApiKey;
                const secret = ApiSecret;
                const recvWindow = 5000;
                const ts = Date.now().toString();
                const queryString = ""; // empty query → fetch all coins

                function calcSign(secret, timestamp, apiKey, recvWindow, query) {
                    const dataToSign = `${timestamp}${apiKey}${recvWindow}${query}`;
                    return CryptoJS.HmacSHA256(dataToSign, secret).toString(CryptoJS.enc.Hex);
                }
                const sign = calcSign(secret, ts, key, recvWindow, queryString);

                const url = `https://api.bybit.com/v5/asset/coin/query-info` + (queryString ? `?${queryString}` : '');
                const headers = {
                    'X-BAPI-API-KEY': key,
                    'X-BAPI-TIMESTAMP': ts,
                    'X-BAPI-RECV-WINDOW': String(recvWindow),
                    'X-BAPI-SIGN': sign,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                };

                const res = await $.ajax({ url, method: 'GET', headers });
                const rows = (res && res.result && (res.result.rows || res.result.list || res.result?.rows)) || [];
                const data = Array.isArray(rows) ? rows : [];
                const arr = [];
                const truthy = (v) => (v === true) || (v === 1) || (v === '1') || (String(v).toLowerCase() === 'true');
                data.forEach(item => {
                    const coin = item?.coin || '';
                    const chains = item?.chains || item?.chainsCommon || item?.networkList || [];
                    (chains || []).forEach(net => {
                        const chain = net?.chain || net?.chainType || net?.network || net?.name || '';
                        const fee = parseFloat(net?.withdrawFee || net?.withdrawMinFee || 0);
                        const dep = (net?.canDeposit === true) || (net?.depositable === true) || truthy(net?.rechargeable) || truthy(net?.chainDeposit);
                        const wd = (net?.canWithdraw === true) || (net?.withdrawable === true) || truthy(net?.chainWithdraw);
                        if (!coin || !chain) return;
                        arr.push({
                            cex: 'BYBIT',
                            tokenName: String(coin).toUpperCase(),
                            chain: String(chain),
                            feeWDs: isFinite(fee) ? fee : 0,
                            depositEnable: !!dep,
                            withdrawEnable: !!wd,
                            contractAddress: net?.contractAddress || '',
                            trading: true // BYBIT tidak menyediakan field trading di endpoint coin/query-info
                        });
                    });
                });
                return arr;
            }

            case 'LBANK': {
                // ✅ LBANK API v2/assetConfigs.do provides BOTH deposit AND withdraw status
                // This endpoint includes:
                // - canDeposit: boolean (deposit status)
                // - canDraw: boolean (withdrawal status)
                // - Fee information, minimum amounts, and network details
                // Reference: LBank API v2 documentation https://www.lbank.com/docs/index.html
                const url = `https://api.lbkex.com/v2/assetConfigs.do`;

                const res = await $.ajax({ url, method: 'GET' });
                const data = (res && res.data) || [];
                const arr = [];

                data.forEach(item => {
                    const coin = item?.assetCode || '';
                    const chain = item?.chain || String(item?.chainName || '');

                    // Parse canDraw (withdraw) - can be boolean or string "true"/"false"
                    const canWithdraw = (item?.canDraw === true) ||
                        (item?.canDraw === 'true') ||
                        (String(item?.canDraw).toLowerCase() === 'true');

                    // Parse canDeposit - can be boolean or string "true"/"false"
                    const canDeposit = (item?.canDeposit === true) ||
                        (item?.canDeposit === 'true') ||
                        (String(item?.canDeposit).toLowerCase() === 'true');

                    // Parse withdrawal fee - can be number or string
                    const fee = parseFloat(item?.drawFee || item?.fee || 0);

                    if (!coin) return; // Skip if no coin code

                    // ✅ FIXED: Now we have BOTH deposit and withdraw status from assetConfigs endpoint
                    const depositEnable = canDeposit;

                    // ===== CONTRACT ADDRESS ENRICHMENT =====
                    // LBank API doesn't provide contract address, so we need enrichment
                    // This will be enriched later in snapshot-new.js from:
                    // 1. Existing snapshot data (fallback)
                    // 2. Token database (DATAJSON per chain)
                    // 3. Web3 validation
                    // For now, mark as empty and let enrichment handle it
                    const contractAddress = ''; // Will be enriched in snapshot-new.js

                    arr.push({
                        cex: 'LBANK',
                        tokenName: String(coin).toUpperCase(),
                        chain: String(chain).toUpperCase(),
                        feeWDs: isFinite(fee) ? fee : 0,
                        depositEnable: depositEnable,
                        withdrawEnable: canWithdraw,
                        contractAddress: contractAddress,
                        trading: true, // Assume trading is enabled if coin is listed
                        // Add flag to indicate enrichment needed
                        needsEnrichment: true
                    });
                });

                console.log(`[LBANK] ✅ Fetched ${arr.length} coins from assetConfigs endpoint (includes deposit & withdraw status)`);
                return arr;
            }

            case 'HTX':
            case 'HUOBI': {
                // HTX (Huobi) Public API - Get all currencies and chains
                // Endpoint: GET /v2/reference/currencies
                // Ref: https://huobiapi.github.io/docs/spot/v1/en/
                const url = `https://api.huobi.pro/v2/reference/currencies`;
                const res = await $.ajax({ url, method: 'GET' });

                if (res?.code !== 200 || !res?.data) {
                    throw new Error(`HTX API error: ${res?.message || 'Unknown error'}`);
                }

                const data = res.data || [];
                const arr = [];

                // Mapping baseChain HTX ke chain aplikasi
                const chainMapping = {
                    'ETH': 'ERC20',
                    'TRX': 'TRC20',
                    'BSC': 'BEP20',
                    'HECO': 'HECO',
                    'MATIC': 'POLYGON',
                    'ARBITRUM': 'ARBITRUM',
                    'OPTIMISM': 'OPTIMISM',
                    'AVAXC': 'AVAX-C',
                    'SOL': 'SOL',
                    'BASE': 'BASE',
                    'FTM': 'FANTOM',
                    'ALGO': 'ALGO',
                    'ATOM': 'COSMOS',
                    'BTC': 'BTC',
                    'LTC': 'LTC',
                    'XRP': 'XRP',
                    'DOGE': 'DOGE',
                    'ADA': 'CARDANO',
                    'DOT': 'POLKADOT',
                    'NEAR': 'NEAR',
                    'APT': 'APTOS',
                    'SUI': 'SUI',
                    'TON': 'TON',
                    'KLAY': 'KLAYTN',
                    'ZK': 'ZKSYNC',
                    'LINEA': 'LINEA',
                    'MANTLE': 'MANTLE',
                    'SCROLL': 'SCROLL',
                    'BLAST': 'BLAST'
                };

                data.forEach(item => {
                    const coin = item?.currency || '';
                    const chains = item?.chains || [];

                    chains.forEach(net => {
                        // Parse chain name dari baseChain atau chain field
                        const baseChain = String(net?.baseChain || '').toUpperCase();
                        const chainRaw = String(net?.chain || net?.displayName || '').toUpperCase();

                        // Map ke nama chain standar aplikasi, atau gunakan baseChain
                        const chainName = chainMapping[baseChain] || baseChain || chainRaw;

                        // Parse deposit/withdraw status
                        // HTX uses "allowed" / "prohibited" instead of boolean
                        const depositStatus = String(net?.depositStatus || '').toLowerCase();
                        const withdrawStatus = String(net?.withdrawStatus || '').toLowerCase();
                        const depositEnable = (depositStatus === 'allowed');
                        const withdrawEnable = (withdrawStatus === 'allowed');

                        // Parse withdrawal fee
                        const fee = parseFloat(net?.transactFeeWithdraw || net?.minTransactFeeWithdraw || 0);

                        // Parse contract address
                        // HTX mungkin tidak menyertakan prefix 0x, perlu dinormalisasi
                        let contractAddr = String(net?.contractAddress || '').trim();
                        if (contractAddr && !contractAddr.startsWith('0x') && /^[a-fA-F0-9]{40}$/.test(contractAddr)) {
                            contractAddr = '0x' + contractAddr;
                        }

                        if (!coin || !chainName) return;

                        arr.push({
                            cex: 'HTX',
                            tokenName: String(coin).toUpperCase(),
                            chain: chainName,
                            feeWDs: isFinite(fee) ? fee : 0,
                            depositEnable: depositEnable,
                            withdrawEnable: withdrawEnable,
                            contractAddress: contractAddr,
                            trading: true, // HTX tidak menyediakan field trading di endpoint currencies
                            // Additional HTX-specific fields
                            minWithdrawAmt: parseFloat(net?.minWithdrawAmt || 0),
                            withdrawPrecision: parseInt(net?.withdrawPrecision || 8)
                        });
                    });
                });

                console.log(`[HTX] ✅ Fetched ${arr.length} coins from /v2/reference/currencies endpoint`);
                return arr;
            }

            default:
                throw new Error(`Unsupported CEX: ${cex}`);
        }
    }

    /** Merge centralized CEX wallet statuses into per-token dataCexs. */
    function applyWalletStatusToTokenList(tokenListName, walletStatusMap, options) {
        console.log('🔧 [applyWalletStatusToTokenList] FUNCTION CALLED for:', tokenListName);

        const opts = options || {};
        const allWalletStatus = walletStatusMap || getFromLocalStorage('CEX_WALLET_STATUS', {});

        console.log('🔧 [applyWalletStatusToTokenList] CEX count:', Object.keys(allWalletStatus).length);
        console.log('🔧 [applyWalletStatusToTokenList] Sample CEX data:', Object.keys(allWalletStatus)[0], allWalletStatus[Object.keys(allWalletStatus)[0]]);

        if (Object.keys(allWalletStatus).length === 0) {
            console.error('❌ [applyWalletStatusToTokenList] CEX_WALLET_STATUS is EMPTY!');
            return;
        }

        let tokens = getFromLocalStorage(tokenListName, []);
        if (!tokens || tokens.length === 0) {
            if (!opts.quiet) infoAdd(`ℹ️ No tokens found in '${tokenListName}' to update.`);
            return;
        }

        const updatedTokens = tokens.map(token => {
            const updatedDataCexs = { ...(token.dataCexs || {}) };
            (token.selectedCexs || Object.keys(CONFIG_CEX)).forEach(cexKey => {
                const walletForCex = allWalletStatus[cexKey.toUpperCase()];
                if (!walletForCex) return;

                const chainLabelForCEX = getChainData(token.chain)?.CEXCHAIN?.[cexKey]?.chainCEX?.toUpperCase() || '';

                function resolveWalletChain(walletInfo, desired) {
                    if (!walletInfo) return null;
                    const want = String(desired || '').toUpperCase();
                    // Prefer synonym-based resolution so we don't depend on config.js labels
                    try {
                        const chainKey = String(token.chain || '').toLowerCase();
                        if (typeof resolveWalletChainBySynonym === 'function') {
                            const hit = resolveWalletChainBySynonym(walletInfo, chainKey, want);
                            if (hit) return hit;
                        }
                    } catch (_) { }
                    // Fallback to exact desired label if provided
                    if (want && walletInfo[want]) return walletInfo[want];
                    return null;
                }

                const updateForSymbol = (symbol, isTokenIn) => {
                    if (!symbol) return;
                    const symbolUpper = symbol.toUpperCase();
                    const walletInfo = walletForCex[symbolUpper];

                    if (!walletInfo) {
                        console.warn(`[applyWallet] ${cexKey} ${symbolUpper}: walletInfo tidak ada (token tidak listing di CEX ini)`);
                        return;
                    }

                    let match = resolveWalletChain(walletInfo, chainLabelForCEX);

                    // 🔍 DEBUG: Log wallet resolution
                    console.log(`[applyWallet] ${cexKey} ${symbolUpper} (isToken=${isTokenIn}):`);
                    console.log(`[applyWallet]   chainLabel=${chainLabelForCEX}`);
                    console.log(`[applyWallet]   walletInfo keys:`, Object.keys(walletInfo));
                    console.log(`[applyWallet]   match:`, match);

                    // FIX: Jika tidak match dengan chainLabel, coba ambil chain manapun yang ada
                    if (!match) {
                        const availableChains = Object.keys(walletInfo);
                        if (availableChains.length > 0) {
                            // Coba cari chain yang match dengan token.chain
                            const tokenChain = String(token.chain || '').toUpperCase();
                            const chainVariations = [
                                tokenChain,
                                tokenChain.replace('ETHEREUM', 'ETH'),
                                tokenChain.replace('ETH', 'ETHEREUM'),
                                tokenChain.replace('POLYGON', 'MATIC'),
                                tokenChain.replace('MATIC', 'POLYGON'),
                                tokenChain.replace('ARBITRUM', 'ARB'),
                                tokenChain.replace('ARB', 'ARBITRUM'),
                                chainLabelForCEX
                            ];

                            for (const variation of chainVariations) {
                                if (walletInfo[variation]) {
                                    match = walletInfo[variation];
                                    console.log(`[applyWallet]   ✅ FALLBACK MATCH dengan "${variation}"`);
                                    break;
                                }
                            }

                            // Jika masih tidak ada, gunakan chain pertama yang ada
                            if (!match && availableChains.length > 0) {
                                match = walletInfo[availableChains[0]];
                                console.warn(`[applyWallet]   ⚠️ USING FIRST AVAILABLE CHAIN: ${availableChains[0]}`);
                            }
                        }
                    }

                    if (match) {
                        updatedDataCexs[cexKey] = updatedDataCexs[cexKey] || {};
                        const feeField = isTokenIn ? 'feeWDToken' : 'feeWDPair';
                        const depositField = isTokenIn ? 'depositToken' : 'depositPair';
                        const withdrawField = isTokenIn ? 'withdrawToken' : 'withdrawPair';

                        updatedDataCexs[cexKey][feeField] = String(match.feeWDs || '0');
                        updatedDataCexs[cexKey][depositField] = !!match.depositEnable;
                        updatedDataCexs[cexKey][withdrawField] = !!match.withdrawEnable;

                        // 🔍 DEBUG: Log saved values
                        console.log(`[applyWallet]   ✅ SAVED ${depositField}=${!!match.depositEnable}, ${withdrawField}=${!!match.withdrawEnable}, feeWD=${match.feeWDs}`);
                    } else {
                        console.error(`[applyWallet]   ❌ NO MATCH SETELAH SEMUA FALLBACK - Data tidak disimpan!`);
                    }
                };
                updateForSymbol(token.symbol_in, true);
                updateForSymbol(token.symbol_out, false);
            });
            return { ...token, dataCexs: updatedDataCexs };
        });

        saveToLocalStorage(tokenListName, updatedTokens);

        // 🔍 DEBUG: Log sample saved data
        if (updatedTokens.length > 0) {
            const sample = updatedTokens[0];
            console.log(`💾 [applyWallet] Sample saved token:`, sample.symbol_in, '⇄', sample.symbol_out);
            console.log(`💾 [applyWallet] Sample dataCexs:`, sample.dataCexs);

            // Count tokens with valid data
            let validCount = 0;
            let invalidCount = 0;
            updatedTokens.forEach(t => {
                const hasCexData = t.dataCexs && Object.keys(t.dataCexs).length > 0;
                if (hasCexData) validCount++;
                else invalidCount++;
            });
            console.log(`💾 [applyWallet] Tokens with CEX data: ${validCount}, without: ${invalidCount}`);
        }

        if (!opts.quiet) infoAdd(`💾 ${updatedTokens.length} tokens in '${tokenListName}' were updated.`);
    }

    /** Orchestrate fetching all CEX wallet statuses and apply to tokens. */
    async function checkAllCEXWallets() {
        console.log('');
        console.log('='.repeat(80));
        console.log('🚀 [checkAllCEXWallets] FUNCTION CALLED - Starting wallet update...');
        console.log('='.repeat(80));
        console.log('');
        infoSet('🚀 Memulai pengecekan DATA CEX...');

        // Hanya CEX yang dicentang pada filter (tanpa fallback ke semua)
        let selectedCexes = [];
        try {
            const m = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
            if (m.type === 'multi' && typeof getFilterMulti === 'function') {
                const fm = getFilterMulti();
                selectedCexes = (fm?.cex || []).map(x => String(x).toUpperCase());
            } else if (m.type === 'single' && typeof getFilterChain === 'function') {
                const fc = getFilterChain(m.chain || '');
                selectedCexes = (fc?.cex || []).map(x => String(x).toUpperCase());
            }
        } catch (_) { }
        // Filter hanya yang valid di CONFIG_CEX
        selectedCexes = selectedCexes.filter(cx => !!CONFIG_CEX?.[cx]);
        if (!selectedCexes.length) {
            infoSet('⚠ Pilih minimal 1 CEX pada filter.');
            try { UIkit.notification({ message: 'Pilih minimal 1 CEX pada filter (chip CEX).', status: 'warning' }); } catch (_) { }
            return;
        }

        // Show AppOverlay progress
        const overlayId = AppOverlay.showProgress({
            id: 'cex-wallet-check',
            title: 'Updating CEX Wallets',
            message: 'Fetching wallet data from exchanges...',
            progressMax: selectedCexes.length
        });

        const aggregated = [];
        const failed = [];

        for (let i = 0; i < selectedCexes.length; i++) {
            const cex = String(selectedCexes[i]);
            try {
                const cur = i + 1;
                const total = selectedCexes.length;
                infoSet(`🔄 Mengambil data wallet: ${cex} (${cur}/${total})...`);

                // Update AppOverlay progress
                AppOverlay.updateProgress(overlayId, cur - 1, total, `Fetching ${cex}...`);

                const res = await fetchWalletStatus(cex);
                aggregated.push(res);
                infoAdd(`✅ ${cex} selesai.`);
            } catch (err) {
                console.error(`❌ ${cex} gagal:`, err);
                failed.push({ error: true, cex, message: err.message });
                infoAdd(`❌ ${cex} GAGAL (${err.message})`);
            }

            // Update progress after completion
            const done = i + 1;
            const total = selectedCexes.length;
            AppOverlay.updateProgress(overlayId, done, total, `Completed ${cex}`);
        }

        // Build aggregated status map from successful CEX calls
        const walletStatusByCex = {};
        let itemCount = 0;
        aggregated.flat().forEach(item => {
            if (!item) return;
            const { cex, tokenName, chain, ...rest } = item;
            // Guard against malformed payloads
            if (!cex || !tokenName || !chain) {
                /* debug logs removed */
                return;
            }
            const ucCex = String(cex).toUpperCase();
            const ucToken = String(tokenName).toUpperCase();
            const ucChain = String(chain).toUpperCase();

            if (!walletStatusByCex[ucCex]) walletStatusByCex[ucCex] = {};
            if (!walletStatusByCex[ucCex][ucToken]) walletStatusByCex[ucCex][ucToken] = {};
            walletStatusByCex[ucCex][ucToken][ucChain] = rest;
            itemCount++;
        });

        console.log(`📊 [checkAllCEXWallets] Build wallet status map: ${itemCount} items dari ${aggregated.flat().length} total`);
        console.log(`📊 [checkAllCEXWallets] CEX count: ${Object.keys(walletStatusByCex).length}`);
        if (Object.keys(walletStatusByCex).length > 0) {
            const firstCex = Object.keys(walletStatusByCex)[0];
            const tokenCount = Object.keys(walletStatusByCex[firstCex] || {}).length;
            console.log(`📊 [checkAllCEXWallets] Sample ${firstCex}: ${tokenCount} tokens`);
            if (tokenCount > 0) {
                const firstToken = Object.keys(walletStatusByCex[firstCex])[0];
                const chains = Object.keys(walletStatusByCex[firstCex][firstToken] || {});
                console.log(`📊 [checkAllCEXWallets]   Sample token ${firstToken}: chains = [${chains.join(', ')}]`);
                if (chains.length > 0) {
                    const sampleData = walletStatusByCex[firstCex][firstToken][chains[0]];
                    console.log(`📊 [checkAllCEXWallets]   Sample data:`, sampleData);
                }
            }
        }

        // Commit results even if some CEX failed (partial success behavior)
        try {
            const okCount = aggregated.length;
            const failCount = failed.length;
            // Always persist attempt meta
            if (typeof saveToLocalStorageAsync === 'function') {
                await saveToLocalStorageAsync('CEX_WALLET_STATUS_META', { time: new Date().toISOString(), ok: okCount, fail: failCount });
            } else {
                saveToLocalStorage('CEX_WALLET_STATUS_META', { time: new Date().toISOString(), ok: okCount, fail: failCount });
            }
            // Persist the status map (can be empty on total failure)
            if (typeof saveToLocalStorageAsync === 'function') {
                await saveToLocalStorageAsync('CEX_WALLET_STATUS', walletStatusByCex);
            } else {
                saveToLocalStorage('CEX_WALLET_STATUS', walletStatusByCex);
            }

            console.log('💾 [checkAllCEXWallets] Data saved to CEX_WALLET_STATUS');
            console.log('💾 [checkAllCEXWallets] Structure:', {
                cexCount: Object.keys(walletStatusByCex).length,
                totalItems: itemCount,
                sample: Object.keys(walletStatusByCex)[0]
            });

            if (okCount + failCount > 0) infoAdd(`✅ Data wallet tersimpan. OK: ${okCount}, Gagal: ${failCount}.`);
        } catch (e) { /* debug logs removed */ }
        // Notify failures (non-blocking) with timestamp and per‑CEX details
        if (failed.length > 0) {
            const now = new Date().toLocaleTimeString('id-ID', { hour12: false });
            const linesHtml = failed.map(f => {
                const cx = String(f.cex || '').toUpperCase();
                const msg = (f && f.message) ? String(f.message) : '';
                return `• ${cx}${msg ? ` — ${msg}` : ''}`;
            }).join('<br>');
            const linesText = failed.map(f => {
                const cx = String(f.cex || '').toUpperCase();
                const msg = (f && f.message) ? String(f.message) : '';
                return `• ${cx}${msg ? ` — ${msg}` : ''}`;
            }).join('\n');
            try {
                UIkit.notification({
                    message: `⚠️ ${now} GAGAL UPDATE EXCHANGER<br>${linesHtml}`,
                    status: 'warning', timeout: 7000
                });
            } catch (_) {
                if (typeof toast !== 'undefined' && toast.warning) {
                    toast.warning(`⚠️ ${now} GAGAL UPDATE EXCHANGER\n${linesText}`);
                }
            }
        }
        // If absolutely nothing succeeded, continue after logging so meta/save still persisted above
        if (aggregated.length === 0) {
            try {
                const failedList = failed.map(f => String(f.cex || '').toUpperCase());
                setLastAction(
                    "UPDATE WALLET EXCHANGER",
                    'error',
                    { error: 'All CEX updates failed', fail: failed.length, failedCex: failedList }
                );
            } catch (_) { }
            AppOverlay.hide(overlayId);
            return;
        }

        try {
            const activeKey = (typeof getActiveTokenKey === 'function') ? getActiveTokenKey() : 'TOKEN_MULTICHAIN';
            const tokenStores = new Set([activeKey, 'TOKEN_MULTICHAIN']);
            try {
                Object.keys(CONFIG_CHAINS || {}).forEach(chainKey => {
                    tokenStores.add(`TOKEN_${String(chainKey).toUpperCase()}`);
                });
            } catch (err) {
                console.error('❌ [checkAllCEXWallets] Error building tokenStores:', err);
            }

            console.log('📦 [checkAllCEXWallets] Applying wallet status to token stores:', Array.from(tokenStores));
            console.log('📦 [checkAllCEXWallets] walletStatusByCex keys:', Object.keys(walletStatusByCex));

            tokenStores.forEach(storeKey => {
                const quiet = storeKey !== activeKey;
                console.log(`📝 [checkAllCEXWallets] Calling applyWalletStatusToTokenList for ${storeKey}...`);
                try {
                    applyWalletStatusToTokenList(storeKey, walletStatusByCex, { quiet });
                } catch (err) {
                    console.error(`❌ [checkAllCEXWallets] Error applying wallet status to ${storeKey}:`, err);
                }
            });
        } catch (err) {
            console.error('❌ [checkAllCEXWallets] CRITICAL ERROR in apply wallet section:', err);
        }

        try {
            const failedList = failed.map(f => String(f.cex || '').toUpperCase());
            setLastAction(
                "UPDATE WALLET EXCHANGER",
                (failed.length > 0 ? 'warning' : 'success'),
                { ok: aggregated.length, fail: failed.length, failedCex: failedList }
            );
        } catch (_) { }

        try {
            UIkit.notification({ message: '✅ BERHASIL UPDATE WALLET EXCHANGER', status: 'success' });
        } catch (_) {
            if (typeof toast !== 'undefined' && toast.success) {
                toast.success('✅ SEBAGIAN BERHASIL UPDATE WALLET EXCHANGER,SILAKAN CEK STATUS DEPOSIT & WITHDRAW, EXCHANGER YANG GAGAL UPDATE');
            }
        }

        // Hide AppOverlay
        AppOverlay.hide(overlayId);

        // Emit event untuk refresh UI (tanpa reload)
        try {
            if (typeof AppEvents !== 'undefined') {
                AppEvents.emit(AppEvents.EVENTS.WALLET_UPDATE, {
                    aggregated,
                    failed,
                    selectedCexes
                });
            }
        } catch (_) { }

        // Refresh UI tanpa reload
        try {
            const m = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
            if (m.type === 'single') {
                if (typeof loadAndDisplaySingleChainTokens === 'function') loadAndDisplaySingleChainTokens();
            } else {
                if (typeof refreshTokensTable === 'function') refreshTokensTable();
            }
        } catch (_) { if (typeof refreshTokensTable === 'function') refreshTokensTable(); }

        // Refresh wallet exchanger UI if visible
        try {
            if ($('#update-wallet-section').is(':visible') && root.App?.WalletExchanger?.renderCexCards) {
                setTimeout(() => {
                    root.App.WalletExchanger.renderCexCards();

                    // Show update result notification
                    const failedList = failed.map(f => String(f.cex || '').toUpperCase());
                    const hasSuccess = aggregated.length > 0;
                    if (root.App?.WalletExchanger?.showUpdateResult) {
                        root.App.WalletExchanger.showUpdateResult(hasSuccess, failedList);
                    }

                    infoSet('✅ Tampilan diperbarui. Anda dapat melihat hasil update wallet exchanger di bawah ini.');
                }, 300);
            }
        } catch (_) { }
    }

    /**
     * Fetch ALL ticker prices from CEX in a single request (EFFICIENT!)
     * Returns: { symbol: price, ... } mapping
     *
     * This is MUCH faster than fetching orderbook per-coin:
     * - 1 request vs hundreds of requests
     * - No rate limit issues
     * - Better UX (fast loading)
     *
     * Supported CEX:
     * - BYBIT: /v5/market/tickers?category=spot
     * - GATE: /api/v4/spot/tickers
     * - BINANCE: /api/v3/ticker/price
     * - MEXC: /api/v3/ticker/price
     * - KUCOIN: /api/v1/market/allTickers
     * - BITGET: /api/v2/spot/market/tickers
     * - INDODAX: /api/ticker_all
     *
     * @param {string} cex - CEX name (e.g., 'BYBIT', 'GATE', 'BINANCE')
     * @returns {Promise<Object>} - { 'BTC': 45000.12, 'ETH': 3000.45, ... }
     */
    async function fetchAllCEXPrices(cex) {
        const cexUpper = String(cex || '').toUpperCase();
        console.log(`[fetchAllCEXPrices] Fetching ALL prices from ${cexUpper}...`);

        // ✅ FIXED: Load timeout from user settings (not hardcoded)
        let timeoutMs = 10000; // Default fallback
        try {
            const savedSettings = getFromLocalStorage('SETTING_SCANNER', {});
            const configDefaults = (window.CONFIG_UI?.SETTINGS?.defaults) || {};
            timeoutMs = parseInt(savedSettings.TimeoutCount || configDefaults.timeoutCount || 10000);
        } catch (e) {
            console.warn('[fetchAllCEXPrices] Failed to load timeout setting, using default:', e.message);
        }

        try {
            let url, parseResponse;

            switch (cexUpper) {
                case 'BYBIT':
                    // Bybit V5 API - Get all spot tickers
                    url = 'https://api.bybit.com/v5/market/tickers?category=spot';
                    parseResponse = (data) => {
                        const tickers = data?.result?.list || [];
                        const priceMap = {};
                        tickers.forEach(ticker => {
                            const symbol = String(ticker.symbol || '').toUpperCase();
                            // Only USDT pairs
                            if (symbol.endsWith('USDT')) {
                                const base = symbol.replace('USDT', '');
                                const price = parseFloat(ticker.lastPrice || 0);
                                if (price > 0) {
                                    priceMap[base] = price;
                                }
                            }
                        });
                        return priceMap;
                    };
                    break;

                case 'GATE':
                case 'GATEIO':
                    // Gate.io V4 API - Get all spot tickers
                    url = 'https://api.gateio.ws/api/v4/spot/tickers';
                    parseResponse = (data) => {
                        const tickers = Array.isArray(data) ? data : [];
                        const priceMap = {};
                        tickers.forEach(ticker => {
                            const pair = String(ticker.currency_pair || '').toUpperCase();
                            // Format: BTC_USDT
                            if (pair.endsWith('_USDT')) {
                                const base = pair.replace('_USDT', '');
                                const price = parseFloat(ticker.last || 0);
                                if (price > 0) {
                                    priceMap[base] = price;
                                }
                            }
                        });
                        return priceMap;
                    };
                    break;

                case 'BINANCE':
                    // Binance API - Get all ticker prices
                    url = 'https://api.binance.com/api/v3/ticker/price';
                    parseResponse = (data) => {
                        const tickers = Array.isArray(data) ? data : [];
                        const priceMap = {};
                        tickers.forEach(ticker => {
                            const symbol = String(ticker.symbol || '').toUpperCase();
                            // Only USDT pairs
                            if (symbol.endsWith('USDT')) {
                                const base = symbol.replace('USDT', '');
                                const price = parseFloat(ticker.price || 0);
                                if (price > 0) {
                                    priceMap[base] = price;
                                }
                            }
                        });
                        return priceMap;
                    };
                    break;

                case 'MEXC':
                    // MEXC API - Get all ticker prices (Binance-compatible)
                    url = 'https://api.mexc.com/api/v3/ticker/price';
                    parseResponse = (data) => {
                        const tickers = Array.isArray(data) ? data : [];
                        const priceMap = {};
                        tickers.forEach(ticker => {
                            const symbol = String(ticker.symbol || '').toUpperCase();
                            // Only USDT pairs
                            if (symbol.endsWith('USDT')) {
                                const base = symbol.replace('USDT', '');
                                const price = parseFloat(ticker.price || 0);
                                if (price > 0) {
                                    priceMap[base] = price;
                                }
                            }
                        });
                        return priceMap;
                    };
                    break;

                case 'KUCOIN':
                    // KuCoin API - Get all tickers
                    url = 'https://api.kucoin.com/api/v1/market/allTickers';
                    parseResponse = (data) => {
                        const tickers = data?.data?.ticker || [];
                        const priceMap = {};
                        tickers.forEach(ticker => {
                            const symbol = String(ticker.symbol || '').toUpperCase();
                            // Format: BTC-USDT
                            if (symbol.endsWith('-USDT')) {
                                const base = symbol.replace('-USDT', '');
                                const price = parseFloat(ticker.last || 0);
                                if (price > 0) {
                                    priceMap[base] = price;
                                }
                            }
                        });
                        return priceMap;
                    };
                    break;

                case 'BITGET':
                    // Bitget V2 API - Get all spot tickers
                    url = 'https://api.bitget.com/api/v2/spot/market/tickers';
                    parseResponse = (data) => {
                        const tickers = data?.data || [];
                        const priceMap = {};
                        tickers.forEach(ticker => {
                            const symbol = String(ticker.symbol || '').toUpperCase();
                            // Only USDT pairs
                            if (symbol.endsWith('USDT')) {
                                const base = symbol.replace('USDT', '');
                                const price = parseFloat(ticker.lastPr || 0);
                                if (price > 0) {
                                    priceMap[base] = price;
                                }
                            }
                        });
                        return priceMap;
                    };
                    break;

                case 'INDODAX':
                    // Indodax API - Get all tickers (IDR pairs)
                    url = 'https://indodax.com/api/ticker_all';
                    parseResponse = (data) => {
                        const tickers = data?.tickers || {};
                        const priceMap = {};
                        Object.keys(tickers).forEach(key => {
                            const ticker = tickers[key];
                            const pair = String(key || '').toUpperCase();
                            // Format: btcidr
                            if (pair.endsWith('IDR')) {
                                const base = pair.replace('IDR', '');
                                const price = parseFloat(ticker?.last || 0);
                                if (price > 0) {
                                    // Convert IDR to USD (approximate: 1 USD = 15000 IDR)
                                    priceMap[base] = price / 15000;
                                }
                            }
                        });
                        return priceMap;
                    };
                    break;

                case 'LBANK':
                    // LBank API - Get all tickers
                    url = 'https://api.lbkex.com/v2/ticker/24hr.do';
                    parseResponse = (data) => {
                        const tickers = data?.data || [];
                        const priceMap = {};
                        tickers.forEach(ticker => {
                            const symbol = String(ticker.symbol || '').toUpperCase();
                            // Format: btc_usdt
                            if (symbol.endsWith('_USDT')) {
                                const base = symbol.replace('_USDT', '');
                                const price = parseFloat(ticker.ticker?.latest || 0);
                                if (price > 0) {
                                    priceMap[base] = price;
                                }
                            }
                        });
                        return priceMap;
                    };
                    break;

                case 'HTX':
                case 'HUOBI':
                    // HTX (Huobi) API - Get all spot tickers
                    // Ref: https://huobiapi.github.io/docs/spot/v1/en/
                    url = 'https://api.huobi.pro/market/tickers';
                    parseResponse = (data) => {
                        const tickers = data?.data || [];
                        const priceMap = {};
                        tickers.forEach(ticker => {
                            const symbol = String(ticker.symbol || '').toUpperCase();
                            // Format: btcusdt (lowercase in response)
                            if (symbol.endsWith('USDT')) {
                                const base = symbol.replace('USDT', '');
                                // HTX uses 'close' for last price
                                const price = parseFloat(ticker.close || ticker.last || 0);
                                if (price > 0) {
                                    priceMap[base] = price;
                                }
                            }
                        });
                        return priceMap;
                    };
                    break;

                default:
                    throw new Error(`CEX ${cexUpper} not supported for bulk price fetch`);
            }

            // Fetch data with jQuery Ajax (✅ using user timeout setting)
            const data = await $.ajax({ url, method: 'GET', timeout: timeoutMs });

            // Parse response
            const priceMap = parseResponse(data);
            const count = Object.keys(priceMap).length;

            console.log(`[fetchAllCEXPrices] ✅ ${cexUpper}: Fetched ${count} prices`);

            return priceMap;

        } catch (error) {
            console.error(`[fetchAllCEXPrices] ❌ ${cexUpper} failed:`, error.message || error);
            throw error;
        }
    }

    // Register to App namespace
    if (typeof App.register === 'function') {
        App.register('Services', {
            CEX: {
                processOrderBook,
                processIndodaxOrderBook,
                exchangeConfig,
                getPriceCEX,
                fetchWalletStatus,
                applyWalletStatusToTokenList,
                checkAllCEXWallets,
                fetchAllCEXPrices
            }
        });
    }
})(typeof window !== 'undefined' ? window : this);

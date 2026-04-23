// ==UserScript==
// @name         RATE USDT v.7.0
// @namespace    http://tampermonkey.net/
// @version      57.59
// @description  Hitung valuasi swap dalam USDT & IDR di Matcha, KyberSwap, OKX, DeFiLlama, DZap, dan OKU Trade menggunakan harga Binance/Gate/MEXC/Indodax
// @author       ochiem
// @match        https://matcha.xyz/*
// @match        https://kyberswap.com/*
// @match        https://web3.okx.com/*
// @match        https://swap.defillama.com/*
// @match        https://app.dzap.io/*
// @match        https://oku.trade/*
// @match        https://jumper.xyz/*
// @grant        GM_xmlhttpRequest
// @connect      indodax.com
// @connect      api.binance.com
// @connect      api.gateio.ws
// @connect      api.mexc.com
// ==/UserScript==

(function () {
    'use strict';

    const EXCLUDED_TOKENS = ['USDT', 'USDC', 'WETH', 'ETH', 'WBTC', 'BTC', 'BNB', 'WBNB'];
    const TOKEN_MAPPING = { WETH: 'ETH', WBTC: 'BTC', WBNB: 'BNB' };
    const PRICE_CACHE = new Map();
    const PRICE_CACHE_TTL = 60 * 1000; // 1 minute cache
    const DZAP_ROUTE_CONTAINER_SELECTOR = '.max-h-pair-routes';

    function gmFetch(url, headers = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: { Accept: 'application/json', ...headers },
                onload: (r) => {
                    try {
                        resolve({ ok: r.status >= 200 && r.status < 300, json: () => Promise.resolve(JSON.parse(r.responseText)) });
                    } catch (err) { reject(err); }
                },
                onerror: (e) => reject(new Error('GM fetch error: ' + url)),
                ontimeout: () => reject(new Error('GM fetch timeout: ' + url))
            });
        });
    }

    /* ---------------------------------- CEX HELPERS --------------------------------- */
    async function fetchCexPrices(symbol, exchange) {
        try {
            let res, json, bid, ask;
            let finalSymbol = symbol;

            if (exchange === 'binance' || exchange === 'mexc') {
                finalSymbol = symbol.replace('_', '');
            }

            if (exchange === 'binance') {
                res = await gmFetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${finalSymbol}`);
                const d = await res.json();
                bid = parseFloat(d.bidPrice);
                ask = parseFloat(d.askPrice);
            } else if (exchange === 'gate') {
                res = await gmFetch(`https://api.gateio.ws/api/v4/spot/order_book?currency_pair=${finalSymbol}&limit=1`);
                json = await res.json();
                bid = parseFloat(json.bids?.[0]?.[0]);
                ask = parseFloat(json.asks?.[0]?.[0]);
            } else if (exchange === 'mexc') {
                res = await gmFetch(`https://api.mexc.com/api/v3/depth?symbol=${finalSymbol}&limit=1`);
                json = await res.json();
                bid = parseFloat(json.bids?.[0]?.[0]);
                ask = parseFloat(json.asks?.[0]?.[0]);
            }

            if (isNaN(bid) || isNaN(ask)) throw new Error('bid/ask tidak valid');
            console.log(`[CEX PRICE] ${exchange.toUpperCase()} ${finalSymbol} → bid ${bid}, ask ${ask}`);
            return { bid, ask };
        } catch (e) {
            console.error(`❌ Gagal fetch ${exchange.toUpperCase()} ${symbol}`, e);
            return null;
        }
    }

    async function fetchCexPriceWithFallback(token) {
        const bin = await fetchCexPrices(token + 'USDT', 'binance');
        if (bin?.bid > 0) return bin;
        const gate = await fetchCexPrices(token + '_USDT', 'gate');
        if (gate?.bid > 0) return gate;
        const mexc = await fetchCexPrices(token + '_USDT', 'mexc');
        if (mexc?.bid > 0) return mexc;
        const indodax = await fetchIndodaxPrice(token);
        if (indodax?.bid > 0) return indodax;
        return null;
    }

    async function fetchIndodaxPrice(token) {
        try {
            const pair = token.toLowerCase() + '_idr';
            const res = await gmFetch(`https://indodax.com/api/${pair}/ticker`);
            const data = await res.json();
            const bid = parseFloat(data.ticker?.buy);
            const ask = parseFloat(data.ticker?.sell);
            if (isNaN(bid) || isNaN(ask)) throw new Error('bid/ask tidak valid');

            const usdtToIdr = await fetchUSDTtoIDR();
            if (!usdtToIdr) throw new Error('Gagal ambil rate USDT/IDR');

            const bidUSDT = bid / usdtToIdr;
            const askUSDT = ask / usdtToIdr;
            console.log(`[CEX PRICE] INDODAX ${pair} → bid ${bidUSDT.toFixed(6)} USDT, ask ${askUSDT.toFixed(6)} USDT`);
            return { bid: bidUSDT, ask: askUSDT };
        } catch (e) {
            console.error(`❌ Gagal fetch INDODAX ${token}`, e);
            return null;
        }
    }

    async function fetchUSDTtoIDR() {
        try {
            const res = await gmFetch('https://indodax.com/api/usdt_idr/ticker');
            const data = await res.json();
            return parseFloat(data.ticker.last);
        } catch (_) {
            console.warn('⚠️ Gagal ambil harga USDT/IDR dari Indodax');
            return null;
        }
    }

    /* ---------------------------------- RATE ENGINE --------------------------------- */
    async function calculateRateUSDT(src, aName, aVal, bName, bVal) {
        const aToken = mapTokenSymbol(aName);
        const bToken = mapTokenSymbol(bName);
        const refToken = EXCLUDED_TOKENS.includes(aToken) ? aToken : (EXCLUDED_TOKENS.includes(bToken) ? bToken : null);

        const usdtToIdr = await fetchUSDTtoIDR();
        if (!usdtToIdr) return alert('❌ Tidak bisa mendapatkan harga USDT ke IDR');

        if (refToken) {
            const refValue = aToken === refToken ? aVal : bVal;
            const otherValue = aToken === refToken ? bVal : aVal;
            const otherToken = aToken === refToken ? bToken : aToken;

            let priceRef = 1;
            if (!['USDT', 'USDC'].includes(refToken)) {
                const hargaRef = await fetchCexPriceWithFallback(refToken);
                priceRef = hargaRef?.bid || hargaRef?.ask;
                if (!priceRef) return alert(`❌ Harga ${refToken} tidak ditemukan di Binance/Gate/MEXC`);
            }

            let hargaModal = priceRef;
            if (aToken !== refToken) {
                const hargaA = await fetchCexPriceWithFallback(aToken);
                hargaModal = hargaA?.bid || hargaA?.ask;
                if (!hargaModal) return alert(`❌ Harga ${aToken} tidak ditemukan di Binance/Gate/MEXC`);
            }

            const resultUSDT = refValue * priceRef;
            const pricePerOther = resultUSDT / otherValue;
            const idrAmount = pricePerOther * usdtToIdr;

            alert([
                `📌 PRICE SWAP ${src.toUpperCase()}`,
                `---------------------------`,
                `KONVERSI ${aToken} → ${bToken}`,
                `📦 MODAL: ${aVal.toFixed(6)} ${aName} ≈ ${(aVal * hargaModal).toFixed(6)} USDT`,
                `💰 ${otherToken} di ${src.toUpperCase()} : ${pricePerOther.toFixed(6)} USDT`,
                `💱 RATE IDR ${otherToken} : ${idrAmount.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} IDR`,
                `---------------------------`,
                `🔁 ${otherToken} ≈ ${(1 / (otherValue / refValue)).toFixed(8)} ${refToken}`
            ].join('\n'));
            return;
        }

        const rateAB = bVal / aVal;
        const rateBA = aVal / bVal;

        const [cexA, cexB] = await Promise.all([
            aName === 'USDT' ? { bid: 1, ask: 1 } : fetchCexPriceWithFallback(aName),
            bName === 'USDT' ? { bid: 1, ask: 1 } : fetchCexPriceWithFallback(bName)
        ]);

        const hargaJualA = cexA?.bid || 0;
        const hargaBeliA = cexA?.ask || Infinity;
        const hargaJualB = cexB?.bid || 0;
        const hargaBeliB = cexB?.ask || Infinity;

        const hasilSellUSDT = rateAB * hargaJualB;
        const hasilBuyUSDT = rateBA * hargaBeliA;

        const idrSell = hasilSellUSDT * usdtToIdr;
        const idrBuy = hasilBuyUSDT * usdtToIdr;

        alert([
            `🧾 ESTIMASI SWAP ${src.toUpperCase()}`,
            `---------------------------`,
            `🔄 SELL: ${aName}`,
            `📦 ${aVal.toFixed(6)} ${aName} ≈ ${(aVal * hargaJualA).toFixed(6)} USDT`,
            `📤 DEX → ${hasilSellUSDT.toFixed(9)} USDT`,
            `💱 IDR: ${idrSell.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            ``,
            `🔄 BUY: ${bName}`,
            `📤 DEX → ${hasilBuyUSDT.toFixed(9)} USDT`,
            `💱 IDR: ${idrBuy.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `---------------------------`
        ].join('\n'));
    }

    /* ---------------------------------- PARSING HELPERS --------------------------------- */
    function parseNumeric(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
        if (typeof value === 'string') {
            let sanitized = value.trim();
            if (!sanitized) return NaN;
            sanitized = sanitized.replace(/[^\d.,-]/g, '');
            const hasDot = sanitized.includes('.');
            const hasComma = sanitized.includes(',');
            if (hasComma && hasDot) {
                if (sanitized.lastIndexOf(',') > sanitized.lastIndexOf('.')) {
                    sanitized = sanitized.replace(/\./g, '').replace(',', '.');
                } else {
                    sanitized = sanitized.replace(/,/g, '');
                }
            } else if (hasComma && !hasDot) {
                sanitized = sanitized.replace(/,/g, '.');
            } else {
                sanitized = sanitized.replace(/,/g, '');
            }
            const parsed = parseFloat(sanitized);
            return Number.isFinite(parsed) ? parsed : NaN;
        }
        return NaN;
    }

    function normalizeTokenSymbol(raw) {
        if (typeof raw !== 'string') return null;
        const trimmed = raw.trim();
        if (!trimmed) return null;
        const matches = trimmed.match(/[A-Z0-9]{2,12}/g);
        if (matches?.length) {
            const filtered = matches.filter(m => isNaN(Number(m)));
            return (filtered[0] || matches[0])?.toUpperCase() || null;
        }
        if (/^[A-Za-z]{2,12}$/.test(trimmed)) return trimmed.toUpperCase();
        return null;
    }

    function mapTokenSymbol(token) {
        if (!token) return null;
        const normalized = normalizeTokenSymbol(token) || (typeof token === 'string' ? token.toUpperCase() : token);
        return TOKEN_MAPPING[normalized] || normalized;
    }

    function getCurrentDZapState() {
        return tryExtractFromNextData() || tryExtractFromDOM();
    }

    async function getTokenUsdtPrice(rawSymbol) {
        const symbol = mapTokenSymbol(rawSymbol);
        if (!symbol) return null;
        if (symbol === 'USDT' || symbol === 'USDC') return 1;

        const cached = PRICE_CACHE.get(symbol);
        const now = Date.now();
        if (cached && now - cached.ts < PRICE_CACHE_TTL) return cached.value;

        const priceInfo = await fetchCexPriceWithFallback(symbol);
        const price = priceInfo?.bid || priceInfo?.ask || null;
        if (price) PRICE_CACHE.set(symbol, { value: price, ts: now });
        return price;
    }

    function getByPath(obj, path) {
        return path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    }

    function extractFromPaths(node, paths, normalizer) {
        for (const path of paths) {
            const raw = getByPath(node, path);
            const parsed = normalizer(raw);
            if (parsed || parsed === 0) return parsed;
        }
        return null;
    }

    const TOKEN_PATHS_IN = [
        ['fromToken', 'symbol'],
        ['fromTokenSymbol'],
        ['fromAsset', 'symbol'],
        ['fromAsset', 'token', 'symbol'],
        ['sourceToken', 'symbol'],
        ['sourceAsset', 'token', 'symbol'],
        ['sellToken', 'symbol'],
        ['payAsset', 'symbol'],
        ['from', 'symbol'],
        ['from', 'token', 'symbol']
    ];

    const TOKEN_PATHS_OUT = [
        ['toToken', 'symbol'],
        ['toTokenSymbol'],
        ['destinationToken', 'symbol'],
        ['destToken', 'symbol'],
        ['buyToken', 'symbol'],
        ['destinationAsset', 'token', 'symbol'],
        ['assetOut', 'token', 'symbol'],
        ['to', 'symbol'],
        ['to', 'token', 'symbol'],
        ['youReceiveAsset', 'symbol']
    ];

    const AMOUNT_PATHS_IN = [
        ['fromAmount'],
        ['fromTokenAmount'],
        ['sourceAmount'],
        ['sourceAsset', 'amount'],
        ['sellAmount'],
        ['payAmount'],
        ['from', 'amount'],
        ['payAsset', 'amount']
    ];

    const AMOUNT_PATHS_OUT = [
        ['toAmount'],
        ['toTokenAmount'],
        ['destinationAsset', 'amount'],
        ['assetOut', 'amount'],
        ['buyAmount'],
        ['receiveAmount'],
        ['to', 'amount'],
        ['youReceiveAsset', 'amount']
    ];

    function extractSwapObject(node) {
        const fromToken = extractFromPaths(node, TOKEN_PATHS_IN, normalizeTokenSymbol);
        const toToken = extractFromPaths(node, TOKEN_PATHS_OUT, normalizeTokenSymbol);
        const fromAmount = extractFromPaths(node, AMOUNT_PATHS_IN, parseNumeric);
        const toAmount = extractFromPaths(node, AMOUNT_PATHS_OUT, parseNumeric);

        if (fromToken && toToken && Number.isFinite(fromAmount) && Number.isFinite(toAmount) && fromAmount > 0 && toAmount > 0) {
            return { fromToken, toToken, fromAmount, toAmount };
        }

        if (node?.sourceAsset && node?.destinationAsset) {
            const altFromToken = extractFromPaths(node.sourceAsset, [['symbol'], ['token', 'symbol']], normalizeTokenSymbol);
            const altToToken = extractFromPaths(node.destinationAsset, [['symbol'], ['token', 'symbol']], normalizeTokenSymbol);
            const altFromAmount = extractFromPaths(node.sourceAsset, [['amount'], ['value']], parseNumeric);
            const altToAmount = extractFromPaths(node.destinationAsset, [['amount'], ['value']], parseNumeric);

            if (altFromToken && altToToken && Number.isFinite(altFromAmount) && Number.isFinite(altToAmount) && altFromAmount > 0 && altToAmount > 0) {
                return { fromToken: altFromToken, toToken: altToToken, fromAmount: altFromAmount, toAmount: altToAmount };
            }
        }

        return null;
    }

    function deepSearchSwap(node, visited = new WeakSet()) {
        if (!node || typeof node !== 'object' || visited.has(node)) return null;
        visited.add(node);

        const direct = extractSwapObject(node);
        if (direct) return direct;

        if (Array.isArray(node)) {
            for (const item of node) {
                const result = deepSearchSwap(item, visited);
                if (result) return result;
            }
        } else {
            for (const key of Object.keys(node)) {
                const result = deepSearchSwap(node[key], visited);
                if (result) return result;
            }
        }
        return null;
    }

    function tryExtractFromNextData() {
        const candidates = [];
        const inline = document.getElementById('__NEXT_DATA__');
        if (inline?.textContent) {
            try {
                candidates.push(JSON.parse(inline.textContent));
            } catch (err) {
                console.warn('⚠️ __NEXT_DATA__ parse error:', err);
            }
        }
        if (window.__NEXT_DATA__) candidates.push(window.__NEXT_DATA__);

        for (const src of candidates) {
            const result = deepSearchSwap(src);
            if (result) return result;
        }
        return null;
    }

    function findTokenAroundInput(inputEl) {
        if (!inputEl) return null;

        const scanNode = node => {
            if (!node) return null;

            const attrSymbol = node.getAttribute?.('data-symbol');
            const normalizedAttr = normalizeTokenSymbol(attrSymbol);
            if (normalizedAttr) return normalizedAttr;

            const attrChild = node.querySelector?.('[data-symbol]');
            if (attrChild) {
                const normChild = normalizeTokenSymbol(attrChild.getAttribute('data-symbol'));
                if (normChild) return normChild;
            }

            const icon = node.querySelector?.('img[alt]');
            if (icon) {
                const normAlt = normalizeTokenSymbol(icon.getAttribute('alt'));
                if (normAlt) return normAlt;
            }

            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const text = walker.currentNode.nodeValue.trim();
                if (!text || text.length > 12) continue;
                if (/^[A-Z0-9]{2,10}$/.test(text)) return text;
                if (/^[A-Za-z0-9]{2,10}$/.test(text) && !/usd|swap|app/i.test(text)) return text.toUpperCase();
            }
            return null;
        };

        const containers = [
            inputEl.closest?.('[data-testid*="token"]'),
            inputEl.closest?.('[data-role*="token"]'),
            inputEl.closest?.('.bg-card'),
            inputEl.parentElement,
            inputEl.closest?.('div')
        ].filter(Boolean);

        for (const container of containers) {
            const symbol = scanNode(container);
            if (symbol) return symbol;
        }

        let node = inputEl.previousElementSibling;
        while (node) {
            const symbol = scanNode(node);
            if (symbol) return symbol;
            node = node.previousElementSibling;
        }

        node = inputEl.nextElementSibling;
        while (node) {
            const symbol = scanNode(node);
            if (symbol) return symbol;
            node = node.nextElementSibling;
        }

        return null;
    }

    function findSectionByLabelText(labelText) {
        const labels = Array.from(document.querySelectorAll('label'));
        const target = labels.find(l => l.textContent.trim().toLowerCase() === labelText);
        return target?.closest('.flex.flex-col');
    }

    function extractDzapFromDOMV2() {
        const paySection = findSectionByLabelText('pay');
        const receiveSection = findSectionByLabelText('receive');
        if (!paySection || !receiveSection) return null;

        const payInput = paySection.querySelector('input[placeholder="0.0"], input[inputmode="decimal"]');
        const fromAmount = parseNumeric(payInput?.value || '');

        const payTokenEl = paySection.querySelector('.inline-block p, .inline-block span, .inline-flex p');
        const fromToken = mapTokenSymbol(payTokenEl?.textContent || '');

        const receiveTokenEl = receiveSection.querySelector('.inline-block p, .inline-block span, .inline-flex p');
        const toToken = mapTokenSymbol(receiveTokenEl?.textContent || '');

        const receiveAmountSelectors = [
            'button[data-state="closed"] p.font-medium',
            'p.font-normal',
            'p.text-xl',
            'input[readonly]',
            '[data-output-amount]'
        ];
        let toAmount = NaN;
        for (const sel of receiveAmountSelectors) {
            const el = receiveSection.querySelector(sel);
            const val = parseNumeric(el?.textContent || el?.value || '');
            if (Number.isFinite(val) && val > 0) {
                toAmount = val;
                break;
            }
        }

        if (!fromToken || !toToken || !Number.isFinite(fromAmount) || !Number.isFinite(toAmount) || fromAmount <= 0 || toAmount <= 0) {
            return null;
        }

        return {
            fromToken,
            toToken,
            fromAmount,
            toAmount
        };
    }

    function tryExtractFromDOM() {
        if (location.hostname.includes('dzap')) {
            const dzapV2 = extractDzapFromDOMV2();
            if (dzapV2) return dzapV2;
        }

        const selectors = [
            "input[type='number']",
            "input[inputmode='decimal']",
            "input[placeholder*='0']",
            "input[data-testid*='amount']",
            "input[data-testid*='input']",
            "input[data-testid*='output']",
            "input.input-panel"
        ];

        const seen = new Set();
        const parsed = [];

        for (const selector of selectors) {
            document.querySelectorAll(selector).forEach(el => {
                if (seen.has(el)) return;
                seen.add(el);
                const val = parseNumeric(el.value);
                if (!Number.isFinite(val) || val <= 0) return;

                const meta = [
                    el.name,
                    el.id,
                    el.getAttribute('aria-label'),
                    el.getAttribute('placeholder'),
                    el.closest?.('[data-testid]')?.getAttribute('data-testid')
                ].filter(Boolean).join(' ').toLowerCase();

                parsed.push({ element: el, value: val, meta });
            });
        }

        if (parsed.length < 2) return null;

        const from = parsed.find(p => /from|pay|sell|source|send/.test(p.meta)) || parsed[0];
        const to = parsed.find(p => p !== from && /to|receive|buy|dest|get/.test(p.meta)) || parsed.find(p => p !== from);

        if (!from || !to) return null;

        const fromToken = findTokenAroundInput(from.element);
        const toToken = findTokenAroundInput(to.element);

        if (!fromToken || !toToken) return null;

        return { fromToken, toToken, fromAmount: from.value, toAmount: to.value };
    }

    /* ---------------------------------- PLATFORM PARSERS --------------------------------- */
    function getTokenDataMatcha() {
        try {
            const tokenAName = document.querySelectorAll('span[data-selected="true"] span')[0]?.innerText.trim();
            const tokenBName = document.querySelectorAll('span[data-selected="true"] span')[1]?.innerText.trim();
            const tokenAValue = parseFloat(document.getElementById('sellAmount')?.value.replace(',', '')) || 0;
            const tokenBValue = parseFloat(document.getElementById('buyAmount')?.value.replace(',', '')) || 0;
            if (!tokenAName || !tokenBName) throw new Error('Nama token Matcha tidak terbaca');
            if (tokenAValue === 0 || tokenBValue === 0) return alert('⚠️ Nilai swap Matcha belum terisi');
            calculateRateUSDT('Matcha', tokenAName, tokenAValue, tokenBName, tokenBValue);
        } catch (e) {
            console.error('❌ Matcha parser:', e);
            alert('❌ Kesalahan parsing dari Matcha:\n' + e.message);
        }
    }

    function getTokenDataKyber() {
        try {
            const tokenAInput = document.querySelectorAll('input.token-amount-input')[0];
            const tokenBInput = document.querySelectorAll('input.token-amount-input')[1];
            const tokenAValue = parseFloat(tokenAInput?.value.replace(',', '')) || 0;
            const tokenBValue = parseFloat(tokenBInput?.value.replace(',', '')) || 0;
            const tokenAName = document.querySelectorAll('[data-testid="token-symbol-container"]')[0]?.innerText.trim();
            const tokenBName = document.querySelectorAll('[data-testid="token-symbol-container"]')[1]?.innerText.trim();
            if (!tokenAName || !tokenBName) throw new Error('Nama token KyberSwap tidak terbaca');
            if (tokenAValue === 0 || tokenBValue === 0) return alert('⚠️ Nilai swap Kyber belum terisi');
            calculateRateUSDT('KyberSwap', tokenAName, tokenAValue, tokenBName, tokenBValue);
        } catch (e) {
            console.error('❌ Kyber parser:', e);
            alert('❌ Kesalahan parsing dari KyberSwap:\n' + e.message);
        }
    }

    function getTokenDataOKX() {
        try {
            // New robust selectors for OKX
            const tokenSpans = document.querySelectorAll('button[class*="__dex"] span span');
            const tokenAName = tokenSpans[0]?.innerText.trim();
            const tokenBName = tokenSpans[1]?.innerText.trim();

            const amountInputs = document.querySelectorAll('input.input-panel');
            const tokenAValue = parseFloat(amountInputs[0]?.value.replace(/,/g, '')) || 0;
            const tokenBValue = parseFloat(amountInputs[1]?.value.replace(/,/g, '')) || 0;

            if (!tokenAName || !tokenBName || tokenAValue === 0 || tokenBValue === 0) {
                console.warn('⚠️ OKX specific parser partially failed, attempting fallback...');
                const state = tryExtractFromDOM();
                if (state) {
                    calculateRateUSDT('OKX DEX', state.fromToken, state.fromAmount, state.toToken, state.toAmount);
                    return;
                }
                if (!tokenAName || !tokenBName) throw new Error('Nama token OKX tidak terbaca');
                if (tokenAValue === 0 || tokenBValue === 0) throw new Error('Nilai swap OKX belum terisi');
            }

            calculateRateUSDT('OKX DEX', tokenAName, tokenAValue, tokenBName, tokenBValue);
        } catch (e) {
            console.error('❌ OKX parser:', e);
            alert('❌ Kesalahan parsing dari OKX DEX:\n' + e.message);
        }
    }

    function getTokenDataDeFiLlama() {
        try {
            const inputs = document.querySelectorAll('input.chakra-input');
            const tokenAValue = parseFloat(inputs[0]?.value.replace(/[\s,]/g, '')) || 0;
            const tokenBValue = parseFloat(inputs[1]?.value.replace(/[\s,]/g, '')) || 0;
            const tokenAName = document.querySelectorAll('.chakra-text.css-54ghko')[0]?.innerText.trim();
            const tokenBName = document.querySelectorAll('.chakra-text.css-54ghko')[1]?.innerText.trim();
            if (!tokenAName || !tokenBName) throw new Error('Nama token DeFiLlama tidak terbaca');
            if (tokenAValue === 0 || tokenBValue === 0) return alert('⚠️ Nilai swap DeFiLlama belum terisi');
            calculateRateUSDT('DeFiLlama', tokenAName, tokenAValue, tokenBName, tokenBValue);
        } catch (e) {
            console.error('❌ DeFiLlama parser:', e);
            alert('❌ Kesalahan parsing dari DeFiLlama:\n' + e.message);
        }
    }

    function getTokenDataDZap() {
        try {
            const state = getCurrentDZapState();
            if (!state) throw new Error('Data swap DZAP tidak ditemukan. Pastikan token & amount sudah terisi.');
            const { fromToken, toToken, fromAmount, toAmount } = state;
            if (!fromToken || !toToken) throw new Error('Simbol token DZAP tidak terbaca.');
            if (!Number.isFinite(fromAmount) || !Number.isFinite(toAmount) || fromAmount <= 0 || toAmount <= 0) {
                return alert('⚠️ Nilai swap DZAP belum valid. Isi angka yang benar.');
            }
            calculateRateUSDT('DZAP', fromToken, fromAmount, toToken, toAmount);
            scheduleDzapRouteUpdate(100);
        } catch (e) {
            console.error('❌ DZAP parser:', e);
            alert('❌ Kesalahan parsing dari DZAP:\n' + e.message);
        }
    }

    function getTokenDataOKUTrade() {
        try {
            const urlParams = new URLSearchParams(location.search);
            const inAmountUrl = parseNumeric((urlParams.get('inAmount') || '').replace(/"/g, ''));

            // Attempt 1: extract from Next.js __NEXT_DATA__ or hydrated state
            const nextState = tryExtractFromNextData();
            if (nextState?.fromToken && nextState?.toToken && nextState?.fromAmount > 0 && nextState?.toAmount > 0) {
                calculateRateUSDT('OKU Trade', nextState.fromToken, nextState.fromAmount, nextState.toToken, nextState.toAmount);
                return;
            }

            // Attempt 2: OKU Trade specific DOM selectors (Uniswap v3 style)
            const tokenSelectors = [
                '[data-testid*="currency-select"] span',
                '[data-testid*="open-currency-select"] span',
                'button[data-testid*="token"] span',
                '[class*="StyledTokenName"]',
                '[class*="token-symbol"]',
                '[class*="CurrencySelect"] span'
            ];

            let fromToken = null, toToken = null;
            for (const sel of tokenSelectors) {
                const els = document.querySelectorAll(sel);
                const symbols = Array.from(els)
                    .map(el => normalizeTokenSymbol(el.textContent))
                    .filter(Boolean);
                if (symbols.length >= 2) {
                    [fromToken, toToken] = symbols;
                    break;
                }
            }

            // Attempt 3: scan all visible short uppercase text as token symbols
            if (!fromToken || !toToken) {
                const candidates = [];
                document.querySelectorAll('button span, div[class*="token"] span, div[class*="Token"] span').forEach(el => {
                    const text = el.textContent.trim();
                    if (/^[A-Z][A-Z0-9]{1,9}$/.test(text) && !/^(SWAP|FROM|TO|MAX|SELL|BUY)$/.test(text)) {
                        candidates.push(text);
                    }
                });
                if (candidates.length >= 2 && !fromToken) fromToken = candidates[0];
                if (candidates.length >= 2 && !toToken) toToken = candidates[1];
            }

            // Get input amount from DOM or URL param
            let fromAmount = null, toAmount = null;
            const amountInputs = document.querySelectorAll(
                'input[inputmode="decimal"], input[data-testid*="amount"], input[type="number"]'
            );
            amountInputs.forEach((inp, i) => {
                const val = parseNumeric(inp.value);
                if (!Number.isFinite(val) || val <= 0) return;
                if (i === 0 && !fromAmount) fromAmount = val;
                else if (i === 1 && !toAmount) toAmount = val;
            });
            if (!fromAmount && inAmountUrl > 0) fromAmount = inAmountUrl;

            // Output amount might be readonly text, not an input
            if (!toAmount) {
                const outputCandidates = document.querySelectorAll(
                    '[data-testid*="output"] [class*="amount"], [data-testid="swap-output-amount"], ' +
                    '[class*="OutputPanel"] input, [class*="output"] input[readonly]'
                );
                for (const el of outputCandidates) {
                    const val = parseNumeric(el.value || el.textContent);
                    if (Number.isFinite(val) && val > 0) { toAmount = val; break; }
                }
            }

            // Attempt 4: full generic DOM fallback
            if (!fromToken || !toToken || !toAmount) {
                const domState = tryExtractFromDOM();
                if (domState) {
                    if (!fromToken) fromToken = domState.fromToken;
                    if (!toToken) toToken = domState.toToken;
                    if (!fromAmount) fromAmount = domState.fromAmount;
                    if (!toAmount) toAmount = domState.toAmount;
                }
            }

            if (!fromToken || !toToken) throw new Error('Simbol token OKU Trade tidak terbaca. Pastikan token sudah dipilih.');
            if (!Number.isFinite(fromAmount) || fromAmount <= 0 || !Number.isFinite(toAmount) || toAmount <= 0) {
                return alert('⚠️ Nilai swap OKU Trade belum valid. Tunggu estimasi output muncul terlebih dahulu.');
            }

            calculateRateUSDT('OKU Trade', fromToken, fromAmount, toToken, toAmount);
        } catch (e) {
            console.error('❌ OKU Trade parser:', e);
            alert('❌ Kesalahan parsing dari OKU Trade:\n' + e.message);
        }
    }

    function getTokenDataJumper() {
        try {
            // --- Step 1: Cari blok "TOKEN on CHAIN" ---
            // Struktur HTML pada halaman Review Swap Jumper memiliki ciri khas teks "ZRO on BSC" 
            // dan angka amount-nya disimpan dalam atribut title pada parent terdekat.
            const chainRx = /[•·]\s*([A-Za-z0-9.]{2,12})\s+on\s+[A-Z]/i;
            const tokenBlocks = [];

            // Scan semua elemen teks untuk mencari pola "TOKEN on CHAIN"
            document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6').forEach(el => {
                if (el.children.length > 3 || el.textContent.length > 100) return;

                const m = el.textContent.trim().match(chainRx);
                if (m) {
                    const token = m[1].toUpperCase();
                    let parent = el.parentElement;
                    let amount = null;

                    // Naik ke atas (maksimal 3 level) untuk mencari container div/svg yang punya atribut title berisi angka
                    for (let i = 0; i < 3 && parent; i++) {
                        const amountEl = parent.querySelector('[title]');
                        if (amountEl) {
                            const val = parseFloat(amountEl.getAttribute('title').replace(/,/g, ''));
                            if (isFinite(val) && val > 0) {
                                amount = val;
                                break;
                            }
                        }
                        parent = parent.parentElement;
                    }

                    // Tambahkan ke array jika belum ada (menghindari duplikasi elemen HTML yang sama)
                    if (amount !== null && !tokenBlocks.find(t => t.token === token && t.amount === amount)) {
                        tokenBlocks.push({ token, amount });
                    }
                }
            });

            // --- Step 2: Validasi Review Swap ---
            // Jika elemen yang diekstrak kurang dari 2 ATAU token pertama dan kedua sama (misal ZRO dan ZRO),
            // itu berarti skrip tidak sengaja mengekstrak daftar rute output di halaman utama, BUKAN kotak Review Swap.
            // Di halaman Review Swap, baris pertama selalu Input (misal BNB) dan baris kedua Output (misal ZRO).
            if (tokenBlocks.length < 2 || tokenBlocks[0].token === tokenBlocks[1].token) {
                return alert('⚠️ Silakan Pilih DEX/Rute Dahulu lalu klik "Review swap".');
            }

            // --- Step 3: Ekstrak Modal dan Hasil ---
            // Karena kita sudah memastikan token pertama dan kedua berbeda,
            // index 0 pasti From (Input) dan index 1 pasti To (Output).
            const fromToken = tokenBlocks[0].token;
            const fromAmount = tokenBlocks[0].amount;
            const toToken = tokenBlocks[1].token;
            let toAmount = tokenBlocks[1].amount;

            // --- Step 4: Gunakan Teks Rate untuk Akurasi Maksimal ---
            // Sesuai instruksi user, jika ada teks "1 BNB ≈ 392.965883 ZRO" pada halaman,
            // kita gunakan angka tersebut secara matematis agar harga USDT yang dikalkulasi akurat
            // dan memperbaiki error jika atribut title salah terbaca sebagai "1".
            const rateRx = /1\s+([A-Z0-9.]+)\s*[≈≃~=]\s*([\d,.]+)\s+([A-Z0-9.]+)/i;
            let rateEl = null;
            document.querySelectorAll('p, span, div').forEach(el => {
                if (rateEl) return;
                const text = el.textContent.trim();
                // Batasi panjang agar tidak membaca blok teks raksasa
                if (text.length < 50 && rateRx.test(text)) {
                    rateEl = el;
                }
            });

            if (rateEl) {
                const m = rateEl.textContent.trim().match(rateRx);
                const rateBaseTok = m[1].toUpperCase();
                const exchangeRate = parseFloat(m[2].replace(/,/g, ''));
                const rateQuoteTok = m[3].toUpperCase();

                // Hitung toAmount berdasarkan rate matematis
                if (fromToken === rateBaseTok && toToken === rateQuoteTok) {
                    toAmount = fromAmount * exchangeRate;
                    console.log(`[Jumper Debug] Overriding toAmount with exact rate: ${toAmount}`);
                } else if (fromToken === rateQuoteTok && toToken === rateBaseTok) {
                    toAmount = fromAmount / exchangeRate;
                    console.log(`[Jumper Debug] Overriding toAmount with exact rate: ${toAmount}`);
                }
            }

            console.log(`[Jumper Debug] Review Modal Extracted - fromToken: ${fromToken}, toToken: ${toToken}, fromAmount: ${fromAmount}, toAmount: ${toAmount}`);

            calculateRateUSDT('Jumper', fromToken, fromAmount, toToken, toAmount);
        } catch (e) {
            console.error('❌ Jumper parser:', e);
            alert('❌ Kesalahan parsing dari Jumper:\n' + e.message);
        }
    }



    /* ---------------------------------- DZAP ROUTE ENHANCER --------------------------------- */
    let dzapRouteObserver = null;
    let dzapRouteUpdateTimer = null;
    let dzapRouteUpdating = false;
    let dzapObservedNode = null;
    let dzapBodyObserver = null;
    function ensureDzapPayInputListener() {
        const paySection = findSectionByLabelText('pay');
        const payInput = paySection?.querySelector('input[placeholder="0.0"], input[inputmode="decimal"]');
        if (payInput && !payInput.dataset.tmRateListener) {
            const handler = () => scheduleDzapRouteUpdate(150);
            payInput.addEventListener('input', handler);
            payInput.addEventListener('change', handler);
            payInput.dataset.tmRateListener = '1';
        }
    }

    function scheduleDzapRouteUpdate(delay = 150) {
        if (!location.hostname.includes('dzap')) return;
        if (dzapRouteUpdateTimer) clearTimeout(dzapRouteUpdateTimer);
        dzapRouteUpdateTimer = setTimeout(() => {
            dzapRouteUpdateTimer = null;
            updateDzapRouteCards().catch(err => console.error('❌ Update Dzap Route Error:', err));
        }, delay);
    }

    async function updateDzapRouteCards() {
        if (dzapRouteUpdating) return;
        const container = document.querySelector(DZAP_ROUTE_CONTAINER_SELECTOR);
        if (!container) return;
        const state = getCurrentDZapState();
        if (!state?.toToken) return;

        dzapRouteUpdating = true;
        try {
            const rawToToken = state.toToken;
            const price = await getTokenUsdtPrice(rawToToken);
            const toTokenSymbol = rawToToken || '?';

            const cards = Array.from(container.querySelectorAll('.bg-card')).filter(el => el.closest(DZAP_ROUTE_CONTAINER_SELECTOR) === container);
            cards.forEach(card => {
                const amountEl = card.querySelector('button[data-state="closed"] p.font-medium');
                const amount = parseNumeric(amountEl?.textContent || '');
                if (!Number.isFinite(amount) || amount <= 0) return;

                let usdtValue = price ? amount * price : null;

                if (!usdtValue) {
                    const approxEl = card.querySelector('.text-muted-foreground');
                    const approxValue = parseNumeric(approxEl?.textContent || '');
                    if (Number.isFinite(approxValue) && approxValue > 0) {
                        usdtValue = approxValue;
                    }
                }

                const labelText = usdtValue
                    ? `Rate USDT (${toTokenSymbol}) ≈ ${usdtValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
                    : 'Rate USDT: -';

                upsertDzapRouteLabel(card, labelText);
            });
        } finally {
            dzapRouteUpdating = false;
        }
    }

    function upsertDzapRouteLabel(card, text) {
        let label = card.querySelector('.tm-route-usdt');
        if (!label) {
            label = document.createElement('div');
            label.className = 'tm-route-usdt font-dmsans';
            label.style.cssText = 'margin-top:4px;text-align:right;font-size:11px;color:#12b76a;';
            card.appendChild(label);
        }
        label.textContent = text;
    }

    function attachDzapRouteObserver() {
        const container = document.querySelector(DZAP_ROUTE_CONTAINER_SELECTOR);
        if (!container) return;

        if (dzapObservedNode === container && dzapRouteObserver) return;

        if (dzapRouteObserver && dzapObservedNode) {
            dzapRouteObserver.disconnect();
        }

        dzapRouteObserver = new MutationObserver(() => scheduleDzapRouteUpdate(120));
        dzapRouteObserver.observe(container, { childList: true, subtree: true, characterData: true });
        dzapObservedNode = container;
        scheduleDzapRouteUpdate(100);
    }

    function setupDzapRouteEnhancements() {
        if (!location.hostname.includes('dzap')) return;

        const attemptAttach = () => {
            attachDzapRouteObserver();
            if (!dzapObservedNode) {
                setTimeout(attemptAttach, 500);
            }
        };

        attemptAttach();

        if (!dzapBodyObserver && document.body) {
            dzapBodyObserver = new MutationObserver(() => {
                const container = document.querySelector(DZAP_ROUTE_CONTAINER_SELECTOR);
                if (container && container !== dzapObservedNode) attachDzapRouteObserver();
                ensureDzapPayInputListener();
            });
            dzapBodyObserver.observe(document.body, { childList: true, subtree: true });
        }

        ensureDzapPayInputListener();

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') scheduleDzapRouteUpdate(200);
        });
    }

    /* ---------------------------------- ROUTER + UI --------------------------------- */
    function detectPlatformAndRead() {
        const host = location.hostname;
        if (host.includes('matcha')) getTokenDataMatcha();
        else if (host.includes('kyberswap')) getTokenDataKyber();
        else if (host.includes('okx')) getTokenDataOKX();
        else if (host.includes('defillama')) getTokenDataDeFiLlama();
        else if (host.includes('dzap')) getTokenDataDZap();
        else if (host.includes('oku.trade')) getTokenDataOKUTrade();
        else if (host.includes('jumper.xyz')) getTokenDataJumper();
        else alert('❌ Halaman tidak dikenali! Gunakan Matcha, KyberSwap, OKX, DeFiLlama, DZap, OKU Trade, atau Jumper');
    }

    function addButton() {
        if (document.getElementById('btn-token-reader')) return;
        const btn = document.createElement('button');
        btn.id = 'btn-token-reader';
        btn.innerText = '🔄  HITUNG RATE USDT';
        Object.assign(btn.style, {
            position: 'fixed',
            top: '10%',
            left: '40%',
            zIndex: '9999',
            padding: '10px 16px',
            color: '#fff',
            background: 'rgba(12, 169, 11, 0.93)',
            border: '1px solid rgba(255,255,255,0.5)',
            borderRadius: '8px',
            fontSize: '1em',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(4px)',
            transition: 'all 0.2s ease-in-out'
        });
        btn.onclick = detectPlatformAndRead;
        document.body.appendChild(btn);
    }

    window.addEventListener('load', () => {
        setTimeout(addButton, 2000);
        setupDzapRouteEnhancements();
    });
})();

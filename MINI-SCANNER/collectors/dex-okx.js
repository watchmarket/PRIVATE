// ─── OKX DEX: OKX Aggregator REST API ────────
// Docs: https://web3.okx.com/priapi/v6/dex/aggregator/quote
function _okxApiKey() { return apiKeysOKXDEX[Math.floor(Math.random() * apiKeysOKXDEX.length)]; }

async function _signOkxHmac(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
}


async function fetchDexQuotesOkx(chainId, srcToken, destToken, amountWei, decOut) {
    if (!isOkxEnabled()) return [];
    const cacheKey = `dex:ox:${chainId}:${srcToken}:${destToken}:${amountWei}`;
    return cacheWrap(cacheKey, 900, async () => {
        try {
            if (!amountWei || String(amountWei) === '0') return [];
            const key = _okxApiKey();
            const timestamp = new Date().toISOString();
            const path = '/api/v6/dex/aggregator/quote';
            const query = `amount=${amountWei}&chainIndex=${chainId}&fromTokenAddress=${srcToken}&toTokenAddress=${destToken}`;
            const toSign = timestamp + 'GET' + path + '?' + query;
            const signature = await _signOkxHmac(key.secretKeyOKX, toSign);
            const targetUrl = `https://web3.okx.com${path}?${query}`;
            const proxyUrl = APP_DEV_CONFIG.corsProxy + encodeURIComponent(targetUrl);
            const resp = await fetch(proxyUrl, {
                headers: {
                    'OK-ACCESS-KEY': key.ApiKeyOKX,
                    'OK-ACCESS-SIGN': signature,
                    'OK-ACCESS-PASSPHRASE': key.PassphraseOKX,
                    'OK-ACCESS-TIMESTAMP': timestamp,
                    'Content-Type': 'application/json',
                },
            });
            if (!resp.ok) return [];
            const data = await resp.json();
            const d = data?.data?.[0];
            const toAmt = d?.toTokenAmount;
            if (!toAmt) return [];
            // OKX DEX tidak mengembalikan biaya gas yang valid — feeSwapUsdt = 0
            // Akan di-fallback ke chainGasFallback (eth_gasPrice via RPC proxy) di scan.js
            return [{ amount: parseFloat(toAmt), dec: decOut, name: 'OKX', src: 'OX', feeSwapUsdt: 0 }];
        } catch { return []; }
    });
}

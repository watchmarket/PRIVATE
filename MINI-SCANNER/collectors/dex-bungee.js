// ─── BUNGEE: Bungee Exchange REST API ─────────
// Endpoint: dedicated-backend.bungee.exchange/api/v1/bungee/quote
// Auth: x-api-key + affiliate header
// Badge: BG

function fetchDexQuotesBungee(chainId, srcToken, destToken, amountWei) {
    if (!isBungeeEnabled()) return Promise.resolve([]);
    const cacheKey = `dex:bg:${chainId}:${srcToken}:${destToken}:${amountWei}`;
    return cacheWrap(cacheKey, 900, () => new Promise(async resolve => {
        try {
            const userAddr = CFG.wallet || '0x0000000000000000000000000000000000000000';
            const params = new URLSearchParams({
                userAddress:              userAddr,
                originChainId:            chainId,
                destinationChainId:       chainId,
                inputAmount:              amountWei.toString(),
                inputToken:               srcToken.toLowerCase(),
                outputToken:              destToken.toLowerCase(),
                enableManual:             'true',
                receiverAddress:          userAddr,
                refuel:                   'false',
                excludeBridges:           'cctp',
                useInbox:                 'false',
                enableMultipleAutoRoutes: 'true',
            });
            const url = `https://dedicated-backend.bungee.exchange/api/v1/bungee/quote?${params}`;
            const resp = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'affiliate':    APP_DEV_CONFIG.bungeeAffiliate,
                    'x-api-key':    APP_DEV_CONFIG.bungeeApiKey,
                }
            });
            if (!resp.ok) { resolve([]); return; }
            const data = await resp.json();
            if (!data?.success) { resolve([]); return; }
            const result = data.result || {};

            // Collect routes: manualRoutes (has gas fee) + autoRoute (fallback)
            const quotes = [];
            const manualRoutes = result.manualRoutes || [];
            for (let i = 0; i < manualRoutes.length; i++) {
                quotes.push({ _type: 'manual', ...manualRoutes[i] });
            }
            // Include autoRoute as extra option (gasFee may be null → uses chainGasFallback)
            if (result.autoRoute?.output?.amount) {
                quotes.push({ _type: 'auto', ...result.autoRoute });
            }

            resolve(quotes.slice(0, CFG.quoteCountBungee));
        } catch { resolve([]); }
    }));
}

function parseDexQuoteBungee(route) {
    try {
        if (!route || !route.output?.amount) return null;
        const amount = route.output.amount;
        const dec    = route.output?.token?.decimals ?? 18;
        // Route name from routeDetails, or autoRoute label
        let name = 'BUNGEE';
        try {
            const rn = route.routeDetails?.name;
            if (rn && rn.trim()) name = String(rn).toUpperCase();
        } catch { }
        // Gas fee in USD — manualRoutes provide it, autoRoute returns null
        const feeSwapUsdt = parseFloat(route.gasFee?.feeInUsd || 0) || 0;
        return { amount, dec, name, src: 'BG', feeSwapUsdt };
    } catch { return null; }
}

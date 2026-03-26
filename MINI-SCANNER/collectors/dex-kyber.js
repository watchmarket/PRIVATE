// ─── KYBER: KyberSwap Aggregator REST API ────
// Docs: https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator/developer-guides/execute-a-swap-with-the-aggregator-api
const KYBER_CHAIN_MAP = {
    bsc: 'bsc', ethereum: 'ethereum', polygon: 'polygon',
    arbitrum: 'arbitrum', base: 'base',
};

async function fetchDexQuotesKyber(chainKey, srcToken, destToken, amountWei, decOut, decIn = 18, dir = 'ctd') {
    if (!isKyberEnabled()) return [];
    if (!amountWei || String(amountWei) === '0') return [];
    const cacheKey = `dex:kb:${chainKey}:${srcToken}:${destToken}:${amountWei}:${dir}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;
    try {
        // if (dir === 'dtc') {
        //     // DTC: gunakan Railway API untuk hindari 429
        //     const chainId = CONFIG_CHAINS[chainKey]?.Kode_Chain;
        //     if (!chainId) return [];
        //     const sender = CFG.wallet || '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
        //     const resp = await fetch('https://bzvwrjfhuefn.up.railway.app/swap', {
        //         method: 'POST',
        //         headers: { 'Content-Type': 'application/json' },
        //         body: JSON.stringify({
        //             chainId,
        //             aggregatorSlug: 'kyberswap',
        //             sender,
        //             inToken:  { chainId, type: 'TOKEN', address: srcToken,  decimals: decIn  },
        //             outToken: { chainId, type: 'TOKEN', address: destToken, decimals: decOut },
        //             amountInWei: String(amountWei),
        //             slippageBps: '100',
        //             gasPriceGwei: 0,
        //         }),
        //     });
        //     if (!resp.ok) return [];
        //     const data = await resp.json();
        //     const amountOut = data?.amountOutWei ?? data?.amountOutNoFeeWei;
        //     if (!amountOut) return [];
        //     const res = [{ amount: parseFloat(amountOut), dec: decOut, name: 'KYBER', src: 'KB' }];
        //     cacheSet(cacheKey, res, 900);
        //     return res;
        // } else {
            // CTD: gunakan Kyber Aggregator API langsung
            const chainName = KYBER_CHAIN_MAP[chainKey];
            if (!chainName) return [];
            const url = `https://aggregator-api.kyberswap.com/${chainName}/api/v1/routes` +
                `?tokenIn=${srcToken}&tokenOut=${destToken}&amountIn=${amountWei}&gasInclude=true`;
            const resp = await fetch(url, { headers: { 'x-client-id': 'hybridapp' } });
            if (!resp.ok) return [];
            const data = await resp.json();
            const rs = data?.data?.routeSummary;
            const amountOut = rs?.amountOut;
            if (!amountOut) return [];
            // gasUsd: gas cost in USD dari Kyber response (gasInclude=true di URL)
            const feeSwapUsdt = parseFloat(rs?.gasUsd || rs?.gas || 0) || 0;
            const res = [{ amount: parseFloat(amountOut), dec: decOut, name: 'KYBER', src: 'KB', feeSwapUsdt }];
            cacheSet(cacheKey, res, 900);
            return res;
      //  }
    } catch { return []; }
}

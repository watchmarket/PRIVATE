// ─── METAX: MetaMask Bridge SSE ──────────────
function fetchDexQuotesMetax(chainId, srcToken, destToken, amountWei) {
    const cacheKey = `dex:mx:${chainId}:${srcToken}:${destToken}:${amountWei}`;
    return cacheWrap(cacheKey, 900, () => new Promise(resolve => {
        const dummy = CFG.wallet || '0x7809151CFEF645A14a52F5903dE04CB9D2a0D14b';
        const params = new URLSearchParams({
            walletAddress: dummy, destWalletAddress: dummy,
            srcChainId: chainId, destChainId: chainId,
            srcTokenAddress: srcToken, destTokenAddress: destToken,
            srcTokenAmount: amountWei,
            insufficientBal: 'true', resetApproval: 'false',
            gasIncluded: 'true', gasIncluded7702: 'false', slippage: '0.5'
        });
        const url = `https://bridge.api.cx.metamask.io/getQuoteStream?${params}`;
        const quotes = []; let done = false;
        const es = new EventSource(url);
        const timer = setTimeout(() => { if (!done) { done = true; es.close(); resolve(quotes); } }, CFG.sseTimeout);
        es.addEventListener('quote', ev => {
            try {
                quotes.push(JSON.parse(ev.data));
                if (quotes.length >= CFG.quoteCountMetax) { done = true; clearTimeout(timer); es.close(); resolve(quotes); }
            } catch { }
        });
        es.onerror = () => { if (!done) { done = true; clearTimeout(timer); es.close(); resolve(quotes); } };
    }));
}

function parseDexQuoteMetax(q) {
    try {
        const dest = q.quote?.destTokenAmount || q.destTokenAmount || '0';
        const dec = q.quote?.destAsset?.decimals || 18;
        const name = (q.quote?.bridgeId || q.bridgeId || 'DEX').toString().toUpperCase();
        const feeSwapUsdt = parseFloat(
            q.quote?.gasFee?.amountInUSD ||
            q.gasFee?.amountInUSD ||
            q.quote?.totalNetworkFee?.amountInUSD ||
            q.totalNetworkFee?.amountInUSD ||
            0
        ) || 0;
        return { amount: parseFloat(dest), dec, name, src: 'MX', feeSwapUsdt };
    } catch { return null; }
}

// ─── PnL Calculator ──────────────────────────
// feeWdUsdt  : biaya withdrawal dari CEX dalam USDT
// feeSwapUsdt: biaya swap DEX dalam USDT — diambil dari respons DEX (gasCostUSD / gasUsd)
// isPairStable: true jika PAIR adalah stablecoin → tidak perlu trade ke-2 di CEX
// direction  : 'ctd' = CEX→DEX, 'dtc' = DEX→CEX
// Fee rules:
//   CTD: feetrade + feewd + feeswap
//   DTC: feeswap + feetrade (tanpa feewd)
function calcPnl(modal, pairAmt, bidPair, cexKey, feeWdUsdt = 0, isPairStable = false, direction = 'ctd', feeSwapUsdt = 0) {
    const fee = APP_DEV_CONFIG.fees[cexKey] || 0.001;
    const pairValue = pairAmt * bidPair;
    let cexFee1, cexFee2, wdFee;
    if (direction === 'ctd') {
        // CTD: BELI TOKEN di CEX (fee1) → WD token → swap DEX → (JUAL PAIR di CEX jika pair bukan stable, fee2)
        cexFee1 = modal * fee;
        cexFee2 = isPairStable ? 0 : pairValue * fee;
        wdFee = feeWdUsdt || 0;
    } else {
        // DTC: swap DEX → JUAL TOKEN di CEX (fee2), tidak perlu WD dari CEX
        cexFee1 = isPairStable ? 0 : modal * fee;
        cexFee2 = pairValue * fee;
        wdFee = 0;
    }
    const feeSwap = feeSwapUsdt || 0;
    const pnlKotor = pairValue - modal;
    return {
        pnl: pnlKotor - cexFee1 - cexFee2 - wdFee - feeSwap,
        pnlKotor,
        pairValue, cexFee1, cexFee2, wdFee, feeSwap,
        totalFee: cexFee1 + cexFee2 + wdFee + feeSwap
    };
}

// ─── Scan Engine ──────────────────────────────
// feeSwapUsdt diambil dari parsed.feeSwapUsdt (field dari masing-masing DEX collector)
// MetaX : q.quote.gasFee.amountInUSD
// JumpX : route.gasCostUSD
// Kyber : routeSummary.gasUsd
// OKX   : estimateGasFee wei * nativePrice
// Jika DEX tidak return (= 0): gunakan chainGasFallback dari eth_gasPrice × gasUnits × nativePrice
// Jika chainGasFallback juga 0: feeSwap = 0 (tidak ada estimasi)
function computeQuotePnl(parsed, destDec, bidPrice, modal, cexKey, askPrice, direction, feeWdUsdt = 0, isPairStable = false, chainGasFallback = 0) {
    const recv = fromWei(parsed.amount + '', parsed.dec || destDec);
    const recvUSDT = recv * bidPrice;
    const feeSwapUsdt = parsed.feeSwapUsdt > 0 ? parsed.feeSwapUsdt : chainGasFallback;
    if (direction === 'ctd') {
        const tokensIn = askPrice > 0 ? modal / askPrice : 0;
        const effPrice = tokensIn > 0 ? recvUSDT / tokensIn : 0;
        const { pnl, pnlKotor, cexFee1, cexFee2, wdFee, feeSwap, totalFee } = calcPnl(modal, recv, bidPrice, cexKey, feeWdUsdt, isPairStable, 'ctd', feeSwapUsdt);
        return { name: parsed.name, src: parsed.src, recvUSDT, effPrice, pnl, pnlKotor, cexFee1, cexFee2, wdFee, feeSwap, totalFee };
    } else {
        const effPrice = recv > 0 ? modal / recv : 0;
        const { pnl, pnlKotor, cexFee1, cexFee2, wdFee, feeSwap, totalFee } = calcPnl(modal, recv, bidPrice, cexKey, feeWdUsdt, isPairStable, 'dtc', feeSwapUsdt);
        return { name: parsed.name, src: parsed.src, recvUSDT, effPrice, pnl, pnlKotor, cexFee1, cexFee2, wdFee, feeSwap, totalFee };
    }
}

// ─── Auto Level Calculation ──────────────────
// Hitung weighted avg price & actual modal dari orderbook depth
function calculateAutoVolume(orderbook, maxModal, levels, side) {
    try {
        const book = (orderbook[side] || []).slice(0, Math.min(levels, 4));
        if (!book.length) return null;
        let totalUSDT = 0, totalCoins = 0, lastPrice = 0, levelsUsed = 0;
        for (let i = 0; i < book.length; i++) {
            const price = parseFloat(book[i][0]), amount = parseFloat(book[i][1]);
            if (!price || !amount) continue;
            const volUSDT = price * amount;
            lastPrice = price;
            levelsUsed = i + 1;
            if (totalUSDT + volUSDT >= maxModal) {
                const remaining = maxModal - totalUSDT;
                totalCoins += remaining / price;
                totalUSDT = maxModal;
                break;
            }
            totalUSDT += volUSDT;
            totalCoins += amount;
        }
        if (totalCoins <= 0 || totalUSDT <= 0) return null;
        return { actualModal: totalUSDT, avgPrice: totalUSDT / totalCoins, lastLevelPrice: lastPrice, levelsUsed };
    } catch { return null; }
}

// ─── WD/DP Icons di Header Card ───────────────
// Update icon ✅⛔ di sebelah nama token & pair di header card
function _updateWdBadge(card, tok, stToken, stPair, cardEls, walletFetched) {
    const tokEl   = cardEls?.wdTokEl  || document.getElementById('wdic-tok-'  + tok.id);
    const pairEl  = cardEls?.wdPairEl || document.getElementById('wdic-pair-' + tok.id);
    const pairSym = (tok.tickerPair || 'USDT').toUpperCase();
    if (tokEl)  tokEl.innerHTML  = _wdpIcons(stToken, walletFetched, tok.cex, tok.ticker);
    if (pairEl) pairEl.innerHTML = _wdpIcons(stPair,  walletFetched, tok.cex, pairSym);
}


async function scanToken(tok) {
    const chainCfg = CONFIG_CHAINS[tok.chain];
    if (!chainCfg) return;
    const els = _cardEls.get(tok.id);
    const card = els?.card || document.getElementById('card-' + tok.id);
    if (!card) return;
    const n = totalQuoteCount();

    // 1. Fetch CEX orderbook for TOKEN
    let obToken;
    if (!tok.symbolToken) {
        obToken = { askPrice: 1.0, bidPrice: 1.0, bids: [], asks: [] };
    } else {
        obToken = await fetchOrderbook(tok.cex, tok.symbolToken);
        if (!obToken || obToken.error) { setCardStatus(card, 'ERROR: KONEKSI EXCHANGER'); return; }
    }
    // Cache orderbook for tooltip
    _obCache[tok.id] = { bids: obToken.bids || [], asks: obToken.asks || [], bidPrice: obToken.bidPrice, askPrice: obToken.askPrice };

    // 2. Fetch CEX orderbook for PAIR (if triangular)
    let bidPair = 1, askPair = 1;
    const isTriangular = tok.tickerPair && tok.tickerPair !== tok.ticker && tok.symbolPair
        && tok.tickerPair.toUpperCase() !== 'USDT';
    if (isTriangular) {
        const obPair = await fetchOrderbook(tok.cex, tok.symbolPair);
        if (obPair && !obPair.error) { askPair = obPair.askPrice; bidPair = obPair.bidPrice; }
    }

    let pairSc = tok.scPair || '';
    let pairDec = tok.decPair || 18;
    if (tok.tickerPair && tok.tickerPair.toUpperCase() === 'USDT') {
        pairSc  = CONFIG_CHAINS[tok.chain]?.USDT_SC  || pairSc;
        pairDec = CONFIG_CHAINS[tok.chain]?.USDT_DEC ?? pairDec;
    }
    if (!pairSc || !tok.scToken) { setCardStatus(card, 'SC kosong'); return; }

    // 2b. Ambil fee WD & status WD/DP dari cache CEX wallet
    // CTD: user beli token di CEX → WD token ke wallet → swap ke pair di DEX
    // DTC: user swap pair → token di DEX → deposit token ke CEX → jual, lalu WD pair
    const pairSymbol = (tok.tickerPair || 'USDT').toUpperCase();
    const isPairStable = STABLE_COINS.has(pairSymbol);
    const feeWdCtD = (typeof getCexFeeWdUsdt === 'function')
        ? getCexFeeWdUsdt(tok.cex, tok.ticker, tok.chain, obToken.askPrice) : 0;
    // DTC + pair stablecoin: tidak perlu WD stablecoin dari CEX (diasumsikan sudah ada di DEX wallet)
    const feeWdDtC = isPairStable ? 0 : (typeof getCexFeeWdUsdt === 'function')
        ? getCexFeeWdUsdt(tok.cex, pairSymbol, tok.chain, bidPair || 1) : 0;

    // Status WD/DP: tampilkan badge di card
    const stToken = (typeof getCexTokenStatus === 'function')
        ? getCexTokenStatus(tok.cex, tok.ticker, tok.chain, obToken.askPrice) : null;
    const stPair  = (typeof getCexTokenStatus === 'function')
        ? getCexTokenStatus(tok.cex, pairSymbol, tok.chain, bidPair || 1) : null;
    // Indodax: API tidak punya status WD/DP asli → walletFetched = false agar tidak diblock dan tampil ??
    const walletFetched = tok.cex !== 'indodax' && typeof isCexWalletFetched === 'function' && isCexWalletFetched(tok.cex);
    _updateWdBadge(card, tok, stToken, stPair, els, walletFetched);

    // Block flag:
    // - Jika stToken ada: block sesuai flag withdrawEnable / depositEnable
    // - Jika stToken null & wallet sudah di-fetch: token tidak disuport di chain ini → block keduanya
    // - Jika stToken null & wallet belum di-fetch: data belum ada → tidak diblock
    const blockCtD = stToken !== null ? stToken.withdrawEnable === false : walletFetched;
    const blockDtC = stToken !== null ? stToken.depositEnable  === false : walletFetched;

    // Tampilkan notice DITUTUP di header tabel jika blocked
    if (blockCtD) {
        const ctdStatus = els?.ctdStatus;
        if (ctdStatus) { ctdStatus.textContent = ' ⛔ WD DITUTUP'; ctdStatus.className = 'tbl-status tbl-status-err'; }
    }
    if (blockDtC) {
        const dtcStatus = els?.dtcStatus;
        if (dtcStatus) { dtcStatus.textContent = ' ⛔ DP DITUTUP'; dtcStatus.className = 'tbl-status tbl-status-err'; }
    }

    // 3. Auto Level: hitung weighted avg price & actual modal dari orderbook depth
    let alCtD = null, alDtC = null;
    if (CFG.autoLevel && obToken.asks.length && obToken.bids.length) {
        alCtD = calculateAutoVolume(obToken, tok.modalCtD, CFG.levelCount, 'asks');
        alDtC = calculateAutoVolume(obToken, tok.modalDtC, CFG.levelCount, 'bids');
    }
    const modalCtD   = alCtD ? alCtD.actualModal   : tok.modalCtD;
    const askCtD     = alCtD ? alCtD.avgPrice      : obToken.askPrice;
    const modalDtC   = alDtC ? alDtC.actualModal   : tok.modalDtC;
    const bidDtC     = alDtC ? alDtC.avgPrice      : obToken.bidPrice;
    // harga level terakhir (LX) sesuai kecukupan modal; fallback L1 jika auto level OFF
    const dispAskCtD = alCtD ? alCtD.lastLevelPrice : obToken.askPrice;
    const dispBidDtC = alDtC ? alDtC.lastLevelPrice : obToken.bidPrice;

    // Simpan dispAsk/dispBid + fee WD ke cache agar tooltip bisa mengaksesnya
    _obCache[tok.id].dispAsk  = dispAskCtD;
    _obCache[tok.id].dispBid  = dispBidDtC;
    _obCache[tok.id].feeWdCtD = feeWdCtD;
    _obCache[tok.id].feeWdDtC = feeWdDtC;
    _obCache[tok.id].pairSym  = pairSymbol;
    _obCache[tok.id].isPairStable = isPairStable;

    // 4. Fetch DEX quotes from BOTH aggregators in parallel
    const weiCtD = toWei(askCtD > 0 ? modalCtD / askCtD : 0, tok.decToken);
    const weiDtC = toWei(isTriangular ? (askPair > 0 ? modalDtC / askPair : 0) : modalDtC, pairDec);

    // Update header modal: modal + status Auto Level (tanpa fee WD — fee WD tampil di label ALL FEE)
    const ctdHdr = els?.modalCtdHdr;
    const dtcHdr = els?.modalDtcHdr;
    if (CFG.autoLevel) {
        if (ctdHdr) {
            const full = !alCtD || alCtD.actualModal >= tok.modalCtD * 0.99;
            const amt  = alCtD ? alCtD.actualModal.toFixed(2) : tok.modalCtD;
            ctdHdr.innerHTML = `$${amt} <span class="al-badge ${full ? 'al-ok' : 'al-warn'}">${full ? '✅' : '⚠️'}</span><span class="tbl-status"></span>`;
        }
        if (dtcHdr) {
            const full = !alDtC || alDtC.actualModal >= tok.modalDtC * 0.99;
            const amt  = alDtC ? alDtC.actualModal.toFixed(2) : tok.modalDtC;
            dtcHdr.innerHTML = `$${amt} <span class="al-badge ${full ? 'al-ok' : 'al-warn'}">${full ? '✅' : '⚠️'}</span><span class="tbl-status"></span>`;
        }
    } else {
        if (ctdHdr) ctdHdr.innerHTML = `$${tok.modalCtD}<span class="tbl-status"></span>`;
        if (dtcHdr) dtcHdr.innerHTML = `$${tok.modalDtC}<span class="tbl-status"></span>`;
    }
    // Helper format fee cell: hanya tampilkan total fee
    function _fmtFeeCell(wdFee, tradeFee, swapFee = 0) {
        const total = wdFee + tradeFee + swapFee;
        return `-${total.toFixed(2)}$`;
    }

    const diagCtD = diagnoseWei(weiCtD);
    const diagDtC = diagnoseWei(weiDtC);
    const chainId = chainCfg.Kode_Chain;
    const [mxCtD, mxDtC, jxCtD, jxDtC, kbCtD, kbDtC, okCtD, okDtC, bgCtD, bgDtC] = await Promise.all([
        fetchDexQuotesMetax(chainId, tok.scToken, pairSc, weiCtD),
        fetchDexQuotesMetax(chainId, pairSc, tok.scToken, weiDtC),
        fetchDexQuotesJumpx(chainId, tok.scToken, pairSc, weiCtD),
        fetchDexQuotesJumpx(chainId, pairSc, tok.scToken, weiDtC),
        fetchDexQuotesKyber(tok.chain, tok.scToken, pairSc, weiCtD, pairDec),
        fetchDexQuotesKyber(tok.chain, pairSc, tok.scToken, weiDtC, tok.decToken, pairDec, 'dtc'),
        fetchDexQuotesOkx(chainId, tok.scToken, pairSc, weiCtD, pairDec),
        fetchDexQuotesOkx(chainId, pairSc, tok.scToken, weiDtC, tok.decToken),
        fetchDexQuotesBungee(chainId, tok.scToken, pairSc, weiCtD),
        fetchDexQuotesBungee(chainId, pairSc, tok.scToken, weiDtC),
    ]);

    // helper: build list of {name, error} for empty columns
    function buildMissingLabels(allData, mxRaw, jxRaw, kbRaw, okRaw, bgRaw) {
        const labels = [];
        const mtIn = allData.filter(r => r.src === 'MX').length;
        const jxIn = allData.filter(r => r.src === 'JX').length;
        const bgIn = allData.filter(r => r.src === 'BG').length;
        const kbIn = allData.some(r => r.src === 'KB');
        const okIn = allData.some(r => r.src === 'OX');
        for (let i = mtIn; i < CFG.quoteCountMetax; i++)
            labels.push({ name: 'METAX', error: mxRaw.length === 0 ? 'TIMEOUT' : 'NO ROUTE' });
        for (let i = jxIn; i < CFG.quoteCountJumpx; i++)
            labels.push({ name: 'JUMPER', error: jxRaw.length === 0 ? 'TIMEOUT' : 'NO ROUTE' });
        if (isKyberEnabled() && !kbIn)
            labels.push({ name: 'KYBER', error: kbRaw.length === 0 ? 'NO QUOTE' : 'NO ROUTE' });
        if (isOkxEnabled() && !okIn)
            labels.push({ name: 'OKX', error: okRaw.length === 0 ? 'NO QUOTE' : 'NO ROUTE' });
        if (isBungeeEnabled()) {
            for (let i = bgIn; i < CFG.quoteCountBungee; i++)
                labels.push({ name: 'BUNGEE', error: bgRaw.length === 0 ? 'NO QUOTE' : 'NO ROUTE' });
        }
        return labels;
    }

    // 5. Combine & sort CTD quotes — skip jika WD token ditutup (blockCtD)
    const tokMinPnl = (isFinite(tok.minPnl) && tok.minPnl !== null) ? tok.minPnl : 1;
    // Gas estimate dari eth_gasPrice yang sudah di-fetch saat start scan
    // Dipakai jika DEX tidak return feeSwap sendiri (OKX, MetaX)
    const chainGasFee = _chainGasEstimateUsdt[chainId] || 0;
    const allCtD = [];
    if (!blockCtD) {
        mxCtD.forEach(q => { const p = parseDexQuoteMetax(q); if (p) allCtD.push(computeQuotePnl(p, pairDec, bidPair, modalCtD, tok.cex, askCtD, 'ctd', feeWdCtD, isPairStable, chainGasFee)); });
        jxCtD.forEach(q => { const p = parseDexQuoteJumpx(q); if (p) allCtD.push(computeQuotePnl(p, pairDec, bidPair, modalCtD, tok.cex, askCtD, 'ctd', feeWdCtD, isPairStable, chainGasFee)); });
        kbCtD.forEach(q => { if (q) allCtD.push(computeQuotePnl(q, pairDec, bidPair, modalCtD, tok.cex, askCtD, 'ctd', feeWdCtD, isPairStable, chainGasFee)); });
        okCtD.forEach(q => { if (q) allCtD.push(computeQuotePnl(q, pairDec, bidPair, modalCtD, tok.cex, askCtD, 'ctd', feeWdCtD, isPairStable, chainGasFee)); });
        bgCtD.forEach(q => { const p = parseDexQuoteBungee(q); if (p) allCtD.push(computeQuotePnl(p, pairDec, bidPair, modalCtD, tok.cex, askCtD, 'ctd', feeWdCtD, isPairStable, chainGasFee)); });
    }
    allCtD.sort((a, b) => b.pnl - a.pnl);
    const ctdData = allCtD.slice(0, n);
    const missingCtdLabels = blockCtD ? [] : buildMissingLabels(allCtD, mxCtD, jxCtD, kbCtD, okCtD, bgCtD);

    // 6. Combine & sort DTC quotes — skip jika DP token ditutup (blockDtC)
    const allDtC = [];
    if (!blockDtC) {
        mxDtC.forEach(q => { const p = parseDexQuoteMetax(q); if (p) allDtC.push(computeQuotePnl(p, tok.decToken, bidDtC, modalDtC, tok.cex, askCtD, 'dtc', 0, isPairStable, chainGasFee)); });
        jxDtC.forEach(q => { const p = parseDexQuoteJumpx(q); if (p) allDtC.push(computeQuotePnl(p, tok.decToken, bidDtC, modalDtC, tok.cex, askCtD, 'dtc', 0, isPairStable, chainGasFee)); });
        kbDtC.forEach(q => { if (q) allDtC.push(computeQuotePnl(q, tok.decToken, bidDtC, modalDtC, tok.cex, askCtD, 'dtc', 0, isPairStable, chainGasFee)); });
        okDtC.forEach(q => { if (q) allDtC.push(computeQuotePnl(q, tok.decToken, bidDtC, modalDtC, tok.cex, askCtD, 'dtc', 0, isPairStable, chainGasFee)); });
        bgDtC.forEach(q => { const p = parseDexQuoteBungee(q); if (p) allDtC.push(computeQuotePnl(p, tok.decToken, bidDtC, modalDtC, tok.cex, askCtD, 'dtc', 0, isPairStable, chainGasFee)); });
    }
    allDtC.sort((a, b) => b.pnl - a.pnl); // best first
    const dtcData = allDtC.slice(0, n);
    const missingDtcLabels = buildMissingLabels(allDtC, mxDtC, jxDtC, kbDtC, okDtC, bgDtC);

    // 6. Fill CTD table
    const _tradeUrl = typeof _getCexTradeUrl === 'function' ? _getCexTradeUrl(tok.cex, tok.ticker, pairSymbol) : '';
    const _cexPriceHtml = (txt, url) => url ? `<a href="${url}" target="_blank" rel="noopener" class="cex-price-link">${txt}</a>` : txt;
    const _dexPriceHtml = (txt, dexName) => {
        const url = typeof _getDexUrl === 'function' ? _getDexUrl(dexName, tok) : '';
        return url ? `<a href="${url}" target="_blank" rel="noopener" class="dex-price-link">${txt}</a>` : txt;
    };
    const ctdStatus = els?.ctdStatus;
    if (!blockCtD && ctdStatus) ctdStatus.textContent = '';
    for (let i = 0; i < n; i++) {
        const cexEl = els?.ctdCex[i];
        if (cexEl) {
            if (blockCtD) { cexEl.textContent = '—'; cexEl.className = 'mon-dex-cell mc-ask'; }
            else { cexEl.innerHTML = _cexPriceHtml(`↑ ${fmtCompact(dispAskCtD)}$`, _tradeUrl); cexEl.className = 'mon-dex-cell mc-ask'; }
        }
    }
    if (blockCtD) {
        // WD token ditutup → isi semua sel CTD dengan pesan SKIP
        const hdrEl0 = els?.ctdHdr[0];
        if (hdrEl0) { hdrEl0.textContent = `⛔ WD ${tok.ticker}`; hdrEl0.className = 'mon-dex-hdr mon-dex-hdr-err'; }
        for (let i = 1; i < n; i++) { const h = els?.ctdHdr[i]; if (h) { h.textContent = '—'; h.className = 'mon-dex-hdr'; } }
        const dexEl0 = els?.ctdDex[0];
        if (dexEl0) { dexEl0.textContent = 'WITHDRAW DITUTUP'; dexEl0.className = 'mon-dex-cell mc-err'; }
        for (let i = 1; i < n; i++) { const d = els?.ctdDex[i]; if (d) { d.textContent = '—'; d.className = 'mon-dex-cell mc-muted'; } }
        for (let i = 0; i < n; i++) {
            const f = els?.ctdFee[i]; if (f) { f.textContent = '—'; f.className = 'mon-dex-cell mc-muted'; }
            const p = els?.ctdPnl[i]; if (p) { p.textContent = '—'; p.className = 'mon-dex-cell mc-muted'; }
        }
    } else if (!ctdData.length) {
        const reason = diagCtD || 'TIDAK ADA LP / DEX';
        const hdrEl0 = els?.ctdHdr[0];
        if (hdrEl0) { hdrEl0.textContent = reason; hdrEl0.className = 'mon-dex-hdr mon-dex-hdr-err'; }
        for (let i = 1; i < n; i++) { const h = els?.ctdHdr[i]; if (h) { h.textContent = '—'; h.className = 'mon-dex-hdr'; } }
        const hint = diagCtD === 'MODAL BESAR' ? '↓ Kecilkan Modal' : diagCtD === 'AMOUNT NOL' ? '↓ Cek Harga CEX' : '↓ KOIN TIDAK ADA DI DEX / LP';
        const dexEl0 = els?.ctdDex[0];
        if (dexEl0) { dexEl0.textContent = hint; dexEl0.className = 'mon-dex-cell mc-err'; }
        for (let i = 1; i < n; i++) { const d = els?.ctdDex[i]; if (d) { d.textContent = '—'; d.className = 'mon-dex-cell mc-muted'; } }
    } else {
        ctdData.forEach((r, i) => {
            const hdrEl = els?.ctdHdr[i];
            const cexEl = els?.ctdCex[i];
            const dexEl = els?.ctdDex[i];
            const feeEl = els?.ctdFee[i];
            const pnlEl = els?.ctdPnl[i];
            const isSignal = r.pnl >= tokMinPnl;
            const sigCls = isSignal ? ' col-signal' : '';
            const srcTag = r.src === 'MX' ? '<span class="src-tag mx">MT</span>' : r.src === 'JX' ? '<span class="src-tag jx">JM</span>' : r.src === 'BG' ? '<span class="src-tag bg">BG</span>' : '';
            if (hdrEl) { hdrEl.innerHTML = (srcTag ? srcTag + ' ' : '') + r.name; hdrEl.className = 'mon-dex-hdr'; hdrEl.dataset.effprice = r.effPrice; hdrEl.dataset.cexFee1 = r.cexFee1.toFixed(4); hdrEl.dataset.cexFee2 = r.cexFee2.toFixed(4); hdrEl.dataset.feeWd = r.wdFee.toFixed(4); hdrEl.dataset.feeSwap = (r.feeSwap || 0).toFixed(6); hdrEl.dataset.totalFee = r.totalFee.toFixed(6); hdrEl.dataset.pnlKotor = (r.pnlKotor || 0).toFixed(4); hdrEl.dataset.pnlBersih = r.pnl.toFixed(4); }
            if (cexEl) { cexEl.innerHTML = _cexPriceHtml(`↑ ${fmtCompact(dispAskCtD)}$`, _tradeUrl); cexEl.className = 'mon-dex-cell mc-ask' + sigCls; }
            if (dexEl) { dexEl.innerHTML = _dexPriceHtml(`↓ ${fmtCompact(r.effPrice)}$`, r.name); dexEl.className = 'mon-dex-cell mc-bid' + sigCls; }
            if (feeEl) { feeEl.textContent = _fmtFeeCell(r.wdFee, r.cexFee1 + r.cexFee2, r.feeSwap || 0); feeEl.className = 'mon-dex-cell mc-recv' + sigCls; }
            if (pnlEl) { const cls = r.pnl >= 0 ? 'pnl-pos' : 'pnl-neg'; pnlEl.textContent = `${fmtPnl(r.pnl)}$`; pnlEl.className = `mon-dex-cell mc-pnl ${cls}` + sigCls; }
        });
        // Fill remaining empty columns with DEX name + error info
        for (let i = ctdData.length; i < n; i++) {
            const lbl = missingCtdLabels[i - ctdData.length];
            const h = els?.ctdHdr[i];
            const c = els?.ctdCex[i];
            const d = els?.ctdDex[i];
            const f = els?.ctdFee[i];
            const p = els?.ctdPnl[i];
            if (h) { h.textContent = lbl ? lbl.name : '—'; h.className = lbl ? 'mon-dex-hdr mon-dex-hdr-muted' : 'mon-dex-hdr'; }
            if (c) { c.textContent = '-'; c.className = 'mon-dex-cell mc-muted'; }
            if (d) { d.textContent = lbl ? lbl.error : '-'; d.className = lbl ? 'mon-dex-cell mc-err-sm' : 'mon-dex-cell mc-muted'; }
            if (f) { f.textContent = '-'; f.className = 'mon-dex-cell mc-muted'; }
            if (p) { p.textContent = '-'; p.className = 'mon-dex-cell mc-muted'; }
        }
    }

    // 7. Fill DTC table
    const dtcStatus = els?.dtcStatus;
    if (!blockDtC && dtcStatus) dtcStatus.textContent = '';
    for (let i = 0; i < n; i++) {
        const cexEl = els?.dtcCex[i];
        if (cexEl) {
            if (blockDtC) { cexEl.textContent = '—'; cexEl.className = 'mon-dex-cell mc-bid'; }
            else { cexEl.innerHTML = _cexPriceHtml(`↓ ${fmtCompact(dispBidDtC)}$`, _tradeUrl); cexEl.className = 'mon-dex-cell mc-bid'; }
        }
    }
    if (blockDtC) {
        // DP token ditutup → isi semua sel DTC dengan pesan SKIP
        const hdrEl0 = els?.dtcHdr[0];
        if (hdrEl0) { hdrEl0.textContent = `⛔ DP ${tok.ticker}`; hdrEl0.className = 'mon-dex-hdr mon-dex-hdr-err'; }
        for (let i = 1; i < n; i++) { const h = els?.dtcHdr[i]; if (h) { h.textContent = '—'; h.className = 'mon-dex-hdr'; } }
        const dexEl0 = els?.dtcDex[0];
        if (dexEl0) { dexEl0.textContent = 'DEPOSIT DITUTUP'; dexEl0.className = 'mon-dex-cell mc-err'; }
        for (let i = 1; i < n; i++) { const d = els?.dtcDex[i]; if (d) { d.textContent = '—'; d.className = 'mon-dex-cell mc-muted'; } }
        for (let i = 0; i < n; i++) {
            const f = els?.dtcFee[i]; if (f) { f.textContent = '—'; f.className = 'mon-dex-cell mc-muted'; }
            const p = els?.dtcPnl[i]; if (p) { p.textContent = '—'; p.className = 'mon-dex-cell mc-muted'; }
        }
    } else if (!dtcData.length) {
        const reason = diagDtC || '';
        const hdrEl0 = els?.dtcHdr[0];
        if (hdrEl0) { hdrEl0.textContent = reason; hdrEl0.className = 'mon-dex-hdr mon-dex-hdr-err'; }
        for (let i = 1; i < n; i++) { const h = els?.dtcHdr[i]; if (h) { h.textContent = '—'; h.className = 'mon-dex-hdr'; } }
        const hint = diagDtC === 'MODAL BESAR' ? '↓ Kecilkan Modal' : diagDtC === 'AMOUNT NOL' ? '↓ Cek Harga CEX' : '↓ KOIN TIDAK ADA DI DEX / LP';
        const dexEl0 = els?.dtcDex[0];
        if (dexEl0) { dexEl0.textContent = hint; dexEl0.className = 'mon-dex-cell mc-err'; }
        for (let i = 1; i < n; i++) { const d = els?.dtcDex[i]; if (d) { d.textContent = '—'; d.className = 'mon-dex-cell mc-muted'; } }
    } else {
        dtcData.forEach((r, i) => {
            const hdrEl = els?.dtcHdr[i];
            const cexEl = els?.dtcCex[i];
            const dexEl = els?.dtcDex[i];
            const feeEl = els?.dtcFee[i];
            const pnlEl = els?.dtcPnl[i];
            const isSignal = r.pnl >= tokMinPnl;
            const sigCls = isSignal ? ' col-signal' : '';
            const srcTag = r.src === 'MX' ? '<span class="src-tag mx">MT</span>' : r.src === 'JX' ? '<span class="src-tag jx">JM</span>' : r.src === 'BG' ? '<span class="src-tag bg">BG</span>' : '';
            if (hdrEl) { hdrEl.innerHTML = (srcTag ? srcTag + ' ' : '') + r.name; hdrEl.className = 'mon-dex-hdr'; hdrEl.dataset.effprice = r.effPrice; hdrEl.dataset.cexFee1 = r.cexFee1.toFixed(4); hdrEl.dataset.cexFee2 = r.cexFee2.toFixed(4); hdrEl.dataset.feeWd = r.wdFee.toFixed(4); hdrEl.dataset.feeSwap = (r.feeSwap || 0).toFixed(6); hdrEl.dataset.totalFee = r.totalFee.toFixed(6); hdrEl.dataset.pnlKotor = (r.pnlKotor || 0).toFixed(4); hdrEl.dataset.pnlBersih = r.pnl.toFixed(4); }
            if (cexEl) { cexEl.innerHTML = _cexPriceHtml(`↓ ${fmtCompact(dispBidDtC)}$`, _tradeUrl); cexEl.className = 'mon-dex-cell mc-bid' + sigCls; }
            if (dexEl) { dexEl.innerHTML = _dexPriceHtml(`↑ ${fmtCompact(r.effPrice)}$`, r.name); dexEl.className = 'mon-dex-cell mc-ask' + sigCls; }
            if (feeEl) { feeEl.textContent = _fmtFeeCell(r.wdFee, r.cexFee1 + r.cexFee2, r.feeSwap || 0); feeEl.className = 'mon-dex-cell mc-recv' + sigCls; }
            if (pnlEl) { const cls = r.pnl >= 0 ? 'pnl-pos' : 'pnl-neg'; pnlEl.textContent = `${fmtPnl(r.pnl)}$`; pnlEl.className = `mon-dex-cell mc-pnl ${cls}` + sigCls; }
        });
        // Fill remaining empty columns with DEX name + error info
        for (let i = dtcData.length; i < n; i++) {
            const lbl = missingDtcLabels[i - dtcData.length];
            const h = els?.dtcHdr[i];
            const c = els?.dtcCex[i];
            const d = els?.dtcDex[i];
            const f = els?.dtcFee[i];
            const p = els?.dtcPnl[i];
            if (h) { h.textContent = lbl ? lbl.name : '—'; h.className = lbl ? 'mon-dex-hdr mon-dex-hdr-muted' : 'mon-dex-hdr'; }
            if (c) { c.textContent = '-'; c.className = 'mon-dex-cell mc-muted'; }
            if (d) { d.textContent = lbl ? lbl.error : '-'; d.className = lbl ? 'mon-dex-cell mc-err-sm' : 'mon-dex-cell mc-muted'; }
            if (f) { f.textContent = '-'; f.className = 'mon-dex-cell mc-muted'; }
            if (p) { p.textContent = '-'; p.className = 'mon-dex-cell mc-muted'; }
        }
    }

    // 8. Signal chip & card highlight — hanya arah yang tidak blocked
    // jika blockCtD → abaikan CTD dari pertimbangan signal
    // jika blockDtC → abaikan DTC dari pertimbangan signal
    const bestCtD = (!blockCtD && ctdData.length) ? ctdData[0].pnl : -999;
    const bestDtC = (!blockDtC && dtcData.length) ? dtcData[0].pnl : -999;
    const best = Math.max(bestCtD, bestDtC);
    // Update chip per sinyal profitable, masing-masing arah
    const ctdProfit = !blockCtD ? ctdData.filter(r => r.pnl >= tokMinPnl) : [];
    const dtcProfit = !blockDtC ? dtcData.filter(r => r.pnl >= tokMinPnl) : [];
    updateSignalChips(tok, ctdProfit, 'CTD');
    updateSignalChips(tok, dtcProfit, 'DTC');
    if (best >= tokMinPnl) {
        card.classList.add('has-signal');
        // Kumpulkan SEMUA baris yang memenuhi minPnl, dari kedua arah
        const ctdSignals = ctdData.filter(r => r.pnl >= tokMinPnl);
        const dtcSignals = dtcData.filter(r => r.pnl >= tokMinPnl);
        const tgInfo = {
            ctdSignals,
            dtcSignals,
            modalCtD:     tok.modalCtD,
            modalDtC:     tok.modalDtC,
            buyPriceCtD:  dispAskCtD,                       // harga beli CEX (CTD)
            sellPriceDtC: dispBidDtC,                       // harga jual CEX (DTC)
        };
        sendTelegram(tok, best, tgInfo);
    } else {
        card.classList.remove('has-signal');
    }
    // Jangan hapus status WD/DP DITUTUP yang sudah ditampilkan
    if (!blockCtD && !blockDtC) setCardStatus(card, '');
}

// Show error/status in both sub-table headers; clear when msg is empty
function setCardStatus(card, msg) {
    const id = card.id.replace('card-', '');
    const els = _cardEls.get(id);
    const statEls = els ? [els.ctdStatus, els.dtcStatus].filter(Boolean)
                        : Array.from(card.querySelectorAll('.tbl-status'));
    statEls.forEach(el => {
        el.textContent = msg ? ` ⚠ ${msg}` : '';
        el.className = msg ? 'tbl-status tbl-status-err' : 'tbl-status';
    });
}

// ─── Telegram + Android Notification ─────────────────────────────────────
async function sendTelegram(tok, pnl, info) {
    const now = Date.now();
    const last = tgCooldown.get(tok.id) || 0;
    if (now - last < APP_DEV_CONFIG.telegramCooldown * 60000) return;
    tgCooldown.set(tok.id, now);
    playSignalSound();

    const appName  = APP_DEV_CONFIG.appName || 'MONITORING PRICE';
    const appVer   = APP_DEV_CONFIG.appVersion ? ' v' + APP_DEV_CONFIG.appVersion : '';
    const chain    = CONFIG_CHAINS[tok.chain]?.label || tok.chain.toUpperCase();
    const cexLbl   = CONFIG_CEX[tok.cex]?.label || tok.cex;
    const pairLbl  = tok.tickerPair && tok.tickerPair !== tok.ticker ? tok.tickerPair : tok.ticker;
    const wallet   = CFG.wallet ? CFG.wallet.slice(0, 10) + '.....' + CFG.wallet.slice(-10) : '-';
    const pnlSign  = pnl >= 0 ? '+' : '';
    const esc      = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const fmtP     = (p) => p > 0 ? (p < 0.0001 ? p.toExponential(3) : p < 1 ? p.toFixed(6) : p < 1000 ? p.toFixed(4) : p.toFixed(2)) + '$' : '-';
    const fmtPnl2  = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '$';

    const ctdSignals  = info?.ctdSignals  || [];
    const dtcSignals  = info?.dtcSignals  || [];
    const modalCtD    = info?.modalCtD    ?? tok.modalCtD;
    const modalDtC    = info?.modalDtC    ?? tok.modalDtC;
    const buyPriceCtD = info?.buyPriceCtD || 0;   // harga ask CEX untuk CTD
    const sellPriceDtC = info?.sellPriceDtC || 0; // harga bid CEX untuk DTC

    // ── Android notification ──────────────────────────────────────────────
    if (window.AndroidBridge) {
        const title = `🟢 ${appName} — SIGNAL: ${tok.ticker}↔${pairLbl}`;
        const body  = `${cexLbl} [${chain}]  PnL: ${pnlSign}${pnl.toFixed(2)}$`;
        window.AndroidBridge.showNotification(title, body);
    }

    if (!APP_DEV_CONFIG.telegramBotToken || APP_DEV_CONFIG.telegramBotToken.length < 20) return;

    // ── Helper links ──────────────────────────────────────────────────────
    const chainCfg2   = CONFIG_CHAINS[tok.chain];
    const chainId2    = chainCfg2?.Kode_Chain || '';
    const _pairSc     = tok.scPair || chainCfg2?.USDT_SC || '';
    const _kyberChain = { 56:'bnb', 1:'ethereum', 137:'polygon', 42161:'arbitrum', 8453:'base' }[chainId2] || 'bnb';
    const _tradeSym   = tok.symbolToken || (tok.ticker + 'USDT');

    const _tradeLink = ({ binance:`https://www.binance.com/en/trade/${_tradeSym}`,
        gate:`https://www.gate.io/trade/${_tradeSym}`, mexc:`https://www.mexc.com/exchange/${_tradeSym}`,
        indodax:`https://indodax.com/market/${tok.symbolToken||tok.ticker.toLowerCase()+'idr'}` })[tok.cex] || '';

    function _swapLink(_src, fromSc, toSc, dexName) {
        const n           = (dexName || '').toLowerCase();
        const _sushiChain = { 56:'bsc', 1:'ethereum', 137:'polygon', 42161:'arbitrum', 8453:'base' }[chainId2] || 'bsc';
        const _ooChain    = { 56:'bsc', 1:'eth',      137:'polygon', 42161:'arbitrum', 8453:'base' }[chainId2] || 'bsc';
        const _uniChain   = { 56:'bnb', 1:'ethereum', 137:'polygon', 42161:'arbitrum', 8453:'base' }[chainId2] || 'bnb';
        const from = fromSc.toLowerCase();
        const to   = toSc.toLowerCase();
        // ── Deteksi dari nama DEX (lebih akurat dari src) ─────────────────────
        if (/^0x\b|0x protocol/i.test(n)) {
            const _matchaChain = { 56:'bsc', 1:'ethereum', 137:'polygon', 42161:'arbitrum', 8453:'base' }[chainId2] || 'ethereum';
            return `https://matcha.xyz/tokens/${_matchaChain}/${from}?buyAddress=${to}&buyChain=${chainId2}`;
        }
        if (/1inch/i.test(n))
            return `https://1inch.io/swap?src=${chainId2}:${from}&dst=${chainId2}:${to}`;
        if (/kyber/i.test(n))
            return `https://kyberswap.com/swap/${_kyberChain}/${fromSc}-to-${toSc}`;
        if (/openocean|open.ocean/i.test(n))
            return `https://app.openocean.finance/swap/${_ooChain}/${fromSc}/${toSc}`;
        if (/sushi/i.test(n))
            return `https://www.sushi.com/${_sushiChain}/swap?token0=${fromSc}&token1=${toSc}`;
        if (/pancake/i.test(n))
            return `https://pancakeswap.finance/swap?inputCurrency=${fromSc}&outputCurrency=${toSc}`;
        if (/uniswap|uni.v/i.test(n))
            return `https://app.uniswap.org/swap?inputCurrency=${fromSc}&outputCurrency=${toSc}&chain=${_uniChain}`;
        if (/apeswap/i.test(n))
            return `https://app.apeswap.finance/swap?inputCurrency=${fromSc}&outputCurrency=${toSc}`;
        if (/biswap/i.test(n))
            return `https://exchange.biswap.org/swap?inputCurrency=${fromSc}&outputCurrency=${toSc}`;
        if (/camelot/i.test(n))
            return `https://app.camelot.exchange/swap?inputCurrency=${fromSc}&outputCurrency=${toSc}`;
        if (/aerodrome/i.test(n))
            return `https://aerodrome.finance/swap?from=${fromSc}&to=${toSc}`;
        if (/okx|okdex/i.test(n))
            return `https://www.okx.com/web3/dex-swap?inputChain=${chainId2}&inputCurrency=${fromSc}&outputChain=${chainId2}&outputCurrency=${toSc}`;
        // ── Fallback: DEX tidak dikenal → aggregator netral ───────────────────
        return `https://jumper.exchange/?fromChain=${chainId2}&toChain=${chainId2}&fromToken=${fromSc}&toToken=${toSc}`;
    }
    function _wdLink(ticker) {
        return ({ binance:`https://www.binance.com/en/my/wallet/account/main/withdrawal/crypto/${ticker}`,
            gate:`https://www.gate.io/myaccount/withdraw/${ticker}`,
            mexc:`https://www.mexc.com/assets/withdraw?currency=${ticker}`,
            indodax:`https://indodax.com/account/withdraw/idr` })[tok.cex] || '';
    }
    function _dpLink(ticker) {
        return ({ binance:`https://www.binance.com/en/my/wallet/account/main/deposit/crypto/${ticker}`,
            gate:`https://www.gate.io/myaccount/deposit/${ticker}`,
            mexc:`https://www.mexc.com/assets/deposit?currency=${ticker}`,
            indodax:`https://indodax.com/account/deposit/idr` })[tok.cex] || '';
    }
    function _lnk(url, txt) { return url ? `<a href="${url}">${txt}</a>` : txt; }
    function _badge(src) { return src==='MX'?'[MT]':src==='JX'?'[JM]':src==='BG'?'[BG]':src==='KB'?'[KB]':''; }

    // ── Build one section per arah yang ada signalnya ─────────────────────
    function _section(signals, dir, modal, cexPrice) {
        if (!signals.length) return '';
        const arrow    = dir === 'CTD' ? '⬆️' : '⬇️';
        const dirLabel = dir === 'CTD' ? 'CEX→DEX' : 'DEX→CEX';
        const fromSc   = dir === 'CTD' ? tok.scToken : _pairSc;
        const toSc     = dir === 'CTD' ? _pairSc     : tok.scToken;
        // CTD: TOKEN ⇄ PAIR  |  DTC: PAIR ⇄ TOKEN
        const coinPair = dir === 'CTD'
            ? `${esc(tok.ticker)} ⇄ ${esc(pairLbl)}`
            : `${esc(pairLbl)} ⇄ ${esc(tok.ticker)}`;
        // WD/DP
        const wdTk = dir === 'CTD' ? tok.ticker : pairLbl;
        const dpTk = dir === 'CTD' ? pairLbl    : tok.ticker;
        const wdPart = _lnk(_wdLink(wdTk), `WD ${esc(wdTk)}`);
        const dpPart = _lnk(_dpLink(dpTk), `DP ${esc(dpTk)}`);
        const wdLine = dir === 'CTD' ? `💳 ${wdPart} | ${dpPart}` : `💳 ${dpPart} | ${wdPart}`;

        const cexTxt = _tradeLink ? _lnk(_tradeLink, esc(cexLbl).toUpperCase()) : esc(cexLbl).toUpperCase();

        // Tiap DEX signal = satu blok ringkas
        const dexBlocks = signals.map(r => {
            const badge   = _badge(r.src);
            const dexLink = _swapLink(r.src, fromSc, toSc, r.name);
            const dexTxt  = _lnk(dexLink, `${badge ? badge + ' ' : ''}${esc(r.name)}`);
            // CTD: beli di CEX (cexPrice), jual di DEX (effPrice)
            // DTC: beli di DEX (effPrice), jual di CEX (cexPrice)
            const buyPr  = dir === 'CTD' ? cexPrice    : r.effPrice;
            const sellPr = dir === 'CTD' ? r.effPrice  : cexPrice;
            const bruto  = r.pnlKotor != null ? fmtPnl2(r.pnlKotor) : '-';
            const tradeFlow = dir === 'CTD' ? `${cexTxt} -> ${dexTxt}` : `${dexTxt} -> ${cexTxt}`;
            return `🏦 ${tradeFlow}
💲 Buy:${fmtP(buyPr)} ➜ Sell:${fmtP(sellPr)}
💵 Modal:$${modal}  |  💰 PNL NET : <b>${fmtPnl2(r.pnl)}</b>
🔄 PNL BRUTO :${bruto} | FEE ALL:-$${r.totalFee.toFixed(2)}`;
        }).join('\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n');

        return `${arrow} <b>${coinPair}</b>  [ <i>${dirLabel}</i> ]
${dexBlocks}
${wdLine}`;
    }

    const _ctdSec = _section(ctdSignals, 'CTD', modalCtD, buyPriceCtD);
    const _dtcSec = _section(dtcSignals, 'DTC', modalDtC, sellPriceDtC);
    const _body   = [_ctdSec, _dtcSec].filter(Boolean).join('\n━━━\n');

    const msg =
`🟢 <b>${esc(appName)}${appVer}</b>
👤 @${esc(CFG.username || 'user')}  •  🔗 <b>${esc(chain)}</b>
━━━━━━━━━━━━━━━
${_body}
━━━━━━━━━━━━━━━
👛 <code>${esc(wallet)}</code>`;

    try {
        await fetch(`https://api.telegram.org/bot${APP_DEV_CONFIG.telegramBotToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: APP_DEV_CONFIG.telegramGroupId, text: msg, parse_mode: 'HTML', disable_web_page_preview: true })
        });
    } catch { }
}

// ─── Reset Monitor Cells ──────────────────────
// Kosongkan semua sel tabel dan sinyal setelah setiap ronde selesai
function resetMonitorCells() {
    const n = totalQuoteCount();
    _cardEls.forEach(els => {
        const card = els.card;
        if (!card) return;
        card.classList.remove('has-signal');
        card.querySelectorAll('.card-status').forEach(el => el.textContent = '');
        if (els.ctdStatus) { els.ctdStatus.textContent = ''; els.ctdStatus.className = 'tbl-status'; }
        if (els.dtcStatus) { els.dtcStatus.textContent = ''; els.dtcStatus.className = 'tbl-status'; }
        for (let i = 0; i < n; i++) {
            const ctdH = els.ctdHdr[i]; if (ctdH) { ctdH.textContent = '-'; ctdH.className = 'mon-dex-hdr'; }
            const ctdC = els.ctdCex[i]; if (ctdC) { ctdC.textContent = '-'; ctdC.className = 'mon-dex-cell'; }
            const ctdD = els.ctdDex[i]; if (ctdD) { ctdD.textContent = '-'; ctdD.className = 'mon-dex-cell'; }
            const ctdF = els.ctdFee[i]; if (ctdF) { ctdF.textContent = '-'; ctdF.className = 'mon-dex-cell'; }
            const ctdP = els.ctdPnl[i]; if (ctdP) { ctdP.textContent = '-'; ctdP.className = 'mon-dex-cell'; }
            const dtcH = els.dtcHdr[i]; if (dtcH) { dtcH.textContent = '-'; dtcH.className = 'mon-dex-hdr'; }
            const dtcC = els.dtcCex[i]; if (dtcC) { dtcC.textContent = '-'; dtcC.className = 'mon-dex-cell'; }
            const dtcD = els.dtcDex[i]; if (dtcD) { dtcD.textContent = '-'; dtcD.className = 'mon-dex-cell'; }
            const dtcF = els.dtcFee[i]; if (dtcF) { dtcF.textContent = '-'; dtcF.className = 'mon-dex-cell'; }
            const dtcP = els.dtcPnl[i]; if (dtcP) { dtcP.textContent = '-'; dtcP.className = 'mon-dex-cell'; }
        }
    });
    _clearAllSignalChips();
}

// ─── Scan Loop ───────────────────────────────
let _scanRound = 0;
let _lastScanTokenKey = null; // cache key: cegah rebuild monitor cards jika urutan tidak berubah
// Gas estimate per chainId dalam USD — diisi sekali saat start scan
let _chainGasEstimateUsdt = {};

async function runScan() {
    if (scanning) return;
    scanning = true; scanAbort = false;
    document.body.classList.add('is-scanning');
    $('#btnScanIcon').text('■'); $('#btnScanLbl').text('STOP'); $('#btnScan').addClass('stop');
    $('#btnScanCount').text('');
    $('#scanBadge').addClass('active');
    // Clear previous signal chips and reset table
    _clearAllSignalChips();
    $('#notStartedNotice').hide();
    $('#scanDoneNotice').hide();
    $('#scanStopNotice').hide();
    updateNoSignalNotice();
    lockTabs();
    if (!getFilteredTokens().length) { showToast('Tidak ada token aktif! Periksa filter di Pengaturan.'); stopScan(); return; }
    showToast('▶ Scanning dimulai…');
    // Start Android Foreground Service (keeps CPU alive when screen off)
    try { if (window.AndroidBridge && AndroidBridge.startBackgroundService) AndroidBridge.startBackgroundService(); } catch (e) { }
    await fetchUsdtRate();

    // Fetch gas price sekali di awal scan untuk semua chain yang aktif
    _chainGasEstimateUsdt = {};
    const activeChainIds = [...new Set(getFilteredTokens().map(t => CONFIG_CHAINS[t.chain]?.Kode_Chain).filter(Boolean))];
    await Promise.all(activeChainIds.map(async id => {
        _chainGasEstimateUsdt[id] = await fetchChainGasEstimateUsdt(id);
    }));

    const BATCH_SIZE = APP_DEV_CONFIG.scanBatchSize || 8;
    while (!scanAbort) {
        _scanRound++;
        // Clear orderbook cache to free memory each round
        for (const k in _obCache) delete _obCache[k];
        await fetchUsdtRate();
        // Re-fetch tokens setiap ronde: update hapus/tambah & acak ulang jika random
        if (monitorSort === 'rand') _shuffledTokens = null;
        const tokens = getFilteredTokens();
        if (!tokens.length) break;
        // Hanya rebuild monitor cards jika urutan/daftar token berubah
        // (untuk sort 'rand' berubah tiap ronde; untuk 'az'/'za' hanya sekali)
        const tokenKey = tokens.map(t => t.id).join(',');
        if (_lastScanTokenKey !== tokenKey) {
            buildMonitorRows(tokens);
            _lastScanTokenKey = tokenKey;
        }
        for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
            if (scanAbort) break;
            const batch = tokens.slice(i, Math.min(i + BATCH_SIZE, tokens.length));
            const pct = Math.round(Math.min(i + BATCH_SIZE, tokens.length) / tokens.length * 100);
            $('#scanBar').css('width', pct + '%');
            $('#btnScanCount').text(`[ ${Math.min(i + BATCH_SIZE, tokens.length)}/${tokens.length}] KOIN`);
            await Promise.all(batch.map(tok => scanToken(tok)));
            if (!scanAbort) await new Promise(r => setTimeout(r, CFG.interval));
        }
        if (!scanAbort) {
            $('#scanBar').css('width', '0%');
            if (!autoReload) {
                // Sekali scan: selesai langsung stop, hasil tetap tampil
                showToast(`✅ Scan selesai!`);
                playCompleteSound();
                break;
            }
            // Auto-reload: jeda 10 detik lalu mulai ronde berikutnya
            showToast(`✅ Ronde ${_scanRound} selesai — jeda 10 detik...`, 9500);
            playCompleteSound();
            await new Promise(r => setTimeout(r, 10000));
            if (!scanAbort) {
                resetMonitorCells();
                _clearAllSignalChips();
                updateNoSignalNotice();
            }
        }
    }
    // Jika loop keluar karena selesai natural (bukan scanAbort dari user), tandai 'done'
    stopScan(scanAbort ? 'manual' : 'done');
}
function stopScan(reason = 'manual') {
    scanning = false; scanAbort = true;
    document.body.classList.remove('is-scanning');
    _lastScanTokenKey = null; // reset agar scan berikutnya rebuild cards bersih
    $('#btnScanIcon').text('▶'); $('#btnScanLbl').text('START'); $('#btnScan').removeClass('stop');
    updateScanCount();
    $('#scanBadge').removeClass('active');
    $('#scanBar').css('width', '0%');
    // Tampilkan notice sesuai kondisi
    $('#notStartedNotice').hide();
    $('#scanDoneNotice').hide();
    $('#scanStopNotice').hide();
    $('#noSignalNotice').hide();
    if (_scanRound === 0) {
        // Belum pernah scan sama sekali
        $('#notStartedNotice').show();
    } else if (reason === 'done') {
        // Scan selesai natural (semua koin sudah discan)
        $('#scanDoneNotice').show();
        showToast('✅ Scanning selesai');
    } else {
        // Dihentikan manual oleh user
        $('#scanStopNotice').show();
        showToast('■ Scanning dihentikan');
    }
    unlockTabs();
    // Stop Android Foreground Service
    try { if (window.AndroidBridge && AndroidBridge.stopBackgroundService) AndroidBridge.stopBackgroundService(); } catch (e) { }
}
$('#btnScan').on('click', () => {
    if (scanning) { scanAbort = true; stopScan('manual'); }
    else { runScan(); }
});

// ─── Auto-Reload Toggle ───────────────────────
function _applyAutoReload() {
    const btn = document.getElementById('btnAutoReload');
    if (!btn) return;
    if (autoReload) {
        btn.classList.add('active');
        btn.textContent = '🔁';
        btn.title = 'Mode: Auto-Reload (aktif)';
    } else {
        btn.classList.remove('active');
        btn.textContent = '🔄';
        btn.title = 'Mode: Sekali Scan';
    }
}
$('#btnAutoReload').on('click', function () {
    if (scanning) return; // jangan ubah saat scanning berlangsung
    autoReload = !autoReload;
    localStorage.setItem('scanAutoReload', autoReload ? '1' : '0');
    _applyAutoReload();
    showToast(autoReload ? '🔁 Auto Reload Scanner Aktif' : '🔂 Sekali Scan Aktif');
});

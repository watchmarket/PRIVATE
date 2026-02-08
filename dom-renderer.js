/**
 * Monitoring Table Column Spec & Header Utilities
 *
 * Column order: ORDERBOOK (left) → DEX (left, per active DEX) → DETAIL TOKEN → DEX (right, per active DEX) → ORDERBOOK (right)
 * Header and body cells should be driven from the same DEX list so they always stay in sync.
 */

// Resolve currently active DEX list based on app mode and config; safe for global use
function computeActiveDexList() {
  try {
    // Honor locked DEX list during an active scan to keep header/columns stable
    if (typeof window !== 'undefined' && Array.isArray(window.__LOCKED_DEX_LIST) && window.__LOCKED_DEX_LIST.length) {
      return window.__LOCKED_DEX_LIST.map(x => String(x).toLowerCase());
    }
    if (typeof window !== 'undefined' && typeof window.resolveActiveDexList === 'function') return window.resolveActiveDexList();
    const m = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
    if (m.type === 'single') {
      const arr = ((window.CONFIG_CHAINS || {})[m.chain] || {}).DEXS || [];
      return (Array.isArray(arr) ? arr : []).map(x => String(x).toLowerCase());
    }
    return Object.keys(window.CONFIG_DEXS || {}).map(x => String(x).toLowerCase());
  } catch (_) {
    return Object.keys(window.CONFIG_DEXS || {}).map(x => String(x).toLowerCase());
  }
}

// Build a normalized column specification for the monitoring table header
function getMonitoringColumnSpec(dexList) {
  const spec = [];
  const activeDexList = Array.isArray(dexList) ? dexList : [];
  spec.push({ type: 'orderbook-left', label: 'ORDERBOOK', classes: 'uk-text-center uk-text-bolder th-orderbook' });
  activeDexList.forEach(d => spec.push({ type: 'dex', side: 'left', key: String(d).toLowerCase(), label: String(d).toUpperCase(), classes: 'uk-text-center uk-text-small th-dex' }));
  spec.push({ type: 'detail', label: 'DETAIL TOKEN', classes: 'uk-text-center uk-text-bolder th-detail' });
  activeDexList.forEach(d => spec.push({ type: 'dex', side: 'right', key: String(d).toLowerCase(), label: String(d).toUpperCase(), classes: 'uk-text-center uk-text-small th-dex' }));
  spec.push({ type: 'orderbook-right', label: 'ORDERBOOK', classes: 'uk-text-center uk-text-bolder th-orderbook' });
  return spec;
}

// Helper function to calculate total column count based on active DEX list
function getTotalColumnCount(dexList) {
  const activeDexCount = Array.isArray(dexList) ? dexList.length : 0;
  // Formula: 1 (ORDERBOOK left) + activeDexCount (DEX left) + 1 (DETAIL) + activeDexCount (DEX right) + 1 (ORDERBOOK right)
  return 3 + (activeDexCount * 2);
}

// Render the monitoring table header from a spec; exposed globally for reuse (e.g., Start Scan)
function renderMonitoringHeader(dexList) {
  try {
    const thead = document.querySelector('#tabel-monitoring thead');
    if (!thead) return;
    const spec = getMonitoringColumnSpec(dexList || []);
    const cells = spec.map(c => `<th class="${c.classes}">${c.label}</th>`);
    thead.innerHTML = `<tr style="border-bottom: 1px solid black;">${cells.join('')}</tr>`;
  } catch (_) { }
}
try { if (typeof window !== 'undefined') { window.renderMonitoringHeader = renderMonitoringHeader; window.computeActiveDexList = computeActiveDexList; window.getTotalColumnCount = getTotalColumnCount; } } catch (_) { }

/**
 * Render monitoring table rows for the given flat token list.
 * Also refreshes DEX signal cards when rendering main table.
 */
function loadKointoTable(filteredData, tableBodyId = 'dataTableBody') {
  // header helpers moved to top-level: computeActiveDexList(), renderMonitoringHeader()
  // refactor: pecah rendering row menjadi helper kecil agar lebih mudah dibaca/dirawat.
  function buildOrderbookCell(side, data, idPrefix, warnaCex) {
    const arrow = side === 'LEFT' ? `${(data.symbol_in || '').toUpperCase()} → ${(data.symbol_out || '').toUpperCase()}`
      : `${(data.symbol_out || '').toUpperCase()} → ${(data.symbol_in || '').toUpperCase()}`;
    const rawId = `${side}_` +
      `${String(data.cex).toUpperCase()}_` +
      `${String(data.symbol_in || '').toUpperCase()}_` +
      `${String(data.symbol_out || '').toUpperCase()}_` +
      `${String(data.chain).toUpperCase()}`;
    const id = idPrefix + rawId.replace(/[^A-Z0-9_]/g, '');
    return `
            <td class="td-orderbook" style="color: ${warnaCex}; text-align: center; vertical-align: middle;">
                <div class="orderbook-wrap">
                    <div class="orderbook-scroll">
                        <span id="${id}">
                            <b>${arrow}<br>${data.cex}</b> 🔒
                        </span>
                    </div>
                </div>
            </td>`;
  }

  function buildDexSlots(direction, data, dexList, idPrefix, rowIndex) {
    const isLeft = direction === 'LEFT';
    let html = '';
    const lowerDexs = (data.dexs || []).map(d => ({
      dex: String(d.dex || '').toLowerCase(),
      left: d.left, right: d.right
    }));
    dexList.forEach(dexKey => {
      const dexKeyLower = String(dexKey).toLowerCase();
      const found = lowerDexs.find(x => x.dex === dexKeyLower);
      if (found) {
        // Get proper display label from CONFIG_DEXS
        const dexConfig = (typeof window !== 'undefined' && window.CONFIG_DEXS) ? window.CONFIG_DEXS[dexKeyLower] : null;
        const dexName = (dexConfig && dexConfig.label) ? String(dexConfig.label) : String(dexKey).toUpperCase();
        const isMultiDex = dexConfig && dexConfig.isMultiDex;

        // Normalize DEX name using registry to handle aliases (kyberswap->kyber, matcha->0x)
        let canonicalDex = String(found.dex || dexKeyLower);
        try {
          if (typeof window !== 'undefined' && window.DEX && typeof window.DEX.normalize === 'function') {
            canonicalDex = window.DEX.normalize(canonicalDex);
          }
        } catch (_) { }
        const modal = isLeft ? (found.left ?? 0) : (found.right ?? 0);
        // ID generation: include token ID and CEX for uniqueness across multiple rows with same symbol pair
        const sym1 = isLeft ? String(data.symbol_in || '').toUpperCase() : String(data.symbol_out || '').toUpperCase();
        const sym2 = isLeft ? String(data.symbol_out || '').toUpperCase() : String(data.symbol_in || '').toUpperCase();
        const tokenId = String(data.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const baseIdRaw = `${String(data.cex).toUpperCase()}_${canonicalDex.toUpperCase()}_${sym1}_${sym2}_${String(data.chain).toUpperCase()}_${tokenId}`;
        const baseId = baseIdRaw.replace(/[^A-Z0-9_]/g, '');
        const fullCellId = `${idPrefix}${baseId}`;

        // DEBUG: Log DZAP/LIFI detection
        if (dexKeyLower === 'dzap' || dexKeyLower === 'lifi') {
          console.log(`[buildDexSlots] ${dexKeyLower.toUpperCase()} cell rendering:`, {
            dexKeyLower,
            hasDexConfig: !!dexConfig,
            isMultiDex: isMultiDex,
            configIsMultiDex: dexConfig ? dexConfig.isMultiDex : undefined,
            configKeys: dexConfig ? Object.keys(dexConfig) : [],
            fullCellId: fullCellId,
            direction: direction
          });
        }

        // Gunakan tampilan standar agar seragam dengan DEX lain; multi-aggregator tetap ditandai lewat data saat render hasil.
        html += `
                    <td class="td-dex" id="${fullCellId}"
                        data-cex="${String(data.cex).toUpperCase()}"
                        data-dex="${canonicalDex}"
                        data-sym1="${sym1}"
                        data-sym2="${sym2}"
                        data-chain="${String(data.chain).toUpperCase()}"
                        data-row-index="${rowIndex}"
                        style="text-align: center; vertical-align: middle;">
                    <strong class="uk-align-center" style="display:inline-block; margin:0;">${dexName.toUpperCase().substring(0, 6)} [$${modal}]</strong></br>
                        <span class="dex-status uk-text-muted"> 🔒 </span>
                    </td>`;
      } else {
        html += '<td class="td-dex dex-slot-empty">-</td>';
      }
    });
    return html;
  }

  const dexList = computeActiveDexList();
  if (tableBodyId === 'dataTableBody') { RenderCardSignal(); }
  renderMonitoringHeader(dexList);
  const $tableBody = $('#' + tableBodyId);
  const $startButton = $('#startSCAN');
  const hasRows = Array.isArray(filteredData) && filteredData.length > 0;
  const scanningActive = (() => {
    try {
      if (typeof getAppState === 'function') {
        const state = getAppState();
        return state && state.run === 'YES';
      }
    } catch (_) { }
    return false;
  })();

  if ($startButton.length) {
    if (hasRows) {
      $startButton.show();
      if ($startButton.attr('data-disabled-empty') === '1') {
        $startButton.removeAttr('data-disabled-empty');
        if (!scanningActive) {
          $startButton.prop('disabled', false).removeClass('uk-button-disabled');
        }
      }
    } else {
      if (!scanningActive) {
        $startButton.prop('disabled', true).addClass('uk-button-disabled');
      }
      $startButton.attr('data-disabled-empty', '1').hide();
    }
  }

  if (!hasRows) {
    const totalCols = getTotalColumnCount(dexList);
    if ($tableBody.length) $tableBody.html(`<tr><td colspan="${totalCols}" class="uk-text-center">No tokens to display.</td></tr>`);
    return;
  }

  // Manage concurrent renders per table body // REFACTORED
  if (typeof window !== 'undefined') {
    window.__TABLE_RENDER_JOBS = window.__TABLE_RENDER_JOBS || new Map();
  }
  const __jobKey = String(tableBodyId);
  const __prevJob = window.__TABLE_RENDER_JOBS.get(__jobKey);
  // Cancel previous job safely without try/catch // REFACTORED
  if (__prevJob && typeof __prevJob.cancel === 'function') { __prevJob.cancel(); }

  const maxSlots = dexList.length;

  // Incremental chunked rendering to avoid blocking on large datasets
  if ($tableBody.length) $tableBody.html('');
  const total = filteredData.length;
  const CHUNK = 200; // rows per batch
  let cursor = 0;
  let __cancelled = false;
  window.__TABLE_RENDER_JOBS.set(__jobKey, { cancel: () => { __cancelled = true; } });

  function renderChunk() {
    if (__cancelled) return;
    if (!$tableBody.length) return;
    let chunkHtml = '';
    const start = cursor;
    const end = Math.min(start + CHUNK, total);
    for (let i = start; i < end; i++) {
      const data = filteredData[i];
      const index = i;
      // CEX and Chain specific data
      const warnaCex = (CONFIG_CEX[data.cex] && CONFIG_CEX[data.cex].WARNA) || '#000';
      const chainLower = data.chain?.toLowerCase();
      const chainConfig = CONFIG_CHAINS[chainLower] || { URL_Chain: '', WARNA: '#000', Kode_Chain: '', Nama_Chain: '' };
      const warnaChain = chainConfig.WARNA || '#000';

      // Start row
      let rowHtml = '<tr>';

      const idPrefix = tableBodyId + '_';

      // refactor: gunakan helper kecil untuk orderbook kiri
      rowHtml += buildOrderbookCell('LEFT', data, idPrefix, warnaCex);

      // refactor: render slot DEX kiri via helper (pass row index for unique IDs)
      rowHtml += buildDexSlots('LEFT', data, dexList, idPrefix, index);

      // Detail Info
      const urlScIn = chainConfig.URL_Chain ? `${chainConfig.URL_Chain}/token/${data.sc_in}` : '#';
      const urlScOut = chainConfig.URL_Chain ? `${chainConfig.URL_Chain}/token/${data.sc_out}` : '#';
      const urlsCEX = GeturlExchanger(data.cex, data.symbol_in, data.symbol_out);

      const tradeTokenUrl = safeUrl(urlsCEX?.tradeToken, urlScIn);
      const tradePairUrl = safeUrl(urlsCEX?.tradePair, urlScOut);
      const withdrawTokenUrl = safeUrl(urlsCEX?.withdrawTokenUrl || urlsCEX?.withdrawUrl, urlScIn);
      const depositTokenUrl = safeUrl(urlsCEX?.depositTokenUrl || urlsCEX?.depositUrl, urlScIn);
      const withdrawPairUrl = safeUrl(urlsCEX?.withdrawPairUrl || urlsCEX?.withdrawUrl, urlScOut);
      const depositPairUrl = safeUrl(urlsCEX?.depositPairUrl || urlsCEX?.depositUrl, urlScOut);

      const linkToken = createHoverLink(tradeTokenUrl, (data.symbol_in || '').toUpperCase());
      const linkPair = createHoverLink(tradePairUrl, (data.symbol_out || '').toUpperCase());

      const WD_TOKEN = linkifyStatus(data.withdrawToken, 'WD', withdrawTokenUrl);
      const DP_TOKEN = linkifyStatus(data.depositToken, 'DP', depositTokenUrl);
      const WD_PAIR = linkifyStatus(data.withdrawPair, 'WD', withdrawPairUrl);
      const DP_PAIR = linkifyStatus(data.depositPair, 'DP', depositPairUrl);

      // Check if any wallet status is disabled (false) to change background
      // IMPORTANT: This works regardless of "WALLET CEX" checkbox status
      const hasDisabledWallet = (
        data.withdrawToken === false ||
        data.depositToken === false ||
        data.withdrawPair === false ||
        data.depositPair === false
      );
      const detailBgColor = hasDisabledWallet ? '#fce0e0' : ''; // Warning pink/red background if disabled
      const detailBgStyle = hasDisabledWallet ? `font-size:11px; background-color: ${detailBgColor} !important;` : '';

      const chainData = getChainData(data.chain);
      const walletObj = chainData?.CEXCHAIN?.[data.cex] || {};
      const linkStokToken = Object.entries(walletObj)
        .filter(([key, val]) => key.toLowerCase().includes('address') && val && val !== '#')
        .map(([key, val], idx) => createHoverLink(`${chainConfig.URL_Chain}/token/${data.sc_in}?a=${val}`, `#${idx + 1} `))
        .join('');
      const linkStokPair = Object.entries(walletObj)
        .filter(([key, val]) => key.toLowerCase().includes('address') && val && val !== '#')
        .map(([key, val], idx) => createHoverLink(`${chainConfig.URL_Chain}/token/${data.sc_out}?a=${val}`, `#${idx + 1} `))
        .join('');

      const linkSCtoken = createHoverLink(urlScIn, '[SC]', 'uk-text-primary');
      const linkSCpair = createHoverLink(urlScOut, '[SC]', 'uk-text-primary');

      const linkOKDEX = createHoverLink(`https://www.okx.com/web3/dex-swap?inputChain=${chainConfig.Kode_Chain}&inputCurrency=${data.sc_in}&outputChain=${chainConfig.Kode_Chain}&outputCurrency=${data.sc_out}`, '#OKX', 'uk-text-primary');
      const linkDLX = createHoverLink(`https://app.1delta.io/swap?chain=${chainConfig.Nama_Chain}&inputCurrency=${data.sc_in}&outputCurrency=${data.sc_out}`, '#DLT', 'uk-text-secondary');

      const linkUNIDEX = createHoverLink(`https://app.unidex.exchange/?chain=${chainConfig.Nama_Chain}&from=${data.sc_in}&to=${data.sc_out}`, '#UNX', 'uk-text-success');
      const linkDEFIL = createHoverLink(`https://swap.defillama.com/?chain=${chainConfig.Nama_Chain}&from=${data.sc_in}&to=${data.sc_out}`, '#DFL', 'uk-text-danger');
      // DZAP: Solana uses chain ID 7565164
      const dzapChainId = String(data.chain || '').toLowerCase() === 'solana' ? 7565164 : chainConfig.Kode_Chain;
      const linkDZAP = createHoverLink(`https://app.dzap.io/trade?referral=d0d7E9b4&fromChain=${dzapChainId}&fromToken=${data.sc_in}&toChain=${dzapChainId}&toToken=${data.sc_out}`, '#DZP', 'uk-text-warning');
      // Jumper (LIFI): Solana uses chain ID 1151111081099710
      const jumperChainId = String(data.chain || '').toLowerCase() === 'solana' ? 1151111081099710 : chainConfig.Kode_Chain;
      const linkJumper = createHoverLink(`https://jumper.exchange/?fromChain=${jumperChainId}&fromToken=${data.sc_in}&toChain=${jumperChainId}&toToken=${data.sc_out}`, '#JMX', 'uk-text-success');

      // Rango: Multi-chain aggregator (requires blockchain name mapping)
      const rangoChainMap = { 'bsc': 'BSC', 'ethereum': 'ETH', 'polygon': 'POLYGON', 'arbitrum': 'ARBITRUM', 'base': 'BASE', 'optimism': 'OPTIMISM', 'avalanche': 'AVAX_CCHAIN', 'solana': 'SOLANA' };
      const rangoChain = rangoChainMap[String(data.chain || '').toLowerCase()] || String(data.chain || '').toUpperCase();
      // Rango format: fromToken=SYMBOL for native, fromToken=SYMBOL--ADDRESS for tokens
      const rangoFromToken = String(data.sc_in || '').toLowerCase() === chainConfig.NATIVE_TOKEN?.toLowerCase()
        ? (data.symbol_in || '').toUpperCase()
        : `${(data.symbol_in || '').toUpperCase()}--${data.sc_in}`;
      const rangoToToken = String(data.sc_out || '').toLowerCase() === chainConfig.NATIVE_TOKEN?.toLowerCase()
        ? (data.symbol_out || '').toUpperCase()
        : `${(data.symbol_out || '').toUpperCase()}--${data.sc_out}`;
      const linkRango = createHoverLink(`https://app.rango.exchange/bridge?fromBlockchain=${rangoChain}&fromToken=${rangoFromToken}&toBlockchain=${rangoChain}&toToken=${rangoToToken}`, '#RGX', 'uk-text-secondary');

      // Rubic: Multi-chain aggregator (requires chain name mapping)
      const rubicChainMap = { 'bsc': 'BSC', 'ethereum': 'ETH', 'polygon': 'POLYGON', 'arbitrum': 'ARBITRUM', 'base': 'BASE', 'optimism': 'OPTIMISM', 'avalanche': 'AVAX' };
      const rubicChain = rubicChainMap[String(data.chain || '').toLowerCase()] || String(data.chain || '').toUpperCase();

      const linkRBX = createHoverLink(`https://app.rubic.exchange/?fromChain=${rubicChain}&toChain=${rubicChain}&from=${data.sc_in}&to=${data.sc_out}`, '#RBX', 'uk-text-secondary');

      const rowId = `DETAIL_${String(data.cex).toUpperCase()}_${String(data.symbol_in).toUpperCase()}_${String(data.symbol_out).toUpperCase()}_${String(data.chain).toUpperCase()}`.replace(/[^A-Z0-9_]/g, '');
      const chainShort = (data.chain || '').substring(0, 3).toUpperCase();

      rowHtml += `
            <td id="${idPrefix}${rowId}" class="uk-text-center uk-background td-detail" style="text-align: center; border:1px solid black; padding:10px; ${detailBgStyle}">
             [${index + 1}]<span style="color: ${warnaCex}; font-weight:bolder; font-size:medium;"> ${data.cex} </span> on <span style="color: ${warnaChain}; font-weight:bolder; font-size:medium;">${chainShort} </span>
    
            <span class="detail-line">
                <span style="color: ${warnaChain}; font-weight:bolder; font-size:medium;"  >${linkToken} </span> ⇄ <span style="color: ${warnaChain}; font-weight:bolder; font-size:medium;">${linkPair} </span>
                <span id="${idPrefix}EditMulti-${data.id}" data-id="${data.id}"
                data-chain="${String(data.chain).toLowerCase()}"
                      data-cex="${String(data.cex).toUpperCase()}"
                      data-symbol-in="${String(data.symbol_in).toUpperCase()}"
                      data-symbol-out="${String(data.symbol_out).toUpperCase()}"
                       title="UBAH DATA KOIN" uk-icon="icon: settings; ratio: 0.7" class="uk-text-primary uk-text-bolder edit-token-button" style="cursor:pointer"></span>
                
                <span id="${idPrefix}DelMulti-${data.id}"
                      data-id="${data.id}"
                      data-chain="${String(data.chain).toLowerCase()}"
                      data-cex="${String(data.cex).toUpperCase()}"
                      data-symbol-in="${String(data.symbol_in).toUpperCase()}"
                      data-symbol-out="${String(data.symbol_out).toUpperCase()}"
                      title="HAPUS DATA KOIN"
                      uk-icon="icon: trash; ratio: 0.7"
                      class="uk-text-danger uk-text-bolder delete-token-button"
                      style="cursor:pointer;">
                </span>
                </span>
                              
                <span class="detail-line uk-text-bolder">${WD_TOKEN}~ ${DP_TOKEN} | ${WD_PAIR}~ ${DP_PAIR}</span>
                <span class="detail-line"><span class="uk-text-primary uk-text-bolder">${(data.symbol_in || '').toUpperCase()}</span> ${linkSCtoken} : ${linkStokToken}</span>
                <span class="detail-line"><span class="uk-text-primary uk-text-bolder">${(data.symbol_out || '').toUpperCase()}</span> ${linkSCpair} : ${linkStokPair}</span>
                <span class="detail-line"> ${linkDLX} ${linkDEFIL} ${linkOKDEX}  ${linkDZAP}</span>
                <span class="detail-line"> ${linkRango} ${linkJumper} ${linkRBX}</span>
            </td>`;

      // refactor: render slot DEX kanan via helper
      rowHtml += buildDexSlots('RIGHT', data, dexList, idPrefix, index);

      // refactor: gunakan helper kecil untuk orderbook kanan
      rowHtml += buildOrderbookCell('RIGHT', data, idPrefix, warnaCex);

      // End row
      rowHtml += '</tr>';
      chunkHtml += rowHtml;
    }
    if (chunkHtml) $tableBody.append(chunkHtml);
    // Update progress label without try/catch // REFACTORED
    const pct = Math.floor(((end) / Math.max(total, 1)) * 100);
    const label = `Rendering table: ${end}/${total} (${pct}%)`;
    $('#progress').text(label);
    cursor = end;
    if (cursor < total) {
      // Yield back to UI; schedule next batch
      requestAnimationFrame(renderChunk);
    } else {
      $('#startSCAN').prop('disabled', false);
      // clear job when done
      window.__TABLE_RENDER_JOBS.delete(__jobKey);
    }
  }
  renderChunk();
}

/**
 * Ensure monitoring table UI skeleton exists for a given token list before scanning updates run.
 * - Locks to current active/locked DEX list for consistent columns.
 * - Renders header and body rows with placeholder cells and ids that scanner.js expects.
 * - Does not trigger any calculation; only prepares DOM targets.
 */
function prepareMonitoringSkeleton(tokens, tableBodyId = 'dataTableBody') {
  try {
    const dexList = computeActiveDexList();
    renderMonitoringHeader(dexList);
    // Reuse chunked renderer to build rows with the correct id scheme
    loadKointoTable(Array.isArray(tokens) ? tokens : [], tableBodyId);
  } catch (_) { }
}
try { if (typeof window !== 'undefined') { window.prepareMonitoringSkeleton = prepareMonitoringSkeleton; } } catch (_) { }

/**
 * Update HANYA stats summary di header manajemen tanpa re-render tabel.
 * Digunakan saat hapus koin selama scanning untuk menghindari refresh tabel.
 */
function updateTokenStatsOnly() {
  const m = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
  let allTokens = (m.type === 'single')
    ? (getFromLocalStorage(`TOKEN_${String(m.chain).toUpperCase()}`, []) || [])
    : (getFromLocalStorage('TOKEN_MULTICHAIN', []) || []);
  if (!Array.isArray(allTokens)) allTokens = [];

  // Apply active filters (Chain, CEX, Pair, DEX) to determine the base list for stats
  let filteredForStats = [...allTokens];

  if (m.type === 'single') {
    const chainKey = m.chain;
    const filters = getFilterChain(chainKey) || { cex: [], pair: [], dex: [] };
    const hasCex = Array.isArray(filters.cex) && filters.cex.length > 0;
    const hasPair = Array.isArray(filters.pair) && filters.pair.length > 0;
    const hasDex = Array.isArray(filters.dex) && filters.dex.length > 0;
    if (hasCex && hasPair && hasDex) {
      const upperCexFilters = filters.cex.map(c => String(c).toUpperCase());
      const pairDefs = (CONFIG_CHAINS?.[chainKey] || {}).PAIRDEXS || {};
      filteredForStats = filteredForStats
        .filter(t => (t.selectedCexs || []).some(c => upperCexFilters.includes(String(c).toUpperCase())))
        .filter(t => {
          const p = String(t.symbol_out || '').toUpperCase();
          const key = pairDefs[p] ? p : 'NON';
          return filters.pair.includes(key);
        })
        .filter(t => (t.selectedDexs || []).some(d => filters.dex.includes(String(d).toLowerCase())));
    } else {
      filteredForStats = [];
    }
  } else { // multi-chain mode
    const saved = getFromLocalStorage('FILTER_MULTICHAIN', null);
    const filters = getFilterMulti() || { chains: [], cex: [], dex: [] };
    const hasChains = Array.isArray(filters.chains) && filters.chains.length > 0;
    const hasCex = Array.isArray(filters.cex) && filters.cex.length > 0;
    const hasDex = Array.isArray(filters.dex) && filters.dex.length > 0;
    if (!saved) {
      // no saved filter → keep all
    } else if (!(hasChains && hasCex && hasDex)) {
      filteredForStats = [];
    } else {
      const lowerChainFilters = filters.chains.map(c => String(c).toLowerCase());
      const upperCexFilters = filters.cex.map(c => String(c).toUpperCase());
      filteredForStats = filteredForStats
        .filter(t => lowerChainFilters.includes(String(t.chain || '').toLowerCase()))
        .filter(t => (t.selectedCexs || []).some(c => upperCexFilters.includes(String(c).toUpperCase())))
        .filter(t => (t.selectedDexs || []).some(d => filters.dex.includes(String(d).toLowerCase())));
    }
  }

  // Calculate stats based on this filtered list (and token status)
  const activeTokensForStats = filteredForStats.filter(t => t.status);
  let statsHtml = `-`;

  if (m.type === 'single') {
    const chainKey = m.chain;
    const pairDefs = (CONFIG_CHAINS?.[chainKey] || {}).PAIRDEXS || {};
    const countByCex = activeTokensForStats.reduce((acc, t) => {
      (t.selectedCexs || []).forEach(cx => { const u = String(cx).toUpperCase(); acc[u] = (acc[u] || 0) + 1; }); return acc;
    }, {});
    const countByPair = activeTokensForStats.reduce((acc, t) => {
      const p = String(t.symbol_out || '').toUpperCase(); const key = pairDefs[p] ? p : 'NON'; acc[key] = (acc[key] || 0) + 1; return acc;
    }, {});

    // FIX: Tampilkan angka total per CEX dan Pair
    const cexStatsHtml = Object.entries(countByCex).map(([cex, count]) => {
      const col = CONFIG_CEX?.[cex]?.WARNA || '#444';
      return `<span style="color:${col}; margin:2px; font-weight:bolder;">${cex}</span> <span class="uk-text-dark uk-text-bolder">[${count}]</span>`;
    }).join(' ') || '-';
    const pairStatsHtml = Object.entries(countByPair).map(([pair, count]) => (
      `<span class="uk-text-bolder" style="margin:2px;">${pair}</span> <span class="uk-text-dark uk-text-bolder">[${count}]</span>`
    )).join(' ') || '-';

    const totalActive = activeTokensForStats.length;
    statsHtml = `
            <div style="display:flex; flex-direction:column; gap:4px;">
                <b class="uk-text-primary uk-text-bolder">MANAJEMEN KOIN CHAIN ${chainKey.toUpperCase()} (Total: ${totalActive})</b>
                <div class="uk-text-small"><b>CEX:</b> ${cexStatsHtml}</div>
                <div class="uk-text-small"><b>PAIR:</b> ${pairStatsHtml}</div>
            </div>
        `;
  } else { // multi-chain mode
    const countByChain = activeTokensForStats.reduce((acc, t) => { const k = String(t.chain || '').toLowerCase(); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const countByCex = activeTokensForStats.reduce((acc, t) => { (t.selectedCexs || []).forEach(cx => { const u = String(cx).toUpperCase(); acc[u] = (acc[u] || 0) + 1; }); return acc; }, {});

    // FIX: Tampilkan angka total per Chain dan CEX
    const chainStatsHtml = Object.entries(countByChain).map(([chain, count]) => {
      const cfg = CONFIG_CHAINS?.[chain] || {}; const color = cfg.WARNA || '#666';
      const label = (cfg.Nama_Pendek || cfg.SHORT_NAME || chain).toUpperCase();
      return `<span style="color:${color}; margin:2px; font-weight:bolder;">${label}</span> <span class="uk-text-dark uk-text-bolder">[${count}]</span>`;
    }).join(' ') || '-';
    const cexStatsHtml = Object.entries(countByCex).map(([cex, count]) => {
      const col = CONFIG_CEX?.[cex]?.WARNA || '#444';
      return `<span style="color:${col}; margin:2px; font-weight:bolder;">${cex}</span> <span class="uk-text-dark uk-text-bolder">[${count}]</span>`;
    }).join(' ') || '-';

    const totalActive = activeTokensForStats.length;
    statsHtml = `
            <div style="display:flex; flex-direction:column; gap:4px;">
                <b class="uk-text-primary uk-text-bolder">MANAJEMEN KOIN (MULTICHAIN) (Total: ${totalActive})</b>
                <div class="uk-text-small"><b>CHAIN:</b> ${chainStatsHtml}</div>
                <div class="uk-text-small"><b>CEX:</b> ${cexStatsHtml}</div>
            </div>
        `;
  }

  // Update HANYA stats summary, TIDAK render tabel
  const $summary = $('#mgrStatsSummary');
  if ($summary.length) {
    $summary.html(statsHtml);
  }
}

function renderTokenManagementList() {
  const m = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
  let allTokens = (m.type === 'single')
    ? (getFromLocalStorage(`TOKEN_${String(m.chain).toUpperCase()}`, []) || [])
    : (getFromLocalStorage('TOKEN_MULTICHAIN', []) || []);
  if (!Array.isArray(allTokens)) allTokens = [];

  // This variable will hold the list of tokens after applying chain/cex/pair filters.
  let filteredForStats = [...allTokens];

  // Apply active filters (Chain, CEX, Pair, DEX) to determine the base list for stats
  if (m.type === 'single') {
    const chainKey = m.chain;
    const filters = getFilterChain(chainKey) || { cex: [], pair: [], dex: [] };
    const hasCex = Array.isArray(filters.cex) && filters.cex.length > 0;
    const hasPair = Array.isArray(filters.pair) && filters.pair.length > 0;
    const hasDex = Array.isArray(filters.dex) && filters.dex.length > 0;
    if (hasCex && hasPair && hasDex) {
      const upperCexFilters = filters.cex.map(c => String(c).toUpperCase());
      const pairDefs = (CONFIG_CHAINS?.[chainKey] || {}).PAIRDEXS || {};
      filteredForStats = filteredForStats
        .filter(t => (t.selectedCexs || []).some(c => upperCexFilters.includes(String(c).toUpperCase())))
        .filter(t => {
          const p = String(t.symbol_out || '').toUpperCase();
          const key = pairDefs[p] ? p : 'NON';
          return filters.pair.includes(key);
        })
        .filter(t => (t.selectedDexs || []).some(d => filters.dex.includes(String(d).toLowerCase())));
    } else {
      filteredForStats = [];
    }
  } else { // multi-chain mode
    const saved = getFromLocalStorage('FILTER_MULTICHAIN', null);
    const filters = getFilterMulti() || { chains: [], cex: [], dex: [] };
    const hasChains = Array.isArray(filters.chains) && filters.chains.length > 0;
    const hasCex = Array.isArray(filters.cex) && filters.cex.length > 0;
    const hasDex = Array.isArray(filters.dex) && filters.dex.length > 0;
    if (!saved) {
      // no saved filter → keep all
    } else if (!(hasChains && hasCex && hasDex)) {
      filteredForStats = [];
    } else {
      const lowerChainFilters = filters.chains.map(c => String(c).toLowerCase());
      const upperCexFilters = filters.cex.map(c => String(c).toUpperCase());
      filteredForStats = filteredForStats
        .filter(t => lowerChainFilters.includes(String(t.chain || '').toLowerCase()))
        .filter(t => (t.selectedCexs || []).some(c => upperCexFilters.includes(String(c).toUpperCase())))
        .filter(t => (t.selectedDexs || []).some(d => filters.dex.includes(String(d).toLowerCase())));
    }
  }

  // Calculate stats based on this filtered list (and token status)
  const activeTokensForStats = filteredForStats.filter(t => t.status);
  let statsHtml = `-`;

  if (m.type === 'single') {
    const chainKey = m.chain;
    const pairDefs = (CONFIG_CHAINS?.[chainKey] || {}).PAIRDEXS || {};
    const countByCex = activeTokensForStats.reduce((acc, t) => {
      (t.selectedCexs || []).forEach(cx => { const u = String(cx).toUpperCase(); acc[u] = (acc[u] || 0) + 1; }); return acc;
    }, {});
    const countByPair = activeTokensForStats.reduce((acc, t) => {
      const p = String(t.symbol_out || '').toUpperCase(); const key = pairDefs[p] ? p : 'NON'; acc[key] = (acc[key] || 0) + 1; return acc;
    }, {});

    // FIX: Tampilkan angka total per CEX dan Pair
    const cexStatsHtml = Object.entries(countByCex).map(([cex, count]) => {
      const col = CONFIG_CEX?.[cex]?.WARNA || '#444';
      return `<span style="color:${col}; margin:2px; font-weight:bolder;">${cex}</span> <span class="uk-text-dark uk-text-bolder">[${count}]</span>`;
    }).join(' ') || '-';
    const pairStatsHtml = Object.entries(countByPair).map(([pair, count]) => (
      `<span class="uk-text-bolder" style="margin:2px;">${pair}</span> <span class="uk-text-dark uk-text-bolder">[${count}]</span>`
    )).join(' ') || '-';

    const totalActive = activeTokensForStats.length;
    statsHtml = `
            <div style="display:flex; flex-direction:column; gap:4px;">
                <b class="uk-text-primary uk-text-bolder">MANAJEMEN KOIN CHAIN ${chainKey.toUpperCase()} (Total: ${totalActive})</b>
                <div class="uk-text-small"><b>CEX:</b> ${cexStatsHtml}</div>
                <div class="uk-text-small"><b>PAIR:</b> ${pairStatsHtml}</div>
            </div>
        `;
  } else { // multi-chain mode
    const countByChain = activeTokensForStats.reduce((acc, t) => { const k = String(t.chain || '').toLowerCase(); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const countByCex = activeTokensForStats.reduce((acc, t) => { (t.selectedCexs || []).forEach(cx => { const u = String(cx).toUpperCase(); acc[u] = (acc[u] || 0) + 1; }); return acc; }, {});

    // FIX: Tampilkan angka total per Chain dan CEX
    const chainStatsHtml = Object.entries(countByChain).map(([chain, count]) => {
      const cfg = CONFIG_CHAINS?.[chain] || {}; const color = cfg.WARNA || '#666';
      const label = (cfg.Nama_Pendek || cfg.SHORT_NAME || chain).toUpperCase();
      return `<span style="color:${color}; margin:2px; font-weight:bolder;">${label}</span> <span class="uk-text-dark uk-text-bolder">[${count}]</span>`;
    }).join(' ') || '-';
    const cexStatsHtml = Object.entries(countByCex).map(([cex, count]) => {
      const col = CONFIG_CEX?.[cex]?.WARNA || '#444';
      return `<span style="color:${col}; margin:2px; font-weight:bolder;">${cex}</span> <span class="uk-text-dark uk-text-bolder">[${count}]</span>`;
    }).join(' ') || '-';

    const totalActive = activeTokensForStats.length;
    statsHtml = `
            <div style="display:flex; flex-direction:column; gap:4px;">
                <b class="uk-text-primary uk-text-bolder">MANAJEMEN KOIN (MULTICHAIN) (Total: ${totalActive})</b>
                <div class="uk-text-small"><b>CHAIN:</b> ${chainStatsHtml}</div>
                <div class="uk-text-small"><b>CEX:</b> ${cexStatsHtml}</div>
            </div>
        `;

  }

  // Use dedicated search input for management table
  const currentQ = ($('#mgrSearchInput').length ? ($('#mgrSearchInput').val() || '') : '');
  const controls = (() => {
    const base = [
      `<input type="text" id="mgrSearchInput" class="uk-input uk-form-small" placeholder="🔍 Cari koin..." value="${currentQ}" style="width:180px; padding:4px 8px; font-size:12px; margin-right:8px;">`,
      `<button id=\"btnNewToken\" class=\"uk-button uk-button-default uk-button-small\" title=\"Tambah Data Koin\"><span uk-icon=\"plus-circle\"></span> ADD COIN</button>`,
      `<button id=\"btnToggleMgrFilter\" class=\"uk-button uk-button-small uk-button-primary\" title=\"Toggle Filter Setting\"><span uk-icon=\"settings\"></span> FILTER</button>`,
      `<button id=\"btnExportTokens\" data-feature=\"export\" class=\"uk-button uk-button-small uk-button-secondary\" title=\"Export CSV\"><span uk-icon=\"download\"></span> Export</button>`,
      `<button id=\"btnImportTokens\" data-feature=\"import\" class=\"uk-button uk-button-small uk-button-danger\" title=\"Import CSV\"><span uk-icon=\"upload\"></span> Import</button>`,
      `<input type=\"file\" id=\"uploadJSON\" accept=\".csv,text/csv\" style=\"display:none;\" onchange=\"uploadTokenScannerCSV(event)\"> <button type="button" id="btn-cancel-setting" class="uk-button uk-button-muted uk-button-small">
        <span uk-icon="icon:  arrow-left" class="uk-text-primary"></span>  <span class="uk-text-primary">KEMBALI</span>
      </button>  `
    ];
    // Add SYNC button only for single chain mode
    // Note: BULK MODAL button moved to header toolbar (BulkModalScanner icon)
    if (m.type === 'single') {
      base.splice(3, 0, `<button id=\"sync-tokens-btn\" class=\"uk-button uk-button-small uk-button-primary\" title=\"Sinkronisasi Data Koin\"><span uk-icon=\"database\"></span> SYNC</button>`);
    }
    return base.join('\n');
  })();

  // ✅ Build filter chips visual (CEX/Pair/DEX)
  let filterChipsHtml = '';
  let hasActiveFilters = false;
  if (m.type === 'single') {
    const chainKey = m.chain;
    const filters = getFilterChain(chainKey) || { cex: [], pair: [], dex: [] };
    const cexSel = filters.cex || [];
    const pairSel = filters.pair || [];
    const dexSel = (filters.dex || []).map(x => String(x).toLowerCase());
    hasActiveFilters = cexSel.length > 0 && pairSel.length > 0 && dexSel.length > 0;

    const cexChips = cexSel.map(cx => {
      const col = CONFIG_CEX?.[cx]?.WARNA || '#666';
      return `<span class="filter-chip" style="background:${col}; color:#fff; padding:2px 6px; border-radius:3px; font-size:10px; margin:2px;">${String(cx).toUpperCase()}</span>`;
    }).join('');

    const pairChips = pairSel.map(p => {
      return `<span class="filter-chip" style="background:#28a745; color:#fff; padding:2px 6px; border-radius:3px; font-size:10px; margin:2px;">${String(p).toUpperCase()}</span>`;
    }).join('');

    const dexChips = dexSel.map(dx => {
      const col = (CONFIG_DEXS?.[dx]?.warna || CONFIG_DEXS?.[dx]?.WARNA) || '#333';
      return `<span class="filter-chip" style="background:${col}; color:#fff; padding:2px 6px; border-radius:3px; font-size:10px; margin:2px;">${String(dx).toUpperCase()}</span>`;
    }).join('');

    if (cexChips || pairChips || dexChips) {
      filterChipsHtml = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${cexChips ? `<div class="uk-text-small">
            <b class="uk-text-muted" style="min-width:50px; display:inline-block;">CEX:</b>
            <span style="cursor:pointer;" onclick="$('#ScannerFilterModal').trigger('click');" title="Klik untuk edit filter">${cexChips}</span>
          </div>` : ''}
          ${pairChips ? `<div class="uk-text-small">
            <b class="uk-text-muted" style="min-width:50px; display:inline-block;">PAIR:</b>
            <span style="cursor:pointer;" onclick="$('#ScannerFilterModal').trigger('click');" title="Klik untuk edit filter">${pairChips}</span>
          </div>` : ''}
          ${dexChips ? `<div class="uk-text-small">
            <b class="uk-text-muted" style="min-width:50px; display:inline-block;">DEX:</b>
            <span style="cursor:pointer;" onclick="$('#ScannerFilterModal').trigger('click');" title="Klik untuk edit filter">${dexChips}</span>
          </div>` : ''}
        </div>
      `;
    }
  } else {
    const filters = getFilterMulti() || { chains: [], cex: [], dex: [] };
    const chainsSel = (filters.chains || []).map(c => String(c).toLowerCase());
    const cexSel = filters.cex || [];
    const dexSel = (filters.dex || []).map(x => String(x).toLowerCase());
    const saved = getFromLocalStorage('FILTER_MULTICHAIN', null);
    hasActiveFilters = saved !== null && chainsSel.length > 0 && cexSel.length > 0 && dexSel.length > 0;

    const chainChips = chainsSel.map(ch => {
      const cfg = CONFIG_CHAINS?.[ch] || {};
      const col = cfg.WARNA || '#666';
      const label = (cfg.Nama_Pendek || cfg.SHORT_NAME || ch).toUpperCase();
      return `<span class="filter-chip" style="background:${col}; color:#fff; padding:2px 6px; border-radius:3px; font-size:10px; margin:2px;">${label}</span>`;
    }).join('');

    const cexChips = cexSel.map(cx => {
      const col = CONFIG_CEX?.[cx]?.WARNA || '#666';
      return `<span class="filter-chip" style="background:${col}; color:#fff; padding:2px 6px; border-radius:3px; font-size:10px; margin:2px;">${String(cx).toUpperCase()}</span>`;
    }).join('');

    const dexChips = dexSel.map(dx => {
      const col = (CONFIG_DEXS?.[dx]?.warna || CONFIG_DEXS?.[dx]?.WARNA) || '#333';
      return `<span class="filter-chip" style="background:${col}; color:#fff; padding:2px 6px; border-radius:3px; font-size:10px; margin:2px;">${String(dx).toUpperCase()}</span>`;
    }).join('');

    if (chainChips || cexChips || dexChips) {
      filterChipsHtml = `
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${chainChips ? `<div class="uk-text-small">
            <b class="uk-text-muted" style="min-width:60px; display:inline-block;">CHAIN:</b>
            <span style="cursor:pointer;" onclick="$('#ScannerFilterModal').trigger('click');" title="Klik untuk edit filter">${chainChips}</span>
          </div>` : ''}
          ${cexChips ? `<div class="uk-text-small">
            <b class="uk-text-muted" style="min-width:60px; display:inline-block;">CEX:</b>
            <span style="cursor:pointer;" onclick="$('#ScannerFilterModal').trigger('click');" title="Klik untuk edit filter">${cexChips}</span>
          </div>` : ''}
          ${dexChips ? `<div class="uk-text-small">
            <b class="uk-text-muted" style="min-width:60px; display:inline-block;">DEX:</b>
            <span style="cursor:pointer;" onclick="$('#ScannerFilterModal').trigger('click');" title="Klik untuk edit filter">${dexChips}</span>
          </div>` : ''}
        </div>
      `;
    }
  }

  // Render header only once; on subsequent calls, only update stats summary to avoid losing focus on input
  const $hdr = $('#token-management-stats');
  if ($hdr.find('.mgr-header').length === 0) {
    const headerHtml = `<div class="mgr-header">
                        <div class="uk-flex uk-flex-between uk-flex-middle" style="gap:8px; align-items:center;">
                            <!-- Bagian kiri -->
                            <div id="mgrStatsSummary" class="uk-flex uk-flex-middle" style="white-space:nowrap;">
                                <h4 class="uk-margin-remove">${statsHtml}</h4>
                            </div>

                            <!-- Bagian kanan -->
                            <div class="uk-flex uk-flex-middle" style="gap:6px; align-items:center;">
                                ${controls}
                            </div>
                        </div>
                    </div>
                    `;
    $hdr.html(headerHtml);
  } else {
    $('#mgrStatsSummary').html(statsHtml);
  }

  // Now, apply the search filter to the already chain/cex filtered list for the table display
  const q = (currentQ || '').toLowerCase();
  const rows = filteredForStats
    .filter(t => !q || `${t.symbol_in} ${t.symbol_out} ${t.chain}`.toLowerCase().includes(q))
    .map((t, i) => ({ ...t, no: i + 1 }));

  const $tb = $('#mgrTbody').empty();

  // Virtualize manager rows for large datasets
  const ROW_ESTIMATE = 64; // px per row (approx, adjusted for larger text)
  const VIRTUAL_THRESHOLD = 150; // start virtualization earlier for smoother scroll on large lists

  function renderMgrRow(r) {
    const cexHtml = (r.selectedCexs || []).map(cx => {
      const name = String(cx).toUpperCase();
      const col = (CONFIG_CEX?.[name]?.WARNA) || '#000';
      const d = (r.dataCexs || {})[name] || {};

      // REFACTORED: Tampilkan status WD/DP secara terpisah untuk Token dan Pair agar konsisten dengan tabel scanning.
      const renderStatus = (flag, label) => {
        if (flag === true) return `<span class="uk-text-success">${label}</span>`; // WD, DP
        if (flag === false) return `<span class="uk-text-danger">${label === 'WD' ? 'WX' : 'DX'}</span>`; // WX, DX
        return `<span class="uk-text-muted">?${label}</span>`;
      };

      const dpTokLabel = renderStatus(d.depositToken, 'DP');
      const wdTokLabel = renderStatus(d.withdrawToken, 'WD');
      const dpPairLabel = renderStatus(d.depositPair, 'DP');
      const wdPairLabel = renderStatus(d.withdrawPair, 'WD');

      const tokenStatus = `${wdTokLabel}/${dpTokLabel}`;
      const pairStatus = `${wdPairLabel}/${dpPairLabel}`;

      return ` <span class="cex-chip" style="font-weight:bolder;color:${col}" title="Status WD/DP untuk ${name}">${name} [${tokenStatus} | ${pairStatus}]</span>`;
    }).join(' ');

    const chainName = (CONFIG_CHAINS?.[String(r.chain).toLowerCase()]?.Nama_Chain) || r.chain;

    const radioGroup = `
        <div class="status-group">
          <label class="uk-text-success">
            <input class="uk-radio mgrStatus" type="radio" name="status-${r.id}" data-id="${r.id}" value="true" ${r.status ? 'checked' : ''}> ON
          </label>
          <label class="uk-text-danger">
            <input class="uk-radio mgrStatus" type="radio" name="status-${r.id}" data-id="${r.id}" value="false" ${!r.status ? 'checked' : ''}> OFF
          </label>
        </div>
      `;

    const names = (r.selectedDexs || []);
    const dexHtml = names.length ? names.map(name => {
      const k = String(name);
      const l = r?.dataDexs?.[k]?.left ?? r?.dataDexs?.[k.toLowerCase()]?.left ?? 0;
      const rgt = r?.dataDexs?.[k]?.right ?? r?.dataDexs?.[k.toLowerCase()]?.right ?? 0;
      return `<span class="dex-chip"><b>${k.toUpperCase()}</b> [<span class="dex-mini">${l}</span>~<span class="dex-mini">${rgt}</span>]</span>`;
    }).join(' ') : `<span class="dex-chip dex-empty">-</span>`;

    // Resolve display SC for NON/placeholder '0x'
    let scInDisp = r.sc_in || '';
    let desInDisp = r.des_in ?? '';
    let scOutDisp = r.sc_out || '';
    let desOutDisp = r.des_out ?? '';
    // Resolve defaults without try/catch // REFACTORED
    const chainCfg = (window.CONFIG_CHAINS || {})[String(r.chain).toLowerCase()] || {};
    const pairDefs = chainCfg.PAIRDEXS || {};
    const isInvalid = (addr) => !addr || String(addr).toLowerCase() === '0x' || String(addr).length < 6;
    const pairKey = String(r.symbol_out || '').toUpperCase();
    if (isInvalid(scOutDisp)) {
      const def = pairDefs[pairKey] || pairDefs['NON'] || {};
      if (def && def.scAddressPair) {
        scOutDisp = def.scAddressPair;
        desOutDisp = def.desPair ?? desOutDisp;
      }
    }

    const rowHtml = `
        <tr>
          <td class="uk-text-center">${r.no}</td>
          <td>
            <div><span class="uk-text-bold uk-text-success">${(r.symbol_in || '-').toUpperCase()}</span>
              <span class="addr">${scInDisp} [${desInDisp}]</span>
            </div>
            <div><span class="uk-text-bold uk-text-danger">${(r.symbol_out || '-').toUpperCase()}</span>
              <span class="addr">${scOutDisp} [${desOutDisp}]</span>
            </div>
          </td>
          <td>
            <div class="uk-text-center uk-margin-small-bottom">
              ${String(chainName).toUpperCase()} ${radioGroup}
            </div>
          </td>
          <td>${cexHtml || '-'}</td>
          <td>${dexHtml}</td>
          <td class="actions">
            <button class="uk-button uk-button-primary uk-button-xxsmall mgrEdit" data-id="${r.id}">Edit</button>
          </td>
        </tr>
      `;
    return rowHtml;
  }

  if ($('#manager-table').length && rows.length > VIRTUAL_THRESHOLD) {
    // Initialize virtualization
    const $container = $('#manager-table');
    const total = rows.length;
    const visibleCount = Math.max(20, Math.ceil($container.height() / ROW_ESTIMATE) + 10);

    function renderSlice(startIdx) {
      const start = Math.max(0, Math.min(total - 1, startIdx | 0));
      const end = Math.min(total, start + visibleCount);
      const topPad = Math.max(0, start * ROW_ESTIMATE);
      const botPad = Math.max(0, (total - end) * ROW_ESTIMATE);

      let html = '';
      // top spacer
      html += `<tr class="virt-spacer-top"><td colspan="6" style="padding:0; border:none;"><div style="height:${topPad}px"></div></td></tr>`;
      for (let i = start; i < end; i++) html += renderMgrRow(rows[i]);
      // bottom spacer
      html += `<tr class="virt-spacer-bot"><td colspan="6" style="padding:0; border:none;"><div style="height:${botPad}px"></div></td></tr>`;
      $tb.html(html);
    }

    let lastStart = 0;
    renderSlice(0);
    $container.on('scroll.virtual', function () {
      const newStart = Math.floor(($container.scrollTop() || 0) / ROW_ESTIMATE) - 5;
      if (newStart !== lastStart) {
        lastStart = newStart;
        renderSlice(newStart);
      }
    });
  } else {
    // OPTIMASI: Batch DOM rendering untuk performa lebih baik
    let batchHtml = '';
    rows.forEach(r => { batchHtml += renderMgrRow(r); });
    $tb.html(batchHtml);
  }
}

/**
 * Update left/right orderbook columns with parsed CEX volumes and prices.
 */
function updateTableVolCEX(finalResult, cex, tableBodyId = 'dataTableBody') {
  const cexName = String(cex || '').toUpperCase();
  const TokenPair = String(finalResult.token || '').toUpperCase().replace(/[^A-Z0-9_]/g, '') + "_" + String(finalResult.pair || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');

  const idPrefix = tableBodyId + '_';

  const getPriceIDR = priceUSDT => {
    const rateIDR = getFromLocalStorage("PRICE_RATE_USDT", 0);
    return rateIDR
      ? (priceUSDT * rateIDR).toLocaleString("id-ID", { style: "currency", currency: "IDR" })
      : "N/A";
  };

  const renderVolume = (data, className) => `
        <span class='${className}' title="IDR: ${getPriceIDR(data.price)}">
            ${formatPrice(data.price || 0)} : <b>${(data.volume || 0).toFixed(2)}$</b><br/>
        </span>
    `;

  const volumesBuyTokenAll = Array.isArray(finalResult.volumes_buyToken) ? finalResult.volumes_buyToken.slice().sort((a, b) => b.price - a.price) : [];
  const volumesSellPairAll = Array.isArray(finalResult.volumes_sellPair) ? finalResult.volumes_sellPair.slice() : [];
  const volumesBuyPairAll = Array.isArray(finalResult.volumes_buyPair) ? finalResult.volumes_buyPair.slice().sort((a, b) => b.price - a.price) : [];
  const volumesSellTokenAll = Array.isArray(finalResult.volumes_sellToken) ? finalResult.volumes_sellToken.slice().sort((a, b) => b.price - a.price) : [];

  const volumesSellToken = volumesSellTokenAll.slice(0, 4); // Kiri atas: 4
  const volumesSellPair = volumesSellPairAll.slice(0, 2);  // Kiri bawah: 2
  const volumesBuyPair = volumesBuyPairAll.slice(0, 2);
  const volumesBuyToken = volumesBuyTokenAll.slice(0, 4);

  const leftId = idPrefix + ('LEFT_' + cexName + '_' + TokenPair + '_' + String(finalResult.chainName || '').toUpperCase()).replace(/[^A-Z0-9_]/g, '');
  const rightId = idPrefix + ('RIGHT_' + cexName + '_' + TokenPair + '_' + String(finalResult.chainName || '').toUpperCase()).replace(/[^A-Z0-9_]/g, '');
  const leftSelector = '#' + leftId;
  const rightSelector = '#' + rightId;

  $(leftSelector).html(
    volumesSellToken.map(data => renderVolume(data, 'uk-text-success')).join('') +
    `<span class='uk-text-primary uk-text-bolder'>${finalResult.token} -> ${finalResult.pair}</span><br/>` +
    volumesSellPair.map(data => renderVolume(data, 'uk-text-danger')).join('')
  );

  $(rightSelector).html(
    volumesBuyPair.map(data => renderVolume(data, 'uk-text-success')).join('') +
    `<span class='uk-text-primary uk-text-bolder'>${finalResult.pair} -> ${finalResult.token}</span><br/>` +
    volumesBuyToken.map(data => renderVolume(data, 'uk-text-danger')).join('')
  );
}

// Helper: convert HEX or named color to RGBA with given alpha; fall back to greenish
// Use global utils.hexToRgba to avoid duplication

// Helper: resolve chain color hex from config or chainData
function getChainColorHexByName(chainName) { // REFACTORED
  const key = String(chainName || '').toLowerCase();
  const cfg = (typeof getChainData === 'function')
    ? getChainData(chainName)
    : (typeof window !== 'undefined' ? window.CONFIG_CHAINS?.[key] : undefined);
  return cfg?.WARNA || cfg?.COLOR_CHAIN || '#94fa95';
}

// Helper: detect dark mode (basic). Overrideable if app provides getTheme/getDarkMode
function isDarkMode() { // REFACTORED
  // refactor: delegate to shared helper when available, with sensible fallbacks
  try { if (typeof window !== 'undefined' && window.isDarkMode) return !!window.isDarkMode(); } catch (_) { }
  try { if (typeof document !== 'undefined' && document.body && document.body.classList.contains('dark-mode')) return true; } catch (_) { }
  if (typeof getTheme === 'function') return String(getTheme()).toLowerCase().includes('dark');
  if (typeof getDarkMode === 'function') return !!getDarkMode();
  if (typeof window !== 'undefined' && window.matchMedia) return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return false;
}

/**
 * Render computed fees/PNL and swap link into a DEX cell; drive signal panel and Telegram.
 */
function DisplayPNL(data) {
  const {
    profitLoss, cex, Name_in, NameX, totalFee, Modal, dextype,
    priceBuyToken_CEX, priceSellToken_CEX, priceBuyPair_CEX, priceSellPair_CEX,
    FeeSwap, FeeWD, sc_input, sc_output, Name_out, totalValue, totalModal,
    nameChain, codeChain, trx, profitLossPercent, vol,
    idPrefix, baseId, linkDEX, dexUsdRate,
    quoteToUSDT: quoteToUSDT_in,
    cexInfo,
    rates,
    isFallback, fallbackSource,  // REFACTORED: Tambahkan info sumber alternatif
    subResults, isMultiDex  // NEW: untuk SWING/KAMINO/RANGO/RUBIC multi-DEX aggregators
  } = data;

  const elementId = String(idPrefix || '') + String(baseId || '');
  const el = document.getElementById(elementId);
  if (!el) {
    // Debug: log missing cell ID dengan console.error agar lebih terlihat
    // console.error(`❌ [DisplayPNL] Cell NOT FOUND!`, {
    // elementId,
    // cex: cex,
    // dex: dextype,
    // direction: trx,
    // symbolIn: Name_in,
    // symbolOut: Name_out,
    // chain: nameChain,
    // baseId: baseId,
    // idPrefix: idPrefix
    // });
    // List all cells with similar pattern for debugging
    try {
      const allCells = Array.from(document.querySelectorAll('[id*="' + String(cex).toUpperCase() + '"]'));
      const relevantCells = allCells.filter(c => c.id.includes(String(Name_in || '').toUpperCase())).map(c => c.id);
      if (relevantCells.length) {
        // console.log(`💡 Similar cells found:`, relevantCells);
      }
    } catch (_) { }
    return;
  }

  // ✅ FIX BUG #1: Cegah overwrite cell yang sudah di-SKIP
  // Jika cell sudah finalized dengan status SKIP, jangan timpa dengan harga
  try {
    if (el.dataset && el.dataset.final === '1' && el.classList.contains('dex-skip')) {
      console.warn(`⚠️ [DisplayPNL] Cell ${elementId} sudah di-SKIP, tidak akan ditimpa dengan harga`);
      return; // Batalkan render harga
    }
  } catch (_) { }

  // Success log
  // console.log(`✅ [DisplayPNL] Cell FOUND & Updated:`, {
  //   elementId,
  //   dex: dextype,
  //   pnl: profitLoss.toFixed(2),
  //   isFallback,
  //   fallbackSource
  // });
  // REFACTORED: Clear any prior error background and finalize cell
  // ✅ FIX BUG #2: Hapus class dex-error DAN dex-skip
  try {
    el.classList.remove('dex-error');
    el.classList.remove('dex-skip');
  } catch (_) { }
  // REFACTORED: Finalize cell untuk mencegah overwrite oleh error lainnya
  try {
    if (el.dataset) {
      el.dataset.final = '1';
      delete el.dataset.checking;
      delete el.dataset.deadline;
    }
  } catch (_) { }
  // REFACTORED: Clear error status span jika ada
  try {
    const statusSpan = el.querySelector('.dex-status');
    if (statusSpan) {
      // Hapus status error/checking, biarkan DisplayPNL render hasil normal
      statusSpan.innerHTML = '';
      statusSpan.className = 'dex-status';
    }
  } catch (_) { }
  // Capture existing title log (built during scan in scanner.js) untuk ditampilkan di cell
  let __titleLog = null;
  try { __titleLog = (el && el.dataset && el.dataset.titleLog) ? String(el.dataset.titleLog) : null; } catch (_) { }
  // FIX: Kembalikan title lengkap seperti app lama (jangan dihapus)
  try {
    if (__titleLog) {
      el.setAttribute('title', __titleLog);
    }
  } catch (_) { }
  const $mainCell = $(el);

  // Helpers
  const n = v => Number.isFinite(+v) ? +v : 0;
  const fmtUSD = v => (typeof formatPrice === 'function') ? formatPrice(n(v)) : n(v).toFixed(6);
  const fmtIDR = v => (typeof formatIDRfromUSDT === 'function') ? formatIDRfromUSDT(n(v)) : 'N/A';
  const lower = s => String(s || '').toLowerCase();
  const upper = s => String(s || '').toUpperCase();

  // ✅ AUTO VOLUME: Override modal display and CEX prices
  let displayModal = Modal;
  let displayPriceBuyToken = priceBuyToken_CEX;
  let displayPriceSellToken = priceSellToken_CEX;

  // ===== AUTO VOLUME FEATURES: Modal Display =====
  // Two different display modes:
  // 1. AUTO VOL: Show user modal only with warning (no actual modal)
  // 2. AUTO LEVEL: Show user modal AND actual modal with warning

  if (data.autoLevelEnabled && data.autoVolResult && data.maxModal) {
    // ✅ AUTO LEVEL: Show actual simulation values
    const actualModal = n(data.autoVolResult.actualModal || 0);
    const maxModal = n(data.maxModal || 0);
    const isInsufficientVolume = actualModal < maxModal;

    // 🔍 DEBUG: Auto Level modal validation
    if (isInsufficientVolume) {
      console.warn('⚠️  [DOM-RENDERER] Auto Level Insufficient:', {
        maxModal,
        actualModal,
        shortfall: (maxModal - actualModal).toFixed(2)
      });
    }

    // ✅ AUTO LEVEL: Show both user modal and actual modal
    if (maxModal > 0) {
      try {
        const dexNameStrong = $mainCell.find('strong').first();
        if (dexNameStrong.length) {
          // ✅ FIX: Use dexTitle from strategy response if available, otherwise fallback to dextype
          const displayName = data.dexTitle ? String(data.dexTitle).toUpperCase().substring(0, 6) : String(dextype || '').toUpperCase().substring(0, 6);
          const warningIcon = isInsufficientVolume ? '⚠️' : '';

          // ✅ NEW: Show checkmark if sufficient, actual modal + warning if insufficient
          const modalText = isInsufficientVolume
            ? `[$${maxModal.toFixed(0)}] <span style="color:#ff6b35">│ ${actualModal.toFixed(0)}$</span> ⚠️`
            : `[$${maxModal.toFixed(0)}] ✅`;
          dexNameStrong.html(`${displayName} ${modalText}`);
        }
      } catch (e) {
        console.warn('[DOM-RENDERER] Failed to update modal display:', e);
      }

      // ✅ Use actual modal for display (simulation)
      displayModal = actualModal;
    }

    // Override CEX prices with lastLevelPrice for display (AUTO LEVEL only)
    if (data.cexBuyPriceDisplay) {
      console.log('💵 [DOM-RENDERER] Override CEX BUY Price:', {
        original: priceBuyToken_CEX,
        override: data.cexBuyPriceDisplay,
        difference: ((data.cexBuyPriceDisplay - priceBuyToken_CEX) / priceBuyToken_CEX * 100).toFixed(2) + '%'
      });
      displayPriceBuyToken = data.cexBuyPriceDisplay;
    }
    if (data.cexSellPriceDisplay) {
      console.log('💵 [DOM-RENDERER] Override CEX SELL Price:', {
        original: priceSellToken_CEX,
        override: data.cexSellPriceDisplay,
        difference: ((data.cexSellPriceDisplay - priceSellToken_CEX) / priceSellToken_CEX * 100).toFixed(2) + '%'
      });
      displayPriceSellToken = data.cexSellPriceDisplay;
    }
  } else if (data.autoVolEnabled && data.maxModal) {
    // ✅ AUTO VOL: Show user modal only with warning (no actual modal)
    const maxModal = n(data.maxModal || 0);
    const vol = n(data.vol || 0);
    const isInsufficientVolume = vol < maxModal;

    if (maxModal > 0) {
      try {
        const dexNameStrong = $mainCell.find('strong').first();
        if (dexNameStrong.length) {
          // ✅ FIX: Use dexTitle from strategy response if available
          const displayName = data.dexTitle ? String(data.dexTitle).toUpperCase().substring(0, 6) : String(dextype || '').toUpperCase().substring(0, 6);

          // Check if volume sufficient for AUTO VOL
          const warningIcon = isInsufficientVolume ? '⚠️' : '';

          // ✅ AUTO VOL: Show only user modal (no actual modal)
          const modalText = `[$${maxModal.toFixed(0)}] ${warningIcon}`;
          dexNameStrong.html(`${displayName} ${modalText}`);
        }
      } catch (e) {
        console.warn('[DOM-RENDERER] Failed to update modal display:', e);
      }

      // ✅ Use user modal for display (validation only)
      displayModal = maxModal;
    }
  }

  // ===== MULTI-DEX RESULTS (SWING/KAMINO/RANGO/RUBIC) =====
  if (isMultiDex && Array.isArray(subResults) && subResults.length > 0) {
    try {
      // Get DEX color from config
      const dexKey = String(dextype || '').toLowerCase();
      const dexConfig = (typeof window !== 'undefined' && window.CONFIG_DEXS) ? window.CONFIG_DEXS[dexKey] : null;
      const dexColor = dexConfig?.warna || '#ff6b35';
      const dexLabel = dexConfig?.label || String(dextype).toUpperCase();

      // ⚠️ READ maxProviders from config (default: 3, LIFI: 2)
      const maxProviders = dexConfig?.maxProviders || 3;
      console.log(`[Multi-DEX Render] ${dexLabel}: Display max ${maxProviders} providers`);

      // Base calculation values
      const baseModal = n(Modal);
      const baseFeeWD = n(FeeWD);
      const baseFeeTrade = n(0.0014 * baseModal);
      const direction = String(trx || '').toLowerCase();

      // CEX prices for calculation
      const buyPairCEX = n(priceBuyPair_CEX);
      const sellPairCEX = n(priceSellPair_CEX);
      const buyTokenCEX = n(displayPriceBuyToken);
      const sellTokenCEX = n(displayPriceSellToken);

      // Best PNL tracking for highlight
      let bestPnl = -Infinity;

      // Get CEX links for buy/sell
      const cexUrls = (typeof GeturlExchanger === 'function')
        ? GeturlExchanger(upper(cex), String(Name_in || ''), String(Name_out || ''))
        : {};
      const cexTradeLink = direction === 'tokentopair'
        ? (cexUrls?.tradeToken || cexUrls?.tradeUrl || '#')
        : (cexUrls?.tradePair || cexUrls?.tradeUrl || '#');
      const dexLink = linkDEX || '#';

      // Build sub-columns HTML dengan format SAMA seperti single-DEX (KYBER style)
      // Limit jumlah provider sesuai maxProviders dari config
      // Ambil amount_in dari data (Modal / buyTokenCEX untuk tokentopair)
      const amtIn = direction === 'tokentopair'
        ? (buyTokenCEX > 0 ? baseModal / buyTokenCEX : 0)  // Jumlah token yang dibeli
        : baseModal;  // Jumlah pair yang digunakan

      const subColsHtml = subResults.slice(0, maxProviders).map((subRes, idx) => {
        const amtOut = n(subRes.amount_out || subRes.amountOut);
        const feeSwap = n(subRes.FeeSwap || subRes.fee);

        // Calculate DEX rate dan convert ke USDT/Token (sama seperti single-DEX)
        let buyPrice, sellPrice, subTotalValue, buyLink, sellLink, dexUsdtPerToken;

        if (direction === 'tokentopair') {
          // CEX buy token -> DEX sell to pair
          // dexRate = pair out / token in
          const dexRate = amtIn > 0 ? (amtOut / amtIn) : 0;
          // Convert ke USDT/token: jika pair = USDT maka langsung, jika tidak maka * pairPrice
          const isUsdtPair = upper(Name_out) === 'USDT';
          dexUsdtPerToken = isUsdtPair ? dexRate : (dexRate * sellPairCEX);

          buyPrice = buyTokenCEX;           // Harga beli token di CEX (USDT/token)
          sellPrice = dexUsdtPerToken;      // Harga jual di DEX (USDT/token)
          subTotalValue = isUsdtPair ? amtOut : (amtOut * sellPairCEX);
          buyLink = cexTradeLink;
          sellLink = dexLink;
        } else {
          // DEX buy token -> CEX sell token
          // ✅ FIX: baseModal sudah dalam USDT, jadi dexRate = baseModal / amtOut sudah langsung dalam USDT/token
          // Tidak perlu dikali lagi dengan buyPairCEX (itu kesalahan double conversion)
          const dexRate = amtOut > 0 ? (baseModal / amtOut) : 0;
          dexUsdtPerToken = dexRate;  // Already in USDT/token, no conversion needed

          buyPrice = dexUsdtPerToken;       // Harga beli di DEX (USDT/token)
          sellPrice = sellTokenCEX;         // Harga jual token di CEX (USDT/token)
          subTotalValue = amtOut * sellTokenCEX;
          buyLink = dexLink;
          sellLink = cexTradeLink;
        }

        // ✅ FIX: Calculate PNL dengan fee yang benar per arah
        // CEX to DEX (tokentopair): WD fee
        // DEX to CEX (pairtotoken): Transfer fee (gas)
        const subFeeTransfer = direction === 'pairtotoken' ? (feeSwap * 0.5) : 0;
        const subFeeWD = direction === 'tokentopair' ? baseFeeWD : 0;

        const subTotalFee = feeSwap + subFeeWD + subFeeTransfer + baseFeeTrade;
        const subBruto = subTotalValue - baseModal;
        const subPnl = subBruto - subTotalFee;

        // Track best PNL
        if (subPnl > bestPnl) bestPnl = subPnl;

        // Colors & names
        const pnlColor = subPnl >= 0 ? '#28a745' : '#dc3545';
        const providerName = String(subRes.dexTitle || subRes.dexName || subRes.provider || subRes.dexId || '').toUpperCase();
        const displayName = providerName.length > 10 ? providerName.substring(0, 10) : providerName;
        // ⚠️ Dynamic border: hanya tampilkan border jika bukan kolom terakhir
        const borderRight = idx < (maxProviders - 1) ? 'border-right: 1px solid #dee2e6;' : '';

        // Tooltips (format sama seperti single-DEX)
        const tipBuy = direction === 'tokentopair'
          ? `Buy ${Name_in} di ${upper(cex)} | ${fmtUSD(buyPrice)} USDT/${Name_in}`
          : `Buy ${Name_out} di ${dexLabel} | ${fmtUSD(buyPrice)} USDT/${Name_out}`;
        const tipSell = direction === 'tokentopair'
          ? `Sell ${Name_in} ke ${Name_out} di ${dexLabel} | ${fmtUSD(sellPrice)} USDT/${Name_in}`
          : `Sell ${Name_out} di ${upper(cex)} | ${fmtUSD(sellPrice)} USDT/${Name_out}`;

        // Warna PNL sama seperti single-DEX
        const pnlClass = subPnl >= 0 ? 'uk-text-success' : 'uk-text-danger';

        // Highlight hanya sub-kolom yang profit (PNL > 0)
        const isSubProfit = subPnl > 0;
        const subBgStyle = isSubProfit ? 'background-color: rgba(188, 233, 97, 0.9); border-radius: 4px;' : '';

        // ✅ FIX: Display fee yang relevan per direction
        const feeLabel1 = direction === 'tokentopair' ? `🈳WD:${subFeeWD.toFixed(4)}$` : `📤TX:${subFeeTransfer.toFixed(4)}$`;
        const feeTooltip = direction === 'tokentopair'
          ? `Fee WD: $${subFeeWD.toFixed(4)}\nFee SW: $${feeSwap.toFixed(4)}`
          : `Fee SW: $${feeSwap.toFixed(4)}\nFee Transfer (Gas): $${subFeeTransfer.toFixed(4)}`;

        return `
          <div class="multi-sub" style="flex: 1; padding: 1px 2px; ${borderRight} text-align: center; line-height: 1.2; white-space: nowrap; ${subBgStyle}"
               title="${providerName}\nAmount Out: ${amtOut.toFixed(6)}\n${feeTooltip}\nBruto: $${subBruto.toFixed(2)}\nTotal Fee: $${subTotalFee.toFixed(2)}\nPNL: $${subPnl.toFixed(2)}">
            <div style="font-size: 1em; font-weight: bold; color: ${dexColor};">${displayName}</div>
            <a class="uk-text-success" href="${buyLink}" target="_blank" rel="noopener" title="${tipBuy}" style="text-decoration: none; display: block;">⬆ ${fmtUSD(buyPrice)}</a>
            <a class="uk-text-danger" href="${sellLink}" target="_blank" rel="noopener" title="${tipSell}" style="text-decoration: none; display: block;">⬇ ${fmtUSD(sellPrice)}</a>
            <div class="uk-text-primary" style="font-size: 0.95em;">${feeLabel1}</div>
            <div class="uk-text-muted" style="font-size: 0.95em;">💸SW:${feeSwap.toFixed(4)}$</div>
            <div class="uk-text-danger" style="font-size: 0.95em;">[${subBruto.toFixed(2)}~${subTotalFee.toFixed(2)}]</div>
            <div class="${pnlClass}" style="font-weight: bold;">💰PNL:${subPnl.toFixed(2)}</div>
          </div>
        `;
      }).join('');

      // Build cell HTML dengan sub-kolom format lengkap (maxProviders: LIFI=2, DZAP=3)
      const cellHtml = `
        <div style="text-align: center; line-height: 1.2;">
          <div style="font-size: 1.05em; font-weight: bold; color: ${dexColor}; border-bottom: 2px solid ${dexColor}; padding-bottom: 2px; margin-bottom: 3px;">
            ${dexLabel} [$${baseModal.toFixed(0)}] (Top ${maxProviders})
          </div>
          <div style="display: flex; justify-content: space-between; gap: 1px;">
            ${subColsHtml}
          </div>
        </div>
      `;

      // Apply HTML
      el.innerHTML = cellHtml;
      el.dataset.multiDex = 'true';

      // Mark cell as finalized
      try {
        el.dataset.final = '1';
        el.dataset.finalSuccess = '1';
        delete el.dataset.finalError;
        delete el.dataset.deadline;
        delete el.dataset.checking;
      } catch (_) { }

      // Multi-DEX: highlight per sub-kolom, BUKAN seluruh cell
      // Cell hanya diberi border jika ada sinyal, tapi background tetap putih/default
      // ✅ FIXED: Pisahkan kondisi "tampil sinyal" vs "highlight"
      const filterPNLValue = (typeof getPNLFilter === 'function') ? n(getPNLFilter())
        : (typeof SavedSettingData !== 'undefined' ? n(SavedSettingData?.filterPNL) : 0);

      // Sinyal hanya tampil jika PNL > 0 (profit positif setelah fee)
      const hasSignal = bestPnl > 0;

      // ✅ AUTO VOLUME: Check volume sufficiency for multi-DEX
      let volumeSufficient = true;
      if (data.autoVolResult && data.maxModal) {
        const actualModal = data.autoVolResult.actualModal || 0;
        const maxModal = data.maxModal || 0;
        const tolerance = maxModal * 0.001;
        volumeSufficient = (actualModal + tolerance) >= maxModal;

        if (!volumeSufficient) {
          console.warn(`⚠️  [Multi-DEX] Signal SUPPRESSED due to insufficient orderbook volume:`, {
            dex: dextype,
            token: `${Name_in}->${Name_out}`,
            maxModal: maxModal.toFixed(2),
            actualModal: actualModal.toFixed(2),
            shortfall: (maxModal - actualModal).toFixed(2),
            bestPnl: bestPnl.toFixed(2)
          });
        }
      }

      // Highlight hanya jika PNL positif dan di atas threshold
      const shouldHighlight = bestPnl > 0 && (filterPNLValue === 0 || bestPnl > filterPNLValue);

      if (shouldHighlight) {
        // Hanya border, tanpa background (background sudah di sub-kolom)
        el.style.cssText = 'text-align:center;vertical-align:middle;border:2px solid #28a745!important;';
        el.classList.add('dex-cell-highlight');
      } else {
        el.style.cssText = 'text-align:center;vertical-align:middle;';
        el.classList.remove('dex-cell-highlight');
      }

      // *** SIGNAL untuk DZAP/LIFI - kirim sinyal jika ada PNL, dengan warning jika volume tidak cukup ***
      // Always show signal if PNL > 0, pass volume flag for warning indicator
      if (hasSignal && typeof InfoSinyal === 'function') {
        // Hitung total fee untuk best provider
        const bestSubRes = subResults[0]; // Provider terbaik (sudah di-sort)
        const bestFeeSwap = n(bestSubRes?.FeeSwap || bestSubRes?.fee || 0);

        // ✅ FIX: Best provider fee calculation sesuai direction
        const bestFeeTransfer = direction === 'pairtotoken' ? (bestFeeSwap * 0.5) : 0;
        const bestFeeWD = direction === 'tokentopair' ? baseFeeWD : 0;
        const bestTotalFee = bestFeeSwap + bestFeeWD + bestFeeTransfer + baseFeeTrade;

        const bestProfitPercent = baseModal > 0 ? ((bestPnl / baseModal) * 100) : 0;

        // FIX: Jika hanya 1 provider di subResults, kirim sinyal ke card provider tersebut
        // Jika lebih dari 1 provider, kirim ke card aggregator (LIFI/DZAP)
        const signalDexType = (subResults.length === 1 && bestSubRes?.dexTitle)
          ? lower(bestSubRes.dexTitle)  // Kirim ke card DEX spesifik jika hanya 1 provider
          : lower(dextype);              // Kirim ke card aggregator jika multi-provider

        // Log berbeda tergantung volume sufficiency
        if (volumeSufficient) {
          console.log(`✅ [Multi-DEX] Sending signal to: ${signalDexType}, Token: ${Name_in}->${Name_out}, PNL: ${bestPnl.toFixed(2)}`);
        } else {
          console.warn(`⚠️  [Multi-DEX] Sending signal WITH WARNING (insufficient volume) for ${Name_in}->${Name_out} on ${dextype}:`, {
            bestPnl: bestPnl.toFixed(2),
            maxModal: data.maxModal?.toFixed(2),
            actualModal: data.autoVolResult?.actualModal?.toFixed(2)
          });
        }

        // Kirim signal dengan volume flag
        InfoSinyal(
          signalDexType,            // DEX type: provider spesifik atau aggregator
          NameX,                    // Token pair name
          bestPnl,                  // PNL terbaik
          bestTotalFee,             // Total fee
          upper(cex),               // CEX name
          Name_in,                  // Input token
          Name_out,                 // Output token
          bestProfitPercent,        // Profit percentage
          baseModal,                // Modal
          nameChain,                // Chain name
          codeChain,                // Chain code
          trx,                      // Direction
          idPrefix,                 // ID prefix
          baseId,                   // Base ID
          volumeSufficient          // ✅ NEW: Pass volume sufficiency flag
        );
      } else if (hasSignal && !volumeSufficient) {
        // 🔍 DEBUG: Signal suppressed due to insufficient volume
        console.log(`⚠️  [Multi-DEX] Signal NOT shown (insufficient volume) for ${Name_in}->${Name_out} on ${dextype}:`, {
          bestPnl: bestPnl.toFixed(2),
          maxModal: data.maxModal?.toFixed(2),
          actualModal: data.autoVolResult?.actualModal?.toFixed(2)
        });
      } else if (!hasSignal) {
        // 🔍 DEBUG: Log when no signal (PNL ≤ 0 - loss atau break-even)
        console.log(`⚠️ [Multi-DEX] No signal (PNL ≤ 0) for ${Name_in}->${Name_out} on ${dextype}:`, {
          bestPnl: bestPnl.toFixed(2)
        });
      } else if (hasSignal && !shouldHighlight) {
        // ℹ️ DEBUG: Signal shown but not highlighted (PNL positif tapi < filter)
        console.log(`ℹ️ [Multi-DEX] Signal shown WITHOUT highlight for ${Name_in}->${Name_out} on ${dextype}:`, {
          bestPnl: bestPnl.toFixed(2), filterPNLValue, reason: 'PNL positive but below filter'
        });
      }

      return; // Exit early - skip normal single-DEX rendering
    } catch (e) {
      console.error('[DisplayPNL] Error rendering multi-DEX:', e);
    }
  }
  // ============================================================
  // END MULTI-DEX RENDERING
  // ============================================================

  // Link CEX (default for current in/out orientation)
  const urls = (typeof GeturlExchanger === 'function')
    ? GeturlExchanger(upper(cex), String(Name_in || ''), String(Name_out || ''))
    : {};

  const getCexLinks = (direction) => {
    const isT2P = (lower(direction) === 'tokentopair');
    return {
      trade: isT2P ? (urls?.tradeToken || urls?.tradeUrl || '#')
        : (urls?.tradePair || urls?.tradeUrl || '#'),
      withdraw: isT2P ? (urls?.withdrawTokenUrl || urls?.withdrawUrl || '#')
        : (urls?.withdrawPairUrl || urls?.withdrawUrl || '#'),
      deposit: isT2P ? (urls?.depositTokenUrl || urls?.depositUrl || '#')
        : (urls?.depositPairUrl || urls?.depositTokenUrl || '#'),
    };
  };

  // Angka umum
  const pnl = n(profitLoss);
  const feeAll = n(totalFee);
  const bruto = n(totalValue) - n(Modal);

  const filterPNLValue =
    (typeof getPNLFilter === 'function') ? n(getPNLFilter())
      : (typeof SavedSettingData !== 'undefined' ? n(SavedSettingData?.filterPNL) : 0);

  // ✅ FIXED: Pisahkan kondisi "tampil sinyal" vs "highlight"
  // Sinyal hanya tampil jika PNL > 0 (profit positif setelah fee)
  const hasSignal = pnl > 0;

  // Highlight hanya jika PNL positif dan di atas threshold
  const passPNL = pnl > 0 && (filterPNLValue === 0 || pnl > filterPNLValue);

  // ===== AUTO VOLUME FEATURES VALIDATION =====
  // Two separate validation methods:
  // 1. AUTO VOL: Simple volume check (vol >= modal)
  // 2. AUTO LEVEL: Orderbook-based check (actualModal >= maxModal)

  let volumeSufficient = true;  // Default: no warning

  // AUTO VOL: Simple validation (no orderbook required)
  if (data.autoVolEnabled) {
    const volOK = n(vol) >= n(Modal);
    if (!volOK) {
      volumeSufficient = false;
      console.warn('⚠️  [AUTO VOL] Simple volume check failed:', {
        vol: vol.toFixed(2),
        modal: Modal.toFixed(2),
        shortfall: (Modal - vol).toFixed(2)
      });
    }
  }

  // AUTO LEVEL: Orderbook-based validation
  if (data.autoLevelEnabled && data.autoVolResult && data.maxModal) {
    const actualModal = data.autoVolResult.actualModal || 0;
    const maxModal = data.maxModal || 0;
    const tolerance = maxModal * 0.001;

    volumeSufficient = (actualModal + tolerance) >= maxModal;

    if (!volumeSufficient) {
      console.warn('⚠️  [AUTO LEVEL] Orderbook volume insufficient:', {
        maxModal: maxModal.toFixed(2),
        actualModal: actualModal.toFixed(2),
        shortfall: (maxModal - actualModal).toFixed(2)
      });
    }
  }

  // Legacy checkVol for highlight logic (backward compatibility)
  const volCheckFeatureEnabled = (window.CONFIG_APP?.APP?.VOL_CHECK !== false);
  const checkVol = volCheckFeatureEnabled && (typeof $ === 'function') ? $('#checkVOL').is(':checked') : false;
  const volOK = n(vol) >= n(Modal);
  const isHighlight = (!checkVol && passPNL) || (checkVol && passPNL && volOK);

  // Normalisasi harga DEX → USDT/TOKEN
  const quote = upper(Name_out);
  const isUSDTQuote = quote === 'USDT';

  let q2u = 0;
  if (isUSDTQuote) q2u = 1;
  else if (Number.isFinite(+quoteToUSDT_in)) q2u = n(quoteToUSDT_in);
  else if (cexInfo && cexInfo[`${quote}ToUSDT`]) q2u = n(cexInfo[`${quote}ToUSDT`].buy || cexInfo[`${quote}ToUSDT`].sell || 0);
  else if (rates && rates[quote]) q2u = n(rates[quote].toUSDT);

  const dexRateRaw = n(dexUsdRate);

  let candA = dexRateRaw;
  let candB = dexRateRaw;
  if (!isUSDTQuote) {
    candA = (q2u > 0) ? (dexRateRaw * q2u) : dexRateRaw;           // QUOTE/TOKEN → USDT/TOKEN
    candB = (q2u > 0 && dexRateRaw > 0) ? (q2u / dexRateRaw) : 0;  // TOKEN/QUOTE → USDT/TOKEN
  }

  const refCexBuy = n(displayPriceBuyToken);
  const refCexSell = n(displayPriceSellToken);

  // 🔍 DEBUG: Log CEX prices used for calculation vs display
  console.log('🎯 [DisplayPNL] Price Analysis:', {
    dex: dextype,
    direction: trx,
    priceBuyToken_CEX_original: priceBuyToken_CEX,
    priceSellToken_CEX_original: priceSellToken_CEX,
    displayPriceBuyToken: displayPriceBuyToken,
    displayPriceSellToken: displayPriceSellToken,
    autoVolActive: !!(data.autoVolResult && data.maxModal)
  });

  let dexUsdtPerToken;
  if (lower(trx) === 'tokentopair') {
    if (refCexBuy > 0 && candA > 0 && candB > 0) {
      dexUsdtPerToken = (Math.abs(candA - refCexBuy) <= Math.abs(candB - refCexBuy)) ? candA : candB;
    } else dexUsdtPerToken = candA || candB || dexRateRaw;
  } else {
    if (refCexSell > 0 && candA > 0 && candB > 0) {
      dexUsdtPerToken = (Math.abs(candA - refCexSell) <= Math.abs(candB - refCexSell)) ? candA : candB;
    } else dexUsdtPerToken = candA || candB || dexRateRaw;
  }

  // Tampilkan harga + link
  const CEX = upper(cex);
  const DEX = upper(dextype);
  const direction = lower(trx);
  const cexLinks = getCexLinks(direction);

  let buyPrice, sellPrice, buyLink, sellLink, tipBuy, tipSell;

  // REFACTORED: Tambahkan info sumber alternatif ke label DEX
  const dexLabel = isFallback && fallbackSource ? `${DEX} via ${fallbackSource}` : DEX;

  if (direction === 'tokentopair') {
    buyPrice = refCexBuy;
    sellPrice = n(dexUsdtPerToken);
    buyLink = cexLinks.trade;      // TOKEN
    sellLink = linkDEX || '#';

    tipBuy = `USDT -> ${Name_in} | ${CEX} | ${fmtIDR(buyPrice)} | ${fmtUSD(buyPrice)} USDT/${Name_in}`;
    const inv = sellPrice > 0 ? (1 / sellPrice) : 0;
    tipSell = `${Name_in} -> ${Name_out} | ${dexLabel} | ${fmtIDR(sellPrice)} | ${inv > 0 && isFinite(inv) ? inv.toFixed(6) : 'N/A'} ${Name_in}/${Name_out}`;
  } else {
    buyPrice = n(dexUsdtPerToken);
    sellPrice = refCexSell;
    buyLink = linkDEX || '#';
    sellLink = cexLinks.trade;      // PAIR

    tipBuy = `${Name_in} -> ${Name_out} | ${dexLabel} | ${fmtIDR(buyPrice)} | ${fmtUSD(buyPrice)} USDT/${Name_in}`;
    const inv = sellPrice > 0 ? (1 / sellPrice) : 0;
    tipSell = `${Name_out} -> USDT | ${CEX} | ${fmtIDR(sellPrice)} | ${inv > 0 && isFinite(inv) ? inv.toFixed(6) : 'N/A'} ${Name_in}/${Name_out}`;
  }

  // 🔍 DEBUG: Final buy/sell prices for display
  console.log('💰 [DisplayPNL] Final Display Prices:', {
    dex: dextype,
    direction,
    Name_in,
    Name_out,
    buyPrice,
    sellPrice,
    dexUsdtPerToken,
    profitLoss: pnl,
    totalValue: n(totalValue),
    totalModal: n(totalModal),
    anomaly: direction === 'pairtotoken' && sellPrice < buyPrice ? '⚠️ SELL < BUY (Should be LOSS!)' : direction === 'tokentopair' && buyPrice > sellPrice ? '⚠️ BUY > SELL (Should be LOSS!)' : 'OK'
  });

  // Re-apply detailed title log only on price links when result is complete (not for errors)
  if (__titleLog && __titleLog.length > 0) {
    tipBuy = __titleLog;
    tipSell = __titleLog;
  }

  // Console summary: ringkasan kalkulasi scanning (toggled via #toggleScanLog)
  try {
    if (!(typeof window !== 'undefined' && window.SCAN_LOG_ENABLED === true)) {
      throw new Error('scan log disabled');
    }
    // Resolve WD/DP status dari list token aktif (jika ada)
    // Tambahkan status detail untuk Token & Pair agar jelas konteks ON/OFF mengacu ke apa.
    let wdFlag, dpFlag; let wdFeeToken = null;
    let wdTokenFlag, wdPairFlag, dpTokenFlag, dpPairFlag; // detail per entitas
    try {
      const list = (Array.isArray(window.singleChainTokensCurrent) && window.singleChainTokensCurrent.length)
        ? window.singleChainTokensCurrent
        : (Array.isArray(window.currentListOrderMulti) ? window.currentListOrderMulti : []);
      // Flattened data disimpan sebagai (symbol_in = TOKEN, symbol_out = PAIR).
      // Saat arah Pair→Token, Name_in=PAIR dan Name_out=TOKEN → perlu dibalik untuk pencarian.
      const keyIn = (direction === 'tokentopair') ? upper(Name_in) : upper(Name_out);  // TOKEN (selalu TOKEN)
      const keyOut = (direction === 'tokentopair') ? upper(Name_out) : upper(Name_in);   // PAIR  (selalu PAIR)
      const hit = (list || []).find(t => String(t.cex).toUpperCase() === CEX
        && String(t.symbol_in).toUpperCase() === keyIn
        && String(t.symbol_out).toUpperCase() === keyOut
        && String(t.chain).toLowerCase() === String(nameChain).toLowerCase());
      if (hit) {
        // WD selalu refer ke TOKEN; DP juga selalu refer ke TOKEN (konsisten)
        wdFlag = hit.withdrawToken;
        wdFeeToken = Number(hit.feeWDToken || 0);
        dpFlag = hit.depositToken;
        // Simpan status detail
        wdTokenFlag = hit.withdrawToken;
        wdPairFlag = hit.withdrawPair;
        dpTokenFlag = hit.depositToken;
        dpPairFlag = hit.depositPair;
      }
    } catch (_) { }

    const f = (v) => (v === true ? 'ON' : (v === false ? 'OFF' : '?'));
    const sep = '======================================';
    const coinLine = (direction === 'tokentopair')
      ? `${upper(Name_in)} => ${upper(Name_out)} on ${String(nameChain).toUpperCase()}`
      : `${upper(Name_out)} => ${upper(Name_in)} on ${String(nameChain).toUpperCase()}`;
    const procLine = (direction === 'tokentopair') ? `${CEX} => ${DEX}` : `${DEX} => ${CEX}`;
    // Simbol tetap (token/pair) terlepas dari arah
    const tokenSym = (direction === 'tokentopair') ? upper(Name_in) : upper(Name_out);
    const pairSym = (direction === 'tokentopair') ? upper(Name_out) : upper(Name_in);

    // Console logging (Time/ID Cell/Proses/PNL dsb.) dipindahkan ke layer scanner untuk
    // menambahkan informasi status DEX dan sumber (VIA LIFI/SWOOP/DEX). Bagian ini
    // dihapus agar tidak terjadi duplikasi log dan agar informasi tetap konsisten.
  } catch (_) { }

  // Fee & info (WD/DP sesuai arah) — FEE SWAP PISAH BARIS
  // WD link mengikuti arah (Token→Pair menggunakan withdrawTokenUrl) → sudah sesuai kebutuhan FARM(WD)
  const wdUrl = cexLinks.withdraw;
  // DP harus selalu berbasis TOKEN yang disetor ke CEX.
  // Untuk Token→Pair, token = Name_in; untuk Pair→Token, token = Name_out.
  const tokenForDeposit = (direction === 'tokentopair') ? upper(Name_in) : upper(Name_out);
  // Ambil ulang link CEX khusus untuk token yang akan didepositkan agar DP selalu milik TOKEN (contoh: FARM)
  const urlsForTokenDeposit = (typeof GeturlExchanger === 'function')
    ? GeturlExchanger(upper(cex), tokenForDeposit, (direction === 'tokentopair') ? upper(Name_out) : upper(Name_in))
    : {};
  const dpUrlToken = (urlsForTokenDeposit && (urlsForTokenDeposit.depositTokenUrl || urlsForTokenDeposit.depositUrl))
    ? (urlsForTokenDeposit.depositTokenUrl || urlsForTokenDeposit.depositUrl)
    : (urls && (urls.depositTokenUrl || urls.depositUrl))
      ? (urls.depositTokenUrl || urls.depositUrl)
      : cexLinks.deposit;
  // Tentukan status WD/DP dari token aktif (lihat data tersimpan)
  let wdFlag, dpFlag;
  try {
    const list = (Array.isArray(window.singleChainTokensCurrent) && window.singleChainTokensCurrent.length)
      ? window.singleChainTokensCurrent
      : (Array.isArray(window.currentListOrderMulti) ? window.currentListOrderMulti : []);
    const keyIn2 = (direction === 'tokentopair') ? upper(Name_in) : upper(Name_out);  // TOKEN
    const keyOut2 = (direction === 'tokentopair') ? upper(Name_out) : upper(Name_in);   // PAIR
    const hit = (list || []).find(t => String(t.cex).toUpperCase() === upper(cex)
      && String(t.symbol_in).toUpperCase() === keyIn2
      && String(t.symbol_out).toUpperCase() === keyOut2
      && String(t.chain).toLowerCase() === String(nameChain).toLowerCase());
    if (hit) {
      wdFlag = hit.withdrawToken; // WD selalu berdasarkan TOKEN
      // DP selalu berdasarkan TOKEN (samakan warna/teks untuk semua arah)
      dpFlag = hit.depositToken;
    }
  } catch (_) { }
  const wdText = (wdFlag === false) ? '🈳 WX' : '🈳 WD';
  // Nama token untuk label DP Token (arah-sensitive: TokenToPair → Name_in, PairToToken → Name_out)
  const dpTokenName = (direction === 'tokentopair') ? upper(Name_in) : upper(Name_out);
  const dpText = (dpFlag === false) ? `🈷️ DX[${dpTokenName}]` : `🈷️ DP[${dpTokenName}]`;
  const wdCls = (wdFlag === false) ? 'uk-text-danger' : 'uk-text-primary';
  const dpCls = (dpFlag === false) ? 'uk-text-danger' : 'uk-text-primary';
  const wdLine = `<a class="${wdCls}" href="${wdUrl}" target="_blank" rel="noopener" title="FEE WITHDRAW">${wdText}: ${n(FeeWD).toFixed(4)}$</a>`;
  const dpLine = `<a class="${dpCls}" href="${dpUrlToken}" target="_blank" rel="noopener">${dpText}</a>`;
  const swapLine = `<span class="monitor-line uk-text-dark" title="FEE SWAP">💸 SW: ${n(FeeSwap).toFixed(4)}$</span>`;

  const feeLine = (direction === 'tokentopair') ? wdLine : dpLine;

  // Highlight + UIkit
  const netClass = (pnl >= 0.02) ? 'uk-text-success' : 'uk-text-danger';
  const bracket = `[${bruto.toFixed(2)} ~ ${feeAll.toFixed(2)}]`;

  // ✅ FIXED: Pisahkan profit indication (background) dari highlight (border)
  // Background hijau muncul kapanpun PNL > 0 (profit)
  // Border hitam tebal muncul jika profit melewati filter threshold
  const hasProfit = pnl > 0;  // Background color indicator
  const shouldHighlight = isHighlight;  // Border highlight (filter + volume check)
  const chainColorHexHL = getChainColorHexByName(nameChain);
  const modeNowHL = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
  const isMultiModeHL = String(modeNowHL.type).toLowerCase() !== 'single';
  // Multichain: gunakan hijau muda agar konsisten
  const multiLightGreen = 'rgba(188, 233, 97, 0.9)';
  const hlBg = isMultiModeHL
    ? multiLightGreen
    : (isDarkMode() ? '#87db0bff' : '#ddf0b7ff');

  // Apply background color when there's ANY profit (PNL > 0)
  // Apply highlight class and border when profit exceeds filter threshold
  if (shouldHighlight) {
    try { $mainCell.addClass('dex-cell-highlight'); } catch (_) { }
  } else { try { $mainCell.removeClass('dex-cell-highlight'); } catch (_) { } }

  // Background color shows when PNL > 0, border shows when passing filter
  if (hasProfit) {
    const borderStyle = shouldHighlight ? 'border:2px solid black !important;' : '';
    $mainCell.attr('style', `background-color:${hlBg}!important;font-weight:bolder!important;vertical-align:middle!important;text-align:center!important;${borderStyle}`);
  } else {
    $mainCell.attr('style', 'text-align:center;vertical-align:middle;');
  }

  // Baris utama (SWAP dipisah baris sendiri)
  const lineBuy = `<a class="monitor-line uk-text-success dex-price-link" href="${buyLink}"  target="_blank" rel="noopener" title="${tipBuy}">⬆ ${fmtUSD(buyPrice)}</a>`;
  const lineSell = `<a class="monitor-line uk-text-danger  dex-price-link" href="${sellLink}" target="_blank" rel="noopener" title="${tipSell}">⬇ ${fmtUSD(sellPrice)}</a>`;
  const feeBlock1 = `<span class="monitor-line">${feeLine}</span>`;
  const feeBlock2 = `<span class="monitor-line">${swapLine}</span>`; // ← baris terpisah
  const lineBrut = `<span class="monitor-line uk-text-danger" title="BRUTO ~ TOTAL FEE">${bracket}</span>`;
  const linePNL = `<span class="monitor-line ${netClass}" title="PROFIT / LOSS">💰 PNL: ${pnl.toFixed(2)}</span>`;

  const resultHtml = [lineBuy, lineSell, feeBlock1, '', feeBlock2, lineBrut, linePNL].filter(Boolean).join(' ');

  // ✅ FIXED: Sinyal hanya dikirim jika PNL > 0, highlight sesuai filter
  // passSignal: untuk highlight (PNL > filter dan volume OK jika dicentang)
  const passSignal = (!checkVol && passPNL) || (checkVol && passPNL && volOK);

  // ✅ AUTO VOLUME: Always show signal if PNL > 0, but pass volume flag for warning indicator
  // Kirim sinyal jika PNL > 0 (profit positif), dengan flag volume insufficiency
  if (hasSignal && typeof InfoSinyal === 'function') {
    // Log berbeda tergantung volume sufficiency
    if (volumeSufficient) {
      console.log(`✅ [DisplayPNL] Sending signal for ${upper(dextype)}: ${upper(Name_in)}->${upper(Name_out)}, PNL: ${pnl.toFixed(2)}$`);
    } else {
      console.warn(`⚠️  [DisplayPNL] Sending signal WITH WARNING (insufficient volume) for ${upper(Name_in)}->${upper(Name_out)} on ${upper(dextype)}:`, {
        pnl: pnl.toFixed(2),
        maxModal: data.maxModal?.toFixed(2),
        actualModal: data.autoVolResult?.actualModal?.toFixed(2)
      });
    }

    // Pass volumeSufficient flag to InfoSinyal for warning indicator
    InfoSinyal(
      lower(dextype), NameX, pnl, feeAll, upper(cex),
      Name_in, Name_out, profitLossPercent, Modal,
      nameChain, codeChain, trx, idPrefix, baseId,
      volumeSufficient  // ✅ NEW: Pass volume sufficiency flag
    );
  } else if (!hasSignal) {
    // 🔍 DEBUG: No signal (PNL ≤ 0 - loss atau break-even)
    console.log(`⚠️ [DisplayPNL] No signal (PNL ≤ 0) for ${upper(Name_in)}->${upper(Name_out)} on ${upper(dextype)}:`, {
      pnl: pnl.toFixed(2)
    });
  } else if (!InfoSinyal) {
    console.error(`❌ [DisplayPNL] InfoSinyal function NOT FOUND for ${upper(dextype)}: ${upper(Name_in)}->${upper(Name_out)}`);
  }

  // ℹ️ DEBUG: Log highlight status
  if (hasSignal && !passSignal) {
    console.log(`ℹ️ [DisplayPNL] Signal shown WITHOUT highlight for ${upper(Name_in)}->${upper(Name_out)} on ${upper(dextype)}:`, {
      pnl: pnl.toFixed(2), filterPNLValue, checkVol, volOK, vol: n(vol), Modal: n(Modal),
      reason: !passPNL ? 'PNL below filter' : 'Volume check failed'
    });
  }

  // --- Ambil status WD/DP detail untuk TOKEN & PAIR (sekali saja)
  let wdTokenFlag, wdPairFlag, dpTokenFlag, dpPairFlag;
  try {
    const list = (Array.isArray(window.singleChainTokensCurrent) && window.singleChainTokensCurrent.length)
      ? window.singleChainTokensCurrent
      : (Array.isArray(window.currentListOrderMulti) ? window.currentListOrderMulti : []);
    // TOKEN selalu = Name_in saat tokentopair, dan = Name_out saat pairtotoken
    const keyToken = (direction === 'tokentopair') ? upper(Name_in) : upper(Name_out);
    const keyPair = (direction === 'tokentopair') ? upper(Name_out) : upper(Name_in);
    const hit = (list || []).find(t => String(t.cex).toUpperCase() === upper(cex)
      && String(t.symbol_in).toUpperCase() === keyToken
      && String(t.symbol_out).toUpperCase() === keyPair
      && String(t.chain).toLowerCase() === String(nameChain).toLowerCase());
    if (hit) {
      wdTokenFlag = hit.withdrawToken;
      wdPairFlag = hit.withdrawPair;
      dpTokenFlag = hit.depositToken;
      dpPairFlag = hit.depositPair;
    }
  } catch (_) { }

  // Telegram alert mengikuti kondisi yang sama agar konsisten // REFACTORED
  if (typeof MultisendMessage === 'function' && passSignal) {
    const directionMsg = (direction === 'tokentopair') ? 'cex_to_dex' : 'dex_to_cex';
    const tokenData = {
      chain: nameChain,
      symbol: Name_in,
      pairSymbol: Name_out,
      contractAddress: sc_input,
      pairContractAddress: sc_output
    };
    const nickname = (typeof getFromLocalStorage === 'function')
      ? (getFromLocalStorage('SETTING_SCANNER', {})?.nickname || '')
      : (typeof SavedSettingData !== 'undefined' ? (SavedSettingData?.nickname || '') : '');

    // Kirim status yang sama agar Telegram = Kolom
    const statusOverrides = {
      depositToken: dpTokenFlag,
      withdrawToken: wdTokenFlag,
      depositPair: dpPairFlag,
      withdrawPair: wdPairFlag,
    };

    MultisendMessage(
      upper(cex), dextype, tokenData, Modal, pnl,
      n(buyPrice), n(sellPrice), n(FeeSwap), n(FeeWD), feeAll, nickname, directionMsg,
      statusOverrides // ← tambahan baru
    );
  }


  // Render akhir
  const dexNameAndModal = ($mainCell.find('strong').first().prop('outerHTML')) || '';
  const modeNow = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
  const resultWrapClass = (lower(modeNow.type) === 'single') ? 'uk-text-dark' : 'uk-text-primary';
  const boldStyle = shouldHighlight ? 'font-weight:bolder;' : '';

  $mainCell.html(`${dexNameAndModal ? dexNameAndModal + '<br>' : ''}<span class="${resultWrapClass}" style="${boldStyle}">${resultHtml}</span>`);
  try {
    el.dataset.final = '1';
    el.dataset.finalSuccess = '1';  // Mark as successful (cannot be overridden)
    delete el.dataset.finalError;    // Clear any prior error flag
    // clear any pending checking metadata so sweepers/tickers stop
    try { delete el.dataset.deadline; } catch (_) { }
    try { delete el.dataset.checking; } catch (_) { }
  } catch (_) { }
}

function InfoSinyal(DEXPLUS, TokenPair, PNL, totalFee, cex, NameToken, NamePair, profitLossPercent, modal, nameChain, codeChain, trx, idPrefix, domIdOverride, volumeSufficient = true) {
  const chainData = getChainData(nameChain);
  const chainShort = String(chainData?.SHORT_NAME || chainData?.Nama_Chain || nameChain).toUpperCase();
  const warnaChain = String(chainData?.COLOR_CHAIN || chainData?.WARNA || '#94fa95');
  const filterPNLValue = (typeof getPNLFilter === 'function') ? getPNLFilter() : parseFloat(SavedSettingData.filterPNL);
  const warnaCEX = getWarnaCEX(cex);
  const warnaTeksArah = (trx === "TokentoPair") ? "uk-text-success" : "uk-text-danger";
  const baseIdComputed = (`${String(cex || '').toUpperCase()}_${String(DEXPLUS || '').toUpperCase()}_${String(NameToken || '').toUpperCase()}_${String(NamePair || '').toUpperCase()}_${String(nameChain || '').toUpperCase()}`)
    .replace(/[^A-Z0-9_]/g, '');
  const baseId = domIdOverride ? String(domIdOverride) : baseIdComputed;
  const modeNowSig = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
  const isMultiSig = String(modeNowSig.type).toLowerCase() !== 'single';
  const multiLightGreen = '#a9fcac';
  // Multichain: pakai hijau muda; per‑chain: gunakan tema normal (kuning terang untuk dark, rgba warna chain untuk light)
  const signalBg = isMultiSig
    ? multiLightGreen
    : (isDarkMode() ? '#a9fcac' : '#ddf0b7ff');
  const highlightStyle = (Number(PNL) > filterPNLValue)
    ? `background-color:${signalBg}; font-weight:bolder;`
    : "";

  const modeNow2 = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
  const isSingleMode2 = String(modeNow2.type).toLowerCase() === 'single';
  const chainPart = isSingleMode2 ? '' : ` <span style="color:${warnaChain};">[${chainShort}]</span>`;

  // Generate unique ID untuk signal item (untuk mencegah duplicate)
  const signalItemId = `signal_${idPrefix}${baseId}`;

  // ✅ NEW: Add warning indicator if volume insufficient
  const volumeWarning = !volumeSufficient ? ' ⚠️' : '';

  // Item sinyal: kompak + border kanan (separator)
  // ✅ FIX: Round modal value properly (no floating point errors)
  const modalRounded = Number(modal) >= 100 ? Math.round(Number(modal)) : Number(modal).toFixed(2);
  const sLink = `
    <div id="${signalItemId}" class="signal-item uk-flex uk-flex-middle uk-flex-nowrap uk-text-small uk-padding-remove-vertical" >
      <a href="#${idPrefix}${baseId}" class="uk-link-reset " style="text-decoration:none; font-size:12px; margin-top:2px; margin-left:4px;">
        <span class="${Number(PNL) > filterPNLValue ? 'signal-highlight' : ''}" style="color:${warnaCEX}; ${highlightStyle}; display:inline-block; font-weight:bolder;">
          🔸 ${String(cex).slice(0, 3).toUpperCase()}X${volumeWarning}
          <span class="uk-text-muted">:${modalRounded}</span>
          <span class="${warnaTeksArah}"> ${NameToken}->${NamePair}</span>${chainPart}:
          <span class="uk-text-muted">${Number(PNL).toFixed(2)}$</span>
        </span>
      </a>
    </div>`;

  // ✅ FIX: Alias mapping untuk menangani variasi nama DEX (0x <-> matcha)
  const dexAliasMap = {
    '0x': 'matcha',
    'matcha': 'matcha'
  };

  const normalizedDex = String(DEXPLUS).toLowerCase();
  const dexLowerKey = dexAliasMap[normalizedDex] || normalizedDex;
  const $container = $("#sinyal" + dexLowerKey);
  const existingSignal = document.getElementById(signalItemId);

  // ⚠️ CRITICAL FIX: Check if signal card container exists
  if (!$container || $container.length === 0) {
    console.warn(`❌ [InfoSinyal] Signal card container NOT FOUND for DEX: "${DEXPLUS}"`);
    console.warn(`   ∟ Original: ${DEXPLUS}, Normalized: ${dexLowerKey}, Container: #sinyal${dexLowerKey}`);
    console.warn(`   ∟ Token: ${NameToken}->${NamePair}, CEX: ${cex}, PNL: ${Number(PNL).toFixed(2)}, Chain: ${nameChain}`);
    console.warn(`   ∟ Available:`, Array.from(document.querySelectorAll('[id^="sinyal"]')).map(el => el.id));
    return; // Exit early if container doesn't exist
  }

  if (!existingSignal) {
    // Signal belum ada, tambahkan
    $container.append(sLink);
    console.log(`✅ [InfoSinyal] Signal added to DEX: ${DEXPLUS} (normalized: ${dexLowerKey}), Token: ${NameToken}->${NamePair}, PNL: ${Number(PNL).toFixed(2)}`);
  } else {
    // ✅ FIX: Update existing signal instead of skipping
    // This ensures signals show latest data when AUTO LEVEL re-scans with different orderbook
    $(existingSignal).replaceWith(sLink);
    console.log(`🔄 [InfoSinyal] Signal updated for DEX: ${DEXPLUS}, Token: ${NameToken}->${NamePair}, PNL: ${Number(PNL).toFixed(2)}`);
  }

  // Pastikan kartu sinyal DEX utama terlihat ketika ada item sinyal // REFACTORED
  if (typeof window !== 'undefined' && typeof window.showSignalCard === 'function') {
    window.showSignalCard(dexLowerKey);
  }

  const audio = new Audio('audio.mp3');
  audio.play();
}

/**
 * Compute rates, value, and PNL for a DEX route result; return data for DisplayPNL.
 */
function calculateResult(baseId, tableBodyId, amount_out, FeeSwap, sc_input, sc_output, cex, Modal, amount_in, priceBuyToken_CEX, priceSellToken_CEX, priceBuyPair_CEX, priceSellPair_CEX, Name_in, Name_out, feeWD, dextype, nameChain, codeChain, trx, vol, DataDEX) {
  const NameX = Name_in + "_" + Name_out;
  const FeeWD = parseFloat(feeWD);
  const FeeTrade = parseFloat(0.0014 * Modal);

  FeeSwap = parseFloat(FeeSwap) || 0;
  Modal = parseFloat(Modal) || 0;
  amount_in = parseFloat(amount_in) || 0;
  amount_out = parseFloat(amount_out) || 0;
  priceBuyToken_CEX = parseFloat(priceBuyToken_CEX) || 0;
  priceSellToken_CEX = parseFloat(priceSellToken_CEX) || 0;
  priceBuyPair_CEX = parseFloat(priceBuyPair_CEX) || 0;
  priceSellPair_CEX = parseFloat(priceSellPair_CEX) || 0;

  // Early guards for numeric validity to avoid NaN/Infinity propagation
  const idPrefix = tableBodyId + '_';
  const toId = () => String(baseId || '').replace(/[^A-Z0-9_]/g, '');
  const errorPayload = (msg) => ({ type: 'error', id: idPrefix + toId(), message: msg });
  const isPos = v => Number.isFinite(v) && v >= 0;
  const isPosStrict = v => Number.isFinite(v) && v > 0;

  if (!isPosStrict(amount_in)) return errorPayload('Amount_in tidak valid');
  if (!isPos(amount_out)) return errorPayload('Amount_out tidak valid');

  const rateTokentoPair = (amount_in > 0) ? (amount_out / amount_in) : 0;
  const ratePairtoToken = (amount_out > 0) ? (amount_in / amount_out) : 0;

  // ✅ FIX: Fee calculation berbeda per arah (sama dengan scanner.js)
  // CEX to DEX (TokentoPair): withdraw fee dari CEX
  // DEX to CEX (PairtoToken): transfer/deposit fee (gas) ke CEX wallet
  const feeTransfer = (trx === "PairtoToken") ? (FeeSwap * 0.5) : 0;

  const totalModal = (trx === "TokentoPair")
    ? Modal + FeeSwap + FeeWD + FeeTrade
    : Modal + FeeSwap + feeTransfer + FeeTrade;

  const totalFee = (trx === "TokentoPair")
    ? FeeSwap + FeeWD + FeeTrade
    : FeeSwap + feeTransfer + FeeTrade;

  let totalValue = 0;
  if (trx === "TokentoPair") {
    if (priceSellPair_CEX > 0) totalValue = amount_out * priceSellPair_CEX;
    else if (priceBuyToken_CEX > 0) totalValue = amount_in * priceBuyToken_CEX;
    else totalValue = amount_out;
  } else {
    if (priceSellToken_CEX > 0) totalValue = amount_out * priceSellToken_CEX;
    else if (priceBuyPair_CEX > 0) totalValue = amount_in * priceBuyPair_CEX;
    else totalValue = amount_out;
  }

  // Validate totals before computing PNL
  if (!(Number.isFinite(totalModal) && Number.isFinite(totalFee) && Number.isFinite(totalValue))) {
    return errorPayload('Perhitungan nilai/fee tidak valid');
  }
  const profitLoss = totalValue - totalModal;
  const profitLossPercent = totalModal !== 0 ? (profitLoss / totalModal) * 100 : 0;

  // 🔍 DEBUG: PNL Calculation Details
  console.log('📊 [calculateResult] PNL Calculation:', {
    dex: dextype,
    direction: trx,
    Name_in,
    Name_out,
    amount_in,
    amount_out,
    priceBuyToken_CEX,
    priceSellToken_CEX,
    priceBuyPair_CEX,
    priceSellPair_CEX,
    Modal,
    totalFee,
    totalModal,
    totalValue,
    profitLoss,
    formula: trx === 'TokentoPair'
      ? `totalValue = ${amount_out} × ${priceSellPair_CEX} = ${totalValue}`
      : `totalValue = ${amount_out} × ${priceSellToken_CEX} = ${totalValue}`,
    anomaly: profitLoss > 0 && trx === 'PairtoToken' && priceSellToken_CEX < priceBuyToken_CEX ? '⚠️ PROFIT but SELL < BUY!' : 'Normal'
  });

  const linkDEX = generateDexLink(
    dextype,
    nameChain,
    codeChain,
    Name_in,
    sc_input,
    Name_out,
    sc_output
  ) || '#';

  let displayRate, tooltipRate, tooltipText;
  tooltipRate = rateTokentoPair;
  tooltipText = `1 ${Name_in} ≈ ${tooltipRate.toFixed(6)} ${Name_out}`;

  // New: DEX-based USD rate where possible (both directions)
  // Compute displayRate using safe checks (no try/catch) // REFACTORED
  const stableSet = (typeof getStableSymbols === 'function') ? getStableSymbols() : ['USDT', 'USDC', 'DAI'];
  const outSym = String(Name_out || '').toUpperCase();
  const inSym = String(Name_in || '').toUpperCase();
  const baseSym = (typeof getBaseTokenSymbol === 'function') ? getBaseTokenSymbol(nameChain) : '';
  const baseUsd = (typeof getBaseTokenUSD === 'function') ? getBaseTokenUSD(nameChain) : 0;

  if (trx === 'TokentoPair') {
    // token -> pair
    if (stableSet.includes(outSym)) {
      // Output already in stable → amount_out is USD directly per 1 token_in
      displayRate = rateTokentoPair;
    } else if (baseSym && outSym === baseSym && baseUsd > 0) {
      // token -> base → multiply by base USD
      displayRate = rateTokentoPair * baseUsd;
    } else if (priceBuyPair_CEX > 0) {
      // Output non-stable, non-base (BNT, 1INCH, dll) → multiply rate dengan CEX pair price
      displayRate = rateTokentoPair * priceBuyPair_CEX;
    }
  } else {
    // pair -> token (we want USD per 1 token_out)
    if (rateTokentoPair > 0) {
      if (stableSet.includes(inSym)) {
        // Input already USD → price per token = 1 / tokens_per_USD
        displayRate = 1 / rateTokentoPair;
      } else if (baseSym && inSym === baseSym && baseUsd > 0) {
        // Input base coin → price per token = (baseUSD) / tokens_per_base
        displayRate = baseUsd / rateTokentoPair;
      } else if (priceBuyPair_CEX > 0) {
        // Multi-hop via CEX USD per pair: USD/token = (USD per 1 pair) / (tokens per 1 pair)
        displayRate = priceBuyPair_CEX / rateTokentoPair;
      }
    }
  }

  // Fallback if DEX-based USD rate not resolved
  // - TokentoPair: USD/token = (pair per token) * (USD per 1 pair)
  // - PairtoToken: USD/token = langsung harga CEX token (hindari mengalikan hingga jadi USD per PAIR)
  if (!Number.isFinite(displayRate) || displayRate <= 0) {
    if (trx === 'TokentoPair') {
      // FIX: Multiply rateTokentoPair dengan priceSellPair_CEX untuk konversi ke USDT
      displayRate = (rateTokentoPair > 0 && priceSellPair_CEX > 0)
        ? rateTokentoPair * priceSellPair_CEX
        : (priceBuyToken_CEX > 0 ? priceBuyToken_CEX : rateTokentoPair || 0);
    } else {
      displayRate = priceSellToken_CEX > 0
        ? priceSellToken_CEX
        : (priceBuyPair_CEX > 0 ? priceBuyPair_CEX : (rateTokentoPair > 0 ? (1 / rateTokentoPair) : 0));
    }
  }

  if (!Number.isFinite(displayRate) || displayRate < 0) {
    return errorPayload('Harga DEX (USD/token) tidak valid');
  }

  const rateIdr = (typeof formatIDRfromUSDT === 'function') ? formatIDRfromUSDT(displayRate) : 'N/A';
  const rateLabel = `<label class="uk-text-primary" title="${tooltipText} | ${formatPrice(displayRate)} | ${rateIdr}">${formatPrice(displayRate)}</label>`;
  const swapHtml = `<a href="${linkDEX}" target="_blank">${rateLabel}</a>`;
  // debug logs removed

  // REFACTORED: Tambahkan info sumber alternatif dari DataDEX
  const isFallback = DataDEX && DataDEX.isFallback === true;
  const fallbackSource = DataDEX && DataDEX.fallbackSource ? String(DataDEX.fallbackSource) : '';

  // NEW: Extract multi-DEX data from DataDEX (untuk DZAP)
  const subResults = DataDEX && DataDEX.subResults ? DataDEX.subResults : null;
  const isMultiDex = DataDEX && DataDEX.isMultiDex === true;

  // ✅ FIX: Extract dexTitle from DataDEX (provider name from strategy response)
  const dexTitle = DataDEX && DataDEX.dexTitle ? String(DataDEX.dexTitle) : null;

  return {
    type: 'update',
    idPrefix: idPrefix,
    baseId: String(baseId || '').replace(/[^A-Z0-9_]/g, ''),
    swapHtml: swapHtml,
    linkDEX: linkDEX,
    dexUsdRate: displayRate,
    profitLoss, cex, Name_in, NameX, totalFee, Modal, dextype,
    priceBuyToken_CEX, priceSellToken_CEX, priceBuyPair_CEX, priceSellPair_CEX,
    FeeSwap, FeeWD, sc_input, sc_output, Name_out, totalValue, totalModal,
    nameChain, codeChain, trx, profitLossPercent, vol,
    isFallback, fallbackSource,  // REFACTORED: Tambahkan info sumber alternatif
    subResults, isMultiDex,  // NEW: untuk DZAP multi-DEX
    dexTitle  // ✅ NEW: Provider name from strategy response (LIFI, SWOOP, etc)
  };
}

// Optional namespacing for future modular use // REFACTORED
if (typeof window !== 'undefined' && window.App && typeof window.App.register === 'function') {
  window.App.register('DOM', {
    loadKointoTable,
    renderTokenManagementList,
    updateTokenStatsOnly,
    InfoSinyal,
    calculateResult
  });
}

// Expose updateTokenStatsOnly globally for access from event handlers
if (typeof window !== 'undefined') {
  window.updateTokenStatsOnly = updateTokenStatsOnly;
}

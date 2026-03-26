// ─── URL Helpers for CEX/DEX Quick Links ──────
function _getCexTradeUrl(cexKey, ticker, pairTicker) {
    const sym  = (ticker || '').toUpperCase();
    const pair = (pairTicker || 'USDT').toUpperCase();
    switch (cexKey) {
        case 'binance': return `https://www.binance.com/en/trade/${sym}_${pair}`;
        case 'gate':    return `https://www.gate.io/trade/${sym}_${pair}`;
        case 'mexc':    return `https://www.mexc.com/exchange/${sym}_${pair}`;
        case 'indodax': return `https://indodax.com/market/${sym.toLowerCase()}idr`;
        default:        return '';
    }
}
function _getCexWithdrawUrl(cexKey, coin) {
    const c = (coin || '').toUpperCase();
    switch (cexKey) {
        case 'binance': return `https://www.binance.com/en/my/wallet/account/detail/withdrawal?coin=${c}`;
        case 'gate':    return `https://www.gate.io/myaccount/withdraw/${c}`;
        case 'mexc':    return `https://www.mexc.com/assets/withdraw/${c}`;
        default:        return '';
    }
}
function _getCexDepositUrl(cexKey, coin) {
    const c = (coin || '').toUpperCase();
    switch (cexKey) {
        case 'binance': return `https://www.binance.com/en/my/wallet/account/main/deposit/crypto?coin=${c}`;
        case 'gate':    return `https://www.gate.io/myaccount/deposit/${c}`;
        case 'mexc':    return `https://www.mexc.com/assets/deposit/${c}`;
        default:        return '';
    }
}
function _getDexUrl(dexName, tok) {
    const dn = (dexName || '').toLowerCase();
    if (!tok) return '';
    const chainCfg = CONFIG_CHAINS[tok.chain] || {};
    const chainId  = chainCfg.Kode_Chain || '';
    const from     = (tok.scToken || '').toLowerCase();
    const to       = (tok.scPair || chainCfg.USDT_SC || '').toLowerCase();
    if (!from || !to) {
        // Fallback tanpa SC: link generic
        if (dn.includes('meta') || dn === 'mm') return 'https://portfolio.metamask.io/bridge';
        if (dn.includes('jump') || dn.includes('lifi')) return 'https://jumper.exchange/';
        if (dn.includes('bungee')) return 'https://www.bungee.exchange/';
        return '';
    }
    const _kyberChain = { 56:'bnb', 1:'ethereum', 137:'polygon', 42161:'arbitrum', 8453:'base' }[chainId] || 'bnb';
    const _sushiChain = { 56:'bsc', 1:'ethereum', 137:'polygon', 42161:'arbitrum', 8453:'base' }[chainId] || 'bsc';
    const _ooChain    = { 56:'bsc', 1:'eth',      137:'polygon', 42161:'arbitrum', 8453:'base' }[chainId] || 'bsc';
    const _uniChain   = { 56:'bnb', 1:'ethereum', 137:'polygon', 42161:'arbitrum', 8453:'base' }[chainId] || 'bnb';
    const _matchaChain = { 56:'bsc', 1:'ethereum', 137:'polygon', 42161:'arbitrum', 8453:'base' }[chainId] || 'ethereum';
    if (dn.includes('meta') || dn === 'mm') return 'https://portfolio.metamask.io/bridge';
    if (dn.includes('jump') || dn.includes('lifi')) return `https://jumper.exchange/?fromChain=${chainId}&toChain=${chainId}&fromToken=${from}&toToken=${to}`;
    if (dn.includes('kyber')) return `https://kyberswap.com/swap/${_kyberChain}/${from}-to-${to}`;
    if (dn.includes('okx') || dn.includes('okdex')) return `https://www.okx.com/web3/dex-swap?inputChain=${chainId}&inputCurrency=${from}&outputChain=${chainId}&outputCurrency=${to}`;
    if (dn.includes('bungee')) return 'https://www.bungee.exchange/';
    if (/^0x\b|0x protocol|matcha/i.test(dn)) return `https://matcha.xyz/tokens/${_matchaChain}/${from}?buyAddress=${to}&buyChain=${chainId}`;
    if (/openocean|open.ocean/i.test(dn)) return `https://app.openocean.finance/swap/${_ooChain}/${from}/${to}`;
    if (/sushi/i.test(dn)) return `https://www.sushi.com/${_sushiChain}/swap?token0=${from}&token1=${to}`;
    if (/pancake/i.test(dn)) return `https://pancakeswap.finance/swap?inputCurrency=${from}&outputCurrency=${to}`;
    if (/uniswap|uni.v/i.test(dn)) return `https://app.uniswap.org/swap?inputCurrency=${from}&outputCurrency=${to}&chain=${_uniChain}`;
    if (/apeswap/i.test(dn)) return `https://app.apeswap.finance/swap?inputCurrency=${from}&outputCurrency=${to}`;
    if (/biswap/i.test(dn)) return `https://exchange.biswap.org/swap?inputCurrency=${from}&outputCurrency=${to}`;
    if (/camelot/i.test(dn)) return `https://app.camelot.exchange/swap?inputCurrency=${from}&outputCurrency=${to}`;
    if (/aerodrome/i.test(dn)) return `https://aerodrome.finance/swap?from=${from}&to=${to}`;
    if (/1inch/i.test(dn)) return `https://1inch.io/swap?src=${chainId}:${from}&dst=${chainId}:${to}`;
    if (/fly|flytrade/i.test(dn)) return `https://jumper.exchange/?fromChain=${chainId}&toChain=${chainId}&fromToken=${from}&toToken=${to}`;
    // Fallback: jumper aggregator
    return `https://jumper.exchange/?fromChain=${chainId}&toChain=${chainId}&fromToken=${from}&toToken=${to}`;
}

// ─── App Dialog Modal ─────────────────────────
// Menggantikan alert() dan confirm() bawaan browser
const MODAL_ICONS = { info: 'ℹ️', warn: '⚠️', error: '🗑️', success: '✅', delete: '🗑️' };

function _showModal(icon, title, bodyHtml, buttons, bodyLeft = false) {
    $('#appModalIcon').text(icon);
    $('#appModalTitle').text(title);
    $('#appModalBody').html(bodyHtml).toggleClass('text-left', bodyLeft);
    $('#appModalFooter').html(
        buttons.map((b, i) =>
            `<button class="app-modal-btn ${b.cls}" data-idx="${i}">${b.label}</button>`
        ).join('')
    );
    $('#appModal').addClass('open');
    $('#appModalFooter').off('click').on('click', '[data-idx]', function () {
        $('#appModal').removeClass('open');
        const cb = buttons[+$(this).data('idx')].action;
        if (cb) cb();
    });
}

function showAlert(msg, title, type, onClose) {
    const icon = MODAL_ICONS[type] || MODAL_ICONS.info;
    _showModal(icon, title || 'Info', msg,
        [{ label: 'OK', cls: 'btn-ok', action: onClose }]);
}

function showAlertList(items, title, onClose) {
    const body = '<ul>' + items.map(s => `<li>${s}</li>`).join('') + '</ul>';
    _showModal(MODAL_ICONS.warn, title || 'Perhatian', body,
        [{ label: 'OK', cls: 'btn-ok', action: onClose }], true);
}

function showConfirm(msg, title, labelOk, onOk, onCancel) {
    _showModal(MODAL_ICONS.delete, title || 'Konfirmasi', msg, [
        { label: 'Batal', cls: 'btn-cancel', action: onCancel },
        { label: labelOk || 'Ya', cls: 'btn-ok btn-danger', action: onOk },
    ]);
}

// ─── Settings ────────────────────────────────
function getAllFilteredTokens() {
    // Hitung semua token yg lolos filter CEX+chain+pairType, termasuk favorit (ignore monitorFavOnly)
    return getTokens().filter(t => {
        const cexOk = CFG.activeCex.length === 0 || CFG.activeCex.includes(t.cex);
        const chainOk = CFG.activeChains.length === 0 || CFG.activeChains.includes(t.chain);
        const pairTk = (t.tickerPair || 'USDT').toUpperCase();
        const isStable = STABLE_COINS.has(pairTk);
        const pairOk = CFG.pairType === 'all' || (CFG.pairType === 'stable' ? isStable : !isStable);
        return cexOk && chainOk && pairOk;
    });
}

function updateScanCount() {
    const allN = getAllFilteredTokens().length;  // semua koin (termasuk fav) untuk settings
    const n = getFilteredTokens().length;         // koin aktif untuk scan (bisa filtered by fav)
    $('#filterCoinCount').text(allN);
    if (!scanning) {
        $('#btnScanCount').text('[' + n + ' KOIN ]');
        $('#btnScan').prop('disabled', n === 0).toggleClass('disabled', n === 0);
    }
}

function renderFilterChips() {
    // CEX filter chips (multi-select toggle)
    $('#filterCexChips').html(Object.entries(CONFIG_CEX).map(([k, v]) => {
        const on = CFG.activeCex.length === 0 || CFG.activeCex.includes(k);
        return `<span class="fchip${on ? ' on' : ''}" data-key="${k}" data-type="cex"
          style="${on ? `background:${v.WARNA};color:#fff;` : ''}"
          onclick="toggleFilterChip(this,'cex')">
          <img src="icons/cex/${k}.png" class="chip-icon" onerror="this.style.display='none'">
          ${v.label}</span>`;
    }).join(''));
    // Chain filter chips (multi-select toggle)
    $('#filterChainChips').html(Object.entries(CONFIG_CHAINS).map(([k, v]) => {
        const on = CFG.activeChains.length === 0 || CFG.activeChains.includes(k);
        return `<span class="fchip${on ? ' on' : ''}" data-key="${k}" data-type="chain"
          style="${on ? `background:${v.WARNA};color:#fff;` : ''}"
          onclick="toggleFilterChip(this,'chain')">
          <img src="icons/chains/${k}.png" class="chip-icon" onerror="this.style.display='none'">
          ${v.label}</span>`;
    }).join(''));
    // Pair type chips — sync active state
    document.querySelectorAll('#filterPairTypeChips .pair-type-chip').forEach(el => {
        const active = el.dataset.val === (CFG.pairType || 'all');
        el.classList.toggle('on', active);
        el.style.background = active ? '#365cd3' : '';
        el.style.color = active ? '#fff' : '';
    });
}

function setPairTypeFilter(val) {
    CFG.pairType = val;
    _persistCFG();
    renderFilterChips();
    if (!scanning) buildMonitorRows();
    renderTokenList();
    updateScanCount();
    const labels = { all: 'Semua pair', stable: 'Pair Stable Coin', non: 'Pair Non-Stable' };
    showToast(`🔄 Filter pair: ${labels[val]}`);
}

function toggleFilterChip(el, type) {
    const key = el.dataset.key;
    const arr = type === 'cex' ? CFG.activeCex : CFG.activeChains;
    const cfg = type === 'cex' ? CONFIG_CEX : CONFIG_CHAINS;
    const label = cfg[key]?.label || key;
    const idx = arr.indexOf(key);
    // Jika semua aktif (arr kosong), berarti kita mulai dari "semua ON"
    // Klik pertama pada salah satu = matikan yang lain, aktifkan hanya ini
    if (arr.length === 0) {
        // Set semua menjadi aktif, lalu matikan yang diklik
        const all = Object.keys(cfg);
        arr.push(...all.filter(k => k !== key));
    } else if (idx >= 0) {
        arr.splice(idx, 1);
    } else {
        arr.push(key);
        // Jika semua aktif kembali → reset ke "semua" (arr kosong)
        if (arr.length === Object.keys(cfg).length) arr.splice(0);
    }
    renderFilterChips();
    _persistCFG();
    renderTokenList();
    updateScanCount();

    // Toast info status
    const isNowOn = arr.length === 0 || arr.includes(key);
    if (arr.length === 0) {
        showToast(`✅ Semua ${type === 'cex' ? 'CEX' : 'Chain'} aktif`);
    } else {
        showToast(`${isNowOn ? '✅ ' : '❌ '} ${label.toUpperCase()} ${isNowOn ? 'di ON-kan' : 'di OFF-kan'}`);
    }
}

function loadSettings() {
    try { const s = JSON.parse(localStorage.getItem(LS_SETTINGS)); if (s) Object.assign(CFG, s); } catch { }
    if (!Array.isArray(CFG.activeCex)) CFG.activeCex = [];
    if (!Array.isArray(CFG.activeChains)) CFG.activeChains = [];
    if (!['all','stable','non'].includes(CFG.pairType)) CFG.pairType = 'all';
    // Migration from old single quoteCount
    if (CFG.quoteCount && !CFG.quoteCountMetax) { CFG.quoteCountMetax = CFG.quoteCount; delete CFG.quoteCount; }
    $('#setUsername').val(CFG.username);
    $('#setWallet').val(CFG.wallet);
    $('#setInterval').val(CFG.interval);
    $('#setQuoteMetax').val(CFG.quoteCountMetax);
    $('#setQuoteJumpx').val(CFG.quoteCountJumpx);
    $('#setQuoteBungee').val(CFG.quoteCountBungee);
    // Hide Jumpx settings row if disabled in config
    if (!isJumpxEnabled()) {
        CFG.quoteCountJumpx = 0;
        $('#setQuoteJumpx').closest('.settings-field').hide();
    }
    $('#setSoundMuted').prop('checked', !CFG.soundMuted); // centang = suara ON
    // Auto Level CEX — selalu aktif, on/off via config.js defaultAutoLevel
    CFG.autoLevel = isAutoLevelEnabled();
    if (!isAutoLevelEnabled()) {
        $('#setLevelCount').closest('.settings-field').hide();
    } else {
        $('#setLevelCount').val(CFG.levelCount ?? APP_DEV_CONFIG.defaultLevelCount);
    }
    // Speed chips — tandai yang aktif berdasarkan CFG.interval
    const speeds = [800, 700, 500];
    const nearest = speeds.reduce((a, b) => Math.abs(b - CFG.interval) < Math.abs(a - CFG.interval) ? b : a);
    $('#speedChips .sort-btn').removeClass('active');
    $(`#speedChips [data-speed="${nearest}"]`).addClass('active');
    $('#topUsername').text('@' + (CFG.username || '-'));
    // Display app name & version dari config
    const appName = APP_DEV_CONFIG.appName || 'MONITORING PRICE';
    const ver = APP_DEV_CONFIG.appVersion || '';
    const verStr = 'v' + ver;
    const verEl = document.getElementById('appVersion');
    if (verEl) verEl.textContent = verStr;
    const obVer = document.getElementById('onboardVersion');
    if (obVer) obVer.textContent = verStr;
    const nameEl = document.getElementById('appNameDisplay');
    if (nameEl) nameEl.textContent = appName;
    const onboardNameEl = document.getElementById('onboardAppName');
    if (onboardNameEl) onboardNameEl.textContent = appName;
    const titleEl = document.getElementById('appTitle');
    if (titleEl) titleEl.textContent = appName;
    renderFilterChips();
    updateScanCount();
}
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

// ─── Auto-save helpers ────────────────────────
function _persistCFG() {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(CFG));
}

// Simpan field non-kritis langsung saat berubah (tanpa toast)
function _autoSaveFields() {
    const qMetax  = parseInt($('#setQuoteMetax').val());
    const qJumpx  = parseInt($('#setQuoteJumpx').val());
    const qBungee = parseInt($('#setQuoteBungee').val());
    if (!isNaN(qMetax) && qMetax >= 1 && qMetax <= 5)
        CFG.quoteCountMetax = qMetax;
    if (isJumpxEnabled() && !isNaN(qJumpx) && qJumpx >= 1 && qJumpx <= 5)
        CFG.quoteCountJumpx = qJumpx;
    if (!isNaN(qBungee) && qBungee >= 1 && qBungee <= 5)
        CFG.quoteCountBungee = qBungee;
    CFG.soundMuted = !$('#setSoundMuted').prop('checked'); // centang = suara ON = NOT muted
    CFG.levelCount = Math.min(4, Math.max(1, parseInt($('#setLevelCount').val()) || 2));
    _persistCFG();
    if (!scanning) buildMonitorRows();
    renderTokenList();
}

// Simpan username & wallet saat blur — validasi inline
function _saveUserInfo() {
    const username = $('#setUsername').val().trim();
    const wallet   = $('#setWallet').val().trim();
    $('#setUsername, #setWallet').removeClass('input-error');
    let hasErr = false;
    if (!username) { $('#setUsername').addClass('input-error'); hasErr = true; }
    if (!wallet) { $('#setWallet').addClass('input-error'); hasErr = true; }
    else if (!EVM_RE.test(wallet)) { $('#setWallet').addClass('input-error'); hasErr = true; }
    if (hasErr) return;
    CFG.username = username;
    CFG.wallet   = wallet;
    _persistCFG();
    $('#topUsername').text('@' + username);
    showToast('✓ Data pengguna tersimpan');
}

// Tetap ada untuk kompatibilitas (dipakai loadSettings & onboarding)
function saveSettings() { _saveUserInfo(); _autoSaveFields(); }

// ─── Onboarding ──────────────────────────────
function checkOnboarding() {
    if (!CFG.username || !CFG.wallet) openOnboarding();
}
function openOnboarding() {
    $('#obUsername').val(CFG.username); $('#obWallet').val(CFG.wallet);
    $('#onboardOverlay').addClass('open');
}
$('#btnOnboard').on('click', () => {
    const u = $('#obUsername').val().trim();
    const w = $('#obWallet').val().trim();
    $('#obUsername, #obWallet').removeClass('input-error');
    if (!u || !w) {
        if (!u) $('#obUsername').addClass('input-error');
        if (!w) $('#obWallet').addClass('input-error');
        showAlert('Username dan Wallet Address wajib diisi sebelum melanjutkan.', 'Data Belum Lengkap', 'warn');
        return;
    }
    if (!EVM_RE.test(w)) {
        $('#obWallet').addClass('input-error');
        showAlert('Wallet Address tidak valid.<br>Format: <b>0x</b> + tepat <b>40</b> karakter hex (0-9, a-f).', 'Format Wallet Salah', 'warn');
        return;
    }
    CFG.username = u; CFG.wallet = w;
    localStorage.setItem(LS_SETTINGS, JSON.stringify(CFG));
    $('#topUsername').text('@' + u);
    loadSettings();
    $('#onboardOverlay').removeClass('open');
});

// ─── Tab Lock / Unlock ────────────────────────
function lockTabs() {
    $('#navToken, #navSettings').addClass('disabled');
    $('.top-tab-btn[data-tab="tabToken"], .top-tab-btn[data-tab="tabSettings"]').addClass('disabled');
    $('#monSortBar .sort-btn').addClass('disabled').prop('disabled', true);
}
function unlockTabs() {
    $('#navToken, #navSettings').removeClass('disabled');
    $('.top-tab-btn[data-tab="tabToken"], .top-tab-btn[data-tab="tabSettings"]').removeClass('disabled');
    $('#monSortBar .sort-btn').removeClass('disabled').prop('disabled', false);
}
// ─── Bottom Navigation ───────────────────────
function switchTab(tabId) {
    if (!tabId) return;
    if (scanning && tabId !== 'tabMonitor') return; // locked during scan
    $('.nav-item').removeClass('active');
    $(`.nav-item[data-tab="${tabId}"]`).addClass('active');
    $('.top-tab-btn').removeClass('active');
    $(`.top-tab-btn[data-tab="${tabId}"]`).addClass('active');
    // Signal bar + scan controls hanya di tab Scanner
    const isMonitor = tabId === 'tabMonitor';
    $('#signalBar').css('display', isMonitor ? 'flex' : 'none');
    $('#scanFooter').css('display', isMonitor ? 'flex' : 'none');
    document.body.classList.toggle('no-signal-bar', !isMonitor);
    $('.tab-pane').removeClass('active');
    $('#' + tabId).addClass('active');
    if (tabId === 'tabToken') renderTokenList();
    if (tabId === 'tabMonitor' && _monitorNeedsRebuild && !scanning) {
        buildMonitorRows();
        _monitorNeedsRebuild = false;
    }
}
$('.nav-item[data-tab]').on('click', function () { switchTab($(this).data('tab')); });
$('.top-tab-btn[data-tab]').on('click', function () { switchTab($(this).data('tab')); });


// ─── Bottom Sheet ────────────────────────────
function openSheet(id) {
    resetSheetForm();
    if (id) fillSheetForm(id);
    $('#sheetTitle').text(id ? 'Edit Token' : 'Tambah Token');
    $('#editId').val(id || '');
    $('#sheetOverlay').addClass('open');
    setTimeout(() => $('#tokenSheet').addClass('open'), 10);
}
function closeSheet() {
    $('#tokenSheet').removeClass('open');
    $('#sheetOverlay').removeClass('open');
    $('#acToken, #acPair').hide();
    $('#tokenSheet .form-input').removeClass('input-error');
    $('#chainChips, #cexChips').removeClass('input-error');
}
$('#sheetOverlay, #btnSheetCancel').on('click', closeSheet);
$('#fabAdd').on('click', () => openSheet());
// Auto-hapus highlight error saat user mulai edit field
$('#tokenSheet').on('input change', '.form-input', function () { $(this).removeClass('input-error'); });

// ─── CEX & Chain Chips ───────────────────────
function renderCexChips(selected) {
    const html = Object.entries(CONFIG_CEX).map(([k, v]) =>
        `<span class="chip ${selected === k ? 'selected' : ''}" data-cex="${k}"
      style="${selected === k ? `background:${v.WARNA};` : ''}"
      onclick="selectCex('${k}')">
      <img src="icons/cex/${k}.png" class="chip-icon" onerror="this.style.display='none'">
      ${v.label}
    </span>`
    ).join('');
    $('#cexChips').html(html);
}
function selectCex(key) {
    renderCexChips(key);
    autoFillSymbols();
    const ticker = $('#fTicker').val().trim().toUpperCase();
    const pairTk = $('#fTickerPair').val().trim().toUpperCase();
    if (ticker && !isUsdtNoSymbol(key, ticker)) $('#fSymbolToken').attr('placeholder', 'sandIDR');
    if (pairTk && !isUsdtNoSymbol(key, pairTk)) $('#fSymbolPair').attr('placeholder', 'eduIDR');
}
function selectedCex() { return $('#cexChips .chip.selected').data('cex') || Object.keys(CONFIG_CEX)[0]; }

function renderChainChips(selected) {
    const html = Object.entries(CONFIG_CHAINS).map(([k, v]) =>
        `<span class="chip ${selected === k ? 'selected' : ''}" data-chain="${k}"
      style="${selected === k ? `background:${v.WARNA};` : ''}"
      onclick="selectChain('${k}')">
      <img src="icons/chains/${k}.png" class="chip-icon" onerror="this.style.display='none'">
      ${v.label}
    </span>`
    ).join('');
    $('#chainChips').html(html);
}
function selectChain(key) { renderChainChips(key); }
function selectedChain() { return $('#chainChips .chip.selected').data('chain') || 'bsc'; }

// ─── Auto-fill Symbol ────────────────────────
// USDT as ticker/pair never needs a CEX orderbook — 1 USDT = $1 by definition.
// e.g. Binance would generate invalid "USDTUSDT", Gate "USDT_USDT", etc.
const isUsdtNoSymbol = (_cex, ticker) => ticker.toUpperCase() === 'USDT';

function autoFillSymbols() {
    const cex = selectedCex();
    const ticker = $('#fTicker').val().trim();
    const pairTk = $('#fTickerPair').val().trim();
    const cfg = CONFIG_CEX[cex];

    if (ticker) {
        if (isUsdtNoSymbol(cex, ticker)) {
            $('#fSymbolToken').val('').attr('placeholder', 'USDT — otomatis $1');
        } else {
            $('#fSymbolToken').attr('placeholder', 'sandIDR').val(cfg.symbolFmt(ticker));
        }
    }
    if (pairTk) {
        if (isUsdtNoSymbol(cex, pairTk)) {
            $('#fSymbolPair').val('').attr('placeholder', 'USDT — otomatis $1');
        } else {
            $('#fSymbolPair').attr('placeholder', 'eduIDR').val(cfg.symbolFmt(pairTk));
        }
    }
}

// ─── Autocomplete ────────────────────────────
let acDebounce = null;
let acStore = { token: [], pair: [] };

function onTickerInput(type) {
    clearTimeout(acDebounce);
    autoFillSymbols();
    acDebounce = setTimeout(() => triggerAc(type), 300);
}
async function triggerAc(type) {
    const chain = selectedChain();
    const isToken = type === 'token';
    const q = (isToken ? $('#fTicker') : $('#fTickerPair')).val().trim().toUpperCase();
    const box = isToken ? $('#acToken') : $('#acPair');
    if (!q) { box.hide(); return; }

    box.html('<div class="ac-loading">⏳ Memuat...</div>').show();
    const data = await loadWm(chain);
    const res = data.filter(d =>
        d.ticker.toUpperCase().includes(q) || (d.nama_token || '').toUpperCase().includes(q)
    ).slice(0, 8);

    if (!res.length) { box.html('<div class="ac-loading">Tidak ditemukan — isi manual</div>'); return; }

    acStore[type] = res;
    const scShort = (sc) => sc ? sc.slice(0, 6) + '...' + sc.slice(-4) : '-';

    box.html(res.map((d, i) => `
    <div class="ac-item" data-type="${type}" data-idx="${i}">
      <span class="ac-ticker">${d.ticker}</span>
      <span class="ac-name">${d.nama_token || ''} | dec:${d.decimals} | ${scShort(d.sc)}</span>
    </div>`
    ).join('')).show();
}

$(document).on('click', '.ac-item', function () {
    const type = $(this).data('type');
    const idx = parseInt($(this).data('idx'));
    const d = acStore[type]?.[idx];
    if (d) acSelect(d, type);
});

function acSelect(d, type) {
    // Independent fills: TOKEN AC → only fills TOKEN fields; PAIR AC → only fills PAIR fields
    if (type === 'token') {
        $('#fTicker').val(d.ticker);
        $('#fScToken').val(d.sc || '');
        $('#fDecToken').val(d.decimals || 18);
        $('#acToken').hide();
    } else {
        $('#fTickerPair').val(d.ticker);
        $('#fScPair').val(d.sc || '');
        $('#fDecPair').val(d.decimals || 18);
        $('#acPair').hide();
    }
    autoFillSymbols();
}
async function loadWm(chain) {
    if (wmCache[chain]) return wmCache[chain];
    try {
        const url = CONFIG_CHAINS[chain]?.DATAJSON;
        if (!url) return [];
        const r = await fetch(url);
        wmCache[chain] = await r.json();
        return wmCache[chain];
    } catch { return []; }
}
$(document).on('click', function (e) {
    if (!$(e.target).closest('.ac-wrap').length) {
        $('#acToken,#acPair').hide();
    }
});

// ─── Sheet Form ──────────────────────────────
function resetSheetForm() {
    $('#fTicker,#fSymbolToken,#fScToken,#fTickerPair,#fSymbolPair,#fScPair').val('');
    $('#fDecToken,#fDecPair').val(18);
    $('#fModalCtD').val(100); $('#fModalDtC').val(80);
    renderCexChips('binance'); renderChainChips('bsc');
    $('#acToken,#acPair').hide();
}
function fillSheetForm(id) {
    const t = getTokens().find(x => x.id === id);
    if (!t) return;
    $('#fTicker').val(t.ticker); $('#fSymbolToken').val(t.symbolToken);
    $('#fScToken').val(t.scToken); $('#fDecToken').val(t.decToken);
    $('#fTickerPair').val(t.tickerPair); $('#fSymbolPair').val(t.symbolPair);
    $('#fScPair').val(t.scPair); $('#fDecPair').val(t.decPair);
    $('#fModalCtD').val(t.modalCtD); $('#fModalDtC').val(t.modalDtC);
    $('#fMinPnl').val(t.minPnl ?? '');
    renderCexChips(t.cex); renderChainChips(t.chain);
}

$('#btnSheetSave').on('click', () => {
    const ticker = $('#fTicker').val().trim().toUpperCase();
    const cex = selectedCex();
    const symbolToken = $('#fSymbolToken').val().trim().toUpperCase();
    const scToken = $('#fScToken').val().trim();
    const decTokenRaw = $('#fDecToken').val();
    const decToken = parseInt(decTokenRaw);
    const tickerPairRaw = $('#fTickerPair').val().trim().toUpperCase();
    const symbolPair = $('#fSymbolPair').val().trim().toUpperCase();
    const scPair = $('#fScPair').val().trim();
    const decPairRaw = $('#fDecPair').val();
    const decPair = parseInt(decPairRaw);
    const chain = selectedChain();
    const modalCtDRaw = $('#fModalCtD').val();
    const modalDtCRaw = $('#fModalDtC').val();
    const modalCtD = parseFloat(modalCtDRaw);
    const modalDtC = parseFloat(modalDtCRaw);
    const minPnlRaw = $('#fMinPnl').val().trim();
    const minPnl = parseFloat(minPnlRaw);

    // Hapus highlight error sebelumnya
    $('#tokenSheet .form-input').removeClass('input-error');
    $('#chainChips, #cexChips').removeClass('input-error');

    // Kumpulkan error: [fieldId, pesan]
    const errs = [];
    if (!cex) errs.push(['cexChips', 'Exchanger (CEX) belum dipilih']);
    if (!chain) errs.push(['chainChips', 'Network (Chain) belum dipilih']);

    // TOKEN — semua wajib
    if (!ticker)
        errs.push(['fTicker', 'Symbol TOKEN wajib diisi']);
    else if (!/^[A-Z0-9]+$/.test(ticker))
        errs.push(['fTicker', 'Symbol TOKEN hanya huruf/angka (A-Z, 0-9)']);

    if (!symbolToken && !isUsdtNoSymbol(cex, ticker))
        errs.push(['fSymbolToken', 'Ticker CEX Token wajib diisi']);

    if (!scToken)
        errs.push(['fScToken', 'SC Token wajib diisi']);
    else if (!/^0x[0-9a-fA-F]{40}$/.test(scToken))
        errs.push(['fScToken', 'SC Token tidak valid — harus 0x + tepat 40 karakter hex']);

    if (decTokenRaw === '' || isNaN(decToken) || decToken < 0 || decToken > 30)
        errs.push(['fDecToken', 'Decimal Token harus angka antara 0–30']);

    // PAIR — opsional untuk stablecoin (USDT)
    // Jika Symbol PAIR kosong → default pair = stablecoin (USDT), SC auto-fill dari USDT_SC
    if (tickerPairRaw && !/^[A-Z0-9]+$/.test(tickerPairRaw))
        errs.push(['fTickerPair', 'Symbol PAIR hanya huruf/angka (A-Z, 0-9)']);

    const tickerPair = tickerPairRaw || ticker;
    const isPairUsdt = tickerPair.toUpperCase() === 'USDT';
    const isPairSame = tickerPair === ticker;
    const pairNeedsData = !isPairSame && !isPairUsdt;

    // Jika PAIR bukan USDT dan bukan sama dgn TOKEN → data pair wajib lengkap
    if (pairNeedsData) {
        if (!symbolPair)
            errs.push(['fSymbolPair', 'Ticker CEX Pair wajib diisi jika PAIR bukan USDT']);
        if (!scPair)
            errs.push(['fScPair', 'SC Pair wajib diisi jika PAIR bukan USDT']);
        else if (!/^0x[0-9a-fA-F]{40}$/.test(scPair))
            errs.push(['fScPair', 'SC Pair tidak valid — harus 0x + tepat 40 karakter hex']);
    } else if (scPair && !/^0x[0-9a-fA-F]{40}$/.test(scPair)) {
        errs.push(['fScPair', 'SC Pair tidak valid — harus 0x + tepat 40 karakter hex']);
    }

    if (decPairRaw === '' || isNaN(decPair) || decPair < 0 || decPair > 30)
        errs.push(['fDecPair', 'Decimal Pair harus angka antara 0–30']);

    // Modal — semua wajib
    if (modalCtDRaw === '' || isNaN(modalCtD) || modalCtD <= 0)
        errs.push(['fModalCtD', 'Modal CEX→DEX harus angka lebih dari 0']);
    if (modalDtCRaw === '' || isNaN(modalDtC) || modalDtC <= 0)
        errs.push(['fModalDtC', 'Modal DEX→CEX harus angka lebih dari 0']);

    // Min PnL — opsional (kosong = pakai setting global), jika diisi harus angka ≥ 0
    if (minPnlRaw !== '' && (isNaN(minPnl) || minPnl < 0))
        errs.push(['fMinPnl', 'Min PnL harus angka ≥ 0, atau kosongkan untuk pakai setting global']);

    if (errs.length) {
        errs.forEach(([id]) => $('#' + id).addClass('input-error'));
        const firstEl = document.getElementById(errs[0][0]);
        if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showAlertList(errs.map(e => e[1]), 'Validasi Form');
        return;
    }

    const tokens = getTokens();
    const id = $('#editId').val() || genId();
    const idx = tokens.findIndex(x => x.id === id);
    const tok = {
        id, ticker, cex, symbolToken, scToken, decToken,
        tickerPair, symbolPair, scPair, decPair,
        chain, modalCtD, modalDtC,
        minPnl: isFinite(minPnl) ? minPnl : null,   // null = use global setting
        favorite: (idx >= 0 && tokens[idx].favorite) ? true : false, // preserve favorite
    };
    if (idx >= 0) tokens[idx] = tok; else tokens.push(tok);
    saveTokens(tokens);
    renderTokenList();
    if (scanning) {
        showToast((idx >= 0 ? '✅ Koin diperbarui' : '✅ Koin ditambahkan') + ' — berlaku pada putaran berikutnya');
    } else {
        showToast(idx >= 0 ? '✅ Data koin berhasil diperbarui' : '✅ Data koin berhasil ditambahkan');
    }
    closeSheet();
});

// ─── Token List ──────────────────────────────
function isValidToken(t) {
    return !!(t.ticker && t.scToken && CONFIG_CEX[t.cex] && CONFIG_CHAINS[t.chain] &&
        (t.symbolToken || isUsdtNoSymbol(t.cex, t.ticker)));
}

let tokenSort = 'az'; // 'az' | 'za'
let tokenSearchQuery = '';
let _monitorNeedsRebuild = false; // flag: rebuild monitor saat kembali ke tab Scanner
let tokenFavFilter = false;
let tokenRenderLimit = 50;
let _renderDebounce = null;

function renderTokenList() {
    let tokens = getTokens();
    tokens = tokens.filter(t => {
        const cexOk = CFG.activeCex.length === 0 || CFG.activeCex.includes(t.cex);
        const chainOk = CFG.activeChains.length === 0 || CFG.activeChains.includes(t.chain);
        const pairTk = (t.tickerPair || 'USDT').toUpperCase();
        const isStable = STABLE_COINS.has(pairTk);
        const pairOk = CFG.pairType === 'all' || (CFG.pairType === 'stable' ? isStable : !isStable);
        return cexOk && chainOk && pairOk;
    });
    if (tokenSort === 'za') tokens = tokens.sort((a, b) => (b.ticker || '').localeCompare(a.ticker || ''));
    else tokens = tokens.sort((a, b) => (a.ticker || '').localeCompare(b.ticker || ''));
    if (tokenSearchQuery) {
        const q = tokenSearchQuery.toLowerCase();
        tokens = tokens.filter(t => {
            const ticker = (t.ticker || '').toLowerCase();
            const pair = (t.tickerPair || '').toLowerCase();
            const cex = (CONFIG_CEX[t.cex]?.label || t.cex || '').toLowerCase();
            const chain = (CONFIG_CHAINS[t.chain]?.label || t.chain || '').toLowerCase();
            return ticker.includes(q) || pair.includes(q) || cex.includes(q) || chain.includes(q);
        });
    }
    if (tokenFavFilter) tokens = tokens.filter(t => t.favorite);
    const favCount = tokens.filter(t => t.favorite).length;
    $('#tokenCount').text('TOTAL ' + tokens.length + ' KOIN');
    $('#favCount').text(favCount > 0 ? `⭐ ${favCount}/${tokens.length}` : '');
    const displayTokens = tokens.slice(0, tokenRenderLimit);
    if (!displayTokens.length) {
        $('#tokenList').html('<div class="token-list-empty">Belum ada token. Ketuk + untuk menambah.</div>');
    } else {
        let html = displayTokens.map(t => {
            const cexCfg = CONFIG_CEX[t.cex] || {};
            const chainCfg = CONFIG_CHAINS[t.chain] || {};
            const tri = t.tickerPair && t.tickerPair !== t.ticker ? '↔️' : '→';
            const pnlTxt = (isFinite(t.minPnl) && t.minPnl !== null) ? `PnL: $${t.minPnl}` : 'PnL: default';
            const valid = isValidToken(t);
            const invalidBadge = valid ? '' : ' <span class="token-invalid-badge">⚠ Data kurang</span>';
            // WD/DP status icons inline (seperti header scanner)
            const _hasCexData = typeof getCexTokenStatus === 'function';
            const _stTok  = _hasCexData ? getCexTokenStatus(t.cex, t.ticker, t.chain, 1) : null;
            const _pairTk = (t.tickerPair || 'USDT').toUpperCase();
            const _stPair = _hasCexData ? getCexTokenStatus(t.cex, _pairTk, t.chain, 1) : null;
            const _wf     = t.cex !== 'indodax' && typeof isCexWalletFetched === 'function' && isCexWalletFetched(t.cex);
            const _icTok  = _wdpIcons(_stTok, _wf, t.cex, t.ticker);
            const _icPair = _wdpIcons(_stPair, _wf, t.cex, _pairTk);
            return `
    <div class="token-list-item${valid ? '' : ' token-invalid'}" id="li-${t.id}">
      <div class="token-list-badges">
        <span class="badge-cex" style="background:${cexCfg.WARNA || '#555'}">
          <img src="icons/cex/${t.cex}.png" class="badge-icon" onerror="this.style.display='none'">${cexCfg.label || t.cex}
        </span>
        <span class="badge-chain" style="background:${chainCfg.WARNA || '#555'}">
          <img src="icons/chains/${t.chain}.png" class="badge-icon" onerror="this.style.display='none'">${chainCfg.label || t.chain}
        </span>
      </div>
      <div class="token-list-info">
        <div class="token-list-sym">
          <span class="tl-tok-name">${t.ticker}<span class="wdp-ic">${_icTok}</span></span>
          <span class="tl-sep">${tri}</span>
          <span class="tl-tok-name">${t.tickerPair || t.ticker}<span class="wdp-ic">${_icPair}</span></span>
          ${invalidBadge}
        </div>
        <div class="token-list-sub">💵 $${t.modalCtD}/$${t.modalDtC} &nbsp;|&nbsp; 💰 ${pnlTxt}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="tok-fav btn-icon ${t.favorite ? 'fav-active' : ''}" onclick="toggleFavorite('${t.id}')" title="Favorit">⭐</button>
        <div class="token-list-actions">
          <button class="btn-icon" onclick="openSheet('${t.id}')">✏️</button>
          <button class="btn-icon danger" onclick="deleteToken('${t.id}')">🗑️</button>
        </div>
      </div>
    </div>`;
        }).join('');
        if (tokens.length > tokenRenderLimit) {
            const remaining = tokens.length - tokenRenderLimit;
            html += `<div class="load-more-wrap"><button class="btn-load-more" id="btnLoadMore">Tampilkan ${Math.min(remaining, 50)} lagi (${remaining} tersisa)</button></div>`;
        }
        $('#tokenList').html(html);
    }
    if (!scanning) {
        // Hanya rebuild monitor jika tab Scanner aktif; jika tidak, tandai perlu rebuild
        if ($('#tabMonitor').hasClass('active')) {
            buildMonitorRows();
        } else {
            _monitorNeedsRebuild = true;
        }
    }
    updateScanCount();
}

function deleteToken(id) {
    const tok = getTokens().find(x => x.id === id);
    const name = tok ? tok.ticker : 'token ini';
    showConfirm(
        `Koin <b>${name}</b> akan dihapus permanen dan tidak bisa dikembalikan.`,
        'Hapus Koin',
        'Hapus',
        () => {
            saveTokens(getTokens().filter(x => x.id !== id));
            if (scanning) {
                // Saat scanning: hapus card & chip dari DOM saja, jangan rebuild semua
                const card = document.getElementById('card-' + id);
                if (card) card.remove();
                const chip = document.getElementById('chip-' + id);
                if (chip) chip.remove();
                updateScanCount();
                // Force update count on stop button during scanning
                const remaining = getFilteredTokens().length;
                $('#btnScanCount').text('[' + remaining + ' KOIN ]');
                showToast(`🗑️ ${name} dihapus — berlaku pada putaran berikutnya`);
            } else {
                renderTokenList();
            }
        }
    );
}

// ─── CSV Export / Import ─────────────────────
// CSV_COLS: kolom inti token (untuk import/export)
const CSV_COLS = ['ticker', 'cex', 'symbolToken', 'scToken', 'decToken', 'tickerPair', 'symbolPair', 'scPair', 'decPair', 'chain', 'modalCtD', 'modalDtC', 'minPnl', 'favorite'];
// Kolom info tambahan untuk export (read-only dari cache, tidak dipakai saat import)
const CSV_EXTRA_COLS = ['feeWd_token_usdt', 'feeWd_pair_usdt', 'wd_token_ok', 'dp_pair_ok'];

$('#btnExport').on('click', () => {
    const tokens = getTokens();
    const allCols = [...CSV_COLS, ...CSV_EXTRA_COLS];
    const rows = [allCols.join(','), ...tokens.map(t => {
        // Kolom inti
        const base = CSV_COLS.map(c => `"${t[c] ?? ''}"`);
        // Kolom info fee WD dari cache (informatif saja)
        let feeWdTok = '', feeWdPair = '', wdOk = '', dpOk = '';
        if (typeof getCexTokenStatus === 'function') {
            const stTok = getCexTokenStatus(t.cex, t.ticker, t.chain, 1);
            const stPair = getCexTokenStatus(t.cex, t.tickerPair || 'USDT', t.chain, 1);
            if (stTok)  { feeWdTok = stTok.feeWd;  wdOk = stTok.withdrawEnable ? '1' : '0'; }
            if (stPair) { feeWdPair = stPair.feeWd; dpOk = stPair.depositEnable ? '1' : '0'; }
        }
        return [...base, `"${feeWdTok}"`, `"${feeWdPair}"`, `"${wdOk}"`, `"${dpOk}"`].join(',');
    })];
    const csvContent = rows.join('\n');

    // Android WebView: blob URL download tidak didukung — pakai native bridge
    if (window.AndroidBridge) {
        window.AndroidBridge.saveFile('monitoring-tokens.csv', csvContent);
        return;
    }

    // Browser biasa: gunakan blob download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'monitoring-tokens.csv'; a.click();
});
$('#btnImportTrigger').on('click', () => $('#importFile').click());
// Parser CSV yang benar: menangani cell kosong, quoted value, dan CRLF
function parseCSVLine(line) {
    const result = [];
    let i = 0, val = '';
    while (i < line.length) {
        if (line[i] === '"') {
            i++;
            while (i < line.length) {
                if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; } // escaped quote
                else if (line[i] === '"') { i++; break; }
                else { val += line[i++]; }
            }
            // skip trailing chars until comma
            while (i < line.length && line[i] !== ',') i++;
        } else if (line[i] === ',') {
            result.push(val.trim());
            val = ''; i++;
            continue;
        } else {
            val += line[i++];
        }
        if (i < line.length && line[i] === ',') { result.push(val.trim()); val = ''; i++; }
    }
    result.push(val.replace(/\r/g, '').trim()); // last field
    return result;
}

$('#importFile').on('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
        try {
            const lines = ev.target.result.trim().split(/\r?\n/);
            // Baca header — strip BOM, quotes, whitespace
            const headers = parseCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').replace(/["\r]/g, '').trim());
            // Validasi: header 'ticker' harus ada
            if (!headers.includes('ticker')) {
                showAlert('Baris pertama file harus berisi header kolom dan minimal ada kolom <b>ticker</b>.', 'Format CSV Salah', 'error');
                return;
            }
            // Kolom extra (fee WD info) — diabaikan saat import, hanya untuk referensi
            const SKIP_COLS = new Set(['feeWd_token_usdt', 'feeWd_pair_usdt', 'wd_token_ok', 'dp_pair_ok']);
            const tokens = lines.slice(1)
                .filter(line => line.trim()) // skip baris benar-benar kosong
                .map(line => {
                    const vals = parseCSVLine(line);
                    const obj = {};
                    // Map by header name — urutan kolom tidak harus sama, skip kolom extra
                    headers.forEach((h, i) => {
                        if (!SKIP_COLS.has(h)) obj[h] = (vals[i] ?? '').replace(/["\r]/g, '').trim();
                    });
                    obj.decToken = parseInt(obj.decToken) || 18;
                    obj.decPair = parseInt(obj.decPair) || 18;
                    obj.modalCtD = parseFloat(obj.modalCtD) || 100;
                    obj.modalDtC = parseFloat(obj.modalDtC) || 80;
                    const pnlRaw = parseFloat(obj.minPnl);
                    obj.minPnl = isFinite(pnlRaw) ? pnlRaw : null;
                    obj.favorite = String(obj.favorite).toLowerCase() === 'true';
                    obj.id = obj.id || genId();
                    return obj;
                })
                .filter(t => t.ticker); // skip baris tanpa ticker
            if (!tokens.length) {
                showAlert('Tidak ada baris data koin yang valid di dalam file CSV.', 'Import Gagal', 'error');
                return;
            }
            saveTokens(tokens); renderTokenList();
            showToast(`✅ ${tokens.length} Data koin berhasil diimpor`);
        } catch (err) { showAlert('Terjadi kesalahan saat membaca file:<br>' + err.message, 'Error Import', 'error'); }
    };
    r.readAsText(f);
    e.target.value = '';
});

// ─── Favorite Toggle ──────────────────────────
function toggleFavorite(id) {
    const tokens = getTokens();
    const idx = tokens.findIndex(t => t.id === id);
    if (idx < 0) return;
    tokens[idx].favorite = !tokens[idx].favorite;
    saveTokens(tokens);
    // Jika filter fav aktif di tab koin, re-render agar item hilang/muncul sesuai filter
    if (tokenFavFilter) { renderTokenList(); return; }
    // Update visual without full rebuild
    const monBtn = document.querySelector(`#card-${id} .mon-fav`);
    if (monBtn) monBtn.classList.toggle('fav-active', tokens[idx].favorite);
    const tokBtn = document.querySelector(`#li-${id} .tok-fav`);
    if (tokBtn) tokBtn.classList.toggle('fav-active', tokens[idx].favorite);
}

// ─── Monitor Cards Build ──────────────────────
const MON_CTD_COLOR = '#4a9a6a'; // hijau CEXtoDEX (beli CEX, jual DEX)
const MON_DTC_COLOR = '#c0504d'; // merah DEXtoCEX (beli DEX, jual CEX)

// ─── WD/DP Badge HTML (build-time, dari cache) ────────────
// Dipanggil saat buildMonitorRows & renderTokenList
// Mengembalikan HTML badge WD/WX, DP/DX per token+pair
function _buildWdBadgeHtml(cex, ticker, pairTicker, chain) {
    if (typeof getCexTokenStatus !== 'function') return '';
    const stTok  = getCexTokenStatus(cex, ticker, chain, 1);
    const stPair = (pairTicker && pairTicker.toUpperCase() !== 'USDT')
        ? getCexTokenStatus(cex, pairTicker, chain, 1) : null;

    if (!stTok && !stPair) return '<span class="wd-b wd-na">? WD &nbsp; ? DP</span>';

    const parts = [];
    if (stTok) {
        const wdOk = stTok.withdrawEnable;
        const dpOk = stTok.depositEnable;
        parts.push(`<span class="wd-b ${wdOk ? 'wd-ok' : 'wd-fail'}">${wdOk ? 'WD' : 'WX'} ${ticker}</span>`);
        parts.push(`<span class="wd-b ${dpOk ? 'wd-ok' : 'wd-fail'}">${dpOk ? 'DP' : 'DX'} ${ticker}</span>`);
    }
    if (stPair) {
        const wdOk = stPair.withdrawEnable;
        const dpOk = stPair.depositEnable;
        parts.push(`<span class="wd-b ${wdOk ? 'wd-ok' : 'wd-fail'}">${wdOk ? 'WD' : 'WX'} ${pairTicker}</span>`);
        parts.push(`<span class="wd-b ${dpOk ? 'wd-ok' : 'wd-fail'}">${dpOk ? 'DP' : 'DX'} ${pairTicker}</span>`);
    }
    return parts.join('');
}

// WD/DP status icons: [WD_icon][DP_icon]
// WD=withdraw, DP=deposit — ✅ terbuka, ⛔ ditutup, ? belum ada data
// ticker (optional): jika ada, badge dijadikan link ke halaman WD/DP CEX
function _wdpIcons(status, walletFetched, cexKey, ticker) {
    // Indodax: API tidak menyediakan status WD/DP asli → selalu ??
    if (cexKey === 'indodax') return '<span class="wdp-ic-inner wdp-na">??</span>';
    if (!status) return walletFetched
        ? '<span class="wdp-ic-inner wdp-unsupported"><span class="wdp-fail">WX</span> <span class="wdp-fail">DX</span></span>'
        : '<span class="wdp-ic-inner wdp-na">??</span>';
    const wdOk = status.withdrawEnable;
    const dpOk = status.depositEnable;
    const cexLbl = CONFIG_CEX[cexKey]?.label || cexKey;
    const coin = (ticker || '').toUpperCase();
    const wdUrl = ticker ? _getCexWithdrawUrl(cexKey, ticker) : '';
    const dpUrl = ticker ? _getCexDepositUrl(cexKey, ticker) : '';
    const wdSpan = `<span class="${wdOk ? 'wdp-ok' : 'wdp-fail'}">${wdOk ? 'WD' : 'WX'}</span>`;
    const dpSpan = `<span class="${dpOk ? 'wdp-ok' : 'wdp-fail'}">${dpOk ? 'DP' : 'DX'}</span>`;
    const wdHtml = wdUrl ? `<a href="${wdUrl}" target="_blank" rel="noopener" class="wdp-link" title="Withdraw ${coin} di ${cexLbl}" onclick="event.stopPropagation()">${wdSpan}</a>` : wdSpan;
    const dpHtml = dpUrl ? `<a href="${dpUrl}" target="_blank" rel="noopener" class="wdp-link" title="Deposit ${coin} di ${cexLbl}" onclick="event.stopPropagation()">${dpSpan}</a>` : dpSpan;
    return `<span class="wdp-ic-inner">${wdHtml} ${dpHtml}</span>`;
}

function buildMonitorRows(tokenList) {
    const tokens = tokenList || getFilteredTokens();
    // Hapus signal chips lama & reset OB cache — data akan terisi ulang dari scan berikutnya
    _clearAllSignalChips();
    for (const k in _obCache) delete _obCache[k];
    updateNoSignalNotice();
    if (!tokens.length) {
        $('#monitorList').html('<div class="token-list-empty">Tidak ada token. Tambahkan KOIN di menu DATA KOIN.</div>');
        return;
    }
    const n = totalQuoteCount();
    const dexHdr = (pfx, color, tokId) => Array.from({ length: n }, (_, i) =>
        `<td class="mon-dex-hdr" data-${pfx}-hdr="${i}" data-tok="${tokId}" data-dir="${pfx}"
          onmouseenter="showObTooltip(this,event)" onmouseleave="hideObTooltip()"
          ontouchstart="showObTooltip(this,event);event.stopPropagation()"
          style="background:${color};cursor:pointer">-</td>`
    ).join('');
    const dexRow = (pfx, attr) => Array.from({ length: n }, (_, i) =>
        `<td class="mon-dex-cell" data-${pfx}-${attr}="${i}">-</td>`
    ).join('');

    const _hasCexSt = typeof getCexTokenStatus === 'function';
    // Build all cards HTML via DocumentFragment for single DOM insert
    const frag = document.createDocumentFragment();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = tokens.map((t, idx) => {
        const cc = CONFIG_CEX[t.cex] || {};
        const ch = CONFIG_CHAINS[t.chain] || {};
        const tri = t.tickerPair && t.tickerPair !== t.ticker;
        const sym = t.ticker + (tri ? '↔' + t.tickerPair : '');
        const pairTk = t.tickerPair || t.ticker;
        const minPnlLbl = (isFinite(t.minPnl) && t.minPnl !== null) ? t.minPnl : APP_DEV_CONFIG.defaultMinPnl;
        const chainColor = ch.WARNA || '#555';
        // WD/DP icons dari cache untuk header token name
        const _stTok  = _hasCexSt ? getCexTokenStatus(t.cex, t.ticker, t.chain, 1) : null;
        const _stPair = _hasCexSt ? getCexTokenStatus(t.cex, pairTk, t.chain, 1) : null;
        const _wf     = t.cex !== 'indodax' && typeof isCexWalletFetched === 'function' && isCexWalletFetched(t.cex);
        const _icTok  = _wdpIcons(_stTok, _wf, t.cex, t.ticker);
        const _icPair = _wdpIcons(_stPair, _wf, t.cex, pairTk);
        // Stock links — explorer URL: {URL_Chain}/token/{sc}?a={walletAddr}
        const _cexKey = t.cex.toUpperCase();
        const _walletInfo = ch.WALLET_CEX && ch.WALLET_CEX[_cexKey];
        const _explorerBase = ch.URL_Chain || '';
        function _mkStokLinks(sc, label) {
            if (!sc || !_walletInfo || !_explorerBase) return '';
            const addrs = [_walletInfo.address, _walletInfo.address2, _walletInfo.address3].filter(Boolean);
            return addrs.map((addr, i) => {
                const url = `${_explorerBase}/token/${sc}?a=${addr}`;
                const tip = `Stok ${label} ${cc.label||t.cex}${i>0?' #'+(i+1):''} — klik buka di explorer`;
                return `<a href="${url}" target="_blank" rel="noopener" class="stok-link" title="${tip}" onclick="event.stopPropagation()">📦&nbsp;</a>`;
            }).join('');
        }
        const _stokCtd = _mkStokLinks(t.scToken, t.ticker);
        const _stokDtc = _mkStokLinks(t.scPair,  pairTk);
        // Explorer info link untuk nama token/pair di header card
        const _pairScInfo = t.scPair || (pairTk.toUpperCase() === 'USDT' ? (ch.USDT_SC || '') : '');
        const _tokInfoUrl  = _explorerBase && t.scToken ? `${_explorerBase}/token/${t.scToken}` : '';
        const _pairInfoUrl = _explorerBase && _pairScInfo ? `${_explorerBase}/token/${_pairScInfo}` : '';
        const _tokNameHtml  = _tokInfoUrl  ? `<a href="${_tokInfoUrl}"  target="_blank" rel="noopener" class="tok-info-link" title="Info ${t.ticker} di explorer" onclick="event.stopPropagation()">${t.ticker}</a>`  : t.ticker;
        const _pairNameHtml = _pairInfoUrl ? `<a href="${_pairInfoUrl}" target="_blank" rel="noopener" class="tok-info-link" title="Info ${pairTk} di explorer" onclick="event.stopPropagation()">${pairTk}</a>` : pairTk;
        return `<div class="mon-card" id="card-${t.id}" style="border-left:3px solid ${chainColor}">
  <div class="mon-card-hdr" style="background:linear-gradient(135deg,${chainColor}55 0%,${chainColor}20 100%);border-bottom:2px solid ${chainColor}88">
    <span class="mon-sym">
      <span class="mon-num">${idx + 1}</span>
      <span class="mon-tok-name">${_tokNameHtml}<span class="wdp-ic" id="wdic-tok-${t.id}">${_icTok}</span></span>
      <span class="mon-vs">↔️</span>
      <span class="mon-tok-name">${_pairNameHtml}<span class="wdp-ic" id="wdic-pair-${t.id}">${_icPair}</span></span>
    </span>
    <span class="mon-card-actions">
      <span class="mon-cex-label" style="background:${cc.WARNA || '#555'}">${(cc.label || t.cex).toUpperCase()}</span>
      <span class="mon-chain-label" style="background:${chainColor}">${ch.label || t.chain.toUpperCase()}</span>
      <button class="btn-icon mon-act mon-fav ${t.favorite ? 'fav-active' : ''}" onclick="toggleFavorite('${t.id}')" title="Favorit">⭐</button>
      <button class="btn-icon mon-act" onclick="openSheet('${t.id}')" title="Edit Koin">✏️</button>
      <button class="btn-icon danger mon-act" onclick="deleteToken('${t.id}')" title="Hapus Koin">🗑️</button>
    </span>
  </div>
  <div class="mon-tables-wrap">
  <div class="mon-table-scroll">
  <table class="mon-sub-table ctd-table">
    <thead><tr class="mon-sub-hdr">
      <td class="mon-lbl-hdr" style="background:${MON_CTD_COLOR}">${_stokCtd}<span class="hdr-amt" data-modal-hdr="ctd">$${t.modalCtD}<span class="tbl-status"></span></span></td>
      ${dexHdr('ctd', MON_CTD_COLOR, t.id)}
    </tr></thead>
    <tbody>
      <tr class="mon-row-cex"><td class="mon-lbl-side"><span style='color:green;'>BELI [${t.ticker}]</span></td>${dexRow('ctd', 'cex')}</tr>
      <tr class="mon-row-dex"><td class="mon-lbl-side"><span style='color:red;'>${t.ticker}→${pairTk}</span></td>${dexRow('ctd', 'dex')}</tr>
      <tr class="mon-row-recv"><td class="mon-lbl-side">ALL FEE</td>${dexRow('ctd', 'fee')}</tr>
      <tr class="mon-row-pnl"><td class="mon-lbl-side">💰 PNL <span class="lbl-minpnl">($${minPnlLbl})</span></td>${dexRow('ctd', 'pnl')}</tr>
    </tbody>
  </table>
  </div>
  <div class="mon-table-scroll">
  <table class="mon-sub-table dtc-table">
    <thead><tr class="mon-sub-hdr">
      <td class="mon-lbl-hdr" style="background:${MON_DTC_COLOR}">${_stokDtc}<span class="hdr-amt" data-modal-hdr="dtc">$${t.modalDtC}<span class="tbl-status"></span></span></td>
      ${dexHdr('dtc', MON_DTC_COLOR, t.id)}
    </tr></thead>
    <tbody>
      <tr class="mon-row-dex"><td class="mon-lbl-side"><span style='color:green;'>${pairTk}→${t.ticker}</span></td>${dexRow('dtc', 'dex')}</tr>
      <tr class="mon-row-cex"><td class="mon-lbl-side lbl-pair"><span style='color:red;'>JUAL [${t.ticker}]</span></td>${dexRow('dtc', 'cex')}</tr>
      <tr class="mon-row-recv"><td class="mon-lbl-side">ALL FEE</td>${dexRow('dtc', 'fee')}</tr>
      <tr class="mon-row-pnl"><td class="mon-lbl-side">💰 PNL <span class="lbl-minpnl">($${minPnlLbl})</span></td>${dexRow('dtc', 'pnl')}</tr>
    </tbody>
  </table>
  </div>
  </div>
</div>`;
    }).join('');
    const monList = document.getElementById('monitorList');
    monList.textContent = ''; // fast clear
    while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
    monList.appendChild(frag);

    // Build DOM element cache — satu querySelectorAll per card, bukan satu per sel
    _cardEls.clear();
    tokens.forEach(t => {
        const card = document.getElementById('card-' + t.id);
        if (!card) return;
        const els = {
            card,
            wdTokEl:     document.getElementById('wdic-tok-'  + t.id),
            wdPairEl:    document.getElementById('wdic-pair-' + t.id),
            modalCtdHdr: null, modalDtcHdr: null,
            ctdStatus: null, dtcStatus: null,
            ctdHdr: [], ctdCex: [], ctdDex: [], ctdFee: [], ctdPnl: [],
            dtcHdr: [], dtcCex: [], dtcDex: [], dtcFee: [], dtcPnl: [],
        };
        // Satu querySelectorAll per card → ambil semua sel sekaligus
        card.querySelectorAll('[data-modal-hdr],[data-ctd-hdr],[data-ctd-cex],[data-ctd-dex],[data-ctd-fee],[data-ctd-pnl],[data-dtc-hdr],[data-dtc-cex],[data-dtc-dex],[data-dtc-fee],[data-dtc-pnl]').forEach(el => {
            const d = el.dataset;
            if (d.modalHdr === 'ctd') { els.modalCtdHdr = el; return; }
            if (d.modalHdr === 'dtc') { els.modalDtcHdr = el; return; }
            if (d.ctdHdr !== undefined) { els.ctdHdr[+d.ctdHdr] = el; return; }
            if (d.ctdCex !== undefined) { els.ctdCex[+d.ctdCex] = el; return; }
            if (d.ctdDex !== undefined) { els.ctdDex[+d.ctdDex] = el; return; }
            if (d.ctdFee !== undefined) { els.ctdFee[+d.ctdFee] = el; return; }
            if (d.ctdPnl !== undefined) { els.ctdPnl[+d.ctdPnl] = el; return; }
            if (d.dtcHdr !== undefined) { els.dtcHdr[+d.dtcHdr] = el; return; }
            if (d.dtcCex !== undefined) { els.dtcCex[+d.dtcCex] = el; return; }
            if (d.dtcDex !== undefined) { els.dtcDex[+d.dtcDex] = el; return; }
            if (d.dtcFee !== undefined) { els.dtcFee[+d.dtcFee] = el; return; }
            if (d.dtcPnl !== undefined) { els.dtcPnl[+d.dtcPnl] = el; }
        });
        // tbl-status: ambil dari kedua tabel
        const statEls = card.querySelectorAll('.tbl-status');
        els.ctdStatus = statEls[0] || null;
        els.dtcStatus = statEls[1] || null;
        _cardEls.set(t.id, els);
    });
}

// ─── Signal Chips ─────────────────────────────
// Cached DOM references & chip counter to avoid querySelector scans
const _signalBarEl = null; // lazy-init below
let _signalChipCount = 0;
function _getSignalBar() { return document.getElementById('signalBar'); }

function _clearAllSignalChips() {
    const bar = _getSignalBar();
    if (!bar) return;
    // Fast remove: querySelectorAll only when there are chips
    if (_signalChipCount > 0) {
        const chips = bar.querySelectorAll('.signal-chip');
        for (let i = chips.length - 1; i >= 0; i--) chips[i].remove();
        _signalChipCount = 0;
    }
}

function updateNoSignalNotice() {
    const el = document.getElementById('noSignalNotice');
    if (!el) return;
    el.style.display = (scanning && _signalChipCount === 0) ? 'inline-flex' : 'none';
}

function updateSignalChips(tok, signals, dir) {
    const bar = _getSignalBar();
    if (!bar) return;
    const prefix = `chip-${dir.toLowerCase()}-${tok.id}-`;

    // Hapus chip lama yang sudah tidak ada sinyalnya
    const activeSrcs = new Set(signals.map(r => r.src));
    const existing = bar.querySelectorAll(`[id^="${prefix}"]`);
    for (let i = existing.length - 1; i >= 0; i--) {
        if (!activeSrcs.has(existing[i].id.slice(prefix.length))) {
            existing[i].remove();
            _signalChipCount--;
        }
    }

    const cexCfg  = CONFIG_CEX[tok.cex] || {};
    const cexLabel = (cexCfg.label || tok.cex || '').toUpperCase();
    const modalLbl = dir === 'CTD' ? `$${tok.modalCtD}` : `$${tok.modalDtC}`;
    const dirClass = dir === 'CTD' ? 'dir-ctd' : 'dir-dtc';

    signals.forEach(r => {
        const chipId = `${prefix}${r.src}`;
        let chip = document.getElementById(chipId);
        if (!chip) {
            chip = document.createElement('div');
            chip.className = 'signal-chip';
            chip.id = chipId;
            chip.dataset.tokId = tok.id;
            bar.appendChild(chip);
            _signalChipCount++;
        }
        const dexSrc   = r.src || '';
        const dexName  = r.name ? r.name.toUpperCase() : 'DEX';
        const dexBadge = dexSrc === 'MX' ? '[MT]' : dexSrc === 'JX' ? '[JM]' : dexSrc === 'BG' ? '[BG]' : dexSrc === 'KB' ? '[KB]' : '';
        const dexFull  = dexBadge ? `<span class="src-tag ${dexSrc.toLowerCase()}">${dexBadge}</span> ${dexName}` : dexName;
        const dirLabel = dir === 'CTD' ? `${cexLabel}→${dexFull}` : `${dexFull}→${cexLabel}`;
        const pnlClass = r.pnl >= 0 ? 'chip-pnl-pos' : 'chip-pnl-neg';

        chip.innerHTML = `
            <div class="chip-row-top">
                <img src="icons/chains/${tok.chain}.png" class="chip-icon" onerror="this.style.display='none'">
                <span class="chip-dir ${dirClass}">${dirLabel}</span>
            </div>
            <div class="chip-row-bottom">
                <span class="chip-ticker">${tok.ticker}<span class="chip-pair">/${tok.tickerPair || 'USDT'}</span></span>
                <span class="chip-sep">|</span>
                <span class="chip-modal">${modalLbl}</span>
                <span class="chip-sep">|</span>
                <span class="chip-pnl ${pnlClass}">${fmtPnl(r.pnl)}$</span>
            </div>`;
        chip.className = 'signal-chip' + (r.pnl < 0 ? ' loss' : '');
    });

    updateNoSignalNotice();
}

// ─── Toast ────────────────────────────────────
let _toastTimer = null;
function showToast(msg, duration = 2200) {
    const el = document.getElementById('toastMsg');
    if (!el) return;
    clearTimeout(_toastTimer);
    el.textContent = msg;
    el.classList.add('show');
    _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─── Settings Auto-Save Bindings ──────────────
// Username & wallet: simpan + validasi saat focus hilang
$('#setUsername, #setWallet').on('blur', _saveUserInfo);

// Speed chips: pilih & simpan langsung
$('#speedChips').on('click', '.sort-btn', function () {
    $('#speedChips .sort-btn').removeClass('active');
    $(this).addClass('active');
    CFG.interval = parseInt($(this).data('speed'));
    _persistCFG();
    showToast('✓ Kecepatan: ' + $(this).text());
});

// Semua field lain: auto-save + toast saat berubah
$('#setSoundMuted').on('change', function () {
    _autoSaveFields();
    showToast(this.checked ? '🔔 Notifikasi suara aktif' : '🔕 Notifikasi suara dimatikan');
});
$('#setQuoteMetax').on('change', function () {
    _autoSaveFields();
    showToast('✓ Quote MT tersimpan: ' + $(this).val());
});
$('#setQuoteJumpx').on('change', function () {
    _autoSaveFields();
    showToast('✓ Quote JM tersimpan: ' + $(this).val());
});
$('#setQuoteBungee').on('change', function () {
    _autoSaveFields();
    showToast('✓ Quote BG tersimpan: ' + $(this).val());
});
$('#setLevelCount').on('change', function () {
    const clamped = Math.min(4, Math.max(1, parseInt($(this).val()) || 2));
    $(this).val(clamped);
    _autoSaveFields();
    showToast('✓ Level CEX: ' + clamped);
});

// ─── Reload with Toast ───────────────────────
function reloadWithToast() {
    sessionStorage.setItem('justReloaded', '1');
    location.reload();
}

// ─── Sort & Search Handlers ──────────────────
// Scanner sort
$('#monSortBar').on('click', '.sort-btn:not(#monFavFilter):not(#btnAutoReload)', function () {
    monitorSort = $(this).data('sort');
    _shuffledTokens = null; // clear cache agar random mengacak ulang
    $('#monSortBar .sort-btn:not(#monFavFilter):not(#btnAutoReload)').removeClass('active');
    $(this).addClass('active');
    // Hapus signal chips & rebuild cards (termasuk saat scanning)
    _clearAllSignalChips();
    updateNoSignalNotice();
    _lastScanTokenKey = null; // force rebuild pada ronde berikutnya
    buildMonitorRows();
});

// Scanner favorite filter
$('#monFavFilter').on('click', function () {
    monitorFavOnly = !monitorFavOnly;
    $(this).toggleClass('active', monitorFavOnly);
    if (!scanning) buildMonitorRows();
    updateScanCount();
});

// Koin sort
$('#tokSortAZ, #tokSortZA').on('click', function () {
    tokenSort = $(this).data('sort');
    $('#tokSortAZ, #tokSortZA').removeClass('active');
    $(this).addClass('active');
    tokenRenderLimit = 50;
    renderTokenList();
});

// Koin fav filter
$('#tokFavFilter').on('click', function () {
    tokenFavFilter = !tokenFavFilter;
    $(this).toggleClass('active', tokenFavFilter);
    tokenRenderLimit = 50;
    renderTokenList();
});

// Koin search
$('#tokenSearch').on('input', function () {
    tokenSearchQuery = $(this).val().trim();
    tokenRenderLimit = 50;
    clearTimeout(_renderDebounce);
    _renderDebounce = setTimeout(renderTokenList, 150);
});

// ─── Orderbook Tooltip ────────────────────────
let _tooltipHideTimer = null;
let _tooltipEl = null;
function _getTooltip() { return _tooltipEl || (_tooltipEl = document.getElementById('obTooltip')); }
function showObTooltip(el) {
    clearTimeout(_tooltipHideTimer);
    const tokId = el.dataset.tok;
    const dir = el.dataset.dir; // 'ctd' or 'dtc'
    const ob = _obCache[tokId];
    const tooltip = _getTooltip();
    if (!tooltip) return;

    // Build token/pair/CEX/DEX info header
    const tok = getTokens().find(t => t.id === tokId);
    const cexLabel = tok ? (CONFIG_CEX[tok.cex]?.label || tok.cex).toUpperCase() : '?';
    const chainLabel = tok ? (CONFIG_CHAINS[tok.chain]?.label || tok.chain).toUpperCase() : '?';
    const tokenSym = tok ? tok.ticker : '?';
    const pairSym = tok ? (tok.tickerPair || tok.ticker) : '?';
    const dexName = el.textContent.trim() || '?';
    // Fee detail dari dataset header element (per kolom DEX)
    const _feeWdLabel = dir === 'ctd' ? tokenSym : pairSym;
    const _cexFee1  = parseFloat(el.dataset.cexFee1) || 0;
    const _cexFee2  = parseFloat(el.dataset.cexFee2) || 0;
    const _feeWd    = parseFloat(el.dataset.feeWd) || (ob ? (dir === 'ctd' ? (ob.feeWdCtD || 0) : 0) : 0);
    const _feeSwap  = parseFloat(el.dataset.feeSwap) || 0;
    const _totalFee  = parseFloat(el.dataset.totalFee)  || (_cexFee1 + _cexFee2 + _feeWd + _feeSwap);
    const _pnlKotor  = parseFloat(el.dataset.pnlKotor)  || 0;
    const _pnlBersih = parseFloat(el.dataset.pnlBersih) || 0;
    const _buyLabel  = dir === 'ctd' ? `Fee Beli ${tokenSym} (CEX)` : `Fee Beli ${pairSym} (CEX)`;
    const _sellLabel = dir === 'ctd' ? `Fee Jual ${pairSym} (CEX)` : `Fee Jual ${tokenSym} (CEX)`;
    const _pnlKotorSign  = _pnlKotor  >= 0 ? '+' : '';
    const _pnlBersihSign = _pnlBersih >= 0 ? '+' : '';
    const _pnlBersihCls  = _pnlBersih >= 0 ? 'pnl-pos' : 'pnl-neg';
    const _feeDetailHtml = (_cexFee1 > 0 || _cexFee2 > 0 || _feeWd > 0 || _feeSwap > 0)
        ? `<div class="ob-tip-fee-detail">${_cexFee1 > 0 ? `
            <div class="ob-tip-fee-row"><span class="ob-tip-lbl">${_buyLabel}</span><span class="ob-tip-feewd-val">-${_cexFee1.toFixed(3)}$</span></div>` : ''}${_cexFee2 > 0 ? `
            <div class="ob-tip-fee-row"><span class="ob-tip-lbl">${_sellLabel}</span><span class="ob-tip-feewd-val">-${_cexFee2.toFixed(3)}$</span></div>` : ''}${_feeWd > 0 ? `
            <div class="ob-tip-fee-row"><span class="ob-tip-lbl">Fee WD ${_feeWdLabel}</span><span class="ob-tip-feewd-val">-${_feeWd.toFixed(3)}$</span></div>` : ''}${_feeSwap > 0 ? `
            <div class="ob-tip-fee-row"><span class="ob-tip-lbl">Fee Swap (DEX)</span><span class="ob-tip-feewd-val">-${_feeSwap.toFixed(3)}$</span></div>` : ''}
            <div class="ob-tip-fee-row ob-tip-fee-total"><span class="ob-tip-lbl">Total Fee</span><span class="ob-tip-feewd-val">-${_totalFee.toFixed(3)}$</span></div>
          </div>
          <div class="ob-tip-pnl-summary">
            <div class="ob-tip-fee-row"><span class="ob-tip-lbl">PNL Kotor</span><span class="ob-tip-pnl-gross">${_pnlKotorSign}${_pnlKotor.toFixed(3)}$</span></div>
            <div class="ob-tip-fee-row"><span class="ob-tip-lbl">All Fee</span><span class="ob-tip-feewd-val">-${_totalFee.toFixed(3)}$</span></div>
            <div class="ob-tip-fee-row ob-tip-pnl-net-row"><span class="ob-tip-lbl">PNL Bersih</span><span class="${_pnlBersihCls} ob-tip-pnl-net">${_pnlBersihSign}${_pnlBersih.toFixed(3)}$</span></div>
          </div>`
        : '';
    // CTD: tampilkan token → pair; DTC: tampilkan pair → token
    const _infoToken = dir === 'ctd' ? `${tokenSym}→${pairSym}` : `${pairSym}→${tokenSym}`;
    const infoHeader = `<div class="ob-tip-info">
      <span class="ob-tip-lbl">Token</span> <b>${_infoToken}</b>
      &nbsp;·&nbsp; <span class="ob-tip-lbl">CEX</span> <b>${cexLabel}</b>
      &nbsp;·&nbsp; <span class="ob-tip-lbl">DEX</span> <b>${dexName}</b>
      &nbsp;·&nbsp; <span class="ob-tip-lbl">Chain</span> <b>${chainLabel}</b>
    </div>${_feeDetailHtml}`;

    const actionsHtml = '';

    if (!ob || (!ob.asks.length && !ob.bids.length)) {
        tooltip.innerHTML = infoHeader + '<div class="ob-tip-empty">Data orderbook belum tersedia.<br>Tunggu hasil scanning.</div>';
    } else {
        // Harga CEX (LX auto level atau L1) dan DEX (effPrice kolom ini)
        const cexAsk   = ob.dispAsk || ob.askPrice || 0;
        const cexBid   = ob.dispBid || ob.bidPrice || 0;
        const dexPrice = parseFloat(el.dataset.effprice) || 0;
        // CtD: beli di CEX (ask), jual di DEX (effPrice)
        // DtC: beli di DEX (effPrice), jual di CEX (bid)
        const buyPrice  = dir === 'ctd' ? cexAsk  : dexPrice;
        const sellPrice = dir === 'ctd' ? dexPrice : cexBid;
        const buyLabel  = dir === 'ctd' ? 'HARGA BUY CEX'  : 'HARGA BUY DEX';
        const sellLabel = dir === 'ctd' ? 'HARGA SELL DEX' : 'HARGA SELL CEX';

        const fmtIDR = (v) => {
            const idr = v * usdtRate;
            if (idr <= 0) return '0';
            if (idr < 1) return idr.toFixed(4);
            if (idr < 1000) return idr.toFixed(2);
            return Math.round(idr).toLocaleString('id-ID');
        };
        const fmtPr = (p) => `${fmtCompact(p)}$ [Rp.${fmtIDR(p)}]`;

        const priceHeader = `
          <div class="ob-tip-prices">
            <div class="ob-tip-price-row">
              <span class="ob-tip-buy">${buyLabel}</span>
              <span class="ob-sep"> : </span>
              <span>${fmtPr(buyPrice)}</span>
            </div>
            <div class="ob-tip-price-row">
              <span class="ob-tip-sell">${sellLabel}</span>
              <span class="ob-sep"> : </span>
              <span>${fmtPr(sellPrice)}</span>
            </div>
          </div>`;

        const obList = dir === 'ctd' ? (ob.asks || []) : (ob.bids || []);
        const dirLabel = dir === 'ctd' ? 'BELI (CEX→DEX)' : 'JUAL (DEX→CEX)';
        const titleCls = dir === 'ctd' ? 'ob-tip-buy' : 'ob-tip-sell';

        const levelCount = CFG.levelCount ?? APP_DEV_CONFIG.defaultLevelCount;
        const rows = obList.slice(0, levelCount).map(([price, vol], i) => {
            const total = price * vol;
            const sep = i > 0 ? '<div class="ob-tip-level-sep"></div>' : '';
            return `${sep}<div class="ob-tip-ob-row">
              <span class="ob-tip-ob-lvl">L${i + 1}</span>
              <span class="ob-tip-ob-price">${fmtPr(price)}</span>
              <span class="ob-sep">:</span>
              <span class="ob-tip-ob-vol">${total.toFixed(2)}$ [Rp.${fmtIDR(total)}]</span>
            </div>`;
        }).join('');

        tooltip.innerHTML = `
          ${infoHeader}
          ${priceHeader}
          <div class="ob-tip-ob-section">
            <div class="ob-tip-title ${titleCls}">ORDERBOOK CEX — ${dirLabel}</div>
            ${rows || '<div class="ob-tip-empty">Tidak ada data</div>'}
          </div>`;
    }

    // Position tooltip
    const rect = el.getBoundingClientRect();
    const tipW = 290;
    let left = rect.left + window.scrollX;
    if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
    if (left < 4) left = 4;
    tooltip.style.left = left + 'px';
    tooltip.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    tooltip.classList.add('visible');
}
function hideObTooltip() {
    clearTimeout(_tooltipHideTimer);
    _tooltipHideTimer = setTimeout(() => {
        const tooltip = _getTooltip();
        if (tooltip) tooltip.classList.remove('visible');
    }, 120);
}
// Close tooltip when tapping elsewhere
document.addEventListener('touchstart', function (e) {
    if (!e.target.closest('[data-dir]') && !e.target.closest('#obTooltip')) {
        const tooltip = _getTooltip();
        if (tooltip) tooltip.classList.remove('visible');
    }
}, { passive: true });

// ─── Lazy UI Extra Loader (Calculator + Bulk) ─────────
let _uiExtraLoading = null;
function _loadUiExtra() {
    if (window.__uiExtraLoaded) return Promise.resolve();
    if (_uiExtraLoading) return _uiExtraLoading;
    _uiExtraLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'ui/ui-extra.js';
        s.onload = () => { window.__uiExtraLoaded = true; resolve(); };
        s.onerror = () => { _uiExtraLoading = null; showToast('Gagal memuat modul kalkulator'); reject(new Error('ui-extra load failed')); };
        document.body.appendChild(s);
    });
    return _uiExtraLoading;
}

function openCalcModal() {
    _loadUiExtra().then(() => { if (typeof window.openCalcModal === 'function') window.openCalcModal(); });
}
function closeCalcModal() {
    const el = document.getElementById('calcOverlay');
    if (el) el.classList.remove('open');
}
function openBulkModal() {
    _loadUiExtra().then(() => { if (typeof window.openBulkModal === 'function') window.openBulkModal(); });
}
function closeBulkModal() {
    const el = document.getElementById('bulkOverlay');
    if (el) el.classList.remove('open');
}
function onCalcField(source) {
    _loadUiExtra().then(() => { if (typeof window.onCalcField === 'function') window.onCalcField(source); });
}
function calcUpdatePrice() {
    _loadUiExtra().then(() => { if (typeof window.calcUpdatePrice === 'function') window.calcUpdatePrice(); });
}
function calcCekToken() {
    _loadUiExtra().then(() => { if (typeof window.calcCekToken === 'function') window.calcCekToken(); });
}
function refreshCalcRate() {
    _loadUiExtra().then(() => { if (typeof window.refreshCalcRate === 'function') window.refreshCalcRate(); });
}
function convFromUsdt() {
    _loadUiExtra().then(() => { if (typeof window.convFromUsdt === 'function') window.convFromUsdt(); });
}
function convFromIdr() {
    _loadUiExtra().then(() => { if (typeof window.convFromIdr === 'function') window.convFromIdr(); });
}
function calcCustomConv() {
    _loadUiExtra().then(() => { if (typeof window.calcCustomConv === 'function') window.calcCustomConv(); });
}
// ─── Load More: event delegation on #tokenList ───
$('#tokenList').on('click', '#btnLoadMore', function () {
    tokenRenderLimit += 50;
    renderTokenList();
});

// ─── Signal chip: event delegation ───────────
$('#signalBar').on('click', '.signal-chip', function () {
    const card = document.getElementById('card-' + this.dataset.tokId);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ─── Tooltip hover keep-open ─────────────────
// Tooltip tetap terbuka saat cursor berada di atasnya (untuk klik link)
$('#obTooltip')
    .on('mouseenter', function () { clearTimeout(_tooltipHideTimer); })
    .on('mouseleave', function () { hideObTooltip(); });

// ─── Init ────────────────────────────────────
$(function () {
    // Restore auto-reload state
    autoReload = localStorage.getItem('scanAutoReload') === '1';
    _applyAutoReload();
    loadSettings();
    renderCexChips('indodax');
    renderChainChips('bsc');
    renderTokenList();   // also builds monitor skeleton via buildMonitorRows()
    checkOnboarding();
    // Sync signalBar + scanFooter visibility dengan tab aktif saat load
    const initTab = $('.nav-item.active[data-tab]').data('tab') || 'tabMonitor';
    const initMonitor = initTab === 'tabMonitor';
    $('#signalBar').css('display', initMonitor ? 'flex' : 'none');
    $('#scanFooter').css('display', initMonitor ? 'flex' : 'none');
    document.body.classList.toggle('no-signal-bar', !initMonitor);
    // Init USDT rate
    fetchUsdtRate().then(() => {
        if (typeof window._updateCalcRateDisplay === 'function') window._updateCalcRateDisplay();
    });
    // Toast after reload
    if (sessionStorage.getItem('justReloaded')) {
        sessionStorage.removeItem('justReloaded');
        showToast('Reload berhasil!');
    }
});

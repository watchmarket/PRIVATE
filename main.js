// =================================================================================
// MAIN APPLICATION LOGIC AND EVENT LISTENERS
// =================================================================================

// --- Global Variables ---
const MAIN_APP_META = (function () {
    try {
        return (typeof window !== 'undefined' && window.CONFIG_APP && window.CONFIG_APP.APP) ? window.CONFIG_APP.APP : {};
    } catch (_) { return {}; }
})();
const MAIN_APP_NAME = MAIN_APP_META.NAME || 'MULTIALL-PLUS';
const MAIN_APP_NAME_SAFE = (function (name) {
    try {
        const safe = String(name || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
        return safe ? safe.toUpperCase() : 'APP';
    } catch (_) { return 'APP'; }
})(MAIN_APP_NAME);
const PRIMARY_DB_NAME = (function () {
    try {
        if (typeof window !== 'undefined' && window.CONFIG_DB && window.CONFIG_DB.NAME) return window.CONFIG_DB.NAME;
    } catch (_) { }
    return MAIN_APP_NAME;
})();
const PRIMARY_KV_STORE = (function () {
    try {
        if (typeof window !== 'undefined' && window.CONFIG_DB && window.CONFIG_DB.STORES && window.CONFIG_DB.STORES.KV) {
            return window.CONFIG_DB.STORES.KV;
        }
    } catch (_) { }
    return 'APP_KV_STORE';
})();

const storagePrefix = MAIN_APP_NAME_SAFE ? `${MAIN_APP_NAME_SAFE}_` : '';
const REQUIRED_KEYS = {
    SETTINGS: 'SETTING_SCANNER'
};

let sortOrder = {};
let filteredTokens = [];
let originalTokens = [];
var SavedSettingData = getFromLocalStorage('SETTING_SCANNER', {});
let activeSingleChainKey = null; // Active chain key (single mode)

// Log scan limit configuration on load
(function logScanLimitStatus() {
    try {
        const scanLimitEnabled = typeof window !== 'undefined'
            && window.CONFIG_APP
            && window.CONFIG_APP.APP
            && window.CONFIG_APP.APP.SCAN_LIMIT === true;

        if (scanLimitEnabled) {
            // console.log('%c[SCAN LIMIT] ⚠️ ENABLED - Only ONE scan allowed at a time', 'color: #FF9800; font-weight: bold; background: #FFF3E0; padding: 4px 8px; border-left: 4px solid #FF9800;');
        } else {
            // console.log('%c[SCAN LIMIT] ✓ DISABLED - Multiple scans allowed (parallel scanning enabled)', 'color: #4CAF50; font-weight: bold; background: #E8F5E9; padding: 4px 8px; border-left: 4px solid #4CAF50;');
        }
    } catch (e) {
        // console.warn('[SCAN LIMIT] Could not determine scan limit status:', e);
    }
})();

// Apply app branding (title/header) based on CONFIG_APP metadata.
(function applyAppBranding() {
    try {
        if (typeof document === 'undefined') return;
        const name = MAIN_APP_NAME;
        const version = MAIN_APP_META.VERSION ? String(MAIN_APP_META.VERSION) : '';
        const headerEl = document.getElementById('app-title');
        if (headerEl) headerEl.textContent = version ? `${name} v${version}` : name;
        try { document.title = version ? `${name} v${version}` : name; } catch (_) { }
        const infoEl = document.getElementById('infoAPP');
        if (infoEl) {
            const current = String(infoEl.textContent || '').trim();
            if (!current || current === '???') {
                infoEl.textContent = version ? `v${version}` : name;
            }
        }
    } catch (_) { }
})();

// refactor: Toastr is centrally configured in js/notify-shim.js

// --- Application Initialization ---

// Per-mode app state is merged into FILTER_<CHAIN> / FILTER_MULTICHAIN
// Fields: { run: 'YES'|'NO', darkMode: boolean, sort: 'A'|'Z', pnl: number, ... }
function getAppState() {
    try {
        const key = (typeof getActiveFilterKey === 'function') ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
        const f = getFromLocalStorage(key, {}) || {};
        return {
            run: (f.run || 'NO'),
            darkMode: !!f.darkMode,
            lastChain: f.lastChain
        };
    } catch (_) { return { run: 'NO', darkMode: false }; }
}
function setAppState(patch) {
    try {
        const key = (typeof getActiveFilterKey === 'function') ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
        const cur = getFromLocalStorage(key, {}) || {};
        const next = Object.assign({}, cur, patch || {});
        saveToLocalStorage(key, next);
        return next;
    } catch (_) { return patch || {}; }
}

// Floating scroll-to-top button for monitoring table (robust across browsers)
(function initScrollTopButton() {
    function bindScrollTop() {
        try {
            const btn = document.getElementById('btn-scroll-top');
            if (!btn) return;
            // Ensure the button is enabled and avoid duplicate bindings
            try { btn.disabled = false; btn.style.pointerEvents = ''; btn.style.opacity = ''; } catch (_) { }
            if (btn.dataset.bound === '1') return;
            btn.dataset.bound = '1';

            function isVisible(el) {
                if (!el) return false;
                const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
                const displayOK = !style || style.display !== 'none';
                const visibleOK = !style || style.visibility !== 'hidden' && style.opacity !== '0';
                const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 1, height: 1 };
                const sizeOK = (rect.width > 0 && rect.height > 0);
                return displayOK && visibleOK && sizeOK;
            }

            function findScrollableContainer() {
                // Unified table scroll container
                const mon = document.getElementById('monitoring-scroll');
                if (mon && isVisible(mon) && mon.scrollHeight > mon.clientHeight) return mon;
                return null;
            }

            btn.addEventListener('click', function () {
                try {
                    const container = findScrollableContainer();
                    const useContainer = !!container;

                    if (useContainer) {
                        if (typeof $ === 'function') {
                            $(container).stop(true).animate({ scrollTop: 0 }, 250);
                        } else if (typeof container.scrollTo === 'function') {
                            container.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                        } else {
                            container.scrollTop = 0;
                        }
                    } else {
                        if (typeof $ === 'function') {
                            $('html, body').stop(true).animate({ scrollTop: 0 }, 250);
                        } else if (typeof window.scrollTo === 'function') {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            try { document.documentElement.scrollTop = 0; } catch (_) { }
                            try { document.body.scrollTop = 0; } catch (_) { }
                        } else {
                            try { document.documentElement.scrollTop = 0; } catch (_) { }
                            try { document.body.scrollTop = 0; } catch (_) { }
                        }
                    }
                } catch (_) { }
            });
        } catch (_) { }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindScrollTop);
        window.addEventListener('load', bindScrollTop);
    } else {
        // DOM is already ready; bind immediately
        bindScrollTop();
        // Also attach as a fallback in case of late reflows
        setTimeout(bindScrollTop, 0);
    }
})();

// Smooth scroll chaining: when monitoring table reaches its scroll limits,
// allow the page to continue scrolling (so user can reach signal cards above).
(function enableMonitoringScrollChaining() {
    function bindChain() {
        try {
            const el = document.getElementById('monitoring-scroll');
            if (!el) return;
            if (el.dataset._chainBound === '1') return; // avoid duplicate bindings
            el.dataset._chainBound = '1';

            // Wheel (mouse/trackpad)
            el.addEventListener('wheel', function (e) {
                try {
                    // Only intervene when the container cannot scroll further
                    const delta = e.deltaY;
                    const atTop = (el.scrollTop <= 0);
                    const atBottom = (el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
                    if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
                        e.preventDefault();
                        // Scroll the page/body instead
                        if (typeof window.scrollBy === 'function') window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
                        else {
                            try { document.documentElement.scrollTop += delta; } catch (_) { }
                            try { document.body.scrollTop += delta; } catch (_) { }
                        }
                    }
                } catch (_) { }
            }, { passive: false });

            // Touch (mobile)
            let lastY = null;
            el.addEventListener('touchstart', function (ev) {
                try { lastY = (ev.touches && ev.touches[0]) ? ev.touches[0].clientY : null; } catch (_) { lastY = null; }
            }, { passive: true });
            el.addEventListener('touchmove', function (ev) {
                try {
                    if (lastY == null) return;
                    const y = (ev.touches && ev.touches[0]) ? ev.touches[0].clientY : lastY;
                    const delta = lastY - y; // positive = scroll down
                    const atTop = (el.scrollTop <= 0);
                    const atBottom = (el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
                    if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
                        ev.preventDefault();
                        if (typeof window.scrollBy === 'function') window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
                        else {
                            try { document.documentElement.scrollTop += delta; } catch (_) { }
                            try { document.body.scrollTop += delta; } catch (_) { }
                        }
                    }
                    lastY = y;
                } catch (_) { }
            }, { passive: false });
        } catch (_) { }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindChain);
        window.addEventListener('load', bindChain);
    } else {
        bindChain();
        setTimeout(bindChain, 0);
    }
})();

// Storage helpers are available in utils/helpers/ modules (loaded separately in index.html)

/**
 * Refreshes the main token table from localStorage data.
 */
function attachEditButtonListeners() {
    // Edit handler is delegated globally; no direct binding here.
    // This avoids missing handlers after dynamic rerenders and prevents duplicates.

    // Delete token handler is delegated globally (see click.globalDelete).
    // No direct binding here to avoid duplicate confirmations.
}

// Also bind a delegated delete handler to be resilient during scanning and rerenders
$(document).off('click.globalDelete').on('click.globalDelete', '.delete-token-button', function () {
    try {
        const $el = $(this);
        const id = String($el.data('id'));
        if (!id) return;
        const symIn = String($el.data('symbol-in') || '').toUpperCase();
        const symOut = String($el.data('symbol-out') || '').toUpperCase();
        const chain = String($el.data('chain') || '').toUpperCase();
        const cex = String($el.data('cex') || '').toUpperCase();
        const detail = `• Token: ${symIn || '-'}/${symOut || '-'}\n• Chain: ${chain || '-'}\n• CEX: ${cex || '-'}`;
        const ok = confirm(`🗑️ Hapus Koin Ini?\n\n${detail}\n\n⚠️ Tindakan ini tidak dapat dibatalkan. Lanjutkan?`);
        if (!ok) return;

        // Cek apakah scanning sedang berjalan
        const isScanning = (typeof window.isThisTabScanning === 'function' && window.isThisTabScanning()) || false;

        const mode = getAppMode();
        if (mode.type === 'single') {
            let list = getTokensChain(mode.chain);
            const before = list.length;
            list = list.filter(t => String(t.id) !== id);
            setTokensChain(mode.chain, list);
            if (list.length < before) {
                try { setLastAction('HAPUS KOIN'); } catch (_) { }
                if (typeof toast !== 'undefined' && toast.info) toast.info(`PROSES HAPUS KOIN ${symIn} VS ${symOut} BERHASIL`);

                // FIX: Jika sedang scanning, HANYA update total koin tanpa refresh tabel
                if (isScanning) {
                    // Update HANYA angka total koin di header manajemen (tanpa re-render tabel)
                    try { if (typeof updateTokenStatsOnly === 'function') updateTokenStatsOnly(); } catch (_) { }
                    // Update HANYA angka "TOTAL KOIN" di filter card (tanpa re-render filter)
                    try { if (typeof updateTotalKoinOnly === 'function') updateTotalKoinOnly(); } catch (_) { }
                    // FIX: Update progress bar total token
                    try { if (typeof window.decrementScanTotalTokens === 'function') window.decrementScanTotalTokens(); } catch (_) { }
                } else {
                    // Jika TIDAK scanning, update total + refresh tabel
                    try { if (typeof renderTokenManagementList === 'function') renderTokenManagementList(); } catch (_) { }
                    try { if (typeof loadAndDisplaySingleChainTokens === 'function') loadAndDisplaySingleChainTokens(); } catch (_) { }
                }
            }
            try { $el.closest('tr').addClass('row-hidden'); } catch (_) { }
        } else {
            let list = getTokensMulti();
            const before = list.length;
            list = list.filter(t => String(t.id) !== id);
            setTokensMulti(list);
            if (list.length < before) {
                try { setLastAction('HAPUS KOIN'); } catch (_) { }
                if (typeof toast !== 'undefined' && toast.info) toast.info(`PROSES HAPUS KOIN ${symIn} VS ${symOut} BERHASIL`);

                // FIX: Jika sedang scanning, HANYA update total koin tanpa refresh tabel
                if (isScanning) {
                    // Update HANYA angka total koin di header manajemen (tanpa re-render tabel)
                    try { if (typeof updateTokenStatsOnly === 'function') updateTokenStatsOnly(); } catch (_) { }
                    // Update HANYA angka "TOTAL KOIN" di filter card (tanpa re-render filter)
                    try { if (typeof updateTotalKoinOnly === 'function') updateTotalKoinOnly(); } catch (_) { }
                    // FIX: Update progress bar total token
                    try { if (typeof window.decrementScanTotalTokens === 'function') window.decrementScanTotalTokens(); } catch (_) { }
                } else {
                    // Jika TIDAK scanning, update total + refresh tabel
                    try { if (typeof renderTokenManagementList === 'function') renderTokenManagementList(); } catch (_) { }
                    try { if (typeof refreshTokensTable === 'function') refreshTokensTable(); } catch (_) { }
                }
            }
            try { $el.closest('tr').addClass('row-hidden'); } catch (_) { }
        }
    } catch (e) { console.error('Delete error:', e); if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal menghapus koin'); }
});

// Also bind a delegated edit handler so newly rendered rows always work
$(document).off('click.globalEdit').on('click.globalEdit', '.edit-token-button', function () {
    try {
        const id = String($(this).data('id') || '');
        if (!id) { if (typeof toast !== 'undefined' && toast.error) toast.error('ID token tidak ditemukan'); return; }
        if (typeof openEditModalById === 'function') openEditModalById(id);
        else if (typeof toast !== 'undefined' && toast.error) toast.error('Fungsi edit tidak tersedia');
    } catch (e) {
        // console.error('Gagal membuka modal edit:', e);
        if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal membuka form edit');
    }
});

function refreshTokensTable() {
    const storedFilter = getFromLocalStorage('FILTER_MULTICHAIN', null);
    const filtersActive = storedFilter !== null; // null = first load

    const fm = getFilterMulti();
    const chainsSel = (fm.chains || []).map(c => String(c).toLowerCase());
    const cexSel = (fm.cex || []).map(c => String(c).toUpperCase());
    const dexSel = (fm.dex || []).map(d => String(d).toLowerCase());

    // Ambil data ter-flatten dan terurut dari IndexedDB berdasarkan symbol_in (ASC/DESC)
    let flatTokens = (typeof getFlattenedSortedMulti === 'function') ? getFlattenedSortedMulti() : flattenDataKoin(getTokensMulti());

    let filteredByChain = [];
    if (!filtersActive) {
        // First load (no saved FILTER_MULTICHAIN): show all
        filteredByChain = flatTokens;
    } else if (chainsSel.length > 0 && cexSel.length > 0 && dexSel.length > 0) {
        // Combined filter: require both CHAIN and CEX selections
        filteredByChain = flatTokens
            .filter(t => chainsSel.includes(String(t.chain || '').toLowerCase()))
            .filter(t => cexSel.includes(String(t.cex || '').toUpperCase()))
            .filter(t => (t.dexs || []).some(d => dexSel.includes(String(d.dex || '').toLowerCase())));
    } else {
        // One or both groups empty → show none
        filteredByChain = [];
    }

    // Tidak perlu sort ulang di sini; sumber sudah sorted berdasarkan preferensi

    filteredTokens = [...filteredByChain];
    originalTokens = [...filteredByChain];

    // ========== OPTIMIZED: DEFER TABLE RENDERING ==========
    // Use requestIdleCallback or setTimeout for better responsiveness
    const renderTable = () => {
        loadKointoTable(filteredTokens, 'dataTableBody');
        try { window.currentListOrderMulti = Array.isArray(filteredTokens) ? [...filteredTokens] : []; } catch (_) { }
        try { applySortToggleState(); } catch (_) { }
        attachEditButtonListeners(); // Re-attach listeners after table render
    };

    // Defer rendering to allow UI thread to breathe
    if (window.requestIdleCallback) {
        window.requestIdleCallback(renderTable, { timeout: 100 });
    } else {
        setTimeout(renderTable, 0);
    }
    // =====================================================
}

/**
 * Loads and displays the saved tokens for the currently active single chain.
 */
function loadAndDisplaySingleChainTokens() {
    if (!activeSingleChainKey) return;
    // Prefer new key; fallback to old if present (one-time migration semantics)
    let tokens = getTokensChain(activeSingleChainKey);

    // Ambil data ter-flatten dan terurut dari IDB
    let flatTokens = (typeof getFlattenedSortedChain === 'function') ? getFlattenedSortedChain(activeSingleChainKey) : flattenDataKoin(tokens);

    // Apply single-chain filters: CEX, PAIR (persisted in unified settings, fallback legacy)
    try {
        const rawSaved = getFromLocalStorage(`FILTER_${String(activeSingleChainKey).toUpperCase()}`, null);
        const filters = getFilterChain(activeSingleChainKey);
        const selCex = (filters.cex || []).map(x => String(x).toUpperCase());
        const selPair = (filters.pair || []).map(x => String(x).toUpperCase());
        const selDex = (filters.dex || []).map(x => String(x).toLowerCase());

        // Combined filter: if no saved filters yet → show all; otherwise require CEX, PAIR and DEX
        if (!rawSaved) {
            // keep all
        } else if (selCex.length > 0 && selPair.length > 0 && selDex.length > 0) {
            flatTokens = flatTokens.filter(t => selCex.includes(String(t.cex).toUpperCase()));
            flatTokens = flatTokens.filter(t => {
                const chainCfg = CONFIG_CHAINS[(t.chain || '').toLowerCase()] || {};
                const pairDefs = chainCfg.PAIRDEXS || {};
                const p = String(t.symbol_out || '').toUpperCase();
                const mapped = pairDefs[p] ? p : 'NON';
                return selPair.includes(mapped);
            });
            flatTokens = flatTokens.filter(t => (t.dexs || []).some(d => selDex.includes(String(d.dex || '').toLowerCase())));
        } else {
            flatTokens = [];
        }
        // Tidak perlu sort ulang; sudah terurut dari sumber
    } catch (e) { /* debug logs removed */ }

    // Expose current list for search-aware scanning (keep sorted order)
    try { window.singleChainTokensCurrent = Array.isArray(flatTokens) ? [...flatTokens] : []; } catch (_) { }

    // ========== OPTIMIZED: DEFER TABLE RENDERING ==========
    // Use requestIdleCallback or setTimeout for better responsiveness
    const renderTable = () => {
        loadKointoTable(flatTokens, 'dataTableBody');
        try { applySortToggleState(); } catch (_) { }
        attachEditButtonListeners(); // Re-attach listeners after table render
    };

    // Defer rendering to allow UI thread to breathe
    if (window.requestIdleCallback) {
        window.requestIdleCallback(renderTable, { timeout: 100 });
    } else {
        setTimeout(renderTable, 0);
    }
    // =====================================================
}


/**
 * Checks if essential settings and token data are present in storage.
 * @returns {string} The readiness state of the application.
 */
function computeAppReadiness() {
    const okS = hasValidSettings();
    const okT = hasValidTokens();
    if (okS && okT) return 'READY';
    if (!okS && !okT) return 'MISSING_BOTH';
    return okS ? 'MISSING_TOKENS' : 'MISSING_SETTINGS';
}

/**
 * Checks if settings are valid.
 * @returns {boolean}
 */
function hasValidSettings() {
    try {
        const s = getFromLocalStorage(REQUIRED_KEYS.SETTINGS, {});
        if (!s || typeof s !== 'object') return false;

        // Validasi field minimal yang wajib ada
        const nickname = String(s.nickname || '').trim();
        const wallet = String(s.walletMeta || '').trim();
        const jedaGrp = Number(s.jedaTimeGroup);
        const jedaKoin = Number(s.jedaKoin);

        if (!nickname || nickname.length < 6) return false;
        if (!wallet || !wallet.startsWith('0x')) return false;
        if (!Number.isFinite(jedaGrp) || jedaGrp <= 0) return false;
        if (!Number.isFinite(jedaKoin) || jedaKoin <= 0) return false;

        // Pastikan setiap chain memiliki RPC terisi (userRPCs diisi saat simpan setting)
        const chains = Object.keys(window.CONFIG_CHAINS || {});
        const userRPCs = (s && typeof s.userRPCs === 'object') ? s.userRPCs : {};
        if (!chains.every((c) => userRPCs && typeof userRPCs[c] === 'string' && userRPCs[c].trim().length > 0)) {
            return false;
        }

        return true;
    } catch (_) { return false; }
}

/**
 * Checks if token data is valid.
 * @returns {boolean}
 */
function hasValidTokens() {
    const m = getAppMode();
    if (m && m.type === 'single') {
        const t = getTokensChain(m.chain);
        return Array.isArray(t) && t.length > 0;
    } else {
        const t = getTokensMulti();
        return Array.isArray(t) && t.length > 0;
    }
}

/**
 * Dynamically render CEX API key input fields based on CONFIG_CEX
 * Generates input cards for each CEX with proper styling and passphrase support
 */
function renderCEXAPIKeyInputs() {
    const container = document.getElementById('cex-api-keys-container');
    if (!container) {
        console.warn('[CEX Settings] Container #cex-api-keys-container not found');
        return;
    }

    const cexList = (typeof CONFIG_CEX !== 'undefined') ? Object.keys(CONFIG_CEX) : [];

    if (cexList.length === 0) {
        container.innerHTML = '<p class="uk-text-muted uk-text-small">No CEX configured in CONFIG_CEX</p>';
        return;
    }

    const requiresPassphrase = ['KUCOIN', 'BITGET'];

    const hexToRgba = (hex, alpha = 0.08) => {
        hex = hex.replace('#', '');
        if (hex.length > 6) hex = hex.substring(0, 6);
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    let html = '<div class="uk-grid-small uk-child-width-1-2@s" uk-grid>';
    cexList.forEach(cex => {
        const cexConfig = CONFIG_CEX[cex];
        const color = cexConfig.WARNA || '#333';
        const needsPassphrase = requiresPassphrase.includes(cex);

        html += `
            <div>
              <div style="background: ${hexToRgba(color)}; border-left: 3px solid ${color}; padding: 6px 8px; margin-bottom: 4px; border-radius: 4px;">
                <div class="uk-text-small uk-text-bold" style="color: ${color}; margin-bottom: 4px;">
                  <span uk-icon="icon: credit-card; ratio: 0.7"></span> ${cex}
                </div>
                <input type="text" class="uk-input uk-form-small" style="margin-bottom: 3px; font-size: 0.78rem;" id="cex_apikey_${cex}"
                  placeholder="API Key" aria-label="${cex} API Key">
                <input type="password" class="uk-input uk-form-small" style="margin-bottom: ${needsPassphrase ? '3px' : '0'}; font-size: 0.78rem;" id="cex_secret_${cex}" placeholder="Secret Key"
                  aria-label="${cex} Secret">
                ${needsPassphrase ? `<input type="password" class="uk-input uk-form-small" style="font-size: 0.78rem;" id="cex_passphrase_${cex}"
                  placeholder="Passphrase (Required)" aria-label="${cex} Passphrase">` : ''}
              </div>
            </div>
        `;
    });
    html += '</div>';

    container.innerHTML = html;
    console.log(`[CEX Settings] Generated ${cexList.length} CEX input field(s):`, cexList);

    loadCEXApiKeys();
}

/**
 * Load CEX API Keys from IndexedDB and populate input fields
 */
function loadCEXApiKeys() {
    try {
        const cexKeys = getFromLocalStorage('CEX_API_KEYS', {});
        const loadedCount = Object.keys(cexKeys).length;

        if (loadedCount > 0) {
            console.log(`[CEX Settings] Loading ${loadedCount} CEX API key(s):`, Object.keys(cexKeys));

            Object.entries(cexKeys).forEach(([cex, credentials]) => {
                $(`#cex_apikey_${cex}`).val(credentials.ApiKey || '');
                $(`#cex_secret_${cex}`).val(credentials.ApiSecret || '');
                if (credentials.Passphrase) {
                    $(`#cex_passphrase_${cex}`).val(credentials.Passphrase);
                }
            });
        } else {
            console.log('[CEX Settings] No CEX API keys configured yet');
        }
    } catch (error) {
        console.error('[CEX Settings] Failed to load CEX API keys:', error);
    }
}

/**
 * Renders the Settings form: generates CEX/DEX delay inputs and API key fields,
 * and preloads saved values from storage.
 */
function renderSettingsForm() {
    // ✅ CLEANUP: Remove deleted DEX and Meta-DEX from saved settings before rendering
    try {
        const s = getFromLocalStorage('SETTING_SCANNER', {});
        if (s && typeof s === 'object' && s.JedaDexs) {
            // Force remove legacy/deleted DEX keys that no longer exist
            // ✅ FIXED: 'fly' is NOT a DEX name (it's internal LIFI slug), must be removed from settings
            const forceRemoveDexs = ['0x', 'dzap', 'fly', '1inch'];

            // Get list of active DEX (not disabled, not Meta-DEX)
            const activeDexKeys = Object.keys(CONFIG_DEXS || {}).filter(key => {
                const dexConfig = CONFIG_DEXS[key];
                return !dexConfig.disabled && !dexConfig.isMetaDex;
            });

            let hasChanges = false;
            Object.keys(s.JedaDexs).forEach(dexKey => {
                // Remove if: not in active list OR in force remove list
                if (!activeDexKeys.includes(dexKey) || forceRemoveDexs.includes(dexKey.toLowerCase())) {
                    console.log(`[Settings Cleanup] Removing deleted/meta DEX: ${dexKey}`);
                    delete s.JedaDexs[dexKey];
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                saveToLocalStorage('SETTING_SCANNER', s);
            }
        }
    } catch (e) {
        console.warn('[Settings Cleanup] Failed:', e.message);
    }

    // ✅ Generate DEX delay inputs - 100% dari CONFIG_DEXS (NO HARDCODE!)
    // Filter: disabled=false AND isMetaDex=false
    // Exclude: lifi, rubic, rango, kamino (Meta-DEX)
    // ⚠️ NOTE: 'fly' bukan DEX name! Hanya ada 'flytrade' di CONFIG_DEXS
    const activeDexList = Object.keys(CONFIG_DEXS || {})
        .filter(dexKey => {
            const dexConfig = CONFIG_DEXS[dexKey];
            const isActive = !dexConfig.disabled && !dexConfig.isMetaDex;

            // ✅ EXTRA VALIDATION: Block legacy/invalid keys
            const invalidKeys = ['fly', '0x', 'dzap', 'paraswap', '1inch'];
            if (invalidKeys.includes(dexKey.toLowerCase())) {
                console.warn(`[Settings] Skipping invalid DEX key: ${dexKey}`);
                return false;
            }

            return isActive;
        })
        .sort();

    // ✅ DEBUG: Log active DEX list untuk troubleshooting
    console.log('[Settings] Active DEX list from CONFIG_DEXS:', activeDexList);
    console.log('[Settings] Total active DEX count:', activeDexList.length);

    let dexDelayHtml = '';

    activeDexList.forEach(dexKey => {
        const dexConfig = CONFIG_DEXS[dexKey] || {};
        const dexLabel = (dexConfig.label || dexKey).toUpperCase();  // ✅ UPPERCASE semua
        const dexColor = dexConfig.warna || '#333';

        // ✅ SOLANA BADGE: Show badge for DEXs that support Solana chain
        const solanaBadge = dexConfig.supportsSolana
            ? '<span style="background:#6b21a8; color:white; padding:1px 6px; border-radius:4px; font-size:10px; margin-left:6px; font-weight:bold;">SOLANA</span>'
            : '';

        dexDelayHtml += `
            <div class="uk-card uk-card-small uk-card-default" style="border-left: 4px solid ${dexColor}; margin-bottom: 4px;">
                <div style="padding: 4px 8px;">
                    <div class="uk-flex uk-flex-between uk-flex-middle">
                        <label class="uk-text-bold uk-margin-remove" style="color: ${dexColor}; font-size: 12px;">
                            ${dexLabel}${solanaBadge}
                        </label>
                        <div class="uk-flex uk-flex-middle" style="gap: 4px;">
                            <input type="number" class="uk-input uk-form-small dex-delay-input"
                                   data-dex="${dexKey}"
                                   value="${dexConfig.delay || 150}"
                                   style="width:60px; text-align:center; border-color: ${dexColor}40; padding: 2px 4px;"
                                   min="0">
                            <span class="uk-text-meta" style="font-size: 10px;">ms</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    $('#dex-delay-group').html(dexDelayHtml);

    // Load existing settings
    const appSettings = getFromLocalStorage('SETTING_SCANNER') || {};
    console.log('[SETTINGS LOAD] Full settings:', appSettings);
    console.log('[SETTINGS LOAD] matchaApiKeys:', appSettings.matchaApiKeys);

    $('#user').val(appSettings.nickname || '');
    $('#jeda-time-group').val(appSettings.jedaTimeGroup || 2000);
    $('#jeda-koin').val(appSettings.jedaKoin || 500);
    $('#walletMeta').val(appSettings.walletMeta || '');

    // ✅ Load Matcha API keys (convert comma-separated to newline for better readability)
    if (appSettings.matchaApiKeys) {
        const keysForDisplay = appSettings.matchaApiKeys.split(',').join('\n');
        console.log('[SETTINGS LOAD] Keys to display:', keysForDisplay);
        $('#matchaApiKeys').val(keysForDisplay);
        console.log('[SETTINGS LOAD] Field value after set:', $('#matchaApiKeys').val());
    } else {
        console.log('[SETTINGS LOAD] No matchaApiKeys found, setting empty');
        $('#matchaApiKeys').val('');
    }

    // ✅ Verify field exists in DOM
    console.log('[SETTINGS LOAD] matchaApiKeys field exists:', $('#matchaApiKeys').length > 0);

    // ✅ NEW: Render CEX API Key inputs and load saved values
    renderCEXAPIKeyInputs();

    $(`input[name=\"koin-group\"][value=\"${appSettings.scanPerKoin || 5}\"]`).prop('checked', true);

    // ✅ NEW: Restore checkbox scanner controls
    if (appSettings.autoRun !== undefined) {
        $('#autoRunToggle').prop('checked', appSettings.autoRun);
    }
    if (appSettings.autoVol !== undefined) {
        $('#checkVOL').prop('checked', appSettings.autoVol);
    }
    if (appSettings.walletCex !== undefined) {
        $('#checkWalletCEX').prop('checked', appSettings.walletCex);
    }
    if (appSettings.autoLevel !== undefined) {
        $('#autoVolToggle').prop('checked', appSettings.autoLevel);
    }
    if (appSettings.autoLevelValue !== undefined) {
        $('#autoVolLevels').val(appSettings.autoLevelValue);
    }

    // Apply saved DEX delay values (CEX delay removed)
    const modalDexs = appSettings.JedaDexs || {};
    $('.dex-delay-input').each(function () {
        const dex = $(this).data('dex');
        if (modalDexs[dex] !== undefined) $(this).val(modalDexs[dex]);
    });

    // Generate RPC settings inputs with chain colors (compact horizontal layout)
    const chainList = Object.keys(CONFIG_CHAINS || {}).sort();
    // Get initial RPC values from database migrator (not hardcoded anymore)
    const getInitialRPC = (chain) => {
        if (window.RPCDatabaseMigrator && window.RPCDatabaseMigrator.INITIAL_RPC_VALUES) {
            return window.RPCDatabaseMigrator.INITIAL_RPC_VALUES[chain] || '';
        }
        return '';
    };
    let rpcHtml = '';

    chainList.forEach(chain => {
        const cfg = CONFIG_CHAINS[chain];
        const suggestedRpc = getInitialRPC(chain);
        const chainLabel = (cfg.Nama_Chain || chain).toUpperCase();
        const chainColor = cfg.WARNA || '#333';
        const chainIcon = cfg.ICON || '';

        rpcHtml += `
            <div class="uk-margin-small-bottom" style="border-left: 3px solid ${chainColor}; padding-left: 8px; padding-top: 4px; padding-bottom: 4px; background: ${chainColor}08;">
                <div class="uk-grid-small uk-flex-middle" uk-grid>
                    <div class="uk-width-auto">
                        <div class="uk-flex uk-flex-middle">
                            ${chainIcon ? `<img src="${chainIcon}" alt="${chainLabel}" style="width:16px; height:16px; margin-right:6px; border-radius:50%;">` : ''}
                            <label class="uk-text-bold uk-margin-remove" style="color: ${chainColor}; font-size: 13px; min-width: 90px;">
                                ${chainLabel}
                            </label>
                        </div>
                    </div>
                    <div class="uk-width-expand">
                        <input type="text" class="uk-input uk-form-small rpc-input"
                               data-chain="${chain}"
                               placeholder="${suggestedRpc}"
                               value=""
                               style="font-size:12px; font-family: monospace; border-color: ${chainColor}40; padding: 4px 8px; height: 28px;">
                        <small class="uk-text-muted" style="font-size: 10px;">Default: ${suggestedRpc || 'N/A'}</small>
                    </div>
                </div>
            </div>
        `;
    });
    $('#rpc-settings-group').html(rpcHtml);

    // Load user RPCs dari setting (jika ada), atau auto-fill dengan default
    const userRPCs = appSettings.userRPCs || {};
    $('.rpc-input').each(function () {
        const chain = $(this).data('chain');
        if (userRPCs[chain]) {
            // User sudah punya custom RPC
            $(this).val(userRPCs[chain]);
        } else {
            // Auto-fill dengan default suggestion untuk kemudahan user
            const initialRPC = getInitialRPC(chain);
            if (initialRPC) $(this).val(initialRPC);
        }
    });

}

/**
 * Initializes the application on DOM content load.
 * Sets up controls based on readiness state.
 */
function bootApp() {
    // One-time migration: remove deprecated CEX delay settings from storage
    try {
        const s = getFromLocalStorage('SETTING_SCANNER', {});
        if (s && typeof s === 'object' && s.JedaCexs) {
            delete s.JedaCexs;
            saveToLocalStorage('SETTING_SCANNER', s);
        }
    } catch (_) { }

    // ✅ ONE-TIME CLEANUP: Remove 'fly' from existing JedaDexs (it's not a DEX, just an internal LIFI slug)
    try {
        const s = getFromLocalStorage('SETTING_SCANNER', {});
        if (s && typeof s === 'object' && s.JedaDexs) {
            const beforeKeys = Object.keys(s.JedaDexs);
            if (s.JedaDexs['fly']) {
                console.warn('[Cleanup] ⚠️ Found legacy "fly" key in JedaDexs - REMOVING...');
                delete s.JedaDexs['fly'];
                saveToLocalStorage('SETTING_SCANNER', s);
                console.log('[Cleanup] ✅ "fly" removed successfully');
            }
            console.log('[Cleanup] JedaDexs keys before:', beforeKeys);
            console.log('[Cleanup] JedaDexs keys after:', Object.keys(s.JedaDexs));
        }
    } catch (e) {
        console.error('[Cleanup] Error removing fly:', e);
    }

    // ✅ CLEANUP: Remove disabled/inactive DEX and Meta-DEX from JedaDexs
    try {
        const s = getFromLocalStorage('SETTING_SCANNER', {});
        if (s && typeof s === 'object' && s.JedaDexs) {
            // Legacy/invalid DEX keys yang harus di-remove (tidak ada di CONFIG_DEXS)
            // ✅ 'fly' = internal LIFI slug (bukan DEX standalone)
            // ✅ '0x' = diganti jadi 'matcha'
            // ✅ 'dzap' = removed (jadi provider internal saja)
            // ✅ '1inch' = removed (diganti jadi 'relay')
            const forceRemoveDexs = ['fly', '0x', 'dzap', 'paraswap', '1inch'];

            // Get list of active DEX from CONFIG_DEXS (disabled=false AND isMetaDex=false)
            const activeDexKeys = Object.keys(CONFIG_DEXS || {}).filter(key => {
                const cfg = CONFIG_DEXS[key];
                return !cfg.disabled && !cfg.isMetaDex;
            });

            console.log('[Cleanup] Active DEX from CONFIG_DEXS:', activeDexKeys);
            console.log('[Cleanup] Current JedaDexs keys:', Object.keys(s.JedaDexs));

            // Remove invalid/inactive DEX keys
            let hasChanges = false;
            const removedKeys = [];

            Object.keys(s.JedaDexs).forEach(dexKey => {
                const isInvalid = forceRemoveDexs.includes(dexKey.toLowerCase());
                const isInactive = !activeDexKeys.includes(dexKey);

                if (isInvalid || isInactive) {
                    console.warn(`[Cleanup] ⚠️ Removing ${isInvalid ? 'INVALID' : 'INACTIVE'} DEX: ${dexKey}`);
                    delete s.JedaDexs[dexKey];
                    removedKeys.push(dexKey);
                    hasChanges = true;
                }
            });

            // Save if changes were made
            if (hasChanges) {
                saveToLocalStorage('SETTING_SCANNER', s);
                console.log(`[Cleanup] ✅ Removed ${removedKeys.length} invalid DEX:`, removedKeys);
                console.log('[Cleanup] ✅ Final JedaDexs keys:', Object.keys(s.JedaDexs));
            } else {
                console.log('[Cleanup] ✅ No cleanup needed - all DEX keys are valid');
            }
        }
    } catch (e) {
        console.warn('[Cleanup] Failed to clean up inactive DEX:', e.message);
    }
    const state = computeAppReadiness();
    // REFACTORED
    if (typeof applyThemeForMode === 'function') applyThemeForMode();
    applyControlsFor(state);

    const appSettings = getFromLocalStorage('SETTING_SCANNER', {});
    const settingsMissing = !hasValidSettings();
    const nicknameInvalid = !appSettings.nickname || String(appSettings.nickname).trim().length < 6;

    // Checkbox restore moved to app-init.js (AFTER DOM ready)

    if (settingsMissing) {
        // Jika pengaturan dasar (API keys, dll) tidak ada, paksa buka form setting.
        // Populate settings form when auto-shown and ensure it's enabled
        if (typeof renderSettingsForm === 'function') renderSettingsForm();
        $('#form-setting-app').show();
        $('#scanner-config, #token-management, #iframe-container').hide();
        try {
            if (window.SnapshotModule?.hide) window.SnapshotModule.hide();
        } catch (_) { }
        if ($('#dataTableBody').length) { $('#dataTableBody').closest('.uk-overflow-auto').hide(); }
        if ($('#form-setting-app').length && $('#form-setting-app')[0] && typeof $('#form-setting-app')[0].scrollIntoView === 'function') {
            $('#form-setting-app')[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } else if (nicknameInvalid) {
        // Jika hanya nickname yang tidak valid, paksa buka halaman Setting agar user segera memperbaiki.
        if (typeof toast !== 'undefined' && toast.warning) toast.warning('Nickname harus diisi (minimal 6 karakter)! Silakan perbarui di menu Setting.');
        if (typeof renderSettingsForm === 'function') renderSettingsForm();
        $('#form-setting-app').show();
        $('#scanner-config, #token-management, #iframe-container').hide();
        try { if (window.SnapshotModule?.hide) window.SnapshotModule.hide(); } catch (_) { }
        if ($('#dataTableBody').length) { $('#dataTableBody').closest('.uk-overflow-auto').hide(); }
        try { if ($('#form-setting-app')[0] && typeof $('#form-setting-app')[0].scrollIntoView === 'function') { $('#form-setting-app')[0].scrollIntoView({ behavior: 'smooth', block: 'start' }); } } catch (_) { }
    } else {
        // Show the main scanner view by default if settings are complete
        showMainSection('scanner');
    }
    if (state === 'READY') {
        // REFACTORED
        if (typeof cekDataAwal === 'function') { cekDataAwal(); } else { /* debug logs removed */ }
    } else {
        if (window.toastr) {
            if (typeof toast !== 'undefined') {
                if (state === 'MISSING_SETTINGS' && toast.warning) toast.warning('Lengkapi SETTING terlebih dahulu');
                else if (state === 'MISSING_TOKENS' && toast.warning) toast.warning('Tambah/Import/Sinkronisasi KOIN terlebih dahulu');
                else if (toast.error) toast.error('LAKUKAN SETTING APLIKASI & LENGKAPI DATA KOIN TOKEN');
            }
        }
    }
}

/**
 * Performs the initial data check and renders the UI.
 */
function cekDataAwal() {
    let info = true;
    let errorMessages = [];

    const mBoot = getAppMode();
    let DataTokens = (mBoot.type === 'single') ? getTokensChain(mBoot.chain) : getTokensMulti();
    let SavedSettingData = getFromLocalStorage('SETTING_SCANNER', {});

    if (!Array.isArray(DataTokens) || DataTokens.length === 0) {
        errorMessages.push("❌ Tidak ada data token yang tersedia.");
        if (typeof toast !== 'undefined' && toast.error) toast.error("Tidak ada data token yang tersedia");
        if (typeof scanner_form_off !== 'undefined') scanner_form_off();
        info = false;
    }

    if (!SavedSettingData || Object.keys(SavedSettingData).length === 0) {
        errorMessages.push("⚠️ Cek SETTINGAN aplikasi {USERNAME, WALLET ADDRESS, JEDA}!");
        $("#SettingConfig").addClass("icon-wrapper");
        form_off();
        info = false;
    }

    if (info) {
        // debug logs removed
        // Use new modular filter card + loaders
        // REFACTORED
        if (typeof refreshTokensTable === 'function') { refreshTokensTable(); }
    }

    const managedChains = Object.keys(CONFIG_CHAINS || {});
    if (managedChains.length > 0) {
        const chainParam = encodeURIComponent(managedChains.join(','));
        const link = $('a[href="index.html"]');
        if (link.length > 0) {
            let href = link.attr('href') || '';
            href = href.split('?')[0] || 'index.html';
            link.attr('href', `${href}?chains=${chainParam}`);
        }
    }

    if (!info) {
        $("#infoAPP").show().html(errorMessages.join("<br/>"));
    }

    try { updateInfoFromHistory(); } catch (_) { }
}


// --- Main Execution ---

/**
 * Deferred initializations to run after critical path rendering.
 */
async function deferredInit() {
    try { if (window.whenStorageReady) await window.whenStorageReady; } catch (_) { }
    bootApp();

    // Build unified filter card based on mode
    function getMode() { const m = getAppMode(); return { mode: m.type === 'single' ? 'single' : 'multi', chain: m.chain }; }

    // Helper: Convert hex to rgba
    function hexToRgba(hex, alpha = 1) {
        if (!hex) return null;
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Helper: Darken color for gradient
    function darkenColor(hex, percent = 30) {
        if (!hex) return '#000';
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);

        r = Math.max(0, Math.floor(r * (1 - percent / 100)));
        g = Math.max(0, Math.floor(g * (1 - percent / 100)));
        b = Math.max(0, Math.floor(b * (1 - percent / 100)));

        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    // Helper: Calculate brightness and determine text color (white or black)
    function getContrastTextColor(hex) {
        if (!hex) return '#000';
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        // Calculate relative luminance (WCAG formula)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Return white for dark backgrounds, black for light backgrounds
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    function chipHtml(cls, id, label, color, count, checked, dataVal, disabled = false) {
        const badge = typeof count === 'number' ? ` <span style="font-weight:bolder;">[${count}]</span>` : '';
        const dval = (typeof dataVal !== 'undefined' && dataVal !== null) ? dataVal : label;
        const styleDis = disabled ? 'opacity:0.5; pointer-events:none;' : '';

        // Create data attribute for color to be used by CSS
        const colorData = color ? `data-color="${color}"` : '';

        return `<label class="uk-text-small ${cls}" data-val="${dval}" ${colorData} style="display:inline-flex;align-items:center;cursor:pointer;${styleDis}">
            <input type="checkbox" class="uk-checkbox" id="${id}" ${checked && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <span style="${color ? `color:${color};` : ''} padding-left:4px; font-weight:bolder;">${label}</span>&nbsp;${badge}
        </label>`;
    }

    /**
     * Update HANYA angka "TOTAL KOIN" di badge tanpa re-render seluruh filter card.
     * Digunakan saat delete koin selama scanning untuk menghindari refresh filter.
     */
    function updateTotalKoinOnly() {
        const $badge = $('#total-koin-badge');
        if (!$badge.length) return; // Badge belum ada

        const m = getMode();
        let total = 0;

        if (m.mode === 'multi') {
            const fmNow = getFilterMulti();
            const chainsSel = fmNow.chains || [];
            const cexSel = fmNow.cex || [];
            const dexSel = (fmNow.dex || []).map(x => String(x).toLowerCase());
            const flat = flattenDataKoin(getTokensMulti()) || [];
            const saved = getFromLocalStorage('FILTER_MULTICHAIN', null);

            if (!saved) {
                total = flat.length;
            } else if (chainsSel.length > 0 && cexSel.length > 0 && dexSel.length > 0) {
                total = flat.filter(t => chainsSel.includes(String(t.chain || '').toLowerCase()))
                    .filter(t => cexSel.includes(String(t.cex || '').toUpperCase()))
                    .filter(t => (t.dexs || []).some(d => dexSel.includes(String(d.dex || '').toLowerCase())))
                    .length;
            } else {
                total = 0;
            }
        } else {
            const chain = m.chain;
            const saved = getFilterChain(chain);
            const cexSel = saved.cex || [];
            const pairSel = saved.pair || [];
            const dexSel = (saved.dex || []).map(x => String(x).toLowerCase());
            const flat = flattenDataKoin(getTokensChain(chain)) || [];
            const pairDefs = (CONFIG_CHAINS[chain] || {}).PAIRDEXS || {};

            if (cexSel.length && pairSel.length && dexSel.length) {
                total = flat.filter(t => cexSel.includes(String(t.cex || '').toUpperCase()))
                    .filter(t => {
                        const p = String(t.symbol_out || '').toUpperCase();
                        const key = pairDefs[p] ? p : 'NON';
                        return pairSel.includes(key);
                    })
                    .filter(t => (t.dexs || []).some(d => dexSel.includes(String(d.dex || '').toLowerCase())))
                    .length;
            } else {
                total = 0;
            }
        }

        // Update HANYA text badge, tidak render ulang filter
        $badge.text(`TOTAL KOIN: ${total}`);
    }

    // Expose to window for access from event handlers
    if (typeof window !== 'undefined') {
        window.updateTotalKoinOnly = updateTotalKoinOnly;
    }

    function renderFilterCard() {
        const $wrap = $('#filter-groups'); if (!$wrap.length) return; $wrap.empty();
        const m = getMode();
        const settings = getFromLocalStorage('SETTING_SCANNER', {}) || {};
        const $headLabels = $('#filter-head-labels');
        const $hdr = $('#current-chain-label');
        if ($hdr.length) {
            if (m.mode === 'single') {
                const cfg = (CONFIG_CHAINS && CONFIG_CHAINS[m.chain]) ? CONFIG_CHAINS[m.chain] : null;
                const label = (cfg?.Nama_Pendek || cfg?.Nama_Chain || m.chain || 'CHAIN').toString().toUpperCase();
                const color = cfg?.WARNA || '#333';
                $hdr.text(`[${label}]`).css('color', color);
            } else {
                $hdr.text('[ALL]').css('color', '#666');
            }
        }
        // Build right-side group (total) aligned to the right (sync button moved to token management)
        const createRightGroup = () => $('<div  class="uk-flex uk-flex-middle uk-text-muted" style="gap:6px; margin-left:auto;"></div>');
        let $right = createRightGroup();

        // Determine accent color based on mode
        let accentColor = '#5c9514'; // Default for multi-chain
        if (m.mode === 'single') {
            const cfg = (CONFIG_CHAINS && CONFIG_CHAINS[m.chain]) ? CONFIG_CHAINS[m.chain] : null;
            accentColor = cfg?.WARNA || '#333';
        }

        let $sum = $(`<span id="total-koin-badge" class="uk-text-small" style="font-weight:bolder; color: white; background-color: ${accentColor}; padding: 2px 8px; border-radius: 4px;">TOTAL KOIN: 0</span>`);
        if (m.mode === 'multi') {
            const fmNow = getFilterMulti();
            // FIX: Don't default to all chains, respect the user's saved empty selection.
            const chainsSel = fmNow.chains || [];
            const cexSel = fmNow.cex || [];
            const dexSel = (fmNow.dex || []).map(x => String(x).toLowerCase());
            const flat = flattenDataKoin(getTokensMulti()) || [];
            const byChain = flat.reduce((a, t) => { const k = String(t.chain || '').toLowerCase(); a[k] = (a[k] || 0) + 1; return a; }, {});
            const byCex = flat.filter(t => (chainsSel.length === 0 || chainsSel.includes(String(t.chain || '').toLowerCase())))
                .reduce((a, t) => { const k = String(t.cex || '').toUpperCase(); a[k] = (a[k] || 0) + 1; return a; }, {});
            const flatForDex = flat
                .filter(t => (chainsSel.length === 0 || chainsSel.includes(String(t.chain || '').toLowerCase())))
                .filter(t => (cexSel.length === 0 || cexSel.includes(String(t.cex || '').toUpperCase())));
            const byDex = flatForDex.reduce((a, t) => {
                (t.dexs || []).forEach(d => { const k = String(d.dex || '').toLowerCase(); a[k] = (a[k] || 0) + 1; });
                return a;
            }, {});
            const $secChain = $('<div class="uk-flex uk-flex-middle" style="gap:8px;flex-wrap:wrap;"><b>CHAIN:</b></div>');
            Object.keys(CONFIG_CHAINS || {}).forEach(k => {
                const short = (CONFIG_CHAINS[k].Nama_Pendek || k.substr(0, 3)).toUpperCase();
                const id = `fc-chain-${k}`; const cnt = byChain[k] || 0;
                if (cnt === 0) return; // hide chips with [0]
                const checked = chainsSel.includes(k.toLowerCase());
                $secChain.append(chipHtml('fc-chain', id, short, CONFIG_CHAINS[k].WARNA, cnt, checked, k.toLowerCase(), false));
            });
            const $secCex = $('<div class="uk-flex uk-flex-middle" style="gap:8px;flex-wrap:wrap;"><span class="uk-text-danger">EXCH:</span></div>');
            Object.keys(CONFIG_CEX || {}).forEach(cx => {
                const id = `fc-cex-${cx}`; const cnt = byCex[cx] || 0; if (cnt === 0) return; const checked = cexSel.includes(cx.toUpperCase());
                $secCex.append(chipHtml('fc-cex', id, cx, CONFIG_CEX[cx].WARNA, cnt, checked, cx, false));
            });
            const $secDex = $('<div class="uk-flex uk-flex-middle" style="gap:8px;flex-wrap:wrap;"><span class="uk-text-bolder uk-text-danger">DEX:</span></div>');
            // ✅ Filter: Hanya tampilkan DEX asli (not disabled, not Meta-DEX)
            // Meta-DEX hanya muncul jika CONFIG_APP.APP.META_DEX === true
            const metaDexEnabled = (CONFIG_APP && CONFIG_APP.APP && CONFIG_APP.APP.META_DEX === true);
            Object.keys(CONFIG_DEXS || {}).forEach(dx => {
                const dexConfig = CONFIG_DEXS[dx];
                // Skip jika disabled
                if (dexConfig.disabled) return;
                // Skip Meta-DEX jika META_DEX disabled
                if (dexConfig.isMetaDex && !metaDexEnabled) return;

                const key = String(dx).toLowerCase();
                const id = `fc-dex-${key}`; const cnt = byDex[key] || 0; if (cnt === 0) return; const checked = dexSel.includes(key);
                const col = (dexConfig.warna || dexConfig.WARNA) || '#333';
                $secDex.append(chipHtml('fc-dex', id, dx.toUpperCase(), col, cnt, checked, key, false));
            });
            if ($headLabels.length)
                $wrap.append($secChain).append($('<div class=\"uk-text-muted\">|</div>')).append($secCex).append($('<div class=\"uk-text-muted\">|</div>')).append($secDex);
            const saved = getFromLocalStorage('FILTER_MULTICHAIN', null);
            let total = 0;
            if (!saved) {
                total = flat.length;
            } else if (chainsSel.length > 0 && cexSel.length > 0 && ((fmNow.dex || []).length > 0)) {
                total = flat.filter(t => chainsSel.includes(String(t.chain || '').toLowerCase()))
                    .filter(t => cexSel.includes(String(t.cex || '').toUpperCase()))
                    .filter(t => (t.dexs || []).some(d => (dexSel || []).includes(String(d.dex || '').toLowerCase())))
                    .length;
            } else {
                total = 0;
            }
            $sum.text(`TOTAL KOIN: ${total}`);
            $right.append($sum);
            // Search input now in HTML (next to WALLET CEX checkbox)
            $wrap.append($right);
            $('#modal-filter-sections').off('change.multif').on('change.multif', 'label.fc-chain input, label.fc-cex input, label.fc-dex input', function () {
                const prev = getFilterMulti();
                const prevChains = (prev.chains || []).map(s => String(s).toLowerCase());
                const prevCex = (prev.cex || []).map(s => String(s).toUpperCase());
                const prevDex = (prev.dex || []).map(s => String(s).toLowerCase());

                const chains = $('#modal-filter-sections').find('label.fc-chain input:checked').map(function () { return $(this).closest('label').attr('data-val').toLowerCase(); }).get();
                const cex = $('#modal-filter-sections').find('label.fc-cex input:checked').map(function () { return $(this).closest('label').attr('data-val').toUpperCase(); }).get();
                const dex = $('#modal-filter-sections').find('label.fc-dex input:checked').map(function () { return $(this).closest('label').attr('data-val').toLowerCase(); }).get();

                setFilterMulti({ chains, cex, dex });

                // Build detailed toast message
                const addChains = chains.filter(x => !prevChains.includes(x)).map(x => x.toUpperCase());
                const delChains = prevChains.filter(x => !chains.includes(x)).map(x => x.toUpperCase());
                const addCex = cex.filter(x => !prevCex.includes(x));
                const delCex = prevCex.filter(x => !cex.includes(x));
                const addDex = dex.filter(x => !prevDex.includes(x)).map(x => x.toUpperCase());
                const delDex = prevDex.filter(x => !dex.includes(x)).map(x => x.toUpperCase());
                const parts = [];
                if (addChains.length) parts.push(`+CHAIN: ${addChains.join(', ')}`);
                if (delChains.length) parts.push(`-CHAIN: ${delChains.join(', ')}`);
                if (addCex.length) parts.push(`+CEX: ${addCex.join(', ')}`);
                if (delCex.length) parts.push(`-CEX: ${delCex.join(', ')}`);
                if (addDex.length) parts.push(`+DEX: ${addDex.join(', ')}`);
                if (delDex.length) parts.push(`-DEX: ${delDex.join(', ')}`);
                const msg = parts.length ? parts.join(' | ') : `Filter MULTI diperbarui: CHAIN=${chains.length}, CEX=${cex.length}`;
                try { if (typeof toast !== 'undefined' && toast.info) toast.info(msg); } catch (_) { }

                // searchInput in filter card is now used for both monitoring and management tables
                // Also clear any existing signal cards produced by a previous scan
                try { if (typeof window.clearSignalCards === 'function') window.clearSignalCards(); } catch (_) { }
                refreshTokensTable();
                try { renderTokenManagementList(); } catch (_) { }
                renderFilterCard();
            });
        } else {
            const chain = m.chain;
            // FIX: Load from the correct getFilterChain function instead of SETTING_SCANNER
            const saved = getFilterChain(chain);
            const cexSel = saved.cex || [];
            const pairSel = saved.pair || [];
            const dexSel = (saved.dex || []).map(x => String(x).toLowerCase());

            const flat = flattenDataKoin(getTokensChain(chain)) || [];
            const byCex = flat.reduce((a, t) => { const k = String(t.cex || '').toUpperCase(); a[k] = (a[k] || 0) + 1; return a; }, {});
            const pairDefs = (CONFIG_CHAINS[chain] || {}).PAIRDEXS || {};
            const flatPair = (cexSel.length ? flat.filter(t => cexSel.includes(String(t.cex || '').toUpperCase())) : flat);
            const byPair = flatPair.reduce((a, t) => {
                const p = String(t.symbol_out || '').toUpperCase().trim();
                const k = pairDefs[p] ? p : 'NON';
                a[k] = (a[k] || 0) + 1;
                return a;
            }, {});
            const $secCex = $('<div class="uk-flex uk-flex-middle" style="gap:8px;flex-wrap:wrap;"><span class="uk-text-bolder uk-text-primary">EXCH:</span></div>');
            const relevantCexs = (CONFIG_CHAINS[chain] && CONFIG_CHAINS[chain].WALLET_CEX) ? Object.keys(CONFIG_CHAINS[chain].WALLET_CEX) : [];
            relevantCexs.forEach(cx => {
                const id = `sc-cex-${cx}`; const cnt = byCex[cx] || 0;
                if (cnt === 0) return; // hide chips with 0 token
                const checked = cexSel.includes(cx);
                $secCex.append(chipHtml('sc-cex', id, cx, (CONFIG_CEX[cx] || {}).WARNA, cnt, checked, undefined, false));
            });
            const $secPair = $('<div class="uk-flex uk-flex-middle" style="gap:8px;flex-wrap:wrap;"><span class="uk-text-bolder uk-text-success">PAIR:</span></div>');
            const pairs = Array.from(new Set([...Object.keys(pairDefs), 'NON']));
            pairs.forEach(p => {
                const id = `sc-pair-${p}`; const cnt = byPair[p] || 0;
                if (cnt === 0) return; // hide chips with 0 token
                const checked = pairSel.includes(p);
                // Set warna hitam untuk NON, kosong untuk pair lainnya
                const pairColor = (p === 'NON') ? '#000' : '';
                $secPair.append(chipHtml('sc-pair', id, p, pairColor, cnt, checked, undefined, false));
            });
            // DEX chips based on chain-allowed DEXes and filtered dataset
            const $secDex = $('<div class="uk-flex uk-flex-middle" style="gap:8px;flex-wrap:wrap;"><span class="uk-text-bolder uk-text-danger">DEX:</span></div>');
            const dexAllowed = ((CONFIG_CHAINS[chain] || {}).DEXS || []).map(x => String(x).toLowerCase());
            const byDex = flatPair.reduce((a, t) => {
                (t.dexs || []).forEach(d => { const k = String(d.dex || '').toLowerCase(); if (!dexAllowed.includes(k)) return; a[k] = (a[k] || 0) + 1; });
                return a;
            }, {});
            dexAllowed.forEach(dx => {
                const id = `sc-dex-${dx}`; const cnt = byDex[dx] || 0; if (cnt === 0) return; const checked = dexSel.includes(dx);
                const col = (CONFIG_DEXS[dx] && (CONFIG_DEXS[dx].warna || CONFIG_DEXS[dx].WARNA)) || '#333';
                $secDex.append(chipHtml('sc-dex', id, dx.toUpperCase(), col, cnt, checked, dx, false));
            });
            if ($headLabels.length)
                $wrap.append($secCex).append($('<div class=\"uk-text-muted\">|</div>')).append($secPair).append($('<div class=\"uk-text-muted\">|</div>')).append($secDex);
            let totalSingle = 0;
            if ((cexSel && cexSel.length) && (pairSel && pairSel.length) && (dexSel && dexSel.length)) {
                const filtered = flat.filter(t => cexSel.includes(String(t.cex || '').toUpperCase()))
                    .filter(t => { const p = String(t.symbol_out || '').toUpperCase(); const key = pairDefs[p] ? p : 'NON'; return pairSel.includes(key); })
                    .filter(t => (t.dexs || []).some(d => dexSel.includes(String(d.dex || '').toLowerCase())));
                totalSingle = filtered.length;
            } else {
                totalSingle = 0;
            }
            $sum.text(`TOTAL KOIN: ${totalSingle}`);
            $right.append($sum);
            // Search input now in HTML (next to WALLET CEX checkbox)
            $wrap.append($right);
            $('#modal-filter-sections').off('change.scf').on('change.scf', 'label.sc-cex input, label.sc-pair input, label.sc-dex input', function () {
                const prev = getFilterChain(chain);
                const prevC = (prev.cex || []).map(String);
                const prevP = (prev.pair || []).map(x => String(x).toUpperCase());
                const prevD = (prev.dex || []).map(x => String(x).toLowerCase());

                const c = $('#modal-filter-sections').find('label.sc-cex input:checked').map(function () { return $(this).closest('label').attr('data-val'); }).get();
                const p = $('#modal-filter-sections').find('label.sc-pair input:checked').map(function () { return $(this).closest('label').attr('data-val'); }).get();
                const d = $('#modal-filter-sections').find('label.sc-dex input:checked').map(function () { return $(this).closest('label').attr('data-val').toLowerCase(); }).get();
                setFilterChain(chain, { cex: c, pair: p, dex: d });
                // Detailed toast
                const cAdd = c.filter(x => !prevC.includes(x));
                const cDel = prevC.filter(x => !c.includes(x));
                const pU = p.map(x => String(x).toUpperCase());
                const pAdd = pU.filter(x => !prevP.includes(x));
                const pDel = prevP.filter(x => !pU.includes(x));
                const dAdd = d.filter(x => !prevD.includes(x)).map(x => x.toUpperCase());
                const dDel = prevD.filter(x => !d.includes(x)).map(x => x.toUpperCase());
                const parts = [];
                if (cAdd.length) parts.push(`+CEX: ${cAdd.join(', ')}`);
                if (cDel.length) parts.push(`-CEX: ${cDel.join(', ')}`);
                if (pAdd.length) parts.push(`+PAIR: ${pAdd.join(', ')}`);
                if (pDel.length) parts.push(`-PAIR: ${pDel.join(', ')}`);
                if (dAdd.length) parts.push(`+DEX: ${dAdd.join(', ')}`);
                if (dDel.length) parts.push(`-DEX: ${dDel.join(', ')}`);
                const label = String(chain).toUpperCase();
                const msg = parts.length ? `[${label}] ${parts.join(' | ')}` : `[${label}] Filter diperbarui: CEX=${c.length}, PAIR=${p.length}`;
                try { if (typeof toast !== 'undefined' && toast.info) toast.info(msg); } catch (_) { }
                // searchInput in filter card is now used for both monitoring and management tables
                // Also clear any existing signal cards produced by a previous scan
                try { if (typeof window.clearSignalCards === 'function') window.clearSignalCards(); } catch (_) { }
                loadAndDisplaySingleChainTokens();
                try { renderTokenManagementList(); } catch (_) { }
                renderFilterCard();
            });
        }

        // CTA untuk kondisi tidak ada data koin (berlaku untuk SEMUA mode)
        try {
            const needCTA = (typeof hasValidTokens === 'function') ? !hasValidTokens() : false;
            if (needCTA) {
                $('#ManajemenKoin .icon').addClass('cta-settings').attr('title', 'Klik untuk membuka Manajemen Koin');
                // Jika tombol sync tersedia (saat manajemen terbuka), highlight juga
                $('#sync-tokens-btn').addClass('cta-sync').attr('title', 'Klik untuk SYNC data koin');
            } else {
                $('#ManajemenKoin .icon').removeClass('cta-settings').attr('title', 'Manajemen Koin');
                $('#sync-tokens-btn').removeClass('cta-sync');
            }
        } catch (_) { }


        // Enforce disabled state for filter controls if tokens are missing
        try {
            // Filter card removed - filters now in modal only
        } catch (_) { }

        // Apply dynamic colors from config to checked checkboxes (Opsi 4)
        applyFilterColors();
    }

    // Apply background and text colors based on config (Opsi 5: Gradient + Smart Contrast)
    function applyFilterColors() {
        // Default pair color (green)
        const defaultPairColor = '#4caf50';

        // Process all filter labels with data-color attribute
        $('#filter-groups label[data-color]').each(function () {
            const $label = $(this);
            const color = $label.attr('data-color');
            const $checkbox = $label.find('input[type="checkbox"]');

            if (!color) return;

            // Apply colors when checked
            if ($checkbox.is(':checked')) {
                const darkerColor = darkenColor(color, 25); // Darken by 25% for gradient end
                const gradient = `linear-gradient(135deg, ${color} 0%, ${darkerColor} 100%)`;
                const textColor = getContrastTextColor(color); // Auto white/black

                $label.css({
                    'background': gradient,
                    'border-color': color,
                    'color': textColor
                });
                $label.find('span').css('color', textColor);
            }
        });

        // Handle pair labels (no data-color, use default green)
        $('#filter-groups label.sc-pair').each(function () {
            const $label = $(this);
            const $checkbox = $label.find('input[type="checkbox"]');

            if ($checkbox.is(':checked')) {
                const darkerGreen = darkenColor(defaultPairColor, 25);
                const gradient = `linear-gradient(135deg, ${defaultPairColor} 0%, ${darkerGreen} 100%)`;
                const textColor = getContrastTextColor(defaultPairColor);

                $label.css({
                    'background': gradient,
                    'border-color': defaultPairColor,
                    'color': textColor
                });
                $label.find('span').css('color', textColor);
            }
        });

        // Add event listener for checkbox changes
        $('#filter-groups label input[type="checkbox"]').off('change.colorize').on('change.colorize', function () {
            const $checkbox = $(this);
            const $label = $checkbox.closest('label');
            const color = $label.attr('data-color');
            const isPair = $label.hasClass('sc-pair');

            const actualColor = color || (isPair ? defaultPairColor : null);

            if (!actualColor) return;

            if ($checkbox.is(':checked')) {
                const darkerColor = darkenColor(actualColor, 25);
                const gradient = `linear-gradient(135deg, ${actualColor} 0%, ${darkerColor} 100%)`;
                const textColor = getContrastTextColor(actualColor);

                $label.css({
                    'background': gradient,
                    'border-color': actualColor,
                    'color': textColor
                });
                $label.find('span').css('color', textColor);
            } else {
                // Reset to default unchecked state - let CSS handle it
                $label.css({
                    'background': '',
                    'border-color': '',
                    'color': ''
                });
                $label.find('span').css('color', color || '');
            }
        });
    }

    renderFilterCard();

    // Render filter card to modal
    function renderFilterCardToModal() {
        const $wrap = $('#modal-filter-sections');
        if (!$wrap.length) return;
        $wrap.empty();

        const m = getMode();

        // Determine accent color based on mode
        let accentColor = '#5c9514'; // Default for multi-chain
        if (m.mode === 'single') {
            const cfg = (CONFIG_CHAINS && CONFIG_CHAINS[m.chain]) ? CONFIG_CHAINS[m.chain] : null;
            accentColor = cfg?.WARNA || '#333';
        }

        // Total badge
        let $sum = $(`<span id="modal-total-koin-badge" class="uk-text-small" style="font-weight:bolder; color: white; background-color: ${accentColor}; padding: 2px 8px; border-radius: 4px;">TOTAL KOIN: 0</span>`);

        if (m.mode === 'multi') {
            const fmNow = getFilterMulti();
            const chainsSel = fmNow.chains || [];
            const cexSel = fmNow.cex || [];
            const dexSel = (fmNow.dex || []).map(x => String(x).toLowerCase());
            const flat = flattenDataKoin(getTokensMulti()) || [];
            const byChain = flat.reduce((a, t) => { const k = String(t.chain || '').toLowerCase(); a[k] = (a[k] || 0) + 1; return a; }, {});
            const byCex = flat.filter(t => (chainsSel.length === 0 || chainsSel.includes(String(t.chain || '').toLowerCase())))
                .reduce((a, t) => { const k = String(t.cex || '').toUpperCase(); a[k] = (a[k] || 0) + 1; return a; }, {});
            const flatForDex = flat
                .filter(t => (chainsSel.length === 0 || chainsSel.includes(String(t.chain || '').toLowerCase())))
                .filter(t => (cexSel.length === 0 || cexSel.includes(String(t.cex || '').toUpperCase())));
            const byDex = flatForDex.reduce((a, t) => {
                (t.dexs || []).forEach(d => { const k = String(d.dex || '').toLowerCase(); a[k] = (a[k] || 0) + 1; });
                return a;
            }, {});

            // Section 1: CHAIN (horizontal flex)
            const $chainSection = $('<div style="margin-bottom:15px;"></div>');
            $chainSection.append($('<div style="font-weight:700; color:#333; margin-bottom:8px; font-size:12px; border-bottom:2px solid #e5e5e5; padding-bottom:4px;">CHAIN</div>'));
            const $chainGrid = $('<div style="display:flex; flex-wrap:wrap; gap:6px;"></div>');
            Object.keys(CONFIG_CHAINS || {}).forEach(k => {
                const short = (CONFIG_CHAINS[k].Nama_Pendek || k.substr(0, 3)).toUpperCase();
                const id = `modal-fc-chain-${k}`; const cnt = byChain[k] || 0;
                if (cnt === 0) return;
                const checked = chainsSel.includes(k.toLowerCase());
                const col = CONFIG_CHAINS[k].WARNA || '#333';
                $chainGrid.append($(`
                    <label class="fc-chain" data-val="${k.toLowerCase()}" data-color="${col}" for="${id}" style="display:flex; align-items:center; gap:3px; padding:3px 8px; border-radius:3px; cursor:pointer; border:2px solid ${checked ? col : 'transparent'}; background:${checked ? '#f8f8f8' : 'white'};">
                        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="width:11px; height:11px; margin:0;">
                        <span style="font-weight:600; font-size:10px; color:${col};">${short}</span>
                        <span style="font-size:9px; opacity:0.7; color:#555;">[${cnt}]</span>
                    </label>
                `));
            });
            $chainSection.append($chainGrid);
            $wrap.append($chainSection);

            // Section 2: EXCHANGER (horizontal flex)
            const $cexSection = $('<div style="margin-bottom:15px;"></div>');
            $cexSection.append($('<div style="font-weight:700; color:#333; margin-bottom:8px; font-size:12px; border-bottom:2px solid #e5e5e5; padding-bottom:4px;">EXCHANGER</div>'));
            const $cexGrid = $('<div style="display:flex; flex-wrap:wrap; gap:6px;"></div>');
            Object.keys(CONFIG_CEX || {}).forEach(cx => {
                const id = `modal-fc-cex-${cx}`; const cnt = byCex[cx] || 0; if (cnt === 0) return; const checked = cexSel.includes(cx.toUpperCase());
                const col = CONFIG_CEX[cx].WARNA || '#333';
                $cexGrid.append($(`
                    <label class="fc-cex" data-val="${cx}" data-color="${col}" for="${id}" style="display:flex; align-items:center; gap:3px; padding:3px 8px; border-radius:3px; cursor:pointer; border:2px solid ${checked ? col : 'transparent'}; background:${checked ? '#f8f8f8' : 'white'};">
                        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="width:11px; height:11px; margin:0;">
                        <span style="font-weight:600; font-size:10px; color:${col};">${cx}</span>
                        <span style="font-size:9px; opacity:0.7; color:#555;">[${cnt}]</span>
                    </label>
                `));
            });
            $cexSection.append($cexGrid);
            $wrap.append($cexSection);

            // Section 3: DEX (horizontal flex)
            const $dexSection = $('<div style="margin-bottom:15px;"></div>');
            $dexSection.append($('<div style="font-weight:700; color:#333; margin-bottom:8px; font-size:12px; border-bottom:2px solid #e5e5e5; padding-bottom:4px;">DEX</div>'));
            const $dexGrid = $('<div style="display:flex; flex-wrap:wrap; gap:6px;"></div>');
            // ✅ Filter: Hanya tampilkan DEX asli (not disabled, not Meta-DEX)
            const metaDexEnabled = (CONFIG_APP && CONFIG_APP.APP && CONFIG_APP.APP.META_DEX === true);
            Object.keys(CONFIG_DEXS || {}).forEach(dx => {
                const dexConfig = CONFIG_DEXS[dx];
                if (dexConfig.disabled) return;
                if (dexConfig.isMetaDex && !metaDexEnabled) return;

                const key = String(dx).toLowerCase();
                const id = `modal-fc-dex-${key}`; const cnt = byDex[key] || 0; if (cnt === 0) return; const checked = dexSel.includes(key);
                const col = (dexConfig.warna || dexConfig.WARNA) || '#333';
                $dexGrid.append($(`
                    <label class="fc-dex" data-val="${key}" data-color="${col}" for="${id}" style="display:flex; align-items:center; gap:3px; padding:3px 8px; border-radius:3px; cursor:pointer; border:2px solid ${checked ? col : 'transparent'}; background:${checked ? '#f8f8f8' : 'white'};">
                        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="width:11px; height:11px; margin:0;">
                        <span style="font-weight:600; font-size:10px; color:${col};">${dx.toUpperCase()}</span>
                        <span style="font-size:9px; opacity:0.7; color:#555;">[${cnt}]</span>
                    </label>
                `));
            });
            $dexSection.append($dexGrid);
            $wrap.append($dexSection);

            const saved = getFromLocalStorage('FILTER_MULTICHAIN', null);
            let total = 0;
            if (!saved) {
                total = flat.length;
            } else if (chainsSel.length > 0 && cexSel.length > 0 && ((fmNow.dex || []).length > 0)) {
                total = flat.filter(t => chainsSel.includes(String(t.chain || '').toLowerCase()))
                    .filter(t => cexSel.includes(String(t.cex || '').toUpperCase()))
                    .filter(t => (t.dexs || []).some(d => (dexSel || []).includes(String(d.dex || '').toLowerCase())))
                    .length;
            } else {
                total = 0;
            }
            $sum.text(`TOTAL KOIN: ${total}`);

            // Insert only summary badge (no search input in modal)
            $('#modal-summary-bar').empty().append($sum);

            $('#modal-filter-sections').off('change.multif').on('change.multif', 'label.fc-chain input, label.fc-cex input, label.fc-dex input', function () {
                const prev = getFilterMulti();
                const prevChains = (prev.chains || []).map(s => String(s).toLowerCase());
                const prevCex = (prev.cex || []).map(s => String(s).toUpperCase());
                const prevDex = (prev.dex || []).map(s => String(s).toLowerCase());

                const chains = $('#modal-filter-sections').find('label.fc-chain input:checked').map(function () { return $(this).closest('label').attr('data-val').toLowerCase(); }).get();
                const cex = $('#modal-filter-sections').find('label.fc-cex input:checked').map(function () { return $(this).closest('label').attr('data-val').toUpperCase(); }).get();
                const dex = $('#modal-filter-sections').find('label.fc-dex input:checked').map(function () { return $(this).closest('label').attr('data-val').toLowerCase(); }).get();

                setFilterMulti({ chains, cex, dex });

                const addChains = chains.filter(x => !prevChains.includes(x)).map(x => x.toUpperCase());
                const delChains = prevChains.filter(x => !chains.includes(x)).map(x => x.toUpperCase());
                const addCex = cex.filter(x => !prevCex.includes(x));
                const delCex = prevCex.filter(x => !cex.includes(x));
                const addDex = dex.filter(x => !prevDex.includes(x)).map(x => x.toUpperCase());
                const delDex = prevDex.filter(x => !dex.includes(x)).map(x => x.toUpperCase());
                const parts = [];
                if (addChains.length) parts.push(`+CHAIN: ${addChains.join(', ')}`);
                if (delChains.length) parts.push(`-CHAIN: ${delChains.join(', ')}`);
                if (addCex.length) parts.push(`+CEX: ${addCex.join(', ')}`);
                if (delCex.length) parts.push(`-CEX: ${delCex.join(', ')}`);
                if (addDex.length) parts.push(`+DEX: ${addDex.join(', ')}`);
                if (delDex.length) parts.push(`-DEX: ${delDex.join(', ')}`);
                const msg = parts.length ? parts.join(' | ') : `Filter MULTI diperbarui: CHAIN=${chains.length}, CEX=${cex.length}`;
                try { if (typeof toast !== 'undefined' && toast.info) toast.info(msg); } catch (_) { }

                try { if (typeof window.clearSignalCards === 'function') window.clearSignalCards(); } catch (_) { }
                refreshTokensTable();
                try { renderTokenManagementList(); } catch (_) { }
                renderFilterCard();
                renderFilterCardToModal();
            });
        } else {
            const chain = m.chain;
            const saved = getFilterChain(chain);
            const cexSel = saved.cex || [];
            const pairSel = saved.pair || [];
            const dexSel = (saved.dex || []).map(x => String(x).toLowerCase());

            const flat = flattenDataKoin(getTokensChain(chain)) || [];
            const byCex = flat.reduce((a, t) => { const k = String(t.cex || '').toUpperCase(); a[k] = (a[k] || 0) + 1; return a; }, {});
            const pairDefs = (CONFIG_CHAINS[chain] || {}).PAIRDEXS || {};
            const flatPair = (cexSel.length ? flat.filter(t => cexSel.includes(String(t.cex || '').toUpperCase())) : flat);
            const byPair = flatPair.reduce((a, t) => {
                const p = String(t.symbol_out || '').toUpperCase().trim();
                const k = pairDefs[p] ? p : 'NON';
                a[k] = (a[k] || 0) + 1;
                return a;
            }, {});

            // === NEW LAYOUT: ROW 1 (EXCHANGER | PAIR), ROW 2 (DEX horizontal) ===
            const $container = $('<div style="font-size:11px; padding:10px;"></div>');

            // Row 1: EXCHANGER dan PAIR side by side
            const $topRow = $('<div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px; margin-bottom:20px;"></div>');

            // Hitung pair per CEX untuk info
            const pairByCex = {};
            flat.forEach(t => {
                const cex = String(t.cex || '').toUpperCase();
                const p = String(t.symbol_out || '').toUpperCase().trim();
                const pairKey = pairDefs[p] ? p : 'NON';
                if (!pairByCex[cex]) pairByCex[cex] = {};
                pairByCex[cex][pairKey] = (pairByCex[cex][pairKey] || 0) + 1;
            });

            // Column 1: EXCHANGER
            const $cexCol = $('<div></div>');
            $cexCol.append($('<div style="font-weight:700; color:#333; margin-bottom:10px; font-size:13px; border-bottom:2px solid #e5e5e5; padding-bottom:6px;">EXCHANGER</div>'));
            const $cexList = $('<div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;"></div>');
            const relevantCexs = (CONFIG_CHAINS[chain] && CONFIG_CHAINS[chain].WALLET_CEX) ? Object.keys(CONFIG_CHAINS[chain].WALLET_CEX) : [];
            relevantCexs.forEach(cx => {
                const cexCnt = byCex[cx] || 0;
                if (cexCnt === 0) return;
                const cexChecked = cexSel.includes(cx);
                const cexColor = (CONFIG_CEX[cx] || {}).WARNA || '#333';
                const cexId = `modal-sc-cex-${cx}`;
                const cexPairs = Object.keys(pairByCex[cx] || {}).join('/') || '-';

                $cexList.append($(`
                    <div style="display:flex; align-items:center; gap:4px;">
                        <label class="sc-cex" data-val="${cx}" data-color="${cexColor}" for="${cexId}" style="display:flex; align-items:center; gap:3px; padding:2px 6px; border-radius:3px; cursor:pointer; border:2px solid ${cexChecked ? cexColor : 'transparent'}; background:${cexChecked ? '#f8f8f8' : 'white'};">
                            <input type="checkbox" id="${cexId}" ${cexChecked ? 'checked' : ''} style="width:11px; height:11px; margin:0;">
                            <span style="font-weight:600; font-size:10px; color:${cexColor};">${cx}</span>
                            <span style="font-size:9px; opacity:0.7; color:#555;">[${cexCnt}]</span>
                        </label>
                        <span style="font-size:9px; color:#888; font-style:italic;">${cexPairs}</span>
                    </div>
                `));
            });
            $cexCol.append($cexList);
            $topRow.append($cexCol);

            // Column 2: PAIR
            const $pairCol = $('<div></div>');
            $pairCol.append($('<div style="font-weight:700; color:#333; margin-bottom:10px; font-size:13px; border-bottom:2px solid #e5e5e5; padding-bottom:6px;">PAIR</div>'));
            const $pairList = $('<div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;"></div>');
            const allPairs = Array.from(new Set([...Object.keys(pairDefs), 'NON']));
            const chainColor = (CONFIG_CHAINS[chain] && CONFIG_CHAINS[chain].WARNA) || '#2563eb';
            allPairs.forEach(p => {
                const cnt = byPair[p] || 0;
                if (cnt === 0) return;
                const checked = pairSel.includes(p);
                const pairColor = (p === 'NON') ? '#6b7280' : chainColor;
                const id = `modal-sc-pair-${p}`;
                $pairList.append($(`
                    <label class="sc-pair" data-val="${p}" data-color="${pairColor}" for="${id}" style="display:flex; align-items:center; gap:3px; padding:2px 6px; border-radius:3px; cursor:pointer; border:2px solid ${checked ? pairColor : 'transparent'}; background:${checked ? '#f8f8f8' : 'white'};">
                        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="width:10px; height:10px; margin:0;">
                        <span style="font-weight:500; font-size:10px; color:${pairColor};">${p}</span>
                        <span style="font-size:9px; opacity:0.7; color:#555;">[${cnt}]</span>
                    </label>
                `));
            });
            $pairCol.append($pairList);
            $topRow.append($pairCol);

            $container.append($topRow);

            // Row 2: DEX (horizontal, flex-wrap)
            const $dexSection = $('<div></div>');
            $dexSection.append($('<div style="font-weight:700; color:#333; margin-bottom:10px; font-size:13px; border-bottom:2px solid #e5e5e5; padding-bottom:6px;">DEX</div>'));
            const $dexGrid = $('<div style="display:flex; flex-wrap:wrap; gap:6px; align-items:flex-start;"></div>');
            const dexAllowed = ((CONFIG_CHAINS[chain] || {}).DEXS || []).map(x => String(x).toLowerCase());
            const byDex = flatPair.reduce((a, t) => {
                (t.dexs || []).forEach(d => { const k = String(d.dex || '').toLowerCase(); if (!dexAllowed.includes(k)) return; a[k] = (a[k] || 0) + 1; });
                return a;
            }, {});
            dexAllowed.forEach(dx => {
                const cnt = byDex[dx] || 0;
                if (cnt === 0) return;
                const checked = dexSel.includes(dx);
                const col = (CONFIG_DEXS[dx] && (CONFIG_DEXS[dx].warna || CONFIG_DEXS[dx].WARNA)) || '#333';
                const id = `modal-sc-dex-${dx}`;
                $dexGrid.append($(`
                    <label class="sc-dex" data-val="${dx}" data-color="${col}" for="${id}" style="display:flex; align-items:center; gap:3px; padding:3px 8px; border-radius:3px; cursor:pointer; border:2px solid ${checked ? col : 'transparent'}; background:${checked ? '#f8f8f8' : 'white'};">
                        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="width:11px; height:11px; margin:0;">
                        <span style="font-weight:500; font-size:10px; color:${col};">${dx.toUpperCase()}</span>
                        <span style="font-size:9px; opacity:0.7; color:#555;">[${cnt}]</span>
                    </label>
                `));
            });
            $dexSection.append($dexGrid);
            $container.append($dexSection);

            $wrap.append($container);

            let totalSingle = 0;
            if ((cexSel && cexSel.length) && (pairSel && pairSel.length) && (dexSel && dexSel.length)) {
                const filtered = flat.filter(t => cexSel.includes(String(t.cex || '').toUpperCase()))
                    .filter(t => { const p = String(t.symbol_out || '').toUpperCase(); const key = pairDefs[p] ? p : 'NON'; return pairSel.includes(key); })
                    .filter(t => (t.dexs || []).some(d => dexSel.includes(String(d.dex || '').toLowerCase())));
                totalSingle = filtered.length;
            } else {
                totalSingle = 0;
            }
            $sum.text(`TOTAL KOIN: ${totalSingle}`);

            // Insert only summary badge (no search input in modal)
            $('#modal-summary-bar').empty().append($sum);

            // Event handler untuk filter changes
            $('#modal-filter-sections').off('change.scf').on('change.scf', 'label.sc-cex input, label.sc-pair input, label.sc-dex input', function () {
                const prev = getFilterChain(chain);
                const prevC = (prev.cex || []).map(String);
                const prevP = (prev.pair || []).map(x => String(x).toUpperCase());
                const prevD = (prev.dex || []).map(x => String(x).toLowerCase());

                const c = $('#modal-filter-sections').find('label.sc-cex input:checked').map(function () { return $(this).closest('label').attr('data-val'); }).get();
                const p = $('#modal-filter-sections').find('label.sc-pair input:checked').map(function () { return $(this).closest('label').attr('data-val'); }).get();
                const d = $('#modal-filter-sections').find('label.sc-dex input:checked').map(function () { return $(this).closest('label').attr('data-val').toLowerCase(); }).get();

                setFilterChain(chain, { cex: c, pair: p, dex: d });

                const cAdd = c.filter(x => !prevC.includes(x));
                const cDel = prevC.filter(x => !c.includes(x));
                const pAdd = p.filter(x => !prevP.includes(x));
                const pDel = prevP.filter(x => !p.includes(x));
                const dAdd = d.filter(x => !prevD.includes(x)).map(x => x.toUpperCase());
                const dDel = prevD.filter(x => !d.includes(x)).map(x => x.toUpperCase());
                const parts = [];
                if (cAdd.length) parts.push(`+CEX: ${cAdd.join(', ')}`);
                if (cDel.length) parts.push(`-CEX: ${cDel.join(', ')}`);
                if (pAdd.length) parts.push(`+PAIR: ${pAdd.join(', ')}`);
                if (pDel.length) parts.push(`-PAIR: ${pDel.join(', ')}`);
                if (dAdd.length) parts.push(`+DEX: ${dAdd.join(', ')}`);
                if (dDel.length) parts.push(`-DEX: ${dDel.join(', ')}`);
                const msg = parts.length ? parts.join(' | ') : `Filter untuk ${chain.toUpperCase()} diperbarui: CEX=${c.length}, PAIR=${p.length}`;
                try { if (typeof toast !== 'undefined' && toast.info) toast.info(msg); } catch (_) { }

                try { if (typeof window.clearSignalCards === 'function') window.clearSignalCards(); } catch (_) { }
                // ✅ FIX: Use correct function for single chain mode
                if (typeof loadAndDisplaySingleChainTokens === 'function') loadAndDisplaySingleChainTokens();
                try { renderTokenManagementList(); } catch (_) { }
                renderFilterCard();
                renderFilterCardToModal();
            });
        }

        // Apply color styling
        $('#modal-filter-groups label[data-color]').each(function () {
            const color = $(this).attr('data-color');
            const $label = $(this);
            if ($label.find('input').is(':checked')) {
                $label.css({
                    'background-color': color || '',
                    'color': color ? '#fff' : ''
                });
                $label.find('span').css('color', color ? '#fff' : '');
            } else {
                $label.css({
                    'background-color': '',
                    'color': ''
                });
                $label.find('span').css('color', color || '');
            }
        });

        $('#modal-filter-groups label.sc-pair').each(function () {
            const color = $(this).attr('data-color');
            const $label = $(this);
            if ($label.find('input').is(':checked')) {
                $label.css({
                    'background-color': color || '#10b981',
                    'color': '#fff'
                });
            } else {
                $label.css({
                    'background-color': '',
                    'color': ''
                });
            }
        });

        $('#modal-filter-groups label input[type="checkbox"]').off('change.colorize').on('change.colorize', function () {
            const $label = $(this).closest('label');
            const color = $label.attr('data-color');
            if ($(this).is(':checked')) {
                if ($label.hasClass('sc-pair')) {
                    $label.css({
                        'background-color': color || '#10b981',
                        'color': '#fff'
                    });
                } else {
                    $label.css({
                        'background-color': color || '',
                        'color': color ? '#fff' : ''
                    });
                    $label.find('span').css('color', color ? '#fff' : '');
                }
            } else {
                $label.css({
                    'background-color': '',
                    'color': ''
                });
                $label.find('span').css('color', color || '');
            }
        });
    }

    // Ensure UI gating matches current run state after initial render
    try {
        const st = getAppState();
        if (st && st.run === 'YES' && typeof setScanUIGating === 'function') {
            setScanUIGating(true);
        }
    } catch (_) { }
    // Auto open Token Management when no tokens exist (but settings are valid)
    (function autoOpenManagerIfNoTokens() {
        try {
            // FIXED: Only auto-open token management if settings are already complete
            // If settings are missing, bootApp() already showed the settings section
            if (!hasValidSettings()) {
                // Settings missing - do NOT override the settings section
                return;
            }

            const mode = getAppMode();
            let hasTokens = false;
            if (mode.type === 'single') {
                const t = getTokensChain(mode.chain);
                hasTokens = Array.isArray(t) && t.length > 0;
            } else {
                const t = getTokensMulti();
                hasTokens = Array.isArray(t) && t.length > 0;
            }
            if (!hasTokens) {
                showMainSection('#token-management');
                try {
                    if (window.SnapshotModule && typeof window.SnapshotModule.hide === 'function') {
                        window.SnapshotModule.hide();
                    }
                } catch (_) { }
                renderTokenManagementList();
            }
        } catch (_) { }
    })();
    // helper to reflect saved sort preference to A-Z / Z-A toggle
    function applySortToggleState() {
        try {
            const mode = getAppMode();
            let pref = 'A';
            if (mode.type === 'single') {
                const key = `FILTER_${String(mode.chain).toUpperCase()}`;
                const obj = getFromLocalStorage(key, {}) || {};
                if (obj && (obj.sort === 'A' || obj.sort === 'Z')) pref = obj.sort;
            } else {
                const obj = getFromLocalStorage('FILTER_MULTICHAIN', {}) || {};
                if (obj && (obj.sort === 'A' || obj.sort === 'Z')) pref = obj.sort;
            }
            const want = (pref === 'A') ? 'opt_A' : 'opt_Z';
            const $toggles = $('.sort-toggle');
            $toggles.removeClass('active');
            $toggles.find('input[type=radio]').prop('checked', false);
            const $target = $toggles.filter(`[data-sort="${want}"]`);
            $target.addClass('active');
            $target.find('input[type=radio]').prop('checked', true);
        } catch (_) { }
    }
    try { applySortToggleState(); } catch (_) { }

    // Auto-switch to single-chain view if URL indicates per-chain mode
    (function autoOpenSingleChainIfNeeded() {
        const m = getMode();
        if (m.mode !== 'single') return;
        try {
            activeSingleChainKey = m.chain;
            const chainCfg = (window.CONFIG_CHAINS || {})[m.chain] || {};
            const chainName = chainCfg.Nama_Chain || m.chain.toUpperCase();
            // Show the main scanner view
            showMainSection('scanner');
            loadAndDisplaySingleChainTokens();
        } catch (e) { /* debug logs removed */ }
    })();


    // --- Event Listeners ---

    // Removed localStorage 'storage' event listener; app state is now IDB-only.

    $('#darkModeToggle').on('click', function () {
        // Block toggling while scanning is running
        try {
            const st = (typeof getAppState === 'function') ? getAppState() : { run: 'NO' };
            if (String(st.run || 'NO').toUpperCase() === 'YES') return; // refactor: disable dark-mode toggle during scan
        } catch (_) { }
        const body = $('body');
        body.toggleClass('dark-mode uk-dark');
        const isDark = body.hasClass('dark-mode');
        setAppState({ darkMode: isDark }); // saved into FILTER_*
        if (typeof applyThemeForMode === 'function') applyThemeForMode();
        try { if (typeof window.updateSignalTheme === 'function') window.updateSignalTheme(); } catch (_) { }
        // Re-apply filter colors after dark mode toggle
        try { if (typeof applyFilterColors === 'function') applyFilterColors(); } catch (_) { }
    });

    // Console Log Summary toggle (default OFF)
    try {
        const savedScanLog = getFromLocalStorage('SCAN_LOG_ENABLED', false);
        const isOn = (savedScanLog === true) || (String(savedScanLog).toLowerCase() === 'true') || (String(savedScanLog) === '1');
        window.SCAN_LOG_ENABLED = !!isOn;
        const $tgl = $('#toggleScanLog');
        if ($tgl.length) $tgl.prop('checked', !!isOn);
        $(document).off('change.scanlog').on('change.scanlog', '#toggleScanLog', function () {
            const v = !!$(this).is(':checked');
            window.SCAN_LOG_ENABLED = v;
            try { saveToLocalStorage('SCAN_LOG_ENABLED', v); } catch (_) { }
        });
        // Keep it enabled even during scan gating
        try { $('#toggleScanLog').prop('disabled', false).css({ opacity: '', pointerEvents: '' }); } catch (_) { }
    } catch (_) { }

    $('.sort-toggle').off('click').on('click', function () {
        $('.sort-toggle').removeClass('active');
        $(this).addClass('active');
        const sortValue = $(this).data('sort'); // expects 'opt_A' or 'opt_Z'
        const pref = (sortValue === 'opt_A') ? 'A' : 'Z';
        try {
            const mode = getAppMode();
            if (mode.type === 'single') {
                const key = `FILTER_${String(mode.chain).toUpperCase()}`;
                const obj = getFromLocalStorage(key, {}) || {};
                obj.sort = pref;
                saveToLocalStorage(key, obj);
                loadAndDisplaySingleChainTokens(); // will re-apply sorting and update window.singleChainTokensCurrent
            } else {
                const key = 'FILTER_MULTICHAIN';
                const obj = getFromLocalStorage(key, {}) || {};
                obj.sort = pref;
                saveToLocalStorage(key, obj);
                // Re-sort current multi data
                // Re-fetch sorted from source to reflect new preference
                refreshTokensTable();
            }
        } catch (_) { }
    });

    // Initialize and persist PNL filter input per mode
    function syncPnlInputFromStorage() {
        try {
            const v = (typeof getPNLFilter === 'function') ? getPNLFilter() : 0;
            $('#pnlFilterInput').val(v);
        } catch (_) { }
    }
    syncPnlInputFromStorage();

    $(document).on('change blur', '#pnlFilterInput', function () {
        const raw = $(this).val();
        const v = parseFloat(raw);
        const clean = isFinite(v) && v >= 0 ? v : 0;
        try {
            setPNLFilter(clean);
            $(this).val(clean);
            try { if (typeof toast !== 'undefined' && toast.info) toast.info(`PNL Filter diset: $${clean}`); } catch (_) { }
            // Clear previously displayed scan signal cards when PNL filter changes
            try { if (typeof window.clearSignalCards === 'function') window.clearSignalCards(); } catch (_) { }
        } catch (_) { }
    });

    // ❌ REMOVED: Duplicate save handler (already handled in core/handlers/settings-handlers.js)
    // This duplicate handler was causing matchaApiKeys to be lost on save
    // The proper handler with matchaApiKeys support is in settings-handlers.js

    // Deprecated modal handler removed; settings now inline

    // Global search handler (filter card)

    $('.posisi-check').on('change', function () {
        if ($('.posisi-check:checked').length === 0) {
            $(this).prop('checked', true);
            if (typeof toast !== 'undefined' && toast.error) toast.error("Minimal salah satu POSISI harus aktif!");
            return;
        }
        const label = $(this).val() === 'Actionkiri' ? 'KIRI' : 'KANAN';
        const status = $(this).is(':checked') ? 'AKTIF' : 'NONAKTIF';
        if (typeof toast !== 'undefined' && toast.info) toast.info(`POSISI ${label} ${status}`);
    });

    $("#reload").click(function () {
        // Per-tab reload: do NOT broadcast run=NO; only mark local flag
        try { sessionStorage.setItem('APP_FORCE_RUN_NO', '1'); } catch (_) { }
        try { location.reload(); } catch (_) { }
    });

    $("#stopSCAN").click(function () {
        if (window.App?.Scanner?.stopScanner) window.App.Scanner.stopScanner();
    });

    // Autorun toggle - controlled by CONFIG_APP.APP.AUTORUN
    try {
        // Check if autorun feature is enabled in config
        const autorunEnabled = (window.CONFIG_APP?.APP?.AUTORUN !== false);

        if (!autorunEnabled) {
            // Hide autorun UI elements when disabled in config
            $('#autoRunToggle').closest('label').hide();
            $('#autoRunCountdown').hide();
            window.AUTORUN_ENABLED = false;
            window.AUTORUN_FEATURE_DISABLED = true;
        } else {
            // Show autorun UI elements when enabled
            $('#autoRunToggle').closest('label').show();
            $('#autoRunCountdown').show();
            window.AUTORUN_ENABLED = false;
            window.AUTORUN_FEATURE_DISABLED = false;

            // Register change handler only if feature is enabled
            $(document).on('change', '#autoRunToggle', function () {
                window.AUTORUN_ENABLED = $(this).is(':checked');
                if (!window.AUTORUN_ENABLED) {
                    // cancel any pending autorun countdown
                    // ✅ PERF: Use TimerManager for centralized timer control
                    if (typeof TimerManager !== 'undefined') {
                        TimerManager.clear('autorun-countdown');
                    } else {
                        try { clearInterval(window.__autoRunInterval); } catch (_) { }
                        window.__autoRunInterval = null;
                    }
                    // clear countdown label
                    $('#autoRunCountdown').text('');
                    // restore UI to idle state if not scanning
                    try {
                        $('#stopSCAN').hide().prop('disabled', true);
                        $('#startSCAN').prop('disabled', false).removeClass('uk-button-disabled').text('START');
                        $("#LoadDataBtn, #SettingModal, #MasterData,#UpdateWalletCEX,#chain-links-container,.sort-toggle, .edit-token-button").css("pointer-events", "auto").css("opacity", "1");
                        if (typeof setScanUIGating === 'function') setScanUIGating(false);
                        $('.header-card a, .header-card .icon').css({ pointerEvents: 'auto', opacity: 1 });
                    } catch (_) { }
                }
            });
        }
    } catch (_) { }

    // Cancel button in inline settings: restore without broadcasting to other tabs
    $(document).on('click', '#btn-cancel-setting', function () {
        try { sessionStorage.setItem('APP_FORCE_RUN_NO', '1'); } catch (_) { }
        try { location.reload(); } catch (_) { }
    });

    $("#SettingConfig").on("click", function () {
        showMainSection('#form-setting-app');
        try { document.getElementById('form-setting-app').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { }
        renderSettingsForm();
    });

    $('#ManajemenKoin').on('click', function (e) {
        e.preventDefault();
        showMainSection('#token-management');
        try {
            if (window.SnapshotModule && typeof window.SnapshotModule.hide === 'function') {
                window.SnapshotModule.hide();
            }
        } catch (_) { }
        renderTokenManagementList();
    });

    // Scanner Filter Modal Handler
    $('#ScannerFilterModal').on('click', function (e) {
        e.preventDefault();

        // Render filter card to modal
        renderFilterCardToModal();

        // ✅ FIX: Check if scanning - set all inputs to readonly
        const isScanning = (typeof window.App !== 'undefined' &&
            window.App.Scanner &&
            typeof window.App.Scanner.isScanRunning === 'function')
            ? window.App.Scanner.isScanRunning()
            : false;

        if (isScanning) {
            // ✅ Set all inputs in modal to DISABLED (bukan readonly)
            setTimeout(() => {
                // Disable semua input, button, select, textarea dalam modal
                $('#modal-filter-sections').find('input, button, select, textarea').prop('disabled', true).css({
                    'opacity': '0.6',
                    'cursor': 'not-allowed'
                });

                // ✅ PENTING: Pastikan close button TETAP AKTIF
                $('#scanner-filter-modal').find('.uk-modal-close, .uk-modal-close-default, button[uk-close]').prop('disabled', false).css({
                    'opacity': '1',
                    'cursor': 'pointer',
                    'pointerEvents': 'auto'
                });

                // Add warning message
                const warningHtml = `
                    <div class="uk-alert-warning uk-margin-small-top" uk-alert style="padding:8px;">
                        <span uk-icon="icon: warning; ratio: 0.8"></span>
                        <span class="uk-text-small">Filter tidak dapat diubah saat scanning sedang berjalan. Stop scanning terlebih dahulu.</span>
                    </div>
                `;
                if (!$('#modal-filter-sections').find('.uk-alert-warning').length) {
                    $('#modal-filter-sections').prepend(warningHtml);
                }
            }, 100);
        } else {
            // Remove disabled state and warning
            setTimeout(() => {
                $('#modal-filter-sections').find('input, button, select, textarea').prop('disabled', false).css({
                    'opacity': '',
                    'cursor': ''
                });
                $('#modal-filter-sections').find('.uk-alert-warning').remove();
            }, 100);
        }

        // Show modal
        if (window.UIkit?.modal) {
            UIkit.modal('#scanner-filter-modal').show();
        }
    });

    // Global search (in filter card) updates both monitoring and management views
    // Use event delegation since #searchInput is created dynamically
    $(document).on('input', '#searchInput', debounce(function () {
        // Filter monitoring table: tampilkan semua data yang sesuai dengan filter dan pencarian
        const searchValue = ($(this).val() || '').toLowerCase();

        // Build filtered data based on search and current mode
        try {
            const mode = getAppMode();
            const q = searchValue;
            const pick = (t) => {
                try {
                    const chainKey = String(t.chain || '').toLowerCase();
                    const chainName = (window.CONFIG_CHAINS?.[chainKey]?.Nama_Chain || '').toString().toLowerCase();
                    const dexs = (t.dexs || []).map(d => String(d.dex || '').toLowerCase()).join(' ');
                    const addresses = [t.sc_in, t.sc_out].map(x => String(x || '').toLowerCase()).join(' ');
                    return [t.symbol_in, t.symbol_out, t.cex, t.chain, chainName, dexs, addresses]
                        .filter(Boolean)
                        .map(s => String(s).toLowerCase())
                        .join(' ');
                } catch (_) { return ''; }
            };

            let filteredData = [];
            if (!q) {
                // Tidak ada pencarian: tampilkan semua data sesuai filter aktif
                window.scanCandidateTokens = null;
                if (mode.type === 'single') {
                    filteredData = Array.isArray(window.singleChainTokensCurrent) ? window.singleChainTokensCurrent : [];
                } else {
                    filteredData = Array.isArray(window.currentListOrderMulti) ? window.currentListOrderMulti : (Array.isArray(window.filteredTokens) ? window.filteredTokens : []);
                }
            } else {
                // Ada pencarian: filter data dan tampilkan semua yang cocok
                if (mode.type === 'single') {
                    const base = Array.isArray(window.singleChainTokensCurrent) ? window.singleChainTokensCurrent : [];
                    filteredData = base.filter(t => pick(t).includes(q));
                    window.scanCandidateTokens = filteredData;
                } else {
                    const base = Array.isArray(window.currentListOrderMulti) ? window.currentListOrderMulti : (Array.isArray(window.filteredTokens) ? window.filteredTokens : []);
                    filteredData = base.filter(t => pick(t).includes(q));
                    window.scanCandidateTokens = filteredData;
                }
            }

            // Re-render tabel scanning dengan semua data yang sesuai filter
            if (typeof loadKointoTable === 'function') {
                loadKointoTable(filteredData, 'dataTableBody');
            }
        } catch (_) { }

        // Re-render token management list to apply same query
        try { renderTokenManagementList(); } catch (_) { }
    }, 250));

    // Modal search input - sync with main search input
    $(document).on('input', '#modal-searchInput', debounce(function () {
        const searchValue = ($(this).val() || '').toLowerCase();

        // Sync with main search input
        $('#searchInput').val(searchValue);

        // Trigger same filtering logic
        const mode = getAppMode();
        const q = searchValue;
        const pick = (t) => {
            try {
                const chainKey = String(t.chain || '').toLowerCase();
                const chainName = (window.CONFIG_CHAINS?.[chainKey]?.Nama_Chain || '').toString().toLowerCase();
                const dexs = (t.dexs || []).map(d => String(d.dex || '').toLowerCase()).join(' ');
                const addresses = [t.sc_in, t.sc_out].map(x => String(x || '').toLowerCase()).join(' ');
                return [t.symbol_in, t.symbol_out, t.cex, t.chain, chainName, dexs, addresses]
                    .map(x => String(x || '').toLowerCase()).join(' ');
            } catch (_) { return ''; }
        };

        let filteredData = [];
        try {
            if (!q) {
                // Tidak ada pencarian: tampilkan data sesuai filter saat ini
                if (mode.type === 'single') {
                    filteredData = Array.isArray(window.singleChainTokensCurrent) ? window.singleChainTokensCurrent : [];
                    window.scanCandidateTokens = filteredData;
                } else {
                    filteredData = Array.isArray(window.currentListOrderMulti) ? window.currentListOrderMulti : (Array.isArray(window.filteredTokens) ? window.filteredTokens : []);
                }
            } else {
                // Ada pencarian: filter data dan tampilkan semua yang cocok
                if (mode.type === 'single') {
                    const base = Array.isArray(window.singleChainTokensCurrent) ? window.singleChainTokensCurrent : [];
                    filteredData = base.filter(t => pick(t).includes(q));
                    window.scanCandidateTokens = filteredData;
                } else {
                    const base = Array.isArray(window.currentListOrderMulti) ? window.currentListOrderMulti : (Array.isArray(window.filteredTokens) ? window.filteredTokens : []);
                    filteredData = base.filter(t => pick(t).includes(q));
                    window.scanCandidateTokens = filteredData;
                }
            }

            // Re-render tabel scanning dengan semua data yang sesuai filter
            if (typeof loadKointoTable === 'function') {
                loadKointoTable(filteredData, 'dataTableBody');
            }
        } catch (_) { }

        // Re-render token management list to apply same query
        try { renderTokenManagementList(); } catch (_) { }
    }, 250));

    // Open Scanner Filter Modal from Management Menu
    $(document).on('click', '#btnToggleMgrFilter', function () {
        // Trigger same modal as scanner filter
        $('#ScannerFilterModal').trigger('click');
    });

    $(document).on('click', '#btnNewToken', () => {
        const keys = Object.keys(window.CONFIG_CHAINS || {});
        const firstChainWithDex = keys.find(k => {
            const d = CONFIG_CHAINS[k]?.DEXS;
            return Array.isArray(d) ? d.length > 0 : !!(d && Object.keys(d).length);
        }) || keys[0] || '';

        const empty = { id: Date.now().toString(), chain: String(firstChainWithDex).toLowerCase(), status: true, selectedCexs: [], selectedDexs: [], dataDexs: {}, dataCexs: {} };

        $('#multiTokenIndex').val(empty.id);
        $('#inputSymbolToken, #inputSCToken, #inputSymbolPair, #inputSCPair').val('');
        $('#inputDesToken, #inputDesPair').val('');
        setStatusRadios(true);

        const $sel = $('#FormEditKoinModal #mgrChain');
        populateChainSelect($sel, empty.chain);

        // Enforce chain select by mode + theme the modal
        try {
            const m = getAppMode();
            if (m.type === 'single') {
                const c = String(m.chain).toLowerCase();
                $sel.val(c).prop('disabled', true).attr('title', 'Per-chain mode: Chain terkunci');
                if (typeof applyEditModalTheme === 'function') applyEditModalTheme(c);
                $('#CopyToMultiBtn').show();
            } else {
                $sel.prop('disabled', false).attr('title', '');
                if (typeof applyEditModalTheme === 'function') applyEditModalTheme(null);
                $('#CopyToMultiBtn').hide();
            }
        } catch (_) { }

        const currentChain = String($sel.val() || empty.chain).toLowerCase();
        const baseToken = { ...empty, chain: currentChain };

        buildCexCheckboxForKoin(baseToken);
        buildDexCheckboxForKoin(baseToken);

        $sel.off('change.rebuildDexAdd').on('change.rebuildDexAdd', function () {
            const newChain = String($(this).val() || '').toLowerCase();
            buildDexCheckboxForKoin({ ...baseToken, chain: newChain });
            try { if (typeof applyEditModalTheme === 'function') applyEditModalTheme(newChain); } catch (_) { }
        });

        if (window.UIkit?.modal) UIkit.modal('#FormEditKoinModal').show();
    });

    $('#UpdateWalletCEX').on('click', async () => {
        // NEW UI: Show wallet exchanger section instead of running immediately
        try {
            if (window.App?.WalletExchanger?.show) {
                window.App.WalletExchanger.show();
                return;
            }
        } catch (err) {
            // console.error('[UpdateWalletCEX] Error showing wallet exchanger section:', err);
        }

        // FALLBACK: Old behavior (direct execution) if new UI not available
        // Pre-check: require at least 1 CEX selected in filter chips
        try {
            const m = getAppMode();
            let selected = [];
            if (m.type === 'single') {
                const fc = getFilterChain(m.chain || '');
                selected = (fc && Array.isArray(fc.cex)) ? fc.cex : [];
            } else {
                const fm = getFilterMulti();
                selected = (fm && Array.isArray(fm.cex)) ? fm.cex : [];
            }
            const cfg = (typeof window !== 'undefined' ? (window.CONFIG_CEX || {}) : (CONFIG_CEX || {}));
            const valid = (selected || []).map(x => String(x).toUpperCase()).filter(cx => !!cfg[cx]);
            if (!valid.length) {
                if (typeof toast !== 'undefined' && toast.error) toast.error('Pilih minimal 1 CEX pada filter sebelum update wallet.');
                try { setLastAction('UPDATE WALLET EXCHANGER', 'error', { reason: 'NO_CEX_SELECTED' }); } catch (_) { }
                return;
            }
        } catch (_) { /* fallthrough to confirm */ }

        if (!confirm("APAKAH ANDA INGIN UPDATE WALLET EXCHANGER?")) { try { setLastAction('UPDATE WALLET EXCHANGER', 'warning', { reason: 'CANCELLED' }); } catch (_) { } return; }

        // Ensure any running scan stops before updating wallets
        try {
            const st = getAppState();
            if (st && st.run === 'YES' && window.App?.Scanner?.stopScannerSoft) {
                window.App.Scanner.stopScannerSoft();
                // Small delay to let UI settle
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (_) { }

        // Run wallet update; page will reload after success in the service layer
        try { checkAllCEXWallets(); } catch (e) { console.error(e); }
    });

    // ❌ REMOVED DUPLICATE START BUTTON HANDLER (caused duplicate Telegram notifications)
    // Start button handler is registered in core/handlers/scanner-handlers.js:204-348

    // Token Management Form Handlers
    // ❌ REMOVED DUPLICATE EXPORT HANDLER (caused multi-download issue)
    // Export handler is registered in core/handlers/token-handlers.js:170-172
    // ❌ REMOVED DUPLICATE IMPORT HANDLER (main.js:1819-1822)
    // Import handler is registered in core/handlers/token-handlers.js:177-180
    // Removed to fix double-click issue when uploading CSV file
    $(document).on('submit', '#multiTokenForm', function (e) {
        e.preventDefault();
        const id = $('#multiTokenIndex').val();
        if (!id) return (typeof toast !== 'undefined' && toast.error) ? toast.error('ID token tidak ditemukan.') : undefined;

        // ========== LOADING INDICATOR ==========
        const $saveBtn = $('#SaveEditkoin');
        const originalBtnHtml = $saveBtn.html();
        $saveBtn.prop('disabled', true).html('<span uk-spinner="ratio: 0.6"></span> Menyimpan...');

        // Show overlay for visual feedback
        let overlayId = null;
        try {
            if (window.AppOverlay) {
                overlayId = window.AppOverlay.show('Memperbarui data koin...');
            }
        } catch (_) { }
        // ======================================

        const updatedToken = {
            id,
            symbol_in: ($('#inputSymbolToken').val() || '').trim(),
            des_in: Number($('#inputDesToken').val() || 0),
            sc_in: ($('#inputSCToken').val() || '').trim(),
            symbol_out: ($('#inputSymbolPair').val() || '').trim(),
            des_out: Number($('#inputDesPair').val() || 0),
            sc_out: ($('#inputSCPair').val() || '').trim(),
            chain: String($('#FormEditKoinModal #mgrChain').val() || '').toLowerCase(),
            status: readStatusRadio(),
            ...readCexSelectionFromForm(),
            ...readDexSelectionFromForm()
        };

        if (!updatedToken.symbol_in || !updatedToken.symbol_out) {
            // Restore button state
            $saveBtn.prop('disabled', false).html(originalBtnHtml);
            if (overlayId && window.AppOverlay) window.AppOverlay.hide(overlayId);
            return (typeof toast !== 'undefined' && toast.warning) ? toast.warning('Symbol Token & Pair tidak boleh kosong') : undefined;
        }

        const m = getAppMode();
        let tokens = (m.type === 'single') ? getTokensChain(m.chain) : getTokensMulti();
        const idx = tokens.findIndex(t => String(t.id) === String(id));

        const buildDataCexs = (prev = {}) => {
            const obj = {};
            (updatedToken.selectedCexs || []).forEach(cx => {
                const up = String(cx).toUpperCase();
                obj[up] = prev[up] || { feeWDToken: 0, feeWDPair: 0, depositToken: false, withdrawToken: false, depositPair: false, withdrawPair: false };
            });
            return obj;
        };
        updatedToken.dataCexs = buildDataCexs(idx !== -1 ? tokens[idx].dataCexs : {});

        if (idx !== -1) {
            tokens[idx] = { ...tokens[idx], ...updatedToken };
        } else {
            tokens.push(updatedToken);
        }

        if (m.type === 'single') setTokensChain(m.chain, tokens); else setTokensMulti(tokens);

        // ========== TIDAK Auto-Refresh Setelah Simpan ==========
        setTimeout(() => {
            try {
                if (typeof toast !== 'undefined' && toast.success) {
                    const msg = idx !== -1 ? 'Perubahan token berhasil disimpan' : 'Token baru berhasil ditambahkan';
                    toast.success(msg);
                }

                // Restore button state
                $saveBtn.prop('disabled', false).html(originalBtnHtml);

                // Hide overlay
                if (overlayId && window.AppOverlay) {
                    window.AppOverlay.hide(overlayId);
                }

                // Token management list tetap di-refresh (tidak mengganggu)
                try {
                    renderTokenManagementList();
                } catch (e) {
                    console.error('[Update Token] Management list refresh error:', e);
                }

                try {
                    const action = (idx !== -1) ? 'UBAH KOIN' : 'TAMBAH KOIN';
                    setLastAction(`${action}`);
                } catch (_) { setLastAction('UBAH KOIN'); }

                if (window.UIkit?.modal) UIkit.modal('#FormEditKoinModal').hide();
            } catch (e) {
                console.error('[Update Token] Error:', e);
                $saveBtn.prop('disabled', false).html(originalBtnHtml);
                if (overlayId && window.AppOverlay) window.AppOverlay.hide(overlayId);
            }
        }, 50); // Small delay for smooth UI transition
        // ================================================
    });

    $(document).on('click', '#HapusEditkoin', function (e) {
        e.preventDefault();
        const id = $('#multiTokenIndex').val();
        if (!id) return (typeof toast !== 'undefined' && toast.error) ? toast.error('ID token tidak ditemukan.') : undefined;

        // Compose detailed confirmation message
        const symIn = String(($('#inputSymbolToken').val() || '')).trim().toUpperCase();
        const symOut = String(($('#inputSymbolPair').val() || '')).trim().toUpperCase();
        const mode = getAppMode();
        const chainSel = String($('#FormEditKoinModal #mgrChain').val() || (mode.type === 'single' ? mode.chain : '')).toUpperCase();
        let cexList = '-';
        let dexList = '-';
        try {
            const cex = (readCexSelectionFromForm()?.selectedCexs || []).map(x => String(x).toUpperCase());
            const dex = (readDexSelectionFromForm()?.selectedDexs || []).map(x => String(x).toUpperCase());
            cexList = cex.length ? cex.join(', ') : '-';
            dexList = dex.length ? dex.join(', ') : '-';
        } catch (_) { }
        const detailMsg = `⚠️ INGIN HAPUS DATA KOIN INI?\n\n` +
            `- Pair : ${symIn || '?'} / ${symOut || '?'}\n` +
            `- Chain: ${chainSel || '?'}\n` +
            `- CEX  : ${cexList}\n` +
            `- DEX  : ${dexList}`;

        if (confirm(detailMsg)) {
            deleteTokenById(id);
            if (typeof toast !== 'undefined' && toast.success) toast.success(`KOIN TERHAPUS`);
            if (window.UIkit?.modal) UIkit.modal('#FormEditKoinModal').hide();
            // Live refresh current view without reloading page (works during scanning)
            try {
                const m = getAppMode();
                if (m.type === 'single') { loadAndDisplaySingleChainTokens(); }
                else { refreshTokensTable(); }
                renderTokenManagementList();
            } catch (_) { }
        }
    });


    // ❌ REMOVED DUPLICATE HANDLER: CopyToMultiBtn
    // Handler now registered ONLY in core/handlers/token-handlers.js (line 331)
    // with improved CEX/DEX merge logic



    // ========== DEBUG HELPER: View Multichain Tokens ==========
    // User can call this from browser console to see all tokens in multichain
    // Usage: window.debugMultichainTokens() or window.debugMultichainTokens('ethereum')
    window.debugMultichainTokens = function (chainFilter = null) {
        try {
            const multi = getTokensMulti();
            console.log(`[DEBUG] Total tokens in multichain: ${multi.length}`);

            if (chainFilter) {
                const filtered = multi.filter(t => String(t.chain).toLowerCase() === String(chainFilter).toLowerCase());
                console.log(`[DEBUG] Tokens for chain "${chainFilter}": ${filtered.length}`);
                console.table(filtered.map(t => ({
                    Chain: String(t.chain).toUpperCase(),
                    Pair: `${t.symbol_in}/${t.symbol_out}`,
                    CEX: (t.selectedCexs || []).join(', ') || '-',
                    DEX: (t.selectedDexs || []).join(', ') || '-',
                    Status: t.status ? 'ON' : 'OFF'
                })));
                return filtered;
            } else {
                console.table(multi.map(t => ({
                    Chain: String(t.chain).toUpperCase(),
                    Pair: `${t.symbol_in}/${t.symbol_out}`,
                    CEX: (t.selectedCexs || []).join(', ') || '-',
                    DEX: (t.selectedDexs || []).join(', ') || '-',
                    Status: t.status ? 'ON' : 'OFF'
                })));
                return multi;
            }
        } catch (e) {
            console.error('[DEBUG] Error:', e);
            return null;
        }
    };
    console.log('💡 Debug helper loaded: window.debugMultichainTokens() or window.debugMultichainTokens("ethereum")');
    // ========== END DEBUG HELPER ==========

    $('#mgrTbody').on('click', '.mgrEdit', function () {
        try {
            const id = $(this).data('id');
            if (id) {
                openEditModalById(id);
            } else {
                if (typeof toast !== 'undefined' && toast.error) toast.error('ID token tidak ditemukan pada tombol edit.');
            }
        } catch (e) {
            // console.error('Gagal membuka modal edit dari manajemen list:', e);
            if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal membuka form edit.');
        }
    });

    $(document).on('change', '.mgrStatus', function () {
        const id = String($(this).data('id'));
        const val = $(this).val() === 'true';
        const m = getAppMode();
        let tokens = (m.type === 'single') ? getTokensChain(m.chain) : getTokensMulti();
        const idx = tokens.findIndex(t => String(t.id) === id);
        if (idx !== -1) {
            tokens[idx].status = val;
            if (m.type === 'single') setTokensChain(m.chain, tokens); else setTokensMulti(tokens);
            if (typeof toast !== 'undefined' && toast.success) toast.success(`Status diubah ke ${val ? 'ON' : 'OFF'}`);
            try {
                const chainLbl = String(tokens[idx]?.chain || (m.type === 'single' ? m.chain : 'all')).toUpperCase();
                const pairLbl = `${String(tokens[idx]?.symbol_in || '').toUpperCase()}/${String(tokens[idx]?.symbol_out || '').toUpperCase()}`;
                setLastAction(`UBAH STATUS KOIN`);
            } catch (_) { setLastAction('UBAH STATUS KOIN'); }
        }
    });

    // =================================================================================
    // Sync Modal Helpers (Server / Snapshot)
    // =================================================================================
    // REFACTORED: Snapshot operations now unified in snapshot-new.js
    // - processSnapshotForCex() handles all CEX data fetching and enrichment
    // - saveToSnapshot() moved to snapshot-new.js (exported via window.SnapshotModule)
    // - Single IndexedDB storage for all snapshot data (SNAPSHOT_DATA_KOIN key)
    //
    // This file only handles:
    // - Loading snapshot data to modal UI
    // - Fetching from remote JSON server (fallback)
    // - Modal interaction handlers
    // =================================================================================

    const SNAPSHOT_DB_CONFIG = (function () {
        const root = (typeof window !== 'undefined') ? window : {};
        const appCfg = (root.CONFIG_APP && root.CONFIG_APP.APP) ? root.CONFIG_APP.APP : {};
        const dbCfg = root.CONFIG_DB || {};
        return {
            name: dbCfg.NAME || appCfg.NAME || 'MULTIALL-PLUS',
            store: (dbCfg.STORES && dbCfg.STORES.SNAPSHOT) ? dbCfg.STORES.SNAPSHOT : 'SNAPSHOT_STORE',
            snapshotKey: 'SNAPSHOT_DATA_KOIN'
        };
    })();
    let snapshotDbInstance = null;

    function setSyncSourceIndicator(label) {
        try {
            $('#sync-source-indicator').text(label || '-');
        } catch (_) { }
    }

    // ====================================================================================
    // SNAPSHOT PROCESS FUNCTIONS
    // ====================================================================================

    // =================================================================================
    // SNAPSHOT OVERLAY SYSTEM - Modern AppOverlay Integration
    // =================================================================================
    // Modern overlay system using AppOverlay manager with full progress tracking
    // Optimized for snapshot and wallet exchanger operations

    const SnapshotOverlay = (function () {
        let overlayId = null;
        const OVERLAY_ID = 'snapshot-process-overlay';

        return {
            /**
             * Show overlay with initial message
             * @param {string} title - Main title/message
             * @param {string} subtitle - Subtitle/phase info
             */
            show(title = 'Memproses...', subtitle = '') {
                try {
                    // Hide existing overlay if any
                    if (overlayId) {
                        this.hide();
                    }

                    // Create new overlay with progress
                    overlayId = AppOverlay.showProgress({
                        id: OVERLAY_ID,
                        title: title,
                        message: subtitle,
                        progressValue: 0,
                        progressMax: 100,
                        canClose: false
                    });
                } catch (error) {
                    console.error('[SnapshotOverlay.show] ERROR:', error);
                }
            },

            /**
             * Hide overlay with optional delay
             * @param {number} delay - Delay in milliseconds before hiding (default: 0)
             */
            hide(delay = 0) {
                try {
                    const doHide = () => {
                        if (overlayId) {
                            AppOverlay.hide(overlayId);
                            overlayId = null;
                        }
                    };

                    if (delay > 0) {
                        setTimeout(doHide, delay);
                    } else {
                        doHide();
                    }
                } catch (error) {
                    console.error('[SnapshotOverlay.hide] ERROR:', error);
                }
            },

            /**
             * Update progress bar
             * @param {number} current - Current progress value
             * @param {number} total - Total/max value
             * @param {string} message - Progress message
             */
            updateProgress(current, total, message = '') {
                try {
                    if (!overlayId) {
                        return;
                    }

                    AppOverlay.updateProgress(overlayId, current, total, message);
                } catch (error) {
                    console.error('[SnapshotOverlay.updateProgress] Error:', error);
                }
            },

            /**
             * Update overlay message/subtitle
             * @param {string} title - Main title (optional, keeps current if not provided)
             * @param {string} subtitle - Subtitle/phase (optional)
             */
            updateMessage(title, subtitle) {
                try {
                    if (!overlayId) return;

                    // Update subtitle/message if provided
                    if (subtitle !== undefined) {
                        AppOverlay.updateMessage(overlayId, subtitle);
                    }

                    // Update title if provided
                    if (title !== undefined && title !== null) {
                        const overlay = AppOverlay.get(overlayId);
                        if (overlay && overlay.element) {
                            const titleEl = overlay.element.querySelector('.app-overlay-title');
                            if (titleEl) {
                                // Preserve spinner if exists
                                const spinner = titleEl.querySelector('.app-overlay-spinner');
                                titleEl.textContent = title;
                                if (spinner) {
                                    titleEl.insertBefore(spinner, titleEl.firstChild);
                                }
                            }
                        }
                    }
                } catch (error) {
                    // console.error('[SnapshotOverlay.updateMessage] Error:', error);
                }
            },

            /**
             * Show success message and auto-hide
             * @param {string} message - Success message
             * @param {number} autoHideDelay - Delay before auto-hide (default: 1500ms)
             */
            showSuccess(message, autoHideDelay = 1500) {
                try {
                    this.updateMessage('✅ Berhasil!', message);
                    this.updateProgress(100, 100, '');
                    this.hide(autoHideDelay);
                } catch (error) {
                    // console.error('[SnapshotOverlay.showSuccess] Error:', error);
                }
            },

            /**
             * Show error message and auto-hide
             * @param {string} message - Error message
             * @param {number} autoHideDelay - Delay before auto-hide (default: 2000ms)
             */
            showError(message, autoHideDelay = 2000) {
                try {
                    this.updateMessage('❌ Gagal!', message);
                    this.hide(autoHideDelay);
                } catch (error) {
                    // console.error('[SnapshotOverlay.showError] Error:', error);
                }
            },

            /**
             * Check if overlay is currently shown
             */
            isShown() {
                return overlayId !== null;
            }
        };
    })();

    // Export to window for backward compatibility
    window.SnapshotOverlay = SnapshotOverlay;

    // Legacy API for backward compatibility with existing code
    window.showSyncOverlay = (msg, phase) => SnapshotOverlay.show(msg, phase);
    window.hideSyncOverlay = (delay) => SnapshotOverlay.hide(delay || 0);
    window.updateSyncOverlayProgress = (current, total, phase) => SnapshotOverlay.updateProgress(current, total, phase);
    window.setSyncOverlayMessage = (msg, phase) => SnapshotOverlay.updateMessage(phase, msg);

    // Ensure snapshot-new.js has initialized the global module before use
    let snapshotModuleLoader = null;
    async function ensureSnapshotModuleLoaded() {
        const isReady = () => window.SnapshotModule && typeof window.SnapshotModule.processSnapshotForCex === 'function';
        if (isReady()) return window.SnapshotModule;
        if (snapshotModuleLoader) return snapshotModuleLoader;

        snapshotModuleLoader = new Promise((resolve, reject) => {
            let timer = null;
            const start = Date.now();
            const timeout = 10000;
            const tickInterval = 100;

            const finishIfReady = () => {
                if (isReady()) {
                    if (timer) clearInterval(timer);
                    resolve(window.SnapshotModule);
                    return true;
                }
                return false;
            };

            const existingScript = Array.from(document.getElementsByTagName('script'))
                .find(s => typeof s.src === 'string' && s.src.includes('snapshot-new.js'));

            const attachListeners = (scriptEl) => {
                if (!scriptEl) return;
                scriptEl.addEventListener('load', () => finishIfReady(), { once: true });
                scriptEl.addEventListener('error', () => {
                    if (timer) clearInterval(timer);
                    reject(new Error('Snapshot module gagal dimuat'));
                }, { once: true });
            };

            if (!existingScript) {
                const head = document.head || document.getElementsByTagName('head')[0];
                if (!head) {
                    reject(new Error('Tidak dapat menemukan elemen <head> untuk memuat snapshot module'));
                    return;
                }
                const script = document.createElement('script');
                script.src = 'snapshot-new.js';
                script.async = false;
                attachListeners(script);
                head.appendChild(script);
            } else {
                attachListeners(existingScript);
            }

            if (finishIfReady()) return;

            timer = setInterval(() => {
                if (finishIfReady()) return;
                if ((Date.now() - start) >= timeout) {
                    clearInterval(timer);
                    reject(new Error('Snapshot module belum siap (timeout)'));
                }
            }, tickInterval);
        }).finally(() => {
            snapshotModuleLoader = null;
        });

        return snapshotModuleLoader;
    }


    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function resetSyncModalSelections() {
        try {
            // Reset radio button selection dan disable sampai tabel selesai di-render
            const $modeRadios = $('input[name="sync-pick-mode"]');
            $modeRadios.prop('checked', false);
            $modeRadios.prop('disabled', true);

            // Visual feedback: disabled state
            $modeRadios.closest('label').css({
                opacity: '0.5',
                pointerEvents: 'none',
                cursor: 'not-allowed'
            });

            // Reset checkbox Wallet Filter ke unchecked dan disabled (default: abaikan/tampilkan semua)
            const $walletFilter = $('#sync-wallet-filter');
            $walletFilter.prop('checked', false);
            $walletFilter.prop('disabled', true);

            // Visual feedback: disabled state
            $walletFilter.closest('label').css({
                opacity: '0.5',
                pointerEvents: 'none',
                cursor: 'not-allowed'
            });
        } catch (_) { }
    }

    function setSyncModalData(chainKey, rawTokens, savedTokens, sourceLabel) {
        try {
            // console.log('setSyncModalData called:', {
            // chainKey,
            // rawTokensLength: rawTokens?.length,
            // savedTokensLength: savedTokens?.length,
            // sourceLabel
            // });

            const chainLower = String(chainKey || '').toLowerCase();
            const normalizedSource = (String(sourceLabel || 'server').toLowerCase().includes('snapshot')) ? 'snapshot' : 'server';
            const list = Array.isArray(rawTokens) ? rawTokens.map((item, idx) => {
                const clone = Object.assign({}, item);
                if (typeof clone._idx !== 'number') clone._idx = idx;
                if (!clone.__source) clone.__source = normalizedSource;
                return clone;
            }) : [];

            // console.log('Processed list:', list.length, 'items');

            const $modal = $('#sync-modal');
            $modal.data('remote-raw', list);
            const savedList = Array.isArray(savedTokens) ? savedTokens : [];
            $modal.data('saved-tokens', savedList);
            $modal.data('source', normalizedSource);
            resetSyncModalSelections();
            const labelText = `${sourceLabel || 'Server'} (${list.length})`;
            setSyncSourceIndicator(labelText);
            buildSyncFilters(chainLower);

            // console.log('About to render table for chain:', chainLower);
            renderSyncTable(chainLower);
        } catch (error) {
            // console.error('setSyncModalData failed:', error);
        }
    }

    function parseNumberSafe(val, fallback = 0) {
        const num = Number(val);
        return Number.isFinite(num) ? num : fallback;
    }

    function parseSnapshotStatus(val) {
        if (val === undefined || val === null || val === '') return null;
        if (val === true) return true;
        if (val === false) return false;
        const str = String(val).toLowerCase();
        if (['on', 'true', 'yes', 'open', 'enabled', 'aktif', '1'].includes(str)) return true;
        if (['off', 'false', 'no', 'close', 'closed', 'disabled', 'nonaktif', 'tidak', '0'].includes(str)) return false;
        return null;
    }
    try { window.parseSnapshotStatus = parseSnapshotStatus; } catch (_) { }

    function readNonPairConfig() {
        try {
            const pairSymbol = ($('#sync-non-pair-name').val() || '').trim().toUpperCase();
            const pairSc = ($('#sync-non-pair-sc').val() || '').trim();
            const desRaw = $('#sync-non-pair-des').val();
            const desVal = desRaw === '' ? null : Number(desRaw);
            return {
                symbol: pairSymbol,
                sc: pairSc,
                des: Number.isFinite(desVal) && desVal >= 0 ? desVal : null
            };
        } catch (_) {
            return { symbol: '', sc: '', des: null };
        }
    }

    function toggleNonPairInputs() {
        try {
            // Check if NON is selected (radio button)
            const isNonChecked = $('#sync-filter-pair input[type="radio"]:checked').val() === 'NON';
            $('#sync-non-config').css('display', isNonChecked ? 'block' : 'none');

            // If NON is selected, validate inputs and update button state
            if (isNonChecked) {
                validateNonPairInputs();
            }
        } catch (_) { }
    }

    try { window.toggleNonPairInputs = toggleNonPairInputs; } catch (_) { }

    function validateNonPairInputs() {
        try {
            const isNonSelected = $('#sync-filter-pair input[type="radio"]:checked').val() === 'NON';
            if (!isNonSelected) return true; // Not NON, no validation needed

            const pairName = String($('#sync-non-pair-name').val() || '').trim();
            const pairSc = String($('#sync-non-pair-sc').val() || '').trim();
            const pairDes = $('#sync-non-pair-des').val();

            const isValid = pairName && pairSc && pairDes && Number.isFinite(Number(pairDes));

            // Update visual feedback HANYA untuk input NON (cepat)
            $('#sync-non-pair-name').toggleClass('uk-form-danger', !pairName);
            $('#sync-non-pair-sc').toggleClass('uk-form-danger', !pairSc);
            $('#sync-non-pair-des').toggleClass('uk-form-danger', !pairDes || !Number.isFinite(Number(pairDes)));

            // ========== OPTIMASI: Update button state secara langsung ==========
            // Jangan panggil updateAddTokenButtonState() karena itu query semua checkbox (lambat!)
            // Langsung update button Save berdasarkan validasi NON saja
            const $saveBtn = $('#sync-save-btn');
            if ($saveBtn.length) {
                // Jika NON dipilih, button Save enable/disable berdasarkan validasi input NON
                // (Asumsi: koin sudah dipilih sebelumnya, pair baru bisa diklik)
                $saveBtn.prop('disabled', !isValid);
                if (!isValid) {
                    $saveBtn.attr('title', 'Lengkapi data Pair NON terlebih dahulu');
                } else {
                    $saveBtn.removeAttr('title');
                }
            }
            // =====================================================================

            return isValid;
        } catch (e) {
            // console.error('validateNonPairInputs error:', e);
            return false;
        }
    }
    try { window.validateNonPairInputs = validateNonPairInputs; } catch (_) { }

    function updateAddTokenButtonState() {
        try {
            // Update both "Save" button in modal footer and any other add buttons
            const $addBtn = $('#sync-save-btn, .sync-add-token-button, #btn-add-sync-tokens');
            if (!$addBtn.length) return;

            // Cek apakah ada koin yang dipilih
            const hasSelection = $('#sync-modal-tbody .sync-token-checkbox:checked').length > 0;
            const isNonSelected = $('#sync-filter-pair input[type="radio"]:checked').val() === 'NON';

            let canSave = hasSelection;
            let tooltipMsg = '';

            if (!hasSelection) {
                canSave = false;
                tooltipMsg = 'Pilih minimal 1 koin untuk disimpan';
            } else if (isNonSelected) {
                // Check if NON inputs are valid
                const isValid = validateNonPairInputs();
                canSave = isValid;
                if (!isValid) {
                    tooltipMsg = 'Lengkapi data Pair NON terlebih dahulu';
                }
            }

            $addBtn.prop('disabled', !canSave);
            if (tooltipMsg) {
                $addBtn.attr('title', tooltipMsg);
            } else {
                $addBtn.removeAttr('title');
            }
        } catch (_) { }
    }
    try { window.updateAddTokenButtonState = updateAddTokenButtonState; } catch (_) { }

    function updatePriceFilterState() {
        try {
            // Check if table has data rows (bukan pesan kosong)
            const $tbody = $('#sync-modal-tbody');
            const rowCount = $tbody.find('tr').length;
            const hasEmptyMessage = $tbody.find('tr td[colspan]').length > 0;
            const hasData = rowCount > 0 && !hasEmptyMessage;

            // Get radio buttons
            const $allRadio = $('input[name="sync-price-filter"][value="all"]');
            const $priceRadio = $('input[name="sync-price-filter"][value="with-price"]');

            // Kedua filter SELALU enabled jika ada data di tabel
            // Pesan informatif akan ditampilkan di tabel jika tidak ada hasil
            $allRadio.prop('disabled', !hasData);
            $priceRadio.prop('disabled', !hasData);

            // Visual feedback untuk setiap label
            $allRadio.closest('label').css({
                opacity: hasData ? '1' : '0.5',
                cursor: hasData ? 'pointer' : 'not-allowed'
            });

            $priceRadio.closest('label').css({
                opacity: hasData ? '1' : '0.5',
                cursor: hasData ? 'pointer' : 'not-allowed'
            });

            console.log(`[updatePriceFilterState] Rows: ${rowCount}, HasData: ${hasData}, Filters: ${hasData ? 'ENABLED' : 'DISABLED'}`);
        } catch (e) {
            console.error('[updatePriceFilterState] Error:', e);
        }
    }
    try { window.updatePriceFilterState = updatePriceFilterState; } catch (_) { }

    function updateSyncSelectedCount() {
        try {
            const total = $('#sync-modal-tbody .sync-token-checkbox:checked').length;
            // Update counter dengan angka saja (lebih simpel)
            $('#sync-selected-count').text(total);
            const hasSelection = total > 0;

            console.log(`[updateSyncSelectedCount] Counter updated: ${total} koin dipilih`);

            // ========== RADIO BUTTON ENABLE/DISABLE DIPINDAH KE renderSyncTable() ==========
            // Radio button diaktifkan di renderSyncTable() setelah tabel selesai di-render
            // (TIDAK di sini, agar konsisten dengan konsep baru)
            // ================================================================================

            // ========== PAIR: AKTIF/NONAKTIF SESUAI ADA/TIDAKNYA KOIN YANG DICENTANG ==========
            // Sama seperti DEX, pair hanya aktif jika ada koin yang dipilih
            const $pairRadios = $('#sync-filter-pair input[type="radio"]');
            if ($pairRadios.length) {
                $pairRadios.prop('disabled', !hasSelection);

                // Visual feedback
                $pairRadios.closest('label').css({
                    opacity: hasSelection ? '1' : '0.5',
                    pointerEvents: hasSelection ? 'auto' : 'none',
                    cursor: hasSelection ? 'pointer' : 'not-allowed'
                });

                console.log(`[updateSyncSelectedCount] Pair radios: ${hasSelection ? 'ENABLED' : 'DISABLED'}`);
            }

            // Toggle NON inputs visibility hanya jika TIDAK ada selection
            // Jika ada selection, biarkan handler pair change yang handle toggle
            if (!hasSelection) {
                // Jika tidak ada koin yang dipilih, sembunyikan NON inputs
                $('#sync-non-config').css('display', 'none');
            }
            // =================================================================================

            // Input DEX: aktif/nonaktif sesuai ada/tidaknya koin yang dicentang
            const $dexInputs = $('#sync-dex-config').find('input');
            if ($dexInputs.length) {
                $dexInputs.prop('disabled', !hasSelection);
                $('#sync-dex-config').css({ opacity: hasSelection ? '' : '0.5', pointerEvents: hasSelection ? '' : 'none' });
            }

            // Update tombol SAVE: hanya aktif jika ada koin yang dipilih
            const $saveBtn = $('#sync-save-btn');
            if ($saveBtn.length) {
                // Cek juga apakah pair NON dan perlu validasi
                const isNonSelected = $('#sync-filter-pair input[type="radio"]:checked').val() === 'NON';
                let canSave = hasSelection;

                if (isNonSelected && hasSelection) {
                    // Jika pair NON dipilih, cek validasi NON inputs
                    canSave = typeof validateNonPairInputs === 'function' ? validateNonPairInputs() : true;
                }

                $saveBtn.prop('disabled', !canSave);

                if (!hasSelection) {
                    $saveBtn.attr('title', 'Pilih minimal 1 koin untuk disimpan');
                } else if (isNonSelected && !canSave) {
                    $saveBtn.attr('title', 'Lengkapi data Pair NON terlebih dahulu');
                } else {
                    $saveBtn.removeAttr('title');
                }
            }
        } catch (_) { }
    }
    try { window.updateSyncSelectedCount = updateSyncSelectedCount; } catch (_) { }

    const SYNC_PRICE_CACHE_TTL = 60000; // 60 detik
    try { window.SYNC_PRICE_CACHE_TTL = SYNC_PRICE_CACHE_TTL; } catch (_) { }

    function getSyncPriceCache() {
        if (!window.__SYNC_PRICE_CACHE) window.__SYNC_PRICE_CACHE = new Map();
        return window.__SYNC_PRICE_CACHE;
    }
    try { window.getSyncPriceCache = getSyncPriceCache; } catch (_) { }

    function formatSyncPriceValue(price, currency) {
        if (!Number.isFinite(price) || price <= 0) return '-';

        // Format berbeda untuk IDR vs USDT
        const curr = String(currency || 'USDT').toUpperCase();
        let formatted = '';

        if (curr === 'IDR') {
            // IDR: format dengan pemisah ribuan, tanpa desimal untuk nilai besar
            if (price >= 1000) {
                formatted = new Intl.NumberFormat('id-ID', {
                    style: 'decimal',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(price);
            } else {
                formatted = new Intl.NumberFormat('id-ID', {
                    style: 'decimal',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(price);
            }
            return `Rp ${formatted}`;
        } else {
            // USDT/other crypto: use existing formatPrice or standard format
            if (typeof formatPrice === 'function') {
                formatted = formatPrice(price);
            } else {
                formatted = price.toFixed(price >= 1 ? 4 : 6);
            }
            return `$${formatted}`;
        }
    }
    try { window.formatSyncPriceValue = formatSyncPriceValue; } catch (_) { }

    function setSyncPriceCell(cex, symbol, pair, price, renderId, currency) {
        const $cell = $(`#sync-modal-tbody td[data-price-cex="${cex}"][data-symbol="${symbol}"][data-pair="${pair}"]`);
        if (!$cell.length) return;
        const currentToken = Number($cell.data('render-id')) || 0;
        if (renderId && currentToken && renderId !== currentToken) return;
        if (renderId) $cell.data('render-id', renderId);
        // Determine currency: INDODAX uses IDR, others use USDT/pair
        const priceCurrency = currency || (String(cex).toUpperCase() === 'INDODAX' ? 'IDR' : 'USDT');
        $cell.text(formatSyncPriceValue(price, priceCurrency));
    }

    function getSyncProxyPrefix() {
        try {
            return (window.CONFIG_PROXY && window.CONFIG_PROXY.PREFIX) || 'https://proxykanan.awokawok.workers.dev/?';
        } catch (_) {
            return 'https://proxykanan.awokawok.workers.dev/?';
        }
    }

    function proxSync(url) {
        if (!url) return url;
        try {
            const prefix = getSyncProxyPrefix();
            if (!prefix) return url;
            if (url.startsWith(prefix)) return url;
            if (/^https?:\/\//i.test(url)) return prefix + url;
        } catch (_) { }
        return url;
    }

    const SYNC_TICKER_CACHE_TTL = 60000;
    const SYNC_TICKER_CACHE = new Map();
    const SYNC_TICKER_PENDING = new Map(); // Track pending requests to prevent duplicate fetches

    const SYNC_TICKER_ENDPOINTS = {
        BINANCE: {
            url: 'https://data-api.binance.vision/api/v3/ticker/price',
            proxy: false,
            parser: (data) => {
                const map = new Map();
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        const symbol = String(item?.symbol || '').toUpperCase();
                        const price = Number(item?.price);
                        if (!symbol || !Number.isFinite(price)) return;
                        map.set(symbol, price);
                    });
                }
                return map;
            }
        },
        MEXC: {
            url: 'https://api.mexc.com/api/v3/ticker/price',
            proxy: true,
            parser: (data) => {
                const map = new Map();
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        const symbol = String(item?.symbol || '').toUpperCase();
                        const price = Number(item?.price);
                        if (!symbol || !Number.isFinite(price)) return;
                        map.set(symbol, price);
                    });
                }
                return map;
            }
        },
        GATE: {
            url: 'https://api.gateio.ws/api/v4/spot/tickers',
            proxy: true,
            parser: (data) => {
                const map = new Map();
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        const pair = String(item?.currency_pair || '').toUpperCase();
                        const price = Number(item?.last || item?.last_price || item?.close);
                        if (!pair || !Number.isFinite(price)) return;
                        map.set(pair.replace('/', '_'), price);
                        map.set(pair.replace('_', ''), price);
                        map.set(pair.replace('_', '-'), price);
                    });
                }
                return map;
            }
        },
        KUCOIN: {
            url: 'https://api.kucoin.com/api/v1/market/allTickers',
            proxy: true,
            parser: (data) => {
                const map = new Map();
                const list = data?.data?.ticker;
                if (Array.isArray(list)) {
                    list.forEach(item => {
                        const symbol = String(item?.symbol || '').toUpperCase();
                        const price = Number(item?.last || item?.lastTradedPrice || item?.lastPrice || item?.close);
                        if (!symbol || !Number.isFinite(price)) return;
                        map.set(symbol, price);
                        map.set(symbol.replace('-', ''), price);
                        map.set(symbol.replace('-', '_'), price);
                    });
                }
                return map;
            }
        },
        OKX: {
            url: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
            proxy: true,
            parser: (data) => {
                const map = new Map();
                const list = data?.data;
                if (Array.isArray(list)) {
                    list.forEach(item => {
                        const symbol = String(item?.instId || '').toUpperCase();
                        const price = Number(item?.last || item?.lastPrice || item?.close);
                        if (!symbol || !Number.isFinite(price)) return;
                        map.set(symbol, price);
                        map.set(symbol.replace('-', ''), price);
                        map.set(symbol.replace('-', '_'), price);
                    });
                }
                return map;
            }
        },
        BITGET: {
            url: 'https://api.bitget.com/api/v2/spot/market/tickers',
            proxy: false,
            parser: (data) => {
                const map = new Map();
                const list = data?.data;
                if (Array.isArray(list)) {
                    list.forEach(item => {
                        const symbol = String(item?.symbol || '').toUpperCase();
                        const price = Number(item?.last || item?.close || item?.latestPrice);
                        if (!symbol || !Number.isFinite(price)) return;
                        map.set(symbol, price);
                    });
                }
                return map;
            }
        },
        BYBIT: {
            url: 'https://api.bybit.com/v5/market/tickers?category=spot',
            proxy: true,
            parser: (data) => {
                const map = new Map();
                const list = data?.result?.list;
                if (Array.isArray(list)) {
                    list.forEach(item => {
                        const symbol = String(item?.symbol || '').toUpperCase();
                        const price = Number(item?.lastPrice || item?.last || item?.price);
                        if (!symbol || !Number.isFinite(price)) return;
                        map.set(symbol, price);
                    });
                }
                return map;
            }
        },
        INDODAX: {
            url: 'https://indodax.com/api/ticker_all',
            proxy: true,
            parser: (data) => {
                const map = new Map();
                if (!data || typeof data !== 'object') return map;
                const tickers = data.tickers || data.Tickers || data;
                const rateStored = Number(getFromLocalStorage('PRICE_RATE_USDT') || 0);
                const usdtTicker = tickers['usdt_idr'] || tickers['usdtidr'] || tickers['USDT_IDR'] || tickers['USDTIDR'];
                const usdtRate = Number(usdtTicker?.last || usdtTicker?.buy || usdtTicker?.sell || rateStored);
                Object.keys(tickers || {}).forEach(pair => {
                    const info = tickers[pair];
                    const lastRaw = info?.last ?? info?.close ?? info?.price ?? info?.sell ?? info?.buy;
                    const last = Number(lastRaw);
                    if (!Number.isFinite(last) || last <= 0) return;
                    const upper = String(pair || '').toUpperCase();
                    if (upper) {
                        map.set(upper, last);
                        map.set(upper.replace('_', ''), last);
                        map.set(upper.replace('-', ''), last);
                    }
                    if (upper.endsWith('IDR')) {
                        const base = upper.replace('_IDR', '').replace('IDR', '').replace('-', '').toUpperCase();
                        const rate = Number.isFinite(usdtRate) && usdtRate > 0 ? usdtRate : rateStored;
                        if (rate > 0 && base) {
                            const usdtPrice = last / rate;
                            map.set(`${base}USDT`, usdtPrice);
                            map.set(`${base}_USDT`, usdtPrice);
                            map.set(`${base}-USDT`, usdtPrice);
                        }
                    }
                });
                return map;
            }
        },
        HTX: {
            url: 'https://api.huobi.pro/market/tickers',
            proxy: true,
            parser: (data) => {
                const map = new Map();
                const list = data?.data;
                if (Array.isArray(list)) {
                    list.forEach(item => {
                        // HTX returns symbol in lowercase (e.g., "btcusdt")
                        const symbol = String(item?.symbol || '').toUpperCase();
                        // HTX uses 'close' field for last price
                        const price = Number(item?.close || item?.last || item?.price);
                        if (!symbol || !Number.isFinite(price)) return;
                        map.set(symbol, price);
                        // Also add with underscore separator for compatibility
                        if (symbol.includes('USDT')) {
                            const base = symbol.replace('USDT', '');
                            map.set(`${base}_USDT`, price);
                            map.set(`${base}-USDT`, price);
                        }
                    });
                }
                return map;
            }
        }
    };

    async function fetchTickerMapForCex(cex) {
        const key = String(cex || '').toUpperCase();

        // Check cache first
        const cached = SYNC_TICKER_CACHE.get(key);
        const now = Date.now();
        if (cached && (now - cached.ts) < SYNC_TICKER_CACHE_TTL) {
            return cached.map;
        }

        // ========== REQUEST DEDUPLICATION ==========
        // If there's already a pending request for this CEX, wait for it instead of making a new request
        if (SYNC_TICKER_PENDING.has(key)) {
            console.log(`[fetchTickerMapForCex] Waiting for pending ${key} request...`);
            return await SYNC_TICKER_PENDING.get(key);
        }

        // Create new request promise
        const endpoint = SYNC_TICKER_ENDPOINTS[key];
        if (!endpoint) throw new Error(`Ticker endpoint untuk ${key} tidak tersedia`);

        const fetchPromise = (async () => {
            try {
                console.log(`[fetchTickerMapForCex] Fetching ${key} ticker data...`);
                const targetUrl = endpoint.proxy ? proxSync(endpoint.url) : endpoint.url;
                const resp = await $.getJSON(targetUrl);
                const map = endpoint.parser(resp) || new Map();
                SYNC_TICKER_CACHE.set(key, { map, ts: Date.now() });
                console.log(`[fetchTickerMapForCex] ${key} ticker data cached (${map.size} pairs)`);
                return map;
            } finally {
                // Remove from pending when done (success or error)
                SYNC_TICKER_PENDING.delete(key);
            }
        })();

        // Store the promise so other concurrent calls can reuse it
        SYNC_TICKER_PENDING.set(key, fetchPromise);
        return await fetchPromise;
        // ===========================================
    }

    function resolveTickerPriceFromMap(cex, map, base, quote) {
        if (!map) return NaN;
        const b = String(base || '').toUpperCase();
        const q = String(quote || '').toUpperCase();
        const candidates = [
            `${b}${q}`,
            `${b}_${q}`,
            `${b}-${q}`,
            `${b}/${q}`,
            `${b}:${q}`
        ];
        for (const key of candidates) {
            if (map.has(key)) return Number(map.get(key));
        }
        return NaN;
    }

    function queueSyncPriceFetch(job) {
        window.__SYNC_PRICE_QUEUE = window.__SYNC_PRICE_QUEUE || [];
        window.__SYNC_PRICE_QUEUE.push(job);
        processSyncPriceQueue();
    }
    try { window.queueSyncPriceFetch = queueSyncPriceFetch; } catch (_) { }

    // ========== OPTIMASI: PARALLEL PRICE FETCHING ==========
    // Gunakan concurrency control untuk fetch multiple prices secara parallel
    // Mengurangi waktu dari sequential (1000 × 500ms = 500 detik) menjadi parallel (1000/15 × 500ms = 33 detik)
    const SYNC_PRICE_CONCURRENCY = 15; // Fetch 15 prices secara bersamaan
    window.__SYNC_PRICE_WORKERS = window.__SYNC_PRICE_WORKERS || 0; // Track active workers

    async function processSyncPriceQueue() {
        // Jika sudah ada cukup banyak workers aktif, jangan tambah lagi
        if (window.__SYNC_PRICE_WORKERS >= SYNC_PRICE_CONCURRENCY) return;

        const queue = window.__SYNC_PRICE_QUEUE || [];
        const next = queue.shift();
        if (!next) return;

        // Increment worker count
        window.__SYNC_PRICE_WORKERS = (window.__SYNC_PRICE_WORKERS || 0) + 1;

        const cache = getSyncPriceCache();
        const cacheKey = `${next.cex}__${next.symbol}__${next.pair}`;
        const cached = cache.get(cacheKey);
        const now = Date.now();

        // Check cache first
        if (cached && (now - cached.ts) < SYNC_PRICE_CACHE_TTL) {
            setSyncPriceCell(next.cex, next.symbol, next.pair, cached.price, next.renderId);
            window.__SYNC_PRICE_WORKERS--;
            processSyncPriceQueue(); // Process next job
            return;
        }

        // Fetch price (async, tidak blocking)
        (async () => {
            try {
                const map = await fetchTickerMapForCex(next.cex);
                let price = resolveTickerPriceFromMap(next.cex, map, next.symbol, next.pair);
                if (!Number.isFinite(price) || price <= 0) price = NaN;
                if (Number.isFinite(price) && price > 0) {
                    cache.set(cacheKey, { price, ts: now });
                }
                setSyncPriceCell(next.cex, next.symbol, next.pair, price, next.renderId);
            } catch (err) {
                setSyncPriceCell(next.cex, next.symbol, next.pair, NaN, next.renderId);
            } finally {
                // Decrement worker count dan lanjutkan ke job berikutnya
                window.__SYNC_PRICE_WORKERS--;
                if (queue.length > 0) {
                    processSyncPriceQueue(); // Process next job
                }
            }
        })();

        // Jika masih ada slot worker tersedia dan masih ada job, start worker lain
        if (window.__SYNC_PRICE_WORKERS < SYNC_PRICE_CONCURRENCY && queue.length > 0) {
            processSyncPriceQueue();
        }
    }

    function normalizeSnapshotRecord(rec, chainKey) {
        if (!rec) return null;
        const cex = String(rec.cex || rec.exchange || '').toUpperCase().trim();
        const symbol = String(rec.symbol_in || rec.symbol || rec.ticker || rec.koin || rec.token || '').toUpperCase().trim();
        const sc = String(rec.sc_in || rec.sc || rec.contract || rec.address || '').trim();

        // Require at least CEX and symbol (SC bisa kosong)
        if (!cex || !symbol) {
            // console.warn('normalizeSnapshotRecord - Missing required fields:', { cex, symbol });
            return null;
        }

        return {
            __source: 'snapshot',
            chain: String(chainKey || '').toLowerCase(),
            cex,
            symbol_in: symbol,
            sc_in: sc,
            des_in: parseNumberSafe(rec.des || rec.decimals || rec.des_in || rec.decimals_in || 0, 0),
            token_name: rec.token_name || rec.name || rec.token || symbol,
            symbol_out: rec.symbol_out || '',
            sc_out: rec.sc_out || '',
            des_out: rec.des_out || 0,
            deposit: rec.deposit,
            withdraw: rec.withdraw,
            feeWD: rec.feeWD,
            current_price: parseNumberSafe(rec.current_price ?? rec.price ?? 0, 0),
            price_timestamp: rec.price_timestamp || rec.price_ts || null
        };
    }

    // saveToSnapshot() removed - now using window.SnapshotModule.saveToSnapshot() from snapshot-new.js

    async function loadSnapshotRecords(chainKey) {
        try {
            const snapshotMap = await (window.snapshotDbGet ? window.snapshotDbGet(SNAPSHOT_DB_CONFIG.snapshotKey) : Promise.resolve(null));
            console.log('[SYNC DEBUG] loadSnapshotRecords - snapshotMap keys:', snapshotMap ? Object.keys(snapshotMap) : 'null');

            if (!snapshotMap || typeof snapshotMap !== 'object') {
                console.warn('[SYNC DEBUG] loadSnapshotRecords - No snapshot map found');
                return [];
            }

            const keyLower = String(chainKey || '').toLowerCase();
            const fallbackKey = String(chainKey || '').toUpperCase();

            console.log('[SYNC DEBUG] loadSnapshotRecords - Looking for keys:', { keyLower, fallbackKey, availableKeys: Object.keys(snapshotMap) });

            const arr = Array.isArray(snapshotMap[keyLower]) ? snapshotMap[keyLower]
                : Array.isArray(snapshotMap[fallbackKey]) ? snapshotMap[fallbackKey]
                    : [];

            console.log('[SYNC DEBUG] loadSnapshotRecords - Found array length:', arr.length);

            if (!Array.isArray(arr) || !arr.length) {
                console.warn('[SYNC DEBUG] loadSnapshotRecords - Empty array for chain:', chainKey);
                return [];
            }

            const seen = new Set();
            const out = [];
            let skippedNorm = 0;
            let skippedDedup = 0;
            arr.forEach((rec, i) => {
                const norm = normalizeSnapshotRecord(rec, keyLower);
                if (!norm) {
                    skippedNorm++;
                    if (i < 3) console.log('[SYNC DEBUG] Skipped record (null norm):', rec);
                    return;
                }
                const dedupKey = `${norm.cex}__${norm.symbol_in}__${String(norm.sc_in || '').toLowerCase()}`;
                if (seen.has(dedupKey)) {
                    skippedDedup++;
                    return;
                }
                seen.add(dedupKey);
                norm._idx = out.length;
                out.push(norm);
            });
            console.log('[SYNC DEBUG] Normalization stats:', { total: arr.length, valid: out.length, skippedNorm, skippedDedup });

            // console.log('loadSnapshotRecords - Returning:', out.length, 'tokens');
            return out;
        } catch (error) {
            // console.error('loadSnapshotRecords failed:', error);
            return [];
        }
    }

    async function fetchTokensFromServer(chainKey) {
        const keyLower = String(chainKey || '').toLowerCase();
        const cfg = (window.CONFIG_CHAINS || {})[keyLower];
        if (!cfg || !cfg.DATAJSON) throw new Error(`No datajson URL for ${String(chainKey || '').toUpperCase()}`);
        const remoteTokens = await $.getJSON(cfg.DATAJSON);
        let raw = [];
        if (Array.isArray(remoteTokens)) raw = remoteTokens;
        else if (remoteTokens && Array.isArray(remoteTokens.token)) raw = remoteTokens.token;
        else raw = [];
        const normalizeServerTokenRecord = (item, idx) => {
            const clone = Object.assign({}, item || {});
            const pairDefs = (cfg && cfg.PAIRDEXS) || {};
            const pickFallbackPair = () => {
                const preferred = ['USDT', 'USDC', 'BUSD', 'DAI'];
                for (const code of preferred) {
                    if (pairDefs && pairDefs[code]) return code;
                }
                const keys = Object.keys(pairDefs || {});
                if (keys.length) return String(keys[0]).toUpperCase();
                return 'NON';
            };

            clone.cex = String(clone.cex || clone.exchange || '').toUpperCase();
            const symbolRaw = clone.symbol_in || clone.symbol || clone.ticker || clone.token || clone.nama_token || clone.name || '';
            const pairRaw = clone.symbol_out || clone.pair || clone.quote || '';
            const scRaw = clone.sc_in || clone.sc || clone.contract || clone.address || '';
            const decimalsRaw = clone.des_in ?? clone.decimals ?? clone.decimal ?? 0;

            clone.symbol_in = String(symbolRaw || '').toUpperCase();
            clone.symbol_out = String(pairRaw || '').toUpperCase() || pickFallbackPair();
            clone.sc_in = String(scRaw || '').trim();
            clone.des_in = Number(decimalsRaw) || 0;
            clone.token_name = clone.token_name || clone.nama_token || clone.name || clone.symbol_in;
            clone._idx = idx;
            clone.__source = 'server';
            return clone;
        };

        return raw.map((item, idx) => normalizeServerTokenRecord(item, idx));
    }

    // DEPRECATED: Removed direct server loading from sync modal
    // Now using snapshot-only approach with SYNC EXCHANGER button
    // async function loadSyncTokensFromServer(chainKey) {
    //     const key = String(chainKey || '').toLowerCase();
    //     const chainConfig = (window.CONFIG_CHAINS || {})[key];
    //     if (!chainConfig || !chainConfig.DATAJSON) throw new Error(`No datajson URL for ${String(chainKey || '').toUpperCase()}`);
    //     try { if (typeof toast !== 'undefined' && toast.info) toast.info('Mengambil data koin dari server...'); } catch(_) {}
    //     const raw = await fetchTokensFromServer(key);
    //     const savedTokens = getTokensChain(chainKey);
    //     setSyncModalData(chainKey, raw, savedTokens, 'Server');
    //     try { if (typeof toast !== 'undefined' && toast.success) toast.success(`Berhasil memuat ${raw.length} koin dari server`); } catch(_) {}
    // }

    async function loadSyncTokensFromSnapshot(chainKey, silent = false) {
        const key = String(chainKey || '').toLowerCase();
        console.log('[SYNC DEBUG] loadSyncTokensFromSnapshot called for:', key);
        const raw = await loadSnapshotRecords(key);
        console.log('[SYNC DEBUG] loadSyncTokensFromSnapshot - raw.length:', raw.length);
        if (!raw.length) {
            console.warn('[SYNC DEBUG] loadSyncTokensFromSnapshot - Empty raw, returning false');
            if (!silent) throw new Error('Snapshot kosong untuk chain ini.');
            return false; // Return false instead of throwing when silent
        }
        const savedTokens = getTokensChain(chainKey);
        console.log('[SYNC DEBUG] loadSyncTokensFromSnapshot - calling setSyncModalData');
        setSyncModalData(chainKey, raw, savedTokens, 'Snapshot');
        console.log('[SYNC DEBUG] loadSyncTokensFromSnapshot - returning true');
        if (!silent) {
            try { if (typeof toast !== 'undefined' && toast.success) toast.success(`Berhasil memuat ${raw.length} koin dari snapshot lokal`); } catch (_) { }
        }
        return true;
    }

    // Single Chain Mode Handler removed (unified table)

    // Let #home-link perform a full navigation (fresh reload)

    // Token Sync Modal Logic dengan Auto-Fetch JSON
    $(document).on('click', '#sync-tokens-btn', async function () {
        if (!activeSingleChainKey) {
            if (typeof toast !== 'undefined' && toast.error) toast.error("No active chain selected.");
            return;
        }

        const chainConfig = CONFIG_CHAINS[activeSingleChainKey];
        if (!chainConfig || !chainConfig.DATAJSON) {
            if (typeof toast !== 'undefined' && toast.error) toast.error(`No datajson URL for ${String(activeSingleChainKey).toUpperCase()}`);
            return;
        }

        // Reset modal state
        $('#sync-modal-chain-name').text(chainConfig.Nama_Chain || String(activeSingleChainKey).toUpperCase());
        $('#sync-snapshot-chain-label').text(chainConfig.Nama_Chain || String(activeSingleChainKey).toUpperCase());
        $('#sync-modal-tbody').empty().html('<tr><td colspan="7">Memuat Data Koin...</td></tr>');

        // Reset status bar to before state
        $('#sync-status-bar').removeClass('sync-status-processing sync-status-success').addClass('sync-status-before');
        $('#sync-snapshot-status').html('⏳ Memeriksa database...');
        setSyncSourceIndicator('-');

        // Show modal
        UIkit.modal('#sync-modal').show();

        // Check if data exists in IndexedDB
        let hasSnapshot = false;
        try {
            hasSnapshot = await loadSyncTokensFromSnapshot(activeSingleChainKey, true);
            // console.log('Check snapshot result:', hasSnapshot);
            if (hasSnapshot) {
                $('#sync-snapshot-status').html('💾 Data dari database lokal');
                // console.log('Snapshot data loaded successfully');
                return; // Data sudah ada, tidak perlu fetch
            }
        } catch (e) {
            // console.log('No snapshot, will fetch from JSON. Error:', e);
        }

        // Data belum ada → Fetch dari DATAJSON
        // console.log('hasSnapshot:', hasSnapshot, '- proceeding to fetch from server');
        $('#sync-snapshot-status').text('Mengambil data dari server...');
        // console.log('Fetching data from server for chain:', activeSingleChainKey);

        try {
            const rawTokens = await fetchTokensFromServer(activeSingleChainKey);
            // console.log('Fetched tokens:', rawTokens.length);

            if (!rawTokens || !rawTokens.length) {
                $('#sync-modal-tbody').html('<tr><td colspan="7">Tidak ada data token dari server</td></tr>');
                $('#sync-snapshot-status').text('Gagal: Data kosong');
                return;
            }

            // Save to IndexedDB
            console.log('[SYNC DEBUG] Saving to snapshot...', { chain: activeSingleChainKey, tokenCount: rawTokens.length });
            const saveResult = await window.SnapshotModule.saveToSnapshot(activeSingleChainKey, rawTokens);
            console.log('[SYNC DEBUG] Save result:', saveResult);

            // Load to modal
            const loaded = await loadSyncTokensFromSnapshot(activeSingleChainKey, true);
            console.log('[SYNC DEBUG] Load result:', loaded);

            if (loaded) {
                $('#sync-snapshot-status').text(`Data dimuat: ${rawTokens.length} koin`);
                if (typeof toast !== 'undefined' && toast.success) {
                    toast.success(`Berhasil memuat ${rawTokens.length} koin dari server`);
                }
            } else {
                console.error('[SYNC DEBUG] Failed to load after save - saveResult was:', saveResult);
                $('#sync-modal-tbody').html('<tr><td colspan="7">Gagal memuat data setelah save</td></tr>');
            }
        } catch (error) {
            // console.error('Fetch JSON failed:', error);
            $('#sync-modal-tbody').html(`<tr><td colspan="7">Gagal mengambil data dari server: ${error.message}</td></tr>`);
            $('#sync-snapshot-status').text('Gagal fetch');
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error(`Gagal: ${error.message || 'Unknown error'}`);
            }
        }
    });

    // Handler untuk CEX checkbox change - Re-render table (no snapshot process needed)
    $(document).on('change', '#sync-filter-cex input[type="checkbox"]', function () {
        if (!activeSingleChainKey) return;

        // Just re-render table with new filters
        renderSyncTable(activeSingleChainKey);
        updateSyncSelectedCount();
    });

    // Handler untuk Price Filter radio button change - Fetch harga jika "Berharga"
    $(document).on('change', 'input[name="sync-price-filter"]', async function () {
        if (!activeSingleChainKey) return;

        const filterValue = $(this).val();
        console.log('[Price Filter] Changed to:', filterValue);

        // ✅ OPTIMIZED: Fetch harga dari CEX menggunakan BULK ticker API (1 request, bukan per-koin!)
        if (filterValue === 'with-price') {
            const $modal = $('#sync-modal');
            const selectedCexs = $('#sync-filter-cex input:checked').map(function () {
                return $(this).val().toUpperCase();
            }).get();

            if (selectedCexs.length === 0) {
                if (typeof toast !== 'undefined' && toast.warning) {
                    toast.warning('Pilih minimal 1 CEX untuk melihat koin dengan harga');
                }
                // Reset ke "Semua"
                $('input[name="sync-price-filter"][value="all"]').prop('checked', true);
                return;
            }

            // Show loading indicator
            const overlayId = window.AppOverlay ? window.AppOverlay.show({
                id: 'sync-fetch-prices',
                title: 'Mengambil Harga dari CEX',
                message: 'Mohon tunggu, sedang fetch harga dari exchanger...',
                spinner: true,
                freezeScreen: false
            }) : null;

            try {
                // Get raw data
                const raw = $modal.data('remote-raw') || [];

                if (raw.length === 0) {
                    if (typeof toast !== 'undefined' && toast.warning) {
                        toast.warning('Tidak ada data koin. Klik "SNAPSHOT [UPDATE KOIN]" terlebih dahulu.');
                    }
                    $('input[name="sync-price-filter"][value="all"]').prop('checked', true);
                    if (overlayId && window.AppOverlay) window.AppOverlay.hide(overlayId);
                    return;
                }

                console.log(`[Price Filter] Fetching ALL prices from ${selectedCexs.length} CEX(s):`, selectedCexs);

                // ========== BULK FETCH: Get ALL prices from each CEX in 1 request ==========
                // This is MUCH faster than fetching orderbook per-coin (1 request vs hundreds!)
                let totalUpdated = 0;
                let totalFetched = 0;

                for (const cex of selectedCexs) {
                    try {
                        // Update progress message
                        if (overlayId && window.AppOverlay) {
                            window.AppOverlay.updateMessage(overlayId, `Fetching prices from ${cex}...`);
                        }

                        // Fetch ALL prices from CEX in 1 request using ticker API
                        if (window.App && window.App.Services && window.App.Services.CEX && typeof window.App.Services.CEX.fetchAllCEXPrices === 'function') {
                            const priceMap = await window.App.Services.CEX.fetchAllCEXPrices(cex);
                            const fetchedCount = Object.keys(priceMap).length;
                            totalFetched += fetchedCount;

                            console.log(`[Price Filter] ✅ ${cex}: Fetched ${fetchedCount} prices via ticker API`);

                            // Update current_price untuk token yang match
                            let updatedForThisCex = 0;
                            raw.forEach(token => {
                                const tokenCex = String(token.cex || '').toUpperCase();
                                if (tokenCex !== cex) return; // Skip token dari CEX lain

                                const symbol = String(token.symbol_in || token.symbol || '').toUpperCase();
                                if (!symbol) return;

                                // Check if price exists in priceMap
                                if (priceMap[symbol] !== undefined) {
                                    const price = priceMap[symbol];
                                    if (price > 0) {
                                        token.current_price = price;
                                        updatedForThisCex++;
                                        totalUpdated++;
                                    }
                                }
                            });

                            console.log(`[Price Filter] 📝 ${cex}: Updated ${updatedForThisCex} tokens with prices`);
                        }
                    } catch (error) {
                        console.error(`[Price Filter] ❌ ${cex} failed:`, error.message || error);
                        if (typeof toast !== 'undefined' && toast.warning) {
                            toast.warning(`Gagal fetch harga dari ${cex}: ${error.message}`);
                        }
                    }
                }

                console.log(`[Price Filter] ✅ SUMMARY: Fetched ${totalFetched} total prices, updated ${totalUpdated} tokens`);

                if (totalUpdated === 0) {
                    if (typeof toast !== 'undefined' && toast.warning) {
                        toast.warning('Tidak ada koin dengan harga ditemukan. Coba exchanger lain.');
                    }
                } else {
                    if (typeof toast !== 'undefined' && toast.success) {
                        toast.success(`✅ ${totalUpdated} koin berhasil mendapatkan harga dari ${selectedCexs.join(', ')}`);
                    }
                }

                // Update data di modal
                $modal.data('remote-raw', raw);

            } catch (error) {
                console.error('[Price Filter] Error fetching prices:', error);
                if (typeof toast !== 'undefined' && toast.error) {
                    toast.error('Gagal mengambil harga dari CEX');
                }
            } finally {
                // Hide loading indicator
                if (overlayId && window.AppOverlay) {
                    window.AppOverlay.hide(overlayId);
                }
            }
        }

        // Re-render table with price filter
        renderSyncTable(activeSingleChainKey);
        updateSyncSelectedCount();
    });

    // Handler untuk Wallet CEX Filter checkbox change - Filter WD & DP ON
    $(document).on('change', '#sync-wallet-filter', function () {
        if (!activeSingleChainKey) return;

        const isChecked = $(this).is(':checked');
        console.log('[Wallet Filter] Changed to:', isChecked ? 'Hanya WD & DP ON' : 'Abaikan (semua)');

        // Re-render table dengan filter wallet
        renderSyncTable(activeSingleChainKey);
        updateSyncSelectedCount();
    });

    // ========== REFACTOR: Handler untuk Pair radio button change ==========
    // Pair BUKAN filter tampilan dan TIDAK untuk fetch harga
    // Pair HANYA digunakan saat SAVE untuk menentukan symbol_out
    // Fetch harga selalu menggunakan USDT (kecuali INDODAX pakai IDR)
    $(document).on('change', '#sync-filter-pair input[type="radio"]', function () {
        const selectedPair = $(this).val();
        console.log('[Pair Change] Selected pair:', selectedPair, '(HANYA untuk save, BUKAN fetch harga)');

        // Toggle NON pair inputs visibility dan validasi
        // toggleNonPairInputs() akan memanggil validateNonPairInputs() yang sudah update button state
        if (typeof window.toggleNonPairInputs === 'function') {
            window.toggleNonPairInputs();
        }

        console.log('[Pair Change] No table re-render needed - harga tetap pakai USDT');
    });

    // Handler untuk NON pair inputs - Real-time validation
    $(document).on('input change', '#sync-non-pair-name, #sync-non-pair-sc, #sync-non-pair-des', function () {
        if (typeof window.validateNonPairInputs === 'function') {
            window.validateNonPairInputs();
        }
    });

    // Refresh Snapshot - Fetch CEX data & validate with Web3
    $(document).on('click', '#refresh-snapshot-btn', async function () {
        if (!activeSingleChainKey) {
            if (typeof toast !== 'undefined' && toast.error) toast.error("No active chain selected.");
            return;
        }

        // Get modal reference
        const $modal = $('#sync-modal');

        // Get selected CEX from checkboxes
        const selectedCexs = $('#sync-filter-cex input:checked').map(function () {
            return $(this).val();
        }).get();

        if (selectedCexs.length === 0) {
            if (typeof toast !== 'undefined' && toast.warning) {
                toast.warning("Pilih minimal 1 CEX untuk refresh snapshot");
            }
            return;
        }

        // console.log('Refresh snapshot for CEX:', selectedCexs);

        // Disable button during process
        const $btn = $('#refresh-snapshot-btn');
        const originalHtml = $btn.html();
        $btn.prop('disabled', true).addClass('processing').html('<span uk-spinner="ratio: 0.6"></span> Processing...');

        // Update status bar to processing state
        const $statusBar = $('#sync-status-bar');
        const $status = $('#sync-snapshot-status');
        $statusBar.removeClass('sync-status-before sync-status-success').addClass('sync-status-processing');
        $status.html(`⏳ Memproses ${selectedCexs.join(', ')}...`);

        const $tbody = $('#sync-modal-tbody');
        const incrementalOrder = [];
        const incrementalMap = new Map();
        const renderIncrementalRows = () => {
            $tbody.empty();
            if (!incrementalOrder.length) {
                $tbody.html('<tr><td colspan="7" class="uk-text-center uk-text-meta">Memuat data koin terbaru...</td></tr>');
                return;
            }
            incrementalOrder.forEach((key, idx) => {
                const token = incrementalMap.get(key);
                if (!token) return;
                const cex = String(token.cex || token.cex_source || '').toUpperCase() || '?';
                const symbol = String(token.symbol_in || token.symbol || '').toUpperCase() || '?';
                const tokenName = token.token_name || token.name || token.symbol_in || '-';
                const scRaw = String(token.sc_in || token.contract_in || '').trim();
                const scDisplay = scRaw ? (scRaw.length > 12 ? `${scRaw.slice(0, 6)}...${scRaw.slice(-4)}` : scRaw) : '?';

                // ========== WALLET STATUS: WITHDRAW & DEPOSIT ==========
                const depositStatus = parseSnapshotStatus(token.deposit || token.depositEnable);
                const withdrawStatus = parseSnapshotStatus(token.withdraw || token.withdrawEnable);

                // Format display untuk WITHDRAW status (urutan pertama)
                const wdStatusText = withdrawStatus === true ? 'ON' : (withdrawStatus === false ? 'OFF' : '?');
                const wdStatusColor = withdrawStatus === true ? '#4caf50' : (withdrawStatus === false ? '#f44336' : '#999');

                // Format display untuk DEPOSIT status (urutan kedua)
                const depoStatusText = depositStatus === true ? 'ON' : (depositStatus === false ? 'OFF' : '?');
                const depoStatusColor = depositStatus === true ? '#4caf50' : (depositStatus === false ? '#f44336' : '#999');

                const tooltipTitle = `Withdraw: ${wdStatusText} | Deposit: ${depoStatusText}`;

                const walletStatusDisplay = `
                    <div style="display:flex; gap:4px; justify-content:center; font-size:11px; font-weight:bold;" title="${tooltipTitle}">
                        <span style="color:${wdStatusColor};">${wdStatusText}</span>
                        <span style="color:#ccc;">|</span>
                        <span style="color:${depoStatusColor};">${depoStatusText}</span>
                    </div>`;
                // =====================================================

                // ========== KOLOM DECIMALS DAN TRADE DIHAPUS ==========
                // Tidak ditampilkan di tabel incremental snapshot
                // =====================================================

                // CEX display dengan SNAPSHOT badge
                const cexDisplay = `<div class="uk-text-bold uk-text-primary">${cex}</div><div style="font-size:9px; color:#faa05a; font-weight:600; margin-top:2px;">SNAPSHOT</div>`;

                const priceVal = Number(token.current_price ?? token.price ?? token.price_value);
                const priceCurrency = token.price_currency || (cex === 'INDODAX' ? 'IDR' : 'USDT');
                const priceDisplay = (Number.isFinite(priceVal) && priceVal > 0) ? formatSyncPriceValue(priceVal, priceCurrency) : '?';
                const rowHtml = `
                    <tr data-temp="1">
                        <td class="uk-text-center"><input type="checkbox" class="uk-checkbox" disabled></td>
                        <td class="uk-text-center">${idx + 1}</td>
                        <td class="uk-text-small" style="line-height:1.4;">${cexDisplay}</td>
                        <td>
                            <div class="uk-text-bold uk-text-small">${symbol}</div>
                            <div class="uk-text-meta">${tokenName}</div>
                        </td>
                        <td class="uk-text-small mono" title="${scRaw || '?'}">${scDisplay}</td>
                        <td class="uk-text-center">${walletStatusDisplay}</td>
                        <td class="uk-text-right uk-text-small">${priceDisplay}</td>
                    </tr>`;
                $tbody.append(rowHtml);
            });
        };
        renderIncrementalRows();

        try {
            // Note: Don't call showSyncOverlay here - processSnapshotForCex handles its own overlay
            const snapshotModule = await ensureSnapshotModuleLoaded();
            await snapshotModule.processSnapshotForCex(
                activeSingleChainKey,
                selectedCexs,
                (tokenOrArray) => {
                    try {
                        // OPTIMIZED: Handle both array (batch mode) and individual token (backward compat)
                        const tokens = Array.isArray(tokenOrArray) ? tokenOrArray : [tokenOrArray];

                        tokens.forEach(token => {
                            if (!token) return;
                            const cex = String(token.cex || token.cex_source || '').toUpperCase();
                            const symbol = String(token.symbol_in || token.symbol || '').toUpperCase();
                            const scKey = String(token.sc_in || token.contract_in || '').toLowerCase() || 'NOSC';
                            const rowKey = `${cex || 'UNKNOWN'}__${symbol || 'UNKNOWN'}__${scKey}`;
                            if (!incrementalMap.has(rowKey)) {
                                incrementalOrder.push(rowKey);
                            }
                            incrementalMap.set(rowKey, { ...token });
                        });

                        // Render SEKALI setelah semua tokens di-process (batch rendering)
                        renderIncrementalRows();
                    } catch (rowErr) {
                        // console.error('Failed to render incremental token row:', rowErr);
                    }
                }
            );

            // Reload snapshot data from IndexedDB and update UI
            try {
                const snapshotMap = await (window.snapshotDbGet ? window.snapshotDbGet(SNAPSHOT_DB_CONFIG.snapshotKey) : Promise.resolve(null));
                const chainData = (snapshotMap && typeof snapshotMap === 'object') ? snapshotMap[activeSingleChainKey] : null;

                if (Array.isArray(chainData) && chainData.length > 0) {
                    // Save current state before rebuild
                    const currentMode = $('input[name="sync-pick-mode"]:checked').val();
                    const selectedCexsBefore = $('#sync-filter-cex input:checked').map(function () {
                        return $(this).val();
                    }).get();

                    // Update modal data with fresh snapshot
                    $modal.data('remote-raw', chainData);
                    $modal.data('source', 'snapshot');
                    setSyncSourceIndicator('Snapshot (Terbaru)');

                    // Update status bar to success state with actual count
                    const updatedCount = incrementalMap.size;
                    const $statusBarSuccess = $('#sync-status-bar');
                    $statusBarSuccess.removeClass('sync-status-before sync-status-processing').addClass('sync-status-success');
                    $('#sync-snapshot-status').html(`✅ ${updatedCount} koin diupdate dari ${selectedCexs.join(', ')}`);

                    // Rebuild filters to update CEX badges
                    if (typeof window.buildSyncFilters === 'function') {
                        window.buildSyncFilters(activeSingleChainKey);
                    }

                    // Restore CEX selections after rebuild
                    selectedCexsBefore.forEach(cex => {
                        $(`#sync-filter-cex input[value="${cex}"]`).prop('checked', true);
                    });

                    // Re-render table with updated data
                    if (typeof window.renderSyncTable === 'function') {
                        window.renderSyncTable(activeSingleChainKey);
                    }

                    // Re-apply selection mode if it was set before
                    if (currentMode) {
                        const $modeRadio = $(`input[name="sync-pick-mode"][value="${currentMode}"]`);
                        if ($modeRadio.length) {
                            $modeRadio.prop('checked', true).trigger('change');
                        }
                    }

                    // console.log(`Snapshot reloaded: ${chainData.length} tokens from IndexedDB`);
                    // console.log(`CEX selections restored: ${selectedCexsBefore.join(', ')}`);
                }
            } catch (reloadErr) {
                // console.error('Failed to reload snapshot data after update:', reloadErr);
            }

            if (typeof toast !== 'undefined' && toast.success) {
                toast.success('Snapshot berhasil di-refresh!');
            }

            // Log ke history: Update Koin berhasil
            if (typeof addHistoryEntry === 'function') {
                const totalTokens = incrementalMap.size;
                addHistoryEntry(
                    'UPDATE KOIN',
                    'success',
                    {
                        chain: activeSingleChainKey.toUpperCase(),
                        cex: selectedCexs.join(', '),
                        totalTokens: totalTokens
                    }
                );
            }
        } catch (error) {
            // console.error('Refresh snapshot failed:', error);
            SnapshotOverlay.showError(error.message || 'Unknown error');
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error(`Gagal refresh: ${error.message || 'Unknown error'}`);
            }

            // Log ke history: Update Koin error
            if (typeof addHistoryEntry === 'function') {
                addHistoryEntry(
                    'UPDATE KOIN',
                    'error',
                    {
                        chain: activeSingleChainKey.toUpperCase(),
                        cex: selectedCexs.join(', '),
                        error: error.message || 'Unknown error'
                    }
                );
            }
        } finally {
            // Force reset button with delay to ensure DOM update completes
            // This fixes the "stuck on PROCESSING..." issue
            const resetButton = () => {
                const $refreshBtn = $('#refresh-snapshot-btn');
                const resetHtml = '<span uk-icon="icon: play; ratio: 0.85"></span> SNAPSHOT [UPDATE KOIN]';

                // Remove processing class and reset HTML
                $refreshBtn.removeClass('processing').prop('disabled', false);
                $refreshBtn.html(resetHtml);

                // Force repaint/reflow to ensure DOM updates
                $refreshBtn[0]?.offsetHeight;

                console.log('[Snapshot Button] Reset completed at', new Date().toLocaleTimeString());
            };

            // Reset immediately
            resetButton();

            // Also reset after a short delay as backup
            setTimeout(resetButton, 100);
            setTimeout(resetButton, 500);

            // Ensure modal stays visible after overlay closes
            setTimeout(() => {
                const $syncModal = $('#sync-modal');
                if ($syncModal.length && !UIkit.modal($syncModal).isToggled()) {
                    UIkit.modal($syncModal).show();
                }
            }, 200);
        }
    });

    // Save synced tokens
    $(document).on('click', '#sync-save-btn', async function () {
        if (!activeSingleChainKey) return (typeof toast !== 'undefined' && toast.error) ? toast.error("No active chain selected.") : undefined;

        const $modal = $('#sync-modal');
        const remoteTokens = $modal.data('remote-raw') || [];
        const savedTokens = $modal.data('saved-tokens') || [];

        // Build selected tokens with DEX configs
        const chainKey = activeSingleChainKey.toLowerCase();
        const chainCfg = CONFIG_CHAINS[chainKey] || {};
        const pairDefs = chainCfg.PAIRDEXS || {};
        const dexList = (chainCfg.DEXS || []).map(d => String(d));

        // Baca modal per DEX - HANYA yang checkboxnya dicentang
        const selectedDexsGlobal = [];
        const dataDexsGlobal = {};
        $('#sync-dex-config .sync-dex-checkbox:checked').each(function () {
            const dx = String($(this).data('dex'));
            const leftVal = parseFloat($(`#sync-dex-config .sync-dex-left[data-dex="${dx}"]`).val());
            const rightVal = parseFloat($(`#sync-dex-config .sync-dex-right[data-dex="${dx}"]`).val());
            const dxLower = dx.toLowerCase();
            selectedDexsGlobal.push(dxLower);
            dataDexsGlobal[dxLower] = {
                left: Number.isFinite(leftVal) ? leftVal : 0,
                right: Number.isFinite(rightVal) ? rightVal : 0
            };
        });
        if (selectedDexsGlobal.length < 1) {
            if (typeof toast !== 'undefined' && toast.warning) toast.warning('Pilih minimal 1 DEX untuk digunakan.');
            return;
        }

        // debug logs removed

        // ========== REFACTOR: Ambil pair yang dipilih dari RADIO BUTTON ==========
        const selectedPairFromRadio = $('#sync-filter-pair input[type="radio"]:checked').val();
        const pairForSave = selectedPairFromRadio ? String(selectedPairFromRadio).toUpperCase() : 'USDT';
        // console.log('[Save] Using pair from radio button:', pairForSave);

        const nonPairConfig = readNonPairConfig();
        const hasNonPairOverride = nonPairConfig && nonPairConfig.symbol;
        const usingCustomNon = (pairForSave === 'NON') && hasNonPairOverride;

        const selectedTokens = [];
        $('#sync-modal-tbody tr').each(function () {
            const $row = $(this);
            const $cb = $row.find('.sync-token-checkbox');
            if (!$cb.is(':checked')) return;
            const idx = Number($cb.data('index'));
            const tok = remoteTokens[idx];
            if (!tok) return;

            const cexUpper = String(tok.cex || '').toUpperCase().trim();
            const symbolIn = String(tok.symbol_in || '').toUpperCase().trim();
            const isSnapshot = String(tok.__source || '').toLowerCase() === 'snapshot';

            // ========== PAIR dari RADIO BUTTON, bukan dari checkbox ==========
            let symbolOut = pairForSave;
            if (usingCustomNon) {
                symbolOut = String(nonPairConfig.symbol).toUpperCase();
            }
            let scIn = tok.sc_in || tok.contract_in || '';
            const scOutRaw = tok.sc_out || tok.contract_out || '';
            const desInVal = Number(tok.des_in ?? tok.decimals_in ?? tok.des ?? tok.dec_in ?? 0);
            const desOutRaw = Number(tok.des_out ?? tok.decimals_out ?? tok.desPair ?? tok.dec_out ?? 0);

            // Map pair to config; if unknown → NON
            // NON concept: any pair NOT explicitly listed in PAIRDEXS.
            // PENTING: Jika user memilih pair dari radio button (USDT, SOL, dll),
            // SELALU gunakan SC dari config, BUKAN dari data token!
            const customPairDef = usingCustomNon ? {
                scAddressPair: nonPairConfig.sc || '',
                desPair: Number.isFinite(nonPairConfig.des) ? nonPairConfig.des : 18,
                symbolPair: symbolOut
            } : null;
            const pairDef = pairDefs[symbolOut] || customPairDef || pairDefs['NON'] || { scAddressPair: '0x', desPair: 18, symbolPair: 'NON' };
            const isAddrInvalid = (addr) => !addr || String(addr).toLowerCase() === '0x' || String(addr).length < 6;

            let scOut = '';
            let desOut = 0;

            if (pairDefs[symbolOut]) {
                // ========== KNOWN PAIR: SELALU gunakan SC dari config ==========
                // Jangan gunakan sc_out dari token karena itu mungkin SC pair yang berbeda
                scOut = pairDef.scAddressPair;
                desOut = Number(pairDef.desPair) || 18;
            } else if (usingCustomNon) {
                // Custom NON pair: gunakan input dari user
                scOut = nonPairConfig.sc || pairDef.scAddressPair || '';
                desOut = Number.isFinite(nonPairConfig.des) ? nonPairConfig.des : Number(pairDef.desPair || 18);
            } else {
                // NON: keep source SC if present; only fallback when invalid
                scOut = tok.sc_out || tok.contract_out || '';
                desOut = Number.isFinite(desOutRaw) && desOutRaw > 0 ? desOutRaw : 18;
                if (isAddrInvalid(scOut)) {
                    scOut = pairDef.scAddressPair || '';
                    desOut = Number(pairDef.desPair || 18);
                }
            }

            // Use global DEX config
            const selectedDexs = selectedDexsGlobal.slice();
            const dataDexs = { ...dataDexsGlobal };

            // Merge prior CEX info if exists
            const existing = savedTokens.find(s => String(s.cex).toUpperCase() === cexUpper && s.symbol_in === symbolIn && s.symbol_out === symbolOut);
            const dataCexs = {};
            const baseCexInfo = existing?.dataCexs?.[cexUpper] ? { ...existing.dataCexs[cexUpper] } : {
                feeWDToken: 0, feeWDPair: 0,
                depositToken: false, withdrawToken: false,
                depositPair: false, withdrawPair: false
            };
            if (isSnapshot) {
                const feeSnapshot = parseFloat(tok.feeWDToken ?? tok.feeWD);
                if (Number.isFinite(feeSnapshot) && feeSnapshot >= 0) {
                    baseCexInfo.feeWDToken = feeSnapshot;
                }
                const depositSnap = parseSnapshotStatus(tok.depositToken ?? tok.deposit);
                if (depositSnap !== null) {
                    baseCexInfo.depositToken = depositSnap;
                    baseCexInfo.depositPair = depositSnap;
                }
                const withdrawSnap = parseSnapshotStatus(tok.withdrawToken ?? tok.withdraw);
                if (withdrawSnap !== null) {
                    baseCexInfo.withdrawToken = withdrawSnap;
                    baseCexInfo.withdrawPair = withdrawSnap;
                }
            }
            dataCexs[cexUpper] = baseCexInfo;

            if (!scIn || isAddrInvalid(scIn)) scIn = tok.sc_in || tok.contract_in || '';
            scIn = String(scIn || '').trim();
            if (!scIn || scIn.length < 6) return;
            if (isAddrInvalid(scOut)) scOut = pairDef.scAddressPair || scOut;
            scOut = String(scOut || '').trim();

            const desIn = Number.isFinite(desInVal) && desInVal >= 0 ? desInVal : 0;
            desOut = Number.isFinite(desOut) && desOut >= 0 ? desOut : desIn;

            const tokenObj = {
                id: `${chainKey}_${cexUpper}_${symbolIn}_${symbolOut}`,
                chain: chainKey,
                symbol_in: symbolIn,
                sc_in: scIn,
                des_in: desIn,
                symbol_out: symbolOut,
                sc_out: scOut,
                des_out: desOut,
                status: true,
                selectedCexs: [cexUpper],
                selectedDexs,
                dataDexs,
                dataCexs,
                cex: cexUpper
            };
            selectedTokens.push(tokenObj);
            // debug logs removed
        });

        // Validate at least 1 token selected
        if (selectedTokens.length === 0) {
            if (typeof toast !== 'undefined' && toast.info) toast.info('Pilih minimal 1 koin untuk disimpan.');
            return;
        }

        // Save to current per-chain store
        // Merge strategy: replace existing entries (same chain+cex+symbol_in+symbol_out), keep others
        const existingList = Array.isArray(getTokensChain(activeSingleChainKey)) ? getTokensChain(activeSingleChainKey) : [];
        const sameEntry = (a, b) =>
            String(a.chain).toLowerCase() === String(b.chain).toLowerCase() &&
            String(a.cex || (a.selectedCexs || [])[0] || '').toUpperCase() === String(b.cex || (b.selectedCexs || [])[0] || '').toUpperCase() &&
            String(a.symbol_in).toUpperCase() === String(b.symbol_in).toUpperCase() &&
            String(a.symbol_out).toUpperCase() === String(b.symbol_out).toUpperCase();

        const merged = [...existingList];
        let replaced = 0; let added = 0;
        selectedTokens.forEach(newTok => {
            const idx = merged.findIndex(oldTok => sameEntry(oldTok, newTok));
            if (idx !== -1) { merged[idx] = newTok; replaced += 1; } else { merged.push(newTok); added += 1; }
        });

        // Disable save button while saving
        const $btn = $('#sync-save-btn');
        const prevLabel = $btn.text();
        try { $btn.prop('disabled', true).text('Saving...'); } catch (_) { }
        // debug logs removed
        let ok = true;
        if (typeof setTokensChainAsync === 'function') {
            ok = await setTokensChainAsync(activeSingleChainKey, merged);
        } else {
            try { setTokensChain(activeSingleChainKey, merged); ok = true; } catch (_) { ok = false; }
        }

        if (ok) {
            try { setLastAction('SINKRONISASI KOIN'); } catch (_) { }
            if (typeof toast !== 'undefined' && toast.success) toast.success(`Disimpan: ${selectedTokens.length} koin (${added} baru, ${replaced} diperbarui) untuk ${activeSingleChainKey}.`);
            UIkit.modal('#sync-modal').hide();
            // Full reload to ensure a clean state and updated filters
            location.reload();
        } else {
            const reason = (window.LAST_STORAGE_ERROR ? `: ${window.LAST_STORAGE_ERROR}` : '');
            if (typeof toast !== 'undefined' && toast.error) toast.error(`Gagal menyimpan ke penyimpanan lokal${reason}`);
            try { $btn.prop('disabled', false).text(prevLabel); } catch (_) { }
        }
        // debug logs removed
    });

    // Event handler untuk checkbox di tabel koin - Update button save state
    // Flag untuk mencegah trigger berulang saat bulk selection (Select All/Clear/dll)
    let isBulkSelecting = false;
    window.setSyncBulkSelecting = function (value) { isBulkSelecting = !!value; };

    $(document).on('change', '#sync-modal-tbody .sync-token-checkbox', function () {
        // Skip individual update jika sedang bulk selection
        if (isBulkSelecting) return;

        updateSyncSelectedCount();
        updateAddTokenButtonState();
    });

    // ========== REMOVED DUPLICATE EVENT HANDLER ==========
    // Event handler untuk CEX checkbox sudah ada di line ~2920
    // Duplikat ini menyebabkan renderSyncTable() dipanggil 2× dan overlay tidak hilang
    // $(document).on('change', '#sync-filter-cex input[type="checkbox"]', function(){
    //     renderSyncTable(activeSingleChainKey);
    // });
    // ====================================================

    // Event handler untuk checkbox DEX - Toggle visual state dan disable/enable inputs
    $(document).on('change', '#sync-dex-config .sync-dex-checkbox', function () {
        const dex = $(this).data('dex');
        const isChecked = $(this).is(':checked');
        const $row = $(this).closest('.sync-dex-row');

        // Toggle input fields (modal kiri/kanan)
        $row.find('.sync-dex-left, .sync-dex-right').prop('disabled', !isChecked);

        // Visual feedback: opacity dan pointer events
        if (isChecked) {
            $row.css({ opacity: '1', filter: 'none' });
        } else {
            $row.css({ opacity: '0.4', filter: 'grayscale(100%)' });
        }
    });

    $(document).on('click', '#sync-table thead th[data-sort-key]', function (e) {
        e.preventDefault();
        const key = String($(this).data('sort-key') || '');
        if (!key) return;
        if (key === 'default') {
            setSyncSortState('default');
        } else {
            setSyncSortState(key);
        }
        if (activeSingleChainKey) {
            renderSyncTable(activeSingleChainKey);
        } else {
            updateSyncSortIndicators();
        }
    });

    // ========================================
    // RADIO BUTTON: Auto-Select Modes
    // ========================================
    // Mode: "all" (Semua), "selected" (Dipilih), "snapshot" (Snapshot), "clear" (Hapus)
    // KONSEP BARU: Radio button hanya baca dari DOM tabel yang sudah di-render
    $(document).on('change', 'input[name="sync-pick-mode"]', function () {
        const mode = $(this).val();
        const $allBoxes = $('#sync-modal-tbody .sync-token-checkbox');

        console.log(`[Sync Pick Mode] Mode: ${mode}, Found ${$allBoxes.length} checkboxes.`);

        // Set flag untuk mencegah individual change handler (optimasi)
        if (typeof window.setSyncBulkSelecting === 'function') {
            window.setSyncBulkSelecting(true);
        }

        if (mode === 'all') {
            // 1. SEMUA: Centang semua koin
            console.log('[Sync Pick Mode] Mencentang semua checkbox...');
            $allBoxes.prop('checked', true);

        } else if (mode === 'selected') {
            // 2. DIPILIH: Centang koin yang punya badge [DIPILIH] di kolom CEX
            console.log('[Sync Pick Mode] Mencari koin dengan badge [DIPILIH]...');
            let checkedCount = 0;

            $allBoxes.each(function () {
                const $row = $(this).closest('tr');
                // Cari badge [DIPILIH] di kolom CEX (kolom ke-3, td:eq(2))
                const $cexCell = $row.find('td:eq(2)');
                const cexText = $cexCell.text().trim();
                const hasDipilihBadge = cexText.includes('[DIPILIH]');

                $(this).prop('checked', hasDipilihBadge);
                if (hasDipilihBadge) checkedCount++;
            });

            console.log('[Sync Pick Mode] Koin [DIPILIH] ditemukan:', checkedCount);

        } else if (mode === 'snapshot') {
            // 3. SNAPSHOT: Centang koin yang punya badge [SNAPSHOT] di kolom CEX
            console.log('[Sync Pick Mode] Mencari koin dengan badge [SNAPSHOT]...');
            let snapshotCount = 0;

            $allBoxes.each(function () {
                const $row = $(this).closest('tr');
                // Cari badge [SNAPSHOT] di kolom CEX (kolom ke-3, td:eq(2))
                const $cexCell = $row.find('td:eq(2)');
                const cexText = $cexCell.text().trim();
                const hasSnapshotBadge = cexText.includes('[SNAPSHOT]');

                $(this).prop('checked', hasSnapshotBadge);
                if (hasSnapshotBadge) snapshotCount++;
            });

            console.log('[Sync Pick Mode] Koin [SNAPSHOT] ditemukan:', snapshotCount);

        } else if (mode === 'clear') {
            // 4. HAPUS: Uncheck semua koin
            console.log('[Sync Pick Mode] Menghapus semua centangan...');
            $allBoxes.prop('checked', false);
        }

        // Reset flag dan update UI
        if (typeof window.setSyncBulkSelecting === 'function') {
            window.setSyncBulkSelecting(false);
        }

        // ========== UPDATE COUNTER DAN BUTTON STATE SETELAH RADIO BUTTON DIPILIH ==========
        updateSyncSelectedCount();  // Update jumlah koin yang dipilih
        updateAddTokenButtonState(); // Update status button Save

        // Log jumlah akhir yang tercentang
        const finalCount = $('#sync-modal-tbody .sync-token-checkbox:checked').length;
        console.log(`[Sync Pick Mode] Total checkbox tercentang setelah update: ${finalCount}`);
        // ===================================================================================
    });

    // Removed legacy single-chain start button handler (using unified #startSCAN now)
}

$(document).ready(function () {
    // Database functions removed - snapshot-new.js will use alternative methods

    // --- Critical Initializations (Immediate) ---
    // If previous page triggered a reload/reset, clear local flag only (do not broadcast)
    try {
        if (sessionStorage.getItem('APP_FORCE_RUN_NO') === '1') {
            sessionStorage.removeItem('APP_FORCE_RUN_NO');
        }
    } catch (_) { }
    // Initialize app state from localStorage
    function applyRunUI(isRunning) {
        if (isRunning) {
            try { form_off(); } catch (_) { }
            $('#startSCAN').prop('disabled', true).attr('aria-busy', 'true').text('Running...').addClass('uk-button-disabled');
            // Show standardized running banner: [ RUN SCANNING: <CHAINS> ]
            try { if (typeof window.updateRunningChainsBanner === 'function') window.updateRunningChainsBanner(); } catch (_) { }
            $('#stopSCAN').show().prop('disabled', false);
            $('#reload').prop('disabled', false);
            //$('#infoAPP').html('⚠️ Proses sebelumnya tidak selesai. Tekan tombol <b>RESET PROSES</b> untuk memulai ulang.').show();

            try { if (typeof setScanUIGating === 'function') setScanUIGating(true); } catch (_) { }
        } else {
            $('#startSCAN').prop('disabled', false).removeAttr('aria-busy').text('Start').removeClass('uk-button-disabled');
            $('#stopSCAN').hide();
            // Clear banner when not running
            try { $('#infoAPP').text('').hide(); } catch (_) { }
            try { if (typeof setScanUIGating === 'function') setScanUIGating(false); } catch (_) { }
        }
    }

    // In-memory cache of run states to avoid stale storage reads across tabs
    window.RUN_STATES = window.RUN_STATES || {};
    function updateRunStateCache(filterKey, val) {
        try {
            const key = String(filterKey || '');
            const up = key.toUpperCase();
            if (!up.startsWith('FILTER_')) return;
            const isMulti = (up === 'FILTER_MULTICHAIN');
            const k = isMulti ? 'multichain' : key.replace(/^FILTER_/i, '').toLowerCase();
            const runVal = (val && typeof val === 'object' && Object.prototype.hasOwnProperty.call(val, 'run')) ? val.run : (getFromLocalStorage(key, {}) || {}).run;
            const r = String(runVal || 'NO').toUpperCase() === 'YES';
            window.RUN_STATES[k] = r;
        } catch (_) { }
    }
    try { window.updateRunStateCache = window.updateRunStateCache || updateRunStateCache; } catch (_) { }
    function initRunStateCache() {
        try { updateRunStateCache('FILTER_MULTICHAIN'); } catch (_) { }
        try { Object.keys(CONFIG_CHAINS || {}).forEach(k => updateRunStateCache(`FILTER_${String(k).toUpperCase()}`)); } catch (_) { }
    }
    try {
        if (window.whenStorageReady && typeof window.whenStorageReady.then === 'function') {
            window.whenStorageReady.then(initRunStateCache);
        } else { initRunStateCache(); }
    } catch (_) { initRunStateCache(); }

    const appStateInit = getAppState();
    applyRunUI(appStateInit.run === 'YES');

    // === CHECK GLOBAL SCAN LOCK ON PAGE LOAD (DISABLED FOR MULTI-TAB) ===
    // REMOVED: Global lock check on page load
    // Multi-tab scanning is now supported (managed via localStorage sync)

    // Re-apply once IndexedDB cache is fully warmed to avoid false negatives
    try {
        if (window.whenStorageReady && typeof window.whenStorageReady.then === 'function') {
            window.whenStorageReady.then(() => {
                try {
                    const st = getAppState();
                    applyRunUI(st && st.run === 'YES');
                    // REMOVED: Global lock re-check (multi-tab support enabled)
                } catch (_) { }
            });
        }
    } catch (_) { }

    // ========== PROTEKSI RELOAD LOOP ==========
    // Mencegah reload loop saat 2 tab dengan URL sama saling broadcast message
    let lastReloadTimestamp = 0;
    const RELOAD_COOLDOWN = 3000; // 3 detik cooldown untuk mencegah reload berulang

    // Track page load time untuk ignore early messages (saat page baru reload)
    const pageLoadTime = Date.now();
    const IGNORE_MESSAGES_DURATION = 2000; // Ignore messages 2 detik pertama setelah load

    // Cross-tab run state sync via BroadcastChannel (per FILTER_* key)
    if (window.__MC_BC) {
        window.__MC_BC.addEventListener('message', function (ev) {
            // ========== IGNORE MESSAGES SAAT BARU RELOAD ==========
            // Mencegah tab yang baru reload langsung reload lagi karena message dari tab lain
            if (Date.now() - pageLoadTime < IGNORE_MESSAGES_DURATION) {
                // console.log('[CROSS-TAB] Message ignored - page just loaded');
                return;
            }
            const msg = ev?.data;
            if (!msg) return;
            if (msg.type === 'kv') {
                try {
                    const keyStr = String(msg.key || '');
                    const keyUpper = keyStr.toUpperCase();

                    // === HANDLE GLOBAL_SCAN_LOCK CHANGES (DISABLED FOR MULTI-TAB) ===
                    // REMOVED: Cross-tab lock synchronization
                    // Multi-tab scanning is now supported independently via Tab Manager
                    if (keyUpper === 'GLOBAL_SCAN_LOCK') {
                        // Ignore lock messages - each tab manages its own scanning state
                        return;
                    }

                    if (!keyUpper.startsWith('FILTER_')) return; // only react to FILTER_* changes

                    // Update in-memory cache first
                    try { updateRunStateCache(keyUpper, msg.val || {}); } catch (_) { }

                    // Refresh toolbar indicators and running banner for ANY filter change
                    try { if (typeof window.updateRunningChainsBanner === 'function') window.updateRunningChainsBanner(); } catch (_) { }
                    try { if (typeof window.updateToolbarRunIndicators === 'function') window.updateToolbarRunIndicators(); } catch (_) { }

                    // If this update is for the ACTIVE filter key, also apply run/theme locally
                    const activeKey = (typeof getActiveFilterKey === 'function') ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
                    if (keyUpper === String(activeKey).toUpperCase()) {
                        const hasRun = msg.val && Object.prototype.hasOwnProperty.call(msg.val, 'run');
                        const hasDark = msg.val && Object.prototype.hasOwnProperty.call(msg.val, 'darkMode');
                        if (hasRun) {
                            const r = String(msg.val.run || 'NO').toUpperCase();
                            applyRunUI(r === 'YES');
                            if (r === 'NO') {
                                const running = (typeof window.App?.Scanner?.isScanRunning !== 'undefined') ? !!window.App.Scanner.isScanRunning : false;
                                if (running) {
                                    // ========== FIX RELOAD LOOP ==========
                                    // Hanya reload jika sudah lewat cooldown period
                                    const now = Date.now();
                                    if (now - lastReloadTimestamp > RELOAD_COOLDOWN) {
                                        lastReloadTimestamp = now;
                                        if (window.App?.Scanner?.stopScannerSoft) window.App.Scanner.stopScannerSoft();

                                        // Set flag untuk mencegah broadcast saat reload
                                        try { sessionStorage.setItem('APP_FORCE_RUN_NO', '1'); } catch (_) { }

                                        // console.log('[CROSS-TAB] Reloading due to run:NO from another tab');
                                        location.reload();
                                    } else {
                                        // console.log('[CROSS-TAB] Reload skipped - cooldown active to prevent loop');
                                    }
                                }
                            }
                        }
                        if (hasDark && typeof applyThemeForMode === 'function') {
                            applyThemeForMode();
                        }
                    }
                } catch (_) { }
                return;
            }
            if (msg.type === 'history' || msg.type === 'history_clear' || msg.type === 'history_delete') {
                try { updateInfoFromHistory(); } catch (_) { }
            }
        });
    }

    // Apply themed background + dark mode per state
    if (typeof applyThemeForMode === 'function') applyThemeForMode();
    // applyThemeForMode already executed above to paint early
    setTimeout(deferredInit, 0);

    // Bersihkan konten kolom DEX saat ada perubahan filter (serupa perilaku saat START scan)
    try {
        $(document).on('change input', '#modal-filter-sections input, #modal-filter-sections select', function () {
            try { resetDexCells('dataTableBody'); } catch (_) { }
        });
    } catch (_) { }

    // --- Report Database Status (IndexedDB) --- // REFACTORED
    async function reportDatabaseStatus() {
        const payload = await (window.exportIDB ? window.exportIDB() : Promise.resolve(null));
        if (!payload || !Array.isArray(payload.items)) {
            if (typeof toast !== 'undefined' && toast.warning) toast.warning('Database belum tersedia atau tidak dapat diakses.');
            return;
        }
        if (typeof toast !== 'undefined' && toast.info) toast.info(`TERHUBUNG DATABASE...`);
        else { /* debug logs removed */ }
    }
    if (window.whenStorageReady && typeof window.whenStorageReady.then === 'function') {
        window.whenStorageReady.then(reportDatabaseStatus);
    } else {
        reportDatabaseStatus();
    }

    // Initial header label + sync icon visibility based on URL mode
    try {
        const params = new URLSearchParams(window.location.search);
        const ch = (params.get('chain') || '').toLowerCase();
        const isSingle = (!!ch && ch !== 'all' && (CONFIG_CHAINS || {})[ch]);
        const $hdr = $('#current-chain-label');
        if ($hdr.length) {
            if (isSingle) {
                const cfg = (CONFIG_CHAINS && CONFIG_CHAINS[ch]) ? CONFIG_CHAINS[ch] : null;
                const label = (cfg?.Nama_Pendek || cfg?.Nama_Chain || ch).toString().toUpperCase();
                const color = cfg?.WARNA || '#333';
                $hdr.text(`[${label}]`).css('color', color);
            } else {
                $hdr.text('[ALL]').css('color', '#666');
            }
        }
        const $sync = $('#sync-tokens-btn');
        if ($sync.length) {
            if (isSingle) { $sync.show(); } else { $sync.remove(); }
        }
    } catch (e) { /* noop */ }

    // URL-based mode switching (multichain vs per-chain)
    function getDefaultChain() {
        const settings = getFromLocalStorage('SETTING_SCANNER', {});
        if (Array.isArray(settings.AllChains) && settings.AllChains.length) {
            return String(settings.AllChains[0]).toLowerCase();
        }
        const keys = Object.keys(CONFIG_CHAINS || {});
        return String(keys[0] || 'bsc').toLowerCase();
    }

    function applyModeFromURL() {
        const params = new URLSearchParams(window.location.search);
        const requested = (params.get('chain') || '').toLowerCase();

        const setHomeHref = (chainKey) => {
            const target = chainKey ? chainKey : getDefaultChain();
            $('#home-link').attr('href', `index.html?chain=${encodeURIComponent(target)}`);
            setAppState({ lastChain: target });
        };

        // Always render chain links to reflect active selection
        renderChainLinks(requested || 'all');

        if (!requested || requested === 'all') {
            // Multichain view (unified table)
            showMainSection('scanner');
            activeSingleChainKey = null;
            // Clear AppMode cache to force re-evaluation
            try { delete window.AppMode; } catch (_) { }
            // Filter card handles UI
            const st = getAppState();
            setHomeHref(st.lastChain || getDefaultChain());
            try { applySortToggleState(); } catch (_) { }
            try { syncPnlInputFromStorage(); } catch (_) { }
            // Re-apply controls based on multichain state
            try {
                const state = computeAppReadiness();
                applyControlsFor(state);
            } catch (e) { console.error('applyControlsFor error', e); }
            return;
        }

        if (!CONFIG_CHAINS || !CONFIG_CHAINS[requested]) {
            // Invalid chain → fallback to multichain
            window.location.replace('index.html?chain=all');
            return;
        }

        // Per-chain view (unified table): keep main table visible and render single-chain data into it
        activeSingleChainKey = requested;
        // Clear AppMode cache to force re-evaluation for this specific chain
        try { delete window.AppMode; } catch (_) { }
        showMainSection('scanner');
        setHomeHref(requested);
        try { loadAndDisplaySingleChainTokens(); } catch (e) { console.error('single-chain init error', e); }
        try { applySortToggleState(); } catch (_) { }
        try { syncPnlInputFromStorage(); } catch (_) { }
        // Re-apply controls based on current chain state (check if tokens exist for this chain)
        try {
            const state = computeAppReadiness();
            applyControlsFor(state);
        } catch (e) { console.error('applyControlsFor error', e); }
    }

    try {
        if (window.whenStorageReady) {
            window.whenStorageReady.then(applyModeFromURL);
        } else {
            applyModeFromURL();
        }
    } catch (_) { applyModeFromURL(); }
    // Apply gating again after mode/layout switches
    try {
        const st2 = getAppState();
        if (st2 && st2.run === 'YES' && typeof setScanUIGating === 'function') {
            setScanUIGating(true);
        }
    } catch (_) { }

    // Build chain icon links based on CONFIG_CHAINS
    function renderChainLinks(activeKey = 'all') {
        const $wrap = $('#chain-links-container');
        if ($wrap.length === 0) return;
        $wrap.empty();

        const currentPage = (window.location.pathname.split('/').pop() || 'index.html');
        Object.keys(CONFIG_CHAINS || {}).forEach(chainKey => {
            const chain = CONFIG_CHAINS[chainKey] || {};
            const isActive = String(activeKey).toLowerCase() === String(chainKey).toLowerCase();
            const style = isActive ? 'width:30px' : '';
            const width = isActive ? 30 : 24;
            const icon = chain.ICON || '';
            const name = chain.Nama_Chain || chainKey.toUpperCase();
            // Determine running state for this chain
            let running = false;
            try {
                const f = getFromLocalStorage(`FILTER_${String(chainKey).toUpperCase()}`, {}) || {};
                running = String(f.run || 'NO').toUpperCase() === 'YES';
            } catch (_) { }
            // Do not apply ring or enlargement; small dot indicator handled elsewhere
            const ring = '';
            const linkHTML = `
                <span class="chain-link icon" data-chain="${chainKey}" style="display:inline-block; ${style} margin-right:4px;">
                    <a href="${currentPage}?chain=${encodeURIComponent(chainKey)}" title="SCANNER ${name.toUpperCase()}">
                        <img src="${icon}" alt="${name} icon" width="${width}" style="${ring}">
                    </a>
                </span>`;
            $wrap.append(linkHTML);
        });
        try { updateToolbarRunIndicators(); } catch (_) { }
    }

    // Update toolbar indicators (multichain + per-chain) based on current FILTER_* run states
    function updateToolbarRunIndicators() {
        try {
            // Multichain icon reflect multi run
            const runMulti = !!(window.RUN_STATES && window.RUN_STATES.multichain);
            const $mcImg = $('#multichain_scanner img');
            if ($mcImg.length) {
                // Do not enlarge or add glow; only attach a small dot indicator
                $mcImg.css('filter', '').css('opacity', '');
                const $mc = $('#multichain_scanner');
                let $dot = $mc.find('span.run-dot');
                if (runMulti) {
                    if (!$dot.length) $mc.append('<span class="run-dot" style="background:#5c9514;"></span>');
                    else $dot.show();
                } else {
                    if ($dot.length) $dot.remove();
                }
            }
            // Per-chain icons
            Object.keys(CONFIG_CHAINS || {}).forEach(chainKey => {
                const cfg = CONFIG_CHAINS[chainKey] || {};
                const running = !!(window.RUN_STATES && window.RUN_STATES[String(chainKey).toLowerCase()]);
                const sel = `.chain-link[data-chain="${chainKey}"] img`;
                const $img = $(sel);
                // Do not add ring or enlarge the icon during scan; only show small dot
                $img.css('box-shadow', '').css('border-radius', '');
                // Add small dot indicator on the host span
                const $host = $(`.chain-link[data-chain="${chainKey}"]`);
                let $dot = $host.find('span.run-dot');
                if (running) {
                    const color = cfg.WARNA || '#5c9514';
                    if (!$dot.length) {
                        $host.append(`<span class="run-dot" style="background:${color};"></span>`);
                    } else {
                        $dot.css('background', color).show();
                    }
                } else {
                    if ($dot.length) $dot.remove();
                }
            });
        } catch (_) { }
    }
    try { window.updateToolbarRunIndicators = window.updateToolbarRunIndicators || updateToolbarRunIndicators; } catch (_) { }

    // Single-chain filter builders are removed (unified filter card is used)
    // function renderSingleChainFilters(chainKey) { ... }

    // Helpers: Sync filters + table render (global, used by deferredInit handlers)
    let syncSortState = { column: 'default', direction: 'asc' };
    window.__SYNC_SORT_STATE = { ...syncSortState };

    function getSyncSortState() {
        return { column: syncSortState.column, direction: syncSortState.direction };
    }

    function setSyncSortState(column) {
        if (!column) return;
        if (column === 'default') {
            syncSortState = { column: 'default', direction: 'asc' };
            window.__SYNC_SORT_STATE = { ...syncSortState };
            return;
        }
        if (syncSortState.column === column) {
            syncSortState = {
                column,
                direction: syncSortState.direction === 'asc' ? 'desc' : 'asc'
            };
        } else {
            syncSortState = { column, direction: 'asc' };
        }
        window.__SYNC_SORT_STATE = { ...syncSortState };
    }

    function updateSyncSortIndicators() {
        try {
            const state = syncSortState || { column: 'default', direction: 'asc' };
            const $headers = $('#sync-table thead th[data-sort-key]');
            if ($headers.length) {
                $headers.css('cursor', 'pointer');
            }
            $headers.each(function () {
                const $th = $(this);
                const key = String($th.data('sort-key') || '');
                const $indicator = $th.find('.sync-sort-indicator');
                if (!$indicator.length) return;
                const isActive = (key === 'default' && state.column === 'default') || (state.column === key);
                if (isActive && key !== 'default') {
                    // Gunakan icon UIkit atau unicode yang lebih bagus
                    const icon = state.direction === 'asc'
                        ? '<span uk-icon="icon: triangle-up; ratio: 0.6"></span>'
                        : '<span uk-icon="icon: triangle-down; ratio: 0.6"></span>';
                    $indicator.html(icon);
                    $indicator.css({ 'margin-left': '4px', 'opacity': '0.7' });
                } else {
                    $indicator.html('');
                }
            });
        } catch (_) { }
    }
    try {
        window.getSyncSortState = getSyncSortState;
        window.setSyncSortState = setSyncSortState;
        window.updateSyncSortIndicators = updateSyncSortIndicators;
    } catch (_) { }

    function getSyncSortValue(token, column) {
        switch (column) {
            case 'cex':
                {
                    const cexUp = String(token.cex || '').toUpperCase();
                    const statusRank = Number.isFinite(token.__statusRank) ? token.__statusRank : 2;
                    return `${cexUp}|${statusRank}`;
                }
            case 'token':
                return String(token.symbol_in || token.token_name || '').toUpperCase();
            case 'sc':
                return String(token.sc_in || token.contract_in || '').toLowerCase();
            case 'decimals': {
                const num = Number(token.des_in ?? token.decimals_in ?? token.decimal ?? 0);
                return Number.isFinite(num) ? num : 0;
            }
            case 'trade': {
                const dep = parseSnapshotStatus(token.deposit);
                const wd = parseSnapshotStatus(token.withdraw);
                if (dep === true && wd === true) return 2;
                if (dep === false || wd === false) return 0;
                return 1; // unknown
            }
            case 'wallet': {
                // Sorting berdasarkan status WD (Withdraw) dan DP (Deposit)
                const dep = parseSnapshotStatus(token.deposit || token.depositEnable);
                const wd = parseSnapshotStatus(token.withdraw || token.withdrawEnable);
                // Priority: WD=ON & DP=ON (3) > WD=ON atau DP=ON (2) > Unknown (1) > WD=OFF & DP=OFF (0)
                if (wd === true && dep === true) return 3;  // Both ON - highest priority
                if (wd === true || dep === true) return 2;   // One ON - medium priority
                if (wd === false && dep === false) return 0; // Both OFF - lowest priority
                return 1; // Unknown status
            }
            case 'price': {
                const priceVal = Number(token.current_price ?? token.price ?? token.last_price ?? NaN);
                if (Number.isFinite(priceVal) && priceVal > 0) return priceVal;
                return Number.NEGATIVE_INFINITY;
            }
            default:
                return Number.isFinite(token.__order) ? token.__order : 0;
        }
    }

    function applySyncSorting(list) {
        if (!Array.isArray(list) || !list.length) return;
        const state = syncSortState || { column: 'default', direction: 'asc' };
        list.sort((a, b) => {
            const orderA = Number.isFinite(a.__order) ? a.__order : (typeof a.__baseIndex === 'number' ? a.__baseIndex : 0);
            const orderB = Number.isFinite(b.__order) ? b.__order : (typeof b.__baseIndex === 'number' ? b.__baseIndex : 0);
            if (state.column === 'default') {
                return orderA - orderB;
            }
            const aVal = getSyncSortValue(a, state.column);
            const bVal = getSyncSortValue(b, state.column);
            let cmp;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                cmp = aVal - bVal;
            } else {
                cmp = String(aVal || '').localeCompare(String(bVal || ''), undefined, { sensitivity: 'base', numeric: false });
            }
            if (cmp === 0) return orderA - orderB;
            return state.direction === 'desc' ? (cmp > 0 ? -1 : 1) : (cmp > 0 ? 1 : -1);
        });
    }

    window.buildSyncFilters = function (chainKey) {
        const $modal = $('#sync-modal');
        const raw = $modal.data('remote-raw') || [];

        // ========== REFACTOR: CEX COUNT (untuk badge) ==========
        // Count by CEX SAJA (bukan pair, karena pair bukan filter)
        const countByCex = raw.reduce((acc, t) => {
            const k = String(t.cex || '').toUpperCase();
            acc[k] = (acc[k] || 0) + 1; return acc;
        }, {});

        const chain = (CONFIG_CHAINS || {})[chainKey] || {};
        const pairDefs = chain.PAIRDEXS || {};

        // Build CEX checkboxes (horizontal chips) - JANGAN auto-check CEX yang ada data
        const $cex = $('#sync-filter-cex').empty();
        Object.keys(CONFIG_CEX || {}).forEach(cex => {
            const id = `sync-cex-${cex}`;
            const badge = countByCex[cex] || 0;
            // TIDAK auto-check - biarkan user yang memilih
            const checked = '';
            $cex.append(`<label class="uk-text-small" style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border:1px solid #e5e5e5; border-radius:6px; background:#fafafa;">
                <input type="checkbox" id="${id}" value="${cex}" class="uk-checkbox" ${checked}>
                <span style="color:${CONFIG_CEX[cex].WARNA || '#333'}; font-weight:bolder;">${cex}</span>
            </label>`);
        });

        // ========== REFACTOR: PAIR RADIO BUTTONS (TANPA COUNTER) ==========
        // Pair adalah INPUT untuk konfigurasi save, BUKAN filter tampilan
        // Jadi TIDAK perlu counter/badge
        // PAIR ENABLED by default (user bisa pilih pair kapan saja setelah data dimuat)
        const $pair = $('#sync-filter-pair').empty();
        const pairKeys = Array.from(new Set([...Object.keys(pairDefs || {}), 'NON']));
        // Default: USDT jika ada, kalau tidak pakai pair pertama
        const defaultPair = pairKeys.includes('USDT') ? 'USDT' : (pairKeys.length > 0 ? pairKeys[0] : 'NON');
        pairKeys.forEach(p => {
            const id = `sync-pair-${p}`;
            const checked = (p === defaultPair) ? 'checked' : '';
            // Set warna: NON = hitam (#000), pair lainnya default
            const pairColor = (p === 'NON') ? '#000' : 'inherit';
            // ENABLED by default - user bisa pilih pair setelah data dimuat
            // Akan disabled hanya jika tidak ada koin yang tercentang (diatur oleh updateSyncSelectedCount)
            $pair.append(`<label class="uk-text-small" style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border:1px solid #e5e5e5; border-radius:6px; background:#fafafa;">
                <input type="radio" name="sync-pair-group" id="${id}" value="${p}" class="uk-radio" ${checked}>
                <span style="font-weight:bolder; color:${pairColor};">${p}</span>
            </label>`);
        });
        // Sembunyikan NON inputs by default (akan di-toggle saat pair aktif)
        $('#sync-non-config').css('display', 'none');

        // Build DEX config dengan checkbox untuk memilih DEX mana yang aktif
        const $dex = $('#sync-dex-config').empty();
        const dexList = (chain.DEXS || []).map(String);
        dexList.forEach(dx => {
            const dexConfig = CONFIG_DEXS?.[dx.toLowerCase()] || {};
            const dexColor = dexConfig.warna || '#333';

            $dex.append(`
                <div class="uk-flex uk-flex-middle sync-dex-row" data-dex="${dx}" style="gap:6px; padding: 4px; border-left: 3px solid ${dexColor}; background: ${dexColor}08;">
                    <label class="uk-margin-remove" style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" class="uk-checkbox sync-dex-checkbox" data-dex="${dx}" checked style="margin-right: 6px;">
                    </label>
                    <span class="uk-text-small uk-text-bold sync-dex-label" style="width:70px; color: ${dexColor};">${dx.toUpperCase()}</span>
                    <input type="number" class="uk-input uk-form-small sync-dex-left" data-dex="${dx}" placeholder="Modal Kiri" value="100" style="flex: 1;">
                    <input type="number" class="uk-input uk-form-small sync-dex-right" data-dex="${dx}" placeholder="Modal Kanan" value="100" style="flex: 1;">
                </div>`);
        });

        // Disable price filter initially (akan di-enable saat tabel sudah ada data)
        if (typeof window.updatePriceFilterState === 'function') {
            window.updatePriceFilterState();
        }
    };

    window.renderSyncTable = function (chainKey) {
        const $modal = $('#sync-modal');

        // ========== LOADING OVERLAY: START ==========
        const overlayId = window.AppOverlay ? window.AppOverlay.show({
            id: 'sync-table-render',
            title: 'Memuat Data Koin',
            message: 'Mohon menunggu, sedang memproses tabel...',
            spinner: true,
            freezeScreen: false // Jangan freeze, biarkan user bisa cancel modal
        }) : null;
        console.log('[renderSyncTable] Loading overlay created:', overlayId);
        // ===========================================

        // Use setTimeout to allow UI to update before heavy rendering
        setTimeout(() => {
            try {
                renderSyncTableCore(chainKey, overlayId);
            } catch (err) {
                console.error('[renderSyncTable] Error:', err);
                if (overlayId && window.AppOverlay) {
                    console.log('[renderSyncTable] Hiding overlay due to error:', overlayId);
                    window.AppOverlay.hide(overlayId);
                }
            }
        }, 50);
    };

    function renderSyncTableCore(chainKey, overlayId) {
        try {
            const $modal = $('#sync-modal');

            // ========== SIMPAN STATE CHECKBOX SEBELUM RE-RENDER ==========
            // Simpan state centang checkbox saat ini (termasuk pilihan user yang belum di-save)
            const currentCheckboxState = new Map();
            $('#sync-modal-tbody .sync-token-checkbox').each(function () {
                const $cb = $(this);
                const cex = String($cb.data('cex') || '').toUpperCase();
                const symbol = String($cb.data('symbol') || '').toUpperCase();
                const isChecked = $cb.is(':checked');
                // Key: HANYA cex+symbol (TANPA index, karena index berubah saat filter/sort)
                const key = `${cex}__${symbol}`;
                currentCheckboxState.set(key, isChecked);
            });
            // console.log('[renderSyncTable] Saved checkbox state:', currentCheckboxState.size, 'items');
            // ==============================================================

            const modalBody = $('#sync-modal-tbody').empty();
            const raw = $modal.data('remote-raw') || [];
            const savedTokens = $modal.data('saved-tokens') || [];
            const chainCfg = CONFIG_CHAINS[chainKey] || {};
            const pairDefs = chainCfg.PAIRDEXS || {};
            const sourceLabel = String($modal.data('source') || 'server').toLowerCase();
            const selectedCexs = $('#sync-filter-cex input:checked').map(function () { return $(this).val().toUpperCase(); }).get();
            // Get selected pair from radio button (only one)
            const selectedPair = $('#sync-filter-pair input[type="radio"]:checked').val();
            const preferredPairs = selectedPair ? [String(selectedPair).toUpperCase()] : [];
            window.__SYNC_PRICE_QUEUE = [];
            window.__SYNC_PRICE_ACTIVE = false;
            const renderId = Date.now();

            if (!raw.length || selectedCexs.length === 0) {
                modalBody.html('<tr><td colspan="7">Pilih minimal 1 CEX untuk menampilkan koin.</td></tr>');
                updateSyncSelectedCount();
                updateSyncSortIndicators();
                return;
            }

            // ========== FETCH HARGA SELALU PAKAI USDT ==========
            // Fetch harga SELALU pakai USDT (kecuali INDODAX pakai IDR)
            // Pair yang dipilih user (selectedPair) HANYA untuk SAVE, bukan fetch harga
            // selectedPair akan dibaca ulang saat tombol Save diklik
            const pairForPrice = 'USDT'; // ← Hardcoded USDT untuk fetch harga
            // ====================================================

            const savedLookup = new Map();
            const savedPairsLookup = new Map(); // Map untuk menyimpan pairs per koin
            (Array.isArray(savedTokens) ? savedTokens : []).forEach(s => {
                const symIn = String(s.symbol_in || '').toUpperCase();
                const symOut = String(s.symbol_out || '').toUpperCase();
                if (!symIn) return;
                const cexesRaw = Array.isArray(s.selectedCexs) && s.selectedCexs.length ? s.selectedCexs : [s.cex];
                (cexesRaw || []).filter(Boolean).forEach(cx => {
                    const cexUp = String(cx).toUpperCase();
                    savedLookup.set(`${cexUp}__${symIn}`, s);

                    // Kumpulkan pairs untuk koin ini
                    const pairKey = `${cexUp}__${symIn}`;
                    if (!savedPairsLookup.has(pairKey)) {
                        savedPairsLookup.set(pairKey, new Set());
                    }
                    if (symOut) {
                        savedPairsLookup.get(pairKey).add(symOut);
                    }
                });
            });

            // ========== REFACTOR: JANGAN EXPAND BERDASARKAN PAIR ==========
            // Pair BUKAN filter tampilan, tapi konfigurasi untuk save
            // 1 token = 1 row di tabel, tidak peduli berapa banyak pair
            const processed = [];
            let orderCounter = 0;
            raw.forEach((token, idx) => {
                const baseIndex = (typeof token._idx === 'number') ? token._idx : idx;
                const source = String(token.__source || sourceLabel || 'server').toLowerCase();
                const cexUp = String(token.cex || '').toUpperCase();

                // Simpan token apa adanya, TANPA expand berdasarkan pair
                processed.push(Object.assign({}, token, {
                    __baseIndex: baseIndex,
                    __source: source,
                    cex: cexUp,
                    __order: orderCounter++
                }));
            });

            // Filter berdasarkan CEX dan Harga
            const priceFilter = $('input[name="sync-price-filter"]:checked').val() || 'all';

            // Hitung berapa token punya harga untuk validasi filter
            const tokensWithPrice = processed.filter(t => {
                const cexUp = String(t.cex || '').toUpperCase();
                if (selectedCexs.length && !selectedCexs.includes(cexUp)) return false;
                const price = Number(t.current_price || 0);
                return Number.isFinite(price) && price > 0;
            });

            let filtered = processed.filter(t => {
                const cexUp = String(t.cex || '').toUpperCase();
                if (selectedCexs.length && !selectedCexs.includes(cexUp)) return false;

                // ===== FILTER: Only show tokens with valid SC =====
                // Skip tokens without smart contract address (untuk semua CEX, termasuk LBANK)
                const sc = String(t.sc_in || t.contract_in || '').trim().toLowerCase();
                const hasValidSC = sc && sc !== '0x' && sc.length > 6;
                if (!hasValidSC) {
                    return false; // ❌ Skip token tanpa SC valid
                }

                // Filter harga
                if (priceFilter !== 'all') {
                    const price = Number(t.current_price || 0);
                    const hasPrice = Number.isFinite(price) && price > 0;

                    if (priceFilter === 'with-price' && !hasPrice) return false;
                }

                // Filter Wallet CEX (WD & DP ON)
                const walletFilterOn = $('#sync-wallet-filter').is(':checked');
                if (walletFilterOn) {
                    const depositStatus = parseSnapshotStatus(t.deposit || t.depositEnable);
                    const withdrawStatus = parseSnapshotStatus(t.withdraw || t.withdrawEnable);
                    // Hanya tampilkan jika KEDUA status adalah ON (true)
                    if (depositStatus !== true || withdrawStatus !== true) return false;
                }

                return true;
            });

            if (!filtered.length) {
                // Pesan lebih informatif berdasarkan kondisi
                let emptyMessage = 'Tidak ada koin yang cocok dengan filter.';
                if (priceFilter === 'with-price' && tokensWithPrice.length === 0) {
                    emptyMessage = 'Tidak ada koin dengan harga. Klik "SNAPSHOT [UPDATE KOIN]" untuk memuat harga terbaru.';
                } else if (selectedCexs.length === 0) {
                    emptyMessage = 'Pilih minimal 1 CEX untuk menampilkan koin.';
                }
                modalBody.html(`<tr><td colspan="7">${emptyMessage}</td></tr>`);
                updateSyncSelectedCount();
                updateSyncSortIndicators();

                // Jika filter "Berharga" tapi tidak ada token dengan harga, reset ke "Semua"
                if (priceFilter === 'with-price' && tokensWithPrice.length === 0) {
                    $('input[name="sync-price-filter"][value="all"]').prop('checked', true);
                }
                return;
            }

            // Deteksi koin dengan nama sama tapi SC berbeda
            const symbolScMap = new Map(); // Map<symbol, Set<SC>>
            filtered.forEach(token => {
                const symIn = String(token.symbol_in || '').toUpperCase();
                const scIn = String(token.sc_in || token.contract_in || '').toLowerCase().trim();
                if (!symbolScMap.has(symIn)) {
                    symbolScMap.set(symIn, new Set());
                }
                if (scIn && scIn !== '0x' && scIn.length > 6) {
                    symbolScMap.get(symIn).add(scIn);
                }
            });

            // Tandai token yang punya multiple SC
            const duplicateSymbols = new Set();
            symbolScMap.forEach((scSet, symbol) => {
                if (scSet.size > 1) {
                    duplicateSymbols.add(symbol);
                }
            });

            filtered.forEach(token => {
                const cexUp = String(token.cex || '').toUpperCase();
                const symIn = String(token.symbol_in || '').toUpperCase();
                const savedEntry = savedLookup.get(`${cexUp}__${symIn}`) || null;
                token.__isSaved = !!savedEntry;
                token.__savedEntry = savedEntry;
                const isSnapshot = String(token.__source || sourceLabel || '').toLowerCase() === 'snapshot';
                token.__isSnapshot = !token.__isSaved && isSnapshot;
                token.__statusRank = token.__isSaved ? 0 : (token.__isSnapshot ? 1 : 2);
                token.__hasDuplicateSC = duplicateSymbols.has(symIn); // Flag untuk warna merah
            });

            applySyncSorting(filtered);

            // Debug logging: show tokens that already exist in DB and any internal DB duplicates
            try {
                // Remote vs DB intersection (for current filters)
                const dupRemote = [];
                (filtered || []).forEach((token, idx) => {
                    const cexUp = String(token.cex || '').toUpperCase();
                    const symIn = String(token.symbol_in || '').toUpperCase();
                    const saved = savedLookup.get(`${cexUp}__${symIn}`) || null;
                    if (saved) dupRemote.push({ idx: (token._idx ?? idx), cex: cexUp, symbol_in: symIn, savedId: saved.id || '-' });
                });
                /* debug logs removed */

                // Internal DB duplicates (per-chain), expanded per selected CEX
                const keyCounts = {};
                (Array.isArray(savedTokens) ? savedTokens : []).forEach(s => {
                    const symIn = String(s.symbol_in || '').toUpperCase();
                    if (!symIn) return;
                    const cexes = (Array.isArray(s.selectedCexs) && s.selectedCexs.length ? s.selectedCexs : [s.cex])
                        .filter(Boolean)
                        .map(x => String(x).toUpperCase());
                    cexes.forEach(cx => {
                        const key = `${cx}__${symIn}`;
                        keyCounts[key] = (keyCounts[key] || 0) + 1;
                    });
                });
                const dbDup = Object.entries(keyCounts)
                    .filter(([, cnt]) => cnt > 1)
                    .map(([k, cnt]) => { const [cx, si] = k.split('__'); return { cex: cx, symbol_in: si, count: cnt }; });
                /* debug logs removed */
            } catch (e) { /* debug logs removed */ }

            // Declare in higher scope for chunked rendering
            const priceJobKeys = new Set();
            const priceJobs = [];

            // ========== PERFORMANCE FIX: LIMIT ROWS TO PREVENT BROWSER FREEZE ==========
            // Jika filtered > 1000 rows, limit untuk menghindari browser hang
            const MAX_SYNC_ROWS = 1000; // ← REDUCED dari 3000 ke 1000 untuk mencegah "Not Responding"
            const totalFiltered = filtered.length;
            if (totalFiltered > MAX_SYNC_ROWS) {
                console.warn(`[renderSyncTableCore] Too many rows (${totalFiltered}). Limiting to ${MAX_SYNC_ROWS} rows to prevent browser freeze.`);
                filtered = filtered.slice(0, MAX_SYNC_ROWS);

                // Show warning message to user
                if (typeof toast !== 'undefined' && toast.warning) {
                    toast.warning(`⚠️ Menampilkan ${MAX_SYNC_ROWS} dari ${totalFiltered} koin.\n\n✅ GUNAKAN FILTER untuk mempersempit hasil:\n• Filter by CEX (BITGET, BYBIT, dll)\n• Filter by Status (WD/DP ON/OFF)\n• Filter by Pair (USDT, BTC, dll)\n\nTerlalu banyak rows menyebabkan browser hang!`, {
                        duration: 10000
                    });
                }
            }
            // ===========================================================================

            // ========== OPTIMASI: BATCH DOM RENDERING ==========
            // Build semua HTML rows dalam 1 string, lalu insert sekali saja
            // Mengurangi reflow dari 1000+ kali menjadi 1 kali
            let batchHtml = '';
            const priceCellsToUpdate = []; // Array untuk menyimpan data price cells yang perlu diupdate

            filtered.forEach((token, index) => {
                const baseIndex = (typeof token.__baseIndex === 'number') ? token.__baseIndex : (token._idx ?? index);
                const source = String(token.__source || sourceLabel || 'server').toLowerCase();
                const cexUp = String(token.cex || '').toUpperCase();
                const symIn = String(token.symbol_in || '').toUpperCase();
                const scInRaw = token.sc_in || token.contract_in || '';
                const desInRaw = token.des_in;

                // Cek apakah koin sudah ada di database (per-chain)
                const saved = token.__isSaved ? (token.__savedEntry || {}) : null;

                // ========== RESTORE STATE CHECKBOX DARI SEBELUM RE-RENDER ==========
                // Key berdasarkan identitas koin: HANYA cex+symbol (TANPA index dan pair)
                const checkboxKey = `${cexUp}__${symIn}`;
                let isChecked = false; // ← DEFAULT: TIDAK TERCENTANG (user harus manual centang atau pakai radio button)

                // Jika ada state checkbox sebelumnya, gunakan state tersebut (PRIORITAS UTAMA)
                // Ini untuk preserve pilihan user saat tabel di-render ulang (filter/sort)
                if (currentCheckboxState.has(checkboxKey)) {
                    isChecked = currentCheckboxState.get(checkboxKey);
                }
                // ====================================================================

                // CEX display dengan status badge di baris baru
                const showSourceBadge = token.__isSnapshot;
                const statusText = saved ? '[DIPILIH]' : (showSourceBadge ? '[SNAPSHOT]' : '');
                const statusColor = saved ? '#37f21f' : '#d96c19ff'; // success green / warning orange

                // Ambil warna CEX dari CONFIG_CEX
                const cexColor = (CONFIG_CEX && CONFIG_CEX[cexUp]) ? CONFIG_CEX[cexUp].WARNA : '#333';

                const cexDisplay = statusText
                    ? `<div class="uk-text-bold" style="color:${cexColor};">${cexUp}</div><div style="font-size:10px; color:${statusColor}; font-weight:700; margin-top:2px;">${statusText}</div>`
                    : `<div class="uk-text-bold" style="color:${cexColor};">${cexUp}</div>`;

                const scIn = String(scInRaw || '');
                const scDisplay = scIn ? (scIn.length > 12 ? `${scIn.slice(0, 6)}...${scIn.slice(-4)}` : scIn) : '?';
                const tokenName = token.token_name || token.name || symIn || '-';

                // ========== WALLET STATUS: WITHDRAW & DEPOSIT ==========
                // Parse status deposit dan withdraw dari data token
                const depositStatus = parseSnapshotStatus(token.deposit || token.depositEnable);
                const withdrawStatus = parseSnapshotStatus(token.withdraw || token.withdrawEnable);

                // Format display untuk WITHDRAW status (urutan pertama)
                const wdStatusText = withdrawStatus === true ? 'ON' : (withdrawStatus === false ? 'OFF' : '?');
                const wdStatusColor = withdrawStatus === true ? '#4caf50' : (withdrawStatus === false ? '#f44336' : '#999');

                // Format display untuk DEPOSIT status (urutan kedua)
                const depoStatusText = depositStatus === true ? 'ON' : (depositStatus === false ? 'OFF' : '?');
                const depoStatusColor = depositStatus === true ? '#4caf50' : (depositStatus === false ? '#f44336' : '#999');

                // Build title untuk tooltip - tambahkan info DEX dan Modal jika koin sudah dipilih
                let tooltipTitle = `Withdraw: ${wdStatusText} | Deposit: ${depoStatusText}`;
                if (saved) {
                    // Ambil info DEX dan Modal dari saved entry
                    const dexsList = Array.isArray(saved.dexs) ? saved.dexs.map(d => d.dex || '').filter(Boolean) : [];
                    const dexsText = dexsList.length > 0 ? dexsList.join(', ').toUpperCase() : '-';

                    // Ambil modal dari setiap DEX
                    const modalsInfo = Array.isArray(saved.dexs) ? saved.dexs.map(d => {
                        const dexName = (d.dex || '').toUpperCase();
                        const modalKiri = d.amount_in_token || d.modalKiri || 0;
                        const modalKanan = d.amount_in_pair || d.modalKanan || 0;
                        return `${dexName}: [${modalKiri} | ${modalKanan}]`;
                    }).join(', ') : '-';

                    tooltipTitle = `[DIPILIH]\nWithdraw: ${wdStatusText} | Deposit: ${depoStatusText}\nDEX: ${dexsText}\nModal: ${modalsInfo}`;
                }

                const walletStatusDisplay = `
                <div style="display:flex; gap:4px; justify-content:center; font-size:11px; font-weight:bold;" title="${tooltipTitle}">
                    <span style="color:${wdStatusColor};">${wdStatusText}</span>
                    <span style="color:#ccc;">|</span>
                    <span style="color:${depoStatusColor};">${depoStatusText}</span>
                </div>`;
                // =====================================================

                // ========== KOLOM DECIMALS DAN TRADE DIHAPUS ==========
                // Tidak semua CEX memberikan info status trade yang konsisten
                // Decimals bisa dilihat di detail atau form tambah koin
                // =====================================================

                // ========== PAIR UNTUK HARGA SELALU USDT ==========
                // Fetch harga SELALU pakai USDT (kecuali INDODAX pakai IDR)
                // Tidak peduli pair apa yang dipilih user untuk save
                // pairForPrice sudah dideklarasikan di atas (line 4005)
                const eligibleForPrice = true; // Selalu fetch harga dengan USDT

                const priceStored = Number(token.current_price ?? NaN);
                const priceCurrency = token.price_currency || (cexUp === 'INDODAX' ? 'IDR' : 'USDT');

                // ========== CEK CACHE UNTUK HARGA ==========
                // Cek cache dulu sebelum render HTML, agar tampilan langsung menggunakan cache
                const cache = (typeof window.getSyncPriceCache === 'function') ? window.getSyncPriceCache() : new Map();
                const cacheKey = `${cexUp}__${symIn}__${pairForPrice}`;
                const cached = cache.get(cacheKey);
                const now = Date.now();
                const cacheTTL = window.SYNC_PRICE_CACHE_TTL || 60000;
                const isCacheValid = cached && (now - cached.ts) < cacheTTL;

                // Priority: 1) Cache valid, 2) Data dari token, 3) '?'
                let priceDisplay = '?';
                if (isCacheValid && Number.isFinite(cached.price) && cached.price > 0) {
                    priceDisplay = formatSyncPriceValue(cached.price, priceCurrency);
                } else if (Number.isFinite(priceStored) && priceStored > 0) {
                    priceDisplay = formatSyncPriceValue(priceStored, priceCurrency);
                }
                // ==========================================

                // Checkbox: simpan data-cex dan data-symbol (TANPA pair)
                const checkboxHtml = `<input type="checkbox" class="uk-checkbox sync-token-checkbox" data-index="${baseIndex}" data-cex="${cexUp}" data-symbol="${symIn}" ${isChecked ? 'checked' : ''} ${saved ? 'data-saved="1"' : ''}>`;

                // Style untuk koin dengan SC berbeda (warna merah)
                const duplicateStyle = token.__hasDuplicateSC ? ' style="color: #f0506e; font-weight: bold;"' : '';
                const duplicateWarning = token.__hasDuplicateSC ? '⚠️ ' : '';

                // Ambil pairs yang tersimpan untuk koin ini, kelompokkan sesuai PAIRDEXS
                const pairKey = `${cexUp}__${symIn}`;
                const savedPairs = savedPairsLookup.get(pairKey);
                let pairsDisplay = '';
                if (savedPairs && savedPairs.size > 0) {
                    // Get main pairs dari PAIRDEXS config
                    const mainPairs = Object.keys(pairDefs || {}).map(p => p.toUpperCase());
                    const displayPairs = [];
                    let hasNonPairs = false;

                    // Separate main pairs dan other pairs
                    savedPairs.forEach(pair => {
                        if (mainPairs.includes(pair)) {
                            displayPairs.push(pair);
                        } else {
                            hasNonPairs = true;
                        }
                    });

                    // Jika ada pairs selain main pairs, tambahkan "NON"
                    if (hasNonPairs) {
                        displayPairs.push('NON');
                    }

                    pairsDisplay = displayPairs.length > 0
                        ? `<span style="color: #666; font-size: 10px;"><br/>[${displayPairs.join(',')}]</span>`
                        : '';
                }

                const row = `
                <tr data-sc="${scIn}" data-source="${source}" class="${showSourceBadge ? 'snapshot-row' : ''}">
                    <td class="uk-text-center">${checkboxHtml}</td>
                    <td class="uk-text-center">${index + 1}</td>
                    <td class="uk-text-small" style="line-height:1.4;">${cexDisplay}</td>
                    <td${duplicateStyle}>
                        <span title="${tokenName}${token.__hasDuplicateSC ? ' - Multiple SC Address' : ''}">${duplicateWarning}<strong>${symIn}</strong>${pairsDisplay}</span>
                    </td>
                    <td class="uk-text-small mono" title="${scIn || '-'}"${duplicateStyle}>${scDisplay} [${desInRaw || '-'}]</td>
                    <td class="uk-text-center">${walletStatusDisplay}</td>
                    <td class="uk-text-right uk-text-small" data-price-cex="${cexUp}" data-symbol="${symIn}" data-index="${baseIndex}">${priceDisplay}</td>
                </tr>`;

                // Tambahkan ke batch HTML string (bukan append satu-satu)
                batchHtml += row;

                // Simpan data untuk price cell update nanti (setelah DOM di-insert)
                priceCellsToUpdate.push({
                    cexUp,
                    symIn,
                    baseIndex,
                    eligibleForPrice,
                    priceDisplay: priceDisplay,
                    renderId
                });

                // ========== HANYA BUAT PRICE JOB JIKA CACHE TIDAK VALID ==========
                // Cache sudah dicek di atas (line 4326-4341), jika valid tidak perlu fetch lagi
                const jobKey = `${cexUp}__${symIn}__${pairForPrice}`;
                if (eligibleForPrice && !priceJobKeys.has(jobKey) && !isCacheValid) {
                    priceJobKeys.add(jobKey);
                    priceJobs.push({
                        cex: cexUp,
                        symbol: symIn,
                        pair: pairForPrice,
                        scIn: scIn,
                        scOut: '', // Will be resolved during price fetch
                        chain: chainKey,
                        renderId
                    });
                }
                // =================================================================
            });

            // Insert semua rows sekaligus (1× reflow, bukan 1000× reflow)
            modalBody.html(batchHtml);

            // Update price cells setelah DOM ter-insert
            priceCellsToUpdate.forEach(cellData => {
                const $priceCell = $(`#sync-modal-tbody td[data-price-cex="${cellData.cexUp}"][data-symbol="${cellData.symIn}"][data-index="${cellData.baseIndex}"]`);
                if ($priceCell.length) {
                    if (cellData.eligibleForPrice) {
                        $priceCell.text(cellData.priceDisplay === '?' ? '?' : cellData.priceDisplay);
                    }
                    $priceCell.data('render-id', cellData.renderId);
                }
            });
            updateSyncSelectedCount();
            updateAddTokenButtonState();
            priceJobs.forEach(queueSyncPriceFetch);
            updateSyncSortIndicators();

            // ========== ENABLE/DISABLE RADIO BUTTON BERDASARKAN DATA TABEL ==========
            // Radio button hanya aktif setelah tabel selesai di-render dan punya data
            const hasTableData = $('#sync-modal-tbody tr').length > 0 &&
                !$('#sync-modal-tbody tr td[colspan]').length; // Pastikan bukan row kosong/error
            const $modeRadios = $('input[name="sync-pick-mode"]');

            if ($modeRadios.length) {
                $modeRadios.prop('disabled', !hasTableData);

                // Visual feedback: opacity + pointer events
                $modeRadios.closest('label').css({
                    opacity: hasTableData ? '1' : '0.5',
                    pointerEvents: hasTableData ? 'auto' : 'none',
                    cursor: hasTableData ? 'pointer' : 'not-allowed'
                });

                console.log('[renderSyncTable] Radio buttons:', hasTableData ? 'ENABLED' : 'DISABLED', '- Table rows:', $('#sync-modal-tbody tr').length);
            }

            // ========== ENABLE/DISABLE WALLET FILTER CHECKBOX BERDASARKAN DATA TABEL ==========
            const $walletFilter = $('#sync-wallet-filter');
            if ($walletFilter.length) {
                $walletFilter.prop('disabled', !hasTableData);

                // Visual feedback: opacity untuk label
                $walletFilter.closest('label').css({
                    opacity: hasTableData ? '1' : '0.5',
                    pointerEvents: hasTableData ? 'auto' : 'none',
                    cursor: hasTableData ? 'pointer' : 'not-allowed'
                });

                console.log('[renderSyncTable] Wallet filter checkbox:', hasTableData ? 'ENABLED' : 'DISABLED');
            }

            // Update price filter state (enable/disable berdasarkan data tabel)
            if (typeof window.updatePriceFilterState === 'function') {
                window.updatePriceFilterState();
            }
            // =========================================================================

        } catch (error) {
            console.error('[renderSyncTableCore] Error during rendering:', error);
        } finally {
            // ========== LOADING OVERLAY: END ==========
            // Hide overlay setelah rendering selesai (atau error)
            console.log('[renderSyncTableCore] Finally block executed. overlayId:', overlayId, 'AppOverlay exists:', !!window.AppOverlay);

            // Immediate hide instead of setTimeout to prevent event loop blocking
            if (overlayId && window.AppOverlay) {
                console.log('[renderSyncTableCore] Calling AppOverlay.hide for:', overlayId);
                try {
                    window.AppOverlay.hide(overlayId);
                    console.log('[renderSyncTableCore] AppOverlay.hide called successfully');
                } catch (err) {
                    console.error('[renderSyncTableCore] Error hiding overlay:', err);
                }

                // FORCE HIDE: Double-check dan remove element langsung jika masih ada
                setTimeout(() => {
                    const overlayElement = document.getElementById(overlayId);
                    if (overlayElement) {
                        console.warn('[renderSyncTableCore] FORCE REMOVING stuck overlay element:', overlayId);
                        overlayElement.remove();
                        // Unfreeze body manually jika AppOverlay gagal
                        if (window.AppOverlay && window.AppOverlay.bodyFreezed) {
                            window.AppOverlay.unfreezeBody();
                        }
                    }
                }, 500);
            } else {
                console.warn('[renderSyncTableCore] Cannot hide overlay - overlayId:', overlayId, 'AppOverlay:', !!window.AppOverlay);
            }
            // ==========================================
        }
    }
});

// Ensure any hard reload navigations do not leave run=YES persisted
try {
    window.addEventListener('beforeunload', function () {
        try { sessionStorage.setItem('APP_FORCE_RUN_NO', '1'); } catch (_) { }
    });
} catch (_) { }

function readCexSelectionFromForm() {
    const selectedCexs = [];
    $('#cex-checkbox-koin input[type="checkbox"]:checked').each(function () {
        selectedCexs.push(String($(this).val()).toUpperCase());
    });
    return { selectedCexs };
}

function readDexSelectionFromForm() {
    const selectedDexs = [];
    const dataDexs = {};
    $('#dex-checkbox-koin .dex-edit-checkbox:checked').each(function () {
        const dexName = String($(this).val());
        const dexKeyLower = dexName.toLowerCase().replace(/[^a-z0-9_-]/gi, '');
        // Normalize: always use lowercase canonical key for consistency
        const canonicalKey = dexKeyLower || dexName.toLowerCase();
        const leftVal = parseFloat($(`#dex-${dexKeyLower}-left`).val());
        const rightVal = parseFloat($(`#dex-${dexKeyLower}-right`).val());
        selectedDexs.push(canonicalKey);
        dataDexs[canonicalKey] = { left: isNaN(leftVal) ? 0 : leftVal, right: isNaN(rightVal) ? 0 : rightVal };
    });
    return { selectedDexs, dataDexs };
}

function deleteTokenById(tokenId) {
    const m = getAppMode();
    let tokens = (m.type === 'single') ? getTokensChain(m.chain) : getTokensMulti();
    const updated = tokens.filter(t => String(t.id) !== String(tokenId));
    if (m.type === 'single') setTokensChain(m.chain, updated); else setTokensMulti(updated);
    refreshTokensTable();
    try { loadAndDisplaySingleChainTokens(); } catch (_) { }
    renderTokenManagementList();
    setLastAction("UBAH KOIN");
}

async function updateInfoFromHistory() {
    try {
        // Do not override RUN banner while scanning
        try {
            const anyRun = (function () {
                const st = (typeof getAppState === 'function') ? getAppState() : { run: 'NO' };
                if (String(st.run || 'NO').toUpperCase() === 'YES') return true;
                if (window.RUN_STATES) {
                    return Object.values(window.RUN_STATES).some(Boolean);
                }
                return false;
            })();
            if (anyRun) { if (typeof window.updateRunningChainsBanner === 'function') window.updateRunningChainsBanner(); return; }
        } catch (_) { }
        if (typeof getHistoryLog === 'function') {
            const list = await getHistoryLog();
            const last = Array.isArray(list) && list.length ? list[list.length - 1] : null;
            if (last && last.action && (last.time || last.timeISO)) {
                const t = last.time || new Date(last.timeISO).toLocaleString('id-ID', { hour12: false });
                $("#infoAPP").show().text(`${last.action} at ${t}`);
                return;
            }
        }
    } catch (_) { }
    try { $("#infoAPP").empty(); } catch (_) { }
}

function setLastAction(action, statusOrMeta, maybeMeta) {
    const formattedTime = new Date().toLocaleString('id-ID', { hour12: false });
    // Normalize status/meta early so we can enrich the action text conditionally
    const status = (typeof statusOrMeta === 'string') ? statusOrMeta : 'success';
    const meta = (typeof statusOrMeta === 'object' && statusOrMeta) ? statusOrMeta : (maybeMeta || undefined);

    // Build action label consistently with history (append [CHAIN] unless excluded)
    const excludeChain = /BACKUP|RESTORE|SETTING/i.test(String(action || ''));
    // Normalize incoming action: drop any existing [..] chunks and trailing extras
    let baseAction = String(action || '').replace(/\s*\[[^\]]*\]/g, '').trim();
    let displayAction = baseAction;
    try {
        // Only append if not already has trailing [..]
        const hasBracket = /\[[^\]]+\]$/.test(displayAction);
        if (!excludeChain && !hasBracket) {
            let chainLabel = 'MULTICHAIN';
            try {
                const m = getAppMode();
                chainLabel = (m && String(m.type).toLowerCase() === 'single') ? String(m.chain || '').toUpperCase() : 'MULTICHAIN';
            } catch (_) { }
            displayAction = `${displayAction} [${chainLabel}]`;
        }
    } catch (_) { }

    // Special case: enrich Update Wallet history with failed CEX names if any
    try {
        if (/^UPDATE\s+WALLET\s+EXCHANGER/i.test(baseAction) && meta && Array.isArray(meta.failedCex) && meta.failedCex.length) {
            const names = meta.failedCex.map(s => String(s).toUpperCase()).join(', ');
            displayAction = `${displayAction} | FAIL: ${names}`;
        }
    } catch (_) { }

    // Do not override RUN banner while scanning
    try {
        const st = (typeof getAppState === 'function') ? getAppState() : { run: 'NO' };
        const anyRun = (String(st.run || 'NO').toUpperCase() === 'YES') || (window.RUN_STATES && Object.values(window.RUN_STATES).some(Boolean));
        if (!anyRun) {
            $("#infoAPP").html(`${displayAction} at ${formattedTime}`);
        } else {
            if (typeof window.updateRunningChainsBanner === 'function') window.updateRunningChainsBanner();
        }
    } catch (_) { }

    // Append to HISTORY_LOG in IndexedDB with same label (single source of truth)
    try {
        if (typeof addHistoryEntry === 'function') addHistoryEntry(displayAction, status, meta, { includeChain: false });
    } catch (_) { }
    // Update info label from history log
    try { updateInfoFromHistory(); } catch (_) { }
}

// getManagedChains is defined in utils/helpers/chain-helpers.js (deduplicated)

/**
 * Calculates the result of a swap and returns a data object for the UI queue.
 */
// calculateResult is implemented in dom-renderer.js (deduplicated)
// Backup/Restore modal
$(document).on('click', '#openBackupModal', function (e) { e.preventDefault(); try { UIkit.modal('#backup-modal').show(); } catch (_) { } });
// History modal
$(document).on('click', '#openHistoryModal', function (e) { e.preventDefault(); try { UIkit.modal('#history-modal').show(); renderHistoryTable(); } catch (_) { } });
// Database Viewer
$(document).on('click', '#openDatabaseViewer', function (e) { e.preventDefault(); try { if (window.App?.DatabaseViewer?.show) window.App.DatabaseViewer.show(); } catch (err) { console.error('Database Viewer error:', err); } });

async function renderHistoryTable() {
    try {
        const rows = await (window.getHistoryLog ? window.getHistoryLog() : Promise.resolve([]));
        const mode = String($('#histMode').val() || 'all').toLowerCase();
        const chain = String($('#histChain').val() || '').trim().toUpperCase();
        const q = String($('#histSearch').val() || '').toLowerCase();
        const filtered = rows.filter(r => {
            // Since action already contains [CHAIN], chain filter applies to action string
            if (chain && String(r.action || '').toUpperCase().indexOf(`[${chain}]`) === -1) return false;
            if (mode !== 'all') {
                const isSingle = /\[[A-Z0-9_]+\]$/.test(String(r.action || ''));
                if (mode === 'single' && !isSingle) return false;
                if (mode === 'multi' && isSingle && String(r.action || '').toUpperCase().indexOf('[MULTICHAIN]') === -1) return false;
            }
            if (q) {
                const blob = `${r.action || ''} ${r.status || ''} ${r.time || ''}`.toLowerCase();
                if (!blob.includes(q)) return false;
            }
            return true;
        }).reverse();
        const $tb = $('#histTbody').empty();
        filtered.forEach(it => {
            const id = String(it.id || '');
            const stColor = (it.status === 'success') ? '#1e8e3e' : (it.status === 'warning') ? '#b37d00' : '#b3261e';
            // Build optional failure badge if meta.failedCex present
            let actionCell = String(it.action || '');
            try {
                const fails = Array.isArray(it.meta?.failedCex) ? it.meta.failedCex.filter(Boolean).map(s => String(s).toUpperCase()) : [];
                if (fails.length) {
                    const title = fails.join(', ');
                    const badge = `<span class="uk-badge hist-badge-fail" title="${title}">${fails.length}</span>`;
                    actionCell = `${actionCell} ${badge}`;
                }
            } catch (_) { }
            const tr = `
        <tr data-id="${id}">
          <td><input type="checkbox" class="histRowChk"></td>
          <td>${it.time || ''}</td>
          <td>${actionCell}</td>
          <td><span style="color:${stColor}; font-weight:600;">${String(it.status || '').toUpperCase()}</span></td>
        </tr>`;
            $tb.append(tr);
        });
    } catch (e) { /* debug logs removed */ }
}

$(document).on('change', '#histMode, #histChain, #histSearch', function () { renderHistoryTable(); });
$(document).on('click', '#histSelectAll', function () { const on = this.checked; $('#histTbody .histRowChk').prop('checked', on); });
$(document).on('click', '#histDeleteSelected', async function () {
    try {
        const ids = $('#histTbody .histRowChk:checked').map(function () { return $(this).closest('tr').data('id'); }).get();
        if (!ids.length) { if (typeof toast !== 'undefined' && toast.info) toast.info('Pilih data riwayat terlebih dahulu.'); return; }
        const res = await (window.deleteHistoryByIds ? window.deleteHistoryByIds(ids) : Promise.resolve({ ok: false }));
        if (res.ok) { if (typeof toast !== 'undefined' && toast.success) toast.success(`Hapus ${res.removed || ids.length} entri riwayat.`); renderHistoryTable(); }
        else { if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal menghapus riwayat.'); }
    } catch (e) { if (typeof toast !== 'undefined' && toast.error) toast.error('Error saat menghapus riwayat.'); }
});
$(document).on('click', '#histClearAll', async function () {
    try {
        if (!confirm('Bersihkan semua riwayat?')) return;
        const ok = await (window.clearHistoryLog ? window.clearHistoryLog() : Promise.resolve(false));
        if (ok) { if (typeof toast !== 'undefined' && toast.success) toast.success('Riwayat dibersihkan.'); renderHistoryTable(); }
        else { if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal membersihkan riwayat.'); }
    } catch (e) { if (typeof toast !== 'undefined' && toast.error) toast.error('Error saat membersihkan riwayat.'); }
});
// No export/save from History per request
// ❌ REMOVED DUPLICATE BACKUP HANDLER (caused multi-download issue)
// Backup handler is registered in core/handlers/ui-handlers.js:184-197
// ❌ REMOVED DUPLICATE RESTORE HANDLERS (main.js:5264-5304)
// Restore handlers are registered in core/handlers/ui-handlers.js:199-239
// Removed to fix double-download issue when backing up or restoring database

// =================================================================================
// BULK MODAL EDITOR - Edit modal DEX untuk semua token sekaligus (Single Chain Only)
// =================================================================================
(function initBulkModalEditor() {
    'use strict';

    // State untuk bulk editor
    let bulkState = {
        chain: null,
        selectedCexs: [],
        dexInputs: {},
        affectedTokens: []
    };

    // Initialize modal when it's shown
    $(document).on('beforeshow', '#bulk-modal-editor', async function () {
        const m = getAppMode();
        if (m.type !== 'single') {
            if (typeof toast !== 'undefined' && toast.warning) {
                toast.warning('Bulk Modal Editor hanya tersedia di mode Single Chain');
            }
            return false; // Prevent modal from opening
        }
        bulkState.chain = m.chain;
        await initBulkEditor();
    });

    // ✅ NEW: Update bulk modal icon visibility based on app mode
    // Hide icon in multichain mode, show in single chain mode
    function updateBulkModalIconVisibility() {
        try {
            const mode = getAppMode();
            const $icon = $('#BulkModalScanner');

            if (!$icon.length) {
                console.warn('[Bulk Modal] Icon #BulkModalScanner not found');
                return;
            }

            if (mode.type === 'single') {
                $icon.show(); // Show in single chain mode
                console.log('[Bulk Modal] Icon visible (Single Chain mode)');
            } else {
                $icon.hide(); // Hide in multichain mode
                console.log('[Bulk Modal] Icon hidden (Multichain mode)');
            }
        } catch (e) {
            console.error('[Bulk Modal] Error updating icon visibility:', e);
        }
    }

    // Call on page load
    $(document).ready(function () {
        updateBulkModalIconVisibility();
    });


    // 🔒 CRITICAL: Flush data when modal is closed (X button, ESC, click outside)
    UIkit.util.on('#bulk-modal-editor', 'hidden', async function () {
        console.log('[Bulk Modal] 🔄 Modal closing - flushing all pending writes to IndexedDB...');
        try {
            if (window.__IDB_FLUSH_PENDING__) {
                await window.__IDB_FLUSH_PENDING__();
                console.log('[Bulk Modal] ✅ All pending writes flushed successfully on modal close');
            }
        } catch (e) {
            console.error('[Bulk Modal] ❌ Failed to flush on modal close:', e);
        }
    });

    async function initBulkEditor() {
        const chainKey = bulkState.chain;
        if (!chainKey) return;

        // Update chain label
        $('#bulk-chain-label').text(String(chainKey).toUpperCase());

        // Populate CEX checkboxes (vertical layout)
        const $cexContainer = $('#bulk-filter-cex').empty();
        const cexList = CONFIG_UI?.CEXES || [];
        cexList.forEach(cex => {
            const cexKey = cex.key;
            const cexLabel = (cex.label || cexKey).toUpperCase();
            const cexColor = CONFIG_CEX?.[cexKey]?.WARNA || '#666';
            $cexContainer.append(`
                <div class="uk-margin-small-bottom">
                    <label class="uk-flex uk-flex-middle" style="gap:6px; cursor:pointer;">
                        <input type="checkbox" class="uk-checkbox bulk-cex-filter" value="${cexKey}" checked>
                        <span style="color:${cexColor}; font-weight:bold; font-size:14px;">${cexLabel}</span>
                    </label>
                </div>
            `);
        });

        // Populate DEX inputs based on chain's DEXS
        const chainConfig = CONFIG_CHAINS?.[chainKey] || {};
        const dexList = chainConfig.DEXS || [];
        const $dexContainer = $('#bulk-dex-inputs').empty();

        dexList.forEach(dexKey => {
            const dexConfig = CONFIG_DEXS?.[dexKey] || {};
            const dexUiConfig = CONFIG_UI?.DEXES?.find(d => d.key === dexKey) || {};
            const dexLabel = (dexConfig.label || dexUiConfig.label || String(dexKey)).toUpperCase();
            const dexColor = dexConfig.warna || '#666';

            $dexContainer.append(`
                <div class="uk-card uk-card-default uk-card-body uk-padding-small uk-margin-small-bottom">
                    <div class="uk-flex uk-flex-middle uk-flex-between">
                        <label class="uk-flex uk-flex-middle" style="gap:6px; cursor:pointer;">
                            <input type="checkbox" class="uk-checkbox bulk-dex-checkbox" value="${dexKey}" checked>
                            <span style="color:${dexColor}; font-weight:bold; font-size:14px;">${dexLabel}</span>
                        </label>
                        <div class="uk-flex uk-flex-middle" style="gap:8px;">
                            <div class="uk-flex uk-flex-middle" style="gap:4px;">
                                <span class="uk-text-small" style="color:${dexColor};">KIRI:</span>
                                <input type="number" class="uk-input uk-form-small bulk-dex-left" data-dex="${dexKey}"
                                       style="width:70px; text-align:center;" placeholder="0" min="0" step="1" value="100">
                            </div>
                            <div class="uk-flex uk-flex-middle" style="gap:4px;">
                                <span class="uk-text-small" style="color:${dexColor};">KANAN:</span>
                                <input type="number" class="uk-input uk-form-small bulk-dex-right" data-dex="${dexKey}"
                                       style="width:70px; text-align:center;" placeholder="0" min="0" step="1" value="100">
                            </div>
                        </div>
                    </div>
                </div>
            `);
        });

        // Initial update
        updateAffectedCount();

        // Populate profile dropdown
        await populateProfileSelect();
    }

    // Handle CEX filter changes
    $(document).on('change', '.bulk-cex-filter', function () {
        updateAffectedCount();
    });

    // Handle DEX checkbox changes
    $(document).on('change', '.bulk-dex-checkbox', function () {
        updateAffectedCount();
    });

    // Handle "Apply to All DEX" checkbox
    $(document).on('change', '#bulk-apply-all-dex', function () {
        const isChecked = $(this).is(':checked');
        $('.bulk-dex-checkbox').prop('checked', isChecked);
        updateAffectedCount();
    });

    // ========== PROFILE MODAL MANAGEMENT ==========
    // 🚀 CHAIN-BASED PROFILES: Each chain has its own set of profiles
    // ✅ REFACTORED: Now using IndexedDB helpers from storage.js
    // Storage key format: MODAL_PROFILE_{CHAIN} (singular, not plural)

    // Save last selected profile index for a chain (temporary cache, not critical data)
    async function saveLastProfileIndex(chainKey, index) {
        try {
            const storageKey = `MODAL_LAST_PROFILE_${String(chainKey || '').toUpperCase()}`;
            localStorage.setItem(storageKey, String(index));
            console.log(`[Bulk Modal] Saved last profile index ${index} for chain: ${chainKey}`);
        } catch (e) {
            console.error('[Bulk Modal] Error saving last profile index:', e);
        }
    }

    // Load last selected profile index for a chain
    async function loadLastProfileIndex(chainKey) {
        try {
            const storageKey = `MODAL_LAST_PROFILE_${String(chainKey || '').toUpperCase()}`;
            const stored = localStorage.getItem(storageKey);
            return stored !== null ? parseInt(stored) : null;
        } catch (e) {
            console.error('[Bulk Modal] Error loading last profile index:', e);
            return null;
        }
    }

    // ✅ NEW: Load profiles using IndexedDB helper from storage.js
    async function loadProfiles(chainKey) {
        try {
            const profiles = await window.loadModalProfiles(chainKey);
            console.log(`[Bulk Modal] ✅ Loaded ${profiles.length} profiles for chain: ${chainKey}`);
            if (profiles.length > 0) {
                console.log('[Bulk Modal] Profile names:', profiles.map(p => p.name).join(', '));
            }
            return profiles;
        } catch (e) {
            console.error('[Bulk Modal] ❌ Error loading profiles:', e);
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error(`Gagal memuat profil: ${e.message}`);
            }
            return [];
        }
    }

    // ✅ NEW: Save profiles using IndexedDB helper from storage.js
    async function saveProfiles(chainKey, profiles) {
        try {
            console.log(`[Bulk Modal] 🔄 Saving ${profiles.length} profiles for chain: ${chainKey}`);

            const success = await window.saveModalProfiles(chainKey, profiles);

            if (!success) {
                console.error('[Bulk Modal] ❌ Save failed');
                if (typeof toast !== 'undefined' && toast.error) {
                    toast.error('Gagal menyimpan profil');
                }
                return false;
            }

            // Verify save
            const verification = await loadProfiles(chainKey);
            if (verification.length === profiles.length) {
                console.log(`[Bulk Modal] ✅ Save VERIFIED for chain: ${chainKey}`);
                return true;
            } else {
                console.error(`[Bulk Modal] ❌ Save FAILED - verification mismatch`);
                return false;
            }
        } catch (e) {
            console.error('[Bulk Modal] ❌ Error saving profiles:', e);
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error(`Gagal menyimpan profil: ${e.message}`);
            }
            return false;
        }
    }

    // Populate profile dropdown (chain-specific)
    async function populateProfileSelect() {
        const chainKey = bulkState.chain;
        if (!chainKey) {
            console.warn('[Bulk Modal] ⚠️ Cannot populate profiles - chain key is missing');
            return;
        }

        console.log(`[Bulk Modal] 🔄 Populating profile dropdown for chain: ${chainKey}`);

        const profiles = await loadProfiles(chainKey);
        const $select = $('#profile-select');
        $select.find('option:not(:first)').remove();

        console.log(`[Bulk Modal] 📝 Adding ${profiles.length} profiles to dropdown`);

        profiles.forEach((profile, index) => {
            $select.append(`<option value="${index}">${profile.name}</option>`);
        });

        // 🚀 Auto-load last selected profile for this chain
        const lastIndex = await loadLastProfileIndex(chainKey);
        console.log(`[Bulk Modal] 🔍 Last profile index for ${chainKey}: ${lastIndex}`);

        if (lastIndex !== null && lastIndex >= 0 && lastIndex < profiles.length) {
            $select.val(lastIndex);
            const profile = profiles[lastIndex];
            if (profile) {
                applyProfileValues(profile);
                console.log(`[Bulk Modal] ✅ Auto-loaded profile "${profile.name}" for chain: ${chainKey}`);
                if (typeof toast !== 'undefined' && toast.info) {
                    toast.info(`Profil "${profile.name}" dimuat otomatis`);
                }
            }
        } else {
            console.log(`[Bulk Modal] ℹ️ No previous profile to auto-load for ${chainKey}`);
        }
    }

    // Get current DEX values from inputs
    function getCurrentDexValues() {
        const values = {};
        $('.bulk-dex-left').each(function () {
            const dexKey = $(this).data('dex');
            const left = parseFloat($(this).val()) || 0;
            const right = parseFloat($(`.bulk-dex-right[data-dex="${dexKey}"]`).val()) || 0;
            values[dexKey] = { left, right };
        });
        return values;
    }

    // Apply profile values to DEX inputs
    function applyProfileValues(profile) {
        const ranges = profile.ranges || {};
        Object.keys(ranges).forEach(dexKey => {
            const { left, right } = ranges[dexKey];
            $(`.bulk-dex-left[data-dex="${dexKey}"]`).val(left);
            $(`.bulk-dex-right[data-dex="${dexKey}"]`).val(right);
        });
    }

    // Handle profile selection change
    $(document).on('change', '#profile-select', async function () {
        const selectedIndex = $(this).val();
        if (selectedIndex === '') {
            // Clear last profile when user selects "-- Pilih Profil --"
            const chainKey = bulkState.chain;
            if (chainKey) {
                await saveLastProfileIndex(chainKey, -1);
            }
            return;
        }

        const chainKey = bulkState.chain;
        if (!chainKey) return;

        const profiles = await loadProfiles(chainKey);
        const profile = profiles[parseInt(selectedIndex)];
        if (profile) {
            applyProfileValues(profile);
            // 🚀 Save this as the last selected profile for this chain
            await saveLastProfileIndex(chainKey, parseInt(selectedIndex));
            if (typeof toast !== 'undefined' && toast.info) {
                toast.info(`Profil "${profile.name}" diterapkan (Chain: ${chainKey.toUpperCase()})`);
            }
        }
    });

    // Handle save profile button
    $(document).on('click', '#profile-save-btn', async function () {
        const chainKey = bulkState.chain;
        if (!chainKey) {
            if (typeof toast !== 'undefined' && toast.warning) {
                toast.warning('Chain tidak terdeteksi');
            }
            return;
        }

        const profileName = prompt('Masukkan nama profil:');
        if (!profileName || profileName.trim() === '') {
            if (typeof toast !== 'undefined' && toast.warning) {
                toast.warning('Nama profil tidak boleh kosong');
            }
            return;
        }

        const currentValues = getCurrentDexValues();
        const profiles = await loadProfiles(chainKey);

        // Check if profile with same name exists
        const existingIndex = profiles.findIndex(p => p.name === profileName.trim());

        const newProfile = {
            name: profileName.trim(),
            chain: chainKey, // 🚀 Store chain info
            ranges: currentValues,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (existingIndex >= 0) {
            // Update existing profile
            const confirm = window.confirm(`Profil "${profileName}" sudah ada. Timpa profil yang ada?`);
            if (!confirm) return;

            profiles[existingIndex] = newProfile;
            if (typeof toast !== 'undefined' && toast.success) {
                toast.success(`Profil "${profileName}" diperbarui (Chain: ${chainKey.toUpperCase()})`);
            }
        } else {
            // Create new profile
            profiles.push(newProfile);
            if (typeof toast !== 'undefined' && toast.success) {
                toast.success(`Profil "${profileName}" disimpan (Chain: ${chainKey.toUpperCase()})`);
            }
        }

        const saveSuccess = await saveProfiles(chainKey, profiles);

        if (!saveSuccess) {
            console.error('[Bulk Modal] ❌ Failed to save profile - aborting');
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error('Profil gagal disimpan ke database');
            }
            return;
        }

        // 🚀 Save this profile index as last selected
        const newIndex = existingIndex >= 0 ? existingIndex : profiles.length - 1;
        await saveLastProfileIndex(chainKey, newIndex);

        // 🔍 Verify data was actually saved to IndexedDB
        console.log('[Bulk Modal] 🔍 Verifying profiles saved to IndexedDB...');

        // Wait a bit for IndexedDB to fully commit
        await new Promise(resolve => setTimeout(resolve, 200));

        // Force reload from IndexedDB to verify persistence
        const verifyProfiles = await loadProfiles(chainKey);
        console.log(`[Bulk Modal] 📦 Verification: ${verifyProfiles.length} profiles found in storage`);

        if (verifyProfiles.length !== profiles.length) {
            console.error('[Bulk Modal] ❌ VERIFICATION FAILED: Profile count mismatch!');
            console.error(`[Bulk Modal] Expected: ${profiles.length}, Got: ${verifyProfiles.length}`);
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error('⚠️ Verifikasi gagal! Profile mungkin tidak tersimpan dengan benar.');
            }
        } else {
            console.log(`[Bulk Modal] ✅ VERIFICATION SUCCESS: All ${verifyProfiles.length} profiles persisted correctly`);
        }

        await populateProfileSelect();
    });

    // Handle delete profile button
    $(document).on('click', '#profile-delete-btn', async function () {
        const chainKey = bulkState.chain;
        if (!chainKey) {
            if (typeof toast !== 'undefined' && toast.warning) {
                toast.warning('Chain tidak terdeteksi');
            }
            return;
        }

        const selectedIndex = $('#profile-select').val();
        if (selectedIndex === '') {
            if (typeof toast !== 'undefined' && toast.warning) {
                toast.warning('Pilih profil yang akan dihapus');
            }
            return;
        }

        const profiles = await loadProfiles(chainKey);
        const profile = profiles[parseInt(selectedIndex)];
        if (!profile) return;

        const confirm = window.confirm(`Hapus profil "${profile.name}"?`);
        if (!confirm) return;

        profiles.splice(parseInt(selectedIndex), 1);
        await saveProfiles(chainKey, profiles);

        // 🚀 Clear last profile index since we deleted it
        await saveLastProfileIndex(chainKey, -1);

        await populateProfileSelect();
        $('#profile-select').val('');

        if (typeof toast !== 'undefined' && toast.success) {
            toast.success(`Profil "${profile.name}" dihapus (Chain: ${chainKey.toUpperCase()})`);
        }
    });

    function getSelectedCexs() {
        const selected = [];
        $('.bulk-cex-filter:checked').each(function () {
            selected.push(String($(this).val()).toUpperCase());
        });
        return selected;
    }

    function getSelectedDexInputs() {
        const inputs = {};
        $('.bulk-dex-checkbox:checked').each(function () {
            const dexKey = String($(this).val()).toLowerCase();
            const left = parseFloat($(`.bulk-dex-left[data-dex="${dexKey}"]`).val()) || 0;
            const right = parseFloat($(`.bulk-dex-right[data-dex="${dexKey}"]`).val()) || 0;
            inputs[dexKey] = { left, right };
        });
        return inputs;
    }

    function getAffectedTokens() {
        const chainKey = bulkState.chain;
        if (!chainKey) return [];

        const tokens = getTokensChain(chainKey) || [];
        const selectedCexs = getSelectedCexs();

        if (selectedCexs.length === 0) return [];

        // Filter tokens that have at least one matching CEX
        return tokens.filter(t => {
            const tokenCexs = (t.selectedCexs || []).map(c => String(c).toUpperCase());
            return tokenCexs.some(c => selectedCexs.includes(c));
        });
    }

    function updateAffectedCount() {
        const affected = getAffectedTokens();
        bulkState.affectedTokens = affected;
        $('#bulk-token-count').text(affected.length);

        // Update CEX label
        const selectedCexs = getSelectedCexs();
        if (selectedCexs.length === 0) {
            $('#bulk-cex-label').text('Tidak ada');
        } else if (selectedCexs.length === (CONFIG_UI?.CEXES?.length || 0)) {
            $('#bulk-cex-label').text('Semua');
        } else {
            $('#bulk-cex-label').text(selectedCexs.join(', '));
        }

        // Enable/disable apply button
        const dexInputs = getSelectedDexInputs();
        const canApply = affected.length > 0 && Object.keys(dexInputs).length > 0;
        $('#bulk-apply-btn').prop('disabled', !canApply);
    }


    // Handle Apply button
    $(document).on('click', '#bulk-apply-btn', async function () {
        const chainKey = bulkState.chain;
        if (!chainKey) return;

        const affected = getAffectedTokens();
        const dexInputs = getSelectedDexInputs();

        if (affected.length === 0 || Object.keys(dexInputs).length === 0) {
            if (typeof toast !== 'undefined' && toast.warning) {
                toast.warning('Tidak ada perubahan untuk diterapkan');
            }
            return;
        }

        // Confirm before applying
        const confirmMsg = `Anda akan mengubah modal DEX untuk ${affected.length} token.\n\nDEX yang diubah:\n${Object.entries(dexInputs).map(([dex, vals]) => `- ${dex.toUpperCase()}: KIRI=${vals.left}, KANAN=${vals.right}`).join('\n')
            }\n\nLanjutkan?`;

        if (!confirm(confirmMsg)) return;

        try {
            // Disable button during processing
            const $btn = $(this).prop('disabled', true).html('<span uk-spinner="ratio: 0.5"></span> Memproses...');

            // Get all tokens and update affected ones
            let allTokens = getTokensChain(chainKey) || [];
            const affectedIds = new Set(affected.map(t => String(t.id)));

            let updatedCount = 0;
            allTokens = allTokens.map(token => {
                if (!affectedIds.has(String(token.id))) return token;

                // Update dataDexs for this token
                const newDataDexs = { ...(token.dataDexs || {}) };

                Object.entries(dexInputs).forEach(([dexKey, vals]) => {
                    // Only update if this DEX is already selected for the token, or add it if not
                    newDataDexs[dexKey] = { left: vals.left, right: vals.right };
                });

                // Also ensure selectedDexs includes all the DEXes we're updating
                let newSelectedDexs = [...(token.selectedDexs || [])];
                Object.keys(dexInputs).forEach(dexKey => {
                    if (!newSelectedDexs.includes(dexKey)) {
                        newSelectedDexs.push(dexKey);
                    }
                });

                updatedCount++;
                return {
                    ...token,
                    dataDexs: newDataDexs,
                    selectedDexs: newSelectedDexs
                };
            });

            // Save updated tokens
            setTokensChain(chainKey, allTokens);

            // 🔒 Flush pending writes before closing modal
            console.log('[Bulk Modal] 🔄 Flushing changes to IndexedDB before closing modal...');
            try {
                if (window.__IDB_FLUSH_PENDING__) {
                    await window.__IDB_FLUSH_PENDING__();
                    console.log('[Bulk Modal] ✅ All changes persisted to IndexedDB');
                }
            } catch (e) {
                console.error('[Bulk Modal] ❌ Failed to flush changes:', e);
            }

            // Close modal
            UIkit.modal('#bulk-modal-editor').hide();

            // Show success message
            if (typeof toast !== 'undefined' && toast.success) {
                toast.success(`Berhasil mengubah modal DEX untuk ${updatedCount} token`);
            }

            // Refresh management list
            if (typeof renderTokenManagementList === 'function') {
                renderTokenManagementList();
            }
            if (typeof loadAndDisplaySingleChainTokens === 'function') {
                loadAndDisplaySingleChainTokens();
            }

            // Log action
            try { setLastAction('BULK MODAL UPDATE'); } catch (_) { }

        } catch (err) {
            console.error('Bulk modal update error:', err);
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error('Terjadi kesalahan saat mengupdate modal');
            }
        } finally {
            // Re-enable button
            $('#bulk-apply-btn').prop('disabled', false).html('<span uk-icon="icon: check; ratio: 0.8"></span> Terapkan Perubahan');
        }
    });

})();

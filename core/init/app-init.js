/**
 * =================================================================================
 * APPLICATION INITIALIZATION
 * =================================================================================
 *
 * This module contains the main application initialization logic that runs on
 * $(document).ready. It orchestrates the app startup sequence including:
 * - State initialization and cache setup
 * - Cross-tab synchronization
 * - Theme application
 * - Mode detection (multi-chain vs single-chain)
 * - Database status reporting
 * - Chain link rendering
 * - Filter card initialization
 * - Deferred initialization tasks
 *
 * Dependencies:
 * - jQuery
 * - All core utility functions (getAppState, applyThemeForMode, etc.)
 * - All filter/storage/rendering functions
 * - BroadcastChannel for cross-tab sync
 * - IndexedDB storage wrapper
 * - deferredInit() function from main.js
 *
 * @module core/init/app-init
 */

$(document).ready(function () {
    'use strict';

    // Database functions removed - snapshot-new.js will use alternative methods

    // --- Critical Initializations (Immediate) ---
    // If previous page triggered a reload/reset, clear local flag only (do not broadcast)
    try {
        if (sessionStorage.getItem('APP_FORCE_RUN_NO') === '1') {
            sessionStorage.removeItem('APP_FORCE_RUN_NO');
        }
    } catch (_) { }

    /**
     * Apply run UI based on running state
     * @param {boolean} isRunning - Whether scanning is currently running
     */
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

    /**
     * In-memory cache of run states to avoid stale storage reads across tabs
     */
    window.RUN_STATES = window.RUN_STATES || {};

    /**
     * Update run state cache for a filter key
     * @param {string} filterKey - The filter key (e.g., 'FILTER_MULTICHAIN' or 'FILTER_BSC')
     * @param {Object} val - The filter value object
     */
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

    /**
     * Initialize run state cache for all filter keys
     */
    function initRunStateCache() {
        try { updateRunStateCache('FILTER_MULTICHAIN'); } catch (_) { }
        try { Object.keys(CONFIG_CHAINS || {}).forEach(k => updateRunStateCache(`FILTER_${String(k).toUpperCase()}`)); } catch (_) { }
    }
    try {
        if (window.whenStorageReady && typeof window.whenStorageReady.then === 'function') {
            window.whenStorageReady.then(initRunStateCache);
        } else { initRunStateCache(); }
    } catch (_) { initRunStateCache(); }

    // Initialize app state from localStorage
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

    /**
     * Cross-tab run state sync via BroadcastChannel (per FILTER_* key)
     */
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

    // ✅ MIGRATION: Migrate old checkbox preferences to per-chain storage (one-time)
    setTimeout(function () {
        try {
            if (typeof migrateCheckboxPreferences === 'function') {
                migrateCheckboxPreferences();
            }
        } catch (e) {
            console.warn('[APP-INIT] Migration failed:', e.message);
        }
    }, 50);

    // ✅ NEW: Restore checkbox scanner controls from per-chain filter AFTER DOM is ready
    setTimeout(function () {
        try {
            // ✅ DEBUG: Log current mode and filter key
            const currentMode = (typeof getAppMode === 'function') ? getAppMode() : { type: 'unknown' };
            const currentFilterKey = (typeof getActiveFilterKey === 'function') ? getActiveFilterKey() : 'UNKNOWN';
            console.log('[APP-INIT] 🔍 Restoring checkboxes...');
            console.log('[APP-INIT]   ∟ Current mode:', currentMode);
            console.log('[APP-INIT]   ∟ Filter key:', currentFilterKey);

            const prefs = (typeof getCheckboxPreferences === 'function')
                ? getCheckboxPreferences()
                : {
                    autoScroll: false,
                    autoRun: false,
                    autoVol: false,
                    walletCex: false,
                    autoLevel: false,
                    autoLevelValue: 1
                };

            console.log('[APP-INIT]   ∟ Loaded preferences:', prefs);

            // ✅ VALIDATION: Enforce mutually exclusive AUTO VOL and AUTO LEVEL
            if (prefs.autoVol && prefs.autoLevel) {
                console.warn('[APP-INIT] ⚠️  Invalid state: both autoVol and autoLevel are true');
                console.warn('[APP-INIT] Prioritizing AUTO VOL, disabling AUTO LEVEL');
                prefs.autoLevel = false;
                // Save corrected state
                if (typeof saveCheckboxPreference === 'function') {
                    saveCheckboxPreference('autoLevel', false);
                }
            }

            // Restore checkbox states
            if (prefs.autoScroll !== undefined) {
                $('#autoScrollCheckbox').prop('checked', prefs.autoScroll);
            }
            if (prefs.autoRun !== undefined) {
                $('#autoRunToggle').prop('checked', prefs.autoRun);
                window.AUTORUN_ENABLED = prefs.autoRun;
            }
            if (prefs.autoVol !== undefined) {
                $('#checkVOL').prop('checked', prefs.autoVol);
            }
            if (prefs.walletCex !== undefined) {
                $('#checkWalletCEX').prop('checked', prefs.walletCex);
            }
            if (prefs.autoLevel !== undefined) {
                $('#autoVolToggle').prop('checked', prefs.autoLevel);
                // Show/hide level input based on toggle
                if (prefs.autoLevel) {
                    $('#autoVolLevelInput').show();
                } else {
                    $('#autoVolLevelInput').hide();
                }
            }
            if (prefs.autoLevelValue !== undefined) {
                $('#autoVolLevels').val(prefs.autoLevelValue);
            }

            // ✅ TRIGGER CHANGE EVENTS: Enforce mutually exclusive after restore
            // This ensures event handlers run and uncheck the other if needed
            if (prefs.autoVol) {
                $('#checkVOL').trigger('change');
            } else if (prefs.autoLevel) {
                $('#autoVolToggle').trigger('change');
            }

            const filterKey = (typeof getActiveFilterKey === 'function')
                ? getActiveFilterKey()
                : 'FILTER_MULTICHAIN';

            console.log(`[APP-INIT] ✅ Checkbox controls restored from ${filterKey}:`, prefs);
        } catch (e) {
            console.warn('[APP-INIT] Failed to restore checkbox settings:', e.message);
        }
    }, 100); // Delay 100ms untuk memastikan DOM sudah siap

    /**
     * --- Report Database Status (IndexedDB) ---
     * REFACTORED
     */
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

    /**
     * Initial header label + sync icon visibility based on URL mode
     */
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

    /**
     * URL-based mode switching (multichain vs per-chain)
     */
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

    /**
     * Build chain icon links based on CONFIG_CHAINS
     * @param {string} activeKey - The active chain key ('all' for multichain)
     */
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

    /**
     * Update toolbar indicators (multichain + per-chain) based on current FILTER_* run states
     */
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

});

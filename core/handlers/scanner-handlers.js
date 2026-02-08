/**
 * =================================================================================
 * SCANNER EVENT HANDLERS
 * =================================================================================
 *
 * This module contains all scanner-related event handlers including:
 * - Start/Stop scan buttons
 * - Reload button
 * - Auto-run toggle functionality
 * - Scan execution logic (single and multi-chain)
 *
 * Dependencies:
 * - jQuery
 * - window.App.Scanner (scanner module)
 * - getAppState, setAppState (state management)
 * - getFromLocalStorage (storage utilities)
 * - getAppMode, getTokensChain, getTokensMulti (data access)
 * - flattenDataKoin, loadKointoTable (data rendering)
 * - setScanUIGating (UI gating)
 * - toast notifications
 *
 * @module core/handlers/scanner-handlers
 */

(function () {
    'use strict';

    /**
     * Reload button handler
     * Per-tab reload: do NOT broadcast run=NO; only mark local flag
     */
    $("#reload").click(function () {
        try { sessionStorage.setItem('APP_FORCE_RUN_NO', '1'); } catch (_) { }
        try { location.reload(); } catch (_) { }
    });

    /**
     * Stop scan button handler
     */
    $("#stopSCAN").click(function () {
        if (window.App?.Scanner?.stopScanner) window.App.Scanner.stopScanner();
    });

    /**
     * Autorun toggle initialization and handler
     * Controlled by CONFIG_APP.APP.AUTORUN
     */
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

                // ✅ AUTO-SAVE: Save to per-chain filter storage
                try {
                    const isChecked = $(this).is(':checked');
                    if (typeof saveCheckboxPreference === 'function') {
                        saveCheckboxPreference('autoRun', isChecked);
                    }
                } catch (e) {
                    console.warn('[AUTO-SAVE] Failed to save autoRun:', e.message);
                }
            });
        }
    } catch (_) { }

    /**
     * Auto Volume toggle initialization and handler
     * Controlled by CONFIG_APP.APP.AUTO_VOLUME
     */
    try {
        const autoVolEnabled = (window.CONFIG_APP?.APP?.AUTO_VOLUME !== false);

        if (!autoVolEnabled) {
            $('#autoVolToggle').closest('label').hide();
            $('#autoVolLevelInput').hide();
        } else {
            $('#autoVolToggle').closest('label').show();

            // Toggle level input visibility
            $('#autoVolToggle').on('change', function () {
                const isChecked = $(this).is(':checked');
                $('#autoVolLevelInput').toggle(isChecked);

                // ✅ MUTUALLY EXCLUSIVE: Uncheck AUTO VOL when AUTO LEVEL is checked
                if (isChecked) {
                    $('#checkVOL').prop('checked', false);
                }

                // ✅ AUTO-SAVE: Save to per-chain filter storage
                try {
                    if (typeof saveCheckboxPreference === 'function') {
                        saveCheckboxPreference('autoLevel', isChecked);
                    }
                } catch (e) {
                    console.warn('[AUTO-SAVE] Failed to save autoLevel:', e.message);
                }
            });

            // Auto-save level value when changed
            $('#autoVolLevels').on('change', function () {
                try {
                    const value = parseInt($(this).val(), 10) || 1;
                    if (typeof saveCheckboxPreference === 'function') {
                        saveCheckboxPreference('autoLevelValue', value);
                    }
                } catch (e) {
                    console.warn('[AUTO-SAVE] Failed to save autoLevelValue:', e.message);
                }
            });
        }
    } catch (_) { }

    /**
     * Vol Check toggle initialization and handler
     * Controlled by CONFIG_APP.APP.VOL_CHECK
     */
    try {
        const volCheckEnabled = (window.CONFIG_APP?.APP?.VOL_CHECK !== false);

        if (!volCheckEnabled) {
            // Hide vol check UI elements when disabled in config
            $('#checkVOL').closest('label').hide();
            window.VOL_CHECK_ENABLED = false;
            window.VOL_CHECK_FEATURE_DISABLED = true;
        } else {
            // Show vol check UI elements when enabled
            $('#checkVOL').closest('label').show();
            window.VOL_CHECK_ENABLED = false;
            window.VOL_CHECK_FEATURE_DISABLED = false;

            // ✅ MUTUALLY EXCLUSIVE: Uncheck AUTO LEVEL when AUTO VOL is checked
            $('#checkVOL').on('change', function () {
                const isChecked = $(this).is(':checked');

                // Uncheck AUTO LEVEL if AUTO VOL is checked
                if (isChecked) {
                    $('#autoVolToggle').prop('checked', false);
                    $('#autoVolLevelInput').hide();
                }

                // ✅ AUTO-SAVE: Save to per-chain filter storage
                try {
                    if (typeof saveCheckboxPreference === 'function') {
                        saveCheckboxPreference('autoVol', isChecked);
                    }
                } catch (e) {
                    console.warn('[AUTO-SAVE] Failed to save autoVol:', e.message);
                }
            });
        }
    } catch (_) { }

    /**
     * Wallet CEX Check toggle - AUTO-SAVE
     */
    try {
        $('#checkWalletCEX').on('change', function () {
            try {
                const isChecked = $(this).is(':checked');
                if (typeof saveCheckboxPreference === 'function') {
                    saveCheckboxPreference('walletCex', isChecked);
                }
            } catch (e) {
                console.warn('[AUTO-SAVE] Failed to save walletCex:', e.message);
            }
        });
    } catch (_) { }

    /**
     * Start scan button handler
     * Handles both single-chain and multi-chain scanning
     */
    $("#startSCAN").click(function () {
        // Rebuild monitoring header to reflect current active DEXs before scanning
        try {
            const dexList = (window.computeActiveDexList ? window.computeActiveDexList() : Object.keys(window.CONFIG_DEXS || {}));
            if (window.renderMonitoringHeader) window.renderMonitoringHeader(dexList);
        } catch (_) { }

        // === GLOBAL SCAN LOCK CHECK ===
        try {
            const lockCheck = typeof checkCanStartScan === 'function' ? checkCanStartScan() : { canScan: true };

            if (!lockCheck.canScan) {
                // console.warn('[START BUTTON] Cannot start scan - locked by another tab:', lockCheck.lockInfo);

                // Show user-friendly notification
                if (typeof toast !== 'undefined' && toast.warning) {
                    const lockInfo = lockCheck.lockInfo || {};
                    const mode = lockInfo.mode || 'UNKNOWN';
                    const ageMin = Math.floor((lockInfo.age || 0) / 60000);
                    const ageSec = Math.floor(((lockInfo.age || 0) % 60000) / 1000);
                    const timeStr = ageMin > 0 ? `${ageMin}m ${ageSec}s` : `${ageSec}s`;

                    toast.warning(
                        `⚠️ SCAN SEDANG BERJALAN!\n\n` +
                        `Mode: ${mode}\n` +
                        `Durasi: ${timeStr}\n\n` +
                        `Tunggu scan selesai atau tutup tab lain yang sedang scanning.`,
                        { timeOut: 5000 }
                    );
                }

                return; // Exit early - don't start scan
            }
        } catch (e) {
            // console.error('[START BUTTON] Error checking global scan lock:', e);
            // On error checking lock, allow scan to proceed
        }

        // Prevent starting if app state indicates a run is already active (per-tab check)
        try {
            const stClick = getAppState();
            if (stClick && stClick.run === 'YES') {
                $('#startSCAN').prop('disabled', true).attr('aria-busy', 'true').text('Running...').addClass('uk-button-disabled');
                $('#stopSCAN').show().prop('disabled', false);
                try { if (typeof setScanUIGating === 'function') setScanUIGating(true); } catch (_) { }
                return; // do not start twice
            }
        } catch (_) { }

        const settings = getFromLocalStorage('SETTING_SCANNER', {}) || {};

        const mode = getAppMode();
        if (mode.type === 'single') {
            // Build flat tokens for the active chain and apply per‑chain filters (CEX ∩ PAIR)
            const chainKey = mode.chain;
            let tokens = getTokensChain(chainKey);
            let flatTokens = flattenDataKoin(tokens);

            try {
                const rawSaved = getFromLocalStorage(`FILTER_${String(chainKey).toUpperCase()}`, null);
                const filters = getFilterChain(chainKey);
                const selCex = (filters.cex || []).map(x => String(x).toUpperCase());
                const selPair = (filters.pair || []).map(x => String(x).toUpperCase());
                if (!rawSaved) {
                    // No saved filter yet: scan all tokens for this chain
                } else if (selCex.length > 0 && selPair.length > 0) {
                    flatTokens = flatTokens.filter(t => selCex.includes(String(t.cex).toUpperCase()));
                    flatTokens = flatTokens.filter(t => {
                        const chainCfg = CONFIG_CHAINS[(t.chain || '').toLowerCase()] || {};
                        const pairDefs = chainCfg.PAIRDEXS || {};
                        const p = String(t.symbol_out || '').toUpperCase();
                        const mapped = pairDefs[p] ? p : 'NON';
                        return selPair.includes(mapped);
                    });
                } else {
                    flatTokens = [];
                }
            } catch (_) { }

            // Apply single-chain sort preference to scanning order (from FILTER_<CHAIN>.sort)
            try {
                const rawSavedSort = getFromLocalStorage(`FILTER_${String(chainKey).toUpperCase()}`, null);
                const sortPref = (rawSavedSort && (rawSavedSort.sort === 'A' || rawSavedSort.sort === 'Z')) ? rawSavedSort.sort : 'A';
                flatTokens = flatTokens.sort((a, b) => {
                    const A = (a.symbol_in || '').toUpperCase();
                    const B = (b.symbol_in || '').toUpperCase();
                    if (A < B) return sortPref === 'A' ? -1 : 1;
                    if (A > B) return sortPref === 'A' ? 1 : -1;
                    return 0;
                });
            } catch (_) { }

            // If user searched, limit scan to visible (search-filtered) tokens
            try {
                const q = ($('#searchInput').val() || '').trim();
                if (q) {
                    const cand = Array.isArray(window.scanCandidateTokens) ? window.scanCandidateTokens : [];
                    flatTokens = cand;
                }
            } catch (_) { }

            if (!Array.isArray(flatTokens) || flatTokens.length === 0) {
                if (typeof toast !== 'undefined' && toast.info) toast.info('Tidak ada token pada filter per‑chain untuk dipindai.');
                return;
            }
            // Re-render monitoring table to initial state for these tokens
            try {
                loadKointoTable(flatTokens, 'dataTableBody');
                // console.log('[START] Table skeleton rendered, waiting for DOM to settle...');
            } catch (e) {
                // console.error('[START] Failed to render table:', e);
            }
            // Wait for DOM to settle before starting scanner (increased to 250ms for safety)
            setTimeout(() => {
                // console.log('[START] Starting scanner now...');
                if (window.App?.Scanner?.startScanner) window.App.Scanner.startScanner(flatTokens, settings, 'dataTableBody');
            }, 250);
            return;
        }

        // Multi‑chain: use visible (search-filtered) tokens if search active; else use the current list order (CHAIN ∩ CEX)
        let toScan = Array.isArray(window.currentListOrderMulti) ? window.currentListOrderMulti : (Array.isArray(filteredTokens) ? filteredTokens : []);
        try {
            const q = ($('#searchInput').val() || '').trim();
            if (q) {
                toScan = Array.isArray(window.scanCandidateTokens) ? window.scanCandidateTokens : [];
            }
        } catch (_) { }
        if (!Array.isArray(toScan) || toScan.length === 0) {
            if (typeof toast !== 'undefined' && toast.info) toast.info('Tidak ada token yang cocok dengan hasil pencarian/fitur filter untuk dipindai.');
            return;
        }
        // Re-render monitoring table to initial state for these tokens
        try {
            loadKointoTable(toScan, 'dataTableBody');
            // console.log('[START] Table skeleton rendered, waiting for DOM to settle...');
        } catch (e) {
            // console.error('[START] Failed to render table:', e);
        }
        // Wait for DOM to settle before starting scanner (increased to 250ms for safety)
        setTimeout(() => {
            // console.log('[START] Starting scanner now...');
            if (window.App?.Scanner?.startScanner) window.App.Scanner.startScanner(toScan, settings, 'dataTableBody');
        }, 250);
    });

})();

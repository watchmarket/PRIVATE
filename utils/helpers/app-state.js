// =================================================================================
// APP STATE AND MODE MANAGEMENT
// =================================================================================
/**
 * This module handles application mode detection, active token/filter key resolution,
 * and storage access helpers for the current mode (multi-chain or single-chain).
 *
 * Functions:
 * - getAppMode: Resolves application mode from URL query
 * - getActiveTokenKey: Returns the active token storage key based on mode
 * - getActiveFilterKey: Returns the active filter storage key based on mode
 * - getActiveTokens: Get tokens for active mode
 * - saveActiveTokens: Save tokens for active mode
 * - getActiveFilters: Get filters for active mode
 * - saveActiveFilters: Save filters for active mode
 */

(function() {
    'use strict';

    // =================================================================================
    // APP MODE & DATA ACCESS HELPERS (shared by UI/API/Main)
    // =================================================================================

    /**
     * Resolves application mode from URL query.
     * - multi:  index.html?chain=all   → { type: 'multi' }
     * - single: index.html?chain=bsc   → { type: 'single', chain: 'bsc' }
     * - cex:    index.html?cex=binance → { type: 'cex', cex: 'BINANCE' }
     */
    function getAppMode() {
        try {
            if (window.AppMode && window.AppMode._cached) return window.AppMode;
            const params = new URLSearchParams(window.location.search || '');
            const cexParam = (params.get('cex') || '').trim();
            const chainParam = (params.get('chain') || '').toLowerCase();
            let mode;
            if (cexParam) {
                // CEX mode: ?cex=binance
                mode = { type: 'cex', cex: cexParam.toUpperCase() };
            } else if (!chainParam || chainParam === 'all') {
                mode = { type: 'multi' };
            } else if (window.CONFIG_CHAINS && window.CONFIG_CHAINS[chainParam]) {
                mode = { type: 'single', chain: chainParam };
            } else {
                mode = { type: 'multi' };
            }
            window.AppMode = Object.assign({ _cached: true }, mode);
            return window.AppMode;
        } catch (_) {
            return { type: 'multi' };
        }
    }

    /** Returns the active token storage key based on mode. */
    function getActiveTokenKey() {
        const m = getAppMode();
        if (m.type === 'single') return `TOKEN_${String(m.chain).toUpperCase()}`;
        // CEX mode dan multi-chain sama-sama pakai TOKEN_MULTICHAIN
        return 'TOKEN_MULTICHAIN';
    }

    /**
     * Returns the active filter storage key based on mode.
     * - single: FILTER_BSC, FILTER_ETHEREUM, etc.
     * - multi:  FILTER_MULTICHAIN
     * - cex:    FILTER_CEX_BINANCE, FILTER_CEX_GATE, etc.
     */
    function getActiveFilterKey() {
        const m = getAppMode();
        if (m.type === 'single') return `FILTER_${String(m.chain).toUpperCase()}`;
        if (m.type === 'cex') return `FILTER_CEX_${String(m.cex).toUpperCase()}`;
        return 'FILTER_MULTICHAIN';
    }

    /** Get tokens for active mode. */
    function getActiveTokens(defaultVal = []) {
        return getFromLocalStorage(getActiveTokenKey(), defaultVal) || defaultVal;
    }

    /** Save tokens for active mode. */
    function saveActiveTokens(list) {
        return saveToLocalStorage(getActiveTokenKey(), Array.isArray(list) ? list : []);
    }

    /** Get filters for active mode. */
    function getActiveFilters(defaultVal = null) {
        return getFromLocalStorage(getActiveFilterKey(), defaultVal);
    }

    /** Save filters for active mode. */
    function saveActiveFilters(obj) {
        return saveToLocalStorage(getActiveFilterKey(), obj || {});
    }

    /** Invalidate cached AppMode (panggil saat URL berubah via pushState). */
    function invalidateAppModeCache() {
        window.AppMode = null;
    }

    // =================================================================================
    // EXPOSE TO GLOBAL SCOPE (window)
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.getAppMode = getAppMode;
        window.invalidateAppModeCache = invalidateAppModeCache;
        window.getActiveTokenKey = getActiveTokenKey;
        window.getActiveFilterKey = getActiveFilterKey;
        window.getActiveTokens = getActiveTokens;
        window.saveActiveTokens = saveActiveTokens;
        window.getActiveFilters = getActiveFilters;
        window.saveActiveFilters = saveActiveFilters;
    }

})(); // End IIFE

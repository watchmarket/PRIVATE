// =================================================================================
// FILTER MANAGEMENT
// =================================================================================
/**
 * This module handles filter state management for both multi-chain and single-chain modes.
 * Filters include chain selection, CEX selection, DEX selection, pair selection, and PNL thresholds.
 *
 * Functions:
 * - getPNLFilter: Get PNL filter value for active mode
 * - setPNLFilter: Set PNL filter value for active mode
 * - getFilterMulti: Get multi-chain filter settings
 * - setFilterMulti: Set multi-chain filter settings
 * - getFilterChain: Get single-chain filter settings
 * - setFilterChain: Set single-chain filter settings
 */

(function() {
    'use strict';

    // =================================================================================
    // MODULAR FILTER HELPERS (shared across app)
    // =================================================================================

    // PNL filter helpers per mode
    function getPNLFilter() {
        try {
            const f = getFromLocalStorage(getActiveFilterKey(), {}) || {};
            const v = parseFloat(f.pnl);
            return isFinite(v) && v >= 0 ? v : 0;
        } catch(_) { return 0; }
    }

    function setPNLFilter(value) {
        const v = parseFloat(value);
        const key = getActiveFilterKey();
        const f = getFromLocalStorage(key, {}) || {};
        f.pnl = isFinite(v) && v >= 0 ? v : 0;
        saveToLocalStorage(key, f);
    }

    function getFilterMulti() {
        const f = getFromLocalStorage('FILTER_MULTICHAIN', null);
        if (f && typeof f === 'object') return { chains: f.chains || [], cex: f.cex || [], dex: (f.dex || []).map(x => String(x).toLowerCase()) };
        return { chains: [], cex: [], dex: [] };
    }

    function setFilterMulti(val){
        // Merge with existing filter so other keys (e.g., sort, pnl) remain intact
        const prev = getFromLocalStorage('FILTER_MULTICHAIN', {}) || {};
        const next = { ...prev };
        if (val && Object.prototype.hasOwnProperty.call(val, 'chains')) {
            next.chains = (val.chains || []).map(x => String(x).toLowerCase());
        }
        if (val && Object.prototype.hasOwnProperty.call(val, 'cex')) {
            next.cex = (val.cex || []).map(x => String(x).toUpperCase());
        }
        if (val && Object.prototype.hasOwnProperty.call(val, 'dex')) {
            next.dex = (val.dex || []).map(x => String(x).toLowerCase());
        }
        saveToLocalStorage('FILTER_MULTICHAIN', next);
    }

    function getFilterChain(chain){
        const chainKey = String(chain).toLowerCase();
        const key = `FILTER_${String(chainKey).toUpperCase()}`;
        let f = getFromLocalStorage(key, null);
        if (!f || typeof f !== 'object'){
            // REFACTORED: no try/catch; use optional chaining
            const legacyName = (window.CONFIG_CHAINS?.[chainKey]?.Nama_Chain || '').toString().toUpperCase();
            if (legacyName) {
                const legacyKey = `FILTER_${legacyName}`;
                const lf = getFromLocalStorage(legacyKey, null);
                if (lf && typeof lf === 'object') {
                    saveToLocalStorage(key, lf);
                    f = lf;
                }
            }
        }
        if (f && typeof f==='object') return { cex: (f.cex||[]).map(String), pair: (f.pair||[]).map(x=>String(x).toUpperCase()), dex: (f.dex||[]).map(x=>String(x).toLowerCase()) };
        return { cex: [], pair: [], dex: [] };
    }

    function setFilterChain(chain, val){
        const key = `FILTER_${String(chain).toUpperCase()}`;
        const prev = getFromLocalStorage(key, {}) || {};
        const next = { ...prev };
        if (val && Object.prototype.hasOwnProperty.call(val, 'cex')) {
            next.cex = (val.cex || []).map(String);
        }
        if (val && Object.prototype.hasOwnProperty.call(val, 'pair')) {
            next.pair = (val.pair || []).map(x => String(x).toUpperCase());
        }
        if (val && Object.prototype.hasOwnProperty.call(val, 'dex')) {
            next.dex = (val.dex || []).map(x => String(x).toLowerCase());
        }
        saveToLocalStorage(key, next);
    }

    // =================================================================================
    // EXPOSE TO GLOBAL SCOPE (window)
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.getPNLFilter = getPNLFilter;
        window.setPNLFilter = setPNLFilter;
        window.getFilterMulti = getFilterMulti;
        window.setFilterMulti = setFilterMulti;
        window.getFilterChain = getFilterChain;
        window.setFilterChain = setFilterChain;
    }

})(); // End IIFE

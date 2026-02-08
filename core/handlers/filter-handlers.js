/**
 * =================================================================================
 * FILTER EVENT HANDLERS
 * =================================================================================
 *
 * This module contains all filter-related event handlers including:
 * - Chain/CEX/DEX filter checkboxes (multi-chain and single-chain)
 * - Filter chip toggling
 * - Sort order toggle (A-Z / Z-A)
 * - PNL filter input
 * - Search input (global filter card search)
 *
 * Dependencies:
 * - jQuery
 * - getFilterMulti, setFilterMulti (multi-chain filters)
 * - getFilterChain, setFilterChain (single-chain filters)
 * - refreshTokensTable, loadAndDisplaySingleChainTokens (table rendering)
 * - renderFilterCard, renderTokenManagementList (UI rendering)
 * - getPNLFilter, setPNLFilter (PNL filter utilities)
 * - debounce utility function
 * - toast notifications
 *
 * @module core/handlers/filter-handlers
 */

(function() {
    'use strict';

    /**
     * Sort toggle handler (A-Z / Z-A)
     * Persists sort preference per mode (FILTER_MULTICHAIN or FILTER_<CHAIN>)
     */
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
        } catch(_) {}
    });

    /**
     * PNL filter input handler
     * Persists PNL threshold per mode
     */
    $(document).on('change blur', '#pnlFilterInput', function(){
        const raw = $(this).val();
        const v = parseFloat(raw);
        const clean = isFinite(v) && v >= 0 ? v : 0;
        try {
            setPNLFilter(clean);
            $(this).val(clean);
            try { if (typeof toast !== 'undefined' && toast.info) toast.info(`PNL Filter diset: $${clean}`); } catch(_) {}
            // Clear previously displayed scan signal cards when PNL filter changes
            try { if (typeof window.clearSignalCards === 'function') window.clearSignalCards(); } catch(_) {}
        } catch(_) {}
    });

    /**
     * Global search handler (filter card)
     * Updates both monitoring and management views
     * Use event delegation since #searchInput is created dynamically
     */
    $(document).on('input', '#searchInput', debounce(function() {
        // Filter monitoring table: tampilkan semua data yang sesuai dengan filter dan pencarian
        const searchValue = ($(this).val() || '').toLowerCase();

        // Build filtered data based on search and current mode
        try {
            const mode = getAppMode();
            const q = searchValue;
            const pick = (t) => {
                try {
                    const chainKey = String(t.chain||'').toLowerCase();
                    const chainName = (window.CONFIG_CHAINS?.[chainKey]?.Nama_Chain || '').toString().toLowerCase();
                    const dexs = (t.dexs||[]).map(d => String(d.dex||'').toLowerCase()).join(' ');
                    const addresses = [t.sc_in, t.sc_out].map(x => String(x||'').toLowerCase()).join(' ');
                    return [t.symbol_in, t.symbol_out, t.cex, t.chain, chainName, dexs, addresses]
                        .filter(Boolean)
                        .map(s => String(s).toLowerCase())
                        .join(' ');
                } catch(_) { return ''; }
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
        } catch(_) {}

        // Re-render token management list to apply same query
        try { renderTokenManagementList(); } catch(_) {}
    }, 250));

    /**
     * Filter chip change handlers
     * These are delegated from the main deferredInit() function in main.js
     * They will be bound when renderFilterCard() is called from app initialization
     */

    // Multi-chain filter changes (CHAIN, CEX, DEX)
    // Handler is bound in deferredInit() with selector:
    // $wrap.off('change.multif').on('change.multif','label.fc-chain input, label.fc-cex input, label.fc-dex input',...)

    // Single-chain filter changes (CEX, PAIR, DEX)
    // Handler is bound in deferredInit() with selector:
    // $wrap.off('change.scf').on('change.scf','label.sc-cex input, label.sc-pair input, label.sc-dex input',...)

    // Filter color application handler (for checked checkboxes)
    // Handler is bound in applyFilterColors() with selector:
    // $('#filter-groups label input[type="checkbox"]').off('change.colorize').on('change.colorize', ...)

    /**
     * Clear filter card changes handler
     * Bersihkan konten kolom DEX saat ada perubahan filter (serupa perilaku saat START scan)
     */
    try {
        $(document).on('change input', '#filter-card input, #filter-card select', function(){
            try { resetDexCells('dataTableBody'); } catch(_) {}
        });
    } catch(_) {}

})();

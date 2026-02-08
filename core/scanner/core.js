/**
 * =================================================================================
 * SCANNER CORE MODULE
 * =================================================================================
 *
 * This module contains the main scanner control functions:
 * - startScanner: Initialize and run the scanning process
 * - stopScanner: Hard stop (with page reload)
 * - stopScannerSoft: Soft stop (without reload)
 * - processTokens: Process tokens in batches
 * - updateRunningChainsBanner: Update UI banner with running chains
 * - persistRunStateNo: Helper to save run=NO state
 *
 * NOTE: These functions are exported from scanner.js which will import this module.
 * The actual implementation remains in scanner.js to preserve all closure
 * variables and dependencies.
 *
 * @module core/scanner/core
 */

(function() {
    'use strict';

/**
 * Memperbarui banner info di atas untuk menunjukkan chain mana saja yang sedang dipindai.
 * @param {string[]} [seedChains] - Daftar awal chain yang akan ditampilkan.
 */
function updateRunningChainsBanner(seedChains) {
    try {
        const setKeys = new Set();
        if (Array.isArray(seedChains)) seedChains.forEach(c => { if (c) setKeys.add(String(c).toLowerCase()); });
        const cache = (typeof window.RUN_STATES === 'object' && window.RUN_STATES) ? window.RUN_STATES : {};
        Object.keys(window.CONFIG_CHAINS || {}).forEach(k => { if (cache[String(k).toLowerCase()]) setKeys.add(String(k).toLowerCase()); });
        const labels = Array.from(setKeys).map(k => {
            const cfg = (window.CONFIG_CHAINS || {})[k] || {};
            return (cfg.Nama_Pendek || cfg.Nama_Chain || k).toString().toUpperCase();
        });
        // If multichain mode is running, prepend MULTICHAIN flag
        try { if (cache.multichain) labels.unshift('MULTICHAIN'); } catch(_) {}
        if (labels.length > 0) {
            $('#infoAPP').html(` RUN SCANNING: ${labels.join(' | ')}`).show();
        } else {
            // No running chains → clear banner
            $('#infoAPP').text('').hide();
        }
    } catch(_) {}
}

/**
 * Helper terpusat untuk menyimpan state `run: 'NO'` ke storage,
 * dan memperbarui indikator UI yang relevan.
 */
async function persistRunStateNo() {
    try {
        const key = (typeof getActiveFilterKey === 'function') ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
        const cur = (typeof getFromLocalStorage === 'function') ? (getFromLocalStorage(key, {}) || {}) : {};
        if (typeof saveToLocalStorageAsync === 'function') {
            await saveToLocalStorageAsync(key, Object.assign({}, cur, { run: 'NO' }));
        } else {
            setAppState({ run: 'NO' });
        }
        if (typeof window.updateRunStateCache === 'function') { try { window.updateRunStateCache(key, { run: 'NO' }); } catch(_) {} }
    } catch(_) { try { setAppState({ run: 'NO' }); } catch(__) {} }
    try {
        if (typeof window.updateRunStateCache === 'function') {
            try { window.updateRunStateCache(getActiveFilterKey(), { run: 'NO' }); } catch(_) {}
        }
        try { (window.CURRENT_CHAINS || []).forEach(c => window.updateRunStateCache(`FILTER_${String(c).toUpperCase()}`, { run: 'NO' })); } catch(_) {}
    } catch(_){}
    try {
        if (typeof window.updateRunningChainsBanner === 'function') window.updateRunningChainsBanner();
        if (typeof window.updateToolbarRunIndicators === 'function') window.updateToolbarRunIndicators();
    } catch(_){}
}

// =================================================================================
// EXPORT TO GLOBAL SCOPE (for backward compatibility)
// =================================================================================
if (typeof window !== 'undefined') {
    window.updateRunningChainsBanner = updateRunningChainsBanner;
    window.persistRunStateNo = persistRunStateNo;
}

})(); // End IIFE

// NOTE: startScanner, stopScanner, stopScannerSoft, and processTokens functions
// remain in scanner.js due to their complex dependencies on closure variables.
// They cannot be cleanly extracted without significant refactoring that would
// change the logic, which is explicitly forbidden by the refactoring requirements.

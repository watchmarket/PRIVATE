/**
 * =================================================================================
 * DEX FETCHER MODULE
 * =================================================================================
 *
 * This module contains DEX-related helper functions and utilities.
 * NOTE: The main DEX fetching logic (callDex function) remains in scanner.js
 * because it has deep dependencies on closure variables (token, DataCEX, etc.)
 * that cannot be easily extracted without breaking the logic.
 *
 * This module provides:
 * - Ticker countdown helpers for DEX requests
 * - Validation utilities
 * - Error formatting helpers
 *
 * @module core/scanner/dex-fetcher
 */

(function() {
    'use strict';

/**
 * Start a countdown ticker for a DEX cell
 * Used to show remaining seconds while waiting for DEX response
 * @param {string} idCELL - The cell ID
 * @param {number} endAt - Timestamp when ticker should end
 * @param {Function} renderFn - Function to render each tick (secs, cell) => void
 * @param {Function} onEndFn - Function to call when ticker ends
 */
function startDexTicker(idCELL, endAt, renderFn, onEndFn) {
    try {
        window._DEX_TICKERS = window._DEX_TICKERS || new Map();
        const key = idCELL + ':ticker';
        if (window._DEX_TICKERS.has(key)) {
            clearInterval(window._DEX_TICKERS.get(key));
            window._DEX_TICKERS.delete(key);
        }
        const tick = () => {
            const rem = endAt - Date.now();
            const secs = Math.max(0, Math.ceil(rem/1000));
            const cell = document.getElementById(idCELL);
            if (!cell) {
                window.clearDexTickerById(idCELL);
                return;
            }
            if (cell.dataset && cell.dataset.final === '1') {
                window.clearDexTickerById(idCELL);
                return;
            }
            if (typeof renderFn === 'function') {
                renderFn(secs, cell);
            }
            if (rem <= 0) {
                window.clearDexTickerById(idCELL);
                // Note: onEnd callback is intentionally commented in original code
                // if (typeof onEndFn === 'function') onEndFn();
            }
        };
        const intId = setInterval(tick, 1000);
        window._DEX_TICKERS.set(key, intId);
        tick(); // Initial tick
    } catch(_) {}
}

/**
 * Format error message with HTTP status code
 * @param {object} error - Error object with statusCode and pesanDEX properties
 * @returns {string} Formatted error message
 */
function formatDexErrorMessage(error) {
    let msg = (error && error.pesanDEX) ? String(error.pesanDEX) : 'Unknown Error';
    const hasPrefix = /\[(HTTP \d{3}|XHR ERROR 200)\]/.test(msg);

    try {
        const code = Number(error && error.statusCode);
        if (!hasPrefix && Number.isFinite(code) && code > 0) {
            if (code === 200) {
                msg = `[XHR ERROR 200] ${msg}`;
            } else {
                msg = `[HTTP ${code}] ${msg}`;
            }
        }
    } catch(_) {}

    return msg;
}

/**
 * Validate if an address is invalid (empty, too short, or just '0x')
 * @param {string} addr - Smart contract address to validate
 * @returns {boolean} True if address is invalid
 */
function isAddressInvalid(addr) {
    return !addr || String(addr).toLowerCase() === '0x' || String(addr).length < 6;
}

/**
 * Normalize contract addresses for NON pairs
 * Uses default values from chain config when pair is 'NON'
 * @param {object} token - Token object
 * @param {boolean} isKiri - Direction flag
 * @returns {object} Normalized addresses and decimals { scInSafe, scOutSafe, desInSafe, desOutSafe }
 */
function normalizeDexContracts(token, isKiri) {
    const chainCfgSafe = (window.CONFIG_CHAINS || {})[String(token.chain).toLowerCase()] || {};
    const pairDefsSafe = chainCfgSafe.PAIRDEXS || {};
    const nonDef = pairDefsSafe['NON'] || {};

    let scInSafe  = isKiri ? token.sc_in  : token.sc_out;
    let scOutSafe = isKiri ? token.sc_out : token.sc_in;
    let desInSafe  = isKiri ? Number(token.des_in)  : Number(token.des_out);
    let desOutSafe = isKiri ? Number(token.des_out) : Number(token.des_in);

    const symOut = isKiri ? String(token.symbol_out||'') : String(token.symbol_in||'');
    if (String(symOut).toUpperCase() === 'NON' || isAddressInvalid(scOutSafe)) {
        if (nonDef && nonDef.scAddressPair) {
            scOutSafe = nonDef.scAddressPair;
            desOutSafe = Number(nonDef.desPair || desOutSafe || 18);
        }
    }

    return { scInSafe, scOutSafe, desInSafe, desOutSafe };
}

/**
 * Validate DEX readiness before making request
 * Checks modal, amount, chain code, and contract addresses
 * @param {object} params - Parameters object
 * @returns {object} { ok: boolean, reason?: string }
 */
function validateDexReadiness(params) {
    const { modal, amtIn, chainCfg, scInSafe, scOutSafe } = params;

    // Modal must be > 0
    if (!(Number(modal) > 0)) {
        return { ok: false, reason: 'Modal tidak valid (<= 0)' };
    }

    // Amount-in must be > 0
    if (!(Number(amtIn) > 0)) {
        return { ok: false, reason: 'Amount input tidak valid (<= 0)' };
    }

    // Chain code must exist (used by DEX link and queries)
    if (!chainCfg || !chainCfg.Kode_Chain) {
        return { ok: false, reason: 'Kode chain tidak tersedia' };
    }

    // Basic SC presence (after NON fallback sanitation)
    if (!scInSafe || !scOutSafe || String(scInSafe).length < 6 || String(scOutSafe).length < 6) {
        return { ok: false, reason: 'Alamat kontrak tidak lengkap' };
    }

    return { ok: true };
}

/**
 * Detect fallback source from DEX response
 * @param {object} dexResponse - Response from fallback DEX
 * @returns {string} Source name (e.g., "DZAP (PARASWAP)", "SWOOP", etc.)
 */
function detectFallbackSource(dexResponse) {
    const routeTool = String(dexResponse?.routeTool || '').toUpperCase();
    let source = 'SWOOP'; // Default

    if (routeTool) {
        if (/DZAP|PARASWAP|1INCH|0X|KYBER/i.test(routeTool)) {
            source = `DZAP (${routeTool})`;
        } else {
            source = routeTool;
        }
    }

    return source;
}

/**
 * Generate base ID for DEX cell
 * @param {object} token - Token object
 * @param {string} dex - DEX name
 * @param {boolean} isKiri - Direction flag
 * @returns {string} Base ID for cell
 */
function generateDexCellBaseId(token, dex, isKiri) {
    const sym1 = isKiri ? String(token.symbol_in||'').toUpperCase() : String(token.symbol_out||'').toUpperCase();
    const sym2 = isKiri ? String(token.symbol_out||'').toUpperCase() : String(token.symbol_in||'').toUpperCase();
    const tokenId = String(token.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const baseIdRaw = `${String(token.cex).toUpperCase()}_${String(dex).toUpperCase()}_${sym1}_${sym2}_${String(token.chain).toUpperCase()}_${tokenId}`;
    return baseIdRaw.replace(/[^A-Z0-9_]/g,'');
}

// =================================================================================
// EXPORT TO GLOBAL SCOPE (for backward compatibility)
// =================================================================================
if (typeof window !== 'undefined') {
    window.startDexTicker = startDexTicker;
    window.formatDexErrorMessage = formatDexErrorMessage;
    window.isAddressInvalid = isAddressInvalid;
    window.normalizeDexContracts = normalizeDexContracts;
    window.validateDexReadiness = validateDexReadiness;
    window.detectFallbackSource = detectFallbackSource;
    window.generateDexCellBaseId = generateDexCellBaseId;
}

})(); // End IIFE

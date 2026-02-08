/**
 * =================================================================================
 * CEX FETCHER MODULE
 * =================================================================================
 *
 * This module handles all CEX (Centralized Exchange) price fetching operations:
 * - Fetching orderbook data from CEX with retry mechanism
 * - Validating CEX price data
 * - Error handling for CEX requests
 *
 * @module core/scanner/cex-fetcher
 */

(function() {
    'use strict';

/**
 * Mengambil data order book dari CEX dengan mekanisme coba ulang (retry).
 * @param {object} token - Objek data token.
 * @param {string} tableBodyId - ID dari tbody tabel.
 * @param {object} options - Opsi tambahan (maxAttempts, delayMs).
 * @returns {Promise<{ok: boolean, data: object|null, error: any}>} Hasil fetch.
 */
async function fetchCEXWithRetry(token, tableBodyId, options = {}) {
    const maxAttempts = Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : 3;
    const delayMs = Number(options.delayMs) >= 0 ? Number(options.delayMs) : 400;
    let attempts = 0;
    let lastError = null;
    let lastData = null;

    while (attempts < maxAttempts) {
        // Coba panggil getPriceCEX.
        try {
            const data = await getPriceCEX(token, token.symbol_in, token.symbol_out, token.cex, tableBodyId);
            lastData = data;
            const prices = [
                data?.priceBuyToken,
                data?.priceSellToken,
                data?.priceBuyPair,
                data?.priceSellPair
            ];
            // Validasi bahwa semua harga yang dibutuhkan adalah angka positif.
            const valid = prices.every(p => Number.isFinite(p) && Number(p) > 0);
            if (valid) {
                return { ok: true, data };
            }
            lastError = 'Harga CEX tidak lengkap';
        } catch (error) {
            lastError = error;
        }
        // Jika gagal, tunggu sebentar sebelum mencoba lagi.
        attempts += 1;
        if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    return { ok: false, data: lastData, error: lastError };
}

// =================================================================================
// EXPORT TO GLOBAL SCOPE (for backward compatibility)
// =================================================================================
if (typeof window !== 'undefined') {
    window.fetchCEXWithRetry = fetchCEXWithRetry;
}

})(); // End IIFE

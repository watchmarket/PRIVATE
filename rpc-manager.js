// =================================================================================
// RPC MANAGER - Single Source of Truth: CONFIG_CHAINS.DEFAULT_RPC + FALLBACK_RPCS
// =================================================================================
// Primary RPC: CONFIG_CHAINS[chain].DEFAULT_RPC
// Fallback RPCs: CONFIG_CHAINS[chain].FALLBACK_RPCS (array, e.g. Brave wallet nodes)
//
// Auto-rotation: jika primary gagal, getRPC() otomatis geser ke fallback berikutnya.
// Caller melapor kegagalan via reportRPCFailure(chainKey, failedUrl).
// =================================================================================

(function() {
    'use strict';

    // In-memory index aktif per chain: { bsc: 0, ethereum: 1, ... }
    const _activeIndex = {};

    /**
     * Ambil pool RPC untuk sebuah chain: [DEFAULT_RPC, ...FALLBACK_RPCS]
     * @param {string} chainKey
     * @returns {string[]}
     */
    function getRPCPool(chainKey) {
        try {
            const chainLower = String(chainKey || '').toLowerCase();
            const cfg = (typeof window !== 'undefined' && window.CONFIG_CHAINS)
                ? window.CONFIG_CHAINS[chainLower]
                : null;
            if (!cfg) return [];

            const primary = typeof cfg.DEFAULT_RPC === 'string' && cfg.DEFAULT_RPC.trim()
                ? [cfg.DEFAULT_RPC.trim()]
                : [];
            const fallbacks = Array.isArray(cfg.FALLBACK_RPCS)
                ? cfg.FALLBACK_RPCS.filter(u => typeof u === 'string' && u.trim())
                : [];
            return [...primary, ...fallbacks];
        } catch (e) {
            return [];
        }
    }

    /**
     * Get RPC URL aktif untuk sebuah chain.
     * Dimulai dari DEFAULT_RPC; geser ke fallback jika reportRPCFailure dipanggil.
     * @param {string} chainKey
     * @returns {string|null}
     */
    function getRPC(chainKey) {
        try {
            const chainLower = String(chainKey || '').toLowerCase();
            if (!chainLower) return null;

            const pool = getRPCPool(chainLower);
            if (!pool.length) {
                console.error(`[RPC Manager] No RPC configured for chain: ${chainKey}`);
                return null;
            }

            const idx = _activeIndex[chainLower] ?? 0;
            return pool[Math.min(idx, pool.length - 1)];
        } catch (e) {
            console.error('[RPC Manager] Error in getRPC:', e);
            return null;
        }
    }

    /**
     * Laporkan RPC gagal — geser index aktif ke fallback berikutnya.
     * @param {string} chainKey
     * @param {string} failedUrl - URL yang gagal (untuk verifikasi)
     * @returns {string|null} URL fallback berikutnya, atau null jika habis
     */
    function reportRPCFailure(chainKey, failedUrl) {
        try {
            const chainLower = String(chainKey || '').toLowerCase();
            const pool = getRPCPool(chainLower);
            if (!pool.length) return null;

            const currentIdx = _activeIndex[chainLower] ?? 0;
            // Pastikan yang dilaporkan gagal memang yang aktif saat ini
            if (pool[currentIdx] === failedUrl || !failedUrl) {
                const nextIdx = currentIdx + 1;
                if (nextIdx < pool.length) {
                    _activeIndex[chainLower] = nextIdx;
                    const nextUrl = pool[nextIdx];
                    console.warn(`[RPC Manager] ${chainKey}: primary gagal → fallback ke ${nextUrl}`);
                    return nextUrl;
                } else {
                    console.error(`[RPC Manager] ${chainKey}: semua RPC habis (${pool.length} endpoint)`);
                    return null;
                }
            }
            return getRPC(chainLower);
        } catch (e) {
            return null;
        }
    }

    /**
     * Reset index aktif ke primary (DEFAULT_RPC) untuk sebuah chain.
     * @param {string} chainKey
     */
    function resetRPC(chainKey) {
        const chainLower = String(chainKey || '').toLowerCase();
        delete _activeIndex[chainLower];
    }

    /**
     * Get semua RPC aktif (satu per chain).
     * @returns {Object} { chainKey: rpcUrl }
     */
    function getAllRPCs() {
        try {
            const chains = (window.CONFIG_CHAINS || {});
            const result = {};
            Object.keys(chains).forEach(key => {
                const url = getRPC(key);
                if (url) result[key.toLowerCase()] = url;
            });
            return result;
        } catch (e) {
            return {};
        }
    }

    /**
     * Check apakah RPC tersedia untuk chain tertentu.
     * @param {string} chainKey
     * @returns {boolean}
     */
    function hasRPC(chainKey) {
        return !!getRPC(chainKey);
    }

    // Alias backward compat
    const getRPCWithFallback = getRPC;

    // ====================
    // EXPORT PUBLIC API
    // ====================
    const RPCManager = { getRPC, getRPCPool, reportRPCFailure, resetRPC, getAllRPCs, hasRPC, getRPCWithFallback };

    if (typeof window !== 'undefined') {
        window.RPCManager = RPCManager;
    }

    console.log('[RPC Manager] ✅ Initialized — primary: CONFIG_CHAINS.DEFAULT_RPC + FALLBACK_RPCS');

})();

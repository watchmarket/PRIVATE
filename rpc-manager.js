// =================================================================================
// RPC MANAGER - Single Source of Truth: CONFIG_CHAINS.DEFAULT_RPC
// =================================================================================
// RPC tidak lagi dikonfigurasi oleh user.
// Sumber kebenaran tunggal ada di config.js → CONFIG_CHAINS[chain].DEFAULT_RPC
// User tidak perlu dan tidak bisa mengubah RPC dari form settings.
// =================================================================================

(function() {
    'use strict';

    /**
     * Get RPC URL for a chain — langsung dari CONFIG_CHAINS.DEFAULT_RPC (config.js)
     * @param {string} chainKey - Chain identifier (e.g., 'bsc', 'ethereum')
     * @returns {string|null}
     */
    function getRPC(chainKey) {
        try {
            const chainLower = String(chainKey || '').toLowerCase();
            if (!chainLower) return null;

            const cfg = (typeof window !== 'undefined' && window.CONFIG_CHAINS)
                ? window.CONFIG_CHAINS[chainLower]
                : null;

            if (cfg && typeof cfg.DEFAULT_RPC === 'string' && cfg.DEFAULT_RPC.trim()) {
                return cfg.DEFAULT_RPC.trim();
            }

            console.error(`[RPC Manager] No DEFAULT_RPC found in CONFIG_CHAINS for chain: ${chainKey}`);
            return null;
        } catch (e) {
            console.error('[RPC Manager] Error in getRPC:', e);
            return null;
        }
    }

    /**
     * Get all RPCs — baca semua DEFAULT_RPC dari CONFIG_CHAINS
     * @returns {Object} { chainKey: rpcUrl }
     */
    function getAllRPCs() {
        try {
            const chains = (window.CONFIG_CHAINS || {});
            const result = {};
            Object.entries(chains).forEach(([key, cfg]) => {
                if (cfg && typeof cfg.DEFAULT_RPC === 'string' && cfg.DEFAULT_RPC.trim()) {
                    result[key.toLowerCase()] = cfg.DEFAULT_RPC.trim();
                }
            });
            return result;
        } catch (e) {
            return {};
        }
    }

    /**
     * Check if RPC is configured for a chain
     * @param {string} chainKey
     * @returns {boolean}
     */
    function hasRPC(chainKey) {
        return !!getRPC(chainKey);
    }

    // Alias untuk kompatibilitas backward
    const getRPCWithFallback = getRPC;

    // ====================
    // EXPORT PUBLIC API
    // ====================
    const RPCManager = { getRPC, getAllRPCs, hasRPC, getRPCWithFallback };

    if (typeof window !== 'undefined') {
        window.RPCManager = RPCManager;
    }

    console.log('[RPC Manager] ✅ Initialized — RPC source: CONFIG_CHAINS.DEFAULT_RPC (config.js)');

})();

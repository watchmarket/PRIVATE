// =================================================================================
// RPC DATABASE MIGRATOR - STUB (Tidak Aktif)
// =================================================================================
// File ini dipertahankan agar tidak error jika masih di-load di HTML,
// namun tidak memiliki logika apapun.
//
// RPC sekarang diambil langsung dari CONFIG_CHAINS.DEFAULT_RPC (config.js)
// melalui RPCManager.getRPC(chainKey).
// Tidak ada userRPCs di localStorage, tidak ada form input RPC di settings.
// =================================================================================

(function() {
    'use strict';

    const RPCDatabaseMigrator = {
        // Stub: tidak melakukan apapun
        initializeRPCDatabase: async function() { return true; },
        getRPCFromDatabase: function(chainKey) {
            // Redirect ke RPCManager (config.js)
            if (typeof window !== 'undefined' && window.RPCManager) {
                return window.RPCManager.getRPC(chainKey);
            }
            return null;
        },
        updateRPCInDatabase: function() { return false; }, // no-op
        getAllRPCsFromDatabase: function() { return {}; },  // no-op
        resetRPCToDefault: function() { return false; },    // no-op
        get INITIAL_RPC_VALUES() {
            // Backward compat: baca dari CONFIG_CHAINS.DEFAULT_RPC
            try {
                const chains = (window.CONFIG_CHAINS || {});
                const result = {};
                Object.entries(chains).forEach(([k, cfg]) => {
                    if (cfg?.DEFAULT_RPC) result[k.toLowerCase()] = cfg.DEFAULT_RPC;
                });
                return result;
            } catch (_) { return {}; }
        }
    };

    if (typeof window !== 'undefined') {
        window.RPCDatabaseMigrator = RPCDatabaseMigrator;
    }

    console.log('[RPC Database Migrator] ℹ️ Stub — RPC source moved to CONFIG_CHAINS.DEFAULT_RPC');

})();

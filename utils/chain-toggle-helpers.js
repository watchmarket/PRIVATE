/**
 * Chain Toggle Helper Functions
 * =============================
 * Manages enabled/disabled state for blockchain chains.
 * Similar to cex-helpers.js, this module provides utilities to:
 * - Get list of enabled chains
 * - Check if a specific chain is enabled
 * - Save enabled chains to storage
 * 
 * Storage Key: ENABLED_CHAINS
 * Default: Empty array (opt-in model)
 */

(function (window) {
    'use strict';

    /**
     * Get the list of enabled chain keys from storage.
     * @returns {string[]} Array of enabled chain keys (lowercase: ['bsc', 'ethereum', 'solana'])
     */
    function getEnabledChains() {
        try {
            const enabledChains = getFromLocalStorage('ENABLED_CHAINS', null);

            // If no setting exists or invalid, return empty array (opt-in default)
            if (!enabledChains || !Array.isArray(enabledChains)) {
                console.log('[CHAIN] No enabled chains found, returning empty array (opt-in default)');
                return [];
            }

            // Filter to only return chains that exist in CONFIG_CHAINS
            const validChains = enabledChains.filter(chain => {
                const chainExists = window.CONFIG_CHAINS && window.CONFIG_CHAINS[chain];
                if (!chainExists) {
                    console.warn(`[CHAIN] Chain "${chain}" is enabled but not found in CONFIG_CHAINS`);
                }
                return chainExists;
            });

            console.log('[CHAIN] Enabled chains:', validChains);
            return validChains;
        } catch (error) {
            console.error('[CHAIN] Error getting enabled chains:', error);
            return [];
        }
    }

    /**
     * Check if a specific chain is enabled.
     * @param {string} chainKey - The chain key to check (e.g., 'bsc', 'ethereum')
     * @returns {boolean} True if the chain is enabled, false otherwise
     */
    function isChainEnabled(chainKey) {
        if (!chainKey) {
            console.warn('[CHAIN] isChainEnabled called with empty chainKey');
            return false;
        }

        const enabledChains = getEnabledChains();
        const keyLower = String(chainKey).toLowerCase();
        const isEnabled = enabledChains.includes(keyLower);

        // console.log(`[CHAIN] isChainEnabled("${keyLower}"): ${isEnabled}`);
        return isEnabled;
    }

    /**
     * Save the list of enabled chain keys to storage.
     * @param {string[]} enabledChains - Array of chain keys to enable
     */
    function saveEnabledChains(enabledChains) {
        try {
            if (!Array.isArray(enabledChains)) {
                console.error('[CHAIN] Invalid enabled chains list - must be an array');
                return;
            }

            // Normalize to lowercase and filter to only valid chains
            const normalizedChains = enabledChains
                .map(chain => String(chain).toLowerCase())
                .filter(chain => {
                    const exists = window.CONFIG_CHAINS && window.CONFIG_CHAINS[chain];
                    if (!exists) {
                        console.warn(`[CHAIN] Attempted to enable invalid chain: "${chain}"`);
                    }
                    return exists;
                });

            saveToLocalStorage('ENABLED_CHAINS', normalizedChains);
            console.log('[CHAIN] Saved enabled chains:', normalizedChains);
        } catch (error) {
            console.error('[CHAIN] Error saving enabled chains:', error);
        }
    }

    // Expose functions globally
    window.getEnabledChains = getEnabledChains;
    window.isChainEnabled = isChainEnabled;
    window.saveEnabledChains = saveEnabledChains;

    console.log('[CHAIN] Chain toggle helper functions loaded');

})(window);

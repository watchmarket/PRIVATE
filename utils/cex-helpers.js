/**
 * CEX Helper Functions
 * Manages enabled/disabled state of CEXs across the application
 */

/**
 * Get list of enabled CEXs from user settings
 * @returns {Array<string>} Array of enabled CEX keys (uppercase)
 */
function getEnabledCEXs() {
    try {
        // Get enabled CEXs from IndexedDB
        const enabledCEXs = getFromLocalStorage('ENABLED_CEXS', null);

        // If no saved settings, default to empty array (user must explicitly opt-in)
        if (!enabledCEXs || !Array.isArray(enabledCEXs)) {
            return [];
        }

        // Filter out invalid CEX keys (in case CONFIG_CEX changed)
        const validCEXs = enabledCEXs.filter(cex => window.CONFIG_CEX && window.CONFIG_CEX[cex]);

        return validCEXs;
    } catch (error) {
        console.error('[CEX] Error getting enabled CEXs:', error);
        return [];
    }
}

/**
 * Check if a specific CEX is enabled
 * @param {string} cexKey - CEX key (uppercase, e.g., 'BINANCE')
 * @returns {boolean} True if the CEX is enabled
 */
function isCEXEnabled(cexKey) {
    const enabled = getEnabledCEXs();
    return enabled.includes(String(cexKey).toUpperCase());
}

/**
 * Save enabled CEXs to storage
 * @param {Array<string>} enabledCEXs - Array of enabled CEX keys
 */
function saveEnabledCEXs(enabledCEXs) {
    try {
        // Validate input
        if (!Array.isArray(enabledCEXs)) {
            console.error('[CEX] Invalid enabled CEXs list');
            return;
        }

        // Filter to only valid CEX keys
        const validCEXs = enabledCEXs.filter(cex => window.CONFIG_CEX && window.CONFIG_CEX[cex]);

        saveToLocalStorage('ENABLED_CEXS', validCEXs);
        console.log('[CEX] Saved enabled CEXs:', validCEXs);
    } catch (error) {
        console.error('[CEX] Error saving enabled CEXs:', error);
    }
}

// Expose globally
if (typeof window !== 'undefined') {
    window.getEnabledCEXs = getEnabledCEXs;
    window.isCEXEnabled = isCEXEnabled;
    window.saveEnabledCEXs = saveEnabledCEXs;
}

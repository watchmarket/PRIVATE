/**
 * =================================================================================
 * CHECKBOX PREFERENCES UTILITIES
 * =================================================================================
 * 
 * Helper functions for managing per-chain checkbox preferences.
 * Preferences are stored in FILTER_<CHAIN> instead of global SETTING_SCANNER.
 * 
 * Dependencies:
 * - getActiveFilterKey() - Get current active filter key
 * - getFromLocalStorage() - Read from IndexedDB
 * - saveToLocalStorage() - Write to IndexedDB
 * 
 * @module utils/checkbox-preferences
 */

(function () {
    'use strict';

    /**
     * Get checkbox preferences for current active filter
     * @returns {Object} Checkbox preferences
     */
    function getCheckboxPreferences() {
        try {
            const filterKey = (typeof getActiveFilterKey === 'function')
                ? getActiveFilterKey()
                : 'FILTER_MULTICHAIN';

            const filter = (typeof getFromLocalStorage === 'function')
                ? getFromLocalStorage(filterKey, {})
                : {};

            return {
                autoScroll: filter.autoScroll || false,
                autoRun: filter.autoRun || false,
                autoVol: filter.autoVol || false,
                walletCex: filter.walletCex || false,
                autoLevel: filter.autoLevel || false,
                autoLevelValue: filter.autoLevelValue || 1
            };
        } catch (e) {
            console.warn('[CHECKBOX-PREFS] Failed to get preferences:', e.message);
            return {
                autoScroll: false,
                autoRun: false,
                autoVol: false,
                walletCex: false,
                autoLevel: false,
                autoLevelValue: 1
            };
        }
    }

    /**
     * Save checkbox preference for current active filter
     * @param {string} key - Preference key (e.g., 'autoVol')
     * @param {*} value - Preference value
     */
    function saveCheckboxPreference(key, value) {
        try {
            const filterKey = (typeof getActiveFilterKey === 'function')
                ? getActiveFilterKey()
                : 'FILTER_MULTICHAIN';

            const filter = (typeof getFromLocalStorage === 'function')
                ? getFromLocalStorage(filterKey, {})
                : {};

            filter[key] = value;

            if (typeof saveToLocalStorage === 'function') {
                saveToLocalStorage(filterKey, filter);
                console.log(`[CHECKBOX-PREFS] Saved ${key}=${value} to ${filterKey}`);
            }
        } catch (e) {
            console.warn('[CHECKBOX-PREFS] Failed to save preference:', e.message);
        }
    }

    /**
     * Migrate old checkbox preferences from SETTING_SCANNER to all FILTER_* keys
     * This is a one-time migration that runs on first load
     */
    function migrateCheckboxPreferences() {
        try {
            const oldSettings = (typeof getFromLocalStorage === 'function')
                ? getFromLocalStorage('SETTING_SCANNER', {})
                : {};

            // Check if migration is needed
            const needsMigration = (
                oldSettings.autoScroll !== undefined ||
                oldSettings.autoRun !== undefined ||
                oldSettings.autoVol !== undefined ||
                oldSettings.walletCex !== undefined ||
                oldSettings.autoLevel !== undefined ||
                oldSettings.autoLevelValue !== undefined
            );

            if (!needsMigration) {
                console.log('[CHECKBOX-PREFS] No migration needed');
                return;
            }

            console.log('[CHECKBOX-PREFS] Migrating old preferences to per-chain storage...');

            // Migrate to FILTER_MULTICHAIN
            const filterKeys = ['FILTER_MULTICHAIN'];

            // Add all chain filters
            if (typeof CONFIG_CHAINS !== 'undefined') {
                Object.keys(CONFIG_CHAINS).forEach(chain => {
                    filterKeys.push(`FILTER_${String(chain).toUpperCase()}`);
                });
            }

            // Copy preferences to all filters
            filterKeys.forEach(filterKey => {
                const filter = (typeof getFromLocalStorage === 'function')
                    ? getFromLocalStorage(filterKey, {})
                    : {};

                if (oldSettings.autoScroll !== undefined) filter.autoScroll = oldSettings.autoScroll;
                if (oldSettings.autoRun !== undefined) filter.autoRun = oldSettings.autoRun;
                if (oldSettings.autoVol !== undefined) filter.autoVol = oldSettings.autoVol;
                if (oldSettings.walletCex !== undefined) filter.walletCex = oldSettings.walletCex;
                if (oldSettings.autoLevel !== undefined) filter.autoLevel = oldSettings.autoLevel;
                if (oldSettings.autoLevelValue !== undefined) filter.autoLevelValue = oldSettings.autoLevelValue;

                if (typeof saveToLocalStorage === 'function') {
                    saveToLocalStorage(filterKey, filter);
                }
            });

            // Clean up old settings
            delete oldSettings.autoScroll;
            delete oldSettings.autoRun;
            delete oldSettings.autoVol;
            delete oldSettings.walletCex;
            delete oldSettings.autoLevel;
            delete oldSettings.autoLevelValue;

            if (typeof saveToLocalStorage === 'function') {
                saveToLocalStorage('SETTING_SCANNER', oldSettings);
            }

            console.log('[CHECKBOX-PREFS] ✅ Migration complete');
        } catch (e) {
            console.warn('[CHECKBOX-PREFS] Migration failed:', e.message);
        }
    }

    // Export to global scope
    window.getCheckboxPreferences = getCheckboxPreferences;
    window.saveCheckboxPreference = saveCheckboxPreference;
    window.migrateCheckboxPreferences = migrateCheckboxPreferences;

})();

// =================================================================================
// CENTRALIZED LOGGING UTILITY
// =================================================================================
/**
 * This module provides a centralized logging system that respects the SCAN_LOG_ENABLED flag.
 * Console errors and warnings are always shown, while regular logs only appear when enabled.
 *
 * AppLogger object with methods:
 * - isEnabled: Check if logging is enabled
 * - log: Log message (only if enabled)
 * - warn: Warning message (always shown)
 * - error: Error message (always shown)
 * - info: Info message (alias for log)
 */

(function() {
    'use strict';

    /**
     * Centralized logger yang hanya menampilkan console.log jika checkbox log aktif.
     * console.error dan console.warn SELALU ditampilkan untuk debugging.
     */
    const AppLogger = {
        isEnabled: function() {
            return typeof window !== 'undefined' && window.SCAN_LOG_ENABLED === true;
        },

        log: function(module, message, data) {
            if (!this.isEnabled()) return;
            const prefix = module ? `[${module}]` : '';
            if (data !== undefined) {
                console.log(prefix, message, data);
            } else {
                console.log(prefix, message);
            }
        },

        warn: function(module, message, data) {
            // Warning SELALU ditampilkan
            const prefix = module ? `[${module}]` : '';
            if (data !== undefined) {
                console.warn(prefix, message, data);
            } else {
                console.warn(prefix, message);
            }
        },

        error: function(module, message, data) {
            // Error SELALU ditampilkan
            const prefix = module ? `[${module}]` : '';
            if (data !== undefined) {
                console.error(prefix, message, data);
            } else {
                console.error(prefix, message);
            }
        },

        // Untuk backward compatibility dengan kode yang ada
        info: function(module, message, data) {
            this.log(module, message, data);
        }
    };

    // =================================================================================
    // EXPOSE TO GLOBAL SCOPE (window)
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.AppLogger = AppLogger;
    }

})(); // End IIFE

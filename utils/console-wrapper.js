/**
 * =================================================================================
 * CONSOLE WRAPPER - Global Console Override for Production Performance
 * =================================================================================
 * 
 * Wraps console methods to respect DEBUG_LOG setting in config.js.
 * When DEBUG_LOG is false:
 *   - console.log, console.info, console.debug, console.warn → SILENCED
 *   - console.error → ALWAYS SHOWN (critical errors)
 * 
 * IMPORTANT: This script must be loaded AFTER config.js
 * 
 * To enable debug logs:
 *   - Set DEBUG_LOG: true in config.js
 *   - Or run: enableDebugLogs() in console
 * 
 * To disable debug logs:
 *   - Set DEBUG_LOG: false in config.js  
 *   - Or run: disableDebugLogs() in console
 */

(function (global) {
    'use strict';

    const root = global || (typeof window !== 'undefined' ? window : {});

    // Store original console methods
    const originalConsole = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
        group: console.group ? console.group.bind(console) : () => { },
        groupEnd: console.groupEnd ? console.groupEnd.bind(console) : () => { },
        table: console.table ? console.table.bind(console) : () => { }
    };

    // Check if debug logging is enabled
    function isDebugEnabled() {
        try {
            return root.CONFIG_APP &&
                root.CONFIG_APP.APP &&
                root.CONFIG_APP.APP.DEBUG_LOG === true;
        } catch (_) {
            return false;
        }
    }

    // Override console.log
    console.log = function (...args) {
        if (isDebugEnabled()) {
            originalConsole.log(...args);
        }
    };

    // Override console.info
    console.info = function (...args) {
        if (isDebugEnabled()) {
            originalConsole.info(...args);
        }
    };

    // Override console.debug
    console.debug = function (...args) {
        if (isDebugEnabled()) {
            originalConsole.debug(...args);
        }
    };

    // ✅ PERF: Also suppress console.warn when DEBUG_LOG is false
    console.warn = function (...args) {
        if (isDebugEnabled()) {
            originalConsole.warn(...args);
        }
    };

    // Override console.group (suppress in production)
    console.group = function (...args) {
        if (isDebugEnabled()) {
            originalConsole.group(...args);
        }
    };

    // Override console.groupEnd
    console.groupEnd = function (...args) {
        if (isDebugEnabled()) {
            originalConsole.groupEnd(...args);
        }
    };

    // Override console.table (suppress in production)
    console.table = function (...args) {
        if (isDebugEnabled()) {
            originalConsole.table(...args);
        }
    };

    // console.error is NOT overridden - ALWAYS shown for critical issues

    // Expose functions to enable/disable debug logs at runtime
    root.enableDebugLogs = function () {
        if (root.CONFIG_APP && root.CONFIG_APP.APP) {
            root.CONFIG_APP.APP.DEBUG_LOG = true;
            originalConsole.log('[CONSOLE] Debug logging ENABLED - all logs will show');
        }
    };

    root.disableDebugLogs = function () {
        if (root.CONFIG_APP && root.CONFIG_APP.APP) {
            root.CONFIG_APP.APP.DEBUG_LOG = false;
            originalConsole.log('[CONSOLE] Debug logging DISABLED - only errors will show');
        }
    };

    // Expose original console for critical logging that should always show
    root._console = originalConsole;

    // Silent initialization

})(typeof window !== 'undefined' ? window : this);


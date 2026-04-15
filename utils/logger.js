/**
 * =================================================================================
 * PRODUCTION LOGGER - Conditional Logging for Performance
 * =================================================================================
 * 
 * Reduces console.log overhead in production by conditionally logging based on
 * environment (localhost = debug mode, production = errors only).
 * 
 * Usage:
 *   Logger.debug('Detailed info');     // Only in development
 *   Logger.info('Important info');     // Only in development
 *   Logger.warn('Warning message');    // Always logged
 *   Logger.error('Error message');     // Always logged
 *   Logger.perf('Action', startTime);  // Performance timing (dev only)
 * 
 * Configuration:
 *   Logger.setLevel('debug');   // debug, info, warn, error
 *   Logger.enable();            // Force enable all logs
 *   Logger.disable();           // Force disable all logs except errors
 */

(function (global) {
    'use strict';

    const root = global || (typeof window !== 'undefined' ? window : {});

    // Log levels
    const LEVELS = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
        none: 4
    };

    class ProductionLogger {
        constructor() {
            // Detect environment
            this.isLocalhost = typeof window !== 'undefined' && (
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                window.location.hostname.startsWith('192.168.') ||
                window.location.protocol === 'file:'
            );

            // ✅ PERF: Check config for DEBUG_LOG setting
            // Default to PRODUCTION mode (warn only) for better performance
            // User can set DEBUG_LOG: true in config.js to enable debug logs
            const debugEnabled = (typeof root.CONFIG_APP !== 'undefined' &&
                root.CONFIG_APP.APP &&
                root.CONFIG_APP.APP.DEBUG_LOG === true);

            // Default to warn level for production performance
            // Only enable debug if explicitly set in config OR running in debug mode
            this.level = debugEnabled ? LEVELS.debug : LEVELS.warn;
            this.enabled = true;
            this.perfTimings = new Map();

            // Cached console methods for slight performance gain
            this._console = {
                log: console.log.bind(console),
                info: console.info.bind(console),
                warn: console.warn.bind(console),
                error: console.error.bind(console),
                group: console.group ? console.group.bind(console) : () => { },
                groupEnd: console.groupEnd ? console.groupEnd.bind(console) : () => { },
                time: console.time ? console.time.bind(console) : () => { },
                timeEnd: console.timeEnd ? console.timeEnd.bind(console) : () => { }
            };

            // Only log initialization in debug mode
            if (debugEnabled) {
                console.log(`[LOGGER] Initialized (Debug mode enabled via config)`);
            }
        }

        /**
         * Set log level
         * @param {string} level - 'debug', 'info', 'warn', 'error', or 'none'
         */
        setLevel(level) {
            const normalizedLevel = String(level).toLowerCase();
            if (LEVELS.hasOwnProperty(normalizedLevel)) {
                this.level = LEVELS[normalizedLevel];
                console.log(`[LOGGER] Level set to: ${normalizedLevel}`);
            }
        }

        /**
         * Enable all logging
         */
        enable() {
            this.enabled = true;
            this.level = LEVELS.debug;
        }

        /**
         * Disable all logging except errors
         */
        disable() {
            this.enabled = false;
            this.level = LEVELS.error;
        }

        /**
         * Debug level logging (development only)
         */
        debug(...args) {
            if (this.enabled && this.level <= LEVELS.debug) {
                this._console.log('[DEBUG]', ...args);
            }
        }

        /**
         * Info level logging (development only)
         */
        info(...args) {
            if (this.enabled && this.level <= LEVELS.info) {
                this._console.info('[INFO]', ...args);
            }
        }

        /**
         * Warning level logging
         */
        warn(...args) {
            if (this.enabled && this.level <= LEVELS.warn) {
                this._console.warn('[WARN]', ...args);
            }
        }

        /**
         * Error level logging (always logged)
         */
        error(...args) {
            if (this.level <= LEVELS.error) {
                this._console.error('[ERROR]', ...args);
            }
        }

        /**
         * Performance timing start
         * @param {string} label - Timing label
         */
        perfStart(label) {
            if (this.enabled && this.level <= LEVELS.debug) {
                this.perfTimings.set(label, performance.now());
            }
        }

        /**
         * Performance timing end
         * @param {string} label - Timing label
         * @param {string} message - Optional message
         */
        perfEnd(label, message = '') {
            if (this.enabled && this.level <= LEVELS.debug) {
                const start = this.perfTimings.get(label);
                if (start) {
                    const duration = (performance.now() - start).toFixed(2);
                    this._console.log(`[PERF] ${label}: ${duration}ms ${message}`);
                    this.perfTimings.delete(label);
                }
            }
        }

        /**
         * Log with timing from startTime
         * @param {string} action - Action name
         * @param {number} startTime - Start timestamp from performance.now()
         */
        perf(action, startTime) {
            if (this.enabled && this.level <= LEVELS.debug) {
                const duration = (performance.now() - startTime).toFixed(2);
                this._console.log(`[PERF] ${action}: ${duration}ms`);
            }
        }

        /**
         * Group logging (development only)
         * @param {string} label - Group label
         */
        group(label) {
            if (this.enabled && this.level <= LEVELS.debug) {
                this._console.group(label);
            }
        }

        /**
         * End group logging
         */
        groupEnd() {
            if (this.enabled && this.level <= LEVELS.debug) {
                this._console.groupEnd();
            }
        }

        /**
         * Table logging (development only)
         * @param {any} data - Data to display in table
         */
        table(data) {
            if (this.enabled && this.level <= LEVELS.debug && console.table) {
                console.table(data);
            }
        }

        /**
         * Get current status
         */
        getStatus() {
            const levelName = Object.keys(LEVELS).find(k => LEVELS[k] === this.level) || 'unknown';
            return {
                enabled: this.enabled,
                level: levelName,
                isLocalhost: this.isLocalhost,
                pendingPerfTimings: this.perfTimings.size
            };
        }
    }

    // Create singleton instance
    const instance = new ProductionLogger();

    // Export to global scope
    root.Logger = instance;

    // Also expose as Log for shorter access
    root.Log = {
        d: instance.debug.bind(instance),
        i: instance.info.bind(instance),
        w: instance.warn.bind(instance),
        e: instance.error.bind(instance)
    };

    // ✅ PERF: Silent load - no console.log on module load

})(typeof window !== 'undefined' ? window : this);

/**
 * =================================================================================
 * TIMER MANAGER - Central Timer Control to Prevent Memory Leaks
 * =================================================================================
 * 
 * Centralized management for all setInterval and setTimeout calls.
 * Prevents memory leaks by tracking all timers and providing cleanup methods.
 * 
 * Usage:
 *   TimerManager.set('scan-countdown', updateFn, 1000, true);  // setInterval
 *   TimerManager.set('delay-action', actionFn, 500);           // setTimeout
 *   TimerManager.clear('scan-countdown');                       // Clear specific
 *   TimerManager.clearAll();                                    // Clear all
 * 
 * Categories:
 *   - 'scan': Scanner-related timers (auto-cleared on scan stop)
 *   - 'ui': UI update timers (auto-cleared on page unload)
 *   - 'sync': Background sync timers (persistent)
 *   - 'default': General timers
 */

(function (global) {
    'use strict';

    const root = global || (typeof window !== 'undefined' ? window : {});

    class TimerManager {
        constructor() {
            this.timers = new Map();
            this.stats = {
                created: 0,
                cleared: 0,
                active: 0
            };

            // Auto-cleanup on page unload
            if (typeof window !== 'undefined') {
                window.addEventListener('beforeunload', () => {
                    this.clearAll();
                });

                // Cleanup UI timers on visibility change (tab hidden)
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) {
                        this.clearCategory('ui');
                    }
                });
            }

            // ✅ PERF: Silent initialization
        }

        /**
         * Set a timer (setTimeout or setInterval)
         * @param {string} name - Unique name for the timer
         * @param {Function} fn - Function to execute
         * @param {number} delay - Delay in milliseconds
         * @param {boolean} isInterval - true for setInterval, false for setTimeout
         * @param {string} category - Timer category for grouped cleanup
         * @returns {number} Timer ID
         */
        set(name, fn, delay, isInterval = false, category = 'default') {
            // Clear existing timer with same name
            this.clear(name);

            const wrappedFn = isInterval ? fn : () => {
                fn();
                // Auto-remove from tracking after setTimeout executes
                this.timers.delete(name);
                this.stats.active--;
            };

            const id = isInterval
                ? setInterval(wrappedFn, delay)
                : setTimeout(wrappedFn, delay);

            this.timers.set(name, {
                id,
                isInterval,
                category,
                createdAt: Date.now(),
                delay
            });

            this.stats.created++;
            this.stats.active++;

            return id;
        }

        /**
         * Set a setTimeout with tracking
         */
        setTimeout(name, fn, delay, category = 'default') {
            return this.set(name, fn, delay, false, category);
        }

        /**
         * Set a setInterval with tracking
         */
        setInterval(name, fn, delay, category = 'default') {
            return this.set(name, fn, delay, true, category);
        }

        /**
         * Clear a specific timer by name
         * @param {string} name - Timer name
         * @returns {boolean} true if timer was found and cleared
         */
        clear(name) {
            const timer = this.timers.get(name);
            if (!timer) return false;

            if (timer.isInterval) {
                clearInterval(timer.id);
            } else {
                clearTimeout(timer.id);
            }

            this.timers.delete(name);
            this.stats.cleared++;
            this.stats.active--;

            return true;
        }

        /**
         * Clear all timers in a category
         * @param {string} category - Category to clear
         * @returns {number} Number of timers cleared
         */
        clearCategory(category) {
            let count = 0;
            for (const [name, timer] of this.timers) {
                if (timer.category === category) {
                    this.clear(name);
                    count++;
                }
            }
            return count;
        }

        /**
         * Clear all timers
         * @returns {number} Number of timers cleared
         */
        clearAll() {
            const count = this.timers.size;
            for (const [name] of this.timers) {
                this.clear(name);
            }
            // Silent cleanup on unload
            return count;
        }

        /**
         * Check if a timer exists
         * @param {string} name - Timer name
         * @returns {boolean}
         */
        has(name) {
            return this.timers.has(name);
        }

        /**
         * Get timer info
         * @param {string} name - Timer name
         * @returns {object|null}
         */
        get(name) {
            return this.timers.get(name) || null;
        }

        /**
         * Get all active timers
         * @returns {Array}
         */
        getActive() {
            return Array.from(this.timers.entries()).map(([name, timer]) => ({
                name,
                ...timer
            }));
        }

        /**
         * Get statistics
         * @returns {object}
         */
        getStats() {
            return {
                ...this.stats,
                byCategory: this._getByCategory()
            };
        }

        _getByCategory() {
            const categories = {};
            for (const [, timer] of this.timers) {
                categories[timer.category] = (categories[timer.category] || 0) + 1;
            }
            return categories;
        }

        /**
         * Debug: Print all active timers
         */
        debug() {
            console.group('[TIMER MANAGER] Active Timers');
            console.table(this.getActive());
            console.log('Stats:', this.getStats());
            console.groupEnd();
        }
    }

    // Create singleton instance
    const instance = new TimerManager();

    // Export to global scope
    root.TimerManager = instance;

    // Also expose class for testing
    root.TimerManagerClass = TimerManager;

    // ✅ PERF: Silent load - no console.log on module load

})(typeof window !== 'undefined' ? window : this);

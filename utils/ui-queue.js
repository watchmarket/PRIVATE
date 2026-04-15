/**
 * =================================================================================
 * UI UPDATE QUEUE - Batched DOM Updates with requestAnimationFrame
 * =================================================================================
 * 
 * Prevents browser lag by batching DOM updates and processing them efficiently.
 * Uses requestAnimationFrame to sync with browser paint cycles.
 * 
 * Usage:
 *   UIQueue.add(() => element.innerHTML = 'new content');
 *   UIQueue.add(() => updateCell(data), 'high');  // Priority: high, normal, low
 *   UIQueue.flush();  // Process all immediately
 * 
 * Features:
 *   - Priority queue (high/normal/low)
 *   - Batched processing (max items per frame)
 *   - Throttling to prevent overload
 *   - Automatic frame-rate adjustment
 */

(function (global) {
    'use strict';

    const root = global || (typeof window !== 'undefined' ? window : {});

    class UIUpdateQueue {
        constructor(options = {}) {
            this.options = {
                maxPerFrame: options.maxPerFrame || 50,      // Max updates per frame
                targetFPS: options.targetFPS || 30,          // Target frame rate
                throttleMs: options.throttleMs || 16,        // Min ms between frames
                ...options
            };

            this.queues = {
                high: [],
                normal: [],
                low: []
            };

            this.rafId = null;
            this.lastFrameTime = 0;
            this.processing = false;
            this.paused = false;

            this.stats = {
                queued: 0,
                processed: 0,
                dropped: 0,
                frames: 0
            };

            // Pause on visibility change to save resources
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) {
                        this.pause();
                    } else {
                        // Resume and immediately flush pending updates to reduce blank screen
                        const pendingCount = this._getTotalQueued();
                        let overlayId = null;

                        // Show loading overlay if significant queue buildup
                        if (pendingCount > 10 && typeof window !== 'undefined' && window.AppOverlay) {
                            overlayId = window.AppOverlay.show({
                                id: 'tab-resume-loading',
                                title: 'Memuat Data...',
                                message: `Memproses ${pendingCount} pembaruan UI`,
                                spinner: true,
                                freezeScreen: false // Allow user to see content
                            });
                        }

                        this.resume();

                        // Force immediate processing of high-priority items
                        if (pendingCount > 0) {
                            this.flush(this.options.maxPerFrame * 3); // Process triple batch immediately
                        }

                        // Hide overlay after processing
                        if (overlayId && window.AppOverlay) {
                            setTimeout(() => {
                                try { window.AppOverlay.hide(overlayId); } catch (_) { }
                            }, 500); // Give UI time to settle
                        }
                    }
                });
            }

            // ✅ PERF: Silent initialization
        }

        /**
         * Add an update to the queue
         * @param {Function} updateFn - Function that performs DOM update
         * @param {string} priority - 'high', 'normal', or 'low'
         * @returns {UIUpdateQueue} this (for chaining)
         */
        add(updateFn, priority = 'normal') {
            if (typeof updateFn !== 'function') {
                console.warn('[UI QUEUE] Invalid update function');
                return this;
            }

            // Validate priority
            const validPriorities = ['high', 'normal', 'low'];
            if (!validPriorities.includes(priority)) {
                priority = 'normal';
            }

            this.queues[priority].push(updateFn);
            this.stats.queued++;

            // Start processing if not already
            if (!this.processing && !this.paused) {
                this._scheduleFrame();
            }

            return this;
        }

        /**
         * Add high priority update (processed first)
         */
        addHigh(updateFn) {
            return this.add(updateFn, 'high');
        }

        /**
         * Add low priority update (processed last)
         */
        addLow(updateFn) {
            return this.add(updateFn, 'low');
        }

        /**
         * Batch add multiple updates
         * @param {Array<Function>} updates - Array of update functions
         * @param {string} priority - Priority for all updates
         */
        addBatch(updates, priority = 'normal') {
            if (!Array.isArray(updates)) return this;
            updates.forEach(fn => this.add(fn, priority));
            return this;
        }

        /**
         * Process updates immediately (flush queue)
         * @param {number} maxItems - Max items to process (0 = all)
         */
        flush(maxItems = 0) {
            const total = this._getTotalQueued();
            const limit = maxItems > 0 ? Math.min(maxItems, total) : total;

            let processed = 0;
            while (processed < limit) {
                const fn = this._getNext();
                if (!fn) break;

                try {
                    fn();
                    processed++;
                    this.stats.processed++;
                } catch (e) {
                    console.error('[UI QUEUE] Update error:', e);
                }
            }

            return processed;
        }

        /**
         * Clear all queued updates
         */
        clear() {
            const dropped = this._getTotalQueued();
            this.queues.high = [];
            this.queues.normal = [];
            this.queues.low = [];
            this.stats.dropped += dropped;

            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
            this.processing = false;

            return dropped;
        }

        /**
         * Pause processing
         */
        pause() {
            this.paused = true;
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
            this.processing = false;
        }

        /**
         * Resume processing
         */
        resume() {
            this.paused = false;
            if (this._getTotalQueued() > 0) {
                this._scheduleFrame();
            }
        }

        /**
         * Get queue statistics
         */
        getStats() {
            return {
                ...this.stats,
                pending: {
                    high: this.queues.high.length,
                    normal: this.queues.normal.length,
                    low: this.queues.low.length,
                    total: this._getTotalQueued()
                },
                processing: this.processing,
                paused: this.paused
            };
        }

        // Private methods
        _scheduleFrame() {
            if (this.rafId || this.paused) return;

            this.rafId = requestAnimationFrame((timestamp) => {
                this._processFrame(timestamp);
            });
        }

        _processFrame(timestamp) {
            this.rafId = null;

            // Throttle based on target FPS
            const elapsed = timestamp - this.lastFrameTime;
            if (elapsed < this.options.throttleMs) {
                this._scheduleFrame();
                return;
            }

            this.lastFrameTime = timestamp;
            this.processing = true;
            this.stats.frames++;

            // Process up to maxPerFrame updates
            let processed = 0;
            const startTime = performance.now();
            const maxTime = 1000 / this.options.targetFPS;  // Time budget per frame

            while (processed < this.options.maxPerFrame) {
                // Check time budget
                if (performance.now() - startTime > maxTime) {
                    break;
                }

                const fn = this._getNext();
                if (!fn) break;

                try {
                    fn();
                    processed++;
                    this.stats.processed++;
                } catch (e) {
                    console.error('[UI QUEUE] Update error:', e);
                }
            }

            this.processing = false;

            // Continue if more updates pending
            if (this._getTotalQueued() > 0) {
                this._scheduleFrame();
            }
        }

        _getNext() {
            // Priority order: high > normal > low
            if (this.queues.high.length > 0) return this.queues.high.shift();
            if (this.queues.normal.length > 0) return this.queues.normal.shift();
            if (this.queues.low.length > 0) return this.queues.low.shift();
            return null;
        }

        _getTotalQueued() {
            return this.queues.high.length +
                this.queues.normal.length +
                this.queues.low.length;
        }

        /**
         * Debug: Print queue status
         */
        debug() {
            console.group('[UI QUEUE] Status');
            console.log('Stats:', this.getStats());
            console.groupEnd();
        }
    }

    // Create singleton instance
    const instance = new UIUpdateQueue();

    // Export to global scope
    root.UIQueue = instance;
    root.UIUpdateQueueClass = UIUpdateQueue;

    // ✅ PERF: Silent load - no console.log on module load

})(typeof window !== 'undefined' ? window : this);

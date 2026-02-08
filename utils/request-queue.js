/**
 * =================================================================================
 * REQUEST QUEUE - Concurrent Network Request Manager
 * =================================================================================
 * 
 * Manages concurrent API requests to prevent browser overload and rate limiting.
 * Browser limit: 6-8 connections per domain.
 * 
 * Usage:
 *   const result = await RequestQueue.add(() => fetch(url));
 *   await RequestQueue.addBatch([fetch1, fetch2, fetch3]);
 * 
 * Features:
 *   - Configurable concurrency limit
 *   - Priority queue (high/normal/low)
 *   - Automatic retry on failure
 *   - Rate limiting per domain
 *   - Request deduplication
 */

(function (global) {
    'use strict';

    const root = global || (typeof window !== 'undefined' ? window : {});

    class RequestQueue {
        constructor(options = {}) {
            this.options = {
                maxConcurrent: options.maxConcurrent || 6,  // Browser limit
                retryAttempts: options.retryAttempts || 2,
                retryDelay: options.retryDelay || 1000,
                timeout: options.timeout || 15000,
                ...options
            };

            this.queues = {
                high: [],
                normal: [],
                low: []
            };

            this.running = 0;
            this.paused = false;

            // Request deduplication
            this.pendingRequests = new Map();  // key -> Promise

            this.stats = {
                queued: 0,
                completed: 0,
                failed: 0,
                retried: 0,
                deduplicated: 0
            };

            // ✅ PERF: Silent initialization
        }

        /**
         * Add a request to the queue
         * @param {Function} requestFn - Async function that performs the request
         * @param {object} options - { priority, dedupKey, timeout }
         * @returns {Promise} Request result
         */
        async add(requestFn, options = {}) {
            const {
                priority = 'normal',
                dedupKey = null,
                timeout = this.options.timeout
            } = options;

            // Check for duplicate request
            if (dedupKey && this.pendingRequests.has(dedupKey)) {
                this.stats.deduplicated++;
                return this.pendingRequests.get(dedupKey);
            }

            // Create promise for this request
            const promise = new Promise((resolve, reject) => {
                const item = {
                    fn: requestFn,
                    resolve,
                    reject,
                    timeout,
                    attempts: 0,
                    dedupKey
                };

                // Validate priority
                const validPriorities = ['high', 'normal', 'low'];
                const queuePriority = validPriorities.includes(priority) ? priority : 'normal';

                this.queues[queuePriority].push(item);
                this.stats.queued++;

                // Start processing
                this._process();
            });

            // Track for deduplication
            if (dedupKey) {
                this.pendingRequests.set(dedupKey, promise);
                promise.finally(() => {
                    this.pendingRequests.delete(dedupKey);
                });
            }

            return promise;
        }

        /**
         * Add high priority request
         */
        async addHigh(requestFn, options = {}) {
            return this.add(requestFn, { ...options, priority: 'high' });
        }

        /**
         * Add batch of requests in parallel (respecting concurrency)
         * @param {Array<Function>} requestFns - Array of request functions
         * @param {string} priority - Priority for all requests
         * @returns {Promise<Array>} Results array
         */
        async addBatch(requestFns, priority = 'normal') {
            if (!Array.isArray(requestFns)) return [];

            const promises = requestFns.map(fn => this.add(fn, { priority }));
            return Promise.allSettled(promises);
        }

        /**
         * Add batch and wait for all to complete
         */
        async addBatchAll(requestFns, priority = 'normal') {
            const results = await this.addBatch(requestFns, priority);
            return results.map(r => r.status === 'fulfilled' ? r.value : null);
        }

        /**
         * Get current queue size
         */
        getQueueSize() {
            return {
                high: this.queues.high.length,
                normal: this.queues.normal.length,
                low: this.queues.low.length,
                total: this._getTotalQueued(),
                running: this.running
            };
        }

        /**
         * Get statistics
         */
        getStats() {
            return {
                ...this.stats,
                running: this.running,
                queued: this._getTotalQueued(),
                paused: this.paused
            };
        }

        /**
         * Pause queue processing
         */
        pause() {
            this.paused = true;
        }

        /**
         * Resume queue processing
         */
        resume() {
            this.paused = false;
            this._process();
        }

        /**
         * Clear all pending requests
         * @param {Error} reason - Error to reject with
         */
        clear(reason = new Error('Queue cleared')) {
            const dropped = this._getTotalQueued();

            for (const queue of Object.values(this.queues)) {
                while (queue.length > 0) {
                    const item = queue.shift();
                    item.reject(reason);
                }
            }

            return dropped;
        }

        /**
         * Set max concurrent requests
         */
        setMaxConcurrent(max) {
            this.options.maxConcurrent = Math.max(1, Math.min(max, 20));
            this._process();  // May start more if increased
        }

        // Private methods
        async _process() {
            if (this.paused) return;

            // Start new requests up to limit
            while (this.running < this.options.maxConcurrent && this._getTotalQueued() > 0) {
                const item = this._getNext();
                if (!item) break;

                this.running++;
                this._executeRequest(item);
            }
        }

        async _executeRequest(item) {
            const { fn, resolve, reject, timeout, dedupKey } = item;
            item.attempts++;

            try {
                // Create timeout promise
                const timeoutPromise = new Promise((_, rej) => {
                    setTimeout(() => rej(new Error('Request timeout')), timeout);
                });

                // Race request against timeout
                const result = await Promise.race([fn(), timeoutPromise]);

                this.stats.completed++;
                resolve(result);

            } catch (error) {
                // Check if we should retry
                if (item.attempts < this.options.retryAttempts) {
                    this.stats.retried++;

                    // Wait before retry
                    await new Promise(r => setTimeout(r, this.options.retryDelay));

                    // Re-queue with high priority
                    this.queues.high.unshift(item);

                } else {
                    this.stats.failed++;
                    reject(error);
                }

            } finally {
                this.running--;

                // Process next in queue
                this._process();
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
            console.group('[REQUEST QUEUE] Status');
            console.log('Queue Size:', this.getQueueSize());
            console.log('Stats:', this.getStats());
            console.groupEnd();
        }
    }

    // Create singleton instance for DEX requests
    const dexQueue = new RequestQueue({ maxConcurrent: 6 });

    // Create instance for CEX requests (lower limit)
    const cexQueue = new RequestQueue({ maxConcurrent: 4 });

    // Export to global scope
    root.RequestQueue = RequestQueue;
    root.DexRequestQueue = dexQueue;
    root.CexRequestQueue = cexQueue;

    // ✅ PERF: Silent load - no console.log on module load

})(typeof window !== 'undefined' ? window : this);

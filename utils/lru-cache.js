/**
 * =================================================================================
 * LRU CACHE - Least Recently Used Cache with Size Limits
 * =================================================================================
 * 
 * Memory-efficient cache that automatically evicts least-recently-used items
 * when the cache exceeds its size limit.
 * 
 * Usage:
 *   const cache = new LRUCache(100);  // Max 100 items
 *   cache.set('key', value);
 *   const val = cache.get('key');
 *   cache.has('key');
 *   cache.delete('key');
 *   cache.clear();
 * 
 * Features:
 *   - Configurable max size
 *   - Optional TTL (time-to-live) per item
 *   - Automatic eviction of oldest items
 *   - Statistics tracking
 */

(function (global) {
    'use strict';

    const root = global || (typeof window !== 'undefined' ? window : {});

    class LRUCache {
        /**
         * Create an LRU Cache
         * @param {number} maxSize - Maximum number of items (default: 100)
         * @param {number} defaultTTL - Default TTL in milliseconds (0 = no expiry)
         */
        constructor(maxSize = 100, defaultTTL = 0) {
            this.maxSize = Math.max(1, maxSize);
            this.defaultTTL = defaultTTL;
            this.cache = new Map();

            this.stats = {
                hits: 0,
                misses: 0,
                evictions: 0,
                sets: 0
            };
        }

        /**
         * Get a value from the cache (moves it to most recent)
         * @param {string} key - Cache key
         * @returns {any} Value or undefined if not found/expired
         */
        get(key) {
            if (!this.cache.has(key)) {
                this.stats.misses++;
                return undefined;
            }

            const entry = this.cache.get(key);

            // Check TTL expiry
            if (entry.expiresAt && Date.now() > entry.expiresAt) {
                this.cache.delete(key);
                this.stats.misses++;
                return undefined;
            }

            // Move to end (most recent) by re-inserting
            this.cache.delete(key);
            this.cache.set(key, entry);

            this.stats.hits++;
            return entry.value;
        }

        /**
         * Set a value in the cache
         * @param {string} key - Cache key
         * @param {any} value - Value to cache
         * @param {number} ttl - Optional TTL override (milliseconds)
         */
        set(key, value, ttl = null) {
            // Remove existing entry if present
            if (this.cache.has(key)) {
                this.cache.delete(key);
            }

            // Evict oldest items if at capacity
            while (this.cache.size >= this.maxSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
                this.stats.evictions++;
            }

            // Calculate expiry time
            const useTTL = ttl !== null ? ttl : this.defaultTTL;
            const expiresAt = useTTL > 0 ? Date.now() + useTTL : null;

            this.cache.set(key, { value, expiresAt, createdAt: Date.now() });
            this.stats.sets++;
        }

        /**
         * Check if key exists in cache (without marking as recently used)
         * @param {string} key - Cache key
         * @returns {boolean}
         */
        has(key) {
            if (!this.cache.has(key)) return false;

            const entry = this.cache.get(key);
            if (entry.expiresAt && Date.now() > entry.expiresAt) {
                this.cache.delete(key);
                return false;
            }

            return true;
        }

        /**
         * Delete a key from the cache
         * @param {string} key - Cache key
         * @returns {boolean} True if key was present
         */
        delete(key) {
            return this.cache.delete(key);
        }

        /**
         * Clear all items from the cache
         */
        clear() {
            this.cache.clear();
        }

        /**
         * Get cache size
         * @returns {number}
         */
        get size() {
            return this.cache.size;
        }

        /**
         * Get all keys (ordered oldest to newest)
         * @returns {string[]}
         */
        keys() {
            return Array.from(this.cache.keys());
        }

        /**
         * Get cache statistics
         * @returns {object}
         */
        getStats() {
            const hitRate = this.stats.hits + this.stats.misses > 0
                ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1)
                : 0;

            return {
                ...this.stats,
                size: this.cache.size,
                maxSize: this.maxSize,
                hitRate: `${hitRate}%`
            };
        }

        /**
         * Clean expired entries
         * @returns {number} Number of expired entries removed
         */
        cleanExpired() {
            let removed = 0;
            const now = Date.now();

            for (const [key, entry] of this.cache) {
                if (entry.expiresAt && now > entry.expiresAt) {
                    this.cache.delete(key);
                    removed++;
                }
            }

            return removed;
        }

        /**
         * Prune cache to a specific size
         * @param {number} targetSize - Target size
         * @returns {number} Number of items evicted
         */
        prune(targetSize) {
            let evicted = 0;
            while (this.cache.size > targetSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
                evicted++;
            }
            this.stats.evictions += evicted;
            return evicted;
        }
    }

    // Export class to global scope
    root.LRUCache = LRUCache;

    // Pre-create some common caches
    root.DexResponseCache = new LRUCache(200, 30000);  // 200 items, 30s TTL
    root.Web3DataCache = new LRUCache(500, 7 * 24 * 60 * 60 * 1000);  // 500 items, 7 days TTL

    // ✅ PERF: Silent load - no console.log on module load

})(typeof window !== 'undefined' ? window : this);

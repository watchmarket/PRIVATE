// =================================================================================
// SCAN LOCK MANAGEMENT
// =================================================================================
/**
 * This module manages global scan lock system to prevent multiple scans from running
 * simultaneously across different tabs or modes. Uses localStorage with metadata tracking.
 *
 * Functions:
 * - getGlobalScanLock: Get global scan lock info from all filter keys
 * - setGlobalScanLock: Set global scan lock with metadata
 * - clearGlobalScanLock: Clear global scan lock
 * - checkCanStartScan: Check if current tab can start scanning
 * - startScanLockHeartbeat: Start heartbeat to keep lock alive
 * - stopScanLockHeartbeat: Stop heartbeat interval
 */

(function () {
    'use strict';

    // =================================================================================
    // GLOBAL SCAN LOCK SYSTEM
    // =================================================================================
    /**
     * Global scan lock menggunakan filter.run untuk mencegah multiple scan bersamaan.
     * Lock disimpan dengan metadata: tabId, timestamp, mode, chain
     */

    /**
     * Get global scan lock info dari semua filter keys
     * @returns {Object|null} Lock info jika ada scan berjalan, null jika tidak ada
     */
    function getGlobalScanLock() {
        try {
            const now = Date.now();
            const LOCK_TIMEOUT = 300000; // 5 minutes - auto cleanup if stale

            // Check FILTER_MULTICHAIN
            const multiFilter = getFromLocalStorage('FILTER_MULTICHAIN', {});
            if (multiFilter.run === 'YES' && multiFilter.runMeta) {
                const age = now - (multiFilter.runMeta.timestamp || 0);
                if (age < LOCK_TIMEOUT) {
                    return {
                        mode: 'MULTICHAIN',
                        key: 'FILTER_MULTICHAIN',
                        ...multiFilter.runMeta,
                        age
                    };
                } else {
                    // Stale lock - auto cleanup
                    clearGlobalScanLock('FILTER_MULTICHAIN');
                }
            }

            // Check all FILTER_<CHAIN> keys
            const chains = Object.keys(window.CONFIG_CHAINS || {});
            for (const chain of chains) {
                const key = `FILTER_${chain.toUpperCase()}`;
                const filter = getFromLocalStorage(key, {});
                if (filter.run === 'YES' && filter.runMeta) {
                    const age = now - (filter.runMeta.timestamp || 0);
                    if (age < LOCK_TIMEOUT) {
                        return {
                            mode: chain.toUpperCase(),
                            key,
                            ...filter.runMeta,
                            age
                        };
                    } else {
                        // Stale lock - auto cleanup
                        clearGlobalScanLock(key);
                    }
                }
            }

            return null;
        } catch (e) {
            // console.error('[SCAN LOCK] Error getting global lock:', e);
            return null;
        }
    }

    /**
     * Set global scan lock
     * @param {string} filterKey - Filter key (FILTER_MULTICHAIN or FILTER_<CHAIN>)
     * @param {Object} meta - Metadata: { tabId, mode, chain }
     * @returns {boolean} True if lock acquired, false if already locked
     */
    function setGlobalScanLock(filterKey, meta = {}) {
        try {
            // Check if scan limit is enabled
            const scanLimitEnabled = typeof window !== 'undefined'
                && window.CONFIG_APP
                && window.CONFIG_APP.APP
                && window.CONFIG_APP.APP.SCAN_LIMIT === true;

            // If scan limit is disabled, skip lock checking (allow multiple scans)
            if (!scanLimitEnabled) {
                // console.log('[SCAN LOCK] Scan limit disabled - skipping lock enforcement');
                // Still set the lock data for tracking purposes, but don't enforce uniqueness
                const filter = getFromLocalStorage(filterKey, {}) || {};
                filter.run = 'YES';
                filter.runMeta = {
                    tabId: meta.tabId || (typeof getTabId === 'function' ? getTabId() : null),
                    mode: meta.mode || 'UNKNOWN',
                    chain: meta.chain || null,
                    timestamp: Date.now(),
                    startTime: new Date().toISOString()
                };
                saveToLocalStorage(filterKey, filter);
                startScanLockHeartbeat(filterKey);
                return true;
            }

            // Scan limit is enabled - enforce single scan restriction
            const existingLock = getGlobalScanLock();
            if (existingLock) {
                const isSameTab = existingLock.tabId === (meta.tabId || getTabId());
                if (!isSameTab) {
                    // console.warn('[SCAN LOCK] Cannot acquire lock - scan already running:', existingLock);
                    return false;
                }
            }

            const filter = getFromLocalStorage(filterKey, {}) || {};
            filter.run = 'YES';
            filter.runMeta = {
                tabId: meta.tabId || (typeof getTabId === 'function' ? getTabId() : null),
                mode: meta.mode || 'UNKNOWN',
                chain: meta.chain || null,
                timestamp: Date.now(),
                startTime: new Date().toISOString()
            };

            saveToLocalStorage(filterKey, filter);
            // console.log('[SCAN LOCK] Lock acquired:', filterKey, filter.runMeta);

            // Start heartbeat
            startScanLockHeartbeat(filterKey);

            return true;
        } catch (e) {
            // console.error('[SCAN LOCK] Error setting lock:', e);
            return false;
        }
    }

    /**
     * Clear global scan lock
     * @param {string} filterKey - Filter key to clear
     */
    function clearGlobalScanLock(filterKey) {
        try {
            const filter = getFromLocalStorage(filterKey, {}) || {};
            filter.run = 'NO';
            delete filter.runMeta;
            saveToLocalStorage(filterKey, filter);
            // console.log('[SCAN LOCK] Lock cleared:', filterKey);

            // Stop heartbeat
            stopScanLockHeartbeat();
        } catch (e) {
            // console.error('[SCAN LOCK] Error clearing lock:', e);
        }
    }

    /**
     * Check if current tab can start scanning
     * @returns {Object} { canScan: boolean, reason: string, lockInfo: Object|null }
     */
    function checkCanStartScan() {
        try {
            // Check if scan limit is enabled
            const scanLimitEnabled = typeof window !== 'undefined'
                && window.CONFIG_APP
                && window.CONFIG_APP.APP
                && window.CONFIG_APP.APP.SCAN_LIMIT === true;

            // If scan limit is disabled, always allow scanning
            if (!scanLimitEnabled) {
                // console.log('[SCAN LOCK] Scan limit disabled - allowing multiple scans');
                return { canScan: true, reason: 'Scan limit disabled', lockInfo: null };
            }

            const lock = getGlobalScanLock();

            if (!lock) {
                return { canScan: true, reason: 'No active scan', lockInfo: null };
            }

            const currentTabId = typeof getTabId === 'function' ? getTabId() : null;
            const isSameTab = lock.tabId === currentTabId;

            if (isSameTab) {
                return { canScan: true, reason: 'Same tab lock', lockInfo: lock };
            }

            const ageSeconds = Math.floor(lock.age / 1000);
            const lockMode = lock.mode || 'UNKNOWN';
            const reason = `Scan sedang berjalan di tab lain (${lockMode}) - ${ageSeconds}s ago`;

            return { canScan: false, reason, lockInfo: lock };
        } catch (e) {
            // console.error('[SCAN LOCK] Error checking can scan:', e);
            return { canScan: true, reason: 'Error checking - allowing scan', lockInfo: null };
        }
    }

    // Heartbeat untuk keep-alive scan lock
    let _scanLockHeartbeatInterval = null;
    let _scanLockHeartbeatKey = null;

    function startScanLockHeartbeat(filterKey) {
        stopScanLockHeartbeat(); // Clear any existing

        _scanLockHeartbeatKey = filterKey;

        const heartbeatFn = () => {
            try {
                const filter = getFromLocalStorage(filterKey, {});
                if (filter.run === 'YES' && filter.runMeta) {
                    // Update timestamp to keep lock alive
                    filter.runMeta.timestamp = Date.now();
                    saveToLocalStorage(filterKey, filter);
                    // console.log('[SCAN LOCK] Heartbeat updated:', filterKey);
                } else {
                    // Lock was cleared elsewhere - stop heartbeat
                    stopScanLockHeartbeat();
                }
            } catch (e) {
                // console.error('[SCAN LOCK] Heartbeat error:', e);
            }
        };

        // ✅ PERF: Use TimerManager for centralized timer control
        if (typeof TimerManager !== 'undefined') {
            TimerManager.setInterval('scan-lock-heartbeat', heartbeatFn, 30000, 'scan');
        } else {
            _scanLockHeartbeatInterval = setInterval(heartbeatFn, 30000); // Update every 30 seconds
        }
    }

    function stopScanLockHeartbeat() {
        // ✅ PERF: Use TimerManager for centralized timer control
        if (typeof TimerManager !== 'undefined') {
            TimerManager.clear('scan-lock-heartbeat');
        }

        if (_scanLockHeartbeatInterval) {
            clearInterval(_scanLockHeartbeatInterval);
            _scanLockHeartbeatInterval = null;
            _scanLockHeartbeatKey = null;
            // console.log('[SCAN LOCK] Heartbeat stopped');
        }
    }

    // =================================================================================
    // EXPOSE TO GLOBAL SCOPE (window)
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.getGlobalScanLock = getGlobalScanLock;
        window.setGlobalScanLock = setGlobalScanLock;
        window.clearGlobalScanLock = clearGlobalScanLock;
        window.checkCanStartScan = checkCanStartScan;
        window.startScanLockHeartbeat = startScanLockHeartbeat;
        window.stopScanLockHeartbeat = stopScanLockHeartbeat;
    }

})(); // End IIFE

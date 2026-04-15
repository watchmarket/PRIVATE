// =================================================================================
// SCANNER STATE MANAGEMENT
// =================================================================================
/**
 * Global state management for scanner
 */

(function() {
    'use strict';

// ID untuk loop `requestAnimationFrame` yang meng-update UI.
let animationFrameId;

// Flag boolean yang menandakan apakah proses pemindaian sedang berjalan atau tidak.
// NOTE: Ini adalah per-tab state, tidak akan conflict dengan tab lain
let isScanRunning = false;

// Counter untuk melacak jumlah request DEX yang masih berjalan (termasuk fallback).
let activeDexRequests = 0;

// Resolver yang menunggu seluruh request DEX selesai sebelum finalisasi.
let dexRequestWaiters = [];

/**
 * Helper function untuk check apakah tab ini sedang scanning
 * Menggunakan sessionStorage untuk per-tab isolation
 */
function isThisTabScanning() {
    try {
        if (isScanRunning) return true;
        if (typeof sessionStorage !== 'undefined') {
            const tabScanning = sessionStorage.getItem('TAB_SCANNING');
            return tabScanning === 'YES';
        }
        return false;
    } catch(e) {
        return isScanRunning;
    }
}

/**
 * Mark start of a DEX request
 */
function markDexRequestStart() {
    try { activeDexRequests += 1; } catch(_) { activeDexRequests = 1; }
}

/**
 * Mark end of a DEX request
 */
function markDexRequestEnd() {
    try {
        activeDexRequests = Math.max(0, activeDexRequests - 1);
        if (activeDexRequests === 0 && dexRequestWaiters.length > 0) {
            const waiters = dexRequestWaiters.slice();
            dexRequestWaiters.length = 0;
            waiters.forEach(fn => {
                try { fn(); } catch(_) {}
            });
        }
    } catch(_) {}
}

/**
 * Wait for all pending DEX requests to complete
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} Promise that resolves when all requests complete or timeout
 */
function waitForPendingDexRequests(timeoutMs = 8000) {
    if (activeDexRequests === 0) return Promise.resolve();
    return new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        try { dexRequestWaiters.push(done); } catch(_) { dexRequestWaiters = [done]; }
        if (timeoutMs > 0) {
            setTimeout(() => {
                if (settled) return;
                settled = true;
                try {
                    const idx = dexRequestWaiters.indexOf(done);
                    if (idx !== -1) dexRequestWaiters.splice(idx, 1);
                } catch(_) {}
                resolve();
            }, timeoutMs);
        }
    });
}

/**
 * Get/Set scanner running state
 */
function getScanRunning() {
    return isScanRunning;
}

function setScanRunning(value) {
    isScanRunning = !!value;
}

/**
 * Get/Set animation frame ID
 */
function getAnimationFrameId() {
    return animationFrameId;
}

function setAnimationFrameId(id) {
    animationFrameId = id;
}

/**
 * Persist run state to storage
 */
async function persistRunStateNo() {
    try {
        if (typeof saveToLocalStorageAsync === 'function') {
            await saveToLocalStorageAsync('APP_STATE', { run: 'NO', lastUpdate: Date.now() });
        } else if (typeof saveToLocalStorage === 'function') {
            saveToLocalStorage('APP_STATE', { run: 'NO', lastUpdate: Date.now() });
        }
    } catch(_) {}
}

// =================================================================================
// EXPOSE TO GLOBAL SCOPE
// =================================================================================
if (typeof window !== 'undefined') {
    window.isThisTabScanning = isThisTabScanning;
    window.markDexRequestStart = markDexRequestStart;
    window.markDexRequestEnd = markDexRequestEnd;
    window.waitForPendingDexRequests = waitForPendingDexRequests;
    window.getScanRunning = getScanRunning;
    window.setScanRunning = setScanRunning;
    window.getAnimationFrameId = getAnimationFrameId;
    window.setAnimationFrameId = setAnimationFrameId;
    window.persistRunStateNo = persistRunStateNo;
}

})(); // End IIFE

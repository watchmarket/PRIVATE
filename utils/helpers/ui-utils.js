// =================================================================================
// UI UTILITIES
// =================================================================================
/**
 * This module provides UI-related utilities including debouncing and UI gating
 * during scanning operations.
 *
 * Functions:
 * - debounce: Returns a debounced version of a function
 * - setScanUIGating: Enable/disable UI controls during scanning
 */

(function () {
    'use strict';

    /**
     * Returns a function, that, as long as it continues to be invoked, will not
     * be triggered. The function will be called after it stops being called for
     * N milliseconds.
     * @param {Function} func The function to debounce.
     * @param {number} wait The number of milliseconds to delay.
     */
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    // =============================================================
    // UI GATING WHILE SCANNING
    // Disable most interactions while scan is running; allow Reload + Theme
    // =============================================================
    function setScanUIGating(isRunning) {
        try {
            const $allToolbar = $('.header-card a, .header-card .icon');
            const mode = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
            const isSingle = String(mode.type || '').toLowerCase() === 'single';
            if (isRunning) {
                // Dim and disable all toolbar actions
                $allToolbar.css({ pointerEvents: 'none', opacity: 0.4 });
                // Allow only reload (dark mode toggle ikut dinonaktifkan saat scan)
                $('#reload').css({ pointerEvents: 'auto', opacity: 1 });
                // Allow chain selection icons remain active during scan (including their img.icon children)
                // Disable "Manajemen Koin" and "Update Wallet" icons
                $('#ManajemenKoin').css({ pointerEvents: 'none', opacity: 0.4 });
                $('#UpdateWalletCEX').css({ pointerEvents: 'none', opacity: 0.4 });

                $('#chain-links-container a, #chain-links-container .chain-link, #chain-links-container .icon, #multichain_scanner, #multichain_scanner .icon')
                    .css({ pointerEvents: 'auto', opacity: 1 });
                // ✅ KEEP Scanner Filter Modal icon ACTIVE during scan (modal will show readonly inputs)
                $('#ScannerFilterModal').css({ pointerEvents: 'auto', opacity: 1 });
                // ✅ KEEP Calculator Modal icon ACTIVE and fully functional during scan
                $('#openCalculatorModal').css({ pointerEvents: 'auto', opacity: 1 });
                // Disable scanner config controls and filter card inputs
                $('#scanner-config').find('input, select, button, textarea').not('#btn-scroll-top').prop('disabled', true);
                $('#filter-card').find('input, select, button, textarea').not('#btn-scroll-top').prop('disabled', true);
                // ✅ Ensure calculator modal inputs are NEVER disabled
                $('#calculator-modal').find('input, select, button, textarea').prop('disabled', false);
                // Keep Auto Scroll checkbox enabled and clickable during scanning
                $('#autoScrollCheckbox').prop('disabled', false).css({ pointerEvents: 'auto', opacity: 1 });
                // Some extra clickable items in page (keep chain links enabled)
                // UBAH: Icon edit & delete TETAP AKTIF untuk semua mode saat scanning
                $('.sort-toggle').css({ pointerEvents: 'none', opacity: 0.4 });
                $('.edit-token-button').css({ pointerEvents: 'auto', opacity: 1 });
                $('.delete-token-button').css({ pointerEvents: 'auto', opacity: 1 });
                // Lock token management during scan; Edit modal behavior depends on mode
                $('#token-management').find('input, select, button, textarea').prop('disabled', true).css({ pointerEvents: 'none', opacity: 0.6 });
                // UBAH: Form edit TETAP AKTIF untuk semua mode (single & multi-chain)
                const $modal = $('#FormEditKoinModal');
                $modal.find('input, select, button, textarea').prop('disabled', false).css({ pointerEvents: 'auto', opacity: '' });
                // Tombol Simpan & Hapus TETAP AKTIF saat scanning
                $('#HapusEditkoin').show().prop('disabled', false);
                $('#SaveEditkoin').show().prop('disabled', false);
                $('#CopyToMultiBtn').show().prop('disabled', false);
                $('#BatalEditkoin').show().prop('disabled', false);
                // Keep STOP button usable during running
                $('#stopSCAN').prop('disabled', false).show();
                // Keep RELOAD usable (already via toolbar allow-list), disable START explicitly
                $('#startSCAN').prop('disabled', true);
            } else {
                // Re-enable toolbar
                $allToolbar.css({ pointerEvents: '', opacity: '' });
                // ✅ Scanner Filter Modal icon remains enabled (already enabled during scan)
                $('#ScannerFilterModal').css({ pointerEvents: '', opacity: '' });
                // ✅ Calculator Modal icon and inputs remain enabled
                $('#openCalculatorModal').css({ pointerEvents: 'auto', opacity: 1 });
                $('#calculator-modal').find('input, select, button, textarea').prop('disabled', false);
                // Reset controls (actual availability will be enforced by applyControlsFor)
                $('#scanner-config').find('input, select, button, textarea').prop('disabled', false);
                $('#filter-card').find('input, select, button, textarea').prop('disabled', false);
                $('.sort-toggle, .edit-token-button, #chain-links-container a').css({ pointerEvents: '', opacity: '' });
                $('.delete-token-button').css({ pointerEvents: '', opacity: '' });
                $('#token-management, #FormEditKoinModal').find('input, select, button, textarea').prop('disabled', false).css({ pointerEvents: '', opacity: '' });
                // Restore full button set visibility in edit modal
                $('#HapusEditkoin, #SaveEditkoin').show().prop('disabled', false);
                $('#CopyToMultiBtn').show();
                $('#BatalEditkoin').show();
                // Ensure Auto Scroll remains interactive when idle too
                $('#autoScrollCheckbox').prop('disabled', false).css({ pointerEvents: 'auto', opacity: '' });
            }
        } catch (_) { /* noop */ }
    }

    // =================================================================================
    // EXPOSE TO GLOBAL SCOPE (window)
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.debounce = debounce;
        window.setScanUIGating = setScanUIGating;
    }

})(); // End IIFE

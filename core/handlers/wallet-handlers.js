/**
 * =================================================================================
 * WALLET EVENT HANDLERS
 * =================================================================================
 *
 * This module contains all wallet-related event handlers including:
 * - CEX wallet update button
 * - Wallet exchanger operations
 * - Wallet connection handlers
 *
 * Dependencies:
 * - jQuery
 * - getAppMode, getFilterChain, getFilterMulti (data access)
 * - getAppState (state management)
 * - window.App.WalletExchanger (wallet exchanger module)
 * - window.App.Scanner (scanner module for soft stop)
 * - checkAllCEXWallets (wallet update function)
 * - setLastAction (history logging)
 * - toast notifications
 * - CONFIG_CEX (CEX configuration)
 *
 * @module core/handlers/wallet-handlers
 */

(function() {
    'use strict';

    /**
     * Update wallet CEX button handler
     * Shows wallet exchanger section or runs wallet update
     */
    $('#UpdateWalletCEX').on('click', async () => {
        // NEW UI: Show wallet exchanger section instead of running immediately
        try {
            if (window.App?.WalletExchanger?.show) {
                window.App.WalletExchanger.show();
                return;
            }
        } catch(err) {
            // console.error('[UpdateWalletCEX] Error showing wallet exchanger section:', err);
        }

        // FALLBACK: Old behavior (direct execution) if new UI not available
        // Pre-check: require at least 1 CEX selected in filter chips
        try {
            const m = getAppMode();
            let selected = [];
            if (m.type === 'single') {
                const fc = getFilterChain(m.chain || '');
                selected = (fc && Array.isArray(fc.cex)) ? fc.cex : [];
            } else {
                const fm = getFilterMulti();
                selected = (fm && Array.isArray(fm.cex)) ? fm.cex : [];
            }
            const cfg = (typeof window !== 'undefined' ? (window.CONFIG_CEX || {}) : (CONFIG_CEX || {}));
            const valid = (selected || []).map(x => String(x).toUpperCase()).filter(cx => !!cfg[cx]);
            if (!valid.length) {
                if (typeof toast !== 'undefined' && toast.error) toast.error('Pilih minimal 1 CEX pada filter sebelum update wallet.');
                try { setLastAction('UPDATE WALLET EXCHANGER', 'error', { reason: 'NO_CEX_SELECTED' }); } catch(_) {}
                return;
            }
        } catch(_) { /* fallthrough to confirm */ }

        if (!confirm("APAKAH ANDA INGIN UPDATE WALLET EXCHANGER?")) { try { setLastAction('UPDATE WALLET EXCHANGER', 'warning', { reason: 'CANCELLED' }); } catch(_) {} return; }

        // Ensure any running scan stops before updating wallets
        try {
            const st = getAppState();
            if (st && st.run === 'YES' && window.App?.Scanner?.stopScannerSoft) {
                window.App.Scanner.stopScannerSoft();
                // Small delay to let UI settle
                await new Promise(r => setTimeout(r, 200));
            }
        } catch(_) {}

        // Run wallet update; page will reload after success in the service layer
        try { checkAllCEXWallets(); } catch(e) { console.error(e); }
    });

})();

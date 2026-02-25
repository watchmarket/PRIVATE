// =================================================================================
// THEME AND FEATURE MANAGEMENT
// =================================================================================
/**
 * This module handles theme application, feature readiness checks, and UI state management
 * based on the current mode (multi-chain or single-chain).
 *
 * Functions:
 * - getFeatureReadiness: Check which features are available based on current state
 * - applyThemeForMode: Apply theme colors and styles based on mode
 */

(function () {
    'use strict';

    // =================================================================================
    // FEATURE READINESS & GATING HELPERS
    // =================================================================================

    function getFeatureReadiness() {
        const mode = getAppMode();
        const settings = getFromLocalStorage('SETTING_SCANNER', {});
        const hasSettings = !!(settings && typeof settings === 'object' && Object.keys(settings).length);
        const multi = getTokensMulti(); // REFACTORED
        const hasTokensMulti = Array.isArray(multi) && multi.length > 0;
        const hasTokensChain = (mode.type === 'single') ? (Array.isArray(getTokensChain(mode.chain)) && getTokensChain(mode.chain).length > 0) : false;

        const feature = {
            settings: true,
            scan: hasSettings && (mode.type === 'single' ? hasTokensChain : hasTokensMulti),
            manage: hasSettings, // aktif jika setting sudah ada (semua mode)
            sync: hasSettings && (mode.type === 'single'),
            import: hasSettings,
            export: hasSettings && (mode.type === 'single' ? hasTokensChain : hasTokensMulti),
            wallet: hasSettings && (hasTokensChain || hasTokensMulti),
            assets: hasSettings,
            snapshot: hasSettings,
            proxy: true,
            reload: true
        };

        return { mode, hasSettings, hasTokensMulti, hasTokensChain, feature };
    }

    /**
     * Apply theme color based on mode:
     * - multi: keep existing green accent
     * - single: use CONFIG_CHAINS[chain].WARNA
     */
    function applyThemeForMode() {
        try {
            const m = getAppMode();
            const root = document.documentElement;
            const body = document.body || document.getElementsByTagName('body')[0];
            if (!root || !body) return;

            let accent = '#5c9514'; // default for multi
            let label = '[ALL]';
            body.classList.remove('theme-single', 'theme-multi');

            // CEX mode: skip theme application here, let CEXModeManager handle it
            if (m.type === 'cex') {
                // If CEXModeManager already applied theme, only sync dark mode and return
                if (body.classList.contains('theme-cex')) {
                    try {
                        const stCex = (typeof getAppState === 'function') ? getAppState() : {};
                        const stMulti = (typeof getFromLocalStorage === 'function') ? (getFromLocalStorage('FILTER_MULTICHAIN', {}) || {}) : {};
                        const isDark = !!(stCex && stCex.darkMode !== undefined ? stCex.darkMode : stMulti.darkMode);
                        if (isDark) { body.classList.add('dark-mode', 'uk-dark'); body.classList.remove('uk-light'); }
                        else { body.classList.remove('dark-mode', 'uk-dark'); }
                        try { if (typeof updateDarkIcon === 'function') updateDarkIcon(isDark); } catch (_) { }
                    } catch (_) { }
                    return;
                }
                // Apply CEX theme immediately to prevent green flash
                const cexCfg = (window.CONFIG_CEX || {})[m.cex] || {};
                accent = cexCfg.WARNA || accent;
                label = `[${m.cex}]`;
                body.classList.add('theme-cex');
                body.setAttribute('data-cex', m.cex);
                root.style.setProperty('--cex-primary', accent);
                root.style.setProperty('--theme-accent', accent);
                const chainLabel = document.getElementById('current-chain-label');
                if (chainLabel) {
                    chainLabel.textContent = label;
                    chainLabel.style.color = accent;
                }
                // Inject CEX mode background gradient early
                let styleEl = document.getElementById('cex-mode-dynamic-style');
                const css = `
                    body.theme-cex { background: linear-gradient(180deg, ${accent} 0%, #ffffff 45%) !important; }
                    body.theme-cex:not(.dark-mode) .uk-table:not(.wallet-cex-table) thead th { background: ${accent} !important; }
                    body.theme-cex #progress-bar { background-color: ${accent} !important; }
                    body.theme-cex #progress-container { border: 1px solid ${accent} !important; }
                `;
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = 'cex-mode-dynamic-style';
                    styleEl.type = 'text/css';
                    styleEl.appendChild(document.createTextNode(css));
                    document.head.appendChild(styleEl);
                } else {
                    styleEl.textContent = css;
                }
                // Update favicon
                try {
                    const fav = document.querySelector('link#favicon');
                    if (fav) {
                        if (!window.DEFAULT_FAVICON_HREF) window.DEFAULT_FAVICON_HREF = fav.getAttribute('href');
                        if (cexCfg.ICON) fav.setAttribute('href', cexCfg.ICON);
                    }
                    document.title = `${m.cex} SCANNER`;
                } catch (_) { }
                // Restore dark mode di CEX mode (baca dari CEX filter, fallback ke FILTER_MULTICHAIN)
                try {
                    const stCex = (typeof getAppState === 'function') ? getAppState() : {};
                    const stMulti = (typeof getFromLocalStorage === 'function') ? (getFromLocalStorage('FILTER_MULTICHAIN', {}) || {}) : {};
                    const isDark = !!(stCex && stCex.darkMode !== undefined ? stCex.darkMode : stMulti.darkMode);
                    if (isDark) {
                        body.classList.add('dark-mode', 'uk-dark');
                        body.classList.remove('uk-light');
                    } else {
                        body.classList.remove('dark-mode', 'uk-dark');
                    }
                    try { if (typeof updateDarkIcon === 'function') updateDarkIcon(isDark); } catch (_) { }
                } catch (_) { }
                return;
            }

            if (m.type === 'single') {
                const cfg = (window.CONFIG_CHAINS || {})[m.chain] || {};
                accent = cfg.WARNA || accent;
                label = `[${(cfg.Nama_Pendek || cfg.Nama_Chain || m.chain || 'CHAIN').toString().toUpperCase()}]`;
                body.classList.add('theme-single');
            } else {
                body.classList.add('theme-multi');
            }

            // Apply dark-mode based on per-mode state
            try {
                const st = (typeof getAppState === 'function') ? getAppState() : { darkMode: false };
                if (st && st.darkMode) {
                    body.classList.add('dark-mode', 'uk-dark');
                    body.classList.remove('uk-light');
                } else {
                    body.classList.remove('dark-mode', 'uk-dark');
                }
                try { if (typeof updateDarkIcon === 'function') updateDarkIcon(!!st.darkMode); } catch (_) { }
            } catch (_) { }

            root.style.setProperty('--theme-accent', accent);
            const chainLabel = document.getElementById('current-chain-label');
            if (chainLabel) {
                chainLabel.textContent = label;
                chainLabel.style.color = accent;
            }

            // Update document title and favicon based on mode
            try {
                // Cache default favicon once
                const fav = document.querySelector('link#favicon');
                if (fav && !window.DEFAULT_FAVICON_HREF) {
                    window.DEFAULT_FAVICON_HREF = fav.getAttribute('href');
                }
                if (m.type === 'single') {
                    const cfg = (window.CONFIG_CHAINS || {})[m.chain] || {};
                    const nm = (cfg.Nama_Pendek || cfg.Nama_Chain || m.chain || 'CHAIN').toString().toUpperCase();
                    document.title = `${nm} SCANNER`;
                    if (fav) fav.setAttribute('href', cfg.ICON || window.DEFAULT_FAVICON_HREF || fav.getAttribute('href'));
                } else {
                    document.title = 'SCANNER MULTICHAIN';
                    if (fav && window.DEFAULT_FAVICON_HREF) fav.setAttribute('href', window.DEFAULT_FAVICON_HREF);
                }
            } catch (_) { }

            // Inject or update a style tag for theme overrides
            let styleEl = document.getElementById('dynamic-theme-style');
            const css = `
              :root { --theme-accent: ${accent}; }
              /* Use accent header only in light mode */
              body.theme-single:not(.dark-mode) .uk-table:not(.wallet-cex-table) thead th,
              body.theme-multi:not(.dark-mode) .uk-table:not(.wallet-cex-table) thead th { background: var(--theme-accent) !important; }
              /* Dark-mode: force dark header for monitoring tables */
              body.dark-mode .uk-table thead th { background: #1c1c1e !important; color: #e8e8e8 !important; border-bottom: 1px solid #444 !important; }
              body.dark-mode #tabel-monitoring thead { background: #1c1c1e !important; }
              #progress-bar { background-color: var(--theme-accent) !important; }
              #progress-container { border: 1px solid var(--theme-accent) !important; }
              /* Cards and panels: keep token-management accent only; borders for #filter-card and #scanner-config unified in CSS */
              #token-management { border-color: var(--theme-accent) !important; }
              .uk-card.uk-card-default { border-color: var(--theme-accent); }
              /* Modal header accent */
              .uk-modal-header { border-bottom: 2px solid var(--theme-accent) !important; }
              /* Toggles */
              .toggle-radio.active { background-color: var(--theme-accent) !important; }
              #judul { color: #000; }
              /* Themed body background */
              body.theme-single { background: linear-gradient(180deg, var(--theme-accent) 0%, #ffffff 45%) !important; }
              body.theme-multi  { background: linear-gradient(180deg, #5c9514 0%, #ffffff 45%) !important; }
            `;
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'dynamic-theme-style';
                styleEl.type = 'text/css';
                styleEl.appendChild(document.createTextNode(css));
                document.head.appendChild(styleEl);
            } else {
                styleEl.textContent = css;
            }
        } catch (e) { /* debug logs removed */ }
    }

    // =================================================================================
    // EXPOSE TO GLOBAL SCOPE (window)
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.getFeatureReadiness = getFeatureReadiness;
        window.applyThemeForMode = applyThemeForMode;
    }

})(); // End IIFE

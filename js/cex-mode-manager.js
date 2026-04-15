/**
 * CEX Mode Manager
 * Handles logic for "Per CEX" scanning mode.
 * - Manages active CEX state
 * - Applies visual themes (backgrounds, colors)
 * - Filters tokens based on CEX availability
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'CEX_MODE_STATE';

    // Default configuration for CEX themes (fallback if config.js not loaded)
    const CEX_THEMES = {
        'BINANCE': { color: '#e0a50c', bg: '#fffbeb' }, // Yellow/Gold
        'GATE': { color: '#D5006D', bg: '#fff0f5' },    // Pink
        'MEXC': { color: '#16b979', bg: '#f0fdf4' },    // Green
        'KUCOIN': { color: '#24ae8f', bg: '#f0fdfa' },  // Teal
        'BYBIT': { color: '#ad7e05', bg: '#fffbeb' },   // Gold/Yellow
        'BITGET': { color: '#00f0ff', bg: '#edfeff' },  // Cyan
        'OKX': { color: '#000000', bg: '#f9fafb' },     // Black/White
        'HTX': { color: '#202e3b', bg: '#f3f4f6' },     // Dark Blue
        'INDODAX': { color: '#094e9d', bg: '#eff6ff' }, // Blue
        'LBANK': { color: '#e5ad19', bg: '#fffbeb' }    // Yellow
    };

    class CEXModeManager {
        constructor() {
            this.state = this.loadState();
            this.active = this.state.active || false;
            this.selectedCEX = this.state.selectedCEX || null;

            // Bind methods
            this.init = this.init.bind(this);
            this.enableCEXMode = this.enableCEXMode.bind(this);
            this.disableCEXMode = this.disableCEXMode.bind(this);
            this.toggleCEXMode = this.toggleCEXMode.bind(this);
        }

        loadState() {
            try {
                // IndexedDB (via getFromLocalStorage with in-memory cache)
                const stored = (typeof getFromLocalStorage === 'function')
                    ? getFromLocalStorage(STORAGE_KEY, null)
                    : null;
                if (stored && typeof stored === 'object') return stored;
                return { active: false, selectedCEX: null };
            } catch (e) {
                return { active: false, selectedCEX: null };
            }
        }

        saveState() {
            const data = { active: this.active, selectedCEX: this.selectedCEX };
            if (typeof saveToLocalStorage === 'function') {
                saveToLocalStorage(STORAGE_KEY, data);
            }
        }

        init() {
            console.log('[CEX Mode] Initializing...');

            // Check URL params for overwrite (e.g. ?cex=gate)
            const urlParams = new URLSearchParams(window.location.search);
            const cexParam = urlParams.get('cex');

            if (cexParam) {
                // Apply theme + state tanpa reload (deferredInit sudah jalan duluan)
                this.enableCEXMode(cexParam.toUpperCase(), false);

                // Re-render table & filter card SETELAH CEX mode aktif
                // Karena deferredInit() sudah jalan sebelum init() (race condition 0ms vs 500ms)
                setTimeout(() => {
                    try {
                        if (typeof window.refreshTokensTable === 'function') window.refreshTokensTable();
                        if (typeof window.renderFilterCard === 'function') window.renderFilterCard();
                        if (typeof window.applySortToggleState === 'function') window.applySortToggleState();
                    } catch (_) { }
                }, 50);
            } else {
                // If no cex param but CEX mode is active, reset it
                if (this.active && this.selectedCEX) {
                    console.log('[CEX Mode] No cex param in URL, resetting CEX mode');
                    this.disableCEXMode(false);
                }
            }

            // Monitor URL changes to auto-reset CEX mode when switching to chain/multichain
            this.setupURLMonitoring();

            // Render CEX toolbar icons
            this.renderToolbar();
        }

        setupURLMonitoring() {
            // Monitor popstate (back/forward navigation)
            window.addEventListener('popstate', () => {
                this.checkURLAndUpdateMode();
            });

            // Monitor pushState/replaceState (programmatic navigation)
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            const self = this;

            history.pushState = function (...args) {
                originalPushState.apply(this, args);
                setTimeout(() => self.checkURLAndUpdateMode(), 100);
            };

            history.replaceState = function (...args) {
                originalReplaceState.apply(this, args);
                setTimeout(() => self.checkURLAndUpdateMode(), 100);
            };
        }

        checkURLAndUpdateMode() {
            const urlParams = new URLSearchParams(window.location.search);
            const cexParam = urlParams.get('cex');
            const chainParam = urlParams.get('chain');

            if (cexParam) {
                // CEX mode should be active
                const cexUpper = cexParam.toUpperCase();
                if (!this.active || this.selectedCEX !== cexUpper) {
                    console.log(`[CEX Mode] URL changed to CEX mode: ${cexUpper}`);
                    this.enableCEXMode(cexUpper, false);
                }
            } else {
                // Chain or multichain mode - reset CEX if active
                if (this.active) {
                    console.log('[CEX Mode] URL changed to chain/multichain mode, resetting CEX');
                    this.disableCEXMode(false);

                    // Re-apply chain/multichain theme
                    if (typeof applyThemeForMode === 'function') {
                        setTimeout(() => applyThemeForMode(), 50);
                    }
                }
            }
        }

        isCEXMode() {
            return this.active;
        }

        getSelectedCEX() {
            return this.selectedCEX;
        }

        getTheme(cexName) {
            const name = (cexName || '').toUpperCase();
            const cfg = window.CONFIG_CEX?.[name];
            if (cfg) return { color: cfg.WARNA || '#333', bg: '#f9fafb', icon: cfg.ICON || '' };
            return CEX_THEMES[name] || null;
        }

        enableCEXMode(cexName, reload = true) {
            if (!cexName) return;

            this.active = true;
            this.selectedCEX = cexName.toUpperCase();
            this.saveState();

            // Update URL parameter
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('chain');
                url.searchParams.set('cex', this.selectedCEX.toLowerCase());
                window.history.pushState({}, '', url.toString());
            } catch (e) {
                console.error('[CEX Mode] Failed to update URL:', e);
            }

            // Invalidate AppMode cache agar getAppMode() return type:'cex'
            if (typeof window.invalidateAppModeCache === 'function') window.invalidateAppModeCache();

            // Apply visual changes immediately
            this.applyTheme(this.selectedCEX);
            this.updateUI();

            // Notify user
            if (typeof toast !== 'undefined' && toast.info) {
                toast.info(`Mode Per CEX Aktif: ${this.selectedCEX}`);
            }

            if (reload) {
                // Refresh table logic (usually triggering refreshTokensTable in main.js)
                if (typeof window.refreshTokensTable === 'function') {
                    window.refreshTokensTable();
                }
            }

            // Refresh signal cards to use CEX color
            try {
                if (typeof window.RenderCardSignal === 'function') {
                    window.RenderCardSignal();
                }
                if (typeof window.updateSignalTheme === 'function') {
                    window.updateSignalTheme();
                }
            } catch (e) {
                console.error('[CEX Mode] Failed to refresh signal cards:', e);
            }
        }

        disableCEXMode(reload = true) {
            this.active = false;
            this.selectedCEX = null;
            this.saveState();

            // Remove URL parameter
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('cex');
                window.history.pushState({}, '', url.toString());
            } catch (e) {
                console.error('[CEX Mode] Failed to update URL:', e);
            }

            // Invalidate AppMode cache agar kembali ke multi/single mode
            if (typeof window.invalidateAppModeCache === 'function') window.invalidateAppModeCache();

            this.resetTheme();
            this.updateUI();

            if (typeof toast !== 'undefined' && toast.info) {
                toast.info('Mode Per CEX Dinonaktifkan');
            }

            if (reload) {
                if (typeof window.refreshTokensTable === 'function') {
                    window.refreshTokensTable();
                }
            }

            // Refresh signal cards to use default chain color
            try {
                if (typeof window.RenderCardSignal === 'function') {
                    window.RenderCardSignal();
                }
                if (typeof window.updateSignalTheme === 'function') {
                    window.updateSignalTheme();
                }
            } catch (e) {
                console.error('[CEX Mode] Failed to refresh signal cards:', e);
            }
            console.log('[CEX Mode] Disabled');
        }

        toggleCEXMode(cexName) {
            if (this.active && this.selectedCEX === cexName) {
                this.disableCEXMode();
            } else {
                this.enableCEXMode(cexName);
            }
        }

        applyTheme(cexName) {
            const cexConfig = window.CONFIG_CEX?.[cexName];
            const theme = cexConfig
                ? { color: cexConfig.WARNA, bg: '#f9fafb', icon: cexConfig.ICON }
                : CEX_THEMES[cexName];

            if (!theme) {
                console.warn(`[CEX Mode] No theme found for ${cexName}`);
                return;
            }

            const root = document.documentElement;
            // Set CSS variables for theme
            root.style.setProperty('--cex-primary', theme.color);
            root.style.setProperty('--cex-bg', theme.bg);
            root.style.setProperty('--theme-accent', theme.color);

            // Add class to body for scoping
            document.body.classList.add('cex-mode-active');
            document.body.classList.remove('theme-single', 'theme-multi');
            document.body.classList.add('theme-cex');
            document.body.setAttribute('data-cex', cexName);

            // Update document title
            document.title = `${cexName} SCANNER`;

            // Update favicon
            try {
                const fav = document.querySelector('link#favicon');
                if (fav && theme.icon) {
                    // Cache default favicon if not already cached
                    if (!window.DEFAULT_FAVICON_HREF) {
                        window.DEFAULT_FAVICON_HREF = fav.getAttribute('href');
                    }
                    fav.setAttribute('href', theme.icon);
                }
            } catch (e) {
                console.error('[CEX Mode] Failed to update favicon:', e);
            }

            // Update header title and label
            $('#current-chain-label').text(`[${cexName}]`).css('color', theme.color);

            // Apply CEX mode background gradient
            this.applyCEXModeStyles(theme.color);

            console.log(`[CEX Mode] Theme applied for ${cexName}:`, theme);
        }

        applyCEXModeStyles(color) {
            // Inject or update CEX mode styles
            let styleEl = document.getElementById('cex-mode-dynamic-style');
            const css = `
                /* CEX Mode Background Gradient */
                body.theme-cex { 
                    background: linear-gradient(180deg, ${color} 0%, #ffffff 45%) !important; 
                }
                /* CEX Mode Table Headers */
                body.theme-cex:not(.dark-mode) .uk-table:not(.wallet-cex-table) thead th { 
                    background: ${color} !important; 
                }
                /* CEX Mode Progress Bar */
                body.theme-cex #progress-bar { 
                    background-color: ${color} !important; 
                }
                body.theme-cex #progress-container { 
                    border: 1px solid ${color} !important; 
                }
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
        }

        resetTheme() {
            const root = document.documentElement;
            root.style.removeProperty('--cex-primary');
            root.style.removeProperty('--cex-bg');

            document.body.classList.remove('cex-mode-active', 'theme-cex');
            document.body.removeAttribute('data-cex');

            // Remove CEX mode dynamic styles
            const styleEl = document.getElementById('cex-mode-dynamic-style');
            if (styleEl) {
                styleEl.remove();
            }

            // Restore favicon to default
            try {
                const fav = document.querySelector('link#favicon');
                if (fav && window.DEFAULT_FAVICON_HREF) {
                    fav.setAttribute('href', window.DEFAULT_FAVICON_HREF);
                }
            } catch (e) {
                console.error('[CEX Mode] Failed to restore favicon:', e);
            }

            // Restore document title
            document.title = 'SCANNER';

            // Reset header
            $('#current-chain-label').text('[ALL]').css('color', '');

            // Re-apply theme for current mode (single/multi chain)
            if (typeof applyThemeForMode === 'function') {
                applyThemeForMode();
            }

            console.log('[CEX Mode] Theme reset to default');
        }

        updateUI() {
            // Logic to hide/show elements based on mode
            if (this.active) {
                // CEX mode: remove active from robot, activate selected CEX icon
                $('#multichain_scanner').removeClass('active-mode');
                $(`.cex-icon-btn`).removeClass('active');
                $(`#cex-btn-${this.selectedCEX}`).addClass('active');

                // Hide Snapshot Button & Option (Per CEX mode uses existing DB)
                $('#refresh-snapshot-btn').hide();
                $('input[name="sync-pick-mode"][value="snapshot"]').closest('label').hide();

                // Hide irrelevant menus (Manajemen Koin, Profil Modal)
                $('#ManajemenKoin').hide();
                $('#BulkModalScanner').hide();
            } else {
                // Not CEX mode: only activate robot if in multichain mode (not per-chain)
                const chainParam = (new URLSearchParams(window.location.search).get('chain') || '').toLowerCase();
                const isMultichain = !chainParam || chainParam === 'all';
                if (isMultichain) {
                    $('#multichain_scanner').addClass('active-mode');
                } else {
                    $('#multichain_scanner').removeClass('active-mode');
                }
                $('.cex-icon-btn').removeClass('active');

                // Show Snapshot Button & Option
                $('#refresh-snapshot-btn').show();
                $('input[name="sync-pick-mode"][value="snapshot"]').closest('label').show();

                // Show all menus
                $('#ManajemenKoin').show();
                $('#BulkModalScanner').show();
            }
        }

        renderToolbar() {
            const container = $('#cex-links-container');
            if (!container.length) return;

            let html = '';
            const enabledCEXs = (typeof getEnabledCEXs === 'function') ? getEnabledCEXs() : Object.keys(CEX_THEMES);

            const currentPage = (window.location.pathname.split('/').pop() || 'index.html');
            enabledCEXs.forEach(cex => {
                const iconSrc = (window.CONFIG_CEX?.[cex]?.ICON) || '';
                const cexColor = window.CONFIG_CEX?.[cex]?.WARNA || '#2563eb';

                // Check if this CEX is active
                const isActive = this.active && this.selectedCEX === cex;
                const activeClass = isActive ? 'active' : '';
                const activeStyle = isActive
                    ? `--icon-color: ${cexColor}; --icon-shadow: ${cexColor}40;`
                    : '';

                // Use href navigation (like chain icons) so page refreshes
                const href = `${currentPage}?cex=${encodeURIComponent(cex.toLowerCase())}`;
                html += `
                    <a href="${href}" class="cex-icon-btn ${activeClass}" id="cex-btn-${cex}" title="EXCHANGER ${cex}"
                       style="${activeStyle}">
                        <img class="icon" src="${iconSrc}" width="24" />
                    </a>
                `;
            });

            container.html(html);

            // Ensure robot icon state is correct
            if (this.active) {
                $('#multichain_scanner').removeClass('active-mode');
            } else {
                // Only activate robot if in multichain mode (not per-chain)
                const chainParam = (new URLSearchParams(window.location.search).get('chain') || '').toLowerCase();
                if (!chainParam || chainParam === 'all') {
                    $('#multichain_scanner').addClass('active-mode');
                }
            }
        }

        /**
         * Ambil token dari SEMUA database per-chain, lalu filter by CEX.
         * Sumber data: gabungan TOKEN_BSC + TOKEN_ERC + TOKEN_BASE + ... (semua chain).
         * Flatten: 1 row per (token, cex) → filter hanya CEX yang dipilih.
         */
        async getEnabledTokensPerCEX(cexName) {
            if (!cexName) return [];

            const targetCEX = cexName.toUpperCase();
            console.log(`[CEX Mode] Fetching tokens for ${targetCEX} from all chain databases...`);

            // getAllChainTokensFlat() = gabungkan semua per-chain DB → flatten
            const allFlat = (typeof window.getAllChainTokensFlat === 'function')
                ? window.getAllChainTokensFlat()
                : [];

            // Filter by CEX: hanya token yang cex-nya = targetCEX
            const filtered = allFlat.filter(token => {
                return String(token.cex || '').toUpperCase() === targetCEX;
            });

            console.log(`[CEX Mode] Tokens for ${targetCEX}: ${filtered.length} (from ${allFlat.length} total)`);
            return filtered;
        }
    }

    // Export to window
    window.CEXModeManager = new CEXModeManager();

    // Init on load
    $(document).ready(function () {
        // Wait for config to be ready
        setTimeout(() => {
            window.CEXModeManager.init();
        }, 500);
    });

})();

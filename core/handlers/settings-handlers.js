/**
 * =================================================================================
 * SETTINGS EVENT HANDLERS
 * =================================================================================
 *
 * This module contains all settings-related event handlers including:
 * - Settings modal open/close
 * - Settings form save
 * - Settings cancel button
 * - RPC configuration
 * - DEX delay configuration
 * - User profile settings
 *
 * Dependencies:
 * - jQuery
 * - getFromLocalStorage, saveToLocalStorage (storage utilities)
 * - renderSettingsForm (UI rendering)
 * - showMainSection (section navigation)
 * - window.RPCDatabaseMigrator (RPC migration utility)
 * - CONFIG_CHAINS, CONFIG_DEXS (chain/dex configurations)
 * - toast notifications
 * - UIkit notifications
 *
 * @module core/handlers/settings-handlers
 */

(function () {
    'use strict';

    /**
     * Settings config button handler
     * Opens settings section and renders form
     */
    $("#SettingConfig").on("click", function () {
        showMainSection('#form-setting-app');
        try { document.getElementById('form-setting-app').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { }
        renderSettingsForm();
    });

    /**
     * Cancel settings button handler
     * Restore without broadcasting to other tabs
     */
    $(document).on('click', '#btn-cancel-setting', function () {
        try { sessionStorage.setItem('APP_FORCE_RUN_NO', '1'); } catch (_) { }
        try { location.reload(); } catch (_) { }
    });

    /**
     * Save settings button handler
     * Validates and saves all settings to localStorage
     */
    $('#btn-save-setting').on('click', async function () {
        const nickname = $('#user').val().trim();
        const jedaTimeGroup = parseInt($('#jeda-time-group').val(), 10);
        const jedaKoin = parseInt($('#jeda-koin').val(), 10);
        const walletMeta = $('#walletMeta').val().trim();

        // ✅ Parse Matcha API keys (support comma and newline separated)
        const matchaApiKeysRaw = $('#matchaApiKeys').val().trim();
        console.log('[SETTINGS] Raw Matcha API Keys:', matchaApiKeysRaw);

        const matchaApiKeys = matchaApiKeysRaw
            .split(/[\n,]+/)  // Split by newline or comma
            .map(k => k.trim())
            .filter(k => k !== '')
            .join(',');  // Store as comma-separated string

        console.log('[SETTINGS] Parsed Matcha API Keys:', matchaApiKeys);
        console.log('[SETTINGS] Keys count:', matchaApiKeys.split(',').filter(k => k).length);

        const scanPerKoin = $('input[name="koin-group"]:checked').val();

        if (!nickname || nickname.length < 6) return UIkit.notification({ message: 'Nickname harus diisi (minimal 6 karakter)!', status: 'danger' });
        if (!/^[a-zA-Z\s]+$/.test(nickname)) return UIkit.notification({ message: 'Nickname hanya boleh berisi huruf dan spasi!', status: 'danger' });

        if (!jedaTimeGroup || jedaTimeGroup <= 0) return UIkit.notification({ message: 'Jeda / Group harus lebih dari 0!', status: 'danger' });
        if (!jedaKoin || jedaKoin <= 0) return UIkit.notification({ message: 'Jeda / Koin harus lebih dari 0!', status: 'danger' });
        if (!walletMeta || !walletMeta.startsWith('0x')) return UIkit.notification({ message: 'Wallet Address harus valid!', status: 'danger' });

        // ✅ VALIDATE: Matcha API keys WAJIB diisi
        if (!matchaApiKeys || matchaApiKeys === '') {
            return UIkit.notification({
                message: '⚠️ Matcha API Keys WAJIB diisi! Get from https://dashboard.0x.org',
                status: 'danger',
                timeout: 5000
            });
        }

        // ✅ Collect DEX delay values (ONLY from generated inputs, NO HARDCODE!)
        let JedaDexs = {};
        // ℹ️ 'dzap' sudah jadi Meta-DEX aggregator — dihapus dari invalidKeys (bukan regular DEX)
        const invalidKeys = ['fly', '0x', 'paraswap', '1inch']; // Legacy keys to reject

        $('.dex-delay-input').each(function () {
            const dexKey = $(this).data('dex');
            const dexValue = parseFloat($(this).val()) || 100;

            // ✅ VALIDATION: Skip invalid/legacy DEX keys
            if (invalidKeys.includes(String(dexKey).toLowerCase())) {
                console.warn(`[Settings Save] Rejecting invalid DEX key: ${dexKey}`);
                return; // Skip this iteration
            }

            // ✅ VALIDATION: Ensure DEX exists in CONFIG_DEXS
            if (!window.CONFIG_DEXS || !window.CONFIG_DEXS[dexKey]) {
                console.warn(`[Settings Save] Skipping unknown DEX (not in CONFIG_DEXS): ${dexKey}`);
                return; // Skip this iteration
            }

            JedaDexs[dexKey] = dexValue;
        });

        console.log('[Settings Save] Valid JedaDexs to save:', Object.keys(JedaDexs));

        // ✅ META-DEX: Collect per-aggregator settings (jeda + topN; enabled dikontrol dari filter scanner)
        let metaDex = {};
        if (window.CONFIG_APP?.APP?.META_DEX === true) {
            metaDex.aggregators = {};
            const aggKeys = Object.keys(window.CONFIG_APP?.META_DEX_CONFIG?.aggregators || {});
            aggKeys.forEach(aggKey => {
                const jedaDex = parseInt($(`#meta-dex-delay-${aggKey}`).val()) ||
                    (window.CONFIG_APP?.META_DEX_CONFIG?.aggregators?.[aggKey]?.jedaDex || 1000);
                metaDex.aggregators[aggKey] = { jedaDex };
            });
            metaDex.showBestOnly = $('#meta-dex-showBestOnly').is(':checked');
            metaDex.topRoutes = parseInt($('#meta-dex-topN').val()) || 3;

            // NOTE: META_DEX_SETTINGS (modal per chain) disimpan via Editor Modal DEX (bulk-modal-editor)
            console.log('[Settings Save] metaDex settings:', metaDex);
        }

        // ✅ COLLECT ENABLED CHAINS
        let enabledChains = [];
        $('.rpc-enable-toggle:checked').each(function () {
            const chain = $(this).data('chain');
            if (chain) {
                enabledChains.push(String(chain).toLowerCase());
            }
        });

        // ✅ VALIDATION: Minimal 1 chain harus aktif
        if (enabledChains.length === 0) {
            return UIkit.notification({
                message: '⚠️ Minimal 1 chain harus aktif! Aktifkan minimal 1 chain untuk menggunakan aplikasi.',
                status: 'danger',
                timeout: 5000
            });
        }

        console.log('[Settings Save] Enabled chains:', enabledChains);

        // ✅ Save enabled chains to storage IMMEDIATELY
        if (typeof saveEnabledChains === 'function') {
            saveEnabledChains(enabledChains);
            console.log('[Settings Save] Saved enabled chains to storage');
        }

        // Collect user RPC settings (NEW: simplified structure using database)
        let userRPCs = {};
        // Get initial values from database migrator (not hardcoded anymore)
        const getInitialRPC = (chain) => {
            if (window.RPCDatabaseMigrator && window.RPCDatabaseMigrator.INITIAL_RPC_VALUES) {
                return window.RPCDatabaseMigrator.INITIAL_RPC_VALUES[chain] || '';
            }
            return '';
        };

        $('.rpc-input').each(function () {
            const chain = $(this).data('chain');
            const rpc = $(this).val().trim();

            // ✅ HANYA collect RPC untuk enabled chains
            if (enabledChains.includes(chain)) {
                // Simpan RPC yang diinput user, atau gunakan initial value dari migrator jika kosong
                if (rpc) {
                    userRPCs[chain] = rpc;
                } else {
                    const initialRPC = getInitialRPC(chain);
                    if (initialRPC) {
                        userRPCs[chain] = initialRPC;
                    }
                }
            }
        });

        // ✅ VALIDATION: pastikan semua ENABLED chains punya RPC
        const missingRPCs = enabledChains.filter(chain => !userRPCs[chain]);
        if (missingRPCs.length > 0) {
            UIkit.notification({
                message: `⚠️ RPC untuk chain berikut harus diisi: ${missingRPCs.map(c => c.toUpperCase()).join(', ')}`,
                status: 'danger',
                timeout: 5000
            });
            return;
        }

        // ✅ Collect wallet addresses for each chain with VALIDATION
        let userWallets = {};
        let walletValidationError = false;

        $('.wallet-input').each(function () {
            if (walletValidationError) return; // Skip if already found error

            const chain = $(this).data('chain');
            const wallet = $(this).val().trim();
            const isChainEnabled = enabledChains.includes(chain);

            // ✅ NEW RULE: Wallet is REQUIRED for enabled chains
            if (isChainEnabled && !wallet) {
                const chainName = (CONFIG_CHAINS[chain]?.Nama_Chain || chain).toUpperCase();
                UIkit.notification({
                    message: `⚠️ Wallet address untuk ${chainName} wajib diisi! Chain ini aktif, silakan isi wallet address.`,
                    status: 'danger',
                    timeout: 5000
                });
                $(this).focus();
                walletValidationError = true;
                return;
            }

            // Wallet format validation (if wallet is provided)
            if (wallet) {
                // Determine if chain is Solana or EVM
                const isSolana = (chain === 'solana' || chain === 'sol');

                if (isSolana) {
                    // Solana validation: base58 encoding, typically 32-44 characters
                    const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
                    if (!solanaRegex.test(wallet)) {
                        UIkit.notification({
                            message: `⚠️ Wallet address untuk SOLANA tidak valid! Harus format base58 (32-44 karakter)`,
                            status: 'danger',
                            timeout: 5000
                        });
                        $(this).focus();
                        walletValidationError = true;
                        return;
                    }
                } else {
                    // EVM validation: starts with 0x, followed by 40 hex characters
                    const evmRegex = /^0x[a-fA-F0-9]{40}$/;
                    if (!evmRegex.test(wallet)) {
                        const chainName = (CONFIG_CHAINS[chain]?.Nama_Chain || chain).toUpperCase();
                        UIkit.notification({
                            message: `⚠️ Wallet address untuk ${chainName} tidak valid! Harus format EVM (0x + 40 hex)`,
                            status: 'danger',
                            timeout: 5000
                        });
                        $(this).focus();
                        walletValidationError = true;
                        return;
                    }
                }

                // If valid, save it
                userWallets[chain] = wallet;
            }
        });

        // Stop if wallet validation failed
        if (walletValidationError) return;

        console.log('[Settings Save] User wallets:', userWallets);

        // ✅ NEW: Collect CEX API Keys ONLY if checkbox is enabled
        const cexList = (typeof getEnabledCEXs === 'function') ? getEnabledCEXs() : [];
        const cexKeys = {};
        let cexSavedCount = 0;
        let validationError = false;

        cexList.forEach(cex => {
            if (validationError) return;

            const apiKey = $(`#cex_apikey_${cex}`).val()?.trim();
            const secretKey = $(`#cex_secret_${cex}`).val()?.trim();
            const passphrase = $(`#cex_passphrase_${cex}`).val()?.trim();

            // ✅ VALIDATION: If CEX is enabled (in cexList), API Key & Secret are MANDATORY
            if (!apiKey || !secretKey) {
                UIkit.notification({
                    message: `⚠️ API Key & Secret untuk ${cex} tidak boleh kosong!`,
                    status: 'danger',
                    timeout: 4000
                });
                $(`#cex_apikey_${cex}`).focus();
                validationError = true;
                return;
            }

            if (apiKey && secretKey) {
                cexKeys[cex] = {
                    ApiKey: apiKey,
                    ApiSecret: secretKey
                };

                if (cex === 'KUCOIN' || cex === 'BITGET' || cex === 'OKX') {
                    if (passphrase) {
                        cexKeys[cex].Passphrase = passphrase;
                    } else {
                        UIkit.notification({
                            message: `⚠️ ${cex} memerlukan Passphrase!`,
                            status: 'danger',
                            timeout: 4000
                        });
                        $(`#cex_passphrase_${cex}`).focus();
                        validationError = true;
                        return;
                    }
                }
                cexSavedCount++;
            }
        });

        if (validationError) return; // Stop saving if validation fails

        const settingData = {
            nickname, jedaTimeGroup, jedaKoin, walletMeta,
            matchaApiKeys,
            scanPerKoin: parseInt(scanPerKoin, 10),
            JedaDexs,
            metaDex,      // ✅ META-DEX per-aggregator settings
            userRPCs,
            userWallets
        };

        console.log('[SETTINGS] Data to save:', settingData);
        console.log('[SETTINGS] matchaApiKeys in data:', settingData.matchaApiKeys);

        saveToLocalStorage('SETTING_SCANNER', settingData);

        // ✅ Save CEX API keys to IndexedDB (separate from SETTING_SCANNER)
        if (Object.keys(cexKeys).length > 0) {
            const encryptedKeys = (typeof appEncrypt === 'function') ? appEncrypt(cexKeys) : cexKeys;
            saveToLocalStorage('CEX_API_KEYS', encryptedKeys || cexKeys);
            saveToLocalStorage('CEX_KEYS_MIGRATED', true);
            console.log(`[SETTINGS] Saved ${cexSavedCount} CEX API key(s) to IndexedDB`);

            // Cleanup legacy localStorage MULTI_* keys (jika masih ada)
            try {
                const allCexList = (typeof getEnabledCEXs === 'function') ? getEnabledCEXs() : [];
                allCexList.forEach(cex => {
                    localStorage.removeItem(`MULTI_apikey${cex}`);
                    localStorage.removeItem(`MULTI_secretkey${cex}`);
                    localStorage.removeItem(`MULTI_passphrase${cex}`);
                });
                localStorage.removeItem('CEX_KEYS_MIGRATED'); // hapus flag lama
            } catch (_) { }
            console.log('[SETTINGS] Cleaned up legacy localStorage keys');
        }

        try { setLastAction("SIMPAN SETTING"); } catch (_) { }

        const successMsg = cexSavedCount > 0
            ? `✅ SETTING SCANNER & ${cexSavedCount} CEX API KEY BERHASIL DISIMPAN`
            : '✅ SETTING SCANNER BERHASIL DISIMPAN';

        if (typeof UIkit !== 'undefined' && UIkit.notification) {
            UIkit.notification(successMsg, { status: 'success' });
        } else if (typeof toast !== 'undefined' && toast.success) {
            toast.success(successMsg);
        }

        // ✅ Refresh toolbar chain icons to reflect enabled chains BEFORE reload
        try {
            if (typeof renderChainLinks === 'function') {
                const params = new URLSearchParams(window.location.search);
                const activeChain = (params.get('chain') || 'all').toLowerCase();
                renderChainLinks(activeChain);
                console.log('[SETTINGS] Toolbar chain icons refreshed with enabled chains');
            }
        } catch (e) {
            console.warn('[SETTINGS] Failed to refresh toolbar:', e.message);
        }

        setTimeout(() => location.reload(), 2000);
    });

})();

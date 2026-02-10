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
        const invalidKeys = ['fly', '0x', 'dzap', 'paraswap', '1inch']; // Legacy keys to reject

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

            // Simpan RPC yang diinput user, atau gunakan initial value dari migrator jika kosong
            if (rpc) {
                userRPCs[chain] = rpc;
            } else {
                const initialRPC = getInitialRPC(chain);
                if (initialRPC) {
                    userRPCs[chain] = initialRPC;
                }
            }
        });

        // Validasi: pastikan semua chain punya RPC
        const missingRPCs = Object.keys(CONFIG_CHAINS).filter(chain => !userRPCs[chain]);
        if (missingRPCs.length > 0) {
            UIkit.notification({
                message: `RPC untuk chain berikut harus diisi: ${missingRPCs.join(', ')}`,
                status: 'danger',
                timeout: 5000
            });
            return;
        }

        // ✅ NEW: Collect CEX API Keys (dynamically from CONFIG_CEX)
        const cexList = (typeof CONFIG_CEX !== 'undefined') ? Object.keys(CONFIG_CEX) : [];
        const cexKeys = {};
        let cexSavedCount = 0;

        cexList.forEach(cex => {
            const apiKey = $(`#cex_apikey_${cex}`).val()?.trim();
            const secretKey = $(`#cex_secret_${cex}`).val()?.trim();
            const passphrase = $(`#cex_passphrase_${cex}`).val()?.trim();

            if (apiKey && secretKey) {
                cexKeys[cex] = {
                    ApiKey: apiKey,
                    ApiSecret: secretKey
                };

                if (cex === 'KUCOIN' || cex === 'BITGET') {
                    if (passphrase) {
                        cexKeys[cex].Passphrase = passphrase;
                        cexSavedCount++;
                    } else {
                        UIkit.notification({
                            message: `⚠️ ${cex} memerlukan Passphrase!`,
                            status: 'warning',
                            timeout: 3000
                        });
                        return;
                    }
                } else {
                    cexSavedCount++;
                }
            }
        });

        const settingData = {
            nickname, jedaTimeGroup, jedaKoin, walletMeta,
            matchaApiKeys,
            scanPerKoin: parseInt(scanPerKoin, 10),
            JedaDexs,
            userRPCs
        };

        console.log('[SETTINGS] Data to save:', settingData);
        console.log('[SETTINGS] matchaApiKeys in data:', settingData.matchaApiKeys);

        saveToLocalStorage('SETTING_SCANNER', settingData);

        // ✅ Save CEX API keys to IndexedDB (separate from SETTING_SCANNER)
        if (Object.keys(cexKeys).length > 0) {
            saveToLocalStorage('CEX_API_KEYS', cexKeys);
            localStorage.setItem('CEX_KEYS_MIGRATED', 'true');
            console.log(`[SETTINGS] Saved ${cexSavedCount} CEX API key(s) to IndexedDB`);

            // Cleanup legacy localStorage MULTI_* keys
            // ✅ Get CEX list dynamically from CONFIG_CEX (no hardcode!)
            const allCexList = (typeof CONFIG_CEX !== 'undefined') ? Object.keys(CONFIG_CEX) : [];
            allCexList.forEach(cex => {
                localStorage.removeItem(`MULTI_apikey${cex}`);
                localStorage.removeItem(`MULTI_secretkey${cex}`);
                localStorage.removeItem(`MULTI_passphrase${cex}`);
            });
            console.log('[SETTINGS] Cleaned up legacy localStorage MULTI_* keys');
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
        setTimeout(() => location.reload(), 2000);
    });

})();

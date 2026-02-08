/**
 * =================================================================================
 * TOKEN MANAGEMENT EVENT HANDLERS
 * =================================================================================
 *
 * This module contains all token CRUD event handlers including:
 * - Token add/edit/delete operations
 * - Token status toggle
 * - Token export/import
 * - Token form submission
 * - Bulk token operations
 * - Copy token to multichain
 * - Global delegated edit/delete handlers
 *
 * Dependencies:
 * - jQuery
 * - getAppMode, getTokensChain, getTokensMulti (data access)
 * - setTokensChain, setTokensMulti (data persistence)
 * - openEditModalById, deleteTokenById (token utilities)
 * - renderTokenManagementList, refreshTokensTable (UI rendering)
 * - setLastAction (history logging)
 * - toast notifications
 * - UIkit modal
 *
 * @module core/handlers/token-handlers
 */

(function () {
    'use strict';

    /**
     * Global delegated delete handler
     * Resilient during scanning and rerenders
     */
    $(document).off('click.globalDelete').on('click.globalDelete', '.delete-token-button', function () {
        try {
            const $el = $(this);
            const id = String($el.data('id'));
            if (!id) return;
            const symIn = String($el.data('symbol-in') || '').toUpperCase();
            const symOut = String($el.data('symbol-out') || '').toUpperCase();
            const chain = String($el.data('chain') || '').toUpperCase();
            const cex = String($el.data('cex') || '').toUpperCase();
            const detail = `• Token: ${symIn || '-'}/${symOut || '-'}\n• Chain: ${chain || '-'}\n• CEX: ${cex || '-'}`;
            const ok = confirm(`🗑️ Hapus Koin Ini?\n\n${detail}\n\n⚠️ Tindakan ini tidak dapat dibatalkan. Lanjutkan?`);
            if (!ok) return;

            // Cek apakah scanning sedang berjalan
            const isScanning = (typeof window.isThisTabScanning === 'function' && window.isThisTabScanning()) || false;

            const mode = getAppMode();
            if (mode.type === 'single') {
                let list = getTokensChain(mode.chain);
                const before = list.length;
                list = list.filter(t => String(t.id) !== id);
                setTokensChain(mode.chain, list);
                if (list.length < before) {
                    try { setLastAction('HAPUS KOIN'); } catch (_) { }
                    if (typeof toast !== 'undefined' && toast.info) toast.info(`PROSES HAPUS KOIN ${symIn} VS ${symOut} BERHASIL`);

                    // FIX: Jika sedang scanning, HANYA update total koin tanpa refresh tabel
                    if (isScanning) {
                        // Update HANYA angka total koin di header manajemen (tanpa re-render tabel)
                        try { if (typeof updateTokenStatsOnly === 'function') updateTokenStatsOnly(); } catch (_) { }
                        // Update HANYA angka "TOTAL KOIN" di filter card (tanpa re-render filter)
                        try { if (typeof updateTotalKoinOnly === 'function') updateTotalKoinOnly(); } catch (_) { }
                        // FIX: Update progress bar total token
                        try { if (typeof window.decrementScanTotalTokens === 'function') window.decrementScanTotalTokens(); } catch (_) { }
                    } else {
                        // Jika TIDAK scanning, update total + refresh tabel
                        try { if (typeof renderTokenManagementList === 'function') renderTokenManagementList(); } catch (_) { }
                        try { if (typeof loadAndDisplaySingleChainTokens === 'function') loadAndDisplaySingleChainTokens(); } catch (_) { }
                    }
                }
                try { $el.closest('tr').addClass('row-hidden'); } catch (_) { }
            } else {
                let list = getTokensMulti();
                const before = list.length;
                list = list.filter(t => String(t.id) !== id);
                setTokensMulti(list);
                if (list.length < before) {
                    try { setLastAction('HAPUS KOIN'); } catch (_) { }
                    if (typeof toast !== 'undefined' && toast.info) toast.info(`PROSES HAPUS KOIN ${symIn} VS ${symOut} BERHASIL`);

                    // FIX: Jika sedang scanning, HANYA update total koin tanpa refresh tabel
                    if (isScanning) {
                        // Update HANYA angka total koin di header manajemen (tanpa re-render tabel)
                        try { if (typeof updateTokenStatsOnly === 'function') updateTokenStatsOnly(); } catch (_) { }
                        // Update HANYA angka "TOTAL KOIN" di filter card (tanpa re-render filter)
                        try { if (typeof updateTotalKoinOnly === 'function') updateTotalKoinOnly(); } catch (_) { }
                        // FIX: Update progress bar total token
                        try { if (typeof window.decrementScanTotalTokens === 'function') window.decrementScanTotalTokens(); } catch (_) { }
                    } else {
                        // Jika TIDAK scanning, update total + refresh tabel
                        try { if (typeof renderTokenManagementList === 'function') renderTokenManagementList(); } catch (_) { }
                        try { if (typeof refreshTokensTable === 'function') refreshTokensTable(); } catch (_) { }
                    }
                }
                try { $el.closest('tr').addClass('row-hidden'); } catch (_) { }
            }
        } catch (e) { console.error('Delete error:', e); if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal menghapus koin'); }
    });

    /**
     * Global delegated edit handler
     * Newly rendered rows always work
     */
    $(document).off('click.globalEdit').on('click.globalEdit', '.edit-token-button', function () {
        try {
            const id = String($(this).data('id') || '');
            if (!id) { if (typeof toast !== 'undefined' && toast.error) toast.error('ID token tidak ditemukan'); return; }
            if (typeof openEditModalById === 'function') openEditModalById(id);
            else if (typeof toast !== 'undefined' && toast.error) toast.error('Fungsi edit tidak tersedia');
        } catch (e) {
            // console.error('Gagal membuka modal edit:', e);
            if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal membuka form edit');
        }
    });

    /**
     * New token button handler
     * Opens empty edit modal with defaults
     */
    $(document).on('click', '#btnNewToken', () => {
        const keys = Object.keys(window.CONFIG_CHAINS || {});
        const firstChainWithDex = keys.find(k => {
            const d = CONFIG_CHAINS[k]?.DEXS;
            return Array.isArray(d) ? d.length > 0 : !!(d && Object.keys(d).length);
        }) || keys[0] || '';

        const empty = { id: Date.now().toString(), chain: String(firstChainWithDex).toLowerCase(), status: true, selectedCexs: [], selectedDexs: [], dataDexs: {}, dataCexs: {} };

        $('#multiTokenIndex').val(empty.id);
        $('#inputSymbolToken, #inputSCToken, #inputSymbolPair, #inputSCPair').val('');
        $('#inputDesToken, #inputDesPair').val('');
        setStatusRadios(true);

        const $sel = $('#FormEditKoinModal #mgrChain');
        populateChainSelect($sel, empty.chain);

        // Enforce chain select by mode + theme the modal
        try {
            const m = getAppMode();
            if (m.type === 'single') {
                const c = String(m.chain).toLowerCase();
                $sel.val(c).prop('disabled', true).attr('title', 'Per-chain mode: Chain terkunci');
                if (typeof applyEditModalTheme === 'function') applyEditModalTheme(c);
                $('#CopyToMultiBtn').show();
            } else {
                $sel.prop('disabled', false).attr('title', '');
                if (typeof applyEditModalTheme === 'function') applyEditModalTheme(null);
                $('#CopyToMultiBtn').hide();
            }
        } catch (_) { }

        const currentChain = String($sel.val() || empty.chain).toLowerCase();
        const baseToken = { ...empty, chain: currentChain };

        buildCexCheckboxForKoin(baseToken);
        buildDexCheckboxForKoin(baseToken);

        $sel.off('change.rebuildDexAdd').on('change.rebuildDexAdd', function () {
            const newChain = String($(this).val() || '').toLowerCase();
            buildDexCheckboxForKoin({ ...baseToken, chain: newChain });
            try { if (typeof applyEditModalTheme === 'function') applyEditModalTheme(newChain); } catch (_) { }
        });

        if (window.UIkit?.modal) UIkit.modal('#FormEditKoinModal').show();
    });

    /**
     * Export tokens button handler
     */
    $(document).on('click', '#btnExportTokens', function () {
        try { downloadTokenScannerCSV(); } catch (e) { console.error(e); }
    });

    /**
     * Import tokens button handler
     */
    $(document).on('click', '#btnImportTokens', function () {
        const $inp = $('#uploadJSON');
        if ($inp.length) $inp.trigger('click');
    });

    /**
     * Token form submission handler
     * Handles both add and edit operations
     */
    $(document).on('submit', '#multiTokenForm', function (e) {
        e.preventDefault();
        const id = $('#multiTokenIndex').val();
        if (!id) return (typeof toast !== 'undefined' && toast.error) ? toast.error('ID token tidak ditemukan.') : undefined;

        // ========== LOADING INDICATOR ==========
        const $saveBtn = $('#SaveEditkoin');
        const originalBtnHtml = $saveBtn.html();
        $saveBtn.prop('disabled', true).html('<span uk-spinner="ratio: 0.6"></span> Menyimpan...');

        // Show overlay for visual feedback
        let overlayId = null;
        try {
            if (window.AppOverlay) {
                overlayId = window.AppOverlay.show('Memperbarui data koin...');
            }
        } catch (_) { }
        // ======================================

        const updatedToken = {
            id,
            symbol_in: ($('#inputSymbolToken').val() || '').trim(),
            des_in: Number($('#inputDesToken').val() || 0),
            sc_in: ($('#inputSCToken').val() || '').trim(),
            symbol_out: ($('#inputSymbolPair').val() || '').trim(),
            des_out: Number($('#inputDesPair').val() || 0),
            sc_out: ($('#inputSCPair').val() || '').trim(),
            chain: String($('#FormEditKoinModal #mgrChain').val() || '').toLowerCase(),
            status: readStatusRadio(),
            ...readCexSelectionFromForm(),
            ...readDexSelectionFromForm()
        };

        if (!updatedToken.symbol_in || !updatedToken.symbol_out) {
            // Restore button state
            $saveBtn.prop('disabled', false).html(originalBtnHtml);
            if (overlayId && window.AppOverlay) window.AppOverlay.hide(overlayId);
            return (typeof toast !== 'undefined' && toast.warning) ? toast.warning('Symbol Token & Pair tidak boleh kosong') : undefined;
        }

        const m = getAppMode();
        let tokens = (m.type === 'single') ? getTokensChain(m.chain) : getTokensMulti();
        const idx = tokens.findIndex(t => String(t.id) === String(id));

        const buildDataCexs = (prev = {}) => {
            const obj = {};
            (updatedToken.selectedCexs || []).forEach(cx => {
                const up = String(cx).toUpperCase();
                obj[up] = prev[up] || { feeWDToken: 0, feeWDPair: 0, depositToken: false, withdrawToken: false, depositPair: false, withdrawPair: false };
            });
            return obj;
        };
        updatedToken.dataCexs = buildDataCexs(idx !== -1 ? tokens[idx].dataCexs : {});

        if (idx !== -1) {
            tokens[idx] = { ...tokens[idx], ...updatedToken };
        } else {
            tokens.push(updatedToken);
        }

        if (m.type === 'single') setTokensChain(m.chain, tokens); else setTokensMulti(tokens);

        // ========== TIDAK Auto-Refresh Setelah Simpan ==========
        setTimeout(() => {
            try {
                if (typeof toast !== 'undefined' && toast.success) {
                    const msg = idx !== -1 ? 'Perubahan token berhasil disimpan' : 'Token baru berhasil ditambahkan';
                    toast.success(msg);
                }

                // Restore button state
                $saveBtn.prop('disabled', false).html(originalBtnHtml);

                // Hide overlay
                if (overlayId && window.AppOverlay) {
                    window.AppOverlay.hide(overlayId);
                }

                // Token management list tetap di-refresh (tidak mengganggu)
                try {
                    renderTokenManagementList();
                } catch (e) {
                    console.error('[Update Token] Management list refresh error:', e);
                }

                try {
                    const action = (idx !== -1) ? 'UBAH KOIN' : 'TAMBAH KOIN';
                    setLastAction(`${action}`);
                } catch (_) { setLastAction('UBAH KOIN'); }

                if (window.UIkit?.modal) UIkit.modal('#FormEditKoinModal').hide();
            } catch (e) {
                console.error('[Update Token] Error:', e);
                $saveBtn.prop('disabled', false).html(originalBtnHtml);
                if (overlayId && window.AppOverlay) window.AppOverlay.hide(overlayId);
            }
        }, 50); // Small delay for smooth UI transition
        // ================================================
    });

    /**
     * Delete token from modal handler
     */
    $(document).on('click', '#HapusEditkoin', function (e) {
        e.preventDefault();
        const id = $('#multiTokenIndex').val();
        if (!id) return (typeof toast !== 'undefined' && toast.error) ? toast.error('ID token tidak ditemukan.') : undefined;

        // Compose detailed confirmation message
        const symIn = String(($('#inputSymbolToken').val() || '')).trim().toUpperCase();
        const symOut = String(($('#inputSymbolPair').val() || '')).trim().toUpperCase();
        const mode = getAppMode();
        const chainSel = String($('#FormEditKoinModal #mgrChain').val() || (mode.type === 'single' ? mode.chain : '')).toUpperCase();
        let cexList = '-';
        let dexList = '-';
        try {
            const cex = (readCexSelectionFromForm()?.selectedCexs || []).map(x => String(x).toUpperCase());
            const dex = (readDexSelectionFromForm()?.selectedDexs || []).map(x => String(x).toUpperCase());
            cexList = cex.length ? cex.join(', ') : '-';
            dexList = dex.length ? dex.join(', ') : '-';
        } catch (_) { }
        const detailMsg = `⚠️ INGIN HAPUS DATA KOIN INI?\n\n` +
            `- Pair : ${symIn || '?'} / ${symOut || '?'}\n` +
            `- Chain: ${chainSel || '?'}\n` +
            `- CEX  : ${cexList}\n` +
            `- DEX  : ${dexList}`;

        if (confirm(detailMsg)) {
            deleteTokenById(id);
            if (typeof toast !== 'undefined' && toast.success) toast.success(`KOIN TERHAPUS`);
            if (window.UIkit?.modal) UIkit.modal('#FormEditKoinModal').hide();
            // Live refresh current view without reloading page (works during scanning)
            try {
                const m = getAppMode();
                if (m.type === 'single') { loadAndDisplaySingleChainTokens(); }
                else { refreshTokensTable(); }
                renderTokenManagementList();
            } catch (_) { }
        }
    });

    /**
     * Copy token to multichain handler
     * Only available in per-chain edit modal
     */
    $(document).on('click', '#CopyToMultiBtn', function () {
        try {
            const mode = getAppMode();
            if (mode.type !== 'single') {
                if (typeof toast !== 'undefined' && toast.info) toast.info('Tombol ini hanya tersedia pada mode per-chain.');
                return;
            }
            const chainKey = String(mode.chain).toLowerCase();
            const id = $('#multiTokenIndex').val();
            let singleTokens = getTokensChain(chainKey);
            const idx = singleTokens.findIndex(t => String(t.id) === String(id));
            const prevDataCexs = idx !== -1 ? (singleTokens[idx].dataCexs || {}) : {};

            const tokenObj = {
                id: id || Date.now().toString(),
                symbol_in: ($('#inputSymbolToken').val() || '').trim(),
                des_in: Number($('#inputDesToken').val() || 0),
                sc_in: ($('#inputSCToken').val() || '').trim(),
                symbol_out: ($('#inputSymbolPair').val() || '').trim(),
                des_out: Number($('#inputDesPair').val() || 0),
                sc_out: ($('#inputSCPair').val() || '').trim(),
                chain: chainKey,
                status: readStatusRadio(),
                ...readCexSelectionFromForm(),
                ...readDexSelectionFromForm()
            };

            if (!tokenObj.symbol_in || !tokenObj.symbol_out) return (typeof toast !== 'undefined' && toast.warning) ? toast.warning('Symbol Token & Pair tidak boleh kosong') : undefined;
            // Removed 4-DEX selection cap: allow any number of DEX

            // Build dataCexs preserving previous per-chain CEX details if available
            const dataCexs = {};
            (tokenObj.selectedCexs || []).forEach(cx => {
                const up = String(cx).toUpperCase();
                dataCexs[up] = prevDataCexs[up] || { feeWDToken: 0, feeWDPair: 0, depositToken: false, withdrawToken: false, depositPair: false, withdrawPair: false };
            });
            tokenObj.dataCexs = dataCexs;

            // ✅ CEX/DEX MERGE LOGIC: Check for existing token by chain + pair (NOT CEX)
            // In multichain mode, same token can exist with multiple CEXs
            let multi = getTokensMulti();
            const matchIdx = multi.findIndex(t =>
                String(t.chain).toLowerCase() === chainKey &&
                String(t.symbol_in || '').toUpperCase() === tokenObj.symbol_in.toUpperCase() &&
                String(t.symbol_out || '').toUpperCase() === tokenObj.symbol_out.toUpperCase()
            );

            let proceed = true;
            if (matchIdx !== -1) {
                // Token exists - MERGE CEX and DEX lists
                const existingToken = multi[matchIdx];
                const existingCexs = (existingToken.selectedCexs || []).map(c => String(c).toUpperCase());
                const newCexs = (tokenObj.selectedCexs || []).map(c => String(c).toUpperCase());
                const existingDexs = (existingToken.selectedDexs || []).map(d => String(d).toLowerCase());
                const newDexs = (tokenObj.selectedDexs || []).map(d => String(d).toLowerCase());

                // Create merged sets (remove duplicates)
                const mergedCexs = [...new Set([...existingCexs, ...newCexs])];
                const mergedDexs = [...new Set([...existingDexs, ...newDexs])];

                // Build detailed confirmation message
                const detailMsg =
                    `📦 TOKEN SUDAH ADA - MERGE CEX & DEX\n\n` +
                    `Token: ${tokenObj.symbol_in}/${tokenObj.symbol_out}\n` +
                    `Chain: ${String(chainKey).toUpperCase()}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `CEX EXISTING: ${existingCexs.join(', ') || 'Tidak ada'}\n` +
                    `CEX IMPORT  : ${newCexs.join(', ') || 'Tidak ada'}\n` +
                    `CEX MERGED  : ${mergedCexs.join(', ')}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `DEX EXISTING: ${existingDexs.join(', ') || 'Tidak ada'}\n` +
                    `DEX IMPORT  : ${newDexs.join(', ') || 'Tidak ada'}\n` +
                    `DEX MERGED  : ${mergedDexs.join(', ')}\n\n` +
                    `✅ Lanjutkan MERGE?`;

                proceed = confirm(detailMsg);
                if (!proceed) return;

                // MERGE: Update token with merged CEX/DEX lists
                // Preserve existing dataCexs and merge with new ones
                const mergedDataCexs = { ...(existingToken.dataCexs || {}) };
                newCexs.forEach(cx => {
                    if (!mergedDataCexs[cx]) {
                        mergedDataCexs[cx] = dataCexs[cx] || {
                            feeWDToken: 0, feeWDPair: 0,
                            depositToken: false, withdrawToken: false,
                            depositPair: false, withdrawPair: false
                        };
                    }
                });

                // Merge dataDexs
                const mergedDataDexs = { ...(existingToken.dataDexs || {}), ...(tokenObj.dataDexs || {}) };

                multi[matchIdx] = {
                    ...existingToken,
                    ...tokenObj,
                    selectedCexs: mergedCexs,
                    selectedDexs: mergedDexs,
                    dataCexs: mergedDataCexs,
                    dataDexs: mergedDataDexs
                };
            } else {
                // New token - add to multichain
                multi.push(tokenObj);
            }

            setTokensMulti(multi);
            if (typeof toast !== 'undefined' && toast.success) {
                const action = matchIdx !== -1 ? 'di-MERGE dengan' : 'disalin ke';
                toast.success(`Koin berhasil ${action} mode Multichain`);
            }
            $('#FormEditKoinModal').hide();
            try { if (typeof renderFilterCard === 'function') renderFilterCard(); } catch (_) { }
        } catch (e) {
            // console.error('Copy to Multichain failed:', e);
            if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal menyalin ke Multichain');
        }
    });

    /**
     * Management table edit button handler
     */
    $('#mgrTbody').on('click', '.mgrEdit', function () {
        try {
            const id = $(this).data('id');
            if (id) {
                openEditModalById(id);
            } else {
                if (typeof toast !== 'undefined' && toast.error) toast.error('ID token tidak ditemukan pada tombol edit.');
            }
        } catch (e) {
            // console.error('Gagal membuka modal edit dari manajemen list:', e);
            if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal membuka form edit.');
        }
    });

    /**
     * Management table status toggle handler
     */
    $(document).on('change', '.mgrStatus', function () {
        const id = String($(this).data('id'));
        const val = $(this).val() === 'true';
        const m = getAppMode();
        let tokens = (m.type === 'single') ? getTokensChain(m.chain) : getTokensMulti();
        const idx = tokens.findIndex(t => String(t.id) === id);
        if (idx !== -1) {
            tokens[idx].status = val;
            if (m.type === 'single') setTokensChain(m.chain, tokens); else setTokensMulti(tokens);
            if (typeof toast !== 'undefined' && toast.success) toast.success(`Status diubah ke ${val ? 'ON' : 'OFF'}`);
            try {
                const chainLbl = String(tokens[idx]?.chain || (m.type === 'single' ? m.chain : 'all')).toUpperCase();
                const pairLbl = `${String(tokens[idx]?.symbol_in || '').toUpperCase()}/${String(tokens[idx]?.symbol_out || '').toUpperCase()}`;
                setLastAction(`UBAH STATUS KOIN`);
            } catch (_) { setLastAction('UBAH STATUS KOIN'); }
        }
    });

})();

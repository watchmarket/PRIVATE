/**
 * =================================================================================
 * UI EVENT HANDLERS
 * =================================================================================
 *
 * This module contains general UI event handlers including:
 * - Dark mode toggle
 * - Tab/section navigation
 * - Modal open/close handlers
 * - Position check handlers
 * - Scan log toggle
 * - Token management button
 * - Backup/restore modal handlers
 * - History modal handlers
 * - Database viewer handlers
 *
 * Dependencies:
 * - jQuery
 * - getAppState, setAppState (state management)
 * - applyThemeForMode (theme utility)
 * - showMainSection (section navigation)
 * - renderTokenManagementList (token rendering)
 * - renderHistoryTable (history rendering)
 * - toast notifications
 * - UIkit modal
 *
 * @module core/handlers/ui-handlers
 */

(function() {
    'use strict';

    /**
     * Dark mode toggle handler
     * Block toggling while scanning is running
     */
    $('#darkModeToggle').on('click', function() {
        // Block toggling while scanning is running
        try {
            const st = (typeof getAppState === 'function') ? getAppState() : { run: 'NO' };
            if (String(st.run||'NO').toUpperCase() === 'YES') return; // refactor: disable dark-mode toggle during scan
        } catch(_) {}
        const body = $('body');
        body.toggleClass('dark-mode uk-dark');
        const isDark = body.hasClass('dark-mode');
        setAppState({ darkMode: isDark }); // saved into FILTER_*
        if (typeof applyThemeForMode === 'function') applyThemeForMode();
        try { if (typeof window.updateSignalTheme === 'function') window.updateSignalTheme(); } catch(_) {}
        // Re-apply filter colors after dark mode toggle
        try { if (typeof applyFilterColors === 'function') applyFilterColors(); } catch(_) {}
    });

    /**
     * Console Log Summary toggle (default OFF)
     */
    try {
        const savedScanLog = getFromLocalStorage('SCAN_LOG_ENABLED', false);
        const isOn = (savedScanLog === true) || (String(savedScanLog).toLowerCase() === 'true') || (String(savedScanLog) === '1');
        window.SCAN_LOG_ENABLED = !!isOn;
        const $tgl = $('#toggleScanLog');
        if ($tgl.length) $tgl.prop('checked', !!isOn);
        $(document).off('change.scanlog').on('change.scanlog', '#toggleScanLog', function(){
            const v = !!$(this).is(':checked');
            window.SCAN_LOG_ENABLED = v;
            try { saveToLocalStorage('SCAN_LOG_ENABLED', v); } catch(_) {}
        });
        // Keep it enabled even during scan gating
        try { $('#toggleScanLog').prop('disabled', false).css({ opacity: '', pointerEvents: '' }); } catch(_) {}
    } catch(_) {}

    /**
     * Position check handler
     * Prevent deselecting all positions
     */
    $('.posisi-check').on('change', function () {
        if ($('.posisi-check:checked').length === 0) {
            $(this).prop('checked', true);
            if (typeof toast !== 'undefined' && toast.error) toast.error("Minimal salah satu POSISI harus aktif!");
            return;
        }
        const label = $(this).val() === 'Actionkiri' ? 'KIRI' : 'KANAN';
        const status = $(this).is(':checked') ? 'AKTIF' : 'NONAKTIF';
        if (typeof toast !== 'undefined' && toast.info) toast.info(`POSISI ${label} ${status}`);
    });

    /**
     * Token management button handler
     * Opens token management section
     */
    $('#ManajemenKoin').on('click', function(e){
      e.preventDefault();
      showMainSection('#token-management');
      // Filter card is part of the main scanner view, so we need to show it separately if needed with management
      $('#filter-card').show();
      try {
        if (window.SnapshotModule && typeof window.SnapshotModule.hide === 'function') {
            window.SnapshotModule.hide();
        }
      } catch(_) {}
      renderTokenManagementList();
    });

    /**
     * Management search input handler
     * Filters token management table in real-time
     */
    $(document).on('input', '#mgrSearchInput', function() {
        // Debounce search for better performance
        clearTimeout(window.mgrSearchDebounce);
        window.mgrSearchDebounce = setTimeout(() => {
            if (typeof renderTokenManagementList === 'function') {
                renderTokenManagementList();
            }
        }, 300);
    });

    /**
     * Backup modal button handler
     */
    $(document).on('click', '#openBackupModal', function(e){
        e.preventDefault();
        try { UIkit.modal('#backup-modal').show(); } catch(_) {}
    });

    /**
     * History modal button handler
     */
    $(document).on('click', '#openHistoryModal', function(e){
        e.preventDefault();
        try { UIkit.modal('#history-modal').show(); renderHistoryTable(); } catch(_) {}
    });

    /**
     * Database viewer button handler
     */
    $(document).on('click', '#openDatabaseViewer', function(e){
        e.preventDefault();
        try { if(window.App?.DatabaseViewer?.show) window.App.DatabaseViewer.show(); } catch(err) { console.error('Database Viewer error:', err); }
    });

    /**
     * History table filters change handler
     */
    $(document).on('change', '#histMode, #histChain, #histSearch', function(){
        renderHistoryTable();
    });

    /**
     * History select all checkbox handler
     */
    $(document).on('click', '#histSelectAll', function(){
        const on=this.checked;
        $('#histTbody .histRowChk').prop('checked', on);
    });

    /**
     * History delete selected handler
     */
    $(document).on('click', '#histDeleteSelected', async function(){
      try {
        const ids = $('#histTbody .histRowChk:checked').map(function(){ return $(this).closest('tr').data('id'); }).get();
        if (!ids.length) { if (typeof toast !== 'undefined' && toast.info) toast.info('Pilih data riwayat terlebih dahulu.'); return; }
        const res = await (window.deleteHistoryByIds ? window.deleteHistoryByIds(ids) : Promise.resolve({ ok:false }));
        if (res.ok) { if (typeof toast !== 'undefined' && toast.success) toast.success(`Hapus ${res.removed||ids.length} entri riwayat.`); renderHistoryTable(); }
        else { if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal menghapus riwayat.'); }
      } catch(e) { if (typeof toast !== 'undefined' && toast.error) toast.error('Error saat menghapus riwayat.'); }
    });

    /**
     * History clear all handler
     */
    $(document).on('click', '#histClearAll', async function(){
      try {
        if (!confirm('Bersihkan semua riwayat?')) return;
        const ok = await (window.clearHistoryLog ? window.clearHistoryLog() : Promise.resolve(false));
        if (ok) { if (typeof toast !== 'undefined' && toast.success) toast.success('Riwayat dibersihkan.'); renderHistoryTable(); }
        else { if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal membersihkan riwayat.'); }
      } catch(e) { if (typeof toast !== 'undefined' && toast.error) toast.error('Error saat membersihkan riwayat.'); }
    });

    /**
     * Backup database button handler
     */
    $(document).on('click', '#btnBackupDb', async function(){
        try {
            const payload = await (window.exportIDB ? window.exportIDB() : Promise.resolve(null));
            if (!payload || !payload.items) { if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal membuat backup.'); return; }
            const filename = `${MAIN_APP_NAME_SAFE}_BACKUP_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
            const ok = window.downloadJSON ? window.downloadJSON(filename, payload) : false;
            if (ok) {
                if (typeof toast !== 'undefined' && toast.success) toast.success(`Backup berhasil. ${payload.count||payload.items.length} item disalin.`);
                try { setLastAction('BACKUP DATABASE'); } catch(_) {}
                try { $('#backupSummary').text(`Backup: ${payload.items.length} item pada ${new Date().toLocaleString('id-ID',{hour12:false})}`); } catch(_) {}
            } else {
                if (typeof toast !== 'undefined' && toast.error) toast.error('Gagal mengunduh file backup.');
            }
        } catch(e) {
            // console.error('Backup error:', e);
            if (typeof toast !== 'undefined' && toast.error) toast.error('Terjadi kesalahan saat backup.');
            try { setLastAction('BACKUP DATABASE', 'error', { error: String(e && e.message || e) }); } catch(_) {}
        }
    });

    /**
     * Restore database button handler (trigger file input)
     */
    $(document).on('click', '#btnRestoreDb', function(){
        $('#restoreFileInput').trigger('click');
    });

    /**
     * Restore database file input change handler
     */
    $(document).on('change', '#restoreFileInput', function(ev){
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function(e){
            try{
                const text = String(e.target.result||'').trim();
                const json = JSON.parse(text);
                // Validasi dasar payload backup
                if (!json || typeof json !== 'object' || json.schema !== 'kv-v1' || !Array.isArray(json.items)) {
                    if (typeof toast !== 'undefined' && toast.error) toast.error('File backup tidak valid atau schema tidak dikenali.');
                    return;
                }
                // Info jika DB/Store berbeda (tetap lanjut restore)
                try {
                    if (json.db && String(json.db) !== String(PRIMARY_DB_NAME)) {
                        if (typeof toast !== 'undefined' && toast.warning) toast.warning(`Nama database berbeda: ${json.db}`);
                    }
                    if (json.store && String(json.store) !== String(PRIMARY_KV_STORE)) {
                        if (typeof toast !== 'undefined' && toast.warning) toast.warning(`Nama store berbeda: ${json.store}`);
                    }
                } catch(_) {}
                const res = await (window.restoreIDB ? window.restoreIDB(json) : Promise.resolve({ ok:0, fail:0 }));
                try { setLastAction('RESTORE DATABASE'); } catch(_) {}
                const msg = `Restore selesai. OK: ${res.ok}, Fail: ${res.fail}`;
                try { $('#backupSummary').text(`Restore OK: ${res.ok}, Fail: ${res.fail}`); } catch(_) {}
                // Tampilkan notifikasi sukses dan reload halaman agar data hasil restore terpakai penuh
                try {
                    if (typeof UIkit !== 'undefined' && UIkit.notification) {
                        UIkit.notification(`✅ ${msg}<br>Halaman akan di-reload untuk menerapkan perubahan.`, {status:'success'});
                    } else if (typeof toast !== 'undefined' && toast.success) {
                        toast.success(`✅ ${msg}\nHalaman akan di-reload untuk menerapkan perubahan.`);
                    }
                } catch(_) {}
                setTimeout(() => { try { location.reload(); } catch(_) {} }, 1000);
            } catch(err){
                // console.error('Restore parse error:', err);
                if (typeof toast !== 'undefined' && toast.error) toast.error('File tidak valid. Pastikan format JSON benar.');
                try { setLastAction('RESTORE DATABASE', 'error', { error: String(err && err.message || err) }); } catch(_) {}
            } finally {
                try { ev.target.value = ''; } catch(_) {}
            }
        };
        reader.readAsText(file);
    });

})();

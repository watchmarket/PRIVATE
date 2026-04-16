// =================================================================================
// SCANNER LOGIC
// =================================================================================
/**
 * Memastikan sebuah sel DEX memiliki elemen <span> untuk menampilkan status.
 * Jika belum ada, fungsi ini akan membuatnya dan menambahkannya ke dalam sel.
 * Ini menjaga struktur DOM tetap konsisten untuk pembaruan status.
 * @param {HTMLElement} cell - Elemen <td> dari sel DEX.
 * @returns {HTMLElement|null} Elemen <span> untuk status, atau null jika sel tidak valid.
 */
function ensureDexStatusSpan(cell) {
    // Jika sel tidak ada, kembalikan null.
    if (!cell) return null;
    // Cari span status yang sudah ada.
    let statusSpan = cell.querySelector('.dex-status');
    // Jika sudah ada, langsung kembalikan.
    if (statusSpan) return statusSpan;
    const strong = cell.querySelector('strong');
    if (strong) {
        const br = document.createElement('br');
        strong.insertAdjacentElement('afterend', br);
        statusSpan = document.createElement('span');
        statusSpan.className = 'dex-status';
        br.insertAdjacentElement('afterend', statusSpan);
        return statusSpan;
    }
    // Jika tidak ada elemen <strong>, buat span baru dan tambahkan di akhir sel.
    statusSpan = document.createElement('span');
    statusSpan.className = 'dex-status';
    cell.appendChild(statusSpan);
    return statusSpan;
}

/**
 * Mengatur latar belakang sel menjadi merah untuk menandakan error.
 * Menggunakan kelas CSS 'dex-error' agar bisa di-styling secara terpusat,
 * termasuk untuk mode gelap (dark mode).
 * @param {HTMLElement} cell - Elemen <td> dari sel DEX yang error.
 */
function setDexErrorBackground(cell) {
    if (!cell) return;
    try { cell.classList.add('dex-error'); } catch (_) { }
}

// REMOVED: Watchdog functions removed as per user request

/**
 * Menghapus/membersihkan interval timer countdown (misal: "Checking (4s)" atau "SWOOP (3s)")
 * yang terkait dengan sebuah sel DEX.
 * @param {string} id - ID dari sel DEX.
 */
function clearDexTickerById(id) {
    try {
        const key = String(id) + ':ticker';

        // ✅ PERF: Use TimerManager for centralized timer control
        if (typeof TimerManager !== 'undefined') {
            TimerManager.clear(`dex-ticker-${key}`);
        }

        // Fallback to legacy method
        window._DEX_TICKERS = window._DEX_TICKERS || new Map();
        if (window._DEX_TICKERS.has(key)) {
            // Hapus interval timer.
            clearInterval(window._DEX_TICKERS.get(key));
            window._DEX_TICKERS.delete(key);
        }
    } catch (_) { }
}

// =================================================================================
// BACKGROUND-SAFE TIMER (Web Worker)
// =================================================================================
// Browser throttles setTimeout on the MAIN THREAD to 1000ms+ when the tab is
// inactive/hidden. A Web Worker runs in a separate thread that is NOT subject to
// the same aggressive throttling, so timers fire at the correct interval even
// when the user switches to another tab.
// _workerTimer is a drop-in replacement for setTimeout/clearTimeout.
// Falls back to native setTimeout if Worker creation fails (e.g. strict CSP).
(function() {
    'use strict';
    try {
        const workerCode = `
            var _pending = {};
            self.onmessage = function(e) {
                var d = e.data;
                if (d.cmd === 'set') {
                    _pending[d.id] = setTimeout(function() {
                        delete _pending[d.id];
                        self.postMessage({ id: d.id });
                    }, d.ms);
                } else if (d.cmd === 'clear') {
                    clearTimeout(_pending[d.id]);
                    delete _pending[d.id];
                }
            };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        const worker = new Worker(blobUrl);
        URL.revokeObjectURL(blobUrl);
        let _counter = 0;
        const _cbs = {};
        worker.onmessage = function(e) {
            const cb = _cbs[e.data.id];
            if (cb) { delete _cbs[e.data.id]; try { cb(); } catch(_) {} }
        };
        window._workerTimer = {
            setTimeout: function(fn, ms) {
                const id = ++_counter;
                _cbs[id] = fn;
                worker.postMessage({ cmd: 'set', id: id, ms: Math.max(0, ms || 0) });
                return id;
            },
            clearTimeout: function(id) {
                if (!id) return;
                delete _cbs[id];
                try { worker.postMessage({ cmd: 'clear', id: id }); } catch(_) {}
            }
        };
    } catch(e) {
        // Fallback: use native setTimeout (may throttle in background tabs)
        window._workerTimer = {
            setTimeout: function(fn, ms) { return setTimeout(fn, ms); },
            clearTimeout: function(id) { clearTimeout(id); }
        };
    }
})();

// Variabel global untuk mengelola state pemindaian.
// ID untuk loop `requestAnimationFrame` yang meng-update UI.
let animationFrameId;
// Flag boolean yang menandakan apakah proses pemindaian sedang berjalan atau tidak.
// NOTE: Ini adalah per-tab state, tidak akan conflict dengan tab lain
let isScanRunning = false;
// Counter untuk melacak jumlah request DEX yang masih berjalan (termasuk fallback).
let activeDexRequests = 0;
// Counter META-DEX yang sudah dijadwalkan (setTimeout) tapi belum mulai — cegah scan "done" terlalu dini.
let pendingMetaDexScheduled = 0;
// Total META-DEX requests yang pernah dijadwalkan (untuk progress display X/Y)
let totalMetaDexScheduled = 0;
// Resolver yang menunggu seluruh request DEX selesai sebelum finalisasi.
let dexRequestWaiters = [];
// Total token yang sedang di-scan (dinamis, berkurang saat ada token dihapus)
let SCAN_TOTAL_TOKENS = 0;
// Jumlah token yang sudah diproses (untuk update progress saat token dihapus)
let SCAN_PROCESSED_TOKENS = 0;

/**
 * Mengurangi jumlah total token scan saat user menghapus token.
 * Dipanggil dari main.js saat token dihapus selama scanning.
 */
function decrementScanTotalTokens() {
    if (SCAN_TOTAL_TOKENS > 0) {
        SCAN_TOTAL_TOKENS--;
        // Langsung update progress bar dengan total yang baru
        try { updateScanProgress(); } catch (_) { }
    }
}
window.decrementScanTotalTokens = decrementScanTotalTokens;

/**
 * Update progress bar dengan total token terkini.
 */
function updateScanProgress() {
    const total = SCAN_TOTAL_TOKENS;
    const current = Math.min(SCAN_PROCESSED_TOKENS, total);
    const percent = total > 0 ? Math.floor((current / total) * 100) : 0;
    try {
        $('#progress-bar').css('width', percent + '%');
        $('#progress-text').text(percent + '%');
        // Update teks progress jika sudah ada waktu mulai
        const $prog = $('#progress');
        const txt = $prog.text();
        const match = txt.match(/\[\d+\/\d+\]/);
        if (match) {
            $prog.text(txt.replace(/\[\d+\/\d+\]/, `[${current}/${total}]`));
        }
    } catch (_) { }
}
window.updateScanProgress = updateScanProgress;
/**
 * Helper function untuk check apakah tab ini sedang scanning
 * Menggunakan sessionStorage untuk per-tab isolation
 */
function isThisTabScanning() {
    try {
        // Check internal flag
        if (isScanRunning) return true;

        // Check session storage sebagai backup
        if (typeof sessionStorage !== 'undefined') {
            const tabScanning = sessionStorage.getItem('TAB_SCANNING');
            return tabScanning === 'YES';
        }

        return false;
    } catch (e) {
        return isScanRunning;
    }
}

function markDexRequestStart() {
    try { activeDexRequests += 1; } catch (_) { activeDexRequests = 1; }
}

function markDexRequestEnd() {
    try {
        activeDexRequests = Math.max(0, activeDexRequests - 1);
        // Trigger waiters hanya jika KEDUA counter nol: tidak ada request aktif DAN tidak ada META-DEX scheduled
        if (activeDexRequests === 0 && pendingMetaDexScheduled === 0 && dexRequestWaiters.length > 0) {
            const waiters = dexRequestWaiters.slice();
            dexRequestWaiters.length = 0;
            waiters.forEach(fn => {
                try { fn(); } catch (_) { }
            });
        }
    } catch (_) { }
}

function waitForPendingDexRequests(timeoutMs = 8000) {
    // Selesai hanya jika tidak ada request aktif DAN tidak ada META-DEX yang masih di-queue setTimeout
    if (activeDexRequests === 0 && pendingMetaDexScheduled === 0) return Promise.resolve();
    return new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        try { dexRequestWaiters.push(done); } catch (_) { dexRequestWaiters = [done]; }
        if (timeoutMs > 0) {
            setTimeout(() => {
                if (settled) return;
                settled = true;
                try {
                    const idx = dexRequestWaiters.indexOf(done);
                    if (idx !== -1) dexRequestWaiters.splice(idx, 1);
                } catch (_) { }
                resolve();
            }, timeoutMs);
        }
    });
}

/**
 * Mengubah judul halaman untuk menandakan pemindaian sedang aktif.
 * Ini hanya berlaku untuk mode single-chain untuk memberikan feedback visual yang jelas.
 * @param {boolean} running - True jika pemindaian sedang berjalan.
 */
function setPageTitleForRun(running) {
    try {
        const m = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
        if (String(m.type || '').toLowerCase() !== 'single') return; // only affect per-chain pages
        if (running) {
            if (!window.__ORIG_TITLE) window.__ORIG_TITLE = document.title;
            document.title = 'RUN SCAN..';
        } else {
            if (window.__ORIG_TITLE) { document.title = window.__ORIG_TITLE; }
            window.__ORIG_TITLE = null;
        }
    } catch (_) { }
}

/**
 * Kumpulan fungsi untuk mengelola tooltip (title) pada sel DEX.
 * Tooltip ini digunakan untuk menampilkan log detail dari proses kalkulasi.
 */

/**
 * Mengatur teks tooltip untuk sebuah elemen sel.
 * @param {HTMLElement} cell - Elemen sel.
 * @param {string} text - Teks tooltip yang akan diatur.
 */
function setCellTitleByEl(cell, text) {
    try {
        cell.dataset.titleLog = String(text || '');
        cell.setAttribute('title', cell.dataset.titleLog);
        // Juga terapkan pada span status di dalamnya agar tooltip konsisten.
        const span = cell.querySelector('.dex-status');
        if (span) span.setAttribute('title', cell.dataset.titleLog);
    } catch (_) { }
}
/**
 * Menambahkan baris baru ke teks tooltip yang sudah ada pada sebuah elemen sel.
 * @param {HTMLElement} cell - Elemen sel.
 * @param {string} line - Baris teks baru yang akan ditambahkan.
 */
function appendCellTitleByEl(cell, line) {
    try {
        const prev = cell.dataset && cell.dataset.titleLog ? String(cell.dataset.titleLog) : '';
        const next = prev ? (prev + '\n' + String(line || '')) : String(line || '');
        setCellTitleByEl(cell, next);
    } catch (_) { }
}
/**
 * Menambahkan baris baru ke teks tooltip berdasarkan ID sel.
 * @param {string} id - ID elemen sel.
 * @param {string} line - Baris teks baru.
 */
function appendCellTitleById(id, line) {
    const cell = document.getElementById(id);
    if (!cell) return;
    appendCellTitleByEl(cell, line);
}

/**
 * Mengatur (replace) teks tooltip berdasarkan ID sel.
 * @param {string} id - ID elemen sel.
 * @param {string} text - Teks tooltip yang akan diatur.
 */
function setCellTitleById(id, text) {
    const cell = document.getElementById(id);
    if (!cell) return;
    setCellTitleByEl(cell, text);
}

/**
 * Placeholder function untuk kompatibilitas.
 * Form edit TETAP AKTIF saat scanning untuk memungkinkan user mengubah data.
 * Fungsi simpan akan di-modifikasi agar tidak refresh tabel saat scanning.
 */
function setEditFormState(isScanning) {
    // Intentionally empty - form tetap aktif saat scanning
    // Perubahan akan ditangani oleh fungsi simpan yang sudah di-modifikasi
}

/**
 * Start the scanning process for a flattened list of tokens.
 * - Batches tokens per group (scanPerKoin)
 * - For each token: fetch CEX orderbook → quote DEX routes → compute PNL → update UI
 */
async function startScanner(tokensToScan, settings, tableBodyId) {
    // Batalkan countdown auto-run yang mungkin sedang berjalan saat scan baru dimulai.
    // ✅ PERF: Use TimerManager for centralized timer control
    if (typeof TimerManager !== 'undefined') {
        TimerManager.clear('autorun-countdown');
    } else {
        clearInterval(window.__autoRunInterval);
        window.__autoRunInterval = null;
    }
    $('#autoRunCountdown').text('');

    // ✅ Set window.SavedSettingData EARLY for other modules to access
    window.SavedSettingData = settings;

    // ℹ️ Matcha API key validation REMOVED:
    // - Solana Matcha: Uses direct endpoint (matcha.xyz/api/swap/quote/solana) - NO API key needed
    // - EVM Matcha: Uses proxy strategies (delta-matcha, c98-matcha, rainbow-matcha, rabby-matcha) - NO API key needed

    // Ambil konfigurasi scan dari argumen.
    const ConfigScan = settings;
    // Dapatkan mode aplikasi saat ini (multi-chain atau single-chain).
    const mMode = getAppMode();
    let allowedChains = [];
    // Tentukan chain mana saja yang aktif berdasarkan mode.
    if (mMode.type === 'single') {
        allowedChains = [String(mMode.chain).toLowerCase()];
    } else {
        // CEX mode: pakai per-CEX filter, multichain: pakai FILTER_MULTICHAIN
        const fm = (window.CEXModeManager && window.CEXModeManager.isCEXMode() && typeof getFilterCEX === 'function')
            ? getFilterCEX(window.CEXModeManager.getSelectedCEX())
            : getFilterMulti();
        allowedChains = (fm.chains && fm.chains.length)
            ? fm.chains.map(c => String(c).toLowerCase())
            : Object.keys(CONFIG_CHAINS || {});
    }

    if (!allowedChains || !allowedChains.length) {
        if (typeof toast !== 'undefined' && toast.warning) toast.warning('Tidak ada Chain yang dipilih. Silakan pilih minimal 1 Chain.');
        return;
    }


    // Chain aktif sudah tersedia untuk fungsi lain via window.SavedSettingData (set di awal fungsi)
    window.CURRENT_CHAINS = allowedChains;

    // Tentukan daftar DEX yang aktif dan "kunci" daftar ini selama proses scan.
    // Ini memastikan struktur kolom tabel tidak berubah di tengah jalan.
    let allowedDexs = [];
    try { allowedDexs = (typeof window.resolveActiveDexList === 'function') ? window.resolveActiveDexList() : []; } catch (_) { allowedDexs = []; }
    try { if (typeof window !== 'undefined') window.__LOCKED_DEX_LIST = (allowedDexs || []).slice(); } catch (_) { }

    // Filter daftar token yang akan dipindai:
    // 1. Token harus berada di salah satu chain yang diizinkan.
    // 2. Token harus memiliki minimal satu DEX yang juga aktif di filter.
    const flatTokens = tokensToScan
        .filter(t => allowedChains.includes(String(t.chain).toLowerCase()))
        .filter(t => {
            try {
                // Pisah regular DEX dan META-DEX dari allowedDexs
                const regularAllowed = allowedDexs.filter(dx => !(window.CONFIG_DEXS?.[dx]?.isMetaDex));
                const hasMetaDexAllowed = allowedDexs.some(dx => window.CONFIG_DEXS?.[dx]?.isMetaDex);
                // Regular DEX: cek per-token (token.dexs[])
                if (regularAllowed.length > 0) {
                    return Array.isArray(t.dexs) && t.dexs.some(d => regularAllowed.includes(String(d.dex || '').toLowerCase()));
                }
                // Hanya META-DEX yang aktif → semua token lolos (META-DEX berlaku untuk semua token)
                return hasMetaDexAllowed;
            } catch (_) { return true; }
        });

    // Jika tidak ada token yang lolos filter, hentikan proses dan beri notifikasi.
    if (!flatTokens || flatTokens.length === 0) {
        if (typeof toast !== 'undefined' && toast.info) toast.info('Tidak ada token pada chain terpilih untuk dipindai.');
        return;
    }

    // Siapkan "kerangka" tabel monitoring (header dan semua baris token).
    // Ini penting agar sel-sel tujuan untuk update UI sudah ada sebelum kalkulasi dimulai.
    try {
        const bodyId = tableBodyId || 'dataTableBody';
        if (typeof window.prepareMonitoringSkeleton === 'function') {
            window.prepareMonitoringSkeleton(flatTokens, bodyId);
        } else if (typeof window.renderMonitoringHeader === 'function' && typeof window.computeActiveDexList === 'function') {
            window.renderMonitoringHeader(window.computeActiveDexList());
        }
    } catch (_) { }

    // --- PERSIAPAN STATE & UI SEBELUM SCAN ---

    // === CHECK GLOBAL SCAN LOCK ===
    try {
        const lockCheck = typeof checkCanStartScan === 'function' ? checkCanStartScan() : { canScan: true };

        if (!lockCheck.canScan) {
            // console.warn('[SCANNER] Cannot start scan - locked by another tab:', lockCheck.lockInfo);

            // Show user-friendly notification
            if (typeof toast !== 'undefined' && toast.warning) {
                const lockInfo = lockCheck.lockInfo || {};
                const mode = lockInfo.mode || 'UNKNOWN';
                const ageMin = Math.floor((lockInfo.age || 0) / 60000);
                const ageSec = Math.floor(((lockInfo.age || 0) % 60000) / 1000);
                const timeStr = ageMin > 0 ? `${ageMin}m ${ageSec}s` : `${ageSec}s`;

                toast.warning(
                    `⚠️ SCAN SEDANG BERJALAN!\n\n` +
                    `Mode: ${mode}\n` +
                    `Durasi: ${timeStr}\n\n` +
                    `Tunggu scan selesai atau tutup tab lain yang sedang scanning.`,
                    { timeOut: 5000 }
                );
            }

            // Reset UI state
            $('#startSCAN').prop('disabled', false).text('START').removeClass('uk-button-disabled');
            return; // Exit early - don't start scan
        }
    } catch (e) {
        // console.error('[SCANNER] Error checking global scan lock:', e);
        // On error checking lock, allow scan to proceed
    }

    // === SET GLOBAL SCAN LOCK ===
    try {
        const mode = getAppMode();
        const chainLabel = allowedChains.map(c => String(c).toUpperCase()).join(', ');
        const filterKey = getActiveFilterKey();

        const lockAcquired = typeof setGlobalScanLock === 'function'
            ? setGlobalScanLock(filterKey, {
                tabId: typeof getTabId === 'function' ? getTabId() : null,
                mode: mode.type === 'multi' ? 'MULTICHAIN' : mode.type === 'cex' ? `CEX_${(mode.cex || 'UNKNOWN')}` : (mode.chain || 'UNKNOWN').toUpperCase(),
                chain: chainLabel
            })
            : true;

        if (!lockAcquired) {
            // console.error('[SCANNER] Failed to acquire global scan lock');
            if (typeof toast !== 'undefined' && toast.error) {
                toast.error('Gagal memulai scan - ada scan lain yang berjalan');
            }
            $('#startSCAN').prop('disabled', false).text('START').removeClass('uk-button-disabled');
            return; // Exit early
        }

        // console.log('[SCANNER] Global scan lock acquired:', filterKey);

        // Set per-tab scanning state (sessionStorage - per-tab isolation)
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('TAB_SCANNING', 'YES');
            sessionStorage.setItem('TAB_SCAN_CHAIN', chainLabel);
            sessionStorage.setItem('TAB_SCAN_START', Date.now().toString());
        }

        // Notify TabManager untuk broadcast ke tab lain
        if (window.TabManager && typeof window.TabManager.notifyScanStart === 'function') {
            window.TabManager.notifyScanStart(chainLabel);
            // console.log(`[SCANNER] Tab ${window.getTabId()} started scanning: ${chainLabel}`);
        }
    } catch (e) {
        // console.error('[SCANNER] Error setting scan start state:', e);
    }

    // Set state aplikasi menjadi 'berjalan' (run: 'YES').
    setAppState({ run: 'YES' });
    setPageTitleForRun(true);
    try {
        if (typeof window.updateRunStateCache === 'function') {
            try { window.updateRunStateCache(getActiveFilterKey(), { run: 'YES' }); } catch (_) { }
            // Mark each allowed chain as running to isolate per-chain state
            try { (allowedChains || []).forEach(c => window.updateRunStateCache(`FILTER_${String(c).toUpperCase()}`, { run: 'YES' })); } catch (_) { }
        }
        if (typeof window.updateRunningChainsBanner === 'function') {
            const m = getAppMode();
            const preListed = (m.type === 'single') ? [String(m.chain).toLowerCase()] : (allowedChains || []);
            window.updateRunningChainsBanner(preListed);
        }
        if (typeof window.updateToolbarRunIndicators === 'function') window.updateToolbarRunIndicators();
    } catch (_) { }

    // Update tampilan tombol dan banner.
    $('#startSCAN').prop('disabled', true).text('Running...').addClass('uk-button-disabled');

    // ✅ FIX: Only clear signals on MANUAL scan, not on auto-run
    // This prevents signals from being replaced when AUTO LEVEL re-scans with different orderbook data
    const isAutoRun = (typeof window.AUTORUN_ENABLED !== 'undefined') ? window.AUTORUN_ENABLED : false;
    if (!isAutoRun) {
        // Bersihkan kartu sinyal hanya pada scan manual
        $('#sinyal-container [id^="sinyal"]').empty();
        console.log('[SCANNER] 🗑️  Signals cleared (manual scan)');
    } else {
        console.log('[SCANNER] ♻️  Signals preserved (auto-run)');
    }
    if (typeof window.hideEmptySignalCards === 'function') window.hideEmptySignalCards();

    // Nonaktifkan sebagian besar kontrol UI untuk mencegah perubahan konfigurasi saat scan.
    if (typeof setScanUIGating === 'function') setScanUIGating(true);
    form_off();
    $("#autoScrollCheckbox").show().prop('disabled', false);
    $("#stopSCAN").show().prop('disabled', false);
    $('.statusCheckbox').css({ 'pointer-events': 'auto', 'opacity': '1' }).prop('disabled', false);

    // Kirim notifikasi status 'ONLINE' ke Telegram.
    sendStatusTELE(ConfigScan.nickname, 'ONLINE');

    // Ambil parameter jeda dan kecepatan dari settings.
    // ✅ FIXED: Gunakan CONFIG_UI.SETTINGS.defaults sebagai fallback (bukan hardcoded)
    const configDefaults = (window.CONFIG_UI?.SETTINGS?.defaults) || {};

    let scanPerKoin = parseInt(ConfigScan.scanPerKoin || configDefaults.tokensPerBatch || 3);
    let jedaKoin = parseInt(ConfigScan.jedaKoin || configDefaults.delayPerToken || 200);
    let jedaTimeGroup = parseInt(ConfigScan.jedaTimeGroup || configDefaults.delayBetweenGrup || 400);
    // Jeda tambahan agar urutan fetch mengikuti pola lama (tanpa mengubah logika hasil)
    // Catatan: gunakan nilai dari SETTING_SCANNER
    // - Jeda DEX: per-DEX dari ConfigScan.JedaDexs[dex] (Jeda CEX dihapus)
    // ✅ REFACTORED: Use default timeout from per-strategy config
    // Scanner window uses the default timeout for safety margin calculation
    const defaultTimeout = (window.CONFIG_UI?.SETTINGS?.timeout?.['default']) || 5000;

    // Jeda per-DEX untuk rate limiting (dapat di-set via settings, default 0 = no delay)
    // User dapat mengatur delay berbeda untuk setiap DEX jika ada rate limit
    const jedaDexMap = (ConfigScan || {}).JedaDexs || {};
    // Fallback ke CONFIG_DEXS[dx].delay jika user belum set (berlaku untuk meta-DEX seperti LIFI, Rubic, dll.)
    const getJedaDex = (dx) => {
        const userVal = jedaDexMap[String(dx).toLowerCase()];
        if (userVal !== undefined && userVal !== null && userVal !== '') return parseInt(userVal) || 0;
        const configDelay = (window.CONFIG_DEXS || {})[String(dx).toLowerCase()]?.delay;
        return parseInt(configDelay) || 0;
    };

    // Per-aggregator request scheduler: mencegah burst request ke API rate-limited (RANGO/DZAP/RUBIC).
    // Setiap request dijadwalkan setelah request sebelumnya selesai + minDelay,
    // sehingga maksimal 1 request per minDelay ms per aggregator (tidak tergantung jumlah token).
    const metaDexNextTime = {};
    const scheduleMetaDexRequest = (aggKey, minDelay, fn) => {
        const now = Date.now();
        const earliest = Math.max(now, metaDexNextTime[aggKey] || 0);
        metaDexNextTime[aggKey] = earliest + minDelay;
        // Increment counter SEBELUM setTimeout — agar waitForPendingDexRequests tidak resolve dini
        pendingMetaDexScheduled++;
        totalMetaDexScheduled++;
        // Gunakan _workerTimer agar scheduling META-DEX tidak di-throttle saat tab inactive
        (window._workerTimer || { setTimeout }).setTimeout(() => {
            // Decrement saat callback mulai jalan (sudah bukan "pending scheduled" lagi)
            pendingMetaDexScheduled = Math.max(0, pendingMetaDexScheduled - 1);
            // Jika ini yang terakhir scheduled DAN tidak ada active request → trigger waiters
            if (pendingMetaDexScheduled === 0 && activeDexRequests === 0 && dexRequestWaiters.length > 0) {
                const waiters = dexRequestWaiters.slice();
                dexRequestWaiters.length = 0;
                waiters.forEach(f => { try { f(); } catch (_) { } });
            }
            fn();
        }, Math.max(0, earliest - now));
    };

    // Fungsi helper untuk membuat jeda (delay).
    // Gunakan _workerTimer agar delay tidak di-throttle browser saat tab inactive.
    // Browser throttles setTimeout main-thread ke 1000ms+ di background tab,
    // sedangkan Worker timer berjalan di thread terpisah tanpa throttling agresif.
    function delay(ms) {
        if (ms <= 0) return Promise.resolve();
        return new Promise(resolve => (window._workerTimer || { setTimeout }).setTimeout(resolve, ms));
    }
    // Fungsi helper untuk memeriksa apakah checkbox posisi (KIRI/KANAN) dicentang.
    const isPosChecked = (val) => $('input[type="checkbox"][value="' + val + '"]').is(':checked');

    /**
     * Memperbarui progress bar dan teks status di UI.
     * @param {number} current - Jumlah item yang sudah diproses.
     * @param {number} total - Jumlah total item.
     * @param {number} startTime - Timestamp awal proses.
     * @param {string} TokenPair - Nama token yang sedang diproses.
     */
    function updateProgress(current, total, startTime, TokenPair) {
        let duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
        let progressPercentage = Math.floor((current / total) * 100);
        let progressText = `CHECKING - ${TokenPair} [${current}/${total}] :: Mulai: ${new Date(startTime).toLocaleTimeString()} ~ DURASI [${duration} Menit]`;
        $('#progress-bar').css('width', progressPercentage + '%');
        $('#progress-text').text(progressPercentage + '%');
        $('#progress').text(progressText);
    }

    // `uiUpdateQueue` adalah antrian untuk semua tugas pembaruan UI.
    // Daripada memanipulasi DOM secara langsung setiap kali ada hasil,
    // objek hasil (sukses/error) dimasukkan ke array ini. `processUiUpdates`
    // akan mengambil dari antrian ini dan meng-update UI secara efisien
    // menggunakan `requestAnimationFrame` untuk mencegah browser lag.
    let uiUpdateQueue = [];

    // Pastikan update UI segera dijalankan saat tab kembali aktif (visible).
    try {
        if (typeof window !== 'undefined' && !window.__UI_VIS_LISTENER_SET__) {
            document.addEventListener('visibilitychange', () => {
                try { if (!document.hidden) processUiUpdates(); } catch (_) { }
            });
            window.__UI_VIS_LISTENER_SET__ = true;
        }
    } catch (_) { }

    // Jeda auto-scroll sementara jika pengguna berinteraksi dengan halaman
    // (scroll, klik, dll.) agar tidak mengganggu.
    try {
        if (typeof window !== 'undefined' && !window.__AUTO_SCROLL_SUSPENDER_SET__) {
            const suspend = () => { try { window.__AUTO_SCROLL_SUSPEND_UNTIL = Date.now() + 4000; } catch (_) { } };
            ['wheel', 'touchstart', 'mousedown', 'keydown'].forEach(ev => {
                try { window.addEventListener(ev, suspend, { passive: true }); } catch (_) { }
            });
            window.__AUTO_SCROLL_SUSPENDER_SET__ = true;
        }
    } catch (_) { }

    /**
     * Mengambil data order book dari CEX dengan mekanisme coba ulang (retry).
     * @param {object} token - Objek data token.
     * @param {string} tableBodyId - ID dari tbody tabel.
     * @param {object} options - Opsi tambahan (maxAttempts, delayMs).
     * @returns {Promise<{ok: boolean, data: object|null, error: any}>} Hasil fetch.
     */
    async function fetchCEXWithRetry(token, tableBodyId, options = {}) {
        const maxAttempts = Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : 3;
        const delayMs = Number(options.delayMs) >= 0 ? Number(options.delayMs) : 400;
        let attempts = 0;
        let lastError = null;
        let lastData = null;

        while (attempts < maxAttempts) {
            // Coba panggil getPriceCEX.
            try {
                const data = await getPriceCEX(token, token.symbol_in, token.symbol_out, token.cex, tableBodyId);
                lastData = data;
                const prices = [
                    data?.priceBuyToken,
                    data?.priceSellToken,
                    data?.priceBuyPair,
                    data?.priceSellPair
                ];
                // Validasi bahwa semua harga yang dibutuhkan adalah angka positif.
                const valid = prices.every(p => Number.isFinite(p) && Number(p) > 0);
                if (valid) {
                    return { ok: true, data };
                }
                lastError = 'Harga CEX tidak lengkap';
            } catch (error) {
                lastError = error;
            }
            // Jika gagal, tunggu sebentar sebelum mencoba lagi.
            attempts += 1;
            if (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return { ok: false, data: lastData, error: lastError };
    }

    /**
     * Loop utama yang memproses antrian pembaruan UI (`uiUpdateQueue`).
     * Dijalankan menggunakan `requestAnimationFrame` untuk performa optimal.
     */
    function processUiUpdates() {
        // Jika scan sudah berhenti dan antrian kosong, hentikan loop dan bersihkan animation frame.
        if (!isScanRunning && uiUpdateQueue.length === 0) {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            return;
        }

        const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        // REFACTORED: Budget 12ms agar browser punya lebih banyak waktu untuk paint
        // Tradeoff: queue sedikit lebih lambat terkuras, tapi UI jauh lebih responsif dan "hidup"
        const budgetMs = 12; // tighter budget for snappier rendering
        let processed = 0;

        // "Penyapuan keamanan": Finalisasi sel DEX yang melewati batas waktu (timeout)
        // tapi belum di-update statusnya. Ini mencegah sel terjebak di status "Checking".
        try {
            const nowTs = Date.now();
            // REFACTORED: Skip cells yang sudah final untuk mengurangi DOM query overhead
            const cells = document.querySelectorAll('td[data-deadline]:not([data-final="1"])');
            cells.forEach(cell => {
                // Cek apakah deadline sudah lewat dan sel belum difinalisasi.
                try {
                    const d = Number(cell.dataset.deadline || 0);
                    const done = String(cell.dataset.final || '') === '1';
                    // Increased buffer from 250ms to 1000ms to allow slower responses to complete
                    if (!done && d > 0 && nowTs - d > 1000) {
                        // CRITICAL FIX: Check if there's a pending update in queue for this cell
                        // Don't force timeout if the result is already queued but not yet processed
                        const cellId = cell.id;
                        let hasPendingUpdate = false;
                        try {
                            hasPendingUpdate = uiUpdateQueue.some(item =>
                                item && (item.id === cellId || item.resultId === cellId)
                            );
                        } catch (_) { }

                        // Skip timeout if update is pending in queue
                        if (hasPendingUpdate) {
                            return; // Let the queued update process normally
                        }

                        const dexName = (cell.dataset.dex || '').toUpperCase() || 'DEX';
                        // stop any lingering ticker for this cell
                        try { clearDexTickerById(cell.id); } catch (_) { }
                        // Paksa finalisasi ke status TIMEOUT.
                        try { cell.classList.add('dex-error'); } catch (_) { }

                        // Standard cell timeout handling (multi-aggregator now uses the same UI)
                        const span = ensureDexStatusSpan(cell);
                        try {
                            span.classList.remove('uk-text-muted', 'uk-text-warning');
                            span.classList.add('uk-text-danger');
                            span.innerHTML = `<span class=\"uk-label uk-label-warning\">TIMEOUT</span>`;
                            span.title = `${dexName}: Request Timeout`;
                        } catch (_) { }

                        try { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } catch (_) { }
                    }
                } catch (_) { }
            });
        } catch (_) { }

        // Proses item dari antrian selama masih ada dan budget waktu belum habis.
        if (uiUpdateQueue.length > 0) {
            //(`[PROCESS QUEUE] Processing ${uiUpdateQueue.length} items in queue`);
        }
        while (uiUpdateQueue.length) {
            const updateData = uiUpdateQueue.shift();
            if (updateData) {
                // console.log(`[PROCESS ITEM]`, { type: updateData?.type, id: updateData?.id || updateData?.idPrefix + updateData?.baseId });
            }
            // Jika item adalah error, update sel dengan pesan error.
            if (updateData && updateData.type === 'error') {
                const { id, message, swapMessage } = updateData;
                const cell = document.getElementById(id);
                if (cell) {
                    // Skip if already finalized by a successful result
                    try {
                        if (cell.dataset && cell.dataset.final === '1') {
                            processed++;
                            continue;
                        }
                    } catch (_) { }
                    // finalize error: stop ticker, mark final, clear checking/deadline
                    try { clearDexTickerById(id); } catch (_) { }
                    try { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } catch (_) { }
                    setDexErrorBackground(cell);
                    let statusSpan = ensureDexStatusSpan(cell);
                    if (statusSpan) statusSpan.className = 'dex-status uk-text-danger';
                    statusSpan.classList.remove('uk-text-muted', 'uk-text-warning');
                    statusSpan.classList.add('uk-text-danger');
                    statusSpan.innerHTML = `<span class="uk-label uk-label-danger">${swapMessage || 'ERROR'}</span>`;
                    statusSpan.title = message || '';
                }
                // Jika item adalah hasil sukses, panggil DisplayPNL untuk merender hasilnya.
            } else if (updateData) {
                DisplayPNL(updateData);
            }
            processed++;
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            // Jika waktu eksekusi melebihi budget, hentikan dan serahkan ke frame berikutnya.
            if ((now - start) >= budgetMs) break; // yield to next frame
        }

        // Hanya jadwalkan frame berikutnya jika scan masih berjalan atau masih ada antrian yang tersisa.
        if (isScanRunning || uiUpdateQueue.length > 0) {
            if (typeof document !== 'undefined' && document.hidden) {
                setTimeout(processUiUpdates, 150);
            } else {
                animationFrameId = requestAnimationFrame(processUiUpdates);
            }
        } else {
            animationFrameId = null;
        }
    }

    /**
     * Memproses satu token: mengambil data CEX, lalu memproses semua DEX yang terkait.
     * @param {object} token - Objek data token yang akan diproses.
     * @param {string} tableBodyId - ID dari tbody tabel.
     */
    async function processRequest(token, tableBodyId) {
        if (!allowedChains.includes(String(token.chain).toLowerCase())) return;
        // Skip processing if token has been deleted during scanning
        try {
            const modeNow = getAppMode();
            let stillExists = false;
            if (modeNow.type === 'single') {
                const list = getTokensChain(modeNow.chain);
                stillExists = Array.isArray(list) && list.some(t => String(t.id) === String(token.id));
            } else if (window.CEXModeManager && window.CEXModeManager.isCEXMode()) {
                // CEX mode: token datang dari per-chain DB, cek di chain token tersebut
                const chainKey = String(token.chain || '').toLowerCase();
                if (chainKey && typeof getTokensChain === 'function') {
                    const list = getTokensChain(chainKey);
                    stillExists = Array.isArray(list) && list.some(t => String(t.id) === String(token.id));
                }
                // Fallback: cek juga di TOKEN_MULTICHAIN
                if (!stillExists) {
                    const list = getTokensMulti();
                    stillExists = Array.isArray(list) && list.some(t => String(t.id) === String(token.id));
                }
            } else {
                const list = getTokensMulti();
                stillExists = Array.isArray(list) && list.some(t => String(t.id) === String(token.id));
            }
            if (!stillExists) return; // token removed; do not fetch
        } catch (_) { }
        try {
            // 1. Ambil data harga dari CEX dengan mekanisme retry.
            // OPTIMIZED: Kurangi retry untuk hemat waktu (3→2 attempts, 450→250ms delay)
            const cexResult = await fetchCEXWithRetry(token, tableBodyId, { maxAttempts: 2, delayMs: 250 });
            const DataCEX = cexResult.data || {};

            // ===== AUTO SKIP FEATURE =====
            // Jika pengambilan data CEX gagal, tampilkan warning toast dan SKIP scan DEX
            // (scan DEX tidak akan dilakukan jika CEX tidak ada harga)
            if (!cexResult.ok) {
                if (typeof toast !== 'undefined' && toast.warning) {
                    toast.warning(`⚠️ CEX ${token.cex} gagal - DEX akan di-skip untuk ${token.symbol_in}`, null, {
                        duration: 3000
                    });
                }
                // Log untuk debugging
                console.warn(`[AUTO SKIP] CEX ${token.cex} failed for ${token.symbol_in}, DEX will be skipped...`);
            }

            // ===== AUTO VOLUME FEATURES =====
            // Two separate features:
            // 1. AUTO VOL (checkVOL): Simple volume validation (vol >= modal)
            // 2. AUTO LEVEL (autoVolToggle): Orderbook-based simulation

            const autoVolEnabled = $('#checkVOL').is(':checked');      // AUTO VOL
            const autoLevelEnabled = $('#autoVolToggle').is(':checked'); // AUTO LEVEL

            const autoVolSettings = {
                autoVol: autoVolEnabled,
                autoLevel: autoLevelEnabled,
                levels: parseInt($('#autoVolLevels').val()) || 1
            };

            // Only fetch orderbook if AUTO LEVEL is enabled
            if (autoLevelEnabled && cexResult.ok) {
                try {
                    const cexUpper = String(token.cex).toUpperCase();
                    const cexConfig = CONFIG_CEX[cexUpper];

                    if (cexConfig && cexConfig.ORDERBOOK) {
                        const symbol = String(token.symbol_in || '').toUpperCase();
                        const url = (typeof cexConfig.ORDERBOOK.urlTpl === 'function')
                            ? cexConfig.ORDERBOOK.urlTpl({ symbol })
                            : '';

                        if (url) {
                            const orderbookResponse = await $.getJSON(url);
                            DataCEX.orderbook = (typeof parseOrderbook === 'function')
                                ? parseOrderbook(cexUpper, orderbookResponse)
                                : { asks: [], bids: [] };
                        }
                    }
                } catch (err) {
                    console.warn('[Auto Level] Failed to fetch orderbook:', err);
                    // Silently fallback to fixed modal
                }
            }

            // 2. Lanjut ke DEX tanpa jeda CEX terkonfigurasi (fitur dihapus)

            if (token.dexs && Array.isArray(token.dexs)) {
                // 3. Loop untuk setiap DEX yang terkonfigurasi untuk token ini.
                token.dexs.forEach((dexData) => {
                    // Skip DEX not included in active selection
                    try { if (!allowedDexs.includes(String(dexData.dex || '').toLowerCase())) return; } catch (_) { }
                    // ✅ META-DEX: Skip isMetaDex entries in regular loop — handled by Meta-DEX scan below
                    try {
                        const dexKeyCheck = String(dexData.dex || '').toLowerCase();
                        if ((window.CONFIG_DEXS || {})[dexKeyCheck]?.isMetaDex) return;
                    } catch (_) { }
                    // Normalize DEX name to handle aliases (kyberswap->kyber, matcha->0x, etc)
                    let dex = String(dexData.dex || '').toLowerCase();
                    try {
                        if (typeof window !== 'undefined' && window.DEX && typeof window.DEX.normalize === 'function') {
                            dex = window.DEX.normalize(dex);
                        }
                    } catch (_) { }
                    const modalKiri = dexData.left;
                    const modalKanan = dexData.right;

                    // ===== CALCULATE AMOUNT =====
                    // Hitung amount_in berdasarkan harga CEX
                    // Jika CEX gagal, DEX akan di-skip (lihat kondisi shouldSkip di bawah)
                    let amount_in_token, amount_in_pair;

                    if (cexResult.ok && DataCEX.priceBuyToken > 0 && DataCEX.priceBuyPair > 0) {
                        // CEX berhasil, gunakan harga CEX untuk menghitung amount
                        amount_in_token = parseFloat(modalKiri) / DataCEX.priceBuyToken;
                        amount_in_pair = parseFloat(modalKanan) / DataCEX.priceBuyPair;
                    } else {
                        // CEX gagal, set ke 0 (DEX akan di-skip)
                        amount_in_token = 0;
                        amount_in_pair = 0;
                    }

                    /**
                     * Fungsi internal untuk memanggil API DEX untuk satu arah transaksi.
                     * @param {string} direction - Arah transaksi ('TokentoPair' atau 'PairtoToken').
                     */
                    const callDex = (direction) => {
                        const isKiri = direction === 'TokentoPair';
                        // Periksa apakah posisi (KIRI/KANAN) diaktifkan di UI.
                        if (isKiri && !isPosChecked('Actionkiri')) { return; }
                        if (!isKiri && !isPosChecked('ActionKanan')) { return; }

                        // ID generation: include token ID for uniqueness
                        const sym1 = isKiri ? String(token.symbol_in || '').toUpperCase() : String(token.symbol_out || '').toUpperCase();
                        const sym2 = isKiri ? String(token.symbol_out || '').toUpperCase() : String(token.symbol_in || '').toUpperCase();
                        const tokenId = String(token.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const baseIdRaw = `${String(token.cex).toUpperCase()}_${String(dex).toUpperCase()}_${sym1}_${sym2}_${String(token.chain).toUpperCase()}_${tokenId}`;
                        const baseId = baseIdRaw.replace(/[^A-Z0-9_]/g, '');
                        const idCELL = tableBodyId + '_' + baseId;
                        let lastPrimaryError = null;

                        // Normalisasi alamat kontrak dan desimal, terutama untuk pair 'NON'
                        // agar menggunakan nilai default jika tidak ada.
                        const chainCfgSafe = (window.CONFIG_CHAINS || {})[String(token.chain).toLowerCase()] || {};
                        const pairDefsSafe = chainCfgSafe.PAIRDEXS || {};
                        const nonDef = pairDefsSafe['NON'] || {};
                        const isAddrInvalid = (addr) => !addr || String(addr).toLowerCase() === '0x' || String(addr).length < 6;
                        let scInSafe = isKiri ? token.sc_in : token.sc_out;
                        let scOutSafe = isKiri ? token.sc_out : token.sc_in;
                        let desInSafe = isKiri ? Number(token.des_in) : Number(token.des_out);
                        let desOutSafe = isKiri ? Number(token.des_out) : Number(token.des_in);
                        const symOut = isKiri ? String(token.symbol_out || '') : String(token.symbol_in || '');
                        if (String(symOut).toUpperCase() === 'NON' || isAddrInvalid(scOutSafe)) {
                            if (nonDef && nonDef.scAddressPair) {
                                scOutSafe = nonDef.scAddressPair;
                                desOutSafe = Number(nonDef.desPair || desOutSafe || 18);
                            }
                        }

                        // ===== AUTO LEVEL: Calculate Modal & Amount =====
                        // ✅ AUTO LEVEL CONCEPT:
                        // - Fetch orderbook and calculate actual available volume
                        // - Use ACTUAL modal and price from orderbook for simulation
                        // - Show warning ⚠️ if orderbook insufficient
                        let modal, amountIn, avgPriceCEX, autoVolResult = null;

                        if (autoVolSettings.autoLevel && DataCEX.orderbook && cexResult.ok) {
                            // Use Auto Level for actual simulation
                            const side = isKiri ? 'asks' : 'bids';
                            const maxModal = Number(isKiri ? modalKiri : modalKanan) || 0;

                            // 🔍 DEBUG: Auto Level settings and CEX data
                            console.log('🎯 [SCANNER] Auto Level Active (Actual Simulation Mode)');
                            console.log('  Direction:', isKiri ? 'CEX→DEX (TokenToPair)' : 'DEX→CEX (PairToToken)');
                            console.log('  Side:', side);
                            console.log('  User Modal (Max):', maxModal);
                            console.log('  Auto Level Levels:', autoVolSettings.levels);

                            autoVolResult = (typeof calculateAutoVolume === 'function')
                                ? calculateAutoVolume(DataCEX.orderbook, maxModal, autoVolSettings.levels, side)
                                : null;

                            // 🔍 DEBUG: Auto Level result
                            console.log('📦 [SCANNER] Auto Level Result:', autoVolResult);

                            if (autoVolResult && !autoVolResult.error && autoVolResult.totalCoins > 0) {
                                // ✅ AUTO LEVEL: ALWAYS use actual values from orderbook for realistic PNL
                                modal = autoVolResult.actualModal;  // ← Always use ACTUAL modal
                                avgPriceCEX = autoVolResult.avgPrice;  // ← Always use weighted average price

                                // Calculate actual amount based on direction
                                if (isKiri) {
                                    // CEX→DEX (tokentopair): Use totalCoins (TOKEN amount to swap)
                                    amountIn = autoVolResult.totalCoins;
                                } else {
                                    // DEX→CEX (pairtotoken): Convert actualModal to PAIR amount
                                    const pricePair = DataCEX.priceBuyPair || 1;
                                    amountIn = autoVolResult.actualModal / pricePair;
                                }

                                // 🔍 DEBUG: Final values used
                                console.log('✅ [AUTO LEVEL] Using ACTUAL modal from orderbook:');
                                console.log('  Modal (for PNL):', modal, '(ACTUAL from orderbook)');
                                console.log('  Amount In:', amountIn, '(ACTUAL)');
                                console.log('  Avg Price CEX:', avgPriceCEX, '(weighted average)');

                                // Show info if actual modal is less than user modal
                                if (autoVolResult.actualModal < maxModal) {
                                    console.warn('📊 [AUTO LEVEL] Orderbook has less volume than user modal:');
                                    console.warn('  User Modal (Max):', maxModal);
                                    console.warn('  Actual Available:', autoVolResult.actualModal);
                                    console.warn('  Using actual modal for realistic PNL calculation');
                                }
                            } else {
                                // Fallback to user modal if orderbook calculation fails
                                console.warn('⚠️  [SCANNER] Auto Level fallback to user modal:', autoVolResult?.error || 'No valid result');
                                modal = maxModal;
                                amountIn = isKiri ? amount_in_token : amount_in_pair;
                                avgPriceCEX = isKiri ? DataCEX.priceBuyToken : DataCEX.priceBuyPair;
                                autoVolResult = null;
                            }
                        } else {
                            // Fixed modal (existing behavior)
                            if (autoVolSettings.autoLevel) {
                                console.log('⏭️  [SCANNER] Auto Level skipped:');
                                console.log('  Auto Level Enabled:', autoVolSettings.autoLevel);
                                console.log('  Orderbook Available:', !!DataCEX.orderbook);
                                console.log('  CEX Result OK:', cexResult.ok);
                            }
                            modal = Number(isKiri ? modalKiri : modalKanan) || 0;
                            amountIn = isKiri ? amount_in_token : amount_in_pair;
                            avgPriceCEX = isKiri ? DataCEX.priceBuyToken : DataCEX.priceBuyPair;
                        }

                        /**
                         * Memperbarui status visual sel DEX (misal: "Checking...", "ERROR").
                         * @param {string} status - 'checking', 'fallback', 'error', 'failed', 'fallback_error'.
                         * @param {string} dexName - Nama DEX.
                         * @param {string} [message=''] - Pesan tambahan untuk tooltip.
                         */
                        const updateDexCellStatus = (status, dexName, message = '') => {
                            const cell = document.getElementById(idCELL);
                            if (!cell) return;
                            // Do not overwrite if cell already finalized by a prior UPDATE/ERROR
                            try {
                                if (cell.dataset && cell.dataset.final === '1') {
                                    // NEVER overwrite a finalized cell, regardless of new status
                                    return;
                                }
                            } catch (_) { }

                            // Standard single-DEX cell handling
                            // Presentation only: spinner for checking, badge for error
                            try { cell.classList.remove('dex-error'); } catch (_) { }
                            let statusSpan = ensureDexStatusSpan(cell);
                            statusSpan.removeAttribute('title');
                            statusSpan.classList.remove('uk-text-muted', 'uk-text-warning', 'uk-text-danger');
                            if (status === 'checking') {
                                statusSpan.classList.add('uk-text-warning');
                                statusSpan.innerHTML = `<span class=\"uk-margin-small-right\" uk-spinner=\"ratio: 0.5\"></span>${String(dexName || '').toUpperCase()}`;
                                try { if (window.UIkit && UIkit.update) UIkit.update(cell); } catch (_) { }
                                // Build rich header log like example
                                try {
                                    const chainCfg = (window.CONFIG_CHAINS || {})[String(token.chain).toLowerCase()] || {};
                                    const chainName = (chainCfg.Nama_Chain || token.chain || '').toString().toUpperCase();
                                    const nameIn = String(isKiri ? token.symbol_in : token.symbol_out).toUpperCase();
                                    const nameOut = String(isKiri ? token.symbol_out : token.symbol_in).toUpperCase();
                                    const ce = String(token.cex || '').toUpperCase();
                                    const dx = String(dexName || dex || '').toUpperCase();
                                    const proc = isKiri ? `${ce} → ${dx}` : `${dx} → ${ce}`;
                                    const modal = Number(isKiri ? modalKiri : modalKanan) || 0;
                                    const header = [
                                        `✅ [LOG ${isKiri ? 'CEX → DEX' : 'DEX → CEX'}] ${nameIn} → ${nameOut} on ${chainName}`,
                                        `    🔄 [${proc}]`,
                                        '',
                                        `    🪙 Modal: $${modal.toFixed(2)}`,
                                        // message ? `    💹 CEX SUMMARY: ${message}` : ''
                                    ].filter(Boolean).join('\n');
                                    setCellTitleByEl(cell, header);
                                } catch (_) { }
                            } else if (status === 'fallback') {
                                statusSpan.classList.add('uk-text-warning');
                                statusSpan.innerHTML = `<span class=\"uk-margin-small-right\" uk-spinner=\"ratio: 0.5\"></span>SWOOP`;
                                // REFACTORED: Tidak menampilkan error message dari primary DEX
                                // Tooltip tetap menampilkan header info checking saja
                                try { if (window.UIkit && UIkit.update) UIkit.update(cell); } catch (_) { }
                            } else if (status === 'fallback_error') {
                                setDexErrorBackground(cell);
                                statusSpan.classList.remove('uk-text-warning');
                                statusSpan.classList.add('uk-text-danger');

                                // ✅ Generate DEX link for manual check
                                let dexLink = '#';
                                try {
                                    if (typeof generateDexLink === 'function') {
                                        const scIn = isKiri ? token.sc_in : token.sc_out;
                                        const scOut = isKiri ? token.sc_out : token.sc_in;
                                        const codeChain = CONFIG_CHAINS[token.chain.toLowerCase()]?.Kode_Chain;
                                        dexLink = generateDexLink(
                                            dexName || dex,
                                            token.chain,
                                            codeChain,
                                            isKiri ? token.symbol_in : token.symbol_out,
                                            scIn,
                                            isKiri ? token.symbol_out : token.symbol_in,
                                            scOut
                                        ) || '#';
                                    }
                                } catch (_) { }

                                statusSpan.innerHTML = `<span class="uk-label uk-label-warning">TIMEOUT</span> <a href="${dexLink}" target="_blank" rel="noopener" class="uk-link-muted" title="Check swap manually on DEX" style="font-size:0.9em;">🔗</a>`;
                                // REFACTORED: Tooltip menampilkan error dari fallback saja (bukan primary)
                                // Message berisi error dari alternatif DEX
                                if (message) {
                                    statusSpan.title = String(message);
                                    setCellTitleByEl(cell, String(message));
                                    try { const lab = statusSpan.querySelector('.uk-label'); if (lab) lab.setAttribute('title', String(message)); } catch (_) { }
                                } else {
                                    statusSpan.removeAttribute('title');
                                }
                                // Finalize regardless of tab visibility
                                try { clearDexTickerById(idCELL); } catch (_) { }
                                try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch (_) { }
                            } else if (status === 'failed') {
                                // Validation failed before DEX call (e.g., modal/contract/chain code)
                                setDexErrorBackground(cell);
                                statusSpan.classList.remove('uk-text-warning');
                                statusSpan.classList.add('uk-text-danger');
                                statusSpan.innerHTML = `<span class=\"uk-label uk-label-failed\">FAILED</span>`;
                                if (message) {
                                    statusSpan.title = String(message);
                                    setCellTitleByEl(cell, String(message));
                                    try { const lab = statusSpan.querySelector('.uk-label'); if (lab) lab.setAttribute('title', String(message)); } catch (_) { }
                                } else {
                                    statusSpan.removeAttribute('title');
                                }
                                // Finalize regardless of tab visibility
                                try { clearDexTickerById(idCELL); } catch (_) { }
                                try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch (_) { }
                            } else if (status === 'error') {
                                setDexErrorBackground(cell);
                                statusSpan.classList.remove('uk-text-warning');
                                statusSpan.classList.add('uk-text-danger');

                                // ✅ Generate DEX link for manual check
                                let dexLink = '#';
                                try {
                                    if (typeof generateDexLink === 'function') {
                                        const scIn = isKiri ? token.sc_in : token.sc_out;
                                        const scOut = isKiri ? token.sc_out : token.sc_in;
                                        const codeChain = CONFIG_CHAINS[token.chain.toLowerCase()]?.Kode_Chain;
                                        dexLink = generateDexLink(
                                            dexName || dex,
                                            token.chain,
                                            codeChain,
                                            isKiri ? token.symbol_in : token.symbol_out,
                                            scIn,
                                            isKiri ? token.symbol_out : token.symbol_in,
                                            scOut
                                        ) || '#';
                                    }
                                } catch (_) { }

                                statusSpan.innerHTML = `<span class="uk-label uk-label-danger">ERROR</span> <a href="${dexLink}" target="_blank" rel="noopener" class="uk-link-muted" title="Check swap manually on DEX" style="font-size:0.9em;">🔗</a>`;
                                if (message) {
                                    statusSpan.title = String(message);
                                    setCellTitleByEl(cell, String(message));
                                    // Ensure the visible ERROR/TIMEOUT badge also shows the tooltip itself
                                    try { const lab = statusSpan.querySelector('.uk-label'); if (lab) lab.setAttribute('title', String(message)); } catch (_) { }
                                } else {
                                    statusSpan.removeAttribute('title');
                                }
                                // Finalize regardless of tab visibility
                                try { clearDexTickerById(idCELL); } catch (_) { }
                                try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch (_) { }
                            }
                        };

                        /**
                         * Validasi cepat sebelum memanggil API DEX untuk menghindari request yang tidak perlu.
                         * @returns {{ok: boolean, reason?: string}}
                         */
                        const validateDexReadiness = () => {
                            const modal = isKiri ? modalKiri : modalKanan;
                            const amtIn = isKiri ? amount_in_token : amount_in_pair;
                            const chainCfg = CONFIG_CHAINS[String(token.chain).toLowerCase()] || {};
                            // Modal must be > 0
                            if (!(Number(modal) > 0)) return { ok: false, reason: 'Modal tidak valid (<= 0)' };
                            // Amount-in must be > 0
                            if (!(Number(amtIn) > 0)) return { ok: false, reason: 'Amount input tidak valid (<= 0)' };
                            // Chain code must exist (used by DEX link and queries)
                            if (!chainCfg || !chainCfg.Kode_Chain) return { ok: false, reason: 'Kode chain tidak tersedia' };
                            // Basic SC presence (after NON fallback sanitation)
                            if (!scInSafe || !scOutSafe || String(scInSafe).length < 6 || String(scOutSafe).length < 6) return { ok: false, reason: 'Alamat kontrak tidak lengkap' };
                            return { ok: true };
                        };

                        const ready = validateDexReadiness();
                        if (!ready.ok) { updateDexCellStatus('failed', dex, ready.reason); return; }

                        // REMOVED: Watchdog keys removed

                        /**
                         * Handler yang dijalankan jika panggilan API DEX (atau fallback-nya) berhasil.
                         * @param {object} dexResponse - Respons dari `getPriceDEX` atau `getPriceAltDEX`.
                         * @param {boolean} [isFallback=false] - True jika ini adalah hasil dari fallback.
                         * @param {string} [fallbackSource=''] - Sumber fallback ('DZAP' atau 'SWOOP').
                         */
                        const handleSuccess = (dexResponse, isFallback = false, fallbackSource = '') => {
                            try {
                                // REMOVED: clearAllWatchdogs()
                                // REFACTORED: Tambahkan info sumber alternatif ke dexResponse
                                const finalDexRes = isFallback ? {
                                    ...dexResponse,
                                    dexTitle: (dexResponse.dexTitle || dex),
                                    isFallback: true,  // Flag untuk DisplayPNL
                                    fallbackSource: fallbackSource || 'UNKNOWN'
                                } : dexResponse;
                                // Panggil `calculateResult` untuk menghitung PNL dan data lainnya.
                                // ✅ AUTO VOLUME: Separate display price from calculation price
                                const cexBuyPriceCalc = (autoVolResult && !autoVolResult.error && isKiri)
                                    ? autoVolResult.avgPrice  // PNL: use weighted average
                                    : DataCEX.priceBuyToken;
                                const cexSellPriceCalc = (autoVolResult && !autoVolResult.error && !isKiri)
                                    ? autoVolResult.avgPrice
                                    : DataCEX.priceSellToken;

                                // ✅ CRITICAL FIX: Use `modal` (actual modal from Auto Volume), NOT modalKiri/modalKanan (max modal)!
                                // ✅ CRITICAL FIX #2: Use `amountIn` (actual amount from Auto Volume), NOT amount_in_token/amount_in_pair (based on max modal)!
                                const update = calculateResult(
                                    baseId, tableBodyId, finalDexRes.amount_out, finalDexRes.FeeSwap,
                                    isKiri ? token.sc_in : token.sc_out, isKiri ? token.sc_out : token.sc_in,
                                    token.cex, modal,  // ✅ FIX: Use `modal` (actualModal when Auto Volume ON)
                                    amountIn,          // ✅ FIX: Use `amountIn` (from Auto Volume OR fixed modal)
                                    cexBuyPriceCalc, cexSellPriceCalc, DataCEX.priceBuyPair, DataCEX.priceSellPair,
                                    isKiri ? token.symbol_in : token.symbol_out, isKiri ? token.symbol_out : token.symbol_in,
                                    isKiri ? DataCEX.feeWDToken : DataCEX.feeWDPair,
                                    dex, token.chain, CONFIG_CHAINS[token.chain.toLowerCase()].Kode_Chain,
                                    direction, 0, finalDexRes
                                );


                                // ✅ AUTO VOLUME FEATURES: Inject display data and flags
                                // Pass both AUTO VOL and AUTO LEVEL flags for validation logic
                                update.autoVolEnabled = autoVolSettings.autoVol;
                                update.autoLevelEnabled = autoVolSettings.autoLevel;

                                // ✅ AUTO LEVEL: Inject orderbook result data
                                if (autoVolResult && !autoVolResult.error) {
                                    update.autoVolResult = autoVolResult;
                                    update.maxModal = Number(isKiri ? modalKiri : modalKanan) || 0;
                                    // Override CEX price for display with lastLevelPrice
                                    if (isKiri) {
                                        update.cexBuyPriceDisplay = autoVolResult.lastLevelPrice;
                                        console.log('🎨 [SCANNER] CEX BUY Price Display Override:', {
                                            originalPrice: DataCEX.priceBuyToken,
                                            displayPrice: autoVolResult.lastLevelPrice,
                                            avgPrice: autoVolResult.avgPrice,
                                            levelsUsed: autoVolResult.levelsUsed
                                        });
                                    } else {
                                        update.cexSellPriceDisplay = autoVolResult.lastLevelPrice;
                                        console.log('🎨 [SCANNER] CEX SELL Price Display Override:', {
                                            originalPrice: DataCEX.priceSellToken,
                                            displayPrice: autoVolResult.lastLevelPrice,
                                            avgPrice: autoVolResult.avgPrice,
                                            levelsUsed: autoVolResult.levelsUsed
                                        });
                                    }
                                }

                                // Note: Multi-DEX handling (DZAP, LIFI) is now done in DisplayPNL
                                // The subResults are passed via calculateResult -> update -> DisplayPNL
                                // Buat log ringkasan untuk console jika diaktifkan.
                                // Console log summary for this successful check (cleaned)
                                try {
                                    // Compute DEX USD rate based on direction
                                    const amtIn = isKiri ? amount_in_token : amount_in_pair;
                                    const rate = (Number(finalDexRes.amount_out) || 0) / (Number(amtIn) || 1);
                                    let dexUsd = null;
                                    try {
                                        const stable = (typeof getStableSymbols === 'function') ? getStableSymbols() : ['USDT', 'USDC', 'DAI'];
                                        const baseSym = (typeof getBaseTokenSymbol === 'function') ? getBaseTokenSymbol(token.chain) : '';
                                        const baseUsd = (typeof getBaseTokenUSD === 'function') ? getBaseTokenUSD(token.chain) : 0;
                                        const inSym = String(isKiri ? token.symbol_in : token.symbol_out).toUpperCase();
                                        const outSym = String(isKiri ? token.symbol_out : token.symbol_in).toUpperCase();
                                        if (isKiri) {
                                            // token -> pair: USD per 1 token
                                            if (stable.includes(outSym)) dexUsd = rate;
                                            else if (baseSym && outSym === baseSym && baseUsd > 0) dexUsd = rate * baseUsd;
                                            else dexUsd = rate * (Number(DataCEX.priceBuyPair) || 0); // fallback via CEX
                                        } else {
                                            // pair -> token: USD per 1 token
                                            if (stable.includes(inSym) && rate > 0) dexUsd = 1 / rate;
                                            else if (baseSym && inSym === baseSym && baseUsd > 0 && rate > 0) dexUsd = baseUsd / rate;
                                            else dexUsd = Number(DataCEX.priceSellToken) || 0; // fallback via CEX
                                        }
                                    } catch (_) { dexUsd = null; }

                                    // refactor: removed unused local debug variables (buy/sell/pnl lines)

                                } catch (_) { }
                                // Append success details (rich format)
                                try {
                                    // ✅ SYNC TOOLTIP WITH COLUMN DATA (Single Source of Truth)
                                    // Gunakan data dari objek 'update' (hasil calculateResult) agar 100% konsisten
                                    const chainCfg = (window.CONFIG_CHAINS || {})[String(token.chain).toLowerCase()] || {};
                                    const chainName = (chainCfg.Nama_Chain || token.chain || '').toString().toUpperCase();
                                    const ce = String(token.cex || '').toUpperCase();
                                    const dx = String((finalDexRes?.dexTitle) || dex || '').toUpperCase();
                                    const nameIn = String(isKiri ? token.symbol_in : token.symbol_out).toUpperCase();
                                    const nameOut = String(isKiri ? token.symbol_out : token.symbol_in).toUpperCase();
                                    
                                    // Ambil data dari hasil kalkulasi resmi (calculateResult)
                                    const modal = update.Modal || 0;
                                    const amtIn = update.amount_in || 0;
                                    const outAmt = update.amount_out || 0;
                                    const totalFee = update.totalFee || 0;
                                    const totalValue = update.totalValue || 0;
                                    const profitLoss = update.profitLoss || 0;
                                    const pnlPct = update.profitLossPercent || 0;
                                    const effDexPerToken = update.dexUsdRate || 0;
                                    
                                    // Fee data from update
                                    const feeSwap = update.FeeSwap || 0;
                                    const feeWD = update.FeeWD || 0;
                                    // feeTrade dihitung di calculateResult tapi tidak di-expose sebagai field terpisah yang jelas
                                    // kita hitung sisanya saja untuk kejelasan tooltip
                                    const feeTrade = (totalFee - feeSwap - feeWD - (update.feeTransfer || 0));
                                    const feeTransfer = update.feeTransfer || 0;

                                    const feeSrc = String(finalDexRes.feeSource || 'fallback').toLowerCase();
                                    const feeSrcLbl = feeSrc === 'api'  ? '✅ dari API'
                                                    : feeSrc === 'calc' ? 'dari kalkulasi gas'
                                                    :                     '⚠️ estimasi fallback';

                                    const toIDR = (v) => { try { return (typeof formatIDRfromUSDT === 'function') ? formatIDRfromUSDT(Number(v) || 0) : ''; } catch (_) { return ''; } };
                                    const buyPriceCEX = Number(update.priceBuyToken_CEX || 0);
                                    const sellPriceCEX = Number(update.priceSellToken_CEX || 0);

                                    const buyLine = isKiri
                                        ? `    🛒 Beli di ${ce} @ $${buyPriceCEX.toFixed(6)} → ${amtIn.toFixed(6)} ${nameIn}`
                                        : `    🛒 Beli di ${dx} @ ~$${effDexPerToken.toFixed(6)} / ${nameOut}`;
                                    const buyIdrLine = isKiri
                                        ? `    💱 Harga Beli (${ce}): $${buyPriceCEX.toFixed(6)} USDT | ${toIDR(buyPriceCEX)}`
                                        : `    💱 Harga Beli (${dx}): ~$${effDexPerToken.toFixed(6)} USDT | ${toIDR(effDexPerToken)}`;
                                    const sellIdrLine = isKiri
                                        ? `    💱 Harga Jual (${dx}): ~$${effDexPerToken.toFixed(6)} USDT | ${toIDR(effDexPerToken)}`
                                        : `    💱 Harga Jual (${ce}): $${sellPriceCEX.toFixed(6)} USDT | ${toIDR(sellPriceCEX)}`;
                                    
                                    const nowStr = (new Date()).toLocaleTimeString();
                                    const viaName = (function () {
                                        try {
                                            const routeTool = String(finalDexRes?.routeTool || '').trim();
                                            if (routeTool && routeTool.length > 0) return routeTool.toUpperCase();
                                            if (isFallback === true) return 'SWOOP';
                                        } catch (_) { }
                                        return dx;
                                    })();

                                    const headerBlock = [
                                        '======================================',
                                        `Time: ${nowStr}`,
                                        `PROSES : ${isKiri ? `${ce} => ${dx}` : `${dx} => ${ce}`} (SOURCE: ${viaName})`,
                                        'STATUS DEX : OK'
                                    ].join('\n');

                                    const tokenInInfo = `    📥 Token IN  : ${nameIn} (${String(update.sc_input).substring(0, 10)}...)`;
                                    const tokenOutInfo = `    📤 Token OUT : ${nameOut} (${String(update.sc_output).substring(0, 10)}...)`;

                                    const sourceInfo = (function () {
                                        try {
                                            if (isFallback === true) {
                                                const routeTool = String(finalDexRes?.routeTool || '').toUpperCase();
                                                if (routeTool) return `    🔄 SUMBER: ${routeTool}`;
                                                return `    🔄 SUMBER: SWOOP`;
                                            }
                                        } catch (_) { }
                                        return '';
                                    })();

                                    const feeBreakdown = isKiri
                                        ? [
                                            `    🏦 Fee WD (CEX): $${feeWD.toFixed(4)}`,
                                            `    🛒 Fee Swap (DEX): $${feeSwap.toFixed(4)} (${feeSrcLbl})`,
                                            `    💼 Fee Trade (CEX): $${feeTrade.toFixed(4)}`,
                                        ]
                                        : [
                                            `    🛒 Fee Swap (DEX): $${feeSwap.toFixed(4)} (${feeSrcLbl})`,
                                            `    📤 Fee Transfer (Gas): $${feeTransfer.toFixed(4)}`,
                                            `    💼 Fee Trade (CEX): $${feeTrade.toFixed(4)}`,
                                        ];

                                    // Bruto = totalValue - modal (sebelum fee)
                                    const brutoValue = totalValue - modal;

                                    const lines = [
                                        headerBlock,
                                        sourceInfo,
                                        tokenInInfo,
                                        tokenOutInfo,
                                        `    🪙 Modal: $${modal.toFixed(2)}`,
                                        buyLine,
                                        buyIdrLine,
                                        '',
                                        `    💰 Swap di ${dx}:`,
                                        `    - Harga Swap Efektif: ~$${effDexPerToken.toFixed(6)} / ${nameIn}`,
                                        `    - Hasil: $${totalValue.toFixed(6)}`,
                                        sellIdrLine,
                                        '',
                                        ...feeBreakdown,
                                        `    🧾 Total Fee: ~$${totalFee.toFixed(4)}`,
                                        '',
                                        `    📈 PNL: ${brutoValue >= 0 ? '+' : ''}${brutoValue.toFixed(2)} USDT (${pnlPct.toFixed(2)}%)`,
                                        `    🚀 PROFIT : ${profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(2)} USDT`,
                                        `idCELL: ${idCELL}`,
                                    ].filter(Boolean).join('\n');
                                    
                                    setCellTitleById(idCELL, lines);
                                    try { if (window.SCAN_LOG_ENABLED) console.log(lines); } catch (_) { }
                                } catch (_) { }
                                // Masukkan hasil kalkulasi ke antrian pembaruan UI.
                                // console.log(`[PUSH TO QUEUE] Pushing update to uiUpdateQueue`, { idCELL, isFallback, type: update.type });
                                uiUpdateQueue.push(update);
                                // REFACTORED: Selalu pastikan UI update loop aktif setiap ada item baru
                                // Ini membuat hasil DEX langsung tampil tanpa menunggu frame berikutnya
                                try {
                                    if (!animationFrameId) {
                                        animationFrameId = requestAnimationFrame(processUiUpdates);
                                    }
                                } catch (_) {
                                    try { processUiUpdates(); } catch (_) { }
                                }
                            } finally {
                                markDexRequestEnd();
                            }
                        };

                        /**
                         * Handler yang dijalankan jika panggilan API DEX utama gagal.
                         * @param {object} initialError - Objek error dari `getPriceDEX`.
                         */
                        const handleError = (initialError) => {
                            try { lastPrimaryError = initialError; } catch (_) { }
                            // REMOVED: clearAllWatchdogs()
                            // debug logs removed
                            const dexConfig = CONFIG_DEXS[dex.toLowerCase()];
                            // Build richer error title with HTTP status code only if not already present
                            let msg = (initialError && initialError.pesanDEX) ? String(initialError.pesanDEX) : 'Unknown Error';
                            const hasPrefix = /\[(HTTP \d{3}|XHR ERROR 200)\]/.test(msg);
                            try {
                                const code = Number(initialError && initialError.statusCode);
                                if (!hasPrefix && Number.isFinite(code) && code > 0) {
                                    if (code === 200) msg = `[XHR ERROR 200] ${msg}`;
                                    else msg = `[HTTP ${code}] ${msg}`;
                                }
                            } catch (_) { }
                            // Periksa apakah DEX ini dikonfigurasi untuk menggunakan fallback.
                            if (dexConfig && dexConfig.allowFallback) {
                                // ✅ REFACTORED: Fallback is now handled internally by getPriceDEX
                                // It will use the alternative specified in CONFIG_DEXS (e.g., lifi-odos for ODOS)
                                // No need to call getPriceAltDEX (legacy global fallback)
                                console.log(`[FALLBACK] ${dex.toUpperCase()} has allowFallback=true, but fallback is handled internally by getPriceDEX`);

                                // Display error since fallback already failed internally
                                updateDexCellStatus('error', dex, msg);

                                // ✅ ENHANCEMENT: Add detailed error info with provider/strategy details
                                try {
                                    const nowStr = (new Date()).toLocaleTimeString();
                                    const dxName = String(dex || '').toUpperCase();
                                    const ceName = String(token.cex || '').toUpperCase();

                                    // ✅ Detect if both primary and fallback failed
                                    const bothFailed = initialError && initialError.bothFailed === true;
                                    let providerInfo = '';

                                    if (bothFailed) {
                                        // Both strategies failed - show detailed breakdown
                                        const primaryProv = String(initialError.primaryProvider || 'PRIMARY');
                                        const fallbackProv = String(initialError.fallbackProvider || 'FALLBACK');
                                        const primaryCode = initialError.primaryCode || 'NA';
                                        const fallbackCode = initialError.fallbackCode || 'NA';
                                        providerInfo = `Primary: ${primaryProv} (${primaryCode}) | Fallback: ${fallbackProv} (${fallbackCode})`;
                                    } else if (initialError && initialError.providerName) {
                                        // Single strategy failed
                                        providerInfo = String(initialError.providerName);
                                    } else if (initialError && initialError.strategyUsed) {
                                        // Fallback: use strategy key
                                        providerInfo = String(initialError.strategyUsed).toUpperCase();
                                    } else {
                                        // Last resort: use DEX name
                                        providerInfo = dxName;
                                    }

                                    const prosesLine = (direction === 'TokentoPair')
                                        ? `PROSES : ${ceName} => ${dxName} (SOURCE: ${providerInfo})`
                                        : `PROSES : ${dxName} => ${ceName} (SOURCE: ${providerInfo})`;

                                    let s = 'FAILED';
                                    try {
                                        const ts = String(initialError && initialError.textStatus || '').toLowerCase();
                                        if (ts === 'timeout' || /timeout/i.test(String(initialError && initialError.pesanDEX || ''))) s = 'TIMEOUT';
                                    } catch (_) { s = 'FAILED'; }

                                    const codeNum = Number(initialError && initialError.statusCode);
                                    const statusLine = `STATUS DEX : ${s} (KODE ERROR : ${Number.isFinite(codeNum) ? codeNum : 'NA'})`;

                                    // ✅ Build detailed error breakdown
                                    const errorDetails = [];
                                    if (bothFailed) {
                                        errorDetails.push('======================================');
                                        errorDetails.push('⚠️  BOTH STRATEGIES FAILED');
                                        errorDetails.push('======================================');
                                        errorDetails.push(`PRIMARY STRATEGY: ${initialError.primaryStrategy || 'unknown'}`);
                                        errorDetails.push(`  Provider: ${initialError.primaryProvider || 'unknown'}`);
                                        errorDetails.push(`  Error Code: ${initialError.primaryCode || 'NA'}`);
                                        errorDetails.push(`  Error: ${initialError.primaryError || 'unknown'}`);
                                        errorDetails.push('');
                                        errorDetails.push(`FALLBACK STRATEGY: ${initialError.fallbackStrategy || 'unknown'}`);
                                        errorDetails.push(`  Provider: ${initialError.fallbackProvider || 'unknown'}`);
                                        errorDetails.push(`  Error Code: ${initialError.fallbackCode || 'NA'}`);
                                        errorDetails.push(`  Error: ${initialError.fallbackError || 'unknown'}`);
                                    }

                                    const headerBlock = [
                                        '======================================',
                                        `Time: ${nowStr}`,
                                        prosesLine,
                                        statusLine,
                                        ...errorDetails
                                    ].join('\n');
                                    setCellTitleById(idCELL, headerBlock);
                                    try { if (window.SCAN_LOG_ENABLED) console.log(headerBlock); } catch (_) { }
                                } catch (_) { }
                                markDexRequestEnd();
                            } else {
                                // Jika tidak ada fallback, langsung tampilkan error.
                                // Use formatted message with HTTP code when available (avoid duplicate prefix)
                                updateDexCellStatus('error', dex, msg);
                                // ✅ ENHANCEMENT: Add detailed error info with provider/strategy details
                                try {
                                    const nowStr = (new Date()).toLocaleTimeString();
                                    const dxName = String(dex || '').toUpperCase();
                                    const ceName = String(token.cex || '').toUpperCase();

                                    // ✅ Extract provider/strategy info
                                    let providerInfo = '';
                                    if (initialError && initialError.providerName) {
                                        providerInfo = String(initialError.providerName);
                                    } else if (initialError && initialError.strategyUsed) {
                                        providerInfo = String(initialError.strategyUsed).toUpperCase();
                                    } else {
                                        providerInfo = dxName;
                                    }

                                    // PROSES mengikuti arah
                                    const prosesLine = (direction === 'TokentoPair')
                                        ? `PROSES : ${ceName} => ${dxName} (SOURCE: ${providerInfo})`
                                        : `PROSES : ${dxName} => ${ceName} (SOURCE: ${providerInfo})`;

                                    // STATUS
                                    let s = 'FAILED';
                                    try {
                                        const ts = String(initialError && initialError.textStatus || '').toLowerCase();
                                        if (ts === 'timeout' || /timeout/i.test(String(initialError && initialError.pesanDEX || ''))) s = 'TIMEOUT';
                                    } catch (_) { s = 'FAILED'; }
                                    const codeNum = Number(initialError && initialError.statusCode);
                                    const statusLine = `STATUS DEX : ${s} (KODE ERROR : ${Number.isFinite(codeNum) ? codeNum : 'NA'})`;

                                    // ✅ Add provider details if available
                                    const providerDetails = [];
                                    if (initialError && initialError.strategyUsed) {
                                        providerDetails.push('');
                                        providerDetails.push(`STRATEGY: ${initialError.strategyUsed}`);
                                        providerDetails.push(`PROVIDER: ${providerInfo}`);
                                    }

                                    const headerBlock = [
                                        '======================================',
                                        `Time: ${nowStr}`,
                                        prosesLine,
                                        statusLine,
                                        ...providerDetails
                                    ].join('\n');
                                    // FIX: Gunakan setCellTitleById untuk replace (bukan append) agar tidak ada header [LOG...]
                                    setCellTitleById(idCELL, headerBlock);
                                    try { if (window.SCAN_LOG_ENABLED) console.log(headerBlock); } catch (_) { }
                                } catch (_) { }
                                try {
                                    // Align console info with requested orderbook logic (logs removed)
                                } catch (_) { }
                                markDexRequestEnd();
                            }
                        };

                        // Update UI ke status "Checking" sebelum memanggil API.
                        // Include CEX summary in title while checking
                        const fmt6 = v => (Number.isFinite(+v) ? (+v).toFixed(6) : String(v));
                        const cexSummary = `CEX READY BT=${fmt6(DataCEX.priceBuyToken)} ST=${fmt6(DataCEX.priceSellToken)} BP=${fmt6(DataCEX.priceBuyPair)} SP=${fmt6(DataCEX.priceSellPair)}`;
                        updateDexCellStatus('checking', dex, cexSummary);
                        // REMOVED: Watchdog for primary DEX removed
                        // ✅ REFACTORED: Scanner timeout now uses per-strategy config
                        // CRITICAL: Scanner window HARUS LEBIH BESAR dari API timeout!
                        // Each strategy has its own timeout from CONFIG_UI.SETTINGS.timeout
                        // Scanner window = API timeout + 1.5s buffer
                        const dexLower = String(dex).toLowerCase();
                        const isOdos = dexLower === 'odos';
                        // ✅ REMOVED: dzap is now REST API provider (single-quote), no longer multi-aggregator
                        const isMultiAggregator = ['swing'].includes(dexLower); // Only SWING still uses multi-aggregator

                        let dexTimeoutWindow;
                        if (isOdos) {
                            // ODOS: API timeout 5s + 1.5s buffer = 6.5s
                            dexTimeoutWindow = 6500;
                        } else if (isMultiAggregator) {
                            // SWING: API timeout 6s + 1.5s buffer = 7.5s
                            dexTimeoutWindow = 7500;
                            console.log(`⏱️ [${dexLower.toUpperCase()} SCANNER WINDOW] Using extended deadline: ${dexTimeoutWindow}ms`);
                        } else {
                            // Other DEX: use defaultTimeout + 1.5s buffer
                            const apiTimeout = Math.max(defaultTimeout, 3000);
                            const buffer = 1500;  // 1.5s buffer (API timeout + buffer > API timeout)
                            dexTimeoutWindow = apiTimeout + buffer;
                        }
                        // Mulai ticker countdown untuk menampilkan sisa detik pada label "Checking".
                        try {
                            const endAt = Date.now() + dexTimeoutWindow;
                            // Stamp a deadline on the cell for a global safety sweeper
                            try { const c = document.getElementById(idCELL); if (c) { c.dataset.deadline = String(endAt); c.dataset.dex = String(dex); c.dataset.checking = '1'; } } catch (_) { }
                            const renderCheck = (secs, cell) => {
                                const span = ensureDexStatusSpan(cell);
                                span.innerHTML = `<span class=\"uk-margin-small-right\" uk-spinner=\"ratio: 0.5\"></span>${String(dex || '').toUpperCase()} (${secs}s)`;
                                try { if (window.UIkit && UIkit.update) UIkit.update(cell); } catch (_) { }
                            };
                            const onEndCheck = () => {
                                // REMOVED: Watchdog logic removed
                                // Timeout will be handled by ticker and safety sweeper in processUiUpdates
                            };
                            // Define lightweight helper locally (reused)
                            const startTicker = (endAt, render, onEnd) => {
                                try {
                                    window._DEX_TICKERS = window._DEX_TICKERS || new Map();
                                    const key = idCELL + ':ticker';
                                    if (window._DEX_TICKERS.has(key)) { clearInterval(window._DEX_TICKERS.get(key)); window._DEX_TICKERS.delete(key); }
                                    const tick = () => {
                                        const rem = endAt - Date.now();
                                        const secs = Math.max(0, Math.ceil(rem / 1000));
                                        const cell = document.getElementById(idCELL);
                                        if (!cell) { clearDexTickerById(idCELL); return; }
                                        if (cell.dataset && cell.dataset.final === '1') { clearDexTickerById(idCELL); return; }
                                        render(secs, cell);
                                        if (rem <= 0) { clearDexTickerById(idCELL); /*if (typeof onEnd === 'function') onEnd();*/ }
                                    };
                                    const intId = setInterval(tick, 1000);
                                    window._DEX_TICKERS.set(key, intId);
                                    tick();
                                } catch (_) { }
                            };
                            startTicker(endAt, renderCheck, onEndCheck);
                        } catch (_) { }

                        // Panggil API DEX setelah jeda yang dikonfigurasi.
                        // FIX: markDexRequestStart HARUS dipanggil SEBELUM setTimeout agar
                        // waitForPendingDexRequests tidak resolve prematur saat scan 1 token.
                        // Gunakan _workerTimer agar DEX call tidak di-throttle saat tab inactive.
                        markDexRequestStart();
                        (window._workerTimer || { setTimeout }).setTimeout(() => {
                            if (!isScanRunning) {
                                markDexRequestEnd();
                                return;
                            }
                            getPriceDEX(
                                scInSafe, desInSafe,
                                scOutSafe, desOutSafe,
                                amountIn,  // Use calculated amount from Auto Volume or fixed modal
                                // ===== AUTO SKIP FEATURE =====
                                // Jika CEX gagal, gunakan default price pair (1 untuk simplicity)
                                (cexResult.ok && DataCEX.priceBuyPair > 0) ? DataCEX.priceBuyPair : 1,
                                dex,
                                isKiri ? token.symbol_in : token.symbol_out, isKiri ? token.symbol_out : token.symbol_in,
                                token.cex, token.chain, CONFIG_CHAINS[token.chain.toLowerCase()].Kode_Chain, direction, tableBodyId
                            )
                                // Panggil handler yang sesuai berdasarkan hasil promise.
                                .then((dexRes) => { /* REMOVED: clearAllWatchdogs() */ handleSuccess(dexRes); })
                                .catch((err) => { handleError(err); });
                        }, getJedaDex(dex));
                    };
                    // Jalankan untuk kedua arah: CEX->DEX dan DEX->CEX.
                    // OPTIMASI: Skip fetch jika checkbox Wallet CEX aktif DAN status WD/DP OFF
                    const isWalletCEXChecked = (typeof $ === 'function') ? $('#checkWalletCEX').is(':checked') : false;

                    // Get symbols for skip reason messages
                    const sym1 = String(token.symbol_in || '').toUpperCase();
                    const sym2 = String(token.symbol_out || '').toUpperCase();

                    // CEX→DEX (TokentoPair): User beli TOKEN di CEX → WD TOKEN → Swap di DEX → DP PAIR ke CEX
                    // Required: WD TOKEN dan DP PAIR harus ON
                    // ✅ FIX: Prioritize CEX-specific status from dataCexs
                    const cexDataForSkip = (token.dataCexs && token.cex) ? token.dataCexs[String(token.cex).toUpperCase()] : null;
                    const withdrawToken = (cexDataForSkip && cexDataForSkip.withdrawToken !== undefined) ? cexDataForSkip.withdrawToken : token.withdrawToken;
                    const depositPair = (cexDataForSkip && cexDataForSkip.depositPair !== undefined) ? cexDataForSkip.depositPair : token.depositPair;

                    const shouldSkipTokenToPair = !cexResult.ok ||
                        (isWalletCEXChecked && (withdrawToken === false || depositPair === false));
                    if (!shouldSkipTokenToPair) {
                        callDex('TokentoPair');
                    } else {
                        // Set status SKIP untuk sel yang di-skip (CEX no price atau Withdraw OFF)
                        const tokenId = String(token.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const baseIdRaw = `${String(token.cex).toUpperCase()}_${String(dex).toUpperCase()}_${sym1}_${sym2}_${String(token.chain).toUpperCase()}_${tokenId}`;
                        const baseId = baseIdRaw.replace(/[^A-Z0-9_]/g, '');
                        const idCELL = tableBodyId + '_' + baseId;
                        const cell = document.getElementById(idCELL);
                        if (cell) {
                            try { cell.classList.add('dex-skip'); } catch (_) { }
                            const span = ensureDexStatusSpan(cell);
                            span.className = 'dex-status uk-text-muted';
                            span.innerHTML = `<span class=\"uk-label uk-label-warning\"><< SKIP >></span>`;
                            // Tentukan alasan skip untuk CEX→DEX
                            let skipReason = 'CEX tidak ada harga - DEX di-skip';
                            if (cexResult.ok) {
                                // CEX→DEX butuh: WD TOKEN dan DP PAIR
                                const missing = [];
                                if (withdrawToken === false) missing.push(`WD ${sym1}`);
                                if (depositPair === false) missing.push(`DP ${sym2}`);

                                if (missing.length === 2) {
                                    skipReason = `${missing.join(' & ')} OFF - Complete cycle tidak viable`;
                                } else if (withdrawToken === false) {
                                    skipReason = `WD ${sym1} OFF - Tidak bisa withdraw Token dari CEX`;
                                } else if (depositPair === false) {
                                    skipReason = `DP ${sym2} OFF - Tidak bisa deposit Pair hasil swap ke CEX`;
                                }
                            }
                            span.title = skipReason;
                            try { if (cell.dataset) cell.dataset.final = '1'; } catch (_) { }
                        }
                    }

                    // DEX→CEX (PairtoToken): User WD PAIR dari CEX → Swap di DEX → DP TOKEN hasil swap ke CEX
                    // Required: WD PAIR dan DP TOKEN harus ON
                    // ✅ FIX: Prioritize CEX-specific status from dataCexs
                    const withdrawPair = (cexDataForSkip && cexDataForSkip.withdrawPair !== undefined) ? cexDataForSkip.withdrawPair : token.withdrawPair;
                    const depositToken = (cexDataForSkip && cexDataForSkip.depositToken !== undefined) ? cexDataForSkip.depositToken : token.depositToken;

                    const shouldSkipPairToToken = !cexResult.ok ||
                        (isWalletCEXChecked && (withdrawPair === false || depositToken === false));
                    if (!shouldSkipPairToToken) {
                        callDex('PairtoToken');
                    } else {
                        // Set status SKIP untuk sel yang di-skip (CEX no price atau Deposit OFF)
                        const sym1Out = String(token.symbol_out || '').toUpperCase();
                        const sym2In = String(token.symbol_in || '').toUpperCase();
                        const tokenId = String(token.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const baseIdRaw = `${String(token.cex).toUpperCase()}_${String(dex).toUpperCase()}_${sym1Out}_${sym2In}_${String(token.chain).toUpperCase()}_${tokenId}`;
                        const baseId = baseIdRaw.replace(/[^A-Z0-9_]/g, '');
                        const idCELL = tableBodyId + '_' + baseId;
                        const cell = document.getElementById(idCELL);
                        if (cell) {
                            try { cell.classList.add('dex-skip'); } catch (_) { }
                            const span = ensureDexStatusSpan(cell);
                            span.className = 'dex-status uk-text-muted';
                            span.innerHTML = `<span class=\"uk-label uk-label-warning\"><< SKIP >> </span>`;
                            // Tentukan alasan skip untuk DEX→CEX
                            let skipReason = 'CEX tidak ada harga - DEX di-skip';
                            if (cexResult.ok) {
                                // DEX→CEX butuh: WD PAIR dan DP TOKEN
                                const missing = [];
                                if (withdrawPair === false) missing.push(`WD ${sym1Out}`);
                                if (depositToken === false) missing.push(`DP ${sym2In}`);

                                if (missing.length === 2) {
                                    skipReason = `${missing.join(' & ')} OFF - Complete cycle tidak viable`;
                                } else if (withdrawPair === false) {
                                    skipReason = `WD ${sym1Out} OFF - Tidak bisa withdraw Pair dari CEX`;
                                } else if (depositToken === false) {
                                    skipReason = `DP ${sym2In} OFF - Tidak bisa deposit Token hasil swap ke CEX`;
                                }
                            }
                            span.title = skipReason;
                            try { if (cell.dataset) cell.dataset.final = '1'; } catch (_) { }
                        }
                    }
                });
            }

            // ===== META-DEX SCAN LOOP =====
            // Scan Meta-DEX aggregators (lifi, dzap, rubic, rango, kamino) terpisah dari token.dexs.
            // Hanya berjalan jika CONFIG_APP.APP.META_DEX === true dan CEX result OK.
            if (window.CONFIG_APP?.APP?.META_DEX === true && cexResult.ok) {
                const metaDexAggregators = window.CONFIG_APP?.META_DEX_CONFIG?.aggregators || {};
                const metaDexUserSettings = (ConfigScan.metaDex?.aggregators) || {};
                const currentChain = String(token.chain || '').toLowerCase();
                const supportedEVMChains = window.CONFIG_APP?.META_DEX_CONFIG?.supportedChains || [];

                // ✅ Baca modal PER-TOKEN dari token.dataDexs (sama seperti DEX regular)
                // Modal diset user di form edit koin / bulk modal editor, berlaku per-token
                const tokenDataDexs = token.dataDexs || {};

                // ✅ Top-N routes: batasi jumlah route yang diproses (default 3)
                const topNRoutes = parseInt(ConfigScan?.metaDex?.topRoutes) || 3;

                for (const [aggKey, aggConfig] of Object.entries(metaDexAggregators)) {
                    // Cek filter allowedDexs (dari resolveActiveDexList)
                    if (!allowedDexs.includes(aggKey)) continue;

                    // Cek enabled/disabled dari user settings
                    const userAggCfg = metaDexUserSettings[aggKey] || {};
                    const isAggEnabled = userAggCfg.enabled !== undefined ? userAggCfg.enabled : (aggConfig.enabled !== false);
                    if (!isAggEnabled) continue;

                    // EVM-only check: skip Solana chain untuk EVM aggregators
                    if (aggConfig.evmOnly && currentChain === 'solana') continue;
                    // Supported chain check untuk EVM aggregators
                    if (aggConfig.evmOnly && supportedEVMChains.length > 0 && !supportedEVMChains.includes(currentChain)) continue;
                    // Solana-only check: skip non-Solana chains (e.g., KAMINO hanya Solana)
                    if (aggConfig.solanaOnly && currentChain !== 'solana') continue;

                    // Jeda per aggregator: jedaKoin/2 karena setiap token 2 arah (KIRI+KANAN)
                    // Total request META-DEX = N×2, sehingga queue butuh ½×jedaKoin agar selesai bareng DEX biasa
                    const jedaAgg = Math.max(Math.floor((jedaKoin || 400) / 2), 150);

                    // Normalize contract addresses
                    const chainCfgMeta = (window.CONFIG_CHAINS || {})[currentChain] || {};
                    const pairDefsMeta = chainCfgMeta.PAIRDEXS || {};
                    const nonDefMeta = pairDefsMeta['NON'] || {};
                    const isAddrInvalidMeta = (addr) => !addr || String(addr).toLowerCase() === '0x' || String(addr).length < 6;

                    // Scan kedua arah: TokentoPair dan PairtoToken
                    ['TokentoPair', 'PairtoToken'].forEach(metaDir => {
                        const isKiriMeta = metaDir === 'TokentoPair';
                        if (isKiriMeta && !isPosChecked('Actionkiri')) return;
                        if (!isKiriMeta && !isPosChecked('ActionKanan')) return;

                        // ID generation (sebelum skip checks agar bisa tampilkan SKIP di cell)
                        const sym1Meta = isKiriMeta ? String(token.symbol_in || '').toUpperCase() : String(token.symbol_out || '').toUpperCase();
                        const sym2Meta = isKiriMeta ? String(token.symbol_out || '').toUpperCase() : String(token.symbol_in || '').toUpperCase();
                        const tokenIdMeta = String(token.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                        const baseIdRawMeta = `${String(token.cex).toUpperCase()}_${aggKey.toUpperCase()}_${sym1Meta}_${sym2Meta}_${String(token.chain).toUpperCase()}_${tokenIdMeta}`;
                        const metaBaseId = baseIdRawMeta.replace(/[^A-Z0-9_]/g, '');
                        const metaCellId = tableBodyId + '_' + metaBaseId;

                        // Helper: tampilkan SKIP di cell (sama seperti regular DEX)
                        const markMetaSkip = (reason, isError) => {
                            const cell = document.getElementById(metaCellId);
                            if (!cell) return;
                            try { cell.classList.add('dex-skip'); } catch (_) { }
                            if (isError) try { cell.classList.add('dex-error'); } catch (_) { }
                            const span = ensureDexStatusSpan(cell);
                            span.className = isError ? 'dex-status uk-text-danger' : 'dex-status uk-text-muted';
                            span.innerHTML = `<span class="uk-label uk-label-warning"><< SKIP >></span>`;
                            if (reason) span.title = reason;
                            try { if (cell.dataset) cell.dataset.final = '1'; } catch (_) { }
                        };

                        // Skip check: CEX tidak ada harga
                        if (!cexResult.ok) {
                            markMetaSkip('CEX tidak ada harga - META-DEX di-skip', true);
                            return;
                        }

                        // Skip check (Wallet CEX filter)
                        const isWalletCEXChecked = (typeof $ === 'function') ? $('#checkWalletCEX').is(':checked') : false;
                        if (isWalletCEXChecked) {
                            const cexDataMeta = (token.dataCexs && token.cex) ? token.dataCexs[String(token.cex).toUpperCase()] : null;
                            const wdToken = cexDataMeta?.withdrawToken ?? token.withdrawToken;
                            const dpPair = cexDataMeta?.depositPair ?? token.depositPair;
                            const wdPair = cexDataMeta?.withdrawPair ?? token.withdrawPair;
                            const dpToken = cexDataMeta?.depositToken ?? token.depositToken;
                            if (isKiriMeta && (wdToken === false || dpPair === false)) {
                                const missing = [];
                                if (wdToken === false) missing.push(`WD ${sym1Meta}`);
                                if (dpPair === false) missing.push(`DP ${sym2Meta}`);
                                markMetaSkip(missing.join(' & ') + ' OFF');
                                return;
                            }
                            if (!isKiriMeta && (wdPair === false || dpToken === false)) {
                                const missing = [];
                                if (wdPair === false) missing.push(`WD ${sym1Meta}`);
                                if (dpToken === false) missing.push(`DP ${sym2Meta}`);
                                markMetaSkip(missing.join(' & ') + ' OFF');
                                return;
                            }
                        }

                        // Hitung modal META-DEX — gunakan token.dataDexs sebagai maxModal (per-token),
                        // lalu terapkan Auto Level (sama seperti DEX biasa) jika diaktifkan
                        const maxModalLeft = parseFloat(tokenDataDexs[aggKey]?.left) || 100;
                        const maxModalRight = parseFloat(tokenDataDexs[aggKey]?.right) || 100;
                        const maxModalMeta = isKiriMeta ? maxModalLeft : maxModalRight;

                        let modalMeta = maxModalMeta;
                        let amountInMeta = 0;
                        let autoVolMeta = null; // accessible in .then() closure

                        if (autoVolSettings.autoLevel && DataCEX.orderbook) {
                            const sideMeta = isKiriMeta ? 'asks' : 'bids';
                            autoVolMeta = (typeof calculateAutoVolume === 'function')
                                ? calculateAutoVolume(DataCEX.orderbook, maxModalMeta, autoVolSettings.levels, sideMeta)
                                : null;
                            if (autoVolMeta && !autoVolMeta.error && autoVolMeta.totalCoins > 0) {
                                modalMeta = autoVolMeta.actualModal;
                                amountInMeta = isKiriMeta
                                    ? autoVolMeta.totalCoins
                                    : (DataCEX.priceBuyPair > 0 ? modalMeta / DataCEX.priceBuyPair : 0);
                            } else {
                                amountInMeta = isKiriMeta
                                    ? (DataCEX.priceBuyToken > 0 ? modalMeta / DataCEX.priceBuyToken : 0)
                                    : (DataCEX.priceBuyPair > 0 ? modalMeta / DataCEX.priceBuyPair : 0);
                            }
                        } else {
                            amountInMeta = isKiriMeta
                                ? (DataCEX.priceBuyToken > 0 ? modalMeta / DataCEX.priceBuyToken : 0)
                                : (DataCEX.priceBuyPair > 0 ? modalMeta / DataCEX.priceBuyPair : 0);
                        }

                        if (amountInMeta <= 0) return;

                        // Contract addresses
                        let scInMeta = isKiriMeta ? token.sc_in : token.sc_out;
                        let scOutMeta = isKiriMeta ? token.sc_out : token.sc_in;
                        let desInMeta = isKiriMeta ? Number(token.des_in) : Number(token.des_out);
                        let desOutMeta = isKiriMeta ? Number(token.des_out) : Number(token.des_in);
                        const symOutMeta = isKiriMeta ? String(token.symbol_out || '') : String(token.symbol_in || '');
                        if (String(symOutMeta).toUpperCase() === 'NON' || isAddrInvalidMeta(scOutMeta)) {
                            if (nonDefMeta?.scAddressPair) {
                                scOutMeta = nonDefMeta.scAddressPair;
                                desOutMeta = Number(nonDefMeta.desPair || desOutMeta || 18);
                            }
                        }

                        // Panggil API Meta-DEX dengan per-aggregator scheduler (cegah burst ke rate-limited API)
                        // ✅ AUTO LEVEL: Gunakan avgPrice dari orderbook untuk hitung PNL (sama seperti DEX biasa)
                        const cexBuyPriceCalcMeta = (autoVolMeta && !autoVolMeta.error && isKiriMeta)
                            ? autoVolMeta.avgPrice : DataCEX.priceBuyToken;
                        const cexSellPriceCalcMeta = (autoVolMeta && !autoVolMeta.error && !isKiriMeta)
                            ? autoVolMeta.avgPrice : DataCEX.priceSellToken;

                        scheduleMetaDexRequest(aggKey, jedaAgg, () => {
                            markDexRequestStart();
                            if (!isScanRunning) { markDexRequestEnd(); return; }

                            getPriceDEX(
                                scInMeta, desInMeta, scOutMeta, desOutMeta, amountInMeta,
                                DataCEX.priceBuyPair > 0 ? DataCEX.priceBuyPair : 1,
                                aggKey,
                                isKiriMeta ? token.symbol_in : token.symbol_out,
                                isKiriMeta ? token.symbol_out : token.symbol_in,
                                token.cex, token.chain,
                                (window.CONFIG_CHAINS || {})[currentChain]?.Kode_Chain || '',
                                metaDir, tableBodyId
                            )
                                .then(dexRes => {
                                    try {
                                        const update = calculateResult(
                                            metaBaseId, tableBodyId, dexRes.amount_out, dexRes.FeeSwap,
                                            isKiriMeta ? token.sc_in : token.sc_out,
                                            isKiriMeta ? token.sc_out : token.sc_in,
                                            token.cex, modalMeta, amountInMeta,
                                            cexBuyPriceCalcMeta, cexSellPriceCalcMeta,
                                            DataCEX.priceBuyPair, DataCEX.priceSellPair,
                                            isKiriMeta ? token.symbol_in : token.symbol_out,
                                            isKiriMeta ? token.symbol_out : token.symbol_in,
                                            isKiriMeta ? DataCEX.feeWDToken : DataCEX.feeWDPair,
                                            aggKey, token.chain,
                                            (window.CONFIG_CHAINS || {})[currentChain]?.Kode_Chain || '',
                                            metaDir, 0, dexRes
                                        );
                                        if (update) {
                                            // Mirror regular DEX auto-level fields untuk tampilan ✅/⚠️
                                            update.autoLevelEnabled = autoVolSettings.autoLevel;
                                            if (autoVolSettings.autoLevel && autoVolMeta && !autoVolMeta.error) {
                                                update.autoVolResult = autoVolMeta;
                                                update.maxModal = maxModalMeta;
                                                // ✅ Override display price ke lastLevelPrice (sama seperti DEX biasa)
                                                if (isKiriMeta) {
                                                    update.cexBuyPriceDisplay = autoVolMeta.lastLevelPrice;
                                                } else {
                                                    update.cexSellPriceDisplay = autoVolMeta.lastLevelPrice;
                                                }
                                            }
                                            uiUpdateQueue.push(update);
                                            // REFACTORED: Trigger UI loop untuk render langsung
                                            try { if (!animationFrameId) animationFrameId = requestAnimationFrame(processUiUpdates); } catch (_) { }
                                        }
                                    } catch (e) {
                                        uiUpdateQueue.push({ type: 'error', id: metaCellId, message: `META-DEX ${aggKey.toUpperCase()}: ${e.message}`, swapMessage: '' });
                                        try { if (!animationFrameId) animationFrameId = requestAnimationFrame(processUiUpdates); } catch (_) { }
                                    } finally {
                                        markDexRequestEnd();
                                    }
                                })
                                .catch(err => {
                                    try {
                                        const msg = (err && err.pesanDEX) ? String(err.pesanDEX) : `Error Meta-DEX ${aggKey}`;
                                        uiUpdateQueue.push({ type: 'error', id: metaCellId, message: msg, swapMessage: '' });
                                        try { if (!animationFrameId) animationFrameId = requestAnimationFrame(processUiUpdates); } catch (_) { }
                                    } catch (_) { }
                                    markDexRequestEnd();
                                });
                        }, jedaAgg);
                    });
                }
            }
            // ===== END META-DEX SCAN LOOP =====

            // REFACTORED: Hapus await delay(jedaKoin) dari akhir processRequest.
            // Jeda kini dilakukan via stagger per-token di processTokens,
            // sehingga DEX fire-and-forget tidak terblokir oleh delay ini.
        } catch (error) {
            // console.error(`Kesalahan saat memproses ${token.symbol_in}_${token.symbol_out}:`, error);
        }
    }

    async function processTokens(tokensToProcess, tableBodyId) {
        // Set flag bahwa scan sedang berjalan dan mulai loop update UI.
        isScanRunning = true;
        setEditFormState(true); // Disable form edit saat scanning
        animationFrameId = requestAnimationFrame(processUiUpdates);

        const startTime = Date.now();
        // Bagi daftar token menjadi beberapa grup kecil.
        const tokenGroups = [];
        for (let i = 0; i < tokensToProcess.length; i += scanPerKoin) {
            tokenGroups.push(tokensToProcess.slice(i, i + scanPerKoin));
        }
        // FIX: Simpan total token di variabel global untuk tracking saat delete
        SCAN_TOTAL_TOKENS = tokensToProcess.length;
        SCAN_PROCESSED_TOKENS = 0;
        totalMetaDexScheduled = 0; // Reset counter META-DEX saat scan baru dimulai
        let processed = 0; // track tokens completed across groups

        // --- PROSES UTAMA ---

        // 1. Ambil data harga gas dan kurs USDT/IDR sebelum memulai loop token.
        try {

            $('#progress-bar').css('width', '5%');
            $('#progress-text').text('5%');
        } catch (_) { }
        await feeGasGwei();
        try {
            $('#progress').text('GAS / GWEI CHAINS READY');
            $('#progress-bar').css('width', '8%');
            $('#progress-text').text('8%');
        } catch (_) { }
        await getRateUSDT();

        // 2. Loop melalui setiap grup token.
        for (let groupIndex = 0; groupIndex < tokenGroups.length; groupIndex++) {
            // Jika user menekan STOP, hentikan loop.
            if (!isScanRunning) { break; }
            const groupTokens = tokenGroups[groupIndex];

            // Jika auto-scroll aktif, scroll ke baris token pertama dari grup saat ini.
            if ($('#autoScrollCheckbox').is(':checked') && groupTokens.length > 0) {
                const first = groupTokens[0];
                const suffix = `DETAIL_${first.cex.toUpperCase()}_${first.symbol_in.toUpperCase()}_${first.symbol_out.toUpperCase()}_${first.chain.toUpperCase()}`.replace(/[^A-Z0-9_]/g, '');
                const fullId = `${tableBodyId}_${suffix}`;
                requestAnimationFrame(() => { // REFACTORED
                    // Respect user interaction: temporarily suspend auto-scroll
                    try { if (window.__AUTO_SCROLL_SUSPEND_UNTIL && Date.now() < window.__AUTO_SCROLL_SUSPEND_UNTIL) return; } catch (_) { }
                    const $target = $('#' + fullId).length ? $('#' + fullId) : $(`[id$="${suffix}"]`).first();
                    if (!$target.length) return;
                    $target.addClass('auto-focus');
                    setTimeout(() => $target.removeClass('auto-focus'), 900);
                    // Prefer explicit monitoring container; fallback to nearest scrollable
                    let $container = $('#monitoring-scroll');
                    if (!$container.length) $container = $target.closest('.uk-overflow-auto');
                    if (!$container.length) return; // do not scroll the main page

                    // If container not scrollable, skip instead of scrolling the body
                    const cEl = $container[0];
                    if (!(cEl.scrollHeight > cEl.clientHeight)) return;

                    const tRect = $target[0].getBoundingClientRect();
                    const cRect = cEl.getBoundingClientRect();
                    // Skip if already fully visible inside container viewport
                    const fullyVisible = (tRect.top >= cRect.top) && (tRect.bottom <= cRect.bottom);
                    if (fullyVisible) return;

                    const desiredTop = (tRect.top - cRect.top) + $container.scrollTop() - (cEl.clientHeight / 2) + ($target[0].clientHeight / 2);
                    $container.animate({ scrollTop: Math.max(desiredTop, 0) }, 200);
                });
            }

            // Proses token-token dalam satu grup secara paralel,
            // REFACTORED: Stagger per-token agar DEX results streaming langsung tampil.
            // Setiap token dalam batch diberi jeda proporsional berdasarkan index,
            // sehingga CEX fetch dan DEX fire-and-forget tidak burst bersamaan.
            const jobs = groupTokens.map((token, tokenIndex) => (async () => {
                if (!isScanRunning) return;
                // Stagger delay: token pertama langsung, sisanya diberi jeda proporsional
                if (tokenIndex > 0) {
                    await delay(jedaKoin * tokenIndex);
                }
                if (!isScanRunning) return;
                try { await processRequest(token, tableBodyId); } catch (e) { console.error(`Err token ${token.symbol_in}_${token.symbol_out}`, e); }
                // Update progress as each token finishes
                processed += 1;
                SCAN_PROCESSED_TOKENS = processed;
                // FIX: Gunakan SCAN_TOTAL_TOKENS yang dinamis (berkurang jika ada delete)
                updateProgress(processed, SCAN_TOTAL_TOKENS, startTime, `${token.symbol_in}_${token.symbol_out}`);
            })());

            // Tunggu semua proses dalam grup selesai.
            await Promise.allSettled(jobs);
            if (!isScanRunning) break;
            // Beri jeda antar grup.
            if (groupIndex < tokenGroups.length - 1) { await delay(jedaTimeGroup); }
        }

        // --- FINALISASI SETELAH SEMUA TOKEN SELESAI ---

        // FIX: Gunakan SCAN_TOTAL_TOKENS yang dinamis untuk finalisasi
        const finalTotal = SCAN_TOTAL_TOKENS;

        // Cek apakah META-DEX masih punya request yang pending/scheduled
        const hasPendingMeta = pendingMetaDexScheduled > 0 || activeDexRequests > 0;
        if (hasPendingMeta) {
            // Tampilkan 95% dengan teks "menunggu META-DEX" — bukan SELESAI dulu
            try {
                const dur = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
                $('#progress-bar').css('width', '95%');
                $('#progress-text').text('95%');
                const metaTotalNow = totalMetaDexScheduled || (pendingMetaDexScheduled + activeDexRequests);
                $('#progress').text(`META-DEX - MEMPROSES [0/${metaTotalNow} req] :: Mulai: ${new Date(startTime).toLocaleTimeString()} ~ DURASI [${dur} Menit]`);
            } catch (_) { }

            // Update teks live setiap detik selama menunggu META-DEX
            const metaWaitInterval = setInterval(() => {
                try {
                    if (!isScanRunning && pendingMetaDexScheduled === 0 && activeDexRequests === 0) {
                        clearInterval(metaWaitInterval);
                        return;
                    }
                    const dur2 = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
                    const remaining = pendingMetaDexScheduled + activeDexRequests;
                    const total = totalMetaDexScheduled || remaining;
                    const done = Math.max(0, total - remaining);
                    // Tampilkan: selesai/total request (bukan token, karena tiap token = 2 arah)
                    $('#progress').text(`META-DEX - MEMPROSES [${done}/${total} req] :: Mulai: ${new Date(startTime).toLocaleTimeString()} ~ DURASI [${dur2} Menit]`);
                } catch (_) { }
            }, 1000);

            // Tunggu semua request DEX (regular + META-DEX) benar-benar selesai.
            // REFACTORED: Kurangi buffer timeout karena safety sweeper sudah handle timeout cells.
            // Ini membuat finalisasi scan lebih cepat dan responsif.
            const metaDexQueueRemainingMs = Math.max(0, ...Object.values(metaDexNextTime).map(t => t - Date.now()), 0);
            const waitTimeoutMs = Math.max(10000, metaDexQueueRemainingMs + 5000);
            await waitForPendingDexRequests(waitTimeoutMs);
            clearInterval(metaWaitInterval);
        } else {
            // Tidak ada META-DEX pending, langsung tunggu sisa request in-flight biasa
            const metaDexQueueRemainingMs = Math.max(0, ...Object.values(metaDexNextTime).map(t => t - Date.now()), 0);
            const waitTimeoutMs = Math.max(10000, metaDexQueueRemainingMs + 5000);
            await waitForPendingDexRequests(waitTimeoutMs);
        }

        // Sekarang baru tampilkan SELESAI 100%
        updateProgress(finalTotal, finalTotal, startTime, 'SELESAI');
        if (activeDexRequests > 0) {
            // console.warn(`[FINAL] Continuing with ${activeDexRequests} pending DEX request(s) after timeout window.`);
        }

        // Trigger final processUiUpdates untuk memastikan semua item di queue diproses
        // console.log(`[FINAL] Queue length before final processing: ${uiUpdateQueue.length}`);

        if (uiUpdateQueue.length > 0) {
            // console.log(`[FINAL] Processing remaining ${uiUpdateQueue.length} items in queue...`);

            // Process semua item yang ada di queue secara sinkron di akhir scan
            while (uiUpdateQueue.length > 0) {
                const updateData = uiUpdateQueue.shift();
                if (!updateData) { continue; }
                if (updateData.type === 'error') {
                    const { id, message, swapMessage } = updateData;
                    const cell = document.getElementById(id);
                    if (cell) {
                        try {
                            if (cell.dataset && cell.dataset.final === '1') {
                                continue;
                            }
                        } catch (_) { }
                        try { clearDexTickerById(id); } catch (_) { }
                        try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch (_) { }
                        setDexErrorBackground(cell);
                        const statusSpan = ensureDexStatusSpan(cell);
                        if (statusSpan) {
                            try { statusSpan.className = 'dex-status uk-text-danger'; } catch (_) { }
                            try {
                                statusSpan.classList.remove('uk-text-muted', 'uk-text-warning');
                                statusSpan.classList.add('uk-text-danger');
                            } catch (_) { }
                            statusSpan.innerHTML = `<span class="uk-label uk-label-danger">${swapMessage || 'ERROR'}</span>`;
                            statusSpan.title = message || '';
                        }
                    }
                    continue;
                }
                // console.log(`[FINAL PROCESS]`, { idCELL: updateData.idPrefix + updateData.baseId });
                try {
                    DisplayPNL(updateData);
                } catch (e) {
                    // console.error('[FINAL PROCESS ERROR]', e);
                }
            }
            // console.log('[FINAL] All items processed.');
        } else {
            // console.log('[FINAL] No items in queue to process.');
        }

        // Set flag dan hentikan loop UI SETELAH queue dikuras.
        isScanRunning = false;
        setEditFormState(false); // Placeholder (form tetap aktif saat scanning)
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        setPageTitleForRun(false);

        // === RELEASE GLOBAL SCAN LOCK ===
        try {
            // Clear global scan lock
            const filterKey = typeof getActiveFilterKey === 'function' ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
            if (typeof clearGlobalScanLock === 'function') {
                clearGlobalScanLock(filterKey);
                // console.log('[SCANNER] Global scan lock released:', filterKey);
            }

            // Clear per-tab scanning state
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem('TAB_SCANNING');
                sessionStorage.removeItem('TAB_SCAN_CHAIN');
                sessionStorage.removeItem('TAB_SCAN_START');
            }

            // Notify TabManager untuk broadcast ke tab lain
            if (window.TabManager && typeof window.TabManager.notifyScanStop === 'function') {
                window.TabManager.notifyScanStop();
                // console.log(`[SCANNER] Tab ${window.getTabId()} stopped scanning`);
            }
        } catch (e) {
            // console.error('[SCANNER] Error releasing scan state:', e);
        }

        // Aktifkan kembali UI.
        form_on();
        $("#stopSCAN").hide().prop("disabled", true);
        $('#startSCAN').prop('disabled', false).text('Start').removeClass('uk-button-disabled');
        // Release gating via centralized helper
        if (typeof setScanUIGating === 'function') setScanUIGating(false); // REFACTORED
        // Persist run=NO reliably before any potential next action
        await persistRunStateNo();

        // Buka kunci daftar DEX dan refresh header tabel.
        try {
            if (typeof window !== 'undefined') { window.__LOCKED_DEX_LIST = null; }
            if (typeof window.renderMonitoringHeader === 'function' && typeof window.computeActiveDexList === 'function') {
                window.renderMonitoringHeader(window.computeActiveDexList());
            }
        } catch (_) { }

        // Jika auto-run aktif, mulai countdown untuk scan berikutnya.
        // GUARD: Check if autorun feature is enabled in config
        try {
            const autorunFeatureEnabled = (window.CONFIG_APP?.APP?.AUTORUN !== false);
            const autorunUserEnabled = (window.AUTORUN_ENABLED === true);

            if (autorunFeatureEnabled && autorunUserEnabled) {
                const total = 10; // seconds
                let remain = total;
                const $cd = $('#autoRunCountdown');
                // Disable UI while waiting, similar to running state
                $('#startSCAN').prop('disabled', true).addClass('uk-button-disabled'); // REFACTORED
                $('#stopSCAN').show().prop('disabled', false);
                if (typeof setScanUIGating === 'function') setScanUIGating(true);
                const tick = () => {
                    // Double-check feature + user flags on each tick
                    const stillEnabled = (window.CONFIG_APP?.APP?.AUTORUN !== false) && window.AUTORUN_ENABLED;
                    if (!stillEnabled) {
                        // ✅ PERF: Use TimerManager
                        if (typeof TimerManager !== 'undefined') {
                            TimerManager.clear('autorun-countdown');
                        } else {
                            clearInterval(window.__autoRunInterval);
                            window.__autoRunInterval = null;
                        }
                        return;
                    }
                    $cd.text(`AutoRun ${remain}s`).css({ color: '#e53935', fontWeight: 'bold' });
                    remain -= 1;
                    if (remain < 0) {
                        // ✅ PERF: Use TimerManager
                        if (typeof TimerManager !== 'undefined') {
                            TimerManager.clear('autorun-countdown');
                        } else {
                            clearInterval(window.__autoRunInterval);
                            window.__autoRunInterval = null;
                        }
                        $cd.text('').css({ color: '', fontWeight: '' });
                        // Trigger new scan using current filters/selection
                        $('#startSCAN').trigger('click');
                    }
                };
                // ✅ PERF: Use TimerManager for centralized control
                if (typeof TimerManager !== 'undefined') {
                    TimerManager.setInterval('autorun-countdown', tick, 1000, 'scan');
                } else {
                    clearInterval(window.__autoRunInterval);
                    window.__autoRunInterval = setInterval(tick, 1000);
                }
                tick();
            }
        } catch (_) { }
    }

    processTokens(flatTokens, tableBodyId);
}


/**
 * Stops the currently running scanner.
 * - Jika scan SEDANG berjalan: "hard stop" dengan reload halaman
 * - Jika scan SUDAH selesai (autorun countdown): stop countdown tanpa reload
 * FIX: Prevent losing scan results when user stops autorun countdown
 */
async function stopScanner() {
    const wasScanning = isScanRunning; // Capture state sebelum di-set false

    isScanRunning = false;
    pendingMetaDexScheduled = 0; // Reset agar waitForPendingDexRequests tidak tertahan
    totalMetaDexScheduled = 0;
    try { cancelAnimationFrame(animationFrameId); } catch (_) { }
    // ✅ PERF: Use TimerManager for centralized timer control
    if (typeof TimerManager !== 'undefined') {
        TimerManager.clear('autorun-countdown');
        TimerManager.clearCategory('scan');  // Clear all scan-related timers
    } else {
        clearInterval(window.__autoRunInterval);
        window.__autoRunInterval = null;
    }
    setPageTitleForRun(false);
    if (typeof form_on === 'function') form_on();

    // === RELEASE GLOBAL SCAN LOCK (MANUAL STOP) ===
    try {
        // Clear global scan lock
        const filterKey = typeof getActiveFilterKey === 'function' ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
        if (typeof clearGlobalScanLock === 'function') {
            clearGlobalScanLock(filterKey);
            // console.log('[SCANNER] Global scan lock released (manual stop):', filterKey);
        }

        // Clear per-tab scanning state
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('TAB_SCANNING');
            sessionStorage.removeItem('TAB_SCAN_CHAIN');
            sessionStorage.removeItem('TAB_SCAN_START');
            sessionStorage.setItem('APP_FORCE_RUN_NO', '1');
        }

        // Notify TabManager untuk broadcast ke tab lain
        if (window.TabManager && typeof window.TabManager.notifyScanStop === 'function') {
            window.TabManager.notifyScanStop();
            // console.log(`[SCANNER] Tab ${window.getTabId()} stopped scanning (manual stop)`);
        }
    } catch (e) {
        // console.error('[SCANNER] Error releasing scan state on manual stop:', e);
    }

    // Simpan state 'run:NO'
    await persistRunStateNo();

    // ===== FIX: HANYA reload jika scan SEDANG berjalan =====
    // Jika scan sudah selesai (hanya autorun countdown), JANGAN reload
    if (wasScanning) {
        // Scan sedang berjalan → reload untuk clean state
        console.log('[SCANNER] Scan was running, reloading page...');
        location.reload();
    } else {
        // Scan sudah selesai, hanya stop autorun countdown
        console.log('[SCANNER] Scan already completed, stopping autorun countdown without reload');

        // Reset UI ke state normal
        $('#stopSCAN').hide().prop('disabled', true);
        $('#startSCAN').prop('disabled', false).text('Start').removeClass('uk-button-disabled');
        $('#autoRunCountdown').text('').css({ color: '', fontWeight: '' });

        // Release UI gating
        if (typeof setScanUIGating === 'function') setScanUIGating(false);

        // Show toast notification
        if (typeof toast !== 'undefined' && toast.info) {
            toast.info('Autorun countdown stopped', null, { duration: 2000 });
        }
    }
}

/**
 * Soft-stop scanner without reloading the page.
 * Useful before running long operations (e.g., Update Wallet CEX).
 */
function stopScannerSoft() {
    isScanRunning = false;
    pendingMetaDexScheduled = 0; // Reset agar waitForPendingDexRequests tidak tertahan
    totalMetaDexScheduled = 0;
    try { cancelAnimationFrame(animationFrameId); } catch (_) { }

    // === RELEASE GLOBAL SCAN LOCK (SOFT STOP) ===
    try {
        // Clear global scan lock
        const filterKey = typeof getActiveFilterKey === 'function' ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
        if (typeof clearGlobalScanLock === 'function') {
            clearGlobalScanLock(filterKey);
            // console.log('[SCANNER] Global scan lock released (soft stop):', filterKey);
        }

        // Clear per-tab scanning state
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('TAB_SCANNING');
            sessionStorage.removeItem('TAB_SCAN_CHAIN');
            sessionStorage.removeItem('TAB_SCAN_START');
        }

        // Notify TabManager untuk broadcast ke tab lain
        if (window.TabManager && typeof window.TabManager.notifyScanStop === 'function') {
            window.TabManager.notifyScanStop();
            // console.log(`[SCANNER] Tab ${window.getTabId()} soft stopped scanning`);
        }
    } catch (e) {
        // console.error('[SCANNER] Error releasing scan state on soft stop:', e);
    }

    // Simpan state 'run:NO' tanpa me-reload halaman.
    try { (async () => { await persistRunStateNo(); })(); } catch (_) { }
    // ✅ PERF: Use TimerManager for centralized timer control
    if (typeof TimerManager !== 'undefined') {
        TimerManager.clear('autorun-countdown');
    } else {
        clearInterval(window.__autoRunInterval);
        window.__autoRunInterval = null;
    }
    if (typeof form_on === 'function') form_on();
}

/**
 * Memperbarui banner info di atas untuk menunjukkan chain mana saja yang sedang dipindai.
 * @param {string[]} [seedChains] - Daftar awal chain yang akan ditampilkan.
 */
function updateRunningChainsBanner(seedChains) {
    try {
        const setKeys = new Set();
        if (Array.isArray(seedChains)) seedChains.forEach(c => { if (c) setKeys.add(String(c).toLowerCase()); });
        const cache = (typeof window.RUN_STATES === 'object' && window.RUN_STATES) ? window.RUN_STATES : {};
        Object.keys(window.CONFIG_CHAINS || {}).forEach(k => { if (cache[String(k).toLowerCase()]) setKeys.add(String(k).toLowerCase()); });
        const labels = Array.from(setKeys).map(k => {
            const cfg = (window.CONFIG_CHAINS || {})[k] || {};
            return (cfg.Nama_Pendek || cfg.Nama_Chain || k).toString().toUpperCase();
        });
        // If multichain mode is running, prepend MULTICHAIN flag
        try { if (cache.multichain) labels.unshift('MULTICHAIN'); } catch (_) { }
        if (labels.length > 0) {
            $('#infoAPP').html(` RUN SCANNING: ${labels.join(' | ')}`).show();
        } else {
            // No running chains → clear banner
            $('#infoAPP').text('').hide();
        }
    } catch (_) { }
}

try { window.updateRunningChainsBanner = window.updateRunningChainsBanner || updateRunningChainsBanner; } catch (_) { }

/**
 * Helper terpusat untuk menyimpan state `run: 'NO'` ke storage,
 * dan memperbarui indikator UI yang relevan.
 */
async function persistRunStateNo() {
    try {
        const key = (typeof getActiveFilterKey === 'function') ? getActiveFilterKey() : 'FILTER_MULTICHAIN';
        const cur = (typeof getFromLocalStorage === 'function') ? (getFromLocalStorage(key, {}) || {}) : {};
        if (typeof saveToLocalStorageAsync === 'function') {
            await saveToLocalStorageAsync(key, Object.assign({}, cur, { run: 'NO' }));
        } else {
            setAppState({ run: 'NO' });
        }
        if (typeof window.updateRunStateCache === 'function') { try { window.updateRunStateCache(key, { run: 'NO' }); } catch (_) { } }
    } catch (_) { try { setAppState({ run: 'NO' }); } catch (__) { } }
    try {
        if (typeof window.updateRunStateCache === 'function') {
            try { window.updateRunStateCache(getActiveFilterKey(), { run: 'NO' }); } catch (_) { }
        }
        try { (window.CURRENT_CHAINS || []).forEach(c => window.updateRunStateCache(`FILTER_${String(c).toUpperCase()}`, { run: 'NO' })); } catch (_) { }
    } catch (_) { }
    try {
        if (typeof window.updateRunningChainsBanner === 'function') window.updateRunningChainsBanner();
        if (typeof window.updateToolbarRunIndicators === 'function') window.updateToolbarRunIndicators();
    } catch (_) { }
}

// =================================================================================
// EXPORT TO APP NAMESPACE
// =================================================================================
// Register scanner functions to window.App.Scanner for use by main.js
if (typeof window !== 'undefined' && window.App && typeof window.App.register === 'function') {
    window.App.register('Scanner', {
        startScanner,
        stopScanner,
        stopScannerSoft,
        // Return per-tab scanning state (not global)
        isScanRunning: () => isThisTabScanning(),
        // Expose helper untuk external access
        isThisTabScanning: isThisTabScanning,
        // Fungsi untuk disable/enable form edit saat scanning
        setEditFormState: setEditFormState
    });
}

// Expose untuk backward compatibility
if (typeof window !== 'undefined') {
    window.isThisTabScanning = isThisTabScanning;
    window.setEditFormState = setEditFormState;
}

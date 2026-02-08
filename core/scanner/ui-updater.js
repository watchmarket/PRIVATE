/**
 * =================================================================================
 * UI UPDATER MODULE
 * =================================================================================
 *
 * This module handles all UI update operations for the scanner:
 * - UI update queue management
 * - Progress bar updates
 * - DEX cell status updates
 * - Processing UI updates using requestAnimationFrame
 *
 * @module core/scanner/ui-updater
 */

(function() {
    'use strict';

// UI Update Queue
// Antrian untuk semua tugas pembaruan UI. Daripada memanipulasi DOM secara langsung
// setiap kali ada hasil, objek hasil (sukses/error) dimasukkan ke array ini.
let uiUpdateQueue = [];

// Animation frame ID for the UI update loop
let animationFrameId;

// Flag to track if scanner is running
let isScanRunning = false;

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

/**
 * Memperbarui status visual sel DEX (misal: "Checking...", "ERROR").
 * @param {string} idCELL - ID dari sel yang akan di-update
 * @param {string} status - 'checking', 'fallback', 'error', 'failed', 'fallback_error'.
 * @param {string} dexName - Nama DEX.
 * @param {object} token - Objek token
 * @param {boolean} isKiri - Arah transaksi
 * @param {number} modalKiri - Modal untuk arah kiri
 * @param {number} modalKanan - Modal untuk arah kanan
 * @param {string} [message=''] - Pesan tambahan untuk tooltip.
 */
function updateDexCellStatus(idCELL, status, dexName, token, isKiri, modalKiri, modalKanan, message = '') {
    const cell = document.getElementById(idCELL);
    if (!cell) return;
    // Do not overwrite if cell already finalized by a prior UPDATE/ERROR
    try {
        if (cell.dataset && cell.dataset.final === '1') {
            // NEVER overwrite a finalized cell, regardless of new status
            return;
        }
    } catch(_) {}

    // Standard single-DEX cell handling
    // Presentation only: spinner for checking, badge for error
    try { cell.classList.remove('dex-error'); } catch(_) {}
    let statusSpan = window.ensureDexStatusSpan(cell);
    statusSpan.removeAttribute('title');
    statusSpan.classList.remove('uk-text-muted', 'uk-text-warning', 'uk-text-danger');
    if (status === 'checking') {
        statusSpan.classList.add('uk-text-warning');
        statusSpan.innerHTML = `<span class=\"uk-margin-small-right\" uk-spinner=\"ratio: 0.5\"></span>${String(dexName||'').toUpperCase()}`;
        try { if (window.UIkit && UIkit.update) UIkit.update(cell); } catch(_) {}
        // Build rich header log like example
        try {
            const chainCfg = (window.CONFIG_CHAINS||{})[String(token.chain).toLowerCase()] || {};
            const chainName = (chainCfg.Nama_Chain || token.chain || '').toString().toUpperCase();
            const nameIn  = String(isKiri ? token.symbol_in  : token.symbol_out).toUpperCase();
            const nameOut = String(isKiri ? token.symbol_out : token.symbol_in ).toUpperCase();
            const ce  = String(token.cex||'').toUpperCase();
            const dx  = String(dexName||dexName||'').toUpperCase();
            const proc = isKiri ? `${ce} → ${dx}` : `${dx} → ${ce}`;
            const modal = Number(isKiri ? modalKiri : modalKanan) || 0;
            const header = [
                `✅ [LOG ${isKiri? 'CEX → DEX':'DEX → CEX'}] ${nameIn} → ${nameOut} on ${chainName}`,
                `    🔄 [${proc}]`,
                '',
                `    🪙 Modal: $${modal.toFixed(2)}`,
               // message ? `    💹 CEX SUMMARY: ${message}` : ''
            ].filter(Boolean).join('\n');
            window.setCellTitleByEl(cell, header);
        } catch(_) {}
    } else if (status === 'fallback') {
        statusSpan.classList.add('uk-text-warning');
        statusSpan.innerHTML = `<span class=\"uk-margin-small-right\" uk-spinner=\"ratio: 0.5\"></span>SWOOP`;
        // REFACTORED: Tidak menampilkan error message dari primary DEX
        // Tooltip tetap menampilkan header info checking saja
        try { if (window.UIkit && UIkit.update) UIkit.update(cell); } catch(_) {}
    } else if (status === 'fallback_error') {
        window.setDexErrorBackground(cell);
        statusSpan.classList.remove('uk-text-warning');
        statusSpan.classList.add('uk-text-danger');
        statusSpan.innerHTML = `<span class=\"uk-label uk-label-warning\">TIMEOUT</span>`;
        // REFACTORED: Tooltip menampilkan error dari fallback saja (bukan primary)
        // Message berisi error dari alternatif DEX
        if (message) {
            statusSpan.title = String(message);
            window.setCellTitleByEl(cell, String(message));
            try { const lab = statusSpan.querySelector('.uk-label'); if (lab) lab.setAttribute('title', String(message)); } catch(_) {}
        } else {
            statusSpan.removeAttribute('title');
        }
        // Finalize regardless of tab visibility
        try { window.clearDexTickerById(idCELL); } catch(_) {}
        try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch(_) {}
    } else if (status === 'failed') {
        // Validation failed before DEX call (e.g., modal/contract/chain code)
        window.setDexErrorBackground(cell);
        statusSpan.classList.remove('uk-text-warning');
        statusSpan.classList.add('uk-text-danger');
        statusSpan.innerHTML = `<span class=\"uk-label uk-label-failed\">FAILED</span>`;
        if (message) {
            statusSpan.title = String(message);
            window.setCellTitleByEl(cell, String(message));
            try { const lab = statusSpan.querySelector('.uk-label'); if (lab) lab.setAttribute('title', String(message)); } catch(_) {}
        } else {
            statusSpan.removeAttribute('title');
        }
        // Finalize regardless of tab visibility
        try { window.clearDexTickerById(idCELL); } catch(_) {}
        try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch(_) {}
    } else if (status === 'error') {
        window.setDexErrorBackground(cell);
        statusSpan.classList.remove('uk-text-warning');
        statusSpan.classList.add('uk-text-danger');
        statusSpan.innerHTML = `<span class=\"uk-label uk-label-danger\">ERROR</span>`;
        if (message) {
            statusSpan.title = String(message);
            window.setCellTitleByEl(cell, String(message));
            // Ensure the visible ERROR/TIMEOUT badge also shows the tooltip itself
            try { const lab = statusSpan.querySelector('.uk-label'); if (lab) lab.setAttribute('title', String(message)); } catch(_) {}
        } else {
            statusSpan.removeAttribute('title');
        }
        // Finalize regardless of tab visibility
        try { window.clearDexTickerById(idCELL); } catch(_) {}
        try { if (cell.dataset) { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } } catch(_) {}
    }
}

/**
 * Loop utama yang memproses antrian pembaruan UI (`uiUpdateQueue`).
 * Dijalankan menggunakan `requestAnimationFrame` untuk performa optimal.
 */
function processUiUpdates() {
    // Jika scan sudah berhenti dan antrian kosong, hentikan loop.
    if (!isScanRunning && uiUpdateQueue.length === 0) return;

    const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // Batas waktu eksekusi per frame (misal, 8ms) untuk menjaga UI tetap responsif.
    const budgetMs = 8; // aim to keep under one frame @120Hz
    let processed = 0;

    // "Penyapuan keamanan": Finalisasi sel DEX yang melewati batas waktu (timeout)
    // tapi belum di-update statusnya. Ini mencegah sel terjebak di status "Checking".
    try {
        const nowTs = Date.now();
        const cells = document.querySelectorAll('td[data-deadline]');
        cells.forEach(cell => {
            // Cek apakah deadline sudah lewat dan sel belum difinalisasi.
            try {
                const d = Number(cell.dataset.deadline || 0);
                const done = String(cell.dataset.final || '') === '1';
                if (!done && d > 0 && nowTs - d > 250) {
                    const dexName = (cell.dataset.dex || '').toUpperCase() || 'DEX';
                    // stop any lingering ticker for this cell
                    try { window.clearDexTickerById(cell.id); } catch(_) {}
                    // Paksa finalisasi ke status TIMEOUT.
                    try { cell.classList.add('dex-error'); } catch(_) {}

                    // Standard cell timeout handling (multi-aggregator now uses the same UI)
                    const span = window.ensureDexStatusSpan(cell);
                    try {
                        span.classList.remove('uk-text-muted', 'uk-text-warning');
                        span.classList.add('uk-text-danger');
                        span.innerHTML = `<span class=\"uk-label uk-label-warning\">TIMEOUT</span>`;
                        span.title = `${dexName}: Request Timeout`;
                    } catch(_) {}

                    try { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } catch(_) {}
                }
            } catch(_) {}
        });
    } catch(_) {}

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
                } catch(_) {}
                // finalize error: stop ticker, mark final, clear checking/deadline
                try { window.clearDexTickerById(id); } catch(_) {}
                try { cell.dataset.final = '1'; delete cell.dataset.checking; delete cell.dataset.deadline; } catch(_) {}
                window.setDexErrorBackground(cell);
                let statusSpan = window.ensureDexStatusSpan(cell);
                if (statusSpan) statusSpan.className = 'dex-status uk-text-danger';
                statusSpan.classList.remove('uk-text-muted', 'uk-text-warning');
                statusSpan.classList.add('uk-text-danger');
                statusSpan.textContent = swapMessage || '[ERROR]';
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

    // Jika halaman tidak terlihat (tab tidak aktif), `requestAnimationFrame` akan dijeda oleh browser.
    // Gunakan `setTimeout` sebagai fallback untuk memastikan UI tetap di-update.
    if (typeof document !== 'undefined' && document.hidden) {
        setTimeout(processUiUpdates, 150);
    } else {
        animationFrameId = requestAnimationFrame(processUiUpdates);
    }
}

/**
 * Initialize UI update listeners
 */
function initializeUiUpdaters() {
    // Pastikan update UI segera dijalankan saat tab kembali aktif (visible).
    try {
        if (typeof window !== 'undefined' && !window.__UI_VIS_LISTENER_SET__) {
            document.addEventListener('visibilitychange', () => {
                try { if (!document.hidden) processUiUpdates(); } catch(_) {}
            });
            window.__UI_VIS_LISTENER_SET__ = true;
        }
    } catch(_) {}

    // Jeda auto-scroll sementara jika pengguna berinteraksi dengan halaman
    // (scroll, klik, dll.) agar tidak mengganggu.
    try {
        if (typeof window !== 'undefined' && !window.__AUTO_SCROLL_SUSPENDER_SET__) {
            const suspend = () => { try { window.__AUTO_SCROLL_SUSPEND_UNTIL = Date.now() + 4000; } catch(_) {} };
            ['wheel','touchstart','mousedown','keydown'].forEach(ev => {
                try { window.addEventListener(ev, suspend, { passive: true }); } catch(_) {}
            });
            window.__AUTO_SCROLL_SUSPENDER_SET__ = true;
        }
    } catch(_) {}
}

/**
 * Set the scanning running state
 * @param {boolean} running - Whether scanning is running
 */
function setUiScanRunning(running) {
    isScanRunning = running;
}

/**
 * Get the UI update queue
 * @returns {Array} The UI update queue
 */
function getUiUpdateQueue() {
    return uiUpdateQueue;
}

/**
 * Get the animation frame ID
 * @returns {number} The animation frame ID
 */
function getAnimationFrameId() {
    return animationFrameId;
}

/**
 * Set the animation frame ID
 * @param {number} id - The animation frame ID
 */
function setAnimationFrameId(id) {
    animationFrameId = id;
}

// =================================================================================
// EXPORT TO GLOBAL SCOPE (for backward compatibility)
// =================================================================================
if (typeof window !== 'undefined') {
    window.updateProgress = updateProgress;
    window.updateDexCellStatus = updateDexCellStatus;
    window.processUiUpdates = processUiUpdates;
    window.initializeUiUpdaters = initializeUiUpdaters;
    window.setUiScanRunning = setUiScanRunning;
    window.getUiUpdateQueue = getUiUpdateQueue;
    window.getAnimationFrameId = getAnimationFrameId;
    window.setAnimationFrameId = setAnimationFrameId;
}

})(); // End IIFE

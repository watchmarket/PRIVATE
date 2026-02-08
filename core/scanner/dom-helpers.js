// =================================================================================
// SCANNER DOM HELPERS
// =================================================================================
/**
 * DOM manipulation utilities for scanner cells
 */

(function() {
    'use strict';

/**
 * Memastikan sebuah sel DEX memiliki elemen <span> untuk menampilkan status.
 * Jika belum ada, fungsi ini akan membuatnya dan menambahkannya ke dalam sel.
 * @param {HTMLElement} cell - Elemen <td> dari sel DEX.
 * @returns {HTMLElement|null} Elemen <span> untuk status, atau null jika sel tidak valid.
 */
function ensureDexStatusSpan(cell) {
    if (!cell) return null;
    let statusSpan = cell.querySelector('.dex-status');
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
    statusSpan = document.createElement('span');
    statusSpan.className = 'dex-status';
    cell.appendChild(statusSpan);
    return statusSpan;
}

/**
 * Mengatur latar belakang sel menjadi merah untuk menandakan error.
 * @param {HTMLElement} cell - Elemen <td> dari sel DEX yang error.
 */
function setDexErrorBackground(cell) {
    if (!cell) return;
    try { cell.classList.add('dex-error'); } catch(_) {}
}

/**
 * Menghapus/membersihkan interval timer countdown
 * @param {string} id - ID dari sel DEX.
 */
function clearDexTickerById(id){
    try {
        window._DEX_TICKERS = window._DEX_TICKERS || new Map();
        const key = String(id) + ':ticker';
        if (window._DEX_TICKERS.has(key)) {
            clearInterval(window._DEX_TICKERS.get(key));
            window._DEX_TICKERS.delete(key);
        }
    } catch(_) {}
}

/**
 * Mengatur teks tooltip untuk sebuah elemen sel.
 * @param {HTMLElement} cell - Elemen sel.
 * @param {string} text - Teks tooltip yang akan diatur.
 */
function setCellTitleByEl(cell, text){
    try {
        cell.dataset.titleLog = String(text || '');
        cell.setAttribute('title', cell.dataset.titleLog);
        const span = cell.querySelector('.dex-status');
        if (span) span.setAttribute('title', cell.dataset.titleLog);
    } catch(_) {}
}

/**
 * Menambahkan baris baru ke teks tooltip yang sudah ada pada sebuah elemen sel.
 * @param {HTMLElement} cell - Elemen sel.
 * @param {string} line - Baris teks baru yang akan ditambahkan.
 */
function appendCellTitleByEl(cell, line){
    try {
        const prev = cell.dataset && cell.dataset.titleLog ? String(cell.dataset.titleLog) : '';
        const next = prev ? (prev + '\n' + String(line||'')) : String(line||'');
        setCellTitleByEl(cell, next);
    } catch(_) {}
}

/**
 * Menambahkan baris baru ke teks tooltip berdasarkan ID sel.
 * @param {string} id - ID elemen sel.
 * @param {string} line - Baris teks baru.
 */
function appendCellTitleById(id, line){
    const cell = document.getElementById(id);
    if (!cell) return;
    appendCellTitleByEl(cell, line);
}

/**
 * Mengatur (replace) teks tooltip berdasarkan ID sel.
 * @param {string} id - ID elemen sel.
 * @param {string} text - Teks tooltip yang akan diatur.
 */
function setCellTitleById(id, text){
    const cell = document.getElementById(id);
    if (!cell) return;
    setCellTitleByEl(cell, text);
}

/**
 * Mengubah judul halaman untuk menandakan pemindaian sedang aktif.
 * @param {boolean} running - True jika pemindaian sedang berjalan.
 */
function setPageTitleForRun(running){
    try {
        const m = (typeof getAppMode === 'function') ? getAppMode() : { type: 'multi' };
        if (String(m.type||'').toLowerCase() !== 'single') return;
        if (running) {
            if (!window.__ORIG_TITLE) window.__ORIG_TITLE = document.title;
            document.title = 'SCANNING..';
        } else {
            if (window.__ORIG_TITLE) { document.title = window.__ORIG_TITLE; }
            window.__ORIG_TITLE = null;
        }
    } catch(_) {}
}

/**
 * Placeholder function untuk kompatibilitas.
 */
function setEditFormState(isScanning) {
    // Intentionally empty - form tetap aktif saat scanning
}

// =================================================================================
// EXPOSE TO GLOBAL SCOPE
// =================================================================================
if (typeof window !== 'undefined') {
    window.ensureDexStatusSpan = ensureDexStatusSpan;
    window.setDexErrorBackground = setDexErrorBackground;
    window.clearDexTickerById = clearDexTickerById;
    window.setCellTitleByEl = setCellTitleByEl;
    window.appendCellTitleByEl = appendCellTitleByEl;
    window.appendCellTitleById = appendCellTitleById;
    window.setPageTitleForRun = setPageTitleForRun;
    window.setEditFormState = setEditFormState;
}

})(); // End IIFE

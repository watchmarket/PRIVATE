// =================================================================================
// FORMATTING AND DISPLAY UTILITIES
// =================================================================================
/**
 * This module provides formatting and display utilities for prices, currencies,
 * URLs, colors, and status indicators.
 *
 * Functions:
 * - formatPrice: Format price with special handling for small decimals
 * - formatIDRfromUSDT: Format IDR currency string from USDT amount
 * - convertIDRtoUSDT: Convert IDR amount to USDT
 * - convertUSDTtoIDR: Convert USDT amount to IDR
 * - hexToRgba: Convert HEX color to RGBA
 * - createHoverLink: Create hyperlink with hover title
 * - safeUrl: Validate URL and return fallback if invalid
 * - linkifyStatus: Create styled link for deposit/withdraw status
 */

(function() {
    'use strict';

    /**
     * Formats a price number into a display string with a '$' sign.
     * Handles small decimal numbers with a special format.
     * @param {number} price - The price to format.
     * @returns {string} The formatted price string.
     */
    function formatPrice(price) {
        if (price >= 1) {
            return price.toFixed(3) + '$'; // Jika >= 1, tampilkan 2 angka desimal
        }

        let strPrice = price.toFixed(20).replace(/0+$/, ''); // Paksa format desimal, hapus nol di akhir
        let match = strPrice.match(/0\.(0*)(\d+)/); // Ambil nol setelah koma dan angka signifikan

        if (match) {
            let zeroCount = match[1].length; // Hitung jumlah nol setelah koma
            let significant = match[2].substring(0, 4); // Ambil 5 digit signifikan pertama

            // Jika angka signifikan kurang dari 5 digit, tambahkan nol di akhir
            significant = significant.padEnd(4, '0');

            if (zeroCount >= 2) {
                return `0.{${zeroCount}}${significant}$`; // Format dengan {N} jika nol >= 2
            } else {
                return `0.${match[1]}${significant}$`; // Format biasa jika nol < 2
            }
        }

        return price.toFixed(6) + '$'; // Fallback jika format tidak dikenali
    }

    /**
     * Converts a HEX color to an RGBA color.
     * @param {string} hex - The hex color string.
     * @param {number} alpha - The alpha transparency value.
     * @returns {string} The RGBA color string.
     */
    // refactor: modernize to const
    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Creates a hyperlink with a hover title.
     * @param {string} url - The URL for the link.
     * @param {string} text - The visible text for the link.
     * @param {string} [className=''] - Optional CSS class.
     * @returns {string} HTML string for the anchor tag.
     */
    function createHoverLink(url, text, className = '') {
        // Force link to inherit color from its parent (so chain accent colors apply)
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="hover-link ${className}" style="color:inherit;" title="${url}">${text}</a>`;
    }

    /**
     * Validates a URL, returning a fallback if invalid.
     * @param {string} u - The URL to validate.
     * @param {string} fallback - The fallback URL.
     * @returns {string} The original URL or the fallback.
     */
    function safeUrl(u, fallback) {
        return (u && typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : fallback;
    }

    /**
     * Creates a styled link for deposit/withdraw status.
     * @param {boolean} flag - The status flag (true for active).
     * @param {string} label - The label text (e.g., 'DP', 'WD').
     * @param {string} urlOk - The URL to use if the status is active.
     * @param {string} [colorOk='green'] - The color for the active status.
     * @returns {string} HTML string for the status.
     */
    function linkifyStatus(flag, label, urlOk, colorOk = 'green') {
        // Selalu pertahankan hyperlink bila URL tersedia; ubah hanya teks + warna
        const safe = (u) => (u && /^https?:\/\//i.test(u)) ? u : '#';
        let text, color, className;
        if (flag === true) {
            text = label; // WD, DP
            className = 'uk-text-success';
        } else if (flag === false) {
            text = (label === 'DP') ? 'DX' : 'WX'; // DX, WX
            className = 'uk-text-danger';
        } else {
            text = `?${label}`; // ?WD, ?DP
            className = 'uk-text-muted';
        }
        return `<a href="${safe(urlOk)}" target="_blank" rel="noopener noreferrer" class="uk-text-bold ${className}">${text}</a>`;
    }

    // refactor: remove getStatusLabel (tidak dipakai); gunakan linkifyStatus untuk status DP/WD.

    function convertIDRtoUSDT(idrAmount) {
        const rateUSDT = getFromLocalStorage("PRICE_RATE_USDT", 0);
        if (!rateUSDT || rateUSDT === 0) return 0;
        return parseFloat((idrAmount / rateUSDT).toFixed(8));
    }

    // Convert USDT amount to IDR number using cached rate
    function convertUSDTtoIDR(usdtAmount) {
        const rateUSDT = parseFloat(getFromLocalStorage("PRICE_RATE_USDT", 0)) || 0;
        const v = parseFloat(usdtAmount) || 0;
        return rateUSDT > 0 ? v * rateUSDT : 0;
    }

    // Format IDR currency string from USDT amount
    function formatIDRfromUSDT(usdtAmount) {
        const idr = convertUSDTtoIDR(usdtAmount);
        return idr > 0 ? idr.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' }) : 'N/A';
    }

    // =================================================================================
    // EXPOSE TO GLOBAL SCOPE (window)
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.formatPrice = formatPrice;
        window.formatIDRfromUSDT = formatIDRfromUSDT;
        window.convertIDRtoUSDT = convertIDRtoUSDT;
        window.convertUSDTtoIDR = convertUSDTtoIDR;
        window.hexToRgba = hexToRgba;
        window.createHoverLink = createHoverLink;
        window.safeUrl = safeUrl;
        window.linkifyStatus = linkifyStatus;
    }

})(); // End IIFE

// ─── Kalkulator Multi Crypto (Modal) ─────────
let _calcRows = [];
let _calcRowId = 0;

function openCalcModal() {
    if (!_calcRows.length) {
        addCalcRow('BTC', '', '');
        addCalcRow('ETH', '', '');
        addCalcRow('', '', '');
    } else {
        _renderCalcRows();
    }
    _updateCalcRateDisplay();
    document.getElementById('calcOverlay').classList.add('open');
}
function closeCalcModal() {
    document.getElementById('calcOverlay').classList.remove('open');
}
function _updateCalcRateDisplay() {
    const el = document.getElementById('calcRateVal');
    if (el) el.textContent = 'Rp ' + usdtRate.toLocaleString('id-ID');
}
function refreshCalcRate() {
    fetchUsdtRate().then(() => {
        _updateCalcRateDisplay();
        _recalcAll();
        convFromUsdt();
        calcCustomConv();
        showToast('✓ Rate IDR: Rp ' + usdtRate.toLocaleString('id-ID'));
    });
}

// ── Multi Rows ──
function addCalcRow(sym, price, qty) {
    _calcRowId++;
    _calcRows.push({ id: _calcRowId, sym: sym || '', price: price !== undefined ? price : '', qty: qty !== undefined ? qty : '' });
    _renderCalcRows();
}
function removeCalcRow(id) {
    _calcRows = _calcRows.filter(r => r.id !== id);
    _renderCalcRows();
}
function clearCalcRows() {
    _calcRows = [];
    _calcRowId = 0;
    _renderCalcRows();
}
function onCalcInput(id, field, val) {
    const r = _calcRows.find(x => x.id === id);
    if (r) r[field] = val;
    _recalcOne(id);
    _updateCalcTotal();
}
function _fmtIdr(idr) {
    if (idr >= 1e9) return 'Rp ' + (idr / 1e9).toFixed(2) + ' M';
    if (idr >= 1e6) return 'Rp ' + (idr / 1e6).toFixed(2) + ' jt';
    if (idr >= 1e3) return 'Rp ' + Math.round(idr / 1e3) + 'K';
    if (idr >= 1)   return 'Rp ' + Math.round(idr).toLocaleString('id-ID');
    if (idr > 0)    return 'Rp ' + idr.toFixed(2);
    return 'Rp 0';
}

function _renderCalcRows() {
    const container = document.getElementById('calcRows');
    if (!container) return;
    container.innerHTML = _calcRows.map(r => {
        const p = parseFloat(r.price) || 0;
        const q = parseFloat(r.qty) || 0;
        const usdt = p * q;
        const idr = usdt * usdtRate;
        const usdtTxt = usdt > 0 ? '$' + usdt.toFixed(usdt < 0.01 ? 6 : 2) : '-';
        const idrTxt = idr > 0 ? _fmtIdr(idr) : '-';
        return `<div class="calc-data-row" id="cdr-${r.id}">
  <div class="cc-sym"><input class="cc-inp cc-sym-inp" value="${r.sym}" placeholder="KOIN" maxlength="10"
    oninput="onCalcInput(${r.id},'sym',this.value)"></div>
  <div class="cc-price"><input class="cc-inp" type="number" value="${r.price}" placeholder="0.00" step="any"
    oninput="onCalcInput(${r.id},'price',this.value)"></div>
  <div class="cc-qty"><input class="cc-inp" type="number" value="${r.qty}" placeholder="0" step="any"
    oninput="onCalcInput(${r.id},'qty',this.value)"></div>
  <div class="cc-usdt cc-result" id="cdr-usdt-${r.id}">${usdtTxt}</div>
  <div class="cc-idr cc-result" id="cdr-idr-${r.id}">${idrTxt}</div>
  <div class="cc-del"><button class="cc-del-btn" onclick="removeCalcRow(${r.id})">✕</button></div>
</div>`;
    }).join('');
    _updateCalcTotal();
}
function _recalcOne(id) {
    const r = _calcRows.find(x => x.id === id);
    if (!r) return;
    const p = parseFloat(r.price) || 0;
    const q = parseFloat(r.qty) || 0;
    const usdt = p * q;
    const idr = usdt * usdtRate;
    const uEl = document.getElementById('cdr-usdt-' + id);
    const iEl = document.getElementById('cdr-idr-' + id);
    if (uEl) uEl.textContent = usdt > 0 ? '$' + usdt.toFixed(usdt < 0.01 ? 6 : 2) : '-';
    if (iEl) iEl.textContent = idr > 0 ? _fmtIdr(idr) : '-';
}
function _recalcAll() {
    _calcRows.forEach(r => _recalcOne(r.id));
    _updateCalcTotal();
}
function _updateCalcTotal() {
    let total = 0;
    _calcRows.forEach(r => { total += (parseFloat(r.price) || 0) * (parseFloat(r.qty) || 0); });
    const idr = total * usdtRate;
    const uEl = document.getElementById('calcTotalUsdt');
    const iEl = document.getElementById('calcTotalIdr');
    if (uEl) uEl.textContent = '$' + total.toFixed(total < 0.01 ? 6 : 2);
    if (iEl) iEl.textContent = _fmtIdr(idr);
}

// ── Konverter USDT↔IDR ──
function convFromUsdt() {
    const usdt = parseFloat(document.getElementById('convUsdt')?.value) || 0;
    const el = document.getElementById('convIdr');
    if (el) el.value = usdt ? (usdt * usdtRate).toFixed(0) : '';
}
function convFromIdr() {
    const idr = parseFloat(document.getElementById('convIdr')?.value) || 0;
    const el = document.getElementById('convUsdt');
    if (el) el.value = (idr && usdtRate) ? (idr / usdtRate).toFixed(6) : '';
}

// ── Custom Konversi ──
function calcCustomConv() {
    const amt = parseFloat(document.getElementById('ccAmt')?.value) || 0;
    const mode = document.getElementById('ccFrom')?.value;
    const customPrice = parseFloat(document.getElementById('ccCustomPrice')?.value) || 0;
    const priceRow = document.getElementById('ccCustomPriceRow');
    const resultEl = document.getElementById('ccResult');
    const tokenRow = document.getElementById('ccResTokenRow');

    if (priceRow) priceRow.style.display = mode === 'custom' ? 'flex' : 'none';

    if (!amt) { if (resultEl) resultEl.style.display = 'none'; return; }

    let usdt = 0, idr = 0;
    if (mode === 'usdt') {
        usdt = amt;
        idr = amt * usdtRate;
    } else if (mode === 'idr') {
        idr = amt;
        usdt = usdtRate > 0 ? amt / usdtRate : 0;
    } else if (mode === 'custom' && customPrice > 0) {
        // amt = jumlah token, konversi ke USDT & IDR
        usdt = amt * customPrice;
        idr = usdt * usdtRate;
        token = amt;
    }

    const uEl = document.getElementById('ccResUsdt');
    const iEl = document.getElementById('ccResIdr');
    if (uEl) uEl.textContent = '$' + usdt.toFixed(usdt < 0.01 ? 6 : 4);
    if (iEl) iEl.textContent = _fmtIdr(idr);
    if (tokenRow) tokenRow.style.display = 'none';
    if (resultEl) resultEl.style.display = 'block';
}

// ─── Bulk Modal Modal & PNL ─────────────────
function openBulkModal() {
    document.getElementById('bulkOverlay').classList.add('open');
}
function closeBulkModal() {
    document.getElementById('bulkOverlay').classList.remove('open');
}
$('#btnBulkApply').on('click', function () {
    const ctd = parseFloat($('#bulkCtD').val());
    const dtc = parseFloat($('#bulkDtC').val());
    const pnl = parseFloat($('#bulkPnl').val());
    const ctdValid = !isNaN(ctd) && ctd > 0;
    const dtcValid = !isNaN(dtc) && dtc > 0;
    const pnlValid = !isNaN(pnl) && pnl >= 0;
    if (!ctdValid && !dtcValid && !pnlValid) {
        showAlert('Isi minimal salah satu: Modal CEX→DEX, Modal DEX→CEX, atau Min PNL (nilai harus > 0).', 'Bulk Modal', 'warn');
        return;
    }
    // Filter tokens same as renderTokenList (respect settings)
    const allTokens = getTokens();
    const inScope = (t) => {
        const cexOk = CFG.activeCex.length === 0 || CFG.activeCex.includes(t.cex);
        const chainOk = CFG.activeChains.length === 0 || CFG.activeChains.includes(t.chain);
        return cexOk && chainOk;
    };
    let filtered = allTokens.filter(t => inScope(t) && !t.favorite);
    if (!filtered.length) {
        showAlert('Tidak ada koin yang cocok dengan filter aktif.', 'Bulk Modal', 'warn');
        return;
    }
    const parts = [];
    if (ctdValid) parts.push(`CEX→DEX: $${ctd}`);
    if (dtcValid) parts.push(`DEX→CEX: $${dtc}`);
    if (pnlValid) parts.push(`Min PNL: $${pnl}`);
    // Hitung favorit hanya dari koin yang lolos filter CEX/chain yang sama
    const favSkipped = allTokens.filter(t => inScope(t) && t.favorite).length;
    const totalScope = filtered.length + favSkipped;
    const favNote = favSkipped > 0 ? `\n(⭐ ${favSkipped} dari ${totalScope} koin favorit dilewati)` : '';
    showConfirm(
        `Update ${filtered.length} koin dengan:\n${parts.join(', ')}?${favNote}`,
        'Bulk Modal',
        '✅ Terapkan',
        () => {
            const ids = new Set(filtered.map(t => t.id));
            allTokens.forEach(t => {
                if (!ids.has(t.id)) return;
                if (ctdValid) t.modalCtD = ctd;
                if (dtcValid) t.modalDtC = dtc;
                if (pnlValid) t.minPnl = pnl;
            });
            saveTokens(allTokens);
            renderTokenList();
            closeBulkModal();
            showToast(`✅ ${filtered.length} Data koin berhasil diupdate!`);
        }
    );
});

// ─── Kalkulator Konversi Crypto (Simple) ──────
function onCalcField(source) {
    const usdt = parseFloat($('#cfUsdt').val()) || 0;
    const idr = parseFloat($('#cfIdr').val()) || 0;
    const customAmt = parseFloat($('#cfCustomAmt').val()) || 0;
    const customPrice = parseFloat($('#cfCustomPrice').val()) || 0;

    let usdtVal = 0;
    switch (source) {
        case 'usdt': usdtVal = usdt; break;
        case 'idr': usdtVal = usdtRate > 0 ? idr / usdtRate : 0; break;
        case 'custom': usdtVal = customAmt * customPrice; break;
    }

    // Fill all fields from USDT value
    if (source !== 'usdt') $('#cfUsdt').val(usdtVal ? usdtVal.toFixed(usdtVal < 1 ? 6 : 2) : '');
    if (source !== 'idr') {
        const idrVal = usdtVal && usdtRate ? usdtVal * usdtRate : 0;
        $('#cfIdr').val(idrVal ? (idrVal < 1 ? idrVal.toFixed(4) : Math.round(idrVal)) : '');
    }
    if (source !== 'custom' && customPrice > 0) {
        $('#cfCustomAmt').val(usdtVal ? (usdtVal / customPrice).toFixed(6) : '');
    }
}

async function calcUpdatePrice() {
    showToast('⏳ Mengambil rate IDR...');
    try {
        await fetchUsdtRate();
        _updateCalcRateDisplay();
        showToast('✅ Rate IDR berhasil diupdate!');
        const active = ['usdt', 'idr'].find(f => parseFloat($('#cf' + f.charAt(0).toUpperCase() + f.slice(1)).val()) > 0);
        if (active) onCalcField(active);
    } catch (e) {
        showToast('🗑️ Gagal mengambil rate: ' + e.message);
    }
}

async function calcCekToken() {
    const sym = ($('#cfCustomSym').val() || '').trim().toLowerCase();
    if (!sym) { showAlert('Isi symbol token terlebih dahulu (contoh: SOL)', 'Cek Token', 'warn'); return; }
    showToast('🔍 Mencari ' + sym.toUpperCase() + '...');
    try {
        const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${sym}&vs_currencies=usd`);
        const data = await resp.json();
        let price = data[sym]?.usd;
        if (!price) {
            // Coba search by symbol
            const search = await fetch(`https://api.coingecko.com/api/v3/search?query=${sym}`);
            const sData = await search.json();
            const coin = sData.coins?.[0];
            if (coin) {
                const resp2 = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd`);
                const data2 = await resp2.json();
                price = data2[coin.id]?.usd;
                if (price) $('#cfCustomSym').val(coin.symbol.toUpperCase());
            }
        }
        if (price) {
            $('#cfCustomPrice').val(price);
            $('#cfCustomLbl').text(sym.toUpperCase());
            showToast(`✅ ${sym.toUpperCase()} = $${price}`);
            onCalcField('custom');
        } else {
            showToast('🗑️ Token tidak ditemukan');
        }
    } catch (e) {
        showToast('🗑️ Error: ' + e.message);
    }
}

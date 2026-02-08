// =================================================================================
// TOKEN MANAGEMENT AND SORTING
// =================================================================================
/**
 * This module handles token data management and sorting for both multi-chain and single-chain modes.
 * Includes token storage, retrieval, sorting preferences, and flattening operations.
 *
 * Functions:
 * - getTokensMulti: Get multi-chain tokens with ID validation
 * - setTokensMulti: Save multi-chain tokens and auto-initialize filters
 * - setTokensMultiAsync: Async variant for explicit success/failure reporting
 * - getTokensChain: Get single-chain tokens with fallback to legacy naming
 * - setTokensChain: Save single-chain tokens and auto-initialize filters
 * - setTokensChainAsync: Async variant for explicit success/failure reporting
 * - sortBySymbolIn: Sort token list by symbol_in (ASC/DESC)
 * - getSortPrefForMulti: Get sort preference for multi-chain mode
 * - getSortPrefForChain: Get sort preference for single-chain mode
 * - getFlattenedSortedMulti: Get flattened and sorted multi-chain tokens
 * - getFlattenedSortedChain: Get flattened and sorted single-chain tokens
 * - flattenDataKoin: Flatten token data creating separate entry for each CEX
 */

(function() {
    'use strict';

    // =================================================================================
    // SORTING HELPERS (symbol_in ASC/DESC) BASED ON IDB DATA
    // =================================================================================
    function sortBySymbolIn(list, pref){
        const dir = (pref === 'Z') ? -1 : 1; // default ASC
        return (Array.isArray(list) ? [...list] : []).sort((a,b)=>{
            const A = String(a.symbol_in||'').toUpperCase();
            const B = String(b.symbol_in||'').toUpperCase();
            if (A < B) return -1 * dir;
            if (A > B) return  1 * dir;
            return 0;
        });
    }

    function getSortPrefForMulti(){ // REFACTORED
        const f = getFromLocalStorage('FILTER_MULTICHAIN', null);
        return (f && (f.sort==='A'||f.sort==='Z')) ? f.sort : 'A';
    }
    function getSortPrefForChain(chain){ // REFACTORED
        const key = `FILTER_${String(chain).toUpperCase()}`;
        const f = getFromLocalStorage(key, null);
        return (f && (f.sort==='A'||f.sort==='Z')) ? f.sort : 'A';
    }

    function getFlattenedSortedMulti(){
        const pref = getSortPrefForMulti();
        const tokens = getTokensMulti();
        const flat = flattenDataKoin(tokens);
        return sortBySymbolIn(flat, pref);
    }

    function getFlattenedSortedChain(chain){
        const pref = getSortPrefForChain(chain);
        const tokens = getTokensChain(chain);
        const flat = flattenDataKoin(tokens);
        return sortBySymbolIn(flat, pref);
    }

    function getTokensMulti(){
        let t = getFromLocalStorage('TOKEN_MULTICHAIN', []);
        if (!Array.isArray(t)) return [];
        // Ensure every token has a stable non-empty id
        let mutated = false;
        const fixed = t.map(item => {
            if (!item || (item.id !== 0 && !item.id)) {
                // generate a reasonably unique id
                const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                mutated = true;
                return { ...item, id: newId };
            }
            return item;
        });
        if (mutated) saveToLocalStorage('TOKEN_MULTICHAIN', fixed);
        return fixed;
    }

    function setTokensMulti(list){
        const prev = getFromLocalStorage('TOKEN_MULTICHAIN', []);
        const arr = Array.isArray(list) ? list : [];
        saveToLocalStorage('TOKEN_MULTICHAIN', arr);
        // REFACTORED
        const hadNoneBefore = !Array.isArray(prev) || prev.length === 0;
        const nowHas = Array.isArray(arr) && arr.length > 0;
        if (nowHas && hadNoneBefore) {
            const chains = Object.keys(window.CONFIG_CHAINS || {}).map(k => String(k).toLowerCase());
            const cex = Object.keys(window.CONFIG_CEX || {}).map(k => String(k).toUpperCase());
            const dex = Object.keys(window.CONFIG_DEXS || {}).map(k => String(k).toLowerCase());
            const existing = getFromLocalStorage('FILTER_MULTICHAIN', null);
            const empty = !existing || ((existing.chains||[]).length===0 && (existing.cex||[]).length===0 && (existing.dex||[]).length===0);
            if (empty) setFilterMulti({ chains, cex, dex });
        }
    }

    // Async variants for explicit success/failure reporting (non-breaking: new helpers)
    async function setTokensMultiAsync(list){
        const arr = Array.isArray(list) ? list : [];
        const { ok } = await (window.saveToLocalStorageAsync ? window.saveToLocalStorageAsync('TOKEN_MULTICHAIN', arr) : Promise.resolve({ ok: true }));
        return ok;
    }

    function getTokensChain(chain){
        const chainKey = String(chain).toLowerCase();
        const primaryKey = `TOKEN_${String(chainKey).toUpperCase()}`;
        let t = getFromLocalStorage(primaryKey, []);
        if (Array.isArray(t) && t.length) {
            // Ensure ids
            let mutated = false;
            const fixed = t.map(item => {
                if (!item || (item.id !== 0 && !item.id)) {
                    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                    mutated = true;
                    return { ...item, id: newId };
                }
                return item;
            });
            if (mutated) saveToLocalStorage(primaryKey, fixed);
            return fixed;
        }
        // Fallback to legacy naming using Nama_Chain (e.g., ETHEREUM) if present in backup
        // REFACTORED: legacy fallback without try/catch
        const legacyName = (window.CONFIG_CHAINS?.[chainKey]?.Nama_Chain || '').toString().toUpperCase();
        if (legacyName) {
            const legacyKey = `TOKEN_${legacyName}`;
            const legacy = getFromLocalStorage(legacyKey, []);
            if (Array.isArray(legacy) && legacy.length) {
                let mutated = false;
                const fixed = legacy.map(item => {
                    if (!item || (item.id !== 0 && !item.id)) {
                        const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                        mutated = true;
                        return { ...item, id: newId };
                    }
                    return item;
                });
                saveToLocalStorage(primaryKey, fixed);
                return fixed;
            }
        }
        return Array.isArray(t) ? t : [];
    }

    function setTokensChain(chain, list){
        const chainKey = String(chain).toLowerCase();
        const key = `TOKEN_${String(chainKey).toUpperCase()}`;
        const prev = getFromLocalStorage(key, []);
        const arr = Array.isArray(list) ? list : [];
        saveToLocalStorage(key, arr);
        // REFACTORED
        const hadNoneBefore2 = !Array.isArray(prev) || prev.length === 0;
        const nowHas2 = Array.isArray(arr) && arr.length > 0;
        if (nowHas2 && hadNoneBefore2) {
            const cfg = (window.CONFIG_CHAINS || {})[chainKey] || {};
            const cex = Object.keys(cfg.WALLET_CEX || window.CONFIG_CEX || {}).map(k => String(k));
            const pairs = Array.from(new Set([...(Object.keys(cfg.PAIRDEXS || {})), 'NON'])).map(x => String(x).toUpperCase());
            const dex = (cfg.DEXS || []).map(x => String(x).toLowerCase());
            const fkey = `FILTER_${String(chainKey).toUpperCase()}`;
            const existing = getFromLocalStorage(fkey, null);
            const empty = !existing || ((existing.cex||[]).length===0 && (existing.pair||[]).length===0 && (existing.dex||[]).length===0);
            if (empty) setFilterChain(chain, { cex, pair: pairs, dex });
        }
    }

    async function setTokensChainAsync(chain, list){
        const key = `TOKEN_${String(chain).toLowerCase().toUpperCase()}`; // keep current primary
        const arr = Array.isArray(list) ? list : [];
        const { ok } = await (window.saveToLocalStorageAsync ? window.saveToLocalStorageAsync(key, arr) : Promise.resolve({ ok: true }));
        return ok;
    }

    /**
     * Flattens the token data from TOKEN_SCANNER, creating a separate entry for each selected CEX.
     * @param {Array} dataTokens - The array of token objects from storage.
     * @returns {Array} A flattened array of token objects, ready for scanning.
     */
    function flattenDataKoin(dataTokens) {
        if (!Array.isArray(dataTokens)) {
            try { dataTokens = JSON.parse(dataTokens || '[]'); } catch { dataTokens = []; }
        }
        let flatResult = [];
        let counter = 1;

        // Note: Do not apply any FILTER_* logic here.
        // This function only flattens tokens → one row per selected CEX.
        // Filtering by chain/cex/pair is handled by callers (per mode).
        dataTokens.forEach(item => {
            if (!item || item.status === false) return;
            (item.selectedCexs || []).forEach(cex => {
                const cexUpper = String(cex).toUpperCase();
                const cexInfo = item.dataCexs?.[cexUpper] || {};
                // Normalize DEX keys to lowercase for consistency
                const dexArray = (item.selectedDexs || []).map(dex => {
                    const dexLower = String(dex).toLowerCase();
                    return {
                        dex: dexLower,
                        left: item.dataDexs?.[dex]?.left || item.dataDexs?.[dexLower]?.left || 0,
                        right: item.dataDexs?.[dex]?.right || item.dataDexs?.[dexLower]?.right || 0
                    };
                });

                flatResult.push({
                    no: counter++,
                    id: item.id,
                    cex: cexUpper,
                    feeWDToken: parseFloat(cexInfo.feeWDToken) || 0,
                    feeWDPair:  parseFloat(cexInfo.feeWDPair)  || 0,
                    depositToken: !!cexInfo.depositToken,
                    withdrawToken: !!cexInfo.withdrawToken,
                    depositPair: !!cexInfo.depositPair,
                    withdrawPair: !!cexInfo.withdrawPair,
                    chain: item.chain,
                    symbol_in: item.symbol_in,
                    sc_in: item.sc_in,
                    des_in: item.des_in,
                    symbol_out: item.symbol_out,
                    sc_out: item.sc_out,
                    des_out: item.des_out,
                    status: item.status,
                    dexs: dexArray
                });
            });
        });

        return flatResult;
    }

    // =================================================================================
    // EXPOSE TO GLOBAL SCOPE (window)
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.getTokensMulti = getTokensMulti;
        window.setTokensMulti = setTokensMulti;
        window.setTokensMultiAsync = setTokensMultiAsync;
        window.getTokensChain = getTokensChain;
        window.setTokensChain = setTokensChain;
        window.setTokensChainAsync = setTokensChainAsync;
        window.sortBySymbolIn = sortBySymbolIn;
        window.getSortPrefForMulti = getSortPrefForMulti;
        window.getSortPrefForChain = getSortPrefForChain;
        window.getFlattenedSortedMulti = getFlattenedSortedMulti;
        window.getFlattenedSortedChain = getFlattenedSortedChain;
        window.flattenDataKoin = flattenDataKoin;
    }

})(); // End IIFE

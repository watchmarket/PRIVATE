// =================================================================================
// CHAIN AND EXCHANGER UTILITIES
// =================================================================================
/**
 * This module provides utilities for working with blockchain chains, CEX/DEX configurations,
 * chain data retrieval, URL generation, and wallet chain resolution.
 *
 * Functions:
 * - getChainData: Retrieve configuration data for a specific chain
 * - GeturlExchanger: Generate various URLs for a given CEX and token pair
 * - _normalizeChainLabel: Normalize chain label for comparison
 * - resolveWalletChainBySynonym: Resolve wallet chain info by synonym matching
 * - getWarnaCEX: Get color for a specific CEX
 * - generateDexLink: Generate direct trade link for a DEX
 * - generateDexCellId: Generate consistent DEX cell ID for skeleton and scanner
 * - getFeeSwap: Calculate estimated swap fee in USD for a chain
 * - getStableSymbols: Get list of stable coin symbols
 * - getBaseTokenSymbol: Get base token symbol for a chain
 * - getBaseTokenUSD: Get base token USD price for a chain
 * - getRPC: Get RPC URL with custom override support
 * - resolveActiveDexList: Resolve active DEX list based on mode and filters
 * - isDarkMode: Check if dark mode is active
 */

(function() {
    'use strict';

    /**
     * Retrieves configuration data for a specific chain.
     * @param {string} chainName - The name of the chain (e.g., 'polygon').
     * @returns {object|null} The chain configuration object or null if not found.
     */
    function getChainData(chainName) {
        if (!chainName) return null;

        const chainLower = chainName.toLowerCase();
        const chainData = CONFIG_CHAINS[chainLower];

    // Inline managed chains resolution (previously via getManagedChains)
    const settings = getFromLocalStorage('SETTING_SCANNER', {});
    const managedChains = (settings.AllChains || Object.keys(CONFIG_CHAINS)).map(x => String(x).toLowerCase());
    if (!managedChains.includes(chainLower)) {
        return null;
    }

    if (!chainData) {
        return null;
    }

    return {
        Kode_Chain: chainData.Kode_Chain || '',
        Nama_Chain: chainData.Nama_Chain || '',
        DEXS: chainData.DEXS || {},
        PAIRDExS: chainData.PAIRDExS || {},
        URL_Chain: chainData.URL_Chain || '',
        DATAJSON: chainData.DATAJSON || {},
        BaseFEEDEX: chainData.BaseFEEDEX || '',
        CEXCHAIN: chainData.WALLET_CEX || {},
        ICON_CHAIN: chainData.ICON || '',
        COLOR_CHAIN: chainData.WARNA || '#000',
        SHORT_NAME: chainData.Nama_Pendek || '',
        // RPC: Use RPCManager (auto fallback to default suggestions)
        RPC: (function() {
            try {
                if (typeof window !== 'undefined' && window.RPCManager && typeof window.RPCManager.getRPC === 'function') {
                    return window.RPCManager.getRPC(chainLower) || '';
                }
                return '';
            } catch(e) {
                return '';
            }
        })()
    };
}

/**
 * Generates various URLs for a given CEX and token pair.
 * @param {string} cex - The CEX name (e.g., 'GATE', 'BINANCE').
 * @param {string} NameToken - The base token symbol.
 * @param {string} NamePair - The quote token symbol.
 * @returns {object} An object containing different URL types (trade, withdraw, deposit).
 */
function GeturlExchanger(cex, NameToken, NamePair) { // REFACTORED
    if (window.CEX?.link && typeof CEX.link.buildAll === 'function') {
        return CEX.link.buildAll(cex, NameToken, NamePair);
    }
    const cfg = (window.CONFIG_CEX || {})[String(cex||'').toUpperCase()] || {};
    const L = cfg.LINKS || {};
    const T = String(NameToken||'').toUpperCase();
    const P = String(NamePair||'').toUpperCase();
    const build = (fn, args) => (typeof fn === 'function' ? fn(args) : null);
    const tradeToken = build(L.tradeToken, { cex, token: T, pair: P }) || '#';
    const tradePair  = build(L.tradePair,  { cex, token: T, pair: P }) || '#';
    const withdraw   = build(L.withdraw,   { cex, token: T, pair: P }) || '#';
    const deposit    = build(L.deposit,    { cex, token: T, pair: P }) || '#';
    return {
        tradeToken, tradePair,
        withdrawUrl: withdraw, depositUrl: deposit,
        withdrawTokenUrl: withdraw, depositTokenUrl: deposit,
        withdrawPairUrl: withdraw, depositPairUrl: deposit
    };
}

function _normalizeChainLabel(s){
    return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}

function resolveWalletChainBySynonym(walletInfo, chainKey, desiredLabel){
    if (!walletInfo || typeof walletInfo !== 'object') return null;
    const keys = Object.keys(walletInfo);
    if (!keys.length) return null;
    const normDesired = _normalizeChainLabel(desiredLabel||'');
    // direct exact (normalized) match first
    if (normDesired) {
        const hit = keys.find(k => _normalizeChainLabel(k) === normDesired);
        if (hit) return walletInfo[hit];
    }
    // synonym match by chainKey catalogue
    let cat = [];
    try {
        cat = ((typeof window !== 'undefined' && window.CHAIN_SYNONYMS) ? window.CHAIN_SYNONYMS : (typeof CHAIN_SYNONYMS !== 'undefined' ? CHAIN_SYNONYMS : {}))[ String(chainKey||'').toLowerCase() ] || [];
    } catch(_) { cat = []; }
    const candidates = new Set(cat.map(_normalizeChainLabel));
    candidates.add(_normalizeChainLabel(chainKey));
    // try any key that matches synonyms
    for (const k of keys) {
        const nk = _normalizeChainLabel(k);
        if (candidates.has(nk)) return walletInfo[k];
    }
    // loose contains match (e.g., BASEMAINNET contains BASE)
    for (const k of keys) {
        const nk = _normalizeChainLabel(k);
        for (const s of candidates) { if (nk.includes(s)) return walletInfo[k]; }
    }
    return null;
}

// refactor: remove unused getCexDataConfig (tidak dipakai di alur aplikasi)

// refactor: remove unused getDexData (tidak dipakai di alur aplikasi)

function getWarnaCEX(cex) {
    if (!cex || typeof cex !== 'string') {
        return 'black';
    }
    try {
        const upperCex = cex.toUpperCase();
        if (CONFIG_CEX && CONFIG_CEX[upperCex] && CONFIG_CEX[upperCex].WARNA) {
            return CONFIG_CEX[upperCex].WARNA;
        }
        return 'black'; // Warna default
    } catch (error) {
        // console.error('Error dalam getWarnaCEX:', error);
        return 'black';
    }
}

/**
 * Generates a direct trade link for a given DEX.
 * @param {string} dex - The DEX name.
 * @param {string} chainName - The chain name.
 * @param {number} codeChain - The chain ID.
 * @param {string} NameToken - The input token symbol.
 * @param {string} sc_input - The input token contract address.
 * @param {string} NamePair - The output token symbol.
 * @param {string} sc_output - The output token contract address.
 * @returns {string|null} The DEX trade URL or null if not supported.
 */
function generateDexLink(dex, chainName, codeChain, NameToken, sc_input, NamePair, sc_output) {
    if (!dex) return null;

    const lowerDex = dex.toLowerCase();

    // Find the correct DEX configuration key by checking if the input 'dex' string includes it.
    // This handles cases like "kyber" and "kyber via LIFI".
    let dexKey = Object.keys(CONFIG_DEXS).find(key => lowerDex.includes(key));
    // Backward compatibility: map legacy/alias names to new keys
    if (!dexKey) {
        // Normalize known brand/alias names to canonical CONFIG_DEXS keys
        // e.g. 'kyberswap' -> 'kyber'
        const synonyms = { kyberswap: 'kyber' };
        const found = Object.keys(synonyms).find(oldKey => lowerDex.includes(oldKey));
        if (found && CONFIG_DEXS[synonyms[found]]) dexKey = synonyms[found];
    }

    if (dexKey && CONFIG_DEXS[dexKey] && typeof CONFIG_DEXS[dexKey].builder === 'function') {
        const builder = CONFIG_DEXS[dexKey].builder;
        return builder({
            chainName: chainName.toLowerCase(),
            // Provide both to satisfy different builder signatures
            codeChain: codeChain,    // some builders expect codeChain
            chainCode: codeChain,    // others used chainCode
            tokenAddress: sc_input,
            pairAddress: sc_output,
            NameToken: NameToken,
            NamePair: NamePair
        });
    }

    return null; // Return null if no matching DEX config is found
}

/**
 * Generate consistent DEX cell ID for both skeleton and scanner
 * @param {Object} params - Parameters for ID generation
 * @param {string} params.cex - CEX name (e.g., 'BINANCE')
 * @param {string} params.dex - DEX name (e.g., 'paraswap')
 * @param {string} params.symbolIn - Input symbol (e.g., 'SAND')
 * @param {string} params.symbolOut - Output symbol (e.g., 'EDU')
 * @param {string} params.chain - Chain name (e.g., 'BSC')
 * @param {boolean} params.isLeft - True for LEFT side (TokentoPair), False for RIGHT (PairtoToken)
 * @param {string} params.tableBodyId - Table body ID prefix (e.g., 'dataTableBody')
 * @returns {string} Full cell ID
 */
function generateDexCellId({ cex, dex, symbolIn, symbolOut, chain, isLeft, tableBodyId = 'dataTableBody', tokenId = '' }) {
  const cexUpper = String(cex || '').toUpperCase();
  const dexUpper = String(dex || '').toLowerCase().toUpperCase(); // normalize
  const sym1 = isLeft ? String(symbolIn || '').toUpperCase() : String(symbolOut || '').toUpperCase();
  const sym2 = isLeft ? String(symbolOut || '').toUpperCase() : String(symbolIn || '').toUpperCase();
  const chainUpper = String(chain || '').toUpperCase();
  const tokenIdUpper = String(tokenId || '').toUpperCase();

  const baseIdRaw = tokenIdUpper
    ? `${cexUpper}_${dexUpper}_${sym1}_${sym2}_${chainUpper}_${tokenIdUpper}`
    : `${cexUpper}_${dexUpper}_${sym1}_${sym2}_${chainUpper}`;
  const baseId = baseIdRaw.replace(/[^A-Z0-9_]/g, '');
  return `${tableBodyId}_${baseId}`;
}

/**
 * Calculates the estimated swap fee in USD for a given chain.
 * @param {string} chainName - The name of the chain.
 * @returns {number} The estimated swap fee in USD.
 */
function getFeeSwap(chainName) {
    const allGasData = getFromLocalStorage("ALL_GAS_FEES");
    if (!allGasData) return 0;

    // cari data gas untuk chain yang sesuai
    const gasInfo = allGasData.find(g => g.chain.toLowerCase() === chainName.toLowerCase());
    if (!gasInfo) {
        // console.error(`❌ Gas data not found for chain: ${chainName}`);
        return 0;
    }

    // ambil GASLIMIT dari CONFIG_CHAINS
    const chainConfig = CONFIG_CHAINS[chainName.toLowerCase()];
    if (!chainConfig) {
        // console.error(`❌ Chain config not found for: ${chainName}`);
        return 0;
    }

    const gasLimit = parseFloat(chainConfig.GASLIMIT || 250000); // default kalau tidak ada
    const feeSwap = ((parseFloat(gasInfo.gwei) * gasLimit) / Math.pow(10, 9)) * parseFloat(gasInfo.tokenPrice);

    return feeSwap;
}

// =================================================================================
// PRICE HELPERS (USD conversion for DEX display)
// =================================================================================
function getStableSymbols(){
    return ['USDT','USDC','DAI','FDUSD','TUSD','BUSD','USDE'];
}

function getBaseTokenSymbol(chainName){
    try {
        const cfg = (window.CONFIG_CHAINS||{})[String(chainName).toLowerCase()] || {};
        const sym = String((cfg.BaseFEEDEX||'').replace('USDT','')||'');
        return sym.toUpperCase();
    } catch(_) { return ''; }
}

function getBaseTokenUSD(chainName){
    try {
        const list = getFromLocalStorage('ALL_GAS_FEES', []) || [];
        const key = (window.CONFIG_CHAINS?.[String(chainName).toLowerCase()]?.Nama_Chain) || chainName;
        const hit = (list||[]).find(e => String(e.chain||'').toLowerCase() === String(key).toLowerCase());
        const price = parseFloat(hit?.tokenPrice);
        return isFinite(price) && price > 0 ? price : 0;
    } catch(_) { return 0; }
}

// =============================================================
// RPC HELPER - Get RPC with custom override support
// =============================================================

/**
 * Get RPC URL untuk chain tertentu dengan support custom RPC dari SETTING_SCANNER
 * @param {string} chainKey - Chain key (bsc, polygon, ethereum, dll)
 * @returns {string} RPC URL
 */
function getRPC(chainKey) {
    try {
        const chainLower = String(chainKey || '').toLowerCase();

        // 1. Check custom RPC dari SETTING_SCANNER
        const settings = (typeof getFromLocalStorage === 'function')
            ? getFromLocalStorage('SETTING_SCANNER', {})
            : {};

        if (settings.customRPCs && settings.customRPCs[chainLower]) {
            return settings.customRPCs[chainLower];
        }

        // 2. Fallback ke CONFIG_CHAINS
        const chainConfig = (typeof CONFIG_CHAINS !== 'undefined' && CONFIG_CHAINS[chainLower])
            ? CONFIG_CHAINS[chainLower]
            : null;

        if (chainConfig && chainConfig.RPC) {
            return chainConfig.RPC;
        }

        // 3. Fallback terakhir: empty string
        return '';
    } catch(err) {
        // console.error('[getRPC] Error:', err);
        return '';
    }
}

    // =================================================================================
    // EXPOSE TO GLOBAL SCOPE (window)
    // =================================================================================
    if (typeof window !== 'undefined') {
        window.getChainData = getChainData;
        window.GeturlExchanger = GeturlExchanger;
        window._normalizeChainLabel = _normalizeChainLabel;
        window.resolveWalletChainBySynonym = resolveWalletChainBySynonym;
        window.getWarnaCEX = getWarnaCEX;
        window.generateDexLink = generateDexLink;
        window.generateDexCellId = generateDexCellId;
        window.getFeeSwap = getFeeSwap;
        window.getStableSymbols = getStableSymbols;
        window.getBaseTokenSymbol = getBaseTokenSymbol;
        window.getBaseTokenUSD = getBaseTokenUSD;
        window.getRPC = getRPC;

        // refactor: provide a small shared helper for dark mode checks
        window.isDarkMode = window.isDarkMode || function isDarkMode(){
            try { return !!(document && document.body && document.body.classList && document.body.classList.contains('dark-mode')); }
            catch(_) { return false; }
        };

        // Resolve active DEX list based on mode + saved filters; fallback to config defaults
        window.resolveActiveDexList = window.resolveActiveDexList || function resolveActiveDexList(){
            try {
                const m = getAppMode();
                if (m.type === 'single') {
                    const chain = String(m.chain).toLowerCase();
                    const saved = getFilterChain(chain) || { dex: [] };
                    const base = ((window.CONFIG_CHAINS || {})[chain] || {}).DEXS || [];
                    const list = (Array.isArray(saved.dex) && saved.dex.length) ? saved.dex : base;
                    return (list || []).map(x => String(x).toLowerCase());
                } else {
                    const saved = getFilterMulti() || { dex: [] };
                    const base = Object.keys(window.CONFIG_DEXS || {});
                    const list = (Array.isArray(saved.dex) && saved.dex.length) ? saved.dex : base;
                    return (list || []).map(x => String(x).toLowerCase());
                }
            } catch(_) { return Object.keys(window.CONFIG_DEXS || {}).map(x => String(x).toLowerCase()); }
        };
    }

})(); // End IIFE

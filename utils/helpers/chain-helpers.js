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

(function () {
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
            GASLIMIT: chainData.GASLIMIT || 200000,  // ← expose GASLIMIT dari config.js
            // RPC: Use RPCManager (auto fallback to default suggestions)
            RPC: (function () {
                try {
                    if (typeof window !== 'undefined' && window.RPCManager && typeof window.RPCManager.getRPC === 'function') {
                        return window.RPCManager.getRPC(chainLower) || '';
                    }
                    return '';
                } catch (e) {
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
        const cfg = (window.CONFIG_CEX || {})[String(cex || '').toUpperCase()] || {};
        const L = cfg.LINKS || {};
        const T = String(NameToken || '').toUpperCase();
        const P = String(NamePair || '').toUpperCase();
        const build = (fn, args) => (typeof fn === 'function' ? fn(args) : null);
        const tradeToken = build(L.tradeToken, { cex, token: T, pair: P }) || '#';
        const tradePair = build(L.tradePair, { cex, token: T, pair: P }) || '#';
        const withdraw = build(L.withdraw, { cex, token: T, pair: P }) || '#';
        const deposit = build(L.deposit, { cex, token: T, pair: P }) || '#';
        return {
            tradeToken, tradePair,
            withdrawUrl: withdraw, depositUrl: deposit,
            withdrawTokenUrl: withdraw, depositTokenUrl: deposit,
            withdrawPairUrl: withdraw, depositPairUrl: deposit
        };
    }

    function _normalizeChainLabel(s) {
        return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function resolveWalletChainBySynonym(walletInfo, chainKey, desiredLabel) {
        if (!walletInfo || typeof walletInfo !== 'object') return null;
        const keys = Object.keys(walletInfo);
        if (!keys.length) return null;
        const normDesired = _normalizeChainLabel(desiredLabel || '');
        // direct exact (normalized) match first
        if (normDesired) {
            const hit = keys.find(k => _normalizeChainLabel(k) === normDesired);
            if (hit) return walletInfo[hit];
        }
        // synonym match by chainKey catalogue
        let cat = [];
        try {
            cat = ((typeof window !== 'undefined' && window.CHAIN_SYNONYMS) ? window.CHAIN_SYNONYMS : (typeof CHAIN_SYNONYMS !== 'undefined' ? CHAIN_SYNONYMS : {}))[String(chainKey || '').toLowerCase()] || [];
        } catch (_) { cat = []; }
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
        // Hardcoded minimum fallback fee (USD) per chain jika data gas tidak tersedia
        // Nilai berdasarkan kondisi gas on-chain nyata (April 2026):
        // Formula: baseFee(gwei) × gasLimit / 1e9 × nativeTokenPrice
        // ETH: 5 gwei × 130,000 / 1e9 × $1800 = ~$1.17 → rounded ke $0.80 (low gas kondisi)
        // BSC: 1 gwei × 150,000 / 1e9 × $600  = ~$0.09 → $0.10
        // Polygon: 30 gwei × 150,000 / 1e9 × $0.40 = ~$0.002 → $0.003
        // Arbitrum: 0.02 gwei × 600,000 / 1e9 × $1800 = ~$0.022 → $0.03
        // Base: 0.002 gwei × 150,000 / 1e9 × $1800 = ~$0.0005 → $0.001
        const FALLBACK_FEES = {
            ethereum:  0.80,   // ~5 gwei, 130k gas, ETH $1800 → ~$1.17 (low end $0.80)
            bsc:       0.10,   // ~1 gwei, 150k gas, BNB $600  → ~$0.09
            polygon:   0.003,  // ~30 gwei, 150k gas, POL $0.40 → ~$0.002
            arbitrum:  0.03,   // ~0.02 gwei, 600k gas, ETH $1800 → ~$0.022
            optimism:  0.01,   // ~0.001 gwei, 150k gas, ETH $1800 → ~$0.0003 (L2 sangat murah)
            base:      0.001,  // ~0.002 gwei, 150k gas, ETH $1800 → ~$0.0005
            avalanche: 0.05,   // ~25 nAVAX, 150k gas, AVAX $25 → ~$0.09
            solana:    0.0003, // ~0.000005 SOL per tx, SOL $130 → ~$0.0006
            fantom:    0.005,  // ~100 gwei, 150k gas, FTM $0.30 → ~$0.005
            zksync:    0.05,   // L2 zkEVM, mirip Arbitrum
            linea:     0.05,   // L2, mirip Base
            scroll:    0.05,   // L2 zkEVM
            mantle:    0.001,  // sangat murah
            opbnb:     0.002,  // L2 BSC
            celo:      0.003,  // sangat murah
        };


        const chainLower = String(chainName || '').toLowerCase();

        try {
            const allGasData = getFromLocalStorage("ALL_GAS_FEES");
            if (allGasData && Array.isArray(allGasData)) {
                // Cari data gas: cocokkan via chain (Nama_Chain), chainKey (key config), atau Nama_Chain di config
                const gasInfo = allGasData.find(g => {
                    const gChain = String(g.chain || '').toLowerCase();
                    const gChainKey = String(g.chainKey || '').toLowerCase();
                    // 1. Cocokkan langsung field 'chain' (Nama_Chain lowercase)
                    if (gChain === chainLower) return true;
                    // 2. Cocokkan via field 'chainKey' (key dari CONFIG_CHAINS)
                    if (gChainKey === chainLower) return true;
                    // 3. Reverse: ambil Nama_Chain dari CONFIG_CHAINS lalu bandingkan
                    const cfgEntry = CONFIG_CHAINS[chainLower];
                    if (cfgEntry && String(cfgEntry.Nama_Chain || '').toLowerCase() === gChain) return true;
                    return false;
                });

                if (gasInfo && gasInfo.gwei && gasInfo.tokenPrice) {
                    // Ambil GASLIMIT dari CONFIG_CHAINS
                    const chainConfig = CONFIG_CHAINS[chainLower];
                    const gasLimit = parseFloat((chainConfig && chainConfig.GASLIMIT) || 250000);
                    const feeSwap = ((parseFloat(gasInfo.gwei) * gasLimit) / Math.pow(10, 9)) * parseFloat(gasInfo.tokenPrice);
                    if (Number.isFinite(feeSwap) && feeSwap > 0) return feeSwap;
                }
            }
        } catch (e) {
            // silent fallback
        }

        // Gunakan hardcoded fallback jika semua path gagal
        return FALLBACK_FEES[chainLower] || 0.05;
    }

    /**
     * Menghitung biaya transfer token ERC-20 onchain (DEX → CEX wallet).
     * Berbeda dari swap fee — transfer biasa lebih murah (65000 gas vs 150k-300k gas).
     *
     * Sumber gas data: localStorage 'ALL_GAS_FEES' (diisi oleh feeGasGwei() via RPC/Blocknative).
     * Gas limit: CONFIG_APP.APP.TRANSFER_GAS_LIMIT (default 65000).
     *
     * Formula: gasLimit × gwei / 1e9 × nativeTokenPrice
     *
     * @param {string} chainKey - Chain key (bsc, polygon, ethereum, arbitrum, base, dll)
     * @returns {number} Biaya transfer dalam USD
     */
    function getTransferFeeUSD(chainKey) {
        const chainLower = String(chainKey || '').toLowerCase();

        // Solana: biaya flat sangat kecil (~$0.001), bukan model gas EVM
        if (chainLower === 'solana') return 0.001;

        // Ambil gas limit khusus transfer dari CONFIG_APP
        const transferGasLimit = (
            (typeof window !== 'undefined' && window.CONFIG_APP?.APP?.TRANSFER_GAS_LIMIT) ||
            (typeof CONFIG_APP !== 'undefined' && CONFIG_APP?.APP?.TRANSFER_GAS_LIMIT) ||
            65000
        );

        try {
            const allGasData = getFromLocalStorage('ALL_GAS_FEES');
            if (allGasData && Array.isArray(allGasData)) {
                const gasInfo = allGasData.find(g => {
                    const gChain    = String(g.chain    || '').toLowerCase();
                    const gChainKey = String(g.chainKey || '').toLowerCase();
                    if (gChain    === chainLower) return true;
                    if (gChainKey === chainLower) return true;
                    const cfgEntry = (window.CONFIG_CHAINS || CONFIG_CHAINS)[chainLower];
                    if (cfgEntry && String(cfgEntry.Nama_Chain || '').toLowerCase() === gChain) return true;
                    return false;
                });

                if (gasInfo && gasInfo.gwei && gasInfo.tokenPrice) {
                    const fee = (parseFloat(gasInfo.gwei) * transferGasLimit / 1e9) * parseFloat(gasInfo.tokenPrice);
                    if (Number.isFinite(fee) && fee > 0) {
                        return fee;
                    }
                }
            }
        } catch (_) { }

        // Fallback hardcoded jika ALL_GAS_FEES kosong atau chain tidak ditemukan
        // Berdasarkan kondisi gas nyata dikalikan dengan transfer gas 65000
        const FALLBACK_TRANSFER = {
            ethereum:  0.20,   // ~5 gwei × 65k / 1e9 × $1800 = ~$0.58 (low gas)
            bsc:       0.04,   // ~1 gwei × 65k / 1e9 × $600  = ~$0.04
            polygon:   0.001,  // ~30 gwei × 65k / 1e9 × $0.40 = ~$0.001
            arbitrum:  0.01,   // ~0.02 gwei × 65k / 1e9 × $1800 = ~$0.002
            base:      0.001,  // ~0.002 gwei × 65k / 1e9 × $1800 = ~$0.0002
        };
        return FALLBACK_TRANSFER[chainLower] || 0.01;
    }

    // =================================================================================
    // PRICE HELPERS (USD conversion for DEX display)
    // =================================================================================
    function getStableSymbols() {
        return ['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'BUSD', 'USDE'];
    }

    function getBaseTokenSymbol(chainName) {
        try {
            const cfg = (window.CONFIG_CHAINS || {})[String(chainName).toLowerCase()] || {};
            const sym = String((cfg.BaseFEEDEX || '').replace('USDT', '') || '');
            return sym.toUpperCase();
        } catch (_) { return ''; }
    }

    function getBaseTokenUSD(chainName) {
        try {
            const list = getFromLocalStorage('ALL_GAS_FEES', []) || [];
            const key = (window.CONFIG_CHAINS?.[String(chainName).toLowerCase()]?.Nama_Chain) || chainName;
            const hit = (list || []).find(e => String(e.chain || '').toLowerCase() === String(key).toLowerCase());
            const price = parseFloat(hit?.tokenPrice);
            return isFinite(price) && price > 0 ? price : 0;
        } catch (_) { return 0; }
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
        } catch (err) {
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
        window.getTransferFeeUSD = getTransferFeeUSD;
        window.getStableSymbols = getStableSymbols;
        window.getBaseTokenSymbol = getBaseTokenSymbol;
        window.getBaseTokenUSD = getBaseTokenUSD;
        window.getRPC = getRPC;

        // refactor: provide a small shared helper for dark mode checks
        window.isDarkMode = window.isDarkMode || function isDarkMode() {
            try { return !!(document && document.body && document.body.classList && document.body.classList.contains('dark-mode')); }
            catch (_) { return false; }
        };

        // Resolve active DEX list based on mode + saved filters; fallback to config defaults
        // ✅ FIXED: Exclude isBackendProvider; include isMetaDex only when META_DEX=true
        window.resolveActiveDexList = function resolveActiveDexList() {
            try {
                const metaDexEnabled = window.CONFIG_APP?.APP?.META_DEX === true;

                // Safe filter for backend providers from any list
                const filterBackend = (arr) => (arr || [])
                    .map(x => String(x).toLowerCase())
                    .filter(x => !((window.CONFIG_DEXS || {})[x]?.isBackendProvider));

                // Filter solanaOnly DEXes for a given chain
                const filterSolanaOnly = (arr, chain) => (arr || []).filter(x => {
                    const cfg = (window.CONFIG_DEXS || {})[x];
                    if (cfg?.solanaOnly && chain !== 'solana') return false;
                    return true;
                });

                // ✅ baseFull: DEX biasa saja — MetaDEX TIDAK masuk default
                // MetaDEX hanya muncul jika user CENTANG di filter scanner (tersimpan di saved.dex)
                const baseFull = Object.keys(window.CONFIG_DEXS || {}).filter(key => {
                    const cfg = (window.CONFIG_DEXS || {})[key];
                    if (!cfg || cfg.disabled) return false;
                    if (cfg.isBackendProvider) return false;
                    if (cfg.isMetaDex) return false; // ✅ Exclude MetaDEX dari default — harus pilih di filter
                    return true;
                });

                // ✅ FIX: Definisikan metaDexKeys — kunci MetaDEX yang aktif dan dicentang user
                // Ini adalah DEX yang memiliki isMetaDex=true, tidak disabled, tidak isBackendProvider
                const metaDexAllKeys = Object.keys(window.CONFIG_DEXS || {}).filter(key => {
                    const cfg = (window.CONFIG_DEXS || {})[key];
                    return cfg && cfg.isMetaDex && !cfg.disabled && !cfg.isBackendProvider;
                }).map(x => String(x).toLowerCase());

                // ✅ FIX: mergeWithMeta — gabungkan list DEX biasa + MetaDEX yang ada di saved filter
                // Hanya MetaDEX yang ADA di saved.dex (user centang) yang masuk
                const mergeWithMeta = (list, savedDex) => {
                    const arr = (Array.isArray(list) ? list : Object.keys(list || {})).map(x => String(x).toLowerCase());
                    // Ambil MetaDEX yang user centang (ada di saved.dex)
                    const savedSet = new Set((Array.isArray(savedDex) ? savedDex : []).map(x => String(x).toLowerCase()));
                    const metaSelected = metaDexAllKeys.filter(k => savedSet.has(k));
                    return [...new Set([...arr, ...metaSelected])];
                };

                const m = getAppMode();
                if (m.type === 'single') {
                    const chain = String(m.chain).toLowerCase();
                    const saved = getFilterChain(chain) || { dex: [] };
                    const base = ((window.CONFIG_CHAINS || {})[chain] || {}).DEXS || baseFull;
                    // Jika ada filter tersimpan (termasuk MetaDEX yg dicentang user), pakai itu
                    // Jika tidak, pakai base dari chain (tanpa MetaDEX)
                    const list = (Array.isArray(saved.dex) && saved.dex.length) ? saved.dex : base;
                    // ✅ Merge MetaDEX yang dicentang user ke dalam list
                    const merged = mergeWithMeta(list, saved.dex);
                    return filterSolanaOnly(filterBackend(merged), chain);
                } else if (window.CEXModeManager && window.CEXModeManager.isCEXMode()) {
                    const saved = (typeof getFilterCEX === 'function')
                        ? getFilterCEX(window.CEXModeManager.getSelectedCEX())
                        : { dex: [] };
                    const list = (Array.isArray(saved.dex) && saved.dex.length) ? saved.dex : baseFull;
                    // ✅ Merge MetaDEX yang dicentang user ke dalam list
                    const merged = mergeWithMeta(list, saved.dex);
                    return filterBackend(merged);
                } else {
                    const saved = getFilterMulti() || { dex: [] };
                    const list = (Array.isArray(saved.dex) && saved.dex.length) ? saved.dex : baseFull;
                    // ✅ Merge MetaDEX yang dicentang user ke dalam list
                    const merged = mergeWithMeta(list, saved.dex);
                    return filterBackend(merged);
                }
            } catch (_) {
                return Object.keys(window.CONFIG_DEXS || {})
                    .filter(k => {
                        const cfg = (window.CONFIG_DEXS || {})[k];
                        return cfg && !cfg.isBackendProvider && !cfg.isMetaDex;
                    })
                    .map(x => String(x).toLowerCase());
            }
        };
    }

})(); // End IIFE

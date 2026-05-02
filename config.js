const CONFIG_APP = {
    APP: {
       // NAME: "OPIT_HUNTER",
        NAME: "PRIVATE_NOCORS",
        VERSION: "05.01",
        SCAN_LIMIT: false,
        AUTORUN: true,
        AUTO_VOLUME: true,  // cek level order otomatis kalkulasi PNL
        VOL_CHECK: true,
        DEBUG_LOG: false,
        // Gas units untuk ERC-20 transfer onchain (DEX → CEX wallet)
        // Lebih kecil dari swap gas (~150k-300k) karena hanya transfer biasa
        TRANSFER_GAS_LIMIT: 65000,
        // META-DEX: fitur DEX TAMBAHAN yang menampilkan BANYAK quote sekaligus per token.
        // Berbeda dari DEX regular (single-quote). Berjalan TERPISAH dari scan DEX regular.
        // Jika true → Settings menampilkan panel: Modal DEX, Filter Scanner, Card Signal, Jeda DEX.
        META_DEX: true,
        LIMIT_METADEX: 0,
        // Batas jumlah DEX regular yang bisa dipilih di Filter Scanner.
        // 0 = tidak dibatasi.
        LIMIT_DEX: 0,
    },
    // ========================================================================
    // META-DEX CONFIGURATION
    // ========================================================================
    // Meta-DEX adalah fitur DEX TAMBAHAN yang menampilkan BANYAK quote sekaligus
    // (berbeda dengan DEX regular seperti ODOS, Velora yang hanya 1 quote per scan).
    //
    // ⚠️  BUKAN secondary/alternative di fetchdex!
    //     secondary/alternative = rotasi backend internal untuk DEX regular.
    //     META-DEX              = DEX tambahan terpisah, muncul sebagai row/kolom sendiri.
    //
    // Hanya aktif jika APP.META_DEX === true.
    // ========================================================================
    META_DEX_CONFIG: {
        // Daftar aggregator META-DEX yang tersedia.
        // Setiap aggregator mengembalikan BANYAK quote dari berbagai DEX sekaligus.
        aggregators: {
            jumper: { enabled: true, evmOnly: false, jedaDex: 600, label: 'JUMPX', badge: 'JM', warna: '#f764bcff' },       // EVM + Solana multi-route
            metax: { enabled: true, evmOnly: false, jedaDex: 800, label: 'METAX', badge: 'MT', warna: '#ec7506ff' },       // EVM + Solana (chainId 1151111081099710)
            //onekey: { enabled: true, evmOnly: false, jedaDex: 800, label: 'ONEX', badge: '1K', warna: '#00b812ff' },       // EVM + Solana (networkId sol--101)
            ctrlfi: { enabled: true, evmOnly: false, jedaDex: 900, label: 'CTRLX', badge: 'CT', warna: '#808080ff' },      // EVM + Solana — XDEFI/CTRL GraphQL multi-route
            // okutrade: { enabled: true, evmOnly: true, jedaDex: 800, label: 'OKUX', badge: 'OT', warna: '#1a6fd4ff' }, // EVM only — Oku Trade multi-aggregator (3-step REST)
            // dzap: { enabled: false, evmOnly: true, jedaDex: 800, label: 'DZAP', badge: 'DZ', warna: '#d9dc36ff' },
            //  rubic: { enabled: false, evmOnly: false, jedaDex: 1000, label: 'RUBIC', badge: 'RB', warna: '#24cc59ff' },
            //  rango: { enabled: false, evmOnly: false, jedaDex: 1000, label: 'RANGO', badge: 'RG', warna: '#17aedcff' },
            //  zerion: { enabled: false, evmOnly: true, jedaDex: 800, label: 'ZERION', badge: 'ZR', warna: '#0052ffff' },
            //  debridge: { enabled: false, evmOnly: true, jedaDex: 800, label: 'DEBRIDGE', badge: 'DB', warna: '#d7ca0eff' },
        },

        // Chain yang didukung semua META-DEX aggregators (EVM + Solana)
        supportedChains: ['bsc', 'ethereum', 'polygon', 'arbitrum', 'base', 'solana'],

        // ── Settings UI yang muncul di panel Settings ketika META_DEX = true ─────
        settings: {
            // Modal DEX: konfigurasi tampilan aggregator di modal pemilihan DEX
            modalDex: {
                showInModal: true,         // tampilkan META-DEX dalam modal DEX selection
                groupLabel: 'META-DEX',    // nama group di modal
            },
            // Filter Scanner: filter khusus untuk hasil scan META-DEX
            filterScanner: {
                minQuotes: 1,              // minimum jumlah sub-quote yang harus dikembalikan
                showBestOnly: false,       // false = tampilkan semua quote; true = hanya terbaik
                // ✅ Blacklist: provider yang TIDAK boleh muncul di hasil scan MetaDEX.
                // Nama harus UPPERCASE. Berlaku untuk semua MetaDEX (LIFI, DZAP, RANGO, METAX, ONEKEY, dll).
                offDexResultScan: [],
            },
            // Card Signal DEX: tampilan card/signal untuk hasil META-DEX
            cardSignal: {
                showSubResults: true,      // tampilkan sub-quote di dalam card META-DEX
                highlightBest: true,       // highlight sub-quote terbaik
                badgeStyle: 'multi',       // 'multi' = badge menampilkan jumlah quote
            },
            // Jeda DEX: delay default antar request META-DEX (dapat di-override per aggregator)
            jedaDex: {
                default: 1000,            // delay default (ms) jika tidak diset per aggregator
            },
        },
    },
    // ✅ DEX API Keys moved to secrets.js for centralized management
};

try { if (typeof window !== 'undefined') { window.CONFIG_APP = window.CONFIG_APP || CONFIG_APP; } } catch (_) { }

const CONFIG_DB = {
    NAME: CONFIG_APP.APP.NAME,
    STORES: {
        KV: "APP_KV_STORE",
        SNAPSHOT: "SNAPSHOT_STORE",
        LOCALSTORAGE: "LOCALSTORAGE_STORE"
    },
    BROADCAST_CHANNEL: `${CONFIG_APP.APP.NAME}_CHANNEL`
};

try { if (typeof window !== 'undefined') { window.CONFIG_DB = window.CONFIG_DB || CONFIG_DB; } } catch (_) { }

const CONFIG_CEX = {
    GATE: {
        LABEL: 'Gateio', SHORT: 'GATE', BADGE_CLASS: 'bg-gateio',
        ICON: "assets/icons/cex/gate.png",
        WARNA: "#D5006D",  // Pink tua
        TRADE_FEE: 0.001,  // 0.1% taker fee
        LINKS: {
            tradeToken: ({ token }) => `https://www.gate.com/trade/${String(token || '').toUpperCase()}_USDT`,
            tradePair: ({ pair }) => `https://www.gate.com/trade/${String(pair || '').toUpperCase()}_USDT`,
            withdraw: ({ token }) => `https://www.gate.com/myaccount/withdraw/${String(token || '').toUpperCase()}`,
            deposit: ({ pair }) => `https://www.gate.com/myaccount/deposit/${String(pair || '').toUpperCase()}`
        },
        ORDERBOOK: {
            urlTpl: ({ symbol }) => `${CONFIG_PROXY.PREFIX}https://api.gateio.ws/api/v4/spot/order_book?limit=5&currency_pair=${String(symbol || '')}_USDT`,
            parser: 'standard' // use standard orderbook parser
        }
    },
    BINANCE: {
        LABEL: 'Binance', SHORT: 'BINC', BADGE_CLASS: 'bg-binance',
        ICON: "assets/icons/cex/binance.png",
        WARNA: "#e0a50c",  // Orange tua
        TRADE_FEE: 0.001,  // 0.1% taker fee
        LINKS: {
            tradeToken: ({ token }) => `https://www.binance.com/en/trade/${String(token || '').toUpperCase()}_USDT`,
            tradePair: ({ pair }) => `https://www.binance.com/en/trade/${String(pair || '').toUpperCase()}_USDT`,
            withdraw: ({ token }) => `https://www.binance.com/en/my/wallet/account/main/withdrawal/crypto/${String(token || '').toUpperCase()}`,
            deposit: ({ pair }) => `https://www.binance.com/en/my/wallet/account/main/deposit/crypto/${String(pair || '').toUpperCase()}`
        },
        ORDERBOOK: {
            urlTpl: ({ symbol }) => `https://data-api.binance.vision/api/v3/depth?limit=5&symbol=${String(symbol || '')}USDT`,
            parser: 'standard'
        }
    },
    MEXC: {
        LABEL: 'MEXC', SHORT: 'MEXC', BADGE_CLASS: 'bg-mexc',
        ICON: "assets/icons/cex/mexc.png",
        WARNA: "#1448ce",  // Biru muda
        TRADE_FEE: 0.0005,  // 0.05% taker fee
        LINKS: {
            tradeToken: ({ token }) => `https://www.mexc.com/exchange/${String(token || '').toUpperCase()}_USDT?_from=search`,
            tradePair: ({ pair }) => `https://www.mexc.com/exchange/${String(pair || '').toUpperCase()}_USDT?_from=search`,
            withdraw: ({ token }) => `https://www.mexc.com/assets/withdraw/${String(token || '').toUpperCase()}`,
            deposit: ({ pair }) => `https://www.mexc.com/assets/deposit/${String(pair || '').toUpperCase()}`
        },
        ORDERBOOK: {
            urlTpl: ({ symbol }) => `${CONFIG_PROXY.PREFIX}https://api.mexc.com/api/v3/depth?symbol=${String(symbol || '')}USDT&limit=5`,
            parser: 'standard'
        }
    },
    INDODAX: {
        LABEL: 'INDODAX', SHORT: 'INDX', BADGE_CLASS: 'bg-indodax',
        ICON: "assets/icons/cex/indodax.png",
        WARNA: "#2eb5f2",
        TRADE_FEE: 0.003,  // 0.3% taker fee
        // Pair Indodax adalah IDR, sehingga flow selalu 2 langkah:
        // CEX→DEX: KOIN→IDR (jual) + IDR→USDT (konversi) → 2x fee
        // DEX→CEX: USDT→IDR (konversi) + IDR→KOIN (beli) → 2x fee
        PAIR_IS_IDR: true,  // Flag: pair selalu IDR, bukan USDT
        LINKS: {
            tradeToken: ({ token }) => `https://indodax.com/trade/${String(token || '').toUpperCase()}IDR`,
            tradePair: ({ pair }) => `https://indodax.com/trade/${String(pair || '').toUpperCase()}IDR`,
            withdraw: ({ token }) => `https://indodax.com/finance/${String(token || '').toUpperCase()}#kirim`,
            deposit: ({ token }) => `https://indodax.com/finance/${String(token || '').toUpperCase()}`
        },
        ORDERBOOK: {
            urlTpl: ({ symbol }) => `https://indodax.com/api/depth/${String(symbol || '').toLowerCase()}idr`,
            parser: 'indodax'
        }
    },
    HTX: {
        LABEL: 'HTX', SHORT: 'HTX', BADGE_CLASS: 'bg-htx',
        ICON: "assets/icons/cex/htx.png",
        WARNA: "#008cd6",  // HTX Blue color
        TRADE_FEE: 0.002,  // 0.2% taker fee
        LINKS: {
            tradeToken: ({ token }) => `https://www.htx.com/trade/${String(token || '').toLowerCase()}_usdt`,
            tradePair: ({ pair }) => `https://www.htx.com/trade/${String(pair || '').toLowerCase()}_usdt`,
            withdraw: ({ token }) => `https://www.htx.com/en-us/finance/withdraw/${String(token || '').toLowerCase()}`,
            deposit: ({ token }) => `https://www.htx.com/en-us/finance/deposit/${String(token || '').toLowerCase()}`
        },
        ORDERBOOK: {
            // HTX (Huobi) Spot API - orderbook/depth endpoint
            // Ref: https://huobiapi.github.io/docs/spot/v1/en/
            urlTpl: ({ symbol }) => `https://api.huobi.pro/market/depth?symbol=${String(symbol || '').toLowerCase()}usdt&type=step0&depth=5`,
            parser: 'htx'  // HTX response format: { tick: { asks: [[p,q], ...], bids: [[p,q], ...] } }
        }
    },
    BYBIT: {
        LABEL: 'Bybit', SHORT: 'BYBT', BADGE_CLASS: 'bg-bybit',
        ICON: "assets/icons/cex/bybit.png",
        WARNA: "#f29900",
        TRADE_FEE: 0.001,  // 0.1% taker fee
        LINKS: {
            tradeToken: ({ token }) => `https://www.bybit.com/trade/spot/${String(token || '').toUpperCase()}/USDT`,
            tradePair: ({ pair }) => `https://www.bybit.com/trade/spot/${String(pair || '').toUpperCase()}/USDT`,
            withdraw: ({ token }) => `https://www.bybit.com/user/assets/withdraw?coin=${String(token || '').toUpperCase()}`,
            deposit: ({ token }) => `https://www.bybit.com/user/assets/deposit?coin=${String(token || '').toUpperCase()}`
        },
        ORDERBOOK: {
            // Bybit returns { result: { a:[[price, size]], b:[[price, size]] } }
            urlTpl: ({ symbol }) => `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${String(symbol || '').toUpperCase()}USDT&limit=5`,
            parser: 'bybit'
        }
    },

    KUCOIN: {
        LABEL: 'KuCoin', SHORT: 'KUCN', BADGE_CLASS: 'bg-kucoin',
        ICON: "assets/icons/cex/kucoin.png",
        WARNA: "#29b3af",
        TRADE_FEE: 0.001,  // 0.1% taker fee
        LINKS: {
            tradeToken: ({ token }) => `https://www.kucoin.com/trade/${String(token || '').toUpperCase()}-USDT`,
            tradePair: ({ pair }) => `https://www.kucoin.com/trade/${String(pair || '').toUpperCase()}-USDT`,
            withdraw: ({ token }) => `https://www.kucoin.com/assets/withdraw/${String(token || '').toUpperCase()}?isDefault=true`,
            deposit: ({ token }) => `https://www.kucoin.com/assets/coin/${String(token || '').toUpperCase()}`
        },
        ORDERBOOK: {
            // KuCoin returns { data: { bids:[[price, size]], asks:[[price, size]] } }
            urlTpl: ({ symbol }) => `https://api.kucoin.com/api/v1/market/orderbook/level2_20?symbol=${String(symbol || '').toUpperCase()}-USDT`,
            parser: 'kucoin'
        }
    },
    BITGET: {
        LABEL: 'Bitget', SHORT: 'BITG', BADGE_CLASS: 'bg-bitget',
        ICON: "assets/icons/cex/bitget.png",
        WARNA: "#1aaaba",
        TRADE_FEE: 0.001,  // 0.1% taker fee
        LINKS: {
            tradeToken: ({ token }) => `https://www.bitget.com/spot/${String(token || '').toUpperCase()}USDT`,
            tradePair: ({ pair }) => `https://www.bitget.com/spot/${String(pair || '').toUpperCase()}USDT`,
            withdraw: ({ token }) => `https://www.bitget.com/asset/withdraw?coin=${String(token || '').toUpperCase()}`,
            deposit: ({ token }) => `https://www.bitget.com/asset/deposit?coin=${String(token || '').toUpperCase()}`
        },
        ORDERBOOK: {
            // Bitget returns { data: { bids:[[price, size]], asks:[[price, size]] } }
            urlTpl: ({ symbol }) => `https://api.bitget.com/api/v2/spot/market/orderbook?symbol=${String(symbol || '').toUpperCase()}USDT&limit=5`,
            parser: 'bitget'
        }
    },
    OKX: {
        LABEL: 'OKX', SHORT: 'OKX', BADGE_CLASS: 'bg-okx',
        ICON: "assets/icons/cex/okx.png",
        WARNA: "#000000",
        TRADE_FEE: 0.001,  // 0.1% taker fee
        LINKS: {
            tradeToken: ({ token }) => `https://www.okx.com/trade-spot/${String(token || '').toLowerCase()}-usdt`,
            tradePair: ({ pair }) => `https://www.okx.com/trade-spot/${String(pair || '').toLowerCase()}-usdt`,
            withdraw: ({ token }) => `https://www.okx.com/balance/withdrawal/${String(token || '').toLowerCase()}`,
            deposit: ({ token }) => `https://www.okx.com/balance/recharge/${String(token || '').toLowerCase()}`
        },
        ORDERBOOK: {
            urlTpl: ({ symbol }) => `https://www.okx.com/api/v5/market/books?instId=${String(symbol || '').toUpperCase()}-USDT&sz=5`,
            parser: 'okx'
        }
    }
};

/**
 * Mengambil trade fee fraction (bukan persen) untuk CEX tertentu.
 * @param {string} cexKey - Nama CEX, case-insensitive (misal: 'BINANCE', 'mexc')
 * @returns {number} Fee fraction, misal 0.001 untuk 0.1%
 */
function getCexTradeFee(cexKey) {
    try {
        const key = String(cexKey || '').toUpperCase();
        const cfg = (window.CONFIG_CEX || CONFIG_CEX)[key];
        const fee = cfg && Number.isFinite(cfg.TRADE_FEE) ? cfg.TRADE_FEE : 0.001;
        return fee;
    } catch (_) { return 0.001; }
}

/**
 * Menghitung multiplier fee trade berdasarkan CEX dan apakah pair adalah stablecoin.
 * Aturan:
 * - INDODAX: selalu 2x (IDR → USDT → KOIN atau sebaliknya = 2 transaksi)
 * - CEX lain dengan USDT pair: 1x
 * - CEX lain dengan non-USDT pair (BNT, BNB, dsb): 2x
 * @param {string} cexKey - Nama CEX, case-insensitive
 * @param {boolean} pairIsStable - True jika pair adalah USDT/USDC/DAI
 * @returns {number} 1 atau 2
 */
function getCexFeeMultiplier(cexKey, pairIsStable) {
    try {
        const key = String(cexKey || '').toUpperCase();
        const cfg = (window.CONFIG_CEX || CONFIG_CEX)[key];
        // INDODAX: IDR pair → selalu 2 langkah transaksi → selalu 2x
        if (cfg && cfg.PAIR_IS_IDR) return 2;
        // CEX lain: 1x jika pair = stablecoin, 2x jika pair = non-stablecoin
        return pairIsStable ? 1 : 2;
    } catch (_) { return pairIsStable ? 1 : 2; }
}

try {
    if (typeof window !== 'undefined') {
        window.getCexTradeFee = window.getCexTradeFee || getCexTradeFee;
        window.getCexFeeMultiplier = window.getCexFeeMultiplier || getCexFeeMultiplier;
    }
} catch (_) { }

// CEX_SECRETS now empty - keys loaded from IndexedDB at runtime via getCEXCredentials()
// Legacy merge kept for backward compatibility (will be no-op since CEX_SECRETS is empty)
if (typeof CEX_SECRETS !== 'undefined') {
    for (const cex in CONFIG_CEX) {
        if (CEX_SECRETS[cex]) {
            CONFIG_CEX[cex].ApiKey = CEX_SECRETS[cex].ApiKey;
            CONFIG_CEX[cex].ApiSecret = CEX_SECRETS[cex].ApiSecret;
        }
    }
}


// =================================================================================
// RPC CONFIGURATION - MOVED TO DATABASE
// =================================================================================
// NOTE: DEFAULT_RPC_SUGGESTIONS has been REMOVED and moved to rpc-database-migrator.js
// All RPC endpoints are now stored centrally in database (SETTING_SCANNER.userRPCs)
//
// To get RPC for a chain, use:
//   - RPCManager.getRPC(chainKey)           // From rpc-manager.js
//   - RPCDatabaseMigrator.getRPCFromDatabase(chainKey)  // From rpc-database-migrator.js
//
// Initial RPC values are set automatically on first app load by rpc-database-migrator.js
// Users can update RPC via Settings UI, and values are persisted in IndexedDB
// =================================================================================

// Legacy support: Expose empty object to prevent errors in old code
const DEFAULT_RPC_SUGGESTIONS = {};

const CONFIG_CHAINS = {
    bsc: {
        Kode_Chain: 56, Nama_Chain: "BSC", Nama_Pendek: "BSC", URL_Chain: "https://bscscan.com", WARNA: "#f0af18", ICON: "assets/icons/chains/bsc.png", DATAJSON: 'https://pencari-selisih.github.io/JSON-TOKEN/SNAPSHOT_koin_BSC.json', BaseFEEDEX: "BNBUSDT", GASLIMIT: 300000, // real swap BEP-20 ~150k gas units
        DEFAULT_RPC: 'https://rpc.llama-rpc.com/bsc?source=llamaswap', // DefiLlama — fallback jika user belum set RPC
        FALLBACK_RPCS: ['https://bsc-mainnet.wallet.brave.com'],
        BADGE_CLASS: 'bg-warning text-dark',
        SYNONYMS: ['BSC', 'BEP20', 'BINANCE SMART CHAIN', 'BNB SMART CHAIN', 'BEP-20', 'BSCMAINNET', 'BNB', 'BSCBEP20', 'BNB CHAIN', 'BNBCHAIN'],
        LINKS: {
            explorer: {
                token: (address) => `https://bscscan.com/token/${address}`,
                address: (address) => `https://bscscan.com/address/${address}`,
                tx: (hash) => `https://bscscan.com/tx/${hash}`
            }
        },
        DEXS: ["kyber", "okx", "matcha", "oneinch", "sushi", "velora", "flytrade", "odos", "openocean", "cowswap", "lifidex", "nordstern"],  // ✅ lifidex = standalone LIFI (via Temple API)
        WALLET_CEX: {
            GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chainCEX: 'BSC' },
            BINANCE: { address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3', address2: '0xe2fc31F816A9b94326492132018C3aEcC4a93aE1', chainCEX: 'BSC' },
            MEXC: { address: '0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB', chainCEX: 'BSC' },
            INDODAX: { address: '0xaBa3002AB1597433bA79aBc48eeAd54DC10A45F2', address2: '0x91Dca37856240E5e1906222ec79278b16420Dc92', chainCEX: 'BSC' },
            KUCOIN: { address: '0x58edF78281334335EfFa23101bBe3371b6a36A51', address2: '0xD6216fC19DB775Df9774a6E33526131dA7D19a2c', chainCEX: 'BEP20' },
            BITGET: { address: '0x0639556F03714A74a5fEEaF5736a4A64fF70D206', address2: '0xBDf5bAfEE1291EEc45Ae3aadAc89BE8152D4E673', address3: '0x1AB4973a48dc892Cd9971ECE8e01DcC7688f8F23', chainCEX: 'BEP20' },
            BYBIT: { address: '0xf89d7b9c864f589bbf53a82105107622b35eaa40', chainCEX: 'BSC' },
            HTX: { address: '0xafdfd157d9361e621e476036FEE62f688450692B', address2: '0xdd3CB5c974601BC3974d908Ea4A86020f9999E0c', chainCEX: 'BSC' },
            OKX: { address: '0xA0420C29B214d09b9ec751aa1f592c7b1fa77dA3', chainCEX: 'BNB Chain' },
        },
        PAIRDEXS: {
            "USDT": { symbolPair: "USDT", scAddressPair: "0x55d398326f99059fF775485246999027B3197955", desPair: "18" },

            "BNB": { symbolPair: "BNB", scAddressPair: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", desPair: "18" },
            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        }
    },
    polygon: {
        Kode_Chain: 137, Nama_Chain: "Polygon", Nama_Pendek: "POLY", URL_Chain: "https://polygonscan.com", ICON: "assets/icons/chains/polygon.png", WARNA: "#cd72f4ff", DATAJSON: 'https://pencari-selisih.github.io/JSON-TOKEN/SNAPSHOT_koin_POLYGON.json', BaseFEEDEX: "MATICUSDT", GASLIMIT: 250000, // real swap MATIC/Polygon ~150k gas units
        DEFAULT_RPC: 'https://rpc.llama-rpc.com/polygon?source=llamaswap', // DefiLlama
        FALLBACK_RPCS: ['https://polygon-mainnet.wallet.brave.com'],
        BADGE_CLASS: 'bg-success text-light',
        SYNONYMS: ['POLYGON', 'MATIC', 'POLYGON POS', 'POLYGON \\(MATIC\\)', 'POL', 'POLYGONPOS', 'POLYGON_POS', 'POLYGONEVM', 'Polygon PoS', 'polygon'],
        DEXS: ["kyber", "okx", "matcha", "oneinch", "sushi", "velora", "flytrade", "odos", "openocean", "cowswap", "lifidex", "nordstern"],   // ✅ lifidex = standalone LIFI (via Temple API)
        LINKS: {
            explorer: {
                token: (address) => `https://polygonscan.com/token/${address}`,
                address: (address) => `https://polygonscan.com/address/${address}`,
                tx: (hash) => `https://polygonscan.com/tx/${hash}`
            }
        },
        WALLET_CEX: {
            GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chainCEX: 'MATIC' },
            BINANCE: { address: '0x290275e3db66394C52272398959845170E4DCb88', address2: '0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245', chainCEX: 'MATIC' },
            MEXC: { address: '0x51E3D44172868Acc60D68ca99591Ce4230bc75E0', chainCEX: 'MATIC' },
            KUCOIN: { address: '0x9AC5637d295FEA4f51E086C329d791cC157B1C84', address2: '0xD6216fC19DB775Df9774a6E33526131dA7D19a2c', chainCEX: 'Polygon POS' },
            BITGET: { address: '0x0639556F03714A74a5fEEaF5736a4A64fF70D206', address2: '0x51971c86b04516062c1e708CDC048CB04fbe959f', address3: '0xBDf5bAfEE1291EEc45Ae3aadAc89BE8152D4E673', chainCEX: 'Polygon' },
            BYBIT: { address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', chainCEX: 'Polygon PoS' },
            INDODAX: { address: '0x3C02290922a3618A4646E3BbCa65853eA45FE7C6', address2: '0x91Dca37856240E5e1906222ec79278b16420Dc92', chainCEX: 'POLYGON' },
            HTX: { address: '0x9a7ffd7f6c42ab805e0edf16c25101964c6326b6', chainCEX: 'MATIC' },
            OKX: { address: '0x343d752bB710c5575E417edB3F9FA06241A4749A', chainCEX: 'Polygon' },
        },
        PAIRDEXS: {
            "USDT": { symbolPair: 'USDT', scAddressPair: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', desPair: '6' },
            "USDC": { symbolPair: 'USDC', scAddressPair: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', desPair: '6' },
            "POL": { symbolPair: 'POL', scAddressPair: '0x0000000000000000000000000000000000001010', desPair: '18' },
            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        }
    },
    arbitrum: {
        Kode_Chain: 42161, Nama_Chain: "Arbitrum", Nama_Pendek: "ARB", URL_Chain: "https://arbiscan.io", WARNA: "#a6b0c3", ICON: "assets/icons/chains/arbitrum.png", DATAJSON: 'https://pencari-selisih.github.io/JSON-TOKEN/SNAPSHOT_koin_ARBITRUM.json', BaseFEEDEX: "ETHUSDT", GASLIMIT: 250000, // L2 gas units jauh lebih besar (~500k-1M) tapi gwei sangat kecil (0.01-0.05)
        DEFAULT_RPC: 'https://rpc.llama-rpc.com/arbitrum?source=llamaswap', // DefiLlama
        FALLBACK_RPCS: ['https://arbitrum.drpc.org'], // Brave Arbitrum RPC tidak tersedia (404)
        BADGE_CLASS: 'bg-info text-dark',
        SYNONYMS: ['ARBITRUM', 'ARB', 'ARBITRUM ONE', 'ARBEVM', 'ARBITRUMONE', 'ARB-ETH', 'ARBMAINNET', 'ARBONE', 'ARBITRUMEVM', 'ARBI'],
        LINKS: {
            explorer: {
                token: (address) => `https://arbiscan.io/token/${address}`,
                address: (address) => `https://arbiscan.io/address/${address}`,
                tx: (hash) => `https://arbiscan.io/tx/${hash}`
            }
        },
        DEXS: ["kyber", "okx", "matcha", "oneinch", "sushi", "velora", "flytrade", "odos", "openocean", "cowswap", "lifidex", "nordstern"],
        WALLET_CEX: {
            GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chainCEX: 'ARBITRUM' },
            BINANCE: { address: '0x290275e3db66394C52272398959845170E4DCb88', address2: '0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245', chainCEX: 'ARBITRUM' },
            MEXC: { address: '0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB', chainCEX: 'ARB' },
            KUCOIN: { address: '0x03E6FA590CAdcf15A38e86158E9b3D06FF3399Ba', chainCEX: 'ARBITRUM' },
            BITGET: { address: '0x5bdf85216ec1e38d6458c870992a69e38e03f7ef', chainCEX: 'ArbitrumOne' },
            BYBIT: { address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', chainCEX: 'Arbitrum One' },
            HTX: { address: '0x82D015d74670d8645b56c3f453398a3E799Ee582', chainCEX: 'ARBITRUM' },
            OKX: { address: '0xAfEE421482FAEa92292ED3ffE29371742542AD72', chainCEX: 'Arbitrum One' },
        },
        PAIRDEXS: {
            "USDT": { symbolPair: 'USDT', scAddressPair: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', desPair: '6' },

            "ETH": { symbolPair: 'ETH', scAddressPair: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', desPair: '18' },
            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        },
    },
    ethereum: {
        Kode_Chain: 1, Nama_Chain: "Ethereum", Nama_Pendek: "ETH", URL_Chain: "https://etherscan.io", WARNA: "#8098ee", ICON: "assets/icons/chains/ethereum.png", DATAJSON: 'https://pencari-selisih.github.io/JSON-TOKEN/SNAPSHOT_koin_ETHEREUM.json', BaseFEEDEX: "ETHUSDT", GASLIMIT: 356190, // real swap ERC-20 via aggregator ~100k-150k gas units
        DEFAULT_RPC: 'https://rpc.llama-rpc.com/ethereum?source=llamaswap', // DefiLlama
        FALLBACK_RPCS: ['https://ethereum-mainnet.wallet.brave.com'],
        BADGE_CLASS: 'bg-primary text-light',
        SYNONYMS: ['ETH', 'ERC20', 'ETHEREUM', 'USDTERC20', 'ETH-ERC20', 'ERC-20', 'ETH MAINNET', 'ETHMAINNET', 'ETHEREUM MAINNET', 'Ethereum'],
        LINKS: {
            explorer: {
                token: (address) => `https://etherscan.io/token/${address}`,
                address: (address) => `https://etherscan.io/address/${address}`,
                tx: (hash) => `https://etherscan.io/tx/${hash}`
            }
        },
        DEXS: ["kyber", "okx", "matcha", "oneinch", "sushi", "velora", "flytrade", "odos", "openocean", "cowswap", "lifidex", "nordstern"],
        WALLET_CEX: {
            GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chainCEX: 'ETH' },
            BINANCE: { address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d', address2: '0x28C6c06298d514Db089934071355E5743bf21d60', address3: '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', chainCEX: 'ETH' },
            INDODAX: { address: '0x3C02290922a3618A4646E3BbCa65853eA45FE7C6', address2: '0x91Dca37856240E5e1906222ec79278b16420Dc92', chainCEX: 'ETH' },
            MEXC: { address: '0x75e89d5979E4f6Fba9F97c104c2F0AFB3F1dcB88', address2: '0x9642b23Ed1E01Df1092B92641051881a322F5D4E', chainCEX: 'ETH' },
            KUCOIN: { address: '0x58edF78281334335EfFa23101bBe3371b6a36A51', address2: '0xD6216fC19DB775Df9774a6E33526131dA7D19a2c', chainCEX: 'ERC20' },
            BITGET: { address: '0x0639556F03714A74a5fEEaF5736a4A64fF70D206', address2: '0x51971c86b04516062c1e708CDC048CB04fbe959f', address3: '0xBDf5bAfEE1291EEc45Ae3aadAc89BE8152D4E673', chainCEX: 'ERC20' },
            BYBIT: { address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', address2: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', chainCEX: 'Ethereum' },
            HTX: { address: '0xa03400E098F4421b34a3a44A1B4e571419517687', chainCEX: 'ETH' },
            OKX: { address: '0x91D40E4818F4D4C57b4578d9ECa6AFc92aC8DEbE', chainCEX: 'Ethereum' },
        },
        PAIRDEXS: {
            "USDT": { symbolPair: 'USDT', scAddressPair: '0xdAC17F958D2ee523a2206206994597C13D831ec7', desPair: '6' },
            "ETH": { symbolPair: 'ETH', scAddressPair: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', desPair: '18' },
            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        }
    },

    base: {
        Kode_Chain: 8453, Nama_Chain: "Base", Nama_Pendek: "BASE", URL_Chain: "https://basescan.org/", WARNA: "#1e46f9", ICON: "assets/icons/chains/base.png", DATAJSON: 'https://pencari-selisih.github.io/JSON-TOKEN/SNAPSHOT_koin_BASE.json', BaseFEEDEX: "ETHUSDT", GASLIMIT: 250000, // real swap Base ERC-20 ~150k gas units
        DEFAULT_RPC: 'https://rpc.llama-rpc.com/base?source=llamaswap', // DefiLlama
        FALLBACK_RPCS: ['https://base-mainnet.wallet.brave.com'],
        BADGE_CLASS: 'bg-dark text-light',
        SYNONYMS: ['BASE', 'Base', 'BASE MAINNET', 'BASEEVM', 'BASEMAINNET', 'BASE CHAIN', 'BASECHAIN'],
        LINKS: {
            explorer: {
                token: (address) => `https://basescan.org/token/${address}`,
                address: (address) => `https://basescan.org/address/${address}`,
                tx: (hash) => `https://basescan.org/tx/${hash}`
            }
        },
        DEXS: ["kyber", "okx", "matcha", "oneinch", "sushi", "velora", "flytrade", "odos", "openocean", "cowswap", "lifidex", "nordstern"],
        WALLET_CEX: {
            GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chainCEX: 'BASE' },
            BINANCE: { address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d', address2: '0x28C6c06298d514Db089934071355E5743bf21d60', chainCEX: 'BASE' },
            MEXC: { address: '0x4e3ae00E8323558fA5Cac04b152238924AA31B60', chainCEX: 'BASE' },
            INDODAX: { address: '0x3C02290922a3618A4646E3BbCa65853eA45FE7C6', address2: '0x91Dca37856240E5e1906222ec79278b16420Dc92', chainCEX: 'POLYGON' },
            KUCOIN: { address: '0x58edF78281334335EfFa23101bBe3371b6a36A51', address2: '0xD6216fC19DB775Df9774a6E33526131dA7D19a2c', chainCEX: 'Base' },
            BITGET: { address: '0x0639556F03714A74a5fEEaF5736a4A64fF70D206', address2: '0x51971c86b04516062c1e708CDC048CB04fbe959f', address3: '0xBDf5bAfEE1291EEc45Ae3aadAc89BE8152D4E673', chainCEX: 'BASE' },
            BYBIT: { address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', address2: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', chainCEX: 'Base Mainnet' },
            HTX: { address: '0x7A8bA143F8866242782E5b3A5Ad1410Bb6722206', chainCEX: 'BASE' },
            OKX: { address: '', chainCEX: 'Base' },
        },
        PAIRDEXS: {
            "USDC": { symbolPair: 'USDC', scAddressPair: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', desPair: '6' },
            "ETH": { symbolPair: 'ETH', scAddressPair: '0x4200000000000000000000000000000000000006', desPair: '18' },

            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        }
    },

    solana: {
        Kode_Chain: 501, Nama_Chain: "Solana", Nama_Pendek: "SOL", URL_Chain: "https://solscan.io/", ICON: "assets/icons/chains/solana.png", WARNA: "#7508a0ff", DATAJSON: 'https://pencari-selisih.github.io/JSON-TOKEN/SNAPSHOT_koin_SOLANA.json', BaseFEEDEX: "SOLUSDT", GASLIMIT: 5000, // Solana uses compute units
        DEFAULT_RPC: 'https://api.mainnet-beta.solana.com', // Solana Foundation public RPC
        FALLBACK_RPCS: ['https://solana-mainnet.wallet.brave.com'],
        BADGE_CLASS: 'bg-solana text-dark',
        SYNONYMS: ['SOL', 'SOLANA', 'SPL', 'SOLANA MAINNET', 'SOLMAINNET', 'SOLANA CHAIN', 'SOLCHAIN', 'SOLANASOL'],
        LIFI_CHAIN_ID: 1151111081099710,
        DZAP_CHAIN_ID: 7565164,
        MATCHA_CHAIN_ID: 1399811149,
        LINKS: {
            explorer: {
                token: (address) => `https://solscan.io/token/${address}`,
                address: (address) => `https://solscan.io/account/${address}`,
                tx: (hash) => `https://solscan.io/tx/${hash}`
            }
        },
        DEXS: ["matcha", "okx", "jupiter", "flytrade"],  // ✅ DFlow requires API key - enable manually if you have one
        WALLET_CEX: {
            GATE: { address: 'HiRpdAZifEsZGdzQ5Xo5wcnaH3D2Jj9SoNsUzcYNK78J', address2: 'u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w', chainCEX: 'SOL' },
            BINANCE: { address: '28nYGHJyUVcVdxZtzKByBXEj127XnrUkrE3VaGuWj1ZU', address2: '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S', chainCEX: 'SOL' },
            MEXC: { address: 'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2', address2: '42brAgAVNzMBP7aaktPvAmBSPEkehnFQejiZc53EpJFd', chainCEX: 'SOL' },
            KUCOIN: { address: 'BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6', address2: 'EkUy8BB574iEVAQE9dywEiMhp9f2mFBuFu6TBKAkQxFY', chainCEX: 'SOL' },
            BITGET: { address: 'A77HErqtfN1hLLpvZ9pCtu66FEtM8BveoaKbbMoZ4RiR', chainCEX: 'SOL' },
            BYBIT: { address: 'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2', address2: '42brAgAVNzMBP7aaktPvAmBSPEkehnFQejiZc53EpJFd', chainCEX: 'SOL' },
            OKX: { address: 'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2', address2: '42brAgAVNzMBP7aaktPvAmBSPEkehnFQejiZc53EpJFd', chainCEX: 'Solana' },
            INDODAX: { address: 'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2', chainCEX: 'SOL' },
            HTX: { address: '9un5wqE3q4oCjyrDkwsdD48KteCJitQX5978Vh7KKxHo', chainCEX: 'SOL' },
        },
        PAIRDEXS: {
            "SOL": { symbolPair: 'SOL', scAddressPair: 'So11111111111111111111111111111111111111112', desPair: '9' },
            "USDT": { symbolPair: 'USDT', scAddressPair: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', desPair: '6' },
            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        }
    },

    avax: {
        Kode_Chain: 43114, Nama_Chain: "Avalanche", Nama_Pendek: "AVAX", URL_Chain: "https://snowscan.xyz", WARNA: "#e84142", ICON: "assets/icons/chains/avax.png", DATAJSON: 'https://pencari-selisih.github.io/JSON-TOKEN/SNAPSHOT_koin_AVAX.json', BaseFEEDEX: "AVAXUSDT", GASLIMIT: 300000, // real swap AVAX C-Chain ~150k-300k gas units
        DEFAULT_RPC: 'https://rpc.llama-rpc.com/avax?source=llamaswap', // Avalanche Foundation public RPC
        FALLBACK_RPCS: ['https://avalanche-mainnet.wallet.brave.com'],
        BADGE_CLASS: 'bg-danger text-white',
        SYNONYMS: ['AVAX', 'AVAXC', 'AVALANCHE', 'AVAX-C', 'AVAX_C', 'C-CHAIN', 'AVAX C-CHAIN', 'AVAXCCHAIN', 'AVALANCHE C-CHAIN', 'AVAX C CHAIN', 'AVALANCHE CCHAIN', 'CAVAX', 'Avalanche C Chain(AVAX CCHAIN)', 'AVAX_CCHAIN'],
        LINKS: {
            explorer: {
                token: (address) => `https://snowscan.xyz/token/${address}`,
                address: (address) => `https://snowscan.xyz/address/${address}`,
                tx: (hash) => `https://snowscan.xyz/tx/${hash}`
            }
        },
        DEXS: ["kyber", "okx", "matcha", "oneinch", "sushi", "velora", "flytrade", "odos", "openocean", "lifidex", "nordstern"],
        WALLET_CEX: {
            GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chainCEX: 'AVAX' },
            BINANCE: { address: '0x290275e3db66394C52272398959845170E4DCb88', address2: '0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245', chainCEX: 'AVAX C-CHAIN' },
            MEXC: { address: '0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB', chainCEX: 'AVAX C-CHAIN' },
            KUCOIN: { address: '0x58edF78281334335EfFa23101bBe3371b6a36A51', chainCEX: 'AVAX' },
            BITGET: { address: '0x0639556F03714A74a5fEEaF5736a4A64fF70D206', address2: '0x51971c86b04516062c1e708CDC048CB04fbe959f', chainCEX: 'AVAX C-Chain' },
            BYBIT: { address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', chainCEX: 'Avalanche C-Chain' },
            HTX: { address: '0x9a7ffd7f6c42ab805e0edf16c25101964c6326b6', chainCEX: 'AVAX' },
            OKX: { address: '0xA0420C29B214d09b9ec751aa1f592c7b1fa77dA3', chainCEX: 'AVAX C-Chain' },
        },
        PAIRDEXS: {
            "AVAX": { symbolPair: 'AVAX', scAddressPair: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', desPair: '18' }, // WAVAX
            "USDT": { symbolPair: 'USDT', scAddressPair: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', desPair: '6' }, // USDT on Avalanche
            "USDC": { symbolPair: 'USDC', scAddressPair: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', desPair: '6' }, // USDC on Avalanche
            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        }
    },

};

// CONFIG_UI is now built dynamically at the bottom of the file

// buildChainConfig, buildCexConfig, buildDexConfig moved to bottom of file to ensure all source configs are loaded first

// buildChainConfig, buildCexConfig, buildDexConfig moved to bottom of file to ensure all source configs are loaded first

// Optional proxy settings for DEX/network calls
// Define a list of CORS proxy servers; one will be chosen at random per access
const serverCORS = [
    // Add or replace with your own proxies
    "https://server1.ciwayeh967.workers.dev/?",
    "https://yazid3.yazidcrypto7.workers.dev/?",
    "https://yazid5.bustomi.workers.dev/?",
    "https://yazid4.yazidcrypto3.workers.dev/?",
    "https://yoeazd2.yoeaz2324.workers.dev/?",
    "https://server6.hejij49077.workers.dev/?",
    "https://server7.gejac16482.workers.dev/?",
    "https://server8.xotolo5853.workers.dev/?",
    "https://server9.dopacer193.workers.dev/?",
    "https://server10.samoker104.workers.dev/?",
    "https://worker-bold-meadow-ab0a.xaraho1024.workers.dev/?",
    "https://worker-cool-truth-c06e.nomege1872.workers.dev/?",
    "https://worker-floral-river-e85c.tenimik318.workers.dev/?",
    "https://worker-royal-sound-0576.koban78574.workers.dev/?",
    "https://worker-curly-credit-2c73.viyeva7164.workers.dev/?",
    "https://worker-royal-haze-a135.lisolo3133.workers.dev/?",
    "https://worker-shy-cloud-27ca.vanogo6423.workers.dev/?",
    "https://worker-withered-sky-ed3e.vifeci7919.workers.dev/?",
    "https://worker-sweet-sound-e261.jaxet60213.workers.dev/?",
    "https://worker-shiny-sun-08f7.xabenic669.workers.dev/?",
    "https://worker-frosty-darkness-4f91.lobowev486.workers.dev/?",
    "https://worker-silent-boat-3c2e.celov42704.workers.dev/?",
    "https://worker-round-star-6bf9.yalayo9082.workers.dev/?",
    "https://worker-cool-dream-e973.gocon75635.workers.dev/?",
    "https://worker-winter-sound-52bd.pedig30998.workers.dev/?",
    "https://worker-super-lake-198e.kevaraj359.workers.dev/?",
    "https://worker-soft-dawn-b769.robiho8355.workers.dev/?",
    "https://worker-weathered-forest-2a2e.fiwala7986.workers.dev/?",
    "https://worker-still-tooth-553b.sewis68418.workers.dev/?",
    "https://worker-solitary-waterfall-f039.fomev71287.workers.dev/?",
    "https://server4.dajom23364.workers.dev/?",
    "https://server3.hopevap663.workers.dev/?",
    "https://worker-blue-mountain-bee9.hibes27870.workers.dev/?",
    "https://worker-still-morning-642c.kehoc99044.workers.dev/?",
    "https://myserver4.lamowa2709.workers.dev/?",
    "https://myserver5.mohafe9330.workers.dev/?",
    "https://worker-young-bush-ce2e.micejiy771.workers.dev/?",
    "https://worker-sparkling-silence-9d41.federi4672.workers.dev/?",
    "https://worker-polished-cloud-77bd.renel72768.workers.dev/?",
    "https://worker-sweet-darkness-d1c0.risiv74771.workers.dev/?",
    "https://worker-jolly-wildflower-c305.kacito9688.workers.dev/?",
    "https://worker-dawn-king-f162.kekam96808.workers.dev/?",
    "https://worker-shrill-bonus-9ca6.wipihoh336.workers.dev/?",
    "https://worker-tiny-bar-013f.gicot48223.workers.dev/?",
    "https://worker-tight-violet-dbda.xemojos811.workers.dev/?",
    "https://worker-tight-lab-9cc4.fetec22957.workers.dev/?",
    "https://server2.holabaj699.workers.dev/?",
    "https://myserver3.ceteg74201.workers.dev/?",
    "https://1.iiknrbtxoz.workers.dev/?",
    "https://2.5iz3h20guj.workers.dev/?",
    "https://3.g5l3krmasa-bda.workers.dev/?",
    "https://4.7gggrv7tyo.workers.dev/?",
    "https://5.1mynz671ti.workers.dev/?",
    "https://6.6dn6rtqjng.workers.dev/?",
    "https://7.zk3dvkv4pp.workers.dev/?",
    "https://8.c58qvb11ew.workers.dev/?",
    "https://9.n9zkqpbdpb.workers.dev/?",
    "https://10.tximoyq5se.workers.dev/?",
    "https://server11.jiser33752.workers.dev/?",
    "https://server12.yitijex843.workers.dev/?",
    "https://server13.lovah68689.workers.dev/?",
    "https://server14.setopit195.workers.dev/?",
    "https://server15.povaf41444.workers.dev/?",
    "https://server16.niromaf426.workers.dev/?",
    "https://server17.kasoda9624.workers.dev/?",
    "https://server18.befim19137.workers.dev/?",
    "https://server19.gafigaf751.workers.dev/?",
    "https://server20.gayomep515.workers.dev/?",
    "https://worker-plain-shape-e4c4.dilexid433.workers.dev/?",
    "https://worker-weathered-bar-d4fa.dadiyo8115.workers.dev/?",
    "https://myserver3.ceteg74201.workers.dev/?",
    "https://server21.becibov328.workers.dev/?",
    "https://server22.togid93865.workers.dev/?",
    "https://server24.yaleve6056.workers.dev/?",
    "https://server23.bagotof270.workers.dev/?",
    "https://new1.gisot33558.workers.dev/?",
    "https://new2.sober27867.workers.dev/?",
    "https://new3.micipiy438.workers.dev/?",
    "https://new3.rayepar467.workers.dev/?",
    "https://new4.xebidi4752.workers.dev/?",
    "https://new5.cibiyec145.workers.dev/?",
    "https://worker-frosty-star-71a8.cesaxem416.workers.dev/?",
    "https://worker-sweet-dust-96ef.payat56154.workers.dev/?",
    "https://new5.nafeyis928.workers.dev/?",
    "https://worker-broad-tree-49bb.cekah58754.workers.dev/?",
    "https://worker-ancient-hill-fad1.xejab72348.workers.dev/?",
    "https://cors.gemul-putra.workers.dev/?",
    "https://worker-damp-glitter-db50.gameco3780.workers.dev/?",
    "https://worker-blue-hall-1d14.xinevo2786.workers.dev/?",
    "https://worker-tiny-dust-22f2.capaji8287.workers.dev/?",
    "https://worker-old-disk-8a9a.kehaxa7686.workers.dev/?",
    "https://worker-yellow-wood-677d.lanafi2429.workers.dev/?",
    "https://worker-cool-tree-07c7.kifira7062.workers.dev/?",
    "https://myserver6.bafayi9378.workers.dev/?",
    "https://myserver7.yiwaj21571.workers.dev/?",
    "https://myserver7.yiwaj21571.workers.dev/?",
    "https://myserver5.mohafe9330.workers.dev/?",
    "https://worker-weathered-bar-d4fa.dadiyo8115.workers.dev/?"
];

const CONFIG_PROXY = {
    LIST: serverCORS
};

// Backward-compatible dynamic getter: each access returns a random prefix
try {
    Object.defineProperty(CONFIG_PROXY, 'PREFIX', {
        configurable: true,
        enumerable: true,
        get() {
            try {
                const list = Array.isArray(CONFIG_PROXY.LIST) ? CONFIG_PROXY.LIST : [];
                if (!list.length) return '';
                const idx = Math.floor(Math.random() * list.length);
                return String(list[idx] || '');
            } catch (_) { return ''; }
        }
    });
} catch (_) { }

try {
    if (typeof window !== 'undefined') {
        window.serverCORS = window.serverCORS || serverCORS;
        window.CONFIG_PROXY = window.CONFIG_PROXY || CONFIG_PROXY;
        // Convenience helper
        window.getRandomProxy = window.getRandomProxy || function () { return CONFIG_PROXY.PREFIX; };
    }
} catch (_) { }


const CONFIG_DEXS = {
    kyber: {
        label: 'KyberSwap',
        badgeClass: 'bg-kyberswap',
        fallbackSlug: 'kyberswap',
        evmOnly: true,
        warna: "#0b7e18ff", // hijau tosca KyberSwap
        builder: ({ chainName, tokenAddress, pairAddress }) =>
            `https://kyberswap.com/swap/${chainName}/${tokenAddress}-to-${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'kyber',          // CEX→DEX: Official KyberSwap API
                pairtotoken: 'kyber'           // DEX→CEX: Official KyberSwap API
            },
            secondary: {
                tokentopair: 'talisman-kyber',   // CEX→DEX: Bungee filtered KyberSwap (rotation)
                pairtotoken: 'brave-kyber'    // DEX→CEX: Bungee filtered KyberSwap (rotation)
            },
            alternative: {
                tokentopair: 'bungee-kyber',  // CEX→DEX: Krystal allRates filtered KyberSwap (fallback)
                pairtotoken: 'krystal-kyber'   // DEX→CEX: Krystal allRates filtered KyberSwap (fallback)
            }
        },
        allowFallback: true,  // ✅ Enable rotation between primary and alternative
    },
    okx: {
        label: 'OKX',
        badgeClass: 'bg-okx',
        fallbackSlug: 'okx',
        disabled: false, // ✅ ENABLED - OKX DEX Aggregator active
        supportsSolana: true,  // OKX DEX supports Solana
        warna: "#000000",
        builder: ({ chainCode, tokenAddress, pairAddress }) =>
            `https://www.okx.com/web3/dex-swap?inputChain=${chainCode}&inputCurrency=${tokenAddress}&outputChain=${chainCode}&outputCurrency=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'okx',           // CEX→DEX: Official OKX DEX API
                pairtotoken: 'krystal-okx'        // DEX→CEX: Coin98 Superlink filtered for OKX
            },
            secondary: {
                tokentopair: 'dexview-okx',   // CEX→DEX: Krystal allRates filtered OKX
                pairtotoken: 'birdeye-okx'    // DEX→CEX: Krystal allRates filtered OKX
            },
            alternative: {
                tokentopair: 'brave-okx',       // CEX→DEX: Coin98 Superlink filtered for OKX
                pairtotoken: 'talisman-okx'            // DEX→CEX: Official OKX DEX API
            }
        },
        allowFallback: true, // ✅ Enable rotation between primary and alternative
    },

    flytrade: {
        label: 'Flytrade',
        badgeClass: 'bg-flytrade',
        fallbackSlug: 'flytrade',
        supportsSolana: true,
        warna: "#7d2ff4ff", // Indigo for Flytrade
        builder: ({ chainName, NameToken, NamePair }) => {
            const network = String(chainName || '').toLowerCase();
            // Format: /swap/{network}/{fromSymbol}/{network}/{toSymbol}
            // CEX→DEX: swap TOKEN → PAIR (token adalah FROM, pair adalah TO)
            // Flytrade menggunakan symbol bukan smart contract address
            return `https://app.fly.trade/swap/${network}/${NameToken}/${network}/${NamePair}`;
        },
        // ⚡ ROTATION STRATEGY: Alternate between Flytrade and LIFI
        fetchdex: {
            primary: {
                tokentopair: 'flytrade',        // CEX→DEX: Flytrade aggregator
                pairtotoken: 'flytrade'         // DEX→CEX: Flytrade aggregator
            },
            secondary: {
                tokentopair: 'rabby-flytrade', // CEX→DEX: Talisman filtered → Fly route
                pairtotoken: 'rabby-flytrade'   // DEX→CEX: Zapper filtered → Fly route
            },
            alternative: {
                tokentopair: 'talisman-flytrade',   // CEX→DEX: Rabby filtered → Fly route
                pairtotoken: 'brave-flytrade'    // DEX→CEX: Rabby filtered → Fly route
            }
        },
        allowFallback: true,  // ✅ Enable fallback to alternative on error
    },
    matcha: {
        label: 'Matcha',
        badgeClass: 'bg-matcha',
        fallbackSlug: 'matcha',
        supportsSolana: true,  // Matcha supports Solana via 0x API
        warna: "#61ee73ff", // hitam abu-abu (Matcha/0x)
        builder: ({ chainName, tokenAddress, pairAddress, chainCode }) => {
            const chain = String(chainName || '').toLowerCase();
            const isSolana = chain === 'solana';
            if (isSolana) {
                const solChainId = 1399811149;
                return `https://matcha.xyz/tokens/solana/${tokenAddress}?buyChain=${solChainId}&buyAddress=${pairAddress}&sellChain=${solChainId}&sellAddress=${tokenAddress}`;
            }
            // Matcha.xyz menggunakan slug berbeda dari key chain internal kita
            const matchaChainSlug = {
                avax: 'avalanche',
                bsc: 'bnb',  // BSC = "bnb" di Matcha
            };
            const slug = matchaChainSlug[chain] || chain;
            return `https://matcha.xyz/tokens/${slug}/${String(tokenAddress || '').toLowerCase()}?buyChain=${chainCode}&buyAddress=${String(pairAddress || '').toLowerCase()}`;
        },
        // ⚡ CHAIN-SPECIFIC STRATEGY: Solana uses direct endpoint, EVM uses proxies
        fetchdex: {
            primary: {
                tokentopair: 'delta-matcha',    // CEX→DEX: 1Delta proxy (fast, free) - EVM only
                pairtotoken: 'backpack-matcha'       // DEX→CEX: Coin98 Superlink filtered - EVM only
            },
            secondary: {
                tokentopair: 'rainbow-matcha',   // CEX→DEX: Bungee filtered 0x/Matcha (rotation)
                pairtotoken: 'bungee-matcha'    // DEX→CEX: Bungee filtered 0x/Matcha (rotation)
            },
            alternative: {
                tokentopair: 'rabby-matcha',  // CEX→DEX: Rainbow proxy 0x/Matcha (fallback)
                pairtotoken: 'c98-matcha'   // DEX→CEX: Rainbow proxy 0x/Matcha (fallback)
            },
            // ✅ SOLANA OVERRIDE: For Solana chain, always use direct matcha endpoint
            solana: {
                tokentopair: 'matcha',    // CEX→DEX: Direct Matcha Solana API
                pairtotoken: 'matcha'     // DEX→CEX: Direct Matcha Solana API
            }
        },
        allowFallback: true,  // ✅ Enable rotation between primary and alternative
    },

    odos: {
        label: 'ODOS',
        badgeClass: 'bg-odos',
        fallbackSlug: 'odos',
        skipDelay: true,
        evmOnly: true,
        warna: "#6e2006ff", // ungu-biru Odos
        builder: () => `https://app.odos.xyz`,
        // ⚡ MODE: SECONDARY (Rotation) - bergantian antara primary dan secondary
        fetchdex: {
            primary: {
                tokentopair: 'odos3',
                pairtotoken: 'swoop-odos'
            },
            secondary: {
                tokentopair: 'hinkal-odos',
                pairtotoken: 'hinkal-odos'
            },
            alternative: {
                tokentopair: 'brave-odos',  // CEX→DEX: Rainbow proxy 0x/Matcha (fallback)
                pairtotoken: 'talisman-odos'   // DEX→CEX: Rainbow proxy 0x/Matcha (fallback)
            },
        },
        allowFallback: true,  // ✅ Jika yang dipilih gagal, coba yang lain
    },

    // relay: {
    //     label: 'Relay',
    //     badgeClass: 'bg-relay',
    //     fallbackSlug: 'relay',
    //     disabled: false, // ✅ ENABLED - Cross-chain bridge & swap aggregator
    //     warna: "#160783ff",  // Purple - Relay brand color
    //     builder: ({ chainName, chainCode, tokenAddress, pairAddress }) =>
    //         `https://relay.link/bridge/${String(chainName || '').toLowerCase()}?fromChainId=${chainCode}&fromCurrency=${tokenAddress}&toCurrency=${pairAddress}`,
    //     fetchdex: {
    //         primary: {
    //             tokentopair: 'relay',          // CEX→DEX: Direct Relay API
    //             pairtotoken: 'relay'           // DEX→CEX: Direct Relay API
    //         },
    //         alternative: {
    //             tokentopair: 'relay',     // CEX→DEX: LIFI filtered (rotation)
    //             pairtotoken: 'relay'      // DEX→CEX: LIFI filtered (rotation)
    //         }
    //     },
    //     allowFallback: false,  // ✅ Enable rotation between primary and alternative
    // },
    // ============ DISABLED DEXes ============

    velora: {
        label: 'Velora',
        badgeClass: 'bg-velora',
        fallbackSlug: 'velora',
        warna: "#1c64f2ff",
        evmOnly: true,
        builder: ({ chainName, tokenAddress, pairAddress }) => {
            const network = String(chainName || '').toLowerCase();
            const from = String(tokenAddress || '').toLowerCase();
            const to = String(pairAddress || '').toLowerCase();
            return `https://app.velora.xyz/#/swap/${tokenAddress}-${pairAddress}/0/SELL?network=${network}&from=${from}&to=${to}&version=6.2`;
        },
        // ⚡ ROTATION STRATEGY: Alternate between official API and filtered aggregators
        fetchdex: {
            primary: {
                tokentopair: 'velora6',        // CEX→DEX: Official Velora v6.2
                pairtotoken: 'velora5'         // DEX→CEX: Official Velora v5
            },

            secondary: {
                tokentopair: 'talisman-velora', // CEX→DEX: Talisman filtered → ParaSwap route
                pairtotoken: 'brave-velora'   // DEX→CEX: Zapper filtered → ParaSwap route
            },
            alternative: {
                tokentopair: 'rocketx-velora', // CEX→DEX: RocketX filtered → ParaSwap route
                pairtotoken: 'swing-velora'     // DEX→CEX: SWING filtered → ParaSwap route
            }
        },
        allowFallback: true,  // ✅ Enable rotation between primary and alternative
    },
    oneinch: {
        label: 'ONEINCH',
        badgeClass: 'bg-1inch',
        fallbackSlug: 'oneinch',
        evmOnly: true,
        warna: "#fd0404ff",  // 1inch blue brand color
        builder: ({ codeChain, tokenAddress, pairAddress }) =>
            `https://1inch.io/swap?src=${codeChain}:${tokenAddress}&dst=${codeChain}:${pairAddress}`,
        // ⚡ STRATEGY: Multiple proxy endpoints, no direct 1inch API key needed
        // ⚠️ lifi-1inch: Only works for swaps >$10000 on some chains
        fetchdex: {

            primary: {
                tokentopair: 'enkrypt-1inch',       // CEX→DEX: LiFi filtered → 1inch route
                pairtotoken: 'rainbow-1inch'     // DEX→CEX: Enkrypt 1inch proxy
            },
            secondary: {
                tokentopair: 'birdeye-1inch',      // CEX→DEX: Rabby 1inch proxy (no API key)
                pairtotoken: 'rabby-one1inch'     // DEX→CEX: Hinkal 1inch proxy
            },
            alternative: {
                tokentopair: 'hinkal-1inch',     // CEX→DEX: OneKey filtered → 1inch provider
                pairtotoken: 'hinkal-one1inch'   // DEX→CEX: Hinkal 1inch proxy
            }
        },

        allowFallback: true,  // ✅ Enable fallback on error
    },
    openocean: {
        label: 'OpenOcean',
        badgeClass: 'bg-openocean',
        fallbackSlug: 'openocean',
        evmOnly: true,
        warna: "#87898bff",
        builder: ({ chainName, tokenAddress, pairAddress }) => {
            const slugMap = {
                ethereum: 'eth', bsc: 'bsc', polygon: 'polygon',
                arbitrum: 'arbitrum', optimism: 'optimism', avalanche: 'avax',
                base: 'base', fantom: 'fantom', zksync: 'zksync',
                linea: 'linea', scroll: 'scroll',
            };
            const slug = slugMap[String(chainName).toLowerCase()] || String(chainName).toLowerCase();
            return `https://app.openocean.finance/swap/${slug}/${tokenAddress}/${pairAddress}`;
        },
        fetchdex: {
            primary: {
                tokentopair: 'openocean',
                pairtotoken: 'openocean'
            },
            alternative: {
                tokentopair: 'talisman-openocean',
                pairtotoken: 'brave-openocean'
            }
        },
        allowFallback: true,
    },

    lifidex: {
        label: 'LIFIDX',
        badgeClass: 'bg-lifidex',
        fallbackSlug: 'lifidex',
        disabled: false,
        warna: "#e44be8ff",       // Magenta — beda dari JUMPER (#f764bc)
        proxy: true,              // ✅ Enable proxy — Temple API mungkin butuh CORS proxy
        builder: ({ chainCode, tokenAddress, pairAddress }) =>
            `https://jumper.exchange/?fromChain=${chainCode}&fromToken=${tokenAddress}&toChain=${chainCode}&toToken=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'swoop-lifidex',       // CEX→DEX: Hinkal LiFi Proxy
                pairtotoken: 'swoop-lifidex'        // DEX→CEX: Hinkal LiFi Proxy
            },
            alternative: {
                tokentopair: 'c98-lifidex',         // CEX→DEX: C98 (using Superlink/LiFi API)
                pairtotoken: 'c98-lifidex'       // DEX→CEX: OneKey (using LiFi/SwapLifi API)
            }
        },
        allowFallback: true,   // ✅ Fallback ke alternative jika primary/secondary gagal
    },
    sushi: {
        label: 'SUSHI',
        badgeClass: 'bg-sushi',
        fallbackSlug: 'sushi',
        warna: "#fa52a0",
        evmOnly: true,
        builder: ({ chainName, tokenAddress, pairAddress }) =>
            `https://www.sushi.com/swap?fromChainId=${chainName}&token0=${tokenAddress}&token1=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'sushi',
                pairtotoken: 'sushi'
            },
            alternative: {
                tokentopair: 'talisman-sushi',
                pairtotoken: 'brave-sushi'
            }
        },
        allowFallback: true,
    },
    // eisen: {
    //     label: 'EISEN',
    //     badgeClass: 'bg-eisen',
    //     fallbackSlug: 'eisen',
    //     warna: '#f3bd49ff',
    //     isMetaDex: false,
    //     evmOnly: true,
    //     builder: ({ chainCode, tokenAddress, pairAddress }) =>
    //         `https://jumper.exchange/?fromChain=${chainCode}&fromToken=${tokenAddress}&toChain=${chainCode}&toToken=${pairAddress}`,
    //     fetchdex: {
    //         primary: {
    //             tokentopair: 'eisen',
    //             pairtotoken: 'eisen'
    //         },
    //         alternative: {
    //             tokentopair: 'talisman-eisen',
    //             pairtotoken: 'brave-eisen'
    //         }
    //     },
    //     allowFallback: true
    // },
    cowswap: {
        label: 'CoWSwap',
        badgeClass: 'bg-cowswap',
        fallbackSlug: 'cowswap',
        warna: '#6488e4ff',
        proxy: true,
        evmOnly: true,
        builder: ({ chainCode, tokenAddress, pairAddress }) =>
            `https://swap.cow.fi/#/${chainCode}/swap/${tokenAddress}/${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'cowswap',
                pairtotoken: 'cowswap'
            },
            alternative: {
                tokentopair: 'talisman-cowswap',
                pairtotoken: 'brave-cowswap'
            }
        },
        allowFallback: true,
    },
    // enso: {
    //     label: 'Enso',
    //     badgeClass: 'bg-enso',
    //     fallbackSlug: 'enso',
    //     proxy: true,
    //     evmOnly: true,
    //     warna: '#6c63ffff',
    //     builder: ({ chainName, tokenAddress, pairAddress, amountIn }) => {
    //         const network = String(chainName || '').toLowerCase();
    //         const from = String(tokenAddress || '').toLowerCase();
    //         const to = String(pairAddress || '').toLowerCase();
    //         const amt = encodeURIComponent(`"${amountIn || 111}"`);
    //         return `https://oku.trade/swap?inputChain=${network}&inToken=${from}&outToken=${to}&inAmount=${amt}&isExactOut=false`;
    //     },
    //     fetchdex: {
    //         primary: {
    //             tokentopair: 'enso',
    //             pairtotoken: 'enso'
    //         },
    //         secondary: {
    //             tokentopair: 'brave-enso',
    //             pairtotoken: 'talisman-enso'
    //         }
    //     },
    //     allowFallback: true,
    // },
    nordstern: {
        label: 'Nordstern',
        badgeClass: 'bg-nordstern',
        fallbackSlug: 'nordstern',
        proxy: false,   // REST API resmi Nordstern dipanggil langsung tanpa CORS proxy
        evmOnly: true,
        warna: '#d86500ff',
        builder: ({ chainName, tokenAddress, pairAddress, amountIn }) => {
            const network = String(chainName || '').toLowerCase();
            const from = String(tokenAddress || '').toLowerCase();
            const to = String(pairAddress || '').toLowerCase();
            const amt = encodeURIComponent(`"${amountIn || 111}"`);
            return `https://oku.trade/swap?inputChain=${network}&inToken=${from}&outToken=${to}&inAmount=${amt}&isExactOut=false`;
        },
        fetchdex: {
            primary: {
                tokentopair: 'nordstern',
                pairtotoken: 'nordstern'
            },
            alternative: {
                tokentopair: 'talisman-nordstern',
                pairtotoken: 'brave-nordstern'
            }
        },
        allowFallback: true,
    },
    // wowmax: {
    //     label: 'WOWMAX',
    //     badgeClass: 'bg-wowmax',
    //     fallbackSlug: 'wowmax',
    //     warna: "#ff7a00",
    //     proxy: true,
    //     builder: ({ chainCode, tokenAddress, pairAddress }) =>
    //         `https://app.wowmax.exchange/swap/${chainCode}/${tokenAddress}/${pairAddress}`,
    //     fetchdex: {
    //         primary: {
    //             tokentopair: 'wowmax',
    //             pairtotoken: 'wowmax'
    //         }
    //     },
    //     allowFallback: false,
    // },


    // ============ SOLANA DEXes ============
    jupiter: {
        label: 'Jupiter',
        badgeClass: 'bg-jupiter',
        fallbackSlug: 'jupiter',
        supportsSolana: true,  // Solana-only DEX
        warna: "#a0df3bff", // Jupiter green
        builder: ({ tokenAddress, pairAddress }) =>
            `https://jup.ag/?sell=${tokenAddress}&buy=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'jupiter',    // CEX→DEX: Jupiter aggregator (Solana)
                pairtotoken: 'jupiter'     // DEX→CEX: Jupiter aggregator (Solana)
            },
            alternative: {
                tokentopair: 'talisman-jupiter',
                pairtotoken: 'brave-jupiter'
            }
        },
        allowFallback: true // Jupiter is the main Solana DEX aggregator
    },


    // ============ BACKEND PROVIDERS (strategi-string saja, tidak tampil di UI) ============
    // SWOOP dan SWING tidak punya entri CONFIG_DEXS tersendiri — mereka adalah nama strategi
    // yang dipakai di fetchdex secondary/alternative DEX Regular:
    //   swoop-kyber, swoop-matcha, swing-odos, swing-velora, dst.
    // Hasil tetap ditampilkan di kolom DEX asal (ODOS, Velora, dll.) — bukan kolom sendiri.
    swoop: {
        label: 'SWOOP',
        badgeClass: 'bg-swoop',
        disabled: false,
        isBackendProvider: true,   // ⚡ Strategi-string internal — tidak tampil sebagai DEX column
        warna: "#ff6b35",
        proxy: true,
        delay: 1500,
    },
    rabby: {
        label: 'RABBY',
        badgeClass: 'bg-rabby',
        disabled: false,
        isBackendProvider: true,   // ⚡ Strategi-string internal — tidak tampil sebagai DEX column
        warna: "#7c3aed",          // Purple color (Rabby brand)
        proxy: true,
        delay: 2500,               // 2.5s delay — Rabby public API has strict rate limits
    },
    rainbow: {
        label: 'RAINBOW',
        badgeClass: 'bg-rainbow',
        disabled: false,
        isBackendProvider: true,   // ⚡ Strategi-string internal — tidak tampil sebagai DEX column
        warna: "#ff6ec7",          // Pink/rainbow color
        proxy: false,
        delay: 800,
    },
    backpack: {
        label: 'BACKPACK',
        badgeClass: 'bg-backpack',
        disabled: false,
        isBackendProvider: true,   // ⚡ Strategi-string internal — tidak tampil sebagai DEX column
        warna: "#e33d3dff",
        proxy: true,               // ✅ CORS proxy required — 0x.xnfts.dev does not send CORS headers
        delay: 0,
    },
    swing: {
        label: 'SWING',
        badgeClass: 'bg-swing',
        disabled: false,
        isBackendProvider: true,   // ⚡ Strategi-string internal — tidak tampil sebagai DEX column
        warna: "#4a90d9",
        proxy: true,
        delay: 800,
    },
    talisman: {
        label: 'TALISMAN',
        badgeClass: 'bg-talisman',
        disabled: false,
        isBackendProvider: true,
        warna: "#e33d3dff",
        proxy: true,
        delay: 500,
    },
    zapper: {
        label: 'ZAPPER',
        badgeClass: 'bg-zapper',
        disabled: false,
        isBackendProvider: true,   // standalone — hanya untuk jumper alternative
        warna: "#24cc59ff",
        proxy: true,
        delay: 500,
    },

    // ============ META-DEX AGGREGATORS (Multi-Quote) ============
    // Meta-DEX adalah DEX TAMBAHAN terpisah yang mengembalikan BANYAK quote sekaligus.
    // Berbeda dari DEX Regular (1 quote). Hanya aktif jika APP.META_DEX === true.
    // Muncul sebagai row/kolom SENDIRI di hasil scanning.
    //
    // Dual-role LIFI:
    //   - 'lifi' (standalone)  → Meta-DEX, multi-route, kolom sendiri
    //   - 'lifi-odos', 'lifi-velora' (filtered) → backend transport untuk DEX Regular
    jumper: {
        label: CONFIG_APP.META_DEX_CONFIG.aggregators.jumper?.label || 'JUMPX',
        badge: CONFIG_APP.META_DEX_CONFIG.aggregators.jumper?.badge || 'JM',
        badgeClass: 'bg-lifi',
        fallbackSlug: 'lifi',
        disabled: !CONFIG_APP.META_DEX_CONFIG.aggregators.jumper?.enabled,
        isMetaDex: true,   // ✅ Meta-DEX: standalone LIFI menampilkan multi-route
        evmOnly: !!CONFIG_APP.META_DEX_CONFIG.aggregators.jumper?.evmOnly,    // ✅ EVM + Solana
        warna: CONFIG_APP.META_DEX_CONFIG.aggregators.jumper?.warna || '#f764bcff',
        proxy: true,
        delay: CONFIG_APP.META_DEX_CONFIG.aggregators.jumper?.jedaDex || 600,        // 800ms jeda (rate limit ~200 req/min)
        maxProviders: 3,   // Maks sub-kolom yang ditampilkan (override user setting jika tidak diset)
        builder: ({ chainCode, tokenAddress, pairAddress }) => {
            return `https://jumper.exchange/?fromChain=${chainCode}&fromToken=${tokenAddress}&toChain=${chainCode}&toToken=${pairAddress}`;
        },
        fetchdex: {
            primary: {
                tokentopair: 'brave',
                pairtotoken: 'talisman'
            },
            alternative: {
                tokentopair: 'zapper',    // GET /api/lifi/quote (zapper.xyz) jika brave gagal
                pairtotoken: 'backpack'   // GET /quote (lifi.workers.madlads.com) jika talisman gagal
            },
        },
        allowFallback: true,
    },

    dzap: {
        label: CONFIG_APP.META_DEX_CONFIG.aggregators.dzap?.label || 'DZAP',
        badge: CONFIG_APP.META_DEX_CONFIG.aggregators.dzap?.badge || 'DZ',
        badgeClass: 'bg-dzap',
        disabled: !CONFIG_APP.META_DEX_CONFIG.aggregators.dzap?.enabled,
        isMetaDex: true,   // ✅ Meta-DEX: DZAP menampilkan multi-route
        evmOnly: true,
        warna: CONFIG_APP.META_DEX_CONFIG.aggregators.dzap?.warna || '#d9dc36ff',
        proxy: true,
        delay: CONFIG_APP.META_DEX_CONFIG.aggregators.dzap?.jedaDex || 800,        // WARNING: rentan 429 rate limit
        isMultiDex: true,
        maxProviders: 3,   // Maks sub-kolom yang ditampilkan
        builder: ({ chainCode, tokenAddress, pairAddress }) =>
            `https://app.dzap.io/swap?fromChain=${chainCode}&toChain=${chainCode}&fromToken=${tokenAddress}&toToken=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'dzap',
                pairtotoken: 'dzap'
            }
        },
        allowFallback: false,
    },

    rubic: {
        label: CONFIG_APP.META_DEX_CONFIG.aggregators.rubic?.label || 'RUBIC',
        badge: CONFIG_APP.META_DEX_CONFIG.aggregators.rubic?.badge || 'RB',
        badgeClass: 'bg-rubic',
        fallbackSlug: 'rubic',
        disabled: !CONFIG_APP.META_DEX_CONFIG.aggregators.rubic?.enabled,
        proxy: true,
        warna: CONFIG_APP.META_DEX_CONFIG.aggregators.rubic?.warna || '#24cc59ff',
        isMetaDex: true,   // ✅ Meta-DEX: multi-quote EVM + Solana
        evmOnly: !!CONFIG_APP.META_DEX_CONFIG.aggregators.rubic?.evmOnly,   // ✅ Support Solana
        delay: CONFIG_APP.META_DEX_CONFIG.aggregators.rubic?.jedaDex || 1000,
        isMultiDex: true,
        maxProviders: 3,   // Maks sub-kolom yang ditampilkan
        builder: ({ chainCode, tokenAddress, pairAddress }) =>
            `https://app.rubic.exchange/?fromChain=${chainCode}&toChain=${chainCode}&from=${tokenAddress}&to=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'rubic',
                pairtotoken: 'rubic'
            }
        },
        allowFallback: false
    },

    rango: {
        label: CONFIG_APP.META_DEX_CONFIG.aggregators.rango?.label || 'RANGO',
        badge: CONFIG_APP.META_DEX_CONFIG.aggregators.rango?.badge || 'RG',
        badgeClass: 'bg-rango',
        disabled: !CONFIG_APP.META_DEX_CONFIG.aggregators.rango?.enabled,
        proxy: true,
        warna: CONFIG_APP.META_DEX_CONFIG.aggregators.rango?.warna || '#17aedcff',
        isMetaDex: true,   // ✅ Meta-DEX: multi-quote EVM + Solana
        evmOnly: !!CONFIG_APP.META_DEX_CONFIG.aggregators.rango?.evmOnly,   // ✅ Support Solana
        delay: CONFIG_APP.META_DEX_CONFIG.aggregators.rango?.jedaDex || 1000,
        isMultiDex: true,
        maxProviders: 3,   // Maks sub-kolom yang ditampilkan
        builder: ({ chainCode, tokenAddress, pairAddress }) =>
            `https://app.rango.exchange/?from=${chainCode}&to=${chainCode}&fromToken=${tokenAddress}&toToken=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'rango',
                pairtotoken: 'rango'
            }
        },
        allowFallback: false
    },

    // RocketX: TIDAK dipakai sebagai kolom DEX mandiri.
    // Digunakan sebagai backend transport via 'rocketx-velora' (filtered strategy untuk kolom Velora).
    // Lihat: CONFIG_DEXS.velora.fetchdex.alternative.tokentopair = 'rocketx-velora'
    rocketx: {
        label: 'RocketX',
        badgeClass: 'bg-rocketx',
        disabled: true,      // ❌ Tidak tampil sebagai kolom
        proxy: false,
        warna: "#ffd52bff",
        evmOnly: true,
        delay: 600,
        builder: ({ chainCode, tokenAddress, pairAddress }) =>
            `https://app.rocketx.exchange/swap?fromChain=${chainCode}&toChain=${chainCode}&fromToken=${tokenAddress}&toToken=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'rocketx',
                pairtotoken: 'rocketx'
            }
        },
        allowFallback: false
    },

    metax: {
        label: CONFIG_APP.META_DEX_CONFIG.aggregators.metax?.label || 'METAX',
        badge: CONFIG_APP.META_DEX_CONFIG.aggregators.metax?.badge || 'MT',
        badgeClass: 'bg-metax',
        disabled: !CONFIG_APP.META_DEX_CONFIG.aggregators.metax?.enabled,
        proxy: false,        // SSE langsung dari browser (EventSource), tidak lewat proxy
        warna: CONFIG_APP.META_DEX_CONFIG.aggregators.metax?.warna || '#ec7506ff',    // MetaMask orange
        isMetaDex: true,    // ✅ Meta-DEX: SSE streaming multi-quote
        evmOnly: !!CONFIG_APP.META_DEX_CONFIG.aggregators.metax?.evmOnly,    // ✅ EVM + Solana
        delay: CONFIG_APP.META_DEX_CONFIG.aggregators.metax?.jedaDex || 800,
        isMultiDex: true,
        maxProviders: 3,   // Maks sub-kolom yang ditampilkan
        builder: ({ chainCode, tokenAddress, pairAddress }) =>
            `https://app.dzap.io/trade?referral=d0d7E9b4&fromChain=${chainCode}&fromToken=${tokenAddress}&toChain=${chainCode}&toToken=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'metax',
                pairtotoken: 'metax'
            }
        },
        allowFallback: false
    },

    onekey: {
        label: CONFIG_APP.META_DEX_CONFIG.aggregators.onekey?.label || 'ONEX',
        badge: CONFIG_APP.META_DEX_CONFIG.aggregators.onekey?.badge || '1K',
        badgeClass: 'bg-onekey',
        disabled: !CONFIG_APP.META_DEX_CONFIG.aggregators.onekey?.enabled,
        proxy: false,        // SSE langsung dari browser (EventSource), tidak lewat proxy
        warna: CONFIG_APP.META_DEX_CONFIG.aggregators.onekey?.warna || '#00b812ff',  // OneKey green
        isMetaDex: true,     // ✅ Meta-DEX: SSE streaming multi-quote
        evmOnly: !!CONFIG_APP.META_DEX_CONFIG.aggregators.onekey?.evmOnly,    // ✅ EVM + Solana
        delay: CONFIG_APP.META_DEX_CONFIG.aggregators.onekey?.jedaDex || 800,
        isMultiDex: true,
        maxProviders: 3,     // Provider: OKX, 1inch, 0x/Matcha
        builder: () => `https://app.onekey.so/r/XK4NHF/app/defi`,
        fetchdex: {
            primary: {
                tokentopair: 'onekey',
                pairtotoken: 'onekey'
            }
        },
        allowFallback: false
    },

    debridge: {
        label: CONFIG_APP.META_DEX_CONFIG.aggregators.debridge?.label || 'DEBRIDGE',
        badge: CONFIG_APP.META_DEX_CONFIG.aggregators.debridge?.badge || 'DB',
        badgeClass: 'bg-debridge',
        disabled: !CONFIG_APP.META_DEX_CONFIG.aggregators.debridge?.enabled,
        proxy: false,         // REST GET via proxy
        warna: CONFIG_APP.META_DEX_CONFIG.aggregators.debridge?.warna || '#d7ca0eff',  // deBridge
        isMetaDex: true,     // ✅ Meta-DEX: single-route aggregator
        evmOnly: true,       // EVM only
        delay: CONFIG_APP.META_DEX_CONFIG.aggregators.debridge?.jedaDex || 800,
        maxProviders: 3,
        builder: ({ tokenAddress, pairAddress, codeChain }) =>
            `https://app.debridge.finance/deswap?inputChain=${Number(codeChain)}&outputChain=${Number(codeChain)}&inputCurrency=${tokenAddress}&outputCurrency=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'debridge',
                pairtotoken: 'debridge'
            }
        },
        allowFallback: false
    },

    okutrade: {
        label: CONFIG_APP.META_DEX_CONFIG.aggregators.okutrade?.label || 'OKUX',
        badge: CONFIG_APP.META_DEX_CONFIG.aggregators.okutrade?.badge || 'OT',
        badgeClass: 'bg-okutrade',
        disabled: !CONFIG_APP.META_DEX_CONFIG.aggregators.okutrade?.enabled,
        proxy: true,
        warna: CONFIG_APP.META_DEX_CONFIG.aggregators.okutrade?.warna || '#1a6fd4ff',  // Oku blue
        isMetaDex: true,     // ✅ Meta-DEX: multi-aggregator (3-step REST)
        evmOnly: true,       // EVM only
        delay: CONFIG_APP.META_DEX_CONFIG.aggregators.okutrade?.jedaDex || 800,
        isMultiDex: true,
        maxProviders: 3,
        builder: ({ chainName, tokenAddress, pairAddress, amountIn }) => {
            const network = String(chainName || '').toLowerCase();
            const from = String(tokenAddress || '').toLowerCase();
            const to = String(pairAddress || '').toLowerCase();
            const amt = encodeURIComponent(`"${amountIn || 111}"`);
            return `https://oku.trade/swap?inputChain=${network}&inToken=${from}&outToken=${to}&inAmount=${amt}&isExactOut=false`;
        },
        fetchdex: {
            primary: {
                tokentopair: 'okutrade',
                pairtotoken: 'okutrade'
            }
        },
        allowFallback: false
    },

    ctrlfi: {
        label: CONFIG_APP.META_DEX_CONFIG.aggregators.ctrlfi?.label || 'CTRLX',
        badge: CONFIG_APP.META_DEX_CONFIG.aggregators.ctrlfi?.badge || 'CT',
        badgeClass: 'bg-ctrlfi',
        disabled: !CONFIG_APP.META_DEX_CONFIG.aggregators.ctrlfi?.enabled,
        proxy: true,         // GraphQL POST via proxy (hindari CORS)
        warna: CONFIG_APP.META_DEX_CONFIG.aggregators.ctrlfi?.warna || '#808080ff',  // abu-abu (CTRL neutral)
        isMetaDex: true,     // ✅ Meta-DEX: XDEFI/CTRL multi-route aggregator
        evmOnly: !!CONFIG_APP.META_DEX_CONFIG.aggregators.ctrlfi?.evmOnly,      // EVM + Solana (all chains)
        delay: CONFIG_APP.META_DEX_CONFIG.aggregators.ctrlfi?.jedaDex || 900,
        isMultiDex: true,
        maxProviders: 3,
        builder: () => 'https://app.ctrl.xyz/',
        fetchdex: {
            primary: {
                tokentopair: 'ctrlfi',
                pairtotoken: 'ctrlfi'
            }
        },
        allowFallback: false
    },

    zerion: {
        label: CONFIG_APP.META_DEX_CONFIG.aggregators.zerion?.label || 'ZERION',
        badge: CONFIG_APP.META_DEX_CONFIG.aggregators.zerion?.badge || 'ZR',
        badgeClass: 'bg-zerion',
        disabled: !CONFIG_APP.META_DEX_CONFIG.aggregators.zerion?.enabled,
        proxy: false,         // SSE via fetch langsung (custom headers, tidak bisa pakai EventSource)
        warna: CONFIG_APP.META_DEX_CONFIG.aggregators.zerion?.warna || '#0052ffff',   // Zerion blue
        isMetaDex: true,      // ✅ Meta-DEX: SSE streaming multi-quote
        evmOnly: true,        // EVM only (bsc, ethereum, polygon, arbitrum, base)
        delay: CONFIG_APP.META_DEX_CONFIG.aggregators.zerion?.jedaDex || 800,
        isMultiDex: true,
        maxProviders: 3,
        builder: ({ chainName, tokenAddress, pairAddress, amountIn }) => {
            const chainMap = { 'bsc': 'binance-smart-chain', 'ethereum': 'ethereum', 'polygon': 'polygon', 'arbitrum': 'arbitrum', 'base': 'base' };
            const slug = chainMap[chainName] || chainName;
            const cache = window._zerionFungibleCache || {};
            // Ambil fungibleId dari cache hasil lookup; fallback ke contract address jika belum pernah di-scan
            const fIn = cache[`${slug}:${String(tokenAddress).toLowerCase()}`] || tokenAddress;
            const fOut = cache[`${slug}:${String(pairAddress).toLowerCase()}`] || pairAddress;
            const amt = encodeURIComponent(`"${amountIn || 1}"`);
            return `https://app.zerion.io/swap?inputChain=${slug}&inputFungibleId=${fIn}&outputFungibleId=${fOut}&inputAmount=${amt}`;
        },
        fetchdex: {
            primary: {
                tokentopair: 'zerion',
                pairtotoken: 'zerion'
            }
        },
        allowFallback: false
    },







};

// window.CONFIG_DEXS exposure moved to final initialization block at end of file

// Centralized chain synonyms mapping used to normalize CEX network labels
// Centralized chain synonyms mapping used to normalize CEX network labels
// Derived from CONFIG_CHAINS to keep data in a single group
const CHAIN_SYNONYMS = (function () {
    const map = {};
    Object.entries(CONFIG_CHAINS || {}).forEach(([key, data]) => {
        if (data && data.SYNONYMS) {
            map[key] = data.SYNONYMS;
        }
    });
    return map;
})();

try { if (typeof window !== 'undefined') { window.CHAIN_SYNONYMS = window.CHAIN_SYNONYMS || CHAIN_SYNONYMS; } } catch (_) { }

// =================================================================================
// DYNAMIC UI CONFIGURATION (Built from source objects)
// =================================================================================
const CONFIG_UI = {
    // Dynamically build CEX list from CONFIG_CEX
    get CEXES() {
        return Object.keys(CONFIG_CEX || {}).map(key => ({ key: key.toUpperCase() }));
    },

    // Dynamically build DEX list from CONFIG_DEXS (filter out disabled and backends)
    get DEXES() {
        return Object.entries(CONFIG_DEXS || {})
            .filter(([_, data]) => !data.disabled && !data.isBackendProvider)
            .map(([key, _]) => ({ key: key.toLowerCase() }));
    },

    // Dynamically build Chain list from CONFIG_CHAINS
    get CHAINS() {
        return Object.keys(CONFIG_CHAINS || {}).map(key => ({ key: key.toLowerCase() }));
    },

    // ========== Scanner Behavioral Settings ==========
    SETTINGS: {
        // Default values (can be overridden by user in Settings modal)
        defaults: {
            tokensPerBatch: 3,              // Jumlah token per batch/grup
            delayBetweenGrup: 400,          // Delay antar batch (ms)
            pnlFilter: 0,                   // Minimum PNL to show alert

            // Request timing controls
            delayPerDexDirection: 150,      // Delay between CEX→DEX and DEX→CEX (ms)
            delayPerToken: 200,             // Delay per token (ms) - reserved for future use

            // Snapshot validation timing controls
            snapshotBatchDelay: 300,        // Delay between snapshot validation batches (ms)
            snapshotRequestDelay: 150       // Delay between Web3 requests in snapshot batch (ms)
        },

        // ========== PER-STRATEGY TIMEOUT CONFIGURATION ==========
        timeout: {
            'kyber': 4000,
            'velora6': 4000,
            'velora5': 4000,
            'matcha': 4500,
            'delta-matcha': 4500,
            'backpack-matcha': 4500,
            'okx': 4000,
            'relay': 5000,
            'flytrade': 4000,
            'sushi': 4000,
            'wowmax': 5000,
            'oneinch': 5000,
            'odos': 12000,
            'odos2': 12000,
            'odos3': 12000,
            'hinkal-odos': 12000,
            'hinkal-one1inch': 12000,

            'jupiter': 3000,
            'eisen': 8000,
            'eisen-*': 8000,
            'dflow': 3000,
            'lifi-*': 5000,
            'brave-*': 6000,
            'talisman-*': 6000,
            'rabby-*': 5000,
            'rainbow-*': 5000,
            'swoop-*': 9000,
            'swing-*': 6000,
            'dzap-*': 6000,
            'rango-*': 6000,
            'rubic-*': 6000,
            'c98-*': 6000,
            'lifi': 6000,
            'brave': 6000,
            'talisman': 6000,
            'zapper': 6000,
            'backpack': 6000,

            'swoop': 10000,
            'swing': 6000,
            'dzap': 6000,
            'rango': 6000,
            'rubic': 6000,
            'rocketx': 8000,
            'rocketx-velora': 8000,
            'metax': 8500,
            'onekey': 7000,
            'debridge': 8000,
            'okutrade': 9000,
            'onekey-1inch': 7000,
            'onekey-lifidex': 8000,
            'zerion': 9000,
            'birdeye-1inch': 5000,
            'default': 5000
        },

        dexOverrides: {
            odos: { delayPerDexDirection: 500 }
        },

        validation: {
            tokensPerBatch: { min: 1, max: 10 },
            delayBetweenGrup: { min: 100, max: 5000 },
            delayPerDexDirection: { min: 0, max: 2000 },
            delayPerToken: { min: 0, max: 2000 },
            snapshotBatchDelay: { min: 100, max: 2000 },
            snapshotRequestDelay: { min: 50, max: 1000 }
        }
    }
};

// =================================================================================
// DYNAMIC CONFIG BUILDERS (POST-INITIALIZATION)
// =================================================================================

function buildChainConfig(chainSource = {}, uiChains = []) {
    const uiByKey = {};
    (Array.isArray(uiChains) ? uiChains : []).forEach(item => {
        if (!item || !item.key) return;
        uiByKey[String(item.key).toLowerCase()] = item;
    });

    const map = {};
    Object.entries(chainSource || {}).forEach(([key, data]) => {
        const lowerKey = String(key).toLowerCase();
        const ui = uiByKey[lowerKey] || {};
        const basePair = String(data?.BaseFEEDEX || '');
        const symbol = basePair.toUpperCase().endsWith('USDT')
            ? basePair.toUpperCase().slice(0, -4)
            : (ui.short || data?.Nama_Pendek || data?.Nama_Chain || key || '').toString().toUpperCase();

        map[lowerKey] = {
            key: lowerKey,
            name: ui.label || data?.Nama_Chain || key,
            short: ui.short || (data?.Nama_Pendek || data?.Nama_Chain || key || '').toString().toUpperCase(),
            symbol,
            badgeClass: ui.badgeClass || data?.BADGE_CLASS || 'bg-dark text-light',
            explorer: data?.URL_Chain || '',
            code: data?.Kode_Chain,
            gasLimit: data?.GASLIMIT,
            color: data?.WARNA,
            baseFeePair: basePair,
            walletCex: data?.WALLET_CEX || {},
            pairs: data?.PAIRD || data?.PAIRDEXS || {},
            raw: data
        };
    });
    return map;
}

function buildCexConfig(cexSource = {}, uiCexes = []) {
    const uiByKey = {};
    (Array.isArray(uiCexes) ? uiCexes : []).forEach(item => {
        if (!item || !item.key) return;
        uiByKey[String(item.key).toUpperCase()] = item;
    });

    const map = {};
    Object.entries(cexSource || {}).forEach(([key, data]) => {
        const upperKey = String(key).toUpperCase();
        const ui = uiByKey[upperKey] || {};
        map[upperKey] = {
            key: upperKey,
            label: ui.label || data?.LABEL || key,
            short: ui.short || data?.SHORT || key.slice(0, 4).toUpperCase(),
            badgeClass: ui.badgeClass || data?.BADGE_CLASS || `bg-${key.toLowerCase()}`,
            icon: data?.ICON || '',
            color: data?.WARNA || '#000000',
            tradeFee: data?.TRADE_FEE || 0.001,
            links: data?.LINKS || {},
            orderbook: data?.ORDERBOOK || {},
            raw: data
        };
    });
    return map;
}

function buildDexConfig(dexSource = {}, uiDexes = []) {
    const uiByKey = {};
    (Array.isArray(uiDexes) ? uiDexes : []).forEach(item => {
        if (!item || !item.key) return;
        uiByKey[String(item.key).toLowerCase()] = item;
    });

    const map = {};
    Object.entries(dexSource || {}).forEach(([key, data]) => {
        const lowerKey = String(key).toLowerCase();
        const ui = uiByKey[lowerKey] || {};
        map[lowerKey] = {
            key: lowerKey,
            label: ui.label || data?.label || key,
            badgeClass: ui.badgeClass || data?.badgeClass || `bg-${lowerKey}`,
            fallbackSlug: ui.fallbackSlug || data?.fallbackSlug || lowerKey,
            skipDelay: ui.skipDelay || data?.skipDelay || false,
            color: data?.warna || '#000000',
            builder: data?.builder,
            fetchdex: data?.fetchdex || {},
            allowFallback: data?.allowFallback || false,
            supportsSolana: data?.supportsSolana || false,
            isMetaDex: data?.isMetaDex || false,
            isBackendProvider: data?.isBackendProvider || false,
            raw: data
        };
    });
    return map;
}

// Final execution of builders after all source objects are defined
const CHAIN_CONFIG = buildChainConfig(CONFIG_CHAINS, CONFIG_UI.CHAINS);
const CEX_CONFIG = buildCexConfig(CONFIG_CEX, CONFIG_UI.CEXES);
const DEX_CONFIG = buildDexConfig(CONFIG_DEXS, CONFIG_UI.DEXES);

// Final global exposure
try {
    if (typeof window !== 'undefined') {
        window.DEFAULT_RPC_SUGGESTIONS = window.DEFAULT_RPC_SUGGESTIONS || DEFAULT_RPC_SUGGESTIONS;
        window.CONFIG_CEX = CONFIG_CEX;
        window.CONFIG_CHAINS = CONFIG_CHAINS;
        window.CONFIG_DEXS = CONFIG_DEXS;
        window.CONFIG_UI = CONFIG_UI;
        window.CHAIN_CONFIG = CHAIN_CONFIG;
        window.CEX_CONFIG = CEX_CONFIG;
        window.DEX_CONFIG = DEX_CONFIG;
        window.CEXWallets = CONFIG_CHAINS;
        console.log('[CONFIG] All configurations built and exposed successfully');
    }
} catch (e) {
    console.error('[CONFIG] Critical error during configuration initialization:', e);
}

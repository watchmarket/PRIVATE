const CONFIG_APP = {
    APP: {
        NAME: "APP PRIVATE",
        VERSION: "2026.02.25",
        SCAN_LIMIT: false,
        AUTORUN: true,
        AUTO_VOLUME: true,   // Set false untuk menyembunyikan & menonaktifkan fitur auto volume
        VOL_CHECK: true,
        META_DEX: false,     // Set true untuk menghidupkan fitur META-DEX aggregator (LIFI, DZAP, Rubic, Rango)
        DEBUG_LOG: false,   // ✅ PERF: Set true untuk aktifkan debug logging (default: false untuk performance)
    },
    // ✅ META-DEX Configuration - Control meta-aggregator availability
    // Meta-aggregators: LIFI, DZAP, Rubic, Rango (EVM chains only)
    META_DEX_CONFIG: {
        enabled: true,  // Master toggle (synced with APP.META_DEX)
        aggregators: ['lifi', 'dzap', 'rubic', 'rango'],  // Available meta-aggregators
        supportedChains: ['bsc', 'ethereum', 'polygon', 'arbitrum', 'base'],  // EVM only - Solana uses different aggregators
    }
    // ✅ Global fallback removed - each DEX now has explicit primary/alternative configuration
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
        ICON: "assets/icons/cex/gate.png",
        WARNA: "#D5006D",  // Pink tua
        LINKS: {
            tradeToken: ({ token }) => `https://www.gate.com/trade/${String(token || '').toUpperCase()}_USDT`,
            tradePair: ({ pair }) => `https://www.gate.com/trade/${String(pair || '').toUpperCase()}_USDT`,
            withdraw: ({ token }) => `https://www.gate.com/myaccount/withdraw/${String(token || '').toUpperCase()}`,
            deposit: ({ pair }) => `https://www.gate.com/myaccount/deposit/${String(pair || '').toUpperCase()}`
        },
        ORDERBOOK: {
            urlTpl: ({ symbol }) => `https://api.gateio.ws/api/v4/spot/order_book?limit=5&currency_pair=${String(symbol || '')}_USDT`,
            parser: 'standard' // use standard orderbook parser
        }
    },
    BINANCE: {
        ICON: "assets/icons/cex/binance.png",
        WARNA: "#e0a50c",  // Orange tua
        LINKS: {
            tradeToken: ({ token }) => `https://www.binance.com/en/trade/${String(token || '').toUpperCase()}_USDT`,
            tradePair: ({ pair }) => `https://www.binance.com/en/trade/${String(pair || '').toUpperCase()}_USDT`,
            withdraw: ({ token }) => `https://www.binance.com/en/my/wallet/account/main/withdrawal/crypto/${String(token || '').toUpperCase()}`,
            deposit: ({ pair }) => `https://www.binance.com/en/my/wallet/account/main/deposit/crypto/${String(pair || '').toUpperCase()}`
        },
        ORDERBOOK: {
            urlTpl: ({ symbol }) => `https://api.binance.me/api/v3/depth?limit=5&symbol=${String(symbol || '')}USDT`,
            parser: 'standard'
        }
    },
    MEXC: {
        ICON: "assets/icons/cex/mexc.png",
        WARNA: "#1448ce",  // Biru muda
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
    KUCOIN: {
        ICON: "assets/icons/cex/kucoin.png",
        WARNA: "#29b3af",
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
        ICON: "assets/icons/cex/bitget.png",
        WARNA: "#1aaaba",
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
    BYBIT: {
        ICON: "assets/icons/cex/bybit.png",
        WARNA: "#f29900",
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
    INDODAX: {
        ICON: "assets/icons/cex/indodax.png",
        WARNA: "#1285b5",
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
    // LBANK: {
    //     WARNA: "#3461ff",  // Blue LBank color
    //     LINKS: {
    //         tradeToken: ({ token }) => `https://www.lbank.com/trade/${String(token || '').toLowerCase()}_usdt`,
    //         tradePair: ({ pair }) => `https://www.lbank.com/trade/${String(pair || '').toLowerCase()}_usdt`,
    //         // Withdraw: https://www.lbank.com/wallet/account/main/withdrawal/crypto/{token}
    //         withdraw: ({ token }) => `https://www.lbank.com/wallet/account/main/withdrawal/crypto/${String(token || '').toLowerCase()}`,
    //         // Deposit: https://www.lbank.com/wallet/account/main/deposit/crypto/{token} (user pilih network di halaman)
    //         deposit: ({ token }) => `https://www.lbank.com/wallet/account/main/deposit/crypto/${String(token || '').toLowerCase()}`
    //     },
    //     ORDERBOOK: {
    //         // Menggunakan domain resmi api.lbkex.com (bukan .info)
    //         // Ref: https://github.com/LBank-exchange/lbank-official-api-docs/blob/master/API-For-Spot-EN/Market%20REST%20API.md
    //         urlTpl: ({ symbol }) => `https://api.lbkex.com/v1/depth.do?symbol=${String(symbol || '').toLowerCase()}_usdt&size=5`,
    //         parser: 'standard'  // LBank response format: { asks: [[p,q], ...], bids: [[p,q], ...] }
    //     }
    // },
    HTX: {
        ICON: "assets/icons/cex/htx.png",
        WARNA: "#008cd6",  // HTX Blue color
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
    OKX: {
        ICON: "assets/icons/cex/okx.png",
        WARNA: "#000000",
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
        Kode_Chain: 56, Nama_Chain: "bsc", Nama_Pendek: "bsc", URL_Chain: "https://bscscan.com", WARNA: "#f0af18", ICON: "assets/icons/chains/bsc.png", DATAJSON: 'https://watchmarket.github.io/JSON/SNAPSHOT_koin_BSC.json', BaseFEEDEX: "BNBUSDT", GASLIMIT: 80000,
        LINKS: {
            explorer: {
                token: (address) => `https://bscscan.com/token/${address}`,
                address: (address) => `https://bscscan.com/address/${address}`,
                tx: (hash) => `https://bscscan.com/tx/${hash}`
            }
        },
        DEXS: ["kyber", "sushi", "okx", "relay", "flytrade", "odos", "velora", "matcha"],  // ✅ Removed Meta-DEX: lifi, rubic, rango
        WALLET_CEX: {
            GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chainCEX: 'BSC' },
            BINANCE: { address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3', address2: '0xe2fc31F816A9b94326492132018C3aEcC4a93aE1', chainCEX: 'BSC' },
            MEXC: { address: '0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB', chainCEX: 'BSC' },
            INDODAX: { address: '0xaBa3002AB1597433bA79aBc48eeAd54DC10A45F2', address2: '0x3C02290922a3618A4646E3BbCa65853eA45FE7C6', chainCEX: 'BSC' },
            KUCOIN: { address: '0x58edF78281334335EfFa23101bBe3371b6a36A51', address2: '0xD6216fC19DB775Df9774a6E33526131dA7D19a2c', chainCEX: 'BEP20' },
            BITGET: { address: '0x0639556F03714A74a5fEEaF5736a4A64fF70D206', address2: '0xBDf5bAfEE1291EEc45Ae3aadAc89BE8152D4E673', address3: '0x1AB4973a48dc892Cd9971ECE8e01DcC7688f8F23', chainCEX: 'BEP20' },
            BYBIT: { address: '0xf89d7b9c864f589bbf53a82105107622b35eaa40', chainCEX: 'BSC' },
            // LBANK: { address: '0x120051a72966950B8ce12eB5496B5D1eEEC1541B', chainCEX: 'BSC' },
            HTX: { address: '0xafdfd157d9361e621e476036FEE62f688450692B', address2: '0xdd3CB5c974601BC3974d908Ea4A86020f9999E0c', chainCEX: 'BSC' },
            OKX: { address: '0xA0420C29B214d09b9ec751aa1f592c7b1fa77dA3', chainCEX: 'BNB Chain' },
        },
        PAIRDEXS: {
            "BNB": { symbolPair: "BNB", scAddressPair: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", desPair: "18" },
            "USDT": { symbolPair: "USDT", scAddressPair: "0x55d398326f99059fF775485246999027B3197955", desPair: "18" },
            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        }
    },
    polygon: {
        Kode_Chain: 137,
        Nama_Chain: "polygon",
        Nama_Pendek: "poly",
        URL_Chain: "https://polygonscan.com",
        ICON: "assets/icons/chains/polygon.png",
        WARNA: "#cd72f4ff",
        DATAJSON: 'https://watchmarket.github.io/JSON/SNAPSHOT_koin_POLYGON.json',
        BaseFEEDEX: "MATICUSDT", // Corrected from POLUSDT
        GASLIMIT: 80000,
        DEXS: ["kyber", "sushi", "okx", "relay", "flytrade", "odos", "velora", "matcha"],   // ✅ Removed Meta-DEX: lifi, rubic, rango
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
        Kode_Chain: 42161, Nama_Chain: "arbitrum", Nama_Pendek: "arb", URL_Chain: "https://arbiscan.io", WARNA: "#a6b0c3", ICON: "assets/icons/chains/arbitrum.png", DATAJSON: 'https://watchmarket.github.io/JSON/SNAPSHOT_koin_ARBITRUM.json', BaseFEEDEX: "ETHUSDT", GASLIMIT: 100000,
        LINKS: {
            explorer: {
                token: (address) => `https://arbiscan.io/token/${address}`,
                address: (address) => `https://arbiscan.io/address/${address}`,
                tx: (hash) => `https://arbiscan.io/tx/${hash}`
            }
        },
        DEXS: ["kyber", "sushi", "okx", "relay", "flytrade", "odos", "velora", "matcha"],
        WALLET_CEX: {
            GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chainCEX: 'ARBITRUM' },
            BINANCE: { address: '0x290275e3db66394C52272398959845170E4DCb88', address2: '0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245', chainCEX: 'ARBITRUM' },
            MEXC: { address: '0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB', chainCEX: 'ARB' },
            KUCOIN: { address: '0x03E6FA590CAdcf15A38e86158E9b3D06FF3399Ba', chainCEX: 'ARBITRUM' },
            BITGET: { address: '0x5bdf85216ec1e38d6458c870992a69e38e03f7ef', chainCEX: 'ArbitrumOne' },
            BYBIT: { address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', chainCEX: 'Arbitrum One' },
            // LBANK: { address: '0x120051a72966950B8ce12eB5496B5D1eEEC1541B', chainCEX: 'ARBITRUM' },
            HTX: { address: '0x82D015d74670d8645b56c3f453398a3E799Ee582', chainCEX: 'ARBITRUM' },
            OKX: { address: '0xAfEE421482FAEa92292ED3ffE29371742542AD72', chainCEX: 'Arbitrum One' },
        },
        PAIRDEXS: {
            "ETH": { symbolPair: 'ETH', scAddressPair: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', desPair: '18' },
            "USDT": { symbolPair: 'USDT', scAddressPair: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', desPair: '6' },
            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        },
    },
    ethereum: {
        Kode_Chain: 1, Nama_Chain: "ethereum", Nama_Pendek: "erc", URL_Chain: "https://etherscan.io", WARNA: "#8098ee", ICON: "assets/icons/chains/ethereum.png", DATAJSON: 'https://watchmarket.github.io/JSON/SNAPSHOT_koin_ETHEREUM.json', BaseFEEDEX: "ETHUSDT", GASLIMIT: 250000,
        LINKS: {
            explorer: {
                token: (address) => `https://etherscan.io/token/${address}`,
                address: (address) => `https://etherscan.io/address/${address}`,
                tx: (hash) => `https://etherscan.io/tx/${hash}`
            }
        },
        DEXS: ["kyber", "sushi", "okx", "relay", "flytrade", "odos", "velora", "matcha"],
        WALLET_CEX: {
            GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chainCEX: 'ETH' },
            BINANCE: { address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d', address2: '0x28C6c06298d514Db089934071355E5743bf21d60', address3: '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', chainCEX: 'ETH' },
            INDODAX: { address: '0x3C02290922a3618A4646E3BbCa65853eA45FE7C6', address2: '0x91Dca37856240E5e1906222ec79278b16420Dc92', chainCEX: 'ETH' },
            MEXC: { address: '0x75e89d5979E4f6Fba9F97c104c2F0AFB3F1dcB88', address2: '0x9642b23Ed1E01Df1092B92641051881a322F5D4E', chainCEX: 'ETH' },
            KUCOIN: { address: '0x58edF78281334335EfFa23101bBe3371b6a36A51', address2: '0xD6216fC19DB775Df9774a6E33526131dA7D19a2c', chainCEX: 'ERC20' },
            BITGET: { address: '0x0639556F03714A74a5fEEaF5736a4A64fF70D206', address2: '0x51971c86b04516062c1e708CDC048CB04fbe959f', address3: '0xBDf5bAfEE1291EEc45Ae3aadAc89BE8152D4E673', chainCEX: 'ERC20' },
            BYBIT: { address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', address2: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', chainCEX: 'Ethereum' },
            // LBANK: { address: '0x120051a72966950B8ce12eB5496B5D1eEEC1541B', chainCEX: 'erc20' },
            HTX: { address: '0xa03400E098F4421b34a3a44A1B4e571419517687', chainCEX: 'ETH' },
            OKX: { address: '0x91D40E4818F4D4C57b4578d9ECa6AFc92aC8DEbE', chainCEX: 'Ethereum' },
        },
        PAIRDEXS: {
            "ETH": { symbolPair: 'ETH', scAddressPair: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', desPair: '18' },
            "USDT": { symbolPair: 'USDT', scAddressPair: '0xdAC17F958D2ee523a2206206994597C13D831ec7', desPair: '6' },
            "BNT": { symbolPair: 'BNT', scAddressPair: '0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C', desPair: '18' },
            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        }
    },

    base: {
        Kode_Chain: 8453, Nama_Chain: "base", Nama_Pendek: "base", URL_Chain: "https://basescan.org/", WARNA: "#1e46f9", ICON: "assets/icons/chains/base.png", DATAJSON: 'https://watchmarket.github.io/JSON/SNAPSHOT_koin_BASE.json', BaseFEEDEX: "ETHUSDT", GASLIMIT: 100000,
        LINKS: {
            explorer: {
                token: (address) => `https://basescan.org/token/${address}`,
                address: (address) => `https://basescan.org/address/${address}`,
                tx: (hash) => `https://basescan.org/tx/${hash}`
            }
        },
        DEXS: ["kyber", "sushi", "okx", "relay", "flytrade", "odos", "velora", "matcha"],
        WALLET_CEX: {
            GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chainCEX: 'BASE' },
            BINANCE: { address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d', address2: '0x28C6c06298d514Db089934071355E5743bf21d60', chainCEX: 'BASE' },
            MEXC: { address: '0x4e3ae00E8323558fA5Cac04b152238924AA31B60', chainCEX: 'BASE' },
            INDODAX: { address: '0x3C02290922a3618A4646E3BbCa65853eA45FE7C6', address2: '0x91Dca37856240E5e1906222ec79278b16420Dc92', chainCEX: 'POLYGON' },
            KUCOIN: { address: '0x58edF78281334335EfFa23101bBe3371b6a36A51', address2: '0xD6216fC19DB775Df9774a6E33526131dA7D19a2c', chainCEX: 'Base' },
            BITGET: { address: '0x0639556F03714A74a5fEEaF5736a4A64fF70D206', address2: '0x51971c86b04516062c1e708CDC048CB04fbe959f', address3: '0xBDf5bAfEE1291EEc45Ae3aadAc89BE8152D4E673', chainCEX: 'BASE' },
            BYBIT: { address: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', address2: '0xf89d7b9c864f589bbF53a82105107622B35EaA40', chainCEX: 'Base Mainnet' },
            //  LBANK: { address: '0x120051a72966950B8ce12eB5496B5D1eEEC1541B', chainCEX: 'BASE' },
            HTX: { address: '0x7A8bA143F8866242782E5b3A5Ad1410Bb6722206', chainCEX: 'BASE' },
            OKX: { address: '', chainCEX: 'Base' },
        },
        PAIRDEXS: {
            "ETH": { symbolPair: 'ETH', scAddressPair: '0x4200000000000000000000000000000000000006', desPair: '18' },
            "USDC": { symbolPair: 'USDC', scAddressPair: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', desPair: '6' },
            "NON": { symbolPair: "NON", scAddressPair: "0x", desPair: "18" }
        }
    },
    solana: {
        Kode_Chain: 501,
        LIFI_CHAIN_ID: 1151111081099710, // LIFI uses different chain ID for Solana
        DZAP_CHAIN_ID: 7565164, // DZAP uses different chain ID for Solana
        MATCHA_CHAIN_ID: 1399811149, // Matcha/0x uses different chain ID for Solana
        Nama_Chain: "solana",
        Nama_Pendek: "sol",
        URL_Chain: "https://solscan.io/",
        WARNA: "#7508a0ff",
        ICON: "assets/icons/chains/solana.png",
        DATAJSON: 'https://watchmarket.github.io/JSON/SNAPSHOT_koin_SOLANA.json',
        BaseFEEDEX: "SOLUSDT",
        GASLIMIT: 5000, // Solana uses compute units
        LINKS: {
            explorer: {
                token: (address) => `https://solscan.io/token/${address}`,
                address: (address) => `https://solscan.io/account/${address}`,
                tx: (hash) => `https://solscan.io/tx/${hash}`
            }
        },
        DEXS: ["matcha", "okx", "jupiter"],  // ✅ DFlow requires API key - enable manually if you have one
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
    }
};

const CONFIG_UI = {
    CEXES: [
        { key: 'BINANCE', label: 'Binance', short: 'BINC', badgeClass: 'bg-binance' },
        { key: 'MEXC', label: 'MEXC', short: 'MEXC', badgeClass: 'bg-mexc' },
        { key: 'GATE', label: 'Gateio', short: 'GATE', badgeClass: 'bg-gateio' },
        { key: 'BYBIT', label: 'Bybit', short: 'BYBT', badgeClass: 'bg-bybit' },
        { key: 'BITGET', label: 'Bitget', short: 'BITG', badgeClass: 'bg-bitget' },
        { key: 'KUCOIN', label: 'KuCoin', short: 'KUCN', badgeClass: 'bg-kucoin' },
        { key: 'INDODAX', label: 'INDODAX', short: 'INDX', badgeClass: 'bg-indodax' },
        { key: 'HTX', label: 'HTX', short: 'HTX', badgeClass: 'bg-htx' },
        { key: 'OKX', label: 'OKX', short: 'OKX', badgeClass: 'bg-okx' }
        //  { key: 'LBANK', label: 'LBank', short: 'LBNK', badgeClass: 'bg-lbank' }
    ],
    DEXES: [
        { key: 'kyber', label: 'KyberSwap', badgeClass: 'bg-kyberswap', fallbackSlug: 'kyberswap' },
        { key: 'sushi', label: 'SUSHI', badgeClass: 'bg-sushi', fallbackSlug: 'sushi' },
        { key: 'lifi', label: 'LIFI', badgeClass: 'bg-lifi', fallbackSlug: 'lifi' },
        { key: 'okx', label: 'OKX', badgeClass: 'bg-okx', fallbackSlug: 'okx' },
        { key: 'relay', label: 'Relay', badgeClass: 'bg-relay', fallbackSlug: 'relay' },
        { key: 'odos', label: 'ODOS', badgeClass: 'bg-odos', fallbackSlug: 'odos', skipDelay: true },
        { key: 'velora', label: 'Velora', badgeClass: 'bg-velora', fallbackSlug: 'velora' },
        { key: 'matcha', label: 'Matcha', badgeClass: 'bg-matcha', fallbackSlug: 'matcha' },
        { key: 'flytrade', label: 'Flytrade', badgeClass: 'bg-flytrade', fallbackSlug: 'flytrade' },
        { key: 'jupiter', label: 'Jupiter', badgeClass: 'bg-jupiter', fallbackSlug: 'jupiter' },
        { key: 'dflow', label: 'DFlow', badgeClass: 'bg-dflow', fallbackSlug: 'dflow' },
        { key: 'kamino', label: 'Kamino', badgeClass: 'bg-kamino', fallbackSlug: 'kamino' },
        { key: 'rubic', label: 'Rubic', badgeClass: 'bg-rubic', fallbackSlug: 'rubic' },
        { key: 'rango', label: 'Rango', badgeClass: 'bg-rango', fallbackSlug: 'rango' }
    ],

    // ========== Scanner Behavioral Settings ==========
    // Single source of truth for scanner timing and behavior configuration
    // Priority: User localStorage > Config defaults > Hardcoded fallback
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
        // Based on official API documentation and rate limits:
        // - KyberSwap: 60 req/min, fast API
        // - 0x/Matcha: <250ms median response, 10 RPS per chain
        // - ODOS: 1-2 RPS (public), can have timeouts
        // - Jupiter: 10 RPS (public), fast Solana
        // - LI.FI: 200 req/min (authenticated), cross-chain needs more time
        // =========================================================
        timeout: {
            // ========== Official DEX APIs ==========
            // Fast APIs - optimized for quick scanning (500+ coins)
            'kyber': 3000,           // KyberSwap: 3s (60 req/min, fast API)
            'velora6': 4000,         // Velora v6.2: 4s (ParaSwap based)
            'velora5': 4000,         // Velora v5: 4s (ParaSwap v5 API fallback)
            'matcha': 3500,          // Matcha/0x: 3.5s (<250ms median, but allow buffer)
            'delta-matcha': 3500,    // 1Delta Matcha: 3.5s (proxy to 0x)
            'okx': 4000,             // OKX DEX: 4s
            'relay': 5000,           // Relay: 5s (cross-chain bridge)
            'flytrade': 4000,        // Flytrade: 4s
            'sushi': 4000,           // SushiSwap: 4s

            // ODOS Family - slower API, needs more time (1-2 RPS limit)
            'odos': 5000,            // ODOS: 5s (1 RPS public limit, can timeout)
            'odos2': 5000,           // ODOS v2: 5s
            'odos3': 5000,           // ODOS v3: 5s
            'hinkal-odos': 4000,     // Hinkal ODOS Proxy: 4s (typically faster)

            // ========== Solana DEXes ==========
            // Fast Solana APIs
            'jupiter': 3000,         // Jupiter: 3s (10 RPS, fast Solana)
            'dflow': 3000,           // DFlow: 3s (Solana fast)

            // ========== Filtered Strategies (Wildcard) ==========
            // Meta-aggregators filtered for specific DEX
            'lifi-*': 6000,          // LIFI filtered: 6s (cross-chain, needs time)
            'swoop-*': 10000,        // SWOOP filtered: 10s (railway.app slower, prevent cancel)
            'swing-*': 6000,         // SWING filtered: 6s
            'dzap-*': 6000,          // DZAP filtered: 6s (WARNING: 429 rate limit issues)
            'rango-*': 6000,         // Rango filtered: 6s (WARNING: 403 forbidden issues)
            'rubic-*': 6000,         // Rubic filtered: 6s

            // ========== Multi-DEX Aggregators ==========
            // Direct calls to meta-aggregators (not filtered)
            'lifi': 6000,            // LIFI multi-quote: 6s
            'swoop': 10000,          // SWOOP multi-quote: 10s (railway.app needs more time)
            'swing': 6000,           // SWING multi-quote: 6s
            'dzap': 6000,            // DZAP multi-quote: 6s
            'rango': 6000,           // Rango multi-quote: 6s
            'rubic': 6000,           // Rubic multi-quote: 6s
            'kamino': 5000,          // Kamino (Solana): 5s

            // ========== Default Fallback ==========
            'default': 5000          // Default: 5s (balanced)
        },

        // Per-DEX overrides (optional)
        // If a DEX needs special timing, override here
        dexOverrides: {
            // Example: ODOS is fast, can reduce delay
            odos: {
                delayPerDexDirection: 50    // ODOS is fast, less delay needed
            }
            // Example: Add more DEX-specific overrides as needed
            // okx: { delayPerDexDirection: 300, timeoutCount: 15000 }
        },

        // Validation rules for settings
        validation: {
            tokensPerBatch: { min: 1, max: 10 },
            delayBetweenGrup: { min: 100, max: 5000 },
            delayPerDexDirection: { min: 0, max: 2000 },
            delayPerToken: { min: 0, max: 2000 },
            snapshotBatchDelay: { min: 100, max: 2000 },
            snapshotRequestDelay: { min: 50, max: 1000 }
        }
    },

    CHAINS: [
        { key: 'polygon', label: 'Polygon', short: 'POLY', badgeClass: 'bg-success text-light' },
        { key: 'arbitrum', label: 'Arbitrum', short: 'ARB', badgeClass: 'bg-info text-dark' },
        { key: 'ethereum', label: 'Ethereum', short: 'ETH', badgeClass: 'bg-primary text-light' },
        { key: 'bsc', label: 'BSC', short: 'BSC', badgeClass: 'bg-warning text-dark' },
        { key: 'base', label: 'Base', short: 'BASE', badgeClass: 'bg-dark text-light' },
        { key: 'solana', label: 'Solana', short: 'SOL', badgeClass: 'bg-solana text-dark' }
    ]
};

function buildChainConfig(chainSource = {}, uiChains = []) {
    const uiByKey = {};
    (Array.isArray(uiChains) ? uiChains : []).forEach(item => {
        if (!item || !item.key) return;
        uiByKey[String(item.key).toLowerCase()] = {
            label: item.label,
            short: item.short,
            badgeClass: item.badgeClass
        };
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
            badgeClass: ui.badgeClass || 'bg-dark text-light',
            // RPC removed - use RPCManager.getRPC(chainKey) instead
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

const CHAIN_CONFIG = buildChainConfig(CONFIG_CHAINS, CONFIG_UI.CHAINS);

// CONFIG_DEXS moved to dex-config.js to avoid duplication and keep this file data-centric

// Expose globals for runtime consumers (registry/services)
window.DEFAULT_RPC_SUGGESTIONS = window.DEFAULT_RPC_SUGGESTIONS || DEFAULT_RPC_SUGGESTIONS;
window.CONFIG_CEX = window.CONFIG_CEX || CONFIG_CEX;
window.CONFIG_CHAINS = window.CONFIG_CHAINS || CONFIG_CHAINS;
window.CONFIG_UI = window.CONFIG_UI || CONFIG_UI;
window.CHAIN_CONFIG = window.CHAIN_CONFIG || CHAIN_CONFIG;
window.CEXWallets = window.CEXWallets || CONFIG_CHAINS;

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

// DEX builder config (moved from dex-config.js)
/**
 * PANDUAN KONFIGURASI fetchdex:
 *
 * - tokentopair: Strategi untuk CEX → DEX (Actionkiri: beli token di exchanger, swap token ke pair di DEX)
 * - pairtotoken: Strategi untuk DEX → CEX (ActionKanan: swap pair ke token di DEX, jual token ke exchanger)
 *
 * ========================================
 * 2 MODE FETCH DEX:
 * ========================================
 *
 * MODE 1: ALTERNATIVE (Fallback on Error)
 * - Primary dipanggil terlebih dahulu
 * - Alternative HANYA dipanggil jika primary gagal (error 429, 500+, atau timeout)
 * - Contoh config:
 *   fetchdex: {
 *       primary: { tokentopair: 'kyber', pairtotoken: 'kyber' },
 *       alternative: { tokentopair: 'lifi-kyber', pairtotoken: 'swoop-kyber' }
 *   }
 *
 * MODE 2: SECONDARY (Rotation/Bergantian)
 * - Primary dan secondary bergantian dipanggil (odd=primary, even=secondary)
 * - Request 1, 3, 5... → primary
 * - Request 2, 4, 6... → secondary
 * - Jika yang dipilih gagal, fallback ke yang lain
 * - Contoh config:
 *   fetchdex: {
 *       primary: { tokentopair: 'odos3', pairtotoken: 'hinkal-odos' },
 *       secondary: { tokentopair: 'lifi-odos', pairtotoken: 'swoop-odos' }
 *   }
 *
 * ========================================
 * FALLBACK POLICY:
 * ========================================
 * - allowFallback: true/false - izinkan fallback ke alternative/secondary
 * - Jika false, error langsung dikembalikan tanpa mencoba strategi lain
 */
const CONFIG_DEXS = {
    kyber: {
        label: 'KyberSwap',
        badgeClass: 'bg-kyberswap',
        warna: "#0b7e18ff", // hijau tosca KyberSwap
        builder: ({ chainName, tokenAddress, pairAddress }) =>
            `https://kyberswap.com/swap/${chainName}/${tokenAddress}-to-${pairAddress}`,
        // ⚡ ROTATION STRATEGY: Alternate between official API and filtered aggregators
        fetchdex: {
            primary: {
                tokentopair: 'kyber',          // CEX→DEX: Official KyberSwap API
                pairtotoken: 'kyber'           // DEX→CEX: Official KyberSwap API
            },
            secondary: {
                tokentopair: 'lifi-kyber',     // CEX→DEX: LIFI filtered (rotation)
                pairtotoken: 'swoop-kyber'     // DEX→CEX: SWOOP filtered (rotation)
            }
        },
        allowFallback: true,  // ✅ Enable rotation between primary and alternative
    },
    sushi: {
        label: 'SUSHI',
        badgeClass: 'bg-sushi',
        proxy: true, // ✅ Enable proxy - SushiSwap API may have CORS restrictions
        warna: "#f085b7ff", // Pink/magenta SushiSwap brand color
        builder: ({ chainName, tokenAddress, pairAddress, swapAmount }) =>
            `https://www.sushi.com/${chainName}/swap?token0=${tokenAddress}&token1=${pairAddress}${swapAmount ? `&swapAmount=${swapAmount}` : ''}`,
        // ⚡ ROTATION STRATEGY: Alternate between different aggregators
        fetchdex: {
            primary: {
                tokentopair: 'sushi',     // CEX→DEX: LIFI filtered
                pairtotoken: 'sushi'     // DEX→CEX: SWOOP filtered
            },
            alternative: {
                tokentopair: 'sushi',    // CEX→DEX: Rango filtered (rotation)
                pairtotoken: 'sushi'     // DEX→CEX: Rubic filtered (rotation)
            }
        },
        allowFallback: false,  // ✅ Enable rotation between primary and alternative
    },
    okx: {
        label: 'OKXDEX',
        badgeClass: 'bg-okxdex',
        disabled: false, // ✅ ENABLED - OKX DEX Aggregator active
        supportsSolana: true,  // OKX DEX supports Solana
        warna: "#000000",
        builder: ({ chainCode, tokenAddress, pairAddress }) =>
            `https://www.okx.com/web3/dex-swap?inputChain=${chainCode}&inputCurrency=${tokenAddress}&outputChain=${chainCode}&outputCurrency=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'okx',           // CEX→DEX: Official OKX DEX API
                pairtotoken: 'okx'            // DEX→CEX: Official OKX DEX API
            },
            alternative: {
                tokentopair: 'okx',      // CEX→DEX: LIFI filtered (rotation)
                pairtotoken: 'okx'      // DEX→CEX: SWOOP filtered (rotation)
            }
        },
        allowFallback: true, // ✅ Enable rotation between primary and alternative
    },

    relay: {
        label: 'Relay',
        badgeClass: 'bg-relay',
        disabled: false, // ✅ ENABLED - Cross-chain bridge & swap aggregator
        warna: "#160783ff",  // Purple - Relay brand color
        builder: ({ chainName, chainCode, tokenAddress, pairAddress }) =>
            `https://relay.link/bridge/${String(chainName || '').toLowerCase()}?fromChainId=${chainCode}&fromCurrency=${tokenAddress}&toCurrency=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'relay',          // CEX→DEX: Direct Relay API
                pairtotoken: 'relay'           // DEX→CEX: Direct Relay API
            },
            alternative: {
                tokentopair: 'relay',     // CEX→DEX: LIFI filtered (rotation)
                pairtotoken: 'relay'      // DEX→CEX: LIFI filtered (rotation)
            }
        },
        allowFallback: false,  // ✅ Enable rotation between primary and alternative
    },
    flytrade: {
        label: 'Flytrade',
        badgeClass: 'bg-flytrade',
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
                tokentopair: 'flytrade',       // CEX→DEX: Flytrade aggregator
                pairtotoken: 'flytrade'        // DEX→CEX: Flytrade aggregator
            },
            alternative: {
                tokentopair: 'flytrade',  // CEX→DEX: LIFI filtered (rotation)
                pairtotoken: 'flytrade'   // DEX→CEX: LIFI filtered (rotation)
            }
        },
        allowFallback: false,  // ✅ Enable rotation between primary and alternative
    },
    matcha: {
        label: 'Matcha',
        badgeClass: 'bg-matcha',
        proxy: true, // ✅ Enable proxy - 0x API has CORS restrictions for browser requests
        supportsSolana: true,  // Matcha supports Solana via 0x API
        warna: "#61ee73ff", // hitam abu-abu (Matcha/0x)
        builder: ({ chainName, tokenAddress, pairAddress, chainCode }) => {
            const isSolana = String(chainName || '').toLowerCase() === 'solana';
            if (isSolana) {
                const solChainId = 1399811149;
                return `https://matcha.xyz/tokens/solana/${tokenAddress}?buyChain=${solChainId}&buyAddress=${pairAddress}&sellChain=${solChainId}&sellAddress=${tokenAddress}`;
            }
            return `https://matcha.xyz/tokens/${chainName}/${String(tokenAddress || '').toLowerCase()}?buyChain=${chainCode}&buyAddress=${String(pairAddress || '').toLowerCase()}`;
        },
        // ⚡ CHAIN-SPECIFIC STRATEGY: Solana uses direct endpoint, EVM uses proxies
        fetchdex: {
            primary: {
                tokentopair: 'delta-matcha',   // CEX→DEX: 1Delta proxy (fast, free) - EVM only
                pairtotoken: 'swoop-matcha'    // DEX→CEX: SWOOP filtered - EVM only
            },
            alternative: {
                tokentopair: 'matcha',    // CEX→DEX: Direct Matcha API (Solana) or fallback (EVM)
                pairtotoken: 'matcha'     // DEX→CEX: Direct Matcha API (Solana) or fallback (EVM)
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
        warna: "#6e2006ff", // ungu-biru Odos
        builder: () => `https://app.odos.xyz`,
        // ⚡ MODE: SECONDARY (Rotation) - bergantian antara primary dan secondary
        fetchdex: {
            primary: {
                tokentopair: 'odos3',          // CEX→DEX: Official ODOS v3 API (request ganjil)
                pairtotoken: 'hinkal-odos'     // DEX→CEX: Hinkal ODOS proxy (request ganjil)
            },
            secondary: {                       // ✅ ROTATION: bergantian dengan primary
                tokentopair: 'lifi-odos',      // CEX→DEX: LIFI filtered (request genap)
                pairtotoken: 'swoop-odos'      // DEX→CEX: SWOOP filtered (request genap)
            }
        },
        allowFallback: true,  // ✅ Jika yang dipilih gagal, coba yang lain
    },
    // ============ DISABLED DEXes ============

    velora: {
        label: 'Velora',
        badgeClass: 'bg-velora',
        warna: "#1c64f2ff",
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
                pairtotoken: 'velora5'         // DEX→CEX: Official Velora v6.2
            },
            alternative: {
                tokentopair: 'swing-velora',   // CEX→DEX: SWING filtered (rotation)
                pairtotoken: 'swoop-velora'         // DEX→CEX: Velora v5 (ParaSwap v5 API fallback)
            }
        },
        allowFallback: true,  // ✅ Enable rotation between primary and alternative
    },


    // ============ SOLANA DEXes ============
    jupiter: {
        label: 'Jupiter',
        badgeClass: 'bg-jupiter',
        supportsSolana: true,  // Solana-only DEX
        warna: "#a0df3bff", // Jupiter green
        builder: ({ tokenAddress, pairAddress }) =>
            `https://jup.ag/?sell=${tokenAddress}&buy=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'jupiter',    // CEX→DEX: Jupiter aggregator (Solana)
                pairtotoken: 'jupiter'     // DEX→CEX: Jupiter aggregator (Solana)
            }
        },
        allowFallback: false // Jupiter is the main Solana DEX aggregator
    },

    dflow: {
        label: 'DFlow',
        badgeClass: 'bg-dflow',
        supportsSolana: true,  // Solana-only DEX
        proxy: false, // No CORS proxy needed
        warna: "#00d4aa", // DFlow teal/cyan
        builder: ({ tokenAddress, pairAddress }) =>
            `https://dflow.net/?sendToken=${tokenAddress}&receiveToken=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'dflow',    // CEX→DEX: DFlow aggregator (Solana)
                pairtotoken: 'dflow'     // DEX→CEX: DFlow aggregator (Solana)
            }
        },
        allowFallback: false // DFlow is a Solana DEX aggregator
    },

    kamino: {
        label: 'Kamino',
        badgeClass: 'bg-kamino',
        proxy: true,
        warna: "#7c3aed", // Kamino purple
        isMetaDex: true,  // ✅ META-DEX: Mark as meta-aggregator (Solana only)
        isMultiDex: true, // ⭐ Multi-DEX aggregator like LIFI/DZAP
        builder: ({ tokenAddress, pairAddress }) =>
            `https://app.kamino.finance/liquidity/swap?tokenIn=${tokenAddress}&tokenOut=${pairAddress}`,
        fetchdex: {
            primary: {
                tokentopair: 'kamino',    // CEX→DEX: Kamino aggregator (Solana only)
                pairtotoken: 'kamino'     // DEX→CEX: Kamino aggregator (Solana only)
            }
        },
        allowFallback: false // Kamino is Solana-specific multi-DEX aggregator
    },

    // ============ REST API PROVIDERS (Single-Quote) ============
    lifi: {
        label: 'LIFI',
        badgeClass: 'bg-lifi',
        disabled: false, // ✅ ENABLED - LIFI as REST API provider
        warna: "#ea4aaa", // LIFI pink
        isMetaDex: true,  // ✅ META-DEX: Mark as meta-aggregator
        evmOnly: true,    // ✅ META-DEX: EVM chains only (Solana uses different aggregators)
        // ❌ REMOVED: isMultiDex - LIFI is now a REST API provider (single-quote)
        builder: ({ chainCode, tokenAddress, pairAddress }) => {
            return `https://jumper.exchange/?fromChain=${chainCode}&fromToken=${tokenAddress}&toChain=${chainCode}&toToken=${pairAddress}`;
        },
        fetchdex: {
            primary: {
                tokentopair: 'lifi',      // CEX→DEX: LIFI REST API provider
                pairtotoken: 'lifi'       // DEX→CEX: LIFI REST API provider
            }
        },
        allowFallback: false,
    },

    // ============ META-AGGREGATORS (Multi-Quote) ============
    // Rubic and Rango return multiple quotes from different DEX providers
    // These are only available on EVM chains when META_DEX is enabled
    rubic: {
        label: 'Rubic',
        badgeClass: 'bg-rubic',
        disabled: false,
        proxy: true,  // Enable CORS proxy to avoid 429 errors
        warna: "#7c3aed",  // Rubic purple
        isMetaDex: true,  // ✅ META-DEX: Mark as meta-aggregator
        evmOnly: true,    // ✅ META-DEX: EVM chains only
        isMultiDex: true, // Returns multiple quotes from different providers
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
        label: 'Rango',
        badgeClass: 'bg-rango',
        disabled: false,
        proxy: true,  // Enable CORS proxy
        warna: "#00d4aa",  // Rango teal
        isMetaDex: true,  // ✅ META-DEX: Mark as meta-aggregator
        evmOnly: true,    // ✅ META-DEX: EVM chains only
        isMultiDex: true, // Returns multiple quotes from different providers
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

};

try {
    if (typeof window !== 'undefined') {
        window.CONFIG_DEXS = CONFIG_DEXS;
        // Debug: verify isMultiDex is set correctly
        console.log('[CONFIG] CONFIG_DEXS loaded successfully');
    }
} catch (_) { }

// Centralized chain synonyms mapping used to normalize CEX network labels
const CHAIN_SYNONYMS = {
    ethereum: ['ETH', 'ERC20', 'ETHEREUM', 'USDTERC20', 'ETH-ERC20',
        'ERC-20', 'ETH MAINNET', 'ETHMAINNET', 'ETHEREUM MAINNET', 'Ethereum'],
    bsc: ['BSC', 'BEP20', 'BINANCE SMART CHAIN', 'BNB SMART CHAIN', 'BEP-20', 'BSCMAINNET',
        'BNB', 'BSCBEP20', 'BNB CHAIN', 'BNBCHAIN'],
    polygon: ['POLYGON', 'MATIC', 'POLYGON POS', 'POLYGON \\(MATIC\\)', 'POL', 'POLYGONPOS',
        'POLYGON_POS', 'POLYGONEVM', 'Polygon PoS'],
    arbitrum: ['ARBITRUM', 'ARB', 'ARBITRUM ONE', 'ARBEVM', 'ARBITRUMONE', 'ARB-ETH', 'ARBMAINNET',
        'ARBONE', 'ARBITRUMEVM', 'ARBI'],
    base: ['BASE', 'Base', 'BASE MAINNET', 'BASEEVM', 'BASEMAINNET',
        'BASE CHAIN', 'BASECHAIN'],
    solana: ['SOL', 'SOLANA', 'SPL', 'SOLANA MAINNET', 'SOLMAINNET',
        'SOLANA CHAIN', 'SOLCHAIN', 'SOLANASOL'],
    optimism: ['OPTIMISM', 'OP', 'OPTIMISM MAINNET', 'OPMAINNET',
        'OP MAINNET', 'OPEVM'],
    avalanche: ['AVAX', 'AVAXC', 'AVALANCHE', 'AVAX-C', 'C-CHAIN', 'AVAX C-CHAIN',
        'AVAXCCHAIN', 'AVALANCHE C-CHAIN'],
    tron: ['TRX', 'TRC20', 'TRON', 'USDTTRC20', 'TRX-TRC20',
        'TRC-20', 'TRON MAINNET'],
    fantom: ['FTM', 'FANTOM', 'FANTOM OPERA', 'FANTOMEVM'],
    heco: ['HECO', 'HT', 'HUOBI ECO CHAIN', 'HECOMAINNET']
};

try { if (typeof window !== 'undefined') { window.CHAIN_SYNONYMS = window.CHAIN_SYNONYMS || CHAIN_SYNONYMS; } } catch (_) { }

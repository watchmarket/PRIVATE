// ============================================================
// CEXDEX-COMPARE — config.js
// Dev-only config. Diisi oleh developer, TIDAK diubah user.
// ============================================================


// ============================================================
// APP_DEV_CONFIG — Pengaturan aplikasi
// ============================================================
const APP_DEV_CONFIG = {
  appName: "MINI SCANNER",
  appVersion: "03.30",

  telegramBotToken: "8053447166:AAH7YYbyZ4eBoPX31D8h3bCYdzEeIaiG4JU",
  telegramGroupId: "-5271018516",
  telegramCooldown: 5,   // menit

  corsProxy: "https://vercel-proxycors.vercel.app/?url=",

  // Biaya trading per CEX (0.001 = 0.1%)
  fees: {
    binance: 0.001,
    gate: 0.0015,
    mexc: 0.0015,
    indodax: 0.002,
  },

  defaultMinPnl: 1,
  defaultInterval: 800,
  defaultSseTimeout: 6000,
  defaultQuoteCountMetax: 2,     // 0 = matikan MetaMask SSE
  defaultQuoteCountBungee: 2,    // jumlah route Bungee (1–4), 0 = matikan Bungee
  defaultLevelCount: 4,     // jumlah level orderbook (1–4)
  defaultEnableKyber: true,  // KyberSwap DEX

  defaultEnableOkx: true,  // OKX DEX Aggregator
  defaultAutoLevel: true,  // Auto Level CEX orderbook
  defaultQuoteCountJumpx: 2,     // 0 = matikan Jumper/LiFi
  scanBatchSize: 10,     // jumlah koin yang di-scan paralel per batch
  maxDexDisplay: 6,     // jumlah kolom DEX yang tampil di hasil scanning (maks = jumlah DEX aktif)

  bungeeApiKey: "71XdjSawshaeie5DeH5b9avPjaoVtoOc2g5ZZx1d",
  bungeeAffiliate: "609913096e183b62cecd0dfdc13382f618baedceb5fef75aad43e6cbff367039708902197e0b2b78b1d76cb0837ad0b318baedceb5fef75aad43e6cb",
};


// ============================================================
// CONFIG_CEX_KEYS — API Keys untuk fetch fee WD dari CEX
// Digunakan oleh services/cex-wallet.js
// ============================================================
const CONFIG_CEX_KEYS = {
  BINANCE: {
    ApiKey: "PoMTZjrgq2rUNQHpqvoOW0Ajq1iKytG3OZueMyvYwJmMaH175kuVi2QyB98Zocnb",
    ApiSecret: "bBq5FCpuCghA0hJuil7gCObTqDzYaLaVdsZVsdfSzv4MZ2rDBK6cpN590eXAwfod",
  },
  MEXC: {
    ApiKey: "mx0vglNkKpxcAAEbtk",
    ApiSecret: "54a488c04cdf4afabf44dd07915731c6",
  },
  GATE: {
    ApiKey: "1dbe3d4c92a42de270692e65952574d0",
    ApiSecret: "9436bfec02a8ed462bda4bd1a516ba82b4f322dd09e120a2bf7ea6b5f0930ef8",
  },
  INDODAX: {
    ApiKey: "HRKOX8GL-KD9ANNF5-T7OKENAH-LHL5PBYQ-NW8GQICL",
    ApiSecret: "2ff67f7546f9b1af3344f4012fbb5561969de9440f1d1432c89473d1fe007deb3f3d0bac7400622b",
  },
};


// ============================================================
// CONFIG_CEX — 4 Exchange (orderbook + symbol format)
// ============================================================
const CONFIG_CEX = {
  binance: {
    label: "Binance",
    ICON: "icons/cex/binance.png",
    WARNA: "#e0a50c",
    ORDERBOOK: {
      urlTpl: (sym) => `https://data-api.binance.vision/api/v3/depth?limit=5&symbol=${sym.toUpperCase()}`,
      parser: "standard",
      proxy: false,
    },
    symbolFmt: (ticker) => ticker.toUpperCase() + "USDT",
  },

  gate: {
    label: "Gate",
    ICON: "icons/cex/gate.png",
    WARNA: "#D5006D",
    ORDERBOOK: {
      urlTpl: (sym) => `https://api.gateio.ws/api/v4/spot/order_book?limit=5&currency_pair=${sym.toUpperCase()}`,
      parser: "standard",
      proxy: true,
    },
    symbolFmt: (ticker) => ticker.toUpperCase() + "_USDT",
  },

  mexc: {
    label: "MEXC",
    ICON: "icons/cex/mexc.png",
    WARNA: "#1448ce",
    ORDERBOOK: {
      urlTpl: (sym) => `https://api.mexc.com/api/v3/depth?symbol=${sym.toUpperCase()}&limit=5`,
      parser: "standard",
      proxy: true,
    },
    symbolFmt: (ticker) => ticker.toUpperCase() + "USDT",
  },

  indodax: {
    label: "Indodax",
    ICON: "icons/cex/indodax.png",
    WARNA: "#2eb5f2",
    ORDERBOOK: {
      urlTpl: (sym) => `https://indodax.com/api/depth/${sym.toLowerCase()}`,
      parser: "indodax",
      proxy: true,
    },
    symbolFmt: (ticker) => ticker.toLowerCase() + "idr",
  },
};


// ============================================================
// CONFIG_CHAINS — 5 Chain
//
// Field per chain:
//   Kode_Chain : EVM chain ID (angka)
//   RPC        : DefiLlama RPC endpoint (CORS-enabled, tanpa proxy)
//   GAS_UNITS  : estimasi gas units untuk 1 DEX swap
//   USDT_SC    : alamat smart contract USDT di chain ini
//   USDT_DEC   : decimals USDT (BSC = 18, lainnya = 6)
//   WALLET_CEX : alamat hot wallet tiap CEX di chain ini
// ============================================================
const CONFIG_CHAINS = {
  bsc: {
    Kode_Chain: 56,
    RPC: 'https://rpc.llama-rpc.com/bsc?source=llamaswap',
    GAS_UNITS: 200_000,
    USDT_SC: '0x55d398326f99059fF775485246999027B3197955',
    USDT_DEC: 18,
    label: "BSC",
    Nama_Pendek: "bsc",
    WARNA: "#f0af18",
    ICON: "icons/chains/bsc.png",
    URL_Chain: "https://bscscan.com",
    DATAJSON: "https://watchmarket.github.io/JSON/SNAPSHOT_koin_BSC.json",
    LINKS: {
      token: (addr) => `https://bscscan.com/token/${addr}`,
    },
    WALLET_CEX: {
      GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe' },
      BINANCE: { address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3' },
      MEXC: { address: '0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB' },
      INDODAX: { address: '0xaBa3002AB1597433bA79aBc48eeAd54DC10A45F2' },
    },
  },

  ethereum: {
    Kode_Chain: 1,
    RPC: 'https://rpc.llama-rpc.com/ethereum?source=llamaswap',
    GAS_UNITS: 300_000,
    USDT_SC: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDT_DEC: 6,
    label: "Ethereum",
    Nama_Pendek: "erc",
    WARNA: "#8098ee",
    ICON: "icons/chains/ethereum.png",
    URL_Chain: "https://etherscan.io",
    DATAJSON: "https://watchmarket.github.io/JSON/SNAPSHOT_koin_ETHEREUM.json",
    LINKS: {
      token: (addr) => `https://etherscan.io/token/${addr}`,
    },
    WALLET_CEX: {
      GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe' },
      BINANCE: { address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d' },
      MEXC: { address: '0x75e89d5979E4f6Fba9F97c104c2F0AFB3F1dcB88' },
      INDODAX: { address: '0x3C02290922a3618A4646E3BbCa65853eA45FE7C6' },
    },
  },

  polygon: {
    Kode_Chain: 137,
    RPC: 'https://rpc.llama-rpc.com/polygon?source=llamaswap',
    GAS_UNITS: 200_000,
    USDT_SC: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    USDT_DEC: 6,
    label: "Polygon",
    Nama_Pendek: "poly",
    WARNA: "#cd72f4",
    ICON: "icons/chains/polygon.png",
    URL_Chain: "https://polygonscan.com",
    DATAJSON: "https://watchmarket.github.io/JSON/SNAPSHOT_koin_POLYGON.json",
    LINKS: {
      token: (addr) => `https://polygonscan.com/token/${addr}`,
    },
    WALLET_CEX: {
      GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe' },
      BINANCE: { address: '0x290275e3db66394C52272398959845170E4DCb88' },
      MEXC: { address: '0x51E3D44172868Acc60D68ca99591Ce4230bc75E0' },
      INDODAX: { address: '0x3C02290922a3618A4646E3BbCa65853eA45FE7C6' },
    },
  },

  arbitrum: {
    Kode_Chain: 42161,
    RPC: 'https://rpc.llama-rpc.com/arbitrum?source=llamaswap',
    GAS_UNITS: 700_000,
    USDT_SC: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    USDT_DEC: 6,
    label: "Arbitrum",
    Nama_Pendek: "arb",
    WARNA: "#a6b0c3",
    ICON: "icons/chains/arbitrum.png",
    URL_Chain: "https://arbiscan.io",
    DATAJSON: "https://watchmarket.github.io/JSON/SNAPSHOT_koin_ARBITRUM.json",
    LINKS: {
      token: (addr) => `https://arbiscan.io/token/${addr}`,
    },
    WALLET_CEX: {
      GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe' },
      BINANCE: { address: '0x290275e3db66394C52272398959845170E4DCb88' },
      MEXC: { address: '0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB' },
      INDODAX: { address: '0x3C02290922a3618A4646E3BbCa65853eA45FE7C6' },
    },
  },

  base: {
    Kode_Chain: 8453,
    RPC: 'https://rpc.llama-rpc.com/base?source=llamaswap',
    GAS_UNITS: 300_000,
    USDT_SC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT_DEC: 6,
    label: "Base",
    Nama_Pendek: "base",
    WARNA: "#1e46f9",
    ICON: "icons/chains/base.png",
    URL_Chain: "https://basescan.org",
    DATAJSON: "https://watchmarket.github.io/JSON/SNAPSHOT_koin_BASE.json",
    LINKS: {
      token: (addr) => `https://basescan.org/token/${addr}`,
    },
    WALLET_CEX: {
      GATE: { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe' },
      BINANCE: { address: '0xDFd5293D8e347dFe59E90eFd55b2956a1343963d' },
      MEXC: { address: '0x4e3ae00E8323558fA5Cac04b152238924AA31B60' },
      INDODAX: { address: '0x3C02290922a3618A4646E3BbCa65853eA45FE7C6' },
    },
  },
};


// ============================================================
// OKX DEX API KEY POOL
// Key pool di-rotate secara random untuk menghindari rate limit.
// Digunakan oleh collectors/dex-okx.js
// ============================================================
const apiKeysOKXDEX = [
  { ApiKeyOKX: "28bc65f0-8cd1-4ecb-9b53-14d84a75814b", secretKeyOKX: "E8C92510E44400D8A709FBF140AABEC1", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "04f923ec-98f2-4e60-bed3-b8f2d419c773", secretKeyOKX: "3D7D0BD3D985C8147F70592DF6BE3C48", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "cf214e57-8af2-42bf-8afa-3b7880c5a152", secretKeyOKX: "26AA1E415682BD8BBDF44A9B1CFF4759", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "a77871bd-7855-484c-a675-e429bad3490e", secretKeyOKX: "830C9BB8D963F293857DB0CCA5459089", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "87db4731-fbe3-416f-8bb4-a4f5e5cb64f7", secretKeyOKX: "B773838680FF09F2069AEE28337BBCD0", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "aec98aef-e2b6-4fb2-b63b-89e358ba1fe1", secretKeyOKX: "DB683C83FF6FB460227ACB57503F9233", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "6636873a-e8ab-4063-a602-7fbeb8d85835", secretKeyOKX: "B83EF91AFB861BA3E208F2680FAEDDC3", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "989d75b7-49ff-40a1-9c8a-ba94a5e76793", secretKeyOKX: "C30FCABB0B95BE4529D5BA1097954D34", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "43c169db-db8c-4aeb-9c25-a2761fdcae49", secretKeyOKX: "7F812C175823BBD9BD5461B0E3A106F5", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "904cefba-08ce-48e9-9e8b-33411bf44a0f", secretKeyOKX: "91F2761A0B77B1DEED87A54E75BE1CCE", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "bfbd60b5-9aee-461d-9c17-3b401f9671d1", secretKeyOKX: "D621020540042C41D984E2FB78BED5E4", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "86f40277-661c-4290-929b-29a25b851a87", secretKeyOKX: "9274F990B5BEDAB5EB0C035188880081", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "32503ada-3d34-411a-b50b-b3e0f36f3b47", secretKeyOKX: "196658185E65F93963323870B521A6F6", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "80932e81-45b1-497e-bc14-81bdb6ed38d5", secretKeyOKX: "4CA9689FA4DE86F4E4CBF2B777CBAA91", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "a81d5a32-569a-401c-b207-3f0dd8f949c7", secretKeyOKX: "307D988DA44D37C911AA8A171B0975DB", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "ca59e403-4bcb-410a-88bb-3e931a2829d5", secretKeyOKX: "AC7C6D593C29F3378BF93E7EDF74CB6D", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "97439591-ea8e-4d78-86bb-bdac8e43e835", secretKeyOKX: "54970C78369CE892E2D1B8B296B4E572", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "f7a23981-af15-47f4-8775-8200f9fdfe5d", secretKeyOKX: "4F61764255CEDE6D5E151714B3E1E93B", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "4f708f99-2e06-4c81-88cb-3c8323fa42c5", secretKeyOKX: "A5B7DCA10A874922F54DC2204D6A0435", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "61061ef4-6d0a-412a-92a9-bdc29c6161a7", secretKeyOKX: "4DDF73FD7C38EB50CD09BF84CDB418ED", PassphraseOKX: "Regi!#007" },
  { ApiKeyOKX: "adad55d1-bf90-43ac-ac03-0a43dc7ccee2", secretKeyOKX: "528AFB3ECC88653A9070F05CC3839611", PassphraseOKX: "Cek_Horeg_911" },
  { ApiKeyOKX: "6866441f-6510-4175-b032-342ad6798817", secretKeyOKX: "E6E4285106CB101B39FECC385B64CAB1", PassphraseOKX: "Arekpinter123." },
  { ApiKeyOKX: "45e4e1f1-1229-456f-ad23-8e1341e76683", secretKeyOKX: "1BD8AC02C9461A6D1BEBDFE31B3BFF9F", PassphraseOKX: "Regi!#007" },
];

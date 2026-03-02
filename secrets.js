// Centralized API keys and secrets
// - CEX API keys (now stored in IndexedDB - user must configure in Settings)
// - OKX DEX key pool
// - Telegram bot credentials

// =============================
// Encryption Utilities (AES auto-key)
// =============================
const _ENC_SALT = 'xK9#mP2$vL7@nQ4';
function _getEncKey() {
    const appName = (typeof CONFIG_APP !== 'undefined' && CONFIG_APP?.APP?.NAME) || 'APP_DEV';
    return appName + _ENC_SALT;
}
function appEncrypt(data) {
    try {
        const json = typeof data === 'string' ? data : JSON.stringify(data);
        return CryptoJS.AES.encrypt(json, _getEncKey()).toString();
    } catch (_) { return null; }
}
function appDecrypt(cipherText) {
    try {
        const bytes = CryptoJS.AES.decrypt(cipherText, _getEncKey());
        const text = bytes.toString(CryptoJS.enc.Utf8);
        if (!text) return null;
        try { return JSON.parse(text); } catch (_) { return text; }
    } catch (_) { return null; }
}
// Expose globally
window.appEncrypt = appEncrypt;
window.appDecrypt = appDecrypt;

// =============================
// CEX API Key Management (IndexedDB)
// =============================
// Hardcoded API keys removed for security
// Users MUST configure API keys in Settings UI (index.html)
// Keys are stored in IndexedDB under key "CEX_API_KEYS"

/**
 * Get CEX credentials from IndexedDB (single source of truth)
 * @param {string} cexName - CEX name (GATE, BINANCE, MEXC, etc.)
 * @returns {Object|null} - { ApiKey, ApiSecret, Passphrase? } or null
 */
function getCEXCredentials(cexName) {
    try {
        if (typeof getFromLocalStorage === 'function') {
            const raw = getFromLocalStorage('CEX_API_KEYS', null);
            if (!raw) {
                try { if (window.SCAN_LOG_ENABLED) console.warn(`[CEX] No API keys found for ${cexName}! Please configure in Settings.`); } catch (_) { }
                return null;
            }
            // Try decrypt if it's an encrypted string
            let cexKeys = raw;
            if (typeof raw === 'string') {
                cexKeys = appDecrypt(raw);
                if (!cexKeys) return null;
            }
            if (cexKeys && cexKeys[cexName]) {
                try { if (window.SCAN_LOG_ENABLED) console.log(`[CEX] Using API key from IndexedDB for ${cexName}`); } catch (_) { }
                return cexKeys[cexName];
            }
        }
        try { if (window.SCAN_LOG_ENABLED) console.warn(`[CEX] No API keys found for ${cexName}! Please configure in Settings.`); } catch (_) { }
        return null;
    } catch (error) {
        console.error(`[CEX] Error getting credentials for ${cexName}:`, error);
        return null;
    }
}

/**
 * Auto-migrate CEX API keys from localStorage (MULTI_*) to IndexedDB (CEX_API_KEYS)
 * This function runs once on app initialization
 */
function migrateCEXKeysToIndexedDB() {
    try {
        const migrationDone = getFromLocalStorage('CEX_KEYS_MIGRATED', false);
        if (migrationDone === true || migrationDone === 'true') {
            try { if (window.SCAN_LOG_ENABLED) console.log('[CEX Migration] Migration already completed, skipping'); } catch (_) { }
            return;
        }

        if (typeof getFromLocalStorage === 'function') {
            const rawExisting = getFromLocalStorage('CEX_API_KEYS', null);
            // Check if data exists (could be encrypted string or plain object)
            if (rawExisting) {
                let existingKeys = rawExisting;
                if (typeof rawExisting === 'string') existingKeys = appDecrypt(rawExisting);
                if (existingKeys && typeof existingKeys === 'object' && Object.keys(existingKeys).length > 0) {
                    try { if (window.SCAN_LOG_ENABLED) console.log('[CEX Migration] IndexedDB already has keys, skipping migration'); } catch (_) { }
                    saveToLocalStorage('CEX_KEYS_MIGRATED', true);
                    return;
                }
            }
        }

        // ✅ Get CEX list dynamically from CONFIG_CEX (no hardcode!)
        const cexList = (typeof getEnabledCEXs === 'function') ? getEnabledCEXs() : [];
        const migratedKeys = {};
        let migratedCount = 0;

        cexList.forEach(cex => {
            // Cek legacy localStorage dulu (migrasi dari raw localStorage)
            const apiKey = (typeof localStorage !== 'undefined') ? localStorage.getItem(`MULTI_apikey${cex}`) : null;
            const secretKey = (typeof localStorage !== 'undefined') ? localStorage.getItem(`MULTI_secretkey${cex}`) : null;
            const passphrase = (typeof localStorage !== 'undefined') ? localStorage.getItem(`MULTI_passphrase${cex}`) : null;

            if (apiKey && secretKey) {
                migratedKeys[cex] = {
                    ApiKey: apiKey,
                    ApiSecret: secretKey
                };
                if (passphrase && (cex === 'KUCOIN' || cex === 'BITGET' || cex === 'OKX')) {
                    migratedKeys[cex].Passphrase = passphrase;
                }
                migratedCount++;
            }
        });

        if (migratedCount > 0 && typeof saveToLocalStorage === 'function') {
            const encrypted = appEncrypt(migratedKeys);
            saveToLocalStorage('CEX_API_KEYS', encrypted || migratedKeys);
            saveToLocalStorage('CEX_KEYS_MIGRATED', true);
            try { if (window.SCAN_LOG_ENABLED) console.log(`[CEX Migration] Migrated ${migratedCount} CEX API key(s) to IndexedDB:`, Object.keys(migratedKeys)); } catch (_) { }

            // Cleanup legacy localStorage keys setelah migrasi berhasil
            try {
                cexList.forEach(cex => {
                    localStorage.removeItem(`MULTI_apikey${cex}`);
                    localStorage.removeItem(`MULTI_secretkey${cex}`);
                    localStorage.removeItem(`MULTI_passphrase${cex}`);
                });
                localStorage.removeItem('CEX_KEYS_MIGRATED'); // hapus flag lama di localStorage
                console.log('[CEX Migration] Legacy localStorage keys cleaned up');
            } catch (_) { }
        } else {
            try { if (window.SCAN_LOG_ENABLED) console.log('[CEX Migration] No legacy API keys found to migrate'); } catch (_) { }
            saveToLocalStorage('CEX_KEYS_MIGRATED', true);
            try { localStorage.removeItem('CEX_KEYS_MIGRATED'); } catch (_) { } // hapus flag lama
        }
    } catch (error) {
        console.error('[CEX Migration] Migration failed:', error);
    }
}

// Run migration on load (after IndexedDB is ready)
if (typeof window !== 'undefined' && window.__IDB_LOCALSTORAGE_READY__) {
    window.__IDB_LOCALSTORAGE_READY__.then(() => {
        migrateCEXKeysToIndexedDB();
    }).catch(err => {
        console.error('[CEX Migration] Failed to wait for IndexedDB:', err);
    });
}

// CEX_SECRETS now empty - user must configure keys in Settings
const CEX_SECRETS = {
    // Hardcoded API keys removed for security
    // Configure your CEX API keys in Settings (index.html -> Setting App)
    // Keys will be loaded from IndexedDB at runtime via getCEXCredentials()
};

// Telegram bot credentials (encrypted)
const _TELE_ENC = 'U2FsdGVkX18rQFT89YjP3rj9HEjai+ugy8h1JypLGVRGKwdyeqhWZXoiPAIKnUsZIifRT7COq9foPBN6/MGiew3NvlN+a+k8SOvGOBZ2iNl00ttsswWslgWa7jpUzJDiBVxcd021KBTfBEPy7LWOvw==';
const CONFIG_TELEGRAM = (function () {
    try {
        if (typeof CryptoJS !== 'undefined') {
            const dec = appDecrypt(_TELE_ENC);
            if (dec && dec.BOT_TOKEN) return dec;
        }
    } catch (_) { }
    return { BOT_TOKEN: '', CHAT_ID: '' };
})();

// Ensure globals are available for code paths that expect window.*
try {
    if (typeof window !== 'undefined') {
        window.CONFIG_TELEGRAM = window.CONFIG_TELEGRAM || CONFIG_TELEGRAM;
        window.CEX_SECRETS = window.CEX_SECRETS || CEX_SECRETS;
        window.getCEXCredentials = window.getCEXCredentials || getCEXCredentials;
        window.migrateCEXKeysToIndexedDB = window.migrateCEXKeysToIndexedDB || migrateCEXKeysToIndexedDB;
    }
} catch (_) { }

const apiKeysOKXDEX = [
    {
        ApiKeyOKX: "28bc65f0-8cd1-4ecb-9b53-14d84a75814b",
        secretKeyOKX: "E8C92510E44400D8A709FBF140AABEC1",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "04f923ec-98f2-4e60-bed3-b8f2d419c773",
        secretKeyOKX: "3D7D0BD3D985C8147F70592DF6BE3C48",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "cf214e57-8af2-42bf-8afa-3b7880c5a152",
        secretKeyOKX: "26AA1E415682BD8BBDF44A9B1CFF4759",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "a77871bd-7855-484c-a675-e429bad3490e",
        secretKeyOKX: "830C9BB8D963F293857DB0CCA5459089",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "87db4731-fbe3-416f-8bb4-a4f5e5cb64f7",
        secretKeyOKX: "B773838680FF09F2069AEE28337BBCD0",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "aec98aef-e2b6-4fb2-b63b-89e358ba1fe1",
        secretKeyOKX: "DB683C83FF6FB460227ACB57503F9233",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "6636873a-e8ab-4063-a602-7fbeb8d85835",
        secretKeyOKX: "B83EF91AFB861BA3E208F2680FAEDDC3",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "989d75b7-49ff-40a1-9c8a-ba94a5e76793",
        secretKeyOKX: "C30FCABB0B95BE4529D5BA1097954D34",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "43c169db-db8c-4aeb-9c25-a2761fdcae49",
        secretKeyOKX: "7F812C175823BBD9BD5461B0E3A106F5",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "904cefba-08ce-48e9-9e8b-33411bf44a0f",
        secretKeyOKX: "91F2761A0B77B1DEED87A54E75BE1CCE",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "bfbd60b5-9aee-461d-9c17-3b401f9671d1",
        secretKeyOKX: "D621020540042C41D984E2FB78BED5E4",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "86f40277-661c-4290-929b-29a25b851a87",
        secretKeyOKX: "9274F990B5BEDAB5EB0C035188880081",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "32503ada-3d34-411a-b50b-b3e0f36f3b47",
        secretKeyOKX: "196658185E65F93963323870B521A6F6",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "80932e81-45b1-497e-bc14-81bdb6ed38d5",
        secretKeyOKX: "4CA9689FA4DE86F4E4CBF2B777CBAA91",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "a81d5a32-569a-401c-b207-3f0dd8f949c7",
        secretKeyOKX: "307D988DA44D37C911AA8A171B0975DB",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "ca59e403-4bcb-410a-88bb-3e931a2829d5",
        secretKeyOKX: "AC7C6D593C29F3378BF93E7EDF74CB6D",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "97439591-ea8e-4d78-86bb-bdac8e43e835",
        secretKeyOKX: "54970C78369CE892E2D1B8B296B4E572",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "f7a23981-af15-47f4-8775-8200f9fdfe5d",
        secretKeyOKX: "4F61764255CEDE6D5E151714B3E1E93B",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "4f708f99-2e06-4c81-88cb-3c8323fa42c5",
        secretKeyOKX: "A5B7DCA10A874922F54DC2204D6A0435",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "61061ef4-6d0a-412a-92a9-bdc29c6161a7",
        secretKeyOKX: "4DDF73FD7C38EB50CD09BF84CDB418ED",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "b63f3f68-2008-4df5-9d2e-ae888435332b",
        secretKeyOKX: "1427387D7B1A67018AA26D364700527B",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "ecc51700-e7a2-4c93-9c8d-dbc43bda74c1",
        secretKeyOKX: "6A897CF4D6B56AF6B4E39942C8811871",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "dd3f982e-0e20-4ecd-8a03-12d7b0f54586",
        secretKeyOKX: "9F69EEB1A17CCCE9862B797428D56C00",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "a6fd566b-90ed-42c1-8575-1e15c05e395c",
        secretKeyOKX: "77FA24FA1DBFFBA5C9C83367D0EAE676",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "a499fca1-14cd-41c3-a5bc-0eb37581eff9",
        secretKeyOKX: "B8101413760E26278FFAF6F0A2BCEA73",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "c3c7e029-64b7-4704-8fdc-6d1861ad876a",
        secretKeyOKX: "B13A8CFA344038FAACB44A3E92C9C057",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "1974cbac-2a05-4892-88e0-eb262d5d2798",
        secretKeyOKX: "6A24A249F758047057A993D9A460DA7F",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "41826044-b7bb-4465-a903-3da61e336747",
        secretKeyOKX: "F42BD9E95F01BCD248C94EE2EECDE19A",
        PassphraseOKX: "Regi!#007"
    },
    {
        ApiKeyOKX: "08af14cb-2f97-472c-90cd-fefd2103f253",
        secretKeyOKX: "FFC78575E3961D11BF134C8DE9CBE7F8",
        PassphraseOKX: "Regi!#007"
    },

    {
        ApiKeyOKX: "adad55d1-bf90-43ac-ac03-0a43dc7ccee2",
        secretKeyOKX: "528AFB3ECC88653A9070F05CC3839611",
        PassphraseOKX: "Cek_Horeg_911",
    },
    {
        ApiKeyOKX: "6866441f-6510-4175-b032-342ad6798817",
        secretKeyOKX: "E6E4285106CB101B39FECC385B64CAB1",
        PassphraseOKX: "Arekpinter123.",
    },
    {
        ApiKeyOKX: "45e4e1f1-1229-456f-ad23-8e1341e76683",
        secretKeyOKX: "1BD8AC02C9461A6D1BEBDFE31B3BFF9F",
        PassphraseOKX: "Regi!#007",
    },
];

const apiKeysLIFI = [
    "e057a54c-1459-44ab-ac50-faa645763c43.a87045f9-d438-4f5a-8707-57f2b7c239b3",
    "8ed53cb9-d883-4f85-9429-116c0193e8f4.3341cd43-bbd1-40e2-ac1b-1969af85a2c6",
    "632e463a-7cf2-4c51-b962-ef78a6608419.98102f8e-7b7c-4a4a-aa3d-d37424b1b4df",
    "057a2f7f-cba7-4db0-b325-ba402737550e.e8851b8d-492a-491d-bf75-80a755f890eb",
    "bcb65083-bbfd-4a0d-89e3-f07abd43a65c.92d118b0-1544-4cf7-8fcb-53a326497bdd",
    "eeee2d0d-dc45-4342-922f-501d26580116.b6bfc1b2-98ca-4ceb-a558-e82de853523b",
    "d251802b-39e2-4134-94e9-447449fc5371.a4d8e5e6-5c94-4124-9466-5d84831544e2",
    "be4bfb73-abcf-47e3-b3b2-edf2241b887b.6a740544-f414-4402-aff8-9ca9a9e3516e",
    "3579f473-a800-46b2-8d03-dbe3988961b8.33739a98-dadc-4b76-b8e7-cb7fd79a12d3",
    "14ddac76-3343-4009-91d4-af6c1d355cac.12384c4a-2844-46e9-add8-7408c0c4d687",
    "6a460b8c-1fcd-42e6-9e04-0f5c6610428d.31f97303-23f1-476b-ad5d-d138926fa4f6",
    "5b976d7c-7b3d-4cea-ba67-b76e34bda0d1.c725a0da-caa2-4eb4-9062-fc722705f79b",
    "3e4c820e-9b71-48fd-80b0-f363ea3c8bc0.20cd7488-25fc-4f82-b063-38bbc26dd878",
    "0877c8c3-66b9-41d5-8082-b33767a32f87.3d522860-428b-4aa3-aa38-f430635a5475",
    "55ce89b2-1b62-426e-bbcf-a34feb9d9a01.f14ad8fb-8286-44a8-8e6f-02cb79f9f801",
    "463c3300-ab2c-4c90-bbfe-c77de13c5b70.eab3e0a8-5199-4a83-91da-e44aae7184f8",
    "a6f75d89-282c-4865-a588-1987d3a00da8.c22a17e7-1aa5-41b8-8d83-efd24a0a684a",
    "12d54546-961e-4706-bf7c-3d868a26c5bf.862448ac-1cbe-411c-9803-5e77d4f38a54",
    "876c98f2-6c5f-451c-9305-2f834e855daf.8bb1259a-bd7b-461a-960c-ecd254b48f50",
    "ce36f6d6-303c-4514-946f-8693000ef077.58a4926e-8e5f-4c20-925e-811470a5064c",
    "e190ef8a-3eff-4fd6-ab41-69c23e765032.c113ce05-1ead-4c66-8a76-b48b893bbee5",
    "114f7124-f64a-42ee-963b-254819128e6d.5aacb323-2c24-4b20-9f85-080c31ac50d6",
    "100f9d4d-2d7d-453b-ae0c-ef531b47f003.0f2f6e44-b8f3-4480-b873-4a17fd8806c7",
    "5f682b5a-ae54-4f2d-94c3-cd33e3600591.6bbe0750-bebe-4b3e-a2eb-626ef9fe89c9",
    "8b2c8447-d90d-4a5d-b244-a31a09d45119.c52d9228-9896-410e-843f-e69f0e65a693",
    "abf49d98-2271-4a8d-9e35-f0a9390bbb0d.a7d1e0ad-b667-444c-a9c0-3f53e10715f1",
    "a8c20c8f-3e22-4563-9a0c-85279121fff1.3fb1a1ea-bd1a-4a23-96f2-2c72c6a59999",
    "0c316940-f3a0-456f-a475-10d0fa258e6a.754d4b65-6c1a-4da3-becc-93935d069907",
    "141b50c8-4286-4e0f-9fd5-25839061dddc.a8cb5c0b-93ce-49f2-abce-07d1d6acb845",
    "d4cb0ef9-2353-4592-a5fc-ebdc84e4f286.e3394885-f29a-431f-acac-5861e950de57",
    "77e9eb6b-b249-49fb-b14f-87a0b6c73da3.8b3ecf40-382b-41ea-9686-e7506b2886a7",
    "17af0ac7-b1f2-4865-bc68-5a838b8ea1b0.299004de-2548-43f2-a26c-c7bd8dd5863e",
    "df8c9a43-70e1-4c14-bfb4-ed41bcc2b9a3.24d92c87-9741-4f65-b4f5-b48305905261",
    "36df52b4-5b1d-4d50-9a0d-ee0a0114b95e.fff847c2-3e91-489f-b3d6-055c567e0bb7",
    "d51f303f-9178-4df1-8c55-1f0041e5cee0.bee4b96d-f689-4a27-9dcd-b016bcfcc630",
    "86cd6fe3-2ecb-4c0a-ae89-2d72a1245ec6.8f46d456-eea0-4d83-87fd-c54cec99bae6",
    "9d7307ce-211c-4e5d-9c67-cc2a4071fa8a.c2a3002a-4d2a-40d8-a9bd-87c4c6cf4064",
    "8a3af21e-22c3-4df3-a1dc-d34325fe5956.d6a84b30-916c-4b75-95d8-fdba1c93d44a",
    "cb0b4641-13b8-4363-bbe7-a2ce1d33ae25.45d5b10a-14f0-41fd-8812-5aeba8520b19",
    "8be66370-651b-4d3f-9351-8168a3a8c34f.5bb01420-cdd6-4d2e-83e0-8d5d100f1b01"
];

// Helper function to get random LIFI API key
function getRandomApiKeyLIFI() {
    const idx = Math.floor(Math.random() * apiKeysLIFI.length);
    return apiKeysLIFI[idx];
}

// =============================
// RocketX API Keys (Multi-Chain DEX Aggregator)
// =============================
const apiKeysRocketX = [
    'znYxDQz2P46Dsbdj5slpe9i5ofpv4hkOaUuyV6xU',  // ✅ Default API key
    'cec7e234-bf17-4f8d-bfac-83d999bd3a08'   ,
    '4c0ac9d4-90d0-4ba2-8a54-616f1fa8da79'       ,
    '694fa473-ff52-4b0d-abb9-b5d88a4c9972'
];

let rocketxKeyIndex = 0;
function getRandomApiKeyRocketX() {
    const key = apiKeysRocketX[rocketxKeyIndex];
    rocketxKeyIndex = (rocketxKeyIndex + 1) % apiKeysRocketX.length;
    return key;
}

// Rango API Keys (Multi-Chain DEX Aggregator)
// =============================
// Using Rango's official test API key for development
// Source: https://docs.rango.exchange/api-integration/api-key-and-rate-limits
// Note: This test key has low rate limits - request production key for live usage
const apiKeysRango = [
    'c6381a79-2817-4602-83bf-6a641a409e32',  // ✅ Official Rango test API key
    '55978f60-150d-4e21-8289-5bbfd8f5df88'   // ✅ Production API key
];

let rangoKeyIndex = 0;
function getRandomApiKeyRango() {
    const key = apiKeysRango[rangoKeyIndex];
    rangoKeyIndex = (rangoKeyIndex + 1) % apiKeysRango.length;
    return key;
}

// =============================
// DEX API Keys (Centralized)
// =============================
// All DEX API keys stored in one place for better security and management

// 0x (Matcha) API Keys Pool - NO DEFAULT KEYS (User must provide their own)
// Endpoint: https://api.0x.org/swap/allowance-handler/quote
// Headers: 0x-api-key, 0x-version: v2
// Get from: https://dashboard.0x.org
// ⚠️ Default keys removed - user MUST input API keys in settings

// Helper function for user API key rotation
let zeroxKeyIndex = 0;
function rotateUserApiKey0x(keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
        return null;
    }
    const key = keys[zeroxKeyIndex % keys.length];
    zeroxKeyIndex = (zeroxKeyIndex + 1) % keys.length;
    return key;
}

const DEX_API_KEYS = {
    // 0x (Matcha) API Key - Handled by get0xApiKey() with rotation
    // Use get0xApiKey() to get rotating keys from pool
};

// =============================
// Swing Project IDs
// =============================
// IMPORTANT: Custom project IDs must be configured at https://platform.swing.xyz/
// Each project must enable the chains you want to use (BSC, Ethereum, Polygon, etc.)
// Error "bsc is not a valid chain or is disabled by this project" means the project
// hasn't enabled that chain in the Swing dashboard settings.
//
// Using only 'galaxy-exchange' (demo project) - pre-configured for all chains
const SWING_PROJECT_IDS = [
    'galaxy-exchange'  // ✅ Public demo project - all chains enabled

    // ❌ Custom project IDs disabled - not configured for all chains:
    // 'swing-62370183-4923-4b32-8806-c8729d4d6a2d',  // percobaan1 - BSC disabled
    // 'swing-11f7b12d-4624-4805-8a6c-7ce40a111ec7',  // percobaan1a - BSC disabled
    // 'swing-381b973d-adce-4c6b-8005-4347bab98543',  // percobaan1b - BSC disabled
    // 'swing-a2646b38-c907-443b-9440-2830683e2cf6',  // percobaan2 - BSC disabled
    // 'swing-b7e3b703-224b-4cc9-897d-7a963602fc33',  // percobaan2a - BSC disabled
    // 'swing-067ad581-1328-42df-bd35-29e1c3b888ed'   // percobaan2b - BSC disabled
];

// Helper function to get random Swing project ID
function getRandomSwingProjectId() {
    const idx = Math.floor(Math.random() * SWING_PROJECT_IDS.length);
    return SWING_PROJECT_IDS[idx];
}

// Helper function to get 0x API key (with rotation)
// ⚠️ NO DEFAULT KEYS - User MUST provide API keys in settings
// Supports multiple keys (comma-separated) with automatic rotation
function get0xApiKey() {
    try {
        let userInput = null;

        // 1. Try from window.SavedSettingData (in-memory cache)
        if (typeof SavedSettingData !== 'undefined' && SavedSettingData && SavedSettingData.matchaApiKeys) {
            userInput = SavedSettingData.matchaApiKeys;
            console.log('[0x API] Reading keys from SavedSettingData (cached)');
        }
        // 2. Fallback: Read directly from IndexedDB/localStorage
        else if (typeof getFromLocalStorage === 'function') {
            const settings = getFromLocalStorage('SETTING_SCANNER', {});
            if (settings && settings.matchaApiKeys) {
                userInput = settings.matchaApiKeys;
                console.log('[0x API] Reading keys from IndexedDB (direct read)');
            }
        }

        if (!userInput) {
            // No user keys found - return null (scanner will handle error)
            console.error('[0x API] ⚠️ No API keys found! User must provide Matcha API keys in settings.');
            console.error('[0x API] Get API keys from: https://dashboard.0x.org');
            return null;
        }

        // Support both array and string (comma-separated)
        let keys = [];
        if (Array.isArray(userInput)) {
            keys = userInput.filter(k => k && String(k).trim() !== '');
        } else if (typeof userInput === 'string') {
            keys = userInput.split(',')
                .map(k => String(k).trim())
                .filter(k => k !== '');
        }

        if (keys.length > 0) {
            const rotatedKey = rotateUserApiKey0x(keys);
            console.log(`[0x API] ✅ Using user API key (key ${zeroxKeyIndex}/${keys.length} total keys)`);
            return rotatedKey;
        }

        // Empty keys array
        console.error('[0x API] ⚠️ matchaApiKeys field exists but contains no valid keys!');
        return null;
    } catch (error) {
        console.error('[0x API] Error getting API key:', error);
        return null;
    }
}

try {
    if (typeof window !== 'undefined') {
        window.apiKeysLIFI = window.apiKeysLIFI || apiKeysLIFI;
        window.getRandomApiKeyLIFI = window.getRandomApiKeyLIFI || getRandomApiKeyLIFI;
        window.apiKeysRocketX = window.apiKeysRocketX || apiKeysRocketX;
        window.getRandomApiKeyRocketX = window.getRandomApiKeyRocketX || getRandomApiKeyRocketX;
        window.apiKeysRango = window.apiKeysRango || apiKeysRango;
        window.getRandomApiKeyRango = window.getRandomApiKeyRango || getRandomApiKeyRango;
        window.rotateUserApiKey0x = window.rotateUserApiKey0x || rotateUserApiKey0x;  // ✅ User key rotation
        window.DEX_API_KEYS = window.DEX_API_KEYS || DEX_API_KEYS;
        window.get0xApiKey = window.get0xApiKey || get0xApiKey;
        window.SWING_PROJECT_IDS = window.SWING_PROJECT_IDS || SWING_PROJECT_IDS;
        window.getRandomSwingProjectId = window.getRandomSwingProjectId || getRandomSwingProjectId;
    }
} catch (_) { }

// =================================================================================
// DEX Service Module (moved intact) — Pindahkan utuh + shim
// =================================================================================
/**
 * DEX Service Module
 * - Strategy-based price quoting per aggregator (Kyber, Relay, 0x/Matcha, Odos, OKX)
 * - getPriceDEX builds request and parses response per DEX
 */
(function initDEXService(global) {
  const root = global || (typeof window !== 'undefined' ? window : {});
  const App = root.App || (root.App = {});

  // Map HTTP status codes to concise Indonesian descriptions for UI titles
  function describeHttpStatus(code) {
    const map = {
      // 3xx
      300: 'Multiple Choices — Banyak pilihan resource',
      301: 'Moved Permanently — URL pindah permanen',
      302: 'Found — Redirect sementara',
      303: 'See Other — Redirect dengan GET',
      304: 'Not Modified — Pakai cache',
      307: 'Temporary Redirect — Redirect sementara (method sama)',
      308: 'Permanent Redirect — Redirect permanen (method sama)',
      // 4xx
      400: 'Bad Request — Format request salah',
      401: 'Unauthorized — Token/Auth diperlukan',
      402: 'Payment Required — Terkait pembayaran (jarang)',
      403: 'Forbidden — Akses dilarang',
      404: 'Not Found — Resource tidak ada',
      405: 'Method Not Allowed — Method HTTP salah',
      406: 'Not Acceptable — Format tidak didukung',
      407: 'Proxy Auth Required — Autentikasi proxy',
      408: 'Request Timeout — Permintaan terlalu lama',
      409: 'Conflict — Konflik data',
      410: 'Gone — Resource sudah dihapus',
      411: 'Length Required — Header Content-Length wajib',
      412: 'Precondition Failed — If-* gagal',
      413: 'Payload Too Large — Data terlalu besar',
      414: 'URI Too Long — URL terlalu panjang',
      415: 'Unsupported Media Type — Format tidak didukung',
      416: 'Range Not Satisfiable — Range request salah',
      417: 'Expectation Failed — Header Expect gagal',
      421: 'Misdirected Request — Server tujuan salah',
      422: 'Unprocessable Entity — Validasi gagal',
      423: 'Locked — Resource terkunci',
      424: 'Failed Dependency — Ketergantungan gagal',
      425: 'Too Early — Terlalu cepat',
      426: 'Upgrade Required — Wajib upgrade protokol',
      428: 'Precondition Required — Butuh precondition',
      429: 'Too Many Requests — Rate limiting',
      431: 'Header Fields Too Large — Header terlalu besar',
      451: 'Unavailable For Legal Reasons — Diblokir secara legal',
      // 5xx
      500: 'Internal Server Error — Error di sisi server',
      501: 'Not Implemented — Endpoint belum tersedia',
      502: 'Bad Gateway — Kesalahan di gateway/proxy',
      503: 'Service Unavailable — Server sibuk/maintenance',
      504: 'Gateway Timeout — Timeout di server/gateway',
      505: 'HTTP Version Not Supported — Versi tidak didukung',
      507: 'Insufficient Storage — Server kehabisan ruang',
      508: 'Loop Detected — Loop di server',
      510: 'Not Extended — Butuh extension tambahan',
      511: 'Network Auth Required — Login ke jaringan',
    };
    return map[Number(code)] || `HTTP ${code} — Error dari server`;
  }

  // Helper: Calculate gas fee in USD with custom gas price override
  // ✅ FIXED: gasLimit dari API selalu di-cap dengan GASLIMIT di config.js
  // gasLimit ≠ gasPrice: gasLimit = unit gas max yang diizinkan (config), gasPrice = harga per unit (RPC/gwei)
  // Fee = gasLimit × gasPrice(gwei) / 1e9 × nativeTokenPrice
  function calculateGasFeeUSD(chainName, gasEstimate, gasPriceGwei) {
    try {
      // Get gas price data from localStorage
      const allGasData = (typeof getFromLocalStorage === 'function')
        ? getFromLocalStorage("ALL_GAS_FEES")
        : null;

      if (!allGasData) return 0;

      // Find gas info for this chain
      const gasInfo = allGasData.find(g =>
        String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase()
      );

      if (!gasInfo || !gasInfo.tokenPrice) return 0;

      // Get chain config for gas limit (sumber kebenaran / source of truth)
      const chainConfig = (typeof root.CONFIG_CHAINS !== 'undefined')
        ? root.CONFIG_CHAINS[String(chainName || '').toLowerCase()]
        : null;

      const configGasLimit = (chainConfig && chainConfig.GASLIMIT) ? chainConfig.GASLIMIT : 80000;

      // ✅ SELALU cap dengan configGasLimit: gunakan Math.min()
      // Jika gasEstimate dari API > configGasLimit → paksa pakai configGasLimit
      // Jika gasEstimate tidak ada (0/null) → langsung pakai configGasLimit
      const rawGasLimit = gasEstimate || configGasLimit;
      const gasLimit = Math.min(rawGasLimit, configGasLimit);

      // Calculate fee: gasLimit * gasPriceGwei * tokenPrice / 1e9
      const feeUSD = (gasLimit * gasPriceGwei * gasInfo.tokenPrice) / 1e9;

      return Number.isFinite(feeUSD) && feeUSD > 0 ? feeUSD : 0;
    } catch (e) {
      // console.error('[DEX] Error calculating gas fee:', e);
      return 0;
    }
  }

  // Helper: Get default swap fee from global scope (defined in utils/helpers/chain-helpers.js)
  function getFeeSwap(chainName) {
    if (typeof root.getFeeSwap === 'function') {
      return root.getFeeSwap(chainName);
    }
    // Fallback if getFeeSwap not available
    return 0;
  }

  /**
   * Helper: Resolve FeeSwap dengan label sumber untuk tooltip.
   * Mengembalikan { FeeSwap, feeSource } — digunakan oleh semua parseResponse.
   *
   * @param {number} directUsd  - Fee langsung dalam USD dari response API (atau 0 jika tidak ada)
   * @param {number} calcUsd    - Fee dari kalkulasi gas × harga (atau 0 jika tidak ada)
   * @param {string} chainName  - Nama chain untuk getFeeSwap fallback
   * @returns {{ FeeSwap: number, feeSource: 'api'|'calc'|'fallback' }}
   *
   * Priority: directUsd (api) → calcUsd (calc) → getFeeSwap (fallback)
   */
  function resolveFeeSwap(directUsd, calcUsd, chainName) {
    if (Number.isFinite(directUsd) && directUsd > 0 && directUsd < 500) {
      return { FeeSwap: directUsd, feeSource: 'api' };
    }
    if (Number.isFinite(calcUsd) && calcUsd > 0 && calcUsd < 500) {
      return { FeeSwap: calcUsd, feeSource: 'calc' };
    }
    return { FeeSwap: getFeeSwap(chainName), feeSource: 'fallback' };
  }

  /**
   * Helper: Cap gas units dari API response agar tidak melebihi GASLIMIT config.js.
   * API kadang mengembalikan gasLimit yang sangat besar (terutama multi-hop route),
   * sehingga fee bisa ter-inflate secara tidak realistis.
   *
   * @param {number} gasUnitsRaw   - Gas units mentah dari API response
   * @param {string} chainName     - Nama chain (misal 'bsc', 'ethereum')
   * @returns {number} gasUnits yang sudah di-cap dengan GASLIMIT dari config
   */
  function capGasUnits(gasUnitsRaw, chainName) {
    try {
      const chainCfg = (typeof root !== 'undefined' && root.CONFIG_CHAINS)
        ? root.CONFIG_CHAINS[String(chainName || '').toLowerCase()]
        : null;
      const configGasLimit = chainCfg?.GASLIMIT;
      // Jika config GASLIMIT tersedia DAN gasUnits dari API lebih besar → cap
      if (configGasLimit && configGasLimit > 0 && gasUnitsRaw > configGasLimit) {
        return configGasLimit;
      }
      return gasUnitsRaw;
    } catch (_) {
      return gasUnitsRaw;
    }
  }

  // ============================================================================
  // STRATEGY TIMEOUT HELPER
  // ============================================================================
  /**
   * Get timeout for a specific strategy from CONFIG_UI.SETTINGS.timeout
   * Supports exact match, wildcard patterns (e.g., 'lifi-*'), and default fallback.
   * 
   * @param {string} strategyName - The strategy name (e.g., 'kyber', 'lifi-odos', 'swoop-velora')
   * @returns {number} - Timeout in milliseconds
   * 
   * Priority:
   * 1. Exact match (e.g., 'kyber' → 3000)
   * 2. Wildcard match (e.g., 'lifi-odos' matches 'lifi-*' → 6000)
   * 3. Default fallback ('default' → 5000)
   */
  function getStrategyTimeout(strategyName) {
    const timeoutConfig = (root.CONFIG_UI?.SETTINGS?.timeout) || {};
    const sKey = String(strategyName || '').toLowerCase();

    // 1. Exact match
    if (timeoutConfig[sKey] !== undefined) {
      return timeoutConfig[sKey];
    }

    // 2. Wildcard match (e.g., 'lifi-*' matches 'lifi-odos')
    for (const pattern of Object.keys(timeoutConfig)) {
      if (pattern.endsWith('-*')) {
        const prefix = pattern.slice(0, -1); // Remove '*' → 'lifi-'
        if (sKey.startsWith(prefix)) {
          return timeoutConfig[pattern];
        }
      }
    }

    // 3. Default fallback
    return timeoutConfig['default'] || 5000;
  }

  // Expose to window for external access
  root.getStrategyTimeout = getStrategyTimeout;

  /**
   * Filter out blacklisted providers from MetaDEX subResults.
   * Uses CONFIG_APP.META_DEX_CONFIG.settings.filterScanner.offDexResultScan.
   * Provider names are matched case-insensitively against dexTitle.
   *
   * @param {Array} subResults - Array of { amount_out, FeeSwap, dexTitle, ... }
   * @returns {Array} Filtered array with blacklisted providers removed
   */
  function filterOffDexResults(subResults) {
    try {
      const blacklist = root.CONFIG_APP?.META_DEX_CONFIG?.settings?.filterScanner?.offDexResultScan;
      if (!Array.isArray(blacklist) || blacklist.length === 0) return subResults;
      const offSet = new Set(blacklist.map(x => String(x).toUpperCase()));
      const filtered = subResults.filter(r => !offSet.has(String(r.dexTitle || '').toUpperCase()));
      if (filtered.length < subResults.length) {
        console.log(`[META-DEX] Filtered out ${subResults.length - filtered.length} blacklisted provider(s): ${blacklist.join(', ')}`);
      }
      return filtered;
    } catch (_) {
      return subResults;
    }
  }

  const dexStrategies = {
    kyber: {
      buildRequest: ({ chainName, sc_input, sc_output, amount_in_big }) => {
        // Custom LP selection - daftar LP yang digunakan (dapat disesuaikan per chain)
        const includedSources = [
          // Major DEXes
          'uniswap', 'uniswapv3', 'uniswap-v4',
          'sushiswap', 'sushiswap-v3',
          'pancake', 'pancake-v3', 'pancake-stable',
          'kyberswap', 'kyberswap-static', 'kyberswap-limit-order-v2', 'kyber-pmm',
          'curve', 'curve-stable-ng', 'curve-stable-plain', 'curve-tricrypto-ng', 'curve-twocrypto-ng',
          'balancer-v2-stable', 'balancer-v2-weighted', 'balancer-v3-stable', 'balancer-v3-weighted',
          // Aggregators & Advanced
          'maverick-v1', 'maverick-v2',
          'dodo-classical', 'dodo-dpp', 'dodo-dsp', 'dodo-dvm',
          'fraxswap', 'solidly-v2', 'solidly-v3',
          'traderjoe-v21',
          // Stablecoins & Specialized
          'maker-psm', 'lite-psm', 'usds-lite-psm',
          'aave-v3', 'compound-v2', 'compound-v3',
          // Ethereum Specific
          'lido', 'lido-steth', 'rocketpool-reth',
          'bancor-v3', 'hashflow-v3',
          // Additional protocols
          'odos', 'paraswap', '0x',
          'wombat', 'smardex', 'verse'
        ].join(',');

        const kyberUrl = `https://aggregator-api.kyberswap.com/${chainName.toLowerCase()}/api/v1/routes?tokenIn=${sc_input}&tokenOut=${sc_output}&amountIn=${amount_in_big}&gasInclude=true`;
        return { url: kyberUrl, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response?.data?.routeSummary) throw new Error("Invalid KyberSwap response structure");
        // ⚠️ CATATAN: Kyber API mengembalikan field gasUsd dan gas (units) yang SANGAT BESAR
        // (contoh: gas: "743993" untuk swap BSC) karena mencakup multi-source routing internal.
        // Menggunakan gasUsd dari API akan inflate FeeSwap secara tidak realistis.
        // → Gunakan getFeeSwap(chainName) saja: GASLIMIT config × gasPrice RPC (lebih akurat)
        return {
          amount_out: response.data.routeSummary.amountOut / Math.pow(10, des_output),
          FeeSwap: getFeeSwap(chainName),
          feeSource: 'fallback',
          dexTitle: 'KYBER',
          routeTool: 'KYBER'  // Official KyberSwap API
        };
      }
    },
    // ✅ Relay - Cross-chain bridge & swap aggregator
    relay: {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';

        const requestBody = {
          user: userAddr,
          originChainId: codeChain,
          destinationChainId: codeChain, // Same chain swap
          originCurrency: sc_input.toLowerCase(),
          destinationCurrency: sc_output.toLowerCase(),
          amount: amount_in_big.toString(),
          tradeType: 'EXACT_INPUT'
        };

        return {
          url: 'https://api.relay.link/quote/v2',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          data: JSON.stringify(requestBody)
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        // Parse Relay API v2 response
        const details = response?.details;
        if (!details || !details.currencyOut) {
          throw new Error("Invalid Relay response structure");
        }

        const amountOutRaw = details.currencyOut.amountFormatted || details.currencyOut.amount;
        if (!amountOutRaw) throw new Error("Relay: amountOut not found");

        const amount_out = parseFloat(amountOutRaw);
        if (!Number.isFinite(amount_out) || amount_out <= 0) {
          throw new Error("Relay: invalid amount_out");
        }

        // Get gas fee from response (relayer + gas fees)
        const gasFeesUsd = parseFloat(details.totalImpact?.usd || response?.fees?.gas?.amountUsd || 0);
        const { FeeSwap, feeSource } = resolveFeeSwap(gasFeesUsd, 0, chainName);

        return {
          amount_out,
          FeeSwap,
          feeSource,
          dexTitle: 'RELAY',
          routeTool: 'RELAY'  // Official Relay API
        };
      }
    },
    velora6: {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, des_input, des_output, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const params = new URLSearchParams({
          version: '6.2',
          network: String(codeChain || ''),
          srcToken: sc_input,
          destToken: sc_output,
          amount: amount_in_big.toString(),
          side: 'SELL',
          srcDecimals: String(des_input),
          destDecimals: String(des_output),
          otherExchangePrices: 'true',
          partner: 'paraswap.io',
          userAddress: userAddr
        });
        return {
          url: `https://api.paraswap.io/prices/?${params.toString()}`,
          method: 'GET'
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const route = response?.priceRoute;
        const destAmountStr = route?.destAmount;
        if (!destAmountStr) throw new Error('Invalid Velora v6 response');
        const destAmountNum = parseFloat(destAmountStr);
        if (!Number.isFinite(destAmountNum) || destAmountNum <= 0) throw new Error('Invalid Velora v6 dest amount');
        const amount_out = destAmountNum / Math.pow(10, des_output);
        const gasUsd = parseFloat(route.gasCostUSD || route.estimatedGasCostUSD || response?.gasCostUSD || 0);
        const FeeSwap = (Number.isFinite(gasUsd) && gasUsd > 0) ? gasUsd : getFeeSwap(chainName);
        return {
          amount_out,
          FeeSwap,
          dexTitle: 'VELORA',
          routeTool: 'VELORA V6'
        };
      }
    },
    velora5: {
      /**
       * Velora v5 (ParaSwap v5 API)
       * Endpoint: https://apiv5.paraswap.io/prices/
       * 
       * Used as alternative/fallback when velora6 fails.
       * Note: v5 API has slightly different parameter names.
       */
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, des_input, des_output, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const params = new URLSearchParams({
          srcToken: sc_input,
          destToken: sc_output,
          amount: amount_in_big.toString(),
          srcDecimals: String(des_input),
          destDecimals: String(des_output),
          partner: 'llamaswap',
          side: 'SELL',
          network: String(codeChain || ''),
          excludeDEXS: 'ParaSwapPool,ParaSwapLimitOrders',
          version: '6.2'
        });
        return {
          url: `https://apiv5.paraswap.io/prices/?${params.toString()}`,
          method: 'GET'
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const route = response?.priceRoute;
        const destAmountStr = route?.destAmount;
        if (!destAmountStr) throw new Error('Invalid Velora v5 response');
        const destAmountNum = parseFloat(destAmountStr);
        if (!Number.isFinite(destAmountNum) || destAmountNum <= 0) throw new Error('Invalid Velora v5 dest amount');
        const amount_out = destAmountNum / Math.pow(10, des_output);
        const gasUsd = parseFloat(route.gasCostUSD || route.estimatedGasCostUSD || response?.gasCostUSD || 0);
        const { FeeSwap, feeSource } = resolveFeeSwap(gasUsd, 0, chainName);
        return {
          amount_out,
          FeeSwap,
          feeSource,
          dexTitle: 'VELORA',
          routeTool: 'VELORA V5'
        };
      }
    },
    'hinkal1-odos': {
      /**
       * Hinkal ODOS Proxy - Privacy-focused ODOS integration
       * Endpoint: https://ethmainnet.server.hinkal.pro/OdosSwapData
       *
       * This proxy wraps the official ODOS API with privacy features.
       * Request format matches official ODOS API (see createOdosStrategy above).
       *
       * Response wraps ODOS data in: { odosResponse: {...} }
       * - odosResponse.outputTokens[0].amount: Output in wei
       * - odosResponse.gasEstimateValue: Gas cost in USD
       *
       * NOTE: Typically 1-2 seconds faster than direct ODOS API v2/v3
       */
      buildRequest: ({ codeChain, SavedSettingData, amount_in_big, sc_input_in, sc_output_in }) => {
        const wallet = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        // CRITICAL FIX: Use checksummed addresses (sc_input_in/sc_output_in)
        return {
          url: 'https://ethmainnet.server.hinkal.pro/OdosSwapData',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          data: JSON.stringify({
            chainId: codeChain,
            inputTokens: [{
              tokenAddress: sc_input_in,  // ✅ Use checksummed address
              amount: amount_in_big.toString()
            }],
            outputTokens: [{
              tokenAddress: sc_output_in,  // ✅ Use checksummed address
              proportion: 1
            }],
            userAddr: wallet,
            slippageLimitPercent: parseFloat(getSlippageValue()),  // ✅ USER-CONFIGURABLE
            referralCode: 0,
            sourceBlacklist: [],        // Optional: exclude specific sources
            sourceWhitelist: [],        // Optional: only use specific sources
            simulate: false,            // Set to true for simulation mode
            disableRFQs: true,         // Disable RFQ for reliability
            compact: true              // Enable compact call data
          })
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        // Hinkal wraps ODOS response in odosResponse object
        const odosData = response?.odosResponse;
        if (!odosData) throw new Error('Invalid Hinkal-ODOS response: missing odosResponse');

        // Parse output amount from outputTokens array (wei format)
        const outRawStr = odosData.outputTokens?.[0]?.amount;
        if (!outRawStr) throw new Error('Invalid Hinkal-ODOS response: missing outputTokens');

        const outRaw = parseFloat(outRawStr);
        if (!Number.isFinite(outRaw) || outRaw <= 0) {
          throw new Error(`Invalid Hinkal-ODOS output amount: ${outRawStr}`);
        }

        const amount_out = outRaw / Math.pow(10, des_output);

        // Parse gas estimate (prefer odosResponse nested value)
        const feeUsd = parseFloat(
          odosData.gasEstimateValue ||
          response?.gasEstimateValue ||
          0
        );
        const FeeSwap = (Number.isFinite(feeUsd) && feeUsd > 0)
          ? feeUsd
          : getFeeSwap(chainName);

        return {
          amount_out,
          FeeSwap,
          dexTitle: 'ODOS',
          routeTool: 'HINKAL-ODOS'  // Track that it came via Hinkal proxy
        };
      }
    },
    'hinkal2-odos': {
      /**
       * Hinkal ODOS2 Proxy - Alternative Hinkal ODOS endpoint
       * Endpoint: https://wallet-prodv11.hinkal.pro/server/OdosSwapData
       */
      buildRequest: ({ codeChain, SavedSettingData, amount_in_big, sc_input_in, sc_output_in }) => {
        const wallet = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        return {
          url: 'https://wallet-prodv11.hinkal.pro/server/OdosSwapData',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          data: JSON.stringify({
            chainId: codeChain,
            inputTokens: [{
              tokenAddress: sc_input_in,
              amount: amount_in_big.toString()
            }],
            outputTokens: [{
              tokenAddress: sc_output_in,
              proportion: 1
            }],
            userAddr: wallet,
            slippageLimitPercent: parseFloat(getSlippageValue()),
            disableRFQs: true
          })
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const odosData = response?.odosResponse;
        if (!odosData) throw new Error('Invalid Hinkal-ODOS2 response: missing odosResponse');

        const outRawStr = odosData.outputTokens?.[0]?.amount;
        if (!outRawStr) throw new Error('Invalid Hinkal-ODOS2 response: missing outputTokens');

        const outRaw = parseFloat(outRawStr);
        if (!Number.isFinite(outRaw) || outRaw <= 0) {
          throw new Error(`Invalid Hinkal-ODOS2 output amount: ${outRawStr}`);
        }

        const amount_out = outRaw / Math.pow(10, des_output);

        const feeUsd = parseFloat(
          odosData.gasEstimateValue ||
          response?.gasEstimateValue ||
          0
        );
        const FeeSwap = (Number.isFinite(feeUsd) && feeUsd > 0)
          ? feeUsd
          : getFeeSwap(chainName);

        return {
          amount_out,
          FeeSwap,
          dexTitle: 'ODOS',
          routeTool: 'HINKAL-ODOS'
        };
      }
    },
    'hinkal-1inch': {
      /**
       * Hinkal 1inch Proxy - Privacy-focused 1inch integration
       * Endpoint: POST https://ethmainnet.server.hinkal.pro/OneInchSwapData
       *
       * This proxy wraps the 1inch Swap API v5.2 with privacy features.
       * Request: { url: "https://api.1inch.dev/swap/v5.2/{chainId}/swap?..." }
       * Response: { oneInchResponse: { toAmount: "...", tx: { gas: ... } } }
       *
       * No 1inch API key needed — Hinkal handles authentication.
       */
      buildRequest: ({ sc_input_in, sc_output_in, amount_in_big, SavedSettingData, codeChain }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const chainId = codeChain || 1;

        const requestData = {
          url: `https://api.1inch.dev/swap/v5.2/${chainId}/swap?` +
            `fromTokenAddress=${sc_input_in}` +
            `&toTokenAddress=${sc_output_in}` +
            `&amount=${amount_in_big}` +
            `&fromAddress=${userAddr}` +
            `&slippage=${getSlippageValue()}` +
            `&destReceiver=${userAddr}` +
            `&disableEstimate=true`
        };

        return {
          url: 'https://ethmainnet.server.hinkal.pro/OneInchSwapData',
          method: 'POST',
          data: JSON.stringify(requestData),
          headers: { 'Content-Type': 'application/json' }
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const outAmount = response?.oneInchResponse?.toAmount;
        if (!outAmount || parseFloat(outAmount) <= 0) {
          throw new Error('Invalid Hinkal-1inch response: missing or zero toAmount');
        }

        const amount_out = parseFloat(outAmount) / Math.pow(10, des_output);

        // Gas estimate with fallback
        let gasEstimate = parseFloat(response?.oneInchResponse?.tx?.gas || 0);
        if (!gasEstimate || gasEstimate === 0) gasEstimate = 350000;

        // Override gas price to 0.1 Gwei for privacy calculation
        const gweiOverride = 0.1;
        const calculatedFee = calculateGasFeeUSD(chainName, gasEstimate, gweiOverride);
        const FeeSwap = (Number.isFinite(calculatedFee) && calculatedFee > 0)
          ? calculatedFee
          : getFeeSwap(chainName);

        console.log(`[Hinkal-1inch] toAmount: ${outAmount}, out: ${amount_out.toFixed(6)}, gas: $${FeeSwap.toFixed(4)}`);

        return {
          amount_out,
          FeeSwap,
          dexTitle: '1INCH',
          routeTool: 'HINKAL-1INCH'
        };
      }
    },
    'enkrypt-1inch': {
      proxy: true,
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const nativeAddresses = ['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '0x0000000000000000000000000000000000000000'];

        const srcToken = nativeAddresses.includes(sc_input.toLowerCase()) ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : sc_input.toLowerCase();
        const dstToken = nativeAddresses.includes(sc_output.toLowerCase()) ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' : sc_output.toLowerCase();

        const chainId = codeChain || 1;
        const params = new URLSearchParams({
          src: srcToken,
          dst: dstToken,
          amount: String(amount_in_big),
          from: userAddr,
          receiver: userAddr,
          slippage: typeof getSlippageValue === 'function' ? getSlippageValue() : '0.5',
          fee: '0.875',
          referrer: '0x551d9d8eb02e1c713009da8f7c194870d651054a',
          disableEstimate: 'true'
        });

        return {
          url: `https://partners.mewapi.io/oneinch/v6.0/${chainId}/swap?${params.toString()}`,
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response || !response.dstAmount) {
          throw new Error('ENKRYPT-1INCH: Invalid response, missing dstAmount');
        }

        const amount_out = parseFloat(response.dstAmount) / Math.pow(10, des_output);

        let gasEstimate = 350000;
        if (response.tx && response.tx.gas) {
          gasEstimate = parseFloat(response.tx.gas);
        }

        const gweiOverride = 0.1;
        const calculatedFee = typeof calculateGasFeeUSD === 'function' ? calculateGasFeeUSD(chainName, gasEstimate, gweiOverride) : 0;
        const FeeSwap = (Number.isFinite(calculatedFee) && calculatedFee > 0)
          ? calculatedFee
          : typeof getFeeSwap === 'function' ? getFeeSwap(chainName) : 0;

        return {
          amount_out,
          FeeSwap,
          dexTitle: '1INCH',
          routeTool: 'ENKRYPT-1INCH'
        };
      }
    },
    'zero-kyber': {
      buildRequest: ({ sc_input, sc_output, amount_in_big, des_input, des_output, codeChain }) => {
        const baseUrl = 'https://api.zeroswap.io/quote/kyberswap';
        const params = new URLSearchParams({
          fromChain: codeChain,
          fromTokenAddress: sc_input,
          toTokenAddress: sc_output,
          fromTokenDecimals: des_input,
          toTokenDecimals: des_output,
          sellAmount: String(amount_in_big),
          slippage: getSlippageValue()
        });
        return { url: `${baseUrl}?${params.toString()}`, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const q = response?.quote;
        const buyAmount = q?.estimation?.buyAmount;
        if (!buyAmount) throw new Error('Invalid ZeroSwap Kyber response');
        const amount_out = parseFloat(buyAmount) / Math.pow(10, des_output);

        // Coba ambil fee dari response ZeroSwap sebelum fallback
        let _zeroDirectUsd = 0;
        try {
          _zeroDirectUsd = parseFloat(
            q?.estimation?.gasFee ||
            q?.gasUsd ||
            response?.gasUsd ||
            response?.gasCostUSD ||
            0
          );
          if (!(_zeroDirectUsd > 0 && _zeroDirectUsd < 100)) _zeroDirectUsd = 0;
        } catch (_) { }
        const { FeeSwap: _zFee, feeSource: _zSrc } = resolveFeeSwap(_zeroDirectUsd, 0, chainName);

        return { amount_out, FeeSwap: _zFee, feeSource: _zSrc, dexTitle: 'KYBER', routeTool: 'ZEROSWAP' };
      }
    },
    matcha: {
      buildRequest: ({ chainName, sc_input_in, sc_output_in, amount_in_big, codeChain, sc_output, sc_input, SavedSettingData }) => {
        /**
         * Matcha API - Official 0x Documentation
         * Docs: https://0x.org/docs/api
         * Dashboard: https://dashboard.0x.org
         *
         * CHAIN SUPPORT:
         * - EVM chains: Official 0x API (api.0x.org)
         * - Solana: Matcha Solana API (matcha.xyz/api/swap/quote/solana)
         */

        const isSolana = chainName && String(chainName).toLowerCase() === 'solana';

        // ========== SOLANA CHAIN ==========
        if (isSolana) {
          // Matcha Solana API endpoint
          const baseUrl = 'https://matcha.xyz/api/swap/quote/solana';

          const params = new URLSearchParams({
            sellTokenAddress: sc_input_in,        // Solana token address (base58, case-sensitive)
            buyTokenAddress: sc_output_in,         // Solana token address (base58, case-sensitive)
            sellAmount: String(amount_in_big),     // Amount in base units (lamports)
            dynamicSlippage: 'true',               // Enable dynamic slippage
            slippageBps: String(Math.round(parseFloat(getSlippageValue()) * 100))  // USER-CONFIGURABLE (bps)
          });

          const url = `${baseUrl}?${params.toString()}`;

          console.log(`[Matcha Solana] Request: ${sc_input_in} -> ${sc_output_in}`);

          return { url, method: 'GET', headers: {} };
        }

        // ========== EVM CHAINS ==========
        // ℹ️ EVM Matcha no longer uses direct 0x API (no API key needed)
        // EVM chains should route through proxy strategies:
        //   delta-matcha, c98-matcha, rainbow-matcha, rabby-matcha
        // This direct strategy is only for SOLANA
        throw new Error('[Matcha] Direct 0x API disabled for EVM. Use proxy strategies (delta-matcha, c98-matcha, etc.)');
      },
      parseResponse: (response, { des_output, des_input, chainName }) => {
        const isSolana = chainName && String(chainName).toLowerCase() === 'solana';

        // ========== SOLANA RESPONSE PARSING ==========
        if (isSolana) {
          /**
           * Matcha Solana API Response Format:
           * {
           *   "buyAmount": "37124",
           *   "sellAmount": "1000000",
           *   "totalNetworkFee": "1400",
           *   "route": {
           *     "fills": [
           *       { "from": "token", "to": "token", "source": "DEX", "proportionBps": 100 }
           *     ],
           *     "tokens": [...]
           *   },
           *   "transaction": "base64_encoded",
           *   "isDynamicSlippage": true,
           *   "maxSlippageBps": 80
           * }
           */

          if (!response?.buyAmount) {
            throw new Error("Invalid Matcha Solana response - missing buyAmount");
          }

          // Parse buyAmount from response (already in base units)
          const buyAmount = parseFloat(response.buyAmount);
          const amount_out = buyAmount / Math.pow(10, des_output);

          // Parse network fee from totalNetworkFee (in lamports, convert to SOL then USD)
          let FeeSwap = getFeeSwap(chainName);
          try {
            const networkFeeLamports = parseFloat(response.totalNetworkFee || 0);
            if (networkFeeLamports > 0) {
              // Convert lamports to SOL (1 SOL = 1e9 lamports)
              const networkFeeSol = networkFeeLamports / 1e9;

              // Get SOL price from gas data
              const allGasData = (typeof getFromLocalStorage === 'function')
                ? getFromLocalStorage("ALL_GAS_FEES")
                : null;

              if (allGasData) {
                const gasInfo = allGasData.find(g =>
                  String(g.chain || '').toLowerCase() === 'solana'
                );

                if (gasInfo && gasInfo.nativeTokenPrice) {
                  const feeUsd = networkFeeSol * gasInfo.nativeTokenPrice;
                  if (Number.isFinite(feeUsd) && feeUsd > 0) {
                    FeeSwap = feeUsd;
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[Matcha Solana] Could not parse network fee, using default');
          }

          // Log route information
          if (response.route?.fills) {
            const sources = response.route.fills
              .map(f => f.source)
              .filter((v, i, a) => v && a.indexOf(v) === i);
            console.log(`[Matcha Solana] Route: ${sources.join(' → ')}`);
          }

          console.log(`[Matcha Solana] Response parsed:`, {
            buyAmount: response.buyAmount,
            amountOut: amount_out.toFixed(6),
            networkFee: response.totalNetworkFee,
            feeSwap: FeeSwap.toFixed(4),
            hops: response.route?.fills?.length || 0
          });

          return {
            amount_out,
            FeeSwap,
            dexTitle: 'MATCHA',
            routeTool: 'MATCHA'
          };
        }

        // ========== EVM RESPONSE PARSING ==========
        /**
         * Parse 0x API response (allowance-holder endpoint)
         * Response format: https://0x.org/docs/api#tag/Swap/operation/swap::allowanceHolder::getQuote
         *
         * Key fields:
         * - buyAmount: Amount of buyToken (in base units)
         * - minBuyAmount: Minimum amount accounting for slippage
         * - allowanceTarget: Contract address for token approval
         * - transaction: { gas, gasPrice, value, to, data }
         * - fees: { integratorFee, zeroExFee, gasFee }
         * - route: { fills[], tokens[] } - Liquidity routing details
         * - issues: { allowance, balance, simulationIncomplete, invalidSourcesPassed }
         */

        if (!response?.buyAmount) {
          throw new Error("Invalid 0x API response - missing buyAmount");
        }

        const buyAmount = parseFloat(response.buyAmount);
        const amount_out = buyAmount / Math.pow(10, des_output);

        let _mDirectUsd = 0;
        let _mCalcUsd = 0;
        try {
          if (response.fees?.gasFee) {
            _mDirectUsd = parseFloat(response.fees.gasFee.amount || 0) || 0;
          }
          if (!(_mDirectUsd > 0) && response.transaction?.gas && response.transaction?.gasPrice) {
            const gasLimitRaw = parseFloat(response.transaction.gas);
            const gasPriceWei = parseFloat(response.transaction.gasPrice);
            if (gasLimitRaw > 0 && gasPriceWei > 0) {
              const gasLimit = capGasUnits(gasLimitRaw, chainName); // ✅ cap dengan GASLIMIT config
              const allGasData = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage('ALL_GAS_FEES') : null;
              if (allGasData) {
                const gasInfo = allGasData.find(g => String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase());
                if (gasInfo?.tokenPrice) {
                  _mCalcUsd = (gasLimit * gasPriceWei / 1e18) * gasInfo.tokenPrice;
                }
              }
            }
          }
        } catch (e) {
          console.warn('[0x API] Could not parse gas fee from response, using default');
        }
        const { FeeSwap, feeSource } = resolveFeeSwap(_mDirectUsd, _mCalcUsd, chainName);

        console.log(`[Matcha API] Response parsed:`, {
          buyAmount: response.buyAmount,
          minBuyAmount: response.minBuyAmount,
          amountOut: amount_out.toFixed(6),
          decimals: des_output,
          gas: response.transaction?.gas,
          gasPrice: response.transaction?.gasPrice,
          sources: response.route?.fills?.length || 0,
          chainName
        });

        return {
          amount_out,
          FeeSwap,
          feeSource,
          dexTitle: 'MATCHA',
          routeTool: 'MATCHA'
        };
      }
    },
    'delta-matcha': {
      buildRequest: ({ chainName, sc_input_in, sc_output_in, amount_in_big, codeChain, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const baseUrl = 'https://api.1delta.io/swap/allowance-holder/quote';
        const params = new URLSearchParams({
          chainId: String(codeChain),
          sellToken: sc_input_in,
          buyToken: sc_output_in,
          sellAmount: String(amount_in_big),
          taker: userAddr,
          slippageBps: String(Math.round(parseFloat(getSlippageValue()) * 100)),  // USER-CONFIGURABLE (bps)
          tradeSurplusRecipient: userAddr,
          aggregator: '0x'
        });
        const url = `${baseUrl}?${params.toString()}`;
        console.log(`[1Delta Matcha] Request: ${chainName} ${sc_input_in} -> ${sc_output_in}`);
        return { url, method: 'GET', headers: {} };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response?.buyAmount) throw new Error("Invalid 1Delta response - missing buyAmount");
        const amount_out = parseFloat(response.buyAmount) / Math.pow(10, des_output);

        let _dDirectUsd = 0;
        try {
          if (response.fees?.gasFee) {
            const gasFeeWei = parseFloat(response.fees.gasFee.amount || 0);
            if (gasFeeWei > 0) {
              const allGasData = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage("ALL_GAS_FEES") : null;
              if (allGasData) {
                const gasInfo = allGasData.find(g => String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase());
                if (gasInfo?.tokenPrice) _dDirectUsd = (gasFeeWei / 1e18) * gasInfo.tokenPrice;
              }
            }
          }
        } catch (e) { console.warn('[1Delta] Could not parse gas fee, using default'); }
        const { FeeSwap, feeSource } = resolveFeeSwap(_dDirectUsd, 0, chainName);

        return { amount_out, FeeSwap, feeSource, dexTitle: 'MATCHA', routeTool: '1DELTA' };
      }
    },

    'rainbow-matcha': {
      buildRequest: ({ codeChain, sc_input_in, sc_output_in, amount_in_big, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const params = new URLSearchParams({
          allowFallback: 'true',
          buyToken: sc_output_in,
          chainId: String(codeChain),
          currency: 'USD',
          enableNewChainSwaps: 'true',
          fromAddress: userAddr,
          sellToken: sc_input_in,
          slippage: getSlippageValue(),
          source: '0x',
          sellAmount: String(amount_in_big)
        });
        return {
          url: `https://swap.p.rainbow.me/v1/quote?${params.toString()}`,
          method: 'GET',
          headers: {}
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response?.buyAmount) throw new Error("Invalid Rainbow response - missing buyAmount");
        const amount_out = parseFloat(response.buyAmount) / Math.pow(10, des_output);

        let _rDirectUsd = 0;
        let _rCalcUsd = 0;
        try {
          if (response.fees?.gasFee) {
            const gasFeeWei = parseFloat(response.fees.gasFee.amount || 0);
            if (gasFeeWei > 0) {
              const allGasData = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage("ALL_GAS_FEES") : null;
              if (allGasData) {
                const gasInfo = allGasData.find(g => String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase());
                if (gasInfo?.tokenPrice) _rCalcUsd = (gasFeeWei / 1e18) * gasInfo.tokenPrice;
              }
            }
          } else if (response.gas?.usdValue) {
            _rDirectUsd = parseFloat(response.gas.usdValue || 0);
          }
        } catch (e) { console.warn('[Rainbow-Matcha] Could not parse gas fee, using default'); }
        const { FeeSwap, feeSource } = resolveFeeSwap(_rDirectUsd, _rCalcUsd, chainName);

        return { amount_out, FeeSwap, feeSource, dexTitle: 'MATCHA', routeTool: 'RAINBOW' };
      }
    },

    'rainbow-1inch': {
      buildRequest: ({ codeChain, sc_input_in, sc_output_in, amount_in_big, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const params = new URLSearchParams({
          allowFallback: 'true',
          buyToken: sc_output_in,
          chainId: String(codeChain),
          currency: 'USD',
          enableNewChainSwaps: 'true',
          fromAddress: userAddr,
          sellToken: sc_input_in,
          slippage: getSlippageValue(),
          source: '1inch',
          sellAmount: String(amount_in_big)
        });
        return {
          url: `https://swap.p.rainbow.me/v1/quote?${params.toString()}`,
          method: 'GET',
          headers: {}
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response?.buyAmount) throw new Error("Invalid Rainbow-1inch response - missing buyAmount");
        const amount_out = parseFloat(response.buyAmount) / Math.pow(10, des_output);

        let _r1DirectUsd = 0;
        try {
          if (response.tradeFeeAmountUSD) {
            _r1DirectUsd = parseFloat(response.tradeFeeAmountUSD || 0);
          } else if (response.fees?.gasFee) {
            _r1DirectUsd = parseFloat(response.fees.gasFee.amount || 0);
          }
        } catch (e) { console.warn('[Rainbow-1inch] Could not parse gas fee, using default'); }
        const { FeeSwap, feeSource } = resolveFeeSwap(_r1DirectUsd, 0, chainName);

        return { amount_out, FeeSwap, feeSource, dexTitle: '1INCH', routeTool: 'RAINBOW' };
      }
    },

    okx: {
      buildRequest: ({ amount_in_big, codeChain, sc_input_in, sc_output_in }) => {
        const selectedApiKey = getRandomApiKeyOKX(apiKeysOKXDEX);
        const timestamp = new Date().toISOString();
        const path = "/api/v6/dex/aggregator/quote";
        const queryParams = `amount=${amount_in_big}&chainIndex=${codeChain}&fromTokenAddress=${sc_input_in}&toTokenAddress=${sc_output_in}`;
        const dataToSign = timestamp + "GET" + path + "?" + queryParams;
        const signature = calculateSignature("OKX", selectedApiKey.secretKeyOKX, dataToSign);
        return {
          url: `https://web3.okx.com${path}?${queryParams}`,
          method: 'GET',
          headers: { "OK-ACCESS-KEY": selectedApiKey.ApiKeyOKX, "OK-ACCESS-SIGN": signature, "OK-ACCESS-PASSPHRASE": selectedApiKey.PassphraseOKX, "OK-ACCESS-TIMESTAMP": timestamp, "Content-Type": "application/json" }
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const d0 = (Array.isArray(response?.data)) ? response.data[0] : (Array.isArray(response?.data?.data) ? response.data.data[0] : null);
        if (!d0 || (!d0.toTokenAmount && !d0.routerResult?.toTokenAmount)) throw new Error("Invalid OKX response structure: amount not found");
        const data = d0;
        const amount_out = parseFloat(data.toTokenAmount) / Math.pow(10, des_output);

        let _oCalcUsd = 0;
        try {
          const gasUnitsRaw = parseFloat(data.estimateGasFee || 0);
          if (gasUnitsRaw > 0) {
            const gasUnits = capGasUnits(gasUnitsRaw, chainName); // ✅ cap dengan GASLIMIT config
            const allGasData = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage("ALL_GAS_FEES") : null;
            if (allGasData) {
              const gasInfo = allGasData.find(g => String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase());
              if (gasInfo?.gwei && gasInfo?.tokenPrice) {
                _oCalcUsd = (parseFloat(gasInfo.gwei) * gasUnits / 1e9) * parseFloat(gasInfo.tokenPrice);
              }
            }
          }
        } catch (e) { }
        const { FeeSwap, feeSource } = resolveFeeSwap(0, _oCalcUsd, chainName);

        return { amount_out, FeeSwap, feeSource, dexTitle: 'OKX', routeTool: 'OKX' };
      }
    },
    sushi: {
      buildRequest: ({ codeChain, sc_input_in, sc_output_in, amount_in_big, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const baseUrl = `https://api.sushi.com/swap/v7/${codeChain}`;
        const params = new URLSearchParams({
          tokenIn: sc_input_in,
          tokenOut: sc_output_in,
          amount: String(amount_in_big),
          maxSlippage: getSlippageValue(),
          sender: userAddr
        });
        return { url: `${baseUrl}?${params.toString()}`, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response?.assumedAmountOut) throw new Error("Invalid Sushi API response - missing assumedAmountOut");
        const amount_out = parseFloat(response.assumedAmountOut) / Math.pow(10, des_output);

        let _sCalcUsd = 0;
        try {
          const gasUnitsRaw = parseFloat(response.gasSpent || 0);
          const gasPriceWei = parseFloat(response.tx?.gasPrice || 0);
          if (gasUnitsRaw > 0 && gasPriceWei > 0) {
            const gasUnits = capGasUnits(gasUnitsRaw, chainName); // ✅ cap dengan GASLIMIT config
            const allGasData = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage("ALL_GAS_FEES") : null;
            if (allGasData) {
              const gasInfo = allGasData.find(g => String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase());
              if (gasInfo?.nativeTokenPrice) {
                _sCalcUsd = (gasUnits * gasPriceWei * gasInfo.nativeTokenPrice) / 1e18;
              }
            }
          }
        } catch (e) { }
        const { FeeSwap, feeSource } = resolveFeeSwap(0, _sCalcUsd, chainName);

        return { amount_out, FeeSwap, feeSource, dexTitle: 'SUSHI', routeTool: 'SUSHI' };
      }
    },
    flytrade: {
      buildRequest: ({ codeChain, chainName, sc_input_in, sc_output_in, amount_in_big, SavedSettingData }) => {
        const chainMap = { 1: 'ethereum', 56: 'bsc', 137: 'polygon', 42161: 'arbitrum', 8453: 'base', 10: 'optimism', 43114: 'avalanche' };
        const network = chainMap[Number(codeChain)] || String(chainName || '').toLowerCase();
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const params = new URLSearchParams({
          network: network,
          fromTokenAddress: sc_input_in,
          toTokenAddress: sc_output_in,
          sellAmount: String(amount_in_big),
          slippage: String(parseFloat(getSlippageValue()) / 100),  // USER-CONFIGURABLE (fraction)
          gasless: 'false',
          fromAddress: userAddr,
          toAddress: userAddr
        });
        return { url: `https://api.fly.trade/aggregator/quote?${params.toString()}`, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const outputRaw = response?.toAmount || response?.buyAmount || response?.outputAmount || response?.amountOut;
        if (!outputRaw) throw new Error("Invalid Flytrade response - missing output amount field");
        const amount_out = parseFloat(outputRaw) / Math.pow(10, des_output);

        let _ftDirectUsd = 0;
        let _ftCalcUsd = 0;
        try {
          _ftDirectUsd = parseFloat(response?.gasCostUSD || response?.gasEstimateUSD || response?.gasFeeUsd || response?.feeUsd || response?.gas?.usdValue || 0) || 0;
          if (!(_ftDirectUsd > 0 && _ftDirectUsd < 100)) _ftDirectUsd = 0;
          if (!(_ftDirectUsd > 0)) {
            const gasUnitsRaw = parseFloat(response?.estimatedGas || response?.gasCost || response?.gasEstimate || 0) || 0;
            if (gasUnitsRaw > 0) {
              const gasUnits = capGasUnits(gasUnitsRaw, chainName); // ✅ cap dengan GASLIMIT config
              const allGasData = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage('ALL_GAS_FEES') : null;
              if (allGasData) {
                const gasInfo = allGasData.find(g => String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase());
                if (gasInfo?.gwei && gasInfo?.tokenPrice) _ftCalcUsd = (gasUnits * gasInfo.gwei * gasInfo.tokenPrice) / 1e9;
              }
            }
          }
        } catch (e) { }
        const { FeeSwap, feeSource } = resolveFeeSwap(_ftDirectUsd, _ftCalcUsd, chainName);

        return { amount_out, FeeSwap, feeSource, dexTitle: 'FLYTRADE', routeTool: 'FLYTRADE' };
      }
    },
    'dexview-okx': {
      proxy: true,  // ✅ Proxy required — CORS restriction on api.dexview.com
      buildRequest: ({ codeChain, sc_input_in, sc_output_in, amount_in_big, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const params = new URLSearchParams({
          chainIndex: String(codeChain),
          amount: String(amount_in_big),
          fromTokenAddress: sc_input_in,
          toTokenAddress: sc_output_in,
          userWalletAddress: userAddr,
          slippagePercent: String(getSlippageValue())
        });
        return {
          url: `https://api.dexview.com/okx-swap/v6/swap?${params.toString()}`,
          method: 'GET',
          headers: {
            'secret': '5ff3a258-2700-11ed-a261-0242ac120002',
            'Content-Type': 'application/json'
          }
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        // Log response asli untuk debug (hapus setelah confirmed working)
        console.log('[DEXVIEW-OKX] raw response:', JSON.stringify(response)?.substring(0, 400));

        // Coba semua kemungkinan struktur response DexView/OKX:
        // 1. /swap   → response.data[0].routerResult.toTokenAmount
        // 2. /quote  → response.data[0].toTokenAmount
        // 3. proxy wrapper berbeda → response.result / response.toTokenAmount langsung
        let toAmount = null;
        let gasEstimate = 0;

        const d0 = (Array.isArray(response?.data)) ? response.data[0] : (Array.isArray(response?.data?.data) ? response.data.data[0] : null);
        if (d0) {
          // Struktur /swap (routerResult nested)
          if (d0.routerResult?.toTokenAmount) {
            toAmount = d0.routerResult.toTokenAmount;
            gasEstimate = d0.routerResult.estimateGasFee || 0;
          }
          // Struktur /quote (flat di data[0])
          else if (d0.toTokenAmount) {
            toAmount = d0.toTokenAmount;
            gasEstimate = d0.estimateGasFee || 0;
          }
        }
        // Fallback: toTokenAmount langsung di root response
        if (!toAmount && response?.toTokenAmount) {
          toAmount = response.toTokenAmount;
          gasEstimate = response.estimateGasFee || 0;
        }
        // Fallback: nested di response.result
        if (!toAmount && response?.result?.toTokenAmount) {
          toAmount = response.result.toTokenAmount;
          gasEstimate = response.result.estimateGasFee || 0;
        }

        if (!toAmount) {
          console.warn('[DEXVIEW-OKX] toTokenAmount not found. Keys:', Object.keys(response || {}), '| data[0] keys:', Object.keys(d0 || {}));
          throw new Error("DexView-OKX: toTokenAmount not found in response");
        }

        const amount_out = parseFloat(toAmount) / Math.pow(10, des_output);
        if (!Number.isFinite(amount_out) || amount_out <= 0) {
          throw new Error(`DexView-OKX: invalid amount_out=${amount_out}`);
        }

        let _dvCalcUsd = 0;
        try {
          const gasUnitsRaw = parseFloat(gasEstimate || 0);
          if (gasUnitsRaw > 0) {
            const gasUnits = capGasUnits(gasUnitsRaw, chainName);
            const allGasData = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage("ALL_GAS_FEES") : null;
            if (allGasData) {
              const gasInfo = allGasData.find(g => String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase());
              if (gasInfo?.gwei && gasInfo?.tokenPrice) {
                _dvCalcUsd = (parseFloat(gasInfo.gwei) * gasUnits / 1e9) * parseFloat(gasInfo.tokenPrice);
              }
            }
          }
        } catch (e) { }
        const { FeeSwap, feeSource } = resolveFeeSwap(0, _dvCalcUsd, chainName);

        return { amount_out, FeeSwap, feeSource, dexTitle: 'OKX', routeTool: 'DEXVIEW' };
      }
    },
    temple: {
      buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
        const chainId = Number(codeChain);
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const params = new URLSearchParams({
          fromChain: chainId.toString(),
          toChain: chainId.toString(),
          fromToken: sc_input_in,
          toToken: sc_output_in,
          amount: amount_in_big.toString(),
          fromAddress: userAddr,
          slippage: getSlippageValue()  // USER-CONFIGURABLE (percentage)
        });
        return {
          url: `https://temple-api-evm.prod.templewallet.com/api/swap-route?${params.toString()}`,
          method: 'GET',
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response || !response.toAmount) throw new Error("Invalid Temple/LIFI response - missing toAmount");
        const amount_out = parseFloat(response.toAmount) / Math.pow(10, des_output);
        let _tDirectUsd = 0;
        try { _tDirectUsd = parseFloat(response.gasCostUSD || 0); } catch (_) { }
        const { FeeSwap, feeSource } = resolveFeeSwap(_tDirectUsd, 0, chainName);
        let routeTool = 'LIFI';
        try {
          if (response.steps?.length > 0) {
            const toolName = response.steps[0]?.toolDetails?.name || response.steps[0]?.tool || '';
            if (toolName) routeTool = String(toolName).toUpperCase();
          }
        } catch (_) { }
        return { amount_out, FeeSwap, feeSource, dexTitle: 'LIFIDX', routeTool: String(routeTool).toUpperCase() };
      }
    },
  };
  function createOdosStrategy(version) {
    const endpoint = `https://api.odos.xyz/sor/quote/${version}`;
    return {
      buildRequest: ({ codeChain, SavedSettingData, amount_in_big, sc_input_in, sc_output_in }) => {
        const wallet = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        return {
          url: endpoint,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({
            chainId: codeChain,
            inputTokens: [{ tokenAddress: sc_input_in, amount: amount_in_big.toString() }],
            outputTokens: [{ tokenAddress: sc_output_in, proportion: 1 }],
            userAddr: wallet,
            slippageLimitPercent: parseFloat(getSlippageValue()),
            referralCode: 0,
            disableRFQs: true,
            compact: true
          })
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const rawOut = Array.isArray(response?.outAmounts) ? response.outAmounts[0] : response?.outAmounts;
        if (!rawOut) throw new Error("Invalid ODOS response: missing outAmounts");
        const outNum = parseFloat(rawOut);
        const _oDirectUsd = parseFloat(response?.gasEstimateValue || response?.gasFeeUsd || response?.gasEstimateUSD || 0);
        const { FeeSwap, feeSource } = resolveFeeSwap(_oDirectUsd, 0, chainName);
        return { amount_out: outNum / Math.pow(10, des_output), FeeSwap, feeSource, dexTitle: 'ODOS', routeTool: `ODOS-${version.toUpperCase()}` };
      }
    };
  }

  dexStrategies.odos3 = createOdosStrategy('v3');
  dexStrategies.odos = dexStrategies.odos3;

  dexStrategies.dzap = {
    buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, des_input, des_output, chainName }) => {
      const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
      const dzapChainId = chainConfig?.DZAP_CHAIN_ID || Number(codeChain);
      const isSolana = String(chainName || '').toLowerCase() === 'solana';
      const srcToken = isSolana ? sc_input_in : sc_input.toLowerCase();
      const destToken = isSolana ? sc_output_in : sc_output.toLowerCase();
      const body = {
        fromChain: dzapChainId,
        data: [{ amount: amount_in_big.toString(), destDecimals: Number(des_output), destToken: destToken, slippage: parseFloat(getSlippageValue()), srcDecimals: Number(des_input), srcToken: srcToken, toChain: dzapChainId }],
        gasless: false
      };
      return { url: 'https://api.dzap.io/v1/quotes', method: 'POST', data: JSON.stringify(body) };
    },
    parseResponse: (response, { des_output, chainName }) => {
      let quoteRates;
      if (response?.quotes && Array.isArray(response.quotes) && response.quotes.length > 0) {
        quoteRates = response.quotes[0]?.quoteRates;
      } else {
        const responseKey = Object.keys(response || {})[0];
        quoteRates = response?.[responseKey]?.quoteRates;
      }
      if (!quoteRates || Object.keys(quoteRates).length === 0) throw new Error("DZAP quote rates not found in response");
      const allProviders = [];
      for (const [dexId, quoteInfo] of Object.entries(quoteRates)) {
        try {
          if (!quoteInfo || !quoteInfo.destAmount) continue;
          const amount_out = parseFloat(quoteInfo.destAmount) / Math.pow(10, des_output);
          const feeUsd = parseFloat(quoteInfo.fee?.gasFee?.[0]?.amountUSD || 0);
          const { FeeSwap, feeSource } = resolveFeeSwap(feeUsd, 0, chainName);
          allProviders.push({ amount_out, FeeSwap, feeSource, dexTitle: String(dexId).toUpperCase(), routeTool: String(dexId).toUpperCase() });
        } catch (e) { continue; }
      }
      if (allProviders.length === 0) throw new Error("No valid DZAP quotes found");
      // ✅ Filter blacklisted providers dari config offDexResultScan
      const filteredProviders = filterOffDexResults(allProviders);
      if (filteredProviders.length === 0) throw new Error('DZAP: Semua provider terfilter oleh offDexResultScan');
      filteredProviders.sort((a, b) => b.amount_out - a.amount_out);
      const topN = filteredProviders.slice(0, 3);
      return { amount_out: topN[0].amount_out, FeeSwap: topN[0].FeeSwap, feeSource: topN[0].feeSource, dexTitle: 'DZAP', routeTool: topN[0].routeTool, subResults: topN, isMultiDex: true };
    }
  };

  dexStrategies['brave-lifi'] = {
    buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
      const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
      const lifiChainId = chainConfig?.LIFI_CHAIN_ID || Number(codeChain);
      const isSolana = String(chainName || '').toLowerCase() === 'solana';
      const fromToken = isSolana ? sc_input_in : sc_input.toLowerCase();
      const toToken = isSolana ? sc_output_in : sc_output.toLowerCase();
      const userAddr = isSolana ? (SavedSettingData?.walletSolana || 'So11111111111111111111111111111111111111112') : (SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000');
      const body = {
        fromAddress: userAddr,
        fromAmount: amount_in_big.toString(),
        fromChainId: lifiChainId,
        fromTokenAddress: fromToken,
        toChainId: lifiChainId,
        toTokenAddress: toToken,
        options: {
          integrator: 'brave',
          order: 'CHEAPEST',
          slippage: parseFloat(getSlippageValue()) / 100,  // USER-CONFIGURABLE (fraction)
          maxPriceImpact: 0.4,
          jitoBundle: true,
          allowSwitchChain: true,
          executionType: 'all'
        }
      };
      return { url: 'https://lifi.wallet.brave.com/v1/advanced/routes', method: 'POST', data: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
    },
    parseResponse: (response, { des_output, chainName }) => {
      const routes = response?.routes;
      if (!routes || !Array.isArray(routes) || routes.length === 0) throw new Error("LIFI routes not found in response");
      const subResults = [];
      for (const route of routes) {
        if (!route || !route.toAmount) continue;
        const amount_out = parseFloat(route.toAmount) / Math.pow(10, des_output);
        const { FeeSwap, feeSource } = resolveFeeSwap(parseFloat(route.gasCostUSD || 0), 0, chainName);
        let dexTitle = 'LIFI';
        try { dexTitle = String(route.steps?.[0]?.toolDetails?.name || 'LIFI').toUpperCase(); } catch (_) { }
        subResults.push({ amount_out, FeeSwap, feeSource, dexTitle, routeTool: 'BRAVE-LIFI' });
        if (subResults.length >= 3) break;
      }
      // ✅ Filter blacklisted providers dari config offDexResultScan
      const filtered = filterOffDexResults(subResults);
      if (filtered.length === 0) throw new Error('LIFI: Semua provider terfilter oleh offDexResultScan');
      filtered.sort((a, b) => b.amount_out - a.amount_out);
      return { amount_out: filtered[0].amount_out, FeeSwap: filtered[0].FeeSwap, feeSource: filtered[0].feeSource, dexTitle: 'JUMPER', routeTool: filtered[0].routeTool, subResults: filtered, isMultiDex: true };
    }
  };

  dexStrategies['lifi-odos'] = createFilteredLifiStrategy('odos', 'ODOS');

  dexStrategies['zapper-lifi'] = {
    buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
      const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
      const lifiChainId = chainConfig?.LIFI_CHAIN_ID || Number(codeChain);
      const isSolana = String(chainName || '').toLowerCase() === 'solana';
      const fromToken = isSolana ? sc_input_in : sc_input.toLowerCase();
      const toToken = isSolana ? sc_output_in : sc_output.toLowerCase();
      const userAddr = isSolana ? (SavedSettingData?.walletSolana || 'So11111111111111111111111111111111111111112') : (SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000');
      const params = new URLSearchParams({
        fromChain: lifiChainId.toString(),
        toChain: lifiChainId.toString(),
        fromToken: fromToken,
        toToken: toToken,
        fromAmount: amount_in_big.toString(),
        fromAddress: userAddr,
        slippage: String(parseFloat(getSlippageValue()) / 100),
        integrator: 'brave',
        fee: '0.004'
      });
      return { url: `https://zapper.xyz/api/lifi/quote?${params.toString()}`, method: 'GET' };
    },
    parseResponse: (response, { des_output, chainName }) => {
      if (!response?.estimate?.toAmount) throw new Error("ZAPPER-LIFI: No valid quote received");
      const amount_out = parseFloat(response.estimate.toAmount) / Math.pow(10, des_output);
      let gasCostUsd = 0;
      if (response.estimate.gasCosts) gasCostUsd = response.estimate.gasCosts.reduce((sum, gc) => sum + parseFloat(gc.amountUSD || 0), 0);
      const { FeeSwap, feeSource } = resolveFeeSwap(gasCostUsd, 0, chainName);

      let dexTitle = 'LIFI';
      try {
        dexTitle = String(response.toolDetails?.name || response.tool || 'ZAPPER').toUpperCase();
      } catch (_) { }

      const result = { amount_out, FeeSwap, feeSource, dexTitle };
      return {
        ...result,
        routeTool: 'ZAPPER-LIFI',
        subResults: [result],
        isMultiDex: true
      };
    }
  };

  function createFilteredLifiStrategy(dexKey, dexTitle, customLabel = null) {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
        const apiKey = (typeof getRandomApiKeyLIFI === 'function') ? getRandomApiKeyLIFI() : '';
        const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
        const lifiChainId = chainConfig?.LIFI_CHAIN_ID || Number(codeChain);
        const isSolana = String(chainName || '').toLowerCase() === 'solana';
        const fromToken = isSolana ? sc_input_in : sc_input.toLowerCase();
        const toToken = isSolana ? sc_output_in : sc_output.toLowerCase();
        const userAddr = isSolana ? (SavedSettingData?.walletSolana || 'So11111111111111111111111111111111111111112') : (SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000');
        const body = {
          fromAddress: userAddr,
          fromAmount: amount_in_big.toString(),
          fromChainId: lifiChainId,
          fromTokenAddress: fromToken,
          toChainId: lifiChainId,
          toTokenAddress: toToken,
          options: {
            integrator: 'brave',
            order: 'CHEAPEST',
            slippage: parseFloat(getSlippageValue()) / 100,  // USER-CONFIGURABLE (fraction)
            maxPriceImpact: 0.4,
            jitoBundle: true,
            allowSwitchChain: true,
            executionType: 'all',
            allowExchanges: [dexKey]
          }
        };
        return { url: 'https://li.quest/v1/advanced/routes', method: 'POST', data: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'x-lifi-api-key': apiKey } };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const routes = response?.routes;
        if (!routes || !Array.isArray(routes) || routes.length === 0) throw new Error(`LIFI-${dexTitle}: No valid routes received`);
        const bestRoute = routes[0];
        if (!bestRoute?.toAmount) throw new Error(`LIFI-${dexTitle}: Invalid route structure`);
        const amount_out = parseFloat(bestRoute.toAmount) / Math.pow(10, des_output);
        const { FeeSwap, feeSource } = resolveFeeSwap(parseFloat(bestRoute.gasCostUSD || 0), 0, chainName);

        // Dynamic Label logic
        let routeTool = customLabel || `LIFI-${dexTitle}`;
        if (dexTitle === 'OKX') routeTool = 'BRAVE-LIFI';
        if (dexTitle === 'LIFIDX') {
          let toolUsed = 'LIFI';
          try { toolUsed = String(bestRoute.steps?.[0]?.toolDetails?.name || bestRoute.steps?.[0]?.tool || 'LIFI').toUpperCase(); } catch (_) { }
          routeTool = `LIFI-${toolUsed}`;
        }

        return { amount_out, FeeSwap, feeSource, dexTitle, routeTool };
      }
    };
  }

  function createFilteredLifiRelayStrategy() {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
        const apiKey = (typeof getRandomApiKeyLIFI === 'function') ? getRandomApiKeyLIFI() : '';
        const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
        const lifiChainId = chainConfig?.LIFI_CHAIN_ID || Number(codeChain);
        const isSolana = String(chainName || '').toLowerCase() === 'solana';
        const fromToken = isSolana ? sc_input_in : sc_input.toLowerCase();
        const toToken = isSolana ? sc_output_in : sc_output.toLowerCase();
        const userAddr = isSolana ? (SavedSettingData?.walletSolana || 'So11111111111111111111111111111111111111112') : (SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000');
        const body = {
          fromChainId: lifiChainId,
          toChainId: lifiChainId,
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          fromAmount: amount_in_big.toString(),
          fromAddress: userAddr,
          toAddress: userAddr,
          options: { slippage: parseFloat(getSlippageValue()) / 100, order: 'RECOMMENDED', allowSwitchChain: false }  // USER-CONFIGURABLE (fraction)
        };
        return { url: 'https://li.quest/v1/advanced/routes', method: 'POST', data: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'x-lifi-api-key': apiKey } };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const bestRoute = response?.routes?.[0];
        if (!bestRoute?.toAmount) throw new Error('LIFI-RELAY: Invalid route structure');
        const amount_out = parseFloat(bestRoute.toAmount) / Math.pow(10, des_output);
        const { FeeSwap, feeSource } = resolveFeeSwap(parseFloat(bestRoute.gasCostUSD || 0), 0, chainName);
        return { amount_out, FeeSwap, feeSource, dexTitle: 'RELAY', routeTool: 'LIFI-RELAY' };
      }
    };
  }

  dexStrategies['lifi-okx'] = createFilteredLifiStrategy('okx', 'OKX');
  dexStrategies['lifi-sushi'] = createFilteredLifiStrategy('sushiswap', 'SUSHI');
  dexStrategies['lifi-kyber'] = createFilteredLifiStrategy('kyberswap', 'KYBER');
  dexStrategies['lifi-flytrade'] = createFilteredLifiStrategy('fly', 'FLYTRADE');
  dexStrategies['lifi-velora'] = createFilteredLifiStrategy('paraswap', 'VELORA');
  dexStrategies['lifi-1inch'] = createFilteredLifiStrategy('1inch', '1INCH');
  dexStrategies['lifi-relay'] = createFilteredLifiRelayStrategy();

  dexStrategies['lifi-lifidex'] = createFilteredLifiStrategy('lifi', 'LIFIDX');

  function createFilteredSwoopStrategy(aggregatorSlug, dexTitle) {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, des_input, des_output, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const gasPrice = (typeof getFromLocalStorage === 'function') ? Number(getFromLocalStorage('gasGWEI', 0)) : 0;
        const body = {
          chainId: Number(codeChain),
          aggregatorSlug: aggregatorSlug,
          sender: userAddr,
          inToken: { chainId: Number(codeChain), type: 'TOKEN', address: sc_input.toLowerCase(), decimals: Number(des_input) },
          outToken: { chainId: Number(codeChain), type: 'TOKEN', address: sc_output.toLowerCase(), decimals: Number(des_output) },
          amountInWei: String(amount_in_big),
          slippageBps: String(Math.round(parseFloat(getSlippageValue()) * 100)),  // USER-CONFIGURABLE (bps)
          gasPriceGwei: gasPrice
        };
        return { url: 'https://bzvwrjfhuefn.up.railway.app/swap', method: 'POST', data: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response || !response.amountOutWei) throw new Error(`SWOOP-${dexTitle}: Invalid response`);
        const amount_out = parseFloat(response.amountOutWei) / Math.pow(10, des_output);
        let _swDirectUsd = 0;
        let _swCalcUsd = 0;
        try {
          _swDirectUsd = parseFloat(response?.gasCostUsd || response?.gasUsdAmount || response?.gasEstimateUSD || response?.gasFeeUsd || response?.feeUsd || response?.gas?.usdValue || 0) || 0;
          if (!(_swDirectUsd > 0 && _swDirectUsd < 100)) _swDirectUsd = 0;
          if (!(_swDirectUsd > 0)) {
            const gasUnitsRaw = parseFloat(response?.estimatedGas || response?.gasCost || response?.gasLimit || 0) || 0;
            if (gasUnitsRaw > 0) {
              const gasUnits = capGasUnits(gasUnitsRaw, chainName); // ✅ cap dengan GASLIMIT config
              const allGasData = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage('ALL_GAS_FEES') : null;
              if (allGasData) {
                const gasInfo = allGasData.find(g => String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase());
                if (gasInfo?.gwei && gasInfo?.tokenPrice) _swCalcUsd = (gasUnits * gasInfo.gwei * gasInfo.tokenPrice) / 1e9;
              }
            }
          }
        } catch (_) { }
        const { FeeSwap, feeSource } = resolveFeeSwap(_swDirectUsd, _swCalcUsd, chainName);
        const label = 'SWOOP';
        return { amount_out, FeeSwap, feeSource, dexTitle, routeTool: label };
      }
    };
  }

  dexStrategies['swoop-velora'] = createFilteredSwoopStrategy('paraswap', 'VELORA');
  dexStrategies['swoop-odos'] = createFilteredSwoopStrategy('odos', 'ODOS');
  dexStrategies['swoop-kyber'] = createFilteredSwoopStrategy('kyberswap', 'KYBER');
  dexStrategies['swoop-matcha'] = createFilteredSwoopStrategy('0x', 'MATCHA');
  dexStrategies['swoop-okx'] = createFilteredSwoopStrategy('okx', 'OKX');
  dexStrategies['swoop-sushi'] = createFilteredSwoopStrategy('sushiswap', 'SUSHI');
  dexStrategies['swoop-lifi'] = createFilteredSwoopStrategy('lifi', 'LIFIDEX');

  function createFilteredRabbyStrategy(rabbyDexId, dexTitle) {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, SavedSettingData }) => {
        const chainSlugMap = { 1: 'eth', 56: 'bsc', 137: 'matic', 42161: 'arb', 10: 'op', 8453: 'base', 43114: 'avax', 250: 'ftm', 100: 'xdai' };
        const chainSlug = chainSlugMap[Number(codeChain)];
        if (!chainSlug) throw new Error(`Rabby does not support chain ID ${codeChain}`);
        const userAddr = SavedSettingData?.walletMeta || '0x365d358dc96ae70c35a1e338a9a7645313d1231b';
        const nativeAddresses = ['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '0x0000000000000000000000000000000000000000'];
        let payTokenId = nativeAddresses.includes(sc_input.toLowerCase()) ? chainSlug : sc_input.toLowerCase();
        let receiveTokenId = nativeAddresses.includes(sc_output.toLowerCase()) ? chainSlug : sc_output.toLowerCase();

        // Add prefix for non-ETH chains
        let actualDexId = rabbyDexId;
        if (chainSlug !== 'eth') {
          actualDexId = `${chainSlug}_${rabbyDexId}`;
        }

        const params = new URLSearchParams({ id: userAddr, chain_id: chainSlug, dex_id: actualDexId, pay_token_id: payTokenId, pay_token_raw_amount: String(amount_in_big), receive_token_id: receiveTokenId, slippage: getSlippageValue(), fee: 'true', no_pre_exec: 'true' });
        return { url: `https://api.rabby.io/v1/wallet/swap_quote?${params.toString()}`, method: 'GET', headers: {} };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const receiveToken = response?.receive_token;
        if (!receiveToken) throw new Error(`RABBY-${dexTitle}: Invalid response`);
        let amount_out;
        if (response.receive_token_raw_amount !== undefined) amount_out = parseFloat(response.receive_token_raw_amount) / Math.pow(10, des_output);
        else if (receiveToken.amount !== undefined) amount_out = parseFloat(receiveToken.amount);
        else if (receiveToken.raw_amount_hex_str) amount_out = Number(BigInt(receiveToken.raw_amount_hex_str)) / Math.pow(10, des_output);
        else if (receiveToken.raw_amount) amount_out = parseFloat(receiveToken.raw_amount) / Math.pow(10, des_output);
        else throw new Error(`RABBY-${dexTitle}: Cannot parse output amount`);
        const { FeeSwap, feeSource } = resolveFeeSwap(parseFloat(response?.gas?.usd_value || response?.gas_price_usd || 0), 0, chainName);
        const label = 'RABBY';
        return { amount_out, FeeSwap, feeSource, dexTitle, routeTool: label };
      }
    };
  }

  dexStrategies['rabby-kyber'] = createFilteredRabbyStrategy('kyberswap', 'KYBER');
  dexStrategies['rabby-matcha'] = createFilteredRabbyStrategy('matcha_v2', 'MATCHA');
  dexStrategies['rabby-flytrade'] = createFilteredRabbyStrategy('magpie', 'FLYTRADE');
  dexStrategies['rabby-1inch'] = createFilteredRabbyStrategy('1inch_v6', '1INCH');

  function createFilteredC98Strategy(backerName, dexTitle) {
    const NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const NATIVE_SYMBOLS = { '1': 'ETH', '56': 'BNB', '137': 'MATIC', '42161': 'ETH', '8453': 'ETH', '10': 'ETH', '43114': 'AVAX' };
    return {
      buildRequest: ({ codeChain, sc_input_in, sc_output_in, amount_in_big, des_input, des_output, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const chainId = parseInt(codeChain);
        const amountHuman = parseFloat(amount_in_big) / Math.pow(10, des_input);
        const token0 = { chainId, decimals: des_input };
        if (sc_input_in.toLowerCase() === NATIVE_TOKEN) token0.symbol = NATIVE_SYMBOLS[String(codeChain)] || 'ETH';
        else token0.address = sc_input_in;
        const token1 = { chainId, decimals: des_output };
        if (sc_output_in.toLowerCase() === NATIVE_TOKEN) token1.symbol = NATIVE_SYMBOLS[String(codeChain)] || 'ETH';
        else token1.address = sc_output_in;
        const body = { isAuto: true, amount: amountHuman, token0, token1, backer: [backerName], wallet: userAddr };
        return { url: 'https://superlink-server.coin98.tech/quote', method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, data: JSON.stringify(body) };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response?.data?.[0]) throw new Error(`C98-${dexTitle}: No quote data received`);
        const quote = response.data[0];
        const amount_out = parseFloat(quote.amount);
        const { FeeSwap, feeSource } = resolveFeeSwap(parseFloat(quote.additionalData?.gas?.amountUSD || 0), 0, chainName);
        const label = 'C98';
        return { amount_out, FeeSwap, feeSource, dexTitle, routeTool: label };
      }
    };
  }

  dexStrategies['c98-okx'] = createFilteredC98Strategy('okx', 'OKX');
  dexStrategies['c98-matcha'] = createFilteredC98Strategy('0x', 'MATCHA');

  dexStrategies['c98-lifidex'] = {
    buildRequest: ({ codeChain, sc_input_in, sc_output_in, amount_in_big, des_input, des_output, SavedSettingData }) => {
      const NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      const NATIVE_SYMBOLS = { '1': 'ETH', '56': 'BNB', '137': 'MATIC', '42161': 'ETH', '8453': 'ETH', '10': 'ETH', '43114': 'AVAX' };
      const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
      const chainId = parseInt(codeChain);
      const amountHuman = parseFloat(amount_in_big) / Math.pow(10, des_input);
      const token0 = { chainId, decimals: des_input };
      if (sc_input_in.toLowerCase() === NATIVE_TOKEN) token0.symbol = NATIVE_SYMBOLS[String(codeChain)] || 'ETH';
      else token0.address = sc_input_in;
      const token1 = { chainId, decimals: des_output };
      if (sc_output_in.toLowerCase() === NATIVE_TOKEN) token1.symbol = NATIVE_SYMBOLS[String(codeChain)] || 'ETH';
      else token1.address = sc_output_in;
      const body = { isAuto: true, amount: amountHuman, token0, token1, wallet: userAddr };
      return { url: 'https://superlink-server.coin98.tech/quote', method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, data: JSON.stringify(body) };
    },
    parseResponse: (response, { des_output, chainName }) => {
      if (!response?.data?.[0]) throw new Error('C98-LIFIDEX: No quote data received');
      const sorted = response.data.filter(q => parseFloat(q.amount) > 0).sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
      if (sorted.length === 0) throw new Error('C98-LIFIDEX: No valid quotes');
      const best = sorted[0];
      const { FeeSwap, feeSource } = resolveFeeSwap(parseFloat(best.additionalData?.gas?.amountUSD || 0), 0, chainName);
      const toolName = String(best.id || best.name || 'C98').toUpperCase();
      return { amount_out: parseFloat(best.amount), FeeSwap, feeSource, dexTitle: 'LIFIDX', routeTool: `C98-${toolName}` };
    }
  };

  function createFilteredKrystalStrategy(platformName, dexTitle) {
    const PLATFORM_WALLET = '0x168E4c3AC8d89B00958B6bE6400B066f0347DDc9';
    return {
      buildRequest: ({ chainName, sc_input_in, sc_output_in, amount_in_big }) => {
        const params = new URLSearchParams({ src: sc_input_in, srcAmount: String(amount_in_big), dest: sc_output_in, platformWallet: PLATFORM_WALLET });
        return { url: `https://api.krystal.app/${String(chainName || '').toLowerCase()}/v2/swap/allRates?${params.toString()}`, method: 'GET', headers: {} };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!Array.isArray(response?.rates)) throw new Error(`Krystal-${dexTitle}: No rates returned`);
        const match = response.rates.find(r => String(r.platform || '').toLowerCase().includes(platformName.toLowerCase()));
        if (!match) throw new Error(`Krystal-${dexTitle}: Platform "${platformName}" not found`);
        const amount_out = parseFloat(match.amount) / Math.pow(10, des_output);
        let _kCalcUsd = 0;
        const gasUnitsRaw = parseFloat(match.estimatedGas || match.estGasConsumed || 0);
        if (gasUnitsRaw > 0) {
          const gasUnits = capGasUnits(gasUnitsRaw, chainName); // ✅ cap dengan GASLIMIT config
          const allGasData = (typeof getFromLocalStorage === 'function') ? getFromLocalStorage('ALL_GAS_FEES') : null;
          if (allGasData) {
            const gasInfo = allGasData.find(g => String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase());
            if (gasInfo?.gwei && gasInfo?.tokenPrice) _kCalcUsd = (gasUnits * gasInfo.gwei * gasInfo.tokenPrice) / 1e9;
          }
        }
        const { FeeSwap, feeSource } = resolveFeeSwap(0, _kCalcUsd, chainName);
        const label = 'KRYSTAL';
        return { amount_out, FeeSwap, feeSource, dexTitle, routeTool: label };
      }
    };
  }

  dexStrategies['krystal-kyber'] = createFilteredKrystalStrategy('KyberSwap', 'KYBER');
  dexStrategies['krystal-okx'] = createFilteredKrystalStrategy('OKX Dex', 'OKX');

  function createFilteredBungeeStrategy(routeName, dexTitle) {
    return {
      buildRequest: ({ sc_input_in, sc_output_in, amount_in_big, codeChain, SavedSettingData }) => {
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const apiKey = (typeof getRandomApiKeyBungee === 'function') ? getRandomApiKeyBungee() : '';
        const params = new URLSearchParams({ userAddress: userAddr, originChainId: String(codeChain), destinationChainId: String(codeChain), inputAmount: String(amount_in_big), inputToken: sc_input_in, outputToken: sc_output_in, enableManual: 'true', receiverAddress: userAddr, refuel: 'false', excludeBridges: 'cctp', useInbox: 'false', enableMultipleAutoRoutes: 'true' });
        return { url: `https://dedicated-backend.bungee.exchange/api/v1/bungee/quote?${params.toString()}`, method: 'GET', headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': apiKey, 'affiliate': (typeof root.BUNGEE_AFFILIATE !== 'undefined') ? root.BUNGEE_AFFILIATE : '' } };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response?.result?.manualRoutes) throw new Error(`Bungee-${dexTitle}: Invalid response`);
        const match = response.result.manualRoutes.find(r => String(r.routeDetails?.name || '').toLowerCase().includes(routeName.toLowerCase()));
        if (!match) throw new Error(`Bungee-${dexTitle}: Route "${routeName}" not found`);
        const amount_out = parseFloat(match.output?.amount) / Math.pow(10, des_output);
        const { FeeSwap, feeSource } = resolveFeeSwap(parseFloat(match.gasFee?.feeInUsd || 0), 0, chainName);
        return { amount_out, FeeSwap, feeSource, dexTitle, routeTool: 'BUNGEE' };
      }
    };
  }

  dexStrategies['bungee-matcha'] = createFilteredBungeeStrategy('0x', 'MATCHA');
  dexStrategies['bungee-kyber'] = createFilteredBungeeStrategy('Kyberswap', 'KYBER');

  function createFilteredDzapStrategy(dexKey, dexTitle) {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, SavedSettingData, chainName }) => {
        const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
        const dzapChainId = chainConfig?.DZAP_CHAIN_ID || Number(codeChain);
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const params = new URLSearchParams({ chainId: String(dzapChainId), fromTokenAddress: sc_input.toLowerCase(), toTokenAddress: sc_output.toLowerCase(), amount: String(amount_in_big), slippage: getSlippageValue(), userAddress: userAddr });
        return { url: `https://api.dzap.io/v1/quote?${params.toString()}`, method: 'GET', headers: {} };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response?.quotes) throw new Error(`DZAP-${dexTitle}: No quotes found`);
        const filteredQuote = response.quotes.find(q => String(q.source || q.dex || q.protocol || '').toLowerCase().includes(dexKey.toLowerCase()));
        if (!filteredQuote?.toTokenAmount) throw new Error(`DZAP-${dexTitle}: No ${dexTitle} quote found`);
        const amount_out = parseFloat(filteredQuote.toTokenAmount) / Math.pow(10, des_output);
        const { FeeSwap, feeSource } = resolveFeeSwap(parseFloat(filteredQuote.estimatedGas || filteredQuote.gasCostUSD || 0), 0, chainName);
        const label = 'DZAP';
        return { amount_out, FeeSwap, feeSource, dexTitle, routeTool: label };
      }
    };
  }

  dexStrategies['dzap-velora'] = createFilteredDzapStrategy('paraswap', 'VELORA');
  dexStrategies['dzap-odos'] = createFilteredDzapStrategy('odos', 'ODOS');
  dexStrategies['dzap-kyber'] = createFilteredDzapStrategy('kyberswap', 'KYBER');
  dexStrategies['dzap-matcha'] = createFilteredDzapStrategy('zerox', 'MATCHA');
  dexStrategies['dzap-okx'] = createFilteredDzapStrategy('okx', 'OKX');

  function createFilteredSwingStrategy(dexKey, dexTitle) {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, chainName }) => {
        const chainSlugMap = { 1: 'ethereum', 56: 'bsc', 137: 'polygon', 42161: 'arbitrum', 10: 'optimism', 8453: 'base', 43114: 'avalanche' };
        const chainSlug = chainSlugMap[Number(codeChain)];
        if (!chainSlug) throw new Error(`Swing does not support chain ID ${codeChain}`);
        const wrappedNativeAddresses = { '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': '0x0000000000000000000000000000000000000000', '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': '0x0000000000000000000000000000000000000000', '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': '0x0000000000000000000000000000000000000000', '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': '0x0000000000000000000000000000000000000000', '0x4200000000000000000000000000000000000006': '0x0000000000000000000000000000000000000000', '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': '0x0000000000000000000000000000000000000000' };
        let fromToken = wrappedNativeAddresses[sc_input.toLowerCase()] || sc_input.toLowerCase();
        let toToken = wrappedNativeAddresses[sc_output.toLowerCase()] || sc_output.toLowerCase();
        const params = new URLSearchParams({ fromChain: chainSlug, toChain: chainSlug, fromToken: fromToken, toToken: toToken, amount: amount_in_big.toString(), type: 'swap', fromWallet: '', toWallet: '' });
        let selectedProjectId = 'galaxy-exchange';
        try { if (typeof root !== 'undefined' && root.SWING_PROJECT_IDS) selectedProjectId = root.SWING_PROJECT_IDS[Math.floor(Math.random() * root.SWING_PROJECT_IDS.length)]; } catch (e) { }
        return { url: `https://platform.swing.xyz/api/v1/projects/${selectedProjectId}/quote?${params.toString()}`, method: 'GET', headers: {} };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const filteredRoute = response?.routes?.find(r => String(r?.quote?.integration || '').toLowerCase().includes(dexKey.toLowerCase()));
        if (!filteredRoute?.quote?.amount) throw new Error(`SWING-${dexTitle}: No ${dexTitle} route found`);
        const amount_out = parseFloat(filteredRoute.quote.amount) / Math.pow(10, des_output);
        const { FeeSwap, feeSource } = resolveFeeSwap(parseFloat(filteredRoute.gasUSD || 0), 0, chainName);
        const label = 'SWING';
        return { amount_out, FeeSwap, feeSource, dexTitle, routeTool: label };
      }
    };
  }

  dexStrategies['swing-velora'] = createFilteredSwingStrategy('velora', 'VELORA');
  dexStrategies['swing-odos'] = createFilteredSwingStrategy('odos', 'ODOS');
  dexStrategies['swing-kyber'] = createFilteredSwingStrategy('kyber', 'KYBER');
  dexStrategies['swing-matcha'] = createFilteredSwingStrategy('0x', 'MATCHA');
  dexStrategies['swing-okx'] = createFilteredSwingStrategy('okx', 'OKX');

  function createFilteredRocketXStrategy(exchangeKey, dexTitle) {
    return {
      buildRequest: (params) => dexStrategies.rocketx.buildRequest(params),
      parseResponse: (response, { chainName }) => {
        if (!Array.isArray(response?.quotes)) throw new Error(`ROCKETX-${dexTitle}: Invalid response`);
        const filteredQuotes = response.quotes.filter(q => q.exchangeInfo?.exchange_type === 'DEX' && (String(q.exchangeInfo?.title || '').toLowerCase().includes(exchangeKey.toLowerCase()) || String(q.exchangeInfo?.keyword || '').toLowerCase().includes(exchangeKey.toLowerCase())));
        if (filteredQuotes.length === 0) throw new Error(`ROCKETX-${dexTitle}: No ${dexTitle} route found`);
        let best = null;
        for (const q of filteredQuotes) {
          const amount_out = parseFloat(q.toAmount);
          if (!Number.isFinite(amount_out) || amount_out <= 0) continue;
          const { FeeSwap, feeSource } = resolveFeeSwap(parseFloat(q.platformFeeUsd || 0) + parseFloat(q.gasFeeUsd || 0), 0, chainName);
          if (!best || amount_out > best.amount_out) best = { amount_out, FeeSwap, feeSource };
        }
        if (!best) throw new Error(`ROCKETX-${dexTitle}: No valid ${dexTitle} quotes parsed`);
        return { amount_out: best.amount_out, FeeSwap: best.FeeSwap, feeSource: best.feeSource, dexTitle, routeTool: 'ROCKETX' };
      }
    };
  }

  // Velora = ParaSwap protocol → filter key 'paraswap'
  dexStrategies['rocketx-velora'] = createFilteredRocketXStrategy('paraswap', 'VELORA');

  // =============================
  // SWING Strategy - Multi-DEX Aggregator (Top 3 Routes)
  // =============================
  dexStrategies.swing = {
    buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, sc_input_in, sc_output_in }) => {
      // Swing uses chain slugs instead of chain IDs
      const chainSlugMap = {
        1: 'ethereum',
        56: 'bsc',
        137: 'polygon',
        42161: 'arbitrum',
        10: 'optimism',
        8453: 'base',
        43114: 'avalanche'
      };

      const chainSlug = chainSlugMap[Number(codeChain)];
      if (!chainSlug) {
        throw new Error(`Swing does not support chain ID ${codeChain}. Supported: Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche`);
      }

      // ✅ CRITICAL: Swing API requires native token to use 0x0000... address
      // Detect wrapped native tokens (WETH, WBNB, etc.) and convert to 0x0000...
      const wrappedNativeAddresses = {
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': '0x0000000000000000000000000000000000000000', // WETH (Ethereum)
        '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': '0x0000000000000000000000000000000000000000', // WBNB (BSC)
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': '0x0000000000000000000000000000000000000000', // WMATIC (Polygon)
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': '0x0000000000000000000000000000000000000000', // WETH (Arbitrum)
        '0x4200000000000000000000000000000000000006': '0x0000000000000000000000000000000000000000', // WETH (Base)
        '0x4200000000000000000000000000000000000006': '0x0000000000000000000000000000000000000000', // WETH (Optimism)
        '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': '0x0000000000000000000000000000000000000000'  // WAVAX (Avalanche)
      };

      // Convert wrapped native to 0x0000... if detected
      let fromToken = sc_input.toLowerCase();
      let toToken = sc_output.toLowerCase();

      if (wrappedNativeAddresses[fromToken]) {
        fromToken = wrappedNativeAddresses[fromToken];
      }
      if (wrappedNativeAddresses[toToken]) {
        toToken = wrappedNativeAddresses[toToken];
      }

      const params = new URLSearchParams({
        fromChain: chainSlug,
        toChain: chainSlug,
        fromToken: fromToken,
        toToken: toToken,
        amount: amount_in_big.toString(),
        type: 'swap',
        fromWallet: '',
        toWallet: ''
      });

      // ✅ PROJECT ID: Using 'galaxy-exchange' demo project (all chains enabled)
      // Custom project IDs require chain configuration at https://platform.swing.xyz/
      let selectedProjectId = 'galaxy-exchange'; // Default fallback
      let totalProjects = 1;

      try {
        if (typeof root !== 'undefined' && typeof root.getRandomSwingProjectId === 'function') {
          selectedProjectId = root.getRandomSwingProjectId();
          totalProjects = root.SWING_PROJECT_IDS?.length || 1;
        } else if (typeof root !== 'undefined' && root.SWING_PROJECT_IDS) {
          // Direct access if helper function not available
          const projectIds = root.SWING_PROJECT_IDS;
          const idx = Math.floor(Math.random() * projectIds.length);
          selectedProjectId = projectIds[idx];
          totalProjects = projectIds.length;
        }
      } catch (e) {
        console.warn('[SWING] Failed to get projectId from secrets.js, using default:', e.message);
      }

      console.log(`[SWING] Using projectId: ${selectedProjectId} (1 of ${totalProjects} projects)`);

      return {
        url: `https://platform.swing.xyz/api/v1/projects/${selectedProjectId}/quote?${params.toString()}`,
        method: 'GET',
        headers: {}
      };
    },
    parseResponse: (response, { des_output, chainName }) => {
      // Parse Swing response - return top 3 routes with single-DEX style calculation
      const routes = response?.routes;

      if (!routes || !Array.isArray(routes) || routes.length === 0) {
        throw new Error("Swing routes not found in response");
      }

      // Parse all routes into array
      const subResults = [];
      for (const route of routes) {
        try {
          if (!route || !route.quote || !route.quote.amount) continue;

          const amount_out = parseFloat(route.quote.amount) / Math.pow(10, des_output);
          const gasUsd = parseFloat(route.gasUSD || 0);
          const { FeeSwap, feeSource } = resolveFeeSwap(gasUsd, 0, chainName);

          const providerName = route.quote.integration || 'Unknown';

          subResults.push({
            amount_out,
            FeeSwap,
            feeSource,
            dexTitle: providerName.toUpperCase()
          });
        } catch (e) {
          continue;
        }
      }

      if (subResults.length === 0) {
        throw new Error("No valid Swing routes found");
      }

      // ✅ Filter blacklisted providers dari config offDexResultScan
      const filteredSwing = filterOffDexResults(subResults);
      if (filteredSwing.length === 0) throw new Error('Swing: Semua provider terfilter oleh offDexResultScan');

      // Sort by amount_out (descending) and get top 3
      const maxProviders = (typeof window !== 'undefined' && window.CONFIG_DEXS?.swing?.maxProviders) || 3;
      filteredSwing.sort((a, b) => b.amount_out - a.amount_out);
      const topN = filteredSwing.slice(0, maxProviders);

      console.log(`[SWING] Returning top ${maxProviders} routes from ${filteredSwing.length} filtered routes`);

      // Return multi-DEX format with top N routes
      return {
        amount_out: topN[0].amount_out,
        FeeSwap: topN[0].FeeSwap,
        dexTitle: 'SWING',
        subResults: topN,
        isMultiDex: true
      };
    }
  };

  // =============================
  // RANGO Strategy - Multi-Chain DEX Aggregator (Top 3 Routes)
  // =============================
  dexStrategies.rango = {
    buildRequest: ({ chainName, sc_input_in, sc_output_in, amount_in_big, des_input, symbol_in, symbol_out, SavedSettingData }) => {
      // Rango API - Multi-chain aggregator dengan 70+ DEXs & bridges
      // Reference: https://docs.rango.exchange/api-integration/main-api-multi-step/api-reference/get-best-route

      // Map chain names to Rango blockchain identifiers
      const rangoChainMap = {
        'ethereum': 'ETH',
        'bsc': 'BSC',
        'polygon': 'POLYGON',
        'avalanche': 'AVAX_CCHAIN',
        'arbitrum': 'ARBITRUM',
        'optimism': 'OPTIMISM',
        'base': 'BASE',
        'solana': 'SOLANA',
        'fantom': 'FANTOM',
        'moonbeam': 'MOONBEAM',
        'moonriver': 'MOONRIVER',
        'gnosis': 'GNOSIS',
        'celo': 'CELO',
        'harmony': 'HARMONY'
      };

      const rangoChain = rangoChainMap[String(chainName || '').toLowerCase()] || 'ETH';

      // Validate chain is supported
      if (!rangoChain || rangoChain === 'UNDEFINED') {
        throw new Error(`Unsupported chain for Rango: ${chainName}`);
      }

      // Convert amount from wei/lamports to token units with decimals
      // IMPORTANT: Rango expects amount as string in token units (same as Rubic/LIFI)
      let amountInTokens;
      try {
        const amountNum = parseFloat(amount_in_big) / Math.pow(10, des_input);

        // Validate numeric value
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
          throw new Error(`Invalid numeric amount: ${amountNum}`);
        }

        // Format to avoid scientific notation and excessive decimals
        const precision = Math.min(des_input, 18); // Max 18 decimal places
        amountInTokens = amountNum.toFixed(precision).replace(/\.?0+$/, '');

        // Ensure we have at least some value
        if (parseFloat(amountInTokens) <= 0) {
          throw new Error(`Amount too small: ${amountInTokens}`);
        }
      } catch (e) {
        throw new Error(`Amount conversion failed: ${e.message} (input: ${amount_in_big}, decimals: ${des_input})`);
      }

      // ✅ NATIVE TOKEN DETECTION: Use address:null for native tokens (BNB, ETH, SOL, etc)
      // Native tokens identified by special addresses
      const nativeAddresses = [
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // Common native token placeholder
        '0x0000000000000000000000000000000000000000', // Zero address
        '0x', // Empty address
        ''    // Empty string
      ];

      const isSolana = rangoChain === 'SOLANA';
      let srcToken = isSolana ? sc_input_in : String(sc_input_in).toLowerCase().trim();
      let dstToken = isSolana ? sc_output_in : String(sc_output_in).toLowerCase().trim();

      // Check if source token is native
      if (nativeAddresses.includes(srcToken.toLowerCase())) {
        srcToken = null; // ✅ Rango uses null for native tokens
      }

      // Check if destination token is native
      if (nativeAddresses.includes(dstToken.toLowerCase())) {
        dstToken = null; // ✅ Rango uses null for native tokens
      }

      // Get symbols (fallback to empty if not provided)
      const srcSymbol = String(symbol_in || '').toUpperCase();
      const dstSymbol = String(symbol_out || '').toUpperCase();

      // ✅ Build request body following Rango App format
      const requestBody = {
        amount: amountInTokens,
        from: {
          address: srcToken,
          blockchain: rangoChain,
          symbol: srcSymbol
        },
        to: {
          address: dstToken,
          blockchain: rangoChain,
          symbol: dstSymbol
        },
        connectedWallets: [],
        selectedWallets: {},
        slippage: getSlippageValue(), // USER-CONFIGURABLE slippage
        contractCall: false,
        swapperGroups: [
          "Across", "AllBridge", "Arbitrum Bridge", "Bridgers", "Chainflip",
          "Circle", "Circle V2", "DeBridge", "Garden", "Hyperliquid", "IBC",
          "Layer Zero", "Maya Protocol", "Mayan", "NearIntent", "Optimism Bridge",
          "Orbiter", "Pluton", "Rainbow Bridge", "RelayProtocol", "SWFT",
          "Satellite", "Shimmer Bridge", "Stargate", "Stargate Economy",
          "Symbiosis", "TeleSwap", "ThorChain", "XO Swap", "XY Finance", "Zuno"
        ],
        swappersGroupsExclude: true, // Exclude bridges, focus on DEXs
        enableCentralizedSwappers: true // Enable CEX routes if available
      };

      // ✅ Get API key from secrets.js (using official Rango test key)
      const apiKey = (typeof getRandomApiKeyRango === 'function') ? getRandomApiKeyRango() : 'c6381a79-2817-4602-83bf-6a641a409e32';

      // ✅ Use api.rango.exchange (standard endpoint) — api-edge is Cloudflare-protected (403)
      // No CORS proxy needed — api.rango.exchange supports CORS natively (same as LIFI/DZAP)
      const apiUrl = `https://api.rango.exchange/routing/bests?apiKey=${apiKey}`;

      // ✅ Return format same as LIFI/Rubic (NOT ajaxConfig wrapper!)
      return {
        url: apiUrl,
        method: 'POST',
        data: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };
    },

    parseResponse: (response, { des_output, chainName }) => {
      // ✅ Signature same as LIFI/Rubic: (response, { des_output, chainName })
      // Parse Rango response and extract multiple routes
      // Response format: { from, to, requestAmount, routeId, results: [...], error }

      // ✅ Same validation pattern as LIFI/Rubic
      if (!response) {
        throw new Error('Empty response from Rango API');
      }

      // Check for API errors
      if (response.error) {
        const errorMsg = response.error.message || response.error || 'Unknown error from Rango';
        throw new Error(`Rango API error: ${errorMsg}`);
      }

      // Validate routes array
      if (!Array.isArray(response.results)) {
        throw new Error('Invalid Rango response: results not found');
      }

      const results = response.results;

      if (results.length === 0) {
        throw new Error('No routes available for this trade pair');
      }

      console.log(`[RANGO] Found ${results.length} routes`);

      // Parse each route and build subResults (same pattern as LIFI)
      const subResults = [];
      for (const route of results) {
        try {
          if (!route || !route.outputAmount) continue;

          // ✅ Extract output amount (already in decimal format from Rango)
          // Rango returns outputAmount as string with decimals included (e.g., "431.585062830799060992")
          const amount_out = parseFloat(route.outputAmount);

          if (!Number.isFinite(amount_out) || amount_out <= 0) {
            console.warn('[RANGO] Invalid output amount:', route.outputAmount);
            continue;
          }

          // ✅ Calculate total fee from fee[] array
          // Rango returns fee as array of objects with { asset, expenseType, amount, name, price }
          let totalFeeUSD = 0;
          if (Array.isArray(route.swaps) && route.swaps.length > 0) {
            route.swaps.forEach(swap => {
              if (Array.isArray(swap.fee)) {
                swap.fee.forEach(feeItem => {
                  // Calculate fee in USD: amount * price
                  const feeAmount = parseFloat(feeItem.amount || 0);
                  const feePrice = parseFloat(feeItem.price || 0);
                  const feeUSD = feeAmount * feePrice;

                  if (Number.isFinite(feeUSD) && feeUSD > 0) {
                    totalFeeUSD += feeUSD;
                  }
                });
              }
            });
          }

          // Fallback to default fee if no fee info
          const FeeSwap = (Number.isFinite(totalFeeUSD) && totalFeeUSD > 0)
            ? totalFeeUSD
            : getFeeSwap(chainName);

          // ✅ Get provider name from first swap (same pattern as LIFI)
          let providerName = 'RANGO';
          try {
            if (route.swaps && route.swaps.length > 0) {
              const firstSwap = route.swaps[0];
              providerName = firstSwap.swapperId || firstSwap.swapperTitle || 'RANGO';
            }
          } catch (_) { }

          // Format same as LIFI result
          subResults.push({
            amount_out: amount_out,
            FeeSwap: FeeSwap,
            dexTitle: providerName.toUpperCase()
          });

        } catch (e) {
          console.warn('[RANGO] Error parsing route:', e);
          continue;
        }
      }

      if (subResults.length === 0) {
        throw new Error("No valid Rango routes found");
      }

      // ✅ Filter blacklisted providers dari config offDexResultScan
      const filteredRango = filterOffDexResults(subResults);
      if (filteredRango.length === 0) throw new Error('Rango: Semua provider terfilter oleh offDexResultScan');

      // Sort by amount_out (descending) dan ambil top N sesuai config
      const maxProviders = (() => {
        try {
          const v = parseInt((getFromLocalStorage('SETTING_SCANNER') || {}).metaDex?.topRoutes);
          if (v > 0) return v;
        } catch (_) { }
        return (typeof window !== 'undefined' && window.CONFIG_DEXS?.rango?.maxProviders) || 3;
      })();
      filteredRango.sort((a, b) => b.amount_out - a.amount_out);
      const topN = filteredRango.slice(0, maxProviders);

      console.log(`[RANGO] Returning top ${maxProviders} routes from ${filteredRango.length} filtered routes`);

      // ✅ Return format same as LIFI/Rubic
      return {
        amount_out: topN[0].amount_out,
        FeeSwap: topN[0].FeeSwap,
        dexTitle: 'RANGO',
        subResults: topN,
        isMultiDex: true
      };
    }
  };

  // =============================
  // JUPITER Ultra Strategy - Solana DEX Aggregator
  // =============================
  // Jupiter Ultra API Keys (rotasi untuk rate limiting)
  const apiKeysJupiter = [
    'dcab1007-f0ee-41b4-9bc4-fbf595524614',
    '5540a0e1-afa5-48a3-940b-38e18d0a6bfd'
  ];
  let jupiterKeyIndex = 0;
  function getRandomApiKeyJupiter() {
    const key = apiKeysJupiter[jupiterKeyIndex];
    jupiterKeyIndex = (jupiterKeyIndex + 1) % apiKeysJupiter.length;
    return key;
  }

  dexStrategies.jupiter = {
    buildRequest: ({ sc_input_in, sc_output_in, amount_in_big, SavedSettingData }) => {
      // Jupiter Ultra API v1 Order endpoint
      // Use original addresses (base58 is case-sensitive for Solana)
      const params = new URLSearchParams({
        inputMint: sc_input_in,
        outputMint: sc_output_in,
        amount: amount_in_big.toString()
      });

      // Optional: Add taker wallet for transaction generation
      const walletSolana = SavedSettingData?.walletSolana;
      if (walletSolana) {
        params.append('taker', walletSolana);
      }

      const apiKey = getRandomApiKeyJupiter();
      return {
        url: `https://api.jup.ag/ultra/v1/order?${params.toString()}`,
        method: 'GET',
        headers: {
          'x-api-key': apiKey
        }
      };
    },
    parseResponse: (response, { des_output }) => {
      // Check for error response
      if (response?.errorCode || response?.errorMessage) {
        throw new Error(response.errorMessage || `Jupiter Error: ${response.errorCode}`);
      }

      // Parse Jupiter Ultra response
      if (!response?.outAmount) {
        throw new Error("Invalid Jupiter Ultra response structure");
      }

      const amount_out = parseFloat(response.outAmount) / Math.pow(10, des_output);

      // Parse fees from Ultra API response
      let FeeSwap = 0;
      try {
        // Jupiter Ultra returns fees in lamports, convert to USD
        const sigFeeLamports = parseFloat(response.signatureFeeLamports || 0);
        const prioFeeLamports = parseFloat(response.prioritizationFeeLamports || 0);
        const rentFeeLamports = parseFloat(response.rentFeeLamports || 0);
        const totalFeeLamports = sigFeeLamports + prioFeeLamports + rentFeeLamports;

        // Convert lamports to SOL (1 SOL = 1e9 lamports)
        const feeInSol = totalFeeLamports / 1e9;

        // Get SOL price from gas data
        const allGasData = (typeof getFromLocalStorage === 'function')
          ? getFromLocalStorage("ALL_GAS_FEES")
          : null;

        if (allGasData) {
          const solGasInfo = allGasData.find(g =>
            String(g.chain || '').toLowerCase() === 'solana'
          );
          if (solGasInfo && solGasInfo.nativeTokenPrice) {
            FeeSwap = feeInSol * solGasInfo.nativeTokenPrice;
          }
        }

        // Final fallback
        if (!Number.isFinite(FeeSwap) || FeeSwap <= 0) {
          FeeSwap = 0.001; // Default minimal fee for Solana
        }
      } catch (e) {
        FeeSwap = 0.001;
      }

      // Return simple format like Kyber
      return {
        amount_out: amount_out,
        FeeSwap: FeeSwap,
        dexTitle: 'JUPITER',
        routeTool: 'JUPITER'
      };
    }
  };

  // =============================
  // DFLOW Strategy - Solana DEX Aggregator
  // =============================
  // Official API: https://pond.dflow.net/build/trading-api/imperative/quote
  dexStrategies.dflow = {
    buildRequest: ({ sc_input_in, sc_output_in, amount_in_big, SavedSettingData }) => {
      /**
       * DFlow Quote API
       * Endpoint: GET https://quote-api.dflow.net/quote
       * 
       * Required Headers:
       * - x-api-key: API key for authentication (contact [email protected])
       * 
       * Query Parameters:
       * - inputMint: Base58-encoded input mint address (required)
       * - outputMint: Base58-encoded output mint address (required)
       * - amount: Input amount as scaled integer, e.g., 1 SOL = 1000000000 (required)
       * - slippageBps: Max slippage in basis points OR "auto" for automatic (optional)
       * - dexes: Comma-separated list of DEXes to include (optional)
       * - excludeDexes: Comma-separated list of DEXes to exclude (optional)
       * - onlyDirectRoutes: If true, only use single-leg routes (optional)
       * - maxRouteLength: Max number of legs in route (optional)
       */

      // Get DFlow API key from settings
      const apiKey = SavedSettingData?.apiKeyDFlow || '';

      // ⚠️ API KEY REQUIRED - DFlow API returns 403 without authentication
      if (!apiKey) {
        throw new Error('DFlow API requires API key. Contact [email protected] to obtain one. Use Jupiter or Matcha for Solana swaps without API key.');
      }

      // Use original addresses (base58 is case-sensitive for Solana)
      const params = new URLSearchParams({
        inputMint: sc_input_in,
        outputMint: sc_output_in,
        amount: amount_in_big.toString(),
        slippageBps: 'auto' // Auto slippage (can also be a number like 50 for 0.5%)
      });

      return {
        url: `https://quote-api.dflow.net/quote?${params.toString()}`,
        method: 'GET',
        headers: { 'x-api-key': apiKey }
      };
    },
    parseResponse: (response, { des_output }) => {
      /**
       * DFlow Response Format:
       * {
       *   "contextSlot": 1,
       *   "inAmount": "1000000000",           // Input amount (scaled)
       *   "inputMint": "So11111...",          // Input mint address
       *   "outAmount": "37124000",            // Expected output amount (scaled)
       *   "minOutAmount": "36753000",         // Minimum output (with slippage)
       *   "otherAmountThreshold": "36753000", // Same as minOutAmount
       *   "outputMint": "Es9vMFr...",         // Output mint address
       *   "priceImpactPct": "0.01",           // Price impact percentage
       *   "routePlan": [                      // Route details
       *     {
       *       "venue": "Raydium",
       *       "inputMint": "...",
       *       "outputMint": "...",
       *       "inAmount": "...",
       *       "outAmount": "..."
       *     }
       *   ],
       *   "slippageBps": 50,                  // Applied slippage in bps
       *   "simulatedComputeUnits": 300000,    // Compute units consumed
       *   "requestId": "..."                  // Request identifier
       * }
       */

      // Check for error response
      if (response?.error || response?.errorMessage) {
        throw new Error(response.errorMessage || response.error || 'DFlow API Error');
      }

      // Parse DFlow response - use outAmount (expected output)
      if (!response?.outAmount) {
        throw new Error("Invalid DFlow response - missing outAmount");
      }

      const amount_out = parseFloat(response.outAmount) / Math.pow(10, des_output);

      // Parse fees - DFlow doesn't return explicit gas fee, estimate from simulatedComputeUnits
      let FeeSwap = 0;
      try {
        // Get SOL price from gas data for fee estimation
        const allGasData = (typeof getFromLocalStorage === 'function')
          ? getFromLocalStorage("ALL_GAS_FEES")
          : null;

        if (allGasData) {
          const solGasInfo = allGasData.find(g =>
            String(g.chain || '').toLowerCase() === 'solana'
          );
          if (solGasInfo && solGasInfo.nativeTokenPrice) {
            // Use simulatedComputeUnits from response for accurate fee estimation
            const computeUnits = response.simulatedComputeUnits || 300000;
            // Solana fee calculation: compute_units * microlamports_per_cu / 1e6 lamports
            // Typical: 5000 microlamports per CU, so 300k CU = 1.5M microlamports = 0.0015 SOL
            const lamports = (computeUnits * 5000) / 1e6; // Convert to lamports
            const solFee = lamports / 1e9; // Convert lamports to SOL
            FeeSwap = solFee * solGasInfo.nativeTokenPrice;
          }
        }

        // Final fallback
        if (!Number.isFinite(FeeSwap) || FeeSwap <= 0) {
          FeeSwap = 0.001; // Default minimal fee for Solana (~$0.001)
        }
      } catch (e) {
        FeeSwap = 0.001;
      }

      // Log route information if available
      if (response.routePlan && Array.isArray(response.routePlan)) {
        const venues = response.routePlan.map(leg => leg.venue).filter(v => v);
        console.log(`[DFlow] Route: ${venues.join(' → ')} (${response.routePlan.length} legs)`);
      }

      // Return simple format like Kyber
      return {
        amount_out: amount_out,
        FeeSwap: FeeSwap,
        dexTitle: 'DFLOW',
        routeTool: 'DFLOW'
      };
    }
  };

  // =============================
  // KAMINO Strategy - Solana Multi-DEX Aggregator (like LIFI/DZAP)
  // =============================
  dexStrategies.kamino = {
    buildRequest: ({ sc_input_in, sc_output_in, amount_in_big }) => {
      // Kamino K-Swap API endpoint - aggregates 13+ Solana DEX routers
      const params = new URLSearchParams({
        tokenIn: sc_input_in,
        tokenOut: sc_output_in,
        amount: amount_in_big.toString(),
        swapType: 'exactIn',
        maxSlippageBps: String(Math.round(parseFloat(getSlippageValue()) * 100)),  // USER-CONFIGURABLE (bps)
        includeRfq: 'true',
        timeoutMs: '1200',
        atLeastOneNoMoreThanTimeoutMS: '2000'
      });

      // Add all router types (13 providers)
      const routers = [
        'jupiter', 'jupiterSelfHosted', 'jupiterEuropa',
        'metis', 'per', 'dflow', 'raydium', 'hashflow',
        'okx', 'clover', 'zeroEx', 'spur', 'lifi'
      ];
      routers.forEach(r => params.append('routerTypes[]', r));

      return {
        url: `https://api.kamino.finance/kswap/all-quotes?${params.toString()}`,
        method: 'GET'
      };
    },
    parseResponse: (response, { des_input, des_output }) => {
      // Check for error response
      if (response?.error || !response?.data || !Array.isArray(response.data)) {
        throw new Error(response?.error || 'Invalid Kamino response');
      }

      const quotes = response.data;
      if (quotes.length === 0) {
        throw new Error('No routes found from Kamino');
      }

      // Sort by amountOut descending (best rate first)
      quotes.sort((a, b) => {
        const amtA = parseFloat(a.amountsExactIn?.amountOut || 0);
        const amtB = parseFloat(b.amountsExactIn?.amountOut || 0);
        return amtB - amtA;
      });

      // Get SOL price for fee calculation
      let solPrice = 0;
      try {
        const allGasData = (typeof getFromLocalStorage === 'function')
          ? getFromLocalStorage("ALL_GAS_FEES")
          : null;
        if (allGasData) {
          const solGasInfo = allGasData.find(g =>
            String(g.chain || '').toLowerCase() === 'solana'
          );
          if (solGasInfo && solGasInfo.nativeTokenPrice) {
            solPrice = solGasInfo.nativeTokenPrice;
          }
        }
      } catch (_) { }

      // Take top N quotes for display (like LIFI/DZAP)
      const maxN = (() => {
        try {
          const v = parseInt((getFromLocalStorage('SETTING_SCANNER') || {}).metaDex?.topRoutes);
          if (v > 0) return v;
        } catch (_) { }
        return 3;
      })();
      const top3 = quotes.slice(0, maxN).map(quote => {
        const amountOut = parseFloat(quote.amountsExactIn?.amountOut || 0) / Math.pow(10, des_output);
        const amountOutGuaranteed = parseFloat(quote.amountsExactIn?.amountOutGuaranteed || 0) / Math.pow(10, des_output);

        // Calculate fee from slippage difference
        const slippageDiff = amountOut - amountOutGuaranteed;

        // Estimate gas fee (Kamino doesn't return explicit fee)
        // Use typical Solana transaction fee: ~0.000005 SOL
        let FeeSwap = 0.001; // default
        if (solPrice > 0) {
          FeeSwap = 0.000005 * solPrice; // ~5000 lamports
        }

        // Router name mapping for display
        const routerMap = {
          'jupiterSelfHosted': 'Jupiter',
          'jupiterEuropa': 'Jupiter',
          'okx': 'OKX',
          'dflow': 'DFlow',
          'per': 'Perp',
          'zeroEx': '0x',
          'raydium': 'Raydium',
          'hashflow': 'Hashflow',
          'metis': 'Metis',
          'clover': 'Clover',
          'spur': 'Spur',
          'lifi': 'LiFi'
        };

        const routerType = quote.routerType || 'Unknown';
        const displayName = routerMap[routerType] || String(routerType).toUpperCase();

        return {
          amount_out: amountOut,
          amountOut: amountOut,
          FeeSwap: FeeSwap,
          fee: FeeSwap,
          dexTitle: displayName,
          dexName: displayName,
          provider: routerType,
          dexId: routerType,
          priceImpactBps: quote.priceImpactBps || 0,
          guaranteedAmount: amountOutGuaranteed,
          responseTimeMs: quote.responseTimeGetQuoteMs || 0
        };
      });

      // Return multi-DEX format (like LIFI/DZAP)
      return {
        subResults: top3,
        isMultiDex: true
      };
    }
  };

  // =============================
  // RUBIC Strategy - Multi-Chain DEX Aggregator (like LIFI/DZAP)
  // =============================

  // 🚀 ANTI RATE-LIMITING SOLUTION
  // Simple throttling: track last request time and log warning if too frequent
  // General DEX_RESPONSE_CACHE (60s TTL) handles response caching automatically
  const RUBIC_LAST_REQUEST = { timestamp: 0 };
  const RUBIC_MIN_INTERVAL = 1000; // Warn if requests are < 1000ms apart (max 1 req/sec recommended)

  dexStrategies.rubic = {
    buildRequest: ({ sc_input_in, sc_output_in, amount_in_big, des_input, chainName }) => {
      // 🚀 THROTTLING CHECK: Track request timing (silent, for potential future rate limiting)
      const now = Date.now();
      RUBIC_LAST_REQUEST.timestamp = now;
      // Rubic chain mapping: app chain names → Rubic API format
      // Rubic API supports both numeric IDs (56, 1, 137) and string names (BSC, ETH, POLYGON)
      const chainMap = {
        'bsc': 'BSC',
        'ethereum': 'ETH',
        'polygon': 'POLYGON',
        'arbitrum': 'ARBITRUM',
        'base': 'BASE',
        'optimism': 'OPTIMISM',
        'avalanche': 'AVAX',
        'gnosis': 'GNOSIS',
        'fantom': 'FANTOM',
        'avalanche-c': 'AVAX'
      };

      const chain = String(chainName || '').toLowerCase();
      const rubicChain = chainMap[chain] || String(chainName || '').toUpperCase();

      // Validate chain is supported
      if (!rubicChain || rubicChain === 'UNDEFINED') {
        throw new Error(`Unsupported chain for Rubic: ${chainName}`);
      }

      // Convert amount from wei/lamports to token units with decimals
      // IMPORTANT: Rubic expects amount as string in token units (e.g., "100" not "100000000000000000000")
      let amountInTokens;
      try {
        const amountNum = parseFloat(amount_in_big) / Math.pow(10, des_input);

        // Validate numeric value
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
          throw new Error(`Invalid numeric amount: ${amountNum}`);
        }

        // Format to avoid scientific notation and excessive decimals
        // Use toFixed with appropriate precision, then remove trailing zeros
        const precision = Math.min(des_input, 18); // Max 18 decimal places
        amountInTokens = amountNum.toFixed(precision).replace(/\.?0+$/, '');

        // Ensure we have at least some value
        if (parseFloat(amountInTokens) <= 0) {
          throw new Error(`Amount too small: ${amountInTokens}`);
        }
      } catch (e) {
        throw new Error(`Amount conversion failed: ${e.message} (input: ${amount_in_big}, decimals: ${des_input})`);
      }

      // EVM chains require lowercase addresses
      const srcToken = String(sc_input_in || '').toLowerCase().trim();
      const dstToken = String(sc_output_in || '').toLowerCase().trim();

      // Validate token addresses
      if (!srcToken || srcToken === '0x' || srcToken.length < 10) {
        throw new Error(`Invalid source token address: ${sc_input_in}`);
      }
      if (!dstToken || dstToken === '0x' || dstToken.length < 10) {
        throw new Error(`Invalid destination token address: ${sc_output_in}`);
      }

      // Build request body - exact format that works with Rubic API
      const requestBody = {
        srcTokenAddress: srcToken,
        srcTokenBlockchain: rubicChain,
        srcTokenAmount: amountInTokens,
        dstTokenAddress: dstToken,
        dstTokenBlockchain: rubicChain,
        referrer: 'rubic.exchange'
      };

      // Rubic API requires POST with JSON body (NO params wrapper for /quoteAll)
      // Endpoint: /api/routes/quoteAll returns all routes (for multi-DEX display)
      // Note: /quoteBest uses "params" wrapper, but /quoteAll uses direct body

      // CORS proxy required — api-v2.rubic.exchange does not send CORS headers for browser requests
      let apiUrl = 'https://api-v2.rubic.exchange/api/routes/quoteAll';
      try {
        const proxyPrefix = (window.CONFIG_PROXY && window.CONFIG_PROXY.PREFIX) || '';
        if (proxyPrefix) apiUrl = proxyPrefix + apiUrl;
      } catch (e) {
        console.warn('[Rubic] Failed to apply proxy:', e.message);
      }

      return {
        url: apiUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        data: JSON.stringify(requestBody)
      };
    },
    parseResponse: (response, { des_input, des_output, chainName }) => {
      // Validate response structure
      if (!response) {
        throw new Error('Empty response from Rubic API');
      }

      // Check for API errors
      if (response.error || response.message) {
        const errorMsg = response.error?.message || response.message || 'Unknown error from Rubic';
        throw new Error(`Rubic API error: ${errorMsg}`);
      }

      // Validate routes array
      if (!Array.isArray(response.routes)) {
        throw new Error('Invalid Rubic response: routes not found');
      }

      const routes = response.routes;

      if (routes.length === 0) {
        // Check if there are failed routes
        const failedCount = Array.isArray(response.failed) ? response.failed.length : 0;
        if (failedCount > 0) {
          throw new Error(`No successful routes found (${failedCount} failed routes)`);
        }
        throw new Error('No routes available for this trade pair');
      }

      // Sort by destinationTokenAmount descending (best rate first)
      routes.sort((a, b) => {
        const amtA = parseFloat(a.estimate?.destinationTokenAmount || 0);
        const amtB = parseFloat(b.estimate?.destinationTokenAmount || 0);
        return amtB - amtA;
      });

      // Get native token price for fee calculation
      let nativePrice = 0;
      try {
        const allGasData = (typeof getFromLocalStorage === 'function')
          ? getFromLocalStorage("ALL_GAS_FEES")
          : null;
        if (allGasData) {
          const chain = String(chainName || '').toLowerCase();
          const gasInfo = allGasData.find(g =>
            String(g.chain || '').toLowerCase() === chain
          );
          if (gasInfo && gasInfo.nativeTokenPrice) {
            nativePrice = gasInfo.nativeTokenPrice;
          }
        }
      } catch (_) { }

      // Take top N routes for display (like LIFI/DZAP/Kamino)
      const maxN = (() => {
        try {
          const v = parseInt((getFromLocalStorage('SETTING_SCANNER') || {}).metaDex?.topRoutes);
          if (v > 0) return v;
        } catch (_) { }
        return 3;
      })();
      const top3 = routes.slice(0, maxN).map((route, idx) => {
        // Parse amount out (already in token units from API)
        const amountOut = parseFloat(route.estimate?.destinationTokenAmount || 0);
        const amountOutMin = parseFloat(route.estimate?.destinationTokenMinAmount || 0);

        // Calculate gas fee
        let FeeSwap = 0;
        try {
          const gasUsd = parseFloat(route.fees?.gasTokenFees?.gas?.totalUsdAmount || 0);
          const protocolUsd = parseFloat(route.fees?.gasTokenFees?.protocol?.fixedUsdAmount || 0);
          FeeSwap = gasUsd + protocolUsd;
        } catch (_) {
          // Fallback: estimate from gas limit
          const gasLimit = parseFloat(route.fees?.gasTokenFees?.gas?.gasLimit || 0);
          const gasPrice = parseFloat(route.fees?.gasTokenFees?.gas?.gasPrice || 0);
          if (gasLimit > 0 && gasPrice > 0 && nativePrice > 0) {
            const gasCost = (gasLimit * gasPrice) / 1e18; // Wei to native token
            FeeSwap = gasCost * nativePrice;
          }
        }

        // Provider name mapping for display (based on Rubic API supported providers)
        const providerMap = {
          // Major Aggregators
          'LIFI': 'LiFi',
          'RANGO': 'Rango',
          'OPEN_OCEAN': 'OpenOcean',
          'ODOS': 'ODOS',
          'XY_DEX': 'XY Finance',
          // DEX Protocols
          'UNISWAP_V2': 'UniswapV2',
          'UNI_SWAP_V3': 'UniswapV3',
          'SUSHI_SWAP': 'SushiSwap',
          'PANCAKE_SWAP': 'PancakeSwap',
          'QUICK_SWAP': 'QuickSwap',
          'ALGEBRA': 'Algebra',
          'SYNC_SWAP': 'SyncSwap',
          'MUTE_SWAP': 'MuteSwap',
          // Cross-Chain Bridges
          'SQUIDROUTER': 'SquidRouter',
          'SYMBIOSIS': 'Symbiosis',
          'CELER_BRIDGE': 'Celer',
          'DLN': 'DLN',
          'STARGATE_V2': 'Stargate',
          'ORBITER_BRIDGE': 'Orbiter',
          // Chain-Specific
          'AERODROME': 'Aerodrome',
          'FENIX_V2': 'Fenix',
          'FENIX_V3': 'FenixV3',
          'EDDY_FINANCE': 'Eddy',
          'IZUMI': 'iZUMi',
          // Others
          'DODO': 'DODO',
          'CURVE': 'Curve',
          'NATIVE_ROUTER': 'NativeRouter'
        };

        const providerType = route.providerType || 'Unknown';
        const displayName = providerMap[providerType] || String(providerType).replace(/_/g, ' ');

        return {
          amount_out: amountOut,
          amountOut: amountOut,
          FeeSwap: FeeSwap,
          fee: FeeSwap,
          dexTitle: displayName,
          dexName: displayName,
          provider: providerType,
          dexId: providerType.toLowerCase(),
          priceImpact: parseFloat(route.estimate?.priceImpact || 0),
          guaranteedAmount: amountOutMin,
          durationInMinutes: route.estimate?.durationInMinutes || 1
        };
      });

      // Return multi-DEX format — top-level amount_out wajib ada agar calculateResult tidak early-return
      return {
        amount_out: top3[0].amount_out,
        FeeSwap: top3[0].FeeSwap,
        dexTitle: 'RUBIC',
        routeTool: 'RUBIC',
        subResults: top3,
        isMultiDex: true
      };
    }
  };

  // =============================
  // ROCKETX Strategy - Multi-Chain DEX Aggregator
  // Returns multiple DEX quotes in one GET call (like LIFI/RANGO)
  // API: GET https://api.rocketx.exchange/v1/quotation?...
  // Auth: x-api-key header
  // Filters: only exchange_type === 'DEX' (skip CEX routes)
  // =============================
  dexStrategies.rocketx = {
    buildRequest: ({ chainName, sc_input_in, sc_output_in, amount_in_big, des_input }) => {
      // RocketX chain name mapping (lowercase network IDs)
      const rxChainMap = {
        'ethereum': 'ethereum',
        'bsc': 'bsc',
        'polygon': 'polygon',
        'arbitrum': 'arbitrum',
        'optimism': 'optimism',
        'base': 'base',
        'avalanche': 'avalanche',
        'fantom': 'fantom'
      };
      const chain = String(chainName || '').toLowerCase();
      const rxChain = rxChainMap[chain] || chain;

      // Convert amount from wei (amount_in_big) to token units
      let amountInTokens;
      try {
        amountInTokens = parseFloat(amount_in_big) / Math.pow(10, des_input);
        if (!Number.isFinite(amountInTokens) || amountInTokens <= 0) throw new Error('Invalid amount');
      } catch (e) {
        throw new Error(`RocketX: Amount conversion failed: ${e.message}`);
      }

      // Native token address normalization → zero address
      const nativeAddresses = [
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        '0x0000000000000000000000000000000000000000',
        '0x', ''
      ];
      let fromToken = String(sc_input_in || '').toLowerCase();
      let toToken = String(sc_output_in || '').toLowerCase();
      if (nativeAddresses.includes(fromToken)) fromToken = '0x0000000000000000000000000000000000000000';
      if (nativeAddresses.includes(toToken)) toToken = '0x0000000000000000000000000000000000000000';

      const apiKey = (typeof getRandomApiKeyRocketX === 'function')
        ? getRandomApiKeyRocketX()
        : 'znYxDQz2P46Dsbdj5slpe9i5ofpv4hkOaUuyV6xU';

      const apiUrl = `https://api.rocketx.exchange/v1/quotation?fromToken=${fromToken}&fromNetwork=${rxChain}&toToken=${toToken}&toNetwork=${rxChain}&amount=${amountInTokens}&slippage=${getSlippageValue()}&walletLess=false`;

      return {
        url: apiUrl,
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json'
        }
      };
    },

    parseResponse: (response, { chainName }) => {
      if (!response || !Array.isArray(response.quotes)) {
        throw new Error('RocketX: Invalid response - no quotes array');
      }
      const allQuotes = response.quotes;
      if (allQuotes.length === 0) throw new Error('RocketX: No quotes available');

      // Filter DEX-only quotes (skip CEX routes: CHANGELLY, CHANGENOW, SIMPLESWAP dll)
      const dexQuotes = allQuotes.filter(q => q.exchangeInfo?.exchange_type === 'DEX');
      if (dexQuotes.length === 0) throw new Error('RocketX: No DEX quotes (all routes are CEX)');

      // Ambil satu quote terbaik (amount_out tertinggi)
      let best = null;
      for (const q of dexQuotes) {
        try {
          const amount_out = parseFloat(q.toAmount);
          if (!Number.isFinite(amount_out) || amount_out <= 0) continue;

          const platformFeeUsd = parseFloat(q.platformFeeUsd || 0);
          const gasFeeUsd = parseFloat(q.gasFeeUsd || 0);
          const FeeSwap = (platformFeeUsd + gasFeeUsd) > 0
            ? (platformFeeUsd + gasFeeUsd)
            : getFeeSwap(chainName);

          if (!best || amount_out > best.amount_out) {
            best = { amount_out, FeeSwap };
          }
        } catch (_) { continue; }
      }

      if (!best) throw new Error('RocketX: No valid DEX quotes parsed');

      console.log(`[ROCKETX] Best DEX quote: ${best.amount_out} (${dexQuotes.length} DEX / ${allQuotes.length} total)`);

      return {
        amount_out: best.amount_out,
        FeeSwap: best.FeeSwap,
        dexTitle: 'ROCKETX',
        routeTool: 'ROCKETX'
      };
    }
  };

  // =============================
  // METAX Strategy - MetaMask Bridge SSE Streaming
  // =============================
  // Protokol: SSE (Server-Sent Events) via EventSource
  // Endpoint: https://bridge.api.cx.metamask.io/getQuoteStream
  // Event type: "quote" — setiap event = 1 quote dari 1 provider
  // EVM only, same-chain swap (srcChainId === destChainId)
  dexStrategies.metax = {
    execute: ({ chainName, sc_input_in, sc_output_in, amount_in_big, des_output, SavedSettingData }) => {
      return new Promise((resolve, reject) => {
        // Chain ID mapping (EVM only)
        const metaxChainMap = {
          'ethereum': 1, 'eth': 1,
          'bsc': 56, 'bnb': 56, 'binance': 56,
          'polygon': 137, 'matic': 137,
          'arbitrum': 42161, 'arb': 42161,
          'optimism': 10, 'op': 10,
          'base': 8453,
          'avalanche': 43114, 'avax': 43114,
          'zksync': 324,
          'linea': 59144
        };

        const chain = String(chainName || '').toLowerCase();
        const chainId = metaxChainMap[chain];
        if (!chainId) return reject(new Error(`MetaX: Chain tidak didukung: ${chainName}`));

        const walletAddr = (SavedSettingData?.walletMeta) || '0x0000000000000000000000000000000000000000';
        const fromToken = String(sc_input_in || '').toLowerCase();
        const toToken = String(sc_output_in || '').toLowerCase();
        const srcAmount = amount_in_big.toString();

        const url = `https://bridge.api.cx.metamask.io/getQuoteStream` +
          `?walletAddress=${walletAddr}&destWalletAddress=${walletAddr}` +
          `&srcChainId=${chainId}&destChainId=${chainId}` +
          `&srcTokenAddress=${fromToken}&destTokenAddress=${toToken}` +
          `&srcTokenAmount=${srcAmount}` +
          `&insufficientBal=true&resetApproval=false&gasIncluded=true&gasIncluded7702=false&slippage=${getSlippageValue()}`;

        const quotes = [];
        let settled = false;
        let es;

        const finish = () => {
          if (settled) return;
          settled = true;
          try { es.close(); } catch (_) { }

          if (quotes.length === 0) return reject(new Error('MetaX: Tidak ada quote diterima'));

          // Parse tiap quote jadi subResult
          const subResults = [];
          for (const item of quotes) {
            try {
              const q = item.quote || item;
              if (!q || !q.destTokenAmount) continue;

              const destDecimals = Number(q.destAsset?.decimals ?? des_output);
              const amount_out = parseFloat(q.destTokenAmount) / Math.pow(10, destDecimals);
              if (!Number.isFinite(amount_out) || amount_out <= 0) continue;

              // Fee METAX: utamakan gas cost dari estimasi gas (bukan platform fee)
              // Priority: gasEstimate dari response → getFeeSwap dari RPC → platform fee metabridge
              let FeeSwap = 0;
              let feeSource = 'fallback';
              try {
                // 1️⃣ Coba ambil gas cost dari field gasMultiplier/gasEstimate
                const gasEstUSD = parseFloat(
                  q.feeData?.gas?.amount
                    ? (parseFloat(q.feeData.gas.amount) / Math.pow(10, q.feeData.gas?.asset?.decimals ?? 18))
                    * parseFloat(q.feeData.gas.asset?.priceUSD ?? 0)
                    : 0
                );
                if (Number.isFinite(gasEstUSD) && gasEstUSD > 0 && gasEstUSD < 100) {
                  FeeSwap = gasEstUSD;
                  feeSource = 'api';
                }
              } catch (_) { }
              // 2️⃣ Fallback ke RPC gas estimate (akurat, dari ALL_GAS_FEES)
              if (FeeSwap <= 0) { FeeSwap = (typeof getFeeSwap === 'function') ? getFeeSwap(chainName) : 0; feeSource = 'fallback'; }
              // 3️⃣ Terakhir: pakai platform fee metabridge hanya jika semua gagal
              if (FeeSwap <= 0) {
                try {
                  const mb = q.feeData?.metabridge;
                  if (mb && mb.amount) {
                    const feeDecimals = Number(mb.asset?.decimals ?? 18);
                    const feePriceUSD = parseFloat(mb.asset?.priceUSD ?? 0);
                    FeeSwap = (parseFloat(mb.amount) / Math.pow(10, feeDecimals)) * feePriceUSD;
                    if (FeeSwap > 0) feeSource = 'calc';
                  }
                } catch (_) { }
              }


              // Provider name dari bridgeId + step pertama
              let providerName = String(q.bridgeId || 'METAX').toUpperCase();
              try {
                const swapStep = (q.steps || []).find(s => s.action === 'swap');
                const proto = swapStep?.protocol?.displayName || swapStep?.protocol?.name;
                if (proto) providerName = String(proto).toUpperCase();
              } catch (_) { }

              subResults.push({ amount_out, FeeSwap, feeSource, dexTitle: providerName });
            } catch (_) { continue; }
          }

          if (subResults.length === 0) return reject(new Error('MetaX: Tidak ada quote valid'));

          // ✅ Filter blacklisted providers dari config offDexResultScan
          const filteredMetax = filterOffDexResults(subResults);
          if (filteredMetax.length === 0) return reject(new Error('MetaX: Semua provider terfilter oleh offDexResultScan'));

          // ✅ Hitung netValue untuk setiap quote: amount_out - FeeSwap
          // Konsisten dengan MetaMask platform yang sort by "estimated total cost,
          // which includes the exchange rate and network fee"
          filteredMetax.forEach(r => {
            r.netValue = r.amount_out - r.FeeSwap;
          });

          // Top-N dari setting user
          const maxN = (() => {
            try {
              const v = parseInt((getFromLocalStorage('SETTING_SCANNER') || {}).metaDex?.topRoutes);
              if (v > 0) return v;
            } catch (_) { }
            return (typeof window !== 'undefined' && window.CONFIG_DEXS?.metax?.maxProviders) || 3;
          })();

          // ✅ FIX: Sort by NET VALUE (amount_out - FeeSwap) bukan raw amount_out
          // MetaMask platform mengurutkan berdasarkan total cost (termasuk gas fee),
          // bukan hanya output amount. Provider dengan output sedikit lebih rendah
          // tapi gas jauh lebih murah bisa memberikan net value lebih baik.
          filteredMetax.sort((a, b) => b.netValue - a.netValue);
          const topN = filteredMetax.slice(0, maxN);

          // ✅ Debug: Log semua quotes untuk perbandingan dengan platform
          console.log(`[METAX] Top ${topN.length} quotes dari ${filteredMetax.length} filtered (sorted by NET VALUE):`);
          filteredMetax.forEach((r, i) => {
            const marker = i < maxN ? '→' : ' ';
            console.log(`  ${marker} #${i + 1} ${r.dexTitle}: output=$${r.amount_out.toFixed(6)}, gas=$${r.FeeSwap.toFixed(4)} (${r.feeSource}), net=$${r.netValue.toFixed(6)}`);
          });

          resolve({
            amount_out: topN[0].amount_out,
            FeeSwap: topN[0].FeeSwap,
            feeSource: topN[0].feeSource,
            dexTitle: 'METAX',
            subResults: topN,
            isMultiDex: true,
            apiUrl: url
          });
        };

        // Timeout: tutup stream setelah 10 detik dan proses semua quote yang sudah masuk
        const timer = setTimeout(finish, 10000);

        try {
          es = new EventSource(url);

          es.addEventListener('quote', (event) => {
            try {
              const data = JSON.parse(event.data);
              quotes.push(data);
            } catch (_) { }
          });

          es.onerror = () => {
            clearTimeout(timer);
            finish();
          };

          // Event 'end' jika server menutup stream lebih awal
          es.addEventListener('end', () => {
            clearTimeout(timer);
            finish();
          });

        } catch (e) {
          clearTimeout(timer);
          reject(new Error(`MetaX: EventSource gagal: ${e.message}`));
        }
      });
    }
  };

  // =============================
  // ONEKEY Strategy - OneKey Swap SSE Streaming Multi-Quote
  // =============================
  // Protokol: SSE (Server-Sent Events) via EventSource
  // Endpoint: https://swap.onekeycn.com/swap/v1/quote/events
  // Provider: OKX Dex (SwapOKX), 1inch (Swap1inch), 0x/Matcha (Swap0x)
  // EVM only — toAmount sudah human-readable (tidak perlu /10^decimals)
  dexStrategies.onekey = {
    execute: ({ chainName, sc_input_in, sc_output_in, amount_in_big, des_input, SavedSettingData }) => {
      return new Promise((resolve, reject) => {

        const onekeyChainMap = {
          'ethereum': 1, 'eth': 1,
          'bsc': 56, 'bnb': 56,
          'polygon': 137, 'matic': 137,
          'arbitrum': 42161, 'arb': 42161,
          'base': 8453,
          'optimism': 10, 'op': 10,
          'avalanche': 43114, 'avax': 43114
        };

        // Provider OneKey → dexTitle mapping (skip SwapLifi = meta-of-meta)
        const PROVIDER_MAP = {
          'swapokx': 'OKX',
          'swap1inch': '1INCH',
          'swap0x': 'MATCHA'
        };

        const chain = String(chainName || '').toLowerCase();
        const chainId = onekeyChainMap[chain];
        if (!chainId) return reject(new Error(`OneKey: Chain tidak didukung: ${chainName}`));

        const walletAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        // OneKey pakai empty string untuk native token
        const fromAddr = String(sc_input_in || '').toLowerCase() === NATIVE ? '' : sc_input_in;
        const toAddr = sc_output_in;
        const networkId = `evm--${chainId}`;

        // fromTokenAmount dalam human-readable (bukan wei)
        const fromAmountHuman = (parseFloat(amount_in_big.toString()) / Math.pow(10, des_input)).toString();

        const params = new URLSearchParams({
          fromTokenAddress: fromAddr,
          toTokenAddress: toAddr,
          fromTokenAmount: fromAmountHuman,
          fromNetworkId: networkId,
          toNetworkId: networkId,
          protocol: 'Swap',
          userAddress: walletAddr,
          slippagePercentage: getSlippageValue(),
          autoSlippage: 'true',
          receivingAddress: walletAddr,
          kind: 'sell',
          denySingleSwapProvider: ''
        });

        const url = `https://swap.onekeycn.com/swap/v1/quote/events?${params.toString()}`;

        const quotes = [];
        let settled = false;
        let es;

        const finish = () => {
          if (settled) return;
          settled = true;
          try { es.close(); } catch (_) { }

          if (quotes.length === 0) return reject(new Error('OneKey: Tidak ada quote diterima'));

          const subResults = [];
          for (const item of quotes) {
            try {
              const toAmount = parseFloat(item.toAmount || 0);
              if (!Number.isFinite(toAmount) || toAmount <= 0) continue;

              // toAmount SUDAH human-readable dari OneKey API
              const amount_out = toAmount;

              // Gas fee: hitung dari gasLimit yg dilaporkan OneKey + gwei dari RPC
              let FeeSwap = getFeeSwap(chainName);
              let feeSource = 'fallback';
              try {
                const gasUnitsRaw = parseFloat(item.gasLimit || 0);
                if (gasUnitsRaw > 0) {
                  const allGasData = (typeof getFromLocalStorage === 'function')
                    ? getFromLocalStorage('ALL_GAS_FEES') : null;
                  if (allGasData) {
                    const gasInfo = allGasData.find(g =>
                      String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase()
                    );
                    if (gasInfo && gasInfo.gwei && gasInfo.tokenPrice) {
                      // ✅ Gunakan capGasUnits() — cap dengan 1×GASLIMIT config (konsisten dengan semua DEX lain)
                      const gasUnits = capGasUnits(gasUnitsRaw, chainName);
                      const feeUsd = (gasUnits * gasInfo.gwei * gasInfo.tokenPrice) / 1e9;
                      if (Number.isFinite(feeUsd) && feeUsd > 0) { FeeSwap = feeUsd; feeSource = 'calc'; }
                    }
                  }
                }
              } catch (_) { }

              const providerKey = String(item.info?.provider || '').toLowerCase();
              const dexTitle = PROVIDER_MAP[providerKey] || String(item.info?.providerName || providerKey).toUpperCase();

              subResults.push({ amount_out, FeeSwap, feeSource, dexTitle });
            } catch (_) { continue; }
          }

          if (subResults.length === 0) return reject(new Error('OneKey: Tidak ada quote valid'));

          // ✅ Filter blacklisted providers dari config offDexResultScan
          const filteredOnekey = filterOffDexResults(subResults);
          if (filteredOnekey.length === 0) return reject(new Error('OneKey: Semua provider terfilter oleh offDexResultScan'));

          // ✅ Hitung netValue untuk setiap quote: amount_out - FeeSwap
          // Konsisten dengan sorting platform OneKey (berdasarkan total cost)
          filteredOnekey.forEach(r => {
            r.netValue = r.amount_out - r.FeeSwap;
          });

          // ✅ FIX: Sort by NET VALUE (amount_out - FeeSwap) bukan raw amount_out
          filteredOnekey.sort((a, b) => b.netValue - a.netValue);

          const maxN = (() => {
            try {
              const v = parseInt((getFromLocalStorage('SETTING_SCANNER') || {}).metaDex?.topRoutes);
              if (v > 0) return v;
            } catch (_) { }
            return (typeof window !== 'undefined' && window.CONFIG_DEXS?.onekey?.maxProviders) || 3;
          })();

          const topN = filteredOnekey.slice(0, maxN);

          // ✅ Debug: Log semua quotes untuk perbandingan dengan platform
          console.log(`[ONEKEY] Top ${topN.length} quotes dari ${filteredOnekey.length} filtered (sorted by NET VALUE):`);
          filteredOnekey.forEach((r, i) => {
            const marker = i < maxN ? '→' : ' ';
            console.log(`  ${marker} #${i + 1} ${r.dexTitle}: output=$${r.amount_out.toFixed(6)}, gas=$${r.FeeSwap.toFixed(4)} (${r.feeSource}), net=$${r.netValue.toFixed(6)}`);
          });

          resolve({
            amount_out: topN[0].amount_out,
            FeeSwap: topN[0].FeeSwap,
            feeSource: topN[0].feeSource,
            dexTitle: 'ONEKEY',
            subResults: topN,
            isMultiDex: true,
            routeTool: 'ONEKEY'
          });
        };

        // Timeout: tutup stream setelah 8 detik
        const timer = setTimeout(finish, 8000);

        try {
          es = new EventSource(url);

          // OneKey SSE tidak pakai named event — pakai default 'message'
          es.onmessage = (event) => {
            try {
              const parsed = JSON.parse(event.data);
              // Hanya proses event yang punya data[] dengan provider info
              if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
                const item = parsed.data[0];
                if (item.info?.provider && item.toAmount) {
                  const providerKey = String(item.info.provider).toLowerCase();
                  // Skip SwapLifi (meta-of-meta, terlalu kompleks)
                  if (providerKey !== 'swaplifi') {
                    quotes.push(item);
                  }
                }
              }
              // Cek apakah semua quote sudah datang
              if (parsed.totalQuoteCount && quotes.length >= parsed.totalQuoteCount) {
                clearTimeout(timer);
                finish();
              }
            } catch (_) { }
          };

          es.onerror = () => {
            clearTimeout(timer);
            finish(); // proses quote yang sudah masuk
          };

        } catch (e) {
          clearTimeout(timer);
          reject(new Error(`OneKey: EventSource gagal: ${e.message}`));
        }
      });
    }
  };

  // =============================
  // ONEKEY Filtered Strategy Factory
  // =============================
  // Factory untuk membuat strategi OneKey yang difilter ke provider tertentu.
  // Endpoint: https://swap.onekeycn.com/swap/v1/quote/events (SSE)
  // Provider keys: 'swap1inch' (1inch), 'swaplifi' (LiFi/Jumper), 'swapokx' (OKX), 'swap0x' (Matcha)
  //
  // @param {string} providerKey  - Provider key dari OneKey SSE response (e.g. 'swap1inch', 'swaplifi')
  // @param {string} dexTitle     - Label tampilan (e.g. '1INCH', 'LIFIDX')
  // @returns {object} Strategy object dengan execute method
  function createFilteredOnekeyStrategy(providerKey, dexTitle) {
    return {
      execute: ({ chainName, sc_input_in, sc_output_in, amount_in_big, des_input, SavedSettingData }) => {
        return new Promise((resolve, reject) => {

          const onekeyChainMap = {
            'ethereum': 1, 'eth': 1,
            'bsc': 56, 'bnb': 56,
            'polygon': 137, 'matic': 137,
            'arbitrum': 42161, 'arb': 42161,
            'base': 8453,
            'optimism': 10, 'op': 10,
            'avalanche': 43114, 'avax': 43114
          };

          const chain = String(chainName || '').toLowerCase();
          const chainId = onekeyChainMap[chain];
          if (!chainId) return reject(new Error(`OneKey-${dexTitle}: Chain tidak didukung: ${chainName}`));

          const walletAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
          const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
          const fromAddr = String(sc_input_in || '').toLowerCase() === NATIVE ? '' : sc_input_in;
          const toAddr = sc_output_in;
          const networkId = `evm--${chainId}`;

          const fromAmountHuman = (parseFloat(amount_in_big.toString()) / Math.pow(10, des_input)).toString();

          const params = new URLSearchParams({
            fromTokenAddress: fromAddr,
            toTokenAddress: toAddr,
            fromTokenAmount: fromAmountHuman,
            fromNetworkId: networkId,
            toNetworkId: networkId,
            protocol: 'Swap',
            userAddress: walletAddr,
            slippagePercentage: getSlippageValue(),
            autoSlippage: 'true',
            receivingAddress: walletAddr,
            kind: 'sell',
            denySingleSwapProvider: ''
          });

          const url = `https://swap.onekeycn.com/swap/v1/quote/events?${params.toString()}`;

          let bestQuote = null;
          let settled = false;
          let es;
          let totalExpected = 0;   // dari totalQuoteCount event
          let receivedCount = 0;   // jumlah data provider yang sudah masuk

          const finish = () => {
            if (settled) return;
            settled = true;
            try { es.close(); } catch (_) { }

            if (!bestQuote) return reject(new Error(`OneKey-${dexTitle}: Tidak ada quote dari provider ${providerKey}`));

            const toAmount = parseFloat(bestQuote.toAmount || 0);
            if (!Number.isFinite(toAmount) || toAmount <= 0) {
              return reject(new Error(`OneKey-${dexTitle}: toAmount tidak valid`));
            }

            const amount_out = toAmount;

            let FeeSwap = getFeeSwap(chainName);
            let feeSource = 'fallback';
            try {
              const gasUnitsRaw = parseFloat(bestQuote.gasLimit || 0);
              if (gasUnitsRaw > 0) {
                const allGasData = (typeof getFromLocalStorage === 'function')
                  ? getFromLocalStorage('ALL_GAS_FEES') : null;
                if (allGasData) {
                  const gasInfo = allGasData.find(g =>
                    String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase()
                  );
                  if (gasInfo && gasInfo.gwei && gasInfo.tokenPrice) {
                    // ✅ Gunakan capGasUnits() — cap dengan 1×GASLIMIT config
                    const gasUnits = capGasUnits(gasUnitsRaw, chainName);
                    const feeUsd = (gasUnits * gasInfo.gwei * gasInfo.tokenPrice) / 1e9;
                    if (Number.isFinite(feeUsd) && feeUsd > 0) { FeeSwap = feeUsd; feeSource = 'calc'; }
                  }
                }
              }
            } catch (_) { }

            console.log(`[ONEKEY-${dexTitle}] Quote dari provider ${providerKey}: ${amount_out}`);

            resolve({
              amount_out,
              FeeSwap,
              feeSource,
              dexTitle,
              isMultiDex: false,
              routeTool: `ONEKEY-${dexTitle}`
            });
          };

          const timer = setTimeout(finish, 8000);

          try {
            es = new EventSource(url);

            es.onmessage = (event) => {
              try {
                const parsed = JSON.parse(event.data);

                // Simpan total provider yang akan datang (event ini datang SEBELUM data provider)
                if (parsed.totalQuoteCount > 0) {
                  totalExpected = parsed.totalQuoteCount;
                }

                if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
                  const item = parsed.data[0];
                  if (item.info?.provider && item.toAmount) {
                    receivedCount++; // hitung semua data provider yang masuk
                    const itemProvider = String(item.info.provider).toLowerCase();
                    if (itemProvider === providerKey.toLowerCase()) {
                      const amt = parseFloat(item.toAmount || 0);
                      if (!bestQuote || amt > parseFloat(bestQuote.toAmount || 0)) {
                        bestQuote = item;
                      }
                    }
                    // Selesaikan hanya setelah semua provider data sudah masuk
                    if (totalExpected > 0 && receivedCount >= totalExpected) {
                      clearTimeout(timer);
                      finish();
                    }
                  }
                }
              } catch (_) { }
            };

            es.onerror = () => {
              clearTimeout(timer);
              finish();
            };

          } catch (e) {
            clearTimeout(timer);
            reject(new Error(`OneKey-${dexTitle}: EventSource gagal: ${e.message}`));
          }
        });
      }
    };
  }

  // ✅ OneKey filtered strategies — alternatif untuk 1inch dan LiFi DEX
  dexStrategies['onekey-1inch'] = createFilteredOnekeyStrategy('swap1inch', '1INCH');    // OneKey → hanya provider 1inch
  dexStrategies['onekey-lifidex'] = createFilteredOnekeyStrategy('swaplifi', 'LIFIDX');  // OneKey → hanya provider LiFi/Jumper

  // =============================
  // RANGO Filtered Strategy Factory - Rango as REST API Provider
  // =============================
  /**
   * Factory function to create Rango filtered strategies for specific DEX providers
   * Rango returns multi-quote response from 70+ DEXs, we filter for specific DEX only
   * 
   * @param {string} dexKey - The DEX identifier used in Rango's response (e.g., 'uniswap-v3', 'paraswap')
   * @param {string} dexTitle - Display name for the DEX (e.g., 'UNISWAP', 'VELORA')
   * @returns {object} Strategy object with buildRequest and parseResponse
   */
  function createFilteredRangoStrategy(dexKey, dexTitle) {
    return {
      buildRequest: (params) => {
        // Use base Rango strategy's buildRequest
        return dexStrategies.rango.buildRequest(params);
      },
      parseResponse: (response, params) => {
        // Rango returns array of routes with swappers info
        const routes = response?.routes;

        if (!routes || !Array.isArray(routes) || routes.length === 0) {
          throw new Error(`Rango-${dexTitle}: No routes found`);
        }

        // Find route that uses the specific DEX
        let matchedRoute = null;
        for (const route of routes) {
          const swappers = route?.swappers || [];
          const hasTargetDex = swappers.some(swapper => {
            const swapperId = String(swapper?.swapperId || swapper?.id || '').toLowerCase();
            return swapperId.includes(dexKey.toLowerCase());
          });

          if (hasTargetDex) {
            matchedRoute = route;
            break;
          }
        }

        if (!matchedRoute) {
          throw new Error(`Rango-${dexTitle}: No route found using ${dexTitle}`);
        }

        // Parse the matched route
        const outputAmount = matchedRoute?.outputAmount || matchedRoute?.amountOut;
        if (!outputAmount) {
          throw new Error(`Rango-${dexTitle}: Invalid output amount`);
        }

        const amount_out = parseFloat(outputAmount) / Math.pow(10, params.des_output);

        // Hitung fee dari swaps[].fee[] dan resolve sumber
        let _rgTotalFeeUSD = 0;
        try {
          if (Array.isArray(matchedRoute.swaps) && matchedRoute.swaps.length > 0) {
            matchedRoute.swaps.forEach(swap => {
              if (Array.isArray(swap.fee)) {
                swap.fee.forEach(feeItem => {
                  const feeUSD = parseFloat(feeItem.amount || 0) * parseFloat(feeItem.price || 0);
                  if (Number.isFinite(feeUSD) && feeUSD > 0) _rgTotalFeeUSD += feeUSD;
                });
              }
            });
          }
          if (_rgTotalFeeUSD <= 0) {
            const simpleFee = parseFloat(matchedRoute?.feeUsd || matchedRoute?.fee?.amount || 0);
            if (Number.isFinite(simpleFee) && simpleFee > 0) _rgTotalFeeUSD = simpleFee;
          }
        } catch (_) { }
        const { FeeSwap: _rgFee, feeSource } = resolveFeeSwap(_rgTotalFeeUSD, 0, params.chainName);

        console.log(`[RANGO-${dexTitle}] Using ${dexTitle} via RANGO: ${amount_out.toFixed(6)} output, gas: $${_rgFee.toFixed(4)} (${feeSource})`);

        return {
          amount_out,
          FeeSwap: _rgFee,
          feeSource,
          dexTitle,
          routeTool: 'RANGO'
        };
      }
    };
  }

  // Create filtered Rango strategies for common DEXes
  dexStrategies['rango-velora'] = createFilteredRangoStrategy('paraswap', 'VELORA');
  dexStrategies['rango-odos'] = createFilteredRangoStrategy('odos', 'ODOS');
  dexStrategies['rango-kyber'] = createFilteredRangoStrategy('kyberswap', 'KYBER');
  dexStrategies['rango-matcha'] = createFilteredRangoStrategy('0x', 'MATCHA');
  dexStrategies['rango-sushi'] = createFilteredRangoStrategy('sushiswap', 'SUSHI');
  dexStrategies['rango-uniswap'] = createFilteredRangoStrategy('uniswap-v3', 'UNISWAP');

  // =============================
  // RUBIC Filtered Strategy Factory - Rubic as REST API Provider
  // =============================
  /**
   * Factory function to create Rubic filtered strategies for specific DEX providers
   * Rubic returns multi-quote response from 90+ DEXs, we filter for specific DEX only
   * 
   * @param {string} dexKey - The DEX identifier used in Rubic's response (e.g., 'UNISWAP_V3', 'PARASWAP')
   * @param {string} dexTitle - Display name for the DEX (e.g., 'UNISWAP', 'VELORA')
   * @returns {object} Strategy object with buildRequest and parseResponse
   */
  function createFilteredRubicStrategy(dexKey, dexTitle) {
    return {
      buildRequest: (params) => {
        // Use base Rubic strategy's buildRequest
        return dexStrategies.rubic.buildRequest(params);
      },
      parseResponse: (response, params) => {
        // Rubic returns array of routes with provider info
        const routes = response?.routes || response?.bestTrade?.route?.path;

        if (!routes || !Array.isArray(routes) || routes.length === 0) {
          throw new Error(`Rubic-${dexTitle}: No routes found`);
        }

        // Find route that uses the specific DEX
        let matchedRoute = null;
        for (const route of routes) {
          const provider = String(route?.provider || route?.type || '').toUpperCase();
          if (provider.includes(dexKey.toUpperCase())) {
            matchedRoute = route;
            break;
          }
        }

        if (!matchedRoute) {
          throw new Error(`Rubic-${dexTitle}: No route found using ${dexTitle}`);
        }

        // Parse the matched route
        const toTokenAmount = matchedRoute?.toTokenAmount || matchedRoute?.amountOut;
        if (!toTokenAmount) {
          throw new Error(`Rubic-${dexTitle}: Invalid output amount`);
        }

        const amount_out = parseFloat(toTokenAmount) / Math.pow(10, params.des_output);

        // Get fee from route
        const gasUsd = parseFloat(matchedRoute?.gasUsd || matchedRoute?.gasFeeInUsd || 0);
        const FeeSwap = (Number.isFinite(gasUsd) && gasUsd > 0)
          ? gasUsd
          : getFeeSwap(params.chainName);

        console.log(`[RUBIC-${dexTitle}] Using ${dexTitle} via RUBIC: ${amount_out.toFixed(6)} output`);

        return {
          amount_out,
          FeeSwap,
          dexTitle: dexTitle,  // ✅ Show DEX name in title (user selected this DEX)
          routeTool: 'RUBIC'  // ✅ Show provider in tooltip
        };
      }
    };
  }

  // Create filtered Rubic strategies for common DEXes
  dexStrategies['rubic-velora'] = createFilteredRubicStrategy('PARASWAP', 'VELORA');
  dexStrategies['rubic-odos'] = createFilteredRubicStrategy('ODOS', 'ODOS');
  dexStrategies['rubic-kyber'] = createFilteredRubicStrategy('KYBERSWAP', 'KYBER');
  dexStrategies['rubic-matcha'] = createFilteredRubicStrategy('ZEROX', 'MATCHA');  // Rubic uses 'ZEROX' for 0x
  dexStrategies['rubic-sushi'] = createFilteredRubicStrategy('SUSHISWAP', 'SUSHI');
  dexStrategies['rubic-uniswap'] = createFilteredRubicStrategy('UNISWAP_V3', 'UNISWAP');

  // Back-compat alias: support legacy 'kyberswap' key
  dexStrategies.kyberswap = dexStrategies.kyber;
  // Velora aliases: v6.2 is recommended
  dexStrategies.paraswap = dexStrategies.velora6;  // Backward compat: paraswap -> velora
  dexStrategies.paraswap6 = dexStrategies.velora6;
  // ❌ REMOVED: Backward compat alias for '0x' - use 'matcha' as canonical key
  // dexStrategies['0x'] = dexStrategies.matcha;

  // -----------------------------
  // Helper: resolve fetch plan per DEX + arah
  // -----------------------------
  // Determines which strategy to use based on fetchdex config:
  // - secondary: rotation mode (odd/even alternation)
  // - alternative: fallback mode (only on error)
  function actionKey(a) { return String(a || '').toLowerCase() === 'pairtotoken' ? 'pairtotoken' : 'tokentopair'; }
  function resolveFetchPlan(dexType, action, chainName) {
    try {
      // Normalize DEX aliases to canonical keys
      const aliases = { '0x': 'matcha', 'kyberswap': 'kyber', 'paraswap': 'velora' };
      let key = String(dexType || '').toLowerCase();
      key = aliases[key] || key; // Apply alias mapping

      const cfg = (root.CONFIG_DEXS || {})[key] || {};
      const map = cfg.fetchdex || {};
      const ak = actionKey(action);

      // ✅ CHAIN-SPECIFIC OVERRIDE: Check if there's a chain-specific strategy
      // Example: matcha.fetchdex.solana = { tokentopair: 'matcha', pairtotoken: 'matcha' }
      const chainKey = String(chainName || '').toLowerCase();
      if (map[chainKey] && map[chainKey][ak]) {
        // Use chain-specific override as both primary and only strategy
        const chainStrategy = String(map[chainKey][ak]).toLowerCase();
        console.log(`[CHAIN OVERRIDE] ${key} + ${ak} + ${chainKey} → ${chainStrategy}`);
        return {
          primary: chainStrategy,
          secondary: null,
          alternative: null,
          mode: 'primary-only',
          normalizedKey: key,
          chainOverride: true  // Flag to indicate chain-specific override was used
        };
      }


      let primary = map.primary && map.primary[ak] ? String(map.primary[ak]).toLowerCase() : null;

      // Parse secondary (rotation mode) dan alternative (fallback mode)
      // - secondary: bergantian call API (odd=primary, even=secondary)
      // - alternative: fallback ketika primary error (429, 500+, timeout)
      let secondary = map.secondary && map.secondary[ak] ? String(map.secondary[ak]).toLowerCase() : null;
      let alternative = map.alternative && map.alternative[ak] ? String(map.alternative[ak]).toLowerCase() : null;

      // Determine mode:
      // - 'rotation': If secondary exists → alternate between primary/secondary
      // - 'fallback': If alternative exists → primary first, alternative on error
      // - 'primary-only': Only primary, no secondary/alternative
      const mode = secondary ? 'rotation' : (alternative ? 'fallback' : 'primary-only');

      return { primary, secondary, alternative, mode, normalizedKey: key };
    } catch (_) { return { primary: null, secondary: null, alternative: null, mode: 'primary-only', normalizedKey: null }; }
  }

  // ========== REQUEST DEDUPLICATION & CACHING ==========
  // ✅ PERF: Use LRUCache if available for memory-bounded caching (auto-eviction)
  // Cache untuk menyimpan response yang sudah berhasil (60 detik)
  const DEX_CACHE_TTL = 60000; // 60 seconds
  const DEX_RESPONSE_CACHE = (typeof LRUCache !== 'undefined')
    ? new LRUCache(200, DEX_CACHE_TTL)  // Max 200 items, 60s TTL
    : new Map();  // Fallback to unbounded Map
  const USE_LRU_CACHE = (typeof LRUCache !== 'undefined');
  // Silent initialization - check getDexCacheStats() for cache info

  // Cache untuk menyimpan ongoing requests (mencegah duplicate concurrent requests)
  const DEX_INFLIGHT_REQUESTS = new Map();

  // Throttle dedup logs (only log first occurrence per cache key)
  const DEX_DEDUP_LOG_TRACKER = new Map();

  // ========== ROTATION TRACKING ==========
  // Track rotation state per DEX to alternate between primary and secondary
  // Map<dexType, { counter: number, lastUsed: 'primary' | 'secondary' }>
  const DEX_ROTATION_STATE = new Map();

  /**
   * Select strategy based on mode configured in fetchdex:
   * 
   * MODE 'rotation' (secondary key exists):
   * - Alternates between primary and secondary (odd/even counter)
   * - Request 1, 3, 5... → primary
   * - Request 2, 4, 6... → secondary
   * - On error, fallback to the other strategy
   * 
   * MODE 'fallback' (alternative key exists):
   * - Always use primary first
   * - Only switch to alternative if primary fails (429, 500+, timeout)
   * 
   * MODE 'primary-only':
   * - Only use primary, no fallback
   * 
   * @param {string} dexType - The DEX type key (for rotation tracking)
   * @param {string} primary - Primary strategy name
   * @param {string|null} secondary - Secondary strategy for rotation mode
   * @param {string|null} alternative - Alternative strategy for fallback mode
   * @param {string} mode - 'rotation', 'fallback', or 'primary-only'
   * @returns {Object} { selectedStrategy, fallbackStrategy, mode, isRotation, rotationInfo }
   */
  function selectStrategy(dexType, primary, secondary, alternative, mode) {
    // MODE: PRIMARY-ONLY (no secondary/alternative)
    if (mode === 'primary-only' || (!secondary && !alternative)) {
      return {
        selectedStrategy: primary,
        fallbackStrategy: null,
        mode: 'primary-only',
        isRotation: false
      };
    }

    // MODE: FALLBACK (alternative only used when primary fails)
    if (mode === 'fallback') {
      return {
        selectedStrategy: primary,  // Always start with primary
        fallbackStrategy: alternative,  // Fallback on error
        mode: 'fallback',
        isRotation: false
      };
    }

    // MODE: ROTATION (alternate between primary and secondary)
    if (mode === 'rotation') {
      // Get or initialize rotation state for this DEX
      if (!DEX_ROTATION_STATE.has(dexType)) {
        DEX_ROTATION_STATE.set(dexType, { counter: 0, lastUsed: null });
      }

      const state = DEX_ROTATION_STATE.get(dexType);
      state.counter++;

      // Odd counter = primary, Even counter = secondary
      const useSecondary = (state.counter % 2) === 0;
      const selectedStrategy = useSecondary ? secondary : primary;
      const fallbackStrategy = useSecondary ? primary : secondary;
      state.lastUsed = useSecondary ? 'secondary' : 'primary';

      return {
        selectedStrategy,
        fallbackStrategy,
        alternativeStrategy: alternative || null,  // ✅ Level ke-3 jika primary+secondary keduanya gagal
        mode: 'rotation',
        isRotation: true,
        rotationInfo: { counter: state.counter, used: state.lastUsed }
      };
    }

    // Default fallback (should not reach here)
    return { selectedStrategy: primary, fallbackStrategy: null, mode: 'unknown', isRotation: false };
  }

  /**
   * Get slippage tolerance from localStorage or default.
   * Returns string for direct use in request parameters.
   * ✅ AUTO SLIPPAGE: Returns '0' when user sets slippage=0 (auto mode).
   * Provider yang mendukung auto-slippage akan menggunakan mekanisme auto,
   * provider yang tidak mendukung akan menerima slippage=0.
   */
  function getSlippageValue() {
    try {
      const v = (typeof window !== 'undefined' && typeof window.getSlippageTolerance === 'function')
        ? window.getSlippageTolerance()
        : 0.5;
      // ✅ Allow 0 for auto-slippage mode (jangan fallback ke 0.5)
      if (v === 0) return '0';
      return String(v || 0.5);
    } catch (_) {
      return '0.5';
    }
  }

  /**
   * Check if user has enabled auto-slippage mode (slippage input = 0).
   * Providers with auto-slippage support should use their auto mechanism.
   * @returns {boolean}
   */
  function isAutoSlippage() {
    return parseFloat(getSlippageValue()) === 0;
  }

  // ============================================================
  // deBridge DLN — GET /v1.0/chain/transaction (single route)
  // Endpoint: https://deswap.debridge.finance/v1.0/chain/transaction
  // ============================================================
  dexStrategies.debridge = {
    buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, SavedSettingData }) => {
      const chainId = Number(codeChain);
      const walletAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
      const slippage = isAutoSlippage() ? '0.3' : getSlippageValue();
      const params = new URLSearchParams({
        chainId: chainId.toString(),
        tokenIn: sc_input.toLowerCase(),
        tokenInAmount: amount_in_big.toString(),
        slippage: slippage,
        srcChainPriorityLevel: 'normal',
        tokenOut: sc_output.toLowerCase(),
        tokenOutRecipient: walletAddr,
        tab: Date.now().toString()
      });
      return {
        url: `https://deswap.debridge.finance/v1.0/chain/transaction?${params.toString()}`,
        method: 'GET'
      };
    },
    parseResponse: (response, { des_output, chainName }) => {
      // Struktur response: { tokenOut: { amount, decimals, ... }, estimatedTransactionFee, protocolFeeApproximateUsdValue }
      const tokenOut = response?.tokenOut;
      if (!tokenOut) throw new Error('deBridge: tokenOut tidak ditemukan di response');
      const rawAmount = tokenOut.amount;
      if (!rawAmount) throw new Error('deBridge: tokenOut.amount tidak ditemukan');
      // Pakai decimals dari response jika tersedia, fallback ke des_output dari config token
      const decimals = Number(tokenOut.decimals ?? des_output);
      const amount_out = parseFloat(rawAmount) / Math.pow(10, decimals);
      if (!Number.isFinite(amount_out) || amount_out <= 0) throw new Error('deBridge: output amount tidak valid');
      // Fee: gas fee USD + protocol fee USD
      const gasFeeUsd = parseFloat(response?.estimatedTransactionFee?.approximateUsdValue || 0);
      const protocolFeeUsd = parseFloat(response?.protocolFeeApproximateUsdValue || 0);
      const totalFeeUsd = gasFeeUsd + protocolFeeUsd;
      const { FeeSwap, feeSource } = resolveFeeSwap(totalFeeUsd, 0, chainName);
      return {
        amount_out,
        FeeSwap,
        feeSource,
        dexTitle: 'DEBRIDGE',
        isMultiDex: false
      };
    }
  };

  /**
   * Quote swap output from a DEX aggregator.
   * Builds request by strategy, applies timeout, and returns parsed amounts.
   */
  function getPriceDEX(sc_input_in, des_input, sc_output_in, des_output, amount_in, PriceRate, dexType, NameToken, NamePair, cex, chainName, codeChain, action, tableBodyId) {
    return new Promise((resolve, reject) => {
      const sc_input = sc_input_in.toLowerCase();
      const sc_output = sc_output_in.toLowerCase();

      // ========== CHECK IF DEX IS DISABLED ==========
      // Check if this DEX is disabled in config before processing
      try {
        const dexConfig = (root.CONFIG_DEXS && root.CONFIG_DEXS[String(dexType).toLowerCase()]) || null;
        if (dexConfig && dexConfig.disabled === true) {
          console.warn(`[DEX DISABLED] ${String(dexType).toUpperCase()} is disabled in config - skipping request`);
          reject({
            statusCode: 0,
            pesanDEX: `${String(dexType).toUpperCase()} is currently disabled`,
            isDisabled: true
          });
          return;
        }
      } catch (_) { }

      // ========== CHECK BACKEND PROVIDER & META-DEX ==========
      // Backend Provider (isBackendProvider=true): hanya dipakai via strategi filtered (lifi-odos, dll.)
      //   Direct call diblokir — gunakan filtered strategy saja.
      // Meta-DEX (isMetaDex=true): DEX tambahan multi-quote, diblokir jika META_DEX=false.
      // Note: Filtered strategies (e.g., lifi-odos, swing-velora) TIDAK diblokir.
      try {
        const dexConfig = (root.CONFIG_DEXS && root.CONFIG_DEXS[String(dexType).toLowerCase()]) || null;
        const isBackendProvider = dexConfig && dexConfig.isBackendProvider === true;
        const isMetaDex = dexConfig && dexConfig.isMetaDex === true;
        const metaDexEnabled = root.CONFIG_APP && root.CONFIG_APP.APP && root.CONFIG_APP.APP.META_DEX;

        if (isBackendProvider) {
          console.warn(`[BACKEND PROVIDER] ${String(dexType).toUpperCase()} adalah backend provider internal. Gunakan strategi filtered (contoh: lifi-odos)`);
          reject({
            statusCode: 0,
            pesanDEX: `${String(dexType).toUpperCase()} adalah backend provider — gunakan strategi filtered (contoh: lifi-odos)`,
            isBackendProvider: true,
            isDisabled: true
          });
          return;
        }

        if (isMetaDex && !metaDexEnabled) {
          console.warn(`[META-DEX DISABLED] ${String(dexType).toUpperCase()} adalah Meta-DEX aggregator tetapi META_DEX dinonaktifkan`);
          reject({
            statusCode: 0,
            pesanDEX: `Meta-DEX aggregators dinonaktifkan (set META_DEX=true di config untuk mengaktifkan)`,
            isMetaDex: true,
            isDisabled: true
          });
          return;
        }
      } catch (_) { }

      // ========== CACHE KEY GENERATION ==========
      // Generate unique cache key based on request parameters
      const cacheKey = `${dexType}|${chainName}|${sc_input}|${sc_output}|${amount_in}|${action}`.toLowerCase();

      // ========== CHECK RESPONSE CACHE ==========
      // Check if we have a recent cached response
      // ✅ PERF: LRUCache handles TTL internally via get(), Map needs manual check
      if (USE_LRU_CACHE) {
        const cachedResponse = DEX_RESPONSE_CACHE.get(cacheKey);
        if (cachedResponse !== undefined) {
          console.log(`[DEX CACHE HIT] ${dexType.toUpperCase()} - LRU Cache hit!`);
          resolve(cachedResponse);
          return;
        }
      } else if (DEX_RESPONSE_CACHE.has(cacheKey)) {
        const cached = DEX_RESPONSE_CACHE.get(cacheKey);
        const now = Date.now();
        if (now - cached.timestamp < DEX_CACHE_TTL) {
          // Cache hit - return cached response immediately
          const ageSeconds = Math.round((now - cached.timestamp) / 1000);
          console.log(`[DEX CACHE HIT] ${dexType.toUpperCase()} (age: ${ageSeconds}s) - Request saved!`);
          resolve(cached.response);
          return;
        } else {
          // Cache expired - remove from cache
          DEX_RESPONSE_CACHE.delete(cacheKey);
        }
      }

      // ========== CHECK INFLIGHT REQUESTS ==========
      // Check if there's already an ongoing request for this exact same parameters
      if (DEX_INFLIGHT_REQUESTS.has(cacheKey)) {
        // Request deduplication - attach to existing request
        // Only log first occurrence to reduce console spam
        if (!DEX_DEDUP_LOG_TRACKER.has(cacheKey)) {
          console.log(`[DEX DEDUP] ${dexType.toUpperCase()} - Duplicate request prevented!`);
          DEX_DEDUP_LOG_TRACKER.set(cacheKey, true);
          // Auto-cleanup after 5 seconds
          setTimeout(() => DEX_DEDUP_LOG_TRACKER.delete(cacheKey), 5000);
        }
        const existingRequest = DEX_INFLIGHT_REQUESTS.get(cacheKey);
        existingRequest.then(resolve).catch(reject);
        return;
      }

      const SavedSettingData = getFromLocalStorage('SETTING_SCANNER', {});

      // ✅ REFACTORED: Timeout now uses per-strategy config from CONFIG_UI.SETTINGS.timeout
      // Each REST API provider has its own optimal timeout based on official API documentation
      // The timeout will be determined per-strategy in runStrategy() function
      const dexLower = String(dexType || '').toLowerCase();

      const amount_in_big = BigInt(Math.round(Math.pow(10, des_input) * amount_in));

      const runStrategy = (strategyName) => new Promise(async (res, rej) => {
        try {
          const sname = String(strategyName || '').toLowerCase();

          // ✅ REMOVED: No longer route to getPriceAltDEX for 'dzap' or 'swoop'
          // These were legacy global fallbacks that bypassed CONFIG_DEXS
          // All fallback logic now strictly follows CONFIG_DEXS alternative settings

          // Resolve dari registry jika ada STRATEGY override
          let sKey = sname;
          try {
            if (root.DEX && typeof root.DEX.get === 'function') {
              const entry = root.DEX.get(dexType);
              if (entry && entry.strategy) sKey = String(entry.strategy).toLowerCase();
            }
          } catch (_) { }

          const strategy = dexStrategies[sKey];
          if (!strategy) return rej(new Error(`Unsupported strategy: ${sKey}`));

          const requestParams = { chainName, sc_input, sc_output, amount_in_big, des_output, SavedSettingData, codeChain, action, des_input, sc_input_in, sc_output_in };

          // ✅ SSE strategy (e.g. MetaMask Bridge) — has execute() instead of buildRequest()
          if (typeof strategy.execute === 'function') {
            try {
              const parsed = await strategy.execute(requestParams);
              res({
                dexTitle: parsed.dexTitle,
                sc_input, des_input, sc_output, des_output,
                FeeSwap: parsed.FeeSwap,
                amount_out: parsed.amount_out,
                apiUrl: parsed.apiUrl || '',
                tableBodyId,
                subResults: parsed.subResults || null,
                isMultiDex: parsed.isMultiDex || false,
                routeTool: null
              });
            } catch (e) {
              rej({ statusCode: 0, pesanDEX: `${sKey.toUpperCase()}: ${e.message}`, DEX: sKey.toUpperCase() });
            }
            return;
          }

          // ✅ FIX: Support async buildRequest (for Matcha JWT)
          let buildResult;
          try {
            buildResult = await Promise.resolve(strategy.buildRequest(requestParams));
          } catch (buildErr) {
            return rej(new Error(`buildRequest failed: ${buildErr.message}`));
          }
          const { url, method, data, headers } = buildResult;

          // Apply proxy if configured for this DEX
          // ✅ SINGLE SOURCE OF TRUTH: Read proxy setting from config.js only
          const cfg = (root.CONFIG_DEXS && root.CONFIG_DEXS[dexType]) ? root.CONFIG_DEXS[dexType] : {};

          // ✅ For filtered strategies like 'lifi-kyber', also check the strategy provider's proxy config.
          // dexType = 'kyber' (DEX column) but the real caller is 'lifi' (from sKey prefix).
          // Extract provider by taking the part before the first '-' in sKey.
          const _strategyProvider = sKey.includes('-') ? sKey.split('-')[0] : '';
          const _providerCfg = (_strategyProvider && root.CONFIG_DEXS && root.CONFIG_DEXS[_strategyProvider])
            ? root.CONFIG_DEXS[_strategyProvider] : {};

          // Use proxy if EITHER the DEX column config OR the strategy provider config OR the strategy itself has proxy: true
          const useProxy = cfg.proxy === true || _providerCfg.proxy === true || strategy.proxy === true; // MUST be explicitly true

          const proxyPrefix = (root.CONFIG_PROXY && root.CONFIG_PROXY.PREFIX) ? String(root.CONFIG_PROXY.PREFIX) : '';
          const finalUrl = (useProxy && proxyPrefix && typeof url === 'string' && !url.startsWith(proxyPrefix)) ? (proxyPrefix + url) : url;

          // Debug logging for proxy configuration
          console.log(`[${dexType.toUpperCase()} PROXY]`, {
            dexType,
            sKey,
            strategyProvider: _strategyProvider || '(none)',
            cfgProxy: cfg.proxy,
            providerCfgProxy: _providerCfg.proxy,
            useProxy,
            willUseProxy: useProxy && !!proxyPrefix && !url.startsWith(proxyPrefix),
            originalUrl: url.substring(0, 80) + '...',
            finalUrl: finalUrl.substring(0, 80) + '...'
          });

          // ✅ REFACTORED: Get timeout from per-strategy config (not global setting)
          // Each REST API provider has its own optimal timeout
          const timeoutMilliseconds = getStrategyTimeout(strategyName);
          console.log(`⏱️ [${strategyName.toUpperCase()} TIMEOUT] ${timeoutMilliseconds}ms (from config)`);

          $.ajax({
            url: finalUrl, method, dataType: 'json', timeout: timeoutMilliseconds, headers, data,
            contentType: data ? 'application/json' : undefined,
            success: function (response) {
              try {
                const parsed = strategy.parseResponse(response, requestParams);
                // ✅ FIX: Also extract routeTool from parsed response for tooltip transparency
                const { amount_out, FeeSwap, dexTitle, subResults, isMultiDex, routeTool } = parsed;
                res({
                  dexTitle, sc_input, des_input, sc_output, des_output, FeeSwap, amount_out, apiUrl: url, tableBodyId,
                  subResults: subResults || null, // Pass subResults untuk DZAP
                  isMultiDex: isMultiDex || false,  // Pass flag isMultiDex
                  routeTool: routeTool || null  // ✅ FIX: Pass routeTool untuk tooltip (e.g., "VELORA via SWING")
                });
              } catch (error) {
                rej({ statusCode: 500, pesanDEX: `Parse Error: ${error.message}`, DEX: sKey.toUpperCase() });
              }
            },
            error: function (xhr, textStatus) {
              let status = 0;
              try { status = Number(xhr && xhr.status) || 0; } catch (_) { }
              // Heuristik: jika body JSON menyimpan status upstream (mis. 429) walau XHR 200/parsererror
              try {
                const txt = xhr && xhr.responseText;
                if (txt && typeof txt === 'string' && txt.length) {
                  try {
                    const parsed = JSON.parse(txt);
                    const upstream = Number(parsed.status || parsed.statusCode || parsed.code);
                    if (Number.isFinite(upstream) && upstream >= 400) status = upstream;
                  } catch (_) { }
                }
              } catch (_) { }
              const isParser = String(textStatus || '').toLowerCase() === 'parsererror';
              let coreMsg;
              if (textStatus === 'timeout') coreMsg = 'Request Timeout';
              else if (status === 200) coreMsg = isParser ? 'Parser Error (200)' : 'XHR Error (200)';
              else if (status > 0) coreMsg = describeHttpStatus(status);
              else coreMsg = `Error: ${textStatus || 'unknown'}`;

              const label = status > 0 ? (status === 200 ? '[XHR ERROR 200]' : `[HTTP ${status}]`) : '';
              // FIX: Swap token & pair address untuk arah PairtoToken (DEX→CEX)
              const isPairtoToken = String(action || '').toLowerCase() === 'pairtotoken';
              const tokenAddr = isPairtoToken ? sc_output_in : sc_input_in;
              const pairAddr = isPairtoToken ? sc_input_in : sc_output_in;
              const linkDEX = generateDexLink(dexType, chainName.toLowerCase(), codeChain, NameToken, tokenAddr, NamePair, pairAddr);

              // ✅ ENHANCEMENT: Include strategy name untuk debugging
              // Extract provider name dari strategy key untuk user clarity
              // Example: "delta-matcha" → "1DELTA", "swoop-matcha" → "SWOOP", "dzap-matcha" → "DZAP"
              let providerName = String(sKey || '').toUpperCase();
              if (sKey && sKey.includes('-')) {
                // Format: "provider-dex" (e.g., "delta-matcha", "swoop-kyber", "lifi-odos")
                const parts = sKey.split('-');
                const providerMap = {
                  'delta': '1DELTA',
                  'swoop': 'SWOOP',
                  'dzap': 'DZAP',
                  'lifi': 'LIFI',
                  'rango': 'RANGO',
                  'rubic': 'RUBIC'
                };
                providerName = providerMap[parts[0]] || parts[0].toUpperCase();
              }

              rej({
                statusCode: status,
                pesanDEX: `${String(sKey || '').toUpperCase()}: ${label} ${coreMsg}`,
                DEX: String(sKey || '').toUpperCase(),
                dexURL: linkDEX,
                textStatus,
                strategyUsed: sKey,              // ✅ NEW: Strategy key yang digunakan (e.g., "delta-matcha")
                providerName: providerName       // ✅ NEW: Provider name untuk tooltip (e.g., "1DELTA")
              });
            },
          });
        } catch (error) {
          rej({ statusCode: 500, pesanDEX: `Request Build Error: ${error.message}`, DEX: String(strategyName || '').toUpperCase() });
        }
      });

      const plan = resolveFetchPlan(dexType, action, chainName);
      const primary = plan.primary || String(dexType || '').toLowerCase();
      const secondary = plan.secondary || null;
      const alternative = plan.alternative || null;
      const mode = plan.mode || 'primary-only';
      const normalizedKey = plan.normalizedKey || String(dexType || '').toLowerCase();

      // ✅ Get allowFallback setting from config
      const dexConfig = (root.CONFIG_DEXS || {})[normalizedKey] || {};
      const allowFallback = dexConfig.allowFallback !== false; // Default: true (for backward compatibility)

      // ========== STRATEGY SELECTION ==========
      // Select strategy based on mode:
      // - 'rotation': alternate between primary/secondary (odd=primary, even=secondary)
      // - 'fallback': primary first, alternative only on error
      // - 'primary-only': always use primary
      const strategySelection = selectStrategy(normalizedKey, primary, secondary, alternative, mode);
      const selectedStrategy = strategySelection.selectedStrategy;
      const fallbackStrategy = strategySelection.fallbackStrategy;
      const alternativeStrategy = strategySelection.alternativeStrategy || null;
      const isRotationMode = strategySelection.isRotation;

      // DEBUG: Log strategy selection with mode info
      const displayDex = normalizedKey !== String(dexType || '').toLowerCase() ? `${dexType.toUpperCase()}→${normalizedKey.toUpperCase()}` : dexType.toUpperCase();
      const modeLabel = mode === 'rotation'
        ? `ROTATION #${strategySelection.rotationInfo?.counter || 0} (${strategySelection.rotationInfo?.used || 'primary'})`
        : mode === 'fallback'
          ? 'FALLBACK-MODE'
          : 'PRIMARY-ONLY';
      console.log(`[DEX STRATEGY] ${chainName?.toUpperCase() || 'CHAIN'} ${displayDex} ${action}: mode='${modeLabel}', selected='${selectedStrategy}'${fallbackStrategy ? `, fallback='${fallbackStrategy}'` : ''}, allowFallback=${allowFallback}`);

      // ========== CREATE INFLIGHT REQUEST PROMISE ==========
      // Create promise chain and store in inflight cache to prevent duplicate requests
      const inflightPromise = runStrategy(selectedStrategy)
        .then((result) => {
          // SUCCESS: Cache the response for future use
          // ✅ PERF: LRUCache stores value directly with internal TTL, Map needs wrapper
          if (USE_LRU_CACHE) {
            DEX_RESPONSE_CACHE.set(cacheKey, result);
          } else {
            DEX_RESPONSE_CACHE.set(cacheKey, {
              response: result,
              timestamp: Date.now()
            });
          }
          return result;
        })
        .catch((e1) => {
          const code = Number(e1 && e1.statusCode);
          const noResp = !Number.isFinite(code) || code === 0;

          // ========== FALLBACK LOGIC ==========
          // Check if fallback is allowed and fallback strategy exists
          const computedFallback = fallbackStrategy;

          // ✅ Respect allowFallback setting from config
          if (!allowFallback) {
            console.warn(`[DEX FALLBACK] ${chainName?.toUpperCase() || 'CHAIN'} ${dexType.toUpperCase()}: Fallback DISABLED by config (allowFallback: false)`);
            throw e1; // Don't fallback, throw error directly
          }

          // ✅ FIX: Allow fallback for timeout/network error on ALL DEXs with fallback strategy
          const isNoRespFallback = noResp && computedFallback && allowFallback;

          // Fallback conditions (only if allowFallback is true):
          // 1. Rate limit (429)
          // 2. Server error (500+)
          // 3. No response (timeout/network error) for ALL DEXs with fallback strategy
          const shouldFallback = computedFallback && (
            (Number.isFinite(code) && (code === 429 || code >= 500)) || // Rate limit atau server error
            isNoRespFallback // Atau no response (timeout/network error)
          );
          if (!shouldFallback) throw e1;

          // DEBUG: Log fallback trigger with mode info
          const fallbackReason = code === 429 ? 'RATE_LIMIT' : code >= 500 ? `SERVER_ERROR_${code}` : 'TIMEOUT/NO_RESPONSE';
          console.warn(`[DEX FALLBACK] ${chainName?.toUpperCase() || 'CHAIN'} ${dexType.toUpperCase()}: mode='${mode}' selected='${selectedStrategy}' FAILED (${fallbackReason}), trying fallback='${computedFallback}'`);

          // Try fallback strategy
          return runStrategy(computedFallback)
            .then((result) => {
              // SUCCESS: Cache the fallback response
              // ✅ PERF: LRUCache stores value directly with internal TTL, Map needs wrapper
              if (USE_LRU_CACHE) {
                DEX_RESPONSE_CACHE.set(cacheKey, result);
              } else {
                DEX_RESPONSE_CACHE.set(cacheKey, {
                  response: result,
                  timestamp: Date.now()
                });
              }
              return result;
            })
            .catch((e2) => {
              // ✅ LEVEL 3: Coba alternativeStrategy jika rotation primary+secondary keduanya gagal
              const e2Code = Number(e2 && e2.statusCode) || 0;
              const noResp2 = !Number.isFinite(e2Code) || e2Code === 0;
              const shouldTryAlternative = alternativeStrategy && allowFallback && (
                (Number.isFinite(e2Code) && (e2Code === 429 || e2Code >= 500)) ||
                noResp2
              );

              if (shouldTryAlternative) {
                console.warn(`[DEX FALLBACK L3] ${dexType.toUpperCase()}: primary+fallback failed, trying alternative='${alternativeStrategy}'`);
                return runStrategy(alternativeStrategy)
                  .then((result) => {
                    if (USE_LRU_CACHE) {
                      DEX_RESPONSE_CACHE.set(cacheKey, result);
                    } else {
                      DEX_RESPONSE_CACHE.set(cacheKey, { response: result, timestamp: Date.now() });
                    }
                    return result;
                  });
              }

              // ENHANCEMENT: Fallback juga gagal - enhance error dengan info kedua strategy
              // Extract provider names untuk clarity
              const primaryProvider = String(selectedStrategy || '').includes('-')
                ? String(selectedStrategy).split('-')[0].toUpperCase()
                : String(selectedStrategy || '').toUpperCase();
              const fallbackProvider = String(computedFallback || '').includes('-')
                ? String(computedFallback).split('-')[0].toUpperCase()
                : String(computedFallback || '').toUpperCase();

              // Map provider keys to display names
              const providerMap = {
                'DELTA': '1DELTA',
                'SWOOP': 'SWOOP',
                'DZAP': 'DZAP',
                'LIFI': 'LIFI',
                'RANGO': 'RANGO',
                'RUBIC': 'RUBIC',
                'HINKAL': 'HINKAL',
                'ZERO': 'ZERO'
              };
              const primaryName = providerMap[primaryProvider] || primaryProvider;
              const fallbackName = providerMap[fallbackProvider] || fallbackProvider;

              // Enhance error message untuk show both failures
              const e1Code = Number(e1 && e1.statusCode) || 0;
              const e1Msg = String(e1 && e1.pesanDEX || 'unknown error');
              const e2Msg = String(e2 && e2.pesanDEX || 'unknown error');

              console.error(`[DEX FALLBACK FAILED] ${dexType.toUpperCase()}: primary='${selectedStrategy}' (${e1Code}), fallback='${computedFallback}' (${e2Code}) - Both failed!`);

              // ✅ Return enhanced error object dengan informasi lengkap
              throw {
                statusCode: e2Code || e1Code,  // Prioritize fallback error code
                pesanDEX: `Both strategies failed - Primary: ${primaryName} (${e1Code || 'timeout'}), Fallback: ${fallbackName} (${e2Code || 'timeout'})`,
                DEX: String(dexType || '').toUpperCase(),
                dexURL: e2.dexURL || e1.dexURL,
                textStatus: e2.textStatus || e1.textStatus,
                primaryStrategy: selectedStrategy,
                primaryProvider: primaryName,
                primaryError: e1Msg,
                primaryCode: e1Code,
                fallbackStrategy: computedFallback,
                fallbackProvider: fallbackName,
                fallbackError: e2Msg,
                fallbackCode: e2Code,
                bothFailed: true
              };
            });
        })
        .finally(() => {
          // CLEANUP: Remove from inflight cache after completion (success or error)
          DEX_INFLIGHT_REQUESTS.delete(cacheKey);
        });

      // Store in inflight cache
      DEX_INFLIGHT_REQUESTS.set(cacheKey, inflightPromise);

      // Attach resolve/reject to the inflight promise
      inflightPromise.then(resolve).catch(reject);
    });
  }

  /**
   * Optional fallback quoting via external SWOOP service.
   */
  function getPriceAltDEX(sc_input, des_input, sc_output, des_output, amount_in, PriceRate, dexType, NameToken, NamePair, cex, nameChain, codeChain, action, options) {
    // Default fallback policy: SWOOP atau DZAP sesuai config DEX
    const force = options && options.force ? String(options.force).toLowerCase() : null; // 'swoop' | 'dzap' | null

    // untuk okx,0x,kyber,paraswap,odos gunakan fallback SWOOP
    function fallbackSWOOP() {
      return new Promise((resolve, reject) => {
        const dexLower = String(dexType || '').toLowerCase();
        const slugMap = {
          'odos': 'odos',
          'kyber': 'kyberswap',
          'paraswap': 'paraswap',
          '0x': '0x',
          'okx': 'okx'
        };
        const aggregatorSlug = slugMap[dexLower] || dexLower;

        const SavedSettingData = getFromLocalStorage('SETTING_SCANNER', {});
        const payload = {
          chainId: codeChain, aggregatorSlug: aggregatorSlug, sender: SavedSettingData.walletMeta,
          inToken: { chainId: codeChain, type: 'TOKEN', address: sc_input.toLowerCase(), decimals: parseFloat(des_input) },
          outToken: { chainId: codeChain, type: 'TOKEN', address: sc_output.toLowerCase(), decimals: parseFloat(des_output) },
          amountInWei: String(BigInt(Math.round(Number(amount_in) * Math.pow(10, des_input)))),
          slippageBps: String(Math.round(parseFloat(getSlippageValue()) * 100)), gasPriceGwei: Number(getFromLocalStorage('gasGWEI', 0)),  // USER-CONFIGURABLE (bps)
        };
        $.ajax({
          url: 'https://bzvwrjfhuefn.up.railway.app/swap', // Endpoint SWOOP
          type: 'POST', contentType: 'application/json', data: JSON.stringify(payload),
          success: function (response) {
            if (!response || !response.amountOutWei) return reject({ pesanDEX: 'SWOOP response invalid' });
            const amount_out = parseFloat(response.amountOutWei) / Math.pow(10, des_output);
            const FeeSwap = getFeeSwap(nameChain);
            resolve({ dexTitle: dexType, sc_input, des_input, sc_output, des_output, FeeSwap, dex: dexType, amount_out });
          },
          error: function (xhr, textStatus) {
            let status = 0; try { status = Number(xhr && xhr.status) || 0; } catch (_) { }
            try {
              const txt = xhr && xhr.responseText;
              if (txt && typeof txt === 'string' && txt.length) {
                try {
                  const parsed = JSON.parse(txt);
                  const upstream = Number(parsed.status || parsed.statusCode || parsed.code);
                  if (Number.isFinite(upstream) && upstream >= 400) status = upstream;
                } catch (_) { }
              }
            } catch (_) { }
            const isParser = String(textStatus || '').toLowerCase() === 'parsererror';
            let coreMsg;
            if (textStatus === 'timeout') coreMsg = 'Request Timeout';
            else if (status === 200) coreMsg = isParser ? 'Parser Error (200)' : 'XHR Error (200)';
            else if (status > 0) coreMsg = describeHttpStatus(status);
            else coreMsg = `Error: ${textStatus || 'unknown'}`;
            const prefix = status > 0 ? (status === 200 ? '[XHR ERROR 200]' : `[HTTP ${status}]`) : '';
            const isDark = (typeof window !== 'undefined' && window.isDarkMode && window.isDarkMode()) || (typeof document !== 'undefined' && document.body && document.body.classList.contains('dark-mode'));
            const errColor = isDark ? '#7e3636' : '#fce0e0';
            reject({ statusCode: status, pesanDEX: `SWOOP: ${prefix} ${coreMsg}`, color: errColor, DEX: dexType.toUpperCase(), textStatus });
          }
        });
      });
    }

    // untuk okx,zerox(0x),kyber,paraswap,odos gunakan fallback DZAP
    function fallbackDZAP() {
      return new Promise((resolve, reject) => {
        const SavedSettingData = getFromLocalStorage('SETTING_SCANNER', {});
        const fromAmount = String(BigInt(Math.round(Number(amount_in) * Math.pow(10, des_input))));
        const dexLower = String(dexType || '').toLowerCase();
        const exchangeMap = {
          '0x': 'zerox',         // Sesuai respons DZAP
          'matcha': 'zerox',      // Alias untuk 0x
          'kyber': 'kyberSwap',   // Sesuai respons DZAP
          'kyberswap': 'kyberSwap', // Alias untuk kyber
          'relay': 'relay',       // Relay aggregator
          'odos': 'odos',
          'odos3': 'odos',
          'okx': 'okx',
          'paraswap': 'paraSwap' // Sesuai respons DZAP
        };
        const displayMap = {
          '0x': '0X',
          'kyber': 'KYBER',
          'kyberswap': 'KYBER',
          'relay': 'RELAY',
          'odos': 'ODOS',
          'odos3': 'ODOS',
          'okx': 'OKX',
          'paraswap': 'PARASWAP'
        };
        const exchangeSlug = exchangeMap[dexLower] || dexLower;
        const displayTitle = displayMap[dexLower] || dexLower.toUpperCase();

        // Format request body baru sesuai dengan contoh yang diberikan
        const body = {
          fromChain: Number(codeChain),
          data: [{
            amount: fromAmount,
            destDecimals: Number(des_output),
            destToken: sc_output.toLowerCase(),
            slippage: parseFloat(getSlippageValue()),  // USER-CONFIGURABLE (percentage)
            srcDecimals: Number(des_input),
            srcToken: sc_input.toLowerCase(),
            toChain: Number(codeChain)
          }],
          integratorId: 'dzap', // Sesuai contoh
          gasless: false
        };

        $.ajax({
          url: 'https://api.dzap.io/v1/quotes', // Endpoint tetap sama, hanya body yang berubah
          method: 'POST',
          dataType: 'json',
          contentType: 'application/json',
          data: JSON.stringify(body),
          success: function (response) {
            // Struktur respons Dzap bersarang dan memiliki key dinamis.
            const responseKey = Object.keys(response || {})[0];
            const quoteData = response?.[responseKey];
            const quoteRates = quoteData?.quoteRates;

            // Manual console log untuk respons dari provider DEX utama di Dzap
            // if (quoteRates && quoteRates[exchangeSlug]) {
            //   console.log(`[DZAP ALT RESPONSE for ${exchangeSlug.toUpperCase()}]`, quoteRates[exchangeSlug]);
            // } else {
            //   console.log(`[DZAP ALT RESPONSE] (Provider for ${exchangeSlug.toUpperCase()} not found, showing full response)`, response);
            // }

            if (!quoteRates || Object.keys(quoteRates).length === 0) {
              return reject({ pesanDEX: 'DZAP quote rates not found' });
            }

            // 1. Coba dapatkan quote dari provider yang sesuai dengan DEX utama (exchangeSlug).
            let targetQuote = quoteRates[exchangeSlug];

            // 2. Jika tidak ada, ambil quote pertama yang tersedia sebagai fallback.
            if (!targetQuote) {
              const firstProviderKey = Object.keys(quoteRates)[0];
              targetQuote = quoteRates[firstProviderKey];
            }

            if (!targetQuote || !targetQuote.destAmount) return reject({ pesanDEX: 'DZAP valid quote not found' });

            const amount_out = parseFloat(targetQuote.destAmount) / Math.pow(10, des_output);
            const feeUsd = parseFloat(targetQuote.fee?.gasFee?.[0]?.amountUSD || 0);
            const FeeSwap = (Number.isFinite(feeUsd) && feeUsd > 0) ? feeUsd : getFeeSwap(nameChain);
            // Gunakan ID provider dari Dzap sebagai routeTool untuk ditampilkan di UI (VIA ...)
            const rawTool = targetQuote.providerDetails?.id || exchangeSlug || 'dzap';

            resolve({
              dexTitle: displayTitle,
              sc_input, des_input, sc_output, des_output,
              FeeSwap, dex: dexType, amount_out,
              routeTool: String(rawTool).toUpperCase()
            });
          },
          error: function (xhr, textStatus) {
            let status = 0; try { status = Number(xhr && xhr.status) || 0; } catch (_) { }
            try {
              const txt = xhr && xhr.responseText;
              if (txt && typeof txt === 'string' && txt.length) {
                try {
                  const parsed = JSON.parse(txt);
                  const upstream = Number(parsed.status || parsed.statusCode || parsed.code);
                  if (Number.isFinite(upstream) && upstream >= 400) status = upstream;
                } catch (_) { }
              }
            } catch (_) { }
            const isParser = String(textStatus || '').toLowerCase() === 'parsererror';
            let coreMsg;
            if (textStatus === 'timeout') coreMsg = 'Request Timeout';
            else if (status === 200) coreMsg = isParser ? 'Parser Error (200)' : 'XHR Error (200)';
            else if (status > 0) coreMsg = describeHttpStatus(status);
            else coreMsg = `Error: ${textStatus || 'unknown'}`;
            const prefix = status > 0 ? (status === 200 ? '[XHR ERROR 200]' : `[HTTP ${status}]`) : '';
            const isDark = (typeof window !== 'undefined' && window.isDarkMode && window.isDarkMode()) || (typeof document !== 'undefined' && document.body && document.body.classList.contains('dark-mode'));
            const errColor = isDark ? '#7e3636' : '#fce0e0';
            reject({ statusCode: status, pesanDEX: `DZAP: ${prefix} ${coreMsg}`, color: errColor, DEX: dexType.toUpperCase(), textStatus });
          }
        });
      });
    }

    // FIX: Pilih fallback berdasarkan CONFIG_DEXS[dex].alternative per arah, baru CONFIG_APP.DEX_FALLBACK
    let configFallback = null;
    try {
      const dexLower = String(dexType || '').toLowerCase();
      const dexConfig = (root.CONFIG_DEXS || {})[dexLower];
      if (dexConfig && dexConfig.fetchdex && dexConfig.fetchdex.alternative) {
        const actionKey = String(action || '').toLowerCase() === 'pairtotoken' ? 'pairtotoken' : 'tokentopair';
        const altStrategy = dexConfig.fetchdex.alternative[actionKey];
        if (altStrategy) {
          configFallback = String(altStrategy).toLowerCase();
        }
      }
    } catch (_) { }

    // Fallback global jika tidak ada alternative per-DEX
    if (!configFallback) {
      configFallback = (root.CONFIG_APP && root.CONFIG_APP.DEX_FALLBACK)
        ? String(root.CONFIG_APP.DEX_FALLBACK).toLowerCase()
        : 'dzap';
    }

    const fallbackType = force || configFallback;

    // Jika 'none', reject langsung tanpa fallback
    if (fallbackType === 'none') {
      return Promise.reject({ pesanDEX: 'Fallback disabled', DEX: dexType.toUpperCase() });
    }

    if (fallbackType === 'dzap') {
      return fallbackDZAP();
    }
    // Default fallback adalah swoop
    return fallbackSWOOP();
  }

  // ✅ PERF: Debug helper to get cache statistics
  function getCacheStats() {
    if (USE_LRU_CACHE && DEX_RESPONSE_CACHE.getStats) {
      return {
        type: 'LRUCache',
        ...DEX_RESPONSE_CACHE.getStats(),
        inflightRequests: DEX_INFLIGHT_REQUESTS.size
      };
    }
    return {
      type: 'Map',
      size: DEX_RESPONSE_CACHE.size,
      inflightRequests: DEX_INFLIGHT_REQUESTS.size
    };
  }

  // Expose to window for debugging
  root.getDexCacheStats = getCacheStats;

  if (typeof App.register === 'function') {
    App.register('Services', { DEX: { dexStrategies, getPriceDEX, getPriceAltDEX, getCacheStats } });
  }

  // Lightweight DEX registry for link builders and policy
  (function initDexRegistry() {
    const REG = new Map();
    // Alias mapping untuk normalize nama DEX yang berbeda
    const ALIASES = {
      'kyberswap': 'kyber',
      '0x': 'matcha',  // ✅ FIX: Reverse alias - normalize '0x' to 'matcha' (not the opposite)
      'odos3': 'odos',
      'hinkal': 'odos',
      'okxdex': 'okx'
    };
    function norm(n) {
      const lower = String(n || '').toLowerCase();
      return ALIASES[lower] || lower;
    }
    const DexAPI = {
      register(name, def) {
        const originalKey = String(name || '').toLowerCase();
        const normalizedKey = norm(name);
        if (!normalizedKey) return;
        const entry = {
          builder: def?.builder,
          allowFallback: !!def?.allowFallback,
          strategy: def?.strategy || null,
          proxy: !!def?.proxy,
        };
        REG.set(normalizedKey, entry);
        // keep CONFIG_DEXS in sync for existing callers
        root.CONFIG_DEXS = root.CONFIG_DEXS || {};

        // ✅ FIX: Store config under BOTH original and normalized keys
        // This ensures lookups work with either 'matcha' or '0x'
        const keysToUpdate = [normalizedKey];
        if (originalKey && originalKey !== normalizedKey) {
          keysToUpdate.push(originalKey);
        }

        keysToUpdate.forEach(k => {
          root.CONFIG_DEXS[k] = root.CONFIG_DEXS[k] || {};
          if (typeof entry.builder === 'function') root.CONFIG_DEXS[k].builder = entry.builder;
          if ('allowFallback' in entry) root.CONFIG_DEXS[k].allowFallback = entry.allowFallback;
          if ('proxy' in entry) root.CONFIG_DEXS[k].proxy = entry.proxy;
        });
      },
      get(name) { return REG.get(norm(name)) || null; },
      list() { return Array.from(REG.keys()); },
      normalize(name) { return norm(name); }
    };

    // Seed from existing CONFIG_DEXS if present (builder, allowFallback, strategy)
    try {
      Object.keys(root.CONFIG_DEXS || {}).forEach(k => {
        const d = root.CONFIG_DEXS[k] || {};
        DexAPI.register(k, { builder: d.builder, allowFallback: !!d.allowFallback, strategy: d.STRATEGY || null, proxy: !!d.proxy });
      });
    } catch (_) { }

    root.DEX = DexAPI;

    // Register FlyTrade tanpa proxy (direct API endpoint)
    DexAPI.register('fly', {
      allowFallback: false,
      proxy: false,
      builder: function ({ chainName, codeChain, tokenAddress, pairAddress }) {
        return `https://fly.trade/swap?network=${String(chainName || '').toLowerCase()}&from=${pairAddress}&to=${tokenAddress}`;
      }
    });
  })();
})(typeof window !== 'undefined' ? window : this);

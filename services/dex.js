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

      if (!gasInfo || !gasInfo.nativeTokenPrice) return 0;

      // Get chain config for gas limit
      const chainConfig = (typeof root.CONFIG_CHAINS !== 'undefined')
        ? root.CONFIG_CHAINS[String(chainName || '').toLowerCase()]
        : null;

      const gasLimit = gasEstimate || (chainConfig ? chainConfig.GASLIMIT : 80000);

      // Calculate fee: gasLimit * gasPriceGwei * nativeTokenPrice / 1e9
      const feeUSD = (gasLimit * gasPriceGwei * gasInfo.nativeTokenPrice) / 1e9;

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

  // ============================================================================
  // 0x API CONFIGURATION
  // ============================================================================
  /**
   * 0x API (Matcha) Configuration
   * Official documentation: https://0x.org/docs/api
   *
   * Get your API key from: https://dashboard.0x.org
   *
   * The API key should be stored in SavedSettingData.apiKey0x or as fallback
   */
  function get0xApiKey() {
    try {
      // ✅ SINGLE SOURCE OF TRUTH: Use window.get0xApiKey from secrets.js
      // This function handles both SavedSettingData and IndexedDB fallback
      if (typeof root.get0xApiKey === 'function') {
        const apiKey = root.get0xApiKey();
        if (apiKey) {
          return apiKey;
        }
      }

      // If secrets.js function not available, return null
      console.warn('[0x API] get0xApiKey() from secrets.js not available');
      return null;
    } catch (error) {
      console.error('[0x API] Error getting API key:', error);
      return null;
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

        const kyberUrl = `https://aggregator-api.kyberswap.com/${chainName.toLowerCase()}/api/v1/routes?tokenIn=${sc_input}&tokenOut=${sc_output}&amountIn=${amount_in_big}&includedSources=${encodeURIComponent(includedSources)}&gasInclude=true`;
        return { url: kyberUrl, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response?.data?.routeSummary) throw new Error("Invalid KyberSwap response structure");
        return {
          amount_out: response.data.routeSummary.amountOut / Math.pow(10, des_output),
          FeeSwap: parseFloat(response.data.routeSummary.gasUsd) || getFeeSwap(chainName),
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
        const FeeSwap = (Number.isFinite(gasFeesUsd) && gasFeesUsd > 0)
          ? gasFeesUsd
          : getFeeSwap(chainName);

        return {
          amount_out,
          FeeSwap,
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
        const FeeSwap = (Number.isFinite(gasUsd) && gasUsd > 0) ? gasUsd : getFeeSwap(chainName);
        return {
          amount_out,
          FeeSwap,
          dexTitle: 'VELORA',
          routeTool: 'VELORA V5'
        };
      }
    },
    'hinkal-odos': {
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
            slippageLimitPercent: 0.3,
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
          slippage: '0.1'
        });
        return { url: `${baseUrl}?${params.toString()}`, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const q = response?.quote;
        const buyAmount = q?.estimation?.buyAmount;
        if (!buyAmount) throw new Error('Invalid ZeroSwap Kyber response');
        const amount_out = parseFloat(buyAmount) / Math.pow(10, des_output);
        const FeeSwap = getFeeSwap(chainName);
        return { amount_out, FeeSwap, dexTitle: 'KYBER' };
      }
    },
    matcha: {
      buildRequest: ({ chainName, sc_input_in, sc_output_in, amount_in_big, codeChain, sc_output, sc_input, SavedSettingData }) => {
        /**
         * Matcha API - Official 0x Documentation
         * Docs: https://0x.org/docs/api
         * Dashboard: https://dashboard.0x.org
         *
         * IMPORTANT: 0x officially supports EVM chains only (NOT Solana)
         * - For Solana, use DZAP as configured fallback
         * - Supported chains: https://0x.org/docs/developer-resources/supported-chains
         */

        // Solana is NOT officially supported by Matcha API - should use fallback
        if (chainName && String(chainName).toLowerCase() === 'solana') {
          throw new Error('Matcha API does not support Solana - use DZAP fallback');
        }

        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';

        // Get 0x API key
        const apiKey = get0xApiKey();
        if (!apiKey) {
          throw new Error('0x API key required. Get one from https://dashboard.0x.org');
        }

        // Build request URL with official 0x API endpoint
        // ✅ UPDATED: Using /swap/allowance-holder/quote endpoint (official v2 API)
        // Docs: https://0x.org/docs/api#tag/Swap/operation/swap::allowanceHolder::getQuote
        const baseUrl = 'https://api.0x.org/swap/allowance-holder/quote';

        const params = new URLSearchParams({
          chainId: String(codeChain),           // Chain ID as string (required)
          sellToken: sc_input_in,                // Sell token address (checksummed, required)
          buyToken: sc_output_in,                // Buy token address (checksummed, required)
          sellAmount: String(amount_in_big),     // Amount in base units (required)
          taker: userAddr,                       // Taker address (required)
          slippageBps: '100'                     // 1% slippage (default: 100 basis points)
        });

        const url = `${baseUrl}?${params.toString()}`;

        // Required headers per official documentation
        const headers = {
          '0x-api-key': apiKey,
          '0x-version': 'v2'
        };

        console.log(`[Matcha API] Request: ${chainName} ${sc_input_in} -> ${sc_output_in}`);

        return { url, method: 'GET', headers };
      },
      parseResponse: (response, { des_output, des_input, chainName }) => {
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

        // Parse buyAmount from response (already in base units)
        const buyAmount = parseFloat(response.buyAmount);
        const amount_out = buyAmount / Math.pow(10, des_output);

        // Calculate gas fee from response (if available)
        let FeeSwap = getFeeSwap(chainName);
        try {
          if (response.fees && response.fees.gasFee) {
            const gasFeeUsd = parseFloat(response.fees.gasFee.amount || 0);
            if (Number.isFinite(gasFeeUsd) && gasFeeUsd > 0) {
              FeeSwap = gasFeeUsd;
            }
          } else if (response.transaction && response.transaction.gas && response.transaction.gasPrice) {
            // Fallback: Calculate from gas * gasPrice (need native token price)
            const gasLimit = parseFloat(response.transaction.gas);
            const gasPrice = parseFloat(response.transaction.gasPrice);
            // This would need native token price conversion - skip for now
          }
        } catch (e) {
          console.warn('[0x API] Could not parse gas fee from response, using default');
        }

        // Log response details for debugging
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

        // Log warnings if present
        if (response.issues) {
          const issueKeys = Object.keys(response.issues || {}).filter(k => response.issues[k]);
          if (issueKeys.length > 0) {
            console.warn(`[0x API] Response issues:`, issueKeys.join(', '));
          }
        }

        // Log liquidity sources used
        if (response.route?.fills) {
          const sources = response.route.fills
            .map(f => f.source || f.type)
            .filter((v, i, a) => v && a.indexOf(v) === i);
          if (sources.length > 0) {
            console.log(`[Matcha API] Liquidity sources:`, sources.join(', '));
          }
        }

        return {
          amount_out,
          FeeSwap,
          dexTitle: 'MATCHA',
          routeTool: 'MATCHA'  // Official Matcha/0x API (not via proxy)
        };
      }
    },
    'delta-matcha': {
      buildRequest: ({ chainName, sc_input_in, sc_output_in, amount_in_big, codeChain, SavedSettingData }) => {
        /**
         * 1Delta Matcha Proxy - Free alternative to official 0x API
         * Endpoint: https://api.1delta.io/swap/allowance-holder/quote
         * 
         * Benefits:
         * - No API key required (free tier)
         * - Same response format as 0x API
         * - Faster response time (optimized proxy)
         * - Reduces load on official 0x API keys
         * 
         * Note: Falls back to official Matcha API if 1Delta fails
         */

        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';

        // 1Delta proxy endpoint (same format as 0x API)
        const baseUrl = 'https://api.1delta.io/swap/allowance-holder/quote';

        const params = new URLSearchParams({
          chainId: String(codeChain),           // Chain ID as string
          sellToken: sc_input_in,                // Sell token address
          buyToken: sc_output_in,                // Buy token address
          sellAmount: String(amount_in_big),     // Amount in base units
          taker: userAddr,                       // Taker address
          slippageBps: '30',                     // 0.3% slippage (lower than Matcha's 1%)
          tradeSurplusRecipient: userAddr,       // Surplus recipient
          aggregator: '0x'                       // Aggregator identifier
        });

        const url = `${baseUrl}?${params.toString()}`;

        console.log(`[1Delta Matcha] Request: ${chainName} ${sc_input_in} -> ${sc_output_in}`);

        // No API key needed for 1Delta
        return { url, method: 'GET', headers: {} };
      },
      parseResponse: (response, { des_output, chainName }) => {
        /**
         * Parse 1Delta response (same format as 0x API)
         * Response structure identical to Matcha API
         */

        if (!response?.buyAmount) {
          throw new Error("Invalid 1Delta response - missing buyAmount");
        }

        // Parse buyAmount from response
        const buyAmount = parseFloat(response.buyAmount);
        const amount_out = buyAmount / Math.pow(10, des_output);

        // Calculate gas fee from response
        let FeeSwap = getFeeSwap(chainName);
        try {
          if (response.fees && response.fees.gasFee) {
            const gasFeeUsd = parseFloat(response.fees.gasFee.amount || 0);
            if (Number.isFinite(gasFeeUsd) && gasFeeUsd > 0) {
              FeeSwap = gasFeeUsd;
            }
          }
        } catch (e) {
          console.warn('[1Delta] Could not parse gas fee, using default');
        }

        console.log(`[1Delta Matcha] Response parsed:`, {
          buyAmount: response.buyAmount,
          amountOut: amount_out.toFixed(6),
          feeSwap: FeeSwap.toFixed(4),
          chainName
        });

        return {
          amount_out,
          FeeSwap,
          dexTitle: 'MATCHA',  // Show DEX name in title
          routeTool: 'MATCHA via 1DELTA'  // Show provider in tooltip (consistent format)
        };
      }
    },
    okx: {
      buildRequest: ({ amount_in_big, codeChain, sc_input_in, sc_output_in }) => {
        const selectedApiKey = getRandomApiKeyOKX(apiKeysOKXDEX);
        const timestamp = new Date().toISOString();
        const path = "/api/v6/dex/aggregator/quote";
        //https://web3.okx.com/priapi/v6/dx/trade/multi/quote?
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
        // Validate response structure
        if (!response?.data?.[0]?.toTokenAmount) throw new Error("Invalid OKX response structure");

        const data = response.data[0];
        const amount_out = parseFloat(data.toTokenAmount) / Math.pow(10, des_output);

        // Parse gas fee dari estimateGasFee (dalam wei) dan konversi ke USD
        let FeeSwap = getFeeSwap(chainName);
        try {
          const gasWei = parseFloat(data.estimateGasFee || 0);
          if (gasWei > 0) {
            // Get native token price from gas data
            const allGasData = (typeof getFromLocalStorage === 'function')
              ? getFromLocalStorage("ALL_GAS_FEES")
              : null;

            if (allGasData) {
              const gasInfo = allGasData.find(g =>
                String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase()
              );

              if (gasInfo && gasInfo.nativeTokenPrice) {
                // Convert wei to native token units (divide by 1e18) then multiply by token price
                const gasUSD = (gasWei / 1e18) * gasInfo.nativeTokenPrice;
                if (Number.isFinite(gasUSD) && gasUSD > 0) {
                  FeeSwap = gasUSD;
                }
              }
            }
          }
        } catch (e) {
          // Fallback to default gas fee if calculation fails
        }

        return {
          amount_out,
          FeeSwap,
          dexTitle: 'OKX',
          routeTool: 'OKX'  // Official OKX DEX API
        };
      }
    },
    sushi: {
      buildRequest: ({ codeChain, sc_input_in, sc_output_in, amount_in_big, SavedSettingData }) => {
        /**
         * Sushi API v7 - Official Documentation
         * Docs: https://docs.sushi.com/api/swagger
         * Examples: https://docs.sushi.com/api/examples/swap
         *
         * Endpoint: GET https://api.sushi.com/swap/v7/{chainId}
         * Query params:
         * - tokenIn: Input token address (required)
         * - tokenOut: Output token address (required)
         * - amount: Amount in base units (required)
         * - maxSlippage: Slippage tolerance, e.g., "0.005" for 0.5% (optional, default: 0.5%)
         * - sender: User wallet address (optional but recommended)
         * - apiKey: Optional for higher rate limits (from sushi.com/portal)
         */

        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';

        // Build API URL
        const baseUrl = `https://api.sushi.com/swap/v7/${codeChain}`;
        const params = new URLSearchParams({
          tokenIn: sc_input_in,
          tokenOut: sc_output_in,
          amount: String(amount_in_big),
          maxSlippage: '0.005',  // 0.5% slippage
          sender: userAddr
        });

        const url = `${baseUrl}?${params.toString()}`;

        console.log(`[Sushi API] Request: Chain ${codeChain} ${sc_input_in} -> ${sc_output_in}`);

        return { url, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        /**
         * Parse Sushi API response
         *
         * Response format:
         * - assumedAmountOut: Expected output amount in base units (string)
         * - swapPrice: Output amount divided by input amount
         * - priceImpact: Price impact percentage
         * - gasSpent: Gas cost estimate (number)
         * - route: { legs[], status }
         */

        if (!response?.assumedAmountOut) {
          throw new Error("Invalid Sushi API response - missing assumedAmountOut");
        }

        // Parse output amount from response (in base units)
        const outputAmount = parseFloat(response.assumedAmountOut);
        const amount_out = outputAmount / Math.pow(10, des_output);

        // ✅ FIX: gasSpent adalah GAS UNITS, bukan USD!
        // Perlu dikonversi: gasSpent * gasPrice (wei) * nativeTokenPrice / 1e18
        let FeeSwap = getFeeSwap(chainName);
        try {
          const gasUnits = parseFloat(response.gasSpent || 0);
          const gasPriceWei = parseFloat(response.tx?.gasPrice || 0);

          if (gasUnits > 0 && gasPriceWei > 0) {
            // Get native token price from stored gas data
            const allGasData = (typeof getFromLocalStorage === 'function')
              ? getFromLocalStorage("ALL_GAS_FEES")
              : null;

            if (allGasData) {
              const gasInfo = allGasData.find(g =>
                String(g.chain || '').toLowerCase() === String(chainName || '').toLowerCase()
              );

              if (gasInfo && gasInfo.nativeTokenPrice) {
                // Calculate: gasUnits * gasPriceWei / 1e9 (to gwei) * nativeTokenPrice / 1e9
                // Simplified: gasUnits * gasPriceWei * nativeTokenPrice / 1e18
                const gasUSD = (gasUnits * gasPriceWei * gasInfo.nativeTokenPrice) / 1e18;
                if (Number.isFinite(gasUSD) && gasUSD > 0 && gasUSD < 100) { // Sanity check < $100
                  FeeSwap = gasUSD;
                  try { if (window.SCAN_LOG_ENABLED) console.log(`[Sushi] Gas fee calculated: ${gasUnits} units * ${gasPriceWei} wei * $${gasInfo.nativeTokenPrice} = $${gasUSD.toFixed(4)}`); } catch (_) { }
                }
              }
            }
          }
        } catch (e) {
          try { if (window.SCAN_LOG_ENABLED) console.warn('[Sushi API] Could not calculate gas fee, using default:', e); } catch (_) { }
        }

        // Log route info if available
        if (response.route && response.route.legs) {
          console.log(`[Sushi] Route has ${response.route.legs.length} legs, price impact: ${response.priceImpact || 'N/A'}%`);
        }

        return {
          amount_out,
          FeeSwap,
          dexTitle: 'SUSHI',
          routeTool: 'SUSHI'  // Official SushiSwap API
        };
      }
    },
    flytrade: {
      buildRequest: ({ codeChain, chainName, sc_input_in, sc_output_in, amount_in_big, SavedSettingData }) => {
        /**
         * Flytrade API - Official Documentation
         * Endpoint: https://api.fly.trade/aggregator/quote
         * Docs: https://docs.fly.trade (or check official documentation)
         *
         * Query params:
         * - network: Chain name (ethereum, bsc, polygon, arbitrum, base, etc.)
         * - fromTokenAddress: Input token address (checksummed)
         * - toTokenAddress: Output token address (checksummed)
         * - sellAmount: Amount in base units (wei)
         * - slippage: Slippage tolerance (0.005 = 0.5%)
         * - gasless: Boolean for gasless swaps (default: false)
         * - fromAddress: User wallet address (optional)
         * - toAddress: User wallet address (optional)
         */

        // Map chain codes to Flytrade network names
        const chainMap = {
          1: 'ethereum',
          56: 'bsc',
          137: 'polygon',
          42161: 'arbitrum',
          8453: 'base',
          10: 'optimism',
          43114: 'avalanche'
        };

        const network = chainMap[Number(codeChain)] || String(chainName || '').toLowerCase();
        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';

        // Build query parameters
        const params = new URLSearchParams({
          network: network,
          fromTokenAddress: sc_input_in,
          toTokenAddress: sc_output_in,
          sellAmount: String(amount_in_big),
          slippage: '0.005',  // 0.5% slippage
          gasless: 'false',
          fromAddress: userAddr,
          toAddress: userAddr
        });

        const url = `https://api.fly.trade/aggregator/quote?${params.toString()}`;

        console.log(`[Flytrade API] Request: ${network} ${sc_input_in} -> ${sc_output_in}`);

        return { url, method: 'GET' };
      },
      parseResponse: (response, { des_output, chainName }) => {
        /**
         * Parse Flytrade API response
         *
         * Expected response format (based on common aggregator patterns):
         * - toAmount / buyAmount / outputAmount: Output amount in base units
         * - estimatedGas / gasCost: Gas cost estimate
         * - price / rate: Exchange rate
         */

        // Try common field names for output amount
        const outputRaw = response?.toAmount ||
          response?.buyAmount ||
          response?.outputAmount ||
          response?.amountOut;

        if (!outputRaw) {
          throw new Error("Invalid Flytrade response - missing output amount field");
        }

        // Parse output amount
        const outputAmount = parseFloat(outputRaw);
        const amount_out = outputAmount / Math.pow(10, des_output);

        // Get gas fee - try common field names
        let FeeSwap = getFeeSwap(chainName);
        try {
          const gasUsd = response?.estimatedGas ||
            response?.gasCost ||
            response?.gasCostUSD ||
            response?.gasEstimateUSD;

          if (gasUsd && parseFloat(gasUsd) > 0) {
            FeeSwap = parseFloat(gasUsd);
          }
        } catch (e) {
          console.warn('[Flytrade] Could not parse gas fee, using default');
        }

        return {
          amount_out,
          FeeSwap,
          dexTitle: 'FLYTRADE',
          routeTool: 'FLYTRADE'  // Official Flytrade API (not via aggregator)
        };
      }
    },
  };
  /**
   * ODOS Strategy Factory - Official API Implementation
   * Docs: https://docs.odos.xyz/build/quickstart/sor
   *
   * IMPORTANT: API v2 is being retired. Use v3 for new integrations.
   *
   * Request Format:
   * - chainId: Blockchain network ID
   * - inputTokens: Array of {tokenAddress, amount}
   * - outputTokens: Array of {tokenAddress, proportion}
   * - userAddr: User wallet address (checksummed)
   * - slippageLimitPercent: Slippage tolerance (0.3 = 0.3%)
   * - referralCode: Partner tracking (0 = default)
   * - disableRFQs: Disable RFQ liquidity (true = more reliable)
   * - compact: Enable compact call data (true = recommended)
   *
   * Response Format:
   * - outAmounts: Array of output amounts in wei
   * - gasEstimateValue: Gas cost in USD
   * - pathId: Quote identifier (valid for 60 seconds)
   */
  function createOdosStrategy(version) {
    const endpoint = `https://api.odos.xyz/sor/quote/${version}`;
    return {
      buildRequest: ({ codeChain, SavedSettingData, amount_in_big, sc_input_in, sc_output_in }) => {
        const wallet = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        // CRITICAL FIX: ODOS requires CHECKSUMMED addresses, use sc_input_in/sc_output_in (NOT lowercase!)
        return {
          url: endpoint,
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
            slippageLimitPercent: 0.3,
            referralCode: 0,              // Partner tracking code
            disableRFQs: true,            // Disable RFQ for reliability
            compact: true                 // Enable compact call data
          })
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        // Parse output amounts (array format)
        const rawOut = Array.isArray(response?.outAmounts) ? response.outAmounts[0] : response?.outAmounts;
        if (!rawOut) throw new Error("Invalid ODOS response: missing outAmounts");

        const outNum = parseFloat(rawOut);
        if (!Number.isFinite(outNum) || outNum <= 0) {
          throw new Error(`Invalid ODOS output amount: ${rawOut}`);
        }

        // Parse gas estimate (USD value)
        const gasEstimate = parseFloat(
          response?.gasEstimateValue ||
          response?.gasFeeUsd ||
          response?.gasEstimateUSD ||
          0
        );
        const FeeSwap = (Number.isFinite(gasEstimate) && gasEstimate > 0)
          ? gasEstimate
          : getFeeSwap(chainName);

        return {
          amount_out: outNum / Math.pow(10, des_output),
          FeeSwap,
          dexTitle: 'ODOS',
          routeTool: `ODOS-${version.toUpperCase()}`  // Track API version
        };
      }
    };
  }

  // ODOS API Strategy Instances
  dexStrategies.odos3 = createOdosStrategy('v3');  // Current (recommended)
  dexStrategies.odos = dexStrategies.odos3;        // Default to v3

  // =============================
  // DZAP Strategy - REST API Provider (Single-Quote)
  // =============================
  dexStrategies.dzap = {
    buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, des_input, des_output, chainName }) => {
      // Check for special DZAP chain ID (e.g., Solana uses different ID)
      const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
      const dzapChainId = chainConfig?.DZAP_CHAIN_ID || Number(codeChain);
      const isSolana = String(chainName || '').toLowerCase() === 'solana';

      // Use original addresses for Solana (base58 is case-sensitive), lowercase for EVM
      const srcToken = isSolana ? sc_input_in : sc_input.toLowerCase();
      const destToken = isSolana ? sc_output_in : sc_output.toLowerCase();

      const body = {
        fromChain: dzapChainId,
        data: [{
          amount: amount_in_big.toString(),
          destDecimals: Number(des_output),
          destToken: destToken,
          slippage: 0.3,
          srcDecimals: Number(des_input),
          srcToken: srcToken,
          toChain: dzapChainId
        }],
        gasless: false
      };
      return {
        url: 'https://api.dzap.io/v1/quotes',
        method: 'POST',
        data: JSON.stringify(body)
      };
    },
    parseResponse: (response, { des_output, chainName }) => {
      // ✅ CHANGED: Parse DZAP response - return BEST provider only (single-quote)
      // Support both formats:
      // NEW: { quotes: [{ quoteRates: {...} }] }
      // OLD: { [key]: { quoteRates: {...} } }

      let quoteRates;

      // Try NEW format first (quotes array)
      if (response?.quotes && Array.isArray(response.quotes) && response.quotes.length > 0) {
        quoteRates = response.quotes[0]?.quoteRates;
      }
      // Fallback to OLD format (object with dynamic key)
      else {
        const responseKey = Object.keys(response || {})[0];
        const quoteData = response?.[responseKey];
        quoteRates = quoteData?.quoteRates;
      }

      if (!quoteRates || Object.keys(quoteRates).length === 0) {
        throw new Error("DZAP quote rates not found in response");
      }

      // Parse semua DEX dari quoteRates dan find BEST
      let bestResult = null;
      for (const [dexId, quoteInfo] of Object.entries(quoteRates)) {
        try {
          if (!quoteInfo || !quoteInfo.destAmount) continue;

          const amount_out = parseFloat(quoteInfo.destAmount) / Math.pow(10, des_output);
          const feeUsd = parseFloat(quoteInfo.fee?.gasFee?.[0]?.amountUSD || 0);
          const FeeSwap = (Number.isFinite(feeUsd) && feeUsd > 0) ? feeUsd : getFeeSwap(chainName);

          // Select BEST provider (highest amount_out)
          if (!bestResult || amount_out > bestResult.amount_out) {
            bestResult = {
              amount_out: amount_out,
              FeeSwap: FeeSwap,
              dexTitle: 'DZAP'
            };
          }
        } catch (e) {
          continue;
        }
      }

      if (!bestResult) {
        throw new Error("No valid DZAP quotes found");
      }

      console.log(`[DZAP] Returning best provider: ${bestResult.amount_out.toFixed(6)} (from ${Object.keys(quoteRates).length} providers)`);

      // ✅ Return standard single-DEX format (NO subResults, NO isMultiDex)
      return bestResult;
    }
  };

  // =============================
  // LIFI Strategy - REST API Provider (Single-Quote)
  // =============================
  dexStrategies.lifi = {
    buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
      const apiKey = (typeof getRandomApiKeyLIFI === 'function') ? getRandomApiKeyLIFI() : '';

      // Check for special LIFI chain ID (e.g., Solana uses different ID)
      const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
      const lifiChainId = chainConfig?.LIFI_CHAIN_ID || Number(codeChain);
      const isSolana = String(chainName || '').toLowerCase() === 'solana';

      // Use original addresses for Solana (base58 is case-sensitive), lowercase for EVM
      const fromToken = isSolana ? sc_input_in : sc_input.toLowerCase();
      const toToken = isSolana ? sc_output_in : sc_output.toLowerCase();

      // For Solana, use Solana wallet address; for EVM use EVM wallet
      const defaultEvmAddr = '0x0000000000000000000000000000000000000000';
      const defaultSolAddr = 'So11111111111111111111111111111111111111112'; // Wrapped SOL as placeholder
      const userAddr = isSolana
        ? (SavedSettingData?.walletSolana || defaultSolAddr)
        : (SavedSettingData?.walletMeta || defaultEvmAddr);

      // ✅ HARDCODED: Filter for EVM chains - DEX only (no bridges)
      const options = {
        slippage: 0.03,
        order: 'RECOMMENDED',
        allowSwitchChain: false
      };

      // ✅ EVM CHAINS: Strict whitelist - only allow specific DEX aggregators
      if (!isSolana) {
        options.exchanges = {
          allow: [
            'paraswap',       // Paraswap aggregator
            '0x',             // Matcha/0x
            'odos',           // Odos optimizer
            'sushiswap',      // Sushiswap DEX
            'kyberswap',      // KyberSwap
            'okx'             // OKX aggregator (okx, bukan okxdex)
          ]
        };
      }

      const body = {
        fromChainId: lifiChainId,
        toChainId: lifiChainId,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        fromAmount: amount_in_big.toString(),
        fromAddress: userAddr,
        toAddress: userAddr,
        options: options
      };

      return {
        url: 'https://li.quest/v1/advanced/routes',
        method: 'POST',
        data: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          'x-lifi-api-key': apiKey
        }
      };
    },
    parseResponse: (response, { des_output, chainName }) => {
      // ✅ CHANGED: Parse LIFI response - return BEST route only (single-quote)
      const routes = response?.routes;

      if (!routes || !Array.isArray(routes) || routes.length === 0) {
        throw new Error("LIFI routes not found in response");
      }

      // Get BEST route (first route is already sorted by LIFI as RECOMMENDED)
      const bestRoute = routes[0];
      if (!bestRoute || !bestRoute.toAmount) {
        throw new Error("LIFI best route not found");
      }

      const amount_out = parseFloat(bestRoute.toAmount) / Math.pow(10, des_output);
      const gasCostUsd = parseFloat(bestRoute.gasCostUSD || 0);
      const FeeSwap = (Number.isFinite(gasCostUsd) && gasCostUsd > 0) ? gasCostUsd : getFeeSwap(chainName);

      console.log(`[LIFI] Returning best route: ${amount_out.toFixed(6)} (from ${routes.length} available routes)`);

      // ✅ Return standard single-DEX format (NO subResults, NO isMultiDex)
      return {
        amount_out: amount_out,
        FeeSwap: FeeSwap,
        dexTitle: 'LIFI'
      };
    }
  };

  // =============================
  // LIFI-ODOS Strategy - LIFI filtered for ODOS only (single-DEX style)
  // =============================
  // Digunakan sebagai alternative untuk ODOS - memanggil LIFI API dengan filter khusus ODOS
  // Response dalam format single-DEX (bukan multi-provider)
  // ✅ FIX: Using /v1/quote endpoint with allowExchanges query parameter (per LIFI docs)
  dexStrategies['lifi-odos'] = {
    buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
      const apiKey = (typeof getRandomApiKeyLIFI === 'function') ? getRandomApiKeyLIFI() : '';

      const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
      const lifiChainId = chainConfig?.LIFI_CHAIN_ID || Number(codeChain);
      const isSolana = String(chainName || '').toLowerCase() === 'solana';

      const fromToken = isSolana ? sc_input_in : sc_input.toLowerCase();
      const toToken = isSolana ? sc_output_in : sc_output.toLowerCase();

      const defaultEvmAddr = '0x0000000000000000000000000000000000000000';
      const defaultSolAddr = 'So11111111111111111111111111111111111111112';
      const userAddr = isSolana
        ? (SavedSettingData?.walletSolana || defaultSolAddr)
        : (SavedSettingData?.walletMeta || defaultEvmAddr);

      // ✅ FIX: Use /v1/quote with allowExchanges query param (per LIFI documentation)
      const params = new URLSearchParams({
        fromChain: lifiChainId.toString(),
        toChain: lifiChainId.toString(),
        fromToken: fromToken,
        toToken: toToken,
        fromAmount: amount_in_big.toString(),
        fromAddress: userAddr,
        allowExchanges: 'odos',  // ✅ Filter for ODOS only
        slippage: '0.03',
        order: 'RECOMMENDED'
      });

      return {
        url: `https://li.quest/v1/quote?${params.toString()}`,
        method: 'GET',
        headers: {
          'x-lifi-api-key': apiKey
        }
      };
    },
    parseResponse: (response, { des_output, chainName }) => {
      // /v1/quote returns a single Step object, not routes array
      if (!response || !response.estimate || !response.estimate.toAmount) {
        throw new Error("LIFI-ODOS: No valid quote received");
      }

      const estimate = response.estimate;
      const amount_out = parseFloat(estimate.toAmount) / Math.pow(10, des_output);

      // Get gas cost from estimate
      let gasCostUsd = 0;
      if (estimate.gasCosts && Array.isArray(estimate.gasCosts)) {
        gasCostUsd = estimate.gasCosts.reduce((sum, gc) => sum + parseFloat(gc.amountUSD || 0), 0);
      }
      const FeeSwap = (Number.isFinite(gasCostUsd) && gasCostUsd > 0) ? gasCostUsd : getFeeSwap(chainName);

      // Extract tool name from response
      const toolUsed = response.tool || response.toolDetails?.key || 'odos';

      console.log(`[LIFI-ODOS] Using ${toolUsed.toUpperCase()} via LIFI: ${amount_out.toFixed(6)} output, gas: $${FeeSwap.toFixed(4)}`);

      // Return format single-DEX (BUKAN multi-provider seperti LIFI biasa)
      return {
        amount_out: amount_out,
        FeeSwap: FeeSwap,
        dexTitle: 'ODOS',  // ✅ Show DEX name in title (user selected ODOS)
        routeTool: 'ODOS via LIFI'  // ✅ Show provider in tooltip
      };
    }
  };



  // =============================
  /**
   * Factory function to create LIFI filtered strategies for specific DEX providers
   * This reduces code duplication for lifi-velora, lifi-okx, lifi-sushi, lifi-kyber, lifi-matcha
   * 
   * ✅ FIX: Using /v1/quote endpoint with allowExchanges query parameter (per LIFI docs)
   * Reference: https://docs.li.fi/api-reference/get-a-quote-for-a-token-transfer-1
   */
  function createFilteredLifiStrategy(dexKey, dexTitle) {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
        const apiKey = (typeof getRandomApiKeyLIFI === 'function') ? getRandomApiKeyLIFI() : '';

        const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
        const lifiChainId = chainConfig?.LIFI_CHAIN_ID || Number(codeChain);
        const isSolana = String(chainName || '').toLowerCase() === 'solana';

        const fromToken = isSolana ? sc_input_in : sc_input.toLowerCase();
        const toToken = isSolana ? sc_output_in : sc_output.toLowerCase();

        const defaultEvmAddr = '0x0000000000000000000000000000000000000000';
        const defaultSolAddr = 'So11111111111111111111111111111111111111112';
        const userAddr = isSolana
          ? (SavedSettingData?.walletSolana || defaultSolAddr)
          : (SavedSettingData?.walletMeta || defaultEvmAddr);

        // ✅ FIX: Use /v1/quote with allowExchanges query parameter (per LIFI documentation)
        const params = new URLSearchParams({
          fromChain: lifiChainId.toString(),
          toChain: lifiChainId.toString(),
          fromToken: fromToken,
          toToken: toToken,
          fromAmount: amount_in_big.toString(),
          fromAddress: userAddr,
          allowExchanges: dexKey,  // ✅ Filter for specific DEX only (e.g., 'odos', 'paraswap')
          slippage: '0.03',
          order: 'RECOMMENDED'
        });

        return {
          url: `https://li.quest/v1/quote?${params.toString()}`,
          method: 'GET',
          headers: {
            'x-lifi-api-key': apiKey
          }
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        // /v1/quote returns a single Step object, not routes array
        if (!response || !response.estimate || !response.estimate.toAmount) {
          throw new Error(`LIFI-${dexTitle}: No valid quote received`);
        }

        const estimate = response.estimate;
        const amount_out = parseFloat(estimate.toAmount) / Math.pow(10, des_output);

        // Get gas cost from estimate
        let gasCostUsd = 0;
        if (estimate.gasCosts && Array.isArray(estimate.gasCosts)) {
          gasCostUsd = estimate.gasCosts.reduce((sum, gc) => sum + parseFloat(gc.amountUSD || 0), 0);
        }
        const FeeSwap = (Number.isFinite(gasCostUsd) && gasCostUsd > 0) ? gasCostUsd : getFeeSwap(chainName);

        // Extract tool name from response for transparency
        const toolUsed = response.tool || response.toolDetails?.key || dexKey;

        console.log(`[LIFI-${dexTitle}] Using ${toolUsed.toUpperCase()} via LIFI: ${amount_out.toFixed(6)} output, gas: $${FeeSwap.toFixed(4)}`);

        // Return single-DEX format (NOT multi-provider)
        return {
          amount_out: amount_out,
          FeeSwap: FeeSwap,
          dexTitle: dexTitle,  // ✅ Show DEX name in title (user selected this DEX)
          routeTool: `${dexTitle} via LIFI`  // ✅ Show provider in tooltip for transparency
        };
      }
    };
  }


  // =============================
  // LIFI Relay Strategy - Special handling for Relay (tool-based, not exchange-based)
  // =============================
  /**
   * Special factory for LIFI Relay strategy
   * Relay is a bridge/routing tool in LIFI, not an exchange aggregator
   * According to user testing, Relay appears in Jumper (LIFI) without any filter
   * So we don't filter by exchanges, just let LIFI optimize routing (which includes Relay)
   */
  function createFilteredLifiRelayStrategy() {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, sc_input_in, sc_output_in, amount_in_big, SavedSettingData, chainName }) => {
        const apiKey = (typeof getRandomApiKeyLIFI === 'function') ? getRandomApiKeyLIFI() : '';

        const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
        const lifiChainId = chainConfig?.LIFI_CHAIN_ID || Number(codeChain);
        const isSolana = String(chainName || '').toLowerCase() === 'solana';

        const fromToken = isSolana ? sc_input_in : sc_input.toLowerCase();
        const toToken = isSolana ? sc_output_in : sc_output.toLowerCase();

        const defaultEvmAddr = '0x0000000000000000000000000000000000000000';
        const defaultSolAddr = 'So11111111111111111111111111111111111111112';
        const userAddr = isSolana
          ? (SavedSettingData?.walletSolana || defaultSolAddr)
          : (SavedSettingData?.walletMeta || defaultEvmAddr);

        // ✅ NO FILTER: Let LIFI optimize routing (Relay will be used if optimal)
        // User confirmed: Relay appears in Jumper without any exchange/tool filter
        const options = {
          slippage: 0.03,
          order: 'RECOMMENDED',
          allowSwitchChain: false
          // NO exchanges filter - Relay is a bridge/routing tool, not an exchange
        };

        const body = {
          fromChainId: lifiChainId,
          toChainId: lifiChainId,
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          fromAmount: amount_in_big.toString(),
          fromAddress: userAddr,
          toAddress: userAddr,
          options: options
        };

        return {
          url: 'https://li.quest/v1/advanced/routes',
          method: 'POST',
          data: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
            'x-lifi-api-key': apiKey
          }
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        const routes = response?.routes;

        if (!routes || !Array.isArray(routes) || routes.length === 0) {
          throw new Error('LIFI-RELAY: No routes found');
        }

        // Get best route (first)
        const bestRoute = routes[0];
        if (!bestRoute || !bestRoute.toAmount) {
          throw new Error('LIFI-RELAY: Invalid route structure');
        }

        const amount_out = parseFloat(bestRoute.toAmount) / Math.pow(10, des_output);
        const gasCostUsd = parseFloat(bestRoute.gasCostUSD || 0);
        const FeeSwap = (Number.isFinite(gasCostUsd) && gasCostUsd > 0) ? gasCostUsd : getFeeSwap(chainName);

        console.log(`[LIFI-RELAY] Using optimized LIFI routing: ${amount_out.toFixed(6)} output, gas: $${FeeSwap.toFixed(4)}`);

        // Return single-DEX format (NOT multi-provider)
        return {
          amount_out: amount_out,
          FeeSwap: FeeSwap,
          dexTitle: 'RELAY',  // ✅ Show DEX name in title (user selected RELAY)
          routeTool: 'RELAY via LIFI'  // ✅ Show provider in tooltip
        };
      }
    };
  }

  // Create filtered LIFI strategies for supported DEX providers
  // Note: LIFI does NOT support Velora (ParaSwap) and Matcha (0x) - removed lifi-velora and lifi-matcha
  dexStrategies['lifi-okx'] = createFilteredLifiStrategy('okx', 'OKX');
  dexStrategies['lifi-sushi'] = createFilteredLifiStrategy('sushiswap', 'SUSHI');
  dexStrategies['lifi-kyber'] = createFilteredLifiStrategy('kyberswap', 'KYBER');
  dexStrategies['lifi-flytrade'] = createFilteredLifiStrategy('fly', 'FLYTRADE');    // ✅ FIXED: LIFI slug is 'fly' not 'flytrade'

  // ✅ Relay uses special factory (tool-based, not exchange-based)
  dexStrategies['lifi-relay'] = createFilteredLifiRelayStrategy();

  // =============================
  // SWOOP Filtered Strategy Factory - SWOOP as REST API Provider
  // =============================
  /**
   * Factory function to create SWOOP filtered strategies for specific DEX providers
   * This converts SWOOP from global fallback into a regular REST API provider
   * with DEX-specific filtering (similar to filtered LIFI)
   */
  function createFilteredSwoopStrategy(aggregatorSlug, dexTitle) {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, des_input, des_output, SavedSettingData }) => {
        /**
         * SWOOP REST API - Aggregator endpoint
         * Endpoint: https://bzvwrjfhuefn.up.railway.app/swap
         *
         * Request body:
         * - chainId: Chain ID number
         * - aggregatorSlug: Target DEX slug (odos, kyberswap, 0x, okx, paraswap)
         * - sender: User wallet address
         * - inToken: { chainId, type: 'TOKEN', address, decimals }
         * - outToken: { chainId, type: 'TOKEN', address, decimals }
         * - amountInWei: Amount in wei (string)
         * - slippageBps: Slippage in basis points (100 = 1%)
         * - gasPriceGwei: Gas price in gwei
         */

        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';
        const gasPrice = (typeof getFromLocalStorage === 'function')
          ? Number(getFromLocalStorage('gasGWEI', 0))
          : 0;

        const body = {
          chainId: Number(codeChain),
          aggregatorSlug: aggregatorSlug,
          sender: userAddr,
          inToken: {
            chainId: Number(codeChain),
            type: 'TOKEN',
            address: sc_input.toLowerCase(),
            decimals: Number(des_input)
          },
          outToken: {
            chainId: Number(codeChain),
            type: 'TOKEN',
            address: sc_output.toLowerCase(),
            decimals: Number(des_output)
          },
          amountInWei: String(amount_in_big),
          slippageBps: '100',  // 1% slippage
          gasPriceGwei: gasPrice
        };

        return {
          url: 'https://bzvwrjfhuefn.up.railway.app/swap',
          method: 'POST',
          data: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json'
          }
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        if (!response || !response.amountOutWei) {
          throw new Error(`SWOOP-${dexTitle}: Invalid response - missing amountOutWei`);
        }

        const amount_out = parseFloat(response.amountOutWei) / Math.pow(10, des_output);
        const FeeSwap = getFeeSwap(chainName);

        console.log(`[SWOOP-${dexTitle}] Using ${dexTitle} via SWOOP: ${amount_out.toFixed(6)} output`);

        return {
          amount_out: amount_out,
          FeeSwap: FeeSwap,
          dexTitle: dexTitle,  // ✅ Show DEX name in title (user selected this DEX)
          routeTool: `${dexTitle} via SWOOP`  // ✅ Show provider in tooltip
        };
      }
    };
  }

  // Create filtered SWOOP strategies for all DEX providers
  dexStrategies['swoop-velora'] = createFilteredSwoopStrategy('paraswap', 'VELORA');   // Velora uses ParaSwap
  dexStrategies['swoop-odos'] = createFilteredSwoopStrategy('odos', 'ODOS');
  dexStrategies['swoop-kyber'] = createFilteredSwoopStrategy('kyberswap', 'KYBER');
  dexStrategies['swoop-matcha'] = createFilteredSwoopStrategy('0x', 'MATCHA');        // Matcha uses 0x
  dexStrategies['swoop-okx'] = createFilteredSwoopStrategy('okx', 'OKX');
  dexStrategies['swoop-sushi'] = createFilteredSwoopStrategy('sushiswap', 'SUSHI');   // If SWOOP supports Sushi

  // =============================
  // DZAP Filtered Strategy Factory - DZAP as REST API Provider
  // =============================
  /**
   * Factory function to create DZAP filtered strategies for specific DEX providers
   * DZAP returns multi-quote response, we filter for specific DEX only
   * 
   * Support matrix:
   * - kyber: ✅ Filter by 'kyberswap' in response
   * - odos: ✅ Filter by 'odos' in response
   * - okx: ✅ Filter by 'okx' in response
   * - matcha: ✅ Filter by '0x' or 'zerox' in response
   * - velora: ✅ Filter by 'paraswap' in response
   * 
   * NOT supported: 1inch, sushi, flytrade (use LIFI instead)
   */
  function createFilteredDzapStrategy(dexKey, dexTitle) {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, SavedSettingData, chainName }) => {
        const chainConfig = (root.CONFIG_CHAINS || {})[String(chainName || '').toLowerCase()];
        const dzapChainId = chainConfig?.DZAP_CHAIN_ID || Number(codeChain);

        const userAddr = SavedSettingData?.walletMeta || '0x0000000000000000000000000000000000000000';

        // DZAP API endpoint
        const params = new URLSearchParams({
          chainId: String(dzapChainId),
          fromTokenAddress: sc_input.toLowerCase(),
          toTokenAddress: sc_output.toLowerCase(),
          amount: String(amount_in_big),
          slippage: '0.5',
          userAddress: userAddr
        });

        return {
          url: `https://api.dzap.io/v1/quote?${params.toString()}`,
          method: 'GET',
          headers: {}
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        // DZAP returns array of quotes from different DEXes
        const quotes = response?.quotes;

        if (!quotes || !Array.isArray(quotes) || quotes.length === 0) {
          throw new Error(`DZAP-${dexTitle}: No quotes found`);
        }

        // Filter for specific DEX only
        const filteredQuote = quotes.find(q => {
          const source = String(q.source || q.dex || q.protocol || '').toLowerCase();
          return source.includes(dexKey.toLowerCase());
        });

        if (!filteredQuote || !filteredQuote.toTokenAmount) {
          throw new Error(`DZAP-${dexTitle}: No ${dexTitle} quote found in response`);
        }

        const amount_out = parseFloat(filteredQuote.toTokenAmount) / Math.pow(10, des_output);
        const gasUsd = parseFloat(filteredQuote.estimatedGas || filteredQuote.gasCostUSD || 0);
        const FeeSwap = (Number.isFinite(gasUsd) && gasUsd > 0) ? gasUsd : getFeeSwap(chainName);

        console.log(`[DZAP-${dexTitle}] Using ${dexTitle} via DZAP: ${amount_out.toFixed(6)} output, gas: $${FeeSwap.toFixed(4)}`);

        return {
          amount_out: amount_out,
          FeeSwap: FeeSwap,
          dexTitle: dexTitle,  // ✅ Show DEX name in title (user selected this DEX)
          routeTool: `${dexTitle} via DZAP`  // ✅ Show provider in tooltip
        };
      }
    };
  }

  // Create filtered DZAP strategies for all supported DEX providers
  dexStrategies['dzap-velora'] = createFilteredDzapStrategy('paraswap', 'VELORA');
  dexStrategies['dzap-odos'] = createFilteredDzapStrategy('odos', 'ODOS');
  dexStrategies['dzap-kyber'] = createFilteredDzapStrategy('kyberswap', 'KYBER');
  dexStrategies['dzap-matcha'] = createFilteredDzapStrategy('zerox', 'MATCHA');  // DZAP uses 'zerox' for 0x/Matcha
  dexStrategies['dzap-okx'] = createFilteredDzapStrategy('okx', 'OKX');

  // =============================
  // SWING Filtered Strategy Factory - SWING as REST API Provider
  // =============================
  /**
   * Factory function to create SWING filtered strategies for specific DEX providers
   * SWING returns multi-quote response, we filter for specific DEX only
   * 
   * Swing API: https://platform.swing.xyz/api/v1/projects/{projectId}/quote
   * 
   * Support matrix:
   * - velora: ✅ Filter by 'paraswap' in response
   * - odos: ✅ Filter by 'odos' in response
   * - kyber: ✅ Filter by 'kyberswap' in response
   * - matcha: ✅ Filter by '0x' or 'zerox' in response
   * - okx: ✅ Filter by 'okx' in response
   */
  function createFilteredSwingStrategy(dexKey, dexTitle) {
    return {
      buildRequest: ({ codeChain, sc_input, sc_output, amount_in_big, chainName }) => {
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
        const wrappedNativeAddresses = {
          '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': '0x0000000000000000000000000000000000000000', // WETH (Ethereum)
          '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': '0x0000000000000000000000000000000000000000', // WBNB (BSC)
          '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': '0x0000000000000000000000000000000000000000', // WMATIC (Polygon)
          '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': '0x0000000000000000000000000000000000000000', // WETH (Arbitrum)
          '0x4200000000000000000000000000000000000006': '0x0000000000000000000000000000000000000000', // WETH (Base/Optimism)
          '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': '0x0000000000000000000000000000000000000000'  // WAVAX (Avalanche)
        };

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

        // Get project ID from secrets.js or use default
        let selectedProjectId = 'galaxy-exchange';
        try {
          if (typeof root !== 'undefined' && typeof root.getRandomSwingProjectId === 'function') {
            selectedProjectId = root.getRandomSwingProjectId();
          } else if (typeof root !== 'undefined' && root.SWING_PROJECT_IDS) {
            const projectIds = root.SWING_PROJECT_IDS;
            const idx = Math.floor(Math.random() * projectIds.length);
            selectedProjectId = projectIds[idx];
          }
        } catch (e) {
          console.warn('[SWING-FILTERED] Failed to get projectId from secrets.js, using default:', e.message);
        }

        return {
          url: `https://platform.swing.xyz/api/v1/projects/${selectedProjectId}/quote?${params.toString()}`,
          method: 'GET',
          headers: {}
        };
      },
      parseResponse: (response, { des_output, chainName }) => {
        // Swing returns array of routes from different DEXes
        const routes = response?.routes;

        if (!routes || !Array.isArray(routes) || routes.length === 0) {
          throw new Error(`SWING-${dexTitle}: No routes found`);
        }

        // Filter for specific DEX only by matching integration name
        const filteredRoute = routes.find(route => {
          const integration = String(route?.quote?.integration || '').toLowerCase();
          return integration.includes(dexKey.toLowerCase());
        });

        if (!filteredRoute || !filteredRoute.quote || !filteredRoute.quote.amount) {
          throw new Error(`SWING-${dexTitle}: No ${dexTitle} route found in response`);
        }

        const amount_out = parseFloat(filteredRoute.quote.amount) / Math.pow(10, des_output);
        const gasUsd = parseFloat(filteredRoute.gasUSD || 0);
        const FeeSwap = (Number.isFinite(gasUsd) && gasUsd > 0) ? gasUsd : getFeeSwap(chainName);

        console.log(`[SWING-${dexTitle}] Using ${dexTitle} via SWING: ${amount_out.toFixed(6)} output, gas: $${FeeSwap.toFixed(4)}`);

        return {
          amount_out: amount_out,
          FeeSwap: FeeSwap,
          dexTitle: dexTitle,  // ✅ Show DEX name in title (user selected this DEX)
          routeTool: `${dexTitle} via SWING`  // ✅ Show provider in tooltip
        };
      }
    };
  }

  // Create filtered SWING strategies for supported DEX providers
  // ✅ FIX: Key must match what SWING API returns in quote.integration field
  dexStrategies['swing-velora'] = createFilteredSwingStrategy('velora', 'VELORA');  // SWING returns 'velora-delta', 'velora' etc
  dexStrategies['swing-odos'] = createFilteredSwingStrategy('odos', 'ODOS');
  dexStrategies['swing-kyber'] = createFilteredSwingStrategy('kyber', 'KYBER');  // SWING returns 'kyberswap' or 'kyber'
  dexStrategies['swing-matcha'] = createFilteredSwingStrategy('0x', 'MATCHA');
  dexStrategies['swing-okx'] = createFilteredSwingStrategy('okx', 'OKX');

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
          const FeeSwap = (Number.isFinite(gasUsd) && gasUsd > 0) ? gasUsd : getFeeSwap(chainName);

          // Get provider name from quote.integration
          const providerName = route.quote.integration || 'Unknown';

          // Format same as single DEX result
          subResults.push({
            amount_out: amount_out,
            FeeSwap: FeeSwap,
            dexTitle: providerName.toUpperCase()
          });
        } catch (e) {
          continue;
        }
      }

      if (subResults.length === 0) {
        throw new Error("No valid Swing routes found");
      }

      // Sort by amount_out (descending) and get top 3
      const maxProviders = (typeof window !== 'undefined' && window.CONFIG_DEXS?.swing?.maxProviders) || 3;
      subResults.sort((a, b) => b.amount_out - a.amount_out);
      const topN = subResults.slice(0, maxProviders);

      console.log(`[SWING] Returning top ${maxProviders} routes from ${subResults.length} available routes`);

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
        slippage: "1", // 1% slippage (Rango uses "1" not "1.0")
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

      // ✅ Use api-edge.rango.exchange (faster endpoint) with API key as query parameter
      let apiUrl = `https://api-edge.rango.exchange/routing/bests?apiKey=${apiKey}`;

      // ✅ CRITICAL: ALWAYS apply CORS proxy for browser requests (same as Rubic)
      try {
        const proxyPrefix = (window.CONFIG_PROXY && window.CONFIG_PROXY.PREFIX) || '';

        if (proxyPrefix && !apiUrl.startsWith(proxyPrefix)) {
          apiUrl = proxyPrefix + apiUrl;
        }
      } catch (e) {
        console.warn('[Rango] Failed to apply proxy:', e.message);
      }

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

      // Sort by amount_out (descending) dan ambil top N sesuai config
      // ⚠️ LIMIT: Rango tampilkan 3 routes (sesuai maxProviders di config.js)
      const maxProviders = (typeof window !== 'undefined' && window.CONFIG_DEXS?.rango?.maxProviders) || 3;
      subResults.sort((a, b) => b.amount_out - a.amount_out);
      const topN = subResults.slice(0, maxProviders);

      console.log(`[RANGO] Returning top ${maxProviders} routes from ${subResults.length} available routes`);

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
        dexTitle: 'JUPITER'
      };
    }
  };

  // =============================
  // DFLOW Strategy - Solana DEX Aggregator
  // =============================
  dexStrategies.dflow = {
    buildRequest: ({ sc_input_in, sc_output_in, amount_in_big }) => {
      // DFlow Quote API endpoint
      // Use original addresses (base58 is case-sensitive for Solana)
      const params = new URLSearchParams({
        inputMint: sc_input_in,
        outputMint: sc_output_in,
        amount: amount_in_big.toString(),
        slippageBps: 'auto' // Auto slippage
      });

      return {
        url: `https://quote-api.dflow.net/quote?${params.toString()}`,
        method: 'GET'
      };
    },
    parseResponse: (response, { des_output }) => {
      // Check for error response
      if (response?.error || response?.errorMessage) {
        throw new Error(response.errorMessage || response.error || 'DFlow API Error');
      }

      // Parse DFlow response
      if (!response?.outAmount) {
        throw new Error("Invalid DFlow response structure");
      }

      const amount_out = parseFloat(response.outAmount) / Math.pow(10, des_output);

      // Parse fees - DFlow doesn't return explicit gas fee, estimate from Solana
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
            // Estimate compute units to SOL (~0.00001 SOL typical)
            const computeUnits = response.simulatedComputeUnits || 300000;
            const estimatedSolFee = (computeUnits / 1e6) * 0.00001 * 5000; // rough estimate
            FeeSwap = estimatedSolFee * solGasInfo.nativeTokenPrice;
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
        dexTitle: 'DFLOW'
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
        maxSlippageBps: '50', // 0.5% max slippage
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

      // Take top 3 quotes for display (like LIFI/DZAP)
      const top3 = quotes.slice(0, 3).map(quote => {
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

      // ✅ Apply CORS proxy to avoid 429/500 errors
      let apiUrl = 'https://api-v2.rubic.exchange/api/routes/quoteAll';

      // Get random proxy from CONFIG_PROXY (defined in config.js)
      try {
        const proxyPrefix = (window.CONFIG_PROXY && window.CONFIG_PROXY.PREFIX) || '';
        if (proxyPrefix && !apiUrl.startsWith('http://') && !apiUrl.startsWith(proxyPrefix)) {
          apiUrl = proxyPrefix + apiUrl;
        }
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
        data: JSON.stringify(requestBody) // ✅ Use 'data' with JSON.stringify, not 'body'
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

      // Take top 3 routes for display (like LIFI/DZAP/Kamino)
      const top3 = routes.slice(0, 3).map((route, idx) => {
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

      // Return multi-DEX format (like LIFI/DZAP/Kamino)
      return {
        subResults: top3,
        isMultiDex: true
      };
    }
  };

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

        // Get fee from route
        const feeUsd = parseFloat(matchedRoute?.feeUsd || matchedRoute?.fee?.amount || 0);
        const FeeSwap = (Number.isFinite(feeUsd) && feeUsd > 0)
          ? feeUsd
          : getFeeSwap(params.chainName);

        console.log(`[RANGO-${dexTitle}] Using ${dexTitle} via RANGO: ${amount_out.toFixed(6)} output`);

        return {
          amount_out,
          FeeSwap,
          dexTitle: dexTitle,  // ✅ Show DEX name in title (user selected this DEX)
          routeTool: `${dexTitle} via RANGO`  // ✅ Show provider in tooltip
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
          routeTool: `${dexTitle} via RUBIC`  // ✅ Show provider in tooltip
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
        mode: 'rotation',
        isRotation: true,
        rotationInfo: { counter: state.counter, used: state.lastUsed }
      };
    }

    // Default fallback (should not reach here)
    return { selectedStrategy: primary, fallbackStrategy: null, mode: 'unknown', isRotation: false };
  }

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

      // ========== CHECK IF META-DEX IS DISABLED ==========
      // Check if this is a meta-aggregator and META_DEX is disabled
      // Note: Filtered strategies (e.g., lifi-odos, dzap-velora) are NOT blocked - only direct meta-aggregator calls
      try {
        const dexConfig = (root.CONFIG_DEXS && root.CONFIG_DEXS[String(dexType).toLowerCase()]) || null;
        const isMetaDex = dexConfig && dexConfig.isMetaDex === true;
        const metaDexEnabled = root.CONFIG_APP && root.CONFIG_APP.APP && root.CONFIG_APP.APP.META_DEX;

        if (isMetaDex && !metaDexEnabled) {
          console.warn(`[META-DEX DISABLED] ${String(dexType).toUpperCase()} is a meta-aggregator but META_DEX is disabled`);
          reject({
            statusCode: 0,
            pesanDEX: `Meta-aggregators are currently disabled (set META_DEX=true to enable)`,
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

          // ✅ CRITICAL FIX: Explicit check for proxy = true
          // If proxy is explicitly set to false, DO NOT use proxy
          // If proxy is undefined or not set, also DO NOT use proxy (default: no proxy)
          // Only use proxy if explicitly set to true
          const useProxy = cfg.proxy === true; // MUST be explicitly true

          const proxyPrefix = (root.CONFIG_PROXY && root.CONFIG_PROXY.PREFIX) ? String(root.CONFIG_PROXY.PREFIX) : '';
          const finalUrl = (useProxy && proxyPrefix && typeof url === 'string' && !url.startsWith(proxyPrefix)) ? (proxyPrefix + url) : url;

          // Debug logging for proxy configuration
          console.log(`[${dexType.toUpperCase()} PROXY]`, {
            dexType,
            configExists: !!root.CONFIG_DEXS?.[dexType],
            proxyValueInConfig: cfg.proxy,
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
              // ✅ ENHANCEMENT: Fallback juga gagal - enhance error dengan info kedua strategy
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
              const e2Code = Number(e2 && e2.statusCode) || 0;
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
                primaryStrategy: selectedStrategy,     // ✅ NEW: Primary strategy yang dicoba
                primaryProvider: primaryName,          // ✅ NEW: Primary provider name
                primaryError: e1Msg,                   // ✅ NEW: Primary error message
                primaryCode: e1Code,                   // ✅ NEW: Primary error code
                fallbackStrategy: computedFallback,    // ✅ NEW: Fallback strategy yang dicoba
                fallbackProvider: fallbackName,        // ✅ NEW: Fallback provider name
                fallbackError: e2Msg,                  // ✅ NEW: Fallback error message
                fallbackCode: e2Code,                  // ✅ NEW: Fallback error code
                bothFailed: true                       // ✅ NEW: Flag untuk indicate both failed
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
          slippageBps: '100', gasPriceGwei: Number(getFromLocalStorage('gasGWEI', 0)),
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
            slippage: 0.3, // Nilai slippage default
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

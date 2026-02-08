// ============================================
// KALKULATOR CRYPTO
// ============================================

(function() {
    'use strict';

    // Rate prices object
    var ratePrice = {
        usdt: 1,
        idr: 0,
        btc: 0,
        eth: 0,
        bnb: 0,
        random1: 0 // Custom token rate
    };

    // Fungsi untuk memformat IDR dengan pemisah ribuan
    function formatIDR(value) {
        return new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    // Fetch initial rates
    function fetchRates() {
        $.when(
            $.getJSON("https://api-gcp.binance.com/api/v3/ticker/price?symbols=[%22BTCUSDT%22,%22ETHUSDT%22,%22BNBUSDT%22,%22POLUSDT%22,%22AVAXUSDT%22,%22SOLUSDT%22]"),
            $.getJSON("https://cors-proxy-rosy.vercel.app/api/proxy?url=https://indodax.com/api/ticker/USDTIDR")
        ).done(function (binanceResponse, indodaxResponse) {
            binanceResponse[0].forEach((res) => {
                switch (res.symbol) {
                    case "BTCUSDT": ratePrice.btc = parseFloat(res.price); break;
                    case "ETHUSDT": ratePrice.eth = parseFloat(res.price); break;
                    case "BNBUSDT": ratePrice.bnb = parseFloat(res.price); break;
                    case "POLUSDT": ratePrice.pol = parseFloat(res.price); break;
                    case "AVAXUSDT": ratePrice.avax = parseFloat(res.price); break;
                    case "SOLUSDT": ratePrice.sol = parseFloat(res.price); break;
                }
            });
            ratePrice.idr = parseFloat(indodaxResponse[0].ticker.last);
            // Also store to localStorage for consistency
            localStorage.setItem('MULTI_USDTRate', ratePrice.idr);
            console.log('✅ IDR rate updated:', ratePrice.idr);
        }).fail(function (error) {
            console.log("-----------------------");
            console.log(error);
            // Fallback: load from localStorage if fetch fails
            const storedRate = parseFloat(localStorage.getItem('MULTI_USDTRate')) || 0;
            if (storedRate > 0) {
                ratePrice.idr = storedRate;
                console.log('ℹ️ Using stored IDR rate:', ratePrice.idr);
            }
        });
    }

    // Update price button handler
    $("#updatePriceBtn").on("click", function() {
        fetchRates();

        var symbol1 = $("#random1symbol").val().toUpperCase().trim();
        if (symbol1) {
            $.getJSON("https://api-gcp.binance.com/api/v3/ticker/price?symbol=" + symbol1 + "USDT")
                .done(function(response) {
                    ratePrice.random1 = parseFloat(response.price);
                    $("#random1price").prop("readonly", false).val(ratePrice.random1.toFixed(8));
                    if (typeof toast !== 'undefined' && toast.info) toast.info("Token " + symbol1 + " = $" + ratePrice.random1.toFixed(4));
                })
                .fail(function() {
                    if (typeof toast !== 'undefined' && toast.error) toast.error("Token tidak ditemukan.");
                    ratePrice.random1 = 0;
                    $("#random1price").prop("readonly", true).val('');
                });
        }

        if (typeof toast !== 'undefined' && toast.info) toast.info("Harga crypto berhasil diperbarui!");
    });

    // Check custom token price
    $("#cekTokensBtn").on("click", function () {
        var symbol1 = $("#random1symbol").val().toUpperCase().trim();
        if (!symbol1) {
            if (typeof toast !== 'undefined' && toast.error) toast.error("Masukkan simbol untuk custom token.");
            return;
        }

        $.getJSON("https://api-gcp.binance.com/api/v3/ticker/price?symbol=" + symbol1 + "USDT")
            .done(function (response) {
                ratePrice.random1 = parseFloat(response.price);
                $("#random1price").prop("readonly", false).val(ratePrice.random1.toFixed(8));
                if (typeof toast !== 'undefined' && toast.info) toast.info("Token ditemukan: " + symbol1 + " = $" + ratePrice.random1.toFixed(4));
            })
            .fail(function () {
                if (typeof toast !== 'undefined' && toast.error) toast.error("Token tidak ditemukan di Binance.");
                ratePrice.random1 = 0;
                $("#random1price").prop("readonly", true).val('');
            });
    });

    // Convert input dynamically
    function convertFromInput(base) {
        const baseValue = parseFloat($("#" + base + "price").val());
        if (isNaN(baseValue) || baseValue <= 0) {
            // Clear all inputs if invalid
            if (isNaN(baseValue)) {
                clearAllInputs();
            }
            return;
        }

        var updatedPrices = {};
        switch (base) {
            case "usdt":
                updatedPrices = {
                    usdt: baseValue,
                    idr: baseValue * ratePrice.idr,
                    btc: ratePrice.btc > 0 ? baseValue / ratePrice.btc : 0,
                    eth: ratePrice.eth > 0 ? baseValue / ratePrice.eth : 0,
                    bnb: ratePrice.bnb > 0 ? baseValue / ratePrice.bnb : 0,
                    random1: ratePrice.random1 > 0 ? baseValue / ratePrice.random1 : 0
                };
                break;
            case "idr":
                updatedPrices = {
                    usdt: ratePrice.idr > 0 ? baseValue / ratePrice.idr : 0,
                    idr: baseValue,
                    btc: (ratePrice.idr > 0 && ratePrice.btc > 0) ? (baseValue / ratePrice.idr) / ratePrice.btc : 0,
                    eth: (ratePrice.idr > 0 && ratePrice.eth > 0) ? (baseValue / ratePrice.idr) / ratePrice.eth : 0,
                    bnb: (ratePrice.idr > 0 && ratePrice.bnb > 0) ? (baseValue / ratePrice.idr) / ratePrice.bnb : 0,
                    random1: (ratePrice.idr > 0 && ratePrice.random1 > 0) ? (baseValue / ratePrice.idr) / ratePrice.random1 : 0
                };
                break;
            case "btc":
                updatedPrices = {
                    usdt: baseValue * ratePrice.btc,
                    idr: baseValue * ratePrice.btc * ratePrice.idr,
                    btc: baseValue,
                    eth: ratePrice.eth > 0 ? baseValue * ratePrice.btc / ratePrice.eth : 0,
                    bnb: ratePrice.bnb > 0 ? baseValue * ratePrice.btc / ratePrice.bnb : 0,
                    random1: ratePrice.random1 > 0 ? baseValue * ratePrice.btc / ratePrice.random1 : 0
                };
                break;
            case "eth":
                updatedPrices = {
                    usdt: baseValue * ratePrice.eth,
                    idr: baseValue * ratePrice.eth * ratePrice.idr,
                    btc: ratePrice.btc > 0 ? baseValue * ratePrice.eth / ratePrice.btc : 0,
                    eth: baseValue,
                    bnb: ratePrice.bnb > 0 ? baseValue * ratePrice.eth / ratePrice.bnb : 0,
                    random1: ratePrice.random1 > 0 ? baseValue * ratePrice.eth / ratePrice.random1 : 0
                };
                break;
            case "bnb":
                updatedPrices = {
                    usdt: baseValue * ratePrice.bnb,
                    idr: baseValue * ratePrice.bnb * ratePrice.idr,
                    btc: ratePrice.btc > 0 ? baseValue * ratePrice.bnb / ratePrice.btc : 0,
                    eth: ratePrice.eth > 0 ? baseValue * ratePrice.bnb / ratePrice.eth : 0,
                    bnb: baseValue,
                    random1: ratePrice.random1 > 0 ? baseValue * ratePrice.bnb / ratePrice.random1 : 0
                };
                break;
            case "random1":
                if (ratePrice.random1 === 0) return;
                updatedPrices = {
                    usdt: baseValue * ratePrice.random1,
                    idr: baseValue * ratePrice.random1 * ratePrice.idr,
                    btc: ratePrice.btc > 0 ? (baseValue * ratePrice.random1) / ratePrice.btc : 0,
                    eth: ratePrice.eth > 0 ? (baseValue * ratePrice.random1) / ratePrice.eth : 0,
                    bnb: ratePrice.bnb > 0 ? (baseValue * ratePrice.random1) / ratePrice.bnb : 0,
                    random1: baseValue
                };
                break;
        }

        // Update input fields
        updatePrices(updatedPrices, base);
    }

    // Clear all inputs
    function clearAllInputs() {
        $('#usdtprice, #idrprice, #btcprice, #ethprice, #bnbprice, #random1price').val('');
    }

    // Attach input event listeners
    $('#usdtprice').on('input', function() { convertFromInput('usdt'); });
    $('#idrprice').on('input', function() { convertFromInput('idr'); });
    $('#btcprice').on('input', function() { convertFromInput('btc'); });
    $('#ethprice').on('input', function() { convertFromInput('eth'); });
    $('#bnbprice').on('input', function() { convertFromInput('bnb'); });
    $('#random1price').on('input', function() {
        if (!$(this).prop('readonly')) {
            convertFromInput('random1');
        }
    });

    // Update input fields
    function updatePrices(prices, excludeBase) {
        $.each(prices, function (key, value) {
            if (key !== excludeBase) {
                if (!value || value === 0) {
                    $("#" + key + "price").val('');
                } else {
                    // Format based on value size
                    let formattedValue;
                    if (key === "idr") {
                        // IDR: show as integer
                        formattedValue = Math.round(value);
                    } else if (value >= 1) {
                        // Large values: 2-4 decimals
                        formattedValue = value.toFixed(Math.min(4, 2));
                    } else if (value >= 0.01) {
                        // Medium values: 4 decimals
                        formattedValue = value.toFixed(4);
                    } else {
                        // Small values: 8 decimals
                        formattedValue = value.toFixed(8);
                    }
                    $("#" + key + "price").val(formattedValue);
                }
            }
        });
    }

    // Function to enable all calculator inputs
    function enableCalculatorInputs() {
        $('#calculator-modal').find('input, select, button, textarea').prop('disabled', false);
        $('#random1price').prop('readonly', true); // Keep readonly by default until token checked
        console.log('✅ Calculator inputs enabled');
    }

    // Open calculator modal handler - Always active, even during scan
    // Using event delegation to ensure it works even if icon is dynamically loaded
    $(document).on('click', '#openCalculatorModal', function(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        try {
            // Force enable all inputs before showing modal
            enableCalculatorInputs();
            UIkit.modal('#calculator-modal').show();
            console.log('✅ Calculator modal opened');
        } catch (error) {
            console.error('❌ Error opening calculator modal:', error);
            alert('Gagal membuka kalkulator. Silakan refresh halaman.');
        }

        return false;
    });

    // Additional direct event listener for immediate binding
    $('#openCalculatorModal').on('click', function(event) {
        event.preventDefault();
        event.stopPropagation();

        try {
            // Force enable all inputs before showing modal
            enableCalculatorInputs();
            UIkit.modal('#calculator-modal').show();
            console.log('✅ Calculator modal opened (direct handler)');
        } catch (error) {
            console.error('❌ Error opening calculator modal:', error);
        }

        return false;
    });

    // Also enable inputs when modal is shown (UIkit event)
    UIkit.util.on('#calculator-modal', 'shown', function () {
        enableCalculatorInputs();
        console.log('✅ Calculator modal shown - inputs enabled');
    });

    // Load IDR rate from localStorage on initialization
    const storedIDRRate = parseFloat(localStorage.getItem('MULTI_USDTRate')) || 0;
    if (storedIDRRate > 0) {
        ratePrice.idr = storedIDRRate;
        console.log('✅ Loaded stored IDR rate on init:', ratePrice.idr);
    }

    // Fetch rates on initialization
    fetchRates();

    // Keyboard shortcut: Ctrl+K or Cmd+K to open calculator
    $(document).on('keydown', function(event) {
        // Check for Ctrl+K (Windows/Linux) or Cmd+K (Mac)
        if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
            event.preventDefault();
            event.stopPropagation();
            UIkit.modal('#calculator-modal').show();
            console.log('✅ Calculator opened via keyboard shortcut (Ctrl/Cmd+K)');
            return false;
        }
    });

    console.log('✅ Calculator Crypto module loaded. Press Ctrl+K (or Cmd+K) to open calculator.');

})();

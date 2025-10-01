// TradingViewAccountChart.jsx
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { fetchChartingData, fetchDropdownValuesAPI } from '../../actioncreators/actioncreators';

const TradingViewAccountChart = ({ accountNo, accountType, onAccountNoChange }) => {
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [hasData, setHasData] = useState(false);
    const [accountOptions, setAccountOptions] = useState([]);
    const [widget, setWidget] = useState(null);
    const containerRef = useRef(null);

    useEffect(() => {
        const loadTradingViewScript = () => {
            return new Promise((resolve) => {
                if (window.TradingView) {
                    setIsScriptLoaded(true);
                    resolve();
                    return;
                }

                const script = document.createElement('script');
                script.id = 'tradingview-widget-script-account';
                script.type = 'text/javascript';
                script.src = '/charting_library/charting_library.js';
                script.async = true;
                script.onload = () => {
                    setIsScriptLoaded(true);
                    resolve();
                };
                script.onerror = () => {
                    // Try loading from absolute path as fallback
                    script.src = 'https://sb.stanli.ai/charting_library/charting_library.js';
                    document.head.appendChild(script);
                };
                document.head.appendChild(script);
            });
        };

        loadTradingViewScript();

        return () => {
            const script = document.getElementById('tradingview-widget-script-account');
            if (script) {
                document.head.removeChild(script);
            }
            if (widget) {
                widget.remove();
            }
        };
    }, []);

    // Fetch account options when accountType changes
    useEffect(() => {
        const fetchAccountOptions = async () => {
            if (!accountType) return;
            
            try {
                const payload = {
                    "entity_type": "accounts",
                    "columns": ["accounts.account_no"],
                    "parameter": [
                        {
                            "columnName": "accounts.account_type",
                            "condition": "=",
                            "value": accountType
                        }
                    ]
                };
                
                const response = await fetchDropdownValuesAPI(payload);
                const list = response.list || [];
                
                const options = list
                    .filter(item => item.account_no)
                    .map(item => ({
                        value: item.account_no,
                        label: item.account_no
                    }));
                
                setAccountOptions(options);
            } catch (error) {
                console.error("Error fetching account options:", error);
                setAccountOptions([]);
            }
        };

        fetchAccountOptions();
    }, [accountType]);

    useEffect(() => {
        if (!isScriptLoaded || !containerRef.current || !window.TradingView || !accountNo) {
            return;
        }

        const checkDataAndCreateWidget = async () => {
            setIsLoading(true);
            try {
                // Check if data exists for this account
                const now = Math.floor(Date.now() / 1000);
                const oneMonthAgo = now - (30 * 24 * 60 * 60); // 30 days ago

                const responseData = await fetchChartingData(accountNo, oneMonthAgo, now, '1D');

                if (!responseData.data || responseData.data.length === 0) {
                    setHasData(false);
                    setIsLoading(false);
                    return;
                }

                setHasData(true);

                // Create the widget if data exists
                if (!containerRef.current.id) {
                    containerRef.current.id = `tv_chart_container_account_${Date.now()}`;
                }

                // Clean up existing widget
                if (widget) {
                    widget.remove();
                }

                const customDatafeed = {
                    onReady: (callback) => {
                        setTimeout(() => callback({
                            supported_resolutions: ['1D', '1W', '1M'],
                            exchanges: [{ value: 'LOCAL', name: 'Local Data', desc: 'Local Data' }],
                            symbols_types: [{ name: 'financial', value: 'financial' }]
                        }), 0);
                    },
                    resolveSymbol: (symbolName, onSymbolResolvedCallback) => {
                        const symbolInfo = {
                            ticker: symbolName,
                            name: symbolName,
                            description: `Account ${symbolName}`,
                            type: 'financial',
                            session: '24x7',
                            timezone: 'Etc/UTC',
                            exchange: 'LOCAL',
                            minmov: 1,
                            pricescale: 100,
                            has_intraday: true,
                            visible_plots_set: 'ohlc',
                            has_weekly_and_monthly: true,
                            supported_resolutions: ['1D', '1W', '1M'],
                            volume_precision: 2,
                            supports_search: true, // Enable search
                            data_status: 'streaming'
                        };
                        setTimeout(() => onSymbolResolvedCallback(symbolInfo), 0);
                    },
                    getBars: async (symbolInfo, resolution, { from, to }, onHistoryCallback, onErrorCallback) => {
                        try {
                            const responseData = await fetchChartingData(symbolInfo.name, from, to, resolution);

                            if (responseData.data.length === 0) {
                                onHistoryCallback([], { noData: true, nextTime: responseData.nextTime });
                                return;
                            }

                            const bars = responseData.data.map(item => ({
                                time: item.timestamp * 1000,
                                open: item.open,
                                high: item.high,
                                low: item.low,
                                close: item.close,
                                volume: item.volume
                            }));

                            if (bars.length === 0) {
                                onHistoryCallback([], { noData: true, nextTime: responseData.nextTime });
                            } else {
                                onHistoryCallback(bars, { noData: false });
                            }
                        } catch (error) {
                            console.error('[getBars]: Error:', error);
                            onErrorCallback(error);
                        }
                    },
                    searchSymbols: async (userInput, exchange, symbolType, onResultReadyCallback) => {
                        try {
                            // Filter account options based on user input
                            const filteredAccounts = accountOptions.filter(option =>
                                option.value.toLowerCase().includes(userInput.toLowerCase()) ||
                                option.label.toLowerCase().includes(userInput.toLowerCase())
                            );

                            const results = filteredAccounts.map(option => ({
                                symbol: option.value,
                                full_name: option.value,
                                description: `Account ${option.value}`,
                                exchange: 'LOCAL',
                                type: 'financial',
                                ticker: option.value
                            }));

                            onResultReadyCallback(results);
                        } catch (error) {
                            console.error('[searchSymbols]: Error:', error);
                            onResultReadyCallback([]);
                        }
                    },
                    subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscribeUID, onResetCacheNeededCallback) => {
                        onResetCacheNeededCallback();
                    },
                    unsubscribeBars: (subscriberUID) => {
                        // No implementation needed
                    }
                };

                const newWidget = new window.TradingView.widget({
                    symbol: accountNo,
                    interval: "1D",
                    fullscreen: false,
                    container: containerRef.current.id,
                    datafeed: customDatafeed,
                    library_path: '/charting_library/',
                    locale: "en",
                    timezone: "Etc/UTC",
                    enabled_features: [
                        "header_widget_dom_node",
                        "header_saveload",
                        "header_quick_search",
                        "header_screenshot",
                        "header_settings",
                        "header_chart_type",
                        "header_indicators",
                        "header_undo_redo",
                        "header_symbol_search"
                    ],
                    disabled_features: [
                        "left_toolbar",
                        "header_compare"
                    ],
                    charts_storage_url: 'https://saveload.tradingview.com',
                    client_id: 'tradingview.com',
                    user_id: 'public_user_id',
                    theme: "Dark",
                    autosize: true,
                    loading_screen: { backgroundColor: "#23272f" }
                });

                newWidget.onChartReady(() => {
                    setIsLoading(false);
                    newWidget.activeChart().setChartType(1);
                    
                    // Listen for symbol change events
                    newWidget.chart().onSymbolChanged().subscribe(null, (newSymbol) => {
                        // Notify parent component about the symbol change
                        if (onAccountNoChange && newSymbol && newSymbol.name !== accountNo) {
                            onAccountNoChange(newSymbol.name);
                        }
                    });
                });

                setWidget(newWidget);

            } catch (error) {
                console.error('Error creating widget:', error);
                setHasData(false);
                setIsLoading(false);
            }
        };

        checkDataAndCreateWidget();

        return () => {
            // Clean up any existing widget
            if (widget) {
                widget.remove();
            }
        };
    }, [isScriptLoaded, accountNo, accountOptions, accountType]);

    return (
        <div style={{ height: '100%', width: '100%', position: 'relative' }}>
            {isLoading && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        fontSize: '1.2rem',
                        borderRadius: '10px',
                        zIndex: 10
                    }}
                >
                    Loading Account Data...
                </div>
            )}
            
            {!hasData && !isLoading && (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: 'var(--primary-bg, #23272f)',
                        color: 'var(--text-secondary, #888)',
                        fontSize: '1.5rem',
                        fontWeight: 600,
                        borderRadius: '10px'
                    }}
                >
                    No data available
                </div>
            )}
            
            <div
                ref={containerRef}
                style={{
                    height: '100%',
                    width: '100%',
                    borderRadius: '10px',
                    display: hasData ? 'block' : 'none'
                }}
            />
        </div>
    );
};

TradingViewAccountChart.propTypes = {
    accountNo: PropTypes.string,
    accountType: PropTypes.string,
    onAccountNoChange: PropTypes.func
};

export default TradingViewAccountChart;
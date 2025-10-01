import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios'; // Add this line
import { fetchInitialData, fetchAccountNumbers, fetchChartingData } from '../../actioncreators/actioncreators'; // Update import

const TradingViewChartAccPreview = ({ setChartInstance, onChartReady, isFromDecisionMatrix, accountNo = false }) => {
    const [tvWidget, setTvWidget] = useState(null);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const [defaultSymbol, setDefaultSymbol] = useState(null);
    const [, setIsChartReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);  // Add this line
    const [, setInitialDataLoaded] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const loadTradingViewScript = () => {
            return new Promise((resolve) => {
                if (window.TradingView) {
                    console.log('TradingView already loaded');
                    setIsScriptLoaded(true);
                    resolve();
                    return;
                }

                const script = document.createElement('script');
                script.id = 'tradingview-widget-script';
                script.type = 'text/javascript';
                script.src = '/charting_library/charting_library.js';
                script.async = true;
                script.onload = () => {
                    console.log('TradingView script loaded successfully');
                    setIsScriptLoaded(true);
                    resolve();
                };
                script.onerror = (error) => {
                    console.error('Error loading TradingView script:', error);
                    console.log('Attempting to load from absolute path');
                    // Try loading from absolute path as fallback
                    script.src = 'https://sb.stanli.ai/charting_library/charting_library.js';
                    resolve();
                };
                document.head.appendChild(script);
            });
        };

        loadTradingViewScript();

        return () => {
            const script = document.getElementById('tradingview-widget-script');
            if (script) {
                document.head.removeChild(script);
            }
        };
    }, []);

    useEffect(() => {
        if (!isScriptLoaded || !containerRef.current || !window.TradingView) {
            setIsLoading(true);  // Add this line
            console.log('Dependencies not ready:', {
                isScriptLoaded,
                hasContainer: !!containerRef.current,
                hasTradingView: !!window.TradingView
            });
            return;
        }

        // Ensure container is ready
        if (!containerRef.current.id) {
            containerRef.current.id = `tv_chart_container_${Date.now()}`;
        }

        const createWidget = async () => {
            setIsLoading(true);  // Add this line
            try {
                // First fetch default symbol if needed
                let symbolToUse = accountNo;
                if (!symbolToUse && !defaultSymbol) {
                    const accountNumbers = await fetchAccountNumbers();
                    if (accountNumbers && accountNumbers.length > 0) {
                        symbolToUse = accountNumbers[0];
                        setDefaultSymbol(symbolToUse);
                    } else {
                        throw new Error('No account numbers available');
                    }
                }

                if (!symbolToUse && defaultSymbol) {
                    symbolToUse = defaultSymbol;
                }

                if (!symbolToUse) {
                    throw new Error('No symbol available');
                }

                // Pre-fetch initial data
                const dataLoaded = await fetchInitialData(symbolToUse);
                if (!dataLoaded) {
                    console.warn('No initial data available for', symbolToUse);
                    setIsLoading(false);
                    return;
                }

                const customDatafeed = {
                    onReady: (callback) => {
                        console.log('[onReady]: Method call');
                        setTimeout(() => callback({
                            supported_resolutions: [ '1D','1W', '1M'],
                            exchanges: [{ value: 'LOCAL', name: 'Local Data', desc: 'Local Data' }],
                            symbols_types: [{ name: 'financial', value: 'financial' }]
                        }), 0);
                    },
                    searchSymbols: async (userInput, exchange, symbolType, onResultReadyCallback) => {
                        console.log('[searchSymbols]: Method call', userInput, exchange, symbolType);
                        try {
                            const accountNumbers = await fetchAccountNumbers();
                            console.log('Account numbers received:', accountNumbers);
                            const filteredSymbols = accountNumbers
                                .filter(account_no => account_no.toLowerCase().includes(userInput.toLowerCase()))
                                .map(account_no => ({
                                    symbol: account_no,
                                    full_name: `Account ${account_no}`,
                                    description: `Account ${account_no}`,
                                    exchange: 'Accounts',
                                    ticker: account_no,
                                    type: 'financial'
                                }));
                            onResultReadyCallback(filteredSymbols);
                        } catch (error) {
                            console.error('Error fetching account numbers:', error);
                            onResultReadyCallback([]);
                        }
                    },
                    resolveSymbol: (symbolName, onSymbolResolvedCallback) => {
                        console.log('[resolveSymbol]: Method call', symbolName);

                        const symbolToResolve = symbolName || symbolToUse;

                        const symbolInfo = {
                            ticker: symbolToResolve,
                            name: symbolToResolve,
                            // debug: true,
                            description: `Account ${symbolToResolve}`,
                            type: 'financial',
                            session: '24x7',
                            timezone: 'Etc/UTC',
                            exchange: 'LOCAL',
                            minmov: 1,
                            pricescale: 100,
                            has_intraday: true,
                            visible_plots_set: 'ohlc',
                            has_weekly_and_monthly: true,
                            supported_resolutions: [ '1D','1W', '1M'],
                            volume_precision: 2,
                            supports_search: true,
                            data_status: 'streaming'
                        };
                        setTimeout(() => onSymbolResolvedCallback(symbolInfo), 0);
                    },
                    getBars: async (symbolInfo, resolution, { from, to }, onHistoryCallback, onErrorCallback) => {
                        console.log('[getBars]: Method call', symbolInfo, resolution, from, to);

                        try {
                            const responseData = await fetchChartingData(symbolInfo.ticker, from, to, resolution);
                            console.warn("responseData", responseData)
                            if (responseData.data.length === 0) {
                                console.warn('No data received from server');
                                console.warn("nextTime 1", responseData.nextTime)
                                if (responseData.nextTime != null){
                                    onHistoryCallback([], {noData: true, nextTime: responseData.nextTime });

                                } else{
                                    onHistoryCallback([], { noData: true, nextTime: responseData.nextTime });
                                }
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

                            console.info("bars.length", bars.length);
                            console.warn("responseData", responseData);
                            if (bars.length === 0) {
                                console.info("No bars found");
                                console.warn("nextTime 2", responseData.nextTime)

                                if (responseData.nextTime != null){
                                    onHistoryCallback([], {noData: true, nextTime: responseData.nextTime });
                                } else{
                                    onHistoryCallback([], { noData: true, nextTime: responseData.nextTime });
                                }
                            } else {
                                onHistoryCallback(bars, { noData: false });
                            }
                        } catch (error) {
                            console.error('[getBars]: Error:', error);
                            onErrorCallback(error);
                        }
                    },

                    subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscribeUID, onResetCacheNeededCallback) => {
                        console.log('[subscribeBars]: Method call', symbolInfo, resolution, subscribeUID);
                        onResetCacheNeededCallback();
                    },
                    unsubscribeBars: (subscriberUID) => {
                        console.log('[unsubscribeBars]: Method call', subscriberUID);
                    }
                };

                const widget = new window.TradingView.widget({
                    symbol: symbolToUse,
                    interval: "1D",
                    // debug: true,
                    fullscreen: false,
                    container: containerRef.current.id,
                    datafeed: customDatafeed,
                    library_path: '/charting_library/',
                    locale: "en",
                    timezone: "Etc/UTC",
                    enabled_features: [
                        "symbol_search_hot_key",
                        "screenshot",
                        "use_localstorage_for_settings",
                        "custom_resolutions",
                        "use_custom_resolutions",
                        "save_shortcut" ,
                        "header_widget_dom_node",
                        "header_saveload",
                        "header_quick_search",
                        "header_screenshot",
                        "header_settings",
                        "header_chart_type",
                        "header_indicators",
                        "header_undo_redo",
                        "header_symbol_search",
                        "header_compare"
                    ],
                    disabled_features: [
                        // "save_shortcut" ,
                        // "header_widget_dom_node",
                        // "header_saveload",  // Ensure this line is present
                        // "left_toolbar",
                        // "header_quick_search",
                        // "header_screenshot",
                        // "header_settings",
                        // "header_chart_type",
                        // "header_indicators",
                        // "header_undo_redo",
                        // "header_symbol_search",
                        // "header_compare"
                    ],
                    charts_storage_url: 'https://saveload.tradingview.com',
                    client_id: 'tradingview.com',
                    user_id: 'public_user_id',
                    theme: "Dark",
                    autosize: true,
                });

                widget.onChartReady(() => {
                    console.log("Chart is ready");
                    setIsChartReady(true);
                    setIsLoading(false);  // Add this line
                    setChartInstance?.(widget);
                    onChartReady?.(widget);
                    widget.activeChart().setChartType(1)
                    if (isFromDecisionMatrix) {
                        widget.activeChart().setChartType(3);
                    }
                });

                setTvWidget(widget);
            } catch (error) {
                console.error('Error creating widget:', error);
                setIsLoading(false);  // Add this line
            }
        };

        createWidget();

        return () => {
            if (tvWidget) {
                tvWidget.remove();
                setTvWidget(null);
            }
        };
    }, [isScriptLoaded, accountNo, defaultSymbol, setChartInstance, onChartReady, isFromDecisionMatrix]);

    return (
        <div className='p-0 m-0' style={{  height: '80vh', width: '100%' }}>
            <div
                ref={containerRef}
                id="tv_chart_container"
                style={{
                    height: '100%',
                    width: '100%',
                    borderRadius: '10px',
                }}
                className='p-0 m-0'
            />
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
                    }}
                >
                    Loading Account Data...
                </div>
            )}
        </div>
    );
};

TradingViewChartAccPreview.propTypes = {
    setChartInstance: PropTypes.func,
    onChartReady: PropTypes.func,
    isFromDecisionMatrix: PropTypes.bool,
    accountNo: PropTypes.oneOfType([PropTypes.string, PropTypes.bool])
};

export default TradingViewChartAccPreview;

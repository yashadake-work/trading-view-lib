import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { fetchInitialData, fetchAccountNumbers, fetchChartingData } from '../../actioncreators/actioncreators';

const TradingViewChart = ({ setChartInstance, onChartReady, isFromDecisionMatrix, accountNo = false }) => {
    const [tvWidget, setTvWidget] = useState(null);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);
    const [defaultSymbol, setDefaultSymbol] = useState(null);
    const [, setIsChartReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [, setInitialDataLoaded] = useState(false);
    const containerRef = useRef(null);

    // Custom tooltip mappings
    const customTooltips = {
        // Fibonacci Tools
        'fib-retracement': 'Forecast Reversal - Identify potential price reversal levels',
        'fib-extension': 'Extension Forecast - Project future price targets',
        'fib-channel': 'Forecast Channel - Track price within parallel channels',
        'fib-speed-resistance-fan': 'Speed Fan - Measure momentum and resistance',
        'fib-timezone': 'Time Zones - Predict time-based reversals',
        'fib-circles': 'Price Circles - Circular price projection tool',
        
        // Trend Tools
        'trend-line': 'Trend Indicator - Draw support and resistance trends',
        'horz-line': 'Support/Resistance Line - Mark key price levels',
        'vert-line': 'Vertical Marker - Mark important time events',
        'ray': 'Direction Ray - Extend trend line infinitely',
        'arrow': 'Price Arrow - Point to key price movements',
        'extended': 'Extended Line - Line that extends both directions',
        
        // Shapes
        'rectangle': 'Price Box - Highlight important price zones',
        'circle': 'Price Circle - Draw circular price patterns',
        'ellipse': 'Price Oval - Identify elliptical patterns',
        'triangle': 'Triangle Pattern - Mark triangle formations',
        'polyline': 'Multi-Point Line - Connect multiple points',
        
        // Pitchfork
        'pitchfork': 'Andrews Tool - Advanced pitchfork analysis',
        'schiff-pitchfork': 'Schiff Tool - Modified pitchfork method',
        
        // Gann Tools
        'gann-square': 'Gann Grid - Time and price square analysis',
        'gann-fan': 'Gann Angles - Geometric angle analysis',
        'gann-box': 'Gann Box - Square of 9 analysis',
        
        // Annotations
        'text': 'Note - Add custom text annotations',
        'balloon': 'Callout - Add speech bubble comments',
        'price-label': 'Price Label - Label specific price points',
        'price-note': 'Price Note - Detailed price annotations',
        'arrow-marker': 'Arrow Marker - Mark important points with arrows',
        'flag': 'Flag Marker - Flag significant events',
        
        // Other Tools
        'brush': 'Highlighter - Highlight important areas',
        'regression': 'Trend Regression - Statistical trend analysis',
        'curve': 'Curve Tool - Draw curved trend lines',
        'parallel-channel': 'Parallel Channel - Draw parallel trend channels',
    };

    // Function to add custom tooltips to drawing tools
    const addCustomTooltips = () => {
        try {
            // Wait a bit for TradingView UI to fully render
            setTimeout(() => {
                // Find all drawing tool buttons in the left toolbar
                const toolbar = containerRef.current?.querySelector('[data-name="base"]') || 
                               containerRef.current?.querySelector('.chart-controls-bar') ||
                               containerRef.current;
                
                if (!toolbar) {
                    console.log('Toolbar not found, retrying...');
                    setTimeout(addCustomTooltips, 1000);
                    return;
                }

                // Find all buttons and SVG elements that might be tools
                const toolButtons = toolbar.querySelectorAll('button, div[role="button"], [data-name]');
                
                toolButtons.forEach(button => {
                    // Get button attributes that might indicate the tool type
                    const dataName = button.getAttribute('data-name');
                    const dataTooltip = button.getAttribute('data-tooltip');
                    const ariaLabel = button.getAttribute('aria-label');
                    const title = button.getAttribute('title');
                    
                    // Check against our custom tooltips
                    Object.entries(customTooltips).forEach(([key, customTooltip]) => {
                        const searchText = (dataName + dataTooltip + ariaLabel + title).toLowerCase();
                        
                        // Match tool names (flexible matching)
                        if (searchText.includes(key.toLowerCase()) || 
                            searchText.includes(key.replace(/-/g, '').toLowerCase()) ||
                            (key === 'fib-retracement' && searchText.includes('fibonacci') && searchText.includes('retracement')) ||
                            (key === 'trend-line' && searchText.includes('trendline')) ||
                            (key === 'horz-line' && searchText.includes('horizontal'))) {
                            
                            // Set custom title attribute for native browser tooltip
                            button.setAttribute('title', customTooltip);
                            button.setAttribute('data-custom-tooltip', customTooltip);
                            
                            console.log(`✅ Added custom tooltip to: ${key}`);
                        }
                    });
                });

                console.log('✅ Custom tooltips applied');
            }, 2000); // Wait 2 seconds for UI to render
        } catch (error) {
            console.error('Error adding custom tooltips:', error);
        }
    };

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
            setIsLoading(true);
            console.log('Dependencies not ready:', {
                isScriptLoaded,
                hasContainer: !!containerRef.current,
                hasTradingView: !!window.TradingView
            });
            return;
        }

        if (!containerRef.current.id) {
            containerRef.current.id = `tv_chart_container_${Date.now()}`;
        }

        const createWidget = async () => {
            setIsLoading(true);
            try {
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
                            supported_resolutions: ['1D', '1W', '1M'],
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
                            supported_resolutions: ['1D', '1W', '1M'],
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
                            console.warn("responseData", responseData);
                            
                            if (responseData.data.length === 0) {
                                console.warn('No data received from server');
                                console.warn("nextTime 1", responseData.nextTime);
                                if (responseData.nextTime != null) {
                                    onHistoryCallback([], { noData: true, nextTime: responseData.nextTime });
                                } else {
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

                            if (bars.length === 0) {
                                console.info("No bars found");
                                console.warn("nextTime 2", responseData.nextTime);
                                if (responseData.nextTime != null) {
                                    onHistoryCallback([], { noData: true, nextTime: responseData.nextTime });
                                } else {
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
                        "save_shortcut",
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
                    disabled_features: [],
                    charts_storage_url: 'https://saveload.tradingview.com',
                    client_id: 'tradingview.com',
                    user_id: 'public_user_id',
                    theme: "Dark",
                    autosize: true,
                });

                widget.onChartReady(() => {
                    console.log("Chart is ready");
                    setIsChartReady(true);
                    setIsLoading(false);
                    setChartInstance?.(widget);
                    onChartReady?.(widget);
                    widget.activeChart().setChartType(1);
                    if (isFromDecisionMatrix) {
                        widget.activeChart().setChartType(3);
                    }
                    
                    // Add custom tooltips after chart is fully ready
                    addCustomTooltips();
                    
                    // Re-apply tooltips if toolbar changes (e.g., user opens/closes menu)
                    const observer = new MutationObserver(() => {
                        addCustomTooltips();
                    });
                    
                    if (containerRef.current) {
                        observer.observe(containerRef.current, {
                            childList: true,
                            subtree: true
                        });
                    }
                });

                setTvWidget(widget);
            } catch (error) {
                console.error('Error creating widget:', error);
                setIsLoading(false);
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
        <div style={{ position: 'relative', height: '80vh', width: '100%' }}>
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

TradingViewChart.propTypes = {
    setChartInstance: PropTypes.func,
    onChartReady: PropTypes.func,
    isFromDecisionMatrix: PropTypes.bool,
    accountNo: PropTypes.oneOfType([PropTypes.string, PropTypes.bool])
};

export default TradingViewChart;
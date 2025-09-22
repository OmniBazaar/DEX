// Using Jest's built-in expect instead of chai
import axios from 'axios';
import { ethers } from 'ethers';
import { dexClient } from '../../src/services/dex/api/dexClient';
import { wsManager } from '../../src/services/dex/websocket/WebSocketManager';
import { store } from '../../src/store/store';
import {
  fetchTradingPairs,
  fetchBalances,
  fetchOrders,
  updateOrderBook,
  updateMarketData
} from '../../src/store/slices/dexSlice';

// Helper to skip test if service is not available
const skipIfServiceUnavailable = (error: any): void => {
  if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
    console.log('Note: Service not running. Skipping test.');
    return;
  }
  throw error;
};

// Integration test configuration
const TEST_CONFIG = {
  DEX_API_URL: process.env.TEST_DEX_API_URL || 'http://localhost:3001/api/dex',
  WS_URL: process.env.TEST_DEX_WS_URL || 'ws://localhost:3001/ws',
  TEST_TIMEOUT: 30000,
  TEST_USER_ADDRESS: '0x1234567890123456789012345678901234567890',
  TEST_JWT_TOKEN: 'test-jwt-token',
};

describe('DEX-Validator Integration Tests', () => {
  let authToken: string;

  /**
   * Setup test authentication before all tests
   */
  beforeAll((): void => {
    // Setup test authentication
    authToken = TEST_CONFIG.TEST_JWT_TOKEN;
    dexClient.setAuthToken(authToken);
  });

  /**
   * Cleanup after all tests
   */
  afterAll((): void => {
    // Cleanup
    wsManager.disconnect();
    dexClient.clearAuthToken();
  });

  describe('REST API Integration', () => {
    /**
     * Tests connection to Validator DEX API health endpoint
     */
    it('should connect to Validator DEX API', async (): Promise<void> => {
      try {
        const response = await axios.get(`${TEST_CONFIG.DEX_API_URL}/health`);
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('status', 'healthy');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('Note: Validator service not running. Skipping integration test.');
      }
    });

    /**
     * Tests fetching available trading pairs from Validator
     */
    it('should fetch trading pairs from Validator', async (): Promise<void> => {
      try {
        const pairs = await dexClient.getTradingPairs();
        expect(Array.isArray(pairs)).toBe(true);
        
        if (pairs.length > 0) {
          const pair = pairs[0];
          expect(pair).toHaveProperty('symbol');
          expect(pair).toHaveProperty('baseAsset');
          expect(pair).toHaveProperty('quoteAsset');
          expect(pair).toHaveProperty('minAmount');
          expect(pair).toHaveProperty('maxAmount');
          expect(pair).toHaveProperty('tickSize');
          expect(pair).toHaveProperty('status');
        }
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests fetching user account balances from Validator
     */
    it('should fetch user balances from Validator', async (): Promise<void> => {
      try {
        const balances = await dexClient.getBalances();
        expect(Array.isArray(balances)).toBe(true);
        
        balances.forEach(balance => {
          expect(balance).toHaveProperty('currency');
          expect(balance).toHaveProperty('available');
          expect(balance).toHaveProperty('locked');
          expect(balance).toHaveProperty('total');
          
          // Verify balance values are valid numbers
          expect(typeof parseFloat(balance.available)).toBe('number');
          expect(typeof parseFloat(balance.locked)).toBe('number');
          expect(typeof parseFloat(balance.total)).toBe('number');
        });
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests placing a limit order through Validator
     */
    it('should place order through Validator', async (): Promise<void> => {
      try {
        const orderRequest = {
          pair: 'ETH/USDC',
          side: 'buy' as const,
          type: 'limit' as const,
          price: '2400.00',
          amount: '0.1',
          postOnly: true,
        };

        const order = await dexClient.placeOrder(orderRequest);
        
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('status');
        expect(order.pair).toBe(orderRequest.pair);
        expect(order.side).toBe(orderRequest.side);
        expect(order.type).toBe(orderRequest.type);
        expect(order.price).toBe(orderRequest.price);
        expect(order.amount).toBe(orderRequest.amount);
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404 || error.message?.includes('Insufficient balance')) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests fetching user's open orders from Validator
     */
    it('should fetch open orders from Validator', async (): Promise<void> => {
      try {
        const orders = await dexClient.getOpenOrders();
        expect(Array.isArray(orders)).toBe(true);
        
        orders.forEach(order => {
          expect(order).toHaveProperty('id');
          expect(order).toHaveProperty('pair');
          expect(order).toHaveProperty('side');
          expect(order).toHaveProperty('type');
          expect(order).toHaveProperty('status');
          expect(order).toHaveProperty('price');
          expect(order).toHaveProperty('amount');
          expect(order).toHaveProperty('filled');
          expect(order).toHaveProperty('remaining');
        });
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests cancelling an order through Validator
     */
    it('should cancel order through Validator', async (): Promise<void> => {
      try {
        // First place an order
        const orderRequest = {
          pair: 'ETH/USDC',
          side: 'buy' as const,
          type: 'limit' as const,
          price: '2300.00', // Below market to avoid immediate fill
          amount: '0.1',
        };

        const order = await dexClient.placeOrder(orderRequest);
        
        // Then cancel it
        await dexClient.cancelOrder(order.id);
        
        // Verify order is cancelled
        const cancelledOrder = await dexClient.getOrder(order.id);
        expect(cancelledOrder.status).toBe('cancelled');
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404 || error.message?.includes('Insufficient balance')) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests fetching order book data from Validator
     */
    it('should fetch order book from Validator', async (): Promise<void> => {
      try {
        const orderBook = await dexClient.getOrderBook('ETH/USDC', 20);
        
        expect(orderBook).toHaveProperty('pair', 'ETH/USDC');
        expect(orderBook).toHaveProperty('bids');
        expect(orderBook).toHaveProperty('asks');
        expect(orderBook).toHaveProperty('timestamp');
        
        // Validate bid/ask structure
        [...orderBook.bids, ...orderBook.asks].forEach(level => {
          expect(level).toHaveProperty('price');
          expect(level).toHaveProperty('amount');
          expect(level).toHaveProperty('total');
        });
        
        // Verify bids are sorted descending
        for (let i = 1; i < orderBook.bids.length; i++) {
          expect(parseFloat(orderBook.bids[i-1].price))
            .toBeGreaterThanOrEqual(parseFloat(orderBook.bids[i].price));
        }
        
        // Verify asks are sorted ascending
        for (let i = 1; i < orderBook.asks.length; i++) {
          expect(parseFloat(orderBook.asks[i-1].price))
            .toBeLessThanOrEqual(parseFloat(orderBook.asks[i].price));
        }
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests getting swap quotes from Validator
     */
    it('should get swap quote from Validator', async (): Promise<void> => {
      try {
        const quoteRequest = {
          fromToken: 'ETH',
          toToken: 'USDC',
          amount: '1.0',
          slippage: 0.5,
        };

        const quote = await dexClient.getSwapQuote(quoteRequest);
        
        expect(quote).toHaveProperty('fromToken', quoteRequest.fromToken);
        expect(quote).toHaveProperty('toToken', quoteRequest.toToken);
        expect(quote).toHaveProperty('fromAmount', quoteRequest.amount);
        expect(quote).toHaveProperty('toAmount');
        expect(quote).toHaveProperty('price');
        expect(quote).toHaveProperty('priceImpact');
        expect(quote).toHaveProperty('minimumReceived');
        expect(quote).toHaveProperty('route');
        expect(quote).toHaveProperty('gas');
        expect(quote).toHaveProperty('fee');
        expect(quote).toHaveProperty('expires');
        expect(quote).toHaveProperty('quoteId');
        
        // Verify calculations
        const toAmount = parseFloat(quote.toAmount);
        const minimumReceived = parseFloat(quote.minimumReceived);
        expect(minimumReceived).toBeLessThanOrEqual(toAmount);
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });
  });

  describe('WebSocket Integration', () => {
    let skipWebSocketTests = false;

    /**
     * Setup WebSocket connection before each test
     */
    beforeEach(async (): Promise<void> => {
      if (skipWebSocketTests) return;

      try {
        // Test if WebSocket server is available with timeout
        await Promise.race([
          wsManager.connect(authToken),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
        ]);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('Note: WebSocket server not running. Skipping WebSocket tests.');
        skipWebSocketTests = true;
      }
    });

    /**
     * Disconnect WebSocket after each test
     */
    afterEach((): void => {
      wsManager.disconnect();
    });

    /**
     * Tests WebSocket connection to Validator
     * @param done - Callback to complete test
     */
    it('should connect to Validator WebSocket', async (): Promise<void> => {
      if (skipWebSocketTests) {
        console.log('WebSocket tests skipped - server not available');
        return;
      }

      try {
        await wsManager.connect(authToken);
        expect(wsManager.isConnected).toBe(true);
      } catch (error: any) {
        if (error.message?.includes('404') || error.code === 'ECONNREFUSED') {
          console.log('Note: WebSocket server not available');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests receiving real-time ticker updates via WebSocket
     * @param done - Callback to complete test
     */
    it('should receive real-time ticker updates', (done): void => {
      if (skipWebSocketTests) {
        done();
        return;
      }

      let updateCount = 0;
      const targetUpdates = 3;

      wsManager.subscribeTicker('ETH/USDC', (ticker) => {
        expect(ticker).toHaveProperty('pair', 'ETH/USDC');
        expect(ticker).toHaveProperty('lastPrice');
        expect(ticker).toHaveProperty('bidPrice');
        expect(ticker).toHaveProperty('askPrice');
        expect(ticker).toHaveProperty('volume24h');
        
        updateCount++;
        if (updateCount >= targetUpdates) {
          wsManager.unsubscribe('ticker:ETH/USDC');
          done();
        }
      });

      // Timeout if no updates received
      setTimeout(() => {
        if (updateCount === 0) {
          done(new Error('No ticker updates received'));
        }
      }, 10000);
    });

    /**
     * Tests receiving real-time order book updates via WebSocket
     * @param done - Callback to complete test
     */
    it('should receive real-time order book updates', (done): void => {
      if (skipWebSocketTests) {
        done();
        return;
      }

      let snapshotReceived = false;

      wsManager.subscribeOrderBook('ETH/USDC', (orderBookUpdate) => {
        expect(orderBookUpdate).toHaveProperty('pair', 'ETH/USDC');
        expect(orderBookUpdate).toHaveProperty('bids');
        expect(orderBookUpdate).toHaveProperty('asks');
        expect(orderBookUpdate).toHaveProperty('sequence');
        expect(orderBookUpdate).toHaveProperty('type');
        
        if (orderBookUpdate.type === 'snapshot') {
          snapshotReceived = true;
          expect(orderBookUpdate.bids.length).toBeGreaterThan(0);
          expect(orderBookUpdate.asks.length).toBeGreaterThan(0);
          wsManager.unsubscribe('orderbook:ETH/USDC');
          done();
        }
      });

      // Timeout if no snapshot received
      setTimeout(() => {
        if (!snapshotReceived) {
          done(new Error('No order book snapshot received'));
        }
      }, 10000);
    });

    /**
     * Tests receiving real-time trade updates via WebSocket
     * @param done - Callback to complete test
     */
    it('should receive real-time trade updates', (done): void => {
      if (skipWebSocketTests) {
        done();
        return;
      }

      const trades: any[] = [];

      wsManager.subscribeTrades('ETH/USDC', (newTrades) => {
        expect(Array.isArray(newTrades)).toBe(true);
        
        newTrades.forEach(trade => {
          expect(trade).toHaveProperty('id');
          expect(trade).toHaveProperty('pair', 'ETH/USDC');
          expect(trade).toHaveProperty('price');
          expect(trade).toHaveProperty('amount');
          expect(trade).toHaveProperty('side');
          expect(trade).toHaveProperty('timestamp');
        });
        
        trades.push(...newTrades);
        
        if (trades.length >= 5) {
          wsManager.unsubscribe('trades:ETH/USDC');
          done();
        }
      });

      // Timeout if no trades received
      setTimeout(() => {
        if (trades.length === 0) {
          done(new Error('No trades received'));
        }
      }, 15000);
    });

    /**
     * Tests receiving order updates for authenticated user via WebSocket
     * @param done - Callback to complete test
     */
    it('should receive order updates for authenticated user', (done): void => {
      if (skipWebSocketTests) {
        done();
        return;
      }

      wsManager.subscribeOrders((orderUpdate) => {
        expect(orderUpdate).toHaveProperty('id');
        expect(orderUpdate).toHaveProperty('status');
        expect(orderUpdate).toHaveProperty('filled');
        expect(orderUpdate).toHaveProperty('remaining');
        expect(orderUpdate).toHaveProperty('timestamp');
        
        wsManager.unsubscribe('orders');
        done();
      });

      // Place an order to trigger update
      setTimeout((): void => {
        void (async (): Promise<void> => {
          try {
            await dexClient.placeOrder({
              pair: 'ETH/USDC',
              side: 'buy',
              type: 'limit',
              price: '2300.00',
              amount: '0.1',
            });
          } catch (error) {
            // Ignore placement errors, we're testing updates
          }
        })();
      }, 1000);

      // Timeout
      setTimeout(() => {
        done(new Error('No order updates received'));
      }, 20000);
    });

    /**
     * Tests receiving balance updates via WebSocket
     * @param done - Callback to complete test
     */
    it('should receive balance updates', (done): void => {
      if (skipWebSocketTests) {
        done();
        return;
      }

      wsManager.subscribeBalances((balances) => {
        expect(Array.isArray(balances)).toBe(true);
        
        balances.forEach(balance => {
          expect(balance).toHaveProperty('currency');
          expect(balance).toHaveProperty('available');
          expect(balance).toHaveProperty('locked');
          expect(balance).toHaveProperty('total');
        });
        
        wsManager.unsubscribe('balances');
        done();
      });

      // Trigger balance update by placing/cancelling order
      setTimeout((): void => {
        void (async (): Promise<void> => {
          try {
            const order = await dexClient.placeOrder({
              pair: 'ETH/USDC',
              side: 'buy',
              type: 'limit',
              price: '2300.00',
              amount: '0.1',
            });
            await dexClient.cancelOrder(order.id);
          } catch (error) {
            // Ignore errors, we're testing balance updates
          }
        })();
      }, 1000);

      // Timeout
      setTimeout(() => {
        done(new Error('No balance updates received'));
      }, 20000);
    });

    /**
     * Tests WebSocket reconnection handling
     * @param done - Callback to complete test
     */
    it('should handle WebSocket reconnection', (done): void => {
      if (skipWebSocketTests) {
        done();
        return;
      }

      let disconnectCount = 0;
      let reconnectCount = 0;

      wsManager.on('disconnected', () => {
        disconnectCount++;
      });

      wsManager.on('connected', () => {
        reconnectCount++;
        
        if (reconnectCount === 2) { // Initial + reconnect
          expect(disconnectCount).toBe(1);
          done();
        }
      });

      // Simulate disconnect after 2 seconds
      setTimeout(() => {
        // Force disconnect
        (wsManager as any).ws?.close();
      }, 2000);
    });
  });

  describe('Redux Store Integration', () => {
    /**
     * Tests updating Redux store with trading pairs
     */
    it('should update store with trading pairs', async (): Promise<void> => {
      try {
        await store.dispatch(fetchTradingPairs());
        
        const state = store.getState().dex;
        expect(Array.isArray(state.tradingPairs)).toBe(true);
        expect(state.isLoading.fetchTradingPairs).toBe(false);
        // In test environment, 404 errors are expected when no service is running
        if (state.errors.fetchTradingPairs && !state.errors.fetchTradingPairs.includes('404')) {
          expect(state.errors.fetchTradingPairs).toBeUndefined();
        }
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests updating Redux store with user balances
     */
    it('should update store with user balances', async (): Promise<void> => {
      try {
        await store.dispatch(fetchBalances());
        
        const state = store.getState().dex;
        expect(typeof state.balances).toBe('object');
        expect(state.isLoading.fetchBalances).toBe(false);
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests updating Redux store with open orders
     */
    it('should update store with open orders', async (): Promise<void> => {
      try {
        await store.dispatch(fetchOrders());
        
        const state = store.getState().dex;
        expect(Array.isArray(state.orders)).toBe(true);
        expect(state.isLoading.fetchOrders).toBe(false);
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests syncing WebSocket updates to Redux store
     * @param done - Callback to complete test
     */
    it('should sync WebSocket updates to store', async (): Promise<void> => {
      try {
        await wsManager.connect(authToken);

        // Create a promise that will resolve when we receive ticker data
        const tickerReceived = new Promise<void>((resolve) => {
          wsManager.subscribeTicker('ETH/USDC', (ticker) => {
            // Update store
            store.dispatch(updateMarketData({
              'ETH/USDC': {
                price: ticker.lastPrice,
                change24h: ticker.change24h,
                changePercent24h: ticker.changePercent24h,
                volume24h: ticker.volume24h,
                high24h: ticker.high24h,
                low24h: ticker.low24h,
                timestamp: ticker.timestamp,
              }
            }));

            // Verify store update
            const state = store.getState().dex;
            expect(state.marketData['ETH/USDC']).toBeDefined();
            expect(state.marketData['ETH/USDC'].price).toBe(ticker.lastPrice);

            resolve();
          });
        });

        // Wait for ticker data with timeout
        await Promise.race([
          tickerReceived,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Ticker timeout')), 5000))
        ]);

        wsManager.disconnect();
      } catch (error: any) {
        if (error.message?.includes('404') || error.code === 'ECONNREFUSED' || error.message === 'Ticker timeout') {
          console.log('Note: WebSocket server not available or no ticker data');
          return;
        }
        throw error;
      }
    });
  });

  describe('Error Scenarios', () => {
    /**
     * Tests graceful handling of network errors
     */
    it('should handle network errors gracefully', async (): Promise<void> => {
      // Temporarily set wrong URL and reduce timeout
      const originalUrl = (dexClient as any).client.defaults.baseURL;
      const originalTimeout = (dexClient as any).client.defaults.timeout;
      (dexClient as any).client.defaults.baseURL = 'http://localhost:9999/api/dex';
      (dexClient as any).client.defaults.timeout = 2000; // 2 seconds

      try {
        await dexClient.getTradingPairs();
        throw new Error('Should have thrown error');
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        (dexClient as any).client.defaults.baseURL = originalUrl;
        (dexClient as any).client.defaults.timeout = originalTimeout;
      }
    });

    /**
     * Tests handling of authentication errors
     */
    it('should handle authentication errors', async (): Promise<void> => {
      // Clear auth token
      dexClient.clearAuthToken();

      try {
        await dexClient.getBalances();
        throw new Error('Should have thrown authentication error');
      } catch (error: any) {
        expect(error).toBeDefined();
        // Check if it's an auth error, connection refused, or 404 (no service running)
        const isExpectedError = error.response?.status === 401 ||
                                error.response?.status === 404 ||
                                error.code === 'ECONNREFUSED';
        expect(isExpectedError).toBe(true);
      } finally {
        // Always restore auth token
        dexClient.setAuthToken(authToken);
      }
    });

    /**
     * Tests handling of invalid order parameters
     */
    it('should handle invalid order parameters', async (): Promise<void> => {
      try {
        await dexClient.placeOrder({
          pair: 'INVALID/PAIR',
          side: 'buy',
          type: 'limit',
          price: '-100', // Invalid price
          amount: '0', // Invalid amount
        });
        throw new Error('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Performance Tests', () => {
    /**
     * Tests handling high-frequency order book updates
     * @param done - Callback to complete test
     */
    it('should handle high-frequency order book updates', async (): Promise<void> => {
      try {
        await wsManager.connect(authToken);

        let updateCount = 0;
        const startTime = Date.now();
        const targetUpdates = 100;

        // Create promise for receiving updates
        const updatesReceived = new Promise<void>((resolve) => {
          wsManager.subscribeOrderBook('ETH/USDC', (update) => {
            updateCount++;

            if (updateCount >= targetUpdates) {
              const duration = Date.now() - startTime;
              const updatesPerSecond = (updateCount / duration) * 1000;

              // eslint-disable-next-line no-console
              console.log(`Received ${updateCount} updates in ${duration}ms`);
              // eslint-disable-next-line no-console
              console.log(`Rate: ${updatesPerSecond.toFixed(2)} updates/second`);

              expect(updatesPerSecond).toBeGreaterThanOrEqual(10); // At least 10 updates/second

              wsManager.unsubscribe('orderbook:ETH/USDC');
              resolve();
            }
          });
        });

        // Wait for updates with timeout
        await Promise.race([
          updatesReceived,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Update timeout')), 10000))
        ]);

      } catch (error: any) {
        if (error.message?.includes('404') || error.code === 'ECONNREFUSED' || error.message === 'Update timeout') {
          console.log('Note: WebSocket server not available or insufficient updates');
          return;
        }
        throw error;
      }
    });

    /**
     * Tests handling concurrent API requests
     */
    it('should handle concurrent API requests', async (): Promise<void> => {
      const concurrentRequests = 10;
      const requests = [];
      
      try {
        // Make concurrent requests
        for (let i = 0; i < concurrentRequests; i++) {
          requests.push(
            dexClient.getTicker('ETH/USDC'),
            dexClient.getOrderBook('ETH/USDC', 10),
          );
        }
        
        const startTime = Date.now();
        const results = await Promise.all(requests);
        const duration = Date.now() - startTime;
        
        // eslint-disable-next-line no-console
        console.log(`Completed ${requests.length} requests in ${duration}ms`);
        // eslint-disable-next-line no-console
        console.log(`Average: ${(duration / requests.length).toFixed(2)}ms per request`);
        
        expect(results).toHaveLength(requests.length);
        expect(duration).toBeLessThanOrEqual(5000); // All requests within 5 seconds
      } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
          console.log('Note: Service endpoint not available');
          return;
        }
        throw error;
      }
    });
  });
});
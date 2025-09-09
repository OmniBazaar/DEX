import { expect } from 'chai';
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

// Integration test configuration
const TEST_CONFIG = {
  DEX_API_URL: process.env.TEST_DEX_API_URL || 'http://localhost:3001/api/dex',
  WS_URL: process.env.TEST_DEX_WS_URL || 'ws://localhost:3001/ws',
  TEST_TIMEOUT: 30000,
  TEST_USER_ADDRESS: '0x1234567890123456789012345678901234567890',
  TEST_JWT_TOKEN: 'test-jwt-token',
};

describe('DEX-Validator Integration Tests', function() {
  this.timeout(TEST_CONFIG.TEST_TIMEOUT);

  let authToken: string;

  /**
   * Setup test authentication before all tests
   */
  before((): void => {
    // Setup test authentication
    authToken = TEST_CONFIG.TEST_JWT_TOKEN;
    dexClient.setAuthToken(authToken);
  });

  /**
   * Cleanup after all tests
   */
  after((): void => {
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
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('status', 'healthy');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('Note: Validator service not running. Skipping integration test.');
        this.skip();
      }
    });

    /**
     * Tests fetching available trading pairs from Validator
     */
    it('should fetch trading pairs from Validator', async (): Promise<void> => {
      try {
        const pairs = await dexClient.getTradingPairs();
        expect(pairs).to.be.an('array');
        
        if (pairs.length > 0) {
          const pair = pairs[0];
          expect(pair).to.have.property('symbol');
          expect(pair).to.have.property('baseAsset');
          expect(pair).to.have.property('quoteAsset');
          expect(pair).to.have.property('minAmount');
          expect(pair).to.have.property('maxAmount');
          expect(pair).to.have.property('tickSize');
          expect(pair).to.have.property('status');
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          this.skip();
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
        expect(balances).to.be.an('array');
        
        balances.forEach(balance => {
          expect(balance).to.have.property('currency');
          expect(balance).to.have.property('available');
          expect(balance).to.have.property('locked');
          expect(balance).to.have.property('total');
          
          // Verify balance values are valid numbers
          expect(parseFloat(balance.available)).to.be.a('number');
          expect(parseFloat(balance.locked)).to.be.a('number');
          expect(parseFloat(balance.total)).to.be.a('number');
        });
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          this.skip();
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
        
        expect(order).to.have.property('id');
        expect(order).to.have.property('status');
        expect(order.pair).to.equal(orderRequest.pair);
        expect(order.side).to.equal(orderRequest.side);
        expect(order.type).to.equal(orderRequest.type);
        expect(order.price).to.equal(orderRequest.price);
        expect(order.amount).to.equal(orderRequest.amount);
      } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.message?.includes('Insufficient balance')) {
          this.skip();
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
        expect(orders).to.be.an('array');
        
        orders.forEach(order => {
          expect(order).to.have.property('id');
          expect(order).to.have.property('pair');
          expect(order).to.have.property('side');
          expect(order).to.have.property('type');
          expect(order).to.have.property('status');
          expect(order).to.have.property('price');
          expect(order).to.have.property('amount');
          expect(order).to.have.property('filled');
          expect(order).to.have.property('remaining');
        });
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          this.skip();
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
        expect(cancelledOrder.status).to.equal('cancelled');
      } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.message?.includes('Insufficient balance')) {
          this.skip();
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
        
        expect(orderBook).to.have.property('pair', 'ETH/USDC');
        expect(orderBook).to.have.property('bids');
        expect(orderBook).to.have.property('asks');
        expect(orderBook).to.have.property('timestamp');
        
        // Validate bid/ask structure
        [...orderBook.bids, ...orderBook.asks].forEach(level => {
          expect(level).to.have.property('price');
          expect(level).to.have.property('amount');
          expect(level).to.have.property('total');
        });
        
        // Verify bids are sorted descending
        for (let i = 1; i < orderBook.bids.length; i++) {
          expect(parseFloat(orderBook.bids[i-1].price))
            .to.be.gte(parseFloat(orderBook.bids[i].price));
        }
        
        // Verify asks are sorted ascending
        for (let i = 1; i < orderBook.asks.length; i++) {
          expect(parseFloat(orderBook.asks[i-1].price))
            .to.be.lte(parseFloat(orderBook.asks[i].price));
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          this.skip();
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
        
        expect(quote).to.have.property('fromToken', quoteRequest.fromToken);
        expect(quote).to.have.property('toToken', quoteRequest.toToken);
        expect(quote).to.have.property('fromAmount', quoteRequest.amount);
        expect(quote).to.have.property('toAmount');
        expect(quote).to.have.property('price');
        expect(quote).to.have.property('priceImpact');
        expect(quote).to.have.property('minimumReceived');
        expect(quote).to.have.property('route');
        expect(quote).to.have.property('gas');
        expect(quote).to.have.property('fee');
        expect(quote).to.have.property('expires');
        expect(quote).to.have.property('quoteId');
        
        // Verify calculations
        const toAmount = parseFloat(quote.toAmount);
        const minimumReceived = parseFloat(quote.minimumReceived);
        expect(minimumReceived).to.be.lte(toAmount);
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          this.skip();
        }
        throw error;
      }
    });
  });

  describe('WebSocket Integration', () => {
    /**
     * Setup WebSocket connection before each test
     */
    beforeEach(async function(): Promise<void> {
      try {
        // Test if WebSocket server is available
        await wsManager.connect(authToken);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log('Note: WebSocket server not running. Skipping WebSocket tests.');
        this.skip();
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
    it('should connect to Validator WebSocket', (done): void => {
      wsManager.once('connected', () => {
        expect(wsManager.isConnected).to.be.true;
        done();
      });

      wsManager.once('error', (error) => {
        done(error);
      });
    });

    /**
     * Tests receiving real-time ticker updates via WebSocket
     * @param done - Callback to complete test
     */
    it('should receive real-time ticker updates', (done): void => {
      let updateCount = 0;
      const targetUpdates = 3;

      wsManager.subscribeTicker('ETH/USDC', (ticker) => {
        expect(ticker).to.have.property('pair', 'ETH/USDC');
        expect(ticker).to.have.property('lastPrice');
        expect(ticker).to.have.property('bidPrice');
        expect(ticker).to.have.property('askPrice');
        expect(ticker).to.have.property('volume24h');
        
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
      let snapshotReceived = false;

      wsManager.subscribeOrderBook('ETH/USDC', (orderBookUpdate) => {
        expect(orderBookUpdate).to.have.property('pair', 'ETH/USDC');
        expect(orderBookUpdate).to.have.property('bids');
        expect(orderBookUpdate).to.have.property('asks');
        expect(orderBookUpdate).to.have.property('sequence');
        expect(orderBookUpdate).to.have.property('type');
        
        if (orderBookUpdate.type === 'snapshot') {
          snapshotReceived = true;
          expect(orderBookUpdate.bids.length).to.be.gt(0);
          expect(orderBookUpdate.asks.length).to.be.gt(0);
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
      const trades: any[] = [];

      wsManager.subscribeTrades('ETH/USDC', (newTrades) => {
        expect(newTrades).to.be.an('array');
        
        newTrades.forEach(trade => {
          expect(trade).to.have.property('id');
          expect(trade).to.have.property('pair', 'ETH/USDC');
          expect(trade).to.have.property('price');
          expect(trade).to.have.property('amount');
          expect(trade).to.have.property('side');
          expect(trade).to.have.property('timestamp');
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
      wsManager.subscribeOrders((orderUpdate) => {
        expect(orderUpdate).to.have.property('id');
        expect(orderUpdate).to.have.property('status');
        expect(orderUpdate).to.have.property('filled');
        expect(orderUpdate).to.have.property('remaining');
        expect(orderUpdate).to.have.property('timestamp');
        
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
      wsManager.subscribeBalances((balances) => {
        expect(balances).to.be.an('array');
        
        balances.forEach(balance => {
          expect(balance).to.have.property('currency');
          expect(balance).to.have.property('available');
          expect(balance).to.have.property('locked');
          expect(balance).to.have.property('total');
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
      let disconnectCount = 0;
      let reconnectCount = 0;

      wsManager.on('disconnected', () => {
        disconnectCount++;
      });

      wsManager.on('connected', () => {
        reconnectCount++;
        
        if (reconnectCount === 2) { // Initial + reconnect
          expect(disconnectCount).to.equal(1);
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
    it('should update store with trading pairs', async function(): Promise<void> {
      try {
        await store.dispatch(fetchTradingPairs());
        
        const state = store.getState().dex;
        expect(state.tradingPairs).to.be.an('array');
        expect(state.isLoading.fetchTradingPairs).to.be.false;
        expect(state.errors.fetchTradingPairs).to.be.undefined;
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          this.skip();
        }
        throw error;
      }
    });

    /**
     * Tests updating Redux store with user balances
     */
    it('should update store with user balances', async function(): Promise<void> {
      try {
        await store.dispatch(fetchBalances());
        
        const state = store.getState().dex;
        expect(state.balances).to.be.an('object');
        expect(state.isLoading.fetchBalances).to.be.false;
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          this.skip();
        }
        throw error;
      }
    });

    /**
     * Tests updating Redux store with open orders
     */
    it('should update store with open orders', async function(): Promise<void> {
      try {
        await store.dispatch(fetchOrders());
        
        const state = store.getState().dex;
        expect(state.orders).to.be.an('array');
        expect(state.isLoading.fetchOrders).to.be.false;
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          this.skip();
        }
        throw error;
      }
    });

    /**
     * Tests syncing WebSocket updates to Redux store
     * @param done - Callback to complete test
     */
    it('should sync WebSocket updates to store', function(done): void {
      this.timeout(10000);

      try {
        wsManager.connect(authToken).then(() => {
          // Subscribe to market data
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
            expect(state.marketData['ETH/USDC']).to.exist;
            expect(state.marketData['ETH/USDC'].price).to.equal(ticker.lastPrice);
            
            wsManager.disconnect();
            done();
          });
        }).catch(() => {
          this.skip();
        });
      } catch (error) {
        this.skip();
      }
    });
  });

  describe('Error Scenarios', () => {
    /**
     * Tests graceful handling of network errors
     */
    it('should handle network errors gracefully', async (): Promise<void> => {
      // Temporarily set wrong URL
      const originalUrl = (dexClient as any).client.defaults.baseURL;
      (dexClient as any).client.defaults.baseURL = 'http://localhost:9999/api/dex';
      
      try {
        await dexClient.getTradingPairs();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).to.exist;
      } finally {
        (dexClient as any).client.defaults.baseURL = originalUrl;
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
        expect.fail('Should have thrown authentication error');
      } catch (error) {
        expect(error).to.exist;
        // Restore auth token
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
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe('Performance Tests', () => {
    /**
     * Tests handling high-frequency order book updates
     * @param done - Callback to complete test
     */
    it('should handle high-frequency order book updates', function(done): void {
      this.timeout(30000);
      
      let updateCount = 0;
      const startTime = Date.now();
      const targetUpdates = 100;
      
      try {
        wsManager.connect(authToken).then(() => {
          wsManager.subscribeOrderBook('ETH/USDC', (update) => {
            updateCount++;
            
            if (updateCount >= targetUpdates) {
              const duration = Date.now() - startTime;
              const updatesPerSecond = (updateCount / duration) * 1000;
              
              // eslint-disable-next-line no-console
              console.log(`Received ${updateCount} updates in ${duration}ms`);
              // eslint-disable-next-line no-console
              console.log(`Rate: ${updatesPerSecond.toFixed(2)} updates/second`);
              
              expect(updatesPerSecond).to.be.gte(10); // At least 10 updates/second
              
              wsManager.unsubscribe('orderbook:ETH/USDC');
              done();
            }
          });
        }).catch(() => {
          this.skip();
        });
      } catch (error) {
        this.skip();
      }
    });

    /**
     * Tests handling concurrent API requests
     */
    it('should handle concurrent API requests', async function(): Promise<void> {
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
        
        expect(results).to.have.lengthOf(requests.length);
        expect(duration).to.be.lte(5000); // All requests within 5 seconds
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          this.skip();
        }
        throw error;
      }
    });
  });
});
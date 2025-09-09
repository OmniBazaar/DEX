/**
 * DEX Validator Integration Tests
 * @file Tests the integration between the DEX module and Validator services
 */

import { UnifiedValidatorDEX } from '../src/index';
import { ValidatorClient } from '../../../Validator/src/client/ValidatorClient';
import { DecentralizedOrderBook } from '../../../Validator/src/services/dex/DecentralizedOrderBook';
import { IPFSStorageNetwork } from '../../../Validator/src/services/storage/IPFSStorageNetwork';
import { P2PChatNetwork } from '../../../Validator/src/services/chat/P2PChatNetwork';
import { FeeDistributionEngine } from '../../../Validator/src/core/FeeDistributionEngine';
import { OmniCoinBlockchain } from '../../../Validator/src/core/OmniCoinBlockchain';

describe('DEX Validator Integration', () => {
  let validatorClient: ValidatorClient;
  let orderBook: DecentralizedOrderBook;
  let storage: IPFSStorageNetwork;
  let chat: P2PChatNetwork;
  let feeDistribution: FeeDistributionEngine;
  let blockchain: OmniCoinBlockchain;

  /**
   * Set up test environment before all tests
   */
  beforeAll(async (): Promise<void> => {
    // Initialize validator client for testing
    validatorClient = new ValidatorClient({
      endpoint: 'localhost',
      enableWebSocket: false,
      enableCaching: false
    });

    // Initialize services for testing
    orderBook = new DecentralizedOrderBook({
      maxOrdersPerUser: 100,
      maxOrderBookDepth: 1000,
      tickSize: '0.01',
      minOrderSize: '0.01',
      maxOrderSize: '1000000',
      enableAutoMatching: true,
      feeRate: 0.001
    });

    await orderBook.initialize();
  });

  /**
   * Clean up resources after all tests
   */
  afterAll(async (): Promise<void> => {
    if (validatorClient) {
      await validatorClient.disconnect();
    }
    if (orderBook) {
      await orderBook.shutdown();
    }
  });

  describe('Order Book Integration', () => {
    /**
     * Tests successful order submission
     */
    it('should submit orders successfully', async (): Promise<void> => {
      const order = {
        userId: 'test-user-1',
        type: 'LIMIT',
        side: 'BUY',
        pair: 'XOM/USDC',
        quantity: '100',
        price: '1.50',
        timestamp: Date.now()
      };

      const result = await orderBook.submitOrder(order);
      
      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
    });

    /**
     * Tests successful order retrieval
     */
    it('should retrieve orders successfully', async (): Promise<void> => {
      const orders = await orderBook.getUserOrders('test-user-1');
      
      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
    });

    /**
     * Tests retrieval of trading pairs
     */
    it('should get trading pairs', async (): Promise<void> => {
      const pairs = await orderBook.getTradingPairs();
      
      expect(Array.isArray(pairs)).toBe(true);
    });

    /**
     * Tests retrieval of order book data
     */
    it('should get order book data', async (): Promise<void> => {
      const orderBookData = await orderBook.getOrderBook('XOM/USDC');
      
      expect(orderBookData).toBeDefined();
      expect(orderBookData?.timestamp).toBeDefined();
    });
  });

  describe('Market Data Integration', () => {
    /**
     * Tests retrieval of ticker data
     */
    it('should get ticker data', async (): Promise<void> => {
      const ticker = await orderBook.getTicker('XOM/USDC');
      
      expect(ticker).toBeDefined();
      expect(ticker.symbol).toBe('XOM/USDC');
      expect(ticker.timestamp).toBeDefined();
    });

    /**
     * Tests retrieval of all tickers
     */
    it('should get all tickers', async (): Promise<void> => {
      const tickers = await orderBook.getAllTickers();
      
      expect(Array.isArray(tickers)).toBe(true);
    });

    /**
     * Tests retrieval of market statistics
     */
    it('should get market statistics', async (): Promise<void> => {
      const stats = await orderBook.getMarketStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.timestamp).toBeDefined();
      expect(typeof stats.activePairs).toBe('number');
    });
  });

  describe('Trading Operations', () => {
    /**
     * Tests handling of portfolio requests
     */
    it('should handle portfolio requests', async (): Promise<void> => {
      const portfolio = await orderBook.getPortfolio('test-user-1');
      
      expect(portfolio).toBeDefined();
      expect(portfolio.balances).toBeDefined();
      expect(portfolio.positions).toBeDefined();
      expect(portfolio.totalValue).toBeDefined();
    });

    /**
     * Tests handling of trade history requests
     */
    it('should handle trade history requests', async (): Promise<void> => {
      const trades = await orderBook.getUserTrades('test-user-1', {
        limit: 10,
        offset: 0
      });
      
      expect(Array.isArray(trades)).toBe(true);
    });

    /**
     * Tests handling of order cancellation
     */
    it('should handle order cancellation', async (): Promise<void> => {
      // First create an order
      const order = {
        userId: 'test-user-1',
        type: 'LIMIT',
        side: 'SELL',
        pair: 'XOM/USDC',
        quantity: '50',
        price: '2.00',
        timestamp: Date.now()
      };

      const submitResult = await orderBook.submitOrder(order);
      expect(submitResult.success).toBe(true);

      // Then cancel it
      const cancelResult = await orderBook.cancelOrder(submitResult.orderId, 'test-user-1');
      expect(cancelResult.success).toBe(true);
    });
  });

  describe('Advanced Features', () => {
    /**
     * Tests handling of perpetual orders
     */
    it('should handle perpetual orders', async (): Promise<void> => {
      const perpetualOrder = {
        type: 'LIMIT',
        side: 'LONG',
        contract: 'XOM-PERP',
        size: '100',
        leverage: 5,
        price: '1.45',
        userId: 'test-user-1',
        timestamp: Date.now()
      };

      const result = await orderBook.placePerpetualOrder(perpetualOrder);
      
      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
    });

    /**
     * Tests handling of auto-conversion to XOM
     */
    it('should handle auto-conversion', async (): Promise<void> => {
      const conversion = await orderBook.autoConvertToXOM(
        'test-user-1',
        'USDC',
        '100',
        0.005
      );
      
      expect(conversion.success).toBe(true);
      expect(conversion.id).toBeDefined();
      expect(conversion.xomReceived).toBeDefined();
    });

    /**
     * Tests retrieval of perpetual positions
     */
    it('should get perpetual positions', async (): Promise<void> => {
      const positions = await orderBook.getPerpetualPositions('test-user-1');
      
      expect(Array.isArray(positions)).toBe(true);
    });
  });

  describe('Health and Status', () => {
    /**
     * Tests health status reporting
     */
    it('should report healthy status', async (): Promise<void> => {
      const health = await orderBook.getHealthStatus();
      
      expect(health.status).toBe('healthy');
      expect(health.details).toBeDefined();
    });

    /**
     * Tests provision of service metrics
     */
    it('should provide service metrics', async (): Promise<void> => {
      const health = await orderBook.getHealthStatus();
      
      expect(health.details.totalOrders).toBeDefined();
      expect(health.details.activeOrders).toBeDefined();
      expect(health.details.tradingPairs).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    /**
     * Tests graceful handling of invalid orders
     */
    it('should handle invalid orders gracefully', async (): Promise<void> => {
      const invalidOrder = {
        userId: '', // Invalid: empty user ID
        type: 'INVALID_TYPE',
        side: 'BUY',
        pair: 'XOM/USDC',
        quantity: '100',
        price: '1.50',
        timestamp: Date.now()
      };

      const result = await orderBook.submitOrder(invalidOrder);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    /**
     * Tests handling of non-existent orders
     */
    it('should handle non-existent orders', async (): Promise<void> => {
      const order = await orderBook.getOrder('non-existent-order-id');
      
      expect(order).toBeNull();
    });

    /**
     * Tests handling of non-existent trading pairs
     */
    it('should handle non-existent trading pairs', async (): Promise<void> => {
      const orderBookData = await orderBook.getOrderBook('INVALID/PAIR');
      
      expect(orderBookData).toBeNull();
    });
  });
});
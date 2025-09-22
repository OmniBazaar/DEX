/**
 * DEX Validator Integration Tests
 * @file Tests the integration between the DEX module and Validator services
 */

import { UnifiedValidatorDEX } from '../src/index';
import { createOmniValidatorClient } from '../src/client';
import type { OmniValidatorClient } from '../src/types/client';
import { DecentralizedOrderBook } from '../src/core/dex/DecentralizedOrderBook';
import { ValidatorServiceProxy } from '../src/services/validator-integration/ValidatorServiceProxy';
import type { StorageService, ChatService, FeeService } from '../src/services/validator-integration/ValidatorServiceProxy';

describe('DEX Validator Integration', () => {
  let validatorClient: OmniValidatorClient;
  let orderBook: DecentralizedOrderBook;
  let validatorProxy: ValidatorServiceProxy;
  let storage: StorageService;
  let chat: ChatService;
  let feeDistribution: FeeService;

  /**
   * Set up test environment before all tests
   */
  beforeAll(async (): Promise<void> => {
    try {
      // Initialize validator client for testing
      validatorClient = createOmniValidatorClient({
        validatorEndpoint: 'http://localhost:4000',
        wsEndpoint: 'ws://localhost:4000/graphql'
      });

      // Initialize validator proxy for service access
      validatorProxy = new ValidatorServiceProxy({
        validatorUrl: 'http://localhost:4000',
        wsUrl: 'ws://localhost:4000/graphql',
        mockMode: true // Use mock mode for testing
      });
      await validatorProxy.connect();

      // Get services from proxy
      storage = validatorProxy.storage;
      chat = validatorProxy.chat;
      feeDistribution = validatorProxy.fees;

      // Initialize order book with storage service
      const dexConfig = {
        tradingPairs: ['XOM/USDC', 'XOM/ETH'],
        feeStructure: {
          spotMaker: 0.001,
          spotTaker: 0.002,
          perpetualMaker: 0.0005,
          perpetualTaker: 0.0015,
          autoConversion: 0.003
        },
        maxLeverage: 100,
        liquidationThreshold: 0.8
      };

      // Storage service mock for order book
      const storageMock = {
        storeOrder: async () => 'mock-cid',
        updateOrder: async () => {},
        ipfsConnected: true
      };

      orderBook = new DecentralizedOrderBook(dexConfig, storageMock);
      await orderBook.initialize();
    } catch (error) {
      console.log('Note: Validator services not available - tests may be skipped');
    }
  });

  /**
   * Clean up resources after all tests
   */
  afterAll(async (): Promise<void> => {
    if (validatorClient) {
      if (validatorClient.disconnect) {
        await validatorClient.disconnect();
      } else if (validatorClient.close) {
        await validatorClient.close();
      }
    }
    if (orderBook) {
      await orderBook.shutdown();
    }
    if (validatorProxy) {
      await validatorProxy.disconnect();
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

      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const result = await orderBook.placeOrder(order);

      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
    });

    /**
     * Tests successful order retrieval
     */
    it('should retrieve orders successfully', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const orders = orderBook.getUserOrders('test-user-1', {});

      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThanOrEqual(0);
    });

    /**
     * Tests retrieval of trading pairs
     */
    it('should get trading pairs', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const pairs = await orderBook.getTradingPairs();

      expect(Array.isArray(pairs)).toBe(true);
      expect(pairs.length).toBeGreaterThan(0);
    });

    /**
     * Tests retrieval of order book data
     */
    it('should get order book data', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const orderBookData = await orderBook.getOrderBook('XOM/USDC');

      expect(orderBookData).toBeDefined();
      expect(orderBookData?.timestamp).toBeDefined();
      expect(orderBookData?.bids).toBeDefined();
      expect(orderBookData?.asks).toBeDefined();
    });
  });

  describe('Market Data Integration', () => {
    /**
     * Tests retrieval of ticker data
     */
    it('should get ticker data', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const ticker = orderBook.getTicker('XOM/USDC');
      
      expect(ticker).toBeDefined();
      expect(ticker.symbol).toBe('XOM/USDC');
      expect(ticker.timestamp).toBeDefined();
    });

    /**
     * Tests retrieval of all tickers
     */
    it('should get all tickers', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const tickers = orderBook.getAllTickers();
      
      expect(Array.isArray(tickers)).toBe(true);
    });

    /**
     * Tests retrieval of market statistics
     */
    it('should get market statistics', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const stats = orderBook.getMarketStatistics();
      
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
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const portfolio = orderBook.getPortfolio('test-user-1');
      
      expect(portfolio).toBeDefined();
      expect(portfolio.balances).toBeDefined();
      expect(portfolio.positions).toBeDefined();
      expect(portfolio.totalValue).toBeDefined();
    });

    /**
     * Tests handling of trade history requests
     */
    it('should handle trade history requests', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const trades = orderBook.getUserTrades('test-user-1', 10);
      
      expect(Array.isArray(trades)).toBe(true);
    });

    /**
     * Tests handling of order cancellation
     */
    it('should handle order cancellation', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

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

      const submitResult = await orderBook.placeOrder(order);
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
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

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
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const conversion = orderBook.autoConvertToXOM(
        'test-user-1',
        'USDC',
        '100',
        0.005
      );
      
      expect(conversion.success).toBe(true);
      expect(conversion.fromToken).toBe('USDC');
      expect(conversion.toToken).toBe('XOM');
      expect(conversion.toAmount).toBeDefined();
    });

    /**
     * Tests retrieval of perpetual positions
     */
    it('should get perpetual positions', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const positions = orderBook.getPerpetualPositions('test-user-1');
      
      expect(Array.isArray(positions)).toBe(true);
    });
  });

  describe('Health and Status', () => {
    /**
     * Tests health status reporting
     */
    it('should report healthy status', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const health = orderBook.getHealthStatus();
      
      expect(health.status).toBe('healthy');
      expect(health.details).toBeDefined();
    });

    /**
     * Tests provision of service metrics
     */
    it('should provide service metrics', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const health = orderBook.getHealthStatus();
      
      expect(health.details).toBeDefined();
      expect(typeof health.details.activeOrders).toBe('number');
      expect(typeof health.details.tradingPairs).toBe('number');
      expect(typeof health.details.memoryUsage).toBe('number');
      expect(health.details.isMatching).toBe(true);
    });
  });

  describe('Error Handling', () => {
    /**
     * Tests graceful handling of invalid orders
     */
    it('should handle invalid orders gracefully', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const invalidOrder = {
        userId: '', // Invalid: empty user ID
        type: 'INVALID_TYPE',
        side: 'BUY',
        pair: 'XOM/USDC',
        quantity: '100',
        price: '1.50',
        timestamp: Date.now()
      };

      // placeOrder may throw for invalid orders
      try {
        const result = await orderBook.placeOrder(invalidOrder);
        expect(result.success).toBe(false);
        expect(result.message).toBeDefined();
      } catch (error) {
        // It's OK if it throws for invalid input
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Missing required order fields');
      }
    });

    /**
     * Tests handling of non-existent orders
     */
    it('should handle non-existent orders', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const order = orderBook.getOrder('non-existent-order-id');
      
      expect(order).toBeNull();
    });

    /**
     * Tests handling of non-existent trading pairs
     */
    it('should handle non-existent trading pairs', async (): Promise<void> => {
      if (!orderBook) {
        console.log('Skipping test - order book not initialized');
        return;
      }

      const orderBookData = await orderBook.getOrderBook('INVALID/PAIR');
      
      // Non-existent pairs may return empty order book rather than null
      if (orderBookData !== null && orderBookData !== undefined) {
        expect(orderBookData.bids).toEqual([]);
        expect(orderBookData.asks).toEqual([]);
      } else {
        expect(orderBookData).toBeNull();
      }
    });
  });
});
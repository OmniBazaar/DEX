/**
 * DEX Validator Integration Tests
 * 
 * Tests the integration between the DEX module and Validator services
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

  beforeAll(async () => {
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

  afterAll(async () => {
    if (validatorClient) {
      await validatorClient.disconnect();
    }
    if (orderBook) {
      await orderBook.shutdown();
    }
  });

  describe('Order Book Integration', () => {
    it('should submit orders successfully', async () => {
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

    it('should retrieve orders successfully', async () => {
      const orders = await orderBook.getUserOrders('test-user-1');
      
      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
    });

    it('should get trading pairs', async () => {
      const pairs = await orderBook.getTradingPairs();
      
      expect(Array.isArray(pairs)).toBe(true);
    });

    it('should get order book data', async () => {
      const orderBookData = await orderBook.getOrderBook('XOM/USDC');
      
      expect(orderBookData).toBeDefined();
      expect(orderBookData?.timestamp).toBeDefined();
    });
  });

  describe('Market Data Integration', () => {
    it('should get ticker data', async () => {
      const ticker = await orderBook.getTicker('XOM/USDC');
      
      expect(ticker).toBeDefined();
      expect(ticker.symbol).toBe('XOM/USDC');
      expect(ticker.timestamp).toBeDefined();
    });

    it('should get all tickers', async () => {
      const tickers = await orderBook.getAllTickers();
      
      expect(Array.isArray(tickers)).toBe(true);
    });

    it('should get market statistics', async () => {
      const stats = await orderBook.getMarketStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.timestamp).toBeDefined();
      expect(typeof stats.activePairs).toBe('number');
    });
  });

  describe('Trading Operations', () => {
    it('should handle portfolio requests', async () => {
      const portfolio = await orderBook.getPortfolio('test-user-1');
      
      expect(portfolio).toBeDefined();
      expect(portfolio.balances).toBeDefined();
      expect(portfolio.positions).toBeDefined();
      expect(portfolio.totalValue).toBeDefined();
    });

    it('should handle trade history requests', async () => {
      const trades = await orderBook.getUserTrades('test-user-1', {
        limit: 10,
        offset: 0
      });
      
      expect(Array.isArray(trades)).toBe(true);
    });

    it('should handle order cancellation', async () => {
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
      const cancelResult = await orderBook.cancelOrder(submitResult.orderId!, 'test-user-1');
      expect(cancelResult.success).toBe(true);
    });
  });

  describe('Advanced Features', () => {
    it('should handle perpetual orders', async () => {
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

    it('should handle auto-conversion', async () => {
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

    it('should get perpetual positions', async () => {
      const positions = await orderBook.getPerpetualPositions('test-user-1');
      
      expect(Array.isArray(positions)).toBe(true);
    });
  });

  describe('Health and Status', () => {
    it('should report healthy status', async () => {
      const health = await orderBook.getHealthStatus();
      
      expect(health.status).toBe('healthy');
      expect(health.details).toBeDefined();
    });

    it('should provide service metrics', async () => {
      const health = await orderBook.getHealthStatus();
      
      expect(health.details.totalOrders).toBeDefined();
      expect(health.details.activeOrders).toBeDefined();
      expect(health.details.tradingPairs).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid orders gracefully', async () => {
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

    it('should handle non-existent orders', async () => {
      const order = await orderBook.getOrder('non-existent-order-id');
      
      expect(order).toBeNull();
    });

    it('should handle non-existent trading pairs', async () => {
      const orderBookData = await orderBook.getOrderBook('INVALID/PAIR');
      
      expect(orderBookData).toBeNull();
    });
  });
});
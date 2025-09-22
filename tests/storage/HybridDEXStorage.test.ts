/**
 * Integration tests for HybridDEXStorage
 *
 * Tests the multi-tier storage architecture with hot (memory/Redis),
 * warm (PostgreSQL), and cold (IPFS) storage tiers using real implementations.
 *
 * @module tests/storage/HybridDEXStorage.test
 */

import { HybridDEXStorage, StorageConfig } from '../../src/storage/HybridDEXStorage';
import { UnifiedOrder } from '../../src/types/config';

describe('HybridDEXStorage', () => {
  let storage: HybridDEXStorage;
  let testConfig: StorageConfig;

  beforeEach(() => {
    // Use in-memory only configuration for tests
    testConfig = {
      redis: {
        host: '',
        port: 0
      },
      postgresql: {
        host: '',
        port: 0,
        database: '',
        user: '',
        password: ''
      },
      ipfs: {
        host: '',
        port: 0,
        protocol: ''
      },
      archival: {
        threshold: 1, // Archive after 1 day for testing
        batchSize: 10
      }
    };

    storage = new HybridDEXStorage(testConfig);
  });

  afterEach(async () => {
    // Shutdown storage if initialized
    if (storage && (storage as any).isInitialized) {
      await storage.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize with in-memory storage when external services are not available', async () => {
      await storage.initialize();

      expect(storage).toBeDefined();
      expect((storage as any).isInitialized).toBe(true);

      // Should work with in-memory storage only
      const stats = await storage.getStats();
      expect(stats.hot.inMemory).toBe(0);
      expect(stats.hot.redis).toBe(0);
      expect(stats.warm.postgresql).toBe(0);
    });

    it('should throw error if already initialized', async () => {
      await storage.initialize();

      await expect(storage.initialize()).rejects.toThrow('Storage already initialized');
    });

    it('should handle configuration with valid Redis/PostgreSQL', async () => {
      // Create a new instance with external service configuration
      const externalConfig: StorageConfig = {
        redis: {
          host: 'localhost',
          port: 6379,
          db: 15 // Use separate DB for tests
        },
        postgresql: {
          host: 'localhost',
          port: 5432,
          database: 'dex_test',
          user: 'test',
          password: 'test',
          max: 5
        },
        ipfs: {
          host: 'localhost',
          port: 5001,
          protocol: 'http'
        },
        archival: {
          threshold: 7,
          batchSize: 100
        }
      };

      const externalStorage = new HybridDEXStorage(externalConfig);

      // Initialize - will fail to connect but should handle gracefully
      await externalStorage.initialize();
      expect(externalStorage).toBeDefined();

      await externalStorage.shutdown();
    });
  });

  describe('Order Placement and Retrieval', () => {
    const createMockOrder = (id: string, overrides?: Partial<UnifiedOrder>): UnifiedOrder => {
      const defaults = {
        id,
        userId: 'user-456',
        type: 'LIMIT' as const,
        side: 'BUY' as const,
        pair: 'XOM/USDT',
        quantity: '100',
        price: '2.45',
        status: 'OPEN' as const,
        filled: '0',
        remaining: '100',
        averagePrice: '0',
        fees: '0',
        timestamp: Date.now(),
        updatedAt: Date.now()
      };
      const order = { ...defaults, ...overrides };
      // If quantity is overridden, update remaining to match
      if (overrides?.quantity && !overrides?.remaining) {
        order.remaining = overrides.quantity;
      }
      return order;
    };

    beforeEach(async () => {
      await storage.initialize();
    });

    it('should place order and verify it appears in order book', async () => {
      const order = createMockOrder('test-order-1');
      await storage.placeOrder(order);

      // Verify order appears in order book
      const orderBook = await storage.getOrderBook('XOM/USDT');
      expect(orderBook.pair).toBe('XOM/USDT');
      expect(orderBook.bids.length).toBe(1);
      expect(orderBook.bids[0].price).toBe('2.45');
      expect(orderBook.sourceNodes).toContain('in-memory');
    });

    it('should handle multiple order placements', async () => {
      const orders: UnifiedOrder[] = [
        createMockOrder('order-1', { price: '2.40' }),
        createMockOrder('order-2', { price: '2.45' }),
        createMockOrder('order-3', { price: '2.50', side: 'SELL' })
      ];

      for (const order of orders) {
        await storage.placeOrder(order);
      }

      // Check that all orders appear in the order book
      const orderBook = await storage.getOrderBook('XOM/USDT');
      expect(orderBook.bids.length).toBe(2); // Two buy orders
      expect(orderBook.asks.length).toBe(1); // One sell order
    });

    it('should aggregate orders at same price level', async () => {
      // Place multiple orders at same price
      await storage.placeOrder(createMockOrder('buy-1', { price: '2.45', quantity: '100' }));
      await storage.placeOrder(createMockOrder('buy-2', { price: '2.45', quantity: '200' }));
      await storage.placeOrder(createMockOrder('buy-3', { price: '2.44', quantity: '150' }));

      const orderBook = await storage.getOrderBook('XOM/USDT');

      // Should aggregate orders at same price
      const bidAt245 = orderBook.bids.find(bid => bid.price === '2.45');
      expect(bidAt245).toBeDefined();
      if (bidAt245) {
        expect(parseFloat(bidAt245.quantity)).toBe(300); // 100 + 200
        expect(bidAt245.orders).toBe(2);
      }
    });

    it('should support order book depth limits', async () => {
      // Place many orders
      for (let i = 0; i < 20; i++) {
        await storage.placeOrder(createMockOrder(`buy-${i}`, {
          side: 'BUY',
          price: (2.40 - i * 0.01).toFixed(2),
          quantity: '100'
        }));
        await storage.placeOrder(createMockOrder(`sell-${i}`, {
          side: 'SELL',
          price: (2.50 + i * 0.01).toFixed(2),
          quantity: '100'
        }));
      }

      // Get order book with depth limit
      const orderBook = await storage.getOrderBook('XOM/USDT', 5);

      expect(orderBook.bids.length).toBeLessThanOrEqual(5);
      expect(orderBook.asks.length).toBeLessThanOrEqual(5);
    });

    it('should handle empty order book', async () => {
      const orderBook = await storage.getOrderBook('EMPTY/PAIR');

      expect(orderBook.pair).toBe('EMPTY/PAIR');
      expect(orderBook.bids).toEqual([]);
      expect(orderBook.asks).toEqual([]);
      expect(orderBook.timestamp).toBeGreaterThan(0);
    });

    it('should handle orders without price (market orders)', async () => {
      const marketOrder = createMockOrder('market-1', {
        type: 'MARKET',
        price: undefined
      });

      await storage.placeOrder(marketOrder);

      // Market orders shouldn't appear in order book
      const orderBook = await storage.getOrderBook('XOM/USDT');
      expect(orderBook.bids.length).toBe(0);
    });
  });

  describe('Storage Statistics', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should return correct storage statistics', async () => {
      // Place some orders
      await storage.placeOrder({
        id: 'stat-1',
        userId: 'user-1',
        type: 'LIMIT',
        side: 'BUY',
        pair: 'XOM/USDT',
        quantity: '100',
        price: '2.45',
        status: 'OPEN',
        filled: '0',
        remaining: '100',
        timestamp: Date.now(),
        updatedAt: Date.now()
      });

      const stats = await storage.getStats();

      expect(stats.hot.inMemory).toBeGreaterThanOrEqual(0);
      expect(stats.hot.redis).toBe(0); // No Redis in test
      expect(stats.warm.postgresql).toBe(0); // No PostgreSQL in test
      expect(stats.cold.ipfs).toBe(0); // No IPFS in test
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should handle high-frequency order placement', async () => {
      const orderCount = 100;
      const orders: UnifiedOrder[] = [];

      // Generate orders
      for (let i = 0; i < orderCount; i++) {
        orders.push({
          id: `perf-order-${i}`,
          userId: 'user-perf',
          type: 'LIMIT',
          side: i % 2 === 0 ? 'BUY' : 'SELL',
          pair: 'XOM/USDT',
          quantity: '100',
          price: (2.40 + (i % 20) * 0.01).toFixed(2),
          status: 'OPEN',
          filled: '0',
          remaining: '100',
          timestamp: Date.now(),
          updatedAt: Date.now()
        });
      }

      const startTime = Date.now();

      // Place all orders
      await Promise.all(orders.map(order => storage.placeOrder(order)));

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTimePerOrder = totalTime / orderCount;

      // Should handle 100+ orders/second
      expect(avgTimePerOrder).toBeLessThan(10); // Less than 10ms per order
    });

    it('should efficiently retrieve large order books', async () => {
      // Place many orders
      const orderPromises = [];
      for (let i = 0; i < 50; i++) {
        orderPromises.push(storage.placeOrder({
          id: `book-buy-${i}`,
          userId: 'user-book',
          type: 'LIMIT',
          side: 'BUY',
          pair: 'XOM/USDT',
          quantity: '100',
          price: (2.40 - i * 0.001).toFixed(3),
          status: 'OPEN',
          filled: '0',
          remaining: '100',
          timestamp: Date.now(),
          updatedAt: Date.now()
        }));
        orderPromises.push(storage.placeOrder({
          id: `book-sell-${i}`,
          userId: 'user-book',
          type: 'LIMIT',
          side: 'SELL',
          pair: 'XOM/USDT',
          quantity: '100',
          price: (2.50 + i * 0.001).toFixed(3),
          status: 'OPEN',
          filled: '0',
          remaining: '100',
          timestamp: Date.now(),
          updatedAt: Date.now()
        }));
      }

      await Promise.all(orderPromises);

      const startTime = Date.now();
      const orderBook = await storage.getOrderBook('XOM/USDT');
      const endTime = Date.now();

      expect(orderBook.bids.length).toBeGreaterThan(0);
      expect(orderBook.asks.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(50); // Less than 50ms
    });
  });

  describe('Shutdown', () => {
    it('should shutdown cleanly', async () => {
      await storage.initialize();

      // Place some orders
      await storage.placeOrder({
        id: 'shutdown-test',
        userId: 'user-1',
        type: 'LIMIT',
        side: 'BUY',
        pair: 'XOM/USDT',
        quantity: '100',
        price: '2.45',
        status: 'OPEN',
        filled: '0',
        remaining: '100',
        timestamp: Date.now(),
        updatedAt: Date.now()
      });

      // Should shutdown without errors
      await expect(storage.shutdown()).resolves.not.toThrow();

      // Should not be able to place orders after shutdown
      await expect(storage.placeOrder({
        id: 'after-shutdown',
        userId: 'user-1',
        type: 'LIMIT',
        side: 'BUY',
        pair: 'XOM/USDT',
        quantity: '100',
        price: '2.45',
        status: 'OPEN',
        filled: '0',
        remaining: '100',
        timestamp: Date.now(),
        updatedAt: Date.now()
      })).rejects.toThrow();
    });

    it('should handle multiple shutdown calls', async () => {
      await storage.initialize();

      await storage.shutdown();
      // Second shutdown should not throw
      await expect(storage.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should handle concurrent order placement', async () => {
      const orders = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-${i}`,
        userId: 'user-456',
        type: 'LIMIT' as const,
        side: 'BUY' as const,
        pair: 'XOM/USDT',
        quantity: '100',
        price: `2.${40 + i}`,
        status: 'OPEN' as const,
        filled: '0',
        remaining: '100',
        timestamp: Date.now(),
        updatedAt: Date.now()
      }));

      // Place all orders concurrently
      const results = await Promise.all(orders.map(order => storage.placeOrder(order)));

      expect(results).toHaveLength(10);

      // Check order book has all orders
      const orderBook = await storage.getOrderBook('XOM/USDT');
      expect(orderBook.bids.length).toBeGreaterThan(0);
    });

    it('should handle large order quantities correctly', async () => {
      const largeOrder: UnifiedOrder = {
        id: 'large-order',
        userId: 'user-large',
        type: 'LIMIT',
        side: 'BUY',
        pair: 'XOM/USDT',
        quantity: '1000000000', // 1 billion units
        price: '0.0000001', // Very small price
        status: 'OPEN',
        filled: '0',
        remaining: '1000000000',
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      await storage.placeOrder(largeOrder);

      const orderBook = await storage.getOrderBook('XOM/USDT');
      const bid = orderBook.bids.find(b => b.price === '0.0000001');
      expect(bid).toBeDefined();
      // Check that the quantity is approximately correct (within 0.0001%)
      const actualQty = parseFloat(bid?.quantity || '0');
      expect(actualQty).toBeGreaterThan(999999999);
      expect(actualQty).toBeLessThan(1000000001);
    });
  });
});
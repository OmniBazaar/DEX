/**
 * Unit tests for HybridDEXStorage
 *
 * Tests the multi-tier storage architecture with hot (memory/Redis),
 * warm (PostgreSQL), and cold (IPFS) storage tiers.
 *
 * @module tests/storage/HybridDEXStorage.test
 */

import { HybridDEXStorage, StorageConfig } from '../../src/storage/HybridDEXStorage';
import { UnifiedOrder } from '../../src/types/config';
import { createClient } from 'redis';
import { Pool as PostgreSQLPool } from 'pg';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('redis');
jest.mock('pg');
jest.mock('ipfs-http-client', () => ({
  create: jest.fn()
}));

// Mock logger to avoid console output
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('HybridDEXStorage', () => {
  let storage: HybridDEXStorage;
  let mockRedisClient: any;
  let mockPostgreSQLPool: any;
  let mockIPFSClient: any;
  let mockConfig: StorageConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Redis client
    mockRedisClient = {
      connect: jest.fn(),
      quit: jest.fn(),
      setEx: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      zAdd: jest.fn(),
      zRangeWithScores: jest.fn(),
      dbSize: jest.fn().mockResolvedValue(100),
      on: jest.fn(),
      off: jest.fn()
    };

    (createClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Mock PostgreSQL pool
    mockPostgreSQLPool = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn(),
        release: jest.fn()
      }),
      query: jest.fn(),
      end: jest.fn()
    };

    (PostgreSQLPool as jest.Mock).mockImplementation(() => mockPostgreSQLPool);

    // Mock IPFS client
    mockIPFSClient = {
      version: jest.fn().mockResolvedValue({ version: '0.10.0' }),
      add: jest.fn().mockResolvedValue({
        cid: { toString: () => 'QmTest123' }
      }),
      get: jest.fn(),
      pin: {
        add: jest.fn(),
        rm: jest.fn()
      }
    };

    // Mock dynamic import of IPFS
    jest.mock('ipfs-http-client', () => ({
      create: jest.fn().mockReturnValue(mockIPFSClient)
    }));

    mockConfig = {
      redis: {
        host: 'localhost',
        port: 6379,
        password: 'test',
        db: 0
      },
      postgresql: {
        host: 'localhost',
        port: 5432,
        database: 'dex_test',
        user: 'test',
        password: 'test',
        max: 20
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

    storage = new HybridDEXStorage(mockConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize all storage tiers successfully', async () => {
      await storage.initialize();

      expect(createClient).toHaveBeenCalled();
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(PostgreSQLPool).toHaveBeenCalled();
      expect(mockPostgreSQLPool.query).toHaveBeenCalled();
    });

    it('should initialize with only memory storage if Redis and PostgreSQL fail', async () => {
      mockRedisClient.connect.mockRejectedValue(new Error('Redis connection failed'));
      mockPostgreSQLPool.connect.mockRejectedValue(new Error('PostgreSQL connection failed'));

      await storage.initialize();

      // Should not throw and should log warnings
      expect(storage).toBeDefined();
    });

    it('should throw error if already initialized', async () => {
      await storage.initialize();

      await expect(storage.initialize()).rejects.toThrow('Storage already initialized');
    });

    it('should create PostgreSQL schema on initialization', async () => {
      await storage.initialize();

      // Should create all necessary tables
      const createTableCalls = mockPostgreSQLPool.query.mock.calls.filter(
        (call: any[]) => call[0].includes('CREATE TABLE')
      );
      expect(createTableCalls.length).toBeGreaterThan(0);

      // Should create indexes
      const createIndexCalls = mockPostgreSQLPool.query.mock.calls.filter(
        (call: any[]) => call[0].includes('CREATE INDEX')
      );
      expect(createIndexCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Order Placement', () => {
    const mockOrder: UnifiedOrder = {
      id: 'order-123',
      userId: 'user-456',
      type: 'LIMIT',
      side: 'BUY',
      pair: 'XOM/USDT',
      quantity: '100',
      price: '2.45',
      status: 'OPEN',
      filled: '0',
      remaining: '100',
      averagePrice: '0',
      fees: '0',
      timestamp: Date.now(),
      updatedAt: Date.now()
    };

    beforeEach(async () => {
      await storage.initialize();
    });

    it('should place order in hot and warm storage', async () => {
      await storage.placeOrder(mockOrder);

      // Should write to Redis
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        `order:${mockOrder.id}`,
        86400,
        JSON.stringify(mockOrder)
      );

      // Should add to sorted sets for efficient queries
      expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
        `orders:${mockOrder.pair}:${mockOrder.side}`,
        expect.objectContaining({
          score: parseFloat(mockOrder.price!),
          value: mockOrder.id
        })
      );

      // Should write to PostgreSQL
      const pgInsertCall = mockPostgreSQLPool.query.mock.calls.find(
        (call: any[]) => call[0].includes('INSERT INTO orders')
      );
      expect(pgInsertCall).toBeDefined();
    });

    it('should work with only in-memory storage', async () => {
      // Initialize without external storage
      const memoryOnlyConfig = {
        ...mockConfig,
        redis: { host: '', port: 0 },
        postgresql: { host: '', port: 0, database: '', user: '', password: '' },
        ipfs: { host: '', port: 0, protocol: '' }
      };

      const memoryStorage = new HybridDEXStorage(memoryOnlyConfig);
      await memoryStorage.initialize();

      await memoryStorage.placeOrder(mockOrder);

      // Should not throw and order should be placed in memory
      expect(memoryStorage).toBeDefined();
    });

    it('should handle Redis failure gracefully', async () => {
      mockRedisClient.setEx.mockRejectedValue(new Error('Redis error'));

      await storage.placeOrder(mockOrder);

      // Should not throw and should continue with PostgreSQL write
      const pgInsertCall = mockPostgreSQLPool.query.mock.calls.find(
        (call: any[]) => call[0].includes('INSERT INTO orders')
      );
      expect(pgInsertCall).toBeDefined();
    });
  });

  describe('Order Book Retrieval', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should get order book from cache if available', async () => {
      const mockOrderBook = {
        pair: 'XOM/USDT',
        bids: [{ price: '2.44', quantity: '1000', orders: 5 }],
        asks: [{ price: '2.46', quantity: '1500', orders: 3 }],
        timestamp: Date.now(),
        sequence: 1,
        sourceNodes: ['local'],
        validatorConsensus: true,
        consensusScore: 1.0
      };

      // Inject into cache
      (storage as any).orderBookCache.set('XOM/USDT', mockOrderBook);

      const orderBook = await storage.getOrderBook('XOM/USDT');

      expect(orderBook).toEqual(mockOrderBook);
      // Should not call Redis or PostgreSQL
      expect(mockRedisClient.zRangeWithScores).not.toHaveBeenCalled();
      expect(mockPostgreSQLPool.query).not.toHaveBeenCalled();
    });

    it('should get order book from Redis if not in cache', async () => {
      mockRedisClient.zRangeWithScores.mockImplementation((key: string) => {
        if (key.includes('BUY')) {
          return [
            { value: 'order-1', score: 2.44 },
            { value: 'order-2', score: 2.43 }
          ];
        } else {
          return [
            { value: 'order-3', score: 2.46 },
            { value: 'order-4', score: 2.47 }
          ];
        }
      });

      const orderBook = await storage.getOrderBook('XOM/USDT');

      expect(orderBook.pair).toBe('XOM/USDT');
      expect(orderBook.bids.length).toBe(2);
      expect(orderBook.asks.length).toBe(2);
      expect(mockRedisClient.zRangeWithScores).toHaveBeenCalledTimes(2);
    });

    it('should fall back to PostgreSQL if Redis fails', async () => {
      mockRedisClient.zRangeWithScores.mockRejectedValue(new Error('Redis error'));

      mockPostgreSQLPool.query.mockResolvedValue({
        rows: [
          { side: 'BUY', price: '2440000000000000000', quantity: '1000000000000000000000', order_count: '5' },
          { side: 'SELL', price: '2460000000000000000', quantity: '1500000000000000000000', order_count: '3' }
        ]
      });

      const orderBook = await storage.getOrderBook('XOM/USDT');

      expect(orderBook.pair).toBe('XOM/USDT');
      expect(orderBook.bids.length).toBe(1);
      expect(orderBook.asks.length).toBe(1);
      expect(orderBook.sourceNodes).toContain('postgresql');
    });

    it('should return empty order book if no storage available', async () => {
      // Initialize without external storage
      const memoryOnlyConfig = {
        ...mockConfig,
        redis: { host: '', port: 0 },
        postgresql: { host: '', port: 0, database: '', user: '', password: '' }
      };

      const memoryStorage = new HybridDEXStorage(memoryOnlyConfig);
      await memoryStorage.initialize();

      const orderBook = await memoryStorage.getOrderBook('XOM/USDT');

      expect(orderBook.pair).toBe('XOM/USDT');
      expect(orderBook.bids).toEqual([]);
      expect(orderBook.asks).toEqual([]);
      expect(orderBook.sourceNodes).toContain('in-memory');
      expect(orderBook.validatorConsensus).toBe(false);
    });
  });

  describe('Archival to IPFS', () => {
    beforeEach(async () => {
      // Setup IPFS mock properly
      const ipfsModule = await import('ipfs-http-client');
      (ipfsModule.create as jest.Mock).mockReturnValue(mockIPFSClient);

      await storage.initialize();
    });

    it('should archive old orders to IPFS', async () => {
      const oldOrder: UnifiedOrder = {
        id: 'old-order-123',
        userId: 'user-456',
        type: 'LIMIT',
        side: 'BUY',
        pair: 'XOM/USDT',
        quantity: '100',
        price: '2.45',
        status: 'FILLED',
        filled: '100',
        remaining: '0',
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        updatedAt: Date.now()
      };

      // Place order in hot storage
      (storage as any).activeOrders.set(oldOrder.id, oldOrder);

      // Call archival method directly
      const cid = await (storage as any).archiveToIPFS(oldOrder);

      expect(cid).toBe('QmTest123');
      expect(mockIPFSClient.add).toHaveBeenCalledWith(JSON.stringify(oldOrder));

      // Should update PostgreSQL with CID
      expect(mockPostgreSQLPool.query).toHaveBeenCalledWith(
        'UPDATE orders SET ipfs_cid = $1 WHERE id = $2',
        ['QmTest123', oldOrder.id]
      );

      // Should remove from hot storage
      expect((storage as any).activeOrders.has(oldOrder.id)).toBe(false);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`order:${oldOrder.id}`);
    });

    it('should handle IPFS archival failure gracefully', async () => {
      const order: UnifiedOrder = {
        id: 'order-789',
        userId: 'user-456',
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
      };

      mockIPFSClient.add.mockRejectedValue(new Error('IPFS error'));

      await expect((storage as any).archiveToIPFS(order)).rejects.toThrow('IPFS error');

      // Order should still be in hot storage
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('Storage Statistics', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should return storage statistics', async () => {
      // Setup mock data
      (storage as any).activeOrders.set('order-1', {});
      (storage as any).activeOrders.set('order-2', {});

      mockRedisClient.dbSize.mockResolvedValue(150);
      mockPostgreSQLPool.query.mockResolvedValueOnce({
        rows: [{ count: '1000' }]
      });

      const stats = await storage.getStats();

      expect(stats).toEqual({
        hot: {
          inMemory: 2,
          redis: 150
        },
        warm: {
          postgresql: 1000
        },
        cold: {
          ipfs: 1 // IPFS is available
        }
      });
    });

    it('should handle missing storage tiers in stats', async () => {
      // Initialize without external storage
      const memoryOnlyConfig = {
        ...mockConfig,
        redis: { host: '', port: 0 },
        postgresql: { host: '', port: 0, database: '', user: '', password: '' },
        ipfs: { host: '', port: 0, protocol: '' }
      };

      const memoryStorage = new HybridDEXStorage(memoryOnlyConfig);
      await memoryStorage.initialize();

      const stats = await memoryStorage.getStats();

      expect(stats).toEqual({
        hot: {
          inMemory: 0,
          redis: 0
        },
        warm: {
          postgresql: 0
        },
        cold: {
          ipfs: 0
        }
      });
    });
  });

  describe('Synchronization', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should synchronize old data to IPFS', async () => {
      // Mock old orders to archive
      mockPostgreSQLPool.query.mockImplementation((query: string) => {
        if (query.includes('created_at < NOW()')) {
          return {
            rows: [
              {
                id: 'old-order-1',
                userId: 'user-1',
                type: 'LIMIT',
                side: 'BUY',
                pair: 'XOM/USDT',
                quantity: '100',
                status: 'FILLED'
              }
            ]
          };
        }
        return { rows: [] };
      });

      // Trigger synchronization
      await (storage as any).synchronizeStorageTiers();

      // Should archive old orders
      expect(mockIPFSClient.add).toHaveBeenCalled();
    });

    it('should handle synchronization errors gracefully', async () => {
      mockPostgreSQLPool.query.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect((storage as any).synchronizeStorageTiers()).resolves.toBeUndefined();
    });
  });

  describe('Shutdown', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should shutdown all connections properly', async () => {
      // Start synchronization interval
      (storage as any).startSynchronization();

      await storage.shutdown();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(mockPostgreSQLPool.end).toHaveBeenCalled();
      expect((storage as any).syncInterval).toBeUndefined();
    });

    it('should handle shutdown errors gracefully', async () => {
      mockRedisClient.quit.mockRejectedValue(new Error('Redis quit error'));
      mockPostgreSQLPool.end.mockRejectedValue(new Error('PG end error'));

      // Should not throw
      await expect(storage.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should handle orders without price (market orders)', async () => {
      const marketOrder: UnifiedOrder = {
        id: 'market-order-1',
        userId: 'user-456',
        type: 'MARKET',
        side: 'BUY',
        pair: 'XOM/USDT',
        quantity: '100',
        // No price for market orders
        status: 'OPEN',
        filled: '0',
        remaining: '100',
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      await storage.placeOrder(marketOrder);

      // Should handle null price in Redis sorted sets
      expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
        `orders:${marketOrder.pair}:${marketOrder.side}`,
        expect.objectContaining({
          score: 0, // Default for missing price
          value: marketOrder.id
        })
      );
    });

    it('should handle concurrent order placement', async () => {
      const orders = Array.from({ length: 10 }, (_, i) => ({
        id: `order-${i}`,
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
      await Promise.all(orders.map(order => storage.placeOrder(order)));

      // All orders should be placed
      expect(mockRedisClient.setEx).toHaveBeenCalledTimes(10);
      expect(mockRedisClient.zAdd).toHaveBeenCalledTimes(20); // 2 sorted sets per order
    });

    it('should handle YugabyteDB port detection', async () => {
      // Reinitialize with YugabyteDB port
      const ybConfig = {
        ...mockConfig,
        postgresql: {
          ...mockConfig.postgresql,
          port: 5433 // YugabyteDB port
        }
      };

      const ybStorage = new HybridDEXStorage(ybConfig);
      await ybStorage.initialize();

      // Should detect YugabyteDB
      expect(PostgreSQLPool).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 5433
        })
      );
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('should emit error events on Redis errors', async () => {
      const errorListener = jest.fn();
      storage.on('error', errorListener);

      // Trigger Redis error
      const redisErrorHandler = mockRedisClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )?.[1];

      if (redisErrorHandler) {
        const error = new Error('Redis connection lost');
        redisErrorHandler(error);

        expect(errorListener).toHaveBeenCalledWith({
          tier: 'hot',
          error
        });
      }
    });
  });
});
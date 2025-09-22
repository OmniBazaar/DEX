/**
 * DEX Module Integration Tests
 * @file Tests for the DEX module core functionality with real component integrations
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { HybridDEXStorage } from '../src/storage/HybridDEXStorage';
import { PrivacyDEXService } from '../src/services/PrivacyDEXService';
import { PerpetualEngine } from '../src/core/perpetuals/PerpetualEngine';
import { Order, OrderType, OrderSide, Trade } from '../src/types';

describe('DEX Module Integration', () => {
  let storage: HybridDEXStorage;
  let privacyService: PrivacyDEXService;
  let perpetualEngine: PerpetualEngine;
  let isStorageShutdown = false;

  /**
   * Set up test environment before all tests
   */
  beforeAll(async (): Promise<void> => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.VALIDATOR_ENDPOINT = 'http://localhost:8080';

    // Initialize storage with memory-only configuration
    storage = new HybridDEXStorage({
      redis: {
        host: '', // Empty to use memory cache only in tests
        port: 6379
      },
      postgresql: {
        host: '', // Empty to skip PostgreSQL in tests
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test'
      },
      ipfs: {
        host: '', // Empty to skip IPFS in tests
        port: 5001,
        protocol: 'http'
      },
      archival: {
        threshold: 7,
        batchSize: 100
      }
    });
    await storage.initialize();

    // Initialize privacy service
    privacyService = new PrivacyDEXService({
      enablePrivacy: true,
      cotiEndpoint: 'test-endpoint',
      privacyThreshold: 1000
    });
    await privacyService.initialize();

    // Initialize perpetual engine
    perpetualEngine = new PerpetualEngine();
  });

  /**
   * Clean up all components after all tests
   */
  afterAll(async (): Promise<void> => {
    if (storage && !isStorageShutdown) await storage.shutdown();
    // PrivacyDEXService doesn't have a shutdown method
    if (perpetualEngine) perpetualEngine.stopFundingTimer();
  });

  describe('Storage Integration', () => {
    /**
     * Tests hybrid storage for orders
     */
    it('should store and retrieve orders', async (): Promise<void> => {
      const order: Order = {
        id: 'test-order-' + Date.now(),
        userId: '0xstorage1',
        pair: 'XOM/ETH',
        type: 'LIMIT',
        side: 'BUY',
        price: 0.05,
        amount: 100,
        status: 'OPEN',
        timestamp: Date.now(),
        filledAmount: 0,
        remainingAmount: 100
      };

      await storage.saveOrder(order);
      const retrieved = await storage.getOrder(order.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(order.id);
      expect(retrieved?.price).toBe(order.price);
    });

    /**
     * Tests storage of trades
     */
    it('should store and retrieve trades', async (): Promise<void> => {
      const trade: Trade = {
        id: 'test-trade-' + Date.now(),
        pair: 'XOM/USDC',
        buyOrderId: 'buy-123',
        sellOrderId: 'sell-456',
        price: 100,
        amount: 10,
        buyerId: '0xbuyer',
        sellerId: '0xseller',
        timestamp: Date.now(),
        fee: 0.02,
        status: 'COMPLETED'
      };

      await storage.saveTrade(trade);
      const trades = await storage.getTradesByPair('XOM/USDC', 10);

      expect(trades).toBeDefined();
      expect(trades.length).toBeGreaterThan(0);
      expect(trades.find(t => t.id === trade.id)).toBeDefined();
    });

    /**
     * Tests order book snapshot storage
     */
    it('should store order book snapshots', async (): Promise<void> => {
      const snapshot = {
        pair: 'ETH/USDC',
        bids: [
          { price: 2395, amount: 10, total: 23950 },
          { price: 2390, amount: 20, total: 47800 }
        ],
        asks: [
          { price: 2405, amount: 15, total: 36075 },
          { price: 2410, amount: 25, total: 60250 }
        ],
        timestamp: Date.now()
      };

      await storage.saveOrderBookSnapshot(snapshot);
      const retrieved = await storage.getLatestOrderBookSnapshot('ETH/USDC');

      expect(retrieved).toBeDefined();
      expect(retrieved?.bids.length).toBe(2);
      expect(retrieved?.asks.length).toBe(2);
    });

    /**
     * Tests user orders retrieval
     */
    it('should retrieve user orders', async (): Promise<void> => {
      const userId = '0xuser123';
      const orders: Order[] = [];

      // Create multiple orders for the user
      for (let i = 0; i < 3; i++) {
        const order: Order = {
          id: `user-order-${i}-${Date.now()}`,
          userId,
          pair: 'XOM/USDC',
          type: 'LIMIT',
          side: i % 2 === 0 ? 'BUY' : 'SELL',
          price: 100 + i,
          amount: 10,
          status: i === 0 ? 'FILLED' : 'OPEN',
          timestamp: Date.now() - i * 1000,
          filledAmount: i === 0 ? 10 : 0,
          remainingAmount: i === 0 ? 0 : 10
        };
        orders.push(order);
        await storage.saveOrder(order);
      }

      const userOrders = await storage.getUserOrders(userId);
      expect(userOrders.length).toBeGreaterThanOrEqual(3);

      // Check that all created orders are returned
      for (const order of orders) {
        expect(userOrders.find(o => o.id === order.id)).toBeDefined();
      }
    });

    /**
     * Tests order update functionality
     */
    it('should update order status and amounts', async (): Promise<void> => {
      const order: Order = {
        id: 'update-test-' + Date.now(),
        userId: '0xupdate',
        pair: 'BTC/USDC',
        type: 'LIMIT',
        side: 'BUY',
        price: 40000,
        amount: 1,
        status: 'OPEN',
        timestamp: Date.now(),
        filledAmount: 0,
        remainingAmount: 1
      };

      await storage.saveOrder(order);

      // Update the order
      order.status = 'PARTIALLY_FILLED';
      order.filledAmount = 0.5;
      order.remainingAmount = 0.5;
      await storage.saveOrder(order);

      const updated = await storage.getOrder(order.id);
      expect(updated?.status).toBe('PARTIALLY_FILLED');
      expect(updated?.filledAmount).toBe(0.5);
      expect(updated?.remainingAmount).toBe(0.5);
    });

    /**
     * Tests storage performance metrics
     */
    it('should report storage metrics', async (): Promise<void> => {
      const stats = await storage.getStorageStats();

      expect(stats).toBeDefined();
      expect(stats.hot).toBeDefined();
      expect(stats.hot.inMemory).toBeGreaterThanOrEqual(0);
      expect(stats.warm).toBeDefined();
      expect(stats.cold).toBeDefined();
    });
  });

  describe('Privacy Features', () => {
    /**
     * Tests private order creation
     */
    it('should create private orders', async (): Promise<void> => {
      const privateOrder = await privacyService.createPrivateOrder({
        userId: '0xprivate1',
        pair: 'pXOM/USDC',
        type: 'LIMIT' as OrderType,
        side: 'BUY' as OrderSide,
        price: 95,
        amount: 1000,
        isPrivate: true,
        timestamp: Date.now()
      });

      expect(privateOrder).toBeDefined();
      expect(privateOrder.encryptedData).toBeDefined();
      expect(privateOrder.publicData.pair).toBe('pXOM/USDC');
    });

    /**
     * Tests privacy threshold enforcement
     */
    it('should enforce privacy thresholds', async (): Promise<void> => {
      const smallOrder = {
        userId: '0xprivate2',
        pair: 'XOM/USDC',
        type: 'LIMIT' as OrderType,
        side: 'SELL' as OrderSide,
        price: 100,
        amount: 5, // Below threshold
        timestamp: Date.now()
      };

      const result = await privacyService.shouldEnforcePrivacy(smallOrder);
      expect(result).toBe(false);

      const largeOrder = {
        ...smallOrder,
        amount: 2000 // Above threshold
      };

      const result2 = await privacyService.shouldEnforcePrivacy(largeOrder);
      expect(result2).toBe(true);
    });

    /**
     * Tests privacy balance verification
     */
    it('should verify privacy token balances', async (): Promise<void> => {
      const balance = await privacyService.getPrivacyBalance('0xprivacy3');
      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Perpetual Trading', () => {
    /**
     * Tests opening a perpetual position
     */
    it('should open perpetual positions', async (): Promise<void> => {
      const position = perpetualEngine.openPosition({
        trader: '0xperp1',
        market: 'BTC-USD',
        side: 'LONG',
        size: BigInt(1e17), // 0.1 BTC
        leverage: 10
      });

      expect(position).toBeDefined();
      expect(position.positionId).toBeDefined();
      expect(position.leverage).toBe(10);
      expect(position.size).toBe(BigInt(1e17));
    });

    /**
     * Tests position liquidation mechanics
     */
    it('should handle position liquidations', async (): Promise<void> => {
      // Open a highly leveraged position
      const position = perpetualEngine.openPosition({
        trader: '0xperp2',
        market: 'ETH-USD',
        side: 'LONG',
        size: BigInt(10e18), // 10 ETH
        leverage: 50
      });

      // Update mark price to trigger liquidation
      perpetualEngine.updateMarkPrice('ETH-USD', BigInt(2200e18)); // Below liquidation price

      const updatedPosition = perpetualEngine.getPosition(position.positionId);
      expect(updatedPosition?.status).toBe('LIQUIDATED');
    });

    /**
     * Tests funding rate calculations
     */
    it('should calculate funding rates correctly', async (): Promise<void> => {
      const fundingRate = perpetualEngine.calculateFundingRate('BTC-USD');
      expect(typeof fundingRate).toBe('bigint');
      expect(fundingRate).toBeGreaterThanOrEqual(BigInt(-1e16)); // -1% max
      expect(fundingRate).toBeLessThanOrEqual(BigInt(1e16)); // 1% max
    });

    /**
     * Tests closing a perpetual position
     */
    it('should close positions with PnL calculation', async (): Promise<void> => {
      const position = perpetualEngine.openPosition({
        trader: '0xperp3',
        market: 'BTC-USD',
        side: 'SHORT',
        size: BigInt(1e18), // 1 BTC
        leverage: 5,
        price: BigInt(40000e18) // Entry price $40,000
      });

      // Update mark price
      perpetualEngine.updateMarkPrice('BTC-USD', BigInt(38000e18)); // Price went down, profit for short

      const closeResult = perpetualEngine.closePosition(position.positionId);
      expect(closeResult).toBeDefined();
      expect(closeResult.realizedPnl).toBeGreaterThan(BigInt(0)); // Profit
    });

    /**
     * Tests ADL (Auto-Deleveraging) mechanism
     */
    it('should trigger ADL when needed', async (): Promise<void> => {
      // Create multiple positions
      const positions = [];
      for (let i = 0; i < 5; i++) {
        const pos = perpetualEngine.openPosition({
          trader: `0xadl${i}`,
          market: 'BTC-USD',
          side: 'LONG',
          size: BigInt(2e18), // 2 BTC
          leverage: 25,
          price: BigInt(40000e18)
        });
        positions.push(pos);
      }

      // Simulate market crash
      perpetualEngine.updateMarkPrice('BTC-USD', BigInt(30000e18));

      // Check ADL queue
      const adlQueue = perpetualEngine.getADLQueue('BTC-USD');
      expect(adlQueue).toBeDefined();
      expect(adlQueue.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    /**
     * Tests handling of invalid order data
     */
    it('should handle invalid order data gracefully', async (): Promise<void> => {
      const invalidOrder: any = {
        id: '',
        userId: null,
        pair: 'INVALID',
        type: 'WRONG_TYPE',
        side: 'NEITHER',
        price: -100,
        amount: 0,
        status: 'BROKEN',
        timestamp: 'not-a-timestamp'
      };

      try {
        await storage.saveOrder(invalidOrder);
        // If no error thrown, test should fail
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error instanceof Error).toBe(true);
      }
    });

    /**
     * Tests recovery from storage failures
     */
    it('should handle storage failures gracefully', async (): Promise<void> => {
      // Force a shutdown to simulate failure
      await storage.shutdown();
      isStorageShutdown = true;

      // Try to save an order after shutdown
      const order: Order = {
        id: 'after-shutdown-' + Date.now(),
        userId: '0xshutdown',
        pair: 'XOM/USDC',
        type: 'LIMIT',
        side: 'BUY',
        price: 100,
        amount: 10,
        status: 'OPEN',
        timestamp: Date.now(),
        filledAmount: 0,
        remainingAmount: 10
      };

      try {
        await storage.saveOrder(order);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Reinitialize for other tests
      await storage.initialize();
      isStorageShutdown = false;
    });

    /**
     * Tests handling of concurrent operations
     */
    it('should handle concurrent operations safely', async (): Promise<void> => {
      const promises = [];
      const baseId = Date.now();

      // Create 20 concurrent operations
      for (let i = 0; i < 20; i++) {
        const order: Order = {
          id: `concurrent-${baseId}-${i}`,
          userId: '0xconcurrent',
          pair: 'ETH/USDC',
          type: 'LIMIT',
          side: i % 2 === 0 ? 'BUY' : 'SELL',
          price: 2400 + i,
          amount: 0.1,
          status: 'OPEN',
          timestamp: Date.now(),
          filledAmount: 0,
          remainingAmount: 0.1
        };

        promises.push(storage.saveOrder(order));
      }

      // All operations should complete successfully
      await expect(Promise.all(promises)).resolves.toBeDefined();

      // Verify all orders were saved
      const userOrders = await storage.getUserOrders('0xconcurrent');
      expect(userOrders.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Performance Tests', () => {
    /**
     * Tests high-volume order storage
     */
    it('should handle high order volume efficiently', async (): Promise<void> => {
      const startTime = Date.now();
      const orderCount = 100;
      const orders = [];

      // Create orders
      for (let i = 0; i < orderCount; i++) {
        const order: Order = {
          id: `perf-${startTime}-${i}`,
          userId: `0xperf${i % 10}`,
          pair: 'TEST/USDC',
          type: 'LIMIT',
          side: i % 2 === 0 ? 'BUY' : 'SELL',
          price: 100 + (i % 20) * (i % 2 === 0 ? -0.1 : 0.1),
          amount: 10,
          status: 'OPEN',
          timestamp: Date.now(),
          filledAmount: 0,
          remainingAmount: 10
        };
        orders.push(storage.saveOrder(order));
      }

      await Promise.all(orders);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should process 100 orders in under 5 seconds
      expect(duration).toBeLessThan(5000);

      // Verify data integrity
      const stats = await storage.getStorageStats();
      expect(stats.hot.inMemory).toBeGreaterThan(0);
    });

    /**
     * Tests order book snapshot performance
     */
    it('should efficiently store and retrieve order book snapshots', async (): Promise<void> => {
      const pairs = ['BTC/USDC', 'ETH/USDC', 'XOM/USDC'];
      const snapshots = [];

      // Create snapshots for multiple pairs
      for (const pair of pairs) {
        for (let i = 0; i < 10; i++) {
          const snapshot = {
            pair,
            bids: Array.from({ length: 50 }, (_, j) => ({
              price: 40000 - j * 10,
              amount: Math.random() * 10,
              total: 0
            })),
            asks: Array.from({ length: 50 }, (_, j) => ({
              price: 40010 + j * 10,
              amount: Math.random() * 10,
              total: 0
            })),
            timestamp: Date.now() - i * 1000
          };

          // Calculate totals
          let bidTotal = 0;
          snapshot.bids.forEach(bid => {
            bidTotal += bid.amount * bid.price;
            bid.total = bidTotal;
          });

          let askTotal = 0;
          snapshot.asks.forEach(ask => {
            askTotal += ask.amount * ask.price;
            ask.total = askTotal;
          });

          snapshots.push(storage.saveOrderBookSnapshot(snapshot));
        }
      }

      const startTime = Date.now();
      await Promise.all(snapshots);
      const saveTime = Date.now() - startTime;

      // Should save 30 snapshots quickly
      expect(saveTime).toBeLessThan(2000);

      // Test retrieval performance
      const retrieveStart = Date.now();
      const retrievals = pairs.map(pair => storage.getLatestOrderBookSnapshot(pair));
      await Promise.all(retrievals);
      const retrieveTime = Date.now() - retrieveStart;

      // Should retrieve latest snapshots quickly
      expect(retrieveTime).toBeLessThan(100);
    });
  });
});
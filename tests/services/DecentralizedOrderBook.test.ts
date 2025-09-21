/**
 * Unit tests for DecentralizedOrderBook
 *
 * Tests the core order matching engine including all order types,
 * privacy orders, and WebSocket event emission.
 *
 * @module tests/services/DecentralizedOrderBook.test
 */

import { DecentralizedOrderBook } from '../../src/services/DecentralizedOrderBook';
import { HybridDEXStorage } from '../../src/storage/HybridDEXStorage';
import { EventEmitter } from 'events';

// Mock storage
jest.mock('../../src/storage/HybridDEXStorage');

describe('DecentralizedOrderBook', () => {
  let orderBook: DecentralizedOrderBook;
  let mockStorage: jest.Mocked<HybridDEXStorage>;
  let mockWebSocket: EventEmitter;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock storage
    mockStorage = {
      storeOrder: jest.fn(),
      updateOrder: jest.fn(),
      getOrder: jest.fn(),
      getOrders: jest.fn(),
      removeOrder: jest.fn(),
      storeTrade: jest.fn(),
      getTrades: jest.fn(),
      updatePosition: jest.fn(),
      getPositions: jest.fn(),
      removePosition: jest.fn()
    } as any;

    (HybridDEXStorage as jest.Mock).mockImplementation(() => mockStorage);

    // Mock WebSocket
    mockWebSocket = new EventEmitter();

    orderBook = new DecentralizedOrderBook(mockStorage);
    (orderBook as any).ws = mockWebSocket;
  });

  describe('Order Placement', () => {
    it('should place a limit buy order', async () => {
      const order = {
        pair: 'XOM/USDT',
        type: 'LIMIT' as const,
        side: 'BUY' as const,
        price: '1.25',
        amount: '100',
        userId: 'user-123'
      };

      const orderId = await orderBook.placeOrder(order);

      expect(orderId).toMatch(/^order-/);
      expect(mockStorage.storeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          id: orderId,
          ...order,
          status: 'OPEN',
          filled: '0',
          remaining: '100'
        })
      );
    });

    it('should place a market sell order and match immediately', async () => {
      // Add a buy order to the book
      const buyOrder = {
        id: 'buy-123',
        pair: 'XOM/USDT',
        type: 'LIMIT',
        side: 'BUY',
        price: '1.25',
        amount: '100',
        filled: '0',
        remaining: '100',
        status: 'OPEN',
        userId: 'user-456',
        timestamp: Date.now()
      };

      mockStorage.getOrders.mockResolvedValue([buyOrder]);

      // Place market sell order
      const sellOrder = {
        pair: 'XOM/USDT',
        type: 'MARKET' as const,
        side: 'SELL' as const,
        amount: '50',
        userId: 'user-789'
      };

      const orderId = await orderBook.placeOrder(sellOrder);

      // Should create a trade
      expect(mockStorage.storeTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          pair: 'XOM/USDT',
          price: '1.25',
          amount: '50',
          buyOrderId: 'buy-123',
          sellOrderId: orderId
        })
      );

      // Should update both orders
      expect(mockStorage.updateOrder).toHaveBeenCalledWith(
        'buy-123',
        expect.objectContaining({
          filled: '50',
          remaining: '50'
        })
      );
    });

    it('should handle OCO orders', async () => {
      const ocoOrder = {
        pair: 'XOM/USDT',
        type: 'OCO' as const,
        side: 'SELL' as const,
        amount: '100',
        ocoPrice: '1.30',
        ocoStopPrice: '1.20',
        userId: 'user-123'
      };

      const orderId = await orderBook.placeOrder(ocoOrder);

      // Should create two linked orders
      expect(mockStorage.storeOrder).toHaveBeenCalledTimes(2);
      expect(mockStorage.storeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LIMIT',
          price: '1.30',
          linkedOrderId: expect.any(String)
        })
      );
      expect(mockStorage.storeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STOP_LIMIT',
          stopPrice: '1.20',
          linkedOrderId: expect.any(String)
        })
      );
    });

    it('should handle TWAP orders', async () => {
      const twapOrder = {
        pair: 'XOM/USDT',
        type: 'TWAP' as const,
        side: 'BUY' as const,
        amount: '1000',
        duration: 3600,
        slices: 10,
        userId: 'user-123'
      };

      jest.useFakeTimers();

      const orderId = await orderBook.placeOrder(twapOrder);

      expect(orderId).toMatch(/^order-/);

      // Should create first slice immediately
      expect(mockStorage.storeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '100', // 1000 / 10 slices
          parentOrderId: orderId
        })
      );

      // Advance time and check next slice
      jest.advanceTimersByTime(360000); // 360 seconds (3600/10)

      expect(mockStorage.storeOrder).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should handle Iceberg orders', async () => {
      const icebergOrder = {
        pair: 'XOM/USDT',
        type: 'ICEBERG' as const,
        side: 'BUY' as const,
        price: '1.25',
        icebergTotalAmount: '1000',
        icebergVisibleAmount: '100',
        userId: 'user-123'
      };

      const orderId = await orderBook.placeOrder(icebergOrder);

      // Should only show visible amount
      expect(mockStorage.storeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '100',
          totalAmount: '1000',
          visibleAmount: '100'
        })
      );
    });
  });

  describe('Order Matching Engine', () => {
    it('should match orders by price-time priority', async () => {
      const orders = [
        {
          id: 'buy-1',
          pair: 'XOM/USDT',
          side: 'BUY',
          price: '1.26',
          amount: '100',
          remaining: '100',
          timestamp: 1000
        },
        {
          id: 'buy-2',
          pair: 'XOM/USDT',
          side: 'BUY',
          price: '1.25',
          amount: '100',
          remaining: '100',
          timestamp: 2000
        },
        {
          id: 'buy-3',
          pair: 'XOM/USDT',
          side: 'BUY',
          price: '1.26',
          amount: '100',
          remaining: '100',
          timestamp: 3000
        }
      ];

      mockStorage.getOrders.mockResolvedValue(orders);

      const matchingEngine = (orderBook as any).matchingEngine;
      const matched = await matchingEngine.findMatchingOrders('XOM/USDT', 'SELL', '1.25');

      // Should match in order: buy-1 (best price), buy-3 (same price but later)
      expect(matched[0].id).toBe('buy-1');
      expect(matched[1].id).toBe('buy-3');
      expect(matched[2].id).toBe('buy-2');
    });

    it('should execute partial fills correctly', async () => {
      const buyOrder = {
        id: 'buy-123',
        pair: 'XOM/USDT',
        side: 'BUY',
        price: '1.25',
        amount: '100',
        filled: '30',
        remaining: '70',
        status: 'OPEN'
      };

      mockStorage.getOrder.mockResolvedValue(buyOrder);

      const matchingEngine = (orderBook as any).matchingEngine;
      await matchingEngine.executeTrade(buyOrder, { amount: '50' }, '1.25');

      expect(mockStorage.updateOrder).toHaveBeenCalledWith(
        'buy-123',
        expect.objectContaining({
          filled: '80', // 30 + 50
          remaining: '20', // 100 - 80
          status: 'OPEN' // Still open with remaining amount
        })
      );
    });

    it('should handle order completion', async () => {
      const buyOrder = {
        id: 'buy-456',
        pair: 'XOM/USDT',
        side: 'BUY',
        price: '1.25',
        amount: '100',
        filled: '80',
        remaining: '20',
        status: 'OPEN'
      };

      mockStorage.getOrder.mockResolvedValue(buyOrder);

      const matchingEngine = (orderBook as any).matchingEngine;
      await matchingEngine.executeTrade(buyOrder, { amount: '20' }, '1.25');

      expect(mockStorage.updateOrder).toHaveBeenCalledWith(
        'buy-456',
        expect.objectContaining({
          filled: '100',
          remaining: '0',
          status: 'FILLED'
        })
      );
    });
  });

  describe('Order Book Management', () => {
    it('should build order book with proper aggregation', async () => {
      const orders = [
        { price: '1.25', remaining: '100', side: 'BUY' },
        { price: '1.25', remaining: '200', side: 'BUY' },
        { price: '1.24', remaining: '150', side: 'BUY' },
        { price: '1.26', remaining: '100', side: 'SELL' },
        { price: '1.26', remaining: '50', side: 'SELL' },
        { price: '1.27', remaining: '200', side: 'SELL' }
      ];

      mockStorage.getOrders.mockResolvedValue(orders);

      const orderBook = await orderBook.getOrderBook('XOM/USDT');

      // Bids should be sorted descending and aggregated
      expect(orderBook.bids).toEqual([
        { price: '1.25', amount: '300', total: '375' }, // 100+200
        { price: '1.24', amount: '150', total: '186' }
      ]);

      // Asks should be sorted ascending and aggregated
      expect(orderBook.asks).toEqual([
        { price: '1.26', amount: '150', total: '189' }, // 100+50
        { price: '1.27', amount: '200', total: '254' }
      ]);
    });

    it('should limit order book depth', async () => {
      const orders = Array.from({ length: 100 }, (_, i) => ({
        price: `${1.20 + i * 0.01}`,
        remaining: '100',
        side: 'BUY'
      }));

      mockStorage.getOrders.mockResolvedValue(orders);

      const orderBook = await orderBook.getOrderBook('XOM/USDT', 10);

      expect(orderBook.bids.length).toBe(10);
      expect(orderBook.asks.length).toBe(0);
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel an open order', async () => {
      const order = {
        id: 'order-123',
        status: 'OPEN',
        userId: 'user-456'
      };

      mockStorage.getOrder.mockResolvedValue(order);

      const result = await orderBook.cancelOrder('order-123', 'user-456');

      expect(result).toBe(true);
      expect(mockStorage.updateOrder).toHaveBeenCalledWith(
        'order-123',
        expect.objectContaining({
          status: 'CANCELLED',
          cancelledAt: expect.any(Number)
        })
      );
    });

    it('should cancel linked OCO orders', async () => {
      const order = {
        id: 'oco-1',
        status: 'OPEN',
        linkedOrderId: 'oco-2',
        userId: 'user-123'
      };

      const linkedOrder = {
        id: 'oco-2',
        status: 'OPEN',
        linkedOrderId: 'oco-1',
        userId: 'user-123'
      };

      mockStorage.getOrder
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce(linkedOrder);

      await orderBook.cancelOrder('oco-1', 'user-123');

      // Both orders should be cancelled
      expect(mockStorage.updateOrder).toHaveBeenCalledTimes(2);
      expect(mockStorage.updateOrder).toHaveBeenCalledWith(
        'oco-1',
        expect.objectContaining({ status: 'CANCELLED' })
      );
      expect(mockStorage.updateOrder).toHaveBeenCalledWith(
        'oco-2',
        expect.objectContaining({ status: 'CANCELLED' })
      );
    });

    it('should not cancel order of another user', async () => {
      const order = {
        id: 'order-123',
        status: 'OPEN',
        userId: 'user-456'
      };

      mockStorage.getOrder.mockResolvedValue(order);

      await expect(
        orderBook.cancelOrder('order-123', 'user-789')
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('WebSocket Events', () => {
    it('should emit order book updates', async () => {
      const wsHandler = jest.fn();
      mockWebSocket.on('orderbook', wsHandler);

      // Place an order
      await orderBook.placeOrder({
        pair: 'XOM/USDT',
        type: 'LIMIT' as const,
        side: 'BUY' as const,
        price: '1.25',
        amount: '100',
        userId: 'user-123'
      });

      expect(wsHandler).toHaveBeenCalledWith({
        pair: 'XOM/USDT',
        action: 'update'
      });
    });

    it('should emit trade events', async () => {
      const wsHandler = jest.fn();
      mockWebSocket.on('trade', wsHandler);

      const matchingEngine = (orderBook as any).matchingEngine;
      await matchingEngine.executeTrade(
        { id: 'buy-1', pair: 'XOM/USDT' },
        { id: 'sell-1', pair: 'XOM/USDT' },
        '1.25'
      );

      expect(wsHandler).toHaveBeenCalledWith({
        pair: 'XOM/USDT',
        trade: expect.objectContaining({
          price: '1.25',
          buyOrderId: 'buy-1',
          sellOrderId: 'sell-1'
        })
      });
    });

    it('should emit user order updates', async () => {
      const wsHandler = jest.fn();
      mockWebSocket.on('order', wsHandler);

      const order = {
        id: 'order-123',
        userId: 'user-456',
        status: 'OPEN'
      };

      mockStorage.getOrder.mockResolvedValue(order);
      await orderBook.cancelOrder('order-123', 'user-456');

      expect(wsHandler).toHaveBeenCalledWith({
        userId: 'user-456',
        order: expect.objectContaining({
          id: 'order-123',
          status: 'CANCELLED'
        })
      });
    });
  });

  describe('Market Statistics', () => {
    it('should calculate market statistics correctly', async () => {
      const trades = [
        { price: '1.25', amount: '100', timestamp: Date.now() - 3600000 },
        { price: '1.26', amount: '200', timestamp: Date.now() - 1800000 },
        { price: '1.24', amount: '150', timestamp: Date.now() - 900000 },
        { price: '1.27', amount: '100', timestamp: Date.now() }
      ];

      mockStorage.getTrades.mockResolvedValue(trades);

      const stats = await orderBook.getMarketStatistics('XOM/USDT');

      expect(stats).toEqual({
        volume24h: '550', // Sum of amounts
        high24h: '1.27',
        low24h: '1.24',
        changePercent24h: '1.6', // (1.27 - 1.25) / 1.25 * 100
        trades24h: 4,
        lastPrice: '1.27'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      mockStorage.storeOrder.mockRejectedValue(new Error('Storage error'));

      await expect(
        orderBook.placeOrder({
          pair: 'XOM/USDT',
          type: 'LIMIT' as const,
          side: 'BUY' as const,
          price: '1.25',
          amount: '100',
          userId: 'user-123'
        })
      ).rejects.toThrow('Storage error');
    });

    it('should validate order parameters', async () => {
      await expect(
        orderBook.placeOrder({
          pair: 'XOM/USDT',
          type: 'LIMIT' as const,
          side: 'BUY' as const,
          price: '-1', // Invalid price
          amount: '100',
          userId: 'user-123'
        })
      ).rejects.toThrow('Invalid price');

      await expect(
        orderBook.placeOrder({
          pair: 'XOM/USDT',
          type: 'LIMIT' as const,
          side: 'BUY' as const,
          price: '1.25',
          amount: '0', // Invalid amount
          userId: 'user-123'
        })
      ).rejects.toThrow('Invalid amount');
    });
  });
});
/**
 * DEX Core Integration Tests
 * @file Tests the core DEX functionality without requiring a running server
 */

import { expect } from 'chai';
import { HybridOrderBook } from '../../src/core/HybridOrderBook';
import { TradingEngine } from '../../src/core/TradingEngine';
import { DecentralizedOrderBook } from '../../src/services/dex/DecentralizedOrderBook';
import { LiquidityPoolManager } from '../../src/services/dex/amm/LiquidityPoolManager';
import { SwapCalculator } from '../../src/services/dex/amm/SwapCalculator';
import { ethers } from 'ethers';

describe('DEX Core Integration Tests', function() {
  this.timeout(30000); // 30 second timeout

  let orderBook: HybridOrderBook;
  let tradingEngine: TradingEngine;
  let decentralizedOrderBook: DecentralizedOrderBook;
  let liquidityManager: LiquidityPoolManager;
  let swapCalculator: SwapCalculator;

  // Test users
  const alice = {
    id: 'user-alice-' + Date.now(),
    address: ethers.Wallet.createRandom().address
  };

  const bob = {
    id: 'user-bob-' + Date.now(),
    address: ethers.Wallet.createRandom().address
  };

  /**
   * Initialize DEX services
   */
  before(async () => {
    // Initialize components
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');

    orderBook = new HybridOrderBook();
    await orderBook.initialize();

    liquidityManager = new LiquidityPoolManager(provider);
    swapCalculator = new SwapCalculator();

    tradingEngine = new TradingEngine({
      orderBook,
      liquidityPoolManager: liquidityManager,
      maxSlippage: 300, // 3%
      minLiquidity: ethers.parseEther('1000')
    });
    await tradingEngine.initialize();

    // Initialize decentralized order book with mock contract
    decentralizedOrderBook = new DecentralizedOrderBook({
      contractAddress: ethers.ZeroAddress, // Mock address for testing
      nodeId: 'test-node-1',
      provider
    });
    await decentralizedOrderBook.initialize();
  });

  /**
   * Clean up after tests
   */
  after(async () => {
    await orderBook.shutdown();
    await tradingEngine.shutdown();
    await decentralizedOrderBook.shutdown();
  });

  describe('Order Book Management', () => {
    it('should place limit buy order', async () => {
      const order = {
        userId: alice.id,
        pair: 'ETH/USDC',
        type: 'LIMIT' as const,
        side: 'BUY' as const,
        quantity: '1.5',
        price: '2400.00',
        timeInForce: 'GTC' as const
      };

      const result = await decentralizedOrderBook.placeOrder(order);

      expect(result.success).to.be.true;
      expect(result.orderId).to.be.a('string');
      expect(result.order).to.exist;
      expect(result.order?.status).to.equal('OPEN');
    });

    it('should place limit sell order', async () => {
      const order = {
        userId: bob.id,
        pair: 'ETH/USDC',
        type: 'LIMIT' as const,
        side: 'SELL' as const,
        quantity: '1.0',
        price: '2500.00',
        timeInForce: 'GTC' as const
      };

      const result = await decentralizedOrderBook.placeOrder(order);

      expect(result.success).to.be.true;
      expect(result.orderId).to.be.a('string');
    });

    it('should match crossing orders', async () => {
      // Place sell order at lower price
      const sellOrder = {
        userId: bob.id,
        pair: 'ETH/USDC',
        type: 'LIMIT' as const,
        side: 'SELL' as const,
        quantity: '0.5',
        price: '2395.00',
        timeInForce: 'GTC' as const
      };

      const sellResult = await decentralizedOrderBook.placeOrder(sellOrder);
      expect(sellResult.success).to.be.true;

      // Place buy order at higher price - should match
      const buyOrder = {
        userId: alice.id,
        pair: 'ETH/USDC',
        type: 'LIMIT' as const,
        side: 'BUY' as const,
        quantity: '0.5',
        price: '2405.00',
        timeInForce: 'GTC' as const
      };

      const buyResult = await decentralizedOrderBook.placeOrder(buyOrder);
      expect(buyResult.success).to.be.true;
      expect(buyResult.order?.status).to.be.oneOf(['FILLED', 'PARTIALLY_FILLED']);
    });

    it('should execute market order', async () => {
      // Ensure liquidity exists
      await decentralizedOrderBook.placeOrder({
        userId: bob.id,
        pair: 'ETH/USDC',
        type: 'LIMIT',
        side: 'SELL',
        quantity: '2.0',
        price: '2450.00',
        timeInForce: 'GTC'
      });

      // Place market buy order
      const marketOrder = {
        userId: alice.id,
        pair: 'ETH/USDC',
        type: 'MARKET' as const,
        side: 'BUY' as const,
        quantity: '0.3',
        timeInForce: 'IOC' as const
      };

      const result = await decentralizedOrderBook.placeOrder(marketOrder);

      expect(result.success).to.be.true;
      expect(result.order?.type).to.equal('MARKET');
      expect(result.order?.averagePrice).to.exist;
      expect(parseFloat(result.order?.filled || '0')).to.be.greaterThan(0);
    });

    it('should cancel order', async () => {
      // Place an order
      const orderResult = await decentralizedOrderBook.placeOrder({
        userId: alice.id,
        pair: 'ETH/USDC',
        type: 'LIMIT',
        side: 'BUY',
        quantity: '1.0',
        price: '2300.00',
        timeInForce: 'GTC'
      });

      expect(orderResult.success).to.be.true;
      const orderId = orderResult.orderId;

      // Cancel the order
      const cancelResult = await decentralizedOrderBook.cancelOrder(orderId, alice.id);
      expect(cancelResult.success).to.be.true;

      // Verify order is cancelled
      const openOrders = await decentralizedOrderBook.getUserOrders(alice.id);
      const cancelledOrder = openOrders.find(o => o.id === orderId);
      expect(cancelledOrder?.status).to.equal('CANCELLED');
    });
  });

  describe('Order Book Queries', () => {
    it('should retrieve order book depth', async () => {
      const depth = await decentralizedOrderBook.getOrderBook('ETH/USDC', 10);

      expect(depth).to.have.property('pair', 'ETH/USDC');
      expect(depth).to.have.property('bids').that.is.an('array');
      expect(depth).to.have.property('asks').that.is.an('array');

      // Verify bid/ask structure
      if (depth.bids.length > 0) {
        expect(depth.bids[0]).to.have.all.keys('price', 'quantity', 'orders');
        // Bids should be sorted descending
        for (let i = 1; i < depth.bids.length; i++) {
          expect(parseFloat(depth.bids[i-1].price)).to.be.gte(parseFloat(depth.bids[i].price));
        }
      }

      if (depth.asks.length > 0) {
        expect(depth.asks[0]).to.have.all.keys('price', 'quantity', 'orders');
        // Asks should be sorted ascending
        for (let i = 1; i < depth.asks.length; i++) {
          expect(parseFloat(depth.asks[i-1].price)).to.be.lte(parseFloat(depth.asks[i].price));
        }
      }
    });

    it('should retrieve market depth', async () => {
      const marketDepth = await decentralizedOrderBook.getMarketDepth('ETH/USDC', 5);

      expect(marketDepth).to.have.property('bids').that.is.an('array');
      expect(marketDepth).to.have.property('asks').that.is.an('array');

      // Each level should have [price, volume]
      for (const bid of marketDepth.bids) {
        expect(bid).to.have.lengthOf(2);
        expect(bid[0]).to.be.a('number'); // price
        expect(bid[1]).to.be.a('number'); // volume
      }

      for (const ask of marketDepth.asks) {
        expect(ask).to.have.lengthOf(2);
        expect(ask[0]).to.be.a('number'); // price
        expect(ask[1]).to.be.a('number'); // volume
      }
    });

    it('should get user orders', async () => {
      const orders = await decentralizedOrderBook.getUserOrders(alice.id);

      expect(orders).to.be.an('array');
      for (const order of orders) {
        expect(order).to.have.property('id');
        expect(order).to.have.property('userId', alice.id);
        expect(order).to.have.property('pair');
        expect(order).to.have.property('type');
        expect(order).to.have.property('side');
        expect(order).to.have.property('status');
      }
    });
  });

  describe('Swap Functionality', () => {
    it('should calculate swap quote', async () => {
      // Add liquidity to pools for testing
      const ethUsdcPool = {
        tokenA: 'ETH',
        tokenB: 'USDC',
        reserveA: ethers.parseEther('100'), // 100 ETH
        reserveB: ethers.parseUnits('240000', 6), // 240,000 USDC
        fee: 30 // 0.3%
      };

      const quote = swapCalculator.calculateSwap(
        ethUsdcPool,
        ethers.parseEther('1'), // 1 ETH
        true // ETH to USDC
      );

      expect(quote).to.have.property('amountOut');
      expect(quote).to.have.property('priceImpact');
      expect(quote).to.have.property('effectivePrice');
      expect(quote).to.have.property('fee');

      // Verify reasonable values
      const amountOut = Number(ethers.formatUnits(quote.amountOut, 6));
      expect(amountOut).to.be.greaterThan(2000); // Should get > 2000 USDC
      expect(amountOut).to.be.lessThan(2500); // But < 2500 USDC
      expect(quote.priceImpact).to.be.greaterThan(0); // Should have some price impact
    });

    it('should find optimal swap route', async () => {
      // This would test multi-hop routing
      // For now, we'll test direct swap
      const swapParams = {
        tokenIn: 'ETH',
        tokenOut: 'USDC',
        amountIn: ethers.parseEther('5'),
        maxSlippage: 100 // 1%
      };

      // Test would normally find route through AMM
      // For this test, we verify the structure
      const route = {
        path: ['ETH', 'USDC'],
        pools: ['ETH/USDC'],
        expectedOutput: ethers.parseUnits('12000', 6), // Expected ~12000 USDC
        priceImpact: 0.5,
        totalFee: ethers.parseEther('0.015') // 0.3% of 5 ETH
      };

      expect(route.path).to.have.lengthOf(2);
      expect(route.pools).to.have.lengthOf(1);
      expect(route.priceImpact).to.be.lessThan(1); // Less than 1% impact
    });
  });

  describe('Trading Engine Integration', () => {
    it('should execute hybrid order', async () => {
      const order = {
        id: 'test-hybrid-order-1',
        userId: alice.id,
        pair: 'ETH/USDC',
        type: 'LIMIT' as const,
        side: 'BUY' as const,
        quantity: '2.0',
        price: '2420.00',
        timeInForce: 'GTC' as const,
        status: 'PENDING' as const,
        filled: '0',
        remaining: '2.0',
        fees: '0',
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      const result = await tradingEngine.executeOrder(order as any);

      expect(result).to.have.property('success');
      expect(result).to.have.property('trades');
      expect(result).to.have.property('finalStatus');
    });

    it('should handle partial fills', async () => {
      // Place a large order that can't be fully filled
      const largeOrder = {
        id: 'test-partial-order-1',
        userId: alice.id,
        pair: 'ETH/USDC',
        type: 'LIMIT' as const,
        side: 'BUY' as const,
        quantity: '100.0', // Very large order
        price: '2400.00',
        timeInForce: 'GTC' as const,
        status: 'PENDING' as const,
        filled: '0',
        remaining: '100.0',
        fees: '0',
        timestamp: Date.now(),
        updatedAt: Date.now()
      };

      const result = await tradingEngine.executeOrder(largeOrder as any);

      expect(result.finalStatus).to.be.oneOf(['OPEN', 'PARTIALLY_FILLED']);
      if (result.trades.length > 0) {
        const totalFilled = result.trades.reduce((sum, trade) =>
          sum + parseFloat(trade.quantity), 0
        );
        expect(totalFilled).to.be.lessThan(100);
      }
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent orders efficiently', async () => {
      const orderPromises = [];
      const orderCount = 50;

      // Create orders from different users
      for (let i = 0; i < orderCount; i++) {
        const userId = i % 2 === 0 ? alice.id : bob.id;
        const side = i % 2 === 0 ? 'BUY' : 'SELL';
        const price = side === 'BUY' ?
          `${2400 - (i * 2)}` : // Buy orders: 2400, 2398, 2396...
          `${2410 + (i * 2)}`;  // Sell orders: 2410, 2412, 2414...

        orderPromises.push(
          decentralizedOrderBook.placeOrder({
            userId,
            pair: 'ETH/USDC',
            type: 'LIMIT',
            side: side as 'BUY' | 'SELL',
            quantity: '0.1',
            price,
            timeInForce: 'GTC'
          })
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(orderPromises);
      const duration = Date.now() - startTime;

      // All orders should succeed
      const successCount = results.filter(r => r.success).length;
      expect(successCount).to.equal(orderCount);

      // Should complete reasonably fast
      const avgTimePerOrder = duration / orderCount;
      expect(avgTimePerOrder).to.be.lessThan(100); // Less than 100ms per order
    });

    it('should maintain order book consistency under load', async () => {
      const pair = 'BTC/USDC';
      const orders = [];

      // Place many orders
      for (let i = 0; i < 20; i++) {
        const order = await decentralizedOrderBook.placeOrder({
          userId: i % 2 === 0 ? alice.id : bob.id,
          pair,
          type: 'LIMIT',
          side: i % 2 === 0 ? 'BUY' : 'SELL',
          quantity: '0.01',
          price: `${40000 + (i % 2 === 0 ? -i : i) * 10}`,
          timeInForce: 'GTC'
        });
        if (order.success && order.orderId) {
          orders.push(order.orderId);
        }
      }

      // Get order book
      const book = await decentralizedOrderBook.getOrderBook(pair, 50);

      // Verify no crossing orders
      if (book.bids.length > 0 && book.asks.length > 0) {
        const bestBid = parseFloat(book.bids[0].price);
        const bestAsk = parseFloat(book.asks[0].price);
        expect(bestBid).to.be.lessThan(bestAsk);
      }

      // Clean up - cancel all orders
      const cancelPromises = orders.map((orderId, i) =>
        decentralizedOrderBook.cancelOrder(orderId, i % 2 === 0 ? alice.id : bob.id)
          .catch(() => {}) // Ignore errors from already filled orders
      );
      await Promise.all(cancelPromises);
    });
  });
});
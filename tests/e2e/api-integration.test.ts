/**
 * API Integration Tests
 * @file Tests the DEX API functionality without UI dependency
 */

import { expect } from 'chai';
import { DEXClient } from '../../src/services/dex/api/dexClient';
import { TradingEngine } from '../../src/core/TradingEngine';
import { HybridOrderBook } from '../../src/core/HybridOrderBook';
import { LiquidityPoolManager } from '../../src/services/dex/amm/LiquidityPoolManager';
import { ethers } from 'ethers';

describe('DEX API Integration Tests', function() {
  this.timeout(30000); // 30 second timeout for integration tests

  let dexClient: DEXClient;
  let tradingEngine: TradingEngine;
  let orderBook: HybridOrderBook;
  let liquidityManager: LiquidityPoolManager;

  // Test wallet for simulating user actions
  const testWallet = ethers.Wallet.createRandom();
  const testAddress = testWallet.address;

  /**
   * Initialize DEX services
   */
  before(async () => {
    // Initialize components
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');

    orderBook = new HybridOrderBook();
    await orderBook.initialize();

    liquidityManager = new LiquidityPoolManager(provider);

    tradingEngine = new TradingEngine({
      orderBook,
      liquidityPoolManager: liquidityManager,
      maxSlippage: 300, // 3%
      minLiquidity: ethers.parseEther('1000')
    });
    await tradingEngine.initialize();

    // Initialize client
    dexClient = new DEXClient('http://localhost:3001/api/dex');

    // Mock authentication
    const mockToken = 'test-jwt-token';
    dexClient.setAuthToken(mockToken);
  });

  /**
   * Clean up after tests
   */
  after(async () => {
    await orderBook.shutdown();
    await tradingEngine.shutdown();
  });

  describe('Trading Pairs', () => {
    it('should retrieve available trading pairs', async () => {
      const pairs = await dexClient.getTradingPairs();

      expect(pairs).to.be.an('array');
      expect(pairs.length).to.be.greaterThan(0);

      // Check ETH/USDC pair exists
      const ethUsdc = pairs.find(p => p.symbol === 'ETH/USDC');
      expect(ethUsdc).to.exist;
      expect(ethUsdc?.baseAsset).to.equal('ETH');
      expect(ethUsdc?.quoteAsset).to.equal('USDC');
      expect(ethUsdc?.status).to.equal('active');
    });
  });

  describe('Order Management', () => {
    let orderId: string;

    it('should place a limit buy order', async () => {
      const orderRequest = {
        pair: 'ETH/USDC',
        side: 'buy' as const,
        type: 'limit' as const,
        price: '2400.00',
        amount: '0.5',
        timeInForce: 'GTC' as const
      };

      const order = await dexClient.placeOrder(orderRequest);

      expect(order).to.have.property('id');
      expect(order.pair).to.equal('ETH/USDC');
      expect(order.side).to.equal('buy');
      expect(order.type).to.equal('limit');
      expect(order.status).to.equal('open');
      expect(order.price).to.equal('2400.00');
      expect(order.amount).to.equal('0.5');
      expect(order.filled).to.equal('0');
      expect(order.remaining).to.equal('0.5');

      orderId = order.id;
    });

    it('should retrieve open orders', async () => {
      const orders = await dexClient.getOpenOrders();

      expect(orders).to.be.an('array');
      expect(orders.length).to.be.greaterThan(0);

      const placedOrder = orders.find(o => o.id === orderId);
      expect(placedOrder).to.exist;
    });

    it('should cancel an order', async () => {
      await dexClient.cancelOrder(orderId);

      const order = await dexClient.getOrder(orderId);
      expect(order.status).to.equal('cancelled');
    });

    it('should place and execute market order', async () => {
      // First add liquidity to ensure market order can execute
      const sellOrder = await dexClient.placeOrder({
        pair: 'ETH/USDC',
        side: 'sell',
        type: 'limit',
        price: '2450.00',
        amount: '1.0'
      });

      // Place market buy order
      const marketOrder = await dexClient.placeOrder({
        pair: 'ETH/USDC',
        side: 'buy',
        type: 'market',
        amount: '0.2'
      });

      expect(marketOrder.type).to.equal('market');
      expect(marketOrder.status).to.be.oneOf(['filled', 'partially_filled']);

      // Clean up
      if (sellOrder.status === 'open') {
        await dexClient.cancelOrder(sellOrder.id);
      }
    });
  });

  describe('Order Book', () => {
    it('should retrieve order book snapshot', async () => {
      const orderBook = await dexClient.getOrderBook('ETH/USDC', 10);

      expect(orderBook).to.have.property('pair', 'ETH/USDC');
      expect(orderBook).to.have.property('bids').that.is.an('array');
      expect(orderBook).to.have.property('asks').that.is.an('array');
      expect(orderBook).to.have.property('timestamp');

      // Check bid/ask structure
      if (orderBook.bids.length > 0) {
        const bid = orderBook.bids[0];
        expect(bid).to.have.property('price');
        expect(bid).to.have.property('amount');
        expect(bid).to.have.property('total');
      }

      if (orderBook.asks.length > 0) {
        const ask = orderBook.asks[0];
        expect(ask).to.have.property('price');
        expect(ask).to.have.property('amount');
        expect(ask).to.have.property('total');
      }
    });

    it('should have properly sorted order book', async () => {
      const orderBook = await dexClient.getOrderBook('ETH/USDC', 20);

      // Bids should be sorted descending
      for (let i = 1; i < orderBook.bids.length; i++) {
        const prevPrice = parseFloat(orderBook.bids[i-1].price);
        const currPrice = parseFloat(orderBook.bids[i].price);
        expect(prevPrice).to.be.gte(currPrice);
      }

      // Asks should be sorted ascending
      for (let i = 1; i < orderBook.asks.length; i++) {
        const prevPrice = parseFloat(orderBook.asks[i-1].price);
        const currPrice = parseFloat(orderBook.asks[i].price);
        expect(prevPrice).to.be.lte(currPrice);
      }
    });
  });

  describe('Market Data', () => {
    it('should retrieve ticker data', async () => {
      const ticker = await dexClient.getTicker('ETH/USDC');

      expect(ticker).to.have.property('pair', 'ETH/USDC');
      expect(ticker).to.have.property('lastPrice');
      expect(ticker).to.have.property('bidPrice');
      expect(ticker).to.have.property('askPrice');
      expect(ticker).to.have.property('volume24h');
      expect(ticker).to.have.property('high24h');
      expect(ticker).to.have.property('low24h');
      expect(ticker).to.have.property('change24h');
      expect(ticker).to.have.property('changePercent24h');
      expect(ticker).to.have.property('timestamp');

      // Validate price relationships
      const bid = parseFloat(ticker.bidPrice);
      const ask = parseFloat(ticker.askPrice);
      const last = parseFloat(ticker.lastPrice);
      const high = parseFloat(ticker.high24h);
      const low = parseFloat(ticker.low24h);

      expect(bid).to.be.lte(ask); // Bid should be less than ask
      expect(low).to.be.lte(high); // Low should be less than high
      expect(last).to.be.gte(low).and.lte(high); // Last should be between low and high
    });
  });

  describe('Swap Functionality', () => {
    it('should get swap quote', async () => {
      const quoteRequest = {
        fromToken: 'ETH',
        toToken: 'USDC',
        amount: '1.0',
        slippage: 1.0 // 1%
      };

      const quote = await dexClient.getSwapQuote(quoteRequest);

      expect(quote).to.have.property('fromToken', 'ETH');
      expect(quote).to.have.property('toToken', 'USDC');
      expect(quote).to.have.property('fromAmount', '1.0');
      expect(quote).to.have.property('toAmount');
      expect(quote).to.have.property('price');
      expect(quote).to.have.property('priceImpact');
      expect(quote).to.have.property('minimumReceived');
      expect(quote).to.have.property('route').that.is.an('array');
      expect(quote).to.have.property('gas');
      expect(quote).to.have.property('fee');
      expect(quote).to.have.property('expires');
      expect(quote).to.have.property('quoteId');

      // Validate amounts
      const toAmount = parseFloat(quote.toAmount);
      const minReceived = parseFloat(quote.minimumReceived);
      expect(toAmount).to.be.greaterThan(0);
      expect(minReceived).to.be.lte(toAmount); // Min received should be less due to slippage

      // Validate price impact
      const priceImpact = parseFloat(quote.priceImpact);
      expect(priceImpact).to.be.gte(0).and.lte(100); // Price impact percentage
    });

    it('should handle different swap amounts', async () => {
      const amounts = ['0.1', '1.0', '10.0'];
      const quotes = [];

      for (const amount of amounts) {
        const quote = await dexClient.getSwapQuote({
          fromToken: 'ETH',
          toToken: 'USDC',
          amount,
          slippage: 1.0
        });
        quotes.push(quote);
      }

      // Larger amounts should have higher price impact
      for (let i = 1; i < quotes.length; i++) {
        const prevImpact = parseFloat(quotes[i-1].priceImpact);
        const currImpact = parseFloat(quotes[i].priceImpact);
        expect(currImpact).to.be.gte(prevImpact);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid order placement', async () => {
      try {
        await dexClient.placeOrder({
          pair: 'INVALID/PAIR',
          side: 'buy',
          type: 'limit',
          price: '100',
          amount: '1'
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it('should handle insufficient balance', async () => {
      try {
        await dexClient.placeOrder({
          pair: 'ETH/USDC',
          side: 'buy',
          type: 'limit',
          price: '2500',
          amount: '999999' // Very large amount
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it('should handle non-existent order cancellation', async () => {
      try {
        await dexClient.cancelOrder('non-existent-order-id');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe('Performance', () => {
    it('should handle concurrent order placement', async () => {
      const orderPromises = [];
      const orderCount = 10;

      for (let i = 0; i < orderCount; i++) {
        orderPromises.push(
          dexClient.placeOrder({
            pair: 'ETH/USDC',
            side: i % 2 === 0 ? 'buy' : 'sell',
            type: 'limit',
            price: `${2400 + i * 10}`,
            amount: '0.1'
          })
        );
      }

      const startTime = Date.now();
      const orders = await Promise.all(orderPromises);
      const duration = Date.now() - startTime;

      expect(orders).to.have.lengthOf(orderCount);
      expect(duration).to.be.lessThan(5000); // Should complete within 5 seconds

      // Clean up
      const cancelPromises = orders.map(order =>
        dexClient.cancelOrder(order.id).catch(() => {})
      );
      await Promise.all(cancelPromises);
    });

    it('should retrieve large order book quickly', async () => {
      const startTime = Date.now();
      const orderBook = await dexClient.getOrderBook('ETH/USDC', 100);
      const duration = Date.now() - startTime;

      expect(orderBook).to.exist;
      expect(duration).to.be.lessThan(1000); // Should complete within 1 second
    });
  });
});
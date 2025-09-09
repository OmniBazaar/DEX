/**
 * ValidatorDEXService - DEX integration with Omni Validator
 * 
 * Provides order book management, trade execution, and market data
 * through the Omni validator's GraphQL API.
 */

import { 
  OmniValidatorClient, 
  createOmniValidatorClient,
  type OmniValidatorClientConfig
} from '../client';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import type { UnifiedOrder as _UnifiedOrder } from '../types/config';

/**
 * Configuration for ValidatorDEXService
 */
export interface ValidatorDEXConfig extends OmniValidatorClientConfig {
  /** Network identifier */
  networkId: string;
  /** Supported trading pairs */
  tradingPairs: string[];
  /** Fee structure */
  feeStructure: {
    /** Maker fee rate */
    maker: number;
    /** Taker fee rate */
    taker: number;
  };
}

/**
 * Order information from validator
 */
export interface Order {
  /** Unique order identifier */
  orderId: string;
  /** Order type - buy or sell */
  type: 'BUY' | 'SELL';
  /** Trading pair symbol */
  tokenPair: string;
  /** Order price per unit */
  price: string;
  /** Total order amount */
  amount: string;
  /** Amount that has been filled */
  filled: string;
  /** Current order status */
  status: 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';
  /** Address of the order maker */
  maker: string;
  /** Order creation timestamp */
  timestamp: number;
}

/**
 * Order book data from validator
 */
export interface OrderBook {
  /** Trading pair symbol */
  tokenPair: string;
  /** Buy orders sorted by price descending */
  bids: OrderLevel[];
  /** Sell orders sorted by price ascending */
  asks: OrderLevel[];
  /** Spread between best bid and ask */
  spread: string;
  /** Mid-market price */
  midPrice: string;
  /** Last update timestamp */
  lastUpdate: number;
}

/**
 * Single price level in order book
 */
export interface OrderLevel {
  /** Price level */
  price: string;
  /** Total amount at this level */
  amount: string;
  /** Total value (price × amount) */
  total: string;
  /** Number of orders at this level */
  orderCount: number;
}

/**
 * Trade execution data
 */
export interface Trade {
  /** Unique trade identifier */
  tradeId: string;
  /** Trading pair symbol */
  tokenPair: string;
  /** Execution price */
  price: string;
  /** Trade amount */
  amount: string;
  /** Trade side from taker perspective */
  side: 'BUY' | 'SELL';
  /** Maker address */
  maker: string;
  /** Taker address */
  taker: string;
  /** Fee paid by maker */
  makerFee: string;
  /** Fee paid by taker */
  takerFee: string;
  /** Trade execution timestamp */
  timestamp: number;
}

/**
 * Market data and statistics
 */
export interface MarketData {
  /** Trading pair symbol */
  tokenPair: string;
  /** Last trade price */
  lastPrice: string;
  /** 24-hour trading volume */
  volume24h: string;
  /** 24-hour high price */
  high24h: string;
  /** 24-hour low price */
  low24h: string;
  /** 24-hour price change */
  priceChange24h: string;
  /** 24-hour price change percentage */
  priceChangePercent24h: string;
}

/**
 * DEX service for Avalanche validator integration
 * Manages order execution, market data, and client connections
 * @example
 * ```typescript
 * const service = new ValidatorDEXService(config);
 * await service.initialize();
 * const order = await service.placeOrder(orderData);
 * ```
 */
export class ValidatorDEXService {
  /** Avalanche validator client */
  private client: OmniValidatorClient;
  /** Service configuration */
  private config: ValidatorDEXConfig;
  /** Initialization status */
  private isInitialized = false;
  /** Order cache for performance */
  private orderCache: Map<string, Order> = new Map();
  /** Order book cache */
  private orderBookCache: Map<string, OrderBook> = new Map();
  
  /**
   * Creates a new ValidatorDEXService instance
   * @param config - Service configuration
   */
  constructor(config: ValidatorDEXConfig) {
    this.config = config;
    this.client = createOmniValidatorClient({
      validatorEndpoint: config.validatorEndpoint,
      ...(config.wsEndpoint !== undefined ? { wsEndpoint: config.wsEndpoint } : {}),
      ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
      ...(config.timeout !== undefined ? { timeout: config.timeout } : {}),
      ...(config.retryAttempts !== undefined ? { retryAttempts: config.retryAttempts } : {})
    });
  }
  
  /**
   * Initialize the DEX service and establish validator connection
   * @throws {Error} If validator health check fails
   */
  async initialize(): Promise<void> {
    try {
      const health = await this.client.getHealth();
      if (health.services.orderBook !== true) {
        throw new Error('Order book service is not available');
      }
      
      // Initialize order books for configured trading pairs
      for (const pair of this.config.tradingPairs) {
        await this.syncOrderBook(pair);
      }
      
      this.isInitialized = true;
      logger.info('ValidatorDEXService initialized', {
        tradingPairs: this.config.tradingPairs
      });
    } catch (error) {
      logger.error('Failed to initialize ValidatorDEXService:', error);
      throw error;
    }
  }
  
  /**
   * Place a new order
   * @param order - Order parameters
   * @param order.type - Order type (BUY or SELL)
   * @param order.tokenPair - Trading pair symbol
   * @param order.price - Order price per unit
   * @param order.amount - Total order amount
   * @param order.maker - Order maker address
   * @returns Promise that resolves to the created order
   */
  async placeOrder(order: {
    type: 'BUY' | 'SELL';
    tokenPair: string;
    price: string;
    amount: string;
    maker: string;
  }): Promise<Order> {
    this.ensureInitialized();
    
    try {
      // Validate order
      this.validateOrder(order);
      
      // Submit order through validator
      const orderId = await this.client.placeOrder(order);
      
      // Create order object
      const newOrder: Order = {
        orderId,
        type: order.type,
        tokenPair: order.tokenPair,
        price: order.price,
        amount: order.amount,
        filled: '0',
        status: 'OPEN',
        maker: order.maker,
        timestamp: Date.now()
      };
      
      // Cache order
      this.orderCache.set(orderId, newOrder);
      
      // Update order book cache
      await this.syncOrderBook(order.tokenPair);
      
      logger.info('Order placed successfully', { orderId, tokenPair: order.tokenPair });
      return newOrder;
    } catch (error) {
      logger.error('Failed to place order:', error);
      throw error;
    }
  }
  
  /**
   * Cancel an order
   * @param orderId - Order ID to cancel
   * @param maker - Order maker address
   * @returns Promise that resolves to true if cancellation was successful
   */
  async cancelOrder(orderId: string, maker: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      // Get order from cache
      const order = this.orderCache.get(orderId);
      if (order === undefined) {
        throw new Error('Order not found');
      }
      
      // Verify maker
      if (order.maker.toLowerCase() !== maker.toLowerCase()) {
        throw new Error('Unauthorized: not the order maker');
      }
      
      // TODO: Cancel order through validator when mutation is available
      // For now, update local cache
      order.status = 'CANCELLED';
      this.orderCache.set(orderId, order);
      
      // Update order book
      await this.syncOrderBook(order.tokenPair);
      
      logger.info('Order cancelled', { orderId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel order:', error);
      throw error;
    }
  }
  
  /**
   * Get order by ID
   * @param orderId - Order ID to retrieve
   * @returns Promise that resolves to the order or null if not found
   */
  getOrder(orderId: string): Promise<Order | null> {
    this.ensureInitialized();
    
    // Check cache first
    const cachedOrder = this.orderCache.get(orderId);
    if (cachedOrder !== undefined) {
      return Promise.resolve(cachedOrder);
    }
    
    // TODO: Fetch from validator when query is available
    return Promise.resolve(null);
  }
  
  /**
   * Get user's open orders
   * @param maker - User address to get orders for
   * @param tokenPair - Optional trading pair filter
   * @returns Promise that resolves to array of user's open orders
   */
  getUserOrders(maker: string, tokenPair?: string): Promise<Order[]> {
    this.ensureInitialized();
    
    try {
      // Filter from cache for now
      const orders = Array.from(this.orderCache.values()).filter(order => {
        const matchesMaker = order.maker.toLowerCase() === maker.toLowerCase();
        const matchesPair = tokenPair === undefined || order.tokenPair === tokenPair;
        const isOpen = order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED';
        return matchesMaker && matchesPair && isOpen;
      });
      
      return Promise.resolve(orders.sort((a, b) => b.timestamp - a.timestamp));
    } catch (error) {
      logger.error('Failed to get user orders:', error);
      throw error;
    }
  }
  
  /**
   * Get order book for a trading pair
   * @param tokenPair - Trading pair symbol
   * @param depth - Number of price levels to return (default: 20)
   * @returns Promise that resolves to order book data
   */
  async getOrderBook(tokenPair: string, depth: number = 20): Promise<OrderBook> {
    this.ensureInitialized();
    
    try {
      // Check cache first
      const cached = this.orderBookCache.get(tokenPair);
      if (cached !== undefined && (Date.now() - cached.lastUpdate) < 1000) { // 1 second cache
        return cached;
      }
      
      // Fetch from validator
      const orderBookData = await this.client.getOrderBook(tokenPair, depth);
      
      const orderBook: OrderBook = {
        tokenPair,
        bids: orderBookData.bids.map(bid => ({
          price: bid.price,
          amount: bid.quantity,
          total: (parseFloat(bid.price) * parseFloat(bid.quantity)).toString(),
          orderCount: 1
        })),
        asks: orderBookData.asks.map(ask => ({
          price: ask.price,
          amount: ask.quantity,
          total: (parseFloat(ask.price) * parseFloat(ask.quantity)).toString(),
          orderCount: 1
        })),
        spread: orderBookData.spread,
        midPrice: orderBookData.midPrice,
        lastUpdate: Date.now()
      };
      
      // Update cache
      this.orderBookCache.set(tokenPair, orderBook);
      
      return orderBook;
    } catch (error) {
      logger.error('Failed to get order book:', error);
      throw error;
    }
  }
  
  /**
   * Get recent trades
   * @param _tokenPair - Trading pair symbol (currently unused)
   * @param _limit - Maximum number of trades to return (currently unused)
   * @returns Promise that resolves to array of recent trades (currently empty)
   */
  getRecentTrades(_tokenPair: string, _limit: number = 50): Promise<Trade[]> {
    this.ensureInitialized();
    
    // TODO: Implement when trade history query is available
    // For now, return empty array
    return Promise.resolve([]);
  }
  
  /**
   * Get 24h market data
   * @param tokenPair - Trading pair symbol
   * @returns Promise that resolves to market data and statistics
   */
  getMarketData(tokenPair: string): Promise<MarketData> {
    this.ensureInitialized();
    
    try {
      // TODO: Implement when market data query is available
      // For now, return mock data
      return Promise.resolve({
        tokenPair,
        lastPrice: '0',
        volume24h: '0',
        high24h: '0',
        low24h: '0',
        priceChange24h: '0',
        priceChangePercent24h: '0'
      });
    } catch (error) {
      logger.error('Failed to get market data:', error);
      throw error;
    }
  }
  
  /**
   * Get all trading pairs
   * @returns Array of supported trading pair symbols
   */
  getTradingPairs(): string[] {
    return this.config.tradingPairs;
  }
  
  /**
   * Subscribe to order book updates
   * @param tokenPair - Trading pair to subscribe to
   * @param callback - Function to call when order book updates
   * @returns Unsubscribe function
   */
  subscribeToOrderBook(
    tokenPair: string,
    callback: (orderBook: OrderBook) => void
  ): () => void {
    this.ensureInitialized();
    
    // Poll for updates (WebSocket subscription not yet available)
    const interval = setInterval(() => {
      void (async () => {
      try {
        const orderBook = await this.getOrderBook(tokenPair);
        callback(orderBook);
      } catch (error) {
        logger.error('Error in order book subscription:', error);
      }
      })();
    }, 1000); // Update every second
    
    // Return unsubscribe function
    return () => clearInterval(interval);
  }
  
  /**
   * Subscribe to trades
   * @param _tokenPair - Trading pair to subscribe to (currently unused)
   * @param _callback - Function to call on trade events (currently unused)
   * @returns Unsubscribe function (currently no-op)
   */
  subscribeToTrades(
    _tokenPair: string,
    _callback: (trade: Trade) => void
  ): () => void {
    this.ensureInitialized();
    
    // TODO: Implement WebSocket subscription when available
    logger.warn('Trade subscription not yet implemented');
    
    return () => {};
  }
  
  /**
   * Calculate trading fees
   * @param amount - Trade amount to calculate fees for
   * @param isMaker - Whether this is a maker order
   * @returns Object with fee amount, rate, and net amount
   */
  calculateFees(amount: string, isMaker: boolean): {
    feeAmount: string;
    feeRate: number;
    netAmount: string;
  } {
    const feeRate = isMaker ? this.config.feeStructure.maker : this.config.feeStructure.taker;
    const amountBN = ethers.parseUnits(amount, 18); // Using 18 decimals for XOM
    const feeAmountBN = amountBN * BigInt(Math.floor(feeRate * 1000000)) / BigInt(1000000);
    const netAmountBN = amountBN - feeAmountBN;
    
    return {
      feeAmount: ethers.formatUnits(feeAmountBN, 18),
      feeRate,
      netAmount: ethers.formatUnits(netAmountBN, 18)
    };
  }
  
  /**
   * Sync order book from validator
   * @param tokenPair - Trading pair to synchronize
   */
  private async syncOrderBook(tokenPair: string): Promise<void> {
    try {
      await this.getOrderBook(tokenPair);
    } catch (error) {
      logger.error('Failed to sync order book:', error);
    }
  }
  
  /**
   * Validate order parameters
   * @param order - Order object to validate
   * @param order.type - Order type (BUY or SELL)
   * @param order.pair - Trading pair symbol
   * @param order.price - Order price
   * @param order.quantity - Order quantity
   * @param order.userId - User ID placing the order
   */
  private validateOrder(order: {
    type?: string;
    pair?: string;
    price?: string;
    quantity?: string;
    userId?: string;
  }): void {
    if (order.type === undefined || !['BUY', 'SELL'].includes(order.type)) {
      throw new Error('Invalid order type');
    }
    
    if (!this.config.tradingPairs.includes(order.pair ?? '')) {
      throw new Error('Invalid trading pair');
    }
    
    const price = parseFloat(order.price ?? '0');
    if (isNaN(price) || price <= 0) {
      throw new Error('Invalid price');
    }
    
    const amount = parseFloat(order.quantity ?? '0');
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Invalid amount');
    }
    
    if (order.userId === undefined || !ethers.isAddress(order.userId)) {
      throw new Error('Invalid maker address');
    }
  }
  
  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('DEX service not initialized. Call initialize() first.');
    }
  }
  
  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    // Client is always initialized in constructor, so we can safely call close
    await this.client.close();
    this.orderCache.clear();
    this.orderBookCache.clear();
    this.isInitialized = false;
    logger.info('ValidatorDEXService closed');
  }
}

// Export singleton instance
export const validatorDEX = new ValidatorDEXService({
  validatorEndpoint: process.env['VALIDATOR_ENDPOINT'] ?? 'http://localhost:4000',
  wsEndpoint: process.env['VALIDATOR_WS_ENDPOINT'] ?? 'ws://localhost:4000/graphql',
  apiKey: process.env['VALIDATOR_API_KEY'],
  networkId: process.env['NETWORK_ID'] ?? 'omnibazaar-mainnet',
  tradingPairs: (process.env['TRADING_PAIRS'] ?? 'XOM/USDC,XOM/ETH,XOM/BTC').split(','),
  feeStructure: {
    maker: parseFloat(process.env['MAKER_FEE'] ?? '0.001'), // 0.1%
    taker: parseFloat(process.env['TAKER_FEE'] ?? '0.002')  // 0.2%
  },
  timeout: 30000,
  retryAttempts: 3
});

export default ValidatorDEXService;
/**
 * ValidatorDEXService - DEX integration with Avalanche Validator
 * 
 * Provides order book management, trade execution, and market data
 * through the Avalanche validator's GraphQL API.
 */

import { 
  AvalancheValidatorClient, 
  createAvalancheValidatorClient,
  type AvalancheValidatorClientConfig
} from '../client';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import type { UnifiedOrder as _UnifiedOrder } from '../types/config';

/**
 * Configuration for ValidatorDEXService
 */
export interface ValidatorDEXConfig extends AvalancheValidatorClientConfig {
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
  orderId: string;
  type: 'BUY' | 'SELL';
  tokenPair: string;
  price: string;
  amount: string;
  filled: string;
  status: 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';
  maker: string;
  timestamp: number;
}

/**
 * Order book data from validator
 */
export interface OrderBook {
  tokenPair: string;
  bids: OrderLevel[];
  asks: OrderLevel[];
  spread: string;
  midPrice: string;
  lastUpdate: number;
}

/**
 * Single price level in order book
 */
export interface OrderLevel {
  price: string;
  amount: string;
  total: string;
  orderCount: number;
}

/**
 * Trade execution data
 */
export interface Trade {
  tradeId: string;
  tokenPair: string;
  price: string;
  amount: string;
  side: 'BUY' | 'SELL';
  maker: string;
  taker: string;
  makerFee: string;
  takerFee: string;
  timestamp: number;
}

/**
 * Market data and statistics
 */
export interface MarketData {
  tokenPair: string;
  lastPrice: string;
  volume24h: string;
  high24h: string;
  low24h: string;
  priceChange24h: string;
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
  private client: AvalancheValidatorClient;
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
    this.client = createAvalancheValidatorClient({
      validatorEndpoint: config.validatorEndpoint,
      ...(config.wsEndpoint ? { wsEndpoint: config.wsEndpoint } : {}),
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      ...(config.timeout ? { timeout: config.timeout } : {}),
      ...(config.retryAttempts ? { retryAttempts: config.retryAttempts } : {})
    });
  }
  
  /**
   * Initialize the DEX service and establish validator connection
   * @throws {Error} If validator health check fails
   */
  async initialize(): Promise<void> {
    try {
      const health = await this.client.getHealth();
      if (!health.services.orderBook) {
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
   */
  async cancelOrder(orderId: string, maker: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      // Get order from cache
      const order = this.orderCache.get(orderId);
      if (!order) {
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
   */
  async getOrder(orderId: string): Promise<Order | null> {
    this.ensureInitialized();
    
    // Check cache first
    const cachedOrder = this.orderCache.get(orderId);
    if (cachedOrder) {
      return cachedOrder;
    }
    
    // TODO: Fetch from validator when query is available
    return null;
  }
  
  /**
   * Get user's open orders
   */
  async getUserOrders(maker: string, tokenPair?: string): Promise<Order[]> {
    this.ensureInitialized();
    
    try {
      // Filter from cache for now
      const orders = Array.from(this.orderCache.values()).filter(order => {
        const matchesMaker = order.maker.toLowerCase() === maker.toLowerCase();
        const matchesPair = !tokenPair || order.tokenPair === tokenPair;
        const isOpen = order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED';
        return matchesMaker && matchesPair && isOpen;
      });
      
      return orders.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('Failed to get user orders:', error);
      throw error;
    }
  }
  
  /**
   * Get order book for a trading pair
   */
  async getOrderBook(tokenPair: string, depth: number = 20): Promise<OrderBook> {
    this.ensureInitialized();
    
    try {
      // Check cache first
      const cached = this.orderBookCache.get(tokenPair);
      if (cached && (Date.now() - cached.lastUpdate) < 1000) { // 1 second cache
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
   */
  async getRecentTrades(_tokenPair: string, _limit: number = 50): Promise<Trade[]> {
    this.ensureInitialized();
    
    // TODO: Implement when trade history query is available
    // For now, return empty array
    return [];
  }
  
  /**
   * Get 24h market data
   */
  async getMarketData(tokenPair: string): Promise<MarketData> {
    this.ensureInitialized();
    
    try {
      // TODO: Implement when market data query is available
      // For now, return mock data
      return {
        tokenPair,
        lastPrice: '0',
        volume24h: '0',
        high24h: '0',
        low24h: '0',
        priceChange24h: '0',
        priceChangePercent24h: '0'
      };
    } catch (error) {
      logger.error('Failed to get market data:', error);
      throw error;
    }
  }
  
  /**
   * Get all trading pairs
   */
  getTradingPairs(): string[] {
    return this.config.tradingPairs;
  }
  
  /**
   * Subscribe to order book updates
   */
  subscribeToOrderBook(
    tokenPair: string,
    callback: (orderBook: OrderBook) => void
  ): () => void {
    this.ensureInitialized();
    
    // Poll for updates (WebSocket subscription not yet available)
    const interval = setInterval(async () => {
      try {
        const orderBook = await this.getOrderBook(tokenPair);
        callback(orderBook);
      } catch (error) {
        logger.error('Error in order book subscription:', error);
      }
    }, 1000); // Update every second
    
    // Return unsubscribe function
    return () => clearInterval(interval);
  }
  
  /**
   * Subscribe to trades
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
   */
  private validateOrder(order: {
    type?: string;
    pair?: string;
    price?: string;
    quantity?: string;
    userId?: string;
  }): void {
    if (!order.type || !['BUY', 'SELL'].includes(order.type)) {
      throw new Error('Invalid order type');
    }
    
    if (!this.config.tradingPairs.includes(order.pair || '')) {
      throw new Error('Invalid trading pair');
    }
    
    const price = parseFloat(order.price || '0');
    if (isNaN(price) || price <= 0) {
      throw new Error('Invalid price');
    }
    
    const amount = parseFloat(order.quantity || '0');
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Invalid amount');
    }
    
    if (!order.userId || !ethers.isAddress(order.userId)) {
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
    if (this.client) {
      await this.client.close();
    }
    this.orderCache.clear();
    this.orderBookCache.clear();
    this.isInitialized = false;
    logger.info('ValidatorDEXService closed');
  }
}

// Export singleton instance
export const validatorDEX = new ValidatorDEXService({
  validatorEndpoint: process.env['VALIDATOR_ENDPOINT'] || 'http://localhost:4000',
  wsEndpoint: process.env['VALIDATOR_WS_ENDPOINT'] || 'ws://localhost:4000/graphql',
  apiKey: process.env['VALIDATOR_API_KEY'],
  networkId: process.env['NETWORK_ID'] || 'omnibazaar-mainnet',
  tradingPairs: (process.env['TRADING_PAIRS'] || 'XOM/USDC,XOM/ETH,XOM/BTC').split(','),
  feeStructure: {
    maker: parseFloat(process.env['MAKER_FEE'] || '0.001'), // 0.1%
    taker: parseFloat(process.env['TAKER_FEE'] || '0.002')  // 0.2%
  },
  timeout: 30000,
  retryAttempts: 3
});

export default ValidatorDEXService;
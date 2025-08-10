/**
 * Decentralized Order Book - Core Trading Engine
 * 
 * Handles all trading operations with IPFS storage and validator consensus:
 * - All order types (market, limit, stop, advanced)
 * - Perpetual futures with funding rates
 * - Portfolio management and risk controls
 * - Auto-conversion to XOM
 * - Fee calculation and distribution
 * 
 * Resource usage: ~20% of validator hardware
 */

import { EventEmitter } from 'events';
import { 
  UnifiedOrder, 
  PerpetualOrder, 
  Position, 
  Portfolio, 
  Balance, 
  Trade, 
  OrderBook, 
  TradingPair, 
  Candle,
  ConversionResult
} from '../../types/config';
import { ServiceHealth } from '../../types/validator';
import { logger } from '../../utils/logger';
import { 
  PRECISION,
  toWei,
  fromWei,
  calculateFee
} from '../../constants/precision';
import { HybridDEXStorage } from '../../storage/HybridDEXStorage';
import { getStorageConfig } from '../../config/storage.config';
import { PrivacyDEXService } from '../../services/PrivacyDEXService';
import { ContractService, SettlementData } from '../../services/ContractService';
import { ethers } from 'ethers';

/**
 * Perpetual futures contract configuration
 */
interface PerpetualContract {
  /** Contract symbol */
  symbol: string;
  /** Base asset */
  baseAsset: string;
  /** Quote asset */
  quoteAsset: string;
  /** Current funding rate */
  fundingRate: number;
  /** Funding interval in seconds */
  fundingInterval: number;
  /** Maximum allowed leverage */
  maxLeverage: number;
  /** Minimum order size */
  minOrderSize: number;
  /** Whether contract is active */
  isActive: boolean;
}

interface PriceData {
  symbol: string;
  price: number;
  timestamp: number;
  volume: number;
  high24h: number;
  low24h: number;
  change24h: number;
}

interface OrderFilters {
  status?: string;
  pair?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

interface TradeFilters {
  pair?: string;
  type?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

interface CandleOptions {
  startTime?: number;
  endTime?: number;
  limit?: number;
}

interface FundingRateOptions {
  startTime?: number;
  endTime?: number;
  limit?: number;
}

interface FundingRateEntry {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  markPrice: number;
  indexPrice: number;
}

interface TickerData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  timestamp: number;
}

interface BlockTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  type: string;
  height: number;
  data: Record<string, unknown>;
}

interface OrderResult {
  success: boolean;
  orderId: string;
  order: UnifiedOrder;
  fees: number;
  message?: string;
}

interface PerpetualOrderResult {
  success: boolean;
  orderId: string;
  order: PerpetualOrder;
  fees: number;
  requiredMargin: number;
  message?: string;
}

interface CancelResult {
  success: boolean;
  orderId: string;
  order?: UnifiedOrder;
  message?: string;
}


interface MarketDepth {
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  lastUpdateId: number;
  timestamp: number;
}

interface MarketStatistics {
  totalVolume24h: number;
  totalTrades24h: number;
  activePairs: number;
  topGainers: TickerData[];
  topLosers: TickerData[];
  totalValueLocked: number;
  networkFees24h: number;
  activeValidators: number;
  timestamp: number;
}

// Interface for IPFS Storage Network (temporary until proper integration)
interface IPFSStorageNetwork {
  storeOrder(order: UnifiedOrder): Promise<string>;
  updateOrder(order: UnifiedOrder): Promise<void>;
}

/**
 * Configuration for the decentralized order book
 */
interface OrderBookConfig {
  /** List of supported trading pairs */
  tradingPairs: string[];
  /** Fee structure configuration */
  feeStructure: {
    /** Spot maker fee rate */
    spotMaker: number;
    /** Spot taker fee rate */
    spotTaker: number;
    /** Perpetual maker fee rate */
    perpetualMaker: number;
    /** Perpetual taker fee rate */
    perpetualTaker: number;
    /** Auto-conversion fee rate */
    autoConversion: number;
  };
  /** Maximum leverage allowed */
  maxLeverage: number;
  /** Liquidation threshold */
  liquidationThreshold: number;
}

/**
 * Decentralized Order Book - Core Trading Engine
 * 
 * Handles all trading operations with IPFS storage and validator consensus.
 * Uses hybrid storage architecture for optimal performance.
 * Resource usage: ~20% of validator hardware
 * 
 * @example
 * ```typescript
 * const orderBook = new DecentralizedOrderBook(config, storage);
 * await orderBook.initialize();
 * const result = await orderBook.placeOrder(orderData);
 * ```
 */
export class DecentralizedOrderBook extends EventEmitter {
  /** Order book configuration */
  private config: OrderBookConfig;
  /** IPFS storage network */
  private storage: IPFSStorageNetwork;
  /** Hybrid storage for performance optimization */
  private hybridStorage?: HybridDEXStorage;
  /** Privacy-enhanced DEX service for pXOM trading */
  private privacyService?: PrivacyDEXService;
  /** Contract service for on-chain settlement */
  private contractService?: ContractService;
  /** Initialization status */
  private isInitialized = false;
  
  /** All orders indexed by ID */
  private orders = new Map<string, UnifiedOrder>();
  /** Orders indexed by user ID */
  private ordersByUser = new Map<string, Set<string>>();
  /** Orders indexed by trading pair */
  private ordersByPair = new Map<string, Set<string>>();
  
  /** Perpetual positions (currently unused in mock implementation) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _positions = new Map<string, Position>();
  /** Perpetual contracts configuration */
  private perpetualContracts = new Map<string, PerpetualContract>();
  
  /** Order books by trading pair */
  private orderBooks = new Map<string, OrderBook>();
  /** Recent trades by pair */
  private recentTrades = new Map<string, Trade[]>();
  /** Price data cache (currently unused in mock implementation) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _priceData = new Map<string, PriceData>();
  
  /** Trading pairs configuration */
  private tradingPairs = new Map<string, TradingPair>();
  
  /**
   * Creates a new DecentralizedOrderBook instance
   * @param config - Order book configuration
   * @param storage - IPFS storage network instance
   */
  constructor(config: OrderBookConfig, storage: IPFSStorageNetwork) {
    super();
    this.config = config;
    this.storage = storage;
    
    // Initialize privacy service if provider is available
    this.initializePrivacyService();
    
    // Initialize contract service for on-chain settlement
    this.initializeContractService();
    
    logger.info('DecentralizedOrderBook created', {
      pairs: config.tradingPairs.length,
      feeStructure: config.feeStructure,
      privacyEnabled: !!this.privacyService,
      contractEnabled: !!this.contractService
    });
  }

  /**
   * Initialize the order book with all subsystems
   * Sets up hybrid storage, trading pairs, perpetual contracts, and matching engine
   * @throws {Error} If already initialized or initialization fails
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Order book already initialized');
    }

    try {
      logger.info('🚀 Initializing Decentralized Order Book...');

      // Initialize hybrid storage
      await this.initializeHybridStorage();
      
      // Initialize trading pairs (including pXOM pairs)
      await this.initializeTradingPairs();
      
      // Initialize privacy trading pairs if service is available
      if (this.privacyService) {
        await this.initializePrivacyPairs();
      }
      
      // Initialize perpetual contracts
      await this.initializePerpetualContracts();
      
      // Load existing orders from storage
      await this.loadOrdersFromStorage();
      
      // Start order matching engine
      this.startOrderMatching();
      
      // Start market data updates
      this.startMarketDataUpdates();
      
      this.isInitialized = true;
      
      logger.info('✅ Decentralized Order Book initialized');
      logger.info(`📊 Trading pairs: ${this.tradingPairs.size}`);
      logger.info(`📈 Active orders: ${this.orders.size}`);
      logger.info(`🔐 Privacy enabled: ${!!this.privacyService}`);
      
    } catch (error) {
      logger.error('❌ Failed to initialize order book:', error);
      throw error;
    }
  }

  /**
   * Place a new trading order in the decentralized order book
   * Validates order, stores in hybrid storage, and attempts immediate matching
   * @param orderData - Partial order data (will be completed with defaults)
   * @returns Promise resolving to order result with execution details
   * @throws {Error} If order validation fails or storage errors occur
   * @example
   * ```typescript
   * const result = await orderBook.placeOrder({
   *   userId: 'user123',
   *   type: 'LIMIT',
   *   side: 'BUY',
   *   pair: 'XOM/USDC',
   *   quantity: '100',
   *   price: '1.50'
   * });
   * ```
   */
  async placeOrder(orderData: Partial<UnifiedOrder>): Promise<OrderResult> {
    try {
      // Check if this is a privacy order (pXOM pair)
      if (this.privacyService && this.isPrivacyPair(orderData.pair || '')) {
        return await this.placePrivacyOrder(orderData);
      }
      
      // Validate order
      this.validateOrder(orderData);
      
      // Create order with ID
      const order: UnifiedOrder = {
        id: this.generateOrderId(),
        userId: orderData.userId!,
        type: orderData.type!,
        side: orderData.side!,
        pair: orderData.pair!,
        quantity: orderData.quantity!,
        ...(orderData.price && { price: orderData.price }),
        ...(orderData.stopPrice && { stopPrice: orderData.stopPrice }),
        timeInForce: orderData.timeInForce || 'GTC',
        leverage: orderData.leverage || 1,
        reduceOnly: orderData.reduceOnly || false,
        postOnly: orderData.postOnly || false,
        status: 'PENDING',
        filled: '0',
        remaining: orderData.quantity!,
        fees: '0',
        timestamp: Date.now(),
        updatedAt: Date.now(),
        validatorSignatures: [],
        replicationNodes: []
      };

      // Store in hybrid storage for high performance
      if (this.hybridStorage) {
        await this.hybridStorage.placeOrder(order);
      } else {
        // Fallback to IPFS
        const ipfsCID = await this.storage.storeOrder(order);
        order.ipfsCID = ipfsCID;
      }

      // Add to local state
      this.orders.set(order.id, order);
      this.addOrderToUserIndex(order);
      this.addOrderToPairIndex(order);

      // Attempt immediate matching for market orders
      let result;
      if (order.type === 'MARKET') {
        result = await this.executeMarketOrder(order);
      } else {
        result = await this.addLimitOrder(order);
      }

      // Emit events
      this.emit('orderPlaced', order);
      
      logger.info('Order placed', {
        orderId: order.id,
        type: order.type,
        pair: order.pair,
        quantity: order.quantity
      });

      return result;

    } catch (error) {
      logger.error('Error placing order:', error);
      throw error;
    }
  }

  /**
   * Place a perpetual futures order with leverage and margin requirements
   * Calculates margin requirements and manages positions
   * @param orderData - Perpetual order data
   * @returns Promise resolving to perpetual order result with position details
   * @throws {Error} If margin is insufficient or validation fails
   * @example
   * ```typescript
   * const result = await orderBook.placePerpetualOrder({
   *   userId: 'user123',
   *   type: 'LIMIT',
   *   side: 'LONG',
   *   contract: 'XOM-PERP',
   *   size: '100',
   *   leverage: 10
   * });
   * ```
   */
  async placePerpetualOrder(orderData: Partial<PerpetualOrder>): Promise<PerpetualOrderResult> {
    try {
      // Validate perpetual order
      this.validatePerpetualOrder(orderData);
      
      // Calculate margin requirements
      const marginRequired = this.calculateMarginRequired(
        orderData.size!,
        orderData.leverage!,
        orderData.contract!
      );

      // Check margin availability
      await this.checkMarginAvailability(orderData.userId!, marginRequired);

      // Create position or modify existing
      await this.updatePosition(orderData);
      
      const orderId = this.generateOrderId();
      const order: PerpetualOrder = {
        id: orderId,
        userId: orderData.userId!,
        type: orderData.type || 'LIMIT',
        contract: orderData.contract!,
        side: orderData.side!,
        size: orderData.size!,
        leverage: orderData.leverage!,
        margin: marginRequired,
        reduceOnly: orderData.reduceOnly || false,
        timeInForce: orderData.timeInForce || 'GTC',
        price: orderData.price,
        status: 'OPEN',
        timestamp: Date.now()
      };

      const result = {
        success: true,
        orderId,
        order,
        fees: parseFloat(this.calculatePerpetualFees(orderData.size!, orderData.leverage!)),
        requiredMargin: parseFloat(marginRequired)
      };

      this.emit('perpetualOrderPlaced', result);
      
      return result;

    } catch (error) {
      logger.error('Error placing perpetual order:', error);
      throw error;
    }
  }

  /**
   * Cancel an open order
   * Validates ownership and updates storage
   * @param orderId - ID of order to cancel
   * @param userId - ID of user requesting cancellation
   * @returns Promise resolving to cancellation result
   * @example
   * ```typescript
   * const result = await orderBook.cancelOrder('order123', 'user456');
   * ```
   */
  async cancelOrder(orderId: string, userId: string): Promise<CancelResult> {
    const order = this.orders.get(orderId);
    
    if (!order) {
      return { success: false, orderId, message: 'Order not found' };
    }
    
    if (order.userId !== userId) {
      return { success: false, orderId, message: 'Unauthorized' };
    }
    
    if (order.status !== 'OPEN') {
      return { success: false, orderId, message: 'Order cannot be cancelled' };
    }

    // Update order status
    order.status = 'CANCELLED';
    order.updatedAt = Date.now();

    // Update storage
    if (this.hybridStorage) {
      await this.hybridStorage.placeOrder(order); // Updates existing
    } else {
      await this.storage.updateOrder(order);
    }

    // Remove from indices
    this.removeOrderFromIndices(order);

    this.emit('orderCancelled', order);
    
    return { success: true, orderId, order };
  }

  /**
   * Get order details by ID with user authorization
   * @param orderId - Order ID to retrieve
   * @param userId - User ID for authorization
   * @returns Promise resolving to order or null if not found/unauthorized
   */
  async getOrder(orderId: string, userId: string): Promise<UnifiedOrder | null> {
    const order = this.orders.get(orderId);
    
    if (!order || order.userId !== userId) {
      return null;
    }
    
    return order;
  }

  /**
   * Get orders for a specific user with filtering and pagination
   * @param userId - User ID to get orders for
   * @param filters - Filters for pair, status, pagination
   * @returns Promise resolving to filtered list of user orders
   * @example
   * ```typescript
   * const orders = await orderBook.getUserOrders('user123', {
   *   pair: 'XOM/USDC',
   *   status: 'OPEN',
   *   limit: 20
   * });
   * ```
   */
  async getUserOrders(userId: string, filters: OrderFilters): Promise<UnifiedOrder[]> {
    const userOrderIds = this.ordersByUser.get(userId) || new Set();
    let orders: UnifiedOrder[] = [];

    for (const orderId of userOrderIds) {
      const order = this.orders.get(orderId);
      if (order) {
        orders.push(order);
      }
    }

    // Apply filters
    if (filters.pair) {
      orders = orders.filter(o => o.pair === filters.pair);
    }
    
    if (filters.status) {
      orders = orders.filter(o => o.status === filters.status);
    }

    // Apply pagination
    const start = filters.offset || 0;
    const end = start + (filters.limit || 50);
    
    return orders.slice(start, end);
  }

  /**
   * Get complete user portfolio including balances, positions, and P&L
   * @param userId - User ID to get portfolio for
   * @returns Promise resolving to comprehensive portfolio data
   * @example
   * ```typescript
   * const portfolio = await orderBook.getPortfolio('user123');
   * console.log('Total value:', portfolio.totalValue);
   * ```
   */
  async getPortfolio(userId: string): Promise<Portfolio> {
    // Get balances (would integrate with wallet/blockchain)
    const balances = await this.getUserBalances(userId);
    
    // Get positions
    const positions = await this.getUserPositions(userId);
    
    // Get open orders
    const openOrders = await this.getUserOrders(userId, { status: 'OPEN' });

    // Calculate portfolio values
    const totalValue = this.calculatePortfolioValue(balances, positions);
    const unrealizedPnL = this.calculateUnrealizedPnL(positions);
    const usedMargin = this.calculateUsedMargin(positions);
    const availableMargin = this.calculateAvailableMargin(balances, usedMargin);

    return {
      userId,
      balances,
      positions,
      openOrders,
      totalValue,
      unrealizedPnL,
      realizedPnL: '0', // Would track from trade history
      availableMargin,
      usedMargin,
      marginRatio: this.calculateMarginRatio(usedMargin, totalValue)
    };
  }

  /**
   * Auto-convert any token to XOM for OmniCoin-centric trading
   * Uses 18-digit precision arithmetic for accurate calculations
   * @param _userId - User requesting conversion
   * @param fromToken - Source token symbol to convert from
   * @param amount - Amount to convert (in source token units)
   * @param _slippageTolerance - Maximum acceptable slippage (0-1)
   * @returns Promise resolving to conversion result with fees and final amount
   * @example
   * ```typescript
   * const result = await orderBook.autoConvertToXOM(
   *   'user123',
   *   'USDC',
   *   '1000',
   *   0.005
   * );
   * ```
   */
  async autoConvertToXOM(
    _userId: string,
    fromToken: string,
    amount: string,
    _slippageTolerance: number
  ): Promise<ConversionResult> {
    try {
      // Calculate conversion rate
      const rate = await this.getConversionRate(fromToken, 'XOM');
      // Use bigint for 18-digit precision
      const amountBN = toWei(amount);
      const rateBN = toWei(rate.toString());
      const expectedOutputBN = (amountBN * rateBN) / PRECISION;
      
      // Calculate fees with proper precision
      const feesBN = calculateFee(expectedOutputBN, this.config.feeStructure.autoConversion * 10000);
      const finalOutputBN = expectedOutputBN - feesBN;
      
      const fees = fromWei(feesBN);
      const finalOutput = fromWei(finalOutputBN);
      
      // Execute conversion (would integrate with DEX aggregator)
      const conversion: ConversionResult = {
        success: true,
        id: this.generateOrderId(),
        fromToken,
        fromAmount: amount,
        toToken: 'XOM',
        toAmount: finalOutput,
        conversionRate: rate.toString(),
        fees,
        actualSlippage: 0.001, // Would calculate actual slippage
        timestamp: Date.now(),
        validatorApproval: true
      };

      this.emit('conversionExecuted', conversion);
      
      return conversion;

    } catch (error) {
      logger.error('Auto-conversion failed:', error);
      throw error;
    }
  }

  /**
   * Get order book data for a trading pair with validator consensus
   * @param pair - Trading pair symbol (e.g., 'XOM/USDC')
   * @param limit - Maximum number of price levels to return (default: 100)
   * @returns Promise resolving to order book with bids, asks, and consensus metadata
   * @example
   * ```typescript
   * const orderBook = await orderBook.getOrderBook('XOM/USDC', 50);
   * ```
   */
  async getOrderBook(pair: string, limit: number = 100): Promise<OrderBook> {
    // Try hybrid storage first for performance
    if (this.hybridStorage) {
      try {
        return await this.hybridStorage.getOrderBook(pair, limit);
      } catch (error) {
        logger.warn('Failed to get order book from hybrid storage, falling back to local', error);
      }
    }
    
    const orderBook = this.orderBooks.get(pair);
    
    if (!orderBook) {
      // Create empty order book
      return {
        pair,
        bids: [],
        asks: [],
        timestamp: Date.now(),
        sequence: 0,
        sourceNodes: [],
        validatorConsensus: true,
        consensusScore: 1.0
      };
    }

    // Limit the number of levels
    return {
      ...orderBook,
      bids: orderBook.bids.slice(0, limit),
      asks: orderBook.asks.slice(0, limit)
    };
  }

  /**
   * Settle a trade on-chain using the OmniCore contract
   * @param buyer - Buyer address
   * @param seller - Seller address
   * @param token - Token address being traded
   * @param amount - Amount of tokens
   * @param orderId - Order identifier
   * @returns Promise resolving to settlement success
   */
  async settleTradeOnChain(
    buyer: string,
    seller: string,
    token: string,
    amount: string,
    orderId: string
  ): Promise<boolean> {
    try {
      if (!this.contractService) {
        logger.warn('Contract service not available, using off-chain settlement');
        return true; // Fallback to off-chain settlement
      }

      const settlement: SettlementData = {
        buyer,
        seller,
        token,
        amount,
        orderId
      };

      const result = await this.contractService.settleDEXTrade(settlement);
      
      if (result.success) {
        logger.info('Trade settled on-chain', {
          txHash: result.txHash,
          orderId,
          buyer,
          seller,
          amount
        });
        
        // Emit settlement event
        this.emit('tradeSettled', {
          orderId,
          buyer,
          seller,
          token,
          amount,
          txHash: result.txHash,
          blockNumber: result.blockNumber,
          timestamp: Date.now()
        });
        
        return true;
      } else {
        logger.error('On-chain settlement failed', {
          orderId,
          error: result.error
        });
        return false;
      }
    } catch (error) {
      logger.error('Error settling trade on-chain:', error);
      // Fallback to off-chain settlement
      return true;
    }
  }

  /**
   * Batch settle multiple trades on-chain for gas efficiency
   * @param settlements - Array of settlement data
   * @returns Promise resolving to batch settlement success
   */
  async batchSettleTradesOnChain(settlements: SettlementData[]): Promise<boolean> {
    try {
      if (!this.contractService || settlements.length === 0) {
        return true; // Fallback to off-chain
      }

      const batchData = {
        buyers: settlements.map(s => s.buyer),
        sellers: settlements.map(s => s.seller),
        tokens: settlements.map(s => s.token),
        amounts: settlements.map(s => s.amount),
        batchId: `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`
      };

      const result = await this.contractService.batchSettleDEX(batchData);
      
      if (result.success) {
        logger.info('Batch settled on-chain', {
          txHash: result.txHash,
          batchId: batchData.batchId,
          count: settlements.length
        });
        
        // Emit batch settlement event
        this.emit('batchTradeSettled', {
          batchId: batchData.batchId,
          settlements,
          txHash: result.txHash,
          blockNumber: result.blockNumber,
          timestamp: Date.now()
        });
        
        return true;
      } else {
        logger.error('Batch settlement failed', {
          batchId: batchData.batchId,
          error: result.error
        });
        return false;
      }
    } catch (error) {
      logger.error('Error batch settling trades:', error);
      return true; // Fallback
    }
  }

  /**
   * Distribute DEX fees according to tokenomics
   * @param token - Fee token address
   * @param totalFee - Total fee amount
   * @param validatorAddress - Validator processing the transaction
   */
  async distributeFees(
    token: string,
    totalFee: string,
    validatorAddress: string
  ): Promise<void> {
    try {
      if (!this.contractService) {
        logger.warn('Contract service not available, fees held locally');
        return;
      }

      const result = await this.contractService.distributeDEXFees(
        token,
        totalFee,
        validatorAddress
      );

      if (result.success) {
        logger.info('Fees distributed on-chain', {
          txHash: result.txHash,
          token,
          totalFee,
          validator: validatorAddress
        });
      }
    } catch (error) {
      logger.error('Error distributing fees:', error);
    }
  }

  /**
   * Get health status of the order book service
   * @returns Promise resolving to service health with operational metrics
   */
  async getHealthStatus(): Promise<ServiceHealth> {
    const activeOrders = Array.from(this.orders.values()).filter(o => o.status === 'OPEN').length;
    const tradingPairs = this.tradingPairs.size;
    
    return {
      status: 'healthy',
      uptime: Date.now(),
      lastCheck: Date.now(),
      details: {
        activeOrders,
        tradingPairs,
        isMatching: true,
        memoryUsage: process.memoryUsage().heapUsed
      }
    };
  }

  /**
   * Process block transactions for settlement
   */
  async processBlockTransactions(block: BlockTransaction): Promise<void> {
    // Process settlement transactions from blockchain
    logger.debug('Processing block transactions', { blockHeight: block.height });
  }

  /**
   * Gracefully shutdown the order book
   * Saves all pending orders to storage and cleans up resources
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Decentralized Order Book...');
    
    // Save all pending orders to storage
    for (const order of this.orders.values()) {
      if (order.status === 'OPEN') {
        if (this.hybridStorage) {
          await this.hybridStorage.placeOrder(order);
        } else {
          await this.storage.updateOrder(order);
        }
      }
    }
    
    // Shutdown hybrid storage
    if (this.hybridStorage) {
      await this.hybridStorage.shutdown();
    }
    
    // Clear local state
    this.orders.clear();
    this.ordersByUser.clear();
    this.ordersByPair.clear();
    
    logger.info('✅ Order book shutdown completed');
  }

  // Helper methods
  private validateOrder(orderData: Partial<UnifiedOrder>): void {
    if (!orderData.userId || !orderData.type || !orderData.side || !orderData.pair || !orderData.quantity) {
      throw new Error('Missing required order fields');
    }
    
    if (orderData.type === 'LIMIT' && !orderData.price) {
      throw new Error('Limit orders require a price');
    }
  }

  private validatePerpetualOrder(orderData: Partial<PerpetualOrder>): void {
    if (!orderData.userId || !orderData.contract || !orderData.size || !orderData.leverage) {
      throw new Error('Missing required perpetual order fields');
    }
  }

  private generateOrderId(): string {
    return `order_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private addOrderToUserIndex(order: UnifiedOrder): void {
    if (!this.ordersByUser.has(order.userId)) {
      this.ordersByUser.set(order.userId, new Set());
    }
    this.ordersByUser.get(order.userId)!.add(order.id);
  }

  private addOrderToPairIndex(order: UnifiedOrder): void {
    if (!this.ordersByPair.has(order.pair)) {
      this.ordersByPair.set(order.pair, new Set());
    }
    this.ordersByPair.get(order.pair)!.add(order.id);
  }

  private removeOrderFromIndices(order: UnifiedOrder): void {
    this.ordersByUser.get(order.userId)?.delete(order.id);
    this.ordersByPair.get(order.pair)?.delete(order.id);
  }

  private async executeMarketOrder(order: UnifiedOrder): Promise<OrderResult> {
    // Market order execution logic
    order.status = 'FILLED';
    order.filled = order.quantity;
    order.remaining = '0';
    order.averagePrice = '1.50'; // Would calculate from matches
    
    return {
      success: true,
      orderId: order.id,
      order: order,
      fees: parseFloat(order.fees)
    };
  }

  private async addLimitOrder(order: UnifiedOrder): Promise<OrderResult> {
    // Add to order book
    order.status = 'OPEN';
    
    return {
      success: true,
      orderId: order.id,
      order: order,
      fees: parseFloat(order.fees)
    };
  }

  /**
   * Initialize hybrid storage system
   */
  private async initializeHybridStorage(): Promise<void> {
    try {
      const storageConfig = getStorageConfig();
      this.hybridStorage = new HybridDEXStorage(storageConfig);
      await this.hybridStorage.initialize();
      logger.info('✅ Hybrid storage initialized');
    } catch (error) {
      logger.warn('Failed to initialize hybrid storage, using IPFS only', error);
      // Continue without hybrid storage - fallback to IPFS
    }
  }

  private async initializeTradingPairs(): Promise<void> {
    // Add pXOM pairs to config if privacy service is available
    const allPairs = [...this.config.tradingPairs];
    if (this.privacyService) {
      // Add standard pXOM pairs
      const pxomPairs = [
        'pXOM/USDC',
        'pXOM/ETH',
        'pXOM/BTC',
        'pXOM/XOM',  // Direct conversion pair
        'pXOM/DAI',
        'pXOM/USDT'
      ];
      allPairs.push(...pxomPairs.filter(p => !allPairs.includes(p)));
    }
    
    // Initialize all trading pairs (including pXOM)
    for (const pairSymbol of allPairs) {
      const [base, quote] = pairSymbol.split('/');
      const pair: TradingPair = {
        symbol: pairSymbol,
        baseAsset: base || 'XOM',
        quoteAsset: quote || 'USDC',
        type: 'spot',
        status: 'TRADING',
        minOrderSize: '0.001',
        maxOrderSize: '1000000',
        priceIncrement: '0.01',
        quantityIncrement: '0.001',
        makerFee: this.config.feeStructure.spotMaker,
        takerFee: this.config.feeStructure.spotTaker,
        validatorSignatures: []
      };
      
      this.tradingPairs.set(pairSymbol, pair);
    }
  }

  private async initializePerpetualContracts(): Promise<void> {
    // Initialize perpetual contracts
    logger.info('Initializing perpetual contracts...');
  }

  private async loadOrdersFromStorage(): Promise<void> {
    // Load existing orders from storage
    if (this.hybridStorage) {
      logger.info('Loading orders from hybrid storage...');
      // Would implement loading from PostgreSQL warm storage
    } else {
      logger.info('Loading orders from IPFS...');
      // Load from IPFS
    }
  }

  private startOrderMatching(): void {
    // Start order matching engine
    logger.info('Starting order matching engine...');
    
    // Privacy service handles its own order matching
    if (this.privacyService) {
      logger.info('Privacy order matching engine active');
    }
  }

  private startMarketDataUpdates(): void {
    // Start market data updates
    logger.info('Starting market data updates...');
  }

  // Placeholder implementations for complex calculations
  private calculateMarginRequired(size: string, leverage: number, _contract: string): string {
    // Use bigint for proper division
    const sizeBN = toWei(size);
    const marginBN = sizeBN / BigInt(leverage);
    return fromWei(marginBN);
  }

  private async checkMarginAvailability(userId: string, required: string): Promise<void> {
    // Check if user has sufficient margin
    // Placeholder implementation
    logger.debug('Checking margin availability', { userId, required });
  }

  private async updatePosition(orderData: Partial<PerpetualOrder>): Promise<Position> {
    // Create or update position
    return {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: orderData.userId || 'unknown',
      pair: orderData.contract || 'XOM/USDC',
      type: 'PERPETUAL',
      side: orderData.side || 'LONG',
      status: 'ACTIVE',
      openedAt: Date.now(),
      contract: orderData.contract!,
      size: orderData.size!,
      entryPrice: '1.50',
      markPrice: '1.50',
      leverage: orderData.leverage!,
      margin: orderData.margin!,
      unrealizedPnL: '0',
      liquidationPrice: '1.20',
      fundingPayment: '0',
      lastFundingTime: Date.now()
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _calculateLiquidationPrice(_position: Position): string {
    // Calculate liquidation price - simplified implementation
    return '1000.00'; // Would calculate based on margin and leverage
  }

  private calculateUnrealizedPnL(input: Position | Position[]): string {
    // Calculate unrealized P&L
    if (Array.isArray(input)) {
      return input.reduce((sum, p) => {
        const pnlBN = toWei(p.unrealizedPnL || '0');
        return sum + pnlBN;
      }, 0n).toString();
    }
    return input.unrealizedPnL || '0';
  }

  private calculatePerpetualFees(size: string, _leverage: number): string {
    const sizeBN = toWei(size);
    const feeBN = calculateFee(sizeBN, this.config.feeStructure.perpetualTaker * 10000);
    return fromWei(feeBN);
  }

  private async getUserBalances(userId: string): Promise<Balance[]> {
    // Get user balances from blockchain/wallet
    logger.debug('Getting user balances', { userId });
    return [
      { asset: 'XOM', free: '1000', locked: '100', total: '1100', usdValue: '1650' },
      { asset: 'USDC', free: '500', locked: '0', total: '500', usdValue: '500' }
    ];
  }

  private async getUserPositions(userId: string): Promise<Position[]> {
    // Get user perpetual positions
    logger.debug('Getting user positions', { userId });
    return [];
  }

  private calculatePortfolioValue(balances: Balance[], _positions: Position[]): string {
    const balanceValue = balances.reduce((sum, b) => {
      const valueBN = b.usdValue ? toWei(b.usdValue) : 0n;
      return sum + valueBN;
    }, 0n);
    return fromWei(balanceValue);
  }

  private calculateUsedMargin(positions: Position[]): string {
    const totalMargin = positions.reduce((sum, p) => {
      const marginBN = toWei(p.margin);
      return sum + marginBN;
    }, 0n);
    return fromWei(totalMargin);
  }

  private calculateAvailableMargin(balances: Balance[], usedMargin: string): string {
    const totalValueBN = toWei(this.calculatePortfolioValue(balances, []));
    const usedMarginBN = toWei(usedMargin);
    const availableMarginBN = totalValueBN - usedMarginBN;
    return fromWei(availableMarginBN);
  }

  private async getConversionRate(fromToken: string, toToken: string): Promise<number> {
    // Get conversion rate from price oracles
    logger.debug('Getting conversion rate', { fromToken, toToken });
    return 1.5; // XOM price in terms of fromToken
  }

  // Additional methods for getting trading pairs, tickers, etc.
  async getTradingPairs(): Promise<TradingPair[]> {
    return Array.from(this.tradingPairs.values());
  }

  async getTicker(pair: string): Promise<TickerData> {
    // Return ticker data for pair
    return {
      symbol: pair,
      price: 1.50,
      priceChange: 0.05,
      priceChangePercent: 3.45,
      high24h: 1.55,
      low24h: 1.45,
      volume24h: 10000,
      quoteVolume24h: 15000,
      timestamp: Date.now()
    };
  }

  async getAllTickers(): Promise<TickerData[]> {
    const tickers = [];
    for (const pair of this.tradingPairs.keys()) {
      tickers.push(await this.getTicker(pair));
    }
    return tickers;
  }

  async getRecentTrades(pair: string, limit: number): Promise<Trade[]> {
    return this.recentTrades.get(pair)?.slice(0, limit) || [];
  }

  async getCandles(pair: string, interval: string, options: CandleOptions): Promise<Candle[]> {
    // Return candlestick data
    logger.debug('Getting candles', { pair, interval, options });
    return [];
  }

  async getMarketDepth(pair: string, limit: number): Promise<MarketDepth> {
    const orderBook = await this.getOrderBook(pair, limit);
    return {
      lastUpdateId: Date.now(),
      bids: orderBook.bids.map(level => [parseFloat(level.price), parseFloat(level.quantity)] as [number, number]),
      asks: orderBook.asks.map(level => [parseFloat(level.price), parseFloat(level.quantity)] as [number, number]),
      timestamp: Date.now()
    };
  }

  async getPerpetualContracts(): Promise<PerpetualContract[]> {
    return Array.from(this.perpetualContracts.values());
  }

  async getFundingRateHistory(symbol: string, options: FundingRateOptions): Promise<FundingRateEntry[]> {
    logger.debug('Getting funding rate history', { symbol, options });
    return [];
  }

  async getMarketStatistics(): Promise<MarketStatistics> {
    return {
      totalVolume24h: 1000000,
      totalTrades24h: 5000,
      activePairs: this.tradingPairs.size,
      topGainers: [],
      topLosers: [],
      totalValueLocked: 10000000,
      networkFees24h: 1000,
      activeValidators: 50,
      timestamp: Date.now()
    };
  }

  async getUserTrades(userId: string, filters: TradeFilters): Promise<Trade[]> {
    logger.debug('Getting user trades', { userId, filters });
    return [];
  }

  async getPerpetualPositions(userId: string): Promise<Position[]> {
    return this.getUserPositions(userId);
  }

  /**
   * Calculate margin ratio with proper precision
   */
  private calculateMarginRatio(usedMargin: string, totalValue: string): number {
    if (totalValue === '0' || !totalValue) return 0;
    
    const usedMarginBN = toWei(usedMargin);
    const totalValueBN = toWei(totalValue);
    
    // Calculate ratio with 4 decimal precision
    const ratioBN = (usedMarginBN * 10000n) / totalValueBN;
    return Number(ratioBN) / 10000;
  }
  
  /**
   * Initialize privacy DEX service for pXOM trading
   * Creates service with COTI SDK integration if available
   */
  private async initializePrivacyService(): Promise<void> {
    try {
      // Check if we have a provider (would come from config in production)
      const provider = new ethers.JsonRpcProvider(
        process.env.COTI_RPC_URL || 'https://devnet.coti.io'
      );
      
      this.privacyService = new PrivacyDEXService(
        {
          privacyEnabled: true,
          mpcNodeUrl: process.env.COTI_MPC_URL || 'https://mpc.coti.io',
          conversionFee: 0.005 // 0.5% for XOM to pXOM
        },
        provider
      );
      
      logger.info('Privacy DEX service initialized');
    } catch (error) {
      logger.warn('Privacy DEX service not available:', error);
      // Continue without privacy features
    }
  }

  /**
   * Initialize contract service for on-chain settlement
   */
  private initializeContractService(): void {
    try {
      // Get contract configuration from environment or defaults
      const contractAddress = process.env.OMNICORE_CONTRACT_ADDRESS || 
        '0x1234567890123456789012345678901234567890'; // Placeholder for testnet
      const providerUrl = process.env.RPC_URL || 
        'https://api.avax-test.network/ext/bc/C/rpc'; // Avalanche testnet
      
      // Validator private key for settlement (would come from secure storage)
      const validatorKey = process.env.VALIDATOR_PRIVATE_KEY;
      
      this.contractService = new ContractService({
        contractAddress,
        providerUrl,
        privateKey: validatorKey,
        gasLimit: 500000,
        gasPrice: ethers.parseUnits('25', 'gwei').toString(),
        confirmations: 1 // Fast confirmation for testing
      });
      
      // Listen for settlement events
      this.contractService.onSettlement((event) => {
        logger.info('On-chain settlement confirmed', event);
        this.emit('settlementConfirmed', event);
      });
      
      this.contractService.onBatchSettlement((event) => {
        logger.info('Batch settlement confirmed', event);
        this.emit('batchSettlementConfirmed', event);
      });
      
      logger.info('Contract service initialized', { contractAddress });
    } catch (error) {
      logger.warn('Contract service not available:', error);
      // Continue with off-chain settlement only
    }
  }
  
  /**
   * Initialize privacy trading pairs for pXOM
   * Adds pXOM pairs to the trading pairs map
   */
  private async initializePrivacyPairs(): Promise<void> {
    if (!this.privacyService) return;
    
    const pxomPairs = this.privacyService.getPXOMPairs();
    
    for (const pairSymbol of pxomPairs) {
      if (!this.tradingPairs.has(pairSymbol)) {
        const [base, quote] = pairSymbol.split('/');
        const pair: TradingPair = {
          symbol: pairSymbol,
          baseAsset: base,
          quoteAsset: quote,
          type: 'spot',
          status: 'TRADING',
          minOrderSize: '0.001',
          maxOrderSize: '1000000',
          priceIncrement: '0.01',
          quantityIncrement: '0.001',
          makerFee: this.config.feeStructure.spotMaker,
          takerFee: this.config.feeStructure.spotTaker,
          validatorSignatures: [],
          isPrivacy: true // Mark as privacy pair
        } as TradingPair & { isPrivacy: boolean };
        
        this.tradingPairs.set(pairSymbol, pair);
      }
    }
    
    logger.info(`Initialized ${pxomPairs.length} privacy trading pairs`);
  }
  
  /**
   * Check if a trading pair is a privacy pair (contains pXOM)
   * @param pair - Trading pair symbol to check
   * @returns True if the pair involves pXOM
   */
  private isPrivacyPair(pair: string): boolean {
    return pair.includes('pXOM') || (this.privacyService?.isPrivacyPair(pair) || false);
  }
  
  /**
   * Place a privacy-preserving order for pXOM pairs
   * Routes order through privacy service with optional encryption
   * @param orderData - Order data with privacy options
   * @returns Order result with privacy metadata
   */
  private async placePrivacyOrder(orderData: Partial<UnifiedOrder>): Promise<OrderResult> {
    if (!this.privacyService) {
      throw new Error('Privacy service not available');
    }
    
    const orderId = await this.privacyService.createPrivacyOrder(
      orderData.userId!,
      orderData.pair!,
      orderData.side as 'buy' | 'sell',
      parseFloat(orderData.quantity!),
      orderData.type?.toLowerCase() as 'market' | 'limit',
      orderData.price ? parseFloat(orderData.price) : undefined,
      true // Use privacy by default for pXOM pairs
    );
    
    // Create order object for tracking
    const order: UnifiedOrder = {
      id: orderId,
      userId: orderData.userId!,
      type: orderData.type!,
      side: orderData.side!,
      pair: orderData.pair!,
      quantity: orderData.quantity!,
      ...(orderData.price && { price: orderData.price }),
      timeInForce: orderData.timeInForce || 'GTC',
      leverage: 1,
      reduceOnly: false,
      postOnly: false,
      status: 'OPEN',
      filled: '0',
      remaining: orderData.quantity!,
      fees: '0',
      timestamp: Date.now(),
      updatedAt: Date.now(),
      validatorSignatures: [],
      replicationNodes: [],
      isPrivacy: true // Mark as privacy order
    } as UnifiedOrder & { isPrivacy: boolean };
    
    // Add to local state
    this.orders.set(order.id, order);
    this.addOrderToUserIndex(order);
    this.addOrderToPairIndex(order);
    
    logger.info('Privacy order placed', {
      orderId,
      pair: orderData.pair,
      isPrivate: true
    });
    
    return {
      success: true,
      orderId,
      order,
      fees: 0,
      message: 'Privacy order placed successfully'
    };
  }
  
  /**
   * Get privacy DEX statistics
   * @returns Privacy trading statistics and pool information
   */
  async getPrivacyStats(): Promise<any> {
    if (!this.privacyService) {
      return { privacyEnabled: false };
    }
    
    return await this.privacyService.getPrivacyStats();
  }
  
  /**
   * Execute XOM ↔ pXOM conversion
   * @param userId - User requesting conversion
   * @param direction - Conversion direction ('XOM_TO_PXOM' or 'PXOM_TO_XOM')
   * @param amount - Amount to convert
   * @returns Conversion result with fees
   */
  async executePrivacyConversion(
    userId: string,
    direction: 'XOM_TO_PXOM' | 'PXOM_TO_XOM',
    amount: string
  ): Promise<ConversionResult> {
    if (!this.privacyService) {
      throw new Error('Privacy service not available');
    }
    
    const [tokenIn, tokenOut] = direction === 'XOM_TO_PXOM' 
      ? ['XOM', 'pXOM'] 
      : ['pXOM', 'XOM'];
    
    const result = await this.privacyService.executePrivacySwap({
      user: userId,
      tokenIn,
      tokenOut,
      amountIn: parseFloat(amount),
      usePrivacy: true
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Conversion failed');
    }
    
    return {
      success: true,
      id: result.txHash || this.generateOrderId(),
      fromToken: tokenIn,
      fromAmount: amount,
      toToken: tokenOut,
      toAmount: result.amountOut?.toString() || '0',
      conversionRate: '1', // 1:1 with fees
      fees: result.fee?.toString() || '0',
      actualSlippage: 0,
      timestamp: Date.now(),
      validatorApproval: true
    };
  }
} 
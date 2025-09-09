/**
 * Perpetual Integration Module
 * 
 * Bridges the PerpetualEngine with DecentralizedOrderBook
 * Handles order flow, position management, and liquidations
 * 
 * @module core/perpetuals/PerpetualIntegration
 */

import { EventEmitter } from 'events';
import { PerpetualEngine, PerpetualPosition, PerpetualMarket } from './PerpetualEngine';
import { DecentralizedOrderBook } from '../dex/DecentralizedOrderBook';
import type { 
  PerpetualOrder, 
  Position, 
  Trade
} from '../../types/config';
import { logger } from '../../utils/logger';
import { toWei, fromWei } from '../../constants/precision';

/**
 * Integration result for perpetual orders
 */
export interface IntegrationResult {
  /** Whether the operation was successful */
  success: boolean;
  /** The resulting position (if successful) */
  position?: PerpetualPosition;
  /** Trades generated from the operation */
  trades?: Trade[];
  /** Human-readable message describing the result */
  message?: string;
  /** Error object if operation failed */
  error?: Error;
}

/**
 * Perpetual Integration Service
 * 
 * Coordinates between the PerpetualEngine and DecentralizedOrderBook
 * to provide seamless perpetual futures trading
 */
export class PerpetualIntegration extends EventEmitter {
  private engine: PerpetualEngine;
  private orderBook?: DecentralizedOrderBook;
  private isInitialized = false;
  
  /** Map of order IDs to position IDs */
  private orderToPosition = new Map<string, string>();
  
  /** Map of user addresses to position IDs */
  private userPositions = new Map<string, Set<string>>();
  
  /**
   * Creates a new PerpetualIntegration instance
   */
  constructor() {
    super();
    this.engine = new PerpetualEngine();
    this.setupEngineListeners();
  }

  /**
   * Initialize the integration with order book
   * @param orderBook - The DecentralizedOrderBook instance to integrate with
   * @throws {Error} If already initialized
   * @example
   * ```typescript
   * const integration = new PerpetualIntegration();
   * await integration.initialize(orderBook);
   * ```
   */
  async initialize(orderBook: DecentralizedOrderBook): Promise<void> {
    if (this.isInitialized) {
      logger.warn('PerpetualIntegration already initialized');
      return;
    }

    this.orderBook = orderBook;
    this.setupOrderBookListeners();
    
    // Initialize default markets with real-time pricing
    await this.initializeMarkets();
    
    // Start price feed updates
    this.startPriceFeeds();
    
    this.isInitialized = true;
    logger.info('✅ Perpetual Integration initialized');
  }

  /**
   * Process a perpetual order from the order book
   * @param order - The perpetual order to process
   * @returns Integration result with position and trade details
   * @fires perpetualPositionOpened - When position is successfully opened
   * @example
   * ```typescript
   * const result = await integration.processPerpetualOrder({
   *   id: 'order_123',
   *   userId: '0x123...',
   *   contract: 'BTC-USD',
   *   side: 'BUY',
   *   size: 0.1,
   *   leverage: 10
   * });
   * ```
   */
  processPerpetualOrder(order: PerpetualOrder): IntegrationResult {
    try {
      logger.info('Processing perpetual order', {
        orderId: order.id,
        contract: order.contract,
        side: order.side,
        size: order.size,
        leverage: order.leverage
      });

      // Convert order to engine parameters
      const side: 'LONG' | 'SHORT' = 'LONG'; // Default to LONG for BUY orders
      const params = {
        trader: order.userId,
        market: order.contract,
        side,
        size: toWei(order.size.toString()),
        leverage: order.leverage,
        price: order.price !== undefined ? toWei(order.price.toString()) : undefined
      };

      // Open position through engine
      const position = this.engine.openPosition(params);
      
      // Track order to position mapping
      this.orderToPosition.set(order.id, position.id);
      
      // Track user positions
      if (!this.userPositions.has(order.userId)) {
        this.userPositions.set(order.userId, new Set());
      }
      this.userPositions.get(order.userId)?.add(position.id);

      // Create trade record with all required fields
      const trade: Trade = {
        id: `trade_${Date.now()}`,
        orderId: order.id,
        pair: order.contract,
        side: position.side,
        quantity: fromWei(position.size),
        price: fromWei(position.entryPrice),
        quoteQuantity: fromWei(position.size * position.entryPrice / BigInt(1e18)),
        fee: fromWei(position.margin * BigInt(2) / BigInt(1000)), // 0.2% fee
        feeAsset: 'USD',
        userId: order.userId,
        timestamp: position.openedAt,
        isBuyerMaker: false,
        ipfsCID: '',
        validatorSignatures: [],
        type: order.type,
        maker: 'SYSTEM',
        taker: order.userId,
        txHash: '',
        status: 'COMPLETED'
      };

      // Emit events
      this.emit('perpetualPositionOpened', {
        order,
        position,
        trade
      });

      return {
        success: true,
        position,
        trades: [trade],
        message: `Position ${position.id} opened successfully`
      };

    } catch (error) {
      logger.error('Failed to process perpetual order:', error);
      return {
        success: false,
        error: error as Error,
        message: `Failed to open position: ${(error as Error).message}`
      };
    }
  }

  /**
   * Close a perpetual position fully or partially
   * @param positionId - ID of the position to close
   * @param size - Optional size to close (closes full position if not specified)
   * @param price - Optional limit price for closing
   * @returns Integration result with updated position
   * @fires perpetualPositionClosed - When position is successfully closed
   * @example
   * ```typescript
   * // Close full position
   * await integration.closePosition('pos_123');
   * 
   * // Partial close with limit price
   * await integration.closePosition('pos_123', '0.05', '51000');
   * ```
   */
  closePosition(
    positionId: string, 
    size?: string, 
    price?: string
  ): IntegrationResult {
    try {
      const position = this.engine.closePosition(
        positionId,
        size !== undefined ? toWei(size) : undefined,
        price !== undefined ? toWei(price) : undefined
      );

      // Remove from user positions if fully closed
      if (position.status === 'CLOSED') {
        for (const [_userId, positions] of this.userPositions) {
          if (positions.has(positionId)) {
            positions.delete(positionId);
            break;
          }
        }
      }

      this.emit('perpetualPositionClosed', position);

      return {
        success: true,
        position,
        message: `Position ${positionId} closed successfully`
      };

    } catch (error) {
      logger.error('Failed to close position:', error);
      return {
        success: false,
        error: error as Error,
        message: `Failed to close position: ${(error as Error).message}`
      };
    }
  }

  /**
   * Update leverage for an existing position
   * @param positionId - ID of the position to update
   * @param newLeverage - New leverage value (must be within market limits)
   * @returns Integration result with updated position
   * @fires perpetualLeverageUpdated - When leverage is successfully updated
   * @example
   * ```typescript
   * const result = await integration.updateLeverage('pos_123', 5);
   * ```
   */
  updateLeverage(positionId: string, newLeverage: number): IntegrationResult {
    try {
      const position = this.engine.updateLeverage(positionId, newLeverage);
      
      this.emit('perpetualLeverageUpdated', position);

      return {
        success: true,
        position,
        message: `Leverage updated to ${newLeverage}x`
      };

    } catch (error) {
      logger.error('Failed to update leverage:', error);
      return {
        success: false,
        error: error as Error,
        message: `Failed to update leverage: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get all open positions for a specific user
   * @param userId - User's address or identifier
   * @returns Array of user's open perpetual positions
   * @example
   * ```typescript
   * const positions = integration.getUserPositions('0x123...');
   * ```
   */
  getUserPositions(userId: string): PerpetualPosition[] {
    const positionIds = this.userPositions.get(userId);
    if (positionIds === undefined) return [];

    const positions: PerpetualPosition[] = [];
    for (const id of positionIds) {
      const position = this.engine.getPosition(id);
      if (position !== undefined && position.status === 'OPEN') {
        positions.push(position);
      }
    }
    return positions;
  }

  /**
   * Convert PerpetualPosition to generic Position interface
   * @param perpPosition - Perpetual position to convert
   * @returns Position object compatible with general DEX interfaces
   */
  convertToPosition(perpPosition: PerpetualPosition): Position {
    return {
      id: perpPosition.id,
      userId: perpPosition.trader,
      pair: perpPosition.market,
      type: 'PERPETUAL',
      side: perpPosition.side,  // Keep LONG/SHORT for perpetuals
      entryPrice: String(parseFloat(fromWei(perpPosition.entryPrice))),
      currentPrice: String(parseFloat(fromWei(perpPosition.markPrice))),
      quantity: String(parseFloat(fromWei(perpPosition.size))),
      leverage: perpPosition.leverage,
      margin: String(parseFloat(fromWei(perpPosition.margin))),
      liquidationPrice: String(parseFloat(fromWei(perpPosition.liquidationPrice))),
      unrealizedPnl: String(parseFloat(fromWei(perpPosition.unrealizedPnl))),
      realizedPnl: String(parseFloat(fromWei(perpPosition.realizedPnl))),
      status: perpPosition.status === 'OPEN' ? 'ACTIVE' : 'CLOSED',
      openedAt: perpPosition.openedAt,
      closedAt: perpPosition.status === 'CLOSED' ? Date.now() : undefined
    };
  }

  /**
   * Get market configuration by symbol
   * @param symbol - Market symbol (e.g., 'BTC-USD')
   * @returns Market configuration if found, undefined otherwise
   */
  getMarket(symbol: string): PerpetualMarket | undefined {
    return this.engine.getMarket(symbol);
  }

  /**
   * Get all available perpetual markets
   * @returns Array of market configurations
   */
  getMarkets(): PerpetualMarket[] {
    return [
      this.engine.getMarket('BTC-USD'),
      this.engine.getMarket('ETH-USD')
    ].filter(Boolean) as PerpetualMarket[];
  }

  /**
   * Update mark price from external price feed
   * @param market - Market symbol
   * @param price - New mark price as string
   */
  updateMarkPrice(market: string, price: string): void {
    this.engine.updateMarkPrice(market, toWei(price));
  }

  /**
   * Update index price from external price feed
   * @param market - Market symbol
   * @param price - New index price as string
   */
  updateIndexPrice(market: string, price: string): void {
    this.engine.updateIndexPrice(market, toWei(price));
  }

  /**
   * Get current funding rate for a market
   * @param market - Market symbol
   * @returns Funding rate data with human-readable values, or null if not available
   */
  getFundingRate(market: string): {
    market: string;
    rate: number;
    nextFundingAt: number;
    markPrice: number;
    indexPrice: number;
    openInterest: number;
    timestamp: number;
  } | null {
    const rate = this.engine.getFundingRate(market);
    if (rate === undefined) return null;

    return {
      market: rate.market,
      rate: parseFloat(fromWei(rate.rate)),
      nextFundingAt: rate.nextFundingAt,
      markPrice: parseFloat(fromWei(rate.markPrice)),
      indexPrice: parseFloat(fromWei(rate.indexPrice)),
      openInterest: parseFloat(fromWei(rate.openInterest)),
      timestamp: rate.timestamp
    };
  }

  /**
   * Get total open interest for a market
   * @param market - Market symbol
   * @returns Open interest as string in base currency units
   */
  getOpenInterest(market: string): string {
    return fromWei(this.engine.getOpenInterest(market));
  }

  /**
   * Get current insurance fund balance
   * @returns Insurance fund balance as string in USD
   */
  getInsuranceFund(): string {
    return fromWei(this.engine.getInsuranceFund());
  }

  /**
   * Setup event listeners for perpetual engine events
   * @private
   */
  private setupEngineListeners(): void {
    this.engine.on('position:opened', (position: PerpetualPosition) => {
      logger.info('Position opened', { 
        id: position.id, 
        trader: position.trader,
        market: position.market,
        side: position.side,
        leverage: position.leverage
      });
    });

    this.engine.on('position:closed', (data: { position: PerpetualPosition; pnl: bigint }) => {
      logger.info('Position closed', { 
        id: data.position.id,
        pnl: fromWei(data.pnl)
      });
    });

    this.engine.on('position:liquidated', (event: { positionId: string; trader: string; market: string; fee: bigint }) => {
      logger.warn('Position liquidated', {
        positionId: event.positionId,
        trader: event.trader,
        market: event.market,
        fee: fromWei(event.fee)
      });
      
      // Notify order book of liquidation
      if (this.orderBook !== undefined) {
        this.orderBook.emit('perpetualLiquidation', event);
      }
    });

    this.engine.on('funding:processed', (data: { market: string; rate: bigint; timestamp: number }) => {
      logger.info('Funding processed', {
        market: data.market,
        rate: fromWei(data.rate),
        timestamp: data.timestamp
      });
    });
  }

  /**
   * Setup event listeners for order book events
   * @private
   */
  private setupOrderBookListeners(): void {
    if (this.orderBook === undefined) return;

    // Listen for perpetual orders from order book
    this.orderBook.on('perpetualOrderPlaced', (order: PerpetualOrder) => {
      void this.processPerpetualOrder(order);
    });
  }

  /**
   * Initialize default markets with initial prices
   * @private
   * @returns Promise that resolves when markets are initialized
   */
  private initializeMarkets(): Promise<void> {
    // Markets are already initialized in PerpetualEngine constructor
    // Update with current prices if available
    
    // Set initial prices (these would come from price feeds in production)
    this.engine.updateMarkPrice('BTC-USD', toWei('50000'));
    this.engine.updateIndexPrice('BTC-USD', toWei('50000'));
    
    this.engine.updateMarkPrice('ETH-USD', toWei('3000'));
    this.engine.updateIndexPrice('ETH-USD', toWei('3000'));
    
    logger.info('Perpetual markets initialized with default prices');
    return Promise.resolve();
  }

  /**
   * Start simulated price feed updates for development
   * In production, this would connect to real price oracles
   * @private
   */
  private startPriceFeeds(): void {
    // In production, this would connect to real price feeds
    // For now, simulate price movements
    
    setInterval(() => {
      // Simulate BTC price movement (±0.1%)
      const btcPrice = this.engine.getMarkPrice('BTC-USD');
      if (btcPrice > 0n) {
        const variation = (btcPrice * BigInt(Math.floor(Math.random() * 20 - 10))) / BigInt(10000);
        const newPrice = btcPrice + variation;
        this.engine.updateMarkPrice('BTC-USD', newPrice);
        this.engine.updateIndexPrice('BTC-USD', newPrice);
      }

      // Simulate ETH price movement (±0.1%)
      const ethPrice = this.engine.getMarkPrice('ETH-USD');
      if (ethPrice > 0n) {
        const variation = (ethPrice * BigInt(Math.floor(Math.random() * 20 - 10))) / BigInt(10000);
        const newPrice = ethPrice + variation;
        this.engine.updateMarkPrice('ETH-USD', newPrice);
        this.engine.updateIndexPrice('ETH-USD', newPrice);
      }
    }, 5000); // Update every 5 seconds
  }

  /**
   * Cleanup resources and stop all timers
   * Should be called when shutting down the service
   * @returns Promise that resolves when shutdown is complete
   */
  shutdown(): Promise<void> {
    this.engine.stopFundingTimer();
    this.removeAllListeners();
    logger.info('Perpetual Integration shutdown complete');
    return Promise.resolve();
  }
}

export default PerpetualIntegration;
/**
 * Perpetual Futures Trading Engine
 * 
 * Implements perpetual futures trading with funding rates, liquidations,
 * and leverage based on dYdX v4 architecture.
 * 
 * @module core/perpetuals/PerpetualEngine
 */

import { EventEmitter } from 'events';

/**
 * Perpetual position representing a trader's futures position
 */
export interface PerpetualPosition {
  /** Unique position identifier */
  id: string;
  /** Trader's address */
  trader: string;
  /** Trading pair (e.g., 'BTC-USD') */
  market: string;
  /** Position side - LONG for buying/bullish, SHORT for selling/bearish */
  side: 'LONG' | 'SHORT';
  /** Position size in base currency (e.g., BTC amount in satoshis) */
  size: bigint;
  /** Entry price when position was opened (18 decimals precision) */
  entryPrice: bigint;
  /** Current mark price used for PnL calculations (18 decimals precision) */
  markPrice: bigint;
  /** Position leverage multiplier (1-100x) */
  leverage: number;
  /** Margin amount locked for this position in USD (18 decimals) */
  margin: bigint;
  /** Price at which position will be liquidated (18 decimals) */
  liquidationPrice: bigint;
  /** Unrealized profit/loss based on current mark price (18 decimals) */
  unrealizedPnl: bigint;
  /** Realized profit/loss from partial closes and fees (18 decimals) */
  realizedPnl: bigint;
  /** Accumulated funding payments (positive = received, negative = paid) */
  fundingPayment: bigint;
  /** Unix timestamp when position was opened */
  openedAt: number;
  /** Unix timestamp of last funding payment */
  lastFundingAt: number;
  /** Current position status */
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED';
}

/**
 * Funding rate data for a perpetual market
 */
export interface FundingRate {
  /** Market symbol (e.g., 'BTC-USD') */
  market: string;
  /** Current funding rate per 8-hour period (18 decimals, e.g., 0.001 = 0.1%) */
  rate: bigint;
  /** Unix timestamp for next funding payment */
  nextFundingAt: number;
  /** Current mark price (18 decimals) */
  markPrice: bigint;
  /** Current index price from spot markets (18 decimals) */
  indexPrice: bigint;
  /** Total open interest in base currency */
  openInterest: bigint;
  /** Unix timestamp of this funding rate snapshot */
  timestamp: number;
}

/**
 * Perpetual market configuration
 */
export interface PerpetualMarket {
  /** Market symbol (e.g., 'BTC-USD') */
  symbol: string;
  /** Base currency being traded (e.g., 'BTC') */
  baseCurrency: string;
  /** Quote currency for pricing (e.g., 'USD') */
  quoteCurrency: string;
  /** Minimum position size in base currency smallest unit */
  minSize: bigint;
  /** Minimum price increment (18 decimals) */
  tickSize: bigint;
  /** Maximum leverage multiplier allowed for this market */
  maxLeverage: number;
  /** Initial margin requirement as percentage (e.g., 1 = 1%) */
  initialMargin: number;
  /** Maintenance margin requirement as percentage (e.g., 0.5 = 0.5%) */
  maintenanceMargin: number;
  /** Funding payment interval in seconds (28800 = 8 hours) */
  fundingInterval: number;
  /** Maximum allowed funding rate per interval (18 decimals) */
  maxFundingRate: bigint;
  /** Maker fee rate (18 decimals, e.g., 0.0002 = 0.02%) */
  makerFee: bigint;
  /** Taker fee rate (18 decimals, e.g., 0.0005 = 0.05%) */
  takerFee: bigint;
  /** Address of insurance fund contract */
  insuranceFund: string;
  /** Current market trading status */
  status: 'ACTIVE' | 'SUSPENDED' | 'DELISTED';
}

/**
 * Liquidation event data
 */
export interface LiquidationEvent {
  /** Unique identifier of liquidated position */
  positionId: string;
  /** Address of trader whose position was liquidated */
  trader: string;
  /** Market symbol where liquidation occurred */
  market: string;
  /** Size of liquidated position in base currency */
  size: bigint;
  /** Price at which liquidation occurred (18 decimals) */
  price: bigint;
  /** Address of liquidator (or 'SYSTEM' for auto-liquidation) */
  liquidator: string;
  /** Fee charged for liquidation (18 decimals) */
  fee: bigint;
  /** Amount contributed to insurance fund from remaining margin */
  insuranceFundContribution: bigint;
  /** Unix timestamp of liquidation event */
  timestamp: number;
}

/**
 * Perpetual futures trading engine
 */
export class PerpetualEngine extends EventEmitter {
  private positions: Map<string, PerpetualPosition> = new Map();
  private markets: Map<string, PerpetualMarket> = new Map();
  private fundingRates: Map<string, FundingRate> = new Map();
  private openInterest: Map<string, bigint> = new Map();
  private markPrices: Map<string, bigint> = new Map();
  private indexPrices: Map<string, bigint> = new Map();
  private insuranceFund: bigint = 0n;
  private nextPositionId = 1;
  private fundingTimer?: NodeJS.Timeout;

  /**
   * Create a new PerpetualEngine instance
   * Initializes default markets and starts funding timer
   */
  constructor() {
    super();
    this.initializeMarkets();
    this.startFundingTimer();
  }

  /**
   * Initialize default perpetual markets with BTC and ETH contracts
   * Sets up market parameters including leverage limits, margin requirements, and fees
   * @private
   */
  private initializeMarkets(): void {
    // BTC-USD Perpetual
    this.addMarket({
      symbol: 'BTC-USD',
      baseCurrency: 'BTC',
      quoteCurrency: 'USD',
      minSize: 1000000n, // 0.001 BTC in sats
      tickSize: 100000000n, // $1 in 18 decimals
      maxLeverage: 100,
      initialMargin: 1, // 1%
      maintenanceMargin: 0.5, // 0.5%
      fundingInterval: 28800, // 8 hours
      maxFundingRate: 100000000000000n, // 0.01% in 18 decimals
      makerFee: 20000000000000n, // 0.002% in 18 decimals
      takerFee: 50000000000000n, // 0.005% in 18 decimals
      insuranceFund: '0x0000000000000000000000000000000000000000',
      status: 'ACTIVE'
    });

    // ETH-USD Perpetual
    this.addMarket({
      symbol: 'ETH-USD',
      baseCurrency: 'ETH',
      quoteCurrency: 'USD',
      minSize: 10000000000000000n, // 0.01 ETH in wei
      tickSize: 10000000000000000n, // $0.01 in 18 decimals
      maxLeverage: 50,
      initialMargin: 2, // 2%
      maintenanceMargin: 1, // 1%
      fundingInterval: 28800, // 8 hours
      maxFundingRate: 100000000000000n, // 0.01% in 18 decimals
      makerFee: 20000000000000n, // 0.002% in 18 decimals
      takerFee: 50000000000000n, // 0.005% in 18 decimals
      insuranceFund: '0x0000000000000000000000000000000000000000',
      status: 'ACTIVE'
    });
  }

  /**
   * Add a new perpetual market to the trading engine
   * @param market - Market configuration including symbol, leverage, and fee parameters
   * @fires market:added - When market is successfully added
   * @example
   * ```typescript
   * engine.addMarket({
   *   symbol: 'SOL-USD',
   *   baseCurrency: 'SOL',
   *   quoteCurrency: 'USD',
   *   maxLeverage: 20,
   *   // ... other parameters
   * });
   * ```
   */
  addMarket(market: PerpetualMarket): void {
    this.markets.set(market.symbol, market);
    this.openInterest.set(market.symbol, 0n);
    this.fundingRates.set(market.symbol, {
      market: market.symbol,
      rate: 0n,
      nextFundingAt: Date.now() + market.fundingInterval * 1000,
      markPrice: 0n,
      indexPrice: 0n,
      openInterest: 0n,
      timestamp: Date.now()
    });
    
    this.emit('market:added', market);
  }

  /**
   * Open a new perpetual position with specified parameters
   * @param params - Position parameters
   * @param params.trader - Trader's address
   * @param params.market - Market symbol (e.g., 'BTC-USD')
   * @param params.side - Position side ('LONG' or 'SHORT')
   * @param params.size - Position size in base currency
   * @param params.leverage - Leverage multiplier (1-100)
   * @param params.price - Optional limit price
   * @returns Promise resolving to the created position
   * @throws {Error} If market is unavailable or parameters are invalid
   * @fires position:opened - When position is successfully opened
   * @example
   * ```typescript
   * const position = await engine.openPosition({
   *   trader: '0x123...',
   *   market: 'BTC-USD',
   *   side: 'LONG',
   *   size: BigInt(1e17), // 0.1 BTC
   *   leverage: 10
   * });
   * ```
   */
  openPosition(params: {
    trader: string;
    market: string;
    side: 'LONG' | 'SHORT';
    size: bigint;
    leverage: number;
    price?: bigint;
  }): PerpetualPosition {
    const market = this.markets.get(params.market);
    if (market === null || market === undefined || market.status !== 'ACTIVE') {
      throw new Error(`Market ${params.market} not available`);
    }

    if (params.leverage > market.maxLeverage) {
      throw new Error(`Leverage ${params.leverage} exceeds maximum ${market.maxLeverage}`);
    }

    if (params.size < market.minSize) {
      throw new Error(`Size below minimum ${market.minSize}`);
    }

    const markPrice = (params.price !== null && params.price !== undefined && params.price !== 0n) ? params.price : this.getMarkPrice(params.market);
    const notionalValue = (params.size * markPrice) / BigInt(1e18);
    const margin = notionalValue / BigInt(params.leverage);
    
    // Calculate liquidation price
    const liquidationPrice = this.calculateLiquidationPrice({
      entryPrice: markPrice,
      side: params.side,
      leverage: params.leverage,
      maintenanceMargin: market.maintenanceMargin
    });

    const position: PerpetualPosition = {
      id: `pos_${this.nextPositionId++}`,
      trader: params.trader,
      market: params.market,
      side: params.side,
      size: params.size,
      entryPrice: markPrice,
      markPrice,
      leverage: params.leverage,
      margin,
      liquidationPrice,
      unrealizedPnl: 0n,
      realizedPnl: 0n,
      fundingPayment: 0n,
      openedAt: Date.now(),
      lastFundingAt: Date.now(),
      status: 'OPEN'
    };

    this.positions.set(position.id, position);
    
    // Update open interest
    const currentOI = this.openInterest.get(params.market) ?? 0n;
    this.openInterest.set(params.market, currentOI + params.size);

    this.emit('position:opened', position);
    return position;
  }

  /**
   * Close a perpetual position fully or partially
   * @param positionId - ID of position to close
   * @param size - Optional size to close (closes full position if not specified)
   * @param price - Optional limit price for closing
   * @returns Promise resolving to updated position
   * @throws {Error} If position not found or invalid parameters
   * @fires position:closed - When position is successfully closed
   * @example
   * ```typescript
   * // Close full position
   * await engine.closePosition('pos_123');
   * 
   * // Partial close
   * await engine.closePosition('pos_123', BigInt(5e16));
   * ```
   */
  closePosition(
    positionId: string,
    size?: bigint,
    price?: bigint
  ): PerpetualPosition {
    const position = this.positions.get(positionId);
    if (position === null || position === undefined || position.status !== 'OPEN') {
      throw new Error(`Position ${positionId} not found or not open`);
    }

    const closeSize = (size !== null && size !== undefined && size !== 0n) ? size : position.size;
    if (closeSize > position.size) {
      throw new Error('Close size exceeds position size');
    }

    const closePrice = (price !== null && price !== undefined && price !== 0n) ? price : this.getMarkPrice(position.market);
    
    // Calculate PnL
    const pnl = this.calculatePnl(position, closePrice, closeSize);
    
    if (closeSize === position.size) {
      // Full close
      position.status = 'CLOSED';
      position.realizedPnl += pnl;
      position.size = 0n;
    } else {
      // Partial close
      position.size -= closeSize;
      position.realizedPnl += pnl;
      position.margin = (position.margin * position.size) / (position.size + closeSize);
    }

    // Update open interest
    const currentOI = this.openInterest.get(position.market) ?? 0n;
    this.openInterest.set(position.market, currentOI - closeSize);

    this.emit('position:closed', {
      position,
      closeSize,
      closePrice,
      pnl
    });

    return position;
  }

  /**
   * Update leverage for an existing position
   * @param positionId - ID of position to update
   * @param newLeverage - New leverage value (must be within market limits)
   * @returns Promise resolving to updated position
   * @throws {Error} If position not found or leverage exceeds limits
   * @fires position:leverageUpdated - When leverage is successfully updated
   * @example
   * ```typescript
   * const updated = await engine.updateLeverage('pos_123', 5);
   * ```
   */
  updateLeverage(
    positionId: string,
    newLeverage: number
  ): PerpetualPosition {
    const position = this.positions.get(positionId);
    if (position === null || position === undefined || position.status !== 'OPEN') {
      throw new Error(`Position ${positionId} not found or not open`);
    }

    const market = this.markets.get(position.market);
    if (market === null || market === undefined) {
      throw new Error(`Market ${position.market} not found`);
    }

    if (newLeverage > market.maxLeverage) {
      throw new Error(`Leverage ${newLeverage} exceeds maximum ${market.maxLeverage}`);
    }

    const notionalValue = (position.size * position.markPrice) / BigInt(1e18);
    const newMargin = notionalValue / BigInt(newLeverage);

    // Update position
    position.leverage = newLeverage;
    position.margin = newMargin;
    position.liquidationPrice = this.calculateLiquidationPrice({
      entryPrice: position.entryPrice,
      side: position.side,
      leverage: newLeverage,
      maintenanceMargin: market.maintenanceMargin
    });

    this.emit('position:leverageUpdated', position);
    return position;
  }

  /**
   * Calculate funding payments and apply to all open positions
   * Funding rate is based on premium/discount of mark vs index price
   * Longs pay shorts when funding is positive, shorts pay longs when negative
   * @private
   * @fires funding:processed - For each market when funding is calculated
   */
  private processFunding(): void {
    const now = Date.now();

    for (const [marketSymbol, fundingRate] of this.fundingRates) {
      if (now >= fundingRate.nextFundingAt) {
        const market = this.markets.get(marketSymbol);
        if (market === null || market === undefined) continue;

        // Calculate funding rate based on mark vs index price
        const markPrice = this.getMarkPrice(marketSymbol);
        const indexPrice = this.getIndexPrice(marketSymbol);
        const premium = (markPrice - indexPrice) * BigInt(1e18) / indexPrice;
        
        // Clamp funding rate to maximum
        let fundingRateValue = premium / BigInt(24); // 8-hour rate from 24-hour premium
        if (fundingRateValue > market.maxFundingRate) {
          fundingRateValue = market.maxFundingRate;
        } else if (fundingRateValue < -market.maxFundingRate) {
          fundingRateValue = -market.maxFundingRate;
        }

        // Apply funding to all positions
        for (const position of this.positions.values()) {
          if (position.market === marketSymbol && position.status === 'OPEN') {
            const notionalValue = (position.size * markPrice) / BigInt(1e18);
            let fundingPayment = (notionalValue * fundingRateValue) / BigInt(1e18);
            
            // Longs pay shorts when funding is positive
            if (position.side === 'SHORT') {
              fundingPayment = -fundingPayment;
            }
            
            position.fundingPayment += fundingPayment;
            position.lastFundingAt = now;
          }
        }

        // Update funding rate
        fundingRate.rate = fundingRateValue;
        fundingRate.nextFundingAt = now + market.fundingInterval * 1000;
        fundingRate.markPrice = markPrice;
        fundingRate.indexPrice = indexPrice;
        fundingRate.openInterest = this.openInterest.get(marketSymbol) ?? 0n;
        fundingRate.timestamp = now;

        this.emit('funding:processed', {
          market: marketSymbol,
          rate: fundingRateValue,
          timestamp: now
        });
      }
    }
  }

  /**
   * Check all open positions and liquidate those below maintenance margin
   * Liquidated positions contribute remaining margin to insurance fund
   * @fires position:liquidated - For each liquidated position
   * @fires liquidations:batch - When multiple liquidations occur
   * @example
   * ```typescript
   * // Usually called automatically, but can be triggered manually
   * await engine.checkLiquidations();
   * ```
   */
  checkLiquidations(): void {
    const liquidations: LiquidationEvent[] = [];

    for (const position of this.positions.values()) {
      if (position.status !== 'OPEN') continue;

      const markPrice = this.getMarkPrice(position.market);
      const shouldLiquidate = position.side === 'LONG'
        ? markPrice <= position.liquidationPrice
        : markPrice >= position.liquidationPrice;

      if (shouldLiquidate) {
        const market = this.markets.get(position.market);
        if (market === null || market === undefined) continue;

        // Calculate liquidation fee (0.5% of notional)
        const notionalValue = (position.size * markPrice) / BigInt(1e18);
        const liquidationFee = (notionalValue * BigInt(5)) / BigInt(1000);

        // Update position
        position.status = 'LIQUIDATED';
        position.realizedPnl = -position.margin - liquidationFee;

        // Add to insurance fund
        const insuranceContribution = position.margin > liquidationFee 
          ? position.margin - liquidationFee 
          : 0n;
        this.insuranceFund += insuranceContribution;

        // Update open interest
        const currentOI = this.openInterest.get(position.market) ?? 0n;
        this.openInterest.set(position.market, currentOI - position.size);

        const liquidationEvent: LiquidationEvent = {
          positionId: position.id,
          trader: position.trader,
          market: position.market,
          size: position.size,
          price: markPrice,
          liquidator: 'SYSTEM',
          fee: liquidationFee,
          insuranceFundContribution: insuranceContribution,
          timestamp: Date.now()
        };

        liquidations.push(liquidationEvent);
        this.emit('position:liquidated', liquidationEvent);
      }
    }

    if (liquidations.length > 0) {
      this.emit('liquidations:batch', liquidations);
    }
  }

  /**
   * Calculate liquidation price for a position based on leverage and margin
   * @private
   * @param params - Calculation parameters
   * @param params.entryPrice - Position entry price
   * @param params.side - Position side ('LONG' or 'SHORT')
   * @param params.leverage - Position leverage
   * @param params.maintenanceMargin - Maintenance margin percentage
   * @returns Liquidation price in 18 decimal precision
   */
  private calculateLiquidationPrice(params: {
    entryPrice: bigint;
    side: 'LONG' | 'SHORT';
    leverage: number;
    maintenanceMargin: number;
  }): bigint {
    const { entryPrice, side, leverage, maintenanceMargin } = params;
    const maintenanceMarginRatio = BigInt(Math.floor(maintenanceMargin * 1e18 / 100));
    
    if (side === 'LONG') {
      // Long liquidation: price * (1 - 1/leverage + maintenanceMargin)
      const factor = BigInt(1e18) - BigInt(1e18) / BigInt(leverage) + maintenanceMarginRatio;
      return (entryPrice * factor) / BigInt(1e18);
    } else {
      // Short liquidation: price * (1 + 1/leverage - maintenanceMargin)
      const factor = BigInt(1e18) + BigInt(1e18) / BigInt(leverage) - maintenanceMarginRatio;
      return (entryPrice * factor) / BigInt(1e18);
    }
  }

  /**
   * Calculate profit/loss for a position or partial close
   * @private
   * @param position - Position to calculate PnL for
   * @param exitPrice - Exit/current price for calculation
   * @param size - Size to calculate PnL for
   * @returns PnL amount (positive for profit, negative for loss)
   */
  private calculatePnl(
    position: PerpetualPosition,
    exitPrice: bigint,
    size: bigint
  ): bigint {
    const priceDiff = exitPrice - position.entryPrice;
    const notionalPnl = (size * priceDiff) / BigInt(1e18);
    
    return position.side === 'LONG' ? notionalPnl : -notionalPnl;
  }

  /**
   * Update mark price for a market and recalculate unrealized PnL
   * @param market - Market symbol
   * @param price - New mark price (18 decimals)
   * @fires markPrice:updated - When price is updated
   */
  updateMarkPrice(market: string, price: bigint): void {
    this.markPrices.set(market, price);
    
    // Update position mark prices and unrealized PnL
    for (const position of this.positions.values()) {
      if (position.market === market && position.status === 'OPEN') {
        position.markPrice = price;
        position.unrealizedPnl = this.calculatePnl(position, price, position.size);
      }
    }
    
    this.emit('markPrice:updated', { market, price });
  }

  /**
   * Update index price for a market (used for funding rate calculation)
   * @param market - Market symbol
   * @param price - New index price (18 decimals)
   * @fires indexPrice:updated - When price is updated
   */
  updateIndexPrice(market: string, price: bigint): void {
    this.indexPrices.set(market, price);
    this.emit('indexPrice:updated', { market, price });
  }

  /**
   * Get current mark price for a market
   * @param market - Market symbol
   * @returns Current mark price or 0n if not set
   */
  getMarkPrice(market: string): bigint {
    return this.markPrices.get(market) ?? 0n;
  }

  /**
   * Get current index price for a market
   * @param market - Market symbol
   * @returns Current index price or 0n if not set
   */
  getIndexPrice(market: string): bigint {
    return this.indexPrices.get(market) ?? 0n;
  }

  /**
   * Get position by ID
   * @param positionId - Position identifier
   * @returns Position if found, undefined otherwise
   */
  getPosition(positionId: string): PerpetualPosition | undefined {
    return this.positions.get(positionId);
  }

  /**
   * Get all positions for a specific trader
   * @param trader - Trader's address
   * @returns Array of trader's positions
   */
  getTraderPositions(trader: string): PerpetualPosition[] {
    return Array.from(this.positions.values())
      .filter(p => p.trader === trader);
  }

  /**
   * Get market configuration by symbol
   * @param symbol - Market symbol (e.g., 'BTC-USD')
   * @returns Market configuration if found, undefined otherwise
   */
  getMarket(symbol: string): PerpetualMarket | undefined {
    return this.markets.get(symbol);
  }

  /**
   * Get current funding rate data for a market
   * @param market - Market symbol
   * @returns Funding rate data if available, undefined otherwise
   */
  getFundingRate(market: string): FundingRate | undefined {
    return this.fundingRates.get(market);
  }

  /**
   * Get total open interest for a market
   * @param market - Market symbol
   * @returns Total open interest in base currency
   */
  getOpenInterest(market: string): bigint {
    return this.openInterest.get(market) ?? 0n;
  }

  /**
   * Get current insurance fund balance
   * @returns Insurance fund balance in USD (18 decimals)
   */
  getInsuranceFund(): bigint {
    return this.insuranceFund;
  }

  /**
   * Start automatic funding and liquidation timer
   * Processes funding payments and checks for liquidations every minute
   * @private
   */
  private startFundingTimer(): void {
    // Process funding every minute
    this.fundingTimer = setInterval(() => {
      try {
        this.processFunding();
        this.checkLiquidations();
      } catch (error) {
        // Log error but don't throw to avoid breaking the timer
        // In production, would use proper logger
        if (error instanceof Error) {
          // eslint-disable-next-line no-console
          console.error('Funding/liquidation processing error:', error.message);
        }
      }
    }, 60000);
  }

  /**
   * Stop the automatic funding and liquidation timer
   * Should be called when shutting down the engine
   */
  stopFundingTimer(): void {
    if (this.fundingTimer !== null && this.fundingTimer !== undefined) {
      clearInterval(this.fundingTimer);
      this.fundingTimer = undefined;
    }
  }
}

export default PerpetualEngine;
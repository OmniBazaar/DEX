/**
 * Market Data API Routes for Unified Validator DEX
 * 
 * Provides real-time and historical market data including:
 * - Order books
 * - Price tickers
 * - Trade history
 * - Price charts/candles
 * - Market statistics
 */

import { Router, Request, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger';

/**
 * Trading pair configuration and metadata
 */
interface TradingPair {
  /** Trading pair symbol */
  symbol: string;
  /** Base asset symbol */
  baseAsset: string;
  /** Quote asset symbol */
  quoteAsset: string;
  /** Trading status */
  status: string;
  /** Minimum order size */
  minOrderSize: number;
  /** Maximum order size */
  maxOrderSize: number;
  /** Price increment (tick size) */
  priceIncrement: number;
  /** Quantity increment */
  quantityIncrement: number;
  /** Maker fee rate */
  makerFee: number;
  /** Taker fee rate */
  takerFee: number;
}

/**
 * Single level in the order book
 */
interface OrderBookLevel {
  /** Price level */
  price: number;
  /** Total quantity at this price */
  quantity: number;
}

/**
 * Order book snapshot data
 */
interface OrderBookData {
  /** Buy orders (bids) */
  bids: OrderBookLevel[];
  /** Sell orders (asks) */
  asks: OrderBookLevel[];
  /** Snapshot timestamp */
  timestamp: number;
  /** Sequence number */
  sequence: number;
}

/**
 * 24-hour ticker statistics
 */
interface TickerData {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  openPrice: number;
  closePrice: number;
  firstTradeId: number;
  lastTradeId: number;
  tradeCount: number;
  timestamp: number;
}

/**
 * Individual trade data
 */
interface TradeData {
  /** Trade ID */
  id: string;
  /** Trade price */
  price: number;
  /** Trade quantity */
  quantity: number;
  /** Quote quantity */
  quoteQuantity: number;
  /** Trade timestamp */
  timestamp: number;
  /** Whether buyer was maker */
  isBuyerMaker: boolean;
}

/**
 * Candle/OHLCV data structure
 */
interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  baseAssetVolume: number;
  quoteAssetVolume: number;
}

/**
 * Market depth data structure
 */
interface MarketDepthData {
  lastUpdateId: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

/**
 * Perpetual contract information
 */
interface PerpetualContract {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  markPrice: number;
  indexPrice: number;
  lastFundingRate: number;
  nextFundingTime: number;
  interestRate: number;
  premiumIndex: number;
  maxLeverage: number;
  minOrderSize: number;
  status: string;
}

/**
 * Funding rate history entry
 */
interface FundingRateEntry {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  markPrice: number;
  indexPrice: number;
}

/**
 * Market statistics data
 */
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

/**
 * Chart options for historical data
 */
interface ChartOptions {
  startTime: Date;
  endTime: Date;
  limit: number;
}

/**
 * Funding rate query options
 */
interface FundingRateOptions {
  startTime: Date;
  endTime: Date;
  limit: number;
}

/**
 * Decentralized order book interface
 */
interface DecentralizedOrderBook {
  getTradingPairs(): Promise<TradingPair[]>;
  getOrderBook(symbol: string, depth: number): Promise<OrderBookData>;
  getTicker(symbol: string): Promise<TickerData>;
  getRecentTrades(symbol: string, limit: number): Promise<TradeData[]>;
  getPriceChart(symbol: string, interval: string, options: ChartOptions): Promise<CandleData[]>;
  getMarketSummary(symbol: string, options: ChartOptions): Promise<TickerData>;
  getCandles(symbol: string, interval: string, options: ChartOptions): Promise<CandleData[]>;
  getMarketDepth(symbol: string, limit: number): Promise<MarketDepthData>;
  getPerpetualContracts(): Promise<PerpetualContract[]>;
  getFundingRateHistory(symbol: string, options: FundingRateOptions): Promise<FundingRateEntry[]>;
  getMarketStatistics(): Promise<MarketStatistics>;
}

/**
 * Create market data API routes for the unified validator DEX
 * Provides real-time and historical market data endpoints
 * @param orderBook - Decentralized order book implementation
 * @returns Express router with market data endpoints
 * @example
 * ```typescript
 * const router = createMarketDataRoutes(orderBook);
 * app.use('/api/v1/market-data', router);
 * ```
 */
export function createMarketDataRoutes(orderBook: DecentralizedOrderBook): Router {
  const router = Router();

  /**
   * Get all available trading pairs
   * GET /api/v1/market-data/pairs
   */
  router.get('/pairs', (_req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const pairs = await orderBook.getTradingPairs();

        res.json({
          pairs: pairs.map((pair: TradingPair) => ({
            symbol: pair.symbol,
            baseAsset: pair.baseAsset,
            quoteAsset: pair.quoteAsset,
            status: pair.status,
            minOrderSize: pair.minOrderSize,
            maxOrderSize: pair.maxOrderSize,
            priceIncrement: pair.priceIncrement,
            quantityIncrement: pair.quantityIncrement,
            makerFee: pair.makerFee,
            takerFee: pair.takerFee
          }))
        });

      } catch (error) {
        logger.error('Error getting trading pairs:', error);
        res.status(500).json({
          error: 'Failed to get trading pairs',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }).catch((error) => {
      logger.error('Error getting trading pairs:', error);
      res.status(500).json({
        error: 'Failed to get trading pairs',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });

  /**
   * Get order book for a trading pair
   * GET /api/v1/market-data/orderbook/:pair
   */
  router.get('/orderbook/:pair',
    [
      param('pair').isString().notEmpty(),
      query('limit').optional().isInt({ min: 1, max: 500 }).toInt()
    ],
    (req: Request, res: Response): void => {
      Promise.resolve().then(async () => {
        try {
          const { pair } = req.params;
          const limitParam = req.query['limit'] as string;
          const _limit = (limitParam !== undefined && parseInt(limitParam) > 0) ? parseInt(limitParam) : 100;

          if (pair === undefined || pair === '') {
            res.status(400).json({
              error: 'Trading pair is required'
            });
            return;
          }

          const orderBookData = await orderBook.getOrderBook(pair, _limit);

          res.json({
            pair,
            bids: orderBookData.bids.map((level: OrderBookLevel) => [level.price, level.quantity]),
            asks: orderBookData.asks.map((level: OrderBookLevel) => [level.price, level.quantity]),
            timestamp: orderBookData.timestamp,
            sequence: orderBookData.sequence
          });

        } catch (error) {
          logger.error('Error getting order book:', error);
          res.status(500).json({
            error: 'Failed to get order book',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }).catch((error) => {
        logger.error('Error getting order book:', error);
        res.status(500).json({
          error: 'Failed to get order book',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  );

  /**
   * Get 24h ticker statistics
   * GET /api/v1/market-data/ticker/:pair
   */
  router.get('/ticker/:pair',
    [param('pair').isString().notEmpty()],
    (req: Request, res: Response): void => {
      Promise.resolve().then(async () => {
        try {
          const { pair } = req.params;

          if (pair === undefined || pair === '') {
            res.status(400).json({
              error: 'Trading pair is required'
            });
            return;
          }

          const ticker = await orderBook.getTicker(pair);

          res.json({
            symbol: ticker.symbol,
            price: ticker.lastPrice,
            priceChange: ticker.priceChange,
            priceChangePercent: ticker.priceChangePercent,
            high: ticker.high24h,
            low: ticker.low24h,
            volume: ticker.volume24h,
            quoteVolume: ticker.quoteVolume24h,
            openPrice: ticker.openPrice,
            closePrice: ticker.closePrice,
            firstId: ticker.firstTradeId,
            lastId: ticker.lastTradeId,
            count: ticker.tradeCount,
            timestamp: ticker.timestamp
          });

        } catch (error) {
          logger.error('Error getting ticker:', error);
          res.status(500).json({
            error: 'Failed to get ticker',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }).catch((error) => {
        logger.error('Error getting ticker:', error);
        res.status(500).json({
          error: 'Failed to get ticker',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  );

  /**
   * Get all tickers
   * GET /api/v1/market-data/tickers
   */
  router.get('/tickers', (_req: Request, res: Response): void => {
    try {
      // TODO: Add getAllTickers method to interface when implemented
      const tickers: TickerData[] = [];

      res.json(
        tickers.map((ticker: TickerData) => ({
          symbol: ticker.symbol,
          price: ticker.lastPrice,
          priceChange: ticker.priceChange,
          priceChangePercent: ticker.priceChangePercent,
          high: ticker.high24h,
          low: ticker.low24h,
          volume: ticker.volume24h,
          quoteVolume: ticker.quoteVolume24h,
          timestamp: ticker.timestamp
        }))
      );

    } catch (error) {
      logger.error('Error getting all tickers:', error);
      res.status(500).json({
        error: 'Failed to get tickers',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Get recent trades for a pair
   * GET /api/v1/market-data/trades/:pair
   */
  router.get('/trades/:pair',
    [
      param('pair').isString().notEmpty(),
      query('limit').optional().isInt({ min: 1, max: 1000 }).toInt()
    ],
    (req: Request, res: Response): void => {
      Promise.resolve().then(async () => {
        try {
          const { pair } = req.params;
          const limitParam = req.query['limit'] as string;
          const limit = (limitParam !== undefined && parseInt(limitParam) > 0) ? parseInt(limitParam) : 100;

          if (pair === undefined || pair === '') {
            res.status(400).json({
              error: 'Trading pair is required'
            });
            return;
          }

          const trades = await orderBook.getRecentTrades(pair, limit);

          res.json(
            trades.map((trade: TradeData) => ({
              id: trade.id,
              price: trade.price,
              quantity: trade.quantity,
              quoteQuantity: trade.quoteQuantity,
              time: trade.timestamp,
              isBuyerMaker: trade.isBuyerMaker
            }))
          );

        } catch (error) {
          logger.error('Error getting recent trades:', error);
          res.status(500).json({
            error: 'Failed to get recent trades',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }).catch((error) => {
        logger.error('Error getting recent trades:', error);
        res.status(500).json({
          error: 'Failed to get recent trades',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  );

  /**
   * Get price candles/OHLCV data
   * GET /api/v1/market-data/candles/:pair
   */
  router.get('/candles/:pair',
    [
      param('pair').isString().notEmpty(),
      query('interval').isIn(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']),
      query('startTime').optional().isISO8601().toDate(),
      query('endTime').optional().isISO8601().toDate(),
      query('limit').optional().isInt({ min: 1, max: 1000 }).toInt()
    ],
    (req: Request, res: Response): void => {
      Promise.resolve().then(async () => {
        try {
          const errors = validationResult(req);
          if (!errors.isEmpty()) {
            res.status(400).json({
              error: 'Validation failed',
              details: errors.array()
            });
            return;
          }

          const { pair } = req.params;
          const interval = req.query['interval'] as string;
          const startTime = new Date(req.query['startTime'] as string);
          const endTime = new Date(req.query['endTime'] as string);
          const limitParam = req.query['limit'] as string;
          const limit = (limitParam !== undefined && parseInt(limitParam) > 0) ? parseInt(limitParam) : 500;

          if (pair === undefined || pair === '') {
            res.status(400).json({
              error: 'Trading pair is required'
            });
            return;
          }

          const candles = await orderBook.getCandles(pair, interval, {
            startTime,
            endTime,
            limit
          });

          res.json(
            candles.map((candle: CandleData) => [
              candle.openTime,
              candle.open,
              candle.high,
              candle.low,
              candle.close,
              candle.volume,
              candle.closeTime,
              candle.quoteVolume,
              candle.trades,
              candle.baseAssetVolume,
              candle.quoteAssetVolume
            ])
          );

        } catch (error) {
          logger.error('Error getting candles:', error);
          res.status(500).json({
            error: 'Failed to get candles',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }).catch((error) => {
        logger.error('Error getting candles:', error);
        res.status(500).json({
          error: 'Failed to get candles',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  );

  /**
   * Get market depth/order book aggregated
   * GET /api/v1/market-data/depth/:pair
   */
  router.get('/depth/:pair',
    [
      param('pair').isString().notEmpty(),
      query('limit').optional().isIn(['5', '10', '20', '50', '100', '500', '1000'])
    ],
    (req: Request, res: Response): void => {
      Promise.resolve().then(async () => {
        try {
          const { pair } = req.params;
          const limitParam = req.query['limit'] as string;
          const limit = (limitParam !== undefined && parseInt(limitParam) > 0) ? parseInt(limitParam) : 100;

          if (pair === undefined || pair === '') {
            res.status(400).json({
              error: 'Trading pair is required'
            });
            return;
          }

          const depth = await orderBook.getMarketDepth(pair, limit);

          res.json({
            lastUpdateId: depth.lastUpdateId,
            bids: depth.bids.map((level: OrderBookLevel) => [level.price, level.quantity]),
            asks: depth.asks.map((level: OrderBookLevel) => [level.price, level.quantity])
          });

        } catch (error) {
          logger.error('Error getting market depth:', error);
          res.status(500).json({
            error: 'Failed to get market depth',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }).catch((error) => {
        logger.error('Error getting market depth:', error);
        res.status(500).json({
          error: 'Failed to get market depth',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  );

  /**
   * Get perpetual contract information
   * GET /api/v1/market-data/perpetuals
   */
  router.get('/perpetuals', (_req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const perpetuals = await orderBook.getPerpetualContracts();

        res.json(
          perpetuals.map((contract: PerpetualContract) => ({
            symbol: contract.symbol,
            baseAsset: contract.baseAsset,
            quoteAsset: contract.quoteAsset,
            markPrice: contract.markPrice,
            indexPrice: contract.indexPrice,
            lastFundingRate: contract.lastFundingRate,
            nextFundingTime: contract.nextFundingTime,
            interestRate: contract.interestRate,
            premiumIndex: contract.premiumIndex,
            maxLeverage: contract.maxLeverage,
            minOrderSize: contract.minOrderSize,
            status: contract.status
          }))
        );

      } catch (error) {
        logger.error('Error getting perpetual contracts:', error);
        res.status(500).json({
          error: 'Failed to get perpetual contracts',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }).catch((error) => {
      logger.error('Error getting perpetual contracts:', error);
      res.status(500).json({
        error: 'Failed to get perpetual contracts',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });

  /**
   * Get funding rate history
   * GET /api/v1/market-data/funding-rate/:symbol
   */
  router.get('/funding-rate/:symbol',
    [
      param('symbol').isString().notEmpty(),
      query('startTime').optional().isISO8601().toDate(),
      query('endTime').optional().isISO8601().toDate(),
      query('limit').optional().isInt({ min: 1, max: 500 }).toInt()
    ],
    (req: Request, res: Response): void => {
      Promise.resolve().then(async () => {
        try {
          const { symbol } = req.params;
          const startTime = new Date(req.query['startTime'] as string);
          const endTime = new Date(req.query['endTime'] as string);
          const limitParam = req.query['limit'] as string;
          const limit = (limitParam !== undefined && parseInt(limitParam) > 0) ? parseInt(limitParam) : 100;

          if (symbol === undefined || symbol === '') {
            res.status(400).json({
              error: 'Symbol is required'
            });
            return;
          }

          const fundingHistory = await orderBook.getFundingRateHistory(symbol, {
            startTime,
            endTime,
            limit
          });

          res.json(
            fundingHistory.map((entry: FundingRateEntry) => ({
              symbol: entry.symbol,
              fundingRate: entry.fundingRate,
              fundingTime: entry.fundingTime,
              markPrice: entry.markPrice,
              indexPrice: entry.indexPrice
            }))
          );

        } catch (error) {
          logger.error('Error getting funding rate history:', error);
          res.status(500).json({
            error: 'Failed to get funding rate history',
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }).catch((error) => {
        logger.error('Error getting funding rate history:', error);
        res.status(500).json({
          error: 'Failed to get funding rate history',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  );

  /**
   * Get market statistics
   * GET /api/v1/market-data/stats
   */
  router.get('/stats', (_req: Request, res: Response): void => {
    Promise.resolve().then(async () => {
      try {
        const stats = await orderBook.getMarketStatistics();

        res.json({
          totalVolume24h: stats.totalVolume24h,
          totalTrades24h: stats.totalTrades24h,
          activePairs: stats.activePairs,
          topGainers: stats.topGainers,
          topLosers: stats.topLosers,
          totalValueLocked: stats.totalValueLocked,
          networkFees24h: stats.networkFees24h,
          validatorCount: stats.activeValidators,
          timestamp: stats.timestamp
        });

      } catch (error) {
        logger.error('Error getting market statistics:', error);
        res.status(500).json({
          error: 'Failed to get market statistics',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }).catch((error) => {
      logger.error('Error getting market statistics:', error);
      res.status(500).json({
        error: 'Failed to get market statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  });

  return router;
}
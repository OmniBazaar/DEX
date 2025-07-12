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
import { DecentralizedOrderBook } from '@core/dex/DecentralizedOrderBook';
import { logger } from '@utils/logger';

export function createMarketDataRoutes(orderBook: DecentralizedOrderBook): Router {
  const router = Router();

  /**
   * Get all available trading pairs
   * GET /api/v1/market-data/pairs
   */
  router.get('/pairs', async (req: Request, res: Response) => {
    try {
      const pairs = await orderBook.getTradingPairs();

      res.json({
        pairs: pairs.map(pair => ({
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
    async (req: Request, res: Response) => {
      try {
        const { pair } = req.params;
        const limit = (req.query.limit as number) || 100;

        const orderBook = await orderBook.getOrderBook(pair, limit);

        res.json({
          pair,
          bids: orderBook.bids.map(level => [level.price, level.quantity]),
          asks: orderBook.asks.map(level => [level.price, level.quantity]),
          timestamp: orderBook.timestamp,
          sequence: orderBook.sequence
        });

      } catch (error) {
        logger.error('Error getting order book:', error);
        res.status(500).json({
          error: 'Failed to get order book',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Get 24h ticker statistics
   * GET /api/v1/market-data/ticker/:pair
   */
  router.get('/ticker/:pair',
    [param('pair').isString().notEmpty()],
    async (req: Request, res: Response) => {
      try {
        const { pair } = req.params;

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
    }
  );

  /**
   * Get all tickers
   * GET /api/v1/market-data/tickers
   */
  router.get('/tickers', async (req: Request, res: Response) => {
    try {
      const tickers = await orderBook.getAllTickers();

      res.json(
        tickers.map(ticker => ({
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
    async (req: Request, res: Response) => {
      try {
        const { pair } = req.params;
        const limit = (req.query.limit as number) || 100;

        const trades = await orderBook.getRecentTrades(pair, limit);

        res.json(
          trades.map(trade => ({
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
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
          });
        }

        const { pair } = req.params;
        const interval = req.query.interval as string;
        const startTime = req.query.startTime as Date;
        const endTime = req.query.endTime as Date;
        const limit = (req.query.limit as number) || 500;

        const candles = await orderBook.getCandles(pair, interval, {
          startTime,
          endTime,
          limit
        });

        res.json(
          candles.map(candle => [
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
    async (req: Request, res: Response) => {
      try {
        const { pair } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;

        const depth = await orderBook.getMarketDepth(pair, limit);

        res.json({
          lastUpdateId: depth.lastUpdateId,
          bids: depth.bids.map(level => [level.price, level.quantity]),
          asks: depth.asks.map(level => [level.price, level.quantity])
        });

      } catch (error) {
        logger.error('Error getting market depth:', error);
        res.status(500).json({
          error: 'Failed to get market depth',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Get perpetual contract information
   * GET /api/v1/market-data/perpetuals
   */
  router.get('/perpetuals', async (req: Request, res: Response) => {
    try {
      const perpetuals = await orderBook.getPerpetualContracts();

      res.json(
        perpetuals.map(contract => ({
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
    async (req: Request, res: Response) => {
      try {
        const { symbol } = req.params;
        const startTime = req.query.startTime as Date;
        const endTime = req.query.endTime as Date;
        const limit = (req.query.limit as number) || 100;

        const fundingHistory = await orderBook.getFundingRateHistory(symbol, {
          startTime,
          endTime,
          limit
        });

        res.json(
          fundingHistory.map(entry => ({
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
    }
  );

  /**
   * Get market statistics
   * GET /api/v1/market-data/stats
   */
  router.get('/stats', async (req: Request, res: Response) => {
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
  });

  return router;
} 
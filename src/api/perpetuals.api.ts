/**
 * Perpetuals Trading API Endpoints
 * 
 * Provides REST API for perpetual futures trading operations
 * Handles positions, orders, funding rates, and liquidations
 * 
 * @module api/perpetuals
 */

import { Router, Request, Response } from 'express';
import { PerpetualIntegration } from '../core/perpetuals/PerpetualIntegration';
import { DecentralizedOrderBook } from '../core/dex/DecentralizedOrderBook';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { validateRequired, validateNumeric, validateEnum, validateLeverage } from '../middleware/validation';
import { logger } from '../utils/logger';
import { body, param, query } from 'express-validator';

/**
 * Perpetuals API request/response types
 */
export interface OpenPositionRequest {
  market: string;
  side: 'LONG' | 'SHORT';
  size: string;
  leverage: number;
  price?: string;
  reduceOnly?: boolean;
  postOnly?: boolean;
}

export interface ClosePositionRequest {
  size?: string;
  price?: string;
}

export interface UpdateLeverageRequest {
  leverage: number;
}

export interface PositionResponse {
  id: string;
  trader: string;
  market: string;
  side: string;
  size: string;
  entryPrice: string;
  markPrice: string;
  leverage: number;
  margin: string;
  liquidationPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
  fundingPayment: string;
  status: string;
  openedAt: number;
}

export interface MarketResponse {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  minSize: string;
  tickSize: string;
  maxLeverage: number;
  initialMargin: number;
  maintenanceMargin: number;
  fundingInterval: number;
  maxFundingRate: string;
  makerFee: string;
  takerFee: string;
  status: string;
  markPrice: string;
  indexPrice: string;
  openInterest: string;
}

export interface FundingRateResponse {
  market: string;
  rate: number;
  nextFundingAt: number;
  markPrice: number;
  indexPrice: number;
  openInterest: number;
  timestamp: number;
}

/**
 * Create perpetuals API router
 */
export function createPerpetualsRouter(
  integration: PerpetualIntegration,
  orderBook: DecentralizedOrderBook
): Router {
  const router = Router();

  /**
   * @api {get} /api/perpetuals/markets Get all perpetual markets
   * @apiName GetPerpetualMarkets
   * @apiGroup Perpetuals
   * @apiDescription Get list of all available perpetual futures markets
   * 
   * @apiSuccess {Object[]} markets List of perpetual markets
   * @apiSuccess {String} markets.symbol Market symbol (e.g., "BTC-USD")
   * @apiSuccess {Number} markets.maxLeverage Maximum allowed leverage
   * @apiSuccess {String} markets.markPrice Current mark price
   * @apiSuccess {String} markets.openInterest Total open interest
   */
  router.get('/markets', async (_req: Request, res: Response) => {
    try {
      const markets = integration.getMarkets();
      const response: MarketResponse[] = markets.map(market => ({
        symbol: market.symbol,
        baseCurrency: market.baseCurrency,
        quoteCurrency: market.quoteCurrency,
        minSize: market.minSize.toString(),
        tickSize: market.tickSize.toString(),
        maxLeverage: market.maxLeverage,
        initialMargin: market.initialMargin,
        maintenanceMargin: market.maintenanceMargin,
        fundingInterval: market.fundingInterval,
        maxFundingRate: market.maxFundingRate.toString(),
        makerFee: market.makerFee.toString(),
        takerFee: market.takerFee.toString(),
        status: market.status,
        markPrice: '0', // Will be updated from engine
        indexPrice: '0',
        openInterest: integration.getOpenInterest(market.symbol)
      }));

      return res.json({ success: true, data: response });
    } catch (error) {
      logger.error('Failed to get markets:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to retrieve markets' 
      });
    }
  });

  /**
   * @api {get} /api/perpetuals/markets/:symbol Get specific market
   * @apiName GetPerpetualMarket
   * @apiGroup Perpetuals
   * @apiParam {String} symbol Market symbol (e.g., "BTC-USD")
   */
  router.get('/markets/:symbol', 
    param('symbol').isString().notEmpty(),
    async (req: Request, res: Response) => {
      try {
        const market = integration.getMarket(req.params.symbol!);
        if (!market) {
          return res.status(404).json({ 
            success: false, 
            error: 'Market not found' 
          });
        }

        const response: MarketResponse = {
          symbol: market.symbol,
          baseCurrency: market.baseCurrency,
          quoteCurrency: market.quoteCurrency,
          minSize: market.minSize.toString(),
          tickSize: market.tickSize.toString(),
          maxLeverage: market.maxLeverage,
          initialMargin: market.initialMargin,
          maintenanceMargin: market.maintenanceMargin,
          fundingInterval: market.fundingInterval,
          maxFundingRate: market.maxFundingRate.toString(),
          makerFee: market.makerFee.toString(),
          takerFee: market.takerFee.toString(),
          status: market.status,
          markPrice: '0',
          indexPrice: '0',
          openInterest: integration.getOpenInterest(market.symbol)
        };

        return res.json({ success: true, data: response });
      } catch (error) {
        logger.error('Failed to get market:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to retrieve market' 
        });
      }
    }
  );

  /**
   * @api {post} /api/perpetuals/positions Open a new position
   * @apiName OpenPosition
   * @apiGroup Perpetuals
   * @apiDescription Open a new perpetual futures position
   * 
   * @apiParam {String} market Market symbol (e.g., "BTC-USD")
   * @apiParam {String} side Position side ("LONG" or "SHORT")
   * @apiParam {String} size Position size in base currency
   * @apiParam {Number} leverage Leverage (1-100)
   * @apiParam {String} [price] Limit price (optional, uses market price if not provided)
   */
  router.post('/positions',
    authMiddleware,
    body('market').isString().notEmpty(),
    body('side').isIn(['LONG', 'SHORT']),
    body('size').isNumeric(),
    body('leverage').isInt({ min: 1, max: 100 }),
    body('price').optional().isNumeric(),
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
        }

        const orderData = {
          userId,
          contract: req.body.market,
          type: (req.body.price ? 'LIMIT' : 'MARKET') as 'LIMIT' | 'MARKET',
          side: req.body.side,
          size: req.body.size,
          leverage: req.body.leverage,
          entryPrice: req.body.price,
          status: 'PENDING' as const
        };

        // Process through order book (which will call integration)
        const result = await orderBook.placePerpetualOrder(orderData);

        return res.json({ 
          success: result.success, 
          data: result.order,
          message: result.message 
        });
      } catch (error) {
        logger.error('Failed to open position:', error);
        return res.status(500).json({ 
          success: false, 
          error: (error as Error).message 
        });
      }
    }
  );

  /**
   * @api {post} /api/perpetuals/positions/:id/close Close a position
   * @apiName ClosePosition
   * @apiGroup Perpetuals
   * @apiParam {String} id Position ID
   * @apiParam {String} [size] Size to close (optional, closes full position if not provided)
   * @apiParam {String} [price] Limit price (optional)
   */
  router.post('/positions/:id/close',
    authMiddleware,
    param('id').isString().notEmpty(),
    body('size').optional().isNumeric(),
    body('price').optional().isNumeric(),
    async (req: Request, res: Response) => {
      try {
        const result = await integration.closePosition(
          req.params.id!,
          req.body.size,
          req.body.price
        );

        if (!result.success) {
          return res.status(400).json({ 
            success: false, 
            error: result.message 
          });
        }

        return res.json({ 
          success: true, 
          data: result.position,
          message: result.message 
        });
      } catch (error) {
        logger.error('Failed to close position:', error);
        return res.status(500).json({ 
          success: false, 
          error: (error as Error).message 
        });
      }
    }
  );

  /**
   * @api {put} /api/perpetuals/positions/:id/leverage Update position leverage
   * @apiName UpdateLeverage
   * @apiGroup Perpetuals
   * @apiParam {String} id Position ID
   * @apiParam {Number} leverage New leverage value
   */
  router.put('/positions/:id/leverage',
    authMiddleware,
    param('id').isString().notEmpty(),
    body('leverage').isInt({ min: 1, max: 100 }),
    async (req: Request, res: Response) => {
      try {
        const result = await integration.updateLeverage(
          req.params.id!,
          req.body.leverage
        );

        if (!result.success) {
          return res.status(400).json({ 
            success: false, 
            error: result.message 
          });
        }

        return res.json({ 
          success: true, 
          data: result.position,
          message: result.message 
        });
      } catch (error) {
        logger.error('Failed to update leverage:', error);
        return res.status(500).json({ 
          success: false, 
          error: (error as Error).message 
        });
      }
    }
  );

  /**
   * @api {get} /api/perpetuals/positions Get user positions
   * @apiName GetPositions
   * @apiGroup Perpetuals
   * @apiDescription Get all open positions for authenticated user
   */
  router.get('/positions',
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) {
          return res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
        }

        const positions = integration.getUserPositions(userId);
        const response = positions.map(pos => integration.convertToPosition(pos));

        return res.json({ 
          success: true, 
          data: response 
        });
      } catch (error) {
        logger.error('Failed to get positions:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to retrieve positions' 
        });
      }
    }
  );

  /**
   * @api {get} /api/perpetuals/funding-rates Get funding rates
   * @apiName GetFundingRates
   * @apiGroup Perpetuals
   * @apiQuery {String} [market] Filter by market symbol
   */
  router.get('/funding-rates',
    query('market').optional().isString(),
    async (req: Request, res: Response) => {
      try {
        const markets = req.query.market 
          ? [req.query.market as string]
          : integration.getMarkets().map(m => m.symbol);

        const rates: FundingRateResponse[] = [];
        for (const market of markets) {
          const rate = integration.getFundingRate(market);
          if (rate) {
            rates.push(rate);
          }
        }

        return res.json({ 
          success: true, 
          data: rates 
        });
      } catch (error) {
        logger.error('Failed to get funding rates:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to retrieve funding rates' 
        });
      }
    }
  );

  /**
   * @api {get} /api/perpetuals/insurance-fund Get insurance fund balance
   * @apiName GetInsuranceFund
   * @apiGroup Perpetuals
   */
  router.get('/insurance-fund', async (_req: Request, res: Response) => {
    try {
      const balance = integration.getInsuranceFund();
      return res.json({ 
        success: true, 
        data: { 
          balance,
          currency: 'USD',
          lastUpdated: Date.now()
        } 
      });
    } catch (error) {
      logger.error('Failed to get insurance fund:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to retrieve insurance fund' 
      });
    }
  });

  /**
   * @api {get} /api/perpetuals/open-interest Get open interest
   * @apiName GetOpenInterest
   * @apiGroup Perpetuals
   * @apiQuery {String} market Market symbol
   */
  router.get('/open-interest',
    query('market').isString().notEmpty(),
    async (req: Request, res: Response) => {
      try {
        const openInterest = integration.getOpenInterest(req.query.market as string);
        return res.json({ 
          success: true, 
          data: { 
            market: req.query.market,
            openInterest,
            timestamp: Date.now()
          } 
        });
      } catch (error) {
        logger.error('Failed to get open interest:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to retrieve open interest' 
        });
      }
    }
  );

  return router;
}

export default createPerpetualsRouter;
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
import { logger } from '../utils/logger';
import { body, param, query } from 'express-validator';
import { authMiddleware } from '../middleware/auth';

/**
 * Request interface for opening a new perpetual position
 */
export interface OpenPositionRequest {
  /** Trading market symbol */
  market: string;
  /** Position side - LONG or SHORT */
  side: 'LONG' | 'SHORT';
  /** Position size in base currency */
  size: string;
  /** Leverage multiplier */
  leverage: number;
  /** Optional limit price */
  price?: string;
  /** Whether this order is reduce-only */
  reduceOnly?: boolean;
  /** Whether this order is post-only */
  postOnly?: boolean;
}

/**
 * Request interface for closing a perpetual position
 */
export interface ClosePositionRequest {
  /** Optional size to close (defaults to full position) */
  size?: string;
  /** Optional limit price for closing */
  price?: string;
}

/**
 * Request interface for updating position leverage
 */
export interface UpdateLeverageRequest {
  /** New leverage multiplier */
  leverage: number;
}

/**
 * Response interface for position data
 */
export interface PositionResponse {
  /** Unique position identifier */
  id: string;
  /** Trader's address */
  trader: string;
  /** Trading market symbol */
  market: string;
  /** Position side (LONG/SHORT) */
  side: string;
  /** Position size in base currency */
  size: string;
  /** Average entry price */
  entryPrice: string;
  /** Current mark price */
  markPrice: string;
  /** Position leverage */
  leverage: number;
  /** Margin amount */
  margin: string;
  /** Liquidation price */
  liquidationPrice: string;
  /** Unrealized profit/loss */
  unrealizedPnl: string;
  /** Realized profit/loss */
  realizedPnl: string;
  /** Funding payment amount */
  fundingPayment: string;
  /** Position status */
  status: string;
  /** Timestamp when position was opened */
  openedAt: number;
}

/**
 * Response interface for market data
 */
export interface MarketResponse {
  /** Market symbol */
  symbol: string;
  /** Base currency */
  baseCurrency: string;
  /** Quote currency */
  quoteCurrency: string;
  /** Minimum order size */
  minSize: string;
  /** Price tick size */
  tickSize: string;
  /** Maximum allowed leverage */
  maxLeverage: number;
  /** Initial margin requirement */
  initialMargin: number;
  /** Maintenance margin requirement */
  maintenanceMargin: number;
  /** Funding rate interval in seconds */
  fundingInterval: number;
  /** Maximum funding rate */
  maxFundingRate: string;
  /** Maker fee rate */
  makerFee: string;
  /** Taker fee rate */
  takerFee: string;
  /** Market status */
  status: string;
  /** Current mark price */
  markPrice: string;
  /** Index price */
  indexPrice: string;
  /** Total open interest */
  openInterest: string;
}

/**
 * Response interface for funding rate data
 */
export interface FundingRateResponse {
  /** Market symbol */
  market: string;
  /** Current funding rate */
  rate: number;
  /** Next funding timestamp */
  nextFundingAt: number;
  /** Current mark price */
  markPrice: number;
  /** Index price */
  indexPrice: number;
  /** Open interest amount */
  openInterest: number;
  /** Response timestamp */
  timestamp: number;
}

/**
 * Authenticated request interface with user context
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

/**
 * Create perpetuals API router
 * @param integration - The perpetual integration instance
 * @param orderBook - The decentralized order book instance
 * @returns The configured Express router for perpetual trading endpoints
 */
export function createPerpetualsRouter(
  integration: PerpetualIntegration,
  orderBook: DecentralizedOrderBook
): Router {
  const router = Router();

  /**
   * Get all perpetual markets
   * Returns a list of all available perpetual futures markets with their configuration and current state.
   * @param _req - Express request object (unused)
   * @param res - Express response object
   * @returns void - Sends JSON response with market data
   */
  router.get('/markets', (_req: Request, res: Response): void => {
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

      res.json({ success: true, data: response });
    } catch (error) {
      logger.error('Failed to get markets:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to retrieve markets' 
      });
    }
  });

  /**
   * Get specific perpetual market by symbol
   * Retrieves configuration and current state for a specific perpetual futures market.
   * @param req - Express request object with symbol parameter
   * @param res - Express response object
   * @returns void - Sends JSON response with market data or error
   */
  router.get('/markets/:symbol', 
    param('symbol').isString().notEmpty(),
    (req: Request, res: Response): void => {
      try {
        const symbol = req.params.symbol;
        if (symbol === null || symbol === undefined || symbol === '') {
          res.status(400).json({ 
            success: false, 
            error: 'Market symbol is required' 
          });
          return;
        }
        
        const market = integration.getMarket(symbol);
        if (market === null || market === undefined) {
          res.status(404).json({ 
            success: false, 
            error: 'Market not found' 
          });
          return;
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

        res.json({ success: true, data: response });
      } catch (error) {
        logger.error('Failed to get market:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to retrieve market' 
        });
      }
    }
  );

  /**
   * Open a new perpetual position
   * Creates a new perpetual futures position for the authenticated user.
   * @param req - Express request object with position data in body
   * @param res - Express response object
   * @returns void - Sends JSON response with position result or error
   */
  router.post('/positions',
    authMiddleware,
    body('market').isString().notEmpty(),
    body('side').isIn(['LONG', 'SHORT']),
    body('size').isNumeric(),
    body('leverage').isInt({ min: 1, max: 100 }),
    body('price').optional().isNumeric(),
    (req: AuthenticatedRequest, res: Response): void => {
      void Promise.resolve().then(() => {
        try {
          const user = req.user;
          const userId = user?.id;
          if (userId === null || userId === undefined) {
            res.status(401).json({ 
              success: false, 
              error: 'User not authenticated' 
            });
            return;
          }

          // Safely extract and type request body fields
          const requestBody = req.body as Record<string, unknown>;
          const market = requestBody.market as string;
          const side = requestBody.side as string;
          const size = requestBody.size as string;
          const leverage = requestBody.leverage as number;
          const price = requestBody.price as string | undefined;
          
          const orderData = {
            userId,
            contract: market,
            type: (price !== null && price !== undefined ? 'LIMIT' : 'MARKET') as 'LIMIT' | 'MARKET',
            side: side as 'LONG' | 'SHORT',
            size,
            leverage,
            entryPrice: price,
            status: 'PENDING' as const
          };

          // Process through order book (which will call integration)
          const result = orderBook.placePerpetualOrder(orderData);

          res.json({ 
            success: result.success, 
            data: result.order,
            message: result.message 
          });
        } catch (error) {
          logger.error('Failed to open position:', error);
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }).catch((error) => {
        logger.error('Failed to open position:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to open position' 
        });
      });
    }
  );

  /**
   * Close a perpetual position
   * Closes an existing perpetual position partially or fully.
   * @param req - Express request object with position ID and close parameters
   * @param res - Express response object
   * @returns void - Sends JSON response with close result or error
   */
  router.post('/positions/:id/close',
    authMiddleware,
    param('id').isString().notEmpty(),
    body('size').optional().isNumeric(),
    body('price').optional().isNumeric(),
    (req: Request, res: Response): void => {
      void Promise.resolve().then(() => {
        try {
          const positionId = req.params.id;
          if (positionId === null || positionId === undefined || positionId === '') {
            res.status(400).json({ 
              success: false, 
              error: 'Position ID is required' 
            });
            return;
          }

          const requestBody = req.body as Record<string, unknown>;
          const size = requestBody.size as string | undefined;
          const price = requestBody.price as string | undefined;
          
          const result = integration.closePosition(
            positionId,
            size,
            price
          );

          if (result.success !== true) {
            res.status(400).json({ 
              success: false, 
              error: result.message 
            });
            return;
          }

          res.json({ 
            success: true, 
            data: result.position,
            message: result.message 
          });
        } catch (error) {
          logger.error('Failed to close position:', error);
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }).catch((error) => {
        logger.error('Failed to close position:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to close position' 
        });
      });
    }
  );

  /**
   * Update position leverage
   * Updates the leverage for an existing perpetual position.
   * @param req - Express request object with position ID and new leverage
   * @param res - Express response object
   * @returns void - Sends JSON response with update result or error
   */
  router.put('/positions/:id/leverage',
    authMiddleware,
    param('id').isString().notEmpty(),
    body('leverage').isInt({ min: 1, max: 100 }),
    (req: Request, res: Response): void => {
      void Promise.resolve().then(() => {
        try {
          const positionId = req.params.id;
          if (positionId === null || positionId === undefined || positionId === '') {
            res.status(400).json({ 
              success: false, 
              error: 'Position ID is required' 
            });
            return;
          }

          const requestBody = req.body as Record<string, unknown>;
          const leverage = requestBody.leverage as number;
          
          const result = integration.updateLeverage(
            positionId,
            leverage
          );

          if (result.success !== true) {
            res.status(400).json({ 
              success: false, 
              error: result.message 
            });
            return;
          }

          res.json({ 
            success: true, 
            data: result.position,
            message: result.message 
          });
        } catch (error) {
          logger.error('Failed to update leverage:', error);
          res.status(500).json({ 
            success: false, 
            error: (error as Error).message 
          });
        }
      }).catch((error) => {
        logger.error('Failed to update leverage:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to update leverage' 
        });
      });
    }
  );

  /**
   * Get user positions
   * Retrieves all open positions for the authenticated user.
   * @param req - Express request object with user authentication
   * @param res - Express response object
   * @returns void - Sends JSON response with positions array or error
   */
  router.get('/positions',
    authMiddleware,
    (req: AuthenticatedRequest, res: Response): void => {
      try {
        const user = req.user;
        const userId = user?.id;
        if (userId === null || userId === undefined) {
          res.status(401).json({ 
            success: false, 
            error: 'User not authenticated' 
          });
          return;
        }

        const positions = integration.getUserPositions(userId);
        const response = positions.map(pos => integration.convertToPosition(pos));

        res.json({ 
          success: true, 
          data: response 
        });
      } catch (error) {
        logger.error('Failed to get positions:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to retrieve positions' 
        });
      }
    }
  );

  /**
   * Get funding rates
   * Retrieves current funding rates for perpetual markets.
   * @param req - Express request object with optional market query parameter
   * @param res - Express response object
   * @returns void - Sends JSON response with funding rates array or error
   */
  router.get('/funding-rates',
    query('market').optional().isString(),
    (req: Request, res: Response): void => {
      try {
        const marketQuery = req.query.market;
        const markets = marketQuery !== null && marketQuery !== undefined
          ? [marketQuery as string]
          : integration.getMarkets().map(m => m.symbol);

        const rates: FundingRateResponse[] = [];
        for (const market of markets) {
          const rate = integration.getFundingRate(market);
          if (rate !== null && rate !== undefined) {
            rates.push(rate);
          }
        }

        res.json({ 
          success: true, 
          data: rates 
        });
      } catch (error) {
        logger.error('Failed to get funding rates:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to retrieve funding rates' 
        });
      }
    }
  );

  /**
   * Get insurance fund balance
   * Retrieves the current balance of the insurance fund.
   * @param _req - Express request object (unused)
   * @param res - Express response object
   * @returns void - Sends JSON response with insurance fund data or error
   */
  router.get('/insurance-fund', (_req: Request, res: Response): void => {
    try {
      const balance = integration.getInsuranceFund();
      res.json({ 
        success: true, 
        data: { 
          balance,
          currency: 'USD',
          lastUpdated: Date.now()
        } 
      });
    } catch (error) {
      logger.error('Failed to get insurance fund:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to retrieve insurance fund' 
      });
    }
  });

  /**
   * Get open interest
   * Retrieves the current open interest for a specific market.
   * @param req - Express request object with market query parameter
   * @param res - Express response object
   * @returns void - Sends JSON response with open interest data or error
   */
  router.get('/open-interest',
    query('market').isString().notEmpty(),
    (req: Request, res: Response): void => {
      try {
        const market = req.query.market as string;
        const openInterest = integration.getOpenInterest(market);
        res.json({ 
          success: true, 
          data: { 
            market,
            openInterest,
            timestamp: Date.now()
          } 
        });
      } catch (error) {
        logger.error('Failed to get open interest:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to retrieve open interest' 
        });
      }
    }
  );

  return router;
}

export default createPerpetualsRouter;